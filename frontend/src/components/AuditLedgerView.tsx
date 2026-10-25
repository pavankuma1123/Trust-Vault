import React, { useState, useEffect } from 'react';
import { AuditLog, LedgerVerification, User } from '../types';
import { api } from '../services/api';
import { 
  ShieldCheck, ShieldAlert, CheckCircle2, RefreshCw, Hash 
} from 'lucide-react';

interface AuditLedgerViewProps {
  currentUser: User;
}

export const AuditLedgerView: React.FC<AuditLedgerViewProps> = ({ currentUser }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<LedgerVerification | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');

  useEffect(() => {
    loadLedger();
  }, []);

  const loadLedger = async () => {
    try {
      setLoading(true);
      const data = await api.getAuditLedger(100);
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    try {
      setVerifying(true);
      const res = await api.verifyLedger();
      setVerificationResult(res);
      await loadLedger();
    } catch (err: any) {
      alert(`Ledger verification failed: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const filteredLogs = logs.filter(l => 
    filterType === 'ALL' || l.event_type === filterType
  );

  const getBadgeStyle = (eventType: string) => {
    switch (eventType) {
      case 'ACCESS_GRANTED':
        return 'bg-emerald-950 text-emerald-400 border-emerald-800';
      case 'ACCESS_REVOKED':
        return 'bg-amber-950 text-amber-400 border-amber-800';
      case 'ACCESS_REFUSED':
        return 'bg-rose-950 text-rose-400 border-rose-800 font-bold';
      case 'DOCUMENT_UPLOAD':
        return 'bg-cyan-950 text-cyan-400 border-cyan-800';
      case 'DOCUMENT_DOWNLOAD':
        return 'bg-blue-950 text-blue-400 border-blue-800';
      case 'DOCUMENT_DELETE':
        return 'bg-purple-950 text-purple-400 border-purple-800';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Verification CTA */}
      <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Hash className="w-5 h-5 text-cyan-400" />
            Immutable Cryptographic Audit Ledger
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Forward-secure SHA-256 hash chaining (Hash_n = SHA-256(Record_n + Hash_{'{n-1}'})). Database triggers block UPDATE & DELETE.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {currentUser.role === 'ADMIN' && (
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold font-mono flex items-center gap-2 transition-colors shadow-lg shadow-emerald-950 disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              {verifying ? 'Verifying Chain...' : 'Verify Cryptographic Hash Chain'}
            </button>
          )}

          <button
            onClick={loadLedger}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Verification Result Card */}
      {verificationResult && (
        <div className={`p-4 rounded-xl border font-mono text-xs ${
          verificationResult.is_valid
            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
            : 'bg-rose-950/40 border-rose-800 text-rose-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-2 font-bold uppercase tracking-wider">
              {verificationResult.is_valid ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <ShieldAlert className="w-4 h-4 text-rose-400" />}
              {verificationResult.is_valid ? 'Ledger Chain Mathematically Intact' : 'Tamper Detected in Ledger!'}
            </span>
            <span className="text-[10px] text-slate-400">
              Verified {verificationResult.verified_sequences} / {verificationResult.total_records} records in {verificationResult.verification_time_ms}ms
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
            <div>
              <span className="text-slate-500">Genesis Hash: </span>
              <span className="text-slate-400">{verificationResult.genesis_hash.slice(0, 24)}...</span>
            </div>
            <div>
              <span className="text-slate-500">Latest Anchored Hash: </span>
              <span className="text-cyan-400">{verificationResult.latest_record_hash.slice(0, 24)}...</span>
            </div>
          </div>
          {verificationResult.error_detail && (
            <div className="mt-2 p-2 bg-rose-950/80 rounded border border-rose-800 text-rose-300">
              {verificationResult.error_detail}
            </div>
          )}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 text-xs font-mono">
        {['ALL', 'ACCESS_REFUSED', 'ACCESS_GRANTED', 'ACCESS_REVOKED', 'DOCUMENT_DOWNLOAD', 'DOCUMENT_UPLOAD'].map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-3 py-1 rounded-lg border transition-colors ${
              filterType === type
                ? 'bg-slate-800 text-cyan-400 border-slate-700'
                : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Ledger Table */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-3">Seq #</th>
                <th className="p-3">Event Type</th>
                <th className="p-3">Timestamp (UTC)</th>
                <th className="p-3">Actor / IP</th>
                <th className="p-3">Target Doc / Refusal Reason</th>
                <th className="p-3">Cryptographic SHA-256 Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-850/60 transition-colors">
                  <td className="p-3 font-semibold text-cyan-400">#{log.sequence_number}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded border text-[10px] ${getBadgeStyle(log.event_type)}`}>
                      {log.event_type}
                    </span>
                  </td>
                  <td className="p-3 text-slate-400 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <div className="text-slate-200 font-medium">{log.actor_email || 'Anonymous / System'}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{log.actor_ip}</div>
                  </td>
                  <td className="p-3 text-slate-300 max-w-xs">
                    {log.details?.reason ? (
                      <span className="text-rose-400 font-semibold">{log.details.reason}</span>
                    ) : (
                      <span className="text-slate-400 truncate block">
                        {log.details?.title || log.details?.action || log.target_document_id || 'System action'}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-[10px] text-slate-400 space-y-0.5">
                    <div className="truncate max-w-[200px]" title={`Previous: ${log.previous_hash}`}>
                      <span className="text-slate-600">Prev: </span>{log.previous_hash.slice(0, 16)}...
                    </div>
                    <div className="truncate max-w-[200px] text-cyan-400/90 font-medium" title={`Current: ${log.record_hash}`}>
                      <span className="text-slate-600">Curr: </span>{log.record_hash.slice(0, 16)}...
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
