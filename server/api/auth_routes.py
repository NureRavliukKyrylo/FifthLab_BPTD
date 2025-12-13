from fastapi import APIRouter, HTTPException, Response, status, Query
from fastapi.responses import RedirectResponse
from infrastructure.db import get_db
from schemas.auth import RefreshTokenRequest
from services.google_oauth import (
    get_google_auth_url, 
    exchange_code_for_token, 
    get_google_user_info
)
from utils.jwt import create_access_token, create_refresh_token, decode_token

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.get("/google")
async def google_login():
    auth_url = get_google_auth_url()
    return RedirectResponse(url=auth_url)

@router.get("/google/callback")
async def google_callback(code: str, response: Response):
    try:
        token_data = await exchange_code_for_token(code)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to exchange code for token"
        )

    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to get access token from Google"
        )

    try:
        user_info = await get_google_user_info(access_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch user info from Google"
        )

    db = get_db()
    google_sub = user_info.get("sub")
    existing_user = await db.users.find_one({"google_sub": google_sub})

    if existing_user:
        await db.users.update_one(
            {"google_sub": google_sub},
            {"$set": {
                "email": user_info.get("email"),
                "email_verified": user_info.get("email_verified", False),
                "name": user_info.get("name"),
                "given_name": user_info.get("given_name"),
                "family_name": user_info.get("family_name"),
                "picture": user_info.get("picture")
            }}
        )
        user_id = str(existing_user["_id"])
        message = "Logged in successfully"
        status_code = status.HTTP_200_OK
    else:
        user_data = {
            "google_sub": google_sub,
            "email": user_info.get("email"),
            "email_verified": user_info.get("email_verified", False),
            "name": user_info.get("name"),
            "given_name": user_info.get("given_name"),
            "family_name": user_info.get("family_name"),
            "picture": user_info.get("picture")
        }
        result = await db.users.insert_one(user_data)
        user_id = str(result.inserted_id)
        message = "Account created successfully"
        status_code = status.HTTP_201_CREATED

    token_payload = {
        "sub": user_id,
        "email": user_info.get("email"),
        "name": user_info.get("name")
    }

    access_jwt = create_access_token(token_payload)
    refresh_jwt = create_refresh_token({"sub": user_id})

    response.set_cookie(
        key="access_token",
        value=access_jwt,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 15, 
    )

    response.set_cookie(
        key="refresh_token",
        value=refresh_jwt,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * 24 * 7, 
    )

    return {
        "status": "ok",
        "message": message,
        "code": status_code
    }

@router.post("/refresh")
async def refresh_token(request: RefreshTokenRequest, response: Response):
    
    payload = decode_token(request.refresh_token)
    
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type"
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    
    db = get_db()
    user_data = await db.users.find_one({"_id": user_id})
    
    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    token_payload = {
        "sub": user_id,
        "email": user_data.get("email"),
        "name": user_data.get("name")
    }
    
    new_access_token = create_access_token(token_payload)
    new_refresh_token = create_refresh_token({"sub": user_id})
    
    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 15, 
    )
    
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        samesite="lax",
        secure=False, 
        max_age=60 * 60 * 24 * 7, 
    )
    
    return {
        "message": "Tokens refreshed successfully",
        "status_code": 200,
        "access_token": new_access_token,
        "refresh_token": new_refresh_token
    }

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")

    return {
        "message": "Logged out successfully",
        "status_code": status.HTTP_200_OK
    }