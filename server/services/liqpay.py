import base64
import hashlib
from typing import Dict, Any, Optional

from infrastructure.config import settings


def _sha1_b64(value: str) -> str:
    digest = hashlib.sha1(value.encode("utf-8")).digest()
    return base64.b64encode(digest).decode("utf-8")


def build_init_fields(
    *,
    order_id: str,
    amount: float,
    currency: str,
    description: str,
    pay_type: str = "buy",
    language: str = "uk",
) -> Dict[str, Any]:
    """
    Builds LiqPay form fields following the lab PDF formula (concatenation-based signature).
    """
    public_key = settings.LIQPAY_PUBLIC_KEY
    private_key = settings.LIQPAY_PRIVATE_KEY

    result_url = settings.LIQPAY_RESULT_URL
    server_url = settings.LIQPAY_SERVER_URL

    # Signature formula from methodical:
    # base64( sha1(private_key + amount + currency + public_key + order_id + type + description + result_url + server_url) )
    signature_str = (
        f"{private_key}"
        f"{amount}"
        f"{currency}"
        f"{public_key}"
        f"{order_id}"
        f"{pay_type}"
        f"{description}"
        f"{result_url}"
        f"{server_url}"
    )
    signature = _sha1_b64(signature_str)

    fields: Dict[str, Any] = {
        "public_key": public_key,
        "amount": amount,
        "currency": currency,
        "description": description,
        "order_id": order_id,
        "type": pay_type,
        "language": language,
        "result_url": result_url,
        "server_url": server_url,
        "signature": signature,
    }

    # Sandbox/test mode
    if int(settings.LIQPAY_SANDBOX or 0) == 1:
        fields["sandbox"] = 1

    return fields


def verify_callback_signature(form: Dict[str, Any]) -> bool:
    """
    Verifies callback signature using methodical formula:
    base64( sha1(private_key + amount + currency + public_key + order_id + type + description + status + transaction_id + sender_phone) )
    """
    public_key = form.get("public_key") or ""
    if public_key != settings.LIQPAY_PUBLIC_KEY:
        return False

    private_key = settings.LIQPAY_PRIVATE_KEY

    amount = str(form.get("amount") or "")
    currency = str(form.get("currency") or "")
    order_id = str(form.get("order_id") or "")
    pay_type = str(form.get("type") or "")
    description = str(form.get("description") or "")
    status = str(form.get("status") or "")
    transaction_id = str(form.get("transaction_id") or "")
    sender_phone = str(form.get("sender_phone") or "")

    expected = _sha1_b64(
        f"{private_key}{amount}{currency}{public_key}{order_id}{pay_type}{description}{status}{transaction_id}{sender_phone}"
    )
    received = str(form.get("signature") or "")
    return received == expected
