from pydantic import BaseModel, ConfigDict, Field


class InitPaymentItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    product_id: str
    quantity: int = Field(alias="qty")


class InitPaymentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: list[InitPaymentItem]
    currency: str = "UAH"
    description: str | None = None
    sender_phone: str | None = None
    pay_type: str = Field(default="buy", alias="type")
