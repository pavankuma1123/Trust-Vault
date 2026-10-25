import secrets
import json
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.api.deps import get_current_user, get_client_ip
from backend.app.models.user import User
from backend.app.models.verification import VerificationCode
from backend.app.schemas.user import (
    UserCreate, UserLogin, UserResponse, TokenResponse, PasswordResetRequest,
    RequestVerificationCode, VerifyRegistrationRequest, VerifyPasswordResetRequest, VerificationResponse
)
from backend.app.core.security import verify_password, get_password_hash, create_access_token
from backend.app.services.audit_service import audit_service
from backend.app.services.email_service import email_service

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

@router.post("/forgot-password", response_model=TokenResponse)
@router.post("/reset-password", response_model=TokenResponse)
def reset_password(reset_data: PasswordResetRequest, request: Request, db: Session = Depends(get_db)):
    ip = get_client_ip(request)
    clean_email = reset_data.email.strip().lower()
    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        audit_service.log_event(
            db=db,
            event_type="ACCESS_REFUSED",
            actor_ip=ip,
            details={"action": "PASSWORD_RESET_NONEXISTENT_USER", "email": clean_email}
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this registered email address."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Deactivated accounts cannot reset passwords."
        )

    if len(reset_data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters in length."
        )

    # Update password hash
    user.password_hash = get_password_hash(reset_data.new_password)
    db.commit()
    db.refresh(user)

    audit_service.log_event(
        db=db,
        event_type="METADATA_UPDATE",
        actor_ip=ip,
        actor_id=user.id,
        details={"action": "PASSWORD_RESET_COMPLETED", "user_email": user.email}
    )

    access_token = create_access_token(subject=user.id)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.post("/register/request-code", response_model=VerificationResponse)
def request_registration_code(req: RequestVerificationCode, request: Request, db: Session = Depends(get_db)):
    ip = get_client_ip(request)
    clean_email = req.email.strip().lower()
    
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please enter a valid email address.")
        
    existing = db.query(User).filter(User.email == clean_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists. Please sign in."
        )

    if not req.password or len(req.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters in length."
        )

    code = f"{secrets.randbelow(900000) + 100000:06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    temp_payload = json.dumps({
        "name": req.name.strip() if req.name and req.name.strip() else clean_email.split("@")[0].capitalize(),
        "password_hash": get_password_hash(req.password)
    })
    
    # Invalidate previous unused registration codes for this email
    db.query(VerificationCode).filter(
        VerificationCode.email == clean_email,
        VerificationCode.purpose == "REGISTRATION",
        VerificationCode.is_used == False
    ).update({"is_used": True})
    
    v_code = VerificationCode(
        email=clean_email,
        code=code,
        purpose="REGISTRATION",
        temp_payload=temp_payload,
        expires_at=expires_at,
        is_used=False
    )
    db.add(v_code)
    db.commit()

    dispatch_res = email_service.send_verification_code(clean_email, code, purpose="REGISTRATION")
    
    audit_service.log_event(
        db=db,
        event_type="METADATA_UPDATE",
        actor_ip=ip,
        details={"action": "REGISTRATION_CODE_ISSUED", "email": clean_email, "provider": dispatch_res.get("provider")}
    )
    
    return {
        "message": dispatch_res.get("message", f"Verification code sent to {clean_email}."),
        "email": clean_email,
        "preview_code": dispatch_res.get("preview_code")
    }

