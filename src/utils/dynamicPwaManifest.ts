export interface DynamicPWAOfficeIdentity {
  officeName: string;
  officeLogo: string;
  officeCode?: string;
  officeSlogan?: string;
  officeBase?: string;
}

const DEFAULT_APP_NAME = 'Office Management Application';
const DEFAULT_SHORT_NAME = 'Office Mgmt';
const DEFAULT_LOGO_PATH = '/office-management-logo.png?v=15';

let lastSyncedSignature = '';
const iconResizeCache = new Map<string, { icon192: string; icon512: string; maskable512: string; hash: string }>();
const uploadedHashes = new Set<string>();

function computeSimpleHash(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `pwa_${(h >>> 0).toString(16)}`;
}

function resolveAbsoluteUrl(src: string): string {
  if (!src) return `${window.location.origin}${DEFAULT_LOGO_PATH}`;
  if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:')) {
    return src;
  }
  return `${window.location.origin}${src.startsWith('/') ? src : `/${src}`}`;
}

/**
 * Renders any office logo (URL or Base64, even non-square images like 1846x2304)
 * onto exact 192x192 and 512x512 square canvases so Chromium/Windows/Android
 * never rejects the icon for non-square dimensions and falls back to a letter badge ("1").
 */
async function generateSizedPwaIcons(
  logoSrc: string
): Promise<{ icon192: string; icon512: string; maskable512: string; hash: string }> {
  const absSrc = resolveAbsoluteUrl(logoSrc);
  const cached = iconResizeCache.get(absSrc);
  if (cached) return cached;

  const hash = computeSimpleHash(absSrc);

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const renderToSize = (size: number, isMaskable: boolean): string => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) return absSrc;

            if (isMaskable) {
              ctx.fillStyle = '#020617';
              ctx.fillRect(0, 0, size, size);
            } else {
              ctx.clearRect(0, 0, size, size);
            }

            const paddingRatio = isMaskable ? 0.12 : 0.02;
            const pad = Math.round(size * paddingRatio);
            const availW = size - pad * 2;
            const availH = size - pad * 2;

            const imgW = img.naturalWidth || size;
            const imgH = img.naturalHeight || size;
            const scale = Math.min(availW / imgW, availH / imgH);
            const drawW = Math.round(imgW * scale);
            const drawH = Math.round(imgH * scale);
            const dx = Math.round((size - drawW) / 2);
            const dy = Math.round((size - drawH) / 2);

            ctx.drawImage(img, dx, dy, drawW, drawH);
            return canvas.toDataURL('image/png');
          };

          const result = {
            icon192: renderToSize(192, false),
            icon512: renderToSize(512, false),
            maskable512: renderToSize(512, true),
            hash,
          };
          iconResizeCache.set(absSrc, result);
          resolve(result);
        } catch {
          resolve({ icon192: absSrc, icon512: absSrc, maskable512: absSrc, hash });
        }
      };
      img.onerror = () => {
        resolve({ icon192: absSrc, icon512: absSrc, maskable512: absSrc, hash });
      };
      img.src = absSrc;
    } catch {
      resolve({ icon192: absSrc, icon512: absSrc, maskable512: absSrc, hash });
    }
  });
}

function buildShortName(officeName: string, isGeneric: boolean): string {
  if (isGeneric) return DEFAULT_SHORT_NAME;
  const trimmed = officeName.trim();
  if (trimmed.length <= 12) return trimmed;
  return trimmed.slice(0, 12).trim();
}

/**
 * Dynamically updates `<link rel="manifest">`, `<link rel="apple-touch-icon">`,
 * `<meta name="apple-mobile-web-app-title">`, and uploads exact 192x192 & 512x512
 * square PNG buffers to `/api/pwa-icon-upload` so Windows/Android/iOS always gets
 * the real office logo instead of a fallback letter/number icon.
 */
