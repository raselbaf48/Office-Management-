import { initializeApp, getApps, getApp, setLogLevel as setFirebaseAppLogLevel, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUserType,
  Auth,
} from 'firebase/auth';
import {
  getFirestore as getFirestoreLite,
  initializeFirestore as initializeFirestoreLite,
  setLogLevel as setFirestoreLogLevel,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Firestore as FirestoreLite,
} from 'firebase/firestore/lite';
import firebaseConfigData from '../firebase-applet-config.json';
import { getRawLocalStorageItem, setRawLocalStorageItem } from './utils/safeStorage';

// ============================================================================
// 1. MASTER OWNER CONFIGURATION & CONSTANTS
// Paste your Master Firebase Config and Master PIN below:
// ============================================================================
export const MASTER_USER_ID = '48456';
export const MASTER_USER_PIN = 'YOUR_MASTER_PIN';

export const MASTER_OWNER_CONFIG = {
  apiKey: 'YOUR_MASTER_API_KEY',
  authDomain: 'YOUR_MASTER_AUTH_DOMAIN',
  projectId: 'YOUR_MASTER_PROJECT_ID',
  storageBucket: 'YOUR_MASTER_STORAGE_BUCKET',
  messagingSenderId: 'YOUR_MASTER_MESSAGING_SENDER_ID',
  appId: 'YOUR_MASTER_APP_ID',
  firestoreDatabaseId: '(default)',
};

export const CUSTOM_OFFICE_CONFIG_KEY = 'custom_office_config';
export const MASTER_OFFICES_CACHE_KEY = 'baf_master_registered_offices_cache';
export const OFFICE_PROFILE_STORAGE_KEY = 'baf_office_profile_v1';
export const GLOBAL_USER_OFFICE_MAP_KEY = 'baf_global_user_office_map_v1';
export const PENDING_OFFICE_REQUESTS_KEY = 'baf_pending_office_requests_v1';

export interface OfficeProfileData {
  officeName: string;
  officeLogo: string;
  officeSlogan: string;
  officeBase: string;
}

export interface PendingOfficeRegistrationRequest {
  id: string;
  // Step 1: Office Information
  officeName: string;
  officeCode: string;
  wing: string;
  officeBase: string;
  officeSlogan: string;
  officeLogo: string;
  // Step 2: User Information
  bdNo: string;
  rank: string;
  fullName: string;
  surname: string;
  trade: string;
  flightName: string;
  userRole: string;
  contactNo: string;
  pin: string;
  // Step 3: Approval Status
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
}

export interface GlobalUserOfficeEntry {
  bdNo: string;
  userName: string;
  rank: string;
  flightName?: string;
  trade?: string;
  role?: string;
  pin?: string;
  officeCode: string;
  officeName: string;
  officeLogo: string;
  officeSlogan: string;
  officeBase: string;
  isDefault155: boolean;
  isPostedOut?: boolean;
  active?: boolean;
  officeConfig?: CustomOfficeConfig;
  updatedAt: string;
}

export interface OfficeFirebaseConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
  officeCode?: string;
  joinPin?: string;
  officeSlogan?: string;
  officeBase?: string;
}

export interface CustomOfficeConfig {
  officeName: string;
  officeLogo: string;
  officeSlogan?: string;
  officeBase?: string;
  officeCode?: string;
  joinPin?: string;
  firebaseConfig: OfficeFirebaseConfig;
  configuredAt?: string;
  adminUserId?: string;
}

export interface RegisteredOfficeRecord {
  officeName: string;
  officeLogo: string;
  officeSlogan?: string;
  officeBase?: string;
  officeCode?: string;
  joinPin?: string;
  projectId: string;
  firebaseConfig: OfficeFirebaseConfig;
  totalUsers: number;
  createdAt: string;
  lastActive: string;
}

export type CustomFirebaseConfig = OfficeFirebaseConfig;
export type RegisteredOfficeTelemetry = RegisteredOfficeRecord;

try {
  setFirestoreLogLevel('silent');
  setFirebaseAppLogLevel('silent');
} catch {
  // Ignore logger configuration errors in restricted environments
}

// ============================================================================
// BASE64 & URL-SETUP HELPERS
// ============================================================================
export function encodeBase64Utf8(obj: unknown): string {
  const jsonStr = typeof obj === 'string' ? obj : JSON.stringify(obj);
  try {
    const bytes = new TextEncoder().encode(jsonStr);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return btoa(unescape(encodeURIComponent(jsonStr)));
  }
}

export function decodeBase64Utf8(encoded: string): string {
  const normalized = encoded
    .trim()
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return decodeURIComponent(escape(atob(padded)));
  }
}

export function parseFlexibleFirebaseConfig(rawInput: string): OfficeFirebaseConfig | null {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // 1. Try direct JSON parse
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      const target = parsed.firebaseConfig || parsed;
      if (target.apiKey && target.projectId) {
        return {
          apiKey: String(target.apiKey).trim(),
          authDomain: target.authDomain ? String(target.authDomain).trim() : `${String(target.projectId).trim()}.firebaseapp.com`,
          projectId: String(target.projectId).trim(),
          storageBucket: target.storageBucket ? String(target.storageBucket).trim() : `${String(target.projectId).trim()}.appspot.com`,
          messagingSenderId: target.messagingSenderId ? String(target.messagingSenderId).trim() : '',
          appId: target.appId ? String(target.appId).trim() : '',
          firestoreDatabaseId: target.firestoreDatabaseId ? String(target.firestoreDatabaseId).trim() : undefined,
        };
      }
    }
  } catch {
    // Fall through to JS object literal extraction
  }

  // 2. Extract key-value pairs from pasted Firebase Console JS snippet (e.g. const firebaseConfig = { apiKey: "...", ... })
  const extractKey = (key: string): string => {
    const regex = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`, 'i');
    const match = trimmed.match(regex);
    return match ? match[1].trim() : '';
  };

  const apiKey = extractKey('apiKey');
  const projectId = extractKey('projectId');
  if (!apiKey || !projectId) return null;

  return {
    apiKey,
    authDomain: extractKey('authDomain') || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: extractKey('storageBucket') || `${projectId}.appspot.com`,
    messagingSenderId: extractKey('messagingSenderId') || '',
    appId: extractKey('appId') || '',
    firestoreDatabaseId: extractKey('firestoreDatabaseId') || undefined,
  };
}

export const parseFirebaseConfigInput = parseFlexibleFirebaseConfig;

export function generateOfficeCodeFromName(officeName: string): string {
  const cleaned = String(officeName || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s-]/g, '')
    .trim();
  if (!cleaned) {
    return `OFF-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  const parts = cleaned.split(/[\s-]+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 8);
  }
  const code = parts.slice(0, 3).map((p) => p.slice(0, 4)).join('-');
  return code.slice(0, 12);
}

export function buildAutoCloudFirebaseConfig(
  officeName: string,
  officeCode?: string,
  joinPin?: string
): OfficeFirebaseConfig {
  const finalCode = (officeCode || generateOfficeCodeFromName(officeName)).toUpperCase().trim();
  return {
    apiKey: firebaseConfigData.apiKey,
    authDomain: firebaseConfigData.authDomain,
    projectId: firebaseConfigData.projectId,
    storageBucket: firebaseConfigData.storageBucket,
    messagingSenderId: firebaseConfigData.messagingSenderId,
    appId: firebaseConfigData.appId,
    firestoreDatabaseId: (firebaseConfigData as any).firestoreDatabaseId,
    officeCode: finalCode,
    ...(joinPin ? { joinPin: String(joinPin).trim() } : {}),
  };
}

export function validateCustomOfficePayload(raw: any): CustomOfficeConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const officeName = String(raw.officeName || '').trim();
  const fb = raw.firebaseConfig || firebaseConfigData;
  if (!officeName || !fb || typeof fb !== 'object') return null;
  const apiKey = String(fb.apiKey || firebaseConfigData.apiKey || '').trim();
  const projectId = String(fb.projectId || firebaseConfigData.projectId || '').trim();
  if (!apiKey || !projectId) return null;

  const officeCode = String(
    raw.officeCode || fb.officeCode || generateOfficeCodeFromName(officeName)
  )
    .toUpperCase()
    .trim();
  const joinPin = raw.joinPin || fb.joinPin ? String(raw.joinPin || fb.joinPin).trim() : undefined;

  const officeSlogan =
    raw.officeSlogan || fb.officeSlogan
      ? String(raw.officeSlogan || fb.officeSlogan).trim()
      : undefined;
  const officeBase =
    raw.officeBase || fb.officeBase
      ? String(raw.officeBase || fb.officeBase).trim()
      : undefined;

  return {
    officeName,
    officeLogo: String(raw.officeLogo || '/155-uasu-baf-logo.png').trim() || '/155-uasu-baf-logo.png',
    ...(officeSlogan ? { officeSlogan } : {}),
    ...(officeBase ? { officeBase } : {}),
    officeCode,
    joinPin,
    firebaseConfig: {
      apiKey,
      authDomain: fb.authDomain ? String(fb.authDomain).trim() : `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket: fb.storageBucket ? String(fb.storageBucket).trim() : `${projectId}.appspot.com`,
      messagingSenderId: fb.messagingSenderId ? String(fb.messagingSenderId).trim() : '',
      appId: fb.appId ? String(fb.appId).trim() : '',
      firestoreDatabaseId: fb.firestoreDatabaseId
        ? String(fb.firestoreDatabaseId).trim()
        : (firebaseConfigData as any).firestoreDatabaseId,
      officeCode,
      ...(joinPin ? { joinPin } : {}),
      ...(officeSlogan ? { officeSlogan } : {}),
      ...(officeBase ? { officeBase } : {}),
    },
    configuredAt: raw.configuredAt || new Date().toISOString(),
    adminUserId: raw.adminUserId ? String(raw.adminUserId).trim() : undefined,
  };
}

export function decodeOfficeSetupPayload(input: string): CustomOfficeConfig | null {
  if (!input || typeof input !== 'string') return null;
  let candidate = input.trim();

  // Check if full URL with ?setup=...
  if (candidate.includes('setup=')) {
    try {
      const urlObj = candidate.startsWith('http')
        ? new URL(candidate)
        : new URL(candidate, typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
      const param = urlObj.searchParams.get('setup');
      if (param) candidate = param.trim();
    } catch {
      const match = candidate.match(/[?&]setup=([^&#]+)/);
      if (match && match[1]) {
        try {
          candidate = decodeURIComponent(match[1].trim());
        } catch {
          candidate = match[1].trim();
        }
      }
    }
  }

  // Try raw JSON first
  if (candidate.startsWith('{')) {
    try {
      const parsed = JSON.parse(candidate);
      const valid = validateCustomOfficePayload(parsed);
      if (valid) return valid;
    } catch {}
  }

  // Try Base64 decode
  try {
    const decodedJson = decodeBase64Utf8(candidate);
    const parsed = JSON.parse(decodedJson);
    return validateCustomOfficePayload(parsed);
  } catch {
    return null;
  }
}

export function encodeOfficeSetupLink(config?: CustomOfficeConfig): string {
  const activeIdentity = getActiveOfficeIdentity();
  const effectiveConfig = config || getCustomOfficeConfig() || {
    officeName: activeIdentity.officeName,
    officeLogo: activeIdentity.officeLogo,
    officeSlogan: activeIdentity.officeSlogan,
    officeBase: activeIdentity.officeBase,
    firebaseConfig,
  };
  const payload = {
    officeName: effectiveConfig.officeName,
    officeLogo: effectiveConfig.officeLogo || '/155-uasu-baf-logo.png',
    officeSlogan: effectiveConfig.officeSlogan || activeIdentity.officeSlogan,
    officeBase: effectiveConfig.officeBase || activeIdentity.officeBase,
    firebaseConfig: effectiveConfig.firebaseConfig,
  };
  const encoded = encodeBase64Utf8(payload);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/?setup=${encodeURIComponent(encoded)}`;
}

// ============================================================================
// AUTO-SETUP VIA URL QUERY PARAMETER (?setup=<base64_encoded_json>)
// ============================================================================
function checkAndApplyUrlSetupParam(): CustomOfficeConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const setupParam = urlParams.get('setup');
    if (!setupParam) return null;

    const decoded = decodeOfficeSetupPayload(setupParam);
    if (decoded) {
      window.localStorage.setItem(CUSTOM_OFFICE_CONFIG_KEY, JSON.stringify(decoded));
      // Clean ?setup= from URL without reloading
      urlParams.delete('setup');
      const remainingQuery = urlParams.toString();
      const cleanUrl =
        window.location.pathname +
        (remainingQuery ? `?${remainingQuery}` : '') +
        window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
      return decoded;
    }
  } catch (err) {
    console.warn('[Firebase] Failed processing ?setup= query parameter:', err);
  }
  return null;
}

