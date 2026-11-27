import React, { useMemo, useState } from 'react';
import {
  Users,
  UserCheck,
  Wand2,
  FileText,
  FileSpreadsheet,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowLeftRight,
  UserMinus,
  Phone,
  ShieldCheck,
  Sparkles,
  Accessibility,
  Layers,
  X,
  Check,
  HeartHandshake,
  Filter,
  UserPlus,
} from 'lucide-react';
import { Pilgrim } from '../../types';
import {
  PilgrimEducationalProgress,
  ReligiousGuide,
  ReligiousUnitKey,
} from '../../types/religiousGuidance';
import {
  AutoDistributeGroupingMode,
  applyMutawwifDistributionMap,
  computeMutawwifOverview,
  computeSmartAutoDistribution,
  getPilgrimDisplayName,
  getPilgrimEffectiveMarji,
  getPilgrimHealthSummary,
  isPilgrimNeedsMobilityCare,
} from '../../lib/religiousGuidanceDb';
import {
  MutawwifReportMode,
  MutawwifReportStudioModal,
} from './MutawwifReportStudioModal';

interface MutawwifManagementPanelProps {
  activePilgrims: Pilgrim[];
  guides: ReligiousGuide[];
  setGuides: React.Dispatch<React.SetStateAction<ReligiousGuide[]>>;
  pilgrimProgressMap: Record<string, PilgrimEducationalProgress>;
  storedProgressList: PilgrimEducationalProgress[];
  setStoredProgressList: React.Dispatch<React.SetStateAction<PilgrimEducationalProgress[]>>;
  currentStaffName: string;
  canEdit: boolean;
  onSaveGuide: (guide: ReligiousGuide) => Promise<void>;
  onNavigateUnit: (unit: ReligiousUnitKey) => void;
}

