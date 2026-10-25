import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Text
from backend.app.models.user import Base

class VerificationCode(Base):
    __tablename__ = "verification_codes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), index=True, nullable=False)
    code = Column(String(16), nullable=False)
    purpose = Column(String(32), nullable=False)  # REGISTRATION, PASSWORD_RESET
    temp_payload = Column(Text, nullable=True)     # Optional JSON payload (e.g. registration details)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
