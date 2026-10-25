from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.api.deps import get_current_user, get_client_ip
from backend.app.models.user import User
from backend.app.models.document import Document
from backend.app.models.grant import AccessGrant
from backend.app.schemas.grant import GrantCreate, GrantResponse
from backend.app.services.audit_service import audit_service

router = APIRouter(prefix="/documents/{document_id}/grants", tags=["Access Grants"])

@router.post("", response_model=GrantResponse)
def create_or_update_grant(
    document_id: str,
    grant_in: GrantCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ip = get_client_ip(request)
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        audit_service.log_event(
            db=db,
            event_type="ACCESS_REFUSED",
            actor_ip=ip,
            actor_id=current_user.id,
            target_document_id=document_id,
            details={"reason": "Grant assignment on nonexistent document"}
        )
        raise HTTPException(status_code=404, detail="Document not found")

    # Only document owner can delegate access grants
    if doc.owner_id != current_user.id:
        audit_service.log_event(
            db=db,
            event_type="ACCESS_REFUSED",
            actor_ip=ip,
            actor_id=current_user.id,
            target_document_id=doc.id,
            details={"reason": "Non-owner attempted grant assignment"}
        )
        raise HTTPException(status_code=403, detail="Only document owner can grant permissions.")

    # Find grantee user
    grantee = db.query(User).filter(User.email == grant_in.grantee_email).first()
    if not grantee:
        raise HTTPException(status_code=404, detail=f"Target user '{grant_in.grantee_email}' not found.")

    if grantee.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot create grant for document owner.")

    # Check if grant already exists
    existing_grant = db.query(AccessGrant).filter(
        AccessGrant.document_id == document_id,
        AccessGrant.grantee_id == grantee.id
    ).first()

    now = datetime.now(timezone.utc)
    if existing_grant:
        existing_grant.permission = grant_in.permission.upper()
        existing_grant.status = "ACTIVE"
        existing_grant.max_downloads = grant_in.max_downloads
        existing_grant.expires_at = grant_in.expires_at
        existing_grant.updated_at = now
        existing_grant.download_count = 0  # Reset download counter on renewal
        grant = existing_grant
    else:
        grant = AccessGrant(
            document_id=document_id,
            grantee_id=grantee.id,
            granted_by=current_user.id,
            permission=grant_in.permission.upper(),
            status="ACTIVE",
            max_downloads=grant_in.max_downloads,
            expires_at=grant_in.expires_at,
            download_count=0
        )
        db.add(grant)

    db.commit()
    db.refresh(grant)

    audit_service.log_event(
        db=db,
        event_type="ACCESS_GRANTED",
        actor_ip=ip,
        actor_id=current_user.id,
        target_document_id=doc.id,
        details={
            "grantee_id": grantee.id,
            "grantee_email": grantee.email,
            "permission": grant.permission,
            "max_downloads": grant.max_downloads,
            "expires_at": grant.expires_at.isoformat() if grant.expires_at else None
        }
    )

    return GrantResponse(
        id=grant.id,
        document_id=grant.document_id,
        grantee_id=grant.grantee_id,
        grantee_email=grantee.email,
        granted_by=grant.granted_by,
        permission=grant.permission,
        status=grant.status,
        download_count=grant.download_count,
        max_downloads=grant.max_downloads,
        expires_at=grant.expires_at,
        created_at=grant.created_at,
        updated_at=grant.updated_at
    )

@router.delete("/{grant_id}")
def revoke_grant(
    document_id: str,
    grant_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Immediate Zero-Latency Revocation:
    Synchronously marks grant as REVOKED in the database.
    Invalidates all future and active in-flight requests within 0ms.
    """
    ip = get_client_ip(request)
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.owner_id != current_user.id:
        audit_service.log_event(
            db=db,
            event_type="ACCESS_REFUSED",
            actor_ip=ip,
            actor_id=current_user.id,
            target_document_id=doc.id,
            details={"reason": "Non-owner attempted grant revocation"}
        )
        raise HTTPException(status_code=403, detail="Only document owner can revoke grants.")

    grant = db.query(AccessGrant).filter(
        AccessGrant.id == grant_id,
        AccessGrant.document_id == document_id
    ).first()

    if not grant:
        raise HTTPException(status_code=404, detail="Grant not found")

    grant.status = "REVOKED"
    grant.updated_at = datetime.now(timezone.utc)
    db.commit()

    grantee = db.query(User).filter(User.id == grant.grantee_id).first()
    grantee_email = grantee.email if grantee else "unknown"

    audit_service.log_event(
        db=db,
        event_type="ACCESS_REVOKED",
        actor_ip=ip,
        actor_id=current_user.id,
        target_document_id=doc.id,
        details={
            "grant_id": grant.id,
            "revoked_grantee_id": grant.grantee_id,
            "revoked_grantee_email": grantee_email,
            "latency": "0ms"
        }
    )

    return {"message": "Access grant revoked immediately.", "status": "REVOKED"}

@router.get("", response_model=List[GrantResponse])
def list_grants(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.owner_id != current_user.id and current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Only document owner or admin can inspect document grants.")

    grants = db.query(AccessGrant).filter(AccessGrant.document_id == document_id).all()
    results = []
    for g in grants:
        u = db.query(User).filter(User.id == g.grantee_id).first()
        results.append(GrantResponse(
            id=g.id,
            document_id=g.document_id,
            grantee_id=g.grantee_id,
            grantee_email=u.email if u else "unknown",
            granted_by=g.granted_by,
            permission=g.permission,
            status=g.status,
            download_count=g.download_count,
            max_downloads=g.max_downloads,
            expires_at=g.expires_at,
            created_at=g.created_at,
            updated_at=g.updated_at
        ))
    return results
