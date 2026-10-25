from sqlalchemy import text
from backend.app.db.session import engine
from backend.app.models import Base
from backend.app.core.config import settings

def init_db():
    Base.metadata.create_all(bind=engine)
    
    with engine.connect() as conn:
        if settings.DATABASE_URL.startswith("sqlite"):
            # Install SQLite Immutability Triggers on audit_logs
            conn.execute(text("""
                CREATE TRIGGER IF NOT EXISTS trg_audit_no_update
                BEFORE UPDATE ON audit_logs
                BEGIN
                    SELECT RAISE(ABORT, 'SECURITY VIOLATION: Audit log records are strictly immutable and cannot be updated.');
                END;
            """))
            conn.execute(text("""
                CREATE TRIGGER IF NOT EXISTS trg_audit_no_delete
                BEFORE DELETE ON audit_logs
                BEGIN
                    SELECT RAISE(ABORT, 'SECURITY VIOLATION: Audit log records are strictly immutable and cannot be deleted.');
                END;
            """))
            conn.commit()
        elif "postgresql" in settings.DATABASE_URL:
            # Install PostgreSQL PL/pgSQL function & trigger
            conn.execute(text("""
                CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
                RETURNS TRIGGER AS $$
                BEGIN
                    RAISE EXCEPTION 'SECURITY VIOLATION: TrustVault audit ledger is strictly append-only. Modification is prohibited.';
                    RETURN NULL;
                END;
                $$ LANGUAGE plpgsql;
            """))
            conn.execute(text("""
                DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_logs;
                CREATE TRIGGER trg_audit_log_immutable
                BEFORE UPDATE OR DELETE ON audit_logs
                FOR EACH ROW
                EXECUTE FUNCTION prevent_audit_log_modification();
            """))
            conn.commit()

if __name__ == "__main__":
    init_db()
    print("Database tables & immutability triggers initialized successfully.")
