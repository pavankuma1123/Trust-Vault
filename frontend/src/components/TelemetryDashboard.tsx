import React, { useState, useEffect } from 'react';
import { TelemetryOverview } from '../types';
import { api } from '../services/api';
import { 
  Activity, ShieldAlert, ArrowUpRight, ArrowDownRight, 
  Lock, AlertTriangle, CheckCircle, RefreshCw, Layers
} from 'lucide-react';

export const TelemetryDashboard: React.FC = () => {
  const [telemetry, setTelemetry] = useState<TelemetryOverview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTelemetry();
  }, []);

  const loadTelemetry = async () => {
    try {
      setLoading(true);
      const data = await api.getTelemetryOverview();
      setTelemetry(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!telemetry) {
    return (
      <div className="text-center py-20 text-slate-400 font-mono text-sm">
        Loading administrative telemetry telemetry...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-800 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            Administrative Telemetry & Adversarial Anomaly Engine
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Real-time permission delta timeline, burst attack heuristics, and cryptographic chain proofs.
          </p>
        </div>
        <button
          onClick={loadTelemetry}
          disabled={loading}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
          title="Refresh Telemetry"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="text-[10px] text-slate-500 uppercase font-mono">Total Documents</div>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{telemetry.total_documents}</div>
          <div className="text-[10px] text-cyan-400 mt-1 flex items-center gap-1 font-mono">
            <Lock className="w-3 h-3" /> AES-256-GCM
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="text-[10px] text-slate-500 uppercase font-mono">Active Grants</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">{telemetry.total_active_grants}</div>
          <div className="text-[10px] text-emerald-500 mt-1 flex items-center gap-1 font-mono">
            <ArrowUpRight className="w-3 h-3" /> Zero-latency DAC
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="text-[10px] text-slate-500 uppercase font-mono">Revoked Grants</div>
          <div className="text-2xl font-bold text-amber-400 mt-1 font-mono">{telemetry.total_revoked_grants}</div>
          <div className="text-[10px] text-amber-500 mt-1 flex items-center gap-1 font-mono">
            <ArrowDownRight className="w-3 h-3" /> Instantly invalidated
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="text-[10px] text-slate-500 uppercase font-mono">Refused Probes</div>
          <div className="text-2xl font-bold text-rose-400 mt-1 font-mono">{telemetry.refused_attempts_count}</div>
          <div className="text-[10px] text-rose-500 mt-1 flex items-center gap-1 font-mono">
            <ShieldAlert className="w-3 h-3" /> Recorded in Ledger
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl col-span-2 md:col-span-1">
          <div className="text-[10px] text-slate-500 uppercase font-mono">Ledger Integrity</div>
          <div className={`text-sm font-bold mt-2 font-mono flex items-center gap-1 ${
            telemetry.ledger_integrity ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            <CheckCircle className="w-4 h-4" />
            {telemetry.ledger_integrity ? '100% PROVEN' : 'TAMPER DETECTED'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">
            {telemetry.total_audit_events} total events anchored
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* High-Risk Access Attempt Anomaly Alerts */}
        <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              High-Risk Adversarial Probes & Anomaly Alerts
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              {telemetry.high_risk_anomalies.length} active alerts
            </span>
          </div>

          {telemetry.high_risk_anomalies.length === 0 ? (
            <div className="text-center py-10 bg-slate-950/40 rounded-lg border border-slate-800 text-xs font-mono text-slate-400">
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              No burst anomalies or privilege escalation attempts detected in current window.
            </div>
          ) : (
            <div className="space-y-3">
              {telemetry.high_risk_anomalies.map((alert, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border text-xs font-mono space-y-1.5 ${
                    alert.severity === 'CRITICAL'
                      ? 'bg-rose-950/40 border-rose-800 text-rose-300'
                      : alert.severity === 'HIGH'
                      ? 'bg-amber-950/40 border-amber-800 text-amber-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {alert.alert_type}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 text-[10px] uppercase">
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-300">
                    {alert.description}
                  </p>
                  <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
                    <span>Source IP: {alert.actor_ip}</span>
                    <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Permission Delta Timeline */}
        <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Global Permission Delta Graph
            </h3>
            <span className="text-[10px] font-mono text-slate-400">Chronological delegation</span>
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {telemetry.permission_deltas.length === 0 ? (
              <p className="text-xs text-slate-500 font-mono italic py-8 text-center">No permission changes logged yet.</p>
            ) : (
              telemetry.permission_deltas.map((delta) => (
                <div
                  key={delta.id}
                  className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs font-mono flex items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        delta.action === 'GRANTED'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}>
                        {delta.action}
                      </span>
                      <span className="text-slate-200 font-medium">{delta.document_title}</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      <span className="text-cyan-400">{delta.granter}</span> → <span className="text-slate-300">{delta.grantee}</span>
                    </div>
                  </div>

                  <div className="text-right text-[10px] text-slate-500 whitespace-nowrap">
                    <div>{delta.permission}</div>
                    <div>{new Date(delta.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
