import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BookOpen,
  CheckSquare,
  Sparkles,
  CheckCircle2,
  Calendar,
  Clock,
  ShieldCheck,
  PhoneCall,
  Headphones,
  Play,
  Pause,
  Volume2,
  User,
  ChevronDown,
  ChevronUp,
  X,
  ListChecks,
  ArrowLeft,
  UserCheck,
} from 'lucide-react';
import {
  CampaignSettings,
  ManasikRitualItem,
  ManasikStage,
  RitualAudioGuide,
  RitualAudioScope,
} from '../types';
import { subscribeToManasikStages } from '../lib/manasikDb';
import { INITIAL_MANASIK_STAGES } from '../data/manasikSeedData';
import { RitualSitesMap } from './maps/RitualSitesMap';

interface GuideViewProps {
  campaignSettings?: CampaignSettings;
  initialTab?: string;
  onNavigateToPortal?: () => void;
}

type MapDayKey = 'day1' | 'day2' | 'day3' | 'day4' | 'day5' | 'checklist';

const SCOPE_BADGE_MAP: Record<RitualAudioScope, string> = {
  general: 'إرشادات عامة',
  umrah: 'مناسك العمرة',
  day1: '8 ذو الحجة (التروية)',
  day2: '9 ذو الحجة (عرفة)',
  day3: '10 ذو الحجة (العيد)',
  day4: 'أيام التشريق',
  day5: 'طواف الوداع',
  checklist: 'حقيبة الحاج',
};

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

