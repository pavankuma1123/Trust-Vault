import os
from pathlib import Path
from pydantic import BaseModel

is_vercel = os.getenv("VERCEL", "").strip().lower() in ("1", "true")

class Settings(BaseModel):
    PROJECT_NAME: str = "TrustVault"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Cryptographic Configuration
    SECRET_KEY: str = os.getenv("SECRET_KEY", "trustvault_super_secret_jwt_signing_key_32bytes_min!")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    
    # Envelope Encryption Master KEK (32-byte hex or string)
    MASTER_KEK: str = os.getenv("MASTER_KEK", "trustvault_master_key_encryption_key_2026_aes256gcm")
    
    # Storage settings: uses /tmp on Vercel serverless environment where root is read-only
    VAULT_STORAGE_PATH: Path = Path("/tmp/vault_blobs" if is_vercel else os.getenv("VAULT_STORAGE_PATH", "backend/vault_blobs"))
    MAX_PAYLOAD_SIZE: int = 25 * 1024 * 1024  # 25 MB max
    
    # Database URL: defaults to /tmp SQLite on Vercel, local SQLite locally, or external PostgreSQL
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:////tmp/trustvault.db" if is_vercel else "sqlite:///./trustvault.db")

settings = Settings()
try:
    settings.VAULT_STORAGE_PATH.mkdir(parents=True, exist_ok=True)
except Exception:
    pass
