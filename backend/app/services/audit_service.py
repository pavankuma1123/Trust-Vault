import json
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import desc
from backend.app.models.audit import AuditLog
from backend.app.core.crypto import (
    GENESIS_HASH,
    canonicalize_record,
    compute_record_hash,
)

def format_canonical_timestamp(ts: Any) -> str:
    """
    Guarantees deterministic UTC ISO-8601 formatting across databases and drivers.
    """
    if isinstance(ts, str):
        # Already string, ensure valid format
        return ts
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        else:
            ts = ts.astimezone(timezone.utc)
        return ts.isoformat()
    return str(ts)

class AuditLedgerService:
    def log_event(
        self,
        db: Session,
        event_type: str,
        actor_ip: str,
        actor_id: Optional[str] = None,
        target_document_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        """
        Cryptographic forward-secure append-only logging:
        Hash_n = SHA-256(Record_n + Hash_{n-1})
        """
        details = details or {}
        now = datetime.now(timezone.utc)
        timestamp_str = format_canonical_timestamp(now)
        
        # Query latest sequence and hash with highest sequence
        latest = db.query(AuditLog).order_by(desc(AuditLog.sequence_number)).first()
        if latest is None:
            seq = 1
            prev_hash = GENESIS_HASH
        else:
            seq = latest.sequence_number + 1
            prev_hash = latest.record_hash

        canonical_payload = {
            "sequence_number": seq,
            "timestamp": timestamp_str,
            "event_type": event_type,
            "actor_id": actor_id or "",
            "actor_ip": actor_ip,
            "target_document_id": target_document_id or "",
            "details": details,
        }

        canonical_record_str = canonicalize_record(canonical_payload)
        rec_hash = compute_record_hash(canonical_record_str, prev_hash)

        log_entry = AuditLog(
            sequence_number=seq,
            timestamp=now,
            event_type=event_type,
            actor_id=actor_id,
            actor_ip=actor_ip,
            target_document_id=target_document_id,
            details=json.dumps(details),
            previous_hash=prev_hash,
            record_hash=rec_hash,
        )

        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        return log_entry

    def verify_ledger(self, db: Session) -> Dict[str, Any]:
        """
        Traverses the entire cryptographic ledger from sequence 1 to N,
        recomputing all SHA-256 links and checking for any bit manipulation.
        """
        start_time = time.perf_counter()
        logs: List[AuditLog] = db.query(AuditLog).order_by(AuditLog.sequence_number.asc()).all()
        
        if not logs:
            elapsed = (time.perf_counter() - start_time) * 1000
            return {
                "is_valid": True,
                "total_records": 0,
                "verified_sequences": 0,
                "latest_record_hash": GENESIS_HASH,
                "genesis_hash": GENESIS_HASH,
                "verification_time_ms": round(elapsed, 3),
                "error_detail": None,
            }

        prev_hash = GENESIS_HASH
        for idx, entry in enumerate(logs):
            expected_seq = idx + 1
            if entry.sequence_number != expected_seq:
                elapsed = (time.perf_counter() - start_time) * 1000
                return {
                    "is_valid": False,
                    "total_records": len(logs),
                    "verified_sequences": idx,
                    "latest_record_hash": entry.record_hash,
                    "genesis_hash": GENESIS_HASH,
                    "verification_time_ms": round(elapsed, 3),
                    "error_detail": f"Broken sequence! Expected {expected_seq}, found {entry.sequence_number}.",
                }

            if entry.previous_hash != prev_hash:
                elapsed = (time.perf_counter() - start_time) * 1000
                return {
                    "is_valid": False,
                    "total_records": len(logs),
                    "verified_sequences": idx,
                    "latest_record_hash": entry.record_hash,
                    "genesis_hash": GENESIS_HASH,
                    "verification_time_ms": round(elapsed, 3),
                    "error_detail": f"Broken chain at sequence {entry.sequence_number}! Stored previous_hash does not match expected {prev_hash}.",
                }

            # Reconstruct canonical payload
            try:
                details_obj = json.loads(entry.details)
            except Exception:
                details_obj = {}

            canonical_payload = {
                "sequence_number": entry.sequence_number,
                "timestamp": format_canonical_timestamp(entry.timestamp),
                "event_type": entry.event_type,
                "actor_id": entry.actor_id or "",
                "actor_ip": entry.actor_ip,
                "target_document_id": entry.target_document_id or "",
                "details": details_obj,
            }
            canonical_str = canonicalize_record(canonical_payload)
            expected_hash = compute_record_hash(canonical_str, entry.previous_hash)

            if expected_hash != entry.record_hash:
                elapsed = (time.perf_counter() - start_time) * 1000
                return {
                    "is_valid": False,
                    "total_records": len(logs),
                    "verified_sequences": idx,
                    "latest_record_hash": entry.record_hash,
                    "genesis_hash": GENESIS_HASH,
                    "verification_time_ms": round(elapsed, 3),
                    "error_detail": f"Cryptographic integrity failed at sequence {entry.sequence_number}! Recomputed hash {expected_hash} != stored {entry.record_hash}.",
                }

            prev_hash = entry.record_hash

        elapsed = (time.perf_counter() - start_time) * 1000
        return {
            "is_valid": True,
            "total_records": len(logs),
            "verified_sequences": len(logs),
            "latest_record_hash": logs[-1].record_hash,
            "genesis_hash": GENESIS_HASH,
            "verification_time_ms": round(elapsed, 3),
            "error_detail": None,
        }

audit_service = AuditLedgerService()
