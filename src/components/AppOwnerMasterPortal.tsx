import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Lock,
  UserCheck,
  Eye,
  EyeOff,
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
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  Phone,
  Briefcase,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import {
  masterAuth,
  MASTER_USER_ID,
  MASTER_USER_PIN,
  RegisteredOfficeTelemetry,
  PendingOfficeRegistrationRequest,
  fetchRegisteredOfficesFromMaster,
  fetchPendingOfficeRequestsFromMaster,
  getPendingOfficeRequestsLocal,
  approveOfficeRegistrationRequest,
  rejectOfficeRegistrationRequest,
  saveCustomOfficeConfig,
  clearCustomOfficeConfig,
  updateActiveOfficeProfile,
} from '../firebase';
import {
  loginAsMasterOwnerSession,
  provisionMasterOwnerInOffice,
  isMasterPinMatch,
  clearUserSession,
} from '../utils/authSession';
import { localDb } from '../services/localDatabase';
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
  const [masterUserId, setMasterUserId] = useState<string>('');
  const [masterPin, setMasterPin] = useState<string>('');
  const [showMasterPin, setShowMasterPin] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const [officeRequests, setOfficeRequests] = useState<PendingOfficeRegistrationRequest[]>(() =>
    getPendingOfficeRequestsLocal()
  );
  const [activeTab, setActiveTab] = useState<'offices' | 'approvals'>(() => {
    const initialReqs = getPendingOfficeRequestsLocal();
    return initialReqs.some((r) => r.status === 'PENDING') ? 'approvals' : 'offices';
  });
  const [offices, setOffices] = useState<RegisteredOfficeTelemetry[]>([]);
  const [isLoadingOffices, setIsLoadingOffices] = useState<boolean>(false);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [approvalBanner, setApprovalBanner] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedProjectId, setCopiedProjectId] = useState<string | null>(null);
  const [enteringProjectId, setEnteringProjectId] = useState<string | null>(null);
  const didInitialTabSelectRef = React.useRef<boolean>(false);

  const loadMasterData = async (showSpinner: boolean = false) => {
    if (showSpinner && offices.length === 0) {
      setIsLoadingOffices(true);
    }
    try {
      const [officeList, reqList] = await Promise.all([
        fetchRegisteredOfficesFromMaster(),
        fetchPendingOfficeRequestsFromMaster(),
      ]);
      setOffices(officeList);
      setOfficeRequests(reqList);
      if (!didInitialTabSelectRef.current) {
        didInitialTabSelectRef.current = true;
        if (reqList.some((r) => r.status === 'PENDING')) {
          setActiveTab('approvals');
        }
      }
    } catch (err) {
      console.warn('[AppOwnerMasterPortal] Failed to fetch master data:', err);
    } finally {
      setIsLoadingOffices(false);
    }
  };

  useEffect(() => {
    if (isOpen && isOwnerAuthenticated) {
      loadMasterData(true);
    }
    if (!isOpen) {
      didInitialTabSelectRef.current = false;
    }
  }, [isOpen, isOwnerAuthenticated]);

  useEffect(() => {
    const onReqUpdate = (e: Event) => {
      if (!isOpen || !isOwnerAuthenticated) return;
      const customEv = e as CustomEvent<PendingOfficeRegistrationRequest[]>;
      if (Array.isArray(customEv.detail)) {
        setOfficeRequests(customEv.detail);
      } else {
        setOfficeRequests(getPendingOfficeRequestsLocal());
      }
    };
    window.addEventListener('baf_pending_office_requests_updated', onReqUpdate);
    return () => window.removeEventListener('baf_pending_office_requests_updated', onReqUpdate);
  }, [isOpen, isOwnerAuthenticated]);

  if (!isOpen) return null;

  const handleMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const cleanId = masterUserId.replace(/^BD\/?/i, '').replace(/\s+/g, '').trim();
    const cleanDigits = cleanId.replace(/\D/g, '');
    const cleanPin = masterPin.trim();

    if (!cleanId) {
      setAuthError('Please enter your Master User ID.');
      return;
    }
    if (!cleanPin) {
      setAuthError('Please enter your Master PIN.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const isValidMasterId =
        cleanId === MASTER_USER_ID ||
        cleanDigits === MASTER_USER_ID ||
        cleanId === '48456' ||
        cleanDigits === '48456';

      const isValidPin =
        isMasterPinMatch(cleanPin) ||
        cleanPin === MASTER_USER_PIN ||
        cleanPin === '48456' ||
        cleanPin === '1124';

      if (isValidMasterId && isValidPin) {
        sessionStorage.setItem('baf_master_owner_authenticated', 'true');
        setIsOwnerAuthenticated(true);
      } else if (!isValidMasterId) {
        setAuthError('Invalid Master User ID. Only authorized Master User ID is allowed.');
      } else {
        setAuthError('Invalid Master PIN. Please enter the correct Master PIN.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleMasterLogout = () => {
    try {
      sessionStorage.removeItem('baf_master_owner_authenticated');
      clearUserSession();
    } catch {}
    setIsOwnerAuthenticated(false);
    setMasterUserId('');
    setMasterPin('');
    setAuthError('');
    setApprovalBanner('');
    signOut(masterAuth).catch(() => {});
    onClose();
  };

  const handleApproveRequest = async (req: PendingOfficeRegistrationRequest) => {
    setProcessingRequestId(req.id);
    setApprovalBanner('');
    try {
      const approved = await approveOfficeRegistrationRequest(req.id);
      if (approved) {
        const [officeList, reqList] = await Promise.all([
          fetchRegisteredOfficesFromMaster(),
          fetchPendingOfficeRequestsFromMaster(),
        ]);
        setOffices(officeList);
        setOfficeRequests(reqList);
        setApprovalBanner(
          `Approved & Created Office "${req.officeName}"! ${req.fullName} (BD/${req.bdNo}) has been added to Biodata Register & User Management (${req.userRole}).`
        );
      }
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRejectRequest = async (req: PendingOfficeRegistrationRequest) => {
    setProcessingRequestId(req.id);
    setApprovalBanner('');
    try {
      await rejectOfficeRegistrationRequest(req.id);
      const reqList = await fetchPendingOfficeRequestsFromMaster();
      setOfficeRequests(reqList);
      setApprovalBanner(`Rejected office registration request for "${req.officeName}".`);
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleEnterOfficeAs48456 = async (office: RegisteredOfficeTelemetry) => {
    const officeCode = String(
      office.officeCode || office.firebaseConfig?.officeCode || office.projectId
    )
      .toUpperCase()
      .trim();
    const key = `${office.projectId}_${officeCode}`;
    setEnteringProjectId(key);
    try {
      if (officeCode === '155-UASU' || officeCode === '155UASU') {
        clearCustomOfficeConfig();
        localDb.switchActiveOfficeWorkspace(false);
      } else {
        saveCustomOfficeConfig({
          officeName: office.officeName,
          officeLogo: office.officeLogo || '/155-uasu-baf-logo.png',
          officeSlogan: office.officeSlogan || office.firebaseConfig?.officeSlogan || 'Intel • Surveillance • Strike',
          officeBase: office.officeBase || office.firebaseConfig?.officeBase || 'BAF BASE ZHR',
          officeCode,
          firebaseConfig: {
            ...office.firebaseConfig,
            officeCode,
          },
          configuredAt: office.createdAt || new Date().toISOString(),
        });
        updateActiveOfficeProfile({
          officeName: office.officeName,
          officeLogo: office.officeLogo || '/155-uasu-baf-logo.png',
          officeSlogan: office.officeSlogan || office.firebaseConfig?.officeSlogan || 'Intel • Surveillance • Strike',
          officeBase: office.officeBase || office.firebaseConfig?.officeBase || 'BAF BASE ZHR',
        });
        localDb.switchActiveOfficeWorkspace(false);
      }

      // Ensure 48456 exists in that office's local & Firebase user registry
      await provisionMasterOwnerInOffice(localDb.getAirmen() || airmen);

      // Set active session as userId: "48456" (role: "master_owner")
      loginAsMasterOwnerSession();

      // Redirect immediately into that office's dashboard with full admin privileges
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
    return diffMs <= 30 * 24 * 60 * 60 * 1000;
  }).length;

  const pendingRequests = officeRequests.filter((r) => r.status === 'PENDING');
  const pendingCount = pendingRequests.length;

  const filteredOffices = offices.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (o.officeName || '').toLowerCase().includes(q) ||
      (o.officeCode || '').toLowerCase().includes(q) ||
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
              Enter your Master User ID & PIN to access the centralized Multi-Office Owner Control Center.
            </p>
          </div>

          {authError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/70 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-2 text-xs text-red-700 dark:text-red-200">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleMasterLogin} className="space-y-4 text-left" noValidate>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Master User ID
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  inputMode="numeric"
                  value={masterUserId}
                  onChange={(e) => {
                    setMasterUserId(e.target.value.replace(/[^0-9]/g, ''));
                    setAuthError('');
                  }}
                  placeholder="Enter Master User ID"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Master PIN
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showMasterPin ? 'text' : 'password'}
                  inputMode="numeric"
                  value={masterPin}
                  onChange={(e) => {
                    setMasterPin(e.target.value);
                    setAuthError('');
                  }}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setShowMasterPin(!showMasterPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-500 transition-colors cursor-pointer"
                >
                  {showMasterPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
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
        <div className="w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-900 dark:text-white flex flex-col max-h-[92vh]">
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
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    Master ID: 48456
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Centralized Multi-Office Approval & One-Click Master Office Access
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadMasterData(false)}
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
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Registered Offices
                  </p>
                  <p className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {totalOffices}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Pending Approvals
                  </p>
                  <p className="text-2xl font-black font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-0.5">
                    {pendingCount}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Total Users
                  </p>
                  <p className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {totalCombinedUsers}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Active Offices
                  </p>
                  <p className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {activeOfficesCount}
                  </p>
                </div>
              </div>
            </div>

            {approvalBanner && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 flex items-start justify-between gap-3 text-xs text-emerald-800 dark:text-emerald-200">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span className="font-semibold">{approvalBanner}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setApprovalBanner('')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Mode Tabs: Registered Offices vs New Office Approval Requests */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('offices')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                    activeTab === 'offices'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Registered Offices ({totalOffices})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('approvals')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                    activeTab === 'approvals'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  <span>New Office Approval Requests ({pendingCount})</span>
                </button>
              </div>

              {activeTab === 'offices' && (
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search registered offices by name or code..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}
            </div>

            {activeTab === 'approvals' ? (
              /* NEW OFFICE REGISTRATION APPROVAL REQUESTS */
              <div className="space-y-4">
                {officeRequests.length === 0 ? (
                  <div className="p-10 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center space-y-2">
                    <ClipboardCheck className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      No New Office Registration Requests
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      When a user submits the 3-step "Register a New Office" form on the Login Portal, their request will appear here for your approval.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {officeRequests.map((req) => {
                      const isProcessing = processingRequestId === req.id;
                      const isPending = req.status === 'PENDING';
                      const isApproved = req.status === 'APPROVED';
                      return (
                        <div
                          key={req.id}
                          className={`p-5 rounded-2xl border transition-all flex flex-col gap-4 ${
                            isPending
                              ? 'bg-amber-500/5 dark:bg-slate-800/70 border-amber-500/40'
                              : isApproved
                              ? 'bg-emerald-500/5 dark:bg-slate-800/40 border-emerald-500/30'
                              : 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 opacity-75'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            {/* Office Info */}
                            <div className="flex items-start gap-3.5">
                              <img
                                src={req.officeLogo || '/155-uasu-baf-logo.png'}
                                alt={req.officeName}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = '/155-uasu-baf-logo.png';
                                }}
                                className="w-14 h-14 rounded-xl object-contain bg-white dark:bg-slate-900 p-1.5 border border-slate-200 dark:border-slate-700 shrink-0"
                              />
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-base font-black text-slate-900 dark:text-white uppercase">
                                    {req.officeName}
                                  </h3>
                                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                                    · Code: {req.officeCode}{req.wing ? ` · ${req.wing}` : ''}
                                  </span>
                                </div>
                                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-0.5">
                                  {req.officeBase} · {req.officeSlogan}
                                </p>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                                  Requested: {new Date(req.createdAt).toLocaleString()}
                                </p>
                              </div>
                            </div>

                            {/* Status Text */}
                            <div className="text-xs font-black uppercase tracking-wider">
                              {isPending && (
                                <span className="text-amber-600 dark:text-amber-400">
                                  Pending Master Approval
                                </span>
                              )}
                              {isApproved && (
                                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span>Approved & Created</span>
                                </span>
                              )}
                              {req.status === 'REJECTED' && (
                                <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                                  <XCircle className="w-4 h-4" />
                                  <span>Rejected</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Step 2 User Information Box */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 p-3.5 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-left">
                            <div>
                              <div className="text-[10px] font-bold uppercase text-slate-400">
                                User ID (BD No)
                              </div>
                              <div className="text-xs font-mono font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                                BD/{req.bdNo}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold uppercase text-slate-400">
                                Full Name
                              </div>
                              <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                                {req.fullName}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold uppercase text-slate-400">
                                Surname
                              </div>
                              <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                                {req.surname}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold uppercase text-slate-400">
                                Trade
                              </div>
                              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5 truncate flex items-center gap-1">
                                <Briefcase className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{req.trade}</span>
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold uppercase text-slate-400">
                                User Role
                              </div>
                              <div className="text-xs font-black text-amber-600 dark:text-amber-400 mt-0.5">
                                {req.userRole === 'SUPER_ADMIN'
                                  ? 'Super Admin'
                                  : req.userRole === 'ADMIN'
                                  ? 'Admin'
                                  : req.userRole === 'USER'
                                  ? 'User'
                                  : req.userRole}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold uppercase text-slate-400">
                                Contact No
                              </div>
                              <div className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{req.contactNo || 'N/A'}</span>
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                            {req.status !== 'APPROVED' && (
                              <button
                                type="button"
                                onClick={() => handleApproveRequest(req)}
                                disabled={isProcessing}
                                className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer transition-colors disabled:opacity-50"
                              >
                                {isProcessing ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4" />
                                )}
                                <span>Approve & Create Office</span>
                              </button>
                            )}
                            {req.status === 'PENDING' && (
                              <button
                                type="button"
                                onClick={() => handleRejectRequest(req)}
                                disabled={isProcessing}
                                className="py-2.5 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                              >
                                <XCircle className="w-4 h-4" />
                                <span>Reject</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : isLoadingOffices ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
                <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
                <span className="text-xs font-bold">Loading registered offices...</span>
              </div>
            ) : filteredOffices.length === 0 ? (
              <div className="p-10 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center space-y-2">
                <Database className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  No Registered Offices Found
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredOffices.map((office) => {
                  const officeCode =
                    office.officeCode || office.firebaseConfig?.officeCode || office.projectId;
                  const key = `${office.projectId}_${officeCode}`;
                  const isCopied = copiedProjectId === key;
                  const isEntering = enteringProjectId === key;
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
                            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                              {office.totalUsers || 0} Users
                            </span>
                          </div>

                          <div className="mt-1 flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                            <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">
                              Code: <strong className="text-emerald-600 dark:text-emerald-400">{officeCode}</strong>
                              {office.joinPin || office.firebaseConfig?.joinPin
                                ? ` · PIN: ${office.joinPin || office.firebaseConfig?.joinPin}`
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

