from urllib.parse import urlencode
import httpx
from fastapi import HTTPException, status
from infrastructure.config import settings

def get_google_auth_url(state: str = None) -> str:
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar",
        "access_type": "offline",
        "prompt": "consent"
    }
    
    if state:
        params["state"] = state
    
    query_string = urlencode(params, safe=':/')
    return f"{settings.GOOGLE_AUTH_URL}?{query_string}"

async def exchange_code_for_token(code: str) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            settings.GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code"
            }
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange code for token"
            )
        
        return response.json()

async def get_google_user_info(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.get(
            settings.GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get user info"
            )
        
        return response.json()