function formatTimeMMSS(seconds?: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const GuideView: React.FC<GuideViewProps> = ({
  campaignSettings,
  initialTab,
  onNavigateToPortal,
}) => {
  // Dynamic Firestore-synced stages (offline-cached & seeded automatically)
  const [allStages, setAllStages] = useState<ManasikStage[]>(INITIAL_MANASIK_STAGES);
  const [selectedTab, setSelectedTab] = useState<string>(initialTab || 'all');

  // Accordion open state when viewing 'all'
  const [expandedStageIds, setExpandedStageIds] = useState<Record<string, boolean>>({});

  // Modal: Ritual Details (شرح / دعاء) — read-only educational view
  const [detailModal, setDetailModal] = useState<{
    stageTitle: string;
    ritual: ManasikRitualItem;
  } | null>(null);

  // Audio player state
  const [audioFilter, setAudioFilter] = useState<'matching' | 'umrah' | 'all'>('matching');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [audioErrorId, setAudioErrorId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToManasikStages((stages) => {
      setAllStages(Array.isArray(stages) ? stages : []);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (initialTab) {
      setSelectedTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  // Only enabled stages and enabled rituals are visible to visitors
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

  // Ensure valid selectedTab if admin hides or deletes the currently selected stage
  useEffect(() => {
    if (selectedTab === 'all' || selectedTab === 'checklist') return;
    const stillExists = enabledStages.some((st) => st.id === selectedTab);
    if (!stillExists && enabledStages.length > 0) {
      setSelectedTab('all');
    }
  }, [enabledStages, selectedTab]);

  // Open the first enabled stage by default in 'all' mode
  useEffect(() => {
    if (enabledStages.length === 0) return;
    setExpandedStageIds((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      return { [enabledStages[0].id]: true };
    });
  }, [enabledStages]);

  const totalEnabledRituals = useMemo(
    () => enabledStages.reduce((acc, st) => acc + st.rituals.length, 0),
    [enabledStages]
  );

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

  // Safe day key for RitualSitesMap & Audio scope matching
  const mapSafeDayTab: MapDayKey = useMemo(() => {
    if (
      selectedTab === 'day1' ||
      selectedTab === 'day2' ||
      selectedTab === 'day3' ||
      selectedTab === 'day4' ||
      selectedTab === 'day5' ||
      selectedTab === 'checklist'
    ) {
      return selectedTab;
    }
    if (selectedTab === 'stage-prep') return 'day1';
    return 'day1';
  }, [selectedTab]);

  // Audio player helpers
  const activeAudioGuides = useMemo(() => {
    const raw = Array.isArray(campaignSettings?.ritualAudioGuides)
      ? campaignSettings.ritualAudioGuides
      : [];
    return raw.filter((item) => item && item.isActive !== false && Boolean(item.audioUrl));
  }, [campaignSettings?.ritualAudioGuides]);

  const matchingTabGuides = useMemo(() => {
    return activeAudioGuides.filter(
      (item) =>
        selectedTab === 'all' ||
        item.ritualScope === mapSafeDayTab ||
        item.ritualScope === 'general'
    );
  }, [activeAudioGuides, selectedTab, mapSafeDayTab]);

  const umrahAudioGuides = useMemo(() => {
    return activeAudioGuides.filter((item) => item.ritualScope === 'umrah');
  }, [activeAudioGuides]);

  const displayedAudioGuides = useMemo(() => {
    if (audioFilter === 'all') return activeAudioGuides;
    if (audioFilter === 'umrah') return umrahAudioGuides;
    return matchingTabGuides.length > 0 ? matchingTabGuides : activeAudioGuides;
  }, [audioFilter, activeAudioGuides, umrahAudioGuides, matchingTabGuides]);

  const handleTogglePlay = (guide: RitualAudioGuide) => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    setAudioErrorId(null);

    if (playingId === guide.id) {
      if (audioEl.paused) {
        audioEl.play().catch(() => setAudioErrorId(guide.id));
        setIsPaused(false);
      } else {
        audioEl.pause();
        setIsPaused(true);
      }
      return;
    }

    audioEl.pause();
    audioEl.src = guide.audioUrl;
    audioEl.currentTime = 0;
    setCurrentTime(0);
    setDuration(guide.durationSeconds || 0);
    setPlayingId(guide.id);
    setIsPaused(false);
    audioEl.play().catch(() => {
      setAudioErrorId(guide.id);
      setIsPaused(true);
    });
  };

  const handleSeek = (guide: RitualAudioGuide, nextSeconds: number) => {
    const audioEl = audioRef.current;
    if (!audioEl || playingId !== guide.id) return;
    audioEl.currentTime = nextSeconds;
    setCurrentTime(nextSeconds);
  };

  const checklistItems = [
    {
      category: 'الوثائق الرسمية',
      items: [
        'أصل بطاقة الهوية الوطنية أو الإقامة سارية المفعول',
        'جواز السفر (للضرورة)',
        'بطاقة العضوية والتعريف الصادرة من قافلة القائم',
      ],
    },
    {
      category: 'الملابس والإحرام',
      items: [
        'ثوبا الإحرام القطعيان (للرجال) + حزام الإحرام',
        'ملابس ساترة وفضفاضة وطاهرة (للنساء)',
        'أحذية خفيفة مريحة ومقاومة للانزلاق للمشي',
      ],
    },
    {
      category: 'الصحة والوقاية',
      items: [
        'الأدوية الشخصية المزمنة مع الوصفة الطبية',
        'شهادة التطعيمات والحمى الشوكية والإنفلونزا',
        'كمامات طبية ومعقمات ومطهرات شخصية',
      ],
    },
    {
      category: 'التجهيزات الشخصية والتقنية',
      items: [
        'شاحن متنقل (Power Bank) + سلك الشحن',
        'مظلة شمسية واقية من الشمس',
        'مصحف صغير وكتيب أدعية المناسك',
        'حقيبة يد صغيرة لتنقلات المشاعر المقدسة',
      ],
    },
  ];

  // Stages to display in main interactive checklist view
  const displayedStages = useMemo(() => {
    if (selectedTab === 'checklist') return [];
    if (selectedTab === 'all') return enabledStages;
    return enabledStages.filter((st) => st.id === selectedTab);
  }, [selectedTab, enabledStages]);

  return (
    <div className="max-w-6xl mx-auto py-8 sm:py-12 px-4 sm:px-6 text-right space-y-7">
      {/* Hidden shared HTMLAudioElement */}
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime || 0);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => {
          setIsPaused(true);
          setCurrentTime(0);
        }}
        onPause={() => setIsPaused(true)}
        onPlay={() => setIsPaused(false)}
        onError={() => {
          if (playingId) setAudioErrorId(playingId);
          setIsPaused(true);
        }}
      />

      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 bg-amber-50 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/30 px-4 py-1.5 rounded-full text-amber-700 dark:text-amber-400 text-xs font-bold">
          <BookOpen className="w-4 h-4" />
          <span>المرجع الإرشادي والتعليمي لمناسك الحج - موسم 1448هـ</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
          دليل المناسك والأعمال الإرشادي
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          تعرّف على مناسك الحج والأحكام الشرعية والأدعية المأثورة وتوجيهات قافلة القائم لكل مرحلة قبل وأثناء رحلتك الإيمانية.
        </p>
      </div>

      {/* Dedicated Registered Pilgrim CTA Banner (Replaces Personal Progress Bar & Checkboxes) */}
      <div className="bg-gradient-to-l from-amber-50 via-white to-amber-50/70 dark:from-[#0E1930] dark:via-[#0B1221] dark:to-[#0E1930] border-2 border-amber-400/60 dark:border-amber-500/45 rounded-3xl p-5 sm:p-7 shadow-md dark:shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
            <UserCheck className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
              <span>خدمة خاصة بحجاج القافلة المسجلين</span>
            </span>
            <h2 className="text-base sm:text-xl font-black text-slate-900 dark:text-white leading-snug">
              لمتابعة إنجاز مناسكك خطوة بخطوة، ادخل إلى بوابة استعلام الحاج
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              توثّق قائمة متابعة المناسك وشريط التقدم ومشاركة بطاقة الإنجاز باسمك الرباعي حصرياً في ملفك الشخصي داخل بوابة الحاج الآمنة.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {onNavigateToPortal && (
            <button
              type="button"
              onClick={onNavigateToPortal}
              className="px-6 py-3.5 rounded-2xl bg-gradient-to-l from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/25 transition cursor-pointer"
            >
              <span>الدخول إلى بوابة استعلام الحاج</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <a
            href={`tel:${campaignSettings?.phone || '0534717773'}`}
            className="px-4 py-3.5 rounded-2xl bg-white dark:bg-[#070C18] hover:bg-slate-50 dark:hover:bg-slate-900 border border-slate-300 dark:border-slate-700 text-amber-700 dark:text-amber-300 font-bold text-xs flex items-center gap-2 transition shadow-sm"
          >
            <PhoneCall className="w-4 h-4" />
            <span>طوارئ الإرشاد الديني</span>
          </a>
        </div>
      </div>

      {/* Campaign Guidance Notice */}
      <div className="bg-white dark:bg-gradient-to-r dark:from-slate-900 dark:via-slate-800/90 dark:to-slate-900 text-slate-900 dark:text-white rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/30 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm sm:text-base font-black text-amber-700 dark:text-amber-400">
              إشراف وتوجيهات مشايخ قافلة القائم
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              هذا القسم مرجع تعليمي وإرشادي شامل لجميع مراحل الحج ({enabledStages.length} مراحل • {totalEnabledRituals} نسكاً)؛ اضغط على «شرح / دعاء» بجانب أي نسك لقراءة التفصيل والأدعية المأثورة.
            </p>
          </div>
        </div>
      </div>

      {/* Dynamic Horizontal Tabs Navigation */}
      <div className="bg-white dark:bg-[#0B1221] p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedTab('all')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              selectedTab === 'all'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-50 dark:bg-[#070C18] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <ListChecks className="w-4 h-4" />
            <span>جميع المراحل</span>
            <span
              className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-black ${
                selectedTab === 'all'
                  ? 'bg-slate-950/20 text-slate-950'
                  : 'bg-amber-100 dark:bg-slate-800 text-amber-800 dark:text-amber-400'
              }`}
            >
              {totalEnabledRituals} نسكاً
            </span>
          </button>

          {enabledStages.map((stage) => {
            const isActive = selectedTab === stage.id;
            const stageTotal = stage.rituals.length;

            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setSelectedTab(stage.id)}
                className={`px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                    : 'bg-slate-50 dark:bg-[#070C18] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                <Calendar className="w-4 h-4 shrink-0" />
                <span>{stage.title}</span>
                <span
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-black ${
                    isActive
                      ? 'bg-slate-950/20 text-slate-950'
                      : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {stageTotal}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setSelectedTab('checklist')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              selectedTab === 'checklist'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-50 dark:bg-[#070C18] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>حقيبة الحاج</span>
          </button>
        </div>
      </div>

      {/* Integrated Short Audio Player Section */}
      {activeAudioGuides.length > 0 && (
        <div className="bg-white dark:bg-[#0B1221] border border-amber-300 dark:border-amber-500/35 text-slate-900 dark:text-white rounded-3xl p-5 sm:p-6 shadow-md dark:shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/30 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0">
                <Headphones className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-amber-700 dark:text-amber-400">
                  الشروحات الصوتية القصيرة لمناسك الحج والعمرة
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  استمع مباشرة إلى توجيهات وشروحات المشرفين المختصرة خطوة بخطوة
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-[#070C18] p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setAudioFilter('matching')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  audioFilter === 'matching'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                شروحات المرحلة ({matchingTabGuides.length || activeAudioGuides.length})
              </button>
              <button
                type="button"
                onClick={() => setAudioFilter('umrah')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  audioFilter === 'umrah'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                مناسك العمرة ({umrahAudioGuides.length})
              </button>
              <button
                type="button"
                onClick={() => setAudioFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  audioFilter === 'all'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                الكل ({activeAudioGuides.length})
              </button>
            </div>
          </div>

          {displayedAudioGuides.length === 0 ? (
            <div className="bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-center text-xs text-slate-500 dark:text-slate-400">
              لا توجد تسجيلات صوتية ضمن هذا التصنيف حالياً. يمكنك التبديل إلى تبويب «الكل» للاستماع لجميع الشروحات المتاحة.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {displayedAudioGuides.map((guide) => {
                const isThisSelected = playingId === guide.id;
                const isThisPlaying = isThisSelected && !isPaused;
                const totalDur = isThisSelected && duration > 0 ? duration : guide.durationSeconds || 0;
                const curPos = isThisSelected ? currentTime : 0;

                return (
                  <div
                    key={guide.id}
                    className={`bg-slate-50 dark:bg-[#070C18] border rounded-2xl p-4 space-y-3 transition ${
                      isThisSelected
                        ? 'border-amber-500/60 shadow-lg shadow-amber-500/10'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => handleTogglePlay(guide)}
                        aria-label={isThisPlaying ? `إيقاف ${guide.title}` : `تشغيل ${guide.title}`}
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition cursor-pointer shadow ${
                          isThisPlaying
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                        }`}
                      >
                        {isThisPlaying ? (
                          <Pause className="w-5 h-5 fill-current" />
                        ) : (
                          <Play className="w-5 h-5 fill-current" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">{guide.title}</h3>
                          <span className="px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-bold shrink-0">
                            {SCOPE_BADGE_MAP[guide.ritualScope] || 'إرشادات'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            <span>{guide.speakerName}</span>
                          </span>
                          {guide.durationSeconds ? (
                            <span className="inline-flex items-center gap-1 font-mono">
                              <Volume2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>{formatTimeMMSS(guide.durationSeconds)}</span>
                            </span>
                          ) : null}
                        </div>
                        {guide.description && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                            {guide.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 pt-1" dir="ltr">
                      <span className="text-[11px] font-mono text-amber-700 dark:text-amber-300 w-10 text-left shrink-0">
                        {formatTimeMMSS(curPos)}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={totalDur > 0 ? totalDur : 100}
                        step={0.5}
                        value={Math.min(curPos, totalDur > 0 ? totalDur : 100)}
                        disabled={!isThisSelected || totalDur <= 0}
                        onChange={(e) => handleSeek(guide, Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 disabled:opacity-50"
                        aria-label={`مؤشر التقدم الصوتي لـ ${guide.title}`}
                      />
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 w-10 text-right shrink-0">
                        {formatTimeMMSS(totalDur)}
                      </span>
                    </div>

                    {audioErrorId === guide.id && (
                      <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                        تعذر تشغيل هذا المقطع الصوتي حالياً. يرجى المحاولة مرة أخرى.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Main Dynamic Stages & Interactive Checklist OR Packing Checklist */}
      {selectedTab !== 'checklist' ? (
        <div className="space-y-5">
          {/* Expand/Collapse Controls when viewing all stages */}
          {selectedTab === 'all' && displayedStages.length > 1 && (
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400">
                اضغط على أي مرحلة لفتح قائمة المناسك الخاصة بها:
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={expandAllStages}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#0B1221] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-bold text-amber-700 dark:text-amber-300 cursor-pointer shadow-sm"
                >
                  توسيع الكل
                </button>
                <button
                  type="button"
                  onClick={collapseAllStages}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#0B1221] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer shadow-sm"
                >
                  طي الكل
                </button>
              </div>
            </div>
          )}

          {displayedStages.length === 0 ? (
            <div className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center space-y-2 shadow-sm">
              <BookOpen className="w-10 h-10 text-amber-500/60 dark:text-amber-400/60 mx-auto" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                لا توجد مراحل مفعّلة في دليل المناسك حالياً.
              </p>
            </div>
          ) : (
            displayedStages.map((stage, stageIdx) => {
              const isAllMode = selectedTab === 'all';
              const isExpanded = !isAllMode || Boolean(expandedStageIds[stage.id]);
              const stageRituals = stage.rituals;
              const stageTotal = stageRituals.length;

              return (
                <div
                  key={stage.id}
                  className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-amber-500/30 rounded-3xl overflow-hidden shadow-md dark:shadow-2xl transition"
                >
                  {/* Stage Header (Accordion Trigger in 'all' mode) */}
                  <div
                    onClick={() => {
                      if (isAllMode) toggleAccordionStage(stage.id);
                    }}
                    className={`p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 ${
                      isAllMode ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-[#0F182C] transition' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3.5 flex-1">
                      <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 font-black flex items-center justify-center text-base shrink-0 shadow">
                        {stageIdx + 1}
                      </div>
                      <div className="space-y-1 flex-1">
                        {stage.subtitle && (
                          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-xs font-bold">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>{stage.subtitle}</span>
                          </div>
                        )}
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                          {stage.title}
                        </h2>
                        {stage.summary && (
                          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                            {stage.summary}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="px-3.5 py-2 rounded-2xl bg-amber-50 dark:bg-[#070C18] border border-amber-200 dark:border-slate-700 text-amber-800 dark:text-amber-300 text-xs font-black flex items-center gap-2">
                        <BookOpen className="w-4 h-4 shrink-0" />
                        <span className="font-mono">{stageTotal}</span>
                        <span>أعمال ومناسك</span>
                      </div>

                      {isAllMode && (
                        <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#070C18] border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5" />
                          ) : (
                            <ChevronDown className="w-5 h-5" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stage Body */}
                  {isExpanded && (
                    <div className="p-5 sm:p-7 space-y-5 animate-fadeIn">
                      {/* Educational Ritual List Rows (Read-Only) */}
                      {stageRituals.length === 0 ? (
                        <div className="bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                          لا توجد أعمال مفعّلة في هذه المرحلة حالياً.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {stageRituals.map((ritual, rIdx) => (
                            <div
                              key={ritual.id}
                              className="rounded-2xl border p-4 sm:p-5 bg-slate-50 dark:bg-[#070C18] border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                            >
                              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#0B1221] border border-amber-300 dark:border-amber-500/35 text-amber-700 dark:text-amber-400 font-mono font-black text-sm flex items-center justify-center shrink-0 shadow-sm">
                                  {rIdx + 1}
                                </div>

                                <div className="space-y-2 flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-base sm:text-lg font-black leading-snug text-slate-900 dark:text-white">
                                      {ritual.title}
                                    </h3>
                                    {ritual.ruling && (
                                      <span
                                        className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border shrink-0 ${getRulingStyle(
                                          ritual.ruling
                                        )}`}
                                      >
                                        {ritual.ruling}
                                      </span>
                                    )}
                                  </div>

                                  {ritual.campaignNote && (
                                    <div className="inline-flex items-start gap-1.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 rounded-xl px-3 py-1.5 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                                      <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                      <span>{ritual.campaignNote}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Explanation & Dua Button */}
                              <div className="flex items-center justify-end gap-2 shrink-0 pr-12 sm:pr-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDetailModal({ stageTitle: stage.title, ritual })
                                  }
                                  className="px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-500 text-amber-800 dark:text-amber-300 hover:text-slate-950 border border-amber-300 dark:border-amber-500/35 text-xs sm:text-sm font-black flex items-center gap-2 transition cursor-pointer"
                                >
                                  <BookOpen className="w-4 h-4" />
                                  <span>شرح / دعاء</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Campaign Service Tip for this Stage */}
                      {stage.campaignTip && (
                        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5">
                          <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shrink-0 mt-0.5">
                            <Sparkles className="w-5 h-5" />
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-xs sm:text-sm font-black text-amber-800 dark:text-amber-300">
                              خدمات وتوجيهات قافلة القائم في هذه المرحلة:
                            </h4>
                            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                              {stage.campaignTip}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Packing Checklist Tab (حقيبة الحاج) */
        <div className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-amber-500/30 text-slate-900 dark:text-white rounded-3xl p-6 sm:p-10 shadow-md dark:shadow-2xl space-y-8 animate-fadeIn">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <h2 className="text-2xl font-black text-amber-700 dark:text-amber-400 flex items-center gap-3">
              <CheckSquare className="w-7 h-7 text-amber-600 dark:text-amber-400" />
              <span>قائمة التجهيزات والحقيبة الرسمية للحاج</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
              تأكد من اكتمال كافة محتويات حقيبتك قبل موعد التجمع والانطلاق مع قافلة القائم.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {checklistItems.map((category, idx) => (
              <div
                key={idx}
                className="bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-slate-800 p-6 rounded-2xl space-y-4"
              >
                <h3 className="text-base font-bold text-amber-700 dark:text-amber-400 border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{category.category}</span>
                </h3>
                <ul className="space-y-3">
                  {category.items.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium"
                    >
                      <div className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Sacred Sites Map & Routes Explorer */}
      <RitualSitesMap activeDayTab={mapSafeDayTab} />

      {/* MODAL 1: Explanation & Dua Modal (نافذة الشرح والدعاء) */}
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
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-snug">
                  {detailModal.ritual.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                aria-label="إغلاق نافذة الشرح"
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

              <div className="bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-2">
                <span className="text-xs font-black text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4" />
                  <span>الشرح والأدعية المأثورة:</span>
                </span>
                <p className="text-base sm:text-lg text-slate-800 dark:text-slate-100 leading-loose whitespace-pre-line font-medium">
                  {detailModal.ritual.explanation ||
                    'لا يوجد شرح نصي مضاف لهذا النسك حالياً.'}
                </p>
              </div>
            </div>

            <div className="p-4 sm:p-5 bg-slate-50 dark:bg-[#070C18] border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              {onNavigateToPortal ? (
                <button
                  type="button"
                  onClick={() => {
                    setDetailModal(null);
                    onNavigateToPortal();
                  }}
                  className="px-4 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-500 text-amber-800 dark:text-amber-300 hover:text-slate-950 border border-amber-300 dark:border-amber-500/35 font-black text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>متابعة إنجاز مناسكي عبر بوابة الحاج</span>
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={() => setDetailModal(null)}
                className="px-5 py-3 rounded-2xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-xs sm:text-sm cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
