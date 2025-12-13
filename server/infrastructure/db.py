from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings

client: AsyncIOMotorClient | None = None

async def connect_db():
    global client
    client = AsyncIOMotorClient(settings.MONGODB_URL)

async def close_db():
    client.close()

def get_db():
    return client[settings.MONGODB_NAME]
