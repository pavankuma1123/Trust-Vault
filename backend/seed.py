import sys
from datetime import datetime, timedelta, timezone
from backend.app.db.init_db import init_db
from backend.app.db.session import SessionLocal
from backend.app.models.user import User
from backend.app.models.document import Document
from backend.app.models.grant import AccessGrant
from backend.app.models.audit import AuditLog
from backend.app.core.security import get_password_hash
from backend.app.services.storage import storage_service
from backend.app.services.validator import inspect_and_checksum_payload
from backend.app.services.audit_service import audit_service

# Private Admin Credentials (KEPT CONFIDENTIAL - NOT SHOWN ON PUBLIC UI)
PRIVATE_ADMIN_EMAIL = "security-admin@vault.internal"
PRIVATE_ADMIN_PASSWORD = "AdminSecure2026#VaultMasterKey!"
PRIVATE_ADMIN_NAME = "Chief Security Compliance Officer"

OWNER_EMAIL = "owner@vault.local"
OWNER_PASSWORD = "OwnerSecretPass123!"
OWNER_NAME = "K. Pavan Kumar"

PAVAN_EMAIL = "pavankumarkandru5@gmail.com"
PAVAN_PASSWORD = "OwnerSecretPass123!"
PAVAN_NAME = "K. Pavan Kumar"

VIEWER_EMAIL = "viewer@vault.local"
VIEWER_PASSWORD = "ViewerSecretPass123!"
VIEWER_NAME = "Viewer"

