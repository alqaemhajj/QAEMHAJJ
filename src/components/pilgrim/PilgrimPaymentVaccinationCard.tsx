import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ShieldCheck,
  Syringe,
  CreditCard,
  Send,
  Loader2,
  AlertCircle,
  Calendar,
  Clock,
  Check,
} from 'lucide-react';
import { Pilgrim } from '../../types';
import { DualCalendarDatePicker } from '../common/DualCalendarDatePicker';
import { recordActivityLog, updateDocument } from '../../lib/db';
import {
  getPilgrimPaymentDeclaration,
  getPilgrimVaccinationDeclaration,
} from '../../utils/pilgrimDeclarations';
import { formatDualDateSummary } from '../../utils/dualCalendar';

interface PilgrimPaymentVaccinationCardProps {
  pilgrim: Pilgrim;
  onUpdated: (updatedPilgrim: Pilgrim) => void;
}

export const PilgrimPaymentVaccinationCard: React.FC<PilgrimPaymentVaccinationCardProps> = ({
  pilgrim,
  onUpdated,
}) => {
  const currentPayment = getPilgrimPaymentDeclaration(pilgrim);
  const currentVaccination = getPilgrimVaccinationDeclaration(pilgrim);

  const [paymentChecked, setPaymentChecked] = useState<boolean>(
    currentPayment.isPaidOrReported
  );
  const [paymentDate, setPaymentDate] = useState<string>(
    pilgrim.paymentReportedDate || pilgrim.paymentReceiptDate || ''
  );
  const [paymentDateHijri, setPaymentDateHijri] = useState<string>(
    pilgrim.paymentReportedDateHijri || ''
  );

  const [vaccinationChecked, setVaccinationChecked] = useState<boolean>(
    currentVaccination.completed
  );
  const [vaccinationDate, setVaccinationDate] = useState<string>(
    pilgrim.vaccinationDate || ''
  );
  const [vaccinationDateHijri, setVaccinationDateHijri] = useState<string>(
    pilgrim.vaccinationDateHijri || ''
  );

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Keep form synced when switching pilgrim or when admin approves in real time
  useEffect(() => {
    const pay = getPilgrimPaymentDeclaration(pilgrim);
    const vac = getPilgrimVaccinationDeclaration(pilgrim);
    setPaymentChecked(pay.isPaidOrReported);
    setPaymentDate(pilgrim.paymentReportedDate || pilgrim.paymentReceiptDate || '');
    setPaymentDateHijri(pilgrim.paymentReportedDateHijri || '');
    setVaccinationChecked(vac.completed);
    setVaccinationDate(pilgrim.vaccinationDate || '');
    setVaccinationDateHijri(pilgrim.vaccinationDateHijri || '');
  }, [
    pilgrim.id,
    pilgrim.nationalId,
    pilgrim.paymentApprovedByAdmin,
    pilgrim.paymentReceived,
    pilgrim.status,
    pilgrim.paymentReportedByPilgrim,
    pilgrim.paymentReportedDate,
    pilgrim.paymentReportedDateHijri,
    pilgrim.vaccinationCompleted,
    pilgrim.vaccinationDate,
    pilgrim.vaccinationDateHijri,
  ]);

  const handleSave = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    const effectivePaymentChecked = currentPayment.isApproved ? true : paymentChecked;

    if (effectivePaymentChecked && !currentPayment.isApproved && !paymentDate && !paymentDateHijri) {
      setErrorMsg('يرجى تحديد تاريخ السداد (هجري أو ميلادي) قبل حفظ وإبلاغ الإدارة.');
      return;
    }

    if (vaccinationChecked && !vaccinationDate && !vaccinationDateHijri) {
      setErrorMsg('يرجى تحديد تاريخ التطعيم (هجري أو ميلادي) قبل حفظ وإبلاغ الإدارة.');
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const docId = pilgrim.id || pilgrim.nationalId;

      const patch: Partial<Pilgrim> = {
        paymentReportedByPilgrim: effectivePaymentChecked,
        paymentReportedDate: effectivePaymentChecked ? paymentDate : '',
        paymentReportedDateHijri: effectivePaymentChecked ? paymentDateHijri : '',
        paymentReportedAt: effectivePaymentChecked
          ? pilgrim.paymentReportedAt || nowIso
          : '',
        vaccinationCompleted: vaccinationChecked,
        vaccinationDate: vaccinationChecked ? vaccinationDate : '',
        vaccinationDateHijri: vaccinationChecked ? vaccinationDateHijri : '',
        vaccinationReportedAt: vaccinationChecked ? nowIso : '',
      };

      const saved = await updateDocument('pilgrims', docId, {
        ...patch,
        nationalId: pilgrim.nationalId,
        firstName: pilgrim.firstName,
      });

      if (!saved) {
        throw new Error('تعذر حفظ البيانات في قاعدة البيانات حالياً. يرجى المحاولة مرة أخرى.');
      }

      const updatedPilgrim: Pilgrim = {
        ...pilgrim,
        ...patch,
      };
      onUpdated(updatedPilgrim);

      // Build detailed Arabic audit log entry with exact dates entered by the pilgrim
      const logParts: string[] = [];
      if (effectivePaymentChecked) {
        const payDateText =
          paymentDate || paymentDateHijri
            ? formatDualDateSummary(paymentDate, paymentDateHijri)
            : 'تاريخ غير محدد';
        logParts.push(`تأكيد سداد باقة الحج لوزارة الحج بتاريخ: ${payDateText}`);
      } else {
        logParts.push('حالة السداد: لم يُبلّغ بعد');
      }

      if (vaccinationChecked) {
        const vacDateText =
          vaccinationDate || vaccinationDateHijri
            ? formatDualDateSummary(vaccinationDate, vaccinationDateHijri)
            : 'تاريخ غير محدد';
        logParts.push(`تأكيد أخذ تطعيمات الحج المعتمدة بتاريخ: ${vacDateText}`);
      } else {
        logParts.push('حالة التطعيم: لم يُطعم بعد');
      }

      const fullName = `${pilgrim.firstName || ''} ${pilgrim.lastName || ''}`.trim();

      void recordActivityLog({
        adminName: `الحاج: ${fullName}`,
        userRole: 'بوابة الحاج',
        category: 'بوابة الحاج والتسجيل',
        action: 'تحديث حالة السداد والتطعيم من بوابة الحاج',
        target: `${fullName} (${pilgrim.nationalId})`,
        details: logParts.join(' | '),
      });

      setSuccessMsg('تم تحديث بياناتك وإبلاغ إدارة القافلة بحالة السداد والتطعيم بنجاح');
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء حفظ البيانات. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-3xl p-5 sm:p-6 bg-slate-50/90 dark:bg-slate-950/75 border-2 border-amber-500/35 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug">
              إبلاغ الإدارة بحالة السداد والتطعيم
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
              يرجى تأكيد إتمام سداد باقة الحج لوزارة الحج وأخذ التطعيمات المعتمدة مع تحديد التاريخ لتحديث ملفك فوراً لدى إدارة القافلة دون الحاجة لرفع صور أو ملفات.
            </p>
          </div>
        </div>
      </div>

      {/* Current Recorded Summary Strip (Visible in Pilgrim Profile) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          className={`rounded-2xl p-3.5 border flex items-start gap-3 ${
            currentPayment.isApproved
              ? 'bg-emerald-500/10 border-emerald-500/35'
              : currentPayment.key === 'reported'
              ? 'bg-amber-500/10 border-amber-500/35'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              currentPayment.isApproved
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : currentPayment.key === 'reported'
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
            }`}
          >
            <CreditCard className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
              حالة السداد المسجلة
            </span>
            <strong
              className={`text-xs sm:text-sm font-black block mt-0.5 ${
                currentPayment.isApproved
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : currentPayment.key === 'reported'
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {currentPayment.label}
            </strong>
            {currentPayment.formattedDate && (
              <span className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1 mt-1">
                <Calendar className="w-3 h-3 text-amber-500 shrink-0" />
                <span>{currentPayment.formattedDate}</span>
              </span>
            )}
          </div>
        </div>

        <div
          className={`rounded-2xl p-3.5 border flex items-start gap-3 ${
            currentVaccination.completed
              ? 'bg-emerald-500/10 border-emerald-500/35'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              currentVaccination.completed
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
            }`}
          >
            <Syringe className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
              حالة التطعيم المسجلة
            </span>
            <strong
              className={`text-xs sm:text-sm font-black block mt-0.5 ${
                currentVaccination.completed
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {currentVaccination.shortLabel}
            </strong>
            {currentVaccination.formattedDate && (
              <span className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1 mt-1">
                <Calendar className="w-3 h-3 text-emerald-500 shrink-0" />
                <span>{currentVaccination.formattedDate}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Option A: Payment Confirmation to Ministry of Hajj */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            disabled={currentPayment.isApproved}
            onClick={() => {
              if (currentPayment.isApproved) return;
              setPaymentChecked((prev) => !prev);
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`flex items-start gap-3 text-right flex-1 ${
              currentPayment.isApproved ? 'cursor-default' : 'cursor-pointer'
            }`}
          >
            <span
              className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${
                paymentChecked || currentPayment.isApproved
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-600'
              }`}
            >
              {(paymentChecked || currentPayment.isApproved) && (
                <Check className="w-4 h-4 stroke-[3]" />
              )}
            </span>
            <div>
              <span className="text-xs font-black text-amber-600 dark:text-amber-400 block">
                أ) تأكيد سداد باقة الحج لوزارة الحج
              </span>
              <span className="text-sm font-black text-slate-900 dark:text-white block mt-0.5">
                أؤكد قيامي بسداد مبلغ الباقة لوزارة الحج
              </span>
            </div>
          </button>

          {currentPayment.isApproved ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-600 text-white text-[11px] font-black shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>معتمد من الإدارة ✓</span>
            </span>
          ) : paymentChecked ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold shrink-0">
              <Clock className="w-3.5 h-3.5" />
              <span>بانتظار اعتماد الإدارة</span>
            </span>
          ) : null}
        </div>

        {(paymentChecked || currentPayment.isApproved) && (
          <div className="pt-1">
            {currentPayment.isApproved ? (
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center justify-between flex-wrap gap-2">
                <span>تم اعتماد سدادك رسمياً من قِبل إدارة قافلة القائم.</span>
                {currentPayment.formattedDate && (
                  <span className="font-black">تاريخ السداد: {currentPayment.formattedDate}</span>
                )}
              </div>
            ) : (
              <DualCalendarDatePicker
                label="تاريخ السداد"
                required={true}
                value={paymentDate}
                hijriValue={paymentDateHijri}
                onChange={(g, h) => {
                  setPaymentDate(g);
                  setPaymentDateHijri(h);
                  setErrorMsg('');
                }}
                defaultMode="hijri"
                minHijriYear={1445}
                maxHijriYear={1450}
                minGregorianYear={2024}
                maxGregorianYear={2029}
              />
            )}
          </div>
        )}
      </div>

      {/* Option B: Approved Hajj Vaccinations Confirmation */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setVaccinationChecked((prev) => !prev);
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className="flex items-start gap-3 text-right flex-1 cursor-pointer"
          >
            <span
              className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition ${
                vaccinationChecked
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-600'
              }`}
            >
              {vaccinationChecked && <Check className="w-4 h-4 stroke-[3]" />}
            </span>
            <div>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 block">
                ب) تأكيد أخذ تطعيمات الحج المعتمدة
              </span>
              <span className="text-sm font-black text-slate-900 dark:text-white block mt-0.5">
                أؤكد حصولي على تطعيمات الحج المعتمدة
              </span>
            </div>
          </button>

          {vaccinationChecked && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-bold shrink-0">
              <Syringe className="w-3.5 h-3.5" />
              <span>تم التطعيم ✓</span>
            </span>
          )}
        </div>

        {vaccinationChecked && (
          <div className="pt-1">
            <DualCalendarDatePicker
              label="تاريخ التطعيم"
              required={true}
              value={vaccinationDate}
              hijriValue={vaccinationDateHijri}
              onChange={(g, h) => {
                setVaccinationDate(g);
                setVaccinationDateHijri(h);
                setErrorMsg('');
              }}
              defaultMode="hijri"
              minHijriYear={1445}
              maxHijriYear={1450}
              minGregorianYear={2024}
              maxGregorianYear={2029}
            />
          </div>
        )}
      </div>

      {/* Feedback Messages */}
      {errorMsg && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-black">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Prominent Save & Notify Button */}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={isSaving}
          onClick={handleSave}
          className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] disabled:opacity-60 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2.5 cursor-pointer"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري الحفظ وإبلاغ الإدارة...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>حفظ وإبلاغ إدارة القافلة</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
