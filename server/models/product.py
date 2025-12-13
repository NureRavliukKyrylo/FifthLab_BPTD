from pydantic import BaseModel, Field
from typing import Optional

class Product(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")
    title: str
    description: str
    image_url: str
    price: float

    class Config:
        populate_by_name = True
