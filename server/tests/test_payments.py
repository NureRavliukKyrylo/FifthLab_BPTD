import base64
import hashlib
import pytest
import asyncio


def _sha1_b64(s: str) -> str:
    return base64.b64encode(hashlib.sha1(s.encode("utf-8")).digest()).decode("utf-8")


async def _create_product(client, quantity: int, price: float = 1000.0):
    r = await client.post(
        "/products/",
        json={
            "title": "ZAZ 968",
            "description": "Test car",
            "image_url": "http://localhost/image1.png",
            "price": price,
            "quantity": quantity,
        },
    )
    assert r.status_code == 200
    return r.json()


async def _init_payment(client, product_id: str, qty: int = 1):
    r = await client.post(
        "/payments/liqpay/init",
        json={
            "items": [{"product_id": product_id, "qty": qty}],
            "currency": "UAH",
            "description": "Buying ZAZ 968",
            "type": "buy",
        },
    )
    assert r.status_code == 200
    return r.json()


async def _callback(client, *, liq_fields: dict, order_id: str, status: str, tx: str, phone: str = "380000000000"):
    # Must match services.liqpay.verify_callback_signature formula exactly
    private_key = "sandbox_private"
    amount = str(liq_fields["amount"])
    currency = str(liq_fields["currency"])
    public_key = str(liq_fields["public_key"])
    pay_type = str(liq_fields["type"])
    description = str(liq_fields["description"])

    sig = _sha1_b64(
        f"{private_key}{amount}{currency}{public_key}{order_id}{pay_type}{description}{status}{tx}{phone}"
    )

    form = {
        "public_key": public_key,
        "amount": amount,
        "currency": currency,
        "description": description,
        "type": pay_type,
        "order_id": order_id,
        "status": status,
        "transaction_id": tx,
        "sender_phone": phone,
        "signature": sig,
    }

    return await client.post("/payments/liqpay/callback", data=form)


@pytest.mark.asyncio
async def test_init_returns_liqpay_fields_and_creates_order(client):
    prod = await _create_product(client, quantity=3, price=1000.0)
    init = await _init_payment(client, prod["_id"] if "_id" in prod else prod["id"], qty=1)

    assert "order_id" in init
    assert init["liqpay_action"] == "https://www.liqpay.com/api/pay"
    fields = init["liqpay_fields"]

    # required fields exist
    for k in ["public_key", "amount", "currency", "description", "order_id", "type", "result_url", "server_url", "signature"]:
        assert k in fields

    # sandbox flag should exist in tests
    assert fields.get("sandbox") == 1


@pytest.mark.asyncio
async def test_callback_invalid_signature_rejected(client):
    prod = await _create_product(client, quantity=3)
    init = await _init_payment(client, prod["_id"] if "_id" in prod else prod["id"], qty=1)

    order_id = init["order_id"]
    fields = init["liqpay_fields"]

    bad = await client.post(
        "/payments/liqpay/callback",
        data={
            "public_key": fields["public_key"],
            "amount": str(fields["amount"]),
            "currency": fields["currency"],
            "description": fields["description"],
            "type": fields["type"],
            "order_id": order_id,
            "status": "success",
            "transaction_id": "T1",
            "sender_phone": "380000000000",
            "signature": "BAD_SIGNATURE",
        },
    )
    assert bad.status_code == 403


@pytest.mark.asyncio
async def test_success_callback_decrements_quantity_and_sets_success(client):
    prod = await _create_product(client, quantity=3)
    product_id = prod["_id"] if "_id" in prod else prod["id"]

    init = await _init_payment(client, product_id, qty=1)
    order_id = init["order_id"]
    fields = init["liqpay_fields"]

    cb = await _callback(client, liq_fields=fields, order_id=order_id, status="success", tx="TSUCCESS1")
    assert cb.status_code == 200
    assert cb.json()["status"] == "success"

    # product quantity should become 2
    p = await client.get(f"/products/{product_id}")
    assert p.status_code == 200
    assert p.json()["quantity"] == 2

    # order endpoint should show success
    o = await client.get(f"/payments/orders/{order_id}")
    assert o.status_code == 200
    assert o.json()["status"] == "success"


@pytest.mark.asyncio
async def test_failure_callback_does_not_decrement_quantity(client):
    prod = await _create_product(client, quantity=3)
    product_id = prod["_id"] if "_id" in prod else prod["id"]

    init = await _init_payment(client, product_id, qty=1)
    order_id = init["order_id"]
    fields = init["liqpay_fields"]

    cb = await _callback(client, liq_fields=fields, order_id=order_id, status="failure", tx="TFAIL1")
    assert cb.status_code == 200
    assert cb.json()["status"] == "failure"

    p = await client.get(f"/products/{product_id}")
    assert p.status_code == 200
    assert p.json()["quantity"] == 3

    o = await client.get(f"/payments/orders/{order_id}")
    assert o.status_code == 200
    assert o.json()["status"] == "failure"


@pytest.mark.asyncio
async def test_wait_secure_sets_pending_no_decrement(client):
    prod = await _create_product(client, quantity=3)
    product_id = prod["_id"] if "_id" in prod else prod["id"]

    init = await _init_payment(client, product_id, qty=1)
    order_id = init["order_id"]
    fields = init["liqpay_fields"]

    cb = await _callback(client, liq_fields=fields, order_id=order_id, status="wait_secure", tx="TWAIT1")
    assert cb.status_code == 200
    assert cb.json()["status"] == "pending"

    p = await client.get(f"/products/{product_id}")
    assert p.status_code == 200
    assert p.json()["quantity"] == 3

    o = await client.get(f"/payments/orders/{order_id}")
    assert o.status_code == 200
    assert o.json()["status"] == "pending"


@pytest.mark.asyncio
async def test_double_success_callback_is_idempotent_sequential(client):
    prod = await _create_product(client, quantity=3)
    product_id = prod["_id"] if "_id" in prod else prod["id"]

    init = await _init_payment(client, product_id, qty=1)
    order_id = init["order_id"]
    fields = init["liqpay_fields"]

    cb1 = await _callback(client, liq_fields=fields, order_id=order_id, status="success", tx="TS1")
    assert cb1.status_code == 200

    cb2 = await _callback(client, liq_fields=fields, order_id=order_id, status="success", tx="TS2")
    assert cb2.status_code == 200
    # either ignored or still "success" is OK, but stock MUST not decrease again

    p = await client.get(f"/products/{product_id}")
    assert p.status_code == 200
    assert p.json()["quantity"] == 2


@pytest.mark.asyncio
async def test_concurrent_success_callbacks_do_not_double_decrement(client):
    """
    This is the 'відмінно' test. It may fail unless you add an order lock:
    - processing flag + try_lock_for_callback in OrderRepository
    - used inside /liqpay/callback
    """
    prod = await _create_product(client, quantity=3)
    product_id = prod["_id"] if "_id" in prod else prod["id"]

    init = await _init_payment(client, product_id, qty=1)
    order_id = init["order_id"]
    fields = init["liqpay_fields"]

    # Run two callbacks concurrently
    r1, r2 = await asyncio.gather(
    _callback(client, liq_fields=fields, order_id=order_id, status="success", tx="TC1"),
    _callback(client, liq_fields=fields, order_id=order_id, status="success", tx="TC2"),
    )


    assert r1.status_code == 200
    assert r2.status_code == 200

    p = await client.get(f"/products/{product_id}")
    assert p.status_code == 200

    # MUST be 2 (only one decrement)
    assert p.json()["quantity"] == 2
