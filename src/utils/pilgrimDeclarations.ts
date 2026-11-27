import { Pilgrim } from '../types';
import { formatDualDateSummary, resolveDualDates } from './dualCalendar';

export type PaymentDeclarationStateKey = 'approved' | 'reported' | 'unpaid';

export interface PaymentDeclarationSummary {
  key: PaymentDeclarationStateKey;
  label: string;
  shortLabel: string;
  isPaidOrReported: boolean;
  isApproved: boolean;
  dateGregorian: string;
  dateHijri: string;
  formattedDate: string;
}

export interface VaccinationDeclarationSummary {
  completed: boolean;
  label: string;
  shortLabel: string;
  dateGregorian: string;
  dateHijri: string;
  formattedDate: string;
}

/**
 * Resolves a pilgrim's unified Hajj payment declaration & admin approval state.
 */
export function getPilgrimPaymentDeclaration(
  pilgrim: Pick<
    Pilgrim,
    | 'status'
    | 'paymentReceived'
    | 'paymentApprovedByAdmin'
    | 'paymentReportedByPilgrim'
    | 'paymentReportedDate'
    | 'paymentReportedDateHijri'
    | 'paymentReceiptDate'
  >
): PaymentDeclarationSummary {
  const isApproved = Boolean(
    pilgrim.paymentApprovedByAdmin ||
      pilgrim.paymentReceived === true ||
      pilgrim.status === 'مكتمل الدفع' ||
      pilgrim.status === 'مكتمل'
  );
  const isReported = Boolean(pilgrim.paymentReportedByPilgrim);

  const rawGreg = (pilgrim.paymentReportedDate || pilgrim.paymentReceiptDate || '').trim();
  const rawHijri = (pilgrim.paymentReportedDateHijri || '').trim();
  const resolved = resolveDualDates(rawGreg, rawHijri);
  const formattedDate =
    rawGreg || rawHijri
      ? formatDualDateSummary(resolved.gregorian || rawGreg, resolved.hijri || rawHijri)
      : '';

  if (isApproved) {
    return {
      key: 'approved',
      label: 'معتمد من الإدارة ✓',
      shortLabel: 'معتمد من الإدارة ✓',
      isPaidOrReported: true,
      isApproved: true,
      dateGregorian: resolved.gregorian || rawGreg,
      dateHijri: resolved.hijri || rawHijri,
      formattedDate,
    };
  }

  if (isReported) {
    return {
      key: 'reported',
      label: 'تم الإبلاغ بالسداد',
      shortLabel: 'تم الإبلاغ بالسداد',
      isPaidOrReported: true,
      isApproved: false,
      dateGregorian: resolved.gregorian || rawGreg,
      dateHijri: resolved.hijri || rawHijri,
      formattedDate,
    };
  }

  return {
    key: 'unpaid',
    label: 'لم يسدد بعد',
    shortLabel: 'لم يسدد بعد',
    isPaidOrReported: false,
    isApproved: false,
    dateGregorian: '',
    dateHijri: '',
    formattedDate: '',
  };
}

/**
 * Resolves a pilgrim's Hajj vaccination confirmation state and formatted dual date.
 */
export function getPilgrimVaccinationDeclaration(
  pilgrim: Pick<
    Pilgrim,
    'vaccinationCompleted' | 'vaccinationDate' | 'vaccinationDateHijri'
  >
): VaccinationDeclarationSummary {
  const completed = Boolean(pilgrim.vaccinationCompleted);
  const rawGreg = (pilgrim.vaccinationDate || '').trim();
  const rawHijri = (pilgrim.vaccinationDateHijri || '').trim();
  const resolved = resolveDualDates(rawGreg, rawHijri);
  const formattedDate =
    completed && (rawGreg || rawHijri)
      ? formatDualDateSummary(resolved.gregorian || rawGreg, resolved.hijri || rawHijri)
      : '';

  return {
    completed,
    label: completed ? 'تم التطعيم' : 'لم يُطعم بعد',
    shortLabel: completed ? 'تم التطعيم ✓' : 'لم يُطعم بعد',
    dateGregorian: completed ? resolved.gregorian || rawGreg : '',
    dateHijri: completed ? resolved.hijri || rawHijri : '',
    formattedDate,
  };
}
