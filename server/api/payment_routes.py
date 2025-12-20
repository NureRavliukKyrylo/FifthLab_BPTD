from fastapi import APIRouter, Depends, HTTPException, Request
import uuid

from models.order import Order, OrderStatus
from models.user import User
from dependencies.auth import get_current_user
from repositories.order import OrderRepository
from repositories.product import ProductRepository
from services.liqpay import (
    build_checkout_payload,
    build_init_fields,
    decode_checkout_data,
    verify_checkout_signature,
    verify_signature,
)
from infrastructure.config import settings

router = APIRouter(prefix="/payments", tags=["payments"])


def _status_to_order_status(status: str) -> OrderStatus:
    s = (status or "").lower().strip()
    if s in {"success", "sandbox"}:
        return OrderStatus.SUCCESS
    if s in {"wait_secure", "processing"}:
        return OrderStatus.PENDING
    return OrderStatus.FAILURE


async def _apply_callback(
    *,
    order_id: str,
    status_raw: str,
    transaction_id: str,
    product_repo: ProductRepository,
    order_repo: OrderRepository,
) -> dict:
    if not order_id:
        raise HTTPException(status_code=400, detail="order_id_required")

    new_status = _status_to_order_status(status_raw)

    locked = await order_repo.try_lock_for_callback(order_id, transaction_id)
    if not locked:
        existing = await order_repo.get_by_order_id(order_id)
        if existing:
            return {"ok": True, "status": str(existing.status)}
        return {"ok": True}

    try:
        order = await order_repo.get_by_order_id(order_id)
        if not order:
            raise HTTPException(status_code=404, detail="order_not_found")

        if order.status == OrderStatus.SUCCESS:
            return {"ok": True, "status": str(order.status)}

        await order_repo.set_status(order_id, new_status, provider="liqpay", transaction_id=transaction_id)

        if new_status == OrderStatus.SUCCESS:
            for it in order.items:
                await product_repo.decrement_quantity_atomic(it.product_id, it.qty)

        return {"ok": True, "status": str(new_status)}
    finally:
        await order_repo.unlock(order_id)


@router.post("/liqpay/init")
async def init_liqpay_payment(
    req: dict,
    product_repo: ProductRepository = Depends(),
    order_repo: OrderRepository = Depends(),
    user: User = Depends(get_current_user),
):
    items_raw = req.get("items") or []
    if not isinstance(items_raw, list) or not items_raw:
        raise HTTPException(status_code=400, detail="items_required")

    items = []
    amount = 0.0

    for it in items_raw:
        product_id = str((it or {}).get("product_id") or "").strip()
        qty_raw = (it or {}).get("qty")
        if qty_raw is None:
            qty_raw = (it or {}).get("quantity")
        try:
            qty = int(qty_raw or 0)
        except Exception:
            qty = 0

        if not product_id:
            raise HTTPException(status_code=400, detail="product_id_required")
        if qty <= 0:
            raise HTTPException(status_code=400, detail="qty_must_be_positive")

        product = await product_repo.get_by_id(product_id)
        if not product:
            raise HTTPException(status_code=404, detail="product_not_found")

        if int(product.quantity) < qty:
            raise HTTPException(status_code=400, detail="insufficient_quantity")

        items.append(
            {
                "product_id": product_id,
                "qty": qty,
                "unit_price": float(product.price),
            }
        )
        amount += float(product.price) * qty

    currency = str(req.get("currency") or "UAH").upper().strip() or "UAH"
    description = str(req.get("description") or "Payment for order").strip() or "Payment for order"
    pay_type = str(req.get("pay_type") or req.get("type") or "card").strip() or "card"
    sender_phone = str(req.get("sender_phone") or "380000000000").strip() or "380000000000"

    order = Order(
        order_id=str(uuid.uuid4()),
        user_id=str(user.id or "test_user"),
        items=items,
        amount=float(amount),
        currency=currency,
        description=description,
        status=OrderStatus.CREATED,
        provider="liqpay",
    )
    order = await order_repo.create(order)

    liqpay_action_legacy = "https://www.liqpay.com/api/pay"
    liqpay_fields_legacy = build_init_fields(
        order_id=order.order_id,
        amount=float(amount),
        currency=currency,
        description=description,
        status=str(OrderStatus.CREATED),
        transaction_id="T0",
        sender_phone=sender_phone,
        pay_type=pay_type,
    )

    liqpay_checkout = build_checkout_payload(
        order_id=order.order_id,
        amount=float(amount),
        currency=currency,
        description=description,
    )

    return {
        "order_id": order.order_id,
        "liqpay": {
            "action": liqpay_checkout["action"],
            "data": liqpay_checkout["data"],
            "signature": liqpay_checkout["signature"],
        },
        "liqpay_action": liqpay_action_legacy,
        "liqpay_fields": liqpay_fields_legacy,
    }


