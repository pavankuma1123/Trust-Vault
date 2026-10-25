from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

class DocumentBase(BaseModel):
    title: str
    category: str = "General"

class DocumentCreate(DocumentBase):
    pass

class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None

class DocumentResponse(DocumentBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    original_filename: str
    file_size: int
    mime_type: str
    sha256_checksum: str
    created_at: datetime
    updated_at: datetime
    can_edit: bool = False
    is_owner: bool = False

class DocumentFilter(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    owner_id: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
