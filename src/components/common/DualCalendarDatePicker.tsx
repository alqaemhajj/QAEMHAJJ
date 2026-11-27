import React, { useMemo, useState, useEffect } from 'react';
import { Calendar, RefreshCw } from 'lucide-react';
import {
  HIJRI_MONTH_NAMES_AR,
  gregorianToHijriUmAlQura,
  hijriUmAlQuraToGregorian,
  getUmAlQuraMonthDays,
  parseRawDateParts,
  resolveDualDates,
} from '../../utils/dualCalendar';

interface DualCalendarDatePickerProps {
  label: string;
  required?: boolean;
  value: string; // Stored primary date (Gregorian YYYY-MM-DD when resolved, or raw if partial)
  hijriValue?: string; // Stored Hijri Umm al-Qura YYYY-MM-DD
  onChange: (gregorianDate: string, hijriDate: string) => void;
  defaultMode?: 'hijri' | 'gregorian';
  minHijriYear?: number;
  maxHijriYear?: number;
  minGregorianYear?: number;
  maxGregorianYear?: number;
  hasAuditError?: boolean;
  isOverrideApproved?: boolean;
  theme?: 'dark' | 'auto';
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const pad4 = (n: number) => String(n).padStart(4, '0');

export const DualCalendarDatePicker: React.FC<DualCalendarDatePickerProps> = ({
  label,
  required = false,
  value,
  hijriValue,
  onChange,
  defaultMode = 'hijri',
  minHijriYear = 1340,
  maxHijriYear = 1480,
  minGregorianYear = 1920,
  maxGregorianYear = 2060,
  hasAuditError = false,
  isOverrideApproved = false,
  theme = 'auto',
}) => {
  const resolved = useMemo(
    () => resolveDualDates(value, hijriValue),
    [value, hijriValue]
  );

  const [mode, setMode] = useState<'hijri' | 'gregorian'>(() => {
    if (resolved.sourceCalendar) return resolved.sourceCalendar;
    return defaultMode;
  });

  // Track partial Hijri selector state when user has picked only some dropdowns
  const [hYear, setHYear] = useState<string>('');
  const [hMonth, setHMonth] = useState<string>('');
  const [hDay, setHDay] = useState<string>('');

  // Keep local Hijri dropdown parts in sync with resolved dual date
  useEffect(() => {
    if (resolved.hijri) {
      const parts = parseRawDateParts(resolved.hijri);
      if (parts && parts.year < 1700) {
        setHYear(String(parts.year));
        setHMonth(String(parts.month));
        setHDay(String(parts.day));
        return;
      }
    }
    if (!value && !hijriValue) {
      setHYear('');
      setHMonth('');
      setHDay('');
    }
  }, [resolved.hijri, value, hijriValue]);

  const maxDaysInSelectedHijriMonth = useMemo(() => {
    const y = parseInt(hYear, 10);
    const m = parseInt(hMonth, 10);
    if (!isNaN(y) && !isNaN(m) && y >= 1300 && m >= 1 && m <= 12) {
      return getUmAlQuraMonthDays(y, m);
    }
    return 30;
  }, [hYear, hMonth]);

  const hijriYearsDescending = useMemo(() => {
    const arr: number[] = [];
    for (let y = maxHijriYear; y >= minHijriYear; y--) {
      arr.push(y);
    }
    return arr;
  }, [minHijriYear, maxHijriYear]);

  const handleHijriPartChange = (nextY: string, nextM: string, nextD: string) => {
    setHYear(nextY);
    setHMonth(nextM);
    setHDay(nextD);

    const y = parseInt(nextY, 10);
    const m = parseInt(nextM, 10);
    let d = parseInt(nextD, 10);

    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const monthLen = getUmAlQuraMonthDays(y, m);
      if (d > monthLen) {
        d = monthLen;
        setHDay(String(d));
      }
      const hijriFormatted = `${pad4(y)}-${pad2(m)}-${pad2(d)}`;
      const greg = hijriUmAlQuraToGregorian(hijriFormatted);
      onChange(greg ? greg.formatted : hijriFormatted, hijriFormatted);
    }
  };

  const handleGregorianInputChange = (gStr: string) => {
    if (!gStr) {
      onChange('', '');
      return;
    }
    const parts = parseRawDateParts(gStr);
    if (parts && parts.year >= minGregorianYear && parts.year <= maxGregorianYear) {
      const gregFormatted = `${pad4(parts.year)}-${pad2(parts.month)}-${pad2(parts.day)}`;
      const hijri = gregorianToHijriUmAlQura(gregFormatted);
      onChange(gregFormatted, hijri ? hijri.formatted : '');
    } else {
      onChange(gStr, '');
    }
  };

  const isDark = theme === 'dark';
  const containerBorder = isOverrideApproved
    ? 'border-amber-500/60'
    : hasAuditError
    ? 'border-red-500 ring-2 ring-red-500/30'
    : isDark
    ? 'border-slate-700'
    : 'border-slate-300 dark:border-slate-700';

