from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict

class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sequence_number: int
    timestamp: datetime
    event_type: str
    actor_id: Optional[str]
    actor_email: Optional[str] = None
    actor_ip: str
    target_document_id: Optional[str]
    details: Dict[str, Any]
    previous_hash: str
    record_hash: str

class LedgerVerifyResponse(BaseModel):
    is_valid: bool
    total_records: int
    verified_sequences: int
    latest_record_hash: str
    genesis_hash: str
    verification_time_ms: float
    error_detail: Optional[str] = None

class PermissionDelta(BaseModel):
    id: str
    timestamp: datetime
    granter: str
    grantee: str
    document_title: str
    permission: str
    action: str  # GRANTED, REVOKED

class AnomalyAlert(BaseModel):
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW
    alert_type: str
    description: str
    actor_ip: str
    timestamp: datetime
    event_count: int

class TelemetryOverviewResponse(BaseModel):
    total_documents: int
    total_active_grants: int
    total_revoked_grants: int
    total_audit_events: int
    refused_attempts_count: int
    ledger_integrity: bool
    permission_deltas: List[PermissionDelta]
    high_risk_anomalies: List[AnomalyAlert]