export function getCustomOfficeConfig(): CustomOfficeConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CUSTOM_OFFICE_CONFIG_KEY);
    if (!raw) return null;
    return validateCustomOfficePayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function hasCustomOfficeConfig(): boolean {
  return Boolean(getCustomOfficeConfig());
}

// Run URL ?setup= check immediately on module load
const urlSetupConfig = checkAndApplyUrlSetupParam();

// ============================================================================
// 1A. INITIALIZE MASTER OWNER FIREBASE INSTANCE (masterApp / masterDb / masterAuth)
// ============================================================================
const isMasterPlaceholder =
  !MASTER_OWNER_CONFIG.apiKey ||
  MASTER_OWNER_CONFIG.apiKey === 'YOUR_MASTER_API_KEY' ||
  MASTER_OWNER_CONFIG.projectId === 'YOUR_MASTER_PROJECT_ID';

const effectiveMasterConfig = !isMasterPlaceholder
  ? MASTER_OWNER_CONFIG
  : firebaseConfigData;

let masterAppInstance: FirebaseApp | null = null;
let masterDbInstance: FirestoreLite | null = null;
let masterAuthInstance: Auth | null = null;

if (effectiveMasterConfig && effectiveMasterConfig.apiKey && effectiveMasterConfig.projectId && effectiveMasterConfig.projectId !== 'remixed-project-id') {
  try {
    const existingMaster = getApps().find((a) => a.name === 'master_owner_app');
    masterAppInstance = existingMaster || initializeApp(effectiveMasterConfig, 'master_owner_app');
    const masterDbId = (effectiveMasterConfig as any).firestoreDatabaseId;
    try {
      masterDbInstance = initializeFirestoreLite(
        masterAppInstance,
        { ignoreUndefinedProperties: true },
        masterDbId && masterDbId !== '(default)' ? masterDbId : undefined
      );
    } catch {
      masterDbInstance = getFirestoreLite(
        masterAppInstance,
        masterDbId && masterDbId !== '(default)' ? masterDbId : undefined
      );
    }
    masterAuthInstance = getAuth(masterAppInstance);
  } catch (err) {
    console.warn('[Firebase] Master instance initialization notice:', err);
  }
}

export const masterApp = masterAppInstance as FirebaseApp;
export const masterDb = masterDbInstance as FirestoreLite;
export const masterAuth = masterAuthInstance as Auth;

// ============================================================================
// 1B. INITIALIZE DYNAMIC OFFICE FIREBASE INSTANCE (officeApp / officeDb / officeAuth)
// ============================================================================
let activeCustomOffice: CustomOfficeConfig | null = urlSetupConfig || getCustomOfficeConfig();

function resolveActiveOfficeFirebaseConfig(): OfficeFirebaseConfig {
  const custom = getCustomOfficeConfig();
  if (custom && custom.firebaseConfig?.apiKey && custom.firebaseConfig?.projectId) {
    return custom.firebaseConfig;
  }
  return firebaseConfigData as OfficeFirebaseConfig;
}

export let firebaseConfig: OfficeFirebaseConfig = resolveActiveOfficeFirebaseConfig();

export let isFirebaseConfigured: boolean = Boolean(
  firebaseConfig &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== 'remixed-project-id' &&
  firebaseConfig.apiKey
);

let officeAppInstance: FirebaseApp | null = null;
let officeDbInstance: FirestoreLite | null = null;
let officeAuthInstance: Auth | null = null;

export let officeApp: FirebaseApp = null as unknown as FirebaseApp;
export let officeDb: FirestoreLite = null as unknown as FirestoreLite;
export let officeAuth: Auth = null as unknown as Auth;

// Legacy aliases used across existing services
export let app: FirebaseApp = null as unknown as FirebaseApp;
export let db: FirestoreLite = null as unknown as FirestoreLite;
export let dbLite: FirestoreLite = null as unknown as FirestoreLite;
export let auth: Auth = null as unknown as Auth;

