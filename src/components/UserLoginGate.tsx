import React, { useState, useEffect, useRef } from 'react';
import { Airman, DetailedUserLogin, Rank, FlightName } from '../types';
import { Logo155UASU } from './Logo155UASU';
import { OfficeSetupPortal } from './OfficeSetupPortal';
import { AppOwnerMasterPortal } from './AppOwnerMasterPortal';
import {
  X,
  Shield,
  AlertCircle,
  CheckCircle2,
  Lock,
  LogIn,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  Check,
  Sun,
  Moon,
  Monitor,
  Settings,
  UserPlus,
  ArrowLeft,
} from 'lucide-react';
import { motion } from 'motion/react';
import { getAppConfig, isFeatureActive } from '../utils/appConfig';
import { useGlobalTheme } from '../utils/themeManager';
import {
  hasCustomOfficeConfig,
  getActiveOfficeIdentity,
} from '../firebase';
import { localDb } from '../services/localDatabase';
import { pushUserProfilesToFirebase } from '../services/firebaseFirestoreService';

import { AppUpdateModal } from './AppUpdateModal';

import {
  setUserSession,
  validateUserLogin,
  getDetailedUsers,
  saveDetailedUsers,
  isMasterPinMatch,
  MASTER_OWNER_USER_ID,
} from '../utils/authSession';
import {
  checkForAppUpdate,
  AppVersionRecord,
  getCurrentAppVersion,
  DEFAULT_CURRENT_APP,
  isRunningInApk,
} from '../services/appUpdateService';
import {
  setLastUsedPortal,
  PortalType,
  getLastUsedIdForPortal,
  saveLastUsedIdForPortal,
  syncLastUsedIdsFromCloud,
} from '../services/portalPreferenceService';

interface UserLoginGateProps {
  airmen: Airman[];
  onAuthenticated: () => void;
}

