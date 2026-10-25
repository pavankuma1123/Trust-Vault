import io
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from backend.app.db.session import get_db
from backend.app.api.deps import get_current_user, get_client_ip
from backend.app.models.user import User
from backend.app.models.document import Document
from backend.app.models.grant import AccessGrant
from backend.app.schemas.document import DocumentResponse, DocumentUpdate
from backend.app.services.validator import inspect_and_checksum_payload
from backend.app.services.storage import storage_service
from backend.app.services.dac_engine import dac_engine
from backend.app.services.audit_service import audit_service
from backend.app.core.config import settings
from backend.app.core.exceptions import SecurityRefusalException

router = APIRouter(prefix="/documents", tags=["Documents"])

@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(...),
    category: str = Form("General"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ip = get_client_ip(request)
    
    # 1. Read bytes and check payload size boundary
    content = await file.read()
    if len(content) > settings.MAX_PAYLOAD_SIZE:
        audit_service.log_event(
            db=db,
            event_type="ACCESS_REFUSED",
            actor_ip=ip,
            actor_id=current_user.id,
            details={"reason": "Payload size exceeded 25MB limit", "file_size": len(content)}
        )
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size exceeds maximum allowed boundary of 25MB."
        )

    # 2. Magic-byte sniffing, sanitization, and SHA-256 checksum
    raw_filename = file.filename or "uploaded_document.bin"
    sanitized_name, mime_type, ext, checksum = inspect_and_checksum_payload(content, raw_filename)

    # 3. Multi-tenant Envelope Encryption
    storage_key, encrypted_dek, dek_nonce = storage_service.store_document(content)

    # 4. Relational Persistence
    doc = Document(
        owner_id=current_user.id,
        title=title.strip() if title else sanitized_name,
        category=category.strip() if category else "General",
        original_filename=sanitized_name,
        file_size=len(content),
        mime_type=mime_type,
        sha256_checksum=checksum,
        storage_key=storage_key,
        encrypted_dek=encrypted_dek,
        dek_nonce=dek_nonce
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # 5. Audit Logging
    audit_service.log_event(
        db=db,
        event_type="DOCUMENT_UPLOAD",
        actor_ip=ip,
        actor_id=current_user.id,
        target_document_id=doc.id,
        details={
            "title": doc.title,
            "filename": doc.original_filename,
            "file_size": doc.file_size,
            "mime_type": doc.mime_type,
            "sha256_checksum": doc.sha256_checksum
        }
    )

    return DocumentResponse(
        id=doc.id,
        owner_id=doc.owner_id,
        title=doc.title,
        category=doc.category,
        original_filename=doc.original_filename,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        sha256_checksum=doc.sha256_checksum,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        can_edit=True,
        is_owner=True
    )

@router.get("", response_model=List[DocumentResponse])
def list_documents(
    title: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    owner_id: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Search & Retrieval:
    Runs inside the SQL query itself!
    Filters strictly across documents caller has affirmative active rights to access.
    """
    now = datetime.now(timezone.utc)
    
    # Subquery for documents granted to current_user
    granted_doc_subq = db.query(AccessGrant.document_id).filter(
        AccessGrant.grantee_id == current_user.id,
        AccessGrant.status == "ACTIVE",
        or_(AccessGrant.expires_at == None, AccessGrant.expires_at > now),
        or_(AccessGrant.max_downloads == None, AccessGrant.download_count < AccessGrant.max_downloads)
    ).subquery()

    # Query documents owned OR granted
    query = db.query(Document).filter(
        or_(
            Document.owner_id == current_user.id,
            Document.id.in_(granted_doc_subq)
        )
    )

    # Apply relational filter criteria
    if title:
        query = query.filter(Document.title.ilike(f"%{title}%"))
    if category:
        query = query.filter(Document.category.ilike(f"%{category}%"))
    if owner_id:
        query = query.filter(Document.owner_id == owner_id)
    if start_date:
        query = query.filter(Document.created_at >= start_date)
    if end_date:
        query = query.filter(Document.created_at <= end_date)

    docs = query.order_by(Document.created_at.desc()).all()

    # Determine can_edit and is_owner flags for UI rendering
    results = []
    for doc in docs:
        is_owner = (doc.owner_id == current_user.id)
        can_edit = is_owner
        if not can_edit:
            grant = db.query(AccessGrant).filter(
                AccessGrant.document_id == doc.id,
                AccessGrant.grantee_id == current_user.id,
                AccessGrant.status == "ACTIVE",
                AccessGrant.permission == "EDIT"
            ).first()
            if grant:
                can_edit = True

        results.append(DocumentResponse(
            id=doc.id,
            owner_id=doc.owner_id,
            title=doc.title,
            category=doc.category,
            original_filename=doc.original_filename,
            file_size=doc.file_size,
            mime_type=doc.mime_type,
            sha256_checksum=doc.sha256_checksum,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
            can_edit=can_edit,
            is_owner=is_owner
        ))

    return results

@router.get("/{document_id}", response_model=DocumentResponse)
def get_document_metadata(
    document_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ip = get_client_ip(request)
    doc, grant = dac_engine.validate_document_access(
        db=db,
        user=current_user,
        document_id=document_id,
        required_permission="READ",
        actor_ip=ip,
        is_content_access=False
    )

    audit_service.log_event(
        db=db,
        event_type="DOCUMENT_READ",
        actor_ip=ip,
        actor_id=current_user.id,
        target_document_id=doc.id,
        details={"action": "METADATA_INSPECTED"}
    )

    is_owner = (doc.owner_id == current_user.id)
    can_edit = is_owner or (grant is not None and grant.permission == "EDIT")

    return DocumentResponse(
        id=doc.id,
        owner_id=doc.owner_id,
        title=doc.title,
        category=doc.category,
        original_filename=doc.original_filename,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        sha256_checksum=doc.sha256_checksum,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        can_edit=can_edit,
        is_owner=is_owner
    )

@router.get("/{document_id}/download")
def download_document(
    document_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Authenticated Streaming Proxy Pipeline:
    - Zero-latency revocation check at packet egress.
    - Admin Gate: Admins cannot download without explicit document grant.
    - Decrypts DEK & payload in-memory (never leaked).
    - Checks grant during stream chunks to neutralize replay attacks.
    - Decrements max_downloads quota.
    - Emits strict Content-Disposition, CSP sandbox, and anti-sniffing headers.
    """
    ip = get_client_ip(request)
    doc, grant = dac_engine.validate_document_access(
        db=db,
        user=current_user,
        document_id=document_id,
        required_permission="READ",
        actor_ip=ip,
        is_content_access=True
    )

    # Decrypt in memory via envelope encryption
    plaintext = storage_service.retrieve_document(
        storage_key=doc.storage_key,
        encrypted_dek_b64=doc.encrypted_dek,
        dek_nonce_b64=doc.dek_nonce
    )

    # Record download usage and audit event
    dac_engine.record_download(db, grant)
    audit_service.log_event(
        db=db,
        event_type="DOCUMENT_DOWNLOAD",
        actor_ip=ip,
        actor_id=current_user.id,
        target_document_id=doc.id,
        details={
            "filename": doc.original_filename,
            "sha256_checksum": doc.sha256_checksum,
            "download_count": grant.download_count if grant else "OWNER"
        }
    )

    # Streaming generator checking revocation per chunk
    def stream_chunks():
        chunk_size = 256 * 1024  # 256KB chunks
        stream = io.BytesIO(plaintext)
        while True:
            # Re-check active revocation state mid-stream if caller is grantee (THREAT-07 Defense)
            if grant:
                fresh_grant = db.query(AccessGrant).filter(AccessGrant.id == grant.id).first()
                if not fresh_grant or fresh_grant.status == "REVOKED":
                    # Instant mid-stream packet drop
                    break
            chunk = stream.read(chunk_size)
            if not chunk:
                break
            yield chunk

    headers = {
        "Content-Disposition": f'attachment; filename="{doc.original_filename}"',
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "X-Payload-Checksum-SHA256": doc.sha256_checksum
    }

    return StreamingResponse(
        stream_chunks(),
        media_type=doc.mime_type,
        headers=headers
    )

@router.put("/{document_id}", response_model=DocumentResponse)
def update_document(
    document_id: str,
    update_data: DocumentUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ip = get_client_ip(request)
    doc, grant = dac_engine.validate_document_access(
        db=db,
        user=current_user,
        document_id=document_id,
        required_permission="EDIT",
        actor_ip=ip,
        is_content_access=False
    )

    if update_data.title is not None:
        doc.title = update_data.title.strip()
    if update_data.category is not None:
        doc.category = update_data.category.strip()

    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)

    audit_service.log_event(
        db=db,
        event_type="METADATA_UPDATE",
        actor_ip=ip,
        actor_id=current_user.id,
        target_document_id=doc.id,
        details={"updated_title": doc.title, "updated_category": doc.category}
    )

    is_owner = (doc.owner_id == current_user.id)
    return DocumentResponse(
        id=doc.id,
        owner_id=doc.owner_id,
        title=doc.title,
        category=doc.category,
        original_filename=doc.original_filename,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        sha256_checksum=doc.sha256_checksum,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        can_edit=True,
        is_owner=is_owner
    )

@router.delete("/{document_id}")
def delete_document(
    document_id: str,
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
            details={"reason": "Attempted to delete nonexistent document"}
        )
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.owner_id != current_user.id:
        audit_service.log_event(
            db=db,
            event_type="ACCESS_REFUSED",
            actor_ip=ip,
            actor_id=current_user.id,
            target_document_id=doc.id,
            details={"reason": "Non-owner attempted document deletion"}
        )
        raise HTTPException(status_code=403, detail="Only document owner can delete this document.")

    # Remove blob from storage
    storage_service.delete_document(doc.storage_key)

    doc_id = doc.id
    doc_title = doc.title
    db.delete(doc)
    db.commit()

    audit_service.log_event(
        db=db,
        event_type="DOCUMENT_DELETE",
        actor_ip=ip,
        actor_id=current_user.id,
        target_document_id=doc_id,
        details={"title": doc_title}
    )

    return {"message": f"Document '{doc_title}' deleted successfully."}
