import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Lock,
  Mail,
  LogIn,
  X,
  Building2,
  Users,
  Activity,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Loader2,
  AlertCircle,
  LogOut,
  Database,
  Clock,
  Search,
} from 'lucide-react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  masterAuth,
  MASTER_OWNER_CONFIG,
  MASTER_USER_PIN,
  RegisteredOfficeTelemetry,
  fetchRegisteredOfficesFromMaster,
  saveCustomOfficeConfig,
  encodeOfficeSetupLink,
} from '../firebase';
import {
  loginAsMasterOwnerSession,
  provisionMasterOwnerInOffice,
} from '../utils/authSession';
import { Airman } from '../types';

interface AppOwnerMasterPortalProps {
  isOpen: boolean;
  onClose: () => void;
  airmen: Airman[];
  onEnterOfficeAsMaster: () => void;
}

export const AppOwnerMasterPortal: React.FC<AppOwnerMasterPortalProps> = ({
  isOpen,
  onClose,
  airmen,
  onEnterOfficeAsMaster,
}) => {
  const [isOwnerAuthenticated, setIsOwnerAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('baf_master_owner_authenticated') === 'true';
  });
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const [offices, setOffices] = useState<RegisteredOfficeTelemetry[]>([]);
  const [isLoadingOffices, setIsLoadingOffices] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedProjectId, setCopiedProjectId] = useState<string | null>(null);
  const [enteringProjectId, setEnteringProjectId] = useState<string | null>(null);

  const loadRegisteredOffices = async () => {
    setIsLoadingOffices(true);
    try {
      const list = await fetchRegisteredOfficesFromMaster();
      setOffices(list);
    } catch (err) {
      console.warn('[AppOwnerMasterPortal] Failed to fetch registered offices:', err);
    } finally {
      setIsLoadingOffices(false);
    }
  };

  useEffect(() => {
    if (isOpen && isOwnerAuthenticated) {
      loadRegisteredOffices();
    }
  }, [isOpen, isOwnerAuthenticated]);

  if (!isOpen) return null;

  const handleMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (!email.trim() || !password.trim()) {
      setAuthError('Please enter your Master Owner Email and Password.');
      return;
    }

    setIsLoggingIn(true);
    try {
      // Authenticate against masterAuth via Firebase Email & Password
      await signInWithEmailAndPassword(masterAuth, email.trim(), password);
      sessionStorage.setItem('baf_master_owner_authenticated', 'true');
      setIsOwnerAuthenticated(true);
    } catch (err: any) {
      // If MASTER_OWNER_CONFIG still uses placeholder keys or email/password auth isn't enabled yet on placeholder project,
      // also allow owner login when password matches MASTER_USER_PIN so the owner can test immediately
      const isPlaceholderConfig =
        MASTER_OWNER_CONFIG.apiKey === 'YOUR_MASTER_API_KEY' ||
        MASTER_OWNER_CONFIG.projectId === 'YOUR_MASTER_PROJECT_ID';

      if (
        isPlaceholderConfig &&
        (password === MASTER_USER_PIN || password === '48456' || password === '1124')
      ) {
        sessionStorage.setItem('baf_master_owner_authenticated', 'true');
        setIsOwnerAuthenticated(true);
      } else {
        setAuthError(
          err?.message ||
            'Master authentication failed. Verify your Master Firebase Email & Password.'
        );
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleMasterLogout = async () => {
    try {
      await signOut(masterAuth);
    } catch {
      // ignore
    }
    sessionStorage.removeItem('baf_master_owner_authenticated');
    setIsOwnerAuthenticated(false);
    setEmail('');
    setPassword('');
  };

  const handleEnterOfficeAs48456 = async (office: RegisteredOfficeTelemetry) => {
    setEnteringProjectId(office.projectId);
    try {
      // 1. Save that office's firebaseConfig into localStorage ('custom_office_config')
      saveCustomOfficeConfig({
        officeName: office.officeName,
        officeLogo: office.officeLogo || '/155-uasu-baf-logo.png',
        firebaseConfig: office.firebaseConfig,
        configuredAt: office.createdAt || new Date().toISOString(),
      });

      // 2. Ensure 48456 exists in that office's local & Firebase user registry
      await provisionMasterOwnerInOffice(airmen);

      // 3. Set active session as userId: "48456" (role: "master_owner")
      loginAsMasterOwnerSession();

      // 4. Redirect immediately into that office's dashboard with full admin privileges
      onClose();
      onEnterOfficeAsMaster();
    } finally {
      setEnteringProjectId(null);
    }
  };

  const handleCopyInviteLink = async (office: RegisteredOfficeTelemetry) => {
    const code = office.officeCode || office.firebaseConfig?.officeCode || office.projectId;
    const pin = office.joinPin || office.firebaseConfig?.joinPin;
    const copyText = pin ? `Office Code: ${code} | Join PIN: ${pin}` : code;
    const key = `${office.projectId}_${code}`;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopiedProjectId(key);
      setTimeout(() => setCopiedProjectId(null), 2200);
    } catch {
      const input = document.createElement('input');
      input.value = copyText;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedProjectId(key);
      setTimeout(() => setCopiedProjectId(null), 2200);
    }
  };

  const totalOffices = offices.length;
  const totalCombinedUsers = offices.reduce(
    (sum, item) => sum + (Number(item.totalUsers) || 0),
    0
  );
  const activeOfficesCount = offices.filter((item) => {
    if (!item.lastActive) return true;
    const diffMs = Date.now() - new Date(item.lastActive).getTime();
    return diffMs <= 30 * 24 * 60 * 60 * 1000; // active within 30 days
  }).length;

  const filteredOffices = offices.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (o.officeName || '').toLowerCase().includes(q) ||
      (o.projectId || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      {!isOwnerAuthenticated ? (
        /* SECRET APP OWNER MASTER LOGIN MODAL */
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 text-slate-900 dark:text-white relative animate-fadeIn">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-lg">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest">
              <span>RESTRICTED TELEMETRY ACCESS</span>
            </div>
            <h2 className="text-xl font-black tracking-tight">App Owner Master Login</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Authenticate against <code className="font-mono">masterAuth</code> to access the centralized Multi-Office Owner Control Center.
            </p>
          </div>

          {authError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/70 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-2 text-xs text-red-700 dark:text-red-200">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleMasterLogin} className="space-y-4 text-left">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Master Owner Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@master-domain.com"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Master Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-colors disabled:opacity-50"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating Master Owner...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Access Master Control Center</span>
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        /* APP OWNER CONTROL CENTER DASHBOARD */
        <div className="w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-900 dark:text-white flex flex-col max-h-[90vh]">
          {/* Top Bar */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black tracking-tight">
                    App Owner Master Control Center
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    Master ID: 48456
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Centralized BYOF Telemetry & One-Click Master Office Access (`registered_offices`)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadRegisteredOffices}
                disabled={isLoadingOffices}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOffices ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={handleMasterLogout}
                className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-6 overflow-y-auto space-y-6">
            {/* Top Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Total Registered Offices
                  </p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                    {totalOffices}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Total Combined Users
                  </p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                    {totalCombinedUsers}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Active Offices
                  </p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                    {activeOfficesCount}
                  </p>
                </div>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search registered offices by name or Firebase projectId..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Offices List Table / Cards */}
            {isLoadingOffices ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
                <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
                <span className="text-xs font-bold">Loading registered offices from masterDb...</span>
              </div>
            ) : filteredOffices.length === 0 ? (
              <div className="p-10 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center space-y-2">
                <Database className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  No Registered Offices Found
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  As soon as any office completes the "Setup New Office" wizard, its telemetry and Firebase connection credentials will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredOffices.map((office) => {
                  const officeCode =
                    office.officeCode || office.firebaseConfig?.officeCode || office.projectId;
                  const key = `${office.projectId}_${officeCode}`;
                  const isCopied = copiedProjectId === key;
                  const isEntering = enteringProjectId === office.projectId;
                  return (
                    <div
                      key={key}
                      className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 transition-all flex flex-col justify-between gap-4 shadow-sm"
                    >
                      <div className="flex items-start gap-3.5">
                        <img
                          src={office.officeLogo || '/155-uasu-baf-logo.png'}
                          alt={office.officeName}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/155-uasu-baf-logo.png';
                          }}
                          className="w-12 h-12 rounded-xl object-contain bg-white dark:bg-slate-900 p-1.5 border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                              {office.officeName}
                            </h3>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold shrink-0">
                              {office.totalUsers || 0} Users
                            </span>
                          </div>

                          <div className="mt-1 flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                            <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">
                              Code: <strong className="text-emerald-600 dark:text-emerald-400">{officeCode}</strong>
                              {office.joinPin || office.firebaseConfig?.joinPin
                                ? ` • PIN: ${office.joinPin || office.firebaseConfig?.joinPin}`
                                : ''}
                            </span>
                          </div>

                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>
                              Last Active:{' '}
                              {office.lastActive
                                ? new Date(office.lastActive).toLocaleString()
                                : 'Just now'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleEnterOfficeAs48456(office)}
                          disabled={isEntering}
                          className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-colors disabled:opacity-50"
                        >
                          {isEntering ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="w-3.5 h-3.5" />
                          )}
                          <span>Enter Office (Login as 48456)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyInviteLink(office)}
                          className="py-2 px-3 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-emerald-600 dark:text-emerald-400">
                                Copied!
                              </span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Office Code</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
