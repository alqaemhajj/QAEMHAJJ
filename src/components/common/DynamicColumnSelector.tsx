import React, { useEffect, useMemo, useState } from 'react';
import {
  SlidersHorizontal,
  Check,
  Square,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Sparkles,
  FileText,
} from 'lucide-react';
import { CampaignSettings, HajjPackage, Pilgrim } from '../../types';
import {
  PilgrimEducationalProgress,
  ReligiousGuide,
} from '../../types/religiousGuidance';
import { subscribeToCollection } from '../../lib/db';
import { safeStorage } from '../../utils/safeStorage';
import {
  getPilgrimDisplayName,
  getPilgrimEffectiveMarji,
} from '../../lib/religiousGuidanceDb';
import {
  getPilgrimPaymentDeclaration,
  getPilgrimVaccinationDeclaration,
} from '../../utils/pilgrimDeclarations';

export type DynamicColumnGroup = 'specific' | 'shared';

export interface DynamicColumnDef<TRow = any> {
  key: string;
  label: string;
  shortHeader?: string;
  group: DynamicColumnGroup;
  defaultEnabled: boolean;
  isTextProtected?: boolean;
  isLtr?: boolean;
  getValue: (row: TRow, index: number) => string | number;
}

export const ROSTER_STORAGE_PREFIX = 'qaem_roster_columns_v1_';

export function loadPersistedColumnSelection(
  storageKey: string,
  columns: { key: string; defaultEnabled: boolean }[]
): Record<string, boolean> {
  const defaults: Record<string, boolean> = {};
  columns.forEach((c) => {
    defaults[c.key] = c.defaultEnabled;
  });

  if (!storageKey || typeof window === 'undefined') return defaults;

  const parsed = safeStorage.getJSON<Record<string, unknown> | null>(
    `${ROSTER_STORAGE_PREFIX}${storageKey}`,
    null
  );
  if (!parsed || typeof parsed !== 'object') return defaults;
  const merged: Record<string, boolean> = {};
  columns.forEach((c) => {
    if (typeof parsed[c.key] === 'boolean') {
      merged[c.key] = parsed[c.key] as boolean;
    } else {
      merged[c.key] = c.defaultEnabled;
    }
  });
  return merged;
}

export function savePersistedColumnSelection(
  storageKey: string,
  selection: Record<string, boolean>
): void {
  if (!storageKey || typeof window === 'undefined') return;
  safeStorage.setJSON(`${ROSTER_STORAGE_PREFIX}${storageKey}`, selection);
}

export function getAutoOrientationForColumnCount(
  dataColumnCount: number
): 'portrait' | 'landscape' {
  return dataColumnCount > 6 ? 'landscape' : 'portrait';
}

