from datetime import datetime, timezone
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from backend.app.models.user import User
from backend.app.models.document import Document
from backend.app.models.grant import AccessGrant
from backend.app.core.exceptions import SecurityRefusalException
from backend.app.services.audit_service import audit_service

class DACEngine:
    def validate_document_access(
        self,
        db: Session,
        user: User,
        document_id: str,
        required_permission: str = "READ",  # "READ" or "EDIT"
        actor_ip: str = "127.0.0.1",
        is_content_access: bool = False
    ) -> Tuple[Document, Optional[AccessGrant]]:
        """
        Affine Fine-Grained Authorization Check:
        1. Checks document existence. If missing -> 404 & audit ACCESS_REFUSED.
        2. Owner has full permissions.
        3. Admin CANNOT read/download document contents without an explicit grant!
           (Non-negotiable requirement: Admin abuse prevention)
        4. Other users must have an ACTIVE, unexpired grant with remaining downloads.
           If not -> return 404 (IDOR Defense: prevents document enumeration).
        5. Refused attempts automatically log to immutable audit ledger.
        """
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            # Audit refused attempt for nonexistent document (enumeration probe)
            audit_service.log_event(
                db=db,
                event_type="ACCESS_REFUSED",
                actor_ip=actor_ip,
                actor_id=user.id if user else None,
                target_document_id=document_id,
                details={"reason": "Document not found (nonexistent ID)", "required_permission": required_permission}
            )
            raise SecurityRefusalException(
                detail="Document not found",
                status_code=404,
                document_id=document_id,
                reason="Document not found"
            )

        # 1. Document Owner check
        if doc.owner_id == user.id:
            return doc, None

        # 2. Administrator Content Gate Check (THREAT-04 Defense)
        if user.role == "ADMIN" and is_content_access:
            # Check if Admin has an explicit document-level grant from the owner
            admin_grant = db.query(AccessGrant).filter(
                AccessGrant.document_id == document_id,
                AccessGrant.grantee_id == user.id,
                AccessGrant.status == "ACTIVE"
            ).first()
            
            if not admin_grant:
                audit_service.log_event(
                    db=db,
                    event_type="ACCESS_REFUSED",
                    actor_ip=actor_ip,
                    actor_id=user.id,
                    target_document_id=document_id,
                    details={
                        "reason": "Administrative privilege abuse gate: Admin has no document-level grant from owner",
                        "attempted_action": "CONTENT_ACCESS"
                    }
                )
                raise SecurityRefusalException(
                    detail="Admins cannot view or download document contents without explicit owner grant",
                    status_code=403,
                    document_id=document_id,
                    reason="Admin access without grant prohibited"
                )

        # 3. Check Access Grant for Grantee
        grant = db.query(AccessGrant).filter(
            AccessGrant.document_id == document_id,
            AccessGrant.grantee_id == user.id
        ).first()

        now = datetime.now(timezone.utc)

        # Fail safe: Deny by default. Return 404 to avoid enumeration of unshared document.
        if not grant or grant.status != "ACTIVE":
            status_desc = grant.status if grant else "NO_GRANT"
            audit_service.log_event(
                db=db,
                event_type="ACCESS_REFUSED",
                actor_ip=actor_ip,
                actor_id=user.id,
                target_document_id=document_id,
                details={
                    "reason": f"No active grant ({status_desc})",
                    "required_permission": required_permission
                }
            )
            raise SecurityRefusalException(
                detail="Document not found",
                status_code=404,
                document_id=document_id,
                reason=f"No active grant ({status_desc})"
            )

        # Check Permission Level (e.g. EDIT requires permission == 'EDIT')
        if required_permission == "EDIT" and grant.permission != "EDIT":
            audit_service.log_event(
                db=db,
                event_type="ACCESS_REFUSED",
                actor_ip=actor_ip,
                actor_id=user.id,
                target_document_id=document_id,
                details={
                    "reason": "Insufficient permission level: READ grant cannot perform EDIT",
                    "required_permission": required_permission,
                    "held_permission": grant.permission
                }
            )
            raise SecurityRefusalException(
                detail="Document not found",
                status_code=404,
                document_id=document_id,
                reason="Insufficient permission level"
            )

        # Check Expiry Timestamp
        if grant.expires_at:
            # Normalize to UTC
            expires_at_utc = grant.expires_at.replace(tzinfo=timezone.utc) if grant.expires_at.tzinfo is None else grant.expires_at
            if now > expires_at_utc:
                grant.status = "EXPIRED"
                db.commit()
                audit_service.log_event(
                    db=db,
                    event_type="ACCESS_REFUSED",
                    actor_ip=actor_ip,
                    actor_id=user.id,
                    target_document_id=document_id,
                    details={"reason": "Grant has expired by TTL", "expires_at": expires_at_utc.isoformat()}
                )
                raise SecurityRefusalException(
                    detail="Document not found",
                    status_code=404,
                    document_id=document_id,
                    reason="Grant expired by TTL"
                )

        # Check Download Count Limit
        if grant.max_downloads is not None and grant.download_count >= grant.max_downloads:
            grant.status = "EXPIRED"
            db.commit()
            audit_service.log_event(
                db=db,
                event_type="ACCESS_REFUSED",
                actor_ip=actor_ip,
                actor_id=user.id,
                target_document_id=document_id,
                details={
                    "reason": "Grant download quota exhausted",
                    "download_count": grant.download_count,
                    "max_downloads": grant.max_downloads
                }
            )
            raise SecurityRefusalException(
                detail="Document not found",
                status_code=404,
                document_id=document_id,
                reason="Download quota exhausted"
            )

        return doc, grant

    def record_download(self, db: Session, grant: Optional[AccessGrant]):
        """
        Synchronously increments download counter. If max downloads reached, immediately expires.
        """
        if grant:
            grant.download_count += 1
            if grant.max_downloads is not None and grant.download_count >= grant.max_downloads:
                grant.status = "EXPIRED"
            grant.updated_at = datetime.now(timezone.utc)
            db.commit()

dac_engine = DACEngine()
