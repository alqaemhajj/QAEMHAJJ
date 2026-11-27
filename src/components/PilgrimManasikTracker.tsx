import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  AlertTriangle,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cloud,
  Copy,
  ListChecks,
  MessageCircle,
  RotateCcw,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { CampaignSettings, ManasikRitualItem, ManasikStage, Pilgrim } from '../types';
import { INITIAL_MANASIK_STAGES } from '../data/manasikSeedData';
import {
  savePilgrimManasikProgress,
  subscribeToManasikStages,
  subscribeToPilgrimManasikProgress,
} from '../lib/manasikDb';

interface PilgrimManasikTrackerProps {
  pilgrim: Pilgrim;
  campaignSettings?: CampaignSettings;
}

function getRulingStyle(ruling?: string): string {
  switch (ruling) {
    case 'ركن':
      return 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/35';
    case 'واجب':
      return 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/35';
    case 'سنة':
      return 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/35';
    case 'مستحب':
      return 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/35';
    case 'تنبيه خاص بالقافلة':
      return 'bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/35';
    default:
      return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  }
}

export const PilgrimManasikTracker: React.FC<PilgrimManasikTrackerProps> = ({
  pilgrim,
  campaignSettings,
}) => {
  const [allStages, setAllStages] = useState<ManasikStage[]>(INITIAL_MANASIK_STAGES);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [syncedFromCloud, setSyncedFromCloud] = useState(false);
  const [selectedStageTab, setSelectedStageTab] = useState<string>('all');
  const [expandedStageIds, setExpandedStageIds] = useState<Record<string, boolean>>({});

  // Modals & notifications
  const [detailModal, setDetailModal] = useState<{
    stageTitle: string;
    ritual: ManasikRitualItem;
  } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedShareText, setCopiedShareText] = useState(false);

  const fullPilgrimName = useMemo(() => {
    const parts = [
      pilgrim.firstName,
      pilgrim.secondName,
      pilgrim.thirdName,
      pilgrim.lastName,
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return parts || 'حاج قافلة القائم';
  }, [pilgrim.firstName, pilgrim.secondName, pilgrim.thirdName, pilgrim.lastName]);

  const seasonYear = campaignSettings?.pilgrimStatsConfig?.activeSeasonYear || '1448';

  // Subscribe live to Admin-managed Manasik stages
  useEffect(() => {
    const unsub = subscribeToManasikStages((stages) => {
      setAllStages(Array.isArray(stages) ? stages : []);
    });
    return () => unsub();
  }, []);

  // Subscribe live to THIS pilgrim's personal cloud progress record in Firestore
  useEffect(() => {
    const unsub = subscribeToPilgrimManasikProgress(
      { nationalId: pilgrim.nationalId, pilgrimId: pilgrim.id },
      (ids, cloudOk) => {
        setCompletedIds(ids);
        setSyncedFromCloud(cloudOk);
      }
    );
    return () => unsub();
  }, [pilgrim.nationalId, pilgrim.id]);

  // Only enabled stages and enabled rituals appear and count in progress
  const enabledStages = useMemo(() => {
    return [...allStages]
      .filter((st) => st && st.isEnabled)
      .sort((a, b) => a.order - b.order)
      .map((st) => ({
        ...st,
        rituals: [...(st.rituals || [])]
          .filter((r) => r && r.isEnabled)
          .sort((a, b) => a.order - b.order),
      }));
  }, [allStages]);

  // Reset tab if selected stage is hidden or deleted by admin
  useEffect(() => {
    if (selectedStageTab === 'all') return;
    if (!enabledStages.some((st) => st.id === selectedStageTab)) {
      setSelectedStageTab('all');
    }
  }, [enabledStages, selectedStageTab]);

  // Open first incomplete stage by default
  useEffect(() => {
    if (enabledStages.length === 0) return;
    setExpandedStageIds((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const doneSet = new Set(completedIds);
      const firstIncomplete = enabledStages.find((st) =>
        st.rituals.some((r) => !doneSet.has(r.id))
      );
      const targetId = firstIncomplete ? firstIncomplete.id : enabledStages[0].id;
      return { [targetId]: true };
    });
  }, [enabledStages, completedIds]);

  const enabledRitualIdSet = useMemo(() => {
    const set = new Set<string>();
    enabledStages.forEach((st) => {
      st.rituals.forEach((r) => set.add(r.id));
    });
    return set;
  }, [enabledStages]);

  const completedSet = useMemo(() => {
    return new Set(completedIds.filter((id) => enabledRitualIdSet.has(id)));
  }, [completedIds, enabledRitualIdSet]);

  const totalEnabledRituals = enabledRitualIdSet.size;
  const completedCount = completedSet.size;
  const progressPercent =
    totalEnabledRituals > 0 ? Math.round((completedCount / totalEnabledRituals) * 100) : 0;

  const completedStagesCount = useMemo(() => {
    return enabledStages.filter(
      (st) => st.rituals.length > 0 && st.rituals.every((r) => completedSet.has(r.id))
    ).length;
  }, [enabledStages, completedSet]);

  const handleToggleRitual = async (ritualId: string) => {
    const currentClean = completedIds.filter((id) => enabledRitualIdSet.has(id));
    const exists = currentClean.includes(ritualId);
    const next = exists
      ? currentClean.filter((id) => id !== ritualId)
      : [...currentClean, ritualId];

    setCompletedIds(next);
    await savePilgrimManasikProgress({
      nationalId: pilgrim.nationalId,
      pilgrimId: pilgrim.id,
      completedRitualIds: next,
    });
  };

  const handleConfirmReset = async () => {
    setCompletedIds([]);
    setShowResetConfirm(false);
    await savePilgrimManasikProgress({
      nationalId: pilgrim.nationalId,
      pilgrimId: pilgrim.id,
      completedRitualIds: [],
    });
  };

  const toggleAccordionStage = (stageId: string) => {
    setExpandedStageIds((prev) => ({
      ...prev,
      [stageId]: !prev[stageId],
    }));
  };

  const expandAllStages = () => {
    const next: Record<string, boolean> = {};
    enabledStages.forEach((st) => {
      next[st.id] = true;
    });
    setExpandedStageIds(next);
  };

  const collapseAllStages = () => {
    setExpandedStageIds({});
  };

  const shareMessageText = useMemo(() => {
    return `الحمد لله الذي بنعمته تتم الصالحات.. أتمّ الحاج/ ${fullPilgrimName} إنجاز ${progressPercent}% (${completedCount} من أصل ${totalEnabledRituals} نسكاً) من مناسك الحج ضمن رحلة قافلة القائم للحج والعمرة والزيارة لموسم ${seasonYear}هـ. تقبل الله منا ومنكم صالح الأعمال.`;
  }, [fullPilgrimName, progressPercent, completedCount, totalEnabledRituals, seasonYear]);

  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(shareMessageText)}`;

  const handleCopyShareText = async () => {
    try {
      await navigator.clipboard.writeText(shareMessageText);
      setCopiedShareText(true);
      setTimeout(() => setCopiedShareText(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const displayedStages = useMemo(() => {
    if (selectedStageTab === 'all') return enabledStages;
    return enabledStages.filter((st) => st.id === selectedStageTab);
  }, [selectedStageTab, enabledStages]);

  return (
    <div className="space-y-6 text-right animate-fadeIn">
      {/* Personal Cloud-Synced Progress Summary Card */}
      <div className="bg-white dark:bg-[#070C18] border border-amber-300 dark:border-amber-500/35 rounded-3xl p-5 sm:p-7 shadow-md dark:shadow-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px] font-black">
                <UserCheck className="w-3.5 h-3.5" />
                <span>سجل الحاج/ {fullPilgrimName}</span>
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                  syncedFromCloud
                    ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/35 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>
                  {syncedFromCloud
                    ? 'مربوط ومحفوظ سحابياً برقم الهوية'
                    : 'حفظ تلقائي مرتبط بهويتك'}
                </span>
              </span>
            </div>

            <h3 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white leading-snug pt-1">
              تم إنجاز{' '}
              <span className="text-amber-700 dark:text-amber-400 font-mono">{completedCount}</span> من أصل{' '}
              <span className="text-amber-700 dark:text-amber-400 font-mono">{totalEnabledRituals}</span> نسكاً —{' '}
              <span
                className={`font-mono ${
                  progressPercent === 100 && totalEnabledRituals > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-300'
                }`}
              >
                {progressPercent}%
              </span>
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              المراحل المكتملة بالكامل: {completedStagesCount} من {enabledStages.length} مرحلة • يُحفظ إنجازك تلقائياً في ملفك الشخصي لتجده عند فتح البوابة من أي جهاز.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-[#0B1221] border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-3 text-center shrink-0 min-w-[96px]">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-bold">نسبة الإنجاز</span>
            <span
              className={`text-2xl font-black font-mono ${
                progressPercent === 100 && totalEnabledRituals > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {progressPercent}%
            </span>
          </div>
        </div>

        {/* Live Progress Bar Track */}
        <div className="w-full h-4 bg-slate-100 dark:bg-[#0B1221] rounded-full overflow-hidden border border-slate-200 dark:border-slate-800 p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              progressPercent === 100 && totalEnabledRituals > 0
                ? 'bg-gradient-to-l from-emerald-400 to-emerald-500'
                : 'bg-gradient-to-l from-amber-400 to-amber-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
          />
        </div>

        {/* Share Achievement via WhatsApp Personalized with Pilgrim 4-Part Name */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={whatsappShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 rounded-2xl bg-gradient-to-l from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition"
            >
              <MessageCircle className="w-4 h-4" />
              <span>مشاركة إنجازي عبر الواتساب</span>
            </a>

            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className="px-4 py-3 rounded-2xl bg-amber-50 dark:bg-[#0B1221] hover:bg-amber-100 dark:hover:bg-slate-900 border border-amber-300 dark:border-amber-500/35 text-amber-800 dark:text-amber-300 font-bold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer"
            >
              <Award className="w-4 h-4" />
              <span>بطاقة ونسخ الإنجاز</span>
            </button>
          </div>

          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400" dir="ltr">
            ID: {pilgrim.nationalId}
          </span>
        </div>
      </div>

      {/* Stage Filter Pills */}
      <div className="bg-white dark:bg-[#070C18] p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedStageTab('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              selectedStageTab === 'all'
                ? 'bg-amber-500 text-slate-950 font-black shadow'
                : 'bg-slate-50 dark:bg-[#0B1221] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <ListChecks className="w-4 h-4" />
            <span>جميع المراحل</span>
            <span
              className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-black ${
                selectedStageTab === 'all'
                  ? 'bg-slate-950/20 text-slate-950'
                  : 'bg-amber-100 dark:bg-slate-800 text-amber-800 dark:text-amber-400'
              }`}
            >
              {completedCount}/{totalEnabledRituals}
            </span>
          </button>

          {enabledStages.map((stage) => {
            const isActive = selectedStageTab === stage.id;
            const stageTotal = stage.rituals.length;
            const stageDone = stage.rituals.filter((r) => completedSet.has(r.id)).length;
            const stageComplete = stageTotal > 0 && stageDone === stageTotal;

            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setSelectedStageTab(stage.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-black shadow'
                    : stageComplete
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/15'
                    : 'bg-slate-50 dark:bg-[#0B1221] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>{stage.title}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-lg text-[11px] font-mono font-black ${
                    isActive
                      ? 'bg-slate-950/20 text-slate-950'
                      : stageComplete
                      ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                      : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {stageDone}/{stageTotal}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Expand/Collapse Controls in All mode */}
      {selectedStageTab === 'all' && displayedStages.length > 1 && (
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
            ضع علامة الصح (✓) أمام كل نسك تُتمّه ليُحفظ فوراً في سجلك:
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={expandAllStages}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#070C18] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-bold text-amber-700 dark:text-amber-300 cursor-pointer shadow-sm"
            >
              توسيع الكل
            </button>
            <button
              type="button"
              onClick={collapseAllStages}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#070C18] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer shadow-sm"
            >
              طي الكل
            </button>
          </div>
        </div>
      )}

      {/* Stages Accordion Checklist */}
      {displayedStages.length === 0 ? (
        <div className="bg-white dark:bg-[#070C18] border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center space-y-2 shadow-sm">
          <BookOpen className="w-10 h-10 text-amber-500/60 dark:text-amber-400/60 mx-auto" />
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
            لا توجد مراحل مفعّلة في دليل المناسك حالياً.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedStages.map((stage, stageIdx) => {
            const isAllMode = selectedStageTab === 'all';
            const isExpanded = !isAllMode || Boolean(expandedStageIds[stage.id]);
            const stageRituals = stage.rituals;
            const stageDone = stageRituals.filter((r) => completedSet.has(r.id)).length;
            const stageTotal = stageRituals.length;
            const stagePercent = stageTotal > 0 ? Math.round((stageDone / stageTotal) * 100) : 0;
            const isStageComplete = stageTotal > 0 && stageDone === stageTotal;

            return (
              <div
                key={stage.id}
                className={`bg-white dark:bg-[#070C18] border rounded-3xl overflow-hidden shadow-md dark:shadow-xl transition ${
                  isStageComplete
                    ? 'border-emerald-300 dark:border-emerald-500/40'
                    : 'border-slate-200 dark:border-amber-500/30'
                }`}
              >
                {/* Stage Header */}
                <div
                  onClick={() => {
                    if (isAllMode) toggleAccordionStage(stage.id);
                  }}
                  className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 ${
                    isAllMode ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-[#0C1426] transition' : ''
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1">
                    <div
                      className={`w-10 h-10 rounded-2xl font-black flex items-center justify-center text-sm shrink-0 shadow ${
                        isStageComplete
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-amber-500 text-slate-950'
                      }`}
                    >
                      {isStageComplete ? <Check className="w-5 h-5 stroke-[3]" /> : stageIdx + 1}
                    </div>
                    <div className="space-y-1 flex-1">
                      {stage.subtitle && (
                        <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-[11px] font-bold">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>{stage.subtitle}</span>
                        </div>
                      )}
                      <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">{stage.title}</h4>
                      {stage.summary && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{stage.summary}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                    <div
                      className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 ${
                        isStageComplete
                          ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-50 dark:bg-[#0B1221] border-amber-200 dark:border-slate-700 text-amber-800 dark:text-amber-300'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-mono">
                        {stageDone} / {stageTotal}
                      </span>
                      <span>مكتمل</span>
                    </div>

                    {isAllMode && (
                      <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-[#0B1221] border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Stage Ritual Checkboxes */}
                {isExpanded && (
                  <div className="p-4 sm:p-6 space-y-4 animate-fadeIn">
                    {stageTotal > 0 && (
                      <div className="w-full h-2 bg-slate-100 dark:bg-[#0B1221] rounded-full overflow-hidden border border-slate-200 dark:border-slate-800">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isStageComplete ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                          style={{ width: `${stagePercent}%` }}
                        />
                      </div>
                    )}

                    {stageRituals.length === 0 ? (
                      <div className="bg-slate-50 dark:bg-[#0B1221] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-center text-xs text-slate-500 dark:text-slate-400">
                        لا توجد أعمال مفعّلة في هذه المرحلة حالياً.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {stageRituals.map((ritual) => {
                          const isDone = completedSet.has(ritual.id);
                          return (
                            <div
                              key={ritual.id}
                              className={`rounded-2xl border p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 ${
                                isDone
                                  ? 'bg-emerald-50 dark:bg-emerald-500/[0.08] border-emerald-200 dark:border-emerald-500/35'
                                  : 'bg-slate-50 dark:bg-[#0B1221] border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-500/40'
                              }`}
                            >
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                {/* Large Touch-Friendly Checkbox */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleRitual(ritual.id)}
                                  aria-pressed={isDone}
                                  aria-label={
                                    isDone
                                      ? `إلغاء إنجاز ${ritual.title}`
                                      : `تحديد ${ritual.title} كمنجز`
                                  }
                                  className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl border-2 flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                                    isDone
                                      ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                                      : 'bg-white dark:bg-[#070C18] border-slate-300 dark:border-slate-600 hover:border-amber-500 dark:hover:border-amber-400 text-transparent'
                                  }`}
                                >
                                  <Check className="w-6 h-6 stroke-[3]" />
                                </button>

                                <div
                                  onClick={() => handleToggleRitual(ritual.id)}
                                  className="space-y-1.5 flex-1 min-w-0 cursor-pointer"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h5
                                      className={`text-sm sm:text-base font-black leading-snug transition ${
                                        isDone ? 'line-through text-slate-400 dark:text-slate-400' : 'text-slate-900 dark:text-white'
                                      }`}
                                    >
                                      {ritual.title}
                                    </h5>
                                    {ritual.ruling && (
                                      <span
                                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border shrink-0 ${getRulingStyle(
                                          ritual.ruling
                                        )}`}
                                      >
                                        {ritual.ruling}
                                      </span>
                                    )}
                                  </div>

                                  {ritual.campaignNote && (
                                    <div className="inline-flex items-start gap-1.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 rounded-xl px-2.5 py-1 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                                      <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                      <span>{ritual.campaignNote}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-end shrink-0 pr-14 sm:pr-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDetailModal({ stageTitle: stage.title, ritual })
                                  }
                                  className="px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-500 text-amber-800 dark:text-amber-300 hover:text-slate-950 border border-amber-300 dark:border-amber-500/35 text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
                                >
                                  <BookOpen className="w-3.5 h-3.5" />
                                  <span>شرح / دعاء</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {stage.campaignTip && (
                      <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shrink-0">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-xs font-black text-amber-800 dark:text-amber-300 block">
                            توجيه قافلة القائم لهذه المرحلة:
                          </span>
                          <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                            {stage.campaignTip}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Reset Button */}
      {totalEnabledRituals > 0 && (
        <div className="bg-white dark:bg-[#070C18] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            يمكنك تصفير علامات الإنجاز المرتبطة بسجلك في أي وقت لبدء متابعة جديدة.
          </p>
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            disabled={completedCount === 0}
            className="px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 disabled:opacity-40 disabled:pointer-events-none border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 font-black text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة تعيين القائمة</span>
          </button>
        </div>
      )}

      {/* MODAL 1: Ritual Explanation & Dua */}
      {detailModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDetailModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-amber-500/40 rounded-3xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="p-5 sm:p-6 bg-slate-50 dark:bg-[#070C18] border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                    {detailModal.stageTitle}
                  </span>
                  {detailModal.ritual.ruling && (
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${getRulingStyle(
                        detailModal.ritual.ruling
                      )}`}
                    >
                      {detailModal.ritual.ruling}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white leading-snug">
                  {detailModal.ritual.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                className="p-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-7 overflow-y-auto space-y-5">
              {detailModal.ritual.campaignNote && (
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="text-xs font-black text-amber-800 dark:text-amber-300 block">
                      توقيت وتوجيه القافلة:
                    </span>
                    <p className="text-sm text-amber-950 dark:text-amber-100 leading-relaxed">
                      {detailModal.ritual.campaignNote}
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-2">
                <span className="text-xs font-black text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4" />
                  <span>الشرح والأدعية المأثورة:</span>
                </span>
                <p className="text-sm sm:text-base text-slate-800 dark:text-slate-100 leading-loose whitespace-pre-line font-medium">
                  {detailModal.ritual.explanation ||
                    'لا يوجد شرح نصي مضاف لهذا النسك حالياً.'}
                </p>
              </div>
            </div>

            <div className="p-4 sm:p-5 bg-slate-50 dark:bg-[#070C18] border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleToggleRitual(detailModal.ritual.id)}
                className={`px-5 py-2.5 rounded-2xl font-black text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                  completedSet.has(detailModal.ritual.id)
                    ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 hover:bg-emerald-100 dark:hover:bg-emerald-500/25'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>
                  {completedSet.has(detailModal.ritual.id)
                    ? 'تم الإنجاز ✓ (اضغط لإلغاء التحديد)'
                    : 'تحديد كمنجز ✓'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDetailModal(null)}
                className="px-5 py-2.5 rounded-2xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-xs sm:text-sm cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Reset Confirmation */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#0B1221] border border-rose-300 dark:border-rose-500/40 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">تأكيد إعادة تعيين القائمة</h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  هل تريد مسح جميع علامات الإنجاز المحفوظة لملف الحاج «{fullPilgrimName}» ({completedCount} نسكاً) والبدء من جديد؟
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white dark:text-slate-950 font-black text-xs cursor-pointer"
              >
                نعم، إعادة التعيين
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Share Achievement Card Modal */}
      {showShareModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowShareModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#0B1221] border border-amber-300 dark:border-amber-500/45 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl"
          >
            <div className="bg-gradient-to-br from-amber-50 via-white to-amber-50/70 dark:from-[#070C18] dark:via-[#0F1B33] dark:to-[#070C18] p-6 sm:p-8 text-center space-y-4 border-b border-amber-200 dark:border-amber-500/25 relative">
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                aria-label="إغلاق بطاقة المشاركة"
                className="absolute top-4 left-4 p-2 rounded-xl bg-slate-200/80 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/25">
                <Award className="w-9 h-9" />
              </div>

              <div className="space-y-1.5">
                <span className="inline-block px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/35 text-amber-800 dark:text-amber-300 text-xs font-black">
                  قافلة القائم للحج والعمرة والزيارة — موسم {seasonYear}هـ
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  الحاج/ {fullPilgrimName}
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-1">
                <div className="bg-white dark:bg-[#070C18]/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-sm">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-bold">المنجز</span>
                  <strong className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    {completedCount}
                  </strong>
                </div>
                <div className="bg-white dark:bg-[#070C18]/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-sm">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-bold">الإجمالي</span>
                  <strong className="text-xl font-black text-slate-900 dark:text-white font-mono">
                    {totalEnabledRituals}
                  </strong>
                </div>
                <div className="bg-white dark:bg-[#070C18]/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-sm">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-bold">النسبة</span>
                  <strong className="text-xl font-black text-amber-700 dark:text-amber-400 font-mono">
                    {progressPercent}%
                  </strong>
                </div>
              </div>

              <div className="bg-white dark:bg-[#070C18]/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 text-right text-xs text-slate-700 dark:text-slate-200 leading-relaxed shadow-sm">
                {shareMessageText}
              </div>
            </div>

            <div className="p-5 sm:p-6 bg-white dark:bg-[#0B1221]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href={whatsappShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow transition"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>مشاركة عبر واتساب</span>
                </a>

                <button
                  type="button"
                  onClick={handleCopyShareText}
                  className="px-4 py-3.5 rounded-2xl bg-amber-50 dark:bg-[#070C18] hover:bg-amber-100 dark:hover:bg-slate-900 border border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Copy className="w-4 h-4" />
                  <span>{copiedShareText ? 'تم نسخ التهنئة ✓' : 'نسخ نص الإنجاز'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
