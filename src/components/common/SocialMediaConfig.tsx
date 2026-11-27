import React from 'react';
import { ExternalLink, Share2 } from 'lucide-react';
import {
  SocialAccountEntry,
  SocialAccountsMap,
  SocialPlatformKey,
} from '../../types';

export interface SocialPlatformMeta {
  key: SocialPlatformKey;
  labelAr: string;
  labelEn: string;
  placeholder: string;
  urlPrefixHint: string;
}

export const SOCIAL_PLATFORMS: SocialPlatformMeta[] = [
  {
    key: 'snapchat',
    labelAr: 'سناب شات',
    labelEn: 'Snapchat',
    placeholder: 'alqaemhajj أو رابط الحساب المباشر',
    urlPrefixHint: 'snapchat.com/add/',
  },
  {
    key: 'tiktok',
    labelAr: 'تيك توك',
    labelEn: 'TikTok',
    placeholder: 'alqaemhajj أو رابط الحساب المباشر',
    urlPrefixHint: 'tiktok.com/@',
  },
  {
    key: 'youtube',
    labelAr: 'يوتيوب',
    labelEn: 'YouTube',
    placeholder: 'alqaemhajj أو رابط القناة المباشر',
    urlPrefixHint: 'youtube.com/@',
  },
  {
    key: 'instagram',
    labelAr: 'إنستغرام',
    labelEn: 'Instagram',
    placeholder: 'alqaemhajj أو رابط الحساب المباشر',
    urlPrefixHint: 'instagram.com/',
  },
  {
    key: 'x',
    labelAr: 'إكس / تويتر',
    labelEn: 'X',
    placeholder: 'alqaemhajj أو رابط الحساب المباشر',
    urlPrefixHint: 'x.com/',
  },
  {
    key: 'whatsapp',
    labelAr: 'واتساب',
    labelEn: 'WhatsApp',
    placeholder: '0534717773 أو رابط القناة / الواتساب',
    urlPrefixHint: 'wa.me/',
  },
  {
    key: 'telegram',
    labelAr: 'تيليجرام',
    labelEn: 'Telegram',
    placeholder: 'alqaemhajj أو رابط القناة المباشر',
    urlPrefixHint: 't.me/',
  },
  {
    key: 'facebook',
    labelAr: 'فيسبوك',
    labelEn: 'Facebook',
    placeholder: 'alqaemhajj أو رابط الصفحة المباشر',
    urlPrefixHint: 'facebook.com/',
  },
];

export function createEmptySocialAccounts(): SocialAccountsMap {
  return {
    snapchat: { enabled: false, value: '' },
    tiktok: { enabled: false, value: '' },
    youtube: { enabled: false, value: '' },
    instagram: { enabled: false, value: '' },
    x: { enabled: false, value: '' },
    whatsapp: { enabled: false, value: '' },
    telegram: { enabled: false, value: '' },
    facebook: { enabled: false, value: '' },
  };
}

export function normalizeSocialAccountsMap(
  raw?: Partial<SocialAccountsMap> | null
): SocialAccountsMap {
  const base = createEmptySocialAccounts();
  if (!raw || typeof raw !== 'object') return base;
  SOCIAL_PLATFORMS.forEach(({ key }) => {
    const entry = raw[key];
    if (entry && typeof entry === 'object') {
      base[key] = {
        enabled: Boolean(entry.enabled),
        value: typeof entry.value === 'string' ? entry.value : '',
      };
    }
  });
  return base;
}

/**
 * Safely resolves either a full HTTP(S) URL or a username/@handle/phone into a valid external URL.
 * Blocks unsafe schemes like javascript: or data:.
 */
export function resolveSocialAccountUrl(
  platform: SocialPlatformKey,
  rawValue?: string
): string | null {
  const trimmed = (rawValue || '').trim();
  if (!trimmed) return null;

  // Reject unsafe schemes immediately
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    return null;
  }

  // Case 1: Full URL with http:// or https://
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.toString();
      }
      return null;
    } catch {
      return null;
    }
  }

  // Case 2: Domain-like URL without scheme (e.g. instagram.com/alqaemhajj, wa.me/966..., t.me/alqaemhajj)
  if (
    /^(www\.)?(snapchat\.com|tiktok\.com|youtube\.com|youtu\.be|instagram\.com|x\.com|twitter\.com|wa\.me|api\.whatsapp\.com|whatsapp\.com|chat\.whatsapp\.com|t\.me|telegram\.me|facebook\.com|fb\.com|m\.facebook\.com)\//i.test(
      trimmed
    )
  ) {
    try {
      const parsed = new URL(`https://${trimmed}`);
      return parsed.toString();
    } catch {
      return null;
    }
  }

  // Case 3: Pure username / @handle / phone number
  const cleanHandle = trimmed.replace(/^@+/, '').replace(/^\/+/, '').trim();
  if (!cleanHandle) return null;

  switch (platform) {
    case 'snapchat':
      return `https://www.snapchat.com/add/${encodeURIComponent(cleanHandle)}`;
    case 'tiktok':
      return `https://www.tiktok.com/@${encodeURIComponent(cleanHandle)}`;
    case 'youtube':
      if (/^UC[a-zA-Z0-9_-]{20,}$/.test(cleanHandle)) {
        return `https://www.youtube.com/channel/${encodeURIComponent(cleanHandle)}`;
      }
      return `https://www.youtube.com/@${encodeURIComponent(cleanHandle)}`;
    case 'instagram':
      return `https://www.instagram.com/${encodeURIComponent(cleanHandle)}/`;
    case 'x':
      return `https://x.com/${encodeURIComponent(cleanHandle)}`;
    case 'whatsapp': {
      let digits = cleanHandle.replace(/[^0-9]/g, '');
      if (!digits) return null;
      if (digits.startsWith('00')) {
        digits = digits.slice(2);
      } else if (digits.startsWith('05') && digits.length === 10) {
        digits = `966${digits.slice(1)}`;
      } else if (digits.startsWith('5') && digits.length === 9) {
        digits = `966${digits}`;
      }
      return `https://wa.me/${digits}`;
    }
    case 'telegram':
      return `https://t.me/${encodeURIComponent(cleanHandle)}`;
    case 'facebook':
      return `https://www.facebook.com/${encodeURIComponent(cleanHandle)}`;
    default:
      return null;
  }
}

