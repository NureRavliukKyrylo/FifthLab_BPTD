from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, Field


OrderStatus = Literal["created", "pending", "success", "failure"]


class OrderItem(BaseModel):
    """A single purchasable line item."""
    product_id: str
    qty: int = Field(ge=1)
    unit_price: float = Field(ge=0)


class Order(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")

    order_id: str

    user_id: str

    items: List[OrderItem]
    amount: float = Field(ge=0)
    currency: str = Field(min_length=3, max_length=3)
    description: str

    status: OrderStatus = "created"
    processing: bool = False

    # Filled by payment callback later
    provider: Optional[str] = None
    transaction_id: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
