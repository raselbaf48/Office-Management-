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

export function getLastUsedIdForPortal(_portal?: PortalType): string {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return '';
    const saved = localStorage.getItem(OFFICE_LAST_ID_KEY) || localStorage.getItem('baf_last_used_id');
    if (saved) return saved;
    const recents = localStorage.getItem('baf_recent_logins');
    if (recents) {
      const list = JSON.parse(recents);
      if (Array.isArray(list) && list.length > 0) return list[0];
    }
  } catch {}
  return '';
}

export function saveLastUsedIdForPortal(_portal: 'Office', id: string): void {
  const clean = id.replace(/^BD\/?/i, '').trim();
  if (!clean) return;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(OFFICE_LAST_ID_KEY, clean);
      localStorage.setItem('baf_last_used_id', clean);
    }
  } catch {}
}

export async function syncLastUsedIdsFromCloud(): Promise<{ officeId?: string }> {
  try {
    const res: { officeId?: string } = {};
    if (typeof window !== 'undefined' && window.localStorage) {
      res.officeId = localStorage.getItem(OFFICE_LAST_ID_KEY) || localStorage.getItem('baf_last_used_id') || undefined;
    }
    return res;
  } catch {
    return {};
  }
}
