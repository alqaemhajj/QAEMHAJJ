import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Plus,
  Edit3,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles,
  Loader2,
  Headphones,
  ListChecks,
  X,
} from 'lucide-react';
import {
  AdminUser,
  CampaignSettings,
  ManasikRitualItem,
  ManasikRulingCategory,
  ManasikStage,
} from '../../types';
import {
  deleteManasikStage,
  pruneDeletedRitualIdsFromAllPilgrims,
  restoreDefaultManasikStages,
  saveAllManasikStagesBatch,
  saveManasikStage,
  subscribeToManasikStages,
} from '../../lib/manasikDb';
import { RitualAudioManager } from '../RitualAudioManager';

interface ManasikGuideAdminProps {
  campaignSettings: CampaignSettings;
  currentAdminUser: AdminUser | null;
  onUpdateCampaignSettings: (updated: CampaignSettings) => Promise<boolean> | boolean | void;
}

const RULING_OPTIONS: Array<{ value: ManasikRulingCategory; label: string; badgeClass: string }> = [
  { value: '', label: 'بدون تصنيف شرعي', badgeClass: 'bg-slate-800 text-slate-300 border-slate-700' },
  { value: 'ركن', label: 'ركن', badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/35' },
  { value: 'واجب', label: 'واجب', badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/35' },
  { value: 'سنة', label: 'سنة', badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35' },
  { value: 'مستحب', label: 'مستحب', badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/35' },
  {
    value: 'تنبيه خاص بالقافلة',
    label: 'تنبيه خاص بالقافلة',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/35',
  },
];

export function getRulingBadgeClass(ruling?: string): string {
  const found = RULING_OPTIONS.find((r) => r.value === (ruling || ''));
  return found ? found.badgeClass : 'bg-slate-800 text-slate-300 border-slate-700';
}

export const ManasikGuideAdmin: React.FC<ManasikGuideAdminProps> = ({
  campaignSettings,
  currentAdminUser,
  onUpdateCampaignSettings,
}) => {
  const [stages, setStages] = useState<ManasikStage[]>([]);
  const [expandedStageIds, setExpandedStageIds] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showAudioManager, setShowAudioManager] = useState(false);

  // Stage Create / Edit Modal state
  const [editingStage, setEditingStage] = useState<Partial<ManasikStage> | null>(null);

  // Ritual Create / Edit Modal state
  const [editingRitualCtx, setEditingRitualCtx] = useState<{
    stageId: string;
    stageTitle: string;
    ritual: Partial<ManasikRitualItem>;
    isNew: boolean;
  } | null>(null);

  // Confirmation Modals
  const [confirmDeleteStage, setConfirmDeleteStage] = useState<ManasikStage | null>(null);
  const [confirmDeleteRitual, setConfirmDeleteRitual] = useState<{
    stage: ManasikStage;
    ritual: ManasikRitualItem;
  } | null>(null);
  const [confirmRestoreDefaults, setConfirmRestoreDefaults] = useState(false);

  const actorName = currentAdminUser?.fullName || currentAdminUser?.username || 'الإشراف الديني';

  useEffect(() => {
    const unsub = subscribeToManasikStages((list) => {
      setStages(list);
      setExpandedStageIds((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const init: Record<string, boolean> = {};
        if (list[0]) init[list[0].id] = true;
        return init;
      });
    });
    return unsub;
  }, []);

  const showNotice = (type: 'ok' | 'err', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  const stats = useMemo(() => {
    const totalStages = stages.length;
    const enabledStages = stages.filter((s) => s.isEnabled).length;
    const totalRituals = stages.reduce((acc, s) => acc + (s.rituals?.length || 0), 0);
    const enabledRituals = stages.reduce(
      (acc, s) =>
        acc + (s.isEnabled ? (s.rituals || []).filter((r) => r.isEnabled).length : 0),
      0
    );
    return { totalStages, enabledStages, totalRituals, enabledRituals };
  }, [stages]);

  const toggleExpandStage = (stageId: string) => {
    setExpandedStageIds((prev) => ({ ...prev, [stageId]: !prev[stageId] }));
  };

  const handleSaveStageForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStage?.title?.trim()) return;
    setSaving(true);
    try {
      const isNew = !editingStage.id;
      const stageId =
        editingStage.id || `stage-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const existing = stages.find((s) => s.id === stageId);
      const nextStage: ManasikStage = {
        id: stageId,
        title: editingStage.title.trim(),
        subtitle: (editingStage.subtitle || '').trim(),
        summary: (editingStage.summary || '').trim(),
        campaignTip: (editingStage.campaignTip || '').trim(),
        order:
          typeof editingStage.order === 'number'
            ? editingStage.order
            : existing?.order || stages.length + 1,
        isEnabled: editingStage.isEnabled !== false,
        rituals: existing?.rituals || [],
      };
      const savedStage = await saveManasikStage(nextStage, actorName);
      setStages((prev) => {
        const exists = prev.some((s) => s.id === savedStage.id);
        const list = exists
          ? prev.map((s) => (s.id === savedStage.id ? savedStage : s))
          : [...prev, savedStage];
        return list.sort((a, b) => a.order - b.order);
      });
      setExpandedStageIds((prev) => ({ ...prev, [stageId]: true }));
      setEditingStage(null);
      showNotice(
        'ok',
        isNew
          ? `تمت إضافة المرحلة «${nextStage.title}» ونشرها في الدليل العام وبوابة الحاج والمرشد الذكي.`
          : `تم تحديث المرحلة «${nextStage.title}» ومزامنتها فوراً بنجاح.`
      );
    } catch (err: any) {
      showNotice('err', err?.message || 'تعذر حفظ المرحلة في قاعدة البيانات.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStageEnabled = async (stage: ManasikStage) => {
    setSaving(true);
    try {
      const next: ManasikStage = { ...stage, isEnabled: !stage.isEnabled };
      const savedStage = await saveManasikStage(next, actorName);
      setStages((prev) => prev.map((s) => (s.id === savedStage.id ? savedStage : s)));
      showNotice(
        'ok',
        next.isEnabled
          ? `تم تفعيل مرحلة «${stage.title}» للظهور في الدليل وبوابة الحاج.`
          : `تم إخفاء مرحلة «${stage.title}» مؤقتاً عن الزوار والحجاج.`
      );
    } catch (err: any) {
      showNotice('err', err?.message || 'تعذر تحديث حالة المرحلة.');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveStage = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= stages.length) return;
    setSaving(true);
    try {
      const reordered = [...stages];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(targetIdx, 0, moved);
      const updated = reordered.map((st, idx) => ({ ...st, order: idx + 1 }));
      setStages(updated);
      await saveAllManasikStagesBatch(updated, actorName);
      showNotice('ok', 'تم تحديث ترتيب المراحل في دليل المناسك.');
    } catch (err: any) {
      showNotice('err', err?.message || 'تعذر إعادة ترتيب المراحل.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteStage = async () => {
    if (!confirmDeleteStage) return;
    setSaving(true);
    try {
      const deletedStage = confirmDeleteStage;
      await deleteManasikStage(deletedStage.id, deletedStage.title, actorName);
      const remainingStages = stages.filter((s) => s.id !== deletedStage.id);
      setStages(remainingStages);
      const validIds = new Set<string>();
      remainingStages.forEach((st) => (st.rituals || []).forEach((r) => validIds.add(r.id)));
      await pruneDeletedRitualIdsFromAllPilgrims(validIds);
      showNotice(
        'ok',
        `تم حذف مرحلة «${deletedStage.title}» نهائياً وتحديث قوائم الإنجاز للحجاج تلقائياً.`
      );
      setConfirmDeleteStage(null);
    } catch (err: any) {
      showNotice('err', err?.message || 'تعذر حذف المرحلة.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRitualForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRitualCtx || !editingRitualCtx.ritual.title?.trim()) return;

    const targetStage = stages.find((s) => s.id === editingRitualCtx.stageId);
    if (!targetStage) return;

    setSaving(true);
    try {
      const r = editingRitualCtx.ritual;
      const ritualId =
        r.id || `ritual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const existingRituals = [...(targetStage.rituals || [])];
      const nextOrder =
        typeof r.order === 'number' && Number.isFinite(r.order)
          ? r.order
          : existingRituals.length + 1;

      const fullRitual: ManasikRitualItem = {
        id: ritualId,
        title: (r.title || '').trim(),
        ruling: (r.ruling || '') as ManasikRulingCategory,
        explanation: (r.explanation || '').trim(),
        campaignNote: (r.campaignNote || '').trim(),
        order: nextOrder,
        isEnabled: r.isEnabled !== false,
        updatedAt: new Date().toISOString(),
      };

      const nextRituals = editingRitualCtx.isNew
        ? [...existingRituals, fullRitual]
        : existingRituals.map((item) => (item.id === ritualId ? fullRitual : item));

      nextRituals.sort((a, b) => a.order - b.order);

      const savedStage = await saveManasikStage(
        { ...targetStage, rituals: nextRituals },
        actorName
      );
      setStages((prev) => prev.map((s) => (s.id === savedStage.id ? savedStage : s)));
      setEditingRitualCtx(null);
      showNotice(
        'ok',
        editingRitualCtx.isNew
          ? `تمت إضافة النسك «${fullRitual.title}» وإدراجه في الدليل العام وبوابة الحاج والمرشد الذكي.`
          : `تم تحديث النسك «${fullRitual.title}» ومزامنته في جميع الواجهات.`
      );
    } catch (err: any) {
      showNotice('err', err?.message || 'تعذر حفظ النسك.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRitualEnabled = async (stage: ManasikStage, ritualId: string) => {
    setSaving(true);
    try {
      const nextRituals = (stage.rituals || []).map((r) =>
        r.id === ritualId ? { ...r, isEnabled: !r.isEnabled, updatedAt: new Date().toISOString() } : r
      );
      const savedStage = await saveManasikStage({ ...stage, rituals: nextRituals }, actorName);
      setStages((prev) => prev.map((s) => (s.id === savedStage.id ? savedStage : s)));
    } catch (err: any) {
      showNotice('err', err?.message || 'تعذر تغيير حالة النسك.');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveRitual = async (
    stage: ManasikStage,
    ritualIndex: number,
    direction: -1 | 1
  ) => {
    const list = [...(stage.rituals || [])];
    const targetIdx = ritualIndex + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    setSaving(true);
    try {
      const [moved] = list.splice(ritualIndex, 1);
      list.splice(targetIdx, 0, moved);
      const reordered = list.map((r, i) => ({ ...r, order: i + 1 }));
      const savedStage = await saveManasikStage({ ...stage, rituals: reordered }, actorName);
      setStages((prev) => prev.map((s) => (s.id === savedStage.id ? savedStage : s)));
    } catch (err: any) {
      showNotice('err', err?.message || 'تعذر إعادة ترتيب المناسك.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteRitual = async () => {
    if (!confirmDeleteRitual) return;
    const { stage, ritual } = confirmDeleteRitual;
    setSaving(true);
    try {
      const nextRituals = (stage.rituals || [])
        .filter((r) => r.id !== ritual.id)
        .map((r, i) => ({ ...r, order: i + 1 }));
      const savedStage = await saveManasikStage({ ...stage, rituals: nextRituals }, actorName);
      const updatedStages = stages.map((s) => (s.id === savedStage.id ? savedStage : s));
      setStages(updatedStages);

      const validIds = new Set<string>();
      updatedStages.forEach((st) => (st.rituals || []).forEach((r) => validIds.add(r.id)));
      await pruneDeletedRitualIdsFromAllPilgrims(validIds);

      setConfirmDeleteRitual(null);
      showNotice(
        'ok',
        `تم حذف النسك «${ritual.title}» نهائياً وإعادة احتساب نسب إنجاز الحجاج تلقائياً.`
      );
    } catch (err: any) {
      showNotice('err', err?.message || 'تعذر حذف النسك.');
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefaults = async () => {
    setSaving(true);
    try {
      const restored = await restoreDefaultManasikStages(actorName);
      setStages(restored);
      setConfirmRestoreDefaults(false);
      showNotice('ok', 'تمت استعادة الجدول الافتراضي للمناسك (6 مراحل و 24 نسكاً) بنجاح.');
    } catch (err: any) {
      showNotice('err', err?.message || 'تعذر استعادة البيانات الافتراضية.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#070C18] via-[#0E182D] to-[#070C18] border border-amber-500/30 rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
            <ListChecks className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-black text-white">
                إدارة دليل المناسك (الإرشاد الديني)
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                مرتبط حياً بالدليل العام + بوابة استعلام الحاج + مرشد القائم الذكي
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-2xl">
              تحكم كامل بمراحل الحج والأعمال والمناسك والأحكام الشرعية والأدعية المأثورة وملاحظات القافلة؛ كل تعديل أو إضافة أو حذف يتزامن فوراً في الدليل التعليمي وقوائم متابعة الحجاج وإجابات المرشد الذكي.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAudioManager((prev) => !prev)}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer ${
              showAudioManager
                ? 'bg-sky-500 text-slate-950 border-sky-400'
                : 'bg-[#0B1221] text-sky-300 border-sky-500/35 hover:bg-sky-500/15'
            }`}
          >
            <Headphones className="w-4 h-4" />
            <span>الشروحات الصوتية للمناسك</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmRestoreDefaults(true)}
            className="px-3.5 py-2.5 rounded-xl bg-[#0B1221] hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-amber-400" />
            <span>استعادة الافتراضي</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setEditingStage({
                title: '',
                subtitle: '',
                summary: '',
                campaignTip: '',
                order: stages.length + 1,
                isEnabled: true,
              })
            }
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مرحلة / يوم جديد</span>
          </button>
        </div>
      </div>

      {/* Live Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4">
          <span className="text-[11px] text-slate-400 block font-bold">إجمالي المراحل</span>
          <strong className="text-xl font-black text-white font-mono">{stats.totalStages} مراحل</strong>
        </div>
        <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4">
          <span className="text-[11px] text-emerald-400 block font-bold">المراحل المفعّلة للزوار</span>
          <strong className="text-xl font-black text-emerald-300 font-mono">
            {stats.enabledStages} / {stats.totalStages}
          </strong>
        </div>
        <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4">
          <span className="text-[11px] text-amber-400 block font-bold">المناسك المفعّلة بالحساب</span>
          <strong className="text-xl font-black text-amber-300 font-mono">{stats.enabledRituals} نسكاً</strong>
        </div>
        <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4">
          <span className="text-[11px] text-slate-400 block font-bold">إجمالي البنود المسجلة</span>
          <strong className="text-xl font-black text-slate-200 font-mono">{stats.totalRituals} بنداً</strong>
        </div>
      </div>

      {/* Feedback Notice */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/35 text-rose-300'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Optional Supervisor Audio Guides Uploader */}
      {showAudioManager && (
        <div className="animate-fadeIn">
          <RitualAudioManager
            campaignSettings={campaignSettings}
            onUpdateCampaignSettings={onUpdateCampaignSettings}
            currentSupervisorName={actorName}
          />
        </div>
      )}

      {/* Stages & Rituals Accordion List */}
      <div className="space-y-4">
        {stages.map((stage, stageIdx) => {
          const isExpanded = Boolean(expandedStageIds[stage.id]);
          const rituals = [...(stage.rituals || [])].sort((a, b) => a.order - b.order);
          const enabledInStage = rituals.filter((r) => r.isEnabled).length;

          return (
            <div
              key={stage.id}
              className={`bg-[#0B1221] border rounded-3xl overflow-hidden shadow-lg transition ${
                stage.isEnabled ? 'border-slate-800' : 'border-slate-800/60 opacity-80'
              }`}
            >
              {/* Stage Header Bar */}
              <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#0D1628]/80 border-b border-slate-800/80">
                <div
                  className="flex items-start gap-3 flex-1 cursor-pointer"
                  onClick={() => toggleExpandStage(stage.id)}
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center text-sm shrink-0 shadow">
                    {stageIdx + 1}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-white">{stage.title}</h3>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          stage.isEnabled
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {stage.isEnabled ? 'مفعّل للحجاج' : 'مخفي'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {enabledInStage} / {rituals.length} نسك مفعّل
                      </span>
                    </div>
                    {stage.subtitle && (
                      <p className="text-xs text-slate-400">{stage.subtitle}</p>
                    )}
                  </div>
                </div>

                {/* Stage Controls */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={saving || stageIdx === 0}
                    onClick={() => handleMoveStage(stageIdx, -1)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40 cursor-pointer"
                    title="نقل للأعلى"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={saving || stageIdx === stages.length - 1}
                    onClick={() => handleMoveStage(stageIdx, 1)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40 cursor-pointer"
                    title="نقل للأسفل"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleToggleStageEnabled(stage)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer ${
                      stage.isEnabled
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {stage.isEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>{stage.isEnabled ? 'مفعّل' : 'مخفي'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingStage(stage)}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>تعديل المرحلة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteStage(stage)}
                    className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 cursor-pointer"
                    title="حذف المرحلة"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleExpandStage(stage.id)}
                    className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <span>{isExpanded ? 'طيّ' : 'إدارة المناسك'}</span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded Rituals List inside Stage */}
              {isExpanded && (
                <div className="p-4 sm:p-6 space-y-4 bg-[#070C18]/60">
                  {(stage.summary || stage.campaignTip) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {stage.summary && (
                        <div className="bg-[#0B1221] border border-slate-800 rounded-xl p-3 text-slate-300">
                          <span className="text-amber-400 font-bold block mb-1">ملخص المرحلة:</span>
                          {stage.summary}
                        </div>
                      )}
                      {stage.campaignTip && (
                        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 text-slate-200">
                          <span className="text-amber-300 font-bold block mb-1">توجيه القافلة لهذه المرحلة:</span>
                          {stage.campaignTip}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <h4 className="text-xs sm:text-sm font-black text-amber-400 flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      <span>الأعمال والمناسك داخل المرحلة ({rituals.length})</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingRitualCtx({
                          stageId: stage.id,
                          stageTitle: stage.title,
                          isNew: true,
                          ritual: {
                            title: '',
                            ruling: 'واجب',
                            explanation: '',
                            campaignNote: '',
                            order: rituals.length + 1,
                            isEnabled: true,
                          },
                        })
                      }
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة نسك / عمل جديد</span>
                    </button>
                  </div>

                  {rituals.length === 0 ? (
                    <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                      لا توجد مناسك مضافة في هذه المرحلة بعد. اضغط على «إضافة نسك / عمل جديد» لإضافتها.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {rituals.map((ritual, rIdx) => (
                        <div
                          key={ritual.id}
                          className={`bg-[#0B1221] border rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 transition ${
                            ritual.isEnabled
                              ? 'border-slate-800 hover:border-amber-500/40'
                              : 'border-slate-800/50 opacity-70'
                          }`}
                        >
                          <div className="space-y-1.5 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="w-6 h-6 rounded-lg bg-slate-800 text-amber-400 font-mono text-xs font-black flex items-center justify-center">
                                {rIdx + 1}
                              </span>
                              {ritual.ruling && (
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getRulingBadgeClass(
                                    ritual.ruling
                                  )}`}
                                >
                                  {ritual.ruling}
                                </span>
                              )}
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                  ritual.isEnabled
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}
                              >
                                {ritual.isEnabled ? 'مفعّل' : 'مخفي'}
                              </span>
                            </div>

                            <h5 className="text-sm sm:text-base font-bold text-white">{ritual.title}</h5>

                            {ritual.explanation && (
                              <p className="text-xs text-slate-300 line-clamp-2 whitespace-pre-line">
                                {ritual.explanation}
                              </p>
                            )}

                            {ritual.campaignNote && (
                              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-lg">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>{ritual.campaignNote}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={saving || rIdx === 0}
                              onClick={() => handleMoveRitual(stage, rIdx, -1)}
                              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 disabled:opacity-40 cursor-pointer"
                              title="رفع للأعلى"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={saving || rIdx === rituals.length - 1}
                              onClick={() => handleMoveRitual(stage, rIdx, 1)}
                              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 disabled:opacity-40 cursor-pointer"
                              title="تنزيل للأسفل"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleToggleRitualEnabled(stage, ritual.id)}
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 cursor-pointer ${
                                ritual.isEnabled
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              {ritual.isEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                              <span>{ritual.isEnabled ? 'مفعّل' : 'مخفي'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setEditingRitualCtx({
                                  stageId: stage.id,
                                  stageTitle: stage.title,
                                  isNew: false,
                                  ritual: { ...ritual },
                                })
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>تعديل</span>
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => setConfirmDeleteRitual({ stage, ritual })}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              title="حذف النسك"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Stage Create / Edit Modal */}
      {editingStage && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveStageForm}
            className="bg-[#0B1221] border border-amber-500/40 rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black text-amber-400">
                {editingStage.id ? 'تعديل المرحلة / اليوم' : 'إضافة مرحلة / يوم جديد لدليل المناسك'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingStage(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-3">
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  اسم المرحلة / اليوم *
                </label>
                <input
                  type="text"
                  required
                  value={editingStage.title || ''}
                  onChange={(e) => setEditingStage({ ...editingStage, title: e.target.value })}
                  placeholder="مثال: اليوم التاسع: يوم عرفة (9 ذو الحجة)"
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">الترتيب</label>
                <input
                  type="number"
                  min={1}
                  value={editingStage.order ?? stages.length + 1}
                  onChange={(e) =>
                    setEditingStage({ ...editingStage, order: Number(e.target.value) || 1 })
                  }
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-mono text-amber-300"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">العنوان الفرعي (اختياري)</label>
              <input
                type="text"
                value={editingStage.subtitle || ''}
                onChange={(e) => setEditingStage({ ...editingStage, subtitle: e.target.value })}
                placeholder="مثال: الوقوف بالركن الأعظم والنفير إلى مزدلفة"
                className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">ملخص المرحلة</label>
              <textarea
                rows={2}
                value={editingStage.summary || ''}
                onChange={(e) => setEditingStage({ ...editingStage, summary: e.target.value })}
                className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">تنبيه وتوجيه القافلة للمرحلة</label>
              <textarea
                rows={2}
                value={editingStage.campaignTip || ''}
                onChange={(e) => setEditingStage({ ...editingStage, campaignTip: e.target.value })}
                className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <label className="flex items-center gap-2.5 bg-[#070C18] border border-slate-800 rounded-xl p-3 cursor-pointer text-xs font-bold text-slate-200">
              <input
                type="checkbox"
                checked={editingStage.isEnabled !== false}
                onChange={(e) =>
                  setEditingStage({ ...editingStage, isEnabled: e.target.checked })
                }
                className="w-4 h-4 accent-emerald-500"
              />
              <span>تفعيل ظهور هذه المرحلة للحجاج في دليل المناسك</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingStage(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 cursor-pointer"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>حفظ المرحلة</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Ritual Create / Edit Modal */}
      {editingRitualCtx && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveRitualForm}
            className="bg-[#0B1221] border border-amber-500/40 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl my-8"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-amber-400">
                  {editingRitualCtx.isNew ? 'إضافة نسك / عمل جديد' : 'تعديل بيانات النسك'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  المرحلة: {editingRitualCtx.stageTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRitualCtx(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">
                عنوان النسك / العمل *
              </label>
              <input
                type="text"
                required
                value={editingRitualCtx.ritual.title || ''}
                onChange={(e) =>
                  setEditingRitualCtx({
                    ...editingRitualCtx,
                    ritual: { ...editingRitualCtx.ritual, title: e.target.value },
                  })
                }
                placeholder="مثال: رمي جمرة العقبة الكبرى"
                className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  التصنيف / الحكم الشرعي (اختياري)
                </label>
                <select
                  value={editingRitualCtx.ritual.ruling || ''}
                  onChange={(e) =>
                    setEditingRitualCtx({
                      ...editingRitualCtx,
                      ritual: {
                        ...editingRitualCtx.ritual,
                        ruling: e.target.value as ManasikRulingCategory,
                      },
                    })
                  }
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold text-amber-300 focus:outline-none focus:border-amber-500"
                >
                  {RULING_OPTIONS.map((opt) => (
                    <option key={opt.value || 'none'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  ترتيب الظهور (Order)
                </label>
                <input
                  type="number"
                  min={1}
                  value={editingRitualCtx.ritual.order ?? 1}
                  onChange={(e) =>
                    setEditingRitualCtx({
                      ...editingRitualCtx,
                      ritual: {
                        ...editingRitualCtx.ritual,
                        order: Number(e.target.value) || 1,
                      },
                    })
                  }
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-2.5 text-xs font-mono text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">
                توقيت أو ملاحظة القافلة (اختياري)
              </label>
              <input
                type="text"
                value={editingRitualCtx.ritual.campaignNote || ''}
                onChange={(e) =>
                  setEditingRitualCtx({
                    ...editingRitualCtx,
                    ritual: { ...editingRitualCtx.ritual, campaignNote: e.target.value },
                  })
                }
                placeholder='مثال: "تتحرك حافلات القافلة الساعة 8 مساءً"'
                className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">
                الشرح المختصر والأدعية المأثورة
              </label>
              <textarea
                rows={5}
                value={editingRitualCtx.ritual.explanation || ''}
                onChange={(e) =>
                  setEditingRitualCtx({
                    ...editingRitualCtx,
                    ritual: { ...editingRitualCtx.ritual, explanation: e.target.value },
                  })
                }
                placeholder="اكتب الشرح المبسط للحاج مع الأدعية والأذكار المأثورة في هذا النسك..."
                className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white leading-relaxed focus:outline-none focus:border-amber-500"
              />
            </div>

            <label className="flex items-center gap-2.5 bg-[#070C18] border border-slate-800 rounded-xl p-3 cursor-pointer text-xs font-bold text-slate-200">
              <input
                type="checkbox"
                checked={editingRitualCtx.ritual.isEnabled !== false}
                onChange={(e) =>
                  setEditingRitualCtx({
                    ...editingRitualCtx,
                    ritual: {
                      ...editingRitualCtx.ritual,
                      isEnabled: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 accent-emerald-500"
              />
              <span>حالة التفعيل: مفعّل ويظهر في القائمة التفاعلية للحجاج</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingRitualCtx(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 cursor-pointer"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>حفظ النسك</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirm Delete Stage Modal */}
      {confirmDeleteStage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setConfirmDeleteStage(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0B1221] border border-rose-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-rose-400">تأكيد حذف المرحلة</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  هل أنت متأكد من حذف مرحلة «{confirmDeleteStage.title}» وجميع المناسك المرتبطة بها ({confirmDeleteStage.rituals?.length || 0}) نهائياً؟ سيتم حذفها من الدليل العام ومن قوائم الحجاج وإعادة احتساب نسب الإنجاز تلقائياً.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteStage(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmDeleteStage}
                className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>تأكيد الحذف النهائي</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Single Ritual Modal */}
      {confirmDeleteRitual && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setConfirmDeleteRitual(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0B1221] border border-rose-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-rose-400">تأكيد حذف النسك / العمل</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  هل أنت متأكد من حذف «{confirmDeleteRitual.ritual.title}» من مرحلة «{confirmDeleteRitual.stage.title}»؟ سيتم حذفه من الدليل العام وقوائم متابعة الحجاج وتحديث نسب الإنجاز تلقائياً.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteRitual(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmDeleteRitual}
                className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>نعم، حذف النسك</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Restore Defaults Modal */}
      {confirmRestoreDefaults && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B1221] border border-amber-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-black text-amber-400">استعادة جدول المناسك الافتراضي</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              سيقوم هذا الإجراء بإعادة تعبئة المراحل الست الأساسية وأعمال الحج الـ 24 الافتراضية. هل ترغب في المتابعة؟
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRestoreDefaults(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleRestoreDefaults}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black cursor-pointer"
              >
                {saving ? 'جاري الاستعادة...' : 'نعم، استعادة الافتراضي'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
