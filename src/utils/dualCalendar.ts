// Official Umm al-Qura Hijri <-> Gregorian Calendar Conversion Utilities

export const HIJRI_MONTH_NAMES_AR: readonly string[] = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
];

export const GREGORIAN_MONTH_NAMES_AR: readonly string[] = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

export interface ParsedDateParts {
  year: number;
  month: number;
  day: number;
  formatted: string; // YYYY-MM-DD
  displayAr: string;
}

export interface DualDateResolution {
  gregorian: string;
  hijri: string;
  gregorianAr: string;
  hijriAr: string;
  sourceCalendar: 'hijri' | 'gregorian' | null;
}

export function normalizeDigitsToEnglish(val: string): string {
  return (val || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

/**
 * Parses a date string in YYYY-MM-DD, YYYY/MM/DD, or DD-MM-YYYY format into numeric Y, M, D.
 */
export function parseRawDateParts(raw: string): { year: number; month: number; day: number } | null {
  if (!raw) return null;
  const cleaned = normalizeDigitsToEnglish(raw)
    .replace(/[^\d/-]/g, '')
    .replace(/\//g, '-')
    .trim();
  const parts = cleaned.split('-').filter(Boolean);
  if (parts.length !== 3) return null;

  let y: number;
  let m: number;
  let d: number;

  if (parts[0].length === 4) {
    y = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    d = parseInt(parts[2], 10);
  } else if (parts[2].length === 4) {
    d = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    y = parseInt(parts[2], 10);
  } else {
    return null;
  }

  if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }

  return { year: y, month: m, day: d };
}

export function formatHijriArabic(year: number, month: number, day: number): string {
  const monthName = HIJRI_MONTH_NAMES_AR[month - 1] || String(month);
  return `${day} ${monthName} ${year}هـ`;
}

export function formatGregorianArabic(year: number, month: number, day: number): string {
  const monthName = GREGORIAN_MONTH_NAMES_AR[month - 1] || String(month);
  return `${day} ${monthName} ${year}م`;
}

const umAlQuraFormatter = (() => {
  try {
    return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  }
})();

/**
 * Extracts Umm al-Qura Hijri (year, month, day) from a UTC Date object.
 */
function utcDateToUmAlQuraParts(dateUtc: Date): { year: number; month: number; day: number } | null {
  try {
    const parts = umAlQuraFormatter.formatToParts(dateUtc);
    const yearStr = parts.find((p) => p.type === 'year')?.value;
    const monthStr = parts.find((p) => p.type === 'month')?.value;
    const dayStr = parts.find((p) => p.type === 'day')?.value;
    if (!yearStr || !monthStr || !dayStr) return null;
    const year = parseInt(yearStr.replace(/\D/g, ''), 10);
    const month = parseInt(monthStr.replace(/\D/g, ''), 10);
    const day = parseInt(dayStr.replace(/\D/g, ''), 10);
    if (isNaN(year) || isNaN(month) || isNaN(day) || year > 1700) return null;
    return { year, month, day };
  } catch {
    return null;
  }
}

/**
 * Converts Gregorian YYYY-MM-DD to official Umm al-Qura Hijri date.
 */
export function gregorianToHijriUmAlQura(gDateStr: string): ParsedDateParts | null {
  const parsed = parseRawDateParts(gDateStr);
  if (!parsed || parsed.year < 1700) return null;

  const dt = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0));
  if (
    isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== parsed.year ||
    dt.getUTCMonth() + 1 !== parsed.month ||
    dt.getUTCDate() !== parsed.day
  ) {
    return null;
  }

  const hijri = utcDateToUmAlQuraParts(dt);
  if (!hijri) {
    // Mathematical Kuwaity fallback if Intl Islamic-Umm-Al-Qura isn't present in a rare environment
    const jd = Math.floor(dt.getTime() / 86400000) + 2440588;
    const l0 = jd - 1948440 + 10632;
    const n = Math.floor((l0 - 1) / 10631);
    const l1 = l0 - 10631 * n + 354;
    const j =
      Math.floor((10985 - l1) / 5316) * Math.floor((50 * l1) / 17719) +
      Math.floor(l1 / 5670) * Math.floor((43 * l1) / 15238);
    const l2 =
      l1 -
      Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
      Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
      29;
    const month = Math.floor((24 * l2) / 709);
    const day = l2 - Math.floor((709 * month) / 24);
    const year = 30 * n + j - 30;
    return {
      year,
      month,
      day,
      formatted: `${pad4(year)}-${pad2(month)}-${pad2(day)}`,
      displayAr: formatHijriArabic(year, month, day),
    };
  }

  return {
    year: hijri.year,
    month: hijri.month,
    day: hijri.day,
    formatted: `${pad4(hijri.year)}-${pad2(hijri.month)}-${pad2(hijri.day)}`,
    displayAr: formatHijriArabic(hijri.year, hijri.month, hijri.day),
  };
}

