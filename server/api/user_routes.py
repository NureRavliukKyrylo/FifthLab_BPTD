from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from models.user import User
from dependencies.auth import get_current_user

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/me")
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    try:
        user_data = {
            "id": current_user.id,
            "email": current_user.email,
            "name": current_user.name,
            "picture": current_user.picture,
            "email_verified": current_user.email_verified
        }
        return JSONResponse(content={"success": True, "data": user_data}, status_code=status.HTTP_200_OK)

    except HTTPException as e:
        return JSONResponse(
            content={"success": False, "error": e.detail},
            status_code=e.status_code
        )

    except Exception as e:
        return JSONResponse(
            content={"success": False, "error": str(e)},
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
        )