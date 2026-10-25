import os
import uuid
from pathlib import Path
from typing import Tuple
from backend.app.core.config import settings
from backend.app.core.crypto import (
    derive_kek,
    generate_dek,
    encrypt_dek,
    decrypt_dek,
    encrypt_payload,
    decrypt_payload,
)

class VaultStorageService:
    def __init__(self):
        self.storage_dir: Path = settings.VAULT_STORAGE_PATH
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.master_kek = derive_kek(settings.MASTER_KEK)

    def store_document(self, plaintext_bytes: bytes) -> Tuple[str, str, str]:
        """
        Envelope Encryption Pipeline:
        1. Generate per-document random 256-bit DEK
        2. Encrypt DEK under Master KEK (AES-256-GCM)
        3. Encrypt document plaintext with DEK (AES-256-GCM)
        4. Write ciphertext to private disk under content-addressed UUID key
        Returns: (storage_key, encrypted_dek_b64, dek_nonce_b64)
        """
        # 1. DEK generation
        dek = generate_dek()
        
        # 2. Encrypt DEK
        encrypted_dek_b64, dek_nonce_b64 = encrypt_dek(dek, self.master_kek)
        
        # 3. Encrypt document payload
        payload_nonce, ciphertext = encrypt_payload(plaintext_bytes, dek)
        
        # 4. Content-addressed isolated UUID object key
        storage_key = f"{uuid.uuid4()}.enc"
        file_path = self.storage_dir / storage_key
        
        # Store payload_nonce (12 bytes) + ciphertext_and_tag
        with open(file_path, "wb") as f:
            f.write(payload_nonce + ciphertext)
            
        return storage_key, encrypted_dek_b64, dek_nonce_b64

    def retrieve_document(self, storage_key: str, encrypted_dek_b64: str, dek_nonce_b64: str) -> bytes:
        """
        Envelope Decryption Pipeline:
        1. Decrypt DEK using Master KEK
        2. Read payload nonce & ciphertext from private disk
        3. Decrypt document bytes and verify AES-GCM tag
        Returns: decrypted plaintext bytes
        """
        file_path = self.storage_dir / storage_key
        if not file_path.exists():
            raise FileNotFoundError(f"Blob storage key {storage_key} not found on disk.")
            
        # 1. Decrypt DEK
        dek = decrypt_dek(encrypted_dek_b64, dek_nonce_b64, self.master_kek)
        
        # 2. Read stored payload nonce + ciphertext
        with open(file_path, "rb") as f:
            raw_blob = f.read()
            
        payload_nonce = raw_blob[:12]
        ciphertext = raw_blob[12:]
        
        # 3. Authenticated AES-GCM Decryption
        plaintext = decrypt_payload(ciphertext, payload_nonce, dek)
        return plaintext

    def delete_document(self, storage_key: str) -> bool:
        file_path = self.storage_dir / storage_key
        if file_path.exists():
            file_path.unlink()
            return True
        return False

storage_service = VaultStorageService()
