import React, { useState, useEffect } from 'react';
import { User, Document } from './types';
import { api } from './services/api';
import { Navbar } from './components/Navbar';
import { DocumentList } from './components/DocumentList';
import { UploadModal } from './components/UploadModal';
import { ShareModal } from './components/ShareModal';
import { AuditLedgerView } from './components/AuditLedgerView';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { Shield, Lock, Mail, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2, User as UserIcon, Sun } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeTab, setActiveTab] = useState<'documents' | 'audit' | 'telemetry'>('documents');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [shareDoc, setShareDoc] = useState<Document | null>(null);

  // Auth Mode: 'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD'
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD'>('LOGIN');

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

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setAuthError('Please enter your registered email address.');
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
      const res = await api.resetPassword(email.trim(), password);
      setCurrentUser(res.user);
      setAuthSuccess('Password reset successfully! Vault opened.');
      await loadDocuments();
    } catch (err: any) {
      setAuthError(err.message || 'Password reset failed. Verify registered email.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (mode: 'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD') => {
    setAuthMode(mode);
    setAuthError(null);
    setAuthSuccess(null);
    setPassword('');
    setConfirmPassword('');
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
    setAuthMode('LOGIN');
  };

  // If not authenticated, render Login / Register / Forgot Password screen matching visual design
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col justify-between p-4 sm:p-6 relative select-none">
        {/* Top-Right Theme/Accent Badge */}
        <div className="absolute top-6 right-6">
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-amber-400 shadow-sm flex items-center justify-center">
            <Sun className="w-4 h-4" />
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center w-full my-auto py-8">
          {/* Logo & Brand Header */}
          <div className="flex flex-col items-center mb-7">
            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-indigo-600 p-2.5 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Shield className="w-7 h-7 text-white stroke-[2.2]" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-white">TrustVault</span>
            </div>

            {authMode === 'LOGIN' && (
              <>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Sign in to your Vault</h1>
                <p className="text-sm text-slate-400 mt-1 text-center">Access encrypted documents with verified audit records</p>
              </>
            )}

            {authMode === 'FORGOT_PASSWORD' && (
              <>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Reset Vault Password</h1>
                <p className="text-sm text-slate-400 mt-1 text-center">Enter your registered email and choose a new password</p>
              </>
            )}

            {authMode === 'REGISTER' && (
              <>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Register your organization</h1>
                <p className="text-sm text-slate-400 mt-1 text-center">Create a new document custody owner account</p>
              </>
            )}
          </div>

          {/* Card Container */}
          <div className="w-full max-w-md bg-[#101524]/90 border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm">
            {authError && (
              <div className="mb-4 p-3 bg-rose-950/70 border border-rose-800 rounded-xl text-xs text-rose-300 font-mono flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {authSuccess && (
              <div className="mb-4 p-3 bg-emerald-950/70 border border-emerald-800 rounded-xl text-xs text-emerald-300 font-mono flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{authSuccess}</span>
              </div>
            )}

            {/* LOGIN FORM */}
            {authMode === 'LOGIN' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">Registered Email</label>
                  <div className="relative flex items-center">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="email"
                      required
                      placeholder="Enter your registered email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-[#090d18] border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-slate-300">Password</label>
                    <button
                      type="button"
                      onClick={() => switchMode('FORGOT_PASSWORD')}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="password"
                      required
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[#090d18] border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-600 hover:from-blue-500 hover:via-indigo-500 hover:to-indigo-500 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 mt-6 text-sm disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Signing In...' : 'Sign In'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* FORGOT PASSWORD FORM */}
            {authMode === 'FORGOT_PASSWORD' && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">Registered Email</label>
                  <div className="relative flex items-center">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="email"
                      required
                      placeholder="Enter your registered email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-[#090d18] border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">New Password</label>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="password"
                      required
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[#090d18] border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">Confirm New Password</label>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="password"
                      required
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-[#090d18] border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-600 hover:from-blue-500 hover:via-indigo-500 hover:to-indigo-500 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 mt-6 text-sm disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Resetting Password...' : 'Reset Password & Open Vault'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* REGISTER FORM */}
            {authMode === 'REGISTER' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">Full Name / Custodian Name</label>
                  <div className="relative flex items-center">
                    <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. K. Pavan Kumar"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-[#090d18] border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">Registered Email</label>
                  <div className="relative flex items-center">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="email"
                      required
                      placeholder="Enter your registered email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-[#090d18] border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">Password</label>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="password"
                      required
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[#090d18] border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">Confirm Password</label>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="password"
                      required
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-[#090d18] border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-600 hover:from-blue-500 hover:via-indigo-500 hover:to-indigo-500 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 mt-6 text-sm disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Registering Organization...' : 'Register as Owner'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>

          {/* Bottom Footer Navigation */}
          <div className="mt-8 text-center text-sm">
            {authMode === 'LOGIN' && (
              <p className="text-slate-400">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('REGISTER')}
                  className="text-blue-400 hover:text-blue-300 font-medium transition-colors cursor-pointer"
                >
                  Register your organization
                </button>
              </p>
            )}

            {authMode === 'FORGOT_PASSWORD' && (
              <button
                type="button"
                onClick={() => switchMode('LOGIN')}
                className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-medium transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </button>
            )}

            {authMode === 'REGISTER' && (
              <p className="text-slate-400">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('LOGIN')}
                  className="text-blue-400 hover:text-blue-300 font-medium transition-colors cursor-pointer"
                >
                  Sign In
                </button>
              </p>
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
