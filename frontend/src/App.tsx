import React, { useState, useEffect } from 'react';
import { User, Document } from './types';
import { api } from './services/api';
import { Navbar } from './components/Navbar';
import { DocumentList } from './components/DocumentList';
import { UploadModal } from './components/UploadModal';
import { ShareModal } from './components/ShareModal';
import { AuditLedgerView } from './components/AuditLedgerView';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { Shield, Lock, Mail, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2, User as UserIcon, Sun, KeyRound, Sparkles, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeTab, setActiveTab] = useState<'documents' | 'audit' | 'telemetry'>('documents');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [shareDoc, setShareDoc] = useState<Document | null>(null);

  // Auth Mode: 'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD'
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD'>('LOGIN');
  // Auth Step: 'INPUT' | 'VERIFY' (for multi-step verification)
  const [authStep, setAuthStep] = useState<'INPUT' | 'VERIFY'>('INPUT');

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  
  // Verification State
  const [codeSentEmail, setCodeSentEmail] = useState('');
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    let timer: any;
    if (resendCountdown > 0) {
      timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCountdown]);

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

  // 1. LOGIN HANDLER
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

  // 2. FORGOT PASSWORD - STEP 1: REQUEST CODE
  const handleRequestForgotCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetEmail = (authStep === 'VERIFY' ? codeSentEmail : email).trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      setAuthError('Please enter a valid registered email address.');
      return;
    }

    try {
      setLoading(true);
      setAuthError(null);
      setAuthSuccess(null);
      const res = await api.requestPasswordResetCode(targetEmail);
      setCodeSentEmail(targetEmail);
      setPreviewCode(res.preview_code || null);
      setAuthSuccess(res.message || `Verification code sent to ${targetEmail}`);
      setAuthStep('VERIFY');
      setResendCountdown(60);
    } catch (err: any) {
      setAuthError(err.message || 'Failed to dispatch verification code.');
    } finally {
      setLoading(false);
    }
  };

  // 2. FORGOT PASSWORD - STEP 2: VERIFY CODE & RESET
  const handleVerifyForgotCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode || verificationCode.trim().length !== 6) {
      setAuthError('Please enter the 6-digit verification code.');
      return;
    }
    if (password.length < 8) {
      setAuthError('New password must be at least 8 characters in length.');
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
      const res = await api.verifyPasswordReset(codeSentEmail, verificationCode.trim(), password);
      setCurrentUser(res.user);
      setAuthSuccess('Password verified and updated! Opening vault...');
      await loadDocuments();
    } catch (err: any) {
      setAuthError(err.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  // 3. REGISTER - STEP 1: REQUEST CODE
  const handleRequestRegisterCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      setAuthError('Please enter your full name or custodian title.');
      return;
    }
    const targetEmail = (authStep === 'VERIFY' ? codeSentEmail : email).trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      setAuthError('Please enter a valid registered email address.');
      return;
    }
    if (authStep === 'INPUT') {
      if (password.length < 8) {
        setAuthError('Password must be at least 8 characters in length.');
        return;
      }
      if (password !== confirmPassword) {
        setAuthError('Passwords do not match. Please re-enter.');
        return;
      }
    }

    try {
      setLoading(true);
      setAuthError(null);
      setAuthSuccess(null);
      const res = await api.requestRegistrationCode(name.trim(), targetEmail, password);
      setCodeSentEmail(targetEmail);
      setPreviewCode(res.preview_code || null);
      setAuthSuccess(res.message || `Verification code sent to ${targetEmail}`);
      setAuthStep('VERIFY');
      setResendCountdown(60);
    } catch (err: any) {
      setAuthError(err.message || 'Registration request failed.');
    } finally {
      setLoading(false);
    }
  };

  // 3. REGISTER - STEP 2: VERIFY CODE & CREATE OWNER
  const handleVerifyRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode || verificationCode.trim().length !== 6) {
      setAuthError('Please enter the 6-digit verification code.');
      return;
    }

    try {
      setLoading(true);
      setAuthError(null);
      setAuthSuccess(null);
      const res = await api.verifyRegistration(codeSentEmail, verificationCode.trim());
      setCurrentUser(res.user);
      setAuthSuccess('Email verified! Document Owner custody provisioned.');
      await loadDocuments();
    } catch (err: any) {
      setAuthError(err.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (mode: 'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD') => {
    setAuthMode(mode);
    setAuthStep('INPUT');
    setAuthError(null);
    setAuthSuccess(null);
    setPassword('');
    setConfirmPassword('');
    setVerificationCode('');
    setPreviewCode(null);
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setName('');
    setVerificationCode('');
    setPreviewCode(null);
    setAuthError(null);
    setAuthSuccess(null);
    setAuthMode('LOGIN');
    setAuthStep('INPUT');
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

            {authMode === 'FORGOT_PASSWORD' && authStep === 'INPUT' && (
              <>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Reset Vault Password</h1>
                <p className="text-sm text-slate-400 mt-1 text-center">Enter your registered email to receive a 6-digit verification code</p>
              </>
            )}

            {authMode === 'FORGOT_PASSWORD' && authStep === 'VERIFY' && (
              <>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Verify Code & Reset Password</h1>
                <p className="text-sm text-slate-400 mt-1 text-center">Enter the verification code and set your new password</p>
              </>
            )}

            {authMode === 'REGISTER' && authStep === 'INPUT' && (
              <>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Register your organization</h1>
                <p className="text-sm text-slate-400 mt-1 text-center">Create a new document custody owner account</p>
              </>
            )}

            {authMode === 'REGISTER' && authStep === 'VERIFY' && (
              <>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Verify Organization Email</h1>
                <p className="text-sm text-slate-400 mt-1 text-center">Enter the 6-digit code sent to your email to activate custody privileges</p>
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

            {/* Simulated / Fallback Code Badge if present */}
            {authStep === 'VERIFY' && previewCode && (
              <div className="mb-4 p-3 bg-indigo-950/60 border border-indigo-700/80 rounded-xl text-xs text-indigo-200 font-mono flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Security Dispatch Code: <strong className="text-cyan-300 text-sm tracking-widest">{previewCode}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => setVerificationCode(previewCode)}
                  className="text-xs text-cyan-400 hover:text-white underline font-medium cursor-pointer"
                >
                  Autofill
                </button>
              </div>
            )}

            {/* 1. LOGIN FORM */}
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

            {/* 2. FORGOT PASSWORD - STEP 1 (REQUEST CODE) */}
            {authMode === 'FORGOT_PASSWORD' && authStep === 'INPUT' && (
              <form onSubmit={handleRequestForgotCode} className="space-y-4">
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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-600 hover:from-blue-500 hover:via-indigo-500 hover:to-indigo-500 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 mt-6 text-sm disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Dispatching Code...' : 'Send Verification Code'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* 2. FORGOT PASSWORD - STEP 2 (VERIFY CODE & RESET) */}
            {authMode === 'FORGOT_PASSWORD' && authStep === 'VERIFY' && (
              <form onSubmit={handleVerifyForgotCode} className="space-y-4">
                <div className="flex items-center justify-between p-2.5 bg-slate-900/90 border border-slate-800 rounded-xl text-xs font-mono text-slate-300">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Mail className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="truncate text-slate-200">{codeSentEmail}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setAuthStep('INPUT'); setAuthError(null); setAuthSuccess(null); }}
                    className="text-[11px] text-blue-400 hover:text-blue-300 underline shrink-0 cursor-pointer"
                  >
                    Change Email
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">6-Digit Verification Code</label>
                  <div className="relative flex items-center">
                    <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="123456"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-[#090d18] border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-base text-cyan-400 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors font-mono tracking-[6px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">New Confidential Password</label>
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

                <div className="flex items-center justify-between pt-1 text-xs font-mono">
                  <span className="text-slate-500">Didn't receive email?</span>
                  <button
                    type="button"
                    onClick={() => handleRequestForgotCode()}
                    disabled={loading || resendCountdown > 0}
                    className="text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {resendCountdown > 0 ? `Resend (${resendCountdown}s)` : 'Resend Code'}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-600 hover:from-blue-500 hover:via-indigo-500 hover:to-indigo-500 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 mt-6 text-sm disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Verifying Code...' : 'Verify Code & Reset Password'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* 3. REGISTER - STEP 1 (INPUT DETAILS) */}
            {authMode === 'REGISTER' && authStep === 'INPUT' && (
              <form onSubmit={handleRequestRegisterCode} className="space-y-4">
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
                  {loading ? 'Dispatching Verification Code...' : 'Send Verification Code'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* 3. REGISTER - STEP 2 (VERIFY CODE) */}
            {authMode === 'REGISTER' && authStep === 'VERIFY' && (
              <form onSubmit={handleVerifyRegistration} className="space-y-4">
                <div className="flex items-center justify-between p-2.5 bg-slate-900/90 border border-slate-800 rounded-xl text-xs font-mono text-slate-300">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Mail className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="truncate text-slate-200">{codeSentEmail}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setAuthStep('INPUT'); setAuthError(null); setAuthSuccess(null); }}
                    className="text-[11px] text-blue-400 hover:text-blue-300 underline shrink-0 cursor-pointer"
                  >
                    Change Email
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">6-Digit Verification Code</label>
                  <div className="relative flex items-center">
                    <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="123456"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-[#090d18] border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-base text-cyan-400 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors font-mono tracking-[6px]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs font-mono">
                  <span className="text-slate-500">Didn't receive email?</span>
                  <button
                    type="button"
                    onClick={() => handleRequestRegisterCode()}
                    disabled={loading || resendCountdown > 0}
                    className="text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {resendCountdown > 0 ? `Resend (${resendCountdown}s)` : 'Resend Code'}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-600 hover:from-blue-500 hover:via-indigo-500 hover:to-indigo-500 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 mt-6 text-sm disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Activating Custody...' : 'Verify & Launch My Vault'}
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

            {(authMode === 'FORGOT_PASSWORD' || (authMode === 'REGISTER' && authStep === 'VERIFY')) && (
              <button
                type="button"
                onClick={() => switchMode('LOGIN')}
                className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-medium transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </button>
            )}

            {authMode === 'REGISTER' && authStep === 'INPUT' && (
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
