from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from bson import ObjectId
from datetime import datetime

from infrastructure.db import get_db
from models.order import Order, OrderStatus


class OrderRepository:
    def __init__(self):
        self.db = get_db()
        self.collection = self.db["orders"]

    async def create(self, order: Order) -> Order:
        data = order.model_dump(by_alias=True, exclude={"id"})
        now = datetime.utcnow()
        data.setdefault("created_at", now)
        data["updated_at"] = now

        result = await self.collection.insert_one(data)
        order.id = str(result.inserted_id)
        order.created_at = data["created_at"]
        order.updated_at = data["updated_at"]
        return order

    async def get_by_order_id(self, order_id: str) -> Optional[Order]:
        doc = await self.collection.find_one({"order_id": order_id})
        if not doc:
            return None
        doc["_id"] = str(doc["_id"])
        return Order(**doc)

    async def list_by_user(self, user_id: str, limit: int = 50) -> List[Order]:
        orders: List[Order] = []
        cursor = self.collection.find({"user_id": user_id}).sort("created_at", -1).limit(limit)
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            orders.append(Order(**doc))
        return orders

    async def set_status(
        self,
        order_id: str,
        status: OrderStatus,
        *,
        provider: Optional[str] = None,
        transaction_id: Optional[str] = None,
    ) -> Optional[Order]:
        update: dict = {"status": status, "updated_at": datetime.utcnow()}
        if status in ("success", "failure"):
            update["processing"] = False
        if provider is not None:
            update["provider"] = provider
        if transaction_id is not None:
            update["transaction_id"] = transaction_id

        await self.collection.update_one({"order_id": order_id}, {"$set": update})
        return await self.get_by_order_id(order_id)
    

    async def try_lock_for_callback(self, order_id: str, transaction_id: str) -> bool:
        """
        Atomically acquire lock so only ONE callback handler processes an order.
        """
        result = await self.collection.update_one(
            {
                "order_id": order_id,
                "processing": False,
                "status": {"$ne": "success"},
            },
            {
                "$set": {
                    "processing": True,
                    "transaction_id": transaction_id,
                    "updated_at": datetime.utcnow(),
                }
            }
        )
        return result.modified_count == 1

    async def unlock(self, order_id: str) -> None:
        await self.collection.update_one(
            {"order_id": order_id},
            {"$set": {"processing": False, "updated_at": datetime.utcnow()}}
        )