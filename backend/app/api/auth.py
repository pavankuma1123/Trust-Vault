from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.api.deps import get_current_user, get_client_ip
from backend.app.models.user import User
from backend.app.schemas.user import UserCreate, UserLogin, UserResponse, TokenResponse
from backend.app.core.security import verify_password, get_password_hash, create_access_token
from backend.app.services.audit_service import audit_service

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=TokenResponse)
def register(user_in: UserCreate, request: Request, db: Session = Depends(get_db)):
    ip = get_client_ip(request)
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        audit_service.log_event(
            db=db,
            event_type="ACCESS_REFUSED",
            actor_ip=ip,
            details={"action": "REGISTRATION_DUPLICATE_EMAIL", "attempted_email": user_in.email}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists. Please sign in."
        )
    
    # Registration is strictly for Vault Owners and Viewers. Admins cannot be registered publicly!
    role = user_in.role.upper() if user_in.role else "OWNER"
    if role == "ADMIN":
        role = "OWNER"  # Enforce: Admin accounts cannot be self-registered
        
    name = user_in.name.strip() if user_in.name and user_in.name.strip() else user_in.email.split("@")[0].capitalize()

    user = User(
        name=name,
        email=user_in.email.strip().lower(),
        password_hash=get_password_hash(user_in.password),
        role=role,
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    audit_service.log_event(
        db=db,
        event_type="ACCESS_GRANTED",
        actor_ip=ip,
        actor_id=user.id,
        details={"action": "OWNER_REGISTERED", "role": user.role, "name": user.name}
    )

    access_token = create_access_token(subject=user.id)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.post("/login", response_model=TokenResponse)
def login(login_data: UserLogin, request: Request, db: Session = Depends(get_db)):
    ip = get_client_ip(request)
    clean_email = login_data.email.strip().lower()
    user = db.query(User).filter(User.email == clean_email).first()
    if not user or not verify_password(login_data.password, user.password_hash):
        audit_service.log_event(
            db=db,
            event_type="ACCESS_REFUSED",
            actor_ip=ip,
            actor_id=user.id if user else None,
            details={"action": "FAILED_LOGIN_ATTEMPT", "attempted_email": clean_email}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Authentication failed."
        )
    if not user.is_active:
        audit_service.log_event(
            db=db,
            event_type="ACCESS_REFUSED",
            actor_ip=ip,
            actor_id=user.id,
            details={"action": "DEACTIVATED_USER_LOGIN_ATTEMPT"}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated. Contact security compliance."
        )
        
    access_token = create_access_token(subject=user.id)
    
    # Audit successful login
    audit_service.log_event(
        db=db,
        event_type="ACCESS_GRANTED",
        actor_ip=ip,
        actor_id=user.id,
        details={"action": "USER_LOGIN_SUCCESS", "role": user.role}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
