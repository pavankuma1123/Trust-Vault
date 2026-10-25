import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from backend.app.models.user import Base

class AccessGrant(Base):
    __tablename__ = "access_grants"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    grantee_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    granted_by = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    permission = Column(String(16), default="READ", nullable=False)  # READ, EDIT
    status = Column(String(16), default="ACTIVE", nullable=False, index=True)  # ACTIVE, REVOKED, EXPIRED
    download_count = Column(Integer, default=0, nullable=False)
    max_downloads = Column(Integer, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("document_id", "grantee_id", name="uq_doc_grantee"),
    )

    document = relationship("Document", back_populates="grants")
    grantee = relationship("User", foreign_keys=[grantee_id], back_populates="grants_received")
    granter = relationship("User", foreign_keys=[granted_by], back_populates="grants_issued")
