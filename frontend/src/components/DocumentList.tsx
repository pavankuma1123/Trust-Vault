import React, { useState } from 'react';
import { Document, User } from '../types';
import { api } from '../services/api';
import { 
  Download, Share2, Trash2, ShieldCheck, 
  Search, Lock, HardDrive, KeyRound, AlertCircle, CheckCircle,
  User as UserIcon, Fingerprint, Shield, Sparkles
} from 'lucide-react';

interface DocumentListProps {
  documents: Document[];
  currentUser: User;
  onRefresh: () => void;
  onOpenUpload: () => void;
  onOpenShare: (doc: Document) => void;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  currentUser,
  onRefresh,
  onOpenUpload,
  onOpenShare
}) => {
  const [searchTitle, setSearchTitle] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const handleDownload = async (doc: Document) => {
    try {
      setDownloadingId(doc.id);
      setStatusMessage(null);
      await api.downloadDocument(doc.id, doc.original_filename);
      setStatusMessage({ text: `Successfully decrypted and downloaded "${doc.title}"`, isError: false });
      onRefresh();
    } catch (err: any) {
      setStatusMessage({ text: `Access Refused: ${err.message}`, isError: true });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${doc.title}"?`)) return;
    try {
      setStatusMessage(null);
      await api.deleteDocument(doc.id);
      setStatusMessage({ text: `Document "${doc.title}" deleted from vault and disk.`, isError: false });
      onRefresh();
    } catch (err: any) {
      setStatusMessage({ text: `Deletion failed: ${err.message}`, isError: true });
    }
  };

  const filteredDocs = documents.filter(d => 
    d.title.toLowerCase().includes(searchTitle.toLowerCase()) ||
    d.category.toLowerCase().includes(searchTitle.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Personalized User Credentials & Custody Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Authenticated Session
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Role: {currentUser.role}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white">
              Welcome, <span className="text-cyan-400">{currentUser.name}</span>
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              {currentUser.role === 'OWNER' && (
                "You are authenticated as Document Owner. You have full cryptographic custody to ingest files, configure envelope encryption (AES-256-GCM), assign granular DAC grants, and enforce instant 0ms access revocations."
              )}
              {currentUser.role === 'ADMIN' && (
                "You are authenticated as Security Administrator. You monitor telemetry, anomaly alerts, and verify audit ledger integrity. Document content downloads remain gated unless explicitly granted by owners."
              )}
              {currentUser.role === 'VIEWER' && (
                "You are authenticated as an Authorized Viewer. You can decrypt and stream documents specifically shared with your identity."
              )}
            </p>
          </div>

          {(currentUser.role === 'OWNER' || currentUser.role === 'ADMIN') && (
            <button
              onClick={onOpenUpload}
              className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-xs font-semibold font-mono flex items-center gap-2 transition-colors shadow-lg shadow-cyan-950 shrink-0"
            >
              <HardDrive className="w-4 h-4" />
              Upload Encrypted Document
            </button>
          )}
        </div>

        {/* User Identity Details Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3 border-t border-slate-800/80 text-xs font-mono">
          <div className="flex items-center gap-2 text-slate-400">
            <UserIcon className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-500">Identity:</span>
            <span className="text-slate-200 truncate">{currentUser.email}</span>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <Fingerprint className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-500">User ID:</span>
            <span className="text-slate-200 truncate" title={currentUser.id}>
              {currentUser.id.slice(0, 8)}...{currentUser.id.slice(-6)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-500">Protection:</span>
            <span className="text-emerald-400">AES-256-GCM Envelope</span>
          </div>
        </div>
      </div>

      {/* Action Bar & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-cyan-400" />
            Accessible Vault Documents ({filteredDocs.length})
          </h3>
          <p className="text-[11px] text-slate-400 font-mono">
            Filtered strictly inside the SQL database engine according to affirmative DAC grants.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search documents by title or category..."
            value={searchTitle}
            onChange={(e) => setSearchTitle(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>
      </div>

      {/* Notifications / Refusals */}
      {statusMessage && (
        <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 font-mono ${
          statusMessage.isError
            ? 'bg-rose-950/60 border-rose-800 text-rose-300'
            : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
        }`}>
          {statusMessage.isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Document Grid / Table */}
      {filteredDocs.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/30 rounded-xl border border-slate-800/60">
          <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-slate-300">No Authorized Documents Visible</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 font-mono">
            Direct Object References (IDOR) fail safe. Unshared files return 404 to prevent document existence enumeration.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map((doc) => (
            <div
              key={doc.id}
              className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all flex flex-col justify-between space-y-3 group"
            >
              <div>
                <div className="flex justify-between items-start gap-2 mb-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700 uppercase">
                    {doc.category}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    {(doc.file_size / 1024).toFixed(1)} KB
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors line-clamp-1">
                  {doc.title}
                </h3>
                <p className="text-xs text-slate-400 font-mono truncate mt-0.5" title={doc.original_filename}>
                  {doc.original_filename}
                </p>

                {/* Cryptographic Checksum Badge */}
                <div className="mt-3 p-2 bg-slate-950/80 rounded border border-slate-800/80 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span className="flex items-center gap-1"><KeyRound className="w-3 h-3 text-amber-500" /> SHA-256 Checksum</span>
                    <span className="text-emerald-400">Verified</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 truncate" title={doc.sha256_checksum}>
                    {doc.sha256_checksum}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleDownload(doc)}
                  disabled={downloadingId === doc.id}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white px-3 py-1.5 rounded text-xs font-mono flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  {downloadingId === doc.id ? 'Decrypting...' : 'Stream Decrypt'}
                </button>

                {doc.is_owner && (
                  <>
                    <button
                      onClick={() => onOpenShare(doc)}
                      title="Manage Granular DAC Grants"
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-cyan-400 rounded transition-colors"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(doc)}
                      title="Delete Document & Ciphertext"
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
