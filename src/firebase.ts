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

export interface OfficeProfileData {
  officeName: string;
  officeLogo: string;
  officeSlogan: string;
  officeBase: string;
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
