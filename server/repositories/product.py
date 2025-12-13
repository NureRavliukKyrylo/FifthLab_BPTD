from infrastructure.db import get_db
from models.product import Product
from typing import List
from bson import ObjectId

class ProductRepository:
    def __init__(self):
        self.db = get_db()
        self.collection = self.db["products"]

    async def create(self, product: Product) -> Product:
        data = product.model_dump(by_alias=True, exclude={"id"})
        result = await self.collection.insert_one(data)
        product.id = str(result.inserted_id)
        return product

    async def get_all(self) -> List[Product]:
        cursor = self.collection.find()
        products = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            products.append(Product(**doc))
        return products

    async def get_by_id(self, product_id: str) -> Product | None:
        doc = await self.collection.find_one({"_id": ObjectId(product_id)})
        if doc:
            doc["id"] = str(doc["_id"])
            return Product(**doc)
        return None

    async def update(self, product_id: str, product: Product) -> Product | None:
        data = product.model_dump(by_alias=True, exclude={"id"})
        result = await self.collection.update_one(
            {"_id": ObjectId(product_id)},
            {"$set": data}
        )
        if result.modified_count:
            return await self.get_by_id(product_id)
        return None

    async def delete(self, product_id: str) -> bool:
        result = await self.collection.delete_one({"_id": ObjectId(product_id)})
        return result.deleted_count > 0
