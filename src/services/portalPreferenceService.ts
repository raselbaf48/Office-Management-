export type PortalType = 'Office';

export const PORTAL_STORAGE_KEY = 'baf_last_used_login_portal';
export const DEFAULT_PORTAL: PortalType = 'Office';
export const OFFICE_LAST_ID_KEY = 'baf_office_last_used_id';

export function isValidPortal(portal: any): portal is PortalType {
  return portal === 'Office';
}

export function hasSavedPortalPreference(): boolean {
  return true;
}

export function getLastUsedPortal(): PortalType {
  return 'Office';
}

export function setLastUsedPortal(_portal: PortalType): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(PORTAL_STORAGE_KEY, 'Office');
    }
  } catch {}
}

export async function syncPortalFromCloud(): Promise<PortalType | null> {
  return 'Office';
}

export const RECENT_LOGINS_KEY = 'baf_recent_logins';

function persistKeyToLocalCloud(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.setItem(key, value);

    // Sync into Local Cloud snapshot in localStorage
    const rawSnap = localStorage.getItem('baf_local_storage_snapshot');
    const parsed = rawSnap ? JSON.parse(rawSnap) : {};
    if (parsed && typeof parsed === 'object') {
      if (!parsed.app_settings || typeof parsed.app_settings !== 'object') {
        parsed.app_settings = {};
      }
      parsed.app_settings[key] = value;
      localStorage.setItem('baf_local_storage_snapshot', JSON.stringify(parsed));
    }

    // Also persist to Local Cloud server endpoint non-blockingly
    const rawFetch = (window as any).__baf_raw_fetch || window.fetch;
    if (typeof rawFetch === 'function') {
      rawFetch('/api/canteen/save-setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setting_key: key, setting_value: value }),
      }).catch(() => {});
    }
  } catch {}
}

function cleanUserId(raw: any): string {
  if (!raw) return '';
  return String(raw).replace(/^BD\/?/i, '').replace(/[^0-9]/g, '').trim();
}

export function getLastUsedIdForPortal(_portal?: PortalType): string {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return '';
    const saved =
      cleanUserId(localStorage.getItem(OFFICE_LAST_ID_KEY)) ||
      cleanUserId(localStorage.getItem('baf_last_used_id'));
    if (saved) return saved;

    const recentsRaw = localStorage.getItem(RECENT_LOGINS_KEY);
    if (recentsRaw) {
      const list = JSON.parse(recentsRaw);
      if (Array.isArray(list) && list.length > 0) {
        const first = cleanUserId(list[0]);
        if (first) return first;
      }
    }

    const rawSnap = localStorage.getItem('baf_local_storage_snapshot');
    if (rawSnap) {
      const parsed = JSON.parse(rawSnap);
      const snapId =
        cleanUserId(parsed?.app_settings?.[OFFICE_LAST_ID_KEY]) ||
        cleanUserId(parsed?.app_settings?.['baf_last_used_id']);
      if (snapId) return snapId;

      const snapRecents = parsed?.app_settings?.[RECENT_LOGINS_KEY];
      if (snapRecents) {
        const list = typeof snapRecents === 'string' ? JSON.parse(snapRecents) : snapRecents;
        if (Array.isArray(list) && list.length > 0) {
          const first = cleanUserId(list[0]);
          if (first) return first;
        }
      }
    }
  } catch {}
  return '';
}

export function getRecentLoginsForPortal(): string[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    let list: string[] = [];
    const recentsRaw = localStorage.getItem(RECENT_LOGINS_KEY);
    if (recentsRaw) {
      const parsed = JSON.parse(recentsRaw);
      if (Array.isArray(parsed)) {
        list = parsed.map(cleanUserId).filter(Boolean);
      }
    }
    if (list.length === 0) {
      const rawSnap = localStorage.getItem('baf_local_storage_snapshot');
      if (rawSnap) {
        const snap = JSON.parse(rawSnap);
        const snapRecents = snap?.app_settings?.[RECENT_LOGINS_KEY];
        if (snapRecents) {
          const parsed = typeof snapRecents === 'string' ? JSON.parse(snapRecents) : snapRecents;
          if (Array.isArray(parsed)) {
            list = parsed.map(cleanUserId).filter(Boolean);
          }
        }
      }
    }

    // Ensure the latest auto-filled User ID is also present in the Recent Accounts list
    const lastId = getLastUsedIdForPortal('Office');
    if (lastId) {
      const deduped = [lastId, ...list.filter((x) => x !== lastId)].slice(0, 5);
      if (JSON.stringify(deduped) !== JSON.stringify(list)) {
        localStorage.setItem(RECENT_LOGINS_KEY, JSON.stringify(deduped));
      }
      if (!localStorage.getItem(OFFICE_LAST_ID_KEY)) {
        localStorage.setItem(OFFICE_LAST_ID_KEY, lastId);
      }
      if (!localStorage.getItem('baf_last_used_id')) {
        localStorage.setItem('baf_last_used_id', lastId);
      }
      return deduped;
    }

    return Array.from(new Set(list)).slice(0, 5);
  } catch {
    return [];
  }
}

export function saveLastUsedIdForPortal(_portal: 'Office', id: string): void {
  const clean = cleanUserId(id);
  if (!clean) return;
  persistKeyToLocalCloud(OFFICE_LAST_ID_KEY, clean);
  persistKeyToLocalCloud('baf_last_used_id', clean);
}

export function recordPortalLoginSuccess(id: string): string[] {
  const clean = cleanUserId(id);
  if (!clean) return getRecentLoginsForPortal();
  const current = getRecentLoginsForPortal();
  const updated = [clean, ...current.filter((x) => x !== clean)].slice(0, 5);
  persistKeyToLocalCloud(OFFICE_LAST_ID_KEY, clean);
  persistKeyToLocalCloud('baf_last_used_id', clean);
  persistKeyToLocalCloud(RECENT_LOGINS_KEY, JSON.stringify(updated));
  return updated;
}

export function removeRecentLoginForPortal(idToRemove: string): string[] {
  const cleanRemove = cleanUserId(idToRemove);
  const current = getRecentLoginsForPortal();
  const updated = current.filter((x) => x !== cleanRemove);
  persistKeyToLocalCloud(RECENT_LOGINS_KEY, JSON.stringify(updated));
  const currentLast = getLastUsedIdForPortal('Office');
  if (currentLast === cleanRemove) {
    const nextLast = updated[0] || '';
    persistKeyToLocalCloud(OFFICE_LAST_ID_KEY, nextLast);
    persistKeyToLocalCloud('baf_last_used_id', nextLast);
  }
  return updated;
}

export async function syncLastUsedIdsFromCloud(): Promise<{ officeId?: string }> {
  try {
    const officeId = getLastUsedIdForPortal('Office') || undefined;
    return { officeId };
  } catch {
    return {};
  }
}

