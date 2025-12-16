from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import List, Literal
from uuid import uuid4

from dependencies.auth import get_current_user
from models.user import User
from models.order import Order, OrderItem
from repositories.order import OrderRepository
from repositories.product import ProductRepository
from services.liqpay import build_init_fields, verify_callback_signature


router = APIRouter(prefix="/payments", tags=["Payments"])


class InitItem(BaseModel):
    product_id: str
    qty: int = Field(ge=1)


class InitPaymentRequest(BaseModel):
    items: List[InitItem]
    currency: str = "UAH"
    description: str = "Purchase"
    type: Literal["buy", "donate"] = "buy"


@router.post("/liqpay/init")
async def init_liqpay_payment(payload: InitPaymentRequest, user: User = Depends(get_current_user)):
    if not payload.items:
        raise HTTPException(status_code=400, detail="No items")

    product_repo = ProductRepository()
    order_repo = OrderRepository()

    items: List[OrderItem] = []
    total_amount = 0.0

    # Server-side price calc (do not trust client)
    for it in payload.items:
        product = await product_repo.get_by_id(it.product_id)
        if not product:
            raise HTTPException(status_code=404, detail=f"Product not found: {it.product_id}")

        if product.quantity < it.qty:
            raise HTTPException(status_code=409, detail=f"Not enough stock for: {product.title}")

        items.append(OrderItem(product_id=it.product_id, qty=it.qty, unit_price=product.price))
        total_amount += float(product.price) * int(it.qty)

    order_id = str(uuid4())

    order = Order(
        order_id=order_id,
        user_id=user.id,  # string id
        items=items,
        amount=round(total_amount, 2),
        currency=payload.currency.upper(),
        description=payload.description,
        status="created",
        provider="liqpay",
    )
    await order_repo.create(order)

    fields = build_init_fields(
        order_id=order.order_id,
        amount=order.amount,
        currency=order.currency,
        description=order.description,
        pay_type=payload.type,
        language="uk",
    )

    return {
        "order_id": order.order_id,
        "amount": order.amount,
        "currency": order.currency,
        "liqpay_action": "https://www.liqpay.com/api/pay",
        "liqpay_fields": fields,
    }


@router.post("/liqpay/callback")
async def liqpay_callback(request: Request):
    """
    Public endpoint: LiqPay posts form-urlencoded data here (server_url).
    Must verify signature and then apply business logic atomically.
    """
    form = await request.form()
    data = dict(form)

    if not verify_callback_signature(data):
        raise HTTPException(status_code=403, detail="Invalid signature")

    order_id = str(data.get("order_id") or "")
    status = str(data.get("status") or "")
    transaction_id = str(data.get("transaction_id") or "")

    order_repo = OrderRepository()
    product_repo = ProductRepository()

    order = await order_repo.get_by_order_id(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Fast idempotency check
    if order.status == "success":
        return {"ok": True, "ignored": True}

    # Lock to prevent concurrent callbacks from double-decrementing stock
    locked = await order_repo.try_lock_for_callback(order_id, transaction_id)
    if not locked:
        return {"ok": True, "ignored": True}

    try:
        # Normalize statuses used in PDF (success/failure/wait_secure)
        if status == "wait_secure":
            await order_repo.set_status(order_id, "pending", provider="liqpay", transaction_id=transaction_id)
            return {"ok": True, "status": "pending"}

        if status == "failure":
            await order_repo.set_status(order_id, "failure", provider="liqpay", transaction_id=transaction_id)
            return {"ok": True, "status": "failure"}

        if status != "success":
            # Unknown status -> treat as pending (safe)
            await order_repo.set_status(order_id, "pending", provider="liqpay", transaction_id=transaction_id)
            return {"ok": True, "status": "pending"}
    finally:
        fresh = await order_repo.get_by_order_id(order_id)
        if fresh and fresh.status not in ("success", "failure"):
            await order_repo.unlock(order_id)

    # status == success -> ATOMIC stock decrement per item + rollback on partial failure
    decremented = []
    for item in order.items:
        ok = await product_repo.decrement_quantity_atomic(item.product_id, item.qty)
        if not ok:
            # rollback what we already decremented
            for prev in decremented:
                await product_repo.increment_quantity_atomic(prev["product_id"], prev["qty"])

            await order_repo.set_status(order_id, "failure", provider="liqpay", transaction_id=transaction_id)
            raise HTTPException(status_code=409, detail="Out of stock during success callback")

        decremented.append({"product_id": item.product_id, "qty": item.qty})

    await order_repo.set_status(order_id, "success", provider="liqpay", transaction_id=transaction_id)
    return {"ok": True, "status": "success"}


@router.get("/orders/{order_id}")
async def get_order(order_id: str, user: User = Depends(get_current_user)):
    order_repo = OrderRepository()
    order = await order_repo.get_by_order_id(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return order
