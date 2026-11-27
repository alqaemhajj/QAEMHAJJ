import React, { useState, useMemo } from 'react';
import {
  Users,
  BookOpen,
  CheckCircle2,
  UserCheck,
  UserX,
  Presentation,
  ClipboardCheck,
  Award,
  AlertTriangle,
  Sparkles,
  Filter,
  Search,
  Send,
  FileSpreadsheet,
  Printer,
  Eye,
  Plus,
  RefreshCw,
  HelpCircle,
  Calendar,
  TrendingUp,
} from 'lucide-react';
import { Pilgrim } from '../../types';
import {
  AwarenessPhase,
  AwarenessProgram,
  FiqhMasteryStatus,
  FiqhSection,
  LessonAttendanceRecord,
  PilgrimEducationalProgress,
  ReligiousAssessment,
  ReligiousGuide,
  ReligiousLesson,
  ReligiousUnitKey,
  ShariaInquiry,
} from '../../types/religiousGuidance';
import {
  FIQH_MASTERY_STATUSES,
  INITIAL_FIQH_SECTIONS,
  SUPPORTED_LANGUAGES,
} from '../../data/religiousGuidanceData';
import {
  getPilgrimCampaignLabel,
  getPilgrimDisplayName,
  getPilgrimEffectiveMarji,
  getPilgrimGroupLabel,
  getPilgrimSectionMastery,
  setPilgrimSectionMastery,
  sortFiqhSections,
  exportReligiousReportCSV,
} from '../../lib/religiousGuidanceDb';
import {
  DynamicColumnDef,
  DynamicColumnSelectorPanel,
  usePersistedColumns,
} from '../common/DynamicColumnSelector';

interface DashboardAndProfilesProps {
  mode: 'dashboard' | 'pilgrimProfiles';
  activePilgrims: Pilgrim[];
  programs: AwarenessProgram[];
  lessons: ReligiousLesson[];
  attendance: LessonAttendanceRecord[];
  assessments: ReligiousAssessment[];
  pilgrimProgressMap: Record<string, PilgrimEducationalProgress>;
  guides: ReligiousGuide[];
  inquiries: ShariaInquiry[];
  fiqhSections?: FiqhSection[];
  currentStaffName: string;
  canEdit: boolean;
  onNavigateUnit: (unit: ReligiousUnitKey) => void;
  onSavePilgrimProgress: (progress: PilgrimEducationalProgress) => Promise<void>;
  onSendNotification: (params: {
    title: string;
    body: string;
    targetType: 'all' | 'package' | 'bus' | 'flight' | 'gender' | 'individual';
    targetValue?: string;
    auditActionLabel: string;
  }) => Promise<string>;
  onPrintReport: (
    title: string,
    columns: string[],
    data: (string | number)[][],
    summaryCards?: { label: string; value: string | number }[],
    subtitle?: string,
    filterSummary?: string
  ) => void;
}

