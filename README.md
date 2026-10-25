# TrustVault — Cryptographically Enforced Secure Document Exchange

TrustVault is a production-hardened document custody and sharing platform where an unauthorized party cannot reach a document through any route, every interaction (including refused attempts) is recorded in a tamper-evident audit ledger, and access revocation takes effect instantly across all channels.

---

## 1. System Architecture & Core Tenets

```
                   +--------------------------------------------+
                   |   React 18 + TypeScript + Tailwind UI      |
                   |   (Zero Optimistic Permission Rendering)   |
                   +---------------------+----------------------+
                                         | Authenticated HTTPS / Proxy
                                         v
+-------------------------------------------------------------------------------+
|                      TrustVault FastAPI Security Engine                       |
|                                                                               |
|  +------------------------+  +------------------------+  +-----------------+  |
|  | Magic-Byte Sniffer     |  | Discretionary Access   |  | Cryptographic   |  |
|  | - PDF, PNG, JPEG, DOCX |  | Control (DAC) Engine   |  | Ledger Service  |  |
|  | - Quarantines PE/ELF   |  | - Prevents Enumeration |  | - SHA-256 Chain |  |
|  | - Sanitizes Traversal  |  | - Admin Content Gate   |  | - Immutability  |  |
|  +------------------------+  +------------------------+  +-----------------+  |
|                                                                               |
|  +-------------------------------------------------------------------------+  |
|  | Multi-Tenant Envelope Encryption Engine (AES-256-GCM)                   |  |
|  | - 256-bit random DEK per document                                       |  |
|  | - Encrypted under Master Key Encryption Key (HKDF-SHA256)               |  |
|  | - Zero direct storage leaks; strictly chunked in-memory proxy streaming |  |
|  +-------------------------------------------------------------------------+  |
+---------------------+-----------------------------------+---------------------+
                      |                                   |
                      v                                   v
        +---------------------------+       +---------------------------+
        | Private Vault Blob Store  |       | PostgreSQL / SQLite DB    |
        | - Content-addressed UUIDs |       | - Foreign Keys & RLS      |
        | - /vault-blobs/${uuid}.enc|       | - Immutability Triggers   |
        | - AES-GCM Ciphertext only |       |   blocking UPDATE/DELETE  |
        +---------------------------+       +---------------------------+
```

### Three Non-Negotiable Tenets
1. **Server-Enforced Authorization Everywhere:**
   - Client UI state is completely untrusted. The database/storage layer is never reached without affirmative validation.
   - Insecure Direct Object References (IDOR) return `404 Not Found` rather than `403 Forbidden` for documents the requester has no grant to see (neutralizing document existence enumeration).
2. **Immutable, Provable Audit Trails:**
   - Every read, write, preview, upload, download, metadata modification, grant delegation, grant revocation, and **refused access attempt (401/403/404)** is recorded.
   - Database-level triggers abort any `UPDATE` or `DELETE` on the `audit_logs` table with an exception.
   - Cryptographic forward-secure append-only SHA-256 hash chaining:
     $$\text{Hash}_n = \text{SHA-256}(\text{CanonicalRecord}_n \mathbin{\Vert} \text{Hash}_{n-1})$$
3. **Immediate, Zero-Latency Revocation:**
   - Access revocation terminates access instantly (0ms latency).
   - Downloads stream through an authenticated streaming proxy that validates active grants synchronously at packet egress and across 256KB transmission chunks.

---

## 2. Authentication & Credentials Architecture

### A. Public Owner Registration & Sign In Portal
- **Owner Self-Registration:** Anyone visiting the portal can click **"Register New Owner"** to create a personal vault account by entering their Full Name, Email, and Password. Registered accounts are immediately granted `OWNER` status with isolated cryptographic keys and envelope encryption custody.
- **Owner Sign In:** Registered owners sign in directly using their email and password.

### B. Confidential Security Administrator Credentials
The Administrator credentials are **strictly confidential and completely removed from the public UI** to prevent unauthorized access or takeover. Only authorized personnel possessing the private credentials can log in as Admin.

* **Admin Username / Email:** `security-admin@vault.internal`
* **Admin Password:** `AdminSecure2026#VaultMasterKey!`
* **Admin Role & Capabilities:** Manages telemetry, monitors burst access refusals, and executes cryptographic ledger verification proofs. (Cannot view document contents without owner grant).

### C. Pre-Seeded Evaluation Accounts
* **Default Vault Owner:** `owner@vault.local` / `OwnerSecretPass123!` (K. Pavan Kumar)
* **Default Auditor / Viewer:** `viewer@vault.local` / `ViewerSecretPass123!` (Viewer)

---

## 3. Quick Start & Execution

### 1. Seed Database & Install Immutability Triggers
```bash
python -m backend.seed
```

### 2. Run Automated Security Test Suite
```bash
python -m pytest backend/tests/test_security_harness.py -v
```

