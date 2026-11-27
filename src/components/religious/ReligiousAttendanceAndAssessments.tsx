import React, { useState, useMemo, useEffect } from 'react';
import {
  QrCode,
  UserCheck,
  UserX,
  Upload,
  FileSpreadsheet,
  Printer,
  CheckCircle2,
  AlertCircle,
  Search,
  Plus,
  Award,
  ClipboardCheck,
  HelpCircle,
  Send,
  History,
  Settings2,
  GripVertical,
  Eye,
  EyeOff,
  Edit3,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Check,
  X,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { Pilgrim } from '../../types';
import {
  AssessmentQuestion,
  FiqhMasteryStatus,
  FiqhSection,
  LessonAttendanceRecord,
  PilgrimEducationalProgress,
  QuestionType,
  ReligiousAssessment,
  ReligiousLesson,
} from '../../types/religiousGuidance';
import {
  FIQH_MASTERY_STATUSES,
  INITIAL_FIQH_SECTIONS,
} from '../../data/religiousGuidanceData';
import {
  exportReligiousReportCSV,
  findFiqhSection,
  getPilgrimCampaignLabel,
  getPilgrimDisplayName,
  getPilgrimEffectiveMarji,
  getPilgrimGroupLabel,
  getPilgrimSectionMastery,
  resolveFiqhSectionId,
  resolveFiqhSectionName,
  setPilgrimSectionMastery,
  sortFiqhSections,
} from '../../lib/religiousGuidanceDb';
import {
  DynamicColumnDef,
  DynamicColumnSelectorPanel,
  usePersistedColumns,
} from '../common/DynamicColumnSelector';

interface AttendanceAndAssessmentsProps {
  mode: 'attendanceTracking' | 'assessmentsAndMastery';
  activePilgrims: Pilgrim[];
  lessons: ReligiousLesson[];
  attendance: LessonAttendanceRecord[];
  questions: AssessmentQuestion[];
  assessments: ReligiousAssessment[];
  pilgrimProgressMap: Record<string, PilgrimEducationalProgress>;
  fiqhSections: FiqhSection[];
  currentStaffName: string;
  canEdit: boolean;
  canManageSections: boolean;
  initialLessonId?: string;
  onSaveAttendance: (rec: LessonAttendanceRecord) => Promise<void>;
  onSaveQuestion: (q: AssessmentQuestion) => Promise<void>;
  onSaveAssessment: (a: ReligiousAssessment) => Promise<void>;
  onSavePilgrimProgress: (prog: PilgrimEducationalProgress) => Promise<void>;
  onSaveFiqhSection: (sec: FiqhSection) => Promise<void>;
  onReorderFiqhSections: (ordered: FiqhSection[]) => Promise<void>;
  onDeleteFiqhSectionSafely: (
    sectionToDelete: FiqhSection,
    fallbackSection: FiqhSection
  ) => Promise<void>;
  onRestoreDefaultFiqhSections: () => Promise<void>;
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

export const ReligiousAttendanceAndAssessments: React.FC<AttendanceAndAssessmentsProps> = ({
  mode,
  activePilgrims,
  lessons,
  attendance,
  questions,
  assessments,
  pilgrimProgressMap,
  fiqhSections,
  currentStaffName,
  canEdit,
  canManageSections,
  initialLessonId,
  onSaveAttendance,
  onSaveQuestion,
  onSavePilgrimProgress,
  onSaveFiqhSection,
  onReorderFiqhSections,
  onDeleteFiqhSectionSafely,
  onRestoreDefaultFiqhSections,
  onSendNotification,
  onPrintReport,
}) => {
  // Ordered dynamic sections
  const orderedSections = useMemo(
    () =>
      sortFiqhSections(
        fiqhSections.length > 0 ? fiqhSections : INITIAL_FIQH_SECTIONS
      ),
    [fiqhSections]
  );

  // Visible sections for standard view
  const visibleSections = useMemo(
    () => orderedSections.filter((s) => s.isVisible),
    [orderedSections]
  );

  // Attendance State
  const [selectedLessonId, setSelectedLessonId] = useState<string>(
    initialLessonId || lessons[0]?.id || ''
  );
  const [qrInputIdentifier, setQrInputIdentifier] = useState<string>('');
  const [attendanceSearch, setAttendanceSearch] = useState<string>('');
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'حاضر' | 'غائب' | 'مستأذن'>(
    'all'
  );
  const [bulkImportText, setBulkImportText] = useState<string>('');
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [selectedAuditRecord, setSelectedAuditRecord] = useState<LessonAttendanceRecord | null>(
    null
  );

  // Assessments & Mastery Sub-Tab
  const [assessmentSubTab, setAssessmentSubTab] = useState<
    'masteryTracker' | 'questionBank' | 'prePostComparison'
  >('masteryTracker');

  // Selected Fiqh Section by ID (not hardcoded string name!)
  const [selectedMasterySectionId, setSelectedMasterySectionId] = useState<string>(
    visibleSections[0]?.id || orderedSections[0]?.id || 'sec-1'
  );

  // Ensure selectedMasterySectionId stays valid if sections change or are hidden/deleted
  useEffect(() => {
    const pool = visibleSections.length > 0 ? visibleSections : orderedSections;
    if (pool.length > 0 && !pool.some((s) => s.id === selectedMasterySectionId)) {
      setSelectedMasterySectionId(pool[0].id);
    }
  }, [visibleSections, orderedSections, selectedMasterySectionId]);

  const selectedMasterySection = useMemo(
    () =>
      orderedSections.find((s) => s.id === selectedMasterySectionId) ||
      visibleSections[0] ||
      orderedSections[0] ||
      INITIAL_FIQH_SECTIONS[0],
    [orderedSections, visibleSections, selectedMasterySectionId]
  );

  // Fiqh Sections Management State (Admin Only)
  const [isSectionManagerOpen, setIsSectionManagerOpen] = useState<boolean>(false);
  const [simulateUserView, setSimulateUserView] = useState<boolean>(false);
  const [newSectionName, setNewSectionName] = useState<string>('');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState<string>('');
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const [sectionToDelete, setSectionToDelete] = useState<FiqhSection | null>(null);
  const [fallbackSectionIdForDelete, setFallbackSectionIdForDelete] = useState<string>('');

  const isAdminSectionManagerActive = canManageSections && !simulateUserView;

  const [isNewQuestionModalOpen, setIsNewQuestionModalOpen] = useState(false);
  const [questionForm, setQuestionForm] = useState<AssessmentQuestion>({
    id: '',
    sectionId: visibleSections[0]?.id || 'sec-1',
    chapter: visibleSections[0]?.name || INITIAL_FIQH_SECTIONS[0].name,
    questionType: 'اختيار من متعدد',
    questionText: '',
    options: ['', '', '', ''],
    correctAnswer: '',
    points: 20,
    explanation: '',
    difficulty: 'متوسط',
  });

  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'warning';
    text: string;
  } | null>(null);

  const showBanner = (type: 'success' | 'warning', text: string) => {
    setFeedbackBanner({ type, text });
    setTimeout(() => setFeedbackBanner(null), 4500);
  };

  const selectedLesson = useMemo(
    () => lessons.find((l) => l.id === selectedLessonId) || lessons[0],
    [lessons, selectedLessonId]
  );

  // Attendance records for the currently selected lesson
  const lessonAttendanceMap = useMemo(() => {
    const map: Record<string, LessonAttendanceRecord> = {};
    if (!selectedLesson) return map;
    attendance
      .filter((a) => a.lessonId === selectedLesson.id)
      .forEach((rec) => {
        map[rec.pilgrimId] = rec;
        map[rec.nationalId] = rec;
      });
    return map;
  }, [attendance, selectedLesson]);

  // Mark or update attendance with duplicate prevention & audit trail
  const handleRecordAttendance = async (
    pilgrim: Pilgrim,
    status: 'حاضر' | 'غائب' | 'مستأذن',
    method: 'QR' | 'يدوي' | 'استيراد',
    reason: string = 'تسجيل حضور الدرس'
  ) => {
    if (!selectedLesson) return;
    const pid = pilgrim.id || pilgrim.nationalId;
    const existing = lessonAttendanceMap[pid] || lessonAttendanceMap[pilgrim.nationalId];

    // Prevent duplicate QR check-in if already marked حاضر
    if (existing && existing.status === 'حاضر' && status === 'حاضر' && method === 'QR') {
      showBanner(
        'warning',
        `تنبيه منع التكرار: الحاج (${getPilgrimDisplayName(pilgrim)}) مسجل "حاضر" بالفعل في هذا الدرس الساعة ${existing.timestamp}.`
      );
      return;
    }

    const nowStr = new Date().toLocaleString('ar-SA');
    const recId = existing?.id || `att-${selectedLesson.id}-${pilgrim.nationalId}`;

    const auditEntry = existing
      ? {
          timestamp: nowStr,
          changedBy: currentStaffName,
          previousStatus: existing.status,
          newStatus: status,
          reason,
        }
      : undefined;

    const record: LessonAttendanceRecord = {
      id: recId,
      lessonId: selectedLesson.id,
      lessonTitle: selectedLesson.title,
      pilgrimId: pid,
      nationalId: pilgrim.nationalId,
      pilgrimName: getPilgrimDisplayName(pilgrim),
      campaignName: getPilgrimCampaignLabel(pilgrim),
      groupName: getPilgrimGroupLabel(pilgrim),
      status,
      method,
      approvedBy: currentStaffName,
      timestamp: nowStr,
      auditLogs: auditEntry
        ? [auditEntry, ...(existing?.auditLogs || [])]
        : existing?.auditLogs || [],
    };

    await onSaveAttendance(record);

    // Note: Recording lesson attendance adds the lesson to completedLessonIds,
    // and links mastery progress strictly via FiqhSection.id!
    const currentProg = pilgrimProgressMap[pid];
    if (currentProg && status === 'حاضر') {
      const nextLessons = Array.from(
        new Set([...currentProg.completedLessonIds, selectedLesson.id])
      );
      const matchedSec =
        findFiqhSection(selectedLesson.sectionId || selectedLesson.category, orderedSections) ||
        orderedSections[0];
      const currentTopicStatus = getPilgrimSectionMastery(currentProg, matchedSec);
      const updatedTopicStatus: FiqhMasteryStatus =
        currentTopicStatus === 'لم يبدأ التعلم' || currentTopicStatus === 'بدأ التعلم'
          ? 'أكمل المادة التعليمية'
          : currentTopicStatus;

      await onSavePilgrimProgress({
        ...currentProg,
        completedLessonIds: nextLessons,
        fiqhIssuesMastery: setPilgrimSectionMastery(
          currentProg.fiqhIssuesMastery,
          matchedSec,
          updatedTopicStatus
        ),
        lastUpdated: new Date().toISOString().split('T')[0],
      });
    }

    showBanner(
      'success',
      `تم تسجيل (${status}) للحاج ${getPilgrimDisplayName(pilgrim)} عبر [${method}] باعتماد: ${currentStaffName}`
    );
  };

  // QR Scanner / Quick Check-In Handler
  const handleQrQuickScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = qrInputIdentifier.trim();
    if (!q || !selectedLesson) return;

    const matchedPilgrim = activePilgrims.find(
      (p) =>
        p.nationalId === q ||
        p.mobile === q ||
        (p.id && p.id === q) ||
        getPilgrimDisplayName(p).includes(q)
    );

    if (!matchedPilgrim) {
      showBanner('warning', `لم يتم العثور على حاج برقم الهوية أو الرمز المدخل: (${q})`);
      return;
    }

    await handleRecordAttendance(matchedPilgrim, 'حاضر', 'QR', 'مسح رمز QR للدرس');
    setQrInputIdentifier('');
  };

  // Bulk CSV Import Handler
  const handleBulkImportAttendance = async () => {
    if (!selectedLesson || !bulkImportText.trim()) return;
    const tokens = bulkImportText
      .split(/[\n,;،\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    let importedCount = 0;
    for (const token of tokens) {
      const p = activePilgrims.find((x) => x.nationalId === token || x.mobile === token);
      if (p) {
        await handleRecordAttendance(p, 'حاضر', 'استيراد', 'استيراد جماعي من كشف الحضور');
        importedCount++;
      }
    }
    setIsBulkModalOpen(false);
    setBulkImportText('');
    showBanner('success', `تم استيراد وتسجيل حضور (${importedCount}) حاج بنجاح للدرس الحالي.`);
  };

  // Attendance Summary Stats for Selected Lesson
  const attendanceStats = useMemo(() => {
    let present = 0;
    let excused = 0;
    activePilgrims.forEach((p) => {
      const rec = lessonAttendanceMap[p.id || p.nationalId] || lessonAttendanceMap[p.nationalId];
      const prog = pilgrimProgressMap[p.id || p.nationalId];
      if (rec?.status === 'حاضر' || (!rec && selectedLesson && prog?.completedLessonIds.includes(selectedLesson.id))) {
        present++;
      } else if (rec?.status === 'مستأذن') {
        excused++;
      }
    });
    const absent = Math.max(0, activePilgrims.length - present - excused);
    const rate =
      activePilgrims.length > 0 ? Math.round((present / activePilgrims.length) * 100) : 0;
    return { present, absent, excused, rate };
  }, [activePilgrims, lessonAttendanceMap, pilgrimProgressMap, selectedLesson]);

  // Filtered Pilgrims for Attendance Table
  const filteredAttendancePilgrims = useMemo(() => {
    return activePilgrims.filter((p) => {
      const pid = p.id || p.nationalId;
      const rec = lessonAttendanceMap[pid] || lessonAttendanceMap[p.nationalId];
      const prog = pilgrimProgressMap[pid];
      const effectiveStatus: 'حاضر' | 'غائب' | 'مستأذن' =
        rec?.status ||
        (selectedLesson && prog?.completedLessonIds.includes(selectedLesson.id) ? 'حاضر' : 'غائب');

      if (attendanceFilter !== 'all' && effectiveStatus !== attendanceFilter) return false;
      if (attendanceSearch.trim()) {
        const q = attendanceSearch.trim().toLowerCase();
        const name = getPilgrimDisplayName(p).toLowerCase();
        if (
          !name.includes(q) &&
          !(p.nationalId || '').includes(q) &&
          !(p.mobile || '').includes(q) &&
          !getPilgrimGroupLabel(p).toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [
    activePilgrims,
    lessonAttendanceMap,
    pilgrimProgressMap,
    selectedLesson,
    attendanceFilter,
    attendanceSearch,
  ]);

  // Shared 11 Base Pilgrim Columns Builder for all 3 religious operational rosters
  const buildSharedPilgrimBaseCols = useMemo(() => {
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

    return (defaults: { nationalId?: boolean; mobile?: boolean; marji?: boolean } = {}): DynamicColumnDef<Pilgrim>[] => [
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
        defaultEnabled: defaults.nationalId ?? true,
        isTextProtected: true,
        isLtr: true,
        getValue: (p) => (p.nationalId || '').trim() || '—',
      },
      {
        key: 'mobile',
        label: 'رقم الجوال / الواتساب',
        shortHeader: 'الجوال / الواتساب',
        group: 'shared',
        defaultEnabled: defaults.mobile ?? true,
        isTextProtected: true,
        isLtr: true,
        getValue: (p) => getMobileDisplay(p),
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
        key: 'marji',
        label: 'مرجع التقليد',
        shortHeader: 'مرجع التقليد',
        group: 'shared',
        defaultEnabled: defaults.marji ?? false,
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

  // 1) Lesson Attendance Dynamic Columns
  const attendanceColumns = useMemo<DynamicColumnDef<Pilgrim>[]>(() => {
    const shared = buildSharedPilgrimBaseCols({ nationalId: true, mobile: true, marji: false });
    const core = shared.slice(0, 3);
    const rest = shared.slice(3);
    const domain: DynamicColumnDef<Pilgrim>[] = [
      {
        key: 'campaignGroup',
        label: 'الحملة / المجموعة',
        shortHeader: 'الحملة / المجموعة',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => `${getPilgrimCampaignLabel(p)} — ${getPilgrimGroupLabel(p)}`,
      },
      {
        key: 'attendanceStatus',
        label: 'حالة الحضور الحالية',
        shortHeader: 'حالة الحضور',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const pid = p.id || p.nationalId;
          const rec = lessonAttendanceMap[pid] || lessonAttendanceMap[p.nationalId];
          const prog = pilgrimProgressMap[pid];
          return (
            rec?.status ||
            (selectedLesson && prog?.completedLessonIds.includes(selectedLesson.id) ? 'حاضر' : 'غائب')
          );
        },
      },
      {
        key: 'methodAndApprover',
        label: 'طريقة التسجيل والمعتمد',
        shortHeader: 'الطريقة والمعتمد',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const pid = p.id || p.nationalId;
          const rec = lessonAttendanceMap[pid] || lessonAttendanceMap[p.nationalId];
          if (!rec) return selectedLesson ? `تلقائي (${selectedLesson.guideName})` : '—';
          return `${rec.method} — ${rec.approvedBy}`;
        },
      },
      {
        key: 'attendanceTimestamp',
        label: 'وقت تسجيل الحضور',
        shortHeader: 'وقت التسجيل',
        group: 'specific',
        defaultEnabled: false,
        isTextProtected: true,
        getValue: (p) => {
          const pid = p.id || p.nationalId;
          const rec = lessonAttendanceMap[pid] || lessonAttendanceMap[p.nationalId];
          return rec?.timestamp || selectedLesson?.date || '—';
        },
      },
    ];
    return [...core, ...domain, ...rest];
  }, [buildSharedPilgrimBaseCols, lessonAttendanceMap, pilgrimProgressMap, selectedLesson]);

  const attendanceColsState = usePersistedColumns('religiousAttendance', attendanceColumns);

  // 2) Fiqh Mastery Dynamic Columns
  const fiqhMasteryColumns = useMemo<DynamicColumnDef<Pilgrim>[]>(() => {
    const shared = buildSharedPilgrimBaseCols({ nationalId: true, mobile: true, marji: false });
    const core = shared.slice(0, 3);
    const rest = shared.slice(3);
    const domain: DynamicColumnDef<Pilgrim>[] = [
      {
        key: 'campaignGroup',
        label: 'الحملة / المجموعة',
        shortHeader: 'الحملة / المجموعة',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => `${getPilgrimCampaignLabel(p)} — ${getPilgrimGroupLabel(p)}`,
      },
      {
        key: 'fiqhSectionName',
        label: 'الباب / المسألة الفقهية',
        shortHeader: 'الباب الفقهي',
        group: 'specific',
        defaultEnabled: true,
        getValue: () => selectedMasterySection.name,
      },
      {
        key: 'fiqhMasteryStatus',
        label: 'حالة الإتقان المعتمدة',
        shortHeader: 'حالة الإتقان',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const prog = pilgrimProgressMap[p.id || p.nationalId];
          return getPilgrimSectionMastery(prog, selectedMasterySection);
        },
      },
    ];
    return [...core, ...domain, ...rest];
  }, [buildSharedPilgrimBaseCols, pilgrimProgressMap, selectedMasterySection]);

  const fiqhMasteryColsState = usePersistedColumns('religiousFiqhMastery', fiqhMasteryColumns);

  // 3) Pre/Post Exam Results Dynamic Columns
  const examResultsColumns = useMemo<DynamicColumnDef<Pilgrim>[]>(() => {
    const shared = buildSharedPilgrimBaseCols({ nationalId: true, mobile: false, marji: false });
    const core = shared.slice(0, 3);
    const rest = shared.slice(3);
    const domain: DynamicColumnDef<Pilgrim>[] = [
      {
        key: 'campaignGroup',
        label: 'المجموعة / الحافلة',
        shortHeader: 'المجموعة',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => getPilgrimGroupLabel(p),
      },
      {
        key: 'preTestScore',
        label: 'درجة الاختبار القبلي',
        shortHeader: 'الاختبار القبلي',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => `${pilgrimProgressMap[p.id || p.nationalId]?.preTestScore ?? 60}%`,
      },
      {
        key: 'postTestScore',
        label: 'درجة الاختبار البعدي',
        shortHeader: 'الاختبار البعدي',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => `${pilgrimProgressMap[p.id || p.nationalId]?.postTestScore ?? 82}%`,
      },
      {
        key: 'improvementRate',
        label: 'مقدار التحسن المعرفي',
        shortHeader: 'التحسن المعرفي',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const pr = pilgrimProgressMap[p.id || p.nationalId];
          const diff = (pr?.postTestScore ?? 82) - (pr?.preTestScore ?? 60);
          return `${diff >= 0 ? '+' : ''}${diff}%`;
        },
      },
      {
        key: 'examPassStatus',
        label: 'النتيجة وحالة الاجتياز',
        shortHeader: 'النتيجة',
        group: 'specific',
        defaultEnabled: true,
        getValue: (p) => {
          const post = pilgrimProgressMap[p.id || p.nationalId]?.postTestScore ?? 82;
          return post >= 75 ? 'مجتاز بنجاح' : 'يحتاج إعادة تقييم';
        },
      },
    ];
    return [...core, ...domain, ...rest];
  }, [buildSharedPilgrimBaseCols, pilgrimProgressMap]);

  const examResultsColsState = usePersistedColumns('religiousExamResults', examResultsColumns);

  const handleExportAttendanceCSV = () => {
    if (!selectedLesson || attendanceColsState.activeColumns.length === 0) return;
    const headers = [
      '#',
      ...attendanceColsState.activeColumns.map((c) => c.shortHeader || c.label),
    ];
    const rows = filteredAttendancePilgrims.map((p, idx) => [
      idx + 1,
      ...attendanceColsState.activeColumns.map((c) => c.getValue(p, idx)),
    ]);
    exportReligiousReportCSV(
      `كشف_حضور_${selectedLesson.title.slice(0, 20)}`,
      headers,
      rows,
      [
        { label: 'الحاضرون', value: attendanceStats.present },
        { label: 'الغائبون', value: attendanceStats.absent },
        { label: 'المستأذنون', value: attendanceStats.excused },
        { label: 'نسبة الحضور', value: `${attendanceStats.rate}%` },
      ],
      `كشف الحضور والغياب — ${selectedLesson.title}`
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      {feedbackBanner && (
        <div
          className={`px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between border animate-fadeIn ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400" />
            )}
            <span>{feedbackBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-xs underline"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* UNIT 6: ATTENDANCE & ABSENCE TRACKING WITH QR */}
      {mode === 'attendanceTracking' && selectedLesson && (
        <div className="space-y-5">
          {/* Lesson Selector & QR Check-in Card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-[#0B1221] border border-slate-800 rounded-3xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-amber-400" />
                    <span>نظام تسجيل الحضور والغياب الذكي (QR + يدوي + استيراد)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    يمنع تكرار التحضير لنفس الحاج في نفس الدرس، ويوثق اسم المشرف المعتمد وسجل التعديلات
                  </p>
                </div>

                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setIsBulkModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>استيراد حضور من ملف</span>
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  اختر الدرس أو المحاضرة لتسجيل وعرض الحضور:
                </label>
                <select
                  value={selectedLesson.id}
                  onChange={(e) => setSelectedLessonId(e.target.value)}
                  className="w-full bg-[#10192D] border border-amber-500/40 rounded-2xl px-4 py-3 text-xs sm:text-sm font-black text-white focus:outline-none focus:border-amber-400"
                >
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title} — ({l.date} | {l.guideName}) [{l.qrCodeToken}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick QR Scanner / ID Input Simulator */}
              <form
                onSubmit={handleQrQuickScan}
                className="bg-[#10192D] border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
              >
                <div className="flex-1">
                  <label className="block text-[11px] font-bold text-amber-400 mb-1">
                    قارئ الباركود / مسح رمز QR للحاج أو إدخال رقم الهوية الفوري:
                  </label>
                  <input
                    type="text"
                    value={qrInputIdentifier}
                    onChange={(e) => setQrInputIdentifier(e.target.value)}
                    placeholder="مرر قارئ QR هنا أو أدخل رقم هوية الحاج / الجوال لتسجيل حضوره فوراً..."
                    className="w-full bg-[#0B1221] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 sm:mt-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow cursor-pointer shrink-0"
                >
                  <QrCode className="w-4 h-4" />
                  <span>تسجيل حضور فوري (QR)</span>
                </button>
              </form>

              {/* Lesson Attendance Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-3 text-center">
                  <span className="text-[11px] text-slate-400 block">الحاضرون</span>
                  <strong className="text-lg font-black text-emerald-400 font-mono">
                    {attendanceStats.present}
                  </strong>
                </div>
                <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-3 text-center">
                  <span className="text-[11px] text-slate-400 block">الغائبون</span>
                  <strong className="text-lg font-black text-rose-400 font-mono">
                    {attendanceStats.absent}
                  </strong>
                </div>
                <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-3 text-center">
                  <span className="text-[11px] text-slate-400 block">المستأذنون</span>
                  <strong className="text-lg font-black text-amber-400 font-mono">
                    {attendanceStats.excused}
                  </strong>
                </div>
                <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-3 text-center">
                  <span className="text-[11px] text-slate-400 block">نسبة حضور الدرس</span>
                  <strong className="text-lg font-black text-sky-400 font-mono">
                    {attendanceStats.rate}%
                  </strong>
                </div>
              </div>
            </div>

            {/* Visual Unique QR Code Card for the Selected Lesson */}
            <div className="bg-[#0B1221] border border-amber-500/35 rounded-3xl p-5 flex flex-col items-center justify-between text-center space-y-3 shadow-xl">
              <div>
                <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-black border border-amber-500/30">
                  رمز QR الفريد للدرس
                </span>
                <h4 className="text-sm font-black text-white mt-2 line-clamp-2">
                  {selectedLesson.title}
                </h4>
              </div>

              <div className="bg-white p-3.5 rounded-2xl shadow-inner border-4 border-amber-400/60">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                    `QAEM-LESSON:${selectedLesson.id}:${selectedLesson.qrCodeToken}`
                  )}`}
                  alt={selectedLesson.qrCodeToken}
                  className="w-36 h-36 object-contain mx-auto"
                />
              </div>

              <div className="space-y-1">
                <div className="font-mono text-xs font-black text-amber-400 bg-[#10192D] px-3 py-1 rounded-lg border border-slate-800">
                  {selectedLesson.qrCodeToken}
                </div>
                <p className="text-[11px] text-slate-400">
                  المرشد: {selectedLesson.guideName} • {selectedLesson.date}
                </p>
              </div>
            </div>
          </div>

          {/* Search, Filter & Export Attendance Bar */}
          <div className="bg-[#0B1221] border border-slate-800 rounded-3xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={attendanceSearch}
                  onChange={(e) => setAttendanceSearch(e.target.value)}
                  placeholder="بحث باسم الحاج، رقم الهوية، أو المجموعة..."
                  className="w-full bg-[#10192D] border border-slate-700 rounded-xl pr-10 pl-4 py-2 text-xs text-white"
                />
              </div>
              <div className="flex items-center gap-1.5">
                {(['all', 'حاضر', 'غائب', 'مستأذن'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setAttendanceFilter(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      attendanceFilter === st
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                        : 'bg-[#10192D] text-slate-300 border-slate-800'
                    }`}
                  >
                    {st === 'all' ? 'الكل' : st}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const cols = [
                    '#',
                    ...attendanceColsState.activeColumns.map((c) => c.shortHeader || c.label),
                  ];
                  const rows = filteredAttendancePilgrims.map((p, idx) => [
                    idx + 1,
                    ...attendanceColsState.activeColumns.map((c) => c.getValue(p, idx)),
                  ]);
                  const filterParts: string[] = [];
                  if (attendanceFilter !== 'all') filterParts.push(`الحالة: ${attendanceFilter}`);
                  if (attendanceSearch.trim()) filterParts.push(`بحث: "${attendanceSearch.trim()}"`);
                  onPrintReport(
                    `كشف الحضور والغياب — ${selectedLesson.title}`,
                    cols,
                    rows,
                    [
                      { label: 'الحاضرون', value: attendanceStats.present },
                      { label: 'الغائبون', value: attendanceStats.absent },
                      { label: 'المستأذنون', value: attendanceStats.excused },
                      { label: 'نسبة الحضور', value: `${attendanceStats.rate}%` },
                    ],
                    `تاريخ الدرس: ${selectedLesson.date} • المرشد: ${selectedLesson.guideName} • رمز QR: ${selectedLesson.qrCodeToken}`,
                    filterParts.length > 0 ? filterParts.join(' • ') : undefined
                  );
                }}
                disabled={attendanceColsState.activeColumns.length === 0}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow transition active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة / حفظ PDF ({filteredAttendancePilgrims.length})</span>
              </button>
              <button
                type="button"
                disabled={attendanceColsState.activeColumns.length === 0}
                onClick={handleExportAttendanceCSV}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow transition active:scale-95"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير Excel (.xlsx) ({filteredAttendancePilgrims.length})</span>
              </button>
            </div>
          </div>

          {/* Dynamic Column Selector Panel for Attendance Roster */}
          <DynamicColumnSelectorPanel
            title="تخصيص أعمدة وحقول كشف حضور الدروس"
            columns={attendanceColumns}
            selectedMap={attendanceColsState.selectedMap}
            onToggle={attendanceColsState.toggleColumn}
            onSelectAll={attendanceColsState.selectAll}
            onDeselectAll={attendanceColsState.deselectAll}
            onResetDefaults={attendanceColsState.resetDefaults}
            specificGroupLabel="أعمدة حضور الدرس والمحاضرة"
            sharedGroupLabel="البيانات الأساسية للحاج (مشتركة)"
            defaultOpen={false}
            darkSurfaceOnly
          />

          {/* Attendance Roster Table */}
          <div className="bg-[#0B1221] border border-slate-800 rounded-3xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs text-slate-300">
                <thead className="bg-[#10192D] text-slate-300 border-b border-slate-800 font-bold">
                  <tr>
                    <th className="px-4 py-3 text-center w-12">#</th>
                    {attendanceColsState.activeColumns.map((col) => (
                      <th key={col.key} className="px-4 py-3 whitespace-nowrap">
                        {col.shortHeader || col.label}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center whitespace-nowrap">التحضير اليدوي وتعديل الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {attendanceColsState.activeColumns.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-10 text-center text-rose-400 font-bold">
                        يرجى تحديد عمود واحد على الأقل من لوحة «تخصيص أعمدة وحقول الكشف» أعلاه.
                      </td>
                    </tr>
                  ) : (
                    filteredAttendancePilgrims.map((pilgrim, idx) => {
                      const pid = pilgrim.id || pilgrim.nationalId;
                      const rec = lessonAttendanceMap[pid] || lessonAttendanceMap[pilgrim.nationalId];
                      const prog = pilgrimProgressMap[pid];
                      const effectiveStatus: 'حاضر' | 'غائب' | 'مستأذن' =
                        rec?.status ||
                        (prog?.completedLessonIds.includes(selectedLesson.id) ? 'حاضر' : 'غائب');

                      return (
                        <tr key={pid} className="hover:bg-[#10192D]/60 transition">
                          <td className="px-4 py-3 text-center font-mono text-slate-400">
                            {idx + 1}
                          </td>
                          {attendanceColsState.activeColumns.map((col) => {
                            if (col.key === 'fullName') {
                              return (
                                <td key={col.key} className="px-4 py-3 font-black text-white">
                                  {getPilgrimDisplayName(pilgrim)}
                                </td>
                              );
                            }
                            if (col.key === 'campaignGroup') {
                              return (
                                <td key={col.key} className="px-4 py-3">
                                  <div className="font-bold text-amber-300">
                                    {getPilgrimCampaignLabel(pilgrim)}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {getPilgrimGroupLabel(pilgrim)}
                                  </div>
                                </td>
                              );
                            }
                            if (col.key === 'attendanceStatus') {
                              return (
                                <td key={col.key} className="px-4 py-3 text-center">
                                  <span
                                    className={`px-3 py-1 rounded-full text-xs font-black border whitespace-nowrap ${
                                      effectiveStatus === 'حاضر'
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                        : effectiveStatus === 'مستأذن'
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                    }`}
                                  >
                                    {effectiveStatus}
                                  </span>
                                </td>
                              );
                            }
                            if (col.key === 'methodAndApprover') {
                              return (
                                <td key={col.key} className="px-4 py-3 text-center text-[11px]">
                                  {rec ? (
                                    <div>
                                      <span className="font-bold text-sky-300">[{rec.method}]</span> • معتمد من:{' '}
                                      <span className="text-white font-bold">{rec.approvedBy}</span>
                                      <div className="text-[10px] text-slate-400 font-mono">
                                        {rec.timestamp}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-slate-500">—</span>
                                  )}
                                </td>
                              );
                            }
                            if (col.key === 'signatureNotes') {
                              return (
                                <td key={col.key} className="px-4 py-3">
                                  <div className="min-w-[100px] h-5 border-b border-dashed border-slate-700" />
                                </td>
                              );
                            }
                            return (
                              <td
                                key={col.key}
                                className={`px-4 py-3 ${col.isTextProtected ? 'font-mono text-slate-200' : 'text-slate-300'}`}
                                dir={col.isLtr ? 'ltr' : 'rtl'}
                              >
                                {col.getValue(pilgrim, idx)}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                disabled={!canEdit}
                                onClick={() =>
                                  handleRecordAttendance(pilgrim, 'حاضر', 'يدوي', 'تحضير يدوي من المشرف')
                                }
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 font-bold text-[11px] transition cursor-pointer"
                              >
                                حاضر ✓
                              </button>
                              <button
                                type="button"
                                disabled={!canEdit}
                                onClick={() =>
                                  handleRecordAttendance(pilgrim, 'مستأذن', 'يدوي', 'تسجيل استئذان')
                                }
                                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold text-[11px] transition cursor-pointer"
                              >
                                مستأذن
                              </button>
                              <button
                                type="button"
                                disabled={!canEdit}
                                onClick={() =>
                                  handleRecordAttendance(pilgrim, 'غائب', 'يدوي', 'تسجيل غياب')
                                }
                                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white font-bold text-[11px] transition cursor-pointer"
                              >
                                غائب
                              </button>
                              {rec?.auditLogs && rec.auditLogs.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedAuditRecord(rec)}
                                  className="p-1.5 rounded-lg bg-slate-800 text-amber-400 hover:bg-slate-700"
                                  title="سجل تعديلات الحضور"
                                >
                                  <History className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* UNIT 7: ASSESSMENTS, QUESTION BANK & FIQH MASTERY */}
      {mode === 'assessmentsAndMastery' && (
        <div className="space-y-5">
          {/* Sub-navigation bar */}
          <div className="bg-[#0B1221] border border-slate-800 rounded-3xl p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div>
              <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <span>الاختبارات وبنك الأسئلة وقياس إتقان المسائل الفقهية</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                قياس الفهم الحقيقي للحاج (الحضور وحده لا يعني إتقان المسألة) ومقارنة الاختبار القبلي والبعدي
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAssessmentSubTab('masteryTracker')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                  assessmentSubTab === 'masteryTracker'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-[#10192D] text-slate-300 border border-slate-800'
                }`}
              >
                سجل إتقان المسائل الفقهية (5 حالات)
              </button>
              <button
                type="button"
                onClick={() => setAssessmentSubTab('prePostComparison')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                  assessmentSubTab === 'prePostComparison'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-[#10192D] text-slate-300 border border-slate-800'
                }`}
              >
                الاختبار القبلي والبعدي وقياس الأثر
              </button>
              <button
                type="button"
                onClick={() => setAssessmentSubTab('questionBank')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                  assessmentSubTab === 'questionBank'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-[#10192D] text-slate-300 border border-slate-800'
                }`}
              >
                بنك الأسئلة المحكّم ({questions.length} سؤال)
              </button>
            </div>
          </div>

          {/* 1. Mastery Tracker View */}
          {assessmentSubTab === 'masteryTracker' && (
            <div className="space-y-4">
              <div className="bg-[#0B1221] border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4">
                {/* Header & Admin Section Controls */}
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-xs sm:text-sm font-black text-amber-400">
                        اختر الباب / المسألة الفقهية لمتابعة وتحديث مستوى إتقان الحجاج:
                      </label>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                        الأقسام الظاهرة: {visibleSections.length}
                      </span>
                      {canManageSections && orderedSections.length !== visibleSections.length && (
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-bold">
                          المخفية: {orderedSections.length - visibleSections.length}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      مرتبطة ديناميكياً بمعرف القسم الفريد ({selectedMasterySection?.id}) في قاعدة البيانات لضمان عدم فقدان بيانات الإتقان أو المسائل عند تعديل الاسم أو الترتيب
                    </p>
                  </div>

                  {/* Role & Admin Management Buttons */}
                  {canManageSections ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const nextSim = !simulateUserView;
                          setSimulateUserView(nextSim);
                          if (nextSim) setIsSectionManagerOpen(false);
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer ${
                          simulateUserView
                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                            : 'bg-[#10192D] text-slate-300 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>
                          {simulateUserView
                            ? 'واجهة المستخدم العادية (للعرض فقط) — اضغط للعودة لوضع المسؤول'
                            : 'معاينة واجهة المستخدم العادية'}
                        </span>
                      </button>

                      {!simulateUserView && (
                        <button
                          type="button"
                          onClick={() => setIsSectionManagerOpen((prev) => !prev)}
                          className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow transition cursor-pointer ${
                            isSectionManagerOpen
                              ? 'bg-amber-500 text-slate-950 border border-amber-400'
                              : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          <Settings2 className="w-4 h-4" />
                          <span>
                            {isSectionManagerOpen
                              ? 'إغلاق لوحة إدارة الأبواب الفقهية'
                              : 'إدارة أبواب المسائل الفقهية (إضافة • تعديل • ترتيب • إخفاء)'}
                          </span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="px-3 py-1.5 rounded-xl bg-[#10192D] border border-slate-800 text-[11px] text-slate-400 font-bold">
                      وضع العرض والاستخدام (إدارة الأبواب متاحة للمسؤول فقط)
                    </span>
                  )}
                </div>

                {/* ADMIN FIQH SECTIONS MANAGEMENT PANEL */}
                {isSectionManagerOpen && isAdminSectionManagerActive && (
                  <div className="bg-[#10192D] border border-amber-500/40 rounded-2xl p-4 sm:p-5 space-y-4 animate-fadeIn">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                      <div>
                        <h4 className="text-sm font-black text-white flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-amber-400" />
                          <span>لوحة تحكم المسؤول في أبواب المسائل الفقهية ({orderedSections.length} باباً)</span>
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          اسحب وأفلت أي قسم لتغيير ترتيبه، أو عدّل اسمه، أو أخفِه/أظهره دون حذفه. جميع التعديلات تُحفظ تلقائياً في قاعدة البيانات ومرتبطة بمعرف القسم (ID).
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          await onRestoreDefaultFiqhSections();
                          showBanner(
                            'success',
                            'تمت استعادة وتأكيد جميع الأقسام الافتراضية الـ 14 في قاعدة البيانات.'
                          );
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                        <span>استعادة الأقسام الافتراضية (14)</span>
                      </button>
                    </div>

                    {/* Add New Fiqh Section Form */}
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const trimmed = newSectionName.trim();
                        if (!trimmed) return;
                        if (orderedSections.some((s) => s.name === trimmed)) {
                          showBanner('warning', `القسم الفقهي "${trimmed}" موجود بالفعل في القائمة.`);
                          return;
                        }
                        const newSec: FiqhSection = {
                          id: `sec-${Date.now()}`,
                          name: trimmed,
                          originalDefaultName: trimmed,
                          order: orderedSections.length + 1,
                          isVisible: true,
                          createdAt: new Date().toISOString().split('T')[0],
                        };
                        await onSaveFiqhSection(newSec);
                        setNewSectionName('');
                        setSelectedMasterySectionId(newSec.id);
                        showBanner(
                          'success',
                          `تمت إضافة الباب الفقهي الجديد "${trimmed}" وحفظه في قاعدة البيانات بنجاح.`
                        );
                      }}
                      className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 bg-[#0B1221] border border-slate-800 p-3 rounded-2xl"
                    >
                      <input
                        type="text"
                        value={newSectionName}
                        onChange={(e) => setNewSectionName(e.target.value)}
                        placeholder="أدخل اسم الباب الفقهي الجديد لإضافته (مثال: أحكام النيابة في الحج)..."
                        className="flex-1 bg-[#10192D] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow cursor-pointer shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>إضافة قسم جديد</span>
                      </button>
                    </form>

                    {/* Draggable Sections List */}
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {orderedSections.map((sec, index) => {
                        const isEditingThis = editingSectionId === sec.id;
                        const linkedQuestionsCount = questions.filter(
                          (q) =>
                            q.sectionId === sec.id ||
                            q.chapter === sec.id ||
                            q.chapter === sec.name ||
                            (sec.originalDefaultName && q.chapter === sec.originalDefaultName)
                        ).length;
                        const linkedLessonsCount = lessons.filter(
                          (l) =>
                            l.sectionId === sec.id ||
                            l.category === sec.id ||
                            l.category === sec.name ||
                            (sec.originalDefaultName && l.category === sec.originalDefaultName)
                        ).length;

                        return (
                          <div
                            key={sec.id}
                            draggable={!isEditingThis}
                            onDragStart={() => setDraggedSectionId(sec.id)}
                            onDragOver={(e) => {
                              e.preventDefault();
                              if (draggedSectionId && draggedSectionId !== sec.id) {
                                setDragOverSectionId(sec.id);
                              }
                            }}
                            onDragLeave={() => {
                              if (dragOverSectionId === sec.id) {
                                setDragOverSectionId(null);
                              }
                            }}
                            onDrop={async (e) => {
                              e.preventDefault();
                              setDragOverSectionId(null);
                              if (!draggedSectionId || draggedSectionId === sec.id) return;
                              const fromIdx = orderedSections.findIndex(
                                (x) => x.id === draggedSectionId
                              );
                              const toIdx = orderedSections.findIndex((x) => x.id === sec.id);
                              if (fromIdx < 0 || toIdx < 0) return;
                              const reordered = [...orderedSections];
                              const [moved] = reordered.splice(fromIdx, 1);
                              reordered.splice(toIdx, 0, moved);
                              setDraggedSectionId(null);
                              await onReorderFiqhSections(reordered);
                              showBanner(
                                'success',
                                `تم تحديث ترتيب الأبواب الفقهية وحفظ الترتيب الجديد في قاعدة البيانات.`
                              );
                            }}
                            onDragEnd={() => {
                              setDraggedSectionId(null);
                              setDragOverSectionId(null);
                            }}
                            className={`p-3 rounded-2xl border transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                              dragOverSectionId === sec.id
                                ? 'bg-amber-500/15 border-amber-400 shadow-lg'
                                : sec.isVisible
                                ? 'bg-[#0B1221] border-slate-800 hover:border-slate-700'
                                : 'bg-[#0B1221]/60 border-slate-800/60 opacity-75'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 flex-1 min-w-0 w-full">
                              <div
                                className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-amber-400 p-1 rounded-lg bg-[#10192D] border border-slate-800 shrink-0"
                                title="اسحب وأفلت لتغيير ترتيب القسم"
                              >
                                <GripVertical className="w-4 h-4" />
                              </div>

                              <span className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono text-xs font-black flex items-center justify-center shrink-0">
                                {index + 1}
                              </span>

                              {isEditingThis ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    type="text"
                                    value={editingSectionName}
                                    onChange={(e) => setEditingSectionName(e.target.value)}
                                    className="flex-1 bg-[#10192D] border border-amber-400 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const nextName = editingSectionName.trim();
                                      if (!nextName) return;
                                      await onSaveFiqhSection({
                                        ...sec,
                                        name: nextName,
                                        updatedAt: new Date().toISOString().split('T')[0],
                                      });
                                      setEditingSectionId(null);
                                      showBanner(
                                        'success',
                                        `تم تعديل اسم القسم إلى "${nextName}" مع الحفاظ الكامل على ارتباط جميع المسائل وسجلات الحجاج عبر المعرف (${sec.id}).`
                                      );
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs flex items-center gap-1 cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>حفظ</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingSectionId(null)}
                                    className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                      className={`text-xs sm:text-sm font-black truncate ${
                                        sec.isVisible ? 'text-white' : 'text-slate-400 line-through'
                                      }`}
                                    >
                                      {sec.name}
                                    </span>
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10192D] text-slate-400 border border-slate-800">
                                      ID: {sec.id}
                                    </span>
                                    {!sec.isVisible && (
                                      <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[10px] font-bold">
                                        مخفي عن العرض
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
                                    <span>الأسئلة المرتبطة: {linkedQuestionsCount}</span>
                                    <span>•</span>
                                    <span>الدروس المرتبطة: {linkedLessonsCount}</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Action Buttons for Section */}
                            {!isEditingThis && (
                              <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                                {/* Move Up */}
                                <button
                                  type="button"
                                  disabled={index === 0}
                                  onClick={async () => {
                                    if (index === 0) return;
                                    const reordered = [...orderedSections];
                                    const temp = reordered[index - 1];
                                    reordered[index - 1] = reordered[index];
                                    reordered[index] = temp;
                                    await onReorderFiqhSections(reordered);
                                    showBanner('success', 'تم تقديم ترتيب الباب الفقهي وحفظه.');
                                  }}
                                  className="p-1.5 rounded-lg bg-[#10192D] hover:bg-slate-800 disabled:opacity-30 text-slate-300 border border-slate-800 cursor-pointer"
                                  title="تحريك لأعلى"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>

                                {/* Move Down */}
                                <button
                                  type="button"
                                  disabled={index === orderedSections.length - 1}
                                  onClick={async () => {
                                    if (index === orderedSections.length - 1) return;
                                    const reordered = [...orderedSections];
                                    const temp = reordered[index + 1];
                                    reordered[index + 1] = reordered[index];
                                    reordered[index] = temp;
                                    await onReorderFiqhSections(reordered);
                                    showBanner('success', 'تم تأخير ترتيب الباب الفقهي وحفظه.');
                                  }}
                                  className="p-1.5 rounded-lg bg-[#10192D] hover:bg-slate-800 disabled:opacity-30 text-slate-300 border border-slate-800 cursor-pointer"
                                  title="تحريك لأسفل"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>

                                {/* Toggle Visibility (Show/Hide without deleting) */}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const nextVis = !sec.isVisible;
                                    if (!nextVis && visibleSections.length <= 1) {
                                      showBanner(
                                        'warning',
                                        'يجب إبقاء باب فقهي واحد ظاهر على الأقل للعرض.'
                                      );
                                      return;
                                    }
                                    await onSaveFiqhSection({
                                      ...sec,
                                      isVisible: nextVis,
                                      updatedAt: new Date().toISOString().split('T')[0],
                                    });
                                    showBanner(
                                      'success',
                                      nextVis
                                        ? `تم إظهار الباب الفقهي "${sec.name}" في واجهة العرض.`
                                        : `تم إخفاء الباب الفقهي "${sec.name}" دون حذفه أو المساس ببياناته.`
                                    );
                                  }}
                                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1 transition cursor-pointer ${
                                    sec.isVisible
                                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                                  }`}
                                  title="إخفاء أو إظهار القسم دون حذفه"
                                >
                                  {sec.isVisible ? (
                                    <>
                                      <Eye className="w-3.5 h-3.5" />
                                      <span>ظاهر</span>
                                    </>
                                  ) : (
                                    <>
                                      <EyeOff className="w-3.5 h-3.5" />
                                      <span>مخفي</span>
                                    </>
                                  )}
                                </button>

                                {/* Edit Name */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingSectionId(sec.id);
                                    setEditingSectionName(sec.name);
                                  }}
                                  className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>تعديل الاسم</span>
                                </button>

                                {/* Safe Delete Section */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (orderedSections.length <= 1) {
                                      showBanner(
                                        'warning',
                                        'لا يمكن حذف القسم الوحيد المتبقي في النظام.'
                                      );
                                      return;
                                    }
                                    const defaultFallback =
                                      orderedSections.find((s) => s.id !== sec.id) ||
                                      orderedSections[0];
                                    setFallbackSectionIdForDelete(defaultFallback.id);
                                    setSectionToDelete(sec);
                                  }}
                                  className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>حذف</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Dynamic Visible Fiqh Sections Selection Bar */}
                <div className="flex flex-wrap gap-1.5">
                  {visibleSections.map((sec) => {
                    const isSelected = selectedMasterySection?.id === sec.id;
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        draggable={isAdminSectionManagerActive}
                        onDragStart={() => {
                          if (isAdminSectionManagerActive) setDraggedSectionId(sec.id);
                        }}
                        onDragOver={(e) => {
                          if (isAdminSectionManagerActive) {
                            e.preventDefault();
                            setDragOverSectionId(sec.id);
                          }
                        }}
                        onDrop={async (e) => {
                          if (!isAdminSectionManagerActive) return;
                          e.preventDefault();
                          setDragOverSectionId(null);
                          if (!draggedSectionId || draggedSectionId === sec.id) return;
                          const fromIdx = orderedSections.findIndex(
                            (x) => x.id === draggedSectionId
                          );
                          const toIdx = orderedSections.findIndex((x) => x.id === sec.id);
                          if (fromIdx < 0 || toIdx < 0) return;
                          const reordered = [...orderedSections];
                          const [moved] = reordered.splice(fromIdx, 1);
                          reordered.splice(toIdx, 0, moved);
                          setDraggedSectionId(null);
                          await onReorderFiqhSections(reordered);
                          showBanner(
                            'success',
                            'تم تغيير ترتيب الأبواب الفقهية بالسحب والإفلات وحفظه في قاعدة البيانات.'
                          );
                        }}
                        onDragEnd={() => {
                          setDraggedSectionId(null);
                          setDragOverSectionId(null);
                        }}
                        onClick={() => setSelectedMasterySectionId(sec.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow'
                            : dragOverSectionId === sec.id
                            ? 'bg-amber-500/20 text-amber-300 border-amber-400'
                            : 'bg-[#10192D] text-slate-300 border-slate-800 hover:border-amber-500/40'
                        }`}
                      >
                        {isAdminSectionManagerActive && (
                          <GripVertical
                            className={`w-3 h-3 ${
                              isSelected ? 'text-slate-900' : 'text-slate-500'
                            }`}
                          />
                        )}
                        <span>{sec.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0B1221] border border-slate-800 rounded-2xl p-3">
                <div className="text-xs text-slate-300 font-bold">
                  كشف الباب الفقهي: <span className="text-amber-400">{selectedMasterySection.name}</span> ({activePilgrims.length} حاج)
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={fiqhMasteryColsState.activeColumns.length === 0}
                    onClick={() => {
                      const cols = [
                        '#',
                        ...fiqhMasteryColsState.activeColumns.map((c) => c.shortHeader || c.label),
                      ];
                      const rows = activePilgrims.map((p, idx) => [
                        idx + 1,
                        ...fiqhMasteryColsState.activeColumns.map((c) => c.getValue(p, idx)),
                      ]);
                      onPrintReport(
                        `كشف إتقان المسائل الفقهية — ${selectedMasterySection.name}`,
                        cols,
                        rows,
                        [{ label: 'إجمالي الحجاج بالكشف', value: activePilgrims.length }],
                        undefined,
                        `الباب الفقهي: ${selectedMasterySection.name}`
                      );
                    }}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow transition"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة / حفظ PDF ({activePilgrims.length})</span>
                  </button>
                  <button
                    type="button"
                    disabled={fiqhMasteryColsState.activeColumns.length === 0}
                    onClick={() => {
                      const headers = [
                        '#',
                        ...fiqhMasteryColsState.activeColumns.map((c) => c.shortHeader || c.label),
                      ];
                      const rows = activePilgrims.map((p, idx) => [
                        idx + 1,
                        ...fiqhMasteryColsState.activeColumns.map((c) => c.getValue(p, idx)),
                      ]);
                      exportReligiousReportCSV(
                        `كشف_إتقان_${selectedMasterySection.name.slice(0, 20)}`,
                        headers,
                        rows,
                        [{ label: 'إجمالي الحجاج', value: activePilgrims.length }],
                        `كشف إتقان المسائل الفقهية — ${selectedMasterySection.name}`
                      );
                    }}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow transition"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>تصدير Excel (.xlsx) ({activePilgrims.length})</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Column Selector Panel for Fiqh Mastery */}
              <DynamicColumnSelectorPanel
                title="تخصيص أعمدة وحقول كشف التقييم الفقهي"
                columns={fiqhMasteryColumns}
                selectedMap={fiqhMasteryColsState.selectedMap}
                onToggle={fiqhMasteryColsState.toggleColumn}
                onSelectAll={fiqhMasteryColsState.selectAll}
                onDeselectAll={fiqhMasteryColsState.deselectAll}
                onResetDefaults={fiqhMasteryColsState.resetDefaults}
                specificGroupLabel="أعمدة التقييم والإتقان الفقهي"
                sharedGroupLabel="البيانات الأساسية للحاج (مشتركة)"
                defaultOpen={false}
                darkSurfaceOnly
              />

              <div className="bg-[#0B1221] border border-slate-800 rounded-3xl overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs text-slate-300">
                    <thead className="bg-[#10192D] border-b border-slate-800 font-bold">
                      <tr>
                        <th className="px-4 py-3 text-center w-12">#</th>
                        {fiqhMasteryColsState.activeColumns.map((col) => (
                          <th key={col.key} className="px-4 py-3 whitespace-nowrap">
                            {col.shortHeader || col.label}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-center whitespace-nowrap">إجراء إعادة التوعية</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {fiqhMasteryColsState.activeColumns.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="py-10 text-center text-rose-400 font-bold">
                            يرجى تحديد عمود واحد على الأقل من لوحة «تخصيص أعمدة وحقول الكشف» أعلاه.
                          </td>
                        </tr>
                      ) : (
                        activePilgrims.map((p, idx) => {
                          const pid = p.id || p.nationalId;
                          const prog = pilgrimProgressMap[pid];
                          const currentStatus = getPilgrimSectionMastery(
                            prog,
                            selectedMasterySection
                          );

                          return (
                            <tr key={pid} className="hover:bg-[#10192D]/60 transition">
                              <td className="px-4 py-3 text-center font-mono text-slate-400">
                                {idx + 1}
                              </td>
                              {fiqhMasteryColsState.activeColumns.map((col) => {
                                if (col.key === 'fullName') {
                                  return (
                                    <td key={col.key} className="px-4 py-3 font-black text-white">
                                      {getPilgrimDisplayName(p)}
                                    </td>
                                  );
                                }
                                if (col.key === 'campaignGroup') {
                                  return (
                                    <td key={col.key} className="px-4 py-3">
                                      <div className="font-bold text-amber-300">
                                        {getPilgrimCampaignLabel(p)}
                                      </div>
                                      <div className="text-[11px] text-slate-400">
                                        {getPilgrimGroupLabel(p)}
                                      </div>
                                    </td>
                                  );
                                }
                                if (col.key === 'fiqhSectionName') {
                                  return (
                                    <td key={col.key} className="px-4 py-3 text-center">
                                      <div className="font-bold text-white">
                                        {selectedMasterySection.name}
                                      </div>
                                      <div className="text-[10px] font-mono text-slate-500">
                                        {selectedMasterySection.id}
                                      </div>
                                    </td>
                                  );
                                }
                                if (col.key === 'fiqhMasteryStatus') {
                                  return (
                                    <td key={col.key} className="px-4 py-3 text-center">
                                      <select
                                        disabled={!canEdit}
                                        value={currentStatus}
                                        onChange={async (e) => {
                                          if (!prog) return;
                                          const nextSt = e.target.value as FiqhMasteryStatus;
                                          const nextMap = setPilgrimSectionMastery(
                                            prog.fiqhIssuesMastery,
                                            selectedMasterySection,
                                            nextSt
                                          );
                                          await onSavePilgrimProgress({
                                            ...prog,
                                            fiqhIssuesMastery: nextMap,
                                            needsReeducation: Object.values(nextMap).some(
                                              (s) => s === 'يحتاج إلى مراجعة وإعادة توعية'
                                            ),
                                            lastUpdated: new Date().toISOString().split('T')[0],
                                          });
                                          showBanner(
                                            'success',
                                            `تم تحديث حالة إتقان الحاج ${getPilgrimDisplayName(p)} في "${selectedMasterySection.name}" إلى (${nextSt}).`
                                          );
                                        }}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                                          currentStatus === 'اجتاز التقييم'
                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                            : currentStatus === 'يحتاج إلى مراجعة وإعادة توعية'
                                            ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                                            : 'bg-[#10192D] text-slate-200 border-slate-700'
                                        }`}
                                      >
                                        {FIQH_MASTERY_STATUSES.map((st) => (
                                          <option key={st} value={st} className="bg-slate-900 text-white">
                                            {st}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                  );
                                }
                                if (col.key === 'signatureNotes') {
                                  return (
                                    <td key={col.key} className="px-4 py-3">
                                      <div className="min-w-[100px] h-5 border-b border-dashed border-slate-700" />
                                    </td>
                                  );
                                }
                                return (
                                  <td
                                    key={col.key}
                                    className={`px-4 py-3 ${col.isTextProtected ? 'font-mono text-slate-200' : 'text-slate-300'}`}
                                    dir={col.isLtr ? 'ltr' : 'rtl'}
                                  >
                                    {col.getValue(p, idx)}
                                  </td>
                                );
                              })}
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await onSendNotification({
                                      title: `مراجعة فقهية مهمة: ${selectedMasterySection.name}`,
                                      body: `نرجو منكم مراجعة المادة التعليمية الخاصة بـ (${selectedMasterySection.name}) أو التواصل مع المرشد الديني لمجموعتكم لاستكمال التقييم.`,
                                      targetType: 'individual',
                                      targetValue: p.nationalId,
                                      auditActionLabel: 'إرسال إشعار إعادة توعية في مسألة فقهية',
                                    });
                                    showBanner(
                                      'success',
                                      `تم إرسال تنبيه إعادة التوعية للحاج ${getPilgrimDisplayName(p)} عبر نظام الإشعارات الحالي.`
                                    );
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                >
                                  <Send className="w-3 h-3" />
                                  <span>إرسال تنبيه مراجعة</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 2. Pre-Test vs Post-Test Comparison */}
          {assessmentSubTab === 'prePostComparison' && (
            <div className="bg-[#0B1221] border border-slate-800 rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h4 className="text-sm sm:text-base font-black text-white">
                    مقارنة نتائج الاختبار القبلي والاختبار البعدي لقياس التحسن المعرفي
                  </h4>
                  <p className="text-xs text-slate-400">
                    درجة الاجتياز المعتمدة: 75% • الحجاج الحاصلون على أقل من درجة النجاح يدرجون تلقائياً في قائمة إعادة التوعية
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={examResultsColsState.activeColumns.length === 0}
                    onClick={() => {
                      const cols = [
                        '#',
                        ...examResultsColsState.activeColumns.map((c) => c.shortHeader || c.label),
                      ];
                      const rows = activePilgrims.map((p, idx) => [
                        idx + 1,
                        ...examResultsColsState.activeColumns.map((c) => c.getValue(p, idx)),
                      ]);
                      onPrintReport(
                        'كشف مقارنة نتائج الاختبار القبلي والبعدي للحجاج',
                        cols,
                        rows,
                        [{ label: 'إجمالي الحجاج بالكشف', value: activePilgrims.length }]
                      );
                    }}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow transition"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة / حفظ PDF ({activePilgrims.length})</span>
                  </button>
                  <button
                    type="button"
                    disabled={examResultsColsState.activeColumns.length === 0}
                    onClick={() => {
                      const headers = [
                        '#',
                        ...examResultsColsState.activeColumns.map((c) => c.shortHeader || c.label),
                      ];
                      const rows = activePilgrims.map((p, idx) => [
                        idx + 1,
                        ...examResultsColsState.activeColumns.map((c) => c.getValue(p, idx)),
                      ]);
                      exportReligiousReportCSV(
                        'كشف_الاختبار_القبلي_والبعدي_للحجاج',
                        headers,
                        rows,
                        [{ label: 'إجمالي الحجاج', value: activePilgrims.length }],
                        'كشف مقارنة نتائج الاختبار القبلي والبعدي للحجاج'
                      );
                    }}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow transition"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>تصدير Excel (.xlsx) ({activePilgrims.length})</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Column Selector Panel for Exam Results */}
              <DynamicColumnSelectorPanel
                title="تخصيص أعمدة وحقول كشف نتائج الاختبارات"
                columns={examResultsColumns}
                selectedMap={examResultsColsState.selectedMap}
                onToggle={examResultsColsState.toggleColumn}
                onSelectAll={examResultsColsState.selectAll}
                onDeselectAll={examResultsColsState.deselectAll}
                onResetDefaults={examResultsColsState.resetDefaults}
                specificGroupLabel="أعمدة نتائج الاختبار القبلي والبعدي"
                sharedGroupLabel="البيانات الأساسية للحاج (مشتركة)"
                defaultOpen={false}
                darkSurfaceOnly
              />

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs text-slate-300">
                  <thead className="bg-[#10192D] border-b border-slate-800 font-bold">
                    <tr>
                      <th className="px-4 py-3 text-center w-12">#</th>
                      {examResultsColsState.activeColumns.map((col) => (
                        <th key={col.key} className="px-4 py-3 whitespace-nowrap">
                          {col.shortHeader || col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {examResultsColsState.activeColumns.length === 0 ? (
                      <tr>
                        <td colSpan={1} className="py-10 text-center text-rose-400 font-bold">
                          يرجى تحديد عمود واحد على الأقل من لوحة «تخصيص أعمدة وحقول الكشف» أعلاه.
                        </td>
                      </tr>
                    ) : (
                      activePilgrims.map((p, idx) => {
                        const pr = pilgrimProgressMap[p.id || p.nationalId];
                        const pre = pr?.preTestScore ?? 60;
                        const post = pr?.postTestScore ?? 82;
                        const diff = post - pre;
                        const passed = post >= 75;
                        return (
                          <tr key={p.id || p.nationalId} className="hover:bg-[#10192D]/60 transition">
                            <td className="px-4 py-3 text-center font-mono text-slate-400">
                              {idx + 1}
                            </td>
                            {examResultsColsState.activeColumns.map((col) => {
                              if (col.key === 'fullName') {
                                return (
                                  <td key={col.key} className="px-4 py-3 font-black text-white">
                                    {getPilgrimDisplayName(p)}
                                  </td>
                                );
                              }
                              if (col.key === 'preTestScore') {
                                return (
                                  <td key={col.key} className="px-4 py-3 text-center font-mono">
                                    {pre}%
                                  </td>
                                );
                              }
                              if (col.key === 'postTestScore') {
                                return (
                                  <td key={col.key} className="px-4 py-3 text-center font-mono font-bold text-amber-400">
                                    {post}%
                                  </td>
                                );
                              }
                              if (col.key === 'improvementRate') {
                                return (
                                  <td key={col.key} className="px-4 py-3 text-center font-mono text-emerald-400 font-bold">
                                    {diff >= 0 ? '+' : ''}
                                    {diff}%
                                  </td>
                                );
                              }
                              if (col.key === 'examPassStatus') {
                                return (
                                  <td key={col.key} className="px-4 py-3 text-center">
                                    <span
                                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap ${
                                        passed
                                          ? 'bg-emerald-500/20 text-emerald-300'
                                          : 'bg-orange-500/20 text-orange-300'
                                      }`}
                                    >
                                      {passed ? 'مجتاز بنجاح' : 'يحتاج إعادة تقييم'}
                                    </span>
                                  </td>
                                );
                              }
                              if (col.key === 'signatureNotes') {
                                return (
                                  <td key={col.key} className="px-4 py-3">
                                    <div className="min-w-[100px] h-5 border-b border-dashed border-slate-700" />
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={col.key}
                                  className={`px-4 py-3 ${col.isTextProtected ? 'font-mono text-slate-200' : 'text-slate-400'}`}
                                  dir={col.isLtr ? 'ltr' : 'rtl'}
                                >
                                  {col.getValue(p, idx)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. Question Bank */}
          {assessmentSubTab === 'questionBank' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black text-white">
                  بنك الأسئلة المصنف حسب أبواب المناسك الديناميكية (اختيار من متعدد • صح وخطأ • مواقف عملية)
                </h4>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      const defSec = visibleSections[0] || orderedSections[0];
                      setQuestionForm({
                        id: `q-${Date.now()}`,
                        sectionId: defSec.id,
                        chapter: defSec.name,
                        questionType: 'اختيار من متعدد',
                        questionText: '',
                        options: ['الخيار الأول', 'الخيار الثاني', 'الخيار الثالث'],
                        correctAnswer: 'الخيار الأول',
                        points: 20,
                        explanation: '',
                        difficulty: 'متوسط',
                      });
                      setIsNewQuestionModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة سؤال جديد لبنك الأسئلة</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {questions.map((q, idx) => {
                  const liveSectionName = resolveFiqhSectionName(
                    q.sectionId || q.chapter,
                    orderedSections
                  );
                  const liveSectionId = resolveFiqhSectionId(
                    q.sectionId || q.chapter,
                    orderedSections
                  );
                  return (
                    <div
                      key={q.id}
                      className="bg-[#0B1221] border border-slate-800 rounded-3xl p-5 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 text-xs font-bold">
                          {liveSectionName}{' '}
                          <span className="text-[10px] font-mono opacity-75">
                            ({liveSectionId})
                          </span>
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg bg-purple-500/15 text-purple-300 text-[11px] font-bold">
                          {q.questionType} • {q.points} درجة
                        </span>
                      </div>
                      <p className="text-sm font-black text-white">
                        س{idx + 1}: {q.questionText}
                      </p>
                      <div className="space-y-1">
                        {q.options.map((opt, i) => (
                          <div
                            key={i}
                            className={`px-3 py-1.5 rounded-xl text-xs border ${
                              opt === q.correctAnswer
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold'
                                : 'bg-[#10192D] border-slate-800 text-slate-300'
                            }`}
                          >
                            {opt} {opt === q.correctAnswer && '✓ (الإجابة الصحيحة)'}
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-400 bg-[#10192D] p-2.5 rounded-xl">
                        <strong>التوضيح الفقهي:</strong> {q.explanation}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SAFE DELETE FIQH SECTION MODAL (WITH LINKED ISSUES & DATA PRESERVATION) */}
      {sectionToDelete && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
        >
          <div className="bg-[#0B1221] border border-rose-500/40 rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">
                  حذف الباب الفقهي مع حماية المسائل والبيانات المرتبطة
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  أنت على وشك حذف الباب الفقهي:{' '}
                  <strong className="text-amber-300">&quot;{sectionToDelete.name}&quot;</strong> (
                  <span className="font-mono">{sectionToDelete.id}</span>)
                </p>
              </div>
            </div>

            <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs">
              <p className="font-bold text-emerald-300">
                حماية البيانات المرتبطة وعدم فقدانها:
              </p>
              <p className="text-slate-300 leading-relaxed">
                لضمان عدم ضياع أي أسئلة في بنك الأسئلة أو دروس أو سجلات إتقان الحجاج المرتبطة بهذا القسم، اختر الباب الفقهي البديل الذي سيتم نقل الارتباطات إليه تلقائياً قبل الحذف:
              </p>
              <select
                value={fallbackSectionIdForDelete}
                onChange={(e) => setFallbackSectionIdForDelete(e.target.value)}
                className="w-full bg-[#0B1221] border border-amber-500/40 rounded-xl px-3.5 py-2.5 text-xs font-black text-white focus:outline-none"
              >
                {orderedSections
                  .filter((s) => s.id !== sectionToDelete.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      نقل المسائل والبيانات المرتبطة إلى: {s.name} ({s.id})
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSectionToDelete(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                إلغاء التراجع
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetDel = sectionToDelete;
                  const fallbackSec =
                    orderedSections.find((s) => s.id === fallbackSectionIdForDelete) ||
                    orderedSections.find((s) => s.id !== targetDel.id);
                  if (!fallbackSec) return;
                  setSectionToDelete(null);
                  await onDeleteFiqhSectionSafely(targetDel, fallbackSec);
                  showBanner(
                    'success',
                    `تم حذف القسم "${targetDel.name}" ونقل جميع المسائل والبيانات المرتبطة به بأمان إلى "${fallbackSec.name}".`
                  );
                }}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>تأكيد الحذف الآمن ونقل الارتباطات</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK IMPORT MODAL */}
      {isBulkModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
        >
          <div className="bg-[#0B1221] border border-amber-500/40 rounded-3xl w-full max-w-lg p-5 space-y-4">
            <h3 className="text-base font-black text-white">
              استيراد كشف الحضور الجماعي (أرقام الهويات أو الجوالات)
            </h3>
            <p className="text-xs text-slate-400">
              الصق قائمة أرقام الهويات الوطنية أو أرقام الجوالات من ملف Excel/CSV (كل رقم في سطر أو مفصول بفاصلة):
            </p>
            <textarea
              rows={5}
              value={bulkImportText}
              onChange={(e) => setBulkImportText(e.target.value)}
              placeholder="1012345678&#10;1098765432"
              className="w-full bg-[#10192D] border border-slate-700 rounded-xl p-3 text-xs text-white font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleBulkImportAttendance}
                className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black"
              >
                استيراد واعتماد الحضور
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ATTENDANCE AUDIT TRAIL MODAL */}
      {selectedAuditRecord && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
        >
          <div className="bg-[#0B1221] border border-amber-500/40 rounded-3xl w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-white">
                سجل تعديلات الحضور — {selectedAuditRecord.pilgrimName}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedAuditRecord(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                إغلاق ✕
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(selectedAuditRecord.auditLogs || []).map((log, i) => (
                <div
                  key={i}
                  className="bg-[#10192D] border border-slate-800 rounded-xl p-3 text-xs space-y-1"
                >
                  <div className="flex justify-between text-amber-400 font-bold">
                    <span>بواسطة: {log.changedBy}</span>
                    <span className="font-mono">{log.timestamp}</span>
                  </div>
                  <p className="text-slate-200">
                    تغيير الحالة من ({log.previousStatus}) إلى ({log.newStatus}) — السبب:{' '}
                    {log.reason}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* NEW QUESTION MODAL */}
      {isNewQuestionModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
        >
          <div className="bg-[#0B1221] border border-amber-500/40 rounded-3xl w-full max-w-xl p-5 space-y-4">
            <h3 className="text-base font-black text-white">إضافة سؤال جديد إلى بنك الأسئلة</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    الباب الفقهي (يرتبط بمعرف القسم ID):
                  </label>
                  <select
                    value={questionForm.sectionId || orderedSections[0]?.id}
                    onChange={(e) => {
                      const sec =
                        orderedSections.find((s) => s.id === e.target.value) ||
                        orderedSections[0];
                      setQuestionForm({
                        ...questionForm,
                        sectionId: sec.id,
                        chapter: sec.name,
                      });
                    }}
                    className="w-full bg-[#10192D] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {orderedSections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">نوع السؤال:</label>
                  <select
                    value={questionForm.questionType}
                    onChange={(e) => {
                      const qt = e.target.value as QuestionType;
                      setQuestionForm({
                        ...questionForm,
                        questionType: qt,
                        options:
                          qt === 'صح وخطأ'
                            ? ['صح', 'خطأ']
                            : ['الخيار الأول', 'الخيار الثاني', 'الخيار الثالث'],
                        correctAnswer: qt === 'صح وخطأ' ? 'صح' : 'الخيار الأول',
                      });
                    }}
                    className="w-full bg-[#10192D] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="اختيار من متعدد">اختيار من متعدد</option>
                    <option value="صح وخطأ">صح وخطأ</option>
                    <option value="مواقف عملية">مواقف عملية</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">نص السؤال:</label>
                <textarea
                  rows={2}
                  value={questionForm.questionText}
                  onChange={(e) =>
                    setQuestionForm({ ...questionForm, questionText: e.target.value })
                  }
                  className="w-full bg-[#10192D] border border-slate-700 rounded-xl p-3 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">التوضيح الفقهي للإجابة:</label>
                <input
                  type="text"
                  value={questionForm.explanation}
                  onChange={(e) =>
                    setQuestionForm({ ...questionForm, explanation: e.target.value })
                  }
                  className="w-full bg-[#10192D] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNewQuestionModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!questionForm.questionText.trim()) return;
                  await onSaveQuestion(questionForm);
                  setIsNewQuestionModalOpen(false);
                  showBanner('success', 'تمت إضافة السؤال وربطه بمعرف القسم الفقهي بنجاح.');
                }}
                className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black"
              >
                حفظ السؤال
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
