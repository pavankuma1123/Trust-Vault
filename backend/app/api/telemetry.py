import json
from datetime import datetime, timedelta, timezone
from typing import List, Dict
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from backend.app.db.session import get_db
from backend.app.api.deps import get_current_admin
from backend.app.models.user import User
from backend.app.models.document import Document
from backend.app.models.grant import AccessGrant
from backend.app.models.audit import AuditLog
from backend.app.schemas.audit import TelemetryOverviewResponse, PermissionDelta, AnomalyAlert
from backend.app.services.audit_service import audit_service

router = APIRouter(prefix="/telemetry", tags=["Administrative Telemetry"])

@router.get("/overview", response_model=TelemetryOverviewResponse)
def get_telemetry_overview(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    total_docs = db.query(Document).count()
    active_grants = db.query(AccessGrant).filter(AccessGrant.status == "ACTIVE").count()
    revoked_grants = db.query(AccessGrant).filter(AccessGrant.status == "REVOKED").count()
    total_audits = db.query(AuditLog).count()
    refused_attempts = db.query(AuditLog).filter(AuditLog.event_type == "ACCESS_REFUSED").count()

    # 1. Global Permission Delta Graph / Timeline
    grant_events = db.query(AuditLog).filter(
        AuditLog.event_type.in_(["ACCESS_GRANTED", "ACCESS_REVOKED"])
    ).order_by(desc(AuditLog.sequence_number)).limit(20).all()

    permission_deltas: List[PermissionDelta] = []
    for ge in grant_events:
        try:
            d = json.loads(ge.details)
        except Exception:
            d = {}
        
        granter_email = "System/Owner"
        if ge.actor_id:
            granter_user = db.query(User).filter(User.id == ge.actor_id).first()
            if granter_user:
                granter_email = granter_user.email
                
        grantee_email = d.get("grantee_email") or d.get("revoked_grantee_email") or "Unknown"
        doc_title = "Document"
        if ge.target_document_id:
            doc = db.query(Document).filter(Document.id == ge.target_document_id).first()
            if doc:
                doc_title = doc.title

        permission_deltas.append(PermissionDelta(
            id=ge.id,
            timestamp=ge.timestamp,
            granter=granter_email,
            grantee=grantee_email,
            document_title=doc_title,
            permission=d.get("permission", "REVOKED"),
            action="GRANTED" if ge.event_type == "ACCESS_GRANTED" else "REVOKED"
        ))

    # 2. High-Risk Access Attempt Anomaly Detection (Burst Refusals & Suspicious Activity)
    now = datetime.now(timezone.utc)
    one_hour_ago = now - timedelta(hours=1)
    
    recent_refusals = db.query(AuditLog).filter(
        AuditLog.event_type == "ACCESS_REFUSED",
        AuditLog.timestamp >= one_hour_ago
    ).all()

    ip_refusal_counts: Dict[str, int] = {}
    ip_latest_time: Dict[str, datetime] = {}
    for r in recent_refusals:
        ip = r.actor_ip
        ip_refusal_counts[ip] = ip_refusal_counts.get(ip, 0) + 1
        ip_latest_time[ip] = r.timestamp

    anomalies: List[AnomalyAlert] = []
    for ip, count in ip_refusal_counts.items():
        if count >= 3:
            severity = "CRITICAL" if count >= 5 else "HIGH"
            anomalies.append(AnomalyAlert(
                severity=severity,
                alert_type="BURST_ACCESS_REFUSAL_ATTACK",
                description=f"Adversarial burst detected: {count} access refusals from IP {ip} within the last hour. Possible IDOR enumeration or token probing.",
                actor_ip=ip,
                timestamp=ip_latest_time[ip],
                event_count=count
            ))

    # If no recent burst anomalies found, check historical high-risk patterns
    if not anomalies and refused_attempts > 0:
        latest_refusal = db.query(AuditLog).filter(AuditLog.event_type == "ACCESS_REFUSED").order_by(desc(AuditLog.sequence_number)).first()
        if latest_refusal:
            anomalies.append(AnomalyAlert(
                severity="MEDIUM",
                alert_type="PREVIOUS_REFUSAL_RECORDED",
                description=f"Targeted refusal recorded on document {latest_refusal.target_document_id or 'unknown'}. Caller blocked.",
                actor_ip=latest_refusal.actor_ip,
                timestamp=latest_refusal.timestamp,
                event_count=1
            ))

    # 3. Live ledger integrity verification status
    verify_res = audit_service.verify_ledger(db)

    return TelemetryOverviewResponse(
        total_documents=total_docs,
        total_active_grants=active_grants,
        total_revoked_grants=revoked_grants,
        total_audit_events=total_audits,
        refused_attempts_count=refused_attempts,
        ledger_integrity=verify_res["is_valid"],
        permission_deltas=permission_deltas,
        high_risk_anomalies=anomalies
    )
