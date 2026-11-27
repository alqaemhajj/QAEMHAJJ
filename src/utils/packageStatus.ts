import { HajjPackage, Pilgrim } from '../types';

export interface PackageStatusEvaluation {
  isVisibleOnHomepage: boolean;
  registeredCount: number;
  maxCapacity: number | null;
  remainingSeats: number | null;
  capacityPercentage: number;
  isFull: boolean;
  isOverCapacity: boolean;
  isDeadlineExpired: boolean;
  isForceClosed: boolean;
  forceCloseReasonText: string;
  isClosedOnHomepage: boolean;
  isClosedForVisitors: boolean;
  publicBadgeText: string | null;
  publicButtonLabel: string;
  adminPrimaryStatus: {
    key: 'available' | 'full' | 'expired' | 'force_closed' | 'hidden';
    label: string;
  };
  adminOverrideWarning: string | null;
}

/**
 * Checks whether a pilgrim record is active (not soft-deleted, rejected, or apologized).
 */
export function isActivePackagePilgrim(p: Pilgrim): boolean {
  return (
    !p.isDeleted &&
    p.status !== 'محذوف' &&
    p.status !== 'مرفوض' &&
    p.status !== 'معتذر'
  );
}

/**
 * Counts active registered pilgrims assigned to a specific package.
 * Matches by normalized package title.
 */
export function countPackagePilgrims(
  pkg: Pick<HajjPackage, 'title'>,
  pilgrims: Pilgrim[] = [],
  excludePilgrimId?: string
): number {
  const targetTitle = (pkg.title || '').trim();
  if (!targetTitle) return 0;

  return pilgrims.filter((p) => {
    if (excludePilgrimId && p.id === excludePilgrimId) return false;
    if (!isActivePackagePilgrim(p)) return false;
    const pilgrimPkg = (p.selectedPackage || p.packageType || '').trim();
    return pilgrimPkg === targetTitle;
  }).length;
}

/**
 * Formats an ISO/datetime-local string into a readable Arabic date-time string.
 */
export function formatRegistrationDeadlineAr(deadline?: string): string {
  if (!deadline) return 'غير محدد (مفتوح)';
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return deadline;
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  } catch {
    return parsed.toLocaleString('ar-SA');
  }
}

/**
 * Evaluates all visibility, capacity, deadline, and manual closure rules for a package.
 */
export function evaluatePackageStatus(
  pkg: HajjPackage,
  pilgrims: Pilgrim[] = [],
  now: Date = new Date(),
  excludePilgrimId?: string
): PackageStatusEvaluation {
  const isVisibleOnHomepage = pkg.showOnHomepage !== false;
  const registeredCount = countPackagePilgrims(pkg, pilgrims, excludePilgrimId);

  const rawMax =
    typeof pkg.maxCapacity === 'number' && Number.isFinite(pkg.maxCapacity) && pkg.maxCapacity > 0
      ? Math.floor(pkg.maxCapacity)
      : null;

  const maxCapacity = rawMax;
  const remainingSeats =
    maxCapacity !== null ? Math.max(0, maxCapacity - registeredCount) : null;
  const capacityPercentage =
    maxCapacity !== null && maxCapacity > 0
      ? Math.min(100, Math.round((registeredCount / maxCapacity) * 100))
      : 0;

  const isFull = Boolean(maxCapacity !== null && registeredCount >= maxCapacity);
  const isOverCapacity = Boolean(maxCapacity !== null && registeredCount > maxCapacity);

  let isDeadlineExpired = false;
  if (pkg.registrationDeadline && pkg.registrationDeadline.trim() !== '') {
    const deadlineMs = new Date(pkg.registrationDeadline).getTime();
    if (!Number.isNaN(deadlineMs) && now.getTime() >= deadlineMs) {
      isDeadlineExpired = true;
    }
  }

  const isForceClosed = Boolean(pkg.forceClose);
  const forceCloseReasonText = (pkg.forceCloseReason || '').trim() || 'انتهى الموسم';

  const isClosedOnHomepage = isForceClosed || isDeadlineExpired || isFull;
  const isClosedForVisitors = !isVisibleOnHomepage || isClosedOnHomepage;

  let publicBadgeText: string | null = null;
  if (isForceClosed) {
    publicBadgeText = forceCloseReasonText;
  } else if (isDeadlineExpired) {
    publicBadgeText = 'انتهى وقت التسجيل / انتهى الموسم';
  } else if (isFull) {
    publicBadgeText = 'مكتملة العدد';
  }

  let publicButtonLabel = 'سجل الآن';
  if (isForceClosed) {
    publicButtonLabel = `مغلق (${forceCloseReasonText})`;
  } else if (isDeadlineExpired) {
    publicButtonLabel = 'انتهى وقت التسجيل';
  } else if (isFull) {
    publicButtonLabel = 'مكتملة العدد';
  }

  let adminPrimaryStatus: PackageStatusEvaluation['adminPrimaryStatus'] = {
    key: 'available',
    label: 'متاحة',
  };

  if (!isVisibleOnHomepage) {
    adminPrimaryStatus = { key: 'hidden', label: 'مخفية' };
  } else if (isForceClosed) {
    adminPrimaryStatus = { key: 'force_closed', label: 'مغلقة يدوياً' };
  } else if (isFull) {
    adminPrimaryStatus = { key: 'full', label: 'مكتملة' };
  } else if (isDeadlineExpired) {
    adminPrimaryStatus = { key: 'expired', label: 'منتهية التاريخ' };
  }

  const warningReasons: string[] = [];
  if (isFull && maxCapacity !== null) {
    warningReasons.push(
      `الباقة وصلت أو تجاوزت الحد الأقصى المسموح للمقاعد (${registeredCount} / ${maxCapacity})`
    );
  }
  if (isDeadlineExpired) {
    warningReasons.push(
      `انتهى موعد التسجيل المحدد (${formatRegistrationDeadlineAr(pkg.registrationDeadline)})`
    );
  }
  if (isForceClosed) {
    warningReasons.push(`الباقة مغلقة يدوياً (${forceCloseReasonText})`);
  }
  if (!isVisibleOnHomepage) {
    warningReasons.push('الباقة مخفية حالياً عن الزوار في الصفحة الرئيسية');
  }

  const adminOverrideWarning =
    warningReasons.length > 0
      ? `تنبيه استثناء الإدارة (Admin Override): ${warningReasons.join(' — ')}. يمكنك كمسؤول متابعة إضافة أو تسكين الحاج في هذه الباقة.`
      : null;

  return {
    isVisibleOnHomepage,
    registeredCount,
    maxCapacity,
    remainingSeats,
    capacityPercentage,
    isFull,
    isOverCapacity,
    isDeadlineExpired,
    isForceClosed,
    forceCloseReasonText,
    isClosedOnHomepage,
    isClosedForVisitors,
    publicBadgeText,
    publicButtonLabel,
    adminPrimaryStatus,
    adminOverrideWarning,
  };
}