@router.post("/register/verify", response_model=TokenResponse)
def verify_registration(req: VerifyRegistrationRequest, request: Request, db: Session = Depends(get_db)):
    ip = get_client_ip(request)
    clean_email = req.email.strip().lower()
    clean_code = req.code.strip()
    
    existing = db.query(User).filter(User.email == clean_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address has already been registered."
        )
        
    now = datetime.now(timezone.utc)
    codes = db.query(VerificationCode).filter(
        VerificationCode.email == clean_email,
        VerificationCode.purpose == "REGISTRATION",
        VerificationCode.is_used == False
    ).order_by(VerificationCode.created_at.desc()).all()
    
    valid_record = None
    for c in codes:
        exp = c.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp > now and secrets.compare_digest(c.code, clean_code):
            valid_record = c
            break
            
    if not valid_record:
        audit_service.log_event(
            db=db,
            event_type="ACCESS_REFUSED",
            actor_ip=ip,
            details={"action": "INVALID_REGISTRATION_VERIFICATION_CODE", "email": clean_email}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code. Please request a new code."
        )
        
    payload = json.loads(valid_record.temp_payload or "{}")
    name = payload.get("name", "Vault Owner")
    password_hash = payload.get("password_hash")
    
    user = User(
        name=name,
        email=clean_email,
        password_hash=password_hash,
        role="OWNER",
        is_active=True
    )
    db.add(user)
    valid_record.is_used = True
    db.commit()
    db.refresh(user)
    
    audit_service.log_event(
        db=db,
        event_type="ACCESS_GRANTED",
        actor_ip=ip,
        actor_id=user.id,
        details={"action": "USER_REGISTRATION_VERIFIED", "email": user.email, "role": user.role}
    )
    
    access_token = create_access_token(subject=user.id)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.post("/forgot-password/request-code", response_model=VerificationResponse)
def request_password_reset_code(req: RequestVerificationCode, request: Request, db: Session = Depends(get_db)):
    ip = get_client_ip(request)
    clean_email = req.email.strip().lower()
    
    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        audit_service.log_event(
            db=db,
            event_type="ACCESS_REFUSED",
            actor_ip=ip,
            details={"action": "PASSWORD_RESET_NONEXISTENT_USER", "email": clean_email}
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this registered email address."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Deactivated accounts cannot reset passwords."
        )

    code = f"{secrets.randbelow(900000) + 100000:06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    # Invalidate previous unused password reset codes for this email
    db.query(VerificationCode).filter(
        VerificationCode.email == clean_email,
        VerificationCode.purpose == "PASSWORD_RESET",
        VerificationCode.is_used == False
    ).update({"is_used": True})

    v_code = VerificationCode(
        email=clean_email,
        code=code,
        purpose="PASSWORD_RESET",
        expires_at=expires_at,
        is_used=False
    )
    db.add(v_code)
    db.commit()

    dispatch_res = email_service.send_verification_code(clean_email, code, purpose="PASSWORD_RESET")

    audit_service.log_event(
        db=db,
        event_type="METADATA_UPDATE",
        actor_ip=ip,
        actor_id=user.id,
        details={"action": "PASSWORD_RESET_CODE_ISSUED", "email": clean_email, "provider": dispatch_res.get("provider")}
    )

    return {
        "message": dispatch_res.get("message", f"Verification code sent to {clean_email}."),
        "email": clean_email,
        "preview_code": dispatch_res.get("preview_code")
    }

@router.post("/forgot-password/verify", response_model=TokenResponse)
def verify_password_reset(req: VerifyPasswordResetRequest, request: Request, db: Session = Depends(get_db)):
    ip = get_client_ip(request)
    clean_email = req.email.strip().lower()
    clean_code = req.code.strip()

    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this registered email address."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Deactivated accounts cannot reset passwords."
        )

    if len(req.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters in length."
        )

    now = datetime.now(timezone.utc)
    codes = db.query(VerificationCode).filter(
        VerificationCode.email == clean_email,
        VerificationCode.purpose == "PASSWORD_RESET",
        VerificationCode.is_used == False
    ).order_by(VerificationCode.created_at.desc()).all()

    valid_record = None
    for c in codes:
        exp = c.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp > now and secrets.compare_digest(c.code, clean_code):
            valid_record = c
            break

    if not valid_record:
        audit_service.log_event(
            db=db,
            event_type="ACCESS_REFUSED",
            actor_ip=ip,
            actor_id=user.id,
            details={"action": "INVALID_PASSWORD_RESET_VERIFICATION_CODE", "email": clean_email}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code. Please request a new code."
        )

    user.password_hash = get_password_hash(req.new_password)
    valid_record.is_used = True
    db.commit()
    db.refresh(user)

    audit_service.log_event(
        db=db,
        event_type="METADATA_UPDATE",
        actor_ip=ip,
        actor_id=user.id,
        details={"action": "PASSWORD_RESET_VERIFIED_COMPLETED", "user_email": user.email}
    )

    access_token = create_access_token(subject=user.id)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
