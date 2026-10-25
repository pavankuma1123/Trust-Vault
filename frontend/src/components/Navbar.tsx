import React, { useState } from 'react';
import { User } from '../types';
import { Shield, LogOut, CheckCircle2, User as UserIcon, Key, Fingerprint, Info, X, Sun, Moon } from 'lucide-react';

interface NavbarProps {
  currentUser: User | null;
  onLogout: () => void;
  activeTab: 'documents' | 'audit' | 'telemetry';
  setActiveTab: (tab: 'documents' | 'audit' | 'telemetry') => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onLogout,
  activeTab,
  setActiveTab,
  theme = 'dark',
  onToggleTheme
}) => {
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Generate initials from user's full name
  const getInitials = (name: string) => {
    if (!name) return 'VU';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-950 text-purple-300 border-purple-800';
      case 'OWNER':
        return 'bg-cyan-950 text-cyan-300 border-cyan-800';
      case 'VIEWER':
        return 'bg-emerald-950 text-emerald-300 border-emerald-800';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <>
      <header className={`sticky top-0 z-40 backdrop-blur border-b transition-colors ${
        theme === 'dark' ? 'bg-slate-900/90 border-slate-800' : 'bg-white/95 border-slate-200 shadow-sm'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo & Platform Info */}
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-cyan-950/60 border border-cyan-800/80 rounded-lg text-cyan-400">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xl font-bold tracking-tight text-white">Trust<span className="text-cyan-400">Vault</span></span>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> FIPS / AES-256-GCM
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">Cryptographically Enforced Secure Document Exchange</p>
              </div>
            </div>

            {/* Navigation Tabs */}
            {currentUser && (
              <nav className="flex space-x-1">
                <button
                  onClick={() => setActiveTab('documents')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 'documents'
                      ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  Vault Documents
                </button>
                <button
                  onClick={() => setActiveTab('audit')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 'audit'
                      ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  Audit Ledger
                </button>
                {currentUser.role === 'ADMIN' && (
                  <button
                    onClick={() => setActiveTab('telemetry')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'telemetry'
                        ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    Admin Telemetry
                  </button>
                )}
              </nav>
            )}

            {/* User Profile Badge (Shows Name, Email, Role) */}
            {currentUser && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowCredentialsModal(true)}
                  className="flex items-center space-x-3 bg-slate-950/80 hover:bg-slate-800/80 p-1.5 pr-3 rounded-xl border border-slate-800 transition-all text-left group"
                  title="Click to view credentials and vault identity"
                >
                  {/* Initials Avatar */}
                  <div className="w-8 h-8 rounded-lg bg-cyan-900/60 border border-cyan-700/80 flex items-center justify-center text-xs font-bold text-cyan-300 font-mono">
                    {getInitials(currentUser.name)}
                  </div>

                  <div className="hidden sm:block">
                    <div className="text-xs font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors flex items-center gap-1.5">
                      <span>{currentUser.name}</span>
                      <Info className="w-3 h-3 text-slate-500 group-hover:text-cyan-400" />
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                      <span>{currentUser.email}</span>
                      <span className={`px-1.5 py-0.2 rounded border font-semibold ${getRoleBadge(currentUser.role)}`}>
                        {currentUser.role}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Color Theme Toggle */}
                {onToggleTheme && (
                  <button
                    type="button"
                    onClick={onToggleTheme}
                    title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
                    className={`p-2 rounded-lg transition-colors border cursor-pointer ${
                      theme === 'dark'
                        ? 'text-amber-400 hover:text-amber-300 hover:bg-slate-800 border-slate-800/60'
                        : 'text-indigo-600 hover:text-indigo-700 hover:bg-slate-100 border-slate-200'
                    }`}
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </button>
                )}

                {/* Logout Button */}
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(true)}
                  title="Logout Session"
                  className={`p-2 rounded-lg transition-colors border cursor-pointer ${
                    theme === 'dark'
                      ? 'text-slate-400 hover:text-rose-400 hover:bg-slate-800 border-slate-800/60'
                      : 'text-slate-500 hover:text-rose-600 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl border text-center ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto mb-4">
              <LogOut className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold mb-1.5">
              Are you sure you want logout?
            </h3>
            <p className={`text-xs mb-6 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
              Your active encrypted vault session will be closed and you will need to enter your credentials to access your documents again.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className={`py-2.5 px-4 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                }`}
              >
                No, keep logged in
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout();
                }}
                className="py-2.5 px-4 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-colors cursor-pointer"
              >
                Yes, log out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Credentials & Identity Modal */}
      {showCredentialsModal && currentUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-950/80">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Authenticated Credentials & Identity</h3>
              </div>
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="w-12 h-12 rounded-xl bg-cyan-900/60 border border-cyan-700 flex items-center justify-center text-sm font-bold text-cyan-300 font-mono">
                  {getInitials(currentUser.name)}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{currentUser.name}</h4>
                  <p className="text-xs text-slate-400 font-mono">{currentUser.email}</p>
                  <span className={`inline-block mt-1 text-[10px] font-mono px-2 py-0.5 rounded border uppercase ${getRoleBadge(currentUser.role)}`}>
                    Role: {currentUser.role}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5 text-cyan-400" /> Full Name:
                  </span>
                  <span className="font-semibold text-slate-200">{currentUser.name}</span>
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-cyan-400" /> User Email:
                  </span>
                  <span className="font-semibold text-slate-200">{currentUser.email}</span>
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Fingerprint className="w-3.5 h-3.5 text-cyan-400" /> Vault User ID:
                  </span>
                  <span className="font-semibold text-cyan-400 text-[11px] truncate max-w-[200px]" title={currentUser.id}>
                    {currentUser.id}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Account Enrolled:</span>
                  <span className="text-slate-300">
                    {new Date(currentUser.created_at).toLocaleDateString()} {new Date(currentUser.created_at).toLocaleTimeString()}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Active Encryption:</span>
                  <span className="text-emerald-400 font-semibold">AES-256-GCM Envelope</span>
                </div>
              </div>

              <button
                onClick={() => setShowCredentialsModal(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded-lg text-xs font-mono font-semibold transition-colors"
              >
                Close Credentials Window
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
