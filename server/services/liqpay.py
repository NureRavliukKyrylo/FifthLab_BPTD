import base64
import hashlib
import hmac
import json
from typing import Any

from infrastructure.config import settings

LIQPAY_CHECKOUT_ACTION = "https://www.liqpay.ua/api/3/checkout"


def _sha1_b64(s: str) -> str:
    digest = hashlib.sha1(s.encode("utf-8")).digest()
    return base64.b64encode(digest).decode("ascii")


def build_init_fields(
    *,
    order_id: str,
    amount: float,
    currency: str,
    description: str,
    status: str,
    transaction_id: str,
    sender_phone: str,
    pay_type: str,
) -> dict[str, Any]:
    fields: dict[str, Any] = {
        "public_key": settings.liqpay_public_key,
        "amount": float(amount),
        "currency": currency.upper(),
        "description": description,
        "type": pay_type,
        "order_id": order_id,
        "status": status,
        "transaction_id": transaction_id,
        "sender_phone": sender_phone,
        "server_url": settings.liqpay_server_url,
        "result_url": settings.liqpay_result_url,
        "sandbox": 1 if settings.liqpay_sandbox else 0,
    }

    signature_base = (
        f"{settings.liqpay_private_key}"
        f"{fields['amount']}"
        f"{fields['currency']}"
        f"{fields['public_key']}"
        f"{fields['order_id']}"
        f"{fields['type']}"
        f"{fields['description']}"
        f"{fields['status']}"
        f"{fields['transaction_id']}"
        f"{fields['sender_phone']}"
    )
    fields["signature"] = _sha1_b64(signature_base)
    return fields


def verify_signature(
    *,
    amount: float,
    currency: str,
    public_key: str,
    order_id: str,
    pay_type: str,
    description: str,
    status: str,
    transaction_id: str,
    sender_phone: str,
    signature: str,
) -> bool:
    signature_base = (
        f"{settings.liqpay_private_key}"
        f"{float(amount)}"
        f"{currency.upper()}"
        f"{public_key}"
        f"{order_id}"
        f"{pay_type}"
        f"{description}"
        f"{status}"
        f"{transaction_id}"
        f"{sender_phone}"
    )
    expected = _sha1_b64(signature_base)
    return hmac.compare_digest(expected, signature)


def build_checkout_payload(
    *,
    order_id: str,
    amount: float,
    currency: str,
    description: str,
) -> dict[str, str]:
    payload: dict[str, Any] = {
        "public_key": settings.liqpay_public_key,
        "version": "3",
        "action": "pay",
        "amount": f"{float(amount):.2f}",
        "currency": currency.upper(),
        "description": description,
        "order_id": order_id,
        "result_url": settings.liqpay_result_url,
        "server_url": settings.liqpay_server_url,
    }

    if settings.liqpay_sandbox:
        payload["sandbox"] = 1

    data = base64.b64encode(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")

    signature = _sha1_b64(f"{settings.liqpay_private_key}{data}{settings.liqpay_private_key}")

    return {"action": LIQPAY_CHECKOUT_ACTION, "data": data, "signature": signature}


def verify_checkout_signature(*, data: str, signature: str) -> bool:
    expected = _sha1_b64(f"{settings.liqpay_private_key}{data}{settings.liqpay_private_key}")
    return hmac.compare_digest(expected, signature)


def decode_checkout_data(data: str) -> dict[str, Any]:
    raw = base64.b64decode(data.encode("ascii"))
    return json.loads(raw.decode("utf-8"))