/**
 * Extracts a clean human-readable handle/identifier for hover tooltips.
 */
export function formatSocialDisplayHandle(
  platform: SocialPlatformKey,
  rawValue?: string
): string {
  const trimmed = (rawValue || '').trim();
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1] || parsed.hostname;
      if (platform === 'whatsapp') return last;
      return last.startsWith('@') ? last : `@${last}`;
    } catch {
      return trimmed;
    }
  }

  if (platform === 'whatsapp') {
    return trimmed;
  }
  const clean = trimmed.replace(/^@+/, '');
  return `@${clean}`;
}

export interface ActiveSocialLinkItem {
  key: SocialPlatformKey;
  labelAr: string;
  labelEn: string;
  url: string;
  displayHandle: string;
  tooltip: string;
}

export function getActiveSocialLinks(
  accounts?: Partial<SocialAccountsMap> | null
): ActiveSocialLinkItem[] {
  const normalized = normalizeSocialAccountsMap(accounts);
  const active: ActiveSocialLinkItem[] = [];

  for (const meta of SOCIAL_PLATFORMS) {
    const entry = normalized[meta.key];
    if (!entry.enabled || !entry.value.trim()) continue;
    const url = resolveSocialAccountUrl(meta.key, entry.value);
    if (!url) continue;
    const displayHandle = formatSocialDisplayHandle(meta.key, entry.value);
    active.push({
      key: meta.key,
      labelAr: meta.labelAr,
      labelEn: meta.labelEn,
      url,
      displayHandle,
      tooltip: displayHandle ? `${meta.labelAr} (${displayHandle})` : meta.labelAr,
    });
  }

  return active;
}

/**
 * Official crisp SVG brand icons for all 8 supported platforms.
 */
export const SocialPlatformIcon: React.FC<{
  platform: SocialPlatformKey;
  className?: string;
}> = ({ platform, className = 'w-4 h-4' }) => {
  switch (platform) {
    case 'snapchat':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M12.206 2.024c-2.615 0-5.134 1.387-5.41 4.868-.055.694-.007 1.883.077 2.838-.236.122-.507.177-.782.138-.366-.052-.706-.222-1.015-.222-.437 0-.897.289-.958.742-.066.494.33.872.81 1.074.593.249 1.249.383 1.376.787.105.335-.193.902-.574 1.497-.725 1.132-1.768 2.186-3.191 2.429-.355.061-.584.333-.523.681.078.445.676.782 1.651.961.186.034.333.153.39.327.098.299.139.671.366.854.179.144.458.133.764.113.347-.022.742-.047 1.213.025.631.096 1.196.462 1.886.872.695.413 1.545.862 2.744.862h.259c1.199 0 2.049-.449 2.744-.862.69-.41 1.255-.776 1.886-.872.471-.072.866-.047 1.213-.025.306.02.585.031.764-.113.227-.183.268-.555.366-.854.057-.174.204-.293.39-.327.975-.179 1.573-.516 1.651-.961.061-.348-.168-.62-.523-.681-1.423-.243-2.466-1.297-3.191-2.429-.381-.595-.679-1.162-.574-1.497.127-.404.783-.538 1.376-.787.48-.202.876-.58.81-1.074-.061-.453-.521-.742-.958-.742-.309 0-.649.17-1.015.222-.275.039-.546-.016-.782-.138.084-.955.132-2.144.077-2.838-.276-3.481-2.795-4.868-5.41-4.868h-.059z" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
        </svg>
      );
    case 'x':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M12.031 2C6.51 2 2.022 6.489 2.022 12.01c0 1.763.46 3.485 1.335 5.002L2 22l5.125-1.344a9.975 9.975 0 0 0 4.906 1.286h.004c5.52 0 10.008-4.489 10.008-10.01A9.946 9.946 0 0 0 19.11 4.86 9.954 9.954 0 0 0 12.031 2zm5.878 14.185c-.246.693-1.43 1.326-1.976 1.409-.506.077-1.145.109-1.849-.115-.426-.135-.973-.316-1.675-.619-2.948-1.272-4.872-4.242-5.019-4.438-.147-.196-1.199-1.595-1.199-3.043 0-1.448.758-2.16 1.028-2.454.27-.294.589-.368.785-.368.196 0 .392.002.564.01.181.009.424-.069.663.505.246.589.835 2.036.909 2.183.074.147.123.319.025.515-.098.196-.147.319-.294.491-.147.172-.31.384-.442.515-.147.147-.301.307-.129.602.172.294.763 1.258 1.639 2.038 1.126 1.004 2.075 1.315 2.369 1.462.294.147.466.123.638-.074.172-.196.736-.859.932-1.153.196-.294.392-.245.662-.147.27.098 1.718.81 2.012.957.294.147.491.221.564.343.074.123.074.712-.172 1.405z" />
        </svg>
      );
    case 'telegram':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      );
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
  }
};