export const MutawwifManagementPanel: React.FC<MutawwifManagementPanelProps> = ({
  activePilgrims,
  guides,
  setGuides,
  pilgrimProgressMap,
  storedProgressList,
  setStoredProgressList,
  currentStaffName,
  canEdit,
  onSaveGuide,
  onNavigateUnit,
}) => {
  // Filters & Selection State
  const [statusFilter, setStatusFilter] = useState<'all' | 'unassigned' | 'assigned'>('all');
  const [mutawwifFilterId, setMutawwifFilterId] = useState<string>('all');
  const [marjiFilter, setMarjiFilter] = useState<string>('all');
  const [transportFilter, setTransportFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkTargetMutawwifId, setBulkTargetMutawwifId] = useState<string>('');
  const [includeFamilyOnManualAssign, setIncludeFamilyOnManualAssign] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'warning';
    text: string;
  } | null>(null);

  // Modals State
  const [isAutoModalOpen, setIsAutoModalOpen] = useState<boolean>(false);
  const [autoMode, setAutoMode] = useState<'unassigned_only' | 'redistribute_all'>('unassigned_only');
  const [keepFamiliesTogether, setKeepFamiliesTogether] = useState<boolean>(true);
  const [groupingMode, setGroupingMode] = useState<AutoDistributeGroupingMode>('balanced');
  const [participatingMutawwifIds, setParticipatingMutawwifIds] = useState<string[]>([]);

  const [isManageMutawwifsModalOpen, setIsManageMutawwifsModalOpen] = useState<boolean>(false);

  const [reportModalConfig, setReportModalConfig] = useState<{
    isOpen: boolean;
    mode: MutawwifReportMode;
    mutawwifId?: string;
  }>({
    isOpen: false,
    mode: 'general',
  });

  // Family Transfer Modal State
  const [familyTransferTarget, setFamilyTransferTarget] = useState<{
    clusterId: string;
    members: Pilgrim[];
    currentMutawwifName: string;
  } | null>(null);
  const [familyTransferMutawwifId, setFamilyTransferMutawwifId] = useState<string>('');

  const showToast = (text: string, type: 'success' | 'warning' = 'success') => {
    setFeedbackBanner({ type, text });
    window.setTimeout(() => {
      setFeedbackBanner((prev) => (prev?.text === text ? null : prev));
    }, 5500);
  };

  // Compute Real-Time Mutawwif Overview & Family Clusters
  const overview = useMemo(
    () =>
      computeMutawwifOverview({
        guides,
        activePilgrims,
        pilgrimProgressMap,
      }),
    [guides, activePilgrims, pilgrimProgressMap]
  );

  const { mutawwifs, statsByMutawwifId, allItems, unassignedItems, assignedItems, clustersById } =
    overview;

  const coveragePercent = useMemo(() => {
    if (allItems.length === 0) return 0;
    return Math.round((assignedItems.length / allItems.length) * 100);
  }, [allItems.length, assignedItems.length]);

  // Distinct filter lists derived from real pilgrims
  const uniqueMarjis = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((i) => set.add(getPilgrimEffectiveMarji(i.pilgrim)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [allItems]);

  const uniquePackagesOrTransports = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((i) => {
      const label = (i.pilgrim.selectedPackage || i.pilgrim.packageType || i.pilgrim.transport || '').trim();
      if (label) set.add(label);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [allItems]);

  // Filtered table items
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allItems.filter((item) => {
      if (statusFilter === 'unassigned' && item.assignedMutawwifId) return false;
      if (statusFilter === 'assigned' && !item.assignedMutawwifId) return false;
      if (mutawwifFilterId !== 'all') {
        if (mutawwifFilterId === '__unassigned__') {
          if (item.assignedMutawwifId) return false;
        } else if (item.assignedMutawwifId !== mutawwifFilterId) {
          return false;
        }
      }
      if (marjiFilter !== 'all' && getPilgrimEffectiveMarji(item.pilgrim) !== marjiFilter) {
        return false;
      }
      if (transportFilter !== 'all') {
        const label = (
          item.pilgrim.selectedPackage ||
          item.pilgrim.packageType ||
          item.pilgrim.transport ||
          ''
        ).trim();
        if (label !== transportFilter) return false;
      }
      if (genderFilter !== 'all' && item.pilgrim.gender !== genderFilter) {
        return false;
      }
      if (q) {
        const name = getPilgrimDisplayName(item.pilgrim).toLowerCase();
        const nid = (item.pilgrim.nationalId || '').toLowerCase();
        const mob = (item.pilgrim.mobile || '').toLowerCase();
        const mut = (item.assignedMutawwifName || '').toLowerCase();
        if (!name.includes(q) && !nid.includes(q) && !mob.includes(q) && !mut.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [
    allItems,
    statusFilter,
    mutawwifFilterId,
    marjiFilter,
    transportFilter,
    genderFilter,
    searchQuery,
  ]);

  // Open Smart Auto-Distribute Modal with active Mutawwifs pre-selected
  const openAutoDistributeModal = () => {
    if (mutawwifs.length === 0) {
      showToast(
        'لا يوجد مطوّفون مفعّلون حالياً. يرجى تفعيل صفة "مطوّف" لمرشد ديني واحد على الأقل أولاً.',
        'warning'
      );
      setIsManageMutawwifsModalOpen(true);
      return;
    }
    const activeOnes = mutawwifs.filter((m) => m.status !== 'إجازة');
    setParticipatingMutawwifIds(
      (activeOnes.length > 0 ? activeOnes : mutawwifs).map((m) => m.id)
    );
    setAutoMode(unassignedItems.length > 0 ? 'unassigned_only' : 'redistribute_all');
    setIsAutoModalOpen(true);
  };

  // Live Auto-Distribution Preview Plan
  const autoPlan = useMemo(() => {
    const selectedTargets = mutawwifs.filter((m) => participatingMutawwifIds.includes(m.id));
    return computeSmartAutoDistribution({
      targetMutawwifs: selectedTargets,
      activePilgrims,
      pilgrimProgressMap,
      mode: autoMode,
      keepFamiliesTogether,
      groupingMode,
    });
  }, [
    mutawwifs,
    participatingMutawwifIds,
    activePilgrims,
    pilgrimProgressMap,
    autoMode,
    keepFamiliesTogether,
    groupingMode,
  ]);

  const handleConfirmAutoDistribute = async () => {
    if (isSaving || autoPlan.totalPilgrimsToDistribute === 0) return;
    setIsSaving(true);
    try {
      const modeDesc =
        groupingMode === 'marji'
          ? 'توزيع تلقائي ذكي حسب المرجع الديني'
          : groupingMode === 'package_transport'
          ? 'توزيع تلقائي ذكي حسب الباقة/النقل'
          : 'توزيع تلقائي متوازن';

      const result = await applyMutawwifDistributionMap({
        assignmentsByPilgrimKey: autoPlan.assignmentsByPilgrimKey,
        activePilgrims,
        pilgrimProgressMap,
        storedProgressList,
        setStoredProgressList,
        guides,
        setGuides,
        actorName: currentStaffName,
        actionNote: keepFamiliesTogether ? `${modeDesc} (مع حفظ العائلات)` : modeDesc,
      });

      setIsAutoModalOpen(false);
      setSelectedKeys(new Set());
      showToast(
        `تم توزيع ${result.updatedCount} حاج تلقائياً على المطوّفين بنجاح${
          keepFamiliesTogether && autoPlan.familiesPreservedCount > 0
            ? ` (مع الحفاظ على ${autoPlan.familiesPreservedCount} عائلة/مجموعة مرافقين معاً)`
            : ''
        }.`
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Manual Single Pilgrim Assign / Transfer / Unassign
  const handleInlineAssignSingle = async (pilgrimKey: string, targetMutawwifId: string) => {
    if (!canEdit || isSaving) return;
    setIsSaving(true);
    try {
      const targetGuide = targetMutawwifId
        ? mutawwifs.find((m) => m.id === targetMutawwifId) || null
        : null;

      await applyMutawwifDistributionMap({
        assignmentsByPilgrimKey: { [pilgrimKey]: targetGuide },
        activePilgrims,
        pilgrimProgressMap,
        storedProgressList,
        setStoredProgressList,
        guides,
        setGuides,
        actorName: currentStaffName,
        actionNote: 'توزيع/نقل يدوي',
      });

      showToast(
        targetGuide
          ? `تم إسناد الحاج إلى المطوّف (${targetGuide.name}) وحفظه في قاعدة البيانات.`
          : 'تم إلغاء توزيع الحاج وإعادته إلى قائمة «غير موزعين بعد».'
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Manual Bulk Assign / Transfer
  const handleBulkAssign = async () => {
    if (!canEdit || isSaving || selectedKeys.size === 0) return;
    const targetGuide = mutawwifs.find((m) => m.id === bulkTargetMutawwifId);
    if (!targetGuide) {
      showToast('يرجى اختيار المطوّف المستهدف من القائمة قبل الإسناد.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const map: Record<string, ReligiousGuide | null> = {};
      const itemByKey = new Map(allItems.map((i) => [i.pilgrimKey, i]));

      selectedKeys.forEach((key) => {
        map[key] = targetGuide;
        if (includeFamilyOnManualAssign) {
          const item = itemByKey.get(key);
          if (item && item.familyClusterSize > 1) {
            const members = clustersById[item.familyClusterId] || [];
            members.forEach((m) => {
              const mk = m.id || m.nationalId;
              if (mk) map[mk] = targetGuide;
            });
          }
        }
      });

      const res = await applyMutawwifDistributionMap({
        assignmentsByPilgrimKey: map,
        activePilgrims,
        pilgrimProgressMap,
        storedProgressList,
        setStoredProgressList,
        guides,
        setGuides,
        actorName: currentStaffName,
        actionNote: 'إسناد جماعي يدوي',
      });

      setSelectedKeys(new Set());
      showToast(
        `تم إسناد/نقل ${res.updatedCount} حاج إلى المطوّف (${targetGuide.name}) بنجاح.`
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Manual Bulk Unassign
  const handleBulkUnassign = async () => {
    if (!canEdit || isSaving || selectedKeys.size === 0) return;
    setIsSaving(true);
    try {
      const map: Record<string, ReligiousGuide | null> = {};
      selectedKeys.forEach((key) => {
        map[key] = null;
      });
      const res = await applyMutawwifDistributionMap({
        assignmentsByPilgrimKey: map,
        activePilgrims,
        pilgrimProgressMap,
        storedProgressList,
        setStoredProgressList,
        guides,
        setGuides,
        actorName: currentStaffName,
      });
      setSelectedKeys(new Set());
      showToast(`تم إلغاء توزيع ${res.unassignedCount} حاج وإعادتهم لقائمة غير الموزعين.`);
    } finally {
      setIsSaving(false);
    }
  };

  // Family Transfer Confirm
  const handleConfirmFamilyTransfer = async () => {
    if (!familyTransferTarget || !canEdit || isSaving) return;
    const targetGuide = familyTransferMutawwifId
      ? mutawwifs.find((m) => m.id === familyTransferMutawwifId) || null
      : null;

    setIsSaving(true);
    try {
      const map: Record<string, ReligiousGuide | null> = {};
      familyTransferTarget.members.forEach((m) => {
        const mk = m.id || m.nationalId;
        if (mk) map[mk] = targetGuide;
      });
      const res = await applyMutawwifDistributionMap({
        assignmentsByPilgrimKey: map,
        activePilgrims,
        pilgrimProgressMap,
        storedProgressList,
        setStoredProgressList,
        guides,
        setGuides,
        actorName: currentStaffName,
        actionNote: 'نقل العائلة والمرافقين معاً',
      });
      setFamilyTransferTarget(null);
      showToast(
        targetGuide
          ? `تم نقل جميع أفراد العائلة (${res.updatedCount} حجاج) إلى المطوّف (${targetGuide.name}).`
          : `تم إلغاء توزيع أفراد العائلة (${res.unassignedCount} حجاج).`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSelectKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allFilteredSelected =
    filteredItems.length > 0 && filteredItems.every((i) => selectedKeys.has(i.pilgrimKey));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        filteredItems.forEach((i) => next.delete(i.pilgrimKey));
        return next;
      });
    } else {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        filteredItems.forEach((i) => next.add(i.pilgrimKey));
        return next;
      });
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn" dir="rtl">
      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          className={`rounded-2xl px-4 py-3 text-xs font-bold flex items-center justify-between gap-3 border shadow-lg ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-current opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Header & KPI Dashboard */}
      <div className="bg-[#0B1221] border border-amber-500/35 rounded-3xl p-5 sm:p-6 space-y-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-400 text-[11px] font-black">
                وحدة إدارة المطوّفين وتوزيع الحجاج
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold">
                مرتبطة مباشرة بسجل المرشدين الدينيين
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-white">
              توزيع حجاج الموسم على المطوّفين وإصدار الكشوفات المخصصة
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
              يعرض هذا القسم تلقائياً جميع المرشدين الدينيين المفعّلة لديهم صفة «مطوّف»، مع توزيع تلقائي ذكي يحافظ على العائلات والمرافقين، وتعديل يدوي فوري، وكشوفات PDF رسمية وExcel بأعمدة مخصصة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={openAutoDistributeModal}
                className="px-4 py-2.5 rounded-2xl bg-gradient-to-l from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer transition"
              >
                <Wand2 className="w-4 h-4" />
                <span>توزيع الحجاج تلقائياً على المطوّفين</span>
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                setReportModalConfig({
                  isOpen: true,
                  mode: 'general',
                })
              }
              className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-2 shadow cursor-pointer transition"
            >
              <FileText className="w-4 h-4" />
              <span>الكشوفات المخصصة (PDF / Excel)</span>
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={() => setIsManageMutawwifsModalOpen(true)}
                className="px-3.5 py-2.5 rounded-2xl bg-[#10192D] hover:bg-[#16233E] text-amber-300 border border-amber-500/35 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
              >
                <UserPlus className="w-4 h-4" />
                <span>تفعيل مطوّفين من المرشدين</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Summary Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
          <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-3.5">
            <span className="text-[11px] text-slate-400 font-bold block">المطوّفون المفعّلون</span>
            <strong className="text-xl font-black text-amber-400 font-mono mt-0.5 block">
              {mutawwifs.length} مطوّف
            </strong>
          </div>
          <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-3.5">
            <span className="text-[11px] text-slate-400 font-bold block">إجمالي الحجاج المعتمدين</span>
            <strong className="text-xl font-black text-white font-mono mt-0.5 block">
              {allItems.length} حاج
            </strong>
          </div>
          <div className="bg-[#10192D] border border-emerald-500/30 rounded-2xl p-3.5">
            <span className="text-[11px] text-emerald-300 font-bold block">
              الموزعون على مطوّفين
            </span>
            <strong className="text-xl font-black text-emerald-400 font-mono mt-0.5 block">
              {assignedItems.length} حاج ({coveragePercent}%)
            </strong>
          </div>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('unassigned');
              setMutawwifFilterId('all');
            }}
            className="text-right bg-[#10192D] hover:bg-orange-500/10 border border-orange-500/35 rounded-2xl p-3.5 transition cursor-pointer"
          >
            <span className="text-[11px] text-orange-300 font-bold block">
              الحجاج غير الموزعين بعد (اضغط للعرض)
            </span>
            <strong className="text-xl font-black text-orange-400 font-mono mt-0.5 block">
              {unassignedItems.length} حاج
            </strong>
          </button>
        </div>
      </div>

      {/* 2. Mutawwifs Cards Grid with Live Counters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-amber-400" />
            <span>قائمة المطوّفين المكلّفين والعداد الحي للحجاج ({mutawwifs.length})</span>
          </h3>
          {mutawwifs.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setReportModalConfig({
                  isOpen: true,
                  mode: 'all_separate',
                })
              }
              className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>استخراج كشوفات جميع المطوّفين (صفحة مستقلة لكل مطوّف)</span>
            </button>
          )}
        </div>

        {mutawwifs.length === 0 ? (
          <div className="bg-[#0B1221] border border-dashed border-amber-500/40 rounded-3xl p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
              <UserCheck className="w-7 h-7" />
            </div>
            <h4 className="text-base font-black text-white">
              لا يوجد مرشدون مفعّلة لديهم صفة «مطوّف» حتى الآن
            </h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              فعّل خيار «مكلّف بمهام التطويف (مطوّف)» من داخل وحدة «إدارة المرشدين الدينيين» أو عبر زر التفعيل السريع أدناه ليظهر المطوّفون هنا فوراً.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setIsManageMutawwifsModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black cursor-pointer"
                >
                  تفعيل المطوّفين من قائمة المرشدين الآن
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigateUnit('guidesManagement')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                الانتقال إلى إدارة المرشدين الدينيين
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {mutawwifs.map((m) => {
              const st = statsByMutawwifId[m.id];
              const count = st?.totalAssigned ?? 0;
              const sharePct =
                allItems.length > 0 ? Math.round((count / allItems.length) * 100) : 0;
              const isSelectedCard = mutawwifFilterId === m.id;

              return (
                <div
                  key={m.id}
                  className={`bg-[#0B1221] rounded-3xl p-4 sm:p-5 border transition shadow-lg flex flex-col justify-between space-y-4 ${
                    isSelectedCard
                      ? 'border-amber-400 ring-2 ring-amber-400/30'
                      : 'border-slate-800 hover:border-amber-500/40'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[10px] font-bold">
                            {m.status}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[10px] font-black">
                            مطوّف مكلّف
                          </span>
                        </div>
                        <h4 className="text-sm sm:text-base font-black text-white mt-1.5 truncate">
                          {m.name}
                        </h4>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {m.specialization || 'مطوّف ومرشد ديني'}
                        </p>
                      </div>

                      {/* Live Counter Badge */}
                      <div className="bg-amber-500/15 border border-amber-500/40 rounded-2xl px-3 py-2 text-center shrink-0 min-w-[76px]">
                        <span className="text-[10px] text-amber-300 font-bold block">الحجاج</span>
                        <strong className="text-xl font-black text-amber-400 font-mono leading-none">
                          {count}
                        </strong>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-300 bg-[#10192D] border border-slate-800 rounded-xl px-3 py-2">
                      <span className="flex items-center gap-1.5 font-mono" dir="ltr">
                        <Phone className="w-3.5 h-3.5 text-amber-400" />
                        {m.phone || 'غير مسجل'}
                      </span>
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="text-sky-300">ذكور: {st?.maleCount ?? 0}</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-pink-300">إناث: {st?.femaleCount ?? 0}</span>
                      </div>
                    </div>

                    {/* Share bar + mobility alert */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">نسبة التوزيع من القافلة</span>
                        <span className="font-mono font-bold text-amber-300">{sharePct}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-l from-amber-400 to-emerald-400 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, sharePct)}%` }}
                        />
                      </div>
                      {(st?.wheelchairOrAssistCount ?? 0) > 0 && (
                        <div className="flex items-center gap-1.5 text-[11px] text-rose-300 font-bold pt-0.5">
                          <Accessibility className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>
                            يتضمن {st.wheelchairOrAssistCount} حاج/حاجة يحتاجون مساعدة حركية أو كرسي متحرك
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => {
                        if (isSelectedCard) {
                          setMutawwifFilterId('all');
                        } else {
                          setStatusFilter('all');
                          setMutawwifFilterId(m.id);
                        }
                      }}
                      className={`py-2 px-2.5 rounded-xl text-[11px] font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        isSelectedCard
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-[#10192D] hover:bg-[#17243F] text-slate-200 border border-slate-700'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>{isSelectedCard ? 'عرض جميع الحجاج' : 'عرض حجاج المطوّف'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setReportModalConfig({
                          isOpen: true,
                          mode: 'single',
                          mutawwifId: m.id,
                        })
                      }
                      className="py-2 px-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-300 text-[11px] font-black transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>كشف PDF / Excel</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Manual Distribution, Search, Unassigned Tracking & Bulk Transfer Table */}
      <div className="bg-[#0B1221] border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-amber-400" />
              <span>التوزيع اليدوي ونقل الحجاج والعائلات بين المطوّفين</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              حدد حاجاً أو مجموعة حجاج لإسنادهم دفعة واحدة، أو غيّر المطوّف مباشرة من السطر، مع متابعة فورية لقائمة «الحجاج غير الموزعين بعد».
            </p>
          </div>

          {/* Quick Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#10192D] border border-slate-800 rounded-2xl p-1">
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setMutawwifFilterId('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                statusFilter === 'all' && mutawwifFilterId === 'all'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              الكل ({allItems.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('unassigned');
                setMutawwifFilterId('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'unassigned'
                  ? 'bg-orange-500 text-slate-950'
                  : 'text-orange-300 hover:bg-orange-500/15'
              }`}
            >
              <span>غير موزعين بعد</span>
              <span className="px-1.5 py-0.2 rounded-md bg-black/20 font-mono text-[11px]">
                {unassignedItems.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('assigned');
                setMutawwifFilterId('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                statusFilter === 'assigned'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-emerald-300 hover:bg-emerald-500/15'
              }`}
            >
              الموزعون ({assignedItems.length})
            </button>
          </div>
        </div>

        {/* Multi-Criteria Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم، الهوية، الجوال، أو المطوّف..."
              className="w-full bg-[#10192D] border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-400"
            />
          </div>

          <select
            value={mutawwifFilterId}
            onChange={(e) => setMutawwifFilterId(e.target.value)}
            className="bg-[#10192D] border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
          >
            <option value="all">جميع المطوّفين</option>
            <option value="__unassigned__">غير موزع على مطوّف</option>
            {mutawwifs.map((m) => (
              <option key={m.id} value={m.id}>
                المطوّف: {m.name} ({statsByMutawwifId[m.id]?.totalAssigned ?? 0})
              </option>
            ))}
          </select>

          <select
            value={marjiFilter}
            onChange={(e) => setMarjiFilter(e.target.value)}
            className="bg-[#10192D] border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
          >
            <option value="all">جميع مراجع التقليد</option>
            {uniqueMarjis.map((marji) => (
              <option key={marji} value={marji}>
                {marji}
              </option>
            ))}
          </select>

          <select
            value={transportFilter}
            onChange={(e) => setTransportFilter(e.target.value)}
            className="bg-[#10192D] border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
          >
            <option value="all">جميع الباقات / وسائل النقل</option>
            {uniquePackagesOrTransports.map((tr) => (
              <option key={tr} value={tr}>
                {tr}
              </option>
            ))}
          </select>

          <select
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="bg-[#10192D] border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
          >
            <option value="all">الجنس: الكل</option>
            <option value="ذكر">ذكور فقط</option>
            <option value="أنثى">إناث فقط</option>
          </select>
        </div>

        {/* Bulk Assignment Action Bar (Appears when >= 1 pilgrim selected) */}
        {canEdit && selectedKeys.size > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/45 rounded-2xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 animate-fadeIn">
            <div className="flex flex-wrap items-center gap-3">
              <span className="px-3 py-1 rounded-xl bg-amber-500 text-slate-950 font-black text-xs">
                تم تحديد {selectedKeys.size} حاج
              </span>
              <label className="flex items-center gap-2 text-xs font-bold text-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeFamilyOnManualAssign}
                  onChange={(e) => setIncludeFamilyOnManualAssign(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
                <span>ضم العائلة والمرافقين تلقائياً لنفس المطوّف</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bulkTargetMutawwifId}
                onChange={(e) => setBulkTargetMutawwifId(e.target.value)}
                className="bg-[#0B1221] border border-amber-500/40 rounded-xl px-3 py-2 text-xs font-bold text-white min-w-[200px]"
              >
                <option value="">-- اختر المطوّف المستهدف --</option>
                {mutawwifs.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({statsByMutawwifId[m.id]?.totalAssigned ?? 0} حاج)
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={isSaving || !bulkTargetMutawwifId}
                onClick={handleBulkAssign}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
              >
                <Check className="w-4 h-4" />
                <span>إسناد / نقل المحددين</span>
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={handleBulkUnassign}
                className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
              >
                <UserMinus className="w-3.5 h-3.5" />
                <span>إلغاء التوزيع</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedKeys(new Set())}
                className="px-2.5 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold cursor-pointer"
              >
                إلغاء التحديد
              </button>
            </div>
          </div>
        )}

        {/* Pilgrims Table */}
        <div className="overflow-x-auto border border-slate-800 rounded-2xl">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-[#10192D] text-slate-300 border-b border-slate-800">
                {canEdit && (
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                      aria-label="تحديد جميع الحجاج المعروضين"
                    />
                  </th>
                )}
                <th className="py-3 px-3 font-black whitespace-nowrap">م</th>
                <th className="py-3 px-3 font-black whitespace-nowrap">الاسم الكامل للحاج</th>
                <th className="py-3 px-3 font-black whitespace-nowrap">الجوال / الهوية</th>
                <th className="py-3 px-3 font-black whitespace-nowrap">مرجع التقليد</th>
                <th className="py-3 px-3 font-black whitespace-nowrap">الباقة / النقل</th>
                <th className="py-3 px-3 font-black whitespace-nowrap">الحالة الصحية / الحركة</th>
                <th className="py-3 px-3 font-black whitespace-nowrap">المطوّف المكلّف (تعيين / نقل فوري)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="py-10 text-center text-slate-400">
                    <Filter className="w-6 h-6 mx-auto mb-2 text-slate-500" />
                    <p className="font-bold">لا يوجد حجاج مطابقون لمعايير البحث والتصفية الحالية.</p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const p = item.pilgrim;
                  const isSelected = selectedKeys.has(item.pilgrimKey);
                  const needsCare = isPilgrimNeedsMobilityCare(p);
                  const familyMembers = clustersById[item.familyClusterId] || [];

                  return (
                    <tr
                      key={item.pilgrimKey}
                      className={`transition ${
                        isSelected
                          ? 'bg-amber-500/10'
                          : idx % 2 === 0
                          ? 'bg-[#0B1221]'
                          : 'bg-[#0E1629]/70'
                      } hover:bg-[#142038]/80`}
                    >
                      {canEdit && (
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectKey(item.pilgrimKey)}
                            className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-white leading-snug">
                          {getPilgrimDisplayName(p)}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="text-[10px] text-slate-400">{p.gender || '—'}</span>
                          {item.familyClusterSize > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!canEdit) return;
                                setFamilyTransferTarget({
                                  clusterId: item.familyClusterId,
                                  members: familyMembers,
                                  currentMutawwifName: item.assignedMutawwifName || 'غير موزع',
                                });
                                setFamilyTransferMutawwifId(item.assignedMutawwifId || '');
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/35 text-sky-300 text-[10px] font-bold hover:bg-sky-500/25 cursor-pointer"
                              title="اضغط لنقل العائلة والمرافقين بالكامل معاً"
                            >
                              <HeartHandshake className="w-3 h-3" />
                              <span>عائلة/مرافقون ({item.familyClusterSize})</span>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                        <div dir="ltr" className="text-right">
                          {p.mobile || '—'}
                        </div>
                        <div className="text-[10px] text-slate-500" dir="ltr">
                          {p.nationalId || '—'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-amber-300 font-bold whitespace-nowrap">
                        {getPilgrimEffectiveMarji(p)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        <div className="truncate max-w-[160px]" title={p.selectedPackage || p.packageType || ''}>
                          {p.selectedPackage || p.packageType || '—'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {p.transport || '—'} {p.busNumber ? `· باص ${p.busNumber}` : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                            needsCare
                              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/35'
                              : 'bg-slate-800/80 text-slate-300'
                          }`}
                        >
                          {needsCare && <Accessibility className="w-3 h-3 shrink-0" />}
                          <span className="truncate max-w-[150px]" title={getPilgrimHealthSummary(p)}>
                            {getPilgrimHealthSummary(p)}
                          </span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 min-w-[205px]">
                        {canEdit ? (
                          <select
                            value={item.assignedMutawwifId}
                            disabled={isSaving || mutawwifs.length === 0}
                            onChange={(e) =>
                              handleInlineAssignSingle(item.pilgrimKey, e.target.value)
                            }
                            className={`w-full rounded-xl px-2.5 py-1.5 text-xs font-bold border focus:outline-none cursor-pointer transition ${
                              item.assignedMutawwifId
                                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                                : 'bg-orange-500/10 border-orange-500/40 text-orange-300'
                            }`}
                          >
                            <option value="" className="bg-[#0B1221] text-orange-300">
                              — غير موزع بعد —
                            </option>
                            {mutawwifs.map((m) => (
                              <option key={m.id} value={m.id} className="bg-[#0B1221] text-white">
                                {m.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold inline-block ${
                              item.assignedMutawwifId
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-orange-500/15 text-orange-300'
                            }`}
                          >
                            {item.assignedMutawwifName || 'غير موزع بعد'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =================================================================== */}
      {/* MODAL 1: SMART AUTO-DISTRIBUTE MODAL                                */}
      {/* =================================================================== */}
      {isAutoModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          dir="rtl"
        >
          <div className="bg-[#0B1221] border border-amber-500/40 rounded-3xl w-full max-w-2xl p-5 sm:p-6 space-y-5 shadow-2xl my-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    التوزيع التلقائي الذكي للحجاج على المطوّفين
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    يوزع الحجاج بالتساوي والعدل مع الحفاظ على العائلات والمرافقين وإمكانية التجميع حسب المرجع أو الباقة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAutoModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Distribution Scope */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setAutoMode('unassigned_only')}
                  className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
                    autoMode === 'unassigned_only'
                      ? 'bg-amber-500/15 border-amber-400 text-white'
                      : 'bg-[#10192D] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-black">توزيع الحجاج غير الموزعين فقط</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    يحافظ على التوزيع اليدوي الحالي ويوزع المتبقين ({unassignedItems.length} حاج) بالتساوي
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setAutoMode('redistribute_all')}
                  className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
                    autoMode === 'redistribute_all'
                      ? 'bg-amber-500/15 border-amber-400 text-white'
                      : 'bg-[#10192D] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-black">إعادة توزيع جميع الحجاج المعتمدين</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    إعادة موازنة كاملة لكل حجاج الموسم ({allItems.length} حاج) على المطوّفين المختارين
                  </div>
                </button>
              </div>

              {/* Family Preservation Toggle */}
              <label className="flex items-start justify-between gap-3 bg-emerald-500/10 border border-emerald-500/35 rounded-2xl p-3.5 cursor-pointer">
                <div className="space-y-0.5">
                  <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                    <HeartHandshake className="w-4 h-4" />
                    <span>إبقاء العائلة والمرافقين مع نفس المطوّف (موصى به)</span>
                  </span>
                  <span className="text-[11px] text-slate-300 block leading-relaxed">
                    يتعرف النظام تلقائياً على المحارم والمرافقين وأفراد نفس العائلة والغرفة ولا يفصل بينهم عند التوزيع.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={keepFamiliesTogether}
                  onChange={(e) => setKeepFamiliesTogether(e.target.checked)}
                  className="w-5 h-5 mt-0.5 accent-emerald-500 rounded cursor-pointer shrink-0"
                />
              </label>

              {/* Grouping Priority */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-200 block">
                  أولوية التجميع (اختياري):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    {
                      id: 'balanced',
                      title: 'توازن عددي متساوٍ',
                      desc: 'توزيع عادل بأقرب عدد ممكن',
                    },
                    {
                      id: 'marji',
                      title: 'حسب المرجع الديني',
                      desc: 'تجميع أتباع نفس المرجع معاً',
                    },
                    {
                      id: 'package_transport',
                      title: 'حسب الباقة / النقل',
                      desc: 'تجميع حجاج نفس الباقة والحافلة',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setGroupingMode(opt.id as AutoDistributeGroupingMode)}
                      className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${
                        groupingMode === opt.id
                          ? 'bg-sky-500/15 border-sky-400 text-white'
                          : 'bg-[#10192D] border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-black">{opt.title}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Participating Mutawwifs Selection */}
              <div className="space-y-2">
                <span className="text-xs font-black text-slate-200 block">
                  المطوّفون المشاركون في التوزيع ({participatingMutawwifIds.length} من {mutawwifs.length}):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                  {mutawwifs.map((m) => {
                    const checked = participatingMutawwifIds.includes(m.id);
                    const currentCnt = statsByMutawwifId[m.id]?.totalAssigned ?? 0;
                    const projectedCnt = autoPlan.projectedCountsByMutawwifId[m.id] ?? currentCnt;
                    const addedCnt = autoPlan.addedCountsByMutawwifId[m.id] ?? 0;

                    return (
                      <label
                        key={m.id}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border cursor-pointer transition ${
                          checked
                            ? 'bg-[#10192D] border-amber-500/45 text-white'
                            : 'bg-[#080D1A] border-slate-800 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setParticipatingMutawwifIds((prev) =>
                                prev.includes(m.id)
                                  ? prev.filter((id) => id !== m.id)
                                  : [...prev, m.id]
                              )
                            }
                            className="w-4 h-4 accent-amber-500 rounded cursor-pointer shrink-0"
                          />
                          <span className="text-xs font-bold truncate">{m.name}</span>
                        </div>
                        {checked && (
                          <span className="text-[11px] font-mono shrink-0 text-emerald-400 font-bold">
                            {projectedCnt} حاج {addedCnt > 0 ? `(+${addedCnt})` : ''}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Live Projection Summary */}
              <div className="bg-[#10192D] border border-slate-700 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-300 font-bold">
                  سيتم توزيع:{' '}
                  <strong className="text-amber-400 font-mono text-sm">
                    {autoPlan.totalPilgrimsToDistribute} حاج
                  </strong>{' '}
                  على{' '}
                  <strong className="text-emerald-400 font-mono">
                    {participatingMutawwifIds.length} مطوّف
                  </strong>
                </span>
                {keepFamiliesTogether && autoPlan.familiesPreservedCount > 0 && (
                  <span className="text-sky-300 font-bold text-[11px]">
                    تم رصد وحفظ {autoPlan.familiesPreservedCount} مجموعة عائلية/مرافقين معاً
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsAutoModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={
                  isSaving ||
                  participatingMutawwifIds.length === 0 ||
                  autoPlan.totalPilgrimsToDistribute === 0
                }
                onClick={handleConfirmAutoDistribute}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black flex items-center gap-2 cursor-pointer transition"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {isSaving
                    ? 'جاري حفظ التوزيع...'
                    : `اعتماد وحفظ التوزيع (${autoPlan.totalPilgrimsToDistribute} حاج)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: QUICK ACTIVATE MUTAWWIFS FROM RELIGIOUS GUIDES             */}
      {/* =================================================================== */}
      {isManageMutawwifsModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          dir="rtl"
        >
          <div className="bg-[#0B1221] border border-amber-500/40 rounded-3xl w-full max-w-xl p-5 space-y-4 shadow-2xl my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white">
                  تفعيل صفة «مطوّف» للمرشدين الدينيين
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  هذا الخيار مرتبط مباشرة بسجل «إدارة المرشدين الدينيين» ويُحفظ فوراً في قاعدة البيانات
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsManageMutawwifsModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {guides.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  لا يوجد مرشدون دينيون مسجلون. يرجى إضافة مرشد من وحدة «إدارة المرشدين الدينيين».
                </div>
              ) : (
                guides.map((g) => (
                  <label
                    key={g.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-2xl border cursor-pointer transition ${
                      g.isMutawwif
                        ? 'bg-amber-500/10 border-amber-500/45'
                        : 'bg-[#10192D] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-black text-white truncate">{g.name}</div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {g.specialization} · {g.phone || 'بدون جوال'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                          g.isMutawwif
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {g.isMutawwif ? 'مطوّف مفعّل' : 'مرشد فقط'}
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(g.isMutawwif)}
                        onChange={async (e) => {
                          await onSaveGuide({
                            ...g,
                            isMutawwif: e.target.checked,
                            updatedAt: new Date().toISOString().split('T')[0],
                          });
                        }}
                        className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                      />
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsManageMutawwifsModalOpen(false);
                  onNavigateUnit('guidesManagement');
                }}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                فتح سجل إدارة المرشدين الدينيين الكامل ←
              </button>
              <button
                type="button"
                onClick={() => setIsManageMutawwifsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black cursor-pointer"
              >
                تم
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 3: TRANSFER ENTIRE FAMILY / COMPANIONS TOGETHER               */}
      {/* =================================================================== */}
      {familyTransferTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
        >
          <div className="bg-[#0B1221] border border-sky-500/40 rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <HeartHandshake className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-black text-white">
                  نقل العائلة والمرافقين معاً ({familyTransferTarget.members.length} أفراد)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFamilyTransferTarget(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-3 space-y-1.5 max-h-44 overflow-y-auto">
              {familyTransferTarget.members.map((m) => (
                <div
                  key={m.id || m.nationalId}
                  className="text-xs text-slate-200 font-bold flex items-center justify-between"
                >
                  <span>{getPilgrimDisplayName(m)}</span>
                  <span className="text-[10px] text-slate-400">{m.gender}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block">
                اختر المطوّف المستهدف لجميع أفراد العائلة:
              </label>
              <select
                value={familyTransferMutawwifId}
                onChange={(e) => setFamilyTransferMutawwifId(e.target.value)}
                className="w-full bg-[#10192D] border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white"
              >
                <option value="">— إلغاء توزيع العائلة (غير موزعين) —</option>
                {mutawwifs.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({statsByMutawwifId[m.id]?.totalAssigned ?? 0} حاج)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setFamilyTransferTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleConfirmFamilyTransfer}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black cursor-pointer"
              >
                {isSaving ? 'جاري النقل...' : 'تأكيد نقل العائلة كاملة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 4: CUSTOM REPORTS STUDIO (PDF A4 + EXCEL WITH COLUMN PICKER)  */}
      {/* =================================================================== */}
      {reportModalConfig.isOpen && (
        <MutawwifReportStudioModal
          initialMode={reportModalConfig.mode}
          initialMutawwifId={reportModalConfig.mutawwifId}
          mutawwifs={mutawwifs}
          statsByMutawwifId={statsByMutawwifId}
          allItems={allItems}
          generatedBy={currentStaffName}
          onClose={() => setReportModalConfig((prev) => ({ ...prev, isOpen: false }))}
        />
      )}
    </div>
  );
};