def seed_database():
    print("Initializing TrustVault Database and Triggers...")
    init_db()
    
    db = SessionLocal()
    try:
        # Check if users already exist
        admin = db.query(User).filter(User.email == PRIVATE_ADMIN_EMAIL).first()
        if not admin:
            print("Seeding core personas...")
            admin = User(
                name=PRIVATE_ADMIN_NAME,
                email=PRIVATE_ADMIN_EMAIL,
                password_hash=get_password_hash(PRIVATE_ADMIN_PASSWORD),
                role="ADMIN",
                is_active=True
            )
            owner = User(
                name=OWNER_NAME,
                email=OWNER_EMAIL,
                password_hash=get_password_hash(OWNER_PASSWORD),
                role="OWNER",
                is_active=True
            )
            pavan = User(
                name=PAVAN_NAME,
                email=PAVAN_EMAIL,
                password_hash=get_password_hash(PAVAN_PASSWORD),
                role="OWNER",
                is_active=True
            )
            viewer = User(
                name=VIEWER_NAME,
                email=VIEWER_EMAIL,
                password_hash=get_password_hash(VIEWER_PASSWORD),
                role="VIEWER",
                is_active=True
            )
            db.add_all([admin, owner, pavan, viewer])
            db.commit()
            db.refresh(admin)
            db.refresh(owner)
            db.refresh(pavan)
            db.refresh(viewer)

            audit_service.log_event(
                db=db,
                event_type="ACCESS_GRANTED",
                actor_ip="127.0.0.1",
                actor_id=admin.id,
                details={"action": "ADMIN_PROVISIONED_CONFIDENTIAL", "role": "ADMIN", "name": admin.name}
            )
            audit_service.log_event(
                db=db,
                event_type="ACCESS_GRANTED",
                actor_ip="127.0.0.1",
                actor_id=owner.id,
                details={"action": "OWNER_ACCOUNT_PROVISIONED", "role": "OWNER", "name": owner.name}
            )
            audit_service.log_event(
                db=db,
                event_type="ACCESS_GRANTED",
                actor_ip="127.0.0.1",
                actor_id=viewer.id,
                details={"action": "VIEWER_ACCOUNT_PROVISIONED", "role": "VIEWER", "name": viewer.name}
            )
        else:
            owner = db.query(User).filter(User.email == OWNER_EMAIL).first()
            viewer = db.query(User).filter(User.email == VIEWER_EMAIL).first()
            pavan = db.query(User).filter(User.email == PAVAN_EMAIL).first()
            if not pavan:
                pavan = User(
                    name=PAVAN_NAME,
                    email=PAVAN_EMAIL,
                    password_hash=get_password_hash(PAVAN_PASSWORD),
                    role="OWNER",
                    is_active=True
                )
                db.add(pavan)
                db.commit()
            else:
                pavan.password_hash = get_password_hash(PAVAN_PASSWORD)
                db.commit()

        # Seed sample encrypted document if none exists
        doc = db.query(Document).filter(Document.owner_id == owner.id).first()
        if not doc:
            print("Seeding sample encrypted document...")
            sample_pdf_bytes = (
                b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n"
                b"1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n"
                b"2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n"
                b"3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R>> endobj\n"
                b"4 0 obj <</Length 68>> stream\n"
                b"BT /F1 24 Tf 100 700 Td (TrustVault Confidential Strategic Plan 2026) Tj ET\n"
                b"endstream\nendobj\nxref\n0 5\n0000000000 65535 f \n"
                b"trailer <</Size 5 /Root 1 0 R>>\nstartxref\n340\n%%EOF"
            )
            sanitized_name, mime_type, ext, checksum = inspect_and_checksum_payload(
                sample_pdf_bytes, "Strategic_Plan_2026.pdf"
            )
            storage_key, encrypted_dek, dek_nonce = storage_service.store_document(sample_pdf_bytes)

            doc = Document(
                owner_id=owner.id,
                title="Strategic Executive Plan 2026",
                category="Executive",
                original_filename=sanitized_name,
                file_size=len(sample_pdf_bytes),
                mime_type=mime_type,
                sha256_checksum=checksum,
                storage_key=storage_key,
                encrypted_dek=encrypted_dek,
                dek_nonce=dek_nonce
            )
            db.add(doc)
            db.commit()
            db.refresh(doc)

            audit_service.log_event(
                db=db,
                event_type="DOCUMENT_UPLOAD",
                actor_ip="127.0.0.1",
                actor_id=owner.id,
                target_document_id=doc.id,
                details={
                    "title": doc.title,
                    "filename": doc.original_filename,
                    "file_size": doc.file_size,
                    "sha256_checksum": doc.sha256_checksum
                }
            )

            # Delegate grant to viewer
            expires_at = datetime.now(timezone.utc) + timedelta(days=30)
            grant = AccessGrant(
                document_id=doc.id,
                grantee_id=viewer.id,
                granted_by=owner.id,
                permission="READ",
                status="ACTIVE",
                download_count=0,
                max_downloads=5,
                expires_at=expires_at
            )
            db.add(grant)
            db.commit()

            audit_service.log_event(
                db=db,
                event_type="ACCESS_GRANTED",
                actor_ip="127.0.0.1",
                actor_id=owner.id,
                target_document_id=doc.id,
                details={
                    "grantee_email": viewer.email,
                    "permission": "READ",
                    "max_downloads": 5,
                    "expires_at": expires_at.isoformat()
                }
            )

        print("\n=======================================================")
        print(" TrustVault Seed Data Successfully Generated")
        print("=======================================================")
        print(f"[*] PRIVATE ADMIN USERNAME: {PRIVATE_ADMIN_EMAIL}")
        print(f"[*] PRIVATE ADMIN PASSWORD: {PRIVATE_ADMIN_PASSWORD}")
        print("  (Admin credentials are kept PRIVATE and not exposed on the public UI)")
        print(f"[*] DEFAULT OWNER ACCOUNT: {OWNER_EMAIL} / {OWNER_PASSWORD}")
        print(f"[*] DEFAULT VIEWER ACCOUNT: {VIEWER_EMAIL} / {VIEWER_PASSWORD}")
        print("=======================================================")
        
        # Verify ledger status
        res = audit_service.verify_ledger(db)
        print(f"Ledger Chain Verification: Valid={res['is_valid']}, Records={res['total_records']}, Hash={res['latest_record_hash'][:16]}...")
        print("=======================================================\n")
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
