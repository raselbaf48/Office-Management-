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

let activeManifestBlobUrl: string | null = null;
let lastSyncedSignature = '';
const iconResizeCache = new Map<string, { icon192: string; icon512: string; maskable512: string }>();

function resolveAbsoluteUrl(src: string): string {
  if (!src) return `${window.location.origin}${DEFAULT_LOGO_PATH}`;
  if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:')) {
    return src;
  }
  return `${window.location.origin}${src.startsWith('/') ? src : `/${src}`}`;
}

/**
 * Renders any office logo (URL or Base64) onto a square canvas to produce
 * standard 192x192, 512x512, and maskable 512x512 PNG data URLs for PWA installation.
 */
async function generateSizedPwaIcons(
  logoSrc: string
): Promise<{ icon192: string; icon512: string; maskable512: string }> {
  const absSrc = resolveAbsoluteUrl(logoSrc);
  const cached = iconResizeCache.get(absSrc);
  if (cached) return cached;

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
              // Solid dark brand background with 14% safe-zone padding for Android maskable icon
              ctx.fillStyle = '#020617';
              ctx.fillRect(0, 0, size, size);
            } else {
              ctx.clearRect(0, 0, size, size);
            }

            const paddingRatio = isMaskable ? 0.14 : 0.04;
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
          };
          iconResizeCache.set(absSrc, result);
          resolve(result);
        } catch {
          resolve({ icon192: absSrc, icon512: absSrc, maskable512: absSrc });
        }
      };
      img.onerror = () => {
        resolve({ icon192: absSrc, icon512: absSrc, maskable512: absSrc });
      };
      img.src = absSrc;
    } catch {
      resolve({ icon192: absSrc, icon512: absSrc, maskable512: absSrc });
    }
  });
}

function buildShortName(officeName: string, isGeneric: boolean): string {
  if (isGeneric) return DEFAULT_SHORT_NAME;
  const trimmed = officeName.trim();
  if (trimmed.length <= 12) return trimmed;
  // Prefer keeping core unit identifier like "155 UASU BAF" (12 chars)
  return trimmed.slice(0, 12).trim();
}

/**
 * Dynamically updates `<link rel="manifest">`, `<link rel="apple-touch-icon">`,
 * `<meta name="apple-mobile-web-app-title">`, and favicons so installing the PWA
 * uses the active/matched Office's Name and Logo.
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

    // 2. Generate properly sized PNG icons (192x192, 512x512, maskable 512x512)
    const sizedIcons = await generateSizedPwaIcons(rawLogo);

    // 3. Update apple-touch-icon and link[rel="icon"] elements
    const appleTouchIcons = document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel="apple-touch-icon"]'
    );
    if (appleTouchIcons.length > 0) {
      appleTouchIcons.forEach((linkEl) => {
        linkEl.href = sizedIcons.icon192;
      });
    } else {
      const appleIcon = document.createElement('link');
      appleIcon.rel = 'apple-touch-icon';
      appleIcon.sizes = '180x180';
      appleIcon.href = sizedIcons.icon192;
      document.head.appendChild(appleIcon);
    }

    const favicons = document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"]'
    );
    favicons.forEach((linkEl) => {
      if (linkEl.sizes?.value === '512x512') {
        linkEl.href = sizedIcons.icon512;
      } else {
        linkEl.href = sizedIcons.icon192;
      }
    });

    // 4. Update <link rel="manifest">
    let manifestLink = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }

    const isDataUrlLogo = rawLogo.startsWith('data:');
    const startPath = officeCode
      ? `${window.location.origin}/?office=${encodeURIComponent(officeCode)}`
      : `${window.location.origin}/`;

    if (isDataUrlLogo) {
      // Custom uploaded base64 logo: build an in-memory Blob manifest with full origin URLs & canvas-sized PNG data URLs
      const manifestObj = {
        id: startPath,
        name: appName,
        short_name: shortName,
        description: slogan
          ? `${appName} — ${slogan}`
          : `Official PWA for ${appName} duty register, parade state, and personnel management.`,
        start_url: startPath,
        scope: `${window.location.origin}/`,
        display: 'standalone',
        background_color: '#020617',
        theme_color: '#020617',
        orientation: 'any',
        icons: [
          {
            src: sizedIcons.icon192,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: sizedIcons.icon512,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: sizedIcons.maskable512,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      };

      if (activeManifestBlobUrl) {
        try {
          URL.revokeObjectURL(activeManifestBlobUrl);
        } catch {}
      }
      const blob = new Blob([JSON.stringify(manifestObj)], {
        type: 'application/manifest+json',
      });
      activeManifestBlobUrl = URL.createObjectURL(blob);
      manifestLink.href = activeManifestBlobUrl;
    } else {
      // Standard URL logo: use the server-backed dynamic manifest endpoint
      const params = new URLSearchParams();
      params.set('name', appName);
      params.set('logo', rawLogo);
      if (officeCode) params.set('code', officeCode);
      if (slogan) params.set('slogan', slogan);
      manifestLink.href = `/api/pwa-manifest?${params.toString()}`;
    }

    window.dispatchEvent(
      new CustomEvent('baf_pwa_identity_updated', {
        detail: {
          officeName: appName,
          shortName,
          officeLogo: sizedIcons.icon192,
          rawLogo,
          isGeneric,
        },
      })
    );
  } catch (err) {
    console.warn('[dynamicPwaManifest] Failed to sync dynamic manifest:', err);
  }
}
