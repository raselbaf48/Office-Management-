export const DEFAULT_BAF_TRADES: string[] = [
  'Afr Fitt',
  'Eng Fitt',
  'E&I Fitt',
  'Radio Fitt',
  'Armt Fitt',
  'GS',
  'Log Asst',
  'Sec Asst (GD)',
  'Sec Asst (Accts)',
  'Admin Asst',
  'ATCA',
  'Cy Asst',
  'IT Asst',
];

const CUSTOM_TRADES_STORAGE_KEY = 'baf_custom_trades_v1';

export function getCustomTrades(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_TRADES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((t) => String(t || '').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function getAvailableTrades(extraTrades: string[] = []): string[] {
  const custom = getCustomTrades();
  const seen = new Set<string>();
  const result: string[] = [];

  for (const t of [...DEFAULT_BAF_TRADES, ...custom, ...extraTrades]) {
    const clean = String(t || '').trim();
    if (!clean || clean === '__CUSTOM__' || clean === 'Custom') continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  }

  return result;
}

export function addCustomTradeToList(tradeName: string): string[] {
  const clean = String(tradeName || '').trim();
  if (!clean || clean === '__CUSTOM__' || clean === 'Custom') {
    return getAvailableTrades();
  }

  const allExisting = getAvailableTrades();
  const alreadyExists = allExisting.some((t) => t.toLowerCase() === clean.toLowerCase());
  if (!alreadyExists && typeof window !== 'undefined' && window.localStorage) {
    try {
      const currentCustom = getCustomTrades();
      const nextCustom = [...currentCustom, clean];
      window.localStorage.setItem(CUSTOM_TRADES_STORAGE_KEY, JSON.stringify(nextCustom));
      window.dispatchEvent(new CustomEvent('baf_custom_trades_updated', { detail: nextCustom }));
    } catch {}
  }

  return getAvailableTrades();
}