export function usePersistedColumns<T extends { key: string; defaultEnabled: boolean }>(
  storageKey: string,
  columns: T[]
) {
  const columnSignature = columns.map((c) => `${c.key}:${c.defaultEnabled ? '1' : '0'}`).join('|');

  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>(() =>
    loadPersistedColumnSelection(storageKey, columns)
  );

  // Reload whenever storageKey or available column definitions change
  useEffect(() => {
    setSelectedMap(loadPersistedColumnSelection(storageKey, columns));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, columnSignature]);

  const updateSelection = (
    updater: (prev: Record<string, boolean>) => Record<string, boolean>
  ) => {
    setSelectedMap((prev) => {
      const next = updater(prev);
      savePersistedColumnSelection(storageKey, next);
      return next;
    });
  };

  const toggleColumn = (key: string) => {
    updateSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAll = () => {
    updateSelection(() => {
      const next: Record<string, boolean> = {};
      columns.forEach((c) => {
        next[c.key] = true;
      });
      return next;
    });
  };

  const deselectAll = () => {
    updateSelection(() => {
      const next: Record<string, boolean> = {};
      columns.forEach((c) => {
        next[c.key] = false;
      });
      return next;
    });
  };

  const resetDefaults = () => {
    updateSelection(() => {
      const next: Record<string, boolean> = {};
      columns.forEach((c) => {
        next[c.key] = c.defaultEnabled;
      });
      return next;
    });
  };

  const activeColumns = useMemo(
    () => columns.filter((c) => Boolean(selectedMap[c.key])),
    [columns, selectedMap]
  );

  const recommendedOrientation = getAutoOrientationForColumnCount(activeColumns.length);

  return {
    selectedMap,
    activeColumns,
    toggleColumn,
    selectAll,
    deselectAll,
    resetDefaults,
    recommendedOrientation,
    isSelected: (key: string) => Boolean(selectedMap[key]),
  };
}

/**
 * Live lookup hook for Mutawwif assignment & Bus/Group Supervisor across all rosters
 */
export function useMutawwifAndGuideLookup() {
  const [progressRecords, setProgressRecords] = useState<PilgrimEducationalProgress[]>(() => {
    const parsed = safeStorage.getJSON<unknown>('qaem_rel_progress_v1', []);
    return Array.isArray(parsed) ? (parsed as PilgrimEducationalProgress[]) : [];
  });

  const [guides, setGuides] = useState<ReligiousGuide[]>(() => {
    const parsed = safeStorage.getJSON<unknown>('qaem_rel_guides_v1', []);
    return Array.isArray(parsed) ? (parsed as ReligiousGuide[]) : [];
  });

  useEffect(() => {
    const unsubProgress = subscribeToCollection<PilgrimEducationalProgress>(
      'religious_pilgrim_progress',
      (docs) => {
        if (Array.isArray(docs) && docs.length > 0) {
          setProgressRecords(docs);
        }
      }
    );
    const unsubGuides = subscribeToCollection<ReligiousGuide>('religious_guides', (docs) => {
      if (Array.isArray(docs) && docs.length > 0) {
        setGuides(docs);
      }
    });
    return () => {
      if (typeof unsubProgress === 'function') unsubProgress();
      if (typeof unsubGuides === 'function') unsubGuides();
    };
  }, []);

  const mutawwifByPilgrim = useMemo(() => {
    const map = new Map<string, string>();
    progressRecords.forEach((rec) => {
      const name = (rec.assignedMutawwifName || '').trim();
      if (!name) return;
      if (rec.pilgrimId) map.set(rec.pilgrimId.trim(), name);
      if (rec.nationalId) map.set(rec.nationalId.trim(), name);
      if (rec.id) map.set(rec.id.trim(), name);
    });
    return map;
  }, [progressRecords]);

  const busSupervisorByBus = useMemo(() => {
    const map = new Map<string, string>();
    guides.forEach((g) => {
      if (!g.name) return;
      (g.assignedGroups || []).forEach((grp) => {
        const clean = grp.trim();
        if (clean && !map.has(clean)) {
          map.set(clean, g.name);
        }
      });
    });
    return map;
  }, [guides]);

  return { mutawwifByPilgrim, busSupervisorByBus };
}

interface DynamicColumnSelectorPanelProps {
  title?: string;
  columns: {
    key: string;
    label: string;
    group: DynamicColumnGroup;
  }[];
  selectedMap: Record<string, boolean>;
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onResetDefaults: () => void;
  defaultOpen?: boolean;
  specificGroupLabel?: string;
  sharedGroupLabel?: string;
  darkSurfaceOnly?: boolean;
}

export const DynamicColumnSelectorPanel: React.FC<DynamicColumnSelectorPanelProps> = ({
  title = 'تخصيص أعمدة وحقول الكشف',
  columns,
  selectedMap,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onResetDefaults,
  defaultOpen = false,
  specificGroupLabel = '1) الحقول التخصصية لهذا الكشف',
  sharedGroupLabel = '2) الحقول الأساسية المشتركة (وتوقيع التحضير)',
  darkSurfaceOnly = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const specificCols = useMemo(
    () => columns.filter((c) => c.group === 'specific'),
    [columns]
  );
  const sharedCols = useMemo(
    () => columns.filter((c) => c.group === 'shared'),
    [columns]
  );

  const selectedCount = useMemo(
    () => columns.filter((c) => Boolean(selectedMap[c.key])).length,
    [columns, selectedMap]
  );

  const autoOrientation = getAutoOrientationForColumnCount(selectedCount);

  const containerBg = darkSurfaceOnly
    ? 'bg-[#0B1221] border-amber-500/35 text-white'
    : 'bg-white dark:bg-[#0F172A] border-amber-500/35 text-slate-900 dark:text-white';

  const groupCardBg = darkSurfaceOnly
    ? 'bg-[#10192D] border-slate-800'
    : 'bg-slate-50 dark:bg-[#0B1221] border-slate-200 dark:border-slate-800';

  const uncheckedBg = darkSurfaceOnly
    ? 'bg-[#0B1221] border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
    : 'bg-white dark:bg-[#10192D] border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600';

  return (
    <div className="space-y-2.5" dir="rtl">
      <div className={`border rounded-2xl overflow-hidden shadow-sm transition ${containerBg}`}>
        {/* Collapsible Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 bg-amber-500/5 border-b border-slate-200/80 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="flex flex-wrap items-center gap-2 text-right cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-xs sm:text-sm font-black">{title}</span>
            <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-mono font-black">
              {selectedCount} / {columns.length} عمود
            </span>
            <span
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border inline-flex items-center gap-1 ${
                autoOrientation === 'portrait'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30'
              }`}
              title="يتحدد اتجاه ورقة الطباعة A4 تلقائياً حسب عدد الأعمدة المختارة"
            >
              <FileText className="w-3 h-3" />
              <span>
                {autoOrientation === 'portrait' ? 'طباعة تلقائية: A4 عمودي' : 'طباعة تلقائية: A4 أفقي'}
              </span>
            </span>
            {isOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onSelectAll}
              className="px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>تحديد الكل</span>
            </button>
            <button
              type="button"
              onClick={onDeselectAll}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 border transition cursor-pointer ${
                darkSurfaceOnly
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
              }`}
            >
              <Square className="w-3 h-3" />
              <span>إلغاء تحديد الكل</span>
            </button>
            <button
              type="button"
              onClick={onResetDefaults}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>استعادة الأعمدة الافتراضية</span>
            </button>
          </div>
        </div>

        {/* Expanded Checkboxes Body */}
        {isOpen && (
          <div className="p-4 space-y-3.5 animate-fadeIn">
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>
                التغييرات تنعكس فوراً على الجدول المعروض وملفات PDF و Excel، وتُحفظ تفضيلاتك تلقائياً لهذا الكشف.
              </span>
            </p>

            {specificCols.length > 0 && sharedCols.length > 0 ? (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5">
                {/* Specific Group */}
                <div className={`xl:col-span-5 border rounded-2xl p-3 space-y-2.5 ${groupCardBg}`}>
                  <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-1.5">
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                      {specificGroupLabel}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                      {specificCols.filter((c) => Boolean(selectedMap[c.key])).length} /{' '}
                      {specificCols.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-1.5">
                    {specificCols.map((col) => {
                      const checked = Boolean(selectedMap[col.key]);
                      return (
                        <label
                          key={col.key}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                            checked
                              ? 'bg-emerald-500/10 border-emerald-500/45 text-slate-900 dark:text-white'
                              : uncheckedBg
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggle(col.key)}
                            className="w-4 h-4 accent-emerald-500 rounded cursor-pointer shrink-0"
                          />
                          <span className="leading-snug">{col.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Shared Group */}
                <div className={`xl:col-span-7 border rounded-2xl p-3 space-y-2.5 ${groupCardBg}`}>
                  <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-1.5">
                    <span className="text-xs font-black text-amber-600 dark:text-amber-400">
                      {sharedGroupLabel}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                      {sharedCols.filter((c) => Boolean(selectedMap[c.key])).length} /{' '}
                      {sharedCols.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {sharedCols.map((col) => {
                      const checked = Boolean(selectedMap[col.key]);
                      return (
                        <label
                          key={col.key}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                            checked
                              ? 'bg-amber-500/10 border-amber-500/45 text-slate-900 dark:text-white'
                              : uncheckedBg
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggle(col.key)}
                            className="w-4 h-4 accent-amber-500 rounded cursor-pointer shrink-0"
                          />
                          <span className="leading-snug">{col.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {columns.map((col) => {
                  const checked = Boolean(selectedMap[col.key]);
                  return (
                    <label
                      key={col.key}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                        checked
                          ? 'bg-amber-500/15 border-amber-500/45 text-slate-900 dark:text-white'
                          : uncheckedBg
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(col.key)}
                        className="w-4 h-4 accent-amber-500 rounded cursor-pointer shrink-0"
                      />
                      <span className="leading-snug">{col.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedCount === 0 && (
        <div className="bg-amber-500/15 border border-amber-500/40 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>لم يتم تحديد أي عمود للعرض — يرجى تفعيل عمود واحد على الأقل لعرض الكشف وتصديره.</span>
          </div>
          <button
            type="button"
            onClick={onResetDefaults}
            className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-black text-xs cursor-pointer"
          >
            استعادة الافتراضي
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Unified Pilgrim Column Builders for All Campaign Rosters
// ============================================================================

export type PilgrimRosterType =
  | 'pilgrims'
  | 'excluded'
  | 'busBoarding'
  | 'flightsList'
  | 'housingList'
  | 'healthList'
  | 'marjiList'
  | 'paymentsList';

export interface PilgrimColumnContext {
  packages?: HajjPackage[];
  campaignSettings?: CampaignSettings;
  mutawwifByPilgrim?: Map<string, string>;
  busSupervisorByBus?: Map<string, string>;
  getPilgrimPaidAmount?: (p: Pilgrim) => number;
  getPilgrimExpectedPrice?: (p: Pilgrim) => number;
  isPilgrimPaymentConfirmed?: (p: Pilgrim) => boolean;
}

function getMobileWhatsappText(p: Pilgrim): string {
  const m = (p.mobile || '').trim();
  const w = (p.whatsapp || '').trim();
  if (m && w && m !== w) return `${m} / واتساب: ${w}`;
  return m || w || '—';
}

function getPaymentStatusText(p: Pilgrim, ctx: PilgrimColumnContext): string {
  const confirmed = ctx.isPilgrimPaymentConfirmed
    ? ctx.isPilgrimPaymentConfirmed(p)
    : p.paymentReceived === true ||
      p.status === 'مكتمل' ||
      p.status === 'مكتمل الدفع';
  if (confirmed) return 'مؤكد السداد';
  const paidNum = Number(String(p.paidAmount || '').replace(/[^0-9.]/g, '')) || 0;
  if (paidNum > 0) return `دفعة جزئية (${paidNum.toLocaleString('en-US')} ريال)`;
  return p.status || 'قيد المراجعة';
}

function getMutawwifText(p: Pilgrim, ctx: PilgrimColumnContext): string {
  const map = ctx.mutawwifByPilgrim;
  if (!map) return 'غير معيّن بعد';
  return (
    (p.id && map.get(p.id.trim())) ||
    (p.nationalId && map.get(p.nationalId.trim())) ||
    'غير معيّن بعد'
  );
}

function getPackageMatch(p: Pilgrim, packages?: HajjPackage[]): HajjPackage | undefined {
  if (!packages || packages.length === 0) return undefined;
  const title = (p.selectedPackage || p.packageType || '').trim();
  if (!title) return undefined;
  return packages.find((pkg) => pkg.title.trim() === title);
}

function parseFlightParts(outbound?: string, ret?: string) {
  const outClean = (outbound || '').trim();
  const retClean = (ret || '').trim();
  const combined = [outClean, retClean].filter(Boolean).join(' ');

  let airline = '—';
  const airlineKeywords = [
    'الخطوط السعودية',
    'السعودية',
    'طيران ناس',
    'ناس',
    'طيران أديل',
    'أديل',
    'فلاي ناس',
    'فلاي أديل',
    'SV',
    'XY',
    'F3',
  ];
  for (const kw of airlineKeywords) {
    if (combined.toUpperCase().includes(kw.toUpperCase())) {
      airline =
        kw === 'SV'
          ? 'الخطوط السعودية (SV)'
          : kw === 'XY'
          ? 'طيران ناس (XY)'
          : kw === 'F3'
          ? 'طيران أديل (F3)'
          : kw;
      break;
    }
  }

  return {
    airline,
    numbers:
      outClean || retClean
        ? `ذهاب: ${outClean || '—'} | عودة: ${retClean || '—'}`
        : 'غير محدد',
    schedule:
      outClean || retClean
        ? `${outClean ? `ذهاب (${outClean})` : ''}${outClean && retClean ? ' / ' : ''}${
            retClean ? `عودة (${retClean})` : ''
          }`
        : 'غير محدد',
    route:
      outClean || retClean
        ? `الذهاب: ${outClean || '—'} ← العودة: ${retClean || '—'}`
        : 'الأحساء / الدمام ↔ جدة / المدينة',
  };
}

function getCleanHealthDiseases(p: Pilgrim): string[] {
  return (p.healthConditions || []).filter((d) => {
    const clean = (d || '').trim();
    return clean && clean !== 'لا يوجد' && clean !== 'لا توجد' && clean !== 'سليم';
  });
}

/**
 * Builds the complete column definitions (Domain-Specific + All 11 Shared Base Fields)
 * for any of the 8 core AdminDashboard pilgrim rosters.
 */
export function buildPilgrimRosterColumns(
  rosterType: PilgrimRosterType,
  ctx: PilgrimColumnContext
): DynamicColumnDef<Pilgrim>[] {
  const defaultShared = (key: string): boolean => {
    const defaultsByRoster: Record<PilgrimRosterType, string[]> = {
      pilgrims: ['fullName', 'nationalId', 'selectedPackage', 'mobile', 'paymentStatus'],
      excluded: ['fullName', 'nationalId', 'mobile'],
      busBoarding: ['fullName', 'nationalId', 'mobile'],
      flightsList: ['fullName', 'nationalId', 'mobile'],
      housingList: ['fullName', 'mobile'],
      healthList: ['fullName', 'nationalId', 'mobile'],
      marjiList: ['fullName', 'mobile', 'marji'],
      paymentsList: ['fullName', 'nationalId', 'mobile', 'paymentStatus'],
    };
    return defaultsByRoster[rosterType].includes(key);
  };

  // All 11 Shared Base Pilgrim Fields (available in every single roster)
  const sharedColumns: DynamicColumnDef<Pilgrim>[] = [
    {
      key: 'fullName',
      label: 'الاسم الكامل للحاج',
      shortHeader: 'الاسم الكامل للحاج',
      group: 'shared',
      defaultEnabled: defaultShared('fullName'),
      getValue: (p) => getPilgrimDisplayName(p),
    },
    {
      key: 'nationalId',
      label: 'رقم الهوية الوطنية',
      shortHeader: 'رقم الهوية',
      group: 'shared',
      defaultEnabled: defaultShared('nationalId'),
      isTextProtected: true,
      isLtr: true,
      getValue: (p) => (p.nationalId || '').trim() || '—',
    },
    {
      key: 'mobile',
      label: 'رقم الجوال / الواتساب',
      shortHeader: 'الجوال / الواتساب',
      group: 'shared',
      defaultEnabled: defaultShared('mobile'),
      isTextProtected: true,
      isLtr: true,
      getValue: (p) => getMobileWhatsappText(p),
    },
    {
      key: 'gender',
      label: 'الجنس (ذكر / أنثى)',
      shortHeader: 'الجنس',
      group: 'shared',
      defaultEnabled: defaultShared('gender'),
      getValue: (p) => (p.gender || '').trim() || '—',
    },
    {
      key: 'nationality',
      label: 'الجنسية',
      shortHeader: 'الجنسية',
      group: 'shared',
      defaultEnabled: defaultShared('nationality'),
      getValue: (p) => (p.nationality || '').trim() || '—',
    },
    {
      key: 'birthDate',
      label: 'تاريخ الميلاد',
      shortHeader: 'تاريخ الميلاد',
      group: 'shared',
      defaultEnabled: defaultShared('birthDate'),
      isLtr: true,
      getValue: (p) => (p.birthDate || p.birthDateHijri || '').trim() || '—',
    },
    {
      key: 'selectedPackage',
      label: 'الباقة المختارة',
      shortHeader: 'الباقة المختارة',
      group: 'shared',
      defaultEnabled: defaultShared('selectedPackage'),
      getValue: (p) => (p.selectedPackage || p.packageType || '').trim() || 'التسجيل العام',
    },
    {
      key: 'marji',
      label: 'مرجع التقليد',
      shortHeader: 'مرجع التقليد',
      group: 'shared',
      defaultEnabled: defaultShared('marji'),
      getValue: (p) => getPilgrimEffectiveMarji(p),
    },
    {
      key: 'mutawwif',
      label: 'اسم المطوّف المكلّف',
      shortHeader: 'المطوّف المكلّف',
      group: 'shared',
      defaultEnabled: defaultShared('mutawwif'),
      getValue: (p) => getMutawwifText(p, ctx),
    },
    {
      key: 'paymentStatus',
      label: 'حالة السداد',
      shortHeader: 'حالة السداد',
      group: 'shared',
      defaultEnabled: defaultShared('paymentStatus'),
      getValue: (p) => getPaymentStatusText(p, ctx),
    },
    {
      key: 'signatureNotes',
      label: 'خانة توقيع / تحضير يدوي / ملاحظات',
      shortHeader: 'توقيع / تحضير / ملاحظات',
      group: 'shared',
      defaultEnabled: false,
      getValue: () => '',
    },
  ];

  // Domain-Specific Columns per Roster
  let specificColumns: DynamicColumnDef<Pilgrim>[] = [];

  if (rosterType === 'pilgrims') {
    specificColumns = [
      {
        key: 'transport',
        label: 'وسيلة المواصلات (باص / طائرة)',
        shortHeader: 'المواصلات',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const pkg = (p.selectedPackage || '').trim();
          const tr = (p.transport || '').trim();
          if (pkg.includes('طيران') || tr === 'طائرة' || tr.includes('طيران')) return 'طائرة';
          return 'باص';
        },
      },
      {
        key: 'companionsCount',
        label: 'عدد المرافقين والمحارم',
        shortHeader: 'المرافقون',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const count = Array.isArray(p.mahramDetails)
            ? p.mahramDetails.filter((m) => (m?.name || m?.nationalId || m?.relation || '').trim()).length
            : 0;
          return count > 0 ? `${count} مرافق` : 'بدون مرافقين';
        },
      },
      {
        key: 'pilgrimStatus',
        label: 'حالة الطلب والاعتماد',
        shortHeader: 'الحالة',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => p.status || 'قيد المراجعة',
      },
      {
        key: 'paymentDeclarationStatus',
        label: 'حالة السداد (لوزارة الحج)',
        shortHeader: 'حالة السداد',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => getPilgrimPaymentDeclaration(p).label,
      },
      {
        key: 'paymentDeclarationDate',
        label: 'تاريخ السداد',
        shortHeader: 'تاريخ السداد',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => getPilgrimPaymentDeclaration(p).formattedDate || '—',
      },
      {
        key: 'vaccinationStatus',
        label: 'حالة التطعيم',
        shortHeader: 'حالة التطعيم',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => getPilgrimVaccinationDeclaration(p).label,
      },
      {
        key: 'vaccinationDate',
        label: 'تاريخ التطعيم',
        shortHeader: 'تاريخ التطعيم',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => getPilgrimVaccinationDeclaration(p).formattedDate || '—',
      },
      {
        key: 'madinahPrivateRoom',
        label: 'طلب غرفة خاصة بالمدينة المنورة (نعم / لا)',
        shortHeader: 'غرفة خاصة بالمدينة',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) =>
          p.madinahPrivateRoomRequested
            ? p.madinahPrivateRoomNote
              ? `نعم (${p.madinahPrivateRoomNote})`
              : 'نعم'
            : 'لا',
      },
      {
        key: 'bankIban',
        label: 'البيانات البنكية والآيبان',
        shortHeader: 'البنك والآيبان',
        group: 'specific',
        defaultEnabled: false,
        isTextProtected: true,
        getValue: (p) => {
          const parts = [p.bankName?.trim(), p.iban?.trim()].filter(Boolean);
          return parts.length > 0 ? parts.join(' — ') : '—';
        },
      },
      {
        key: 'lastHajjYear',
        label: 'سنة آخر حجة',
        shortHeader: 'آخر حجة',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => (p.lastHajjYear || '').trim() || 'لم يسبق له الحج',
      },
      {
        key: 'registrationRefDate',
        label: 'رقم الطلب وتاريخ التسجيل',
        shortHeader: 'رقم الطلب / التاريخ',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => {
          const ref = (p.registrationReference || p.membershipNumber || '').trim();
          const dateStr = p.createdAt ? String(p.createdAt).split('T')[0] : '';
          return [ref, dateStr].filter(Boolean).join(' • ') || '—';
        },
      },
    ];
  } else if (rosterType === 'excluded') {
    specificColumns = [
      {
        key: 'exclusionStatus',
        label: 'حالة الاستبعاد (مرفوض / معتذر / محذوف)',
        shortHeader: 'حالة الاستبعاد',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => p.status || 'مستبعد',
      },
      {
        key: 'exclusionReason',
        label: 'سبب الاستبعاد / الملاحظات',
        shortHeader: 'السبب / الملاحظات',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => (p.rejectionReason || p.statusNotes || '').trim() || '—',
      },
      {
        key: 'bankIban',
        label: 'البيانات البنكية والآيبان (للاسترداد)',
        shortHeader: 'البنك والآيبان',
        group: 'specific',
        defaultEnabled: false,
        isTextProtected: true,
        getValue: (p) => [p.bankName?.trim(), p.iban?.trim()].filter(Boolean).join(' — ') || '—',
      },
      {
        key: 'companionsCount',
        label: 'عدد المرافقين',
        shortHeader: 'المرافقون',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => {
          const count = Array.isArray(p.mahramDetails)
            ? p.mahramDetails.filter((m) => (m?.name || m?.nationalId || m?.relation || '').trim()).length
            : 0;
          return count > 0 ? `${count} مرافق` : 'بدون مرافقين';
        },
      },
      {
        key: 'registrationRefDate',
        label: 'رقم الطلب وتاريخ التسجيل',
        shortHeader: 'رقم الطلب / التاريخ',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => {
          const ref = (p.registrationReference || '').trim();
          const dateStr = p.createdAt ? String(p.createdAt).split('T')[0] : '';
          return [ref, dateStr].filter(Boolean).join(' • ') || '—';
        },
      },
    ];
  } else if (rosterType === 'busBoarding') {
    specificColumns = [
      {
        key: 'busNumber',
        label: 'رقم الحافلة',
        shortHeader: 'رقم الحافلة',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => (p.busNumber || '').trim() || 'غير مخصص',
      },
      {
        key: 'busSeat',
        label: 'رقم المقعد',
        shortHeader: 'رقم المقعد',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => (p.busSeat ? `مقعد ${p.busSeat}` : 'غير محدد'),
      },
      {
        key: 'busPickupPoint',
        label: 'نقطة التجمع / الانطلاق',
        shortHeader: 'نقطة التجمع / الانطلاق',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => {
          const bus = (p.busNumber || '').trim();
          const loc = bus ? ctx.campaignSettings?.groupLocations?.[bus] : undefined;
          return (loc?.locationTitle || '').trim() || 'مقر انطلاق القافلة (الأحساء)';
        },
      },
      {
        key: 'busSupervisor',
        label: 'اسم مشرف الحافلة',
        shortHeader: 'مشرف الحافلة',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => {
          const bus = (p.busNumber || '').trim();
          if (!bus) return 'غير محدد';
          const fromGuide = ctx.busSupervisorByBus?.get(bus);
          const fromLoc = ctx.campaignSettings?.groupLocations?.[bus]?.updatedBy;
          return (fromGuide || fromLoc || '').trim() || 'إدارة التفويج';
        },
      },
    ];
  } else if (rosterType === 'flightsList') {
    specificColumns = [
      {
        key: 'englishName',
        label: 'الاسم بالإنجليزية (جواز السفر)',
        shortHeader: 'الاسم بالإنجليزية',
        group: 'specific',
        defaultEnabled: true,
        isLtr: true,
        getValue: (p) => (p.englishFullName || '').trim() || '—',
      },
      {
        key: 'flightOutbound',
        label: 'رحلة الذهاب (رقم الرحلة / الموعد)',
        shortHeader: 'رحلة الذهاب',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => (p.flightNumberOutbound || '').trim() || 'غير محدد',
      },
      {
        key: 'flightReturn',
        label: 'رحلة العودة (رقم الرحلة / الموعد)',
        shortHeader: 'رحلة العودة',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => (p.flightNumberReturn || '').trim() || 'غير محدد',
      },
      {
        key: 'flightTicketPnr',
        label: 'رقم التذكرة / الحجز (PNR)',
        shortHeader: 'رقم التذكرة (PNR)',
        group: 'specific',
        defaultEnabled: true,
        isTextProtected: true,
        isLtr: true,
        getValue: (p) => (p.flightTicketNumber || '').trim() || 'غير محدد',
      },
      {
        key: 'airline',
        label: 'شركة الطيران',
        shortHeader: 'شركة الطيران',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => parseFlightParts(p.flightNumberOutbound, p.flightNumberReturn).airline,
      },
      {
        key: 'flightRoute',
        label: 'خط السير (موعد الإقلاع / الوصول)',
        shortHeader: 'خط السير والمواعيد',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => parseFlightParts(p.flightNumberOutbound, p.flightNumberReturn).route,
      },
    ];
  } else if (rosterType === 'housingList') {
    specificColumns = [
      {
        key: 'madinahRoom',
        label: 'فندق المدينة / رقم الغرفة',
        shortHeader: 'غرفة المدينة المنورة',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const room = (p.roomNumberMadinah || '').trim();
          const pkgHotel = getPackageMatch(p, ctx.packages)?.accommodationMadinah?.trim();
          if (room) return room;
          return pkgHotel ? `غير مسكّن (${pkgHotel})` : 'غير محدد';
        },
      },
      {
        key: 'makkahRoom',
        label: 'فندق مكة / رقم الغرفة',
        shortHeader: 'غرفة مكة المكرمة',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const room = (p.roomNumberMakkah || p.roomNumber || '').trim();
          const pkgHotel = getPackageMatch(p, ctx.packages)?.accommodationMakkah?.trim();
          if (room) return room;
          return pkgHotel ? `غير مسكّن (${pkgHotel})` : 'غير محدد';
        },
      },
      {
        key: 'minaCampRoom',
        label: 'مخيم منى / رقم الخيمة أو المربع',
        shortHeader: 'مخيم منى / الخيمة',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const mina = (p.roomNumberMina || '').trim();
          const pkgCamp = getPackageMatch(p, ctx.packages)?.campMina?.trim();
          if (mina) return mina;
          return pkgCamp ? `غير محدد (${pkgCamp})` : 'غير محدد';
        },
      },
      {
        key: 'madinahPrivateRoom',
        label: 'طلب غرفة خاصة بالمدينة المنورة (نعم / لا)',
        shortHeader: 'غرفة خاصة بالمدينة',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) =>
          p.madinahPrivateRoomRequested
            ? p.madinahPrivateRoomNote
              ? `نعم (${p.madinahPrivateRoomNote})`
              : 'نعم'
            : 'لا',
      },
    ];
  } else if (rosterType === 'healthList') {
    specificColumns = [
      {
        key: 'healthConditionType',
        label: 'نوع الحالة الصحية والأمراض المزمنة',
        shortHeader: 'الحالة الصحية والأمراض',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const clean = getCleanHealthDiseases(p);
          return clean.length > 0 ? clean.join('، ') : 'سليم ولله الحمد';
        },
      },
      {
        key: 'specialNeedsMobility',
        label: 'الاحتياجات الخاصة (كرسي متحرك / مرافق صحي)',
        shortHeader: 'الاحتياجات الخاصة',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const parts = [
            p.needsAssistance ? 'كرسي متحرك / مساعدة حركية' : '',
            p.hasBackPain ? 'آلام ظهر' : '',
            p.hasSpeechDifficulty ? 'صعوبة نطق' : '',
            p.isPregnant ? 'حامل' : '',
            p.mobilityIndependence && p.mobilityIndependence !== 'مستقل تماماً'
              ? p.mobilityIndependence
              : '',
          ].filter(Boolean);
          return parts.length > 0 ? parts.join('، ') : 'لا يوجد';
        },
      },
      {
        key: 'medicalNotesMeds',
        label: 'الأدوية أو الملاحظات الطبية',
        shortHeader: 'الأدوية / الملاحظات الطبية',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => (p.otherHealthCondition || '').trim() || 'لا توجد ملاحظات إضافية',
      },
      {
        key: 'healthBusAndRooms',
        label: 'الحافلة وغرف السكن (مكة / المدينة)',
        shortHeader: 'السكن والحافلة',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const bus = p.busNumber ? `${p.busNumber}${p.busSeat ? ` (${p.busSeat})` : ''}` : '—';
          const rooms = `${p.roomNumberMakkah || p.roomNumber || '—'} / ${p.roomNumberMadinah || '—'}`;
          return `باص: ${bus} | غرف: ${rooms}`;
        },
      },
      {
        key: 'vaccinationStatus',
        label: 'حالة التطعيم',
        shortHeader: 'حالة التطعيم',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => getPilgrimVaccinationDeclaration(p).label,
      },
      {
        key: 'vaccinationDate',
        label: 'تاريخ التطعيم',
        shortHeader: 'تاريخ التطعيم',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => getPilgrimVaccinationDeclaration(p).formattedDate || '—',
      },
      {
        key: 'paymentDeclarationStatus',
        label: 'حالة السداد (لوزارة الحج)',
        shortHeader: 'حالة السداد',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => getPilgrimPaymentDeclaration(p).label,
      },
      {
        key: 'paymentDeclarationDate',
        label: 'تاريخ السداد',
        shortHeader: 'تاريخ السداد',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => getPilgrimPaymentDeclaration(p).formattedDate || '—',
      },
    ];
  } else if (rosterType === 'marjiList') {
    specificColumns = [
      {
        key: 'previousMarji',
        label: 'المرجع السابق',
        shortHeader: 'المرجع السابق',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => (p.previousMarji || '').trim() || '—',
      },
      {
        key: 'hajjType',
        label: 'نوع الحج (تمتع / إفراد / قِران / مستحب)',
        shortHeader: 'نوع الحج',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => (p.hajjType || '').trim() || '—',
      },
    ];
  } else if (rosterType === 'paymentsList') {
    specificColumns = [
      {
        key: 'paidAmount',
        label: 'المبلغ المدفوع',
        shortHeader: 'المبلغ المدفوع',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const amt = ctx.getPilgrimPaidAmount
            ? ctx.getPilgrimPaidAmount(p)
            : Number(String(p.paidAmount || '').replace(/[^0-9.]/g, '')) || 0;
          return `${amt.toLocaleString('en-US')} ريال`;
        },
      },
      {
        key: 'paymentDeclarationStatus',
        label: 'حالة السداد (لوزارة الحج)',
        shortHeader: 'حالة السداد',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => getPilgrimPaymentDeclaration(p).label,
      },
      {
        key: 'paymentDeclarationDate',
        label: 'تاريخ السداد',
        shortHeader: 'تاريخ السداد',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => getPilgrimPaymentDeclaration(p).formattedDate || '—',
      },
      {
        key: 'vaccinationStatus',
        label: 'حالة التطعيم',
        shortHeader: 'حالة التطعيم',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => getPilgrimVaccinationDeclaration(p).label,
      },
      {
        key: 'vaccinationDate',
        label: 'تاريخ التطعيم',
        shortHeader: 'تاريخ التطعيم',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => getPilgrimVaccinationDeclaration(p).formattedDate || '—',
      },
      {
        key: 'expectedPrice',
        label: 'سعر الباقة / المستحق',
        shortHeader: 'المستحق للباقة',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => {
          const price = ctx.getPilgrimExpectedPrice
            ? ctx.getPilgrimExpectedPrice(p)
            : Number(String(p.totalPackagePrice || '').replace(/[^0-9.]/g, '')) || 0;
          return price > 0 ? `${price.toLocaleString('en-US')} ريال` : '—';
        },
      },
      {
        key: 'bankName',
        label: 'اسم البنك',
        shortHeader: 'اسم البنك',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => (p.bankName || '').trim() || '—',
      },
      {
        key: 'iban',
        label: 'رقم الآيبان (IBAN)',
        shortHeader: 'رقم الآيبان (IBAN)',
        group: 'specific',
        defaultEnabled: false,
        isTextProtected: true,
        isLtr: true,
        getValue: (p) => (p.iban || '').trim() || '—',
      },
      {
        key: 'paymentRefDate',
        label: 'تاريخ السداد ورقم الحوالة',
        shortHeader: 'تاريخ / رقم الحوالة',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => {
          const parts = [p.paymentReceiptDate?.trim(), p.bankReferenceNumber?.trim()].filter(Boolean);
          return parts.length > 0 ? parts.join(' • ') : '—';
        },
      },
    ];
  }

  // Order cleanly: fullName first, then nationalId/mobile, then domain-specific fields, then remaining shared fields, with signatureNotes always last!
  const firstSharedKeys = new Set(['fullName', 'nationalId', 'mobile']);
  const leadingShared = sharedColumns.filter((c) => firstSharedKeys.has(c.key));
  const trailingShared = sharedColumns.filter(
    (c) => !firstSharedKeys.has(c.key) && c.key !== 'signatureNotes'
  );
  const signatureCol = sharedColumns.filter((c) => c.key === 'signatureNotes');

  return [...leadingShared, ...specificColumns, ...trailingShared, ...signatureCol];
}