@router.get("/orders/{order_id}")
async def get_order_status(
    order_id: str,
    order_repo: OrderRepository = Depends(),
    user: User = Depends(get_current_user),
):
    order = await order_repo.get_by_order_id(str(order_id).strip())
    if not order:
        raise HTTPException(status_code=404, detail="order_not_found")

    if user and order.user_id != str(user.id or ""):
        raise HTTPException(status_code=403, detail="forbidden")

    data = order.model_dump(by_alias=True)
    data["status"] = str(order.status)
    return data


@router.post("/liqpay/callback")
async def liqpay_callback(
    request: Request,
    product_repo: ProductRepository = Depends(),
    order_repo: OrderRepository = Depends(),
):
    form = await request.form()

    if "data" in form and "signature" in form:
        data = str(form.get("data") or "").strip()
        signature = str(form.get("signature") or "").strip()

        if not data or not signature:
            raise HTTPException(status_code=400, detail="data_signature_required")

        if not verify_checkout_signature(data=data, signature=signature):
            raise HTTPException(status_code=403, detail="invalid_signature")

        payload = decode_checkout_data(data)
        order_id = str(payload.get("order_id") or "").strip()
        status_raw = str(payload.get("status") or "").strip()
        transaction_id = str(payload.get("transaction_id") or payload.get("payment_id") or "").strip() or "T0"

        return await _apply_callback(
            order_id=order_id,
            status_raw=status_raw,
            transaction_id=transaction_id,
            product_repo=product_repo,
            order_repo=order_repo,
        )

    order_id = str(form.get("order_id") or "").strip()
    status_raw = str(form.get("status") or "").strip()
    transaction_id = str(form.get("transaction_id") or "").strip() or "T0"
    signature = str(form.get("signature") or "").strip()

    if not order_id or not signature:
        raise HTTPException(status_code=400, detail="order_id_signature_required")

    ok = verify_signature(
        amount=float(form.get("amount") or 0.0),
        currency=str(form.get("currency") or "UAH"),
        public_key=str(form.get("public_key") or ""),
        order_id=order_id,
        pay_type=str(form.get("type") or "card"),
        description=str(form.get("description") or ""),
        status=status_raw,
        transaction_id=transaction_id,
        sender_phone=str(form.get("sender_phone") or ""),
        signature=signature,
    )
    if not ok:
        raise HTTPException(status_code=403, detail="invalid_signature")

    return await _apply_callback(
        order_id=order_id,
        status_raw=status_raw,
        transaction_id=transaction_id,
        product_repo=product_repo,
        order_repo=order_repo,
    )


@router.post("/liqpay/simulate")
async def liqpay_simulate(
    req: dict,
    product_repo: ProductRepository = Depends(),
    order_repo: OrderRepository = Depends(),
):
    if not bool(settings.liqpay_sandbox):
        raise HTTPException(status_code=403, detail="sandbox_only")

    order_id = str(req.get("order_id") or "").strip()
    status_raw = str(req.get("status") or "").strip()
    transaction_id = str(req.get("transaction_id") or "SIM").strip() or "SIM"

    if not order_id or not status_raw:
        raise HTTPException(status_code=400, detail="order_id_status_required")

    return await _apply_callback(
        order_id=order_id,
        status_raw=status_raw,
        transaction_id=transaction_id,
        product_repo=product_repo,
        order_repo=order_repo,
    )
