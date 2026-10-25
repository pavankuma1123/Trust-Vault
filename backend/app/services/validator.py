import unicodedata
import re
from typing import Tuple
from backend.app.core.exceptions import InvalidFileSignatureException
from backend.app.core.crypto import compute_sha256

# Magic byte signatures
MAGIC_SIGNATURES = {
    "pdf": [b"%PDF-"],
    "png": [b"\x89PNG\r\n\x1a\n"],
    "jpeg": [b"\xff\xd8\xff"],
    "docx": [b"PK\x03\x04"],  # ZIP format used by docx/xlsx/pptx
}

# Dangerous executable magic headers that must be quarantined/rejected
EXECUTABLE_MAGIC = [
    (b"MZ", "DOS/Windows Executable (PE)"),
    (b"\x7fELF", "Linux ELF Executable"),
    (b"\xfe\xed\xfa\xce", "Mach-O 32-bit"),
    (b"\xfe\xed\xfa\xcf", "Mach-O 64-bit"),
    (b"\xce\xfa\xed\xfe", "Mach-O reverse byte-order"),
    (b"\xcf\xfa\xed\xfe", "Mach-O reverse byte-order"),
    (b"\xca\xfe\xba\xbe", "Java Bytecode / Mach-O fat binary"),
    (b"#!", "Shell script"),
]

DISALLOWED_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".sh", ".ps1", ".vbs", ".scr", ".pif",
    ".dll", ".com", ".msi", ".jar", ".app", ".bin", ".reg"
}

def sanitize_filename(filename: str) -> str:
    """
    Sanitizes and normalizes filename:
    1. Unicode normalization (NFKC)
    2. Strips directory traversal components (../, ..\\, slashes, null bytes)
    3. Strips disallowed executable extensions
    """
    # Unicode normalize
    normalized = unicodedata.normalize("NFKC", filename)
    
    # Strip null bytes and control chars
    cleaned = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", normalized)
    
    # Remove path traversal and directory separators
    cleaned = cleaned.replace("\\", "/").split("/")[-1]
    cleaned = re.sub(r"^\.+", "", cleaned)  # strip leading dots
    
    # Check extension
    lower_name = cleaned.lower()
    for ext in DISALLOWED_EXTENSIONS:
        if lower_name.endswith(ext):
            cleaned = cleaned[: -len(ext)] + ".quarantine"
            
    if not cleaned or cleaned == ".quarantine":
        cleaned = "unnamed_document.bin"
        
    return cleaned

def validate_magic_bytes(data: bytes, original_filename: str) -> Tuple[str, str]:
    """
    Performs binary-level magic-byte sniffing.
    Rejects disguised polyglots and executable binaries.
    Returns (detected_mime_type, detected_extension).
    """
    if len(data) == 0:
        raise InvalidFileSignatureException("Uploaded payload is empty (0 bytes).")

    # 1. Check for executable signatures (Polyglot / Trojan defense)
    for signature, desc in EXECUTABLE_MAGIC:
        if data.startswith(signature):
            raise InvalidFileSignatureException(
                f"Binary signature inspection rejected file: {desc} detected. Executables are forbidden."
            )

    # Check for polyglot web script injection in text headers
    head_1024 = data[:1024].lower()
    if b"<script" in head_1024 or b"<?php" in head_1024 or b"eval(" in head_1024:
        raise InvalidFileSignatureException(
            "Embedded executable script payload detected in document header. Polyglots are quarantined."
        )

    # 2. Match against legitimate document signatures
    for mime_type, signatures in MAGIC_SIGNATURES.items():
        for sig in signatures:
            if data.startswith(sig):
                if mime_type == "pdf":
                    return "application/pdf", ".pdf"
                elif mime_type == "png":
                    return "image/png", ".png"
                elif mime_type == "jpeg":
                    return "image/jpeg", ".jpg"
                elif mime_type == "docx":
                    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"

    # 3. Text/CSV check: inspect for valid UTF-8 without null bytes
    try:
        decoded = data[:4096].decode("utf-8")
        if "\x00" not in decoded:
            return "text/plain", ".txt"
    except UnicodeDecodeError:
        pass

    # Generic binary fallback if not executable
    return "application/octet-stream", ".bin"

def inspect_and_checksum_payload(file_bytes: bytes, filename: str) -> Tuple[str, str, str, str]:
    """
    Full upload validation pipeline:
    - Magic-byte sniffing
    - Dangerous extension sanitization
    - SHA-256 checksum computation
    Returns: (sanitized_filename, mime_type, extension, sha256_checksum)
    """
    sanitized_name = sanitize_filename(filename)
    mime_type, ext = validate_magic_bytes(file_bytes, sanitized_name)
    checksum = compute_sha256(file_bytes)
    return sanitized_name, mime_type, ext, checksum
