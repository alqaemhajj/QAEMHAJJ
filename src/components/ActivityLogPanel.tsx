import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import {
  Shield,
  ShieldCheck,
  Search,
  FileSpreadsheet,
  Printer,
  Calendar,
  Clock,
  ChevronRight,
  ChevronLeft,
  RotateCw,
  Loader2,
  X,
  Filter,
} from 'lucide-react';
import { ActivityLog, AdminUser } from '../types';
import {
  getLocalDateString,
  getCachedActivityLogs,
  getActivityLogsDayCount,
  fetchActivityLogsPageByDate,
  fetchAllActivityLogsForDate,
} from '../lib/db';
import { exportAlQaemExcelReport, AlQaemExcelSummaryItem } from '../utils/alqaemExcelEngine';

const PAGE_SIZE = 100;

export interface OfficialActivityPdfPayload {
  title: string;
  subtitle?: string;
  category?: string;
  filterSummary?: string;
  columns: string[];
  data: (string | number)[][];
  summaryCards?: AlQaemExcelSummaryItem[];
  filename: string;
  onExportExcel?: () => void;
  signatureRightLabel?: string;
}

interface ActivityLogPanelProps {
  adminUsers: AdminUser[];
  currentAdminUser: AdminUser | null;
  onTodayCountChange?: (count: number) => void;
  onOpenPdfReport?: (payload: OfficialActivityPdfPayload) => void;
}

function shiftDateStr(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalDateString(dt);
}