export async function syncDynamicOfficePwaManifest(
  identity: DynamicPWAOfficeIdentity
): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  try {
    const rawName = String(identity.officeName || '').trim();
    const isGeneric =
      !rawName ||
      rawName === 'Office Management' ||
      rawName === 'Office Management Application' ||
      rawName === 'Office Management System';

    const appName = isGeneric ? DEFAULT_APP_NAME : rawName;
    const shortName = buildShortName(appName, isGeneric);
    const rawLogo =
      String(identity.officeLogo || '').trim() ||
      (isGeneric ? DEFAULT_LOGO_PATH : '/155-uasu-baf-logo.png');
    const officeCode = String(identity.officeCode || '').trim();
    const slogan = String(identity.officeSlogan || '').trim();

    const sig = `${appName}__${rawLogo.slice(0, 120)}__${officeCode}__${slogan}`;
    if (sig === lastSyncedSignature) return;
    lastSyncedSignature = sig;

    // 1. Update iOS & mobile web app title meta tags
    let appleTitleMeta = document.head.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-title"]'
    );
    if (!appleTitleMeta) {
      appleTitleMeta = document.createElement('meta');
      appleTitleMeta.name = 'apple-mobile-web-app-title';
      document.head.appendChild(appleTitleMeta);
    }
    appleTitleMeta.content = appName;

    let appNameMeta = document.head.querySelector<HTMLMetaElement>(
      'meta[name="application-name"]'
    );
    if (!appNameMeta) {
      appNameMeta = document.createElement('meta');
      appNameMeta.name = 'application-name';
      document.head.appendChild(appNameMeta);
    }
    appNameMeta.content = appName;

    // 2. Generate exact square PNG icons (192x192, 512x512, maskable 512x512) via Canvas
    const sizedIcons = await generateSizedPwaIcons(rawLogo);

    // 3. Upload exact square 192x192 & 512x512 PNGs to server so Chromium can fetch real HTTP PNG endpoints
    if (
      sizedIcons.icon192.startsWith('data:image/png') &&
      !uploadedHashes.has(sizedIcons.hash)
    ) {
      try {
        const res = await fetch('/api/pwa-icon-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hash: sizedIcons.hash,
            icon192: sizedIcons.icon192,
            icon512: sizedIcons.icon512,
            maskable512: sizedIcons.maskable512,
          }),
        });
        if (res.ok) {
          uploadedHashes.add(sizedIcons.hash);
        }
      } catch {}
    }

    const serverIcon192Url = uploadedHashes.has(sizedIcons.hash)
      ? `/api/pwa-icon/${encodeURIComponent(sizedIcons.hash)}/icon-192.png`
      : sizedIcons.icon192;
    const serverIcon512Url = uploadedHashes.has(sizedIcons.hash)
      ? `/api/pwa-icon/${encodeURIComponent(sizedIcons.hash)}/icon-512.png`
      : sizedIcons.icon512;

    // 4. Update apple-touch-icon and link[rel="icon"] elements to exact square PNGs
    const appleTouchIcons = document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel="apple-touch-icon"]'
    );
    if (appleTouchIcons.length > 0) {
      appleTouchIcons.forEach((linkEl) => {
        linkEl.href = serverIcon192Url;
      });
    } else {
      const appleIcon = document.createElement('link');
      appleIcon.rel = 'apple-touch-icon';
      appleIcon.sizes = '180x180';
      appleIcon.href = serverIcon192Url;
      document.head.appendChild(appleIcon);
    }

    const favicons = document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"]'
    );
    favicons.forEach((linkEl) => {
      if (linkEl.sizes?.value === '512x512') {
        linkEl.href = serverIcon512Url;
      } else {
        linkEl.href = serverIcon192Url;
      }
    });

    // 5. Point <link rel="manifest"> to the server-backed manifest referencing the exact square PNG endpoints
    let manifestLink = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }

    const params = new URLSearchParams();
    params.set('name', appName);
    params.set('logo', rawLogo.startsWith('data:') ? '' : rawLogo);
    if (uploadedHashes.has(sizedIcons.hash)) {
      params.set('iconHash', sizedIcons.hash);
    }
    if (officeCode) params.set('code', officeCode);
    if (slogan) params.set('slogan', slogan);
    params.set('_t', String(Date.now()));
    manifestLink.href = `/api/pwa-manifest?${params.toString()}`;

    window.dispatchEvent(
      new CustomEvent('baf_pwa_identity_updated', {
        detail: {
          officeName: appName,
          shortName,
          officeLogo: serverIcon192Url,
          rawLogo,
          isGeneric,
        },
      })
    );
  } catch (err) {
    console.warn('[dynamicPwaManifest] Failed to sync dynamic manifest:', err);
  }
}
