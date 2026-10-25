import pytest
import io
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from backend.app.models.user import User
from backend.app.models.document import Document
from backend.app.models.grant import AccessGrant
from backend.app.models.audit import AuditLog
from backend.app.core.security import get_password_hash, create_access_token
from backend.app.services.storage import storage_service
from backend.app.services.validator import inspect_and_checksum_payload
from backend.app.services.audit_service import audit_service

# Valid sample PDF header bytes
SAMPLE_PDF_BYTES = (
    b"%PDF-1.4\n1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n"
    b"2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n"
    b"3 0 obj <</Type /Page /Parent 2 0 R /Contents 4 0 R>> endobj\n"
    b"4 0 obj <</Length 23>> stream\nBT /F1 12 Tf (Secret) Tj ET\nendstream\nendobj\n"
    b"xref\n0 5\n0000000000 65535 f \ntrailer <</Size 5 /Root 1 0 R>>\nstartxref\n180\n%%EOF"
)

def create_user(db, email, role, name="Test User"):
    u = db.query(User).filter(User.email == email).first()
    if not u:
        u = User(
            name=name,
            email=email,
            password_hash=get_password_hash("SecretPassword123!"),
            role=role,
            is_active=True
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    return u

def create_document_for_owner(db, owner):
    sanitized_name, mime_type, ext, checksum = inspect_and_checksum_payload(SAMPLE_PDF_BYTES, "test_doc.pdf")
    storage_key, encrypted_dek, dek_nonce = storage_service.store_document(SAMPLE_PDF_BYTES)
    doc = Document(
        owner_id=owner.id,
        title="Classified Audit Report",
        category="Finance",
        original_filename=sanitized_name,
        file_size=len(SAMPLE_PDF_BYTES),
        mime_type=mime_type,
        sha256_checksum=checksum,
        storage_key=storage_key,
        encrypted_dek=encrypted_dek,
        dek_nonce=dek_nonce
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc

# =========================================================================
# 1. CORE TEST: test_user_cannot_access_unshared_document
# User B attempts GET /api/v1/documents/:id_of_user_a -> Assert 404 Not Found
# =========================================================================
def test_user_cannot_access_unshared_document(client, db_session):
    owner = create_user(db_session, "user_a@vault.local", "OWNER")
    unauthorized_viewer = create_user(db_session, "user_b@vault.local", "VIEWER")
    doc = create_document_for_owner(db_session, owner)

    viewer_token = create_access_token(unauthorized_viewer.id)
    headers = {"Authorization": f"Bearer {viewer_token}"}

    # Attempt metadata access
    res = client.get(f"/api/v1/documents/{doc.id}", headers=headers)
    assert res.status_code == 404, f"Expected 404 to prevent IDOR enumeration, got {res.status_code}"

    # Attempt file download
    stream_res = client.get(f"/api/v1/documents/{doc.id}/download", headers=headers)
    assert stream_res.status_code == 404, f"Expected 404 on unshared download, got {stream_res.status_code}"

# =========================================================================
# 2. CORE TEST: test_immediate_revocation_invalidates_active_session
# Owner shares document with User B -> fetches succeeds (200) ->
# Owner revokes access -> User B immediately re-requests -> Assert 404 within 0ms
# =========================================================================
def test_immediate_revocation_invalidates_active_session(client, db_session):
    owner = create_user(db_session, "owner_revocation@vault.local", "OWNER")
    viewer = create_user(db_session, "viewer_revocation@vault.local", "VIEWER")
    doc = create_document_for_owner(db_session, owner)

    owner_token = create_access_token(owner.id)
    viewer_token = create_access_token(viewer.id)
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    viewer_headers = {"Authorization": f"Bearer {viewer_token}"}

    # 1. Owner shares document with User B
    share_res = client.post(
        f"/api/v1/documents/{doc.id}/grants",
        headers=owner_headers,
        json={"grantee_email": viewer.email, "permission": "READ"}
    )
    assert share_res.status_code == 200
    grant_id = share_res.json()["id"]

    # 2. User B fetches document content (succeeds, 200)
    dl_res = client.get(f"/api/v1/documents/{doc.id}/download", headers=viewer_headers)
    assert dl_res.status_code == 200
    assert dl_res.content == SAMPLE_PDF_BYTES

    # 3. Owner revokes access for User B
    revoke_res = client.delete(f"/api/v1/documents/{doc.id}/grants/{grant_id}", headers=owner_headers)
    assert revoke_res.status_code == 200
    assert revoke_res.json()["status"] == "REVOKED"

    # 4. User B immediately re-requests document -> Assert 404 Not Found within 0ms
    immediate_dl_res = client.get(f"/api/v1/documents/{doc.id}/download", headers=viewer_headers)
    assert immediate_dl_res.status_code == 404, f"Expected immediate 404 after revocation, got {immediate_dl_res.status_code}"

    # Also metadata should be immediately 404
    immediate_meta_res = client.get(f"/api/v1/documents/{doc.id}", headers=viewer_headers)
    assert immediate_meta_res.status_code == 404

# =========================================================================
# 3. CORE TEST: test_admin_cannot_bypass_owner_document_gate
# Admin requests document content without grant -> Assert 403 Forbidden / 404 Not Found
# =========================================================================
def test_admin_cannot_bypass_owner_document_gate(client, db_session):
    admin = create_user(db_session, "privileged_admin@vault.local", "ADMIN")
    owner = create_user(db_session, "doc_owner_payroll@vault.local", "OWNER")
    doc = create_document_for_owner(db_session, owner)

    admin_token = create_access_token(admin.id)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Admin attempts to download document content without explicit owner grant
    dl_res = client.get(f"/api/v1/documents/{doc.id}/download", headers=admin_headers)
    assert dl_res.status_code in [403, 404], f"Expected 403/404 for admin bypass attempt, got {dl_res.status_code}"

# =========================================================================
# 4. CORE TEST: test_audit_log_records_refused_attempts
# Unauthorized request is triggered -> Query audit_logs ->
# Assert entry exists with event_type = 'ACCESS_REFUSED', capturing IP, timestamp, doc ID
# =========================================================================
def test_audit_log_records_refused_attempts(client, db_session):
    owner = create_user(db_session, "owner_audit_test@vault.local", "OWNER")
    attacker = create_user(db_session, "attacker@vault.local", "VIEWER")
    doc = create_document_for_owner(db_session, owner)

    attacker_token = create_access_token(attacker.id)
    headers = {"Authorization": f"Bearer {attacker_token}", "X-Forwarded-For": "198.51.100.42"}

    # Trigger refused attempt
    res = client.get(f"/api/v1/documents/{doc.id}/download", headers=headers)
    assert res.status_code == 404

    # Query audit_logs table
    refusal_log = db_session.query(AuditLog).filter(
        AuditLog.event_type == "ACCESS_REFUSED",
        AuditLog.actor_id == attacker.id,
        AuditLog.target_document_id == doc.id
    ).order_by(AuditLog.sequence_number.desc()).first()

    assert refusal_log is not None, "ACCESS_REFUSED audit record was not found in audit_logs"
    assert refusal_log.actor_ip == "198.51.100.42"
    assert refusal_log.timestamp is not None
    assert refusal_log.target_document_id == doc.id
    assert refusal_log.record_hash is not None

# =========================================================================
# 5. CORE TEST: test_audit_table_immutability
# Attempt an UPDATE or DELETE query on audit_logs ->
# Assert database-level transaction abort with error
# =========================================================================
def test_audit_table_immutability(db_session):
    # Ensure there is at least one audit record
    audit_service.log_event(
        db=db_session,
        event_type="ACCESS_GRANTED",
        actor_ip="127.0.0.1",
        details={"test": "immutability"}
    )

    # 1. Attempt UPDATE on audit_logs -> Assert transaction abort with error
    with pytest.raises(Exception) as exc_update:
        db_session.execute(text("UPDATE audit_logs SET actor_ip = '10.99.99.99' WHERE sequence_number = 1"))
        db_session.commit()
    db_session.rollback()
    assert "immutable" in str(exc_update.value).lower() or "integrity" in str(exc_update.value).lower()

    # 2. Attempt DELETE on audit_logs -> Assert transaction abort with error
    with pytest.raises(Exception) as exc_delete:
        db_session.execute(text("DELETE FROM audit_logs WHERE sequence_number = 1"))
        db_session.commit()
    db_session.rollback()
    assert "immutable" in str(exc_delete.value).lower() or "integrity" in str(exc_delete.value).lower()

# =========================================================================
# 6. ADVERSARIAL TEST: Magic-byte sniffing rejects executable masquerading as PDF
# =========================================================================
def test_magic_byte_sniffing_rejects_disguised_executable(client, db_session):
    owner = create_user(db_session, "owner_malware_test@vault.local", "OWNER")
    token = create_access_token(owner.id)
    headers = {"Authorization": f"Bearer {token}"}

    # DOS/Windows PE executable disguised with .pdf extension
    malicious_exe_bytes = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00malicious_payload_code"
    
    files = {"file": ("invoice_2026.pdf", io.BytesIO(malicious_exe_bytes), "application/pdf")}
    res = client.post("/api/v1/documents/upload", headers=headers, data={"title": "Invoice"}, files=files)
    assert res.status_code == 400
    assert "Executable" in res.json()["detail"] or "Binary signature" in res.json()["detail"]

# =========================================================================
# 7. ADVERSARIAL TEST: Max downloads quota automatically expires grant
# =========================================================================
def test_max_downloads_quota_enforcement(client, db_session):
    owner = create_user(db_session, "owner_quota@vault.local", "OWNER")
    viewer = create_user(db_session, "viewer_quota@vault.local", "VIEWER")
    doc = create_document_for_owner(db_session, owner)

    owner_token = create_access_token(owner.id)
    viewer_token = create_access_token(viewer.id)

    # Share with max_downloads = 1
    client.post(
        f"/api/v1/documents/{doc.id}/grants",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"grantee_email": viewer.email, "permission": "READ", "max_downloads": 1}
    )

    # First download succeeds (quota count = 1)
    res1 = client.get(f"/api/v1/documents/{doc.id}/download", headers={"Authorization": f"Bearer {viewer_token}"})
    assert res1.status_code == 200

    # Second download fails immediately (404)
    res2 = client.get(f"/api/v1/documents/{doc.id}/download", headers={"Authorization": f"Bearer {viewer_token}"})
    assert res2.status_code == 404

# =========================================================================
# 8. ADVERSARIAL TEST: Cryptographic ledger verification algorithm
# =========================================================================
def test_cryptographic_ledger_verification(db_session):
    res = audit_service.verify_ledger(db_session)
    assert res["is_valid"] is True
    assert res["verified_sequences"] == res["total_records"]
    assert res["error_detail"] is None