function initDynamicOfficeFirebase(customCfg?: CustomOfficeConfig | null): void {
  activeCustomOffice = customCfg !== undefined ? customCfg : getCustomOfficeConfig();
  const targetFbConfig = activeCustomOffice?.firebaseConfig || (firebaseConfigData as OfficeFirebaseConfig);
  firebaseConfig = targetFbConfig;
  isFirebaseConfigured = Boolean(
    targetFbConfig &&
    targetFbConfig.projectId &&
    targetFbConfig.projectId !== 'remixed-project-id' &&
    targetFbConfig.apiKey
  );

  if (!isFirebaseConfigured) return;

  try {
    const appName = activeCustomOffice
      ? `office_app_${targetFbConfig.projectId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : '[DEFAULT]';

    const existing = getApps().find((a) => a.name === appName);
    officeAppInstance = existing || (appName === '[DEFAULT]' ? initializeApp(targetFbConfig) : initializeApp(targetFbConfig, appName));

    const dbId = targetFbConfig.firestoreDatabaseId;
    try {
      officeDbInstance = initializeFirestoreLite(
        officeAppInstance,
        { ignoreUndefinedProperties: true },
        dbId && dbId !== '(default)' ? dbId : undefined
      );
    } catch {
      officeDbInstance = getFirestoreLite(
        officeAppInstance,
        dbId && dbId !== '(default)' ? dbId : undefined
      );
    }
    officeAuthInstance = getAuth(officeAppInstance);

    officeApp = officeAppInstance;
    officeDb = officeDbInstance;
    officeAuth = officeAuthInstance;

    app = officeAppInstance;
    db = officeDbInstance;
    dbLite = officeDbInstance;
    auth = officeAuthInstance;
  } catch (err) {
    console.warn('[Firebase] Office instance initialization notice:', err);
  }
}

initDynamicOfficeFirebase(activeCustomOffice);

export function saveCustomOfficeConfig(
  config: CustomOfficeConfig,
  options?: { isBrandNew?: boolean }
): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CUSTOM_OFFICE_CONFIG_KEY, JSON.stringify(config));
  }
  initDynamicOfficeFirebase(config);
  if (typeof window !== 'undefined') {
    const payload = options?.isBrandNew ? { ...config, __isBrandNew: true } : config;
    window.dispatchEvent(new CustomEvent('baf_office_config_changed', { detail: payload }));
  }
}

export function clearCustomOfficeConfig(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(CUSTOM_OFFICE_CONFIG_KEY);
  }
  initDynamicOfficeFirebase(null);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('baf_office_config_changed', { detail: null }));
  }
}

export function getSavedOfficeProfileOverride(): Partial<OfficeProfileData> | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(OFFICE_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getActiveOfficeIdentity(): {
  officeName: string;
  officeLogo: string;
  officeSlogan: string;
  officeBase: string;
  officeCode: string;
  joinPin?: string;
  projectId: string;
  isCustom: boolean;
} {
  const custom = getCustomOfficeConfig();
  const profileOverride = getSavedOfficeProfileOverride();

  if (custom) {
    const code =
      custom.officeCode ||
      custom.firebaseConfig?.officeCode ||
      generateOfficeCodeFromName(custom.officeName || 'Office');
    const resolvedName =
      (profileOverride?.officeName && String(profileOverride.officeName).trim()) ||
      custom.officeName ||
      'Office Management Portal';
    const resolvedLogo =
      (profileOverride?.officeLogo && String(profileOverride.officeLogo).trim()) ||
      custom.officeLogo ||
      '/155-uasu-baf-logo.png';
    const resolvedSlogan =
      (profileOverride?.officeSlogan && String(profileOverride.officeSlogan).trim()) ||
      custom.officeSlogan ||
      custom.firebaseConfig?.officeSlogan ||
      'Intel • Surveillance • Strike';
    const resolvedBase =
      (profileOverride?.officeBase && String(profileOverride.officeBase).trim()) ||
      custom.officeBase ||
      custom.firebaseConfig?.officeBase ||
      'BAF BASE ZHR';
    return {
      officeName: resolvedName,
      officeLogo: resolvedLogo,
      officeSlogan: resolvedSlogan,
      officeBase: resolvedBase,
      officeCode: code,
      joinPin: custom.joinPin || custom.firebaseConfig?.joinPin,
      projectId: custom.firebaseConfig.projectId,
      isCustom: true,
    };
  }

  return {
    officeName:
      (profileOverride?.officeName && String(profileOverride.officeName).trim()) ||
      '155 UASU BAF',
    officeLogo:
      (profileOverride?.officeLogo && String(profileOverride.officeLogo).trim()) ||
      '/155-uasu-baf-logo.png',
    officeSlogan:
      (profileOverride?.officeSlogan && String(profileOverride.officeSlogan).trim()) ||
      'Intel • Surveillance • Strike',
    officeBase:
      (profileOverride?.officeBase && String(profileOverride.officeBase).trim()) ||
      'BAF BASE ZHR',
    officeCode: '155-UASU',
    projectId: firebaseConfigData.projectId || 'default',
    isCustom: false,
  };
}

export function updateActiveOfficeProfile(profile: Partial<OfficeProfileData>): OfficeProfileData {
  const current = getActiveOfficeIdentity();
  const nextProfile: OfficeProfileData = {
    officeName: String(profile.officeName ?? current.officeName ?? '155 UASU BAF').trim() || '155 UASU BAF',
    officeLogo: String(profile.officeLogo ?? current.officeLogo ?? '/155-uasu-baf-logo.png').trim() || '/155-uasu-baf-logo.png',
    officeSlogan: String(profile.officeSlogan ?? current.officeSlogan ?? 'Intel • Surveillance • Strike').trim() || 'Intel • Surveillance • Strike',
    officeBase: String(profile.officeBase ?? current.officeBase ?? 'BAF BASE ZHR').trim() || 'BAF BASE ZHR',
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(OFFICE_PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
      window.localStorage.setItem('baf_custom_unit_logo', nextProfile.officeLogo);
    } catch {}

    const custom = getCustomOfficeConfig();
    if (custom) {
      const updatedCustom: CustomOfficeConfig = {
        ...custom,
        officeName: nextProfile.officeName,
        officeLogo: nextProfile.officeLogo,
        officeSlogan: nextProfile.officeSlogan,
        officeBase: nextProfile.officeBase,
        firebaseConfig: {
          ...custom.firebaseConfig,
          officeSlogan: nextProfile.officeSlogan,
          officeBase: nextProfile.officeBase,
        },
      };
      try {
        window.localStorage.setItem(CUSTOM_OFFICE_CONFIG_KEY, JSON.stringify(updatedCustom));
      } catch {}
      registerOfficeInMasterTelemetry({
        officeName: updatedCustom.officeName,
        officeLogo: updatedCustom.officeLogo,
        officeSlogan: updatedCustom.officeSlogan,
        officeBase: updatedCustom.officeBase,
        officeCode: updatedCustom.officeCode,
        joinPin: updatedCustom.joinPin,
        firebaseConfig: updatedCustom.firebaseConfig,
      }).catch(() => {});
    }

    try {
      document.title = `${nextProfile.officeName} | ${nextProfile.officeBase}`;
    } catch {}

    // Also propagate updated Office Name, Logo, Slogan, Base to all users of this office in global user-office map
    try {
      const activeCode = String(current.officeCode || '155-UASU').toUpperCase().trim();
      const map = getGlobalUserOfficeMap();
      let mapModified = false;
      Object.keys(map).forEach((bdKey) => {
        const entry = map[bdKey];
        if (entry && String(entry.officeCode || '').toUpperCase().trim() === activeCode) {
          entry.officeName = nextProfile.officeName;
          entry.officeLogo = nextProfile.officeLogo;
          entry.officeSlogan = nextProfile.officeSlogan;
          entry.officeBase = nextProfile.officeBase;
          if (entry.officeConfig) {
            entry.officeConfig = {
              ...entry.officeConfig,
              officeName: nextProfile.officeName,
              officeLogo: nextProfile.officeLogo,
              officeSlogan: nextProfile.officeSlogan,
              officeBase: nextProfile.officeBase,
            };
          }
          entry.updatedAt = new Date().toISOString();
          mapModified = true;
        }
      });
      if (mapModified) {
        saveGlobalUserOfficeMap(map, true);
      }
    } catch {}

    window.dispatchEvent(new CustomEvent('baf_office_config_changed', { detail: nextProfile }));
    window.dispatchEvent(new Event('baf_logo_updated'));
    window.dispatchEvent(new CustomEvent('baf_settings_updated', { detail: { key: OFFICE_PROFILE_STORAGE_KEY } }));
  }

  return nextProfile;
}

export function getActiveOfficeCode(): string {
  const identity = getActiveOfficeIdentity();
  return String(identity.officeCode || '155-UASU').toUpperCase().trim();
}

export function isDefault155UasuOffice(): boolean {
  const custom = getCustomOfficeConfig();
  if (!custom) return true;
  const code = String(custom.officeCode || custom.firebaseConfig?.officeCode || '').toUpperCase().trim();
  return code === '155-UASU' || code === '155UASU';
}

export function getOfficeScopedStorageKey(baseKey: string): string {
  if (!baseKey || baseKey.includes('__office_')) {
    return baseKey;
  }
  if (isDefault155UasuOffice()) {
    return baseKey;
  }
  const safeCode = getActiveOfficeCode().replace(/[^A-Z0-9_-]/g, '_');
  return `${baseKey}__office_${safeCode}`;
}

export function getOfficeFirestoreDocPrefix(): string {
  if (isDefault155UasuOffice()) {
    return '';
  }
  const safeCode = getActiveOfficeCode().replace(/[^A-Z0-9_-]/g, '_');
  return `off_${safeCode}__`;
}

export function purgeOfficeLocalStorageKeys(targetOfficeCode?: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const code = String(targetOfficeCode || getActiveOfficeCode() || '')
    .toUpperCase()
    .trim();
  if (!code || code === '155-UASU' || code === '155UASU') return;
  const safeCode = code.replace(/[^A-Z0-9_-]/g, '_');
  const suffix = `__office_${safeCode}`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.endsWith(suffix)) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach((k) => {
    try {
      window.localStorage.removeItem(k);
    } catch {}
  });
}


export async function testCustomFirebaseConnection(
  fbConfig: OfficeFirebaseConfig
): Promise<{ ok: boolean; success: boolean; error?: string; message: string }> {
  if (!fbConfig || !fbConfig.apiKey || !fbConfig.projectId) {
    const msg = 'Missing apiKey or projectId in Firebase Config.';
    return { ok: false, success: false, error: msg, message: msg };
  }
  const dbId = fbConfig.firestoreDatabaseId && fbConfig.firestoreDatabaseId !== '(default)'
    ? fbConfig.firestoreDatabaseId
    : '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    fbConfig.projectId
  )}/databases/${encodeURIComponent(
    dbId
  )}/documents/system_meta/sync_manifest?key=${encodeURIComponent(fbConfig.apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    if (res.ok || res.status === 404 || res.status === 403) {
      const msg = `Connected to Firebase project "${fbConfig.projectId}" successfully.`;
      return { ok: true, success: true, message: msg };
    }
    // If custom databaseId wasn't found, also test (default) database
    if (dbId !== '(default)' && res.status === 400) {
      const fallbackUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        fbConfig.projectId
      )}/databases/(default)/documents/system_meta/sync_manifest?key=${encodeURIComponent(fbConfig.apiKey)}`;
      const fallbackRes = await fetch(fallbackUrl, { method: 'GET', signal: controller.signal });
      if (fallbackRes.ok || fallbackRes.status === 404 || fallbackRes.status === 403) {
        const msg = `Connected to Firebase project "${fbConfig.projectId}" successfully.`;
        return { ok: true, success: true, message: msg };
      }
    }
    const text = await res.text().catch(() => '');
    const errMsg = `Firebase responded with HTTP ${res.status}: ${text.slice(0, 140) || res.statusText}`;
    return {
      ok: false,
      success: false,
      error: errMsg,
      message: errMsg,
    };
  } catch (err: any) {
    const errMsg =
      err?.name === 'AbortError'
        ? 'Connection timed out (7s).'
        : err?.message || 'Network error connecting to Firebase.';
    return {
      ok: false,
      success: false,
      error: errMsg,
      message: errMsg,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// 3. MASTER TELEMETRY REGISTRY (registered_offices/{projectId})
// ============================================================================
function getLocalMasterOfficesCache(): Record<string, RegisteredOfficeRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(MASTER_OFFICES_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalMasterOfficesCache(map: Record<string, RegisteredOfficeRecord>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MASTER_OFFICES_CACHE_KEY, JSON.stringify(map));
  } catch {}
}

export async function registerOfficeInMasterTelemetry(
  params: {
    officeName: string;
    officeLogo: string;
    officeSlogan?: string;
    officeBase?: string;
    officeCode?: string;
    joinPin?: string;
    firebaseConfig: OfficeFirebaseConfig;
    totalUsers?: number;
    createdAt?: string;
    configuredAt?: string;
  },
  totalUsersArg?: number
): Promise<void> {
  const baseProjectId = String(params.firebaseConfig?.projectId || firebaseConfigData.projectId || '').trim();
  if (!baseProjectId) return;

  const officeCode = String(
    params.officeCode ||
      params.firebaseConfig?.officeCode ||
      generateOfficeCodeFromName(params.officeName || 'Office')
  )
    .toUpperCase()
    .trim();
  const joinPin =
    params.joinPin || params.firebaseConfig?.joinPin
      ? String(params.joinPin || params.firebaseConfig?.joinPin).trim()
      : undefined;
  const officeSlogan =
    params.officeSlogan || params.firebaseConfig?.officeSlogan
      ? String(params.officeSlogan || params.firebaseConfig?.officeSlogan).trim()
      : undefined;
  const officeBase =
    params.officeBase || params.firebaseConfig?.officeBase
      ? String(params.officeBase || params.firebaseConfig?.officeBase).trim()
      : undefined;

  // Use a unique registry key per officeCode so multiple offices can be registered cleanly
  const registryKey = officeCode
    ? `${baseProjectId}__${officeCode.replace(/[^a-zA-Z0-9_-]/g, '_')}`
    : baseProjectId;

  const nowIso = new Date().toISOString();
  const cache = getLocalMasterOfficesCache();
  const existing = cache[registryKey] || cache[baseProjectId];
  const resolvedTotalUsers =
    totalUsersArg !== undefined ? totalUsersArg : (params.totalUsers ?? existing?.totalUsers ?? 1);

  const record: RegisteredOfficeRecord = {
    officeName: String(params.officeName || 'Office Unit').slice(0, 200),
    officeLogo: String(params.officeLogo || '/155-uasu-baf-logo.png').slice(0, 500000),
    ...(officeSlogan ? { officeSlogan } : {}),
    ...(officeBase ? { officeBase } : {}),
    officeCode,
    ...(joinPin ? { joinPin } : {}),
    projectId: baseProjectId.slice(0, 128),
    firebaseConfig: {
      apiKey: String(params.firebaseConfig.apiKey || firebaseConfigData.apiKey || ''),
      authDomain: String(params.firebaseConfig.authDomain || `${baseProjectId}.firebaseapp.com`),
      projectId: baseProjectId,
      storageBucket: String(params.firebaseConfig.storageBucket || `${baseProjectId}.appspot.com`),
      messagingSenderId: String(params.firebaseConfig.messagingSenderId || ''),
      appId: String(params.firebaseConfig.appId || ''),
      officeCode,
      ...(joinPin ? { joinPin } : {}),
      ...(officeSlogan ? { officeSlogan } : {}),
      ...(officeBase ? { officeBase } : {}),
      ...(params.firebaseConfig.firestoreDatabaseId
        ? { firestoreDatabaseId: String(params.firebaseConfig.firestoreDatabaseId) }
        : {}),
    },
    totalUsers: Math.max(0, Number(resolvedTotalUsers) || 0),
    createdAt: params.createdAt || params.configuredAt || existing?.createdAt || nowIso,
    lastActive: nowIso,
  };

  cache[registryKey] = record;
  saveLocalMasterOfficesCache(cache);

  // Store only schema-validated fields in Firestore registered_offices document
  if (masterDbInstance) {
    try {
      const safeDocId = registryKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'default_office';
      const firestorePayload = {
        officeName: record.officeName,
        officeLogo: record.officeLogo,
        projectId: record.projectId,
        firebaseConfig: record.firebaseConfig,
        totalUsers: record.totalUsers,
        createdAt: record.createdAt,
        lastActive: record.lastActive,
      };
      await setDoc(doc(masterDbInstance, 'registered_offices', safeDocId), firestorePayload, { merge: true });
    } catch {
      // Silently ignore telemetry errors if masterDb rules or network block anonymous telemetry
    }
  }
}

export async function updateOfficeTelemetryUserCount(totalUsers: number): Promise<void> {
  const custom = getCustomOfficeConfig();
  const targetConfig = custom?.firebaseConfig || (firebaseConfigData as OfficeFirebaseConfig);
  const projectId = String(targetConfig?.projectId || '').trim();
  if (!projectId || projectId === 'remixed-project-id') return;

  const officeName = custom?.officeName || '155 UASU BAF';
  const officeLogo = custom?.officeLogo || '/155-uasu-baf-logo.png';
  const officeCode = custom?.officeCode || targetConfig.officeCode || generateOfficeCodeFromName(officeName);

  await registerOfficeInMasterTelemetry({
    officeName,
    officeLogo,
    officeCode,
    joinPin: custom?.joinPin || targetConfig.joinPin,
    firebaseConfig: targetConfig,
    totalUsers,
  });
}

export async function fetchRegisteredOfficesFromMaster(): Promise<RegisteredOfficeRecord[]> {
  const cache = getLocalMasterOfficesCache();
  const mergedMap = new Map<string, RegisteredOfficeRecord>();

  // Always seed the default primary unit so staff can select it with 1 tap
  const defaultCode = '155-UASU';
  mergedMap.set(defaultCode, {
    officeName: '155 UASU BAF',
    officeLogo: '/155-uasu-baf-logo.png',
    officeCode: defaultCode,
    projectId: firebaseConfigData.projectId || 'steady-weft-wf6jr',
    firebaseConfig: buildAutoCloudFirebaseConfig('155 UASU BAF', defaultCode),
    totalUsers: 18,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastActive: new Date().toISOString(),
  });

  Object.values(cache).forEach((rec) => {
    if (rec && (rec.officeName || rec.projectId)) {
      const code =
        rec.officeCode ||
        rec.firebaseConfig?.officeCode ||
        generateOfficeCodeFromName(rec.officeName || rec.projectId);
      mergedMap.set(code.toUpperCase(), {
        ...rec,
        officeCode: code.toUpperCase(),
        joinPin: rec.joinPin || rec.firebaseConfig?.joinPin,
      });
    }
  });

  // Also include the current active office if configured
  const currentCustom = getCustomOfficeConfig();
  if (currentCustom && currentCustom.officeName) {
    const code = (
      currentCustom.officeCode ||
      currentCustom.firebaseConfig?.officeCode ||
      generateOfficeCodeFromName(currentCustom.officeName)
    ).toUpperCase();
    mergedMap.set(code, {
      officeName: currentCustom.officeName,
      officeLogo: currentCustom.officeLogo || '/155-uasu-baf-logo.png',
      officeCode: code,
      joinPin: currentCustom.joinPin || currentCustom.firebaseConfig?.joinPin,
      projectId: currentCustom.firebaseConfig?.projectId || firebaseConfigData.projectId,
      firebaseConfig: currentCustom.firebaseConfig,
      totalUsers: mergedMap.get(code)?.totalUsers || 1,
      createdAt: currentCustom.configuredAt || new Date().toISOString(),
      lastActive: new Date().toISOString(),
    });
  }

  if (masterDbInstance) {
    try {
      const snap = await getDocs(collection(masterDbInstance, 'registered_offices'));
      snap.forEach((docSnap) => {
        const d = docSnap.data() as RegisteredOfficeRecord;
        if (d && d.officeName) {
          const code = (
            d.officeCode ||
            d.firebaseConfig?.officeCode ||
            generateOfficeCodeFromName(d.officeName)
          ).toUpperCase();
          const enriched: RegisteredOfficeRecord = {
            ...d,
            officeCode: code,
            joinPin: d.joinPin || d.firebaseConfig?.joinPin,
          };
          mergedMap.set(code, enriched);
          cache[`${d.projectId}__${code}`] = enriched;
        }
      });
      saveLocalMasterOfficesCache(cache);
    } catch {
      // Fallback to local cache if masterDb read fails
    }
  }

  return Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.lastActive || 0).getTime() - new Date(a.lastActive || 0).getTime()
  );
}