function hijriOrdinalEstimate(hy: number, hm: number, hd: number): number {
  return hy * 354.367 + (hm - 1) * 29.53 + hd;
}

/**
 * Converts official Umm al-Qura Hijri YYYY-MM-DD to exact Gregorian date.
 */
export function hijriUmAlQuraToGregorian(hDateStr: string): ParsedDateParts | null {
  const parsed = parseRawDateParts(hDateStr);
  if (!parsed || parsed.year < 1200 || parsed.year >= 1700) return null;
  if (parsed.day > 30) return null;

  // Approximate Julian Day then match with official Intl Umm al-Qura table
  const approxJd =
    Math.floor((11 * parsed.year + 3) / 30) +
    354 * parsed.year +
    30 * parsed.month -
    Math.floor((parsed.month - 1) / 2) +
    parsed.day +
    1948440 -
    385;

  const baseMs = (approxJd - 2440588) * 86400000 + 12 * 3600 * 1000;
  const targetOrd = hijriOrdinalEstimate(parsed.year, parsed.month, parsed.day);

  // Search a narrow window (-12 to +12 days) around the tabular estimate for exact Intl Umm al-Qura match
  let bestDt: Date | null = null;
  for (let offset = -12; offset <= 12; offset++) {
    const candidate = new Date(baseMs + offset * 86400000);
    const h = utcDateToUmAlQuraParts(candidate);
    if (!h) break;
    if (h.year === parsed.year && h.month === parsed.month && h.day === parsed.day) {
      bestDt = candidate;
      break;
    }
  }

  // Wider guided step search in rare multi-year drift boundaries
  if (!bestDt) {
    let cursor = new Date(baseMs);
    for (let step = 0; step < 30; step++) {
      const h = utcDateToUmAlQuraParts(cursor);
      if (!h) break;
      const curOrd = hijriOrdinalEstimate(h.year, h.month, h.day);
      const diff = Math.round(targetOrd - curOrd);
      if (h.year === parsed.year && h.month === parsed.month && h.day === parsed.day) {
        bestDt = cursor;
        break;
      }
      if (diff === 0) break;
      cursor = new Date(cursor.getTime() + Math.max(-15, Math.min(15, diff)) * 86400000);
    }
  }

  if (!bestDt) {
    // Check if Umm al-Qura isn't supported; use tabular fallback
    const testProbe = utcDateToUmAlQuraParts(new Date(Date.UTC(2025, 0, 1, 12, 0, 0)));
    if (testProbe) {
      // Umm al-Qura is active and day 30 does not exist in that lunar month
      return null;
    }
    const z = approxJd;
    const a = Math.floor((z - 1867216.25) / 36524.25);
    const b = z + 1 + a - Math.floor(a / 4);
    const c = b + 1524;
    const d = Math.floor((c - 122.1) / 365.25);
    const e = Math.floor(365.25 * d);
    const f = Math.floor((c - e) / 30.6001);
    const day = c - e - Math.floor(30.6001 * f);
    const month = f - (f > 13 ? 13 : 1);
    const year = d - (month > 2 ? 4716 : 4715);
    return {
      year,
      month,
      day,
      formatted: `${pad4(year)}-${pad2(month)}-${pad2(day)}`,
      displayAr: formatGregorianArabic(year, month, day),
    };
  }

  const gy = bestDt.getUTCFullYear();
  const gm = bestDt.getUTCMonth() + 1;
  const gd = bestDt.getUTCDate();

  return {
    year: gy,
    month: gm,
    day: gd,
    formatted: `${pad4(gy)}-${pad2(gm)}-${pad2(gd)}`,
    displayAr: formatGregorianArabic(gy, gm, gd),
  };
}

