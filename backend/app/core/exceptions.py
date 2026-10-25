from typing import Optional, Dict, Any
from fastapi import HTTPException, status

class SecurityRefusalException(HTTPException):
    """
    Raised when an authorization check affirmatively refuses access.
    Default status_code is 404 to satisfy Core Tenet 1:
    Prevent document existence enumeration for unauthorized callers.
    """
    def __init__(
        self,
        detail: str = "Document not found or access refused",
        status_code: int = status.HTTP_404_NOT_FOUND,
        document_id: Optional[str] = None,
        reason: Optional[str] = None
    ):
        super().__init__(status_code=status_code, detail=detail)
        self.document_id = document_id
        self.reason = reason or detail

class ImmutabilityViolationException(HTTPException):
    def __init__(self, detail: str = "SECURITY VIOLATION: Audit log records are strictly immutable."):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)

class InvalidFileSignatureException(HTTPException):
    def __init__(self, detail: str = "File failed magic-byte binary signature validation. Executables and polyglots are quarantined."):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