// ============================================================================
// 4. GLOBAL USER -> OFFICE DIRECTORY (Matches BD No to Office Name & Workspace)
// ============================================================================
export function getGlobalUserOfficeMap(): Record<string, GlobalUserOfficeEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = getRawLocalStorageItem(GLOBAL_USER_OFFICE_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveGlobalUserOfficeMap(
  map: Record<string, GlobalUserOfficeEntry>,
  syncToCloud: boolean = true
): void {
  if (typeof window === 'undefined') return;
  try {
    setRawLocalStorageItem(GLOBAL_USER_OFFICE_MAP_KEY, JSON.stringify(map));
  } catch {}

  if (syncToCloud && masterDbInstance) {
    setDoc(
      doc(masterDbInstance, 'app_settings', GLOBAL_USER_OFFICE_MAP_KEY),
      {
        key: GLOBAL_USER_OFFICE_MAP_KEY,
        value: JSON.stringify(map),
        updated_at: new Date().toISOString(),
      },
      { merge: true }
    ).catch(() => {});
  }
}

export function registerUsersInGlobalOfficeDirectory(
  users: Array<{
    bdNo?: string;
    userId?: string;
    name?: string;
    fullName?: string;
    rank?: string;
    flightName?: string;
    trade?: string;
    role?: string;
    pin?: string;
    password?: string;
  }>,
  officeIdentityOverride?: {
    officeCode: string;
    officeName: string;
    officeLogo: string;
    officeSlogan: string;
    officeBase: string;
    isDefault155: boolean;
    officeConfig?: CustomOfficeConfig;
  }
): void {
  if (!Array.isArray(users) || users.length === 0) return;

  const activeIdentity = getActiveOfficeIdentity();
  const customCfg = getCustomOfficeConfig();
  const isDefault155 =
    officeIdentityOverride !== undefined
      ? officeIdentityOverride.isDefault155
      : isDefault155UasuOffice();
  const officeCode = String(
    officeIdentityOverride?.officeCode || activeIdentity.officeCode || '155-UASU'
  )
    .toUpperCase()
    .trim();
  const officeName =
    officeIdentityOverride?.officeName || activeIdentity.officeName || '155 UASU BAF';
  const officeLogo =
    officeIdentityOverride?.officeLogo || activeIdentity.officeLogo || '/155-uasu-baf-logo.png';
  const officeSlogan =
    officeIdentityOverride?.officeSlogan ||
    activeIdentity.officeSlogan ||
    'Intel • Surveillance • Strike';
  const officeBase =
    officeIdentityOverride?.officeBase || activeIdentity.officeBase || 'BAF BASE ZHR';
  const resolvedConfig =
    officeIdentityOverride?.officeConfig ||
    (!isDefault155
      ? customCfg || {
          officeName,
          officeLogo,
          officeSlogan,
          officeBase,
          officeCode,
          firebaseConfig: buildAutoCloudFirebaseConfig(officeName, officeCode),
        }
      : undefined);

  const map = getGlobalUserOfficeMap();
  const nowIso = new Date().toISOString();
  let changed = false;

  users.forEach((u) => {
    const cleanBd = String(u.bdNo || u.userId || '')
      .replace(/^BD\/?/i, '')
      .replace(/[^0-9]/g, '')
      .trim();
    if (!cleanBd || cleanBd === MASTER_USER_ID || cleanBd === '53539919') return;

    const existing = map[cleanBd];
    const resolvedPin = String(u.pin || u.password || existing?.pin || cleanBd).trim();
    const resolvedName = String(u.fullName || u.name || existing?.userName || 'Airman').trim();
    const resolvedRank = String(u.rank || existing?.rank || 'LAC').trim();
    const isPostedOut = isAirmanPostedOut(u);

    map[cleanBd] = {
      bdNo: cleanBd,
      userName: resolvedName,
      rank: resolvedRank,
      flightName: u.flightName !== undefined ? u.flightName : (existing?.flightName || (isDefault155 ? 'Admin' : '')),
      trade: u.trade || existing?.trade || 'General',
      role: u.role || existing?.role || 'USER',
      pin: resolvedPin,
      officeCode,
      officeName,
      officeLogo,
      officeSlogan,
      officeBase,
      isDefault155,
      isPostedOut,
      active: !isPostedOut,
      ...(resolvedConfig ? { officeConfig: resolvedConfig } : {}),
      updatedAt: nowIso,
    };
    changed = true;
  });

  if (changed) {
    saveGlobalUserOfficeMap(map, true);
  }
}

export function isAirmanPostedOut(record: any): boolean {
  if (!record || typeof record !== 'object') return false;
  if (record.isPostedOut === true) return true;
  if (record.active === false) return true;
  const statusStr = String(record.status || '').toUpperCase().trim();
  if (statusStr === 'POSTED_OUT' || statusStr === 'POSTED OUT' || statusStr === 'INACTIVE') {
    return true;
  }
  const leaveReasonStr = String(record.leaveReason || '').toLowerCase().trim();
  if (leaveReasonStr === 'posted out' || leaveReasonStr === 'rtu' || leaveReasonStr === 'medical') {
    if (record.active === false || Boolean(record.dateLeft)) return true;
  }
  if (Boolean(record.dateLeft) && record.active === false) {
    return true;
  }
  return false;
}

export function isUserPostedOutInOfficeStorage(
  cleanBd: string,
  officeCode: string,
  isDefault155: boolean,
  fallbackAirmen: any[] = []
): boolean {
  if (!cleanBd) return false;
  const safeCode = String(officeCode || '')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9_-]/g, '_');

  const checkDbKey = isDefault155 || safeCode === '155-UASU' || safeCode === '155_UASU'
    ? 'baf_local_db_v3'
    : `baf_local_db_v3__office_${safeCode}`;

  try {
    const rawDb = getRawLocalStorageItem(checkDbKey);
    if (rawDb) {
      const parsedDb = JSON.parse(rawDb);
      if (parsedDb && Array.isArray(parsedDb.airmen)) {
        const matches = parsedDb.airmen.filter((a: any) => {
          const aBd = String(a.bdNo || '')
            .replace(/^BD\/?/i, '')
            .replace(/[^0-9]/g, '')
            .trim();
          return aBd === cleanBd;
        });
        if (matches.length > 0) {
          // If any matching record is active, they are NOT posted out in this office
          const hasActive = matches.some((m: any) => !isAirmanPostedOut(m));
          return !hasActive;
        }
      }
    }
  } catch {}

  if ((isDefault155 || safeCode === '155-UASU') && Array.isArray(fallbackAirmen) && fallbackAirmen.length > 0) {
    const fMatches = fallbackAirmen.filter((a: any) => {
      const aBd = String(a.bdNo || '')
        .replace(/^BD\/?/i, '')
        .replace(/[^0-9]/g, '')
        .trim();
      return aBd === cleanBd;
    });
    if (fMatches.length > 0) {
      const hasActive = fMatches.some((m: any) => !isAirmanPostedOut(m));
      return !hasActive;
    }
  }

  return false;
}

