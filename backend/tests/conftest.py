import pytest
import os
from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Set test environment before importing app modules
os.environ["DATABASE_URL"] = "sqlite:///./test_trustvault.db"
os.environ["VAULT_STORAGE_PATH"] = "backend/test_vault_blobs"

from backend.app.db.session import get_db
from backend.app.models import Base
from backend.app.db.init_db import init_db
from backend.app.core.config import settings
from backend.app.core.security import get_password_hash
from backend.app.models.user import User
from backend.app.models.document import Document
from backend.app.models.grant import AccessGrant
from backend.app.models.audit import AuditLog
from backend.app.main import app

test_engine = create_engine(
    "sqlite:///./test_trustvault.db",
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    # Clean previous test artifacts
    test_db_path = Path("./test_trustvault.db")
    if test_db_path.exists():
        test_db_path.unlink()
    test_storage = Path("backend/test_vault_blobs")
    if test_storage.exists():
        for f in test_storage.glob("*"):
            f.unlink()

    Base.metadata.create_all(bind=test_engine)
    
    # Install immutability triggers on test database
    with test_engine.connect() as conn:
        from sqlalchemy import text
        conn.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_audit_no_update
            BEFORE UPDATE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'SECURITY VIOLATION: Audit log records are strictly immutable.');
            END;
        """))
        conn.execute(text("""
            CREATE TRIGGER IF NOT EXISTS trg_audit_no_delete
            BEFORE DELETE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'SECURITY VIOLATION: Audit log records are strictly immutable.');
            END;
        """))
        conn.commit()

    yield

    # Teardown
    if test_db_path.exists():
        try:
            test_db_path.unlink()
        except Exception:
            pass

@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
