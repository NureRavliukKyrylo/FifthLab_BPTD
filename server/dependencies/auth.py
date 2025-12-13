from fastapi import HTTPException, Request
from bson import ObjectId
from utils.jwt import decode_token
from infrastructure.db import get_db
from models.user import User

async def get_current_user(request: Request) -> User:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="No access token")

    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    db = get_db()
    user_data = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")

    user_data["_id"] = str(user_data["_id"])
    return User(**user_data)