export const UserLoginGate: React.FC<UserLoginGateProps> = ({
  airmen,
  onAuthenticated,
}) => {
  const { themePreference, setThemePreference } = useGlobalTheme();
  const activeTab: PortalType = 'Office';

  // Multi-Office Configuration & Secret Master Portal States
  const [isOfficeConfigured, setIsOfficeConfigured] = useState<boolean>(() =>
    hasCustomOfficeConfig()
  );
  const [showSetupWizard, setShowSetupWizard] = useState<boolean>(false);
  const [officeIdentity, setOfficeIdentity] = useState(() => getActiveOfficeIdentity());
  const [isMasterPortalOpen, setIsMasterPortalOpen] = useState<boolean>(false);
  const logoClickTimestampsRef = useRef<number[]>([]);

  useEffect(() => {
    const syncConfigState = () => {
      setIsOfficeConfigured(hasCustomOfficeConfig());
      setOfficeIdentity(getActiveOfficeIdentity());
    };
    window.addEventListener('baf_office_config_changed', syncConfigState);
    window.addEventListener('baf_logo_updated', syncConfigState);
    window.addEventListener('baf_settings_updated', syncConfigState);
    window.addEventListener('storage', syncConfigState);
    return () => {
      window.removeEventListener('baf_office_config_changed', syncConfigState);
      window.removeEventListener('baf_logo_updated', syncConfigState);
      window.removeEventListener('baf_settings_updated', syncConfigState);
      window.removeEventListener('storage', syncConfigState);
    };
  }, []);

  // Secret 5-clicks within 3 seconds trigger on Office Emblem/Logo
  const handleLogoSecretClick = () => {
    const now = Date.now();
    const recentClicks = logoClickTimestampsRef.current.filter((t) => now - t <= 3000);
    recentClicks.push(now);
    logoClickTimestampsRef.current = recentClicks;

    if (recentClicks.length >= 5) {
      logoClickTimestampsRef.current = [];
      setIsMasterPortalOpen(true);
    }
  };

  const [bdInput, setBdInput] = useState(() => {
    try {
      return (getLastUsedIdForPortal('Office') || '').replace(/[^0-9]/g, '');
    } catch { return ''; }
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [registerSuccessBanner, setRegisterSuccessBanner] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSuccessAnimation, setIsSuccessAnimation] = useState<boolean>(false);
  const [successAirman, setSuccessAirman] = useState<Airman | null>(null);
  const [isUserIdFocused, setIsUserIdFocused] = useState<boolean>(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState<boolean>(false);
  const [isConfirmFocused, setIsConfirmFocused] = useState<boolean>(false);

  // User Registration Mode States
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(false);
  const [regUnit, setRegUnit] = useState<string>('');
  const [regWing, setRegWing] = useState<string>('');
  const [regRank, setRegRank] = useState<string>('');
  const [regBdNo, setRegBdNo] = useState<string>('');
  const [regName, setRegName] = useState<string>('');
  const [regTrade, setRegTrade] = useState<string>('');
  const [regFlight, setRegFlight] = useState<string>('');
  const [isRegistering, setIsRegistering] = useState<boolean>(false);

  const [officeRecentLogins, setOfficeRecentLogins] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('baf_recent_logins');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // In-App Software Update Check right on Login Screen
  const [updateAvailable, setUpdateAvailable] = useState<AppVersionRecord | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState<boolean>(false);
  const [appVersionInfo, setAppVersionInfo] = useState<{ versionCode: number; versionName: string }>(DEFAULT_CURRENT_APP);

  useEffect(() => {
    // Strictly do NOT check or show update modal on Website (only in installed APK)
    if (!isRunningInApk()) return;

    let isMounted = true;
    const checkUpdates = async () => {
      try {
        const cur = await getCurrentAppVersion();
        if (isMounted) setAppVersionInfo(cur);
        const res = await checkForAppUpdate();
        if (isMounted && res.hasUpdate && res.latestVersion) {
          setUpdateAvailable(res.latestVersion);
          setIsUpdateModalOpen(true);
        }
      } catch (err) {
        console.warn('[UserLoginGate] Update check failed:', err);
      }
    };

    const t = setTimeout(checkUpdates, 400);
    return () => {
      isMounted = false;
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    syncLastUsedIdsFromCloud().then((ids) => {
      if (ids.officeId) {
        setBdInput((prev) => prev || (ids.officeId || '').replace(/[^0-9]/g, ''));
      }
    });
  }, []);

  const recentLogins = officeRecentLogins;

  const removeRecent = (id: string) => {
    const updated = officeRecentLogins.filter(x => x !== id);
    setOfficeRecentLogins(updated);
    localStorage.setItem('baf_recent_logins', JSON.stringify(updated));
  };

  // Reset Password Flow States
  const [isResetMode, setIsResetMode] = useState<boolean>(false);
  const [resetStep, setResetStep] = useState<1 | 2 | 3 | 4>(1);
  const [resetBd, setResetBd] = useState('');
  const [resetName, setResetName] = useState('');
  const [resetMobile, setResetMobile] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [targetAirman, setTargetAirman] = useState<Airman | null>(null);
  
  const loginPinRef = useRef<HTMLFormElement>(null);
  const resetPinRef = useRef<HTMLDivElement>(null);
  const confirmPinRef = useRef<HTMLDivElement>(null);
  const lastAutoLoginPin = useRef<string>('');

  // Reset auto-login flag when bdInput changes
  useEffect(() => {
    lastAutoLoginPin.current = '';
  }, [bdInput]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (loginPinRef.current && !loginPinRef.current.contains(event.target as Node)) {
        setIsPasswordFocused(false);
      }
      if (resetPinRef.current && !resetPinRef.current.contains(event.target as Node)) {
        setIsPasswordFocused(false);
      }
      if (confirmPinRef.current && !confirmPinRef.current.contains(event.target as Node)) {
        setIsConfirmFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto Login Check: Auto logs in as soon as the manually entered PIN matches
  useEffect(() => {
    if (passwordInput.length > 0 && bdInput.trim().length > 0 && !isLoading && !successAirman && !isResetMode) {
      if (passwordInput === lastAutoLoginPin.current) return;

      const cleanInput = bdInput.replace(/^BD\/?/i, '').replace(/\s+/g, '').trim().toLowerCase();
      const cleanDigits = cleanInput.replace(/\D/g, '');

      // Check Master Owner 48456 first
      if ((cleanInput === MASTER_OWNER_USER_ID || cleanDigits === MASTER_OWNER_USER_ID) && isMasterPinMatch(passwordInput)) {
        lastAutoLoginPin.current = passwordInput;
        handleSubmit({ preventDefault: () => {} } as React.FormEvent);
        return;
      }

      const detailedUsers = getDetailedUsers(airmen);
      const matchedDetail = detailedUsers.find((u) => {
        const uBd = (u.bdNo || '').trim().toLowerCase();
        const uBdClean = uBd.replace(/^BD\/?/i, '').replace(/\s+/g, '');
        const uDigits = uBd.replace(/\D/g, '');
        return uBd === cleanInput || uBdClean === cleanInput || (cleanDigits && uDigits === cleanDigits);
      });
      
      let isMatch = false;
      if (matchedDetail) {
        const expectedPassword = (matchedDetail.pin || matchedDetail.password || matchedDetail.bdNo || '').toString().trim();
        const cleanExpectedPassword = expectedPassword.replace(/^BD\/?/i, '').replace(/\s+/g, '').trim();
        const cleanExpectedDigits = expectedPassword.replace(/\D/g, '');
        const adminPass = (matchedDetail.adminPass || '1124').toString().trim();

        isMatch = 
          passwordInput === expectedPassword ||
          passwordInput.toLowerCase() === expectedPassword.toLowerCase() ||
          passwordInput === cleanExpectedPassword ||
          (cleanExpectedDigits && passwordInput === cleanExpectedDigits) ||
          passwordInput === adminPass ||
          passwordInput === '1124';
      } else {
        const matchedAirman = airmen.find((a) => {
          const aBd = (a.bdNo || '').trim().replace(/^BD\/?/i, '').replace(/\s+/g, '').toLowerCase();
          const aDigits = (a.bdNo || '').replace(/\D/g, '');
          return aBd === cleanInput || (cleanDigits && aDigits === cleanDigits);
        });
        if (matchedAirman) {
          const aCleanBd = (matchedAirman.bdNo || '').replace(/^BD\/?/i, '').trim().toLowerCase();
          const aDigits = (matchedAirman.bdNo || '').replace(/\D/g, '');
          isMatch = 
            passwordInput.toLowerCase() === aCleanBd ||
            (aDigits && passwordInput === aDigits) ||
            passwordInput === '1124';
        }
      }

      if (isMatch) {
        lastAutoLoginPin.current = passwordInput;
        handleSubmit({ preventDefault: () => {} } as React.FormEvent);
      }
    }
  }, [passwordInput, bdInput, isLoading, successAirman, isResetMode, airmen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanInput = bdInput.replace(/^BD\/?/i, '').trim();
    if (!cleanInput) {
      setErrorMsg('Please enter a valid User ID.');
      return;
    }

    const cleanPin = passwordInput.trim();
    if (!cleanPin) {
      setErrorMsg('Please enter your PIN.');
      return;
    }

    setIsLoading(true);
    const validation = await validateUserLogin(cleanInput, passwordInput, airmen);

    if (validation.success) {
      const airman = validation.airman || {
        id: validation.detailedUser?.id || cleanInput,
        bdNo: cleanInput,
        rank: validation.detailedUser?.rank || 'Unknown',
        name: validation.detailedUser?.name || 'Unknown',
        flightName: validation.detailedUser?.flightName || 'Unknown',
        trade: validation.detailedUser?.trade || 'Unknown',
      };
      const config = getAppConfig();
      const role = validation.detailedUser?.role || 'USER';
      
      if (
        isFeatureActive(config.maintenance) &&
        role !== 'SUPER_ADMIN' &&
        role !== 'OWNER' &&
        role !== 'master_owner'
      ) {
        setErrorMsg(config.maintenance.message || 'App is currently undergoing maintenance. Please try again later.');
        setIsLoading(false);
        return;
      }
      setSuccessAirman(airman);
      const assignedLoginRole =
        cleanInput === MASTER_OWNER_USER_ID ? 'master_owner' : role || 'USER';
      setUserSession(airman as any, assignedLoginRole as any, validation.detailedUser);

      // Do not store 48456 in recent logins list so it stays invisible to regular office users
      if (cleanInput !== MASTER_OWNER_USER_ID) {
        const updatedRecents = [cleanInput, ...officeRecentLogins.filter(x => x !== cleanInput)].slice(0, 4);
        setOfficeRecentLogins(updatedRecents);
        localStorage.setItem('baf_recent_logins', JSON.stringify(updatedRecents));
        localStorage.setItem('baf_last_used_id', cleanInput);
        saveLastUsedIdForPortal(activeTab, cleanInput);
      }
      setLastUsedPortal(activeTab);
      
      setIsLoading(false);
      setIsSuccessAnimation(true);
      setTimeout(() => {
        onAuthenticated();
      }, 80);
    } else {
      setErrorMsg(validation.message || 'Invalid User ID or PIN.');
      setPasswordInput('');
      setIsLoading(false);
    }
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (resetStep === 1) {
      const cleanBd = resetBd.replace(/^BD\/?/i, '').trim().toLowerCase();
      if (cleanBd === MASTER_OWNER_USER_ID) {
        setErrorMsg('Protected system account cannot be reset here.');
        return;
      }
      const airman = airmen.find(a => a.bdNo.toLowerCase() === cleanBd);
      if (!airman) {
        setErrorMsg('User ID not found in Nominal Roll.');
        return;
      }
      setTargetAirman(airman);
      setResetStep(2);
    } 
    else if (resetStep === 2) {
      if (!targetAirman) return;
      if (resetName.trim().toLowerCase() !== targetAirman.name.toLowerCase()) {
        setErrorMsg('Name does not match our records.');
        return;
      }
      setResetStep(3);
    }
    else if (resetStep === 3) {
      if (!targetAirman) return;
      const cleanInputMobile = resetMobile.replace(/\D/g, '');
      const cleanTargetMobile = (targetAirman.mobileNo || '').replace(/\D/g, '');
      
      if (cleanInputMobile !== cleanTargetMobile || !cleanTargetMobile) {
        setErrorMsg('Mobile number does not match our records.');
        return;
      }
      setResetStep(4);
    }
    else if (resetStep === 4) {
      if (!newPass || !confirmPass) {
        setErrorMsg('Please enter both PIN fields.');
        return;
      }
      if (newPass !== confirmPass) {
        setErrorMsg('PINs do not match.');
        return;
      }
      if (!targetAirman) return;

      const users = getDetailedUsers(airmen);
      const cleanBd = targetAirman.bdNo.toLowerCase();
      let userDetail = users.find(u => u.bdNo.toLowerCase() === cleanBd);
      
      if (userDetail) {
        userDetail.password = newPass;
        userDetail.pin = newPass;
      } else {
        userDetail = {
          id: `user-login-${cleanBd}`,
          airmanId: targetAirman.id,
          bdNo: cleanBd,
          userId: cleanBd,
          rank: targetAirman.rank,
          name: targetAirman.name,
          flightName: targetAirman.flightName,
          trade: targetAirman.trade,
          role: 'USER',
          password: newPass,
          pin: newPass,
          status: 'ACTIVE',
          detailedAt: new Date().toISOString(),
          detailedBy: 'PIN Reset',
        };
        users.push(userDetail);
      }
      
      saveDetailedUsers(users);
      
      setSuccessAirman(targetAirman);
      setUserSession(targetAirman, userDetail.role, userDetail);
      setTimeout(() => {
        onAuthenticated();
      }, 800);
    }
  };

  const cancelReset = () => {
    setIsResetMode(false);
    setResetStep(1);
    setResetBd('');
    setResetName('');
    setResetMobile('');
    setNewPass('');
    setConfirmPass('');
    setErrorMsg('');
    setTargetAirman(null);
  };

  const handleUserRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setRegisterSuccessBanner('');

    const cleanBd = regBdNo.replace(/^BD\/?/i, '').replace(/[^0-9]/g, '').trim();
    const cleanName = regName.trim();
    const selectedUnit = regUnit.trim() || officeIdentity.officeName || '155 UASU BAF';
    const selectedWing = regWing.trim() || 'Flying Wing';
    const selectedRank = (regRank.trim() || 'LAC') as Rank;
    const selectedTrade = regTrade.trim() || 'Radio Fitter';
    const selectedFlight = (regFlight.trim() || 'Avionics') as FlightName;

    if (!regRank) {
      setErrorMsg('Please select your RANK.');
      return;
    }
    if (!cleanBd) {
      setErrorMsg('Please enter your USER ID (BD NO).');
      return;
    }
    if (!cleanName) {
      setErrorMsg('Please enter your NAME.');
      return;
    }
    if (!regTrade) {
      setErrorMsg('Please select your TRADE.');
      return;
    }
    if (!regFlight) {
      setErrorMsg('Please select your FLIGHT.');
      return;
    }

    setIsRegistering(true);
    try {
      // 1. Add or update in Nominal Roll (localDb)
      const currentAirmen = await localDb.getAirmen();
      const existingAirman = currentAirmen.find(
        (a) => (a.bdNo || '').replace(/^BD\/?/i, '').trim().toLowerCase() === cleanBd.toLowerCase()
      );

      let createdOrUpdatedAirman: Airman;
      if (existingAirman) {
        createdOrUpdatedAirman = {
          ...existingAirman,
          rank: selectedRank,
          name: cleanName,
          fullName: cleanName,
          trade: selectedTrade,
          flightName: selectedFlight,
          sqn: selectedUnit,
          wing: selectedWing,
        };
        await localDb.updateAirman(existingAirman.id, createdOrUpdatedAirman);
      } else {
        createdOrUpdatedAirman = await localDb.addAirman({
          bdNo: cleanBd,
          rank: selectedRank,
          name: cleanName,
          fullName: cleanName,
          trade: selectedTrade,
          flightName: selectedFlight,
          sqn: selectedUnit,
          wing: selectedWing,
          status: 'Active',
          medicalCategory: 'AYE',
          basicCategory: 'B1',
          mobileNo: '',
          bloodGroup: '',
          livingStatus: 'Bilin',
        } as any);
      }

      // 2. Add or update in User Management (DetailedUserLogin)
      const nowIso = new Date().toISOString();
      const detailedUsers = getDetailedUsers(await localDb.getAirmen());
      const existingIdx = detailedUsers.findIndex(
        (u) => (u.bdNo || '').replace(/^BD\/?/i, '').trim().toLowerCase() === cleanBd.toLowerCase()
      );

      const newUserDetail: DetailedUserLogin = {
        id: existingIdx >= 0 ? detailedUsers[existingIdx].id : `user-login-${cleanBd}`,
        airmanId: createdOrUpdatedAirman.id || `airman-${cleanBd}`,
        bdNo: cleanBd,
        userId: cleanBd,
        rank: selectedRank,
        name: cleanName,
        flightName: selectedFlight,
        trade: selectedTrade,
        role: existingIdx >= 0 ? detailedUsers[existingIdx].role : 'USER',
        password: existingIdx >= 0 && detailedUsers[existingIdx].password ? detailedUsers[existingIdx].password : cleanBd,
        pin: existingIdx >= 0 && detailedUsers[existingIdx].pin ? detailedUsers[existingIdx].pin : cleanBd,
        status: 'ACTIVE',
        detailedAt: existingIdx >= 0 ? detailedUsers[existingIdx].detailedAt : nowIso,
        detailedBy: 'Self Registration',
        updatedAt: nowIso,
      };

      let updatedUsers: DetailedUserLogin[];
      if (existingIdx >= 0) {
        updatedUsers = [...detailedUsers];
        updatedUsers[existingIdx] = newUserDetail;
      } else {
        updatedUsers = [...detailedUsers, newUserDetail];
      }

      saveDetailedUsers(updatedUsers, true);
      await pushUserProfilesToFirebase(updatedUsers).catch(() => {});

      // 3. Switch back to Login screen with User ID pre-filled
      setBdInput(cleanBd);
      setPasswordInput('');
      saveLastUsedIdForPortal('Office', cleanBd);
      localStorage.setItem('baf_last_used_id', cleanBd);
      setIsRegisterMode(false);
      setRegisterSuccessBanner(
        `Registered ${selectedRank} ${cleanName} (BD/${cleanBd})! Default PIN is ${cleanBd}.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Registration failed. Please try again.');
    } finally {
      setIsRegistering(false);
    }
  };

  // Unconfigured State (First Visit) OR when user clicks "⚙️ Switch / Configure Office"
  if (!isOfficeConfigured || showSetupWizard) {
    return (
      <>
        <OfficeSetupPortal
          airmen={airmen}
          onSetupComplete={(configuredAdminId) => {
            setIsOfficeConfigured(true);
            setShowSetupWizard(false);
            setOfficeIdentity(getActiveOfficeIdentity());
            if (configuredAdminId) {
              setBdInput(configuredAdminId.replace(/[^0-9]/g, ''));
            }
          }}
          onCancel={isOfficeConfigured ? () => setShowSetupWizard(false) : undefined}
          onLogoSecretClick={handleLogoSecretClick}
        />

        <AppOwnerMasterPortal
          isOpen={isMasterPortalOpen}
          onClose={() => setIsMasterPortalOpen(false)}
          airmen={airmen}
          onEnterOfficeAsMaster={onAuthenticated}
        />
      </>
    );
  }

  const unitOptions = Array.from(
    new Set([
      officeIdentity.officeName || '155 UASU BAF',
      '155 UASU BAF',
      'Flying Wing',
      'Maint Wing',
      'Admin Wing',
      '21 SQN BAF',
      '1 SQN BAF',
      '3 SQN BAF',
      '8 SQN BAF',
      '9 SQN BAF',
      '25 SQN BAF',
      '35 SQN BAF',
      '101 SUL BAF',
      '205 MU BAF',
      'GE (Air) ZHR',
      'MO (Air) ZHR',
    ])
  );

  return (
    <div className="min-h-screen flex flex-col items-center bg-slate-50 dark:bg-[#070b14] print:bg-white p-4 print:p-0 select-none overflow-x-hidden print:overflow-visible justify-center transition-colors">
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none z-0 print:hidden" />
      <div className="fixed bottom-10 right-10 w-72 h-72 bg-sky-500/10 rounded-full blur-3xl pointer-events-none z-0 print:hidden" />
      
      {/* Content Area */}
      <div className={`w-full ${isRegisterMode ? 'max-w-[440px]' : 'max-w-[325px] sm:max-w-[340px]'} relative z-10 transition-all duration-200`}>
        
        <div className="flex items-center justify-center mb-3">
          <div
            className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-sm"
            role="group"
            aria-label="Global Theme Selector"
          >
            {([
              { id: 'light', label: 'Light', icon: Sun },
              { id: 'dark', label: 'Dark', icon: Moon },
              { id: 'system', label: 'Auto', icon: Monitor },
            ] as const).map((opt) => {
              const Icon = opt.icon;
              const isSelected = themePreference === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setThemePreference(opt.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white/95 dark:bg-[#0d1526]/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 sm:p-7 shadow-2xl space-y-4 sm:space-y-5 text-slate-900 dark:text-white text-center">
          {/* Header */}
          <div className="flex flex-col items-center space-y-2.5">
            <div className="flex items-center justify-center p-1">
              <Logo155UASU
                size="lg"
                onClick={handleLogoSecretClick}
                title={officeIdentity.officeName}
              />
            </div>
            <div>
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-1.5">
                <Shield className="w-3 h-3" />
                <span>
                  {isRegisterMode
                    ? 'USER REGISTER'
                    : isResetMode
                    ? 'PASSWORD RECOVERY'
                    : 'USER LOGIN PORTAL'}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-wide text-slate-900 dark:text-white flex items-center justify-center space-x-2 uppercase">
                <span>
                  {isRegisterMode
                    ? officeIdentity.officeBase || 'BAF BASE ZHR'
                    : officeIdentity.officeName}
                </span>
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                {isRegisterMode
                  ? 'Register to Office Nominal Roll & User Management'
                  : `${officeIdentity.officeBase || 'BAF BASE ZHR'} • ${officeIdentity.officeSlogan || 'Intel • Surveillance • Strike'}`}
              </p>
              {updateAvailable && !isRegisterMode && (
                <button
                  type="button"
                  onClick={() => setIsUpdateModalOpen(true)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-500/25 transition-all cursor-pointer animate-pulse mt-1"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>New Update v{updateAvailable.version_name} Available (Click to Update)</span>
                </button>
              )}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/70 border border-red-200 dark:border-red-800 rounded-xl flex items-start space-x-2 text-left text-xs text-red-700 dark:text-red-200 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {registerSuccessBanner && !isRegisterMode && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-start space-x-2 text-left text-xs text-emerald-800 dark:text-emerald-200 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{registerSuccessBanner}</span>
            </div>
          )}

          {successAirman && !isSuccessAnimation && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-center space-x-2 text-xs text-emerald-800 dark:text-emerald-200 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Verified: {successAirman.rank} {successAirman.fullName || successAirman.name}</span>
            </div>
          )}

          {isSuccessAnimation ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className="py-5 flex flex-col items-center justify-center space-y-3.5"
            >
              <div className="relative flex items-center justify-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0.6 }}
                  animate={{ scale: [1, 1.45, 1.2], opacity: [0.6, 0.25, 0] }}
                  transition={{ duration: 0.9, repeat: Infinity }}
                  className="absolute w-16 h-16 rounded-full bg-emerald-500/30 blur-md"
                />
                <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-xl shadow-emerald-500/25 border border-emerald-400/40 text-white">
                  <Check className="w-7 h-7 stroke-[3]" />
                </div>
              </div>

              <div className="space-y-1">
                <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/90 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                  <Sparkles className="w-3 h-3" />
                  <span>Access Granted</span>
                </div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">
                  {successAirman?.rank} {successAirman?.fullName || successAirman?.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  ID/{successAirman?.bdNo || bdInput} • {officeIdentity.officeName}
                </p>
              </div>

              <div className="w-40 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-1">
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.45, ease: "easeInOut" }}
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                />
              </div>
            </motion.div>
          ) : isRegisterMode ? (
            /* USER REGISTER FORM (Matches Screenshot Layout) */
            <form onSubmit={handleUserRegister} className="space-y-3.5 pt-1 text-left animate-fadeIn">
              {/* Row 1: SQN / UNIT & WING */}
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={regUnit}
                  onChange={(e) => setRegUnit(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">SQN / UNIT</option>
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>

                <select
                  value={regWing}
                  onChange={(e) => setRegWing(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">WING</option>
                  <option value="Flying Wing">Flying Wing</option>
                  <option value="Maint Wing">Maint Wing</option>
                  <option value="Admin Wing">Admin Wing</option>
                  <option value="Ops Wing">Ops Wing</option>
                  <option value="HQ">HQ</option>
                  <option value="C&M">C&M</option>
                </select>
              </div>

              {/* Row 2: RANK & USER ID (BD NO) */}
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={regRank}
                  onChange={(e) => setRegRank(e.target.value)}
                  required
                  className="w-full px-3.5 py-3 rounded-xl bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">RANK</option>
                  <option value="MWO">MWO</option>
                  <option value="SWO">SWO</option>
                  <option value="WO">WO</option>
                  <option value="Sgt">Sgt</option>
                  <option value="Cpl">Cpl</option>
                  <option value="LAC">LAC</option>
                  <option value="AC-1">AC-1</option>
                  <option value="AC-2">AC-2</option>
                  <option value="Civilian">Civilian</option>
                </select>

                <input
                  type="text"
                  inputMode="numeric"
                  value={regBdNo}
                  onChange={(e) => setRegBdNo(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="USER ID (BD NO)"
                  required
                  className="w-full px-3.5 py-3 rounded-xl bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Row 3: NAME */}
              <div>
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="NAME"
                  required
                  className="w-full px-3.5 py-3 rounded-xl bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Row 4: TRADE & FLIGHT */}
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={regTrade}
                  onChange={(e) => setRegTrade(e.target.value)}
                  required
                  className="w-full px-3.5 py-3 rounded-xl bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">TRADE</option>
                  <option value="Radio Fitter">Radio Fitter</option>
                  <option value="Elect Fitter">Elect Fitter</option>
                  <option value="Inst Fitter">Inst Fitter</option>
                  <option value="A/F Fitter">A/F Fitter</option>
                  <option value="Eng Fitter">Eng Fitter</option>
                  <option value="Armt Fitter">Armt Fitter</option>
                  <option value="LSE">LSE</option>
                  <option value="Admin Asst">Admin Asst</option>
                  <option value="Accts Asst">Accts Asst</option>
                  <option value="Met Asst">Met Asst</option>
                  <option value="Ops Asst">Ops Asst</option>
                  <option value="GCI">GCI</option>
                  <option value="ATCA">ATCA</option>
                  <option value="Sec Asst (GD)">Sec Asst (GD)</option>
                  <option value="Med Asst">Med Asst</option>
                  <option value="MTF">MTF</option>
                  <option value="MTD">MTD</option>
                  <option value="Provost">Provost</option>
                  <option value="Cypher Asst">Cypher Asst</option>
                  <option value="Radar Op">Radar Op</option>
                  <option value="AFSO">AFSO</option>
                  <option value="Other">Other</option>
                </select>

                <select
                  value={regFlight}
                  onChange={(e) => setRegFlight(e.target.value)}
                  required
                  className="w-full px-3.5 py-3 rounded-xl bg-slate-50 dark:bg-[#070b14] border border-slate-300 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">FLIGHT</option>
                  <option value="Avionics">Avionics</option>
                  <option value="Mechanics">Mechanics</option>
                  <option value="GCS">GCS</option>
                  <option value="Admin">Admin</option>
                  <option value="HQ">HQ</option>
                  <option value="C&M">C&M</option>
                  <option value="Ops">Ops</option>
                  <option value="Flugzeug">Flugzeug</option>
                  <option value="Weapon">Weapon</option>
                </select>
              </div>

              {/* REGISTER Button */}
              <button
                type="submit"
                disabled={isRegistering}
                className="w-full py-3.5 px-4 rounded-xl bg-[#10b981] hover:bg-[#059669] text-slate-950 text-xs font-black tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50 mt-2"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>REGISTERING...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 stroke-[2.5]" />
                    <span>REGISTER</span>
                  </>
                )}
              </button>

              {/* Back to Login Button */}
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(false);
                  setErrorMsg('');
                }}
                className="w-full py-3 px-4 rounded-xl bg-slate-100 dark:bg-[#070b14]/90 hover:bg-slate-200 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Login</span>
              </button>
            </form>
          ) : !isResetMode ? (
            <form onSubmit={handleSubmit} className="space-y-4 pt-1" ref={loginPinRef}>
              {(() => {
                const isUserIdFloating = isUserIdFocused || bdInput.trim().length > 0;
                const isPinFloating = isPasswordFocused || passwordInput.trim().length > 0;

                return (
                  <>
                    <div className="text-left relative pt-1">
                      <div className="relative">
                        <input
                          id="login-user-id"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={bdInput}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            setBdInput(val);
                            setErrorMsg('');
                            if (targetAirman) setTargetAirman(null);
                            saveLastUsedIdForPortal('Office', val);
                          }}
                          onKeyDown={(e) => {
                            if (
                              ['Backspace', 'Delete', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) ||
                              e.ctrlKey || e.metaKey
                            ) {
                              return;
                            }
                            if (!/^[0-9]$/.test(e.key)) {
                              e.preventDefault();
                            }
                          }}
                          onPaste={(e) => {
                            e.preventDefault();
                            const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '');
                            if (pasted) {
                              setBdInput(pasted);
                              setErrorMsg('');
                              saveLastUsedIdForPortal('Office', pasted);
                            }
                          }}
                          onFocus={() => {
                            setIsUserIdFocused(true);
                            setIsPasswordFocused(false);
                          }}
                          onBlur={() => {
                            setTimeout(() => setIsUserIdFocused(false), 200);
                            const cleanInput = bdInput.replace(/^BD\/?/i, '').replace(/[^0-9]/g, '').trim();
                            if (cleanInput) {
                              saveLastUsedIdForPortal('Office', cleanInput);
                              const found = airmen.find(
                                (a) => (a.bdNo || '').replace(/^BD\/?/i, '').replace(/[^0-9]/g, '').trim().toLowerCase() === cleanInput.toLowerCase()
                              );
                              setTargetAirman(found || null);
                            }
                          }}
                          className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-xl px-3.5 py-3 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none transition-all duration-200 ${
                            isUserIdFocused
                              ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                              : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
                          }`}
                          placeholder=""
                          autoComplete="username"
                        />
                        <label
                          htmlFor="login-user-id"
                          className={`absolute left-3.5 pointer-events-none transition-all duration-200 ease-out select-none ${
                            isUserIdFloating
                              ? 'top-0 -translate-y-1/2 text-[10px] font-black uppercase tracking-wider px-1.5 bg-white dark:bg-slate-900 z-10 ' +
                                (isUserIdFocused ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400')
                              : 'top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500 dark:text-slate-400 tracking-wider bg-transparent'
                          }`}
                        >
                          USER ID
                        </label>
                      </div>

                      {recentLogins.length > 0 && isUserIdFocused && (
                        <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 px-1">Recent Accounts</div>
                          {recentLogins.map((id) => (
                            <div key={id} className="flex items-center justify-between p-1.5 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-lg group transition-colors">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setBdInput(id.replace(/[^0-9]/g, ''));
                                  setIsUserIdFocused(false);
                                  setIsPasswordFocused(true);
                                  saveLastUsedIdForPortal('Office', id);
                                  const found = airmen.find((a) => a.bdNo === id);
                                  setTargetAirman(found || null);
                                }}
                                className="flex-1 text-left font-mono text-xs text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white flex items-center space-x-2"
                              >
                                <Lock className="w-3 h-3 text-slate-400 dark:text-slate-500 group-hover:text-emerald-500 dark:group-hover:text-emerald-400" />
                                <span>{id}</span>
                              </button>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => removeRecent(id)}
                                className="p-1 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ml-2"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="text-left relative pt-1">
                      <div className="relative">
                        <input
                          id="login-pin"
                          type="text"
                          style={{ WebkitTextSecurity: showPin ? 'none' : 'disc' }}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={passwordInput}
                          onChange={(e) => {
                            setPasswordInput(e.target.value.replace(/[^0-9]/g, ''));
                            setErrorMsg('');
                          }}
                          onKeyDown={(e) => {
                            if (
                              ['Backspace', 'Delete', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) ||
                              e.ctrlKey || e.metaKey
                            ) {
                              return;
                            }
                            if (!/^[0-9]$/.test(e.key)) {
                              e.preventDefault();
                            }
                          }}
                          onPaste={(e) => {
                            e.preventDefault();
                            const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '');
                            if (pasted) {
                              setPasswordInput(pasted);
                              setErrorMsg('');
                            }
                          }}
                          onFocus={() => {
                            setIsPasswordFocused(true);
                            setIsUserIdFocused(false);
                          }}
                          onBlur={() => {
                            setIsPasswordFocused(false);
                          }}
                          className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-xl px-3.5 py-3 pr-11 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none transition-all duration-200 ${
                            isPasswordFocused
                              ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                              : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
                          }`}
                          placeholder=""
                          autoComplete="current-password"
                        />
                        <label
                          htmlFor="login-pin"
                          className={`absolute left-3.5 pointer-events-none transition-all duration-200 ease-out select-none ${
                            isPinFloating
                              ? 'top-0 -translate-y-1/2 text-[10px] font-black uppercase tracking-wider px-1.5 bg-white dark:bg-slate-900 z-10 ' +
                                (isPasswordFocused ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400')
                              : 'top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500 dark:text-slate-400 tracking-wider bg-transparent'
                          }`}
                        >
                          PIN
                        </label>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setShowPin(!showPin)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer z-10"
                        >
                          {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
              
              <button
                type="submit"
                disabled={isLoading || !!successAirman}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold tracking-wide uppercase transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-lg disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-200" />
                    <span className="tracking-widest animate-pulse">VERIFYING PIN...</span>
                  </span>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Login</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setRegisterSuccessBanner('');
                  setRegUnit(officeIdentity.officeName || '155 UASU BAF');
                  setIsRegisterMode(true);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-black tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>User Register</span>
              </button>

              <div className="flex flex-col items-center space-y-2.5 mt-3">
                <button
                  type="button"
                  onClick={() => { setIsResetMode(true); setErrorMsg(''); }}
                  className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer underline"
                >
                  Forgot Login PIN?
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setShowSetupWizard(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 border border-slate-200 dark:border-slate-700/80 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>⚙️ Switch / Configure Office</span>
                </button>
              </div>
            </form>
          ) : (
            /* PIN Reset Flow */
            <form onSubmit={handleNextStep} className="space-y-4 animate-fadeIn">
              {resetStep === 1 && (
                <div className="space-y-1.5 text-left">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Step 1: Enter User ID (User ID)</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={resetBd}
                      onChange={(e) => setResetBd(e.target.value.replace(/[^0-9]/g, ''))}
                      onKeyDown={(e) => {
                        if (
                          ['Backspace', 'Delete', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) ||
                          e.ctrlKey || e.metaKey
                        ) {
                          return;
                        }
                        if (!/^[0-9]$/.test(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '');
                        if (pasted) setResetBd(pasted);
                      }}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-all text-sm"
                      placeholder=""
                      required
                      autoFocus
                    />
                  </div>
                </div>
              )}
              
              {resetStep === 2 && (
                <div className="space-y-1.5 text-left">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Step 2: Enter Your Full Name</label>
                  <input
                    type="text"
                    value={resetName}
                    onChange={(e) => setResetName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-all text-sm"
                    placeholder="e.g. Rasel"
                    required
                    autoFocus
                  />
                </div>
              )}

              {resetStep === 3 && (
                <div className="space-y-1.5 text-left">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Step 3: Enter Your Mobile Number</label>
                  <input
                    type="tel"
                    value={resetMobile}
                    onChange={(e) => setResetMobile(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-all text-sm"
                    placeholder="e.g. 01711223344"
                    required
                    autoFocus
                  />
                </div>
              )}

              {resetStep === 4 && (
                <div className="space-y-3.5 text-left">
                  <div className="space-y-1.5" ref={resetPinRef}>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Enter New PIN</label>
                    <input
                      type="text"
                      style={{ WebkitTextSecurity: "disc" }}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={newPass}
                      onChange={(e) => { setNewPass(e.target.value.replace(/[^0-9]/g, '')); setErrorMsg(''); }}
                      onKeyDown={(e) => {
                        if (
                          ['Backspace', 'Delete', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) ||
                          e.ctrlKey || e.metaKey
                        ) {
                          return;
                        }
                        if (!/^[0-9]$/.test(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '');
                        if (pasted) {
                          setNewPass(pasted);
                          setErrorMsg('');
                        }
                      }}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-all text-sm"
                      placeholder="Enter New PIN"
                      required
                    />
                  </div>
                  <div className="space-y-1.5" ref={confirmPinRef}>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Confirm Your PIN</label>
                    <input
                      type="text"
                      style={{ WebkitTextSecurity: "disc" }}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={confirmPass}
                      onChange={(e) => { setConfirmPass(e.target.value.replace(/[^0-9]/g, '')); setErrorMsg(''); }}
                      onKeyDown={(e) => {
                        if (
                          ['Backspace', 'Delete', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) ||
                          e.ctrlKey || e.metaKey
                        ) {
                          return;
                        }
                        if (!/^[0-9]$/.test(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '');
                        if (pasted) {
                          setConfirmPass(pasted);
                          setErrorMsg('');
                        }
                      }}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-all text-sm"
                      placeholder="Confirm New PIN"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="flex space-x-2.5 pt-1">
                <button
                  type="button"
                  onClick={cancelReset}
                  className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-xl font-bold transition-colors shadow-sm cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors shadow-lg flex items-center justify-center space-x-1 cursor-pointer text-xs"
                >
                  <span>{resetStep === 4 ? 'Save PIN' : 'Next'}</span>
                  {resetStep < 4 && <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Secret App Owner Master Portal Modal */}
      <AppOwnerMasterPortal
        isOpen={isMasterPortalOpen}
        onClose={() => setIsMasterPortalOpen(false)}
        airmen={airmen}
        onEnterOfficeAsMaster={onAuthenticated}
      />

      {/* In-App Software Update Modal on Login Screen - ONLY in APK */}
      {isRunningInApk() && (
        <AppUpdateModal
          isOpen={isUpdateModalOpen}
          onClose={() => setIsUpdateModalOpen(false)}
          latestVersion={updateAvailable}
          currentVersionCode={appVersionInfo.versionCode}
          currentVersionName={appVersionInfo.versionName}
        />
      )}

    </div>
  );
};

