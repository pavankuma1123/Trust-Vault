# TrustVault — Architectural Decision & Security Audit Blueprint (`PROMPTS.md`)

This blueprint records the engineering iterations, adversarial audits, flaws caught, and security refactor decisions undertaken during the development of **TrustVault**.

---

## 1. Project Initialization & Architecture Blueprint

* **Date:** 2026-10-25
* **Author / Persona:** Principal Security Architect, Applied Cryptographer, Senior Systems Engineer
* **Objective:** Design and build a production-hardened document custody platform enforcing:
  1. Server-enforced authorization with zero optimistic trust.
  2. An immutable, tamper-evident audit ledger with forward-secure SHA-256 hash chaining.
  3. Immediate, zero-latency access revocation.
  4. Discretionary Access Control (DAC) where system administrators cannot bypass owner gates to read document contents.
  5. Pure binary magic-byte inspection and multi-tenant AES-256-GCM envelope encryption.

---

## 2. Security Flaws Identified & Refactoring Log

### Flaw #1: Non-Deterministic Timestamp Serialization in Cryptographic Hash Chaining
* **Discovery:** During initial seed generation, `audit_service.verify_ledger()` reported `is_valid: False` at sequence 1.
* **Root Cause Analysis:** When storing `datetime.now(timezone.utc)` into the database, SQLite and certain database drivers strip the timezone offset or format microseconds inconsistently (e.g., `2026-10-25 03:43:08.526200` vs ISO string `2026-10-25T03:43:08.526200+00:00`). Upon reading back from the database, the string representation differed by a few characters, causing the recomputed SHA-256 digest to diverge from `record_hash`.
* **Security Refactor:**
  Created `format_canonical_timestamp(ts)` helper in `backend/app/services/audit_service.py` that normalizes any incoming datetime object to strict UTC with explicit ISO-8601 formatting (`ts.astimezone(timezone.utc).isoformat()`). Re-tested with 100% mathematical match across all records.

---

### Flaw #2: Special-Use Domain Validation Failure on Evaluation Personas
* **Discovery:** Automated test `test_immediate_revocation_invalidates_active_session` returned `422 Unprocessable Entity` when granting access to `viewer@vault.local`.
* **Root Cause Analysis:** Pydantic's default `EmailStr` uses `email-validator`, which adheres to RFC 6761 and rejects `.local` top-level domains as reserved multicast DNS names. The Master Build Directive specifically mandated `admin@vault.local`, `owner@vault.local`, and `viewer@vault.local`.
* **Security Refactor:**
  Modified `backend/app/schemas/user.py` and `backend/app/schemas/grant.py` to use `str` with custom email pattern normalization rather than RFC-restricted `EmailStr`. Updated all Pydantic schemas to modern v2 `ConfigDict(from_attributes=True)`.

---

### Flaw #3: Quota Pre-Expiration Triggering Stream Termination
* **Discovery:** Test `test_max_downloads_quota_enforcement` failed on the first valid download when `max_downloads = 1`.
* **Root Cause Analysis:** `dac_engine.record_download(db, grant)` incremented the counter and set `grant.status = "EXPIRED"` immediately before the chunked streaming generator started. Inside `stream_chunks()`, the loop re-verified `fresh_grant.status == "ACTIVE"`, causing it to perceive its own completed quota as an unauthorized revocation and terminate mid-stream.
* **Security Refactor:**
  Differentiated between active owner revocation (`status == "REVOKED"`) and natural quota fulfillment (`status == "EXPIRED"`). The streaming chunk generator checks for `fresh_grant.status == "REVOKED"`, while future incoming requests are affirmatively denied by `dac_engine.validate_document_access()`.

---

