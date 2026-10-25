import React, { useState, useEffect } from 'react';
import { User, Document } from './types';
import { api } from './services/api';
import { Navbar } from './components/Navbar';
import { DocumentList } from './components/DocumentList';
import { UploadModal } from './components/UploadModal';
import { ShareModal } from './components/ShareModal';
import { AuditLedgerView } from './components/AuditLedgerView';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { Shield, Lock, AlertCircle, UserPlus, LogIn, CheckCircle2, KeyRound, User as UserIcon } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeTab, setActiveTab] = useState<'documents' | 'audit' | 'telemetry'>('documents');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [shareDoc, setShareDoc] = useState<Document | null>(null);

  // Auth Mode: 'LOGIN' or 'REGISTER'
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('trustvault_token');
    if (!token) return;
    try {
      const user = await api.getMe();
      setCurrentUser(user);
      loadDocuments();
    } catch {
      localStorage.removeItem('trustvault_token');
      setCurrentUser(null);
    }
  };

  const loadDocuments = async () => {
    try {
      const docs = await api.listDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    try {
      setLoading(true);
      setAuthError(null);
      setAuthSuccess(null);
      const res = await api.login(email.trim(), password);
      setCurrentUser(res.user);
      await loadDocuments();
    } catch (err: any) {
      setAuthError(err.message || 'Login failed. Verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setAuthError('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setAuthError('Please enter your email address.');
      return;
    }
    if (password.length < 8) {
      setAuthError('Password must be at least 8 characters in length.');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match. Please re-enter.');
      return;
    }

    try {
      setLoading(true);
      setAuthError(null);
      setAuthSuccess(null);
      const res = await api.register(name.trim(), email.trim(), password);
      setCurrentUser(res.user);
      setAuthSuccess('Owner account registered and authenticated successfully!');
      await loadDocuments();
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setName('');
    setAuthError(null);
    setAuthSuccess(null);
  };

  // If not authenticated, render Login / Register screen
  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#090d16] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(6,182,212,0.15),rgba(255,255,255,0))]">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          
          {/* Header Banner */}
          <div className="p-6 text-center space-y-2 border-b border-slate-800 bg-slate-950/60">
            <div className="inline-flex p-3 bg-cyan-950/80 border border-cyan-800 rounded-xl text-cyan-400 mb-1">
              <Shield className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Trust<span className="text-cyan-400">Vault</span></h1>
            <p className="text-xs text-slate-400 font-mono">Cryptographically Enforced Secure Document Exchange</p>
          </div>

          {/* Mode Tabs: Sign In vs Register Owner */}
          <div className="grid grid-cols-2 border-b border-slate-800 text-xs font-mono">
            <button
              onClick={() => { setAuthMode('LOGIN'); setAuthError(null); }}
              className={`py-3 text-center font-semibold transition-colors flex items-center justify-center gap-2 ${
                authMode === 'LOGIN'
                  ? 'bg-slate-900 text-cyan-400 border-b-2 border-cyan-400'
                  : 'bg-slate-950/80 text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <LogIn className="w-4 h-4" /> Sign In to Vault
            </button>
            <button
              onClick={() => { setAuthMode('REGISTER'); setAuthError(null); }}
              className={`py-3 text-center font-semibold transition-colors flex items-center justify-center gap-2 ${
                authMode === 'REGISTER'
                  ? 'bg-slate-900 text-cyan-400 border-b-2 border-cyan-400'
                  : 'bg-slate-950/80 text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <UserPlus className="w-4 h-4" /> Register New Owner
            </button>
          </div>

          {/* Form Body */}
          <div className="p-6 sm:p-8 space-y-5">
            {authError && (
              <div className="p-3 bg-rose-950/70 border border-rose-800 rounded-lg text-xs text-rose-300 font-mono flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {authSuccess && (
              <div className="p-3 bg-emerald-950/70 border border-emerald-800 rounded-lg text-xs text-emerald-300 font-mono flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{authSuccess}</span>
              </div>
            )}

            {authMode === 'LOGIN' ? (
              /* LOGIN FORM */
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Account Email / Identity</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. owner@vault.local or your registered email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="Enter your confidential password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-2.5 rounded-lg text-xs font-semibold font-mono transition-colors shadow-lg shadow-cyan-950 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <KeyRound className="w-4 h-4" />
                  {loading ? 'Authenticating & Verifying Session...' : 'Authenticate & Open Vault'}
                </button>

                <p className="text-[11px] text-slate-500 font-mono text-center pt-2">
                  System administrators, vault owners, and auditors authenticate with their strictly private credentials.
                </p>
              </form>
            ) : (
              /* REGISTER OWNER FORM */
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Full Name / Custodian Name</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. Aris Thorne"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Owner Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. aris@vault.local"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono text-slate-300 mb-1">Vault Password</label>
                    <input
                      type="password"
                      required
                      placeholder="Min. 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-slate-300 mb-1">Confirm Password</label>
                    <input
                      type="password"
                      required
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-400 font-mono space-y-1">
                  <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                    <Lock className="w-3.5 h-3.5" />
                    Document Owner Privileges:
                  </div>
                  <p>
                    All registered accounts receive instant Document Owner rights. You can upload files, configure AES-256-GCM envelope encryption, delegate DAC access, set download quotas, and revoke access with zero latency.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-2.5 rounded-lg text-xs font-semibold font-mono transition-colors shadow-lg shadow-cyan-950 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  {loading ? 'Creating Owner Account & Deriving Keys...' : 'Register & Launch My Vault'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090d16] flex flex-col">
      <Navbar
        currentUser={currentUser}
        onLogout={handleLogout}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'documents' && (
          <DocumentList
            documents={documents}
            currentUser={currentUser}
            onRefresh={loadDocuments}
            onOpenUpload={() => setIsUploadOpen(true)}
            onOpenShare={(doc) => setShareDoc(doc)}
          />
        )}

        {activeTab === 'audit' && (
          <AuditLedgerView currentUser={currentUser} />
        )}

        {activeTab === 'telemetry' && currentUser.role === 'ADMIN' && (
          <TelemetryDashboard />
        )}
      </main>

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={loadDocuments}
      />

      <ShareModal
        document={shareDoc}
        isOpen={shareDoc !== null}
        onClose={() => setShareDoc(null)}
      />
    </div>
  );
};