export function markUserPostedOutInGlobalDirectory(bdInput: string, isPostedOut: boolean): void {
  const cleanBd = String(bdInput || '')
    .replace(/^BD\/?/i, '')
    .replace(/[^0-9]/g, '')
    .trim();
  if (!cleanBd || cleanBd === MASTER_USER_ID) return;
  const activeIdentity = getActiveOfficeIdentity();
  const currentCode = String(activeIdentity.officeCode || '155-UASU').toUpperCase().trim();
  const map = getGlobalUserOfficeMap();
  if (map[cleanBd]) {
    const entryCode = String(map[cleanBd].officeCode || '155-UASU').toUpperCase().trim();
    if (entryCode === currentCode) {
      map[cleanBd] = {
        ...map[cleanBd],
        isPostedOut,
        active: !isPostedOut,
        updatedAt: new Date().toISOString(),
      };
      saveGlobalUserOfficeMap(map, true);
    }
  }
}

export function isOfficeNameAlreadyRegistered(
  officeNameInput: string,
  registeredOffices: RegisteredOfficeRecord[] = [],
  pendingRequests: PendingOfficeRegistrationRequest[] = []
): boolean {
  const normalizedInput = String(officeNameInput || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
  if (!normalizedInput) return false;
  const inputCode = generateOfficeCodeFromName(normalizedInput).toUpperCase().trim();

  // Check default 155 UASU BAF
  const defProfile = getDefault155OfficeProfile();
  const defNameNorm = String(defProfile.officeName || '155 UASU BAF')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
  if (
    normalizedInput === defNameNorm ||
    normalizedInput === '155 UASU BAF' ||
    normalizedInput === '155 UASU' ||
    inputCode === '155-UASU'
  ) {
    return true;
  }

  // Check local master cache + passed registeredOffices
  const cacheMap = getLocalMasterOfficesCache();
  const allReg = [...Object.values(cacheMap), ...registeredOffices];
  for (const off of allReg) {
    if (!off) continue;
    const offName = String(off.officeName || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ');
    const offCode = String(off.officeCode || off.firebaseConfig?.officeCode || '')
      .trim()
      .toUpperCase();
    if (offName && (offName === normalizedInput || (inputCode && offCode === inputCode))) {
      return true;
    }
  }

  // Check pending requests (PENDING or APPROVED)
  const localReqs = getPendingOfficeRequestsLocal();
  const allReqs = [...localReqs, ...pendingRequests];
  for (const req of allReqs) {
    if (!req || req.status === 'REJECTED') continue;
    const reqName = String(req.officeName || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ');
    const reqCode = String(req.officeCode || '')
      .trim()
      .toUpperCase();
    if (reqName && (reqName === normalizedInput || (inputCode && reqCode === inputCode))) {
      return true;
    }
  }

  return false;
}

export function doesOfficeHaveFlights(
  airmen?: Array<{ flightName?: string; active?: boolean }>
): boolean {
  if (!isDefault155UasuOffice()) {
    return false;
  }
  if (Array.isArray(airmen) && airmen.length > 0) {
    return airmen.some((a) => Boolean(String(a?.flightName || '').trim()));
  }
  return true;
}

function getDefault155OfficeProfile(): OfficeProfileData {
  try {
    const raw = getRawLocalStorageItem(OFFICE_PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          officeName: String(parsed.officeName || '155 UASU BAF').trim() || '155 UASU BAF',
          officeLogo:
            String(parsed.officeLogo || '/155-uasu-baf-logo.png').trim() ||
            '/155-uasu-baf-logo.png',
          officeSlogan:
            String(parsed.officeSlogan || 'Intel • Surveillance • Strike').trim() ||
            'Intel • Surveillance • Strike',
          officeBase: String(parsed.officeBase || 'BAF BASE ZHR').trim() || 'BAF BASE ZHR',
        };
      }
    }
  } catch {}
  return {
    officeName: '155 UASU BAF',
    officeLogo: '/155-uasu-baf-logo.png',
    officeSlogan: 'Intel • Surveillance • Strike',
    officeBase: 'BAF BASE ZHR',
  };
}

export function findOfficeByUserId(
  bdInput: string,
  fallbackAirmen: Array<{
    bdNo?: string;
    name?: string;
    fullName?: string;
    rank?: string;
    flightName?: string;
    trade?: string;
    role?: string;
    active?: boolean;
    dateLeft?: string;
    leaveReason?: string;
  }> = []
): GlobalUserOfficeEntry | null {
  const cleanBd = String(bdInput || '')
    .replace(/^BD\/?/i, '')
    .replace(/[^0-9]/g, '')
    .trim();
  if (!cleanBd) return null;

  if (cleanBd === MASTER_USER_ID) {
    const currentIdentity = getActiveOfficeIdentity();
    return {
      bdNo: MASTER_USER_ID,
      userName: 'System Master Owner',
      rank: 'MWO',
      flightName: 'Admin',
      trade: 'System Control',
      role: 'master_owner',
      pin: MASTER_USER_PIN,
      officeCode: currentIdentity.officeCode || '155-UASU',
      officeName: currentIdentity.officeName || '155 UASU BAF',
      officeLogo: currentIdentity.officeLogo || '/155-uasu-baf-logo.png',
      officeSlogan: currentIdentity.officeSlogan || 'Intel • Surveillance • Strike',
      officeBase: currentIdentity.officeBase || 'BAF BASE ZHR',
      isDefault155: !currentIdentity.isCustom,
      officeConfig: getCustomOfficeConfig() || undefined,
      updatedAt: new Date().toISOString(),
    };
  }

  // 1. Check Global User -> Office Map first (instant lookup across all registered offices)
  const globalMap = getGlobalUserOfficeMap();
  if (globalMap[cleanBd]) {
    const hit = globalMap[cleanBd];
    const postedOutInHitOffice =
      hit.isPostedOut === true ||
      hit.active === false ||
      isUserPostedOutInOfficeStorage(cleanBd, hit.officeCode, hit.isDefault155, fallbackAirmen);

    if (!postedOutInHitOffice) {
      const officesCache = getLocalMasterOfficesCache();
      const matchedRegOffice = Object.values(officesCache).find(
        (r) =>
          String(r.officeCode || r.firebaseConfig?.officeCode || '')
            .toUpperCase()
            .trim() === String(hit.officeCode || '').toUpperCase().trim()
      );
      if (matchedRegOffice && !hit.isDefault155) {
        return {
          ...hit,
          officeName: matchedRegOffice.officeName || hit.officeName,
          officeLogo: matchedRegOffice.officeLogo || hit.officeLogo,
          officeSlogan:
            matchedRegOffice.officeSlogan ||
            matchedRegOffice.firebaseConfig?.officeSlogan ||
            hit.officeSlogan,
          officeBase:
            matchedRegOffice.officeBase ||
            matchedRegOffice.firebaseConfig?.officeBase ||
            hit.officeBase,
          officeConfig:
            hit.officeConfig || {
              officeName: matchedRegOffice.officeName,
              officeLogo: matchedRegOffice.officeLogo || '/155-uasu-baf-logo.png',
              officeSlogan: matchedRegOffice.officeSlogan,
              officeBase: matchedRegOffice.officeBase,
              officeCode: matchedRegOffice.officeCode,
              joinPin: matchedRegOffice.joinPin,
              firebaseConfig: matchedRegOffice.firebaseConfig,
            },
        };
      }
      return hit;
    }
  }

  // 2. Scan any custom office localStorage keys (`baf_detailed_user_logins__office_<CODE>` & `baf_local_db_v3__office_<CODE>`)
  if (typeof window !== 'undefined' && window.localStorage) {
    const officesCache = getLocalMasterOfficesCache();
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('baf_detailed_user_logins__office_')) {
        const safeCode = k.replace('baf_detailed_user_logins__office_', '').trim();
        if (!safeCode) continue;
        if (isUserPostedOutInOfficeStorage(cleanBd, safeCode, false, fallbackAirmen)) {
          continue;
        }
        try {
          const rawUsers = getRawLocalStorageItem(k);
          if (!rawUsers) continue;
          const users = JSON.parse(rawUsers);
          if (!Array.isArray(users)) continue;
          const foundUser = users.find((u: any) => {
            const uBd = String(u.bdNo || u.userId || '')
              .replace(/^BD\/?/i, '')
              .replace(/[^0-9]/g, '')
              .trim();
            return uBd === cleanBd && !isAirmanPostedOut(u);
          });
          if (foundUser) {
            const rawProf = getRawLocalStorageItem(`${OFFICE_PROFILE_STORAGE_KEY}__office_${safeCode}`);
            const prof = rawProf ? JSON.parse(rawProf) : null;
            const regOffice = Object.values(officesCache).find(
              (r) =>
                String(r.officeCode || r.firebaseConfig?.officeCode || '')
                  .toUpperCase()
                  .replace(/[^A-Z0-9_-]/g, '_') === safeCode
            );
            const officeCode = regOffice?.officeCode || safeCode;
            const officeName =
              prof?.officeName || regOffice?.officeName || safeCode.replace(/_/g, ' ');
            const officeLogo =
              prof?.officeLogo || regOffice?.officeLogo || '/155-uasu-baf-logo.png';
            const officeSlogan =
              prof?.officeSlogan ||
              regOffice?.officeSlogan ||
              'Intel • Surveillance • Strike';
            const officeBase =
              prof?.officeBase || regOffice?.officeBase || 'BAF BASE ZHR';
            const fbCfg =
              regOffice?.firebaseConfig || buildAutoCloudFirebaseConfig(officeName, officeCode);

            const entry: GlobalUserOfficeEntry = {
              bdNo: cleanBd,
              userName: foundUser.fullName || foundUser.name || 'Airman',
              rank: foundUser.rank || 'LAC',
              flightName: foundUser.flightName || '',
              trade: foundUser.trade || 'General',
              role: foundUser.role || 'USER',
              pin: String(foundUser.pin || foundUser.password || cleanBd),
              officeCode,
              officeName,
              officeLogo,
              officeSlogan,
              officeBase,
              isDefault155: false,
              isPostedOut: false,
              active: true,
              officeConfig: {
                officeName,
                officeLogo,
                officeSlogan,
                officeBase,
                officeCode,
                firebaseConfig: fbCfg,
              },
              updatedAt: new Date().toISOString(),
            };
            globalMap[cleanBd] = entry;
            saveGlobalUserOfficeMap(globalMap, false);
            return entry;
          }
        } catch {}
      }
    }
  }

  // 3. Check Default 155 UASU BAF (raw unscoped keys + fallbackAirmen) if NOT posted out in 155 UASU
  const isPostedOut155 = isUserPostedOutInOfficeStorage(cleanBd, '155-UASU', true, fallbackAirmen);
  if (!isPostedOut155) {
    const defProfile = getDefault155OfficeProfile();
    try {
      const raw155Users = getRawLocalStorageItem('baf_detailed_user_logins');
      if (raw155Users) {
        const parsed155 = JSON.parse(raw155Users);
        if (Array.isArray(parsed155)) {
          const uMatch = parsed155.find((u: any) => {
            const uBd = String(u.bdNo || u.userId || '')
              .replace(/^BD\/?/i, '')
              .replace(/[^0-9]/g, '')
              .trim();
            return uBd === cleanBd && !isAirmanPostedOut(u);
          });
          if (uMatch) {
            return {
              bdNo: cleanBd,
              userName: uMatch.fullName || uMatch.name || 'Airman',
              rank: uMatch.rank || 'LAC',
              flightName: uMatch.flightName || 'Admin',
              trade: uMatch.trade || 'General',
              role: uMatch.role || 'USER',
              pin: String(uMatch.pin || uMatch.password || cleanBd),
              officeCode: '155-UASU',
              officeName: defProfile.officeName,
              officeLogo: defProfile.officeLogo,
              officeSlogan: defProfile.officeSlogan,
              officeBase: defProfile.officeBase,
              isDefault155: true,
              isPostedOut: false,
              active: true,
              updatedAt: new Date().toISOString(),
            };
          }
        }
      }
    } catch {}

    try {
      const raw155Db = getRawLocalStorageItem('baf_local_db_v3');
      if (raw155Db) {
        const parsedDb = JSON.parse(raw155Db);
        if (parsedDb && Array.isArray(parsedDb.airmen)) {
          const aMatch = parsedDb.airmen.find((a: any) => {
            const aBd = String(a.bdNo || '')
              .replace(/^BD\/?/i, '')
              .replace(/[^0-9]/g, '')
              .trim();
            return aBd === cleanBd && !isAirmanPostedOut(a);
          });
          if (aMatch) {
            return {
              bdNo: cleanBd,
              userName: aMatch.fullName || aMatch.name || 'Airman',
              rank: aMatch.rank || 'LAC',
              flightName: aMatch.flightName || 'Admin',
              trade: aMatch.trade || 'General',
              role: aMatch.role || 'USER',
              pin: cleanBd,
              officeCode: '155-UASU',
              officeName: defProfile.officeName,
              officeLogo: defProfile.officeLogo,
              officeSlogan: defProfile.officeSlogan,
              officeBase: defProfile.officeBase,
              isDefault155: true,
              isPostedOut: false,
              active: true,
              updatedAt: new Date().toISOString(),
            };
          }
        }
      }
    } catch {}

    if (Array.isArray(fallbackAirmen) && fallbackAirmen.length > 0) {
      const fMatch = fallbackAirmen.find((a) => {
        const aBd = String(a.bdNo || '')
          .replace(/^BD\/?/i, '')
          .replace(/[^0-9]/g, '')
          .trim();
        return aBd === cleanBd && !isAirmanPostedOut(a);
      });
      if (fMatch) {
        return {
          bdNo: cleanBd,
          userName: fMatch.fullName || fMatch.name || 'Airman',
          rank: fMatch.rank || 'LAC',
          flightName: fMatch.flightName || 'Admin',
          trade: fMatch.trade || 'General',
          role: fMatch.role || 'USER',
          pin: cleanBd,
          officeCode: '155-UASU',
          officeName: defProfile.officeName,
          officeLogo: defProfile.officeLogo,
          officeSlogan: defProfile.officeSlogan,
          officeBase: defProfile.officeBase,
          isDefault155: true,
          isPostedOut: false,
          active: true,
          updatedAt: new Date().toISOString(),
        };
      }
    }
  }

  return null;
}

