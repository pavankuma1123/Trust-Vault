from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class GrantCreate(BaseModel):
    grantee_email: str
    permission: str = "READ"  # READ, EDIT
    max_downloads: Optional[int] = None
    expires_at: Optional[datetime] = None

class GrantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    grantee_id: str
    grantee_email: Optional[str] = None
    granted_by: str
    permission: str
    status: str
    download_count: int
    max_downloads: Optional[int]
    expires_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
