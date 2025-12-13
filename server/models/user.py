from pydantic import BaseModel, EmailStr, Field
from typing import Optional

class User(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")
    google_sub: str                   
    email: EmailStr
    email_verified: bool
    name: str
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    picture: Optional[str] = None

    class Config:
        populate_by_name = True
