import React, { useState } from 'react';
import { api } from '../services/api';
import { X, Upload, FileCheck, AlertTriangle, Shield } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Executive');
  const [clientChecksum, setClientChecksum] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      if (!title) setTitle(selected.name.replace(/\.[^/.]+$/, ""));
      
      // Compute client-side SHA-256 checksum for ingestion verification
      try {
        const buffer = await selected.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        setClientChecksum(hashHex);
      } catch {
        setClientChecksum('Computed on server ingestion');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to ingest.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await api.uploadDocument(file, title, category);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Upload refused by server validation pipeline.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">Ingest & Envelope Encrypt Document</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-950/70 border border-rose-800 rounded-lg text-xs text-rose-300 font-mono flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Select Document</label>
            <div className="border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-lg p-4 text-center cursor-pointer transition-colors bg-slate-950/40">
              <input
                type="file"
                id="docUpload"
                className="hidden"
                onChange={handleFileChange}
              />
              <label htmlFor="docUpload" className="cursor-pointer">
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs text-slate-300 font-medium">Click to select or drag document</p>
                <p className="text-[10px] text-slate-500 mt-1 font-mono">
                  Supported: PDF, PNG, JPEG, DOCX. Max payload: 25MB.
                </p>
                <p className="text-[10px] text-amber-500 font-mono mt-0.5">
                  Deep magic-byte inspection enforced. Polyglots & executables will be quarantined.
                </p>
              </label>
            </div>
          </div>

          {file && (
            <div className="p-3 bg-slate-950 rounded border border-slate-800 text-xs space-y-1 font-mono">
              <div className="flex items-center gap-1.5 text-cyan-400">
                <FileCheck className="w-4 h-4" />
                <span className="truncate">{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
              {clientChecksum && (
                <div className="text-[10px] text-slate-400 truncate">
                  Ingestion SHA-256: {clientChecksum}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Document Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q4 Executive Financial Audit"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Classification / Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="Executive">Executive</option>
              <option value="Finance">Finance</option>
              <option value="Legal">Legal</option>
              <option value="Engineering">Engineering</option>
              <option value="General">General</option>
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !file}
              className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold font-mono transition-colors disabled:opacity-50"
            >
              {loading ? 'Encrypting & Storing...' : 'Ingest & Encrypt (AES-256-GCM)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