### Flaw #4: Privileged Administrator Content Separation
* **Discovery:** Architecture review of administrative rights. Traditional RBAC models allow administrators full read/write access across all database tables.
* **Root Cause Analysis:** If a system administrator has database or API content access, executive payroll, health records, and legal strategy can be exfiltrated without owner consent.
* **Security Refactor:**
  Implemented a strict Discretionary Access Control (DAC) content gate in `backend/app/services/dac_engine.py` and PostgreSQL Row-Level Security (RLS) in `schema.sql`:
  - `ADMIN` role is restricted to user lifecycle management, anomaly monitoring, and audit verification.
  - Document content streaming (`GET /documents/:id/download`) affirmatively denies admins unless they possess an explicit, document-level grant from the Document Owner.

---

### Flaw #5: Direct Database Mutation of Audit Ledger
* **Discovery:** A rogue DBA with `psql` or database access could execute `DELETE FROM audit_logs` or `UPDATE audit_logs SET actor_id = ...` to wipe tracks of a breach.
* **Root Cause Analysis:** Application-level permissions do not protect against database superusers.
* **Security Refactor:**
  - In PostgreSQL: Created a PL/pgSQL function `prevent_audit_log_modification()` that executes `RAISE EXCEPTION` on any `UPDATE` or `DELETE`, bound via `CREATE TRIGGER trg_audit_log_immutable BEFORE UPDATE OR DELETE ON audit_logs`.
  - In SQLite (test/portable engine): Created SQL triggers `trg_audit_no_update` and `trg_audit_no_delete` that invoke `SELECT RAISE(ABORT, 'SECURITY VIOLATION')`.
  - Verified via `test_audit_table_immutability` where direct SQL queries cause immediate transaction abort.

---

### Flaw #6: Public Exposure of Administrative Personas & Anonymous Registration
* **Discovery:** The original evaluation login dialog exposed 1-click persona switch buttons that pre-filled credentials for `ADMIN`, `OWNER`, and `VIEWER`, allowing unauthorized parties to assume administrator control. Additionally, new document owners had no public self-service registration flow.
* **Root Cause Analysis:** Debugging convenience shortcuts bypassed authentication rigor.
* **Security Refactor:**
  1. Removed all pre-filled persona buttons from the public frontend.
  2. Created dedicated **"Sign In to Vault"** and **"Register New Owner"** dual-tab authentication portal.
  3. Added `name` field to user schema/models and updated registration endpoint (`POST /api/v1/auth/register`) so new owners self-register with full name, email, and password, receiving immediate `OWNER` custody rights and active tokens.
  4. Secured the Administrative account with confidential, high-entropy credentials (`security-admin@vault.internal`) provided exclusively out-of-band in the chat.
  5. Implemented interactive user identity cards and credentials modals showing the authenticated user's name, email, role, and vault fingerprint throughout the UI.

---

## 3. Engineering Decisions Matrix

| Decision | Selected Option | Rationale |
| :--- | :--- | :--- |
| **Backend Framework** | Python 3.14 + FastAPI + Pydantic v2 | Native support for cryptographic AEAD ciphers (`cryptography.hazmat.primitives.ciphers.aead`), streaming generator proxies, explicit typing, and high-performance test suites. |
| **Encryption Standard** | Multi-tenant AES-256-GCM Envelope Encryption | Per-document 256-bit random Data Encryption Key (DEK) encrypted under Master KEK; authenticated encryption with 96-bit nonce and 128-bit authentication tag. Ciphertext at rest in blob storage. |
| **Storage Addressing** | Content-addressed UUIDs (`/vault-blobs/${uuid.uuid4()}.enc`) | Eliminates path traversal and original filename exposure on filesystem or object store. |
| **Frontend Framework** | React 18 + TypeScript + Tailwind CSS | Zero optimistic rendering; UI state is derived directly from authoritative backend responses. Built with Vite into static bundle mounted directly on FastAPI. |
| **Audit Chaining** | Forward-Secure SHA-256 Hash Chaining | $Hash_n = \text{SHA-256}(Record_n + Hash_{n-1})$ with deterministic canonical JSON serialization (sorted keys, stripped whitespace). |