export const ReligiousDashboardAndProfiles: React.FC<DashboardAndProfilesProps> = ({
  mode,
  activePilgrims,
  programs,
  lessons,
  attendance,
  pilgrimProgressMap,
  guides,
  inquiries,
  fiqhSections = INITIAL_FIQH_SECTIONS,
  currentStaffName,
  canEdit,
  onNavigateUnit,
  onSavePilgrimProgress,
  onSendNotification,
  onPrintReport,
}) => {
  const visibleFiqhSections = useMemo(
    () =>
      sortFiqhSections(fiqhSections.length > 0 ? fiqhSections : INITIAL_FIQH_SECTIONS).filter(
        (s) => s.isVisible
      ),
    [fiqhSections]
  );
  // Filters for Dashboard & Profiles
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [guideFilter, setGuideFilter] = useState<string>('all');
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [phaseFilter, setPhaseFilter] = useState<'all' | AwarenessPhase>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [profileStatusFilter, setProfileStatusFilter] = useState<
    'all' | 'completed' | 'needs_reeducation' | 'unattended'
  >('all');

  // Selected Pilgrim for full Educational Profile Modal
  const [selectedPilgrimId, setSelectedPilgrimId] = useState<string | null>(null);
  const [newFollowUpNote, setNewFollowUpNote] = useState('');
  const [newFollowUpAction, setNewFollowUpAction] = useState('جلسة مراجعة فقهية فردية');
  const [sendNotifWithFollowUp, setSendNotifWithFollowUp] = useState(true);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Unique campaigns & groups from pilgrims
  const uniqueCampaigns = useMemo(() => {
    const s = new Set<string>();
    activePilgrims.forEach((p) => s.add(getPilgrimCampaignLabel(p)));
    return Array.from(s);
  }, [activePilgrims]);

  const uniqueGroups = useMemo(() => {
    const s = new Set<string>();
    activePilgrims.forEach((p) => s.add(getPilgrimGroupLabel(p)));
    return Array.from(s);
  }, [activePilgrims]);

  // Filtered Pilgrims
  const filteredPilgrims = useMemo(() => {
    return activePilgrims.filter((p) => {
      const pid = p.id || p.nationalId;
      const prog = pilgrimProgressMap[pid];
      const camp = getPilgrimCampaignLabel(p);
      const grp = getPilgrimGroupLabel(p);
      const lang = prog?.preferredLanguage || 'العربية';

      if (campaignFilter !== 'all' && camp !== campaignFilter) return false;
      if (groupFilter !== 'all' && grp !== groupFilter) return false;
      if (languageFilter !== 'all' && lang !== languageFilter && p.nationality !== languageFilter) {
        return false;
      }

      if (guideFilter !== 'all') {
        const g = guides.find((gd) => gd.id === guideFilter);
        if (g) {
          const matchesGroup =
            g.assignedGroups.includes('جميع المجموعات') ||
            g.assignedGroups.some((ag) => grp.includes(ag));
          const matchesCamp =
            g.assignedCampaigns.includes('جميع الحملات') ||
            g.assignedCampaigns.includes(camp);
          if (!matchesGroup && !matchesCamp) return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const name = getPilgrimDisplayName(p).toLowerCase();
        const nid = (p.nationalId || '').toLowerCase();
        const mob = (p.mobile || '').toLowerCase();
        const marji = (p.currentMarji || '').toLowerCase();
        if (!name.includes(q) && !nid.includes(q) && !mob.includes(q) && !marji.includes(q)) {
          return false;
        }
      }

      if (profileStatusFilter === 'needs_reeducation' && !prog?.needsReeducation) return false;
      if (
        profileStatusFilter === 'completed' &&
        (!prog || prog.completedProgramIds.length === 0)
      ) {
        return false;
      }
      if (
        profileStatusFilter === 'unattended' &&
        prog &&
        prog.completedLessonIds.length > 0
      ) {
        return false;
      }

      return true;
    });
  }, [
    activePilgrims,
    pilgrimProgressMap,
    campaignFilter,
    groupFilter,
    languageFilter,
    guideFilter,
    guides,
    searchQuery,
    profileStatusFilter,
  ]);

  // Filtered Lessons & Programs by Phase / Guide / Period
  const filteredLessons = useMemo(() => {
    return lessons.filter((l) => {
      if (phaseFilter !== 'all' && l.phase !== phaseFilter) return false;
      if (guideFilter !== 'all' && l.guideId !== guideFilter) return false;
      if (periodFilter === 'november' && !l.date.startsWith('2026-11')) return false;
      if (periodFilter === 'december' && !l.date.startsWith('2026-12')) return false;
      return true;
    });
  }, [lessons, phaseFilter, guideFilter, periodFilter]);

  const filteredPrograms = useMemo(() => {
    return programs.filter((pr) => {
      if (phaseFilter !== 'all' && pr.phase !== phaseFilter) return false;
      return true;
    });
  }, [programs, phaseFilter]);

  // Real-time KPIs computation from actual data
  const kpis = useMemo(() => {
    const totalPilgrims = filteredPilgrims.length;
    let enrolledCount = 0;
    let completedProgCount = 0;
    let attendedAnyLessonCount = 0;
    let needsReeducationCount = 0;
    let totalAttempts = 0;
    let passedAttempts = 0;

    filteredPilgrims.forEach((p) => {
      const pid = p.id || p.nationalId;
      const pr = pilgrimProgressMap[pid];
      if (!pr) return;
      if (pr.enrolledProgramIds.length > 0) enrolledCount++;
      if (pr.completedProgramIds.length > 0) completedProgCount++;
      if (pr.completedLessonIds.length > 0) attendedAnyLessonCount++;
      if (pr.needsReeducation) needsReeducationCount++;
      pr.assessmentAttempts.forEach((att) => {
        totalAttempts++;
        if (att.passed) passedAttempts++;
      });
    });

    const unattendedCount = Math.max(0, totalPilgrims - attendedAnyLessonCount);
    const enrolledPercent = totalPilgrims > 0 ? Math.round((enrolledCount / totalPilgrims) * 100) : 0;
    const completedPercent =
      totalPilgrims > 0 ? Math.round((completedProgCount / totalPilgrims) * 100) : 0;
    const executedLessonsCount = filteredLessons.filter((l) => l.status === 'مكتمل').length;
    const totalScheduledLessons = filteredLessons.length;
    const passRatePercent =
      totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0;
    const activeGuidesCount = guides.filter((g) => g.status !== 'إجازة').length;

    const planCompletionPercent =
      totalScheduledLessons > 0
        ? Math.min(
            100,
            Math.round(
              (executedLessonsCount / totalScheduledLessons) * 50 +
                (enrolledPercent * 0.25) +
                (passRatePercent * 0.25)
            )
          )
        : 0;

    return {
      totalPilgrims,
      enrolledCount,
      enrolledPercent,
      completedProgCount,
      completedPercent,
      attendedAnyLessonCount,
      unattendedCount,
      executedLessonsCount,
      totalScheduledLessons,
      completedAssessmentsCount: totalAttempts,
      passRatePercent,
      needsReeducationCount,
      activeGuidesCount,
      planCompletionPercent,
    };
  }, [filteredPilgrims, pilgrimProgressMap, filteredLessons, guides]);

  // Selected Pilgrim Profile Data
  const selectedPilgrim = useMemo(() => {
    if (!selectedPilgrimId) return null;
    return (
      activePilgrims.find(
        (p) => (p.id || p.nationalId) === selectedPilgrimId || p.nationalId === selectedPilgrimId
      ) || null
    );
  }, [activePilgrims, selectedPilgrimId]);

  const selectedProgress = useMemo(() => {
    if (!selectedPilgrim) return null;
    const pid = selectedPilgrim.id || selectedPilgrim.nationalId;
    return pilgrimProgressMap[pid] || null;
  }, [selectedPilgrim, pilgrimProgressMap]);

  const handleUpdateIssueMastery = async (
    section: FiqhSection,
    newStatus: FiqhMasteryStatus
  ) => {
    if (!selectedPilgrim || !selectedProgress || !canEdit) return;
    const updatedMastery = setPilgrimSectionMastery(
      selectedProgress.fiqhIssuesMastery,
      section,
      newStatus
    );
    const needsReeducation = visibleFiqhSections.some(
      (sec) =>
        (updatedMastery[sec.id] || updatedMastery[sec.name]) ===
        'يحتاج إلى مراجعة وإعادة توعية'
    );
    const updated: PilgrimEducationalProgress = {
      ...selectedProgress,
      fiqhIssuesMastery: updatedMastery,
      needsReeducation,
      lastUpdated: new Date().toISOString().split('T')[0],
    };
    await onSavePilgrimProgress(updated);
    setStatusBanner(`تم تحديث حالة إتقان مسألة "${section.name}" إلى (${newStatus}) بنجاح.`);
    setTimeout(() => setStatusBanner(null), 3500);
  };

  const handleAddFollowUpNote = async () => {
    if (!selectedPilgrim || !selectedProgress || !newFollowUpNote.trim()) return;
    let sentNotifId: string | undefined;

    if (sendNotifWithFollowUp) {
      sentNotifId = await onSendNotification({
        title: `متابعة توعوية من لجنة الإرشاد الديني — ${newFollowUpAction}`,
        body: `أخانا الحاج / أختنا الحاجة ${getPilgrimDisplayName(selectedPilgrim)}، ${newFollowUpNote.trim()}`,
        targetType: 'individual',
        targetValue: selectedPilgrim.nationalId,
        auditActionLabel: 'إرسال تنبيه متابعة توعوية فردية للحاج',
      });
    }

    const noteItem = {
      id: `flw-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      authorName: currentStaffName,
      note: newFollowUpNote.trim(),
      actionTaken: newFollowUpAction,
      notificationId: sentNotifId,
    };

    const updated: PilgrimEducationalProgress = {
      ...selectedProgress,
      followUpLog: [noteItem, ...(selectedProgress.followUpLog || [])],
      lastUpdated: new Date().toISOString().split('T')[0],
    };

    await onSavePilgrimProgress(updated);
    setNewFollowUpNote('');
    setStatusBanner(
      sendNotifWithFollowUp
        ? 'تم حفظ المتابعة التوعوية وإرسال إشعار مباشر لبوابة الحاج بنجاح.'
        : 'تم حفظ المتابعة التوعوية في الملف التعليمي للحاج.'
    );
    setTimeout(() => setStatusBanner(null), 4000);
  };

  // Dynamic Column Definitions for Educational Profiles Roster (Domain-specific + all 11 shared base pilgrim fields)
  const profileColumns = useMemo<DynamicColumnDef<Pilgrim>[]>(() => {
    const getPaymentLabel = (p: Pilgrim) => {
      const paidNum = Number(String(p.paidAmount || '').replace(/[^0-9.]/g, '')) || 0;
      if (p.paymentReceived || p.status === 'مكتمل الدفع' || p.status === 'مكتمل') {
        return paidNum > 0 ? `مسدّد (${paidNum.toLocaleString()} ر.س)` : 'مكتمل الدفع';
      }
      if (paidNum > 0) return `دفعة جزئية (${paidNum.toLocaleString()} ر.س)`;
      return 'بانتظار السداد';
    };

    const getMobileDisplay = (p: Pilgrim) => {
      const m = (p.mobile || '').trim();
      const w = (p.whatsapp || '').trim();
      if (m && w && m !== w) return `${m} / واتساب: ${w}`;
      return m || w || '—';
    };

    return [
      // Shared Base Fields (Core pilgrim info)
      {
        key: 'fullName',
        label: 'الاسم الكامل للحاج',
        shortHeader: 'اسم الحاج',
        group: 'shared',
        defaultEnabled: true,
        getValue: (p) => getPilgrimDisplayName(p),
      },
      {
        key: 'nationalId',
        label: 'رقم الهوية الوطنية',
        shortHeader: 'رقم الهوية',
        group: 'shared',
        defaultEnabled: true,
        isTextProtected: true,
        isLtr: true,
        getValue: (p) => (p.nationalId || '').trim() || '—',
      },
      {
        key: 'mobile',
        label: 'رقم الجوال / الواتساب',
        shortHeader: 'الجوال / الواتساب',
        group: 'shared',
        defaultEnabled: true,
        isTextProtected: true,
        isLtr: true,
        getValue: (p) => getMobileDisplay(p),
      },
      // Domain-specific Religious Educational Columns
      {
        key: 'campaignGroup',
        label: 'الحملة والمجموعة (الحافلة / الطيران)',
        shortHeader: 'الحملة والمجموعة',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => `${getPilgrimCampaignLabel(p)} — ${getPilgrimGroupLabel(p)}`,
      },
      {
        key: 'preferredLanguage',
        label: 'اللغة المفضلة',
        shortHeader: 'اللغة',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => pilgrimProgressMap[p.id || p.nationalId]?.preferredLanguage || 'العربية',
      },
      {
        key: 'programsAndLessons',
        label: 'البرامج والدروس المكتملة',
        shortHeader: 'البرامج والدروس',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const pr = pilgrimProgressMap[p.id || p.nationalId];
          return `${pr?.completedLessonIds.length || 0} دروس مكتملة`;
        },
      },
      {
        key: 'prePostScores',
        label: 'الاختبار القبلي / البعدي',
        shortHeader: 'القبلي / البعدي',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const pr = pilgrimProgressMap[p.id || p.nationalId];
          return `${pr?.preTestScore ?? '—'}% / ${pr?.postTestScore ?? '—'}%`;
        },
      },
      {
        key: 'fiqhMasterySummary',
        label: 'إتقان المسائل الفقهية (14 باباً)',
        shortHeader: 'إتقان المسائل الفقهية',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const pr = pilgrimProgressMap[p.id || p.nationalId];
          const mastered = pr
            ? Object.values(pr.fiqhIssuesMastery).filter((s) => s === 'اجتاز التقييم').length
            : 0;
          const review = pr
            ? Object.values(pr.fiqhIssuesMastery).filter(
                (s) => s === 'يحتاج إلى مراجعة وإعادة توعية'
              ).length
            : 0;
          return review > 0 ? `اجتاز ${mastered}/14 (للمراجعة: ${review})` : `اجتاز ${mastered}/14`;
        },
      },
      {
        key: 'reeducationStatus',
        label: 'حالة إعادة التوعية والمتابعة',
        shortHeader: 'الحالة التوعوية',
        group: 'specific',
        defaultEnabled: false,
        getValue: (p) => {
          const pr = pilgrimProgressMap[p.id || p.nationalId];
          return pr?.needsReeducation ? 'يحتاج مراجعة وإعادة توعية' : 'مجتاز ومستوعب';
        },
      },
      // Remaining Shared Base Fields
      {
        key: 'marji',
        label: 'مرجع التقليد',
        shortHeader: 'مرجع التقليد',
        group: 'shared',
        defaultEnabled: true,
        getValue: (p) => getPilgrimEffectiveMarji(p),
      },
      {
        key: 'mutawwifName',
        label: 'اسم المطوّف المكلّف',
        shortHeader: 'المطوّف المكلّف',
        group: 'shared',
        defaultEnabled: false,
        getValue: (p) =>
          pilgrimProgressMap[p.id || p.nationalId]?.assignedMutawwifName || 'غير معيّن بعد',
      },
      {
        key: 'gender',
        label: 'الجنس',
        shortHeader: 'الجنس',
        group: 'shared',
        defaultEnabled: false,
        getValue: (p) => (p.gender || '').trim() || '—',
      },
      {
        key: 'nationality',
        label: 'الجنسية',
        shortHeader: 'الجنسية',
        group: 'shared',
        defaultEnabled: false,
        getValue: (p) => (p.nationality || '').trim() || 'سعودي',
      },
      {
        key: 'birthDate',
        label: 'تاريخ الميلاد',
        shortHeader: 'تاريخ الميلاد',
        group: 'shared',
        defaultEnabled: false,
        isTextProtected: true,
        getValue: (p) => (p.birthDate || '').trim() || '—',
      },
      {
        key: 'selectedPackage',
        label: 'الباقة المختارة',
        shortHeader: 'الباقة',
        group: 'shared',
        defaultEnabled: false,
        getValue: (p) => (p.selectedPackage || p.packageType || '').trim() || '—',
      },
      {
        key: 'paymentStatus',
        label: 'حالة السداد',
        shortHeader: 'حالة السداد',
        group: 'shared',
        defaultEnabled: false,
        getValue: (p) => getPaymentLabel(p),
      },
      {
        key: 'signatureNotes',
        label: 'خانة توقيع / تحضير يدوي / ملاحظات',
        shortHeader: 'توقيع / ملاحظات',
        group: 'shared',
        defaultEnabled: false,
        getValue: () => '',
      },
    ];
  }, [pilgrimProgressMap]);

  const profileColsState = usePersistedColumns('religiousProfiles', profileColumns);

  const handleExportProfilesCSV = () => {
    if (profileColsState.activeColumns.length === 0) return;
    const headers = [
      '#',
      ...profileColsState.activeColumns.map((c) => c.shortHeader || c.label),
    ];
    const rows = filteredPilgrims.map((p, idx) => [
      idx + 1,
      ...profileColsState.activeColumns.map((c) => c.getValue(p, idx)),
    ]);
    exportReligiousReportCSV(
      'كشف_الملفات_التعليمية_للحجاج',
      headers,
      rows,
      [
        { label: 'إجمالي الحجاج بالكشف', value: filteredPilgrims.length },
        { label: 'أكملوا البرامج', value: kpis.completedProgCount },
        { label: 'نسبة النجاح بالتقييم', value: `${kpis.passRatePercent}%` },
        { label: 'بحاجة لإعادة توعية', value: kpis.needsReeducationCount },
      ],
      'كشف الملفات التعليمية ومستوى الإتقان الفقهي للحجاج'
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      {statusBanner && (
        <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-emerald-300 hover:text-white text-xs"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Multi-Dimensional Filter Bar */}
      <div className="bg-[#0B1221] border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Filter className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">
                محرك التصفية والفرز المتقدم للإرشاد الديني
              </h3>
              <p className="text-[11px] text-slate-400">
                تصفية المؤشرات والملفات التعليمية حسب الحملة، المجموعة، المرشد الديني، اللغة، الفترة الزمنية، والمرحلة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setCampaignFilter('all');
              setGroupFilter('all');
              setGuideFilter('all');
              setLanguageFilter('all');
              setPeriodFilter('all');
              setPhaseFilter('all');
              setSearchQuery('');
              setProfileStatusFilter('all');
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>إعادة تعيين الفلاتر</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* المرحلة */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">
              المرحلة التوعوية:
            </label>
            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value as any)}
              className="w-full bg-[#10192D] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-amber-400"
            >
              <option value="all">جميع المراحل (قبل / أثناء / بعد الحج)</option>
              <option value="قبل الحج">قبل الحج</option>
              <option value="أثناء الحج">أثناء الحج</option>
              <option value="بعد الحج">بعد الحج</option>
            </select>
          </div>

          {/* الحملة / الباقة */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">
              الحملة / الباقة:
            </label>
            <select
              value={campaignFilter}
              onChange={(e) => setCampaignFilter(e.target.value)}
              className="w-full bg-[#10192D] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-amber-400"
            >
              <option value="all">جميع الحملات والباقات ({activePilgrims.length})</option>
              {uniqueCampaigns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* المجموعة */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">
              المجموعة (الحافلة / الرحلة):
            </label>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="w-full bg-[#10192D] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-amber-400"
            >
              <option value="all">جميع المجموعات</option>
              {uniqueGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* المرشد الديني */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">
              المرشد الديني المسؤول:
            </label>
            <select
              value={guideFilter}
              onChange={(e) => setGuideFilter(e.target.value)}
              className="w-full bg-[#10192D] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-amber-400"
            >
              <option value="all">جميع المرشدين ({guides.length})</option>
              {guides.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* اللغة والجنسية */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">
              اللغة / الجنسية:
            </label>
            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              className="w-full bg-[#10192D] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-amber-400"
            >
              <option value="all">جميع اللغات والجنسيات</option>
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {/* الفترة الزمنية */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">
              الفترة الزمنية:
            </label>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="w-full bg-[#10192D] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-amber-400"
            >
              <option value="all">طوال موسم 1448هـ</option>
              <option value="november">ذو القعدة (التأهيل القبلي)</option>
              <option value="december">ذو الحجة (أيام المناسك)</option>
            </select>
          </div>
        </div>
      </div>

      {/* MODE 1: RELIGIOUS GUIDANCE DASHBOARD */}
      {mode === 'dashboard' && (
        <div className="space-y-6">
          {/* Overall Plan Completion Banner */}
          <div className="bg-gradient-to-r from-[#10192D] via-[#0F1E38] to-[#0B1221] border border-amber-500/40 rounded-3xl p-5 sm:p-6 shadow-xl">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base sm:text-lg font-black text-white">
                    مؤشر الإنجاز العام لخطة التوعية والإرشاد الديني — موسم 1448هـ
                  </h3>
                </div>
                <p className="text-xs text-slate-300">
                  يُحتسب آلياً من واقع تنفيذ الدروس، التحاق الحجاج بالبرامج التوعوية، واجتياز تقييمات إتقان المسائل الفقهية
                </p>
              </div>
              <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-end">
                <div className="text-right">
                  <span className="text-xs text-slate-400 block font-bold">نسبة إنجاز خطة التوعية</span>
                  <strong className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                    {kpis.planCompletionPercent}%
                  </strong>
                </div>
                <div className="w-40 sm:w-56 bg-slate-800 rounded-full h-3.5 overflow-hidden border border-slate-700">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${kpis.planCompletionPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 10 Core KPI Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {/* 1. إجمالي الحجاج */}
            <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-amber-500/40 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">إجمالي الحجاج</span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-white font-mono">{kpis.totalPilgrims}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">حاج ضمن نطاق الفرز</div>
              </div>
            </div>

            {/* 2. الملتحقون بالبرامج */}
            <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-sky-500/40 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">الملتحقون بالبرامج</span>
                <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center">
                  <BookOpen className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-sky-400 font-mono">{kpis.enrolledCount}</span>
                  <span className="text-xs font-bold text-sky-300 bg-sky-500/15 px-2 py-0.5 rounded-lg">
                    {kpis.enrolledPercent}%
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">مسجلون في برامج التوعية</div>
              </div>
            </div>

            {/* 3. أكملوا البرامج */}
            <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-emerald-500/40 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">أكملوا البرامج</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-emerald-400 font-mono">
                    {kpis.completedProgCount}
                  </span>
                  <span className="text-xs font-bold text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-lg">
                    {kpis.completedPercent}%
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">أتموا متطلبات البرنامج</div>
              </div>
            </div>

            {/* 4. حضروا الدروس */}
            <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-teal-500/40 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">حضروا الدروس</span>
                <div className="w-8 h-8 rounded-xl bg-teal-500/15 text-teal-400 flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-teal-400 font-mono">
                  {kpis.attendedAnyLessonCount}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">حاج حضر درساً فأكثر</div>
              </div>
            </div>

            {/* 5. لم يحضروا الدروس */}
            <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-rose-500/40 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">لم يحضروا بعد</span>
                <div className="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center">
                  <UserX className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-rose-400 font-mono">
                  {kpis.unattendedCount}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">يحتاجون تذكيراً بالحضور</div>
              </div>
            </div>

            {/* 6. الدروس والمحاضرات المنفذة */}
            <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-purple-500/40 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">الدروس المنفذة</span>
                <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
                  <Presentation className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-purple-400 font-mono">
                  {kpis.executedLessonsCount}{' '}
                  <span className="text-xs text-slate-400 font-normal">
                    / {kpis.totalScheduledLessons}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">محاضرة ودرس ومجلس ميداني</div>
              </div>
            </div>

            {/* 7. التقييمات المنفذة */}
            <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-indigo-500/40 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">التقييمات المنفذة</span>
                <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                  <ClipboardCheck className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-indigo-400 font-mono">
                  {kpis.completedAssessmentsCount}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">اختبار قبلي وبعدي مكتمل</div>
              </div>
            </div>

            {/* 8. نسبة النجاح في الاختبارات */}
            <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-amber-500/40 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">نسبة النجاح بالتقييم</span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                  <Award className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-amber-400 font-mono">
                  {kpis.passRatePercent}%
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">اجتازوا درجة الإتقان المقررة</div>
              </div>
            </div>

            {/* 9. يحتاجون إلى إعادة توعية */}
            <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-orange-500/40 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">بحاجة لإعادة توعية</span>
                <div className="w-8 h-8 rounded-xl bg-orange-500/15 text-orange-400 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-orange-400 font-mono">
                  {kpis.needsReeducationCount}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">لم يجتازوا بعض المسائل الفقهية</div>
              </div>
            </div>

            {/* 10. المرشدون النشطون */}
            <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-cyan-500/40 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">المرشدون النشطون</span>
                <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-cyan-400 font-mono">
                  {kpis.activeGuidesCount}{' '}
                  <span className="text-xs text-slate-400 font-normal">/ {guides.length}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">مرشد ومرشدة دينية بالميدان</div>
              </div>
            </div>
          </div>

          {/* Mastery Overview across the 14 Pre-Hajj Topics & Quick Action Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 14 Jurisprudence Topics Mastery Breakdown */}
            <div className="lg:col-span-2 bg-[#0B1221] border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-sm sm:text-base font-black text-white">
                    مؤشر إتقان الأبواب والمسائل الفقهية ({visibleFiqhSections.length} باباً نشطاً — الحضور لا يعني الإتقان التلقائي)
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    توزيع الحجاج حسب اجتياز التقييم الفقهي الفعلي لكل باب من أبواب المناسك
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateUnit('assessmentsAndMastery')}
                  className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold transition cursor-pointer"
                >
                  إدارة الاختبارات وإتقان المسائل ←
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                {visibleFiqhSections.map((sec) => {
                  let mastered = 0;
                  let review = 0;
                  filteredPilgrims.forEach((p) => {
                    const st = getPilgrimSectionMastery(
                      pilgrimProgressMap[p.id || p.nationalId],
                      sec
                    );
                    if (st === 'اجتاز التقييم') mastered++;
                    if (st === 'يحتاج إلى مراجعة وإعادة توعية') review++;
                  });
                  const pct =
                    filteredPilgrims.length > 0
                      ? Math.round((mastered / filteredPilgrims.length) * 100)
                      : 0;

                  return (
                    <div
                      key={sec.id}
                      className="bg-[#10192D] border border-slate-800 rounded-2xl p-3.5 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-white truncate">{sec.name}</span>
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {pct}% إتقان
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>اجتاز التقييم: {mastered} حاج</span>
                        {review > 0 ? (
                          <span className="text-amber-400 font-bold">
                            يحتاج مراجعة: {review}
                          </span>
                        ) : (
                          <span className="text-emerald-400">مكتمل</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Programs & Inquiries Summary */}
            <div className="bg-[#0B1221] border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <h4 className="text-sm sm:text-base font-black text-white">
                  ملخص الوحدات التشغيلية السريع
                </h4>

                <div className="p-3.5 rounded-2xl bg-[#10192D] border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-300 block">
                      برامج التوعية النشطة
                    </span>
                    <span className="text-[11px] text-slate-400">
                      قبل الحج ({programs.filter((p) => p.phase === 'قبل الحج').length}) • أثناء الحج (
                      {programs.filter((p) => p.phase === 'أثناء الحج').length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateUnit('preHajjPrograms')}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs cursor-pointer"
                  >
                    عرض البرامج
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#10192D] border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-300 block">
                      الاستفسارات الشرعية الواردة
                    </span>
                    <span className="text-[11px] text-amber-400">
                      {inquiries.filter((i) => !i.isApproved).length} بانتظار الإجابة أو الاعتماد الرسمي
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateUnit('shariaInquiries')}
                    className="px-3 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold text-xs cursor-pointer"
                  >
                    الفتاوى والأسئلة
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#10192D] border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-300 block">
                      تسجيل الحضور والغياب (QR)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {attendance.length} حركة تحضير مسجلة
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateUnit('attendanceTracking')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-xs cursor-pointer"
                  >
                    سجل الحضور
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigateUnit('reportsAndImpact')}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>الانتقال إلى منظومة التقارير الـ 11 وقياس الأثر</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODE 2: PILGRIMS & EDUCATIONAL PROFILES */}
      {mode === 'pilgrimProfiles' && (
        <div className="space-y-5">
          {/* Search & Quick Filter Bar */}
          <div className="bg-[#0B1221] border border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث باسم الحاج، رقم الهوية، الجوال، أو مرجع التقليد..."
                  className="w-full bg-[#10192D] border border-slate-700 rounded-xl pr-10 pl-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'all', label: `الكل (${activePilgrims.length})` },
                  { id: 'needs_reeducation', label: `يحتاج إعادة توعية (${kpis.needsReeducationCount})` },
                  { id: 'completed', label: `أكملوا البرامج (${kpis.completedProgCount})` },
                  { id: 'unattended', label: `لم يحضروا دروساً (${kpis.unattendedCount})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setProfileStatusFilter(tab.id as any)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      profileStatusFilter === tab.id
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                        : 'bg-[#10192D] text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={profileColsState.activeColumns.length === 0}
                onClick={() => {
                  const cols = [
                    '#',
                    ...profileColsState.activeColumns.map((c) => c.shortHeader || c.label),
                  ];
                  const rows = filteredPilgrims.map((p, idx) => [
                    idx + 1,
                    ...profileColsState.activeColumns.map((c) => c.getValue(p, idx)),
                  ]);
                  const filterParts: string[] = [];
                  if (profileStatusFilter !== 'all') filterParts.push(`التصنيف: ${profileStatusFilter}`);
                  if (searchQuery.trim()) filterParts.push(`بحث: "${searchQuery.trim()}"`);
                  onPrintReport(
                    'كشف الملفات التعليمية ومستوى الإتقان الفقهي للحجاج',
                    cols,
                    rows,
                    [
                      { label: 'إجمالي الحجاج بالكشف', value: filteredPilgrims.length },
                      { label: 'أكملوا البرامج', value: kpis.completedProgCount },
                      { label: 'نسبة النجاح بالتقييم', value: `${kpis.passRatePercent}%` },
                      { label: 'بحاجة لإعادة توعية', value: kpis.needsReeducationCount },
                    ],
                    undefined,
                    filterParts.length > 0 ? filterParts.join(' • ') : undefined
                  );
                }}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black flex items-center gap-2 shadow cursor-pointer transition active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة / حفظ PDF ({filteredPilgrims.length})</span>
              </button>
              <button
                type="button"
                disabled={profileColsState.activeColumns.length === 0}
                onClick={handleExportProfilesCSV}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow cursor-pointer transition active:scale-95"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير Excel (.xlsx) ({filteredPilgrims.length})</span>
              </button>
            </div>
          </div>

          {/* Dynamic Column Selector Panel */}
          <DynamicColumnSelectorPanel
            title="تخصيص أعمدة وحقول كشف الملفات التعليمية"
            columns={profileColumns}
            selectedMap={profileColsState.selectedMap}
            onToggle={profileColsState.toggleColumn}
            onSelectAll={profileColsState.selectAll}
            onDeselectAll={profileColsState.deselectAll}
            onResetDefaults={profileColsState.resetDefaults}
            specificGroupLabel="أعمدة الملف التعليمي والتقييم الديني"
            sharedGroupLabel="البيانات الأساسية للحاج (مشتركة)"
            defaultOpen={false}
            darkSurfaceOnly
          />

          {/* Pilgrims Educational Profiles Table */}
          <div className="bg-[#0B1221] border border-slate-800 rounded-3xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs text-slate-300">
                <thead className="bg-[#10192D] text-slate-300 border-b border-slate-800 font-bold">
                  <tr>
                    <th className="px-4 py-3.5 text-center w-12">#</th>
                    {profileColsState.activeColumns.map((col) => (
                      <th key={col.key} className="px-4 py-3.5 whitespace-nowrap">
                        {col.shortHeader || col.label}
                      </th>
                    ))}
                    <th className="px-4 py-3.5 text-center whitespace-nowrap">الحالة والإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {profileColsState.activeColumns.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-10 text-center text-rose-400 font-bold">
                        يرجى تحديد عمود واحد على الأقل من لوحة «تخصيص أعمدة وحقول الكشف» أعلاه.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {filteredPilgrims.map((pilgrim, idx) => {
                        const pid = pilgrim.id || pilgrim.nationalId;
                        const pr = pilgrimProgressMap[pid];
                        const masteredCount = pr
                          ? Object.values(pr.fiqhIssuesMastery).filter((s) => s === 'اجتاز التقييم')
                              .length
                          : 0;
                        const reviewCount = pr
                          ? Object.values(pr.fiqhIssuesMastery).filter(
                              (s) => s === 'يحتاج إلى مراجعة وإعادة توعية'
                            ).length
                          : 0;
                        const pilgrimInquiriesCount = inquiries.filter(
                          (i) => i.pilgrimId === pid || i.nationalId === pilgrim.nationalId
                        ).length;

                        return (
                          <tr key={pid} className="hover:bg-[#10192D]/70 transition">
                            <td className="px-4 py-3.5 text-center font-mono text-slate-400">
                              {idx + 1}
                            </td>
                            {profileColsState.activeColumns.map((col) => {
                              if (col.key === 'fullName') {
                                return (
                                  <td key={col.key} className="px-4 py-3.5">
                                    <div className="font-black text-white text-sm">
                                      {getPilgrimDisplayName(pilgrim)}
                                    </div>
                                  </td>
                                );
                              }
                              if (col.key === 'campaignGroup') {
                                return (
                                  <td key={col.key} className="px-4 py-3.5">
                                    <div className="font-bold text-amber-300">
                                      {getPilgrimCampaignLabel(pilgrim)}
                                    </div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">
                                      {getPilgrimGroupLabel(pilgrim)}
                                    </div>
                                  </td>
                                );
                              }
                              if (col.key === 'marji') {
                                return (
                                  <td key={col.key} className="px-4 py-3.5">
                                    <span className="text-xs text-purple-300 font-bold">
                                      {getPilgrimEffectiveMarji(pilgrim)}
                                    </span>
                                  </td>
                                );
                              }
                              if (col.key === 'programsAndLessons') {
                                return (
                                  <td key={col.key} className="px-4 py-3.5 text-center">
                                    <span className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30 font-bold inline-block whitespace-nowrap">
                                      {pr?.completedLessonIds.length || 0} دروس مكتملة
                                    </span>
                                    {pilgrimInquiriesCount > 0 && (
                                      <div className="text-[10px] text-amber-400 mt-1">
                                        {pilgrimInquiriesCount} استفسار شرعي
                                      </div>
                                    )}
                                  </td>
                                );
                              }
                              if (col.key === 'prePostScores') {
                                return (
                                  <td key={col.key} className="px-4 py-3.5 text-center font-mono">
                                    <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                                        قبلي: {pr?.preTestScore ?? '—'}%
                                      </span>
                                      <span>→</span>
                                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                                        بعدي: {pr?.postTestScore ?? '—'}%
                                      </span>
                                    </div>
                                  </td>
                                );
                              }
                              if (col.key === 'fiqhMasterySummary') {
                                return (
                                  <td key={col.key} className="px-4 py-3.5 text-center">
                                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold whitespace-nowrap">
                                        اجتاز: {masteredCount} / 14
                                      </span>
                                      {reviewCount > 0 && (
                                        <span className="px-2 py-0.5 rounded-lg bg-orange-500/20 text-orange-300 border border-orange-500/30 font-bold whitespace-nowrap">
                                          للمراجعة: {reviewCount}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                );
                              }
                              if (col.key === 'reeducationStatus') {
                                return (
                                  <td key={col.key} className="px-4 py-3.5 text-center">
                                    <span
                                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap ${
                                        pr?.needsReeducation
                                          ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                          : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                      }`}
                                    >
                                      {pr?.needsReeducation ? 'يحتاج إعادة توعية' : 'مجتاز ومستوعب'}
                                    </span>
                                  </td>
                                );
                              }
                              if (col.key === 'signatureNotes') {
                                return (
                                  <td key={col.key} className="px-4 py-3.5">
                                    <div className="min-w-[100px] h-5 border-b border-dashed border-slate-700" />
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={col.key}
                                  className={`px-4 py-3.5 ${col.isTextProtected ? 'font-mono text-slate-200' : 'text-slate-300'}`}
                                  dir={col.isLtr ? 'ltr' : 'rtl'}
                                >
                                  {col.getValue(pilgrim, idx)}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3.5 text-center">
                              <button
                                type="button"
                                onClick={() => setSelectedPilgrimId(pid)}
                                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs inline-flex items-center gap-1.5 shadow transition cursor-pointer whitespace-nowrap"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>الملف التعليمي الشامل</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredPilgrims.length === 0 && (
                        <tr>
                          <td
                            colSpan={profileColsState.activeColumns.length + 2}
                            className="py-12 text-center text-slate-400"
                          >
                            لا توجد ملفات تعليمية مطابقة لمعايير البحث والتصفية الحالية
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* COMPREHENSIVE EDUCATIONAL PROFILE MODAL FOR A SELECTED PILGRIM */}
      {selectedPilgrim && selectedProgress && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn"
          dir="rtl"
        >
          <div className="bg-[#0B1221] border border-amber-500/40 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 bg-[#0F172A] flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-black">
                    الملف التعليمي والفقهي للحاج
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    هوية: {selectedPilgrim.nationalId}
                  </span>
                  <span className="text-xs text-purple-300 font-bold">
                    المرجع: {selectedPilgrim.currentMarji || 'غير محدد'}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white mt-1">
                  {getPilgrimDisplayName(selectedPilgrim)}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {getPilgrimCampaignLabel(selectedPilgrim)} • {getPilgrimGroupLabel(selectedPilgrim)} • جوال:{' '}
                  <span dir="ltr">{selectedPilgrim.mobile}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPilgrimId(null)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                إغلاق ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-6 flex-1">
              {/* Summary Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-3.5">
                  <span className="text-[11px] text-slate-400 block">البرامج الملتحق بها</span>
                  <strong className="text-lg font-black text-sky-400 font-mono">
                    {selectedProgress.enrolledProgramIds.length} برامج
                  </strong>
                </div>
                <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-3.5">
                  <span className="text-[11px] text-slate-400 block">الدروس المكتملة</span>
                  <strong className="text-lg font-black text-emerald-400 font-mono">
                    {selectedProgress.completedLessonIds.length} / {lessons.length}
                  </strong>
                </div>
                <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-3.5">
                  <span className="text-[11px] text-slate-400 block">الاختبار القبلي → البعدي</span>
                  <strong className="text-lg font-black text-amber-400 font-mono">
                    {selectedProgress.preTestScore ?? 0}% → {selectedProgress.postTestScore ?? 0}%
                  </strong>
                </div>
                <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-3.5">
                  <span className="text-[11px] text-slate-400 block">الحالة التوعوية</span>
                  <strong
                    className={`text-sm font-black block mt-1 ${
                      selectedProgress.needsReeducation ? 'text-orange-400' : 'text-emerald-400'
                    }`}
                  >
                    {selectedProgress.needsReeducation
                      ? 'يحتاج مراجعة وإعادة توعية'
                      : 'مستوعب ومجتاز للتقييم'}
                  </strong>
                </div>
              </div>

              {/* Dynamic Jurisprudence Issues Mastery Matrix */}
              <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-sm font-black text-amber-400">
                    سجل إتقان المسائل الفقهية ({visibleFiqhSections.length} باباً نشطاً — الحضور وحده لا يعني إتقان المسألة)
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    يمكن للمرشد أو المشرف تحديث حالة إتقان كل مسألة فقهية بعد التقييم الفعلي
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {visibleFiqhSections.map((sec) => {
                    const currentSt = getPilgrimSectionMastery(selectedProgress, sec);
                    return (
                      <div
                        key={sec.id}
                        className="bg-[#0B1221] border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2"
                      >
                        <span className="text-xs font-bold text-white">{sec.name}</span>
                        <select
                          disabled={!canEdit}
                          value={currentSt}
                          onChange={(e) =>
                            handleUpdateIssueMastery(sec, e.target.value as FiqhMasteryStatus)
                          }
                          className={`text-[11px] font-bold rounded-lg px-2.5 py-1.5 border focus:outline-none ${
                            currentSt === 'اجتاز التقييم'
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                              : currentSt === 'يحتاج إلى مراجعة وإعادة توعية'
                              ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                              : currentSt === 'أكمل المادة التعليمية'
                              ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                              : 'bg-slate-900 text-slate-300 border-slate-700'
                          }`}
                        >
                          {FIQH_MASTERY_STATUSES.map((st) => (
                            <option key={st} value={st} className="bg-slate-900 text-white">
                              {st}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Completed vs Incomplete Lessons & Submitted Inquiries */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-4 space-y-2.5">
                  <h4 className="text-xs font-black text-white">
                    سجل الدروس المكتملة وغير المكتملة
                  </h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {lessons.map((l) => {
                      const isDone = selectedProgress.completedLessonIds.includes(l.id);
                      return (
                        <div
                          key={l.id}
                          className="flex items-center justify-between p-2 rounded-xl bg-[#0B1221] border border-slate-800 text-xs"
                        >
                          <span className="text-slate-200 truncate">{l.title}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                              isDone
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {isDone ? 'مكتمل / حاضر' : 'غير مكتمل'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Follow-up & Notification Dispatch Box */}
                <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-4 space-y-3">
                  <h4 className="text-xs font-black text-amber-400">
                    إضافة متابعة توعوية / إرسال تنبيه عبر نظام الإشعارات الموحد
                  </h4>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newFollowUpAction}
                      onChange={(e) => setNewFollowUpAction(e.target.value)}
                      placeholder="نوع الإجراء (مثال: تذكير بمراجعة أحكام الطواف)"
                      className="w-full bg-[#0B1221] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                    <textarea
                      rows={2}
                      value={newFollowUpNote}
                      onChange={(e) => setNewFollowUpNote(e.target.value)}
                      placeholder="اكتب ملاحظة المتابعة أو نص الرسالة التوعوية الموجهة للحاج..."
                      className="w-full bg-[#0B1221] border border-slate-700 rounded-xl p-3 text-xs text-white"
                    />
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sendNotifWithFollowUp}
                        onChange={(e) => setSendNotifWithFollowUp(e.target.checked)}
                        className="rounded border-slate-600 text-amber-500 focus:ring-amber-400"
                      />
                      <span>
                        إرسال هذه المتابعة فوراً إلى الحاج عبر نظام الإشعارات الحالي بالبوابة
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={handleAddFollowUpNote}
                      className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>حفظ المتابعة التوعوية وإرسال الإشعار</span>
                    </button>
                  </div>

                  {selectedProgress.followUpLog && selectedProgress.followUpLog.length > 0 && (
                    <div className="pt-2 border-t border-slate-800 space-y-1.5 max-h-32 overflow-y-auto">
                      {selectedProgress.followUpLog.map((f) => (
                        <div
                          key={f.id}
                          className="p-2 rounded-xl bg-[#0B1221] border border-slate-800 text-[11px]"
                        >
                          <div className="flex justify-between text-amber-300 font-bold">
                            <span>{f.actionTaken}</span>
                            <span className="font-mono">{f.date}</span>
                          </div>
                          <p className="text-slate-300 mt-0.5">{f.note}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