export function activateMatchedOfficeForUser(match: GlobalUserOfficeEntry): boolean {
  if (!match) return false;
  const currentCode = getActiveOfficeCode();
  const targetCode = String(match.officeCode || '155-UASU').toUpperCase().trim();
  const isTarget155 =
    match.isDefault155 || targetCode === '155-UASU' || targetCode === '155UASU';

  if (isTarget155) {
    if (!isDefault155UasuOffice()) {
      clearCustomOfficeConfig();
      return true;
    }
    return false;
  }

  const fbConfig =
    match.officeConfig?.firebaseConfig ||
    buildAutoCloudFirebaseConfig(match.officeName, targetCode);
  const nextCustomConfig: CustomOfficeConfig = {
    officeName: match.officeName,
    officeLogo: match.officeLogo || '/155-uasu-baf-logo.png',
    officeSlogan: match.officeSlogan || 'Intel • Surveillance • Strike',
    officeBase: match.officeBase || 'BAF BASE ZHR',
    officeCode: targetCode,
    joinPin: match.officeConfig?.joinPin,
    firebaseConfig: {
      ...fbConfig,
      officeCode: targetCode,
      officeSlogan: match.officeSlogan || 'Intel • Surveillance • Strike',
      officeBase: match.officeBase || 'BAF BASE ZHR',
    },
    configuredAt: match.officeConfig?.configuredAt || new Date().toISOString(),
    adminUserId: match.bdNo,
  };

  const switched = currentCode !== targetCode || isDefault155UasuOffice();
  saveCustomOfficeConfig(nextCustomConfig);
  updateActiveOfficeProfile({
    officeName: match.officeName,
    officeLogo: match.officeLogo || '/155-uasu-baf-logo.png',
    officeSlogan: match.officeSlogan || 'Intel • Surveillance • Strike',
    officeBase: match.officeBase || 'BAF BASE ZHR',
  });
  return switched;
}

export async function syncGlobalUserOfficeMapFromCloud(): Promise<Record<string, GlobalUserOfficeEntry>> {
  const localMap = getGlobalUserOfficeMap();
  if (!masterDbInstance) return localMap;

  try {
    // 1. Fetch registered_offices so we have office metadata
    const registeredOffices = await fetchRegisteredOfficesFromMaster().catch(() => []);
    const officeByCode = new Map<string, RegisteredOfficeRecord>();
    registeredOffices.forEach((o) => {
      const c = String(o.officeCode || o.firebaseConfig?.officeCode || generateOfficeCodeFromName(o.officeName))
        .toUpperCase()
        .trim();
      officeByCode.set(c, o);
    });

    // 2. Fetch app_settings/baf_global_user_office_map_v1
    const snap = await getDoc(doc(masterDbInstance, 'app_settings', GLOBAL_USER_OFFICE_MAP_KEY));
    if (snap.exists()) {
      const data = snap.data();
      if (data?.value) {
        const cloudMap = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        if (cloudMap && typeof cloudMap === 'object') {
          Object.entries(cloudMap).forEach(([bdKey, entry]: [string, any]) => {
            if (entry && entry.bdNo) {
              localMap[bdKey] = {
                ...entry,
                ...(localMap[bdKey] &&
                new Date(localMap[bdKey].updatedAt || 0).getTime() >
                  new Date(entry.updatedAt || 0).getTime()
                  ? localMap[bdKey]
                  : {}),
              };
            }
          });
        }
      }
    }

    // 3. Also scan Firestore user_profiles for any off_<CODE>__<bdNo> documents
    const usersSnap = await getDocs(collection(masterDbInstance, 'user_profiles')).catch(() => null);
    if (usersSnap) {
      usersSnap.forEach((docSnap) => {
        const docId = docSnap.id;
        const d = docSnap.data() as any;
        if (!d) return;
        const cleanBd = String(d.bdNo || d.user_id || '')
          .replace(/^BD\/?/i, '')
          .replace(/[^0-9]/g, '')
          .trim();
        if (!cleanBd || cleanBd === MASTER_USER_ID || cleanBd === '53539919') return;

        if (docId.startsWith('off_') && docId.includes('__')) {
          const safeCode = docId.slice(4, docId.indexOf('__')).toUpperCase().trim();
          const matchedOffice =
            officeByCode.get(safeCode) ||
            Array.from(officeByCode.values()).find(
              (r) =>
                String(r.officeCode || '')
                  .toUpperCase()
                  .replace(/[^A-Z0-9_-]/g, '_') === safeCode
            );
          const officeCode = matchedOffice?.officeCode || safeCode;
          const officeName = matchedOffice?.officeName || safeCode.replace(/_/g, ' ');
          const officeLogo = matchedOffice?.officeLogo || '/155-uasu-baf-logo.png';
          const officeSlogan =
            matchedOffice?.officeSlogan ||
            matchedOffice?.firebaseConfig?.officeSlogan ||
            'Intel • Surveillance • Strike';
          const officeBase =
            matchedOffice?.officeBase ||
            matchedOffice?.firebaseConfig?.officeBase ||
            'BAF BASE ZHR';
          const fbConfig =
            matchedOffice?.firebaseConfig || buildAutoCloudFirebaseConfig(officeName, officeCode);

          localMap[cleanBd] = {
            bdNo: cleanBd,
            userName: d.name || 'Airman',
            rank: d.rank || 'LAC',
            flightName: d.flightName || 'Admin',
            trade: d.trade || 'General',
            role: d.role || 'USER',
            pin: String(d.password || d.pin || cleanBd),
            officeCode,
            officeName,
            officeLogo,
            officeSlogan,
            officeBase,
            isDefault155: false,
            officeConfig: {
              officeName,
              officeLogo,
              officeSlogan,
              officeBase,
              officeCode,
              firebaseConfig: fbConfig,
            },
            updatedAt: d.updatedAt || new Date().toISOString(),
          };
        } else if (!localMap[cleanBd]) {
          const defProf = getDefault155OfficeProfile();
          localMap[cleanBd] = {
            bdNo: cleanBd,
            userName: d.name || 'Airman',
            rank: d.rank || 'LAC',
            flightName: d.flightName || 'Admin',
            trade: d.trade || 'General',
            role: d.role || 'USER',
            pin: String(d.password || d.pin || cleanBd),
            officeCode: '155-UASU',
            officeName: defProf.officeName,
            officeLogo: defProf.officeLogo,
            officeSlogan: defProf.officeSlogan,
            officeBase: defProf.officeBase,
            isDefault155: true,
            updatedAt: d.updatedAt || new Date().toISOString(),
          };
        }
      });
    }

    saveGlobalUserOfficeMap(localMap, false);
  } catch {}

  return localMap;
}