  const selectClass = isDark
    ? 'bg-[#090F1E] border border-slate-700 text-white font-bold rounded-xl px-2.5 py-2 text-xs focus:border-amber-400 outline-none transition'
    : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-bold rounded-xl px-2.5 py-2 text-xs focus:border-amber-500 outline-none transition';

  return (
    <div
      className={`rounded-2xl border p-3.5 space-y-2.5 transition ${containerBorder} ${
        isDark ? 'bg-[#070C18]' : 'bg-slate-50 dark:bg-slate-950'
      }`}
    >
      {/* Label + Calendar Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          className={`text-xs font-bold flex items-center gap-1.5 ${
            isDark ? 'text-slate-200' : 'text-slate-700 dark:text-slate-300'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            {label} {required && <span className="text-amber-400 font-black">*</span>}
          </span>
        </label>

        <div
          className={`inline-flex rounded-xl p-0.5 border text-[11px] font-black ${
            isDark
              ? 'bg-[#0B1221] border-slate-800'
              : 'bg-slate-200/80 dark:bg-slate-900 border-slate-300 dark:border-slate-700'
          }`}
        >
          <button
            type="button"
            onClick={() => setMode('hijri')}
            className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
              mode === 'hijri'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : isDark
                ? 'text-slate-300 hover:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            هجري (أم القرى)
          </button>
          <button
            type="button"
            onClick={() => setMode('gregorian')}
            className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
              mode === 'gregorian'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : isDark
                ? 'text-slate-300 hover:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            ميلادي
          </button>
        </div>
      </div>

      {/* Mode Inputs */}
      {mode === 'hijri' ? (
        <div className="grid grid-cols-3 gap-2">
          <select
            aria-label={`${label} - اليوم الهجري`}
            value={hDay}
            onChange={(e) => handleHijriPartChange(hYear, hMonth, e.target.value)}
            className={selectClass}
          >
            <option value="">اليوم</option>
            {Array.from({ length: maxDaysInSelectedHijriMonth }, (_, i) => i + 1).map((d) => (
              <option key={d} value={String(d)}>
                {d}
              </option>
            ))}
          </select>

          <select
            aria-label={`${label} - الشهر الهجري`}
            value={hMonth}
            onChange={(e) => handleHijriPartChange(hYear, e.target.value, hDay)}
            className={selectClass}
          >
            <option value="">الشهر الهجري</option>
            {HIJRI_MONTH_NAMES_AR.map((mName, idx) => (
              <option key={mName} value={String(idx + 1)}>
                {idx + 1} - {mName}
              </option>
            ))}
          </select>

          <select
            aria-label={`${label} - السنة الهجرية`}
            value={hYear}
            onChange={(e) => handleHijriPartChange(e.target.value, hMonth, hDay)}
            className={selectClass}
          >
            <option value="">السنة (هـ)</option>
            {hijriYearsDescending.map((y) => (
              <option key={y} value={String(y)}>
                {y} هـ
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input
          type="date"
          aria-label={`${label} - ميلادي`}
          value={resolved.gregorian}
          min={`${minGregorianYear}-01-01`}
          max={`${maxGregorianYear}-12-31`}
          onChange={(e) => handleGregorianInputChange(e.target.value)}
          dir="ltr"
          className={`w-full rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none transition border ${
            isDark
              ? 'bg-[#090F1E] border-slate-700 text-white focus:border-amber-400 [color-scheme:dark]'
              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:border-amber-500'
          }`}
        />
      )}

      {/* Synchronized Dual Calendar Display */}
      <div
        className={`rounded-xl px-3 py-2 border text-[11px] flex flex-col gap-1 ${
          isDark
            ? 'bg-[#0B1221] border-slate-800/90 text-slate-300'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-amber-700 dark:text-amber-500 font-bold flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            <span>هجري (أم القرى):</span>
          </span>
          <span className="font-bold text-right" dir="rtl">
            {resolved.hijri ? (
              <>
                <span className="font-mono text-amber-700 dark:text-amber-400" dir="ltr">
                  {resolved.hijri}
                </span>
                {resolved.hijriAr && (
                  <span className="text-[10px] opacity-80 mr-1.5">({resolved.hijriAr})</span>
                )}
              </>
            ) : (
              <span className="opacity-50">— لم يُحدد بعد —</span>
            )}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800/40 pt-1">
          <span className="text-sky-700 dark:text-sky-400 font-bold">الميلادي الموافق:</span>
          <span className="font-bold text-right">
            {resolved.gregorian ? (
              <>
                <span className="font-mono text-sky-700 dark:text-sky-300" dir="ltr">
                  {resolved.gregorian}
                </span>
                {resolved.gregorianAr && (
                  <span className="text-[10px] opacity-80 mr-1.5">({resolved.gregorianAr})</span>
                )}
              </>
            ) : (
              <span className="opacity-50">— لم يُحدد بعد —</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};
