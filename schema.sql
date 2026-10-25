-- ========================================================================
-- TrustVault: Cryptographically Enforced Secure Document Exchange
-- Production PostgreSQL DDL Schema with Row-Level Security (RLS) & Immutability Triggers
-- ========================================================================

-- Enable pgcrypto for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean existing types if necessary
DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_logs;
DROP FUNCTION IF EXISTS prevent_audit_log_modification();
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS access_grants CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS audit_event_type CASCADE;
DROP TYPE IF EXISTS grant_status CASCADE;
DROP TYPE IF EXISTS grant_permission CASCADE;
DROP TYPE IF EXISTS role_enum CASCADE;

-- ------------------------------------------------------------------------
-- 1. Custom Types & Enums
-- ------------------------------------------------------------------------
CREATE TYPE role_enum AS ENUM ('ADMIN', 'OWNER', 'VIEWER');
CREATE TYPE grant_permission AS ENUM ('READ', 'EDIT');
CREATE TYPE grant_status AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE audit_event_type AS ENUM (
    'ACCESS_GRANTED',
    'ACCESS_REVOKED',
    'DOCUMENT_UPLOAD',
    'DOCUMENT_READ',
    'DOCUMENT_DOWNLOAD',
    'DOCUMENT_EDIT',
    'DOCUMENT_DELETE',
    'ACCESS_REFUSED',
    'METADATA_UPDATE',
    'INTEGRITY_CHECK_FAILED',
    'LEDGER_VERIFIED'
);

-- ------------------------------------------------------------------------
-- 2. Users Table
-- ------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL DEFAULT 'Vault User',
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role role_enum NOT NULL DEFAULT 'VIEWER',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------
-- 3. Documents Table
-- Storage key uses content-addressed UUIDs (/vault-blobs/${uuidv4()})
-- Never stores original filenames in underlying storage path
-- ------------------------------------------------------------------------
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'General',
    original_filename VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL CHECK (file_size > 0),
    mime_type VARCHAR(127) NOT NULL,
    sha256_checksum CHAR(64) NOT NULL,
    storage_key VARCHAR(255) NOT NULL UNIQUE,
    encrypted_dek TEXT NOT NULL,
    dek_nonce VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------
-- 4. Access Grants Table (Discretionary Access Control)
-- Immediate zero-latency revocation enforced synchronously via status & constraints
-- ------------------------------------------------------------------------
CREATE TABLE access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    grantee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission grant_permission NOT NULL DEFAULT 'READ',
    status grant_status NOT NULL DEFAULT 'ACTIVE',
    download_count INT NOT NULL DEFAULT 0 CHECK (download_count >= 0),
    max_downloads INT NULL CHECK (max_downloads IS NULL OR max_downloads > 0),
    expires_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_document_grantee UNIQUE (document_id, grantee_id)
);

-- ------------------------------------------------------------------------
-- 5. Audit Logs Table (Tamper-Evident Forward-Secure Cryptographic Ledger)
-- Hash_n = SHA-256(Record_n + Hash_{n-1})
-- ------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_number BIGINT NOT NULL UNIQUE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event_type audit_event_type NOT NULL,
    actor_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    actor_ip VARCHAR(45) NOT NULL,
    target_document_id UUID NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    previous_hash CHAR(64) NOT NULL,
    record_hash CHAR(64) NOT NULL
);

-- ------------------------------------------------------------------------
-- 6. Indexes for High-Speed Enforcement & Telemetry Queries
-- ------------------------------------------------------------------------
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_documents_owner ON documents(owner_id);
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_created_at ON documents(created_at);
CREATE INDEX idx_grants_lookup ON access_grants(grantee_id, document_id, status);
CREATE INDEX idx_grants_doc ON access_grants(document_id);
CREATE INDEX idx_audit_seq ON audit_logs(sequence_number);
CREATE INDEX idx_audit_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_target_doc ON audit_logs(target_document_id);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);

-- ------------------------------------------------------------------------
-- 7. Database-Level Immutability Trigger (THREAT-03 Defense)
-- Aborts any UPDATE or DELETE statement against audit_logs even if issued by DBA
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY VIOLATION: TrustVault audit ledger is strictly append-only. Modification (UPDATE or DELETE) is prohibited by cryptographic governance.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_modification();

-- ------------------------------------------------------------------------
-- 8. Row-Level Security (RLS) Configuration
-- Non-negotiable: Admins CANNOT view document contents unless explicitly granted!
-- ------------------------------------------------------------------------
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_grants ENABLE ROW LEVEL SECURITY;

-- Documents RLS Policy:
-- Owner has full control.
-- Grantees can view document records ONLY if they have an ACTIVE, unexpired grant with download limits intact.
-- Administrators DO NOT have implicit read/write access.
CREATE POLICY document_owner_full_access ON documents
    FOR ALL
    USING (owner_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY document_grantee_read_access ON documents
    FOR SELECT
    USING (
        id IN (
            SELECT document_id
            FROM access_grants
            WHERE grantee_id = current_setting('app.current_user_id', true)::uuid
              AND status = 'ACTIVE'
              AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
              AND (max_downloads IS NULL OR download_count < max_downloads)
        )
    );

-- Access Grants RLS Policy:
-- Document Owner can manage grants on their documents.
-- Grantee can inspect their own grants.
CREATE POLICY grant_owner_manage ON access_grants
    FOR ALL
    USING (
        document_id IN (
            SELECT id FROM documents WHERE owner_id = current_setting('app.current_user_id', true)::uuid
        )
    );

CREATE POLICY grant_grantee_view ON access_grants
    FOR SELECT
    USING (grantee_id = current_setting('app.current_user_id', true)::uuid);
