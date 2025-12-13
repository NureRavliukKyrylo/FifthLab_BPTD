from fastapi import APIRouter, HTTPException
from typing import List
from models.product import Product
from repositories.product import ProductRepository

router = APIRouter(prefix="/products", tags=["Products"])

@router.post("/", response_model=Product)
async def create_product(product: Product):
    repo = ProductRepository()
    return await repo.create(product)

@router.get("/", response_model=List[Product])
async def list_products():
    repo = ProductRepository()
    return await repo.get_all()

@router.get("/{product_id}", response_model=Product)
async def get_product(product_id: str):
    repo = ProductRepository()
    product = await repo.get_by_id(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@router.put("/{product_id}", response_model=Product)
async def update_product(product_id: str, product: Product):
    repo = ProductRepository()
    updated = await repo.update(product_id, product)
    if not updated:
        raise HTTPException(status_code=404, detail="Product not found")
    return updated

@router.delete("/{product_id}")
async def delete_product(product_id: str):
    repo = ProductRepository()
    deleted = await repo.delete(product_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"deleted": True}
