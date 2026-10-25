import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), default="Vault User", nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(32), default="OWNER", nullable=False)  # ADMIN, OWNER, VIEWER
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    documents = relationship("Document", back_populates="owner", cascade="all, delete-orphan")
    grants_received = relationship("AccessGrant", foreign_keys="AccessGrant.grantee_id", back_populates="grantee")
    grants_issued = relationship("AccessGrant", foreign_keys="AccessGrant.granted_by", back_populates="granter")
