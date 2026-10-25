import os
import json
import base64
import hashlib
from typing import Tuple, Dict, Any
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

# Constants
GENESIS_HASH = "0" * 64
SALT_KEK = b"TrustVault_Envelope_Encryption_HKDF_Salt_2026"

def derive_kek(master_secret: str) -> bytes:
    """
    Derives a 256-bit (32-byte) Key Encryption Key (KEK) using HKDF-SHA256.
    """
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=SALT_KEK,
        info=b"TrustVault Master KEK Derivation",
    )
    return hkdf.derive(master_secret.encode("utf-8"))

def generate_dek() -> bytes:
    """
    Generates a cryptographically secure random 256-bit Data Encryption Key (DEK).
    """
    return os.urandom(32)

def encrypt_dek(dek: bytes, kek: bytes) -> Tuple[str, str]:
    """
    Encrypts a document DEK under the KEK using AES-256-GCM.
    Returns (base64_encrypted_dek, base64_nonce).
    """
    nonce = os.urandom(12)  # 96-bit standard GCM nonce
    aesgcm = AESGCM(kek)
    ciphertext = aesgcm.encrypt(nonce, dek, b"TrustVault_DEK_Envelope")
    return (
        base64.b64encode(ciphertext).decode("ascii"),
        base64.b64encode(nonce).decode("ascii")
    )

def decrypt_dek(encrypted_dek_b64: str, nonce_b64: str, kek: bytes) -> bytes:
    """
    Decrypts the document DEK using AES-256-GCM.
    """
    ciphertext = base64.b64decode(encrypted_dek_b64.encode("ascii"))
    nonce = base64.b64decode(nonce_b64.encode("ascii"))
    aesgcm = AESGCM(kek)
    return aesgcm.decrypt(nonce, ciphertext, b"TrustVault_DEK_Envelope")

def encrypt_payload(data: bytes, dek: bytes) -> Tuple[bytes, bytes]:
    """
    Encrypts arbitrary document bytes using AES-256-GCM with the DEK.
    Returns (nonce, ciphertext_and_tag).
    """
    nonce = os.urandom(12)  # 96-bit nonce
    aesgcm = AESGCM(dek)
    ciphertext = aesgcm.encrypt(nonce, data, b"TrustVault_Doc_Payload")
    return nonce, ciphertext

def decrypt_payload(ciphertext: bytes, nonce: bytes, dek: bytes) -> bytes:
    """
    Decrypts document ciphertext using AES-256-GCM with the DEK and authenticates tag.
    """
    aesgcm = AESGCM(dek)
    return aesgcm.decrypt(nonce, ciphertext, b"TrustVault_Doc_Payload")

def compute_sha256(data: bytes) -> str:
    """
    Computes a cryptographic SHA-256 hex digest for data integrity verification.
    """
    hasher = hashlib.sha256()
    hasher.update(data)
    return hasher.hexdigest()

def canonicalize_record(data: Dict[str, Any]) -> str:
    """
    Produces deterministic, canonical JSON string for audit log hash chaining.
    Keys are sorted, whitespace stripped, ensuring tamper-evident reproducibility.
    """
    return json.dumps(data, sort_keys=True, separators=(',', ':'), default=str)

def compute_record_hash(canonical_record: str, previous_hash: str) -> str:
    """
    Forward-secure append-only chaining:
    Hash_n = SHA-256(Record_n + Hash_{n-1})
    """
    hasher = hashlib.sha256()
    hasher.update(canonical_record.encode("utf-8"))
    hasher.update(previous_hash.encode("utf-8"))
    return hasher.hexdigest()