/**
 * Returns exact number of days (29 or 30) in a specific Umm al-Qura Hijri month.
 */
export function getUmAlQuraMonthDays(hy: number, hm: number): number {
  const probe30 = hijriUmAlQuraToGregorian(`${pad4(hy)}-${pad2(hm)}-30`);
  return probe30 ? 30 : 29;
}

/**
 * Resolves any date string (either Hijri 13xx/14xx/15xx or Gregorian 19xx/20xx)
 * into synchronized Gregorian and Umm al-Qura Hijri representations.
 */
export function resolveDualDates(
  rawDateStr?: string,
  explicitHijriStr?: string
): DualDateResolution {
  const cleanedPrimary = (rawDateStr || '').trim();
  const cleanedHijri = (explicitHijriStr || '').trim();

  if (cleanedPrimary) {
    const parts = parseRawDateParts(cleanedPrimary);
    if (parts) {
      if (parts.year < 1700) {
        const hFormatted = `${pad4(parts.year)}-${pad2(parts.month)}-${pad2(parts.day)}`;
        const greg = hijriUmAlQuraToGregorian(hFormatted);
        return {
          hijri: hFormatted,
          hijriAr: formatHijriArabic(parts.year, parts.month, parts.day),
          gregorian: greg ? greg.formatted : '',
          gregorianAr: greg ? greg.displayAr : '',
          sourceCalendar: 'hijri',
        };
      } else {
        const gFormatted = `${pad4(parts.year)}-${pad2(parts.month)}-${pad2(parts.day)}`;
        const hijri = gregorianToHijriUmAlQura(gFormatted);
        return {
          gregorian: gFormatted,
          gregorianAr: formatGregorianArabic(parts.year, parts.month, parts.day),
          hijri: hijri ? hijri.formatted : cleanedHijri,
          hijriAr: hijri
            ? hijri.displayAr
            : cleanedHijri
            ? (() => {
                const hp = parseRawDateParts(cleanedHijri);
                return hp ? formatHijriArabic(hp.year, hp.month, hp.day) : cleanedHijri;
              })()
            : '',
          sourceCalendar: 'gregorian',
        };
      }
    }
  }

  if (cleanedHijri) {
    const hp = parseRawDateParts(cleanedHijri);
    if (hp && hp.year < 1700) {
      const hFormatted = `${pad4(hp.year)}-${pad2(hp.month)}-${pad2(hp.day)}`;
      const greg = hijriUmAlQuraToGregorian(hFormatted);
      return {
        hijri: hFormatted,
        hijriAr: formatHijriArabic(hp.year, hp.month, hp.day),
        gregorian: greg ? greg.formatted : '',
        gregorianAr: greg ? greg.displayAr : '',
        sourceCalendar: 'hijri',
      };
    }
  }

  return {
    gregorian: '',
    hijri: '',
    gregorianAr: '',
    hijriAr: '',
    sourceCalendar: null,
  };
}

/**
 * Formats dual date cleanly for tables, portals, and PDF/Excel reports.
 */
export function formatDualDateSummary(primary?: string, explicitHijri?: string): string {
  const res = resolveDualDates(primary, explicitHijri);
  if (res.hijri && res.gregorian) {
    return `${res.hijri} هـ / ${res.gregorian} م`;
  }
  return res.hijri ? `${res.hijri} هـ` : res.gregorian ? `${res.gregorian} م` : primary || '—';
}

/**
 * Returns today's Hijri Umm al-Qura and Gregorian YYYY-MM-DD strings.
 */
export function getTodayDualDates(): { gregorian: string; hijri: string } {
  const now = new Date();
  const g = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const h = gregorianToHijriUmAlQura(g);
  return {
    gregorian: g,
    hijri: h?.formatted || '1448-01-01',
  };
}
