import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc
from backend.app.db.session import get_db
from backend.app.api.deps import get_current_user, get_current_admin, get_client_ip
from backend.app.models.user import User
from backend.app.models.document import Document
from backend.app.models.audit import AuditLog
from backend.app.schemas.audit import AuditLogResponse, LedgerVerifyResponse
from backend.app.services.audit_service import audit_service

router = APIRouter(prefix="/audit", tags=["Audit Ledger"])

@router.get("/ledger", response_model=List[AuditLogResponse])
def get_audit_ledger(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    event_type: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(AuditLog)

    # Scoping: Admin sees all events. Owner sees events for their documents or their actions.
    if current_user.role != "ADMIN":
        owned_doc_ids = db.query(Document.id).filter(Document.owner_id == current_user.id).all()
        doc_id_list = [d[0] for d in owned_doc_ids]
        query = query.filter(
            (AuditLog.actor_id == current_user.id) | (AuditLog.target_document_id.in_(doc_id_list))
        )

    if event_type:
        query = query.filter(AuditLog.event_type == event_type)

    logs = query.order_by(desc(AuditLog.sequence_number)).offset(offset).limit(limit).all()

    results = []
    for l in logs:
        actor_email = None
        if l.actor_id:
            u = db.query(User).filter(User.id == l.actor_id).first()
            if u:
                actor_email = u.email

        try:
            details_obj = json.loads(l.details)
        except Exception:
            details_obj = {}

        results.append(AuditLogResponse(
            id=l.id,
            sequence_number=l.sequence_number,
            timestamp=l.timestamp,
            event_type=l.event_type,
            actor_id=l.actor_id,
            actor_email=actor_email,
            actor_ip=l.actor_ip,
            target_document_id=l.target_document_id,
            details=details_obj,
            previous_hash=l.previous_hash,
            record_hash=l.record_hash
        ))

    return results

@router.get("/verify", response_model=LedgerVerifyResponse)
def verify_audit_ledger(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Cryptographic Chain Integrity Verification:
    Iterates through the entire append-only ledger and mathematically verifies:
    Hash_n == SHA-256(Record_n + Hash_{n-1})
    """
    result = audit_service.verify_ledger(db)
    
    # Log verification execution event
    audit_service.log_event(
        db=db,
        event_type="LEDGER_VERIFIED",
        actor_ip=get_client_ip(request),
        actor_id=current_admin.id,
        details={
            "is_valid": result["is_valid"],
            "total_records": result["total_records"],
            "verification_time_ms": result["verification_time_ms"]
        }
    )
    return result