// ============================================================================
// 5. NEW OFFICE REGISTRATION APPROVAL WORKFLOW (3-Step Submit -> Master Approve)
// ============================================================================
export function getPendingOfficeRequestsLocal(): PendingOfficeRegistrationRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = getRawLocalStorageItem(PENDING_OFFICE_REQUESTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePendingOfficeRequestsLocal(
  list: PendingOfficeRegistrationRequest[],
  syncToCloud: boolean = true,
  emitEvent: boolean = true
): void {
  if (typeof window === 'undefined') return;
  try {
    setRawLocalStorageItem(PENDING_OFFICE_REQUESTS_KEY, JSON.stringify(list));
    if (emitEvent) {
      window.dispatchEvent(new CustomEvent('baf_pending_office_requests_updated', { detail: list }));
    }
  } catch {}

  if (syncToCloud && masterDbInstance) {
    setDoc(
      doc(masterDbInstance, 'app_settings', PENDING_OFFICE_REQUESTS_KEY),
      {
        key: PENDING_OFFICE_REQUESTS_KEY,
        settingKey: PENDING_OFFICE_REQUESTS_KEY,
        value: JSON.stringify(list),
        updated_at: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    ).catch(() => {});
  }
}

export async function fetchPendingOfficeRequestsFromMaster(): Promise<PendingOfficeRegistrationRequest[]> {
  const localList = getPendingOfficeRequestsLocal();
  const byId = new Map<string, PendingOfficeRegistrationRequest>();
  localList.forEach((item) => {
    if (item && item.id) byId.set(item.id, item);
  });

  if (masterDbInstance) {
    try {
      const snap = await getDoc(doc(masterDbInstance, 'app_settings', PENDING_OFFICE_REQUESTS_KEY));
      if (snap.exists()) {
        const data = snap.data();
        const rawVal = data?.value;
        if (rawVal) {
          let cloudList: any = rawVal;
          if (typeof rawVal === 'string') {
            try {
              cloudList = JSON.parse(rawVal);
            } catch {}
          } else if (rawVal && typeof rawVal === 'object' && Array.isArray(rawVal.data)) {
            cloudList = rawVal.data;
          }
          if (Array.isArray(cloudList)) {
            cloudList.forEach((item: PendingOfficeRegistrationRequest) => {
              if (!item || !item.id) return;
              const existing = byId.get(item.id);
              if (
                !existing ||
                new Date(item.updatedAt || 0).getTime() >= new Date(existing.updatedAt || 0).getTime()
              ) {
                byId.set(item.id, item);
              }
            });
          }
        }
      }
    } catch {}
  }

  const merged = Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
  savePendingOfficeRequestsLocal(merged, false, false);
  return merged;
}

export async function submitOfficeRegistrationRequest(input: {
  officeName: string;
  wing: string;
  officeBase: string;
  officeSlogan: string;
  officeLogo: string;
  bdNo: string;
  rank: string;
  fullName: string;
  surname: string;
  trade: string;
  flightName: string;
  userRole: string;
  contactNo: string;
  pin?: string;
}): Promise<PendingOfficeRegistrationRequest> {
  const cleanBd = String(input.bdNo || '')
    .replace(/^BD\/?/i, '')
    .replace(/[^0-9]/g, '')
    .trim();
  const cleanOfficeName = String(input.officeName || '').trim();
  const officeCode = generateOfficeCodeFromName(cleanOfficeName);
  const nowIso = new Date().toISOString();

  const existingList = await fetchPendingOfficeRequestsFromMaster().catch(() =>
    getPendingOfficeRequestsLocal()
  );

  // Check if there is already a pending request for the same BD No + Office Code
  const existingIdx = existingList.findIndex(
    (r) =>
      r.bdNo === cleanBd &&
      r.officeCode.toUpperCase() === officeCode.toUpperCase() &&
      r.status === 'PENDING'
  );

  const reqRecord: PendingOfficeRegistrationRequest = {
    id:
      existingIdx >= 0
        ? existingList[existingIdx].id
        : `off_req_${officeCode}_${cleanBd}_${Date.now()}`,
    officeName: cleanOfficeName,
    officeCode,
    wing: String(input.wing || '').trim(),
    officeBase: String(input.officeBase || 'BAF BASE ZHR').trim() || 'BAF BASE ZHR',
    officeSlogan:
      String(input.officeSlogan || 'Intel • Surveillance • Strike').trim() ||
      'Intel • Surveillance • Strike',
    officeLogo:
      String(input.officeLogo || '/155-uasu-baf-logo.png').trim() || '/155-uasu-baf-logo.png',
    bdNo: cleanBd,
    rank: String(input.rank || 'LAC').trim() || 'LAC',
    fullName: String(input.fullName || '').trim(),
    surname: String(input.surname || input.fullName || '').trim(),
    trade: String(input.trade || 'Radio Fitt').trim() || 'Radio Fitt',
    flightName: String(input.flightName || '').trim(),
    userRole: String(input.userRole || 'SUPER_ADMIN').trim() || 'SUPER_ADMIN',
    contactNo: String(input.contactNo || '').trim(),
    pin: String(input.pin || cleanBd).trim() || cleanBd,
    status: 'PENDING',
    createdAt: existingIdx >= 0 ? existingList[existingIdx].createdAt : nowIso,
    updatedAt: nowIso,
  };

  if (existingIdx >= 0) {
    existingList[existingIdx] = reqRecord;
  } else {
    existingList.unshift(reqRecord);
  }

  savePendingOfficeRequestsLocal(existingList, true);
  return reqRecord;
}

export async function approveOfficeRegistrationRequest(
  requestId: string
): Promise<PendingOfficeRegistrationRequest | null> {
  const list = await fetchPendingOfficeRequestsFromMaster().catch(() =>
    getPendingOfficeRequestsLocal()
  );
  const idx = list.findIndex((r) => r.id === requestId);
  if (idx === -1) return null;

  const req = list[idx];
  const nowIso = new Date().toISOString();
  const officeCode = String(req.officeCode || generateOfficeCodeFromName(req.officeName))
    .toUpperCase()
    .trim();
  const safeCode = officeCode.replace(/[^A-Z0-9_-]/g, '_');
  const cleanBd = String(req.bdNo || '')
    .replace(/^BD\/?/i, '')
    .replace(/[^0-9]/g, '')
    .trim();
  const displaySurname = String(req.surname || req.fullName || 'Airman').trim();
  const displayFullName = String(req.fullName || req.surname || 'Airman').trim();
  const userPin = String(req.pin || cleanBd).trim() || cleanBd;
  const userRole = String(req.userRole || 'SUPER_ADMIN').trim() || 'SUPER_ADMIN';

  // 1. Save Scoped Office Profile (`baf_office_profile_v1__office_${safeCode}`)
  const officeProfilePayload: OfficeProfileData = {
    officeName: req.officeName,
    officeLogo: req.officeLogo || '/155-uasu-baf-logo.png',
    officeSlogan: req.officeSlogan || 'Intel • Surveillance • Strike',
    officeBase: req.officeBase || 'BAF BASE ZHR',
  };
  setRawLocalStorageItem(
    `${OFFICE_PROFILE_STORAGE_KEY}__office_${safeCode}`,
    JSON.stringify(officeProfilePayload)
  );

  // 2. Build Biodata Register (`Airman`) & User Management (`DetailedUserLogin`) records
  const airmanId = `airman-${cleanBd}`;
  const shortCode =
    displaySurname
      .replace(/[^a-zA-Z]/g, '')
      .slice(0, 3)
      .toUpperCase() || 'USR';

  const newAirmanRecord = {
    id: airmanId,
    serNo: 1,
    seniority: 1,
    code: shortCode,
    bdNo: cleanBd,
    rank: req.rank || 'LAC',
    fullName: displayFullName,
    name: displaySurname,
    trade: req.trade || 'Radio Fitt',
    addressBlock: req.officeBase || 'BAF BASE ZHR',
    mobileNo: req.contactNo || '',
    flightName: req.flightName || '',
    remarks: `Approved Office Registration (${req.officeName})`,
    active: true,
    sqn: req.officeName,
    wing: req.wing || '',
    role: userRole,
    status: 'Active',
    medicalCategory: 'AYE',
    basicCategory: 'B1',
  };

  const masterUserRecord = {
    id: 'user-login-48456',
    userId: MASTER_USER_ID,
    airmanId: 'airman-48456',
    bdNo: MASTER_USER_ID,
    rank: 'Master',
    name: 'System Master Owner',
    flightName: '',
    trade: 'System Control',
    role: 'master_owner',
    pin: MASTER_USER_PIN,
    password: MASTER_USER_PIN,
    adminPass: '1124',
    ownerPass: '1124',
    isProtected: true,
    status: 'ACTIVE',
    detailOrder: 'MASTER-OWNER-PROTECTED',
    detailedAt: nowIso,
    detailedBy: 'System Auto-Provision',
    remarks: 'Protected System Master Owner Account',
    updatedAt: nowIso,
  };

  const requesterUserRecord = {
    id: `user-login-${cleanBd}`,
    userId: cleanBd,
    airmanId,
    bdNo: cleanBd,
    rank: req.rank || 'LAC',
    name: displaySurname,
    fullName: displayFullName,
    mobileNo: req.contactNo || '',
    flightName: req.flightName || '',
    trade: req.trade || 'Radio Fitt',
    role: userRole,
    pin: userPin,
    password: userPin,
    adminPass: '1124',
    status: 'ACTIVE',
    detailOrder: `DO-${officeCode}/APPROVED/${cleanBd}`,
    detailedAt: nowIso,
    detailedBy: 'Master Admin Approval',
    remarks: `${req.officeName}${req.wing ? ` (${req.wing})` : ''} • ${displayFullName}`,
    updatedAt: nowIso,
  };

  // 3. Write Scoped User Management (`baf_detailed_user_logins__office_${safeCode}`)
  const scopedUsersKey = `baf_detailed_user_logins__office_${safeCode}`;
  let existingOfficeUsers: any[] = [];
  try {
    const rawU = getRawLocalStorageItem(scopedUsersKey);
    if (rawU) {
      const p = JSON.parse(rawU);
      if (Array.isArray(p)) existingOfficeUsers = p;
    }
  } catch {}
  const filteredUsers = existingOfficeUsers.filter(
    (u) =>
      String(u.bdNo || u.userId || '').replace(/^BD\/?/i, '').trim() !== cleanBd &&
      String(u.bdNo || u.userId || '').replace(/^BD\/?/i, '').trim() !== MASTER_USER_ID
  );
  const updatedOfficeUsers = [masterUserRecord, requesterUserRecord, ...filteredUsers];
  setRawLocalStorageItem(scopedUsersKey, JSON.stringify(updatedOfficeUsers));

  // 4. Write Scoped Local Database (`baf_local_db_v3__office_${safeCode}`) for Biodata Register
  const scopedDbKey = `baf_local_db_v3__office_${safeCode}`;
  let officeDbObj: any = {
    airmen: [newAirmanRecord],
    assignments: [],
    leaves: [],
    tdyRecords: [],
    deployments: [],
    dutyHistory: {},
    detailedUsers: updatedOfficeUsers,
    dutyTypes: [],
    flightConfigs: [],
    paradeStates: {},
    settings: {
      [OFFICE_PROFILE_STORAGE_KEY]: JSON.stringify(officeProfilePayload),
    },
    lastUpdated: Date.now(),
  };
  try {
    const rawDb = getRawLocalStorageItem(scopedDbKey);
    if (rawDb) {
      const parsedDb = JSON.parse(rawDb);
      if (parsedDb && typeof parsedDb === 'object') {
        const existingAirmen = Array.isArray(parsedDb.airmen) ? parsedDb.airmen : [];
        const otherAirmen = existingAirmen.filter(
          (a: any) => String(a.bdNo || '').replace(/^BD\/?/i, '').trim() !== cleanBd
        );
        officeDbObj = {
          ...parsedDb,
          airmen: [newAirmanRecord, ...otherAirmen],
          detailedUsers: updatedOfficeUsers,
          settings: {
            ...(parsedDb.settings || {}),
            [OFFICE_PROFILE_STORAGE_KEY]: JSON.stringify(officeProfilePayload),
          },
          lastUpdated: Date.now(),
        };
      }
    }
  } catch {}
  setRawLocalStorageItem(scopedDbKey, JSON.stringify(officeDbObj));

  // 5. Sync Approved Office, Biodata Register & User Management to Firestore (`masterDbInstance`)
  const fbConfig = {
    ...buildAutoCloudFirebaseConfig(req.officeName, officeCode),
    officeSlogan: officeProfilePayload.officeSlogan,
    officeBase: officeProfilePayload.officeBase,
  };

  await registerOfficeInMasterTelemetry(
    {
      officeName: req.officeName,
      officeLogo: officeProfilePayload.officeLogo,
      officeSlogan: officeProfilePayload.officeSlogan,
      officeBase: officeProfilePayload.officeBase,
      officeCode,
      firebaseConfig: fbConfig,
      totalUsers: officeDbObj.airmen.length || 1,
    },
    officeDbObj.airmen.length || 1
  ).catch(() => {});

  if (masterDbInstance) {
    try {
      const docPrefix = `off_${safeCode}__`;
      await Promise.all([
        setDoc(
          doc(masterDbInstance, 'airmen', `${docPrefix}${airmanId}`),
          {
            ...newAirmanRecord,
            updated_at: nowIso,
          },
          { merge: true }
        ),
        setDoc(
          doc(masterDbInstance, 'user_profiles', `${docPrefix}user-login-${cleanBd}`),
          {
            ...requesterUserRecord,
            user_id: cleanBd,
            updated_at: nowIso,
          },
          { merge: true }
        ),
        setDoc(
          doc(masterDbInstance, 'app_settings', `${docPrefix}${OFFICE_PROFILE_STORAGE_KEY}`),
          {
            key: OFFICE_PROFILE_STORAGE_KEY,
            value: JSON.stringify(officeProfilePayload),
            updated_at: nowIso,
          },
          { merge: true }
        ),
      ]);
    } catch {}
  }

  // 6. Index the approved User -> Office mapping in Global User-Office Directory
  const customOfficeCfg: CustomOfficeConfig = {
    officeName: req.officeName,
    officeLogo: officeProfilePayload.officeLogo,
    officeSlogan: officeProfilePayload.officeSlogan,
    officeBase: officeProfilePayload.officeBase,
    officeCode,
    firebaseConfig: fbConfig,
    configuredAt: nowIso,
    adminUserId: cleanBd,
  };

  registerUsersInGlobalOfficeDirectory([requesterUserRecord], {
    officeCode,
    officeName: req.officeName,
    officeLogo: officeProfilePayload.officeLogo,
    officeSlogan: officeProfilePayload.officeSlogan,
    officeBase: officeProfilePayload.officeBase,
    isDefault155: false,
    officeConfig: customOfficeCfg,
  });

  // 7. Update request status to APPROVED
  const approvedReq: PendingOfficeRegistrationRequest = {
    ...req,
    status: 'APPROVED',
    approvedAt: nowIso,
    updatedAt: nowIso,
  };
  list[idx] = approvedReq;
  savePendingOfficeRequestsLocal(list, true);

  return approvedReq;
}

export async function rejectOfficeRegistrationRequest(
  requestId: string
): Promise<PendingOfficeRegistrationRequest | null> {
  const list = await fetchPendingOfficeRequestsFromMaster().catch(() =>
    getPendingOfficeRequestsLocal()
  );
  const idx = list.findIndex((r) => r.id === requestId);
  if (idx === -1) return null;

  const nowIso = new Date().toISOString();
  const rejectedReq: PendingOfficeRegistrationRequest = {
    ...list[idx],
    status: 'REJECTED',
    rejectedAt: nowIso,
    updatedAt: nowIso,
  };
  list[idx] = rejectedReq;
  savePendingOfficeRequestsLocal(list, true);
  return rejectedReq;
}

// ============================================================================
// AUTH & ERROR EXPORTS
// ============================================================================
export const googleAuthProvider = new GoogleAuthProvider();

export { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, onAuthStateChanged };
export const firebaseSignOut = async () => {
  if (officeAuthInstance) {
    await signOut(officeAuthInstance);
  }
};
export type FirebaseUser = FirebaseUserType;

export const CLIENT_SESSION_ID: string = (() => {
  if (typeof window === 'undefined') return `srv_${Date.now()}`;
  try {
    const existing = window.sessionStorage.getItem('baf_client_session_id');
    if (existing) return existing;
    const generated = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem('baf_client_session_id', generated);
    return generated;
  } catch {
    return `sess_${Date.now().toString(36)}`;
  }
})();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const QUOTA_EXCEEDED_KEY = 'baf_firebase_quota_exceeded_at';
const QUOTA_MSG_KEY = 'baf_firebase_quota_error_msg';

let quotaExceededMemory: boolean = (() => {
  if (typeof window === 'undefined') return false;
  try {
    const saved = window.localStorage.getItem(QUOTA_EXCEEDED_KEY);
    if (!saved) return false;
    const savedTime = Date.parse(saved);
    if (isNaN(savedTime)) return false;
    const savedUtcDay = new Date(savedTime).toISOString().slice(0, 10);
    const currentUtcDay = new Date().toISOString().slice(0, 10);
    if (savedUtcDay !== currentUtcDay || Date.now() - savedTime > 12 * 60 * 60 * 1000) {
      window.localStorage.removeItem(QUOTA_EXCEEDED_KEY);
      window.localStorage.removeItem(QUOTA_MSG_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
})();

export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  const code = String((error as any)?.code || '').toLowerCase();
  const msg = String((error as any)?.message || error || '').toLowerCase();
  return (
    code.includes('resource-exhausted') ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota exceeded') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('free daily read units') ||
    msg.includes('free daily write units') ||
    msg.includes('maximum backoff delay') ||
    msg.includes('429')
  );
}

export function isFirestoreQuotaExceeded(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(QUOTA_EXCEEDED_KEY);
      if (saved) {
        const savedTime = Date.parse(saved);
        if (!isNaN(savedTime)) {
          const savedUtcDay = new Date(savedTime).toISOString().slice(0, 10);
          const currentUtcDay = new Date().toISOString().slice(0, 10);
          if (savedUtcDay !== currentUtcDay || Date.now() - savedTime > 12 * 60 * 60 * 1000) {
            window.localStorage.removeItem(QUOTA_EXCEEDED_KEY);
            window.localStorage.removeItem(QUOTA_MSG_KEY);
            quotaExceededMemory = false;
            return false;
          }
          quotaExceededMemory = true;
          return true;
        }
      }
    } catch {}
  }
  return quotaExceededMemory;
}

export function getQuotaConsoleUpgradeUrl(): string {
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  return `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${dbId}/data?openUpgradeDialog=true`;
}

export function setFirestoreQuotaExceeded(exceeded: boolean = false, errorMsg?: string): void {
  const prev = quotaExceededMemory;
  quotaExceededMemory = exceeded;

  if (typeof window !== 'undefined') {
    try {
      if (exceeded) {
        window.localStorage.setItem(QUOTA_EXCEEDED_KEY, new Date().toISOString());
        if (errorMsg) window.localStorage.setItem(QUOTA_MSG_KEY, errorMsg);
      } else {
        window.localStorage.removeItem(QUOTA_EXCEEDED_KEY);
        window.localStorage.removeItem(QUOTA_MSG_KEY);
      }
    } catch {}

    window.dispatchEvent(
      new CustomEvent('baf_firebase_quota_status', {
        detail: { exceeded, errorMsg: errorMsg || '' },
      })
    );

    if (exceeded && !prev) {
      window.dispatchEvent(
        new CustomEvent('baf_firebase_quota_exceeded', {
          detail: {
            exceeded: true,
            errorMsg: errorMsg || 'Firestore daily quota exceeded',
            upgradeUrl: getQuotaConsoleUpgradeUrl(),
          },
        })
      );
    }
  }
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errorStr = error instanceof Error ? error.message : String(error);
  if (isQuotaExceededError(error)) {
    setFirestoreQuotaExceeded(true, errorStr);
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorStr,
    authInfo: {
      userId: officeAuthInstance?.currentUser?.uid || null,
      email: officeAuthInstance?.currentUser?.email || null,
      emailVerified: officeAuthInstance?.currentUser?.emailVerified || null,
      isAnonymous: officeAuthInstance?.currentUser?.isAnonymous || null,
      tenantId: officeAuthInstance?.currentUser?.tenantId || null,
      providerInfo:
        officeAuthInstance?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  if (!isFirebaseConfigured || !officeDbInstance || isFirestoreQuotaExceeded()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      getDoc(doc(officeDbInstance, 'test', 'connection')),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Firestore connection test timeout after 8000ms')), 8000);
      }),
    ]);
    if (isFirestoreQuotaExceeded()) {
      setFirestoreQuotaExceeded(false);
    }
    return true;
  } catch (error) {
    if (isQuotaExceededError(error)) {
      const msg = error instanceof Error ? error.message : String(error);
      setFirestoreQuotaExceeded(true, msg);
      return false;
    }
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export default officeAppInstance;
