import React, { useState, useEffect } from 'react';
import { User, Document } from './types';
import { api } from './services/api';
import { Navbar } from './components/Navbar';
import { DocumentList } from './components/DocumentList';
import { UploadModal } from './components/UploadModal';
import { ShareModal } from './components/ShareModal';
import { AuditLedgerView } from './components/AuditLedgerView';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { Shield, Lock, Mail, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2, User as UserIcon, Sun, Moon, KeyRound, Sparkles, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeTab, setActiveTab] = useState<'documents' | 'audit' | 'telemetry'>('documents');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [shareDoc, setShareDoc] = useState<Document | null>(null);

  // Theme State: 'dark' | 'light'
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('trustvault_theme') as 'dark' | 'light') || 'dark';
  });

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
    localStorage.setItem('trustvault_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.body.style.backgroundColor = '#070b14';
      document.body.style.color = '#f1f5f9';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.body.style.backgroundColor = '#f1f5f9';
      document.body.style.color = '#0f172a';
    }
  }, [theme]);

  useEffect(() => {
    let timer: any;
    if (resendCountdown > 0) {
      timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

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
    const isDark = theme === 'dark';
    return (
      <div className={`min-h-screen flex flex-col justify-between p-4 sm:p-6 relative select-none transition-colors duration-200 ${
        isDark ? 'bg-[#070b14] text-slate-100' : 'bg-[#f1f5f9] text-slate-800'
      }`}>
        {/* Top-Right Theme Toggle Button */}
        <div className="absolute top-6 right-6">
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            className={`p-2.5 rounded-xl border shadow-sm flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 ${
              isDark
                ? 'bg-slate-900/80 hover:bg-slate-800 border-slate-800 text-amber-400 hover:text-amber-300'
                : 'bg-white hover:bg-slate-50 border-slate-300 text-indigo-600 hover:text-indigo-700 shadow-slate-200'
            }`}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center w-full my-auto py-8">
          {/* Logo & Brand Header */}
          <div className="flex flex-col items-center mb-7">
            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-indigo-600 p-2.5 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Shield className="w-7 h-7 text-white stroke-[2.2]" />
              </div>
              <span className={`text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                TrustVault
              </span>
            </div>

            {authMode === 'LOGIN' && (
              <>
                <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Sign in to your Vault
                </h1>
                <p className={`text-sm mt-1 text-center ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Access encrypted documents with verified audit records
                </p>
              </>
            )}

            {authMode === 'FORGOT_PASSWORD' && authStep === 'INPUT' && (
              <>
                <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Reset Vault Password
                </h1>
                <p className={`text-sm mt-1 text-center ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Enter your registered email to receive a 6-digit verification code
                </p>
              </>
            )}

            {authMode === 'FORGOT_PASSWORD' && authStep === 'VERIFY' && (
              <>
                <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Verify Code & Reset Password
                </h1>
                <p className={`text-sm mt-1 text-center ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Enter the verification code and set your new password
                </p>
              </>
            )}

            {authMode === 'REGISTER' && authStep === 'INPUT' && (
              <>
                <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Register your organization
                </h1>
                <p className={`text-sm mt-1 text-center ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Create a new document custody owner account
                </p>
              </>
            )}

            {authMode === 'REGISTER' && authStep === 'VERIFY' && (
              <>
                <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Verify Organization Email
                </h1>
                <p className={`text-sm mt-1 text-center ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Enter the 6-digit code sent to your email to activate custody privileges
                </p>
              </>
            )}
          </div>

          {/* Card Container */}
          <div className={`w-full max-w-md rounded-2xl p-6 sm:p-8 backdrop-blur-sm transition-all ${
            isDark
              ? 'bg-[#101524]/90 border border-slate-800/80 shadow-2xl'
              : 'bg-white border border-slate-200/90 shadow-xl'
          }`}>
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
                  <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Registered Email
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                    <input
                      type="email"
                      required
                      placeholder="Enter your registered email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${
                        isDark
                          ? 'bg-[#090d18] border border-slate-800 text-slate-200 placeholder-slate-500 focus:border-indigo-500'
                          : 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-600'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('FORGOT_PASSWORD')}
                      className={`text-xs transition-colors cursor-pointer ${
                        isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700 font-medium'
                      }`}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                    <input
                      type="password"
                      required
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${
                        isDark
                          ? 'bg-[#090d18] border border-slate-800 text-slate-200 placeholder-slate-500 focus:border-indigo-500'
                          : 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-600'
                      }`}
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
                  <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Registered Email
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                    <input
                      type="email"
                      required
                      placeholder="Enter your registered email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${
                        isDark
                          ? 'bg-[#090d18] border border-slate-800 text-slate-200 placeholder-slate-500 focus:border-indigo-500'
                          : 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-600'
                      }`}
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
                <div className={`flex items-center justify-between p-2.5 rounded-xl text-xs font-mono border ${
                  isDark ? 'bg-slate-900/90 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}>
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Mail className="w-4 h-4 text-cyan-500 shrink-0" />
                    <span className="truncate">{codeSentEmail}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setAuthStep('INPUT'); setAuthError(null); setAuthSuccess(null); }}
                    className={`text-[11px] underline shrink-0 cursor-pointer ${
                      isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
                    }`}
                  >
                    Change Email
                  </button>
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    6-Digit Verification Code
                  </label>
                  <div className="relative flex items-center">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="123456"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      className={`w-full rounded-xl pl-10 pr-4 py-3 text-base focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors font-mono tracking-[6px] ${
                        isDark
                          ? 'bg-[#090d18] border border-slate-800 text-cyan-400 placeholder-slate-600 focus:border-indigo-500'
                          : 'bg-slate-50 border border-slate-300 text-indigo-700 placeholder-slate-400 focus:bg-white focus:border-indigo-600'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    New Confidential Password
                  </label>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                    <input
                      type="password"
                      required
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${
                        isDark
                          ? 'bg-[#090d18] border border-slate-800 text-slate-200 placeholder-slate-500 focus:border-indigo-500'
                          : 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-600'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Confirm New Password
                  </label>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                    <input
                      type="password"
                      required
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${
                        isDark
                          ? 'bg-[#090d18] border border-slate-800 text-slate-200 placeholder-slate-500 focus:border-indigo-500'
                          : 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-600'
                      }`}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs font-mono">
                  <span className={isDark ? 'text-slate-500' : 'text-slate-500'}>Didn't receive email?</span>
                  <button
                    type="button"
                    onClick={() => handleRequestForgotCode()}
                    disabled={loading || resendCountdown > 0}
                    className={`transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center gap-1 ${
                      isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700 font-medium'
                    }`}
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
                  <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Full Name / Custodian Name
                  </label>
                  <div className="relative flex items-center">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. K. Pavan Kumar"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`w-full rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${
                        isDark
                          ? 'bg-[#090d18] border border-slate-800 text-slate-200 placeholder-slate-500 focus:border-indigo-500'
                          : 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-600'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Registered Email
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                    <input
                      type="email"
                      required
                      placeholder="Enter your registered email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${
                        isDark
                          ? 'bg-[#090d18] border border-slate-800 text-slate-200 placeholder-slate-500 focus:border-indigo-500'
                          : 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-600'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Password
                  </label>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                    <input
                      type="password"
                      required
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${
                        isDark
                          ? 'bg-[#090d18] border border-slate-800 text-slate-200 placeholder-slate-500 focus:border-indigo-500'
                          : 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-600'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Confirm Password
                  </label>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                    <input
                      type="password"
                      required
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${
                        isDark
                          ? 'bg-[#090d18] border border-slate-800 text-slate-200 placeholder-slate-500 focus:border-indigo-500'
                          : 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-600'
                      }`}
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
                <div className={`flex items-center justify-between p-2.5 rounded-xl text-xs font-mono border ${
                  isDark ? 'bg-slate-900/90 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}>
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Mail className="w-4 h-4 text-cyan-500 shrink-0" />
                    <span className="truncate">{codeSentEmail}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setAuthStep('INPUT'); setAuthError(null); setAuthSuccess(null); }}
                    className={`text-[11px] underline shrink-0 cursor-pointer ${
                      isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
                    }`}
                  >
                    Change Email
                  </button>
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    6-Digit Verification Code
                  </label>
                  <div className="relative flex items-center">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="123456"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      className={`w-full rounded-xl pl-10 pr-4 py-3 text-base focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors font-mono tracking-[6px] ${
                        isDark
                          ? 'bg-[#090d18] border border-slate-800 text-cyan-400 placeholder-slate-600 focus:border-indigo-500'
                          : 'bg-slate-50 border border-slate-300 text-indigo-700 placeholder-slate-400 focus:bg-white focus:border-indigo-600'
                      }`}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs font-mono">
                  <span className={isDark ? 'text-slate-500' : 'text-slate-500'}>Didn't receive email?</span>
                  <button
                    type="button"
                    onClick={() => handleRequestRegisterCode()}
                    disabled={loading || resendCountdown > 0}
                    className={`transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center gap-1 ${
                      isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700 font-medium'
                    }`}
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
              <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('REGISTER')}
                  className={`font-medium transition-colors cursor-pointer ${
                    isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700 underline'
                  }`}
                >
                  Register your organization
                </button>
              </p>
            )}

            {(authMode === 'FORGOT_PASSWORD' || (authMode === 'REGISTER' && authStep === 'VERIFY')) && (
              <button
                type="button"
                onClick={() => switchMode('LOGIN')}
                className={`inline-flex items-center gap-1.5 font-medium transition-colors cursor-pointer ${
                  isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700 underline'
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </button>
            )}

            {authMode === 'REGISTER' && authStep === 'INPUT' && (
              <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('LOGIN')}
                  className={`font-medium transition-colors cursor-pointer ${
                    isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700 underline'
                  }`}
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
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${
      theme === 'dark' ? 'bg-[#090d16]' : 'bg-[#f8fafc]'
    }`}>
      <Navbar
        currentUser={currentUser}
        onLogout={handleLogout}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
        onToggleTheme={toggleTheme}
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