export interface SanitizedPublicPackageForAdvisor {
  id: string;
  title: string;
  type: string;
  price: string;
  displayPrice: string;
  priceDisplay: string;
  hasDefinedPrice: boolean;
  publicStatusLabel: string;
  isAvailableForRegistration: boolean;
  transport: string;
  accommodationMakkah: string;
  accommodationMadinah: string;
  campMina: string;
  features: string[];
  seasonYear?: string;
  registrationDeadlineFormatted?: string;
}

export function formatRealisticPackagePriceClient(rawPrice?: string): {
  displayPrice: string;
  priceDisplay: string;
  hasDefinedPrice: boolean;
} {
  const clean = String(rawPrice || '').trim();
  if (
    !clean ||
    clean === '0' ||
    clean === '0 ريال' ||
    clean.includes('لم تحدد') ||
    clean.includes('لم يحدد') ||
    clean.includes('غير محدد') ||
    !/[1-9٠-٩۰-۹]/.test(clean)
  ) {
    return {
      displayPrice: 'لم يُحدد السعر بعد',
      priceDisplay: 'لم يُحدد السعر بعد',
      hasDefinedPrice: false,
    };
  }
  const hasCurrency = clean.includes('ريال') || clean.includes('ر.س') || clean.includes('SAR');
  const formatted = hasCurrency ? clean : `${clean} ريال`;
  return {
    displayPrice: formatted,
    priceDisplay: formatted,
    hasDefinedPrice: true,
  };
}

/**
 * Builds strictly sanitized public package summaries for the AI Advisor.
 * - Excludes hidden packages (showOnHomepage === false)
 * - Never includes remainingSeats, maxCapacity, registeredCount, or any pilgrim data
 */
export function buildPublicPackagesForAdvisorClient(
  packages: HajjPackage[] = [],
  pilgrims: Pilgrim[] = []
): SanitizedPublicPackageForAdvisor[] {
  const visiblePackages = packages.filter((pkg) => pkg && pkg.showOnHomepage !== false);

  return visiblePackages.map((pkg) => {
    const evalStatus = evaluatePackageStatus(pkg, pilgrims);
    const { displayPrice, priceDisplay, hasDefinedPrice } = formatRealisticPackagePriceClient(pkg.price);

    let publicStatusLabel = 'متاحة للتسجيل';
    let isAvailableForRegistration = true;

    if (evalStatus.isForceClosed) {
      publicStatusLabel = `مغلقة (${evalStatus.forceCloseReasonText || 'مغلق لانتهاء الموسم'})`;
      isAvailableForRegistration = false;
    } else if (evalStatus.isDeadlineExpired) {
      publicStatusLabel = 'مغلقة (انتهى وقت التسجيل / انتهى الموسم)';
      isAvailableForRegistration = false;
    } else if (evalStatus.isFull) {
      publicStatusLabel = 'مكتملة العدد';
      isAvailableForRegistration = false;
    }

    const registrationDeadlineFormatted =
      pkg.registrationDeadline && pkg.registrationDeadline.trim()
        ? formatRegistrationDeadlineAr(pkg.registrationDeadline)
        : undefined;

    return {
      id: pkg.id,
      title: (pkg.title || '').trim(),
      type: (pkg.type || '').trim(),
      price: (pkg.price || '').trim(),
      displayPrice,
      priceDisplay,
      hasDefinedPrice,
      publicStatusLabel,
      isAvailableForRegistration,
      transport: (pkg.transport || '').trim(),
      accommodationMakkah: (pkg.accommodationMakkah || '').trim(),
      accommodationMadinah: (pkg.accommodationMadinah || '').trim(),
      campMina: (pkg.campMina || '').trim(),
      features: Array.isArray(pkg.features) ? pkg.features.filter(Boolean) : [],
      seasonYear: pkg.seasonYear,
      registrationDeadlineFormatted,
    };
  });
}

