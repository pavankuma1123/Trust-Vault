export type Role = 'ADMIN' | 'OWNER' | 'VIEWER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface Document {
  id: string;
  owner_id: string;
  title: string;
  category: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  sha256_checksum: string;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
  is_owner: boolean;
}

export interface AccessGrant {
  id: string;
  document_id: string;
  grantee_id: string;
  grantee_email?: string;
  granted_by: string;
  permission: 'READ' | 'EDIT';
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  download_count: number;
  max_downloads?: number | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  sequence_number: number;
  timestamp: string;
  event_type: string;
  actor_id?: string | null;
  actor_email?: string | null;
  actor_ip: string;
  target_document_id?: string | null;
  details: Record<string, any>;
  previous_hash: string;
  record_hash: string;
}

export interface LedgerVerification {
  is_valid: boolean;
  total_records: number;
  verified_sequences: number;
  latest_record_hash: string;
  genesis_hash: string;
  verification_time_ms: number;
  error_detail?: string | null;
}

export interface PermissionDelta {
  id: string;
  timestamp: string;
  granter: string;
  grantee: string;
  document_title: string;
  permission: string;
  action: 'GRANTED' | 'REVOKED';
}

export interface AnomalyAlert {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  alert_type: string;
  description: string;
  actor_ip: string;
  timestamp: string;
  event_count: number;
}

export interface TelemetryOverview {
  total_documents: number;
  total_active_grants: number;
  total_revoked_grants: number;
  total_audit_events: number;
  refused_attempts_count: number;
  ledger_integrity: boolean;
  permission_deltas: PermissionDelta[];
  high_risk_anomalies: AnomalyAlert[];
}