All 8 security tests validate:
- `test_user_cannot_access_unshared_document`: User B attempts access to User A's unshared document $\rightarrow$ `404 Not Found`.
- `test_immediate_revocation_invalidates_active_session`: Owner shares with User B ($200$) $\rightarrow$ Owner revokes $\rightarrow$ immediate re-request returns `404 Not Found` within 0ms.
- `test_admin_cannot_bypass_owner_document_gate`: Admin attempts content download without owner grant $\rightarrow$ `403/404` refusal.
- `test_audit_log_records_refused_attempts`: Refused probe is recorded with IP, timestamp, and target document ID.
- `test_audit_table_immutability`: Database engine aborts direct `UPDATE` or `DELETE` against `audit_logs`.
- `test_magic_byte_sniffing_rejects_disguised_executable`: Executables disguised as PDFs are quarantined.
- `test_max_downloads_quota_enforcement`: Download quota automatically expires grant after limit is reached.
- `test_cryptographic_ledger_verification`: SHA-256 hash chaining mathematically verified from genesis.

### 3. Launch TrustVault Server
```bash
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```
Navigate to `http://localhost:8000` to interact with the full TrustVault React frontend with instant persona switcher!

---

## 4. Deliverables Directory Structure

```text
TrustVault/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py             # Login, token issue, quick persona selector
│   │   │   ├── documents.py        # Upload, SQL-filtered list, streaming proxy
│   │   │   ├── grants.py           # DAC delegation, immediate zero-latency revocation
│   │   │   ├── audit.py            # Audit log inspection & cryptographic verification
│   │   │   └── telemetry.py        # Anomaly bursts, permission delta graph
│   │   ├── core/
│   │   │   ├── config.py           # Master KEK, storage paths, boundaries
│   │   │   ├── crypto.py           # AES-256-GCM Envelope Encryption & SHA-256 chaining
│   │   │   ├── security.py         # Password hashing & JWT verification
│   │   │   └── exceptions.py       # Security refusal & immutability exception boundaries
│   │   ├── db/
│   │   │   ├── session.py          # Session factory & SQLite trigger listener
│   │   │   └── init_db.py          # Table creation & immutability trigger installation
│   │   ├── models/
│   │   │   ├── user.py             # User schema with roles (ADMIN, OWNER, VIEWER)
│   │   │   ├── document.py         # Content-addressed storage keys & encrypted DEKs
│   │   │   ├── grant.py            # DAC grants with quotas, expiry, and status
│   │   │   └── audit.py            # Append-only ledger with previous_hash & record_hash
│   │   ├── schemas/                # Strict Pydantic v2 validation models
│   │   ├── services/
│   │   │   ├── storage.py          # Content-addressed UUID blob storage
│   │   │   ├── validator.py        # Binary magic-byte sniffing & sanitization
│   │   │   ├── audit_service.py    # Forward-secure SHA-256 hash chaining engine
│   │   │   └── dac_engine.py       # Fine-grained authorization & admin gate
│   │   └── main.py                 # FastAPI application with static React bundle
│   ├── tests/
│   │   ├── conftest.py             # Test database setup with engine triggers
│   │   └── test_security_harness.py # 8 automated adversarial security tests
│   ├── vault_blobs/                # AES-256-GCM encrypted ciphertext at rest
│   └── seed.py                     # Initial seed generator with credentials
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx          # Persona switcher & security badges
│   │   │   ├── DocumentList.tsx    # Zero-optimistic document custody explorer
│   │   │   ├── UploadModal.tsx     # Magic-byte check & client SHA-256 preview
│   │   │   ├── ShareModal.tsx      # DAC assignment & 0ms revocation button
│   │   │   ├── AuditLedgerView.tsx # Tamper-evident ledger & verify button
│   │   │   └── TelemetryDashboard.tsx # Global permission delta & burst anomaly alerts
│   │   ├── services/api.ts         # Authenticated API client
│   │   ├── types/index.ts          # Strict TypeScript interface contracts
│   │   ├── App.tsx                 # Core application shell
│   │   └── main.tsx
│   ├── dist/                       # Production-built bundle (Vite)
│   └── package.json
├── schema.sql                      # Production PostgreSQL DDL with RLS & Triggers
├── THREATS.md                      # Adversarial Attack Surface & Defense Matrix
├── PROMPTS.md                      # Blueprint audit & decision log
└── README.md                       # Complete documentation & execution guide
```

---

## 5. Security Documentation Reference
* Complete threat model, attack vectors, and mitigations: see [`THREATS.md`](file:///c:/Pavan/Trust-Vault/THREATS.md).
* Engineering decision log and security refactoring history: see [`PROMPTS.md`](file:///c:/Pavan/Trust-Vault/PROMPTS.md).
* Production PostgreSQL Row-Level Security & Trigger definitions: see [`schema.sql`](file:///c:/Pavan/Trust-Vault/schema.sql).
