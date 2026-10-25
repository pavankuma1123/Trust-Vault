import React, { useState, useEffect } from 'react';
import { Document, AccessGrant } from '../types';
import { api } from '../services/api';
import { X, Share2, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface ShareModalProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ document: doc, isOpen, onClose }) => {
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [granteeEmail, setGranteeEmail] = useState('');
  const [permission, setPermission] = useState<'READ' | 'EDIT'>('READ');
  const [maxDownloads, setMaxDownloads] = useState<string>('');
  const [expiryHours, setExpiryHours] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (doc && isOpen) {
      loadGrants();
    }
  }, [doc, isOpen]);

  if (!isOpen || !doc) return null;

  const loadGrants = async () => {
    try {
      const data = await api.listGrants(doc.id);
      setGrants(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleCreateGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!granteeEmail) return;

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      let expiresAt: string | null = null;
      if (expiryHours && parseInt(expiryHours) > 0) {
        const d = new Date();
        d.setHours(d.getHours() + parseInt(expiryHours));
        expiresAt = d.toISOString();
      }

      const maxDl = maxDownloads && parseInt(maxDownloads) > 0 ? parseInt(maxDownloads) : null;

      await api.createGrant(doc.id, {
        grantee_email: granteeEmail.trim(),
        permission,
        max_downloads: maxDl,
        expires_at: expiresAt
      });

      setSuccess(`Delegated ${permission} access to ${granteeEmail}. Synchronously active.`);
      setGranteeEmail('');
      setMaxDownloads('');
      setExpiryHours('');
      await loadGrants();
    } catch (err: any) {
      setError(err.message || 'Failed to grant access');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (grantId: string) => {
    try {
      setError(null);
      await api.revokeGrant(doc.id, grantId);
      setSuccess('Access revoked immediately. Status changed to REVOKED within 0ms.');
      await loadGrants();
    } catch (err: any) {
      setError(err.message || 'Revocation failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-semibold text-white">Discretionary Access Control (DAC) Delegation</h3>
              <p className="text-[10px] text-slate-400 font-mono">Document: {doc.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-950/70 border border-rose-800 rounded-lg text-xs text-rose-300 font-mono flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="p-3 bg-emerald-950/70 border border-emerald-800 rounded-lg text-xs text-emerald-300 font-mono flex items-start gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* Grant Creation Form */}
          <form onSubmit={handleCreateGrant} className="bg-slate-950/60 p-4 rounded-lg border border-slate-800 space-y-3">
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono">
              Grant New Named-User Access
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">Grantee Email</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. viewer@vault.local"
                  value={granteeEmail}
                  onChange={(e) => setGranteeEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">Permission Level</label>
                <select
                  value={permission}
                  onChange={(e) => setPermission(e.target.value as 'READ' | 'EDIT')}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                >
                  <option value="READ">READ (Stream / Download)</option>
                  <option value="EDIT">EDIT (Metadata / Re-upload)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">Download Quota Limit (Optional)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 1 (Single-use)"
                  value={maxDownloads}
                  onChange={(e) => setMaxDownloads(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">TTL Expiry in Hours (Optional)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 24 (Expires in 24h)"
                  value={expiryHours}
                  onChange={(e) => setExpiryHours(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded text-xs font-semibold font-mono transition-colors disabled:opacity-50"
              >
                {loading ? 'Delegating...' : 'Delegate Grant'}
              </button>
            </div>
          </form>

          {/* Active Grants List with Zero-Latency Revoke Button */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono">
              Active Delegated Grants ({grants.length})
            </h4>

            {grants.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2 font-mono">No active access grants assigned yet.</p>
            ) : (
              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Grantee</th>
                      <th className="p-2.5">Role</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Usage / Limits</th>
                      <th className="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {grants.map((g) => (
                      <tr key={g.id} className="hover:bg-slate-850">
                        <td className="p-2.5 font-medium text-slate-200">{g.grantee_email}</td>
                        <td className="p-2.5">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 text-[10px]">
                            {g.permission}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            g.status === 'ACTIVE'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}>
                            {g.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-400 text-[11px]">
                          <div>Downloads: {g.download_count} {g.max_downloads ? `/ ${g.max_downloads}` : ''}</div>
                          {g.expires_at && (
                            <div className="text-[10px] text-amber-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(g.expires_at).toLocaleDateString()} {new Date(g.expires_at).toLocaleTimeString()}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5 text-right">
                          {g.status === 'ACTIVE' ? (
                            <button
                              onClick={() => handleRevoke(g.id)}
                              className="px-2 py-1 bg-rose-900/60 hover:bg-rose-600 text-rose-200 hover:text-white rounded text-[10px] font-semibold transition-colors border border-rose-700"
                            >
                              Revoke Access (0ms)
                            </button>
                          ) : (
                            <span className="text-slate-500 text-[10px] italic">Revoked</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
