import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, Text, Index
from backend.app.models.user import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sequence_number = Column(Integer, unique=True, nullable=False, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    event_type = Column(String(64), nullable=False, index=True)
    actor_id = Column(String(36), nullable=True, index=True)
    actor_ip = Column(String(45), nullable=False)
    target_document_id = Column(String(36), nullable=True, index=True)
    details = Column(Text, default="{}", nullable=False)
    previous_hash = Column(String(64), nullable=False)
    record_hash = Column(String(64), nullable=False)
