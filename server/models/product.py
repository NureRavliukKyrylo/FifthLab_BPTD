from pydantic import BaseModel, Field
from typing import Optional

class Product(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")
    title: str
    description: str
    image_url: str
    price: float
    
    quantity: int = Field(default=0, ge=0)

    class Config:
        populate_by_name = True