interface SocialAccountsAdminSectionProps {
  socialAccounts?: Partial<SocialAccountsMap> | null;
  onChange: (next: SocialAccountsMap) => void;
}

/**
 * Admin Dashboard configuration section for Official Social Media Accounts
 */
export const SocialAccountsAdminSection: React.FC<SocialAccountsAdminSectionProps> = ({
  socialAccounts,
  onChange,
}) => {
  const normalized = normalizeSocialAccountsMap(socialAccounts);
  const activeCount = getActiveSocialLinks(normalized).length;

  const updateEntry = (
    key: SocialPlatformKey,
    patch: Partial<SocialAccountEntry>
  ) => {
    const next: SocialAccountsMap = {
      ...normalized,
      [key]: {
        ...normalized[key],
        ...patch,
      },
    };
    onChange(next);
  };

  return (
    <div className="pt-5 mt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Share2 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-amber-400">
              حسابات التواصل الاجتماعي المعتمدة
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              أدخل اسم المستخدم (مثل <span className="font-mono">alqaemhajj</span>) أو الرابط المباشر وفعّل المنصات المطلوب إظهار أيقوناتها في الشريط العلوي
            </p>
          </div>
        </div>

        <span className="px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-amber-300 text-xs font-black font-mono">
          مفعّل للعرض: {activeCount} / {SOCIAL_PLATFORMS.length}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {SOCIAL_PLATFORMS.map((platform) => {
          const entry = normalized[platform.key];
          const resolvedUrl = resolveSocialAccountUrl(platform.key, entry.value);
          const isVisibleInBar = entry.enabled && Boolean(resolvedUrl);

          return (
            <div
              key={platform.key}
              className={`rounded-2xl border p-3.5 transition-all space-y-2.5 ${
                entry.enabled
                  ? 'bg-amber-50/40 dark:bg-[#0D1628] border-amber-500/45 shadow-xs'
                  : 'bg-slate-50/80 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
              }`}
            >
              {/* Header row: icon + name + Toggle Switch */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 transition-colors ${
                      entry.enabled
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <SocialPlatformIcon platform={platform.key} className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {platform.labelAr}{' '}
                      <span className="text-[11px] font-semibold text-slate-400">
                        ({platform.labelEn})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Toggle Switch (مفعّل / مخفي) */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={entry.enabled}
                  onClick={() => updateEntry(platform.key, { enabled: !entry.enabled })}
                  className="flex items-center gap-2 cursor-pointer shrink-0 group"
                >
                  <span
                    className={`text-[11px] font-black transition-colors ${
                      entry.enabled
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {entry.enabled ? 'مفعّل' : 'مخفي'}
                  </span>
                  <span
                    dir="ltr"
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      entry.enabled
                        ? 'bg-amber-500'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        entry.enabled ? 'translate-x-[19px]' : 'translate-x-[3px]'
                      }`}
                    />
                  </span>
                </button>
              </div>

              {/* Input field for Username/@handle or Full URL */}
              <div>
                <input
                  type="text"
                  dir="ltr"
                  value={entry.value}
                  onChange={(e) =>
                    updateEntry(platform.key, { value: e.target.value })
                  }
                  placeholder={platform.placeholder}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono placeholder:font-sans placeholder:text-slate-400 transition"
                />
              </div>

              {/* Live resolved URL preview or hint */}
              <div className="flex items-center justify-between gap-2 min-h-[18px] text-[11px]">
                {resolvedUrl ? (
                  <a
                    href={resolvedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline truncate max-w-full font-mono"
                    title={resolvedUrl}
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span className="truncate">{resolvedUrl}</span>
                  </a>
                ) : entry.enabled ? (
                  <span className="text-amber-600 dark:text-amber-400 font-bold">
                    أدخل اسم المستخدم أو الرابط ليظهر في الشريط العلوي
                  </span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 font-mono" dir="ltr">
                    {platform.urlPrefixHint}username
                  </span>
                )}

                {isVisibleInBar && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] shrink-0">
                    ظاهر بالشريط
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
