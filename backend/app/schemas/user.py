from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class UserBase(BaseModel):
    name: str = "Vault User"
    email: str
    role: str = "OWNER"

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class PasswordResetRequest(BaseModel):
    email: str
    new_password: str

class RequestVerificationCode(BaseModel):
    email: str
    purpose: str = "PASSWORD_RESET"  # REGISTRATION or PASSWORD_RESET
    name: Optional[str] = None
    password: Optional[str] = None

class VerifyRegistrationRequest(BaseModel):
    email: str
    code: str

class VerifyPasswordResetRequest(BaseModel):
    email: str
    code: str
    new_password: str

class VerificationResponse(BaseModel):
    message: str
    email: str
    preview_code: Optional[str] = None

class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: str
    is_active: bool
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