function formatArabicDateLabel(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return dt.toLocaleDateString('ar-SA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getVisiblePageNumbers(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) pages.push('ellipsis');
  for (let p = start; p <= end; p++) {
    pages.push(p);
  }
  if (end < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);
  return pages;
}

function getCategoryBadgeStyle(cat?: string): string {
  switch (cat) {
    case 'الأمان والمصادقة':
      return 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/40';
    case 'تصدير الكشوفات والتقارير':
      return 'bg-cyan-50 dark:bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border-cyan-300 dark:border-cyan-500/40';
    case 'تسجيل دخول / خروج':
      return 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30';
    case 'المالية والإيصالات':
      return 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-200 dark:border-amber-500/30';
    case 'إدارة الحجاج':
      return 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30';
    case 'الباقات والإعلانات':
      return 'bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/30';
    case 'المشرفين والإعدادات':
      return 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30';
    default:
      return 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30';
  }
}

function matchesActivityFilters(
  log: ActivityLog,
  searchQuery: string,
  categoryFilter: string,
  userFilter: string
): boolean {
  const q = searchQuery.trim().toLowerCase();
  const matchesQuery =
    !q ||
    (log.adminName && log.adminName.toLowerCase().includes(q)) ||
    (log.username && log.username.toLowerCase().includes(q)) ||
    (log.action && log.action.toLowerCase().includes(q)) ||
    (log.target && log.target.toLowerCase().includes(q)) ||
    (log.details && log.details.toLowerCase().includes(q)) ||
    (log.previousValue && log.previousValue.toLowerCase().includes(q)) ||
    (log.newValue && log.newValue.toLowerCase().includes(q));

  const matchesCategory = categoryFilter === 'all' || log.category === categoryFilter;
  const matchesUser = userFilter === 'all' || log.adminName === userFilter;

  return Boolean(matchesQuery && matchesCategory && matchesUser);
}

function mergeLocalTodayLogs(remoteLogs: ActivityLog[], dateStr: string): ActivityLog[] {
  const localToday = (getCachedActivityLogs() as ActivityLog[]).filter(
    (l) => (l?.date || (typeof l?.timestamp === 'string' ? l.timestamp.split('T')[0] : '')) === dateStr
  );
  if (localToday.length === 0) return remoteLogs;

  const map = new Map<string, ActivityLog>();
  for (const item of remoteLogs) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of localToday) {
    if (item?.id && !map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values())
    .sort((a, b) =>
      String(b.timestamp || b.date || '').localeCompare(String(a.timestamp || a.date || ''))
    );
}

export const ActivityLogPanel: React.FC<ActivityLogPanelProps> = ({
  adminUsers,
  currentAdminUser,
  onTodayCountChange,
  onOpenPdfReport,
}) => {
  const todayDateStr = getLocalDateString();

  // Filters & Date State (Defaults to TODAY only!)
  const [selectedDate, setSelectedDate] = useState<string>(todayDateStr);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');

  // Pagination & Server-Side Query State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageLogs, setPageLogs] = useState<ActivityLog[]>([]);
  const [dayTotalCount, setDayTotalCount] = useState<number>(0);
  const [filteredTotalCount, setFilteredTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<'excel' | 'pdf' | null>(null);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);

  // Refs for cursor-based server-side pagination & single-day filter cache
  const pageCursorsRef = useRef<Map<number, QueryDocumentSnapshot<DocumentData>>>(new Map());
  const fullDayCacheRef = useRef<{ dateStr: string; items: ActivityLog[] } | null>(null);
  const requestIdRef = useRef<number>(0);
  const tableTopRef = useRef<HTMLDivElement | null>(null);

  const hasActiveFilter = Boolean(
    searchQuery.trim() || categoryFilter !== 'all' || userFilter !== 'all'
  );
  const isTodaySelected = selectedDate === todayDateStr;

  // Reset cursors & day cache when the selected date or manual refresh changes
  const resetDateCaches = useCallback(() => {
    pageCursorsRef.current.clear();
    fullDayCacheRef.current = null;
  }, []);

  // Auto-reset pagination to Page 1 whenever date or any filter changes
  const handleDateChange = (nextDate: string) => {
    if (!nextDate) return;
    const clamped = nextDate > todayDateStr ? todayDateStr : nextDate;
    resetDateCaches();
    setSelectedDate(clamped);
    setCurrentPage(1);
  };

  const handleReturnToToday = () => {
    resetDateCaches();
    setSelectedDate(todayDateStr);
    setCurrentPage(1);
    setRefreshNonce((n) => n + 1);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleCategoryChange = (val: string) => {
    setCategoryFilter(val);
    setCurrentPage(1);
  };

  const handleUserChange = (val: string) => {
    setUserFilter(val);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setUserFilter('all');
    setCurrentPage(1);
  };

  const handleManualRefresh = () => {
    resetDateCaches();
    setRefreshNonce((n) => n + 1);
  };

  // Listen for live local activity logs when viewing today
  useEffect(() => {
    const onLocalActivity = () => {
      if (selectedDate === getLocalDateString()) {
        resetDateCaches();
        setRefreshNonce((n) => n + 1);
      }
    };
    window.addEventListener('qaem-activity-logged', onLocalActivity);
    return () => window.removeEventListener('qaem-activity-logged', onLocalActivity);
  }, [selectedDate, resetDateCaches]);

  // Core server-side query loader (Single day, 100 docs/page via Firestore cursors)
  useEffect(() => {
    const currentReqId = ++requestIdRef.current;
    let cancelled = false;

    const loadData = async () => {
      setIsLoading(true);
      try {
        if (!hasActiveFilter) {
          // Pure server-side mode: fetch exact day count (1 aggregation read) + ONLY 100 docs for currentPage!
          const countPromise =
            currentPage === 1 || dayTotalCount === 0
              ? getActivityLogsDayCount(selectedDate)
              : Promise.resolve(dayTotalCount);

          // Resolve cursor for target page
          let cursorToUse: QueryDocumentSnapshot<DocumentData> | null = null;
          if (currentPage > 1) {
            cursorToUse = pageCursorsRef.current.get(currentPage - 1) || null;
            // If user jumped directly to a later page without visiting intermediate pages, walk cursors cleanly
            if (!cursorToUse) {
              let highestCachedPage = 0;
              pageCursorsRef.current.forEach((_, pNum) => {
                if (pNum < currentPage && pNum > highestCachedPage) {
                  highestCachedPage = pNum;
                }
              });
              let stepCursor =
                highestCachedPage > 0
                  ? pageCursorsRef.current.get(highestCachedPage) || null
                  : null;
              for (let stepPage = highestCachedPage + 1; stepPage < currentPage; stepPage++) {
                const stepRes = await fetchActivityLogsPageByDate<ActivityLog>({
                  dateStr: selectedDate,
                  pageSize: PAGE_SIZE,
                  cursor: stepCursor,
                });
                if (cancelled || currentReqId !== requestIdRef.current) return;
                if (stepRes.lastDoc) {
                  pageCursorsRef.current.set(stepPage, stepRes.lastDoc);
                  stepCursor = stepRes.lastDoc;
                } else {
                  stepCursor = null;
                  break;
                }
              }
              cursorToUse = stepCursor;
            }
          }

          const [serverCount, pageRes] = await Promise.all([
            countPromise,
            fetchActivityLogsPageByDate<ActivityLog>({
              dateStr: selectedDate,
              pageSize: PAGE_SIZE,
              cursor: cursorToUse,
            }),
          ]);

          if (cancelled || currentReqId !== requestIdRef.current) return;

          if (pageRes.lastDoc) {
            pageCursorsRef.current.set(currentPage, pageRes.lastDoc);
          }

          let items = pageRes.items;
          let resolvedTotal = serverCount;

          // On Page 1 of Today, merge any ultra-fresh local log that hasn't finished indexing yet
          if (selectedDate === getLocalDateString() && currentPage === 1) {
            const merged = mergeLocalTodayLogs(items, selectedDate);
            const extraCount = Math.max(0, merged.length - items.length);
            items = merged.slice(0, PAGE_SIZE);
            resolvedTotal = Math.max(serverCount + extraCount, items.length);
          } else {
            const minCountFromPage = (currentPage - 1) * PAGE_SIZE + items.length;
            resolvedTotal = Math.max(serverCount, minCountFromPage);
          }

          setPageLogs(items);
          setDayTotalCount(resolvedTotal);
          setFilteredTotalCount(resolvedTotal);

          if (selectedDate === getLocalDateString() && onTodayCountChange) {
            onTodayCountChange(resolvedTotal);
          }
        } else {
          // Filtered mode (strictly scoped to the single selectedDate!)
          let allDayItems: ActivityLog[];
          if (fullDayCacheRef.current && fullDayCacheRef.current.dateStr === selectedDate) {
            allDayItems = fullDayCacheRef.current.items;
          } else {
            const fetchedDay = await fetchAllActivityLogsForDate<ActivityLog>(selectedDate);
            if (cancelled || currentReqId !== requestIdRef.current) return;
            allDayItems =
              selectedDate === getLocalDateString()
                ? mergeLocalTodayLogs(fetchedDay, selectedDate)
                : fetchedDay;
            fullDayCacheRef.current = { dateStr: selectedDate, items: allDayItems };
          }

          const matched = allDayItems.filter((log) =>
            matchesActivityFilters(log, searchQuery, categoryFilter, userFilter)
          );
          const totalMatched = matched.length;
          const maxPage = Math.max(1, Math.ceil(totalMatched / PAGE_SIZE));
          const safePage = Math.min(currentPage, maxPage);
          const startIdx = (safePage - 1) * PAGE_SIZE;

          setDayTotalCount(allDayItems.length);
          setFilteredTotalCount(totalMatched);
          setPageLogs(matched.slice(startIdx, startIdx + PAGE_SIZE));

          if (selectedDate === getLocalDateString() && onTodayCountChange) {
            onTodayCountChange(allDayItems.length);
          }
        }
      } finally {
        if (!cancelled && currentReqId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, currentPage, searchQuery, categoryFilter, userFilter, refreshNonce]);

  // Unique users dropdown combines official campaign staff + users present in loaded logs
  const uniqueUsers = useMemo(() => {
    const names = new Set<string>();
    adminUsers.forEach((u) => {
      const label = (u.fullName || u.username || '').trim();
      if (label) names.add(label);
    });
    pageLogs.forEach((l) => {
      if (l.adminName) names.add(l.adminName);
    });
    if (fullDayCacheRef.current?.dateStr === selectedDate) {
      fullDayCacheRef.current.items.forEach((l) => {
        if (l.adminName) names.add(l.adminName);
      });
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [adminUsers, pageLogs, selectedDate]);

  // Stats for displayed day/page
  const effectiveTotal = hasActiveFilter ? filteredTotalCount : dayTotalCount;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / PAGE_SIZE));
  const rangeStart = effectiveTotal === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd =
    effectiveTotal === 0 ? 0 : Math.min(effectiveTotal, (currentPage - 1) * PAGE_SIZE + pageLogs.length);

  const visibleLoginsCount = useMemo(
    () =>
      pageLogs.filter(
        (l) => l.category === 'تسجيل دخول / خروج' || l.action?.includes('دخول')
      ).length,
    [pageLogs]
  );

  const activeUsersInView = useMemo(
    () => new Set(pageLogs.map((l) => l.adminName).filter(Boolean)).size,
    [pageLogs]
  );

  const goToPage = (targetPage: number, shouldScrollTop = false) => {
    const clamped = Math.max(1, Math.min(totalPages, targetPage));
    if (clamped === currentPage) return;
    setCurrentPage(clamped);
    if (shouldScrollTop && tableTopRef.current) {
      tableTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Resolve full matching logs strictly for the selectedDate & active filters for Excel / PDF Export
  const resolveLogsForExport = async (): Promise<ActivityLog[]> => {
    if (!hasActiveFilter && currentPage === 1 && dayTotalCount <= pageLogs.length && pageLogs.length > 0) {
      return pageLogs;
    }

    let allDayItems: ActivityLog[];
    if (fullDayCacheRef.current && fullDayCacheRef.current.dateStr === selectedDate) {
      allDayItems = fullDayCacheRef.current.items;
    } else {
      const fetched = await fetchAllActivityLogsForDate<ActivityLog>(selectedDate);
      allDayItems =
        selectedDate === getLocalDateString()
          ? mergeLocalTodayLogs(fetched, selectedDate)
          : fetched;
      fullDayCacheRef.current = { dateStr: selectedDate, items: allDayItems };
    }

    if (!hasActiveFilter) return allDayItems;
    return allDayItems.filter((log) =>
      matchesActivityFilters(log, searchQuery, categoryFilter, userFilter)
    );
  };

  const buildFilterSummaryText = () => {
    const parts: string[] = [`التاريخ: ${selectedDate}`];
    if (categoryFilter !== 'all') parts.push(`التصنيف: ${categoryFilter}`);
    if (userFilter !== 'all') parts.push(`المستخدم: ${userFilter}`);
    if (searchQuery.trim()) parts.push(`بحث: "${searchQuery.trim()}"`);
    return parts.join(' • ');
  };

  const formatLogRowForReport = (l: ActivityLog, idx: number): (string | number)[] => {
    const d = l.date || (l.timestamp ? l.timestamp.split('T')[0] : selectedDate);
    const t =
      l.time ||
      (l.timestamp && l.timestamp.includes('T')
        ? new Date(l.timestamp).toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          })
        : '—');
    return [
      idx + 1,
      l.adminName || '—',
      l.username || l.adminId || '—',
      l.userRole || 'مشرف',
      l.category || 'عام',
      l.action || '—',
      l.target || '—',
      l.details || '—',
      d,
      t,
    ];
  };

  const EXPORT_HEADERS = [
    'التسلسل',
    'اسم المستخدم / المشرف',
    'المعرف / البريد',
    'الدور الوظيفي',
    'تصنيف العملية',
    'النشاط الذي قام به',
    'الهدف / السجل المتأثر',
    'تفاصيل إضافية',
    'تاريخ العملية',
    'وقت التنفيذ',
  ];

  const handleExportExcel = async () => {
    if (effectiveTotal === 0 || isExporting) return;
    setIsExporting('excel');
    try {
      const exportItems = await resolveLogsForExport();
      if (exportItems.length === 0) return;

      const rows = exportItems.map((l, idx) => formatLogRowForReport(l, idx));
      await exportAlQaemExcelReport({
        reportTitle: `سجل النشاطات والرقابة الإدارية — يوم ${selectedDate}`,
        subtitle: `السجل الرقابي الموحد (${buildFilterSummaryText()})`,
        category: 'تقارير المشرفين والإشراف والرقابة',
        filename: `سجل_النشاطات_والرقابة_${selectedDate}`,
        columns: EXPORT_HEADERS,
        rows,
        generatedBy: currentAdminUser?.fullName || 'الإدارة العامة',
        summaryCards: [
          { label: 'التاريخ المحدد', value: selectedDate },
          { label: 'إجمالي العمليات المطابقة', value: `${exportItems.length} نشاط` },
          { label: 'إجمالي أنشطة اليوم', value: `${Math.max(dayTotalCount, exportItems.length)} نشاط` },
        ],
      });
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportPdf = async () => {
    if (effectiveTotal === 0 || isExporting || !onOpenPdfReport) return;
    setIsExporting('pdf');
    try {
      const exportItems = await resolveLogsForExport();
      if (exportItems.length === 0) return;

      const pdfColumns = [
        '#',
        'المستخدم / المشرف',
        'الدور',
        'التصنيف',
        'النشاط',
        'الهدف / التفاصيل',
        'التاريخ',
        'الوقت',
      ];
      const pdfRows = exportItems.map((l, idx) => {
        const d = l.date || (l.timestamp ? l.timestamp.split('T')[0] : selectedDate);
        const t =
          l.time ||
          (l.timestamp && l.timestamp.includes('T')
            ? new Date(l.timestamp).toLocaleTimeString('ar-SA', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
              })
            : '—');
        const targetAndDetails = [l.target, l.details].filter(Boolean).join(' — ') || '—';
        return [
          idx + 1,
          l.adminName || '—',
          l.userRole || 'مشرف',
          l.category || 'عام',
          l.action || '—',
          targetAndDetails,
          d,
          t,
        ];
      });

      onOpenPdfReport({
        title: `تقرير سجل النشاطات والرقابة الإدارية — يوم ${selectedDate}`,
        subtitle: `توثيق رقابي رسمي لأنشطة المشرفين والنظام خلال يوم ${formatArabicDateLabel(selectedDate)}`,
        category: 'تقارير المشرفين والإشراف والرقابة',
        filterSummary: buildFilterSummaryText(),
        columns: pdfColumns,
        data: pdfRows,
        filename: `سجل_النشاطات_والرقابة_${selectedDate}`,
        signatureRightLabel: 'مشرف الرقابة والمتابعة',
        summaryCards: [
          { label: 'التاريخ المحدد', value: selectedDate },
          { label: 'إجمالي العمليات بالتقرير', value: `${exportItems.length} نشاط` },
          { label: 'إجمالي أنشطة اليوم', value: `${Math.max(dayTotalCount, exportItems.length)} نشاط` },
        ],
        onExportExcel: () => {
          void handleExportExcel();
        },
      });
    } finally {
      setIsExporting(null);
    }
  };

  const renderPaginationBar = (position: 'top' | 'bottom') => {
    const pages = getVisiblePageNumbers(currentPage, totalPages);

    return (
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3.5 bg-slate-50/90 dark:bg-slate-950/70 ${
          position === 'top'
            ? 'border-b border-slate-200 dark:border-slate-800'
            : 'border-t border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="text-xs font-bold text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-1.5">
          {effectiveTotal > 0 ? (
            <>
              <span>عرض</span>
              <span className="font-mono font-black text-slate-900 dark:text-white">{rangeStart}</span>
              <span>إلى</span>
              <span className="font-mono font-black text-slate-900 dark:text-white">{rangeEnd}</span>
              <span>من أصل</span>
              <span className="font-mono font-black text-amber-700 dark:text-amber-400">
                {effectiveTotal}
              </span>
              <span>نشاطاً في هذا اليوم — صفحة</span>
              <span className="font-mono font-black text-slate-900 dark:text-white">{currentPage}</span>
              <span>من</span>
              <span className="font-mono font-black text-slate-900 dark:text-white">{totalPages}</span>
            </>
          ) : (
            <span>لا توجد نتائج معروضة لهذا اليوم</span>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center flex-wrap gap-1.5 justify-end">
            <button
              type="button"
              disabled={currentPage <= 1 || isLoading}
              onClick={() => goToPage(currentPage - 1, position === 'bottom')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-amber-500/60 hover:text-amber-700 dark:hover:text-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              <span>السابق</span>
            </button>

            <div className="flex items-center gap-1">
              {pages.map((p, idx) =>
                p === 'ellipsis' ? (
                  <span
                    key={`ell-${idx}`}
                    className="px-2 py-1 text-xs font-bold text-slate-400 select-none"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    disabled={isLoading}
                    onClick={() => goToPage(p, position === 'bottom')}
                    className={`min-w-[32px] h-8 px-2 rounded-xl text-xs font-mono font-black border transition cursor-pointer ${
                      p === currentPage
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-amber-500/60 hover:text-amber-700 dark:hover:text-amber-400'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            </div>

            <button
              type="button"
              disabled={currentPage >= totalPages || isLoading}
              onClick={() => goToPage(currentPage + 1, position === 'bottom')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-amber-500/60 hover:text-amber-700 dark:hover:text-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <span>التالي</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-fadeIn" dir="rtl">
      {/* رأس سجل الرقابة مع شريط إحصائيات اليوم المحدد */}
      <div className="bg-gradient-to-r from-blue-500/10 via-emerald-500/10 to-amber-500/10 border border-blue-300/60 dark:border-blue-500/30 rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-500 shrink-0 shadow-sm">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
              <span>سجل الرقابة والتتبع الأمني (Audit Log)</span>
              <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-amber-500 text-slate-950">
                حصري للمالك الرئيسي • توثيق فوري غير قابل للتعديل
              </span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed max-w-2xl">
              يرصد تلقائياً محاولات الدخول والـ 2FA والحظر المؤقت، الدفعات المالية، حذف الحجوزات، وتصدير كشوفات Excel/PDF مع اسم الموظف والتاريخ والوقت بدقة.
            </p>
          </div>
        </div>

        <div className="w-full lg:w-auto flex items-center justify-end">
          <div className="bg-white/90 dark:bg-slate-900/85 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex items-center justify-around sm:justify-start gap-3 sm:gap-4 shadow-sm w-full sm:w-auto">
            <div className="text-right">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-bold">
                إجمالي اليوم
              </span>
              <strong className="text-sm font-black font-mono text-slate-900 dark:text-white">
                {dayTotalCount} نشاط
              </strong>
            </div>
            <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
            <div className="text-right">
              <span className="text-[11px] text-emerald-600 dark:text-emerald-500 block font-bold">
                دخول وخروج
              </span>
              <strong className="text-sm font-black font-mono text-emerald-700 dark:text-emerald-400">
                {visibleLoginsCount}
              </strong>
            </div>
            <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
            <div className="text-right">
              <span className="text-[11px] text-amber-600 dark:text-amber-500 block font-bold">
                المستخدمون
              </span>
              <strong className="text-sm font-black font-mono text-amber-700 dark:text-amber-400">
                {activeUsersInView}
              </strong>
            </div>
            <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
            <div className="text-right">
              <span className="text-[11px] text-purple-600 dark:text-purple-400 block font-bold">
                الصفحات
              </span>
              <strong className="text-sm font-black font-mono text-purple-700 dark:text-purple-400">
                {currentPage} / {totalPages}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* شريط الفلاتر العلوي + أداة التقويم + أزرار التصدير */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-500 shrink-0" />
              <span>سجل النشاطات والرقابة الشامل (Audit & Activity Log)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              اختر أي تاريخ من التقويم لاستعراض أنشطة ذلك اليوم المحدد، أو استخدم البحث والتصنيف والتصدير الفوري
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isLoading}
              title="تحديث سجل اليوم"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={effectiveTotal === 0 || isExporting !== null}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs shadow transition cursor-pointer"
            >
              {isExporting === 'excel' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              <span>تصدير Excel</span>
            </button>

            {onOpenPdfReport && (
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={effectiveTotal === 0 || isExporting !== null}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs shadow transition cursor-pointer"
              >
                {isExporting === 'pdf' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Printer className="w-4 h-4" />
                )}
                <span>تصدير PDF / طباعة</span>
              </button>
            )}
          </div>
        </div>

        {/* صف أدوات الفلترة: التقويم + اختصار اليوم + البحث + التصنيف + المستخدم */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 gap-3">
          {/* أداة اختيار التاريخ (Date Picker) + أسهم اليوم السابق/التالي + زر اختصار "أنشطة اليوم" */}
          <div className="sm:col-span-2 xl:col-span-5 flex flex-wrap sm:flex-nowrap items-center gap-2">
            <div className="flex items-center flex-1 min-w-[200px] bg-slate-50 dark:bg-slate-950 border border-amber-300 dark:border-amber-500/40 rounded-xl px-2 py-1 gap-1.5">
              <button
                type="button"
                onClick={() => handleDateChange(shiftDateStr(selectedDate, -1))}
                title="اليوم السابق"
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="relative flex items-center flex-1 min-w-0">
                <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 ml-1.5 pointer-events-none" />
                <input
                  type="date"
                  value={selectedDate}
                  max={todayDateStr}
                  onChange={(e) => handleDateChange(e.target.value)}
                  aria-label="اختيار تاريخ سجل النشاطات"
                  className="w-full bg-transparent text-xs font-mono font-black text-slate-900 dark:text-white focus:outline-none py-1.5 cursor-pointer"
                  dir="ltr"
                />
              </div>

              <button
                type="button"
                disabled={isTodaySelected}
                onClick={() => handleDateChange(shiftDateStr(selectedDate, 1))}
                title="اليوم التالي"
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-35 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleReturnToToday}
              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-black border transition shrink-0 cursor-pointer ${
                isTodaySelected
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 shadow-sm'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>أنشطة اليوم</span>
            </button>
          </div>

          {/* مربع البحث */}
          <div className="xl:col-span-3 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="ابحث بالمستخدم، النشاط، أو الحاج..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl pr-10 pl-8 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-amber-500 focus:outline-none transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute left-2.5 top-2.5 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="مسح البحث"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* قائمة التصنيف */}
          <div className="xl:col-span-2">
            <select
              value={categoryFilter}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white font-bold focus:border-amber-500 focus:outline-none transition"
            >
              <option value="all">جميع التصنيفات</option>
              <option value="الأمان والمصادقة">الأمان والمصادقة (2FA والحظر)</option>
              <option value="تصدير الكشوفات والتقارير">تصدير الكشوفات والتقارير (Excel / PDF)</option>
              <option value="تسجيل دخول / خروج">تسجيل دخول / خروج</option>
              <option value="المالية والإيصالات">المالية والإيصالات</option>
              <option value="إدارة الحجاج">إدارة الحجاج والحجوزات</option>
              <option value="الباقات والإعلانات">الباقات والإعلانات</option>
              <option value="المشرفين والإعدادات">المشرفين والإعدادات</option>
              <option value="بوابة الحاج والتسجيل">بوابة الحاج والتسجيل</option>
            </select>
          </div>

          {/* قائمة المستخدمين */}
          <div className="xl:col-span-2">
            <select
              value={userFilter}
              onChange={(e) => handleUserChange(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white font-bold focus:border-amber-500 focus:outline-none transition"
            >
              <option value="all">جميع المستخدمين</option>
              {uniqueUsers.map((uName) => (
                <option key={uName} value={uName}>
                  {uName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* شريط ملخص اليوم المعروض */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 rounded-2xl bg-amber-50/70 dark:bg-slate-950/90 border border-amber-200/80 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`px-2.5 py-0.5 rounded-lg text-[11px] font-black border ${
                isTodaySelected
                  ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                  : 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/30'
              }`}
            >
              {isTodaySelected ? 'اليوم الحالي' : 'تاريخ سابق'}
            </span>

            <span className="font-black text-slate-900 dark:text-white">
              أنشطة يوم{' '}
              <span className="font-mono text-amber-700 dark:text-amber-400" dir="ltr">
                {selectedDate}
              </span>
              <span className="text-slate-500 dark:text-slate-400 font-semibold mr-1.5 hidden sm:inline">
                ({formatArabicDateLabel(selectedDate)})
              </span>
            </span>

            <span className="text-slate-300 dark:text-slate-700">—</span>

            <span className="font-black text-slate-800 dark:text-slate-100">
              الإجمالي:{' '}
              <strong className="font-mono text-amber-700 dark:text-amber-400">
                {dayTotalCount}
              </strong>{' '}
              نشاطاً
            </span>

            {hasActiveFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 font-bold text-[11px]">
                <Filter className="w-3 h-3" />
                <span>المطابق للفلتر: {filteredTotalCount} نشاطاً</span>
              </span>
            )}
          </div>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>مسح الفلاتر</span>
            </button>
          )}
        </div>
      </div>

      {/* قائمة سجل النشاطات والرقابة (شريط ترقيم علوي + بطاقات للجوال + جدول مضبوط الأعمدة + شريط ترقيم سفلي) */}
      <div
        ref={tableTopRef}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden"
      >
        {/* شريط الترقيم العلوي */}
        {renderPaginationBar('top')}

        {isLoading ? (
          <div className="px-6 py-16 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
            <Loader2 className="w-7 h-7 text-amber-500 animate-spin" />
            <p className="text-xs font-bold">
              جاري جلب أنشطة يوم <span className="font-mono">{selectedDate}</span> (صفحة {currentPage})...
            </p>
          </div>
        ) : (
          <>
            {/* عرض البطاقات المتجاوب للجوال */}
            <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
              {pageLogs.map((log) => {
                const dateDisplay =
                  log.date || (log.timestamp ? log.timestamp.split('T')[0] : selectedDate);
                const timeDisplay =
                  log.time ||
                  (log.timestamp && log.timestamp.includes('T')
                    ? new Date(log.timestamp).toLocaleTimeString('ar-SA', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true,
                      })
                    : '—');

                return (
                  <div key={log.id} className="p-4 sm:p-5 space-y-3 text-right">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-black text-slate-900 dark:text-white text-sm truncate">
                          {log.adminName || 'مستخدم النظام'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate" dir="ltr">
                          {log.username || log.adminId}
                        </div>
                        {log.userRole && (
                          <span className="inline-block mt-1 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md">
                            {log.userRole}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${getCategoryBadgeStyle(
                            log.category
                          )}`}
                        >
                          {log.category || 'نشاط إداري'}
                        </span>
                        <div className="text-[11px] font-mono font-bold text-amber-700 dark:text-amber-400 mt-1" dir="ltr">
                          {dateDisplay}
                        </div>
                        <div className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1" dir="ltr">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>{timeDisplay}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-950/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 space-y-1.5">
                      <div className="text-xs font-black text-slate-900 dark:text-white leading-relaxed">
                        النشاط: {log.action}
                      </div>
                      <div className="text-xs text-amber-700 dark:text-amber-400 font-bold break-words">
                        {log.target}
                      </div>
                      {(log.previousValue || log.newValue) && (
                        <div className="grid grid-cols-1 gap-1.5 pt-1.5 border-t border-slate-200/60 dark:border-slate-800 text-[11px]">
                          {log.previousValue && (
                            <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300 px-2.5 py-1.5 rounded-lg break-words">
                              <span className="font-black">القيمة السابقة: </span>
                              {log.previousValue}
                            </div>
                          )}
                          {log.newValue && (
                            <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2.5 py-1.5 rounded-lg break-words">
                              <span className="font-black">القيمة الجديدة: </span>
                              {log.newValue}
                            </div>
                          )}
                        </div>
                      )}
                      {log.details && (
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-words pt-1 border-t border-slate-200/60 dark:border-slate-800">
                          {log.details}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {pageLogs.length === 0 && (
                <div className="px-6 py-14 text-center space-y-2">
                  <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    {hasActiveFilter
                      ? `لا توجد نشاطات تطابق الفلتر المحدد في يوم ${selectedDate}`
                      : `لا توجد نشاطات مسجلة في يوم ${selectedDate}`}
                  </p>
                  <p className="text-xs text-slate-400">
                    يمكنك اختيار تاريخ آخر من التقويم أعلاه أو العودة لأنشطة اليوم.
                  </p>
                </div>
              )}
            </div>

            {/* عرض الجدول الكامل للشاشات الكبيرة — مضبوط الأعمدة لضمان ظهور عمود الوقت كاملاً بوضوح */}
            <div className="hidden md:block w-full overflow-x-auto">
              <table className="w-full min-w-[920px] table-auto text-sm text-right text-slate-600 dark:text-slate-400">
                <thead className="bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3.5 py-3.5 whitespace-nowrap font-black">المستخدم / المشرف</th>
                    <th className="px-3 py-3.5 whitespace-nowrap font-black">الدور</th>
                    <th className="px-3 py-3.5 whitespace-nowrap font-black">التصنيف</th>
                    <th className="px-3.5 py-3.5 min-w-[200px] font-black">النشاط الذي قام به</th>
                    <th className="px-3.5 py-3.5 min-w-[175px] font-black">الهدف / التفاصيل</th>
                    <th className="px-3 py-3.5 whitespace-nowrap font-black min-w-[105px]">التاريخ</th>
                    <th className="pr-3 pl-5 py-3.5 whitespace-nowrap font-black min-w-[125px]">وقت التنفيذ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {pageLogs.map((log) => {
                    const dateDisplay =
                      log.date || (log.timestamp ? log.timestamp.split('T')[0] : selectedDate);
                    const timeDisplay =
                      log.time ||
                      (log.timestamp && log.timestamp.includes('T')
                        ? new Date(log.timestamp).toLocaleTimeString('ar-SA', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: true,
                          })
                        : '—');

                    return (
                      <tr
                        key={log.id}
                        className={`transition align-top ${
                          log.severity === 'critical'
                            ? 'bg-rose-50/70 dark:bg-rose-950/20 hover:bg-rose-100/60 dark:hover:bg-rose-950/35'
                            : log.severity === 'warning'
                            ? 'bg-amber-50/50 dark:bg-amber-950/15 hover:bg-amber-100/50 dark:hover:bg-amber-950/25'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <td className="px-3.5 py-3.5 max-w-[175px]">
                          <div className="font-bold text-slate-900 dark:text-white text-xs sm:text-[13px] truncate" title={log.adminName}>
                            {log.adminName || 'مستخدم النظام'}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate" dir="ltr" title={log.username || log.adminId}>
                            {log.username || log.adminId}
                          </div>
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                            {log.userRole || 'مشرف'}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${getCategoryBadgeStyle(
                              log.category
                            )}`}
                          >
                            {log.category || 'إداري'}
                          </span>
                        </td>
                        <td className="px-3.5 py-3.5 min-w-[200px] max-w-[280px]">
                          <p className="font-bold text-slate-900 dark:text-white text-xs sm:text-[13px] whitespace-pre-wrap break-words leading-relaxed">
                            {log.action}
                          </p>
                        </td>
                        <td className="px-3.5 py-3.5 min-w-[175px] max-w-[260px]">
                          <p className="text-xs font-bold text-amber-700 dark:text-amber-400 break-words">
                            {log.target}
                          </p>
                          {(log.previousValue || log.newValue) && (
                            <div className="mt-1.5 space-y-1 text-[11px]">
                              {log.previousValue && (
                                <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300 px-2 py-1 rounded-md break-words">
                                  <span className="font-black">القيمة السابقة: </span>
                                  {log.previousValue}
                                </div>
                              )}
                              {log.newValue && (
                                <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-md break-words">
                                  <span className="font-black">القيمة الجديدة: </span>
                                  {log.newValue}
                                </div>
                              )}
                            </div>
                          )}
                          {log.details && (
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-wrap break-words">
                              {log.details}
                            </p>
                          )}
                        </td>
                        <td
                          className="px-3 py-3.5 whitespace-nowrap font-mono text-xs font-bold text-slate-700 dark:text-slate-200"
                          dir="ltr"
                        >
                          {dateDisplay}
                        </td>
                        <td
                          className="pr-3 pl-5 py-3.5 whitespace-nowrap font-mono text-xs text-emerald-700 dark:text-emerald-400 font-bold"
                          dir="ltr"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>{timeDisplay}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {pageLogs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-14 text-center space-y-2">
                        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                          {hasActiveFilter
                            ? `لا توجد نشاطات تطابق معايير البحث والفلترة في يوم ${selectedDate}`
                            : `لا توجد نشاطات مسجلة في يوم ${selectedDate}`}
                        </p>
                        <p className="text-xs text-slate-400">
                          جرّب اختيار يوم آخر من التقويم أعلاه أو العودة لأنشطة اليوم.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* شريط الترقيم السفلي */}
        {renderPaginationBar('bottom')}
      </div>
    </div>
  );
};
