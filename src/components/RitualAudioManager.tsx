import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  FileAudio,
  Headphones,
  Loader2,
  Mic,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { CampaignSettings, RitualAudioGuide, RitualAudioScope } from '../types';
import { deleteRitualAudioFile, uploadRitualAudioBlob } from '../lib/mediaManager';

export const RITUAL_AUDIO_SCOPE_LABELS: Record<RitualAudioScope, string> = {
  general: 'إرشادات عامة للحج والعمرة',
  umrah: 'مناسك العمرة (الإحرام والطواف والسعي)',
  day1: '8 ذو الحجة (يوم التروية)',
  day2: '9 ذو الحجة (يوم عرفة ومزدلفة)',
  day3: '10 ذو الحجة (يوم النحر ورمي العقبة)',
  day4: 'أيام التشريق (11 - 13 ذو الحجة)',
  day5: 'طواف الوداع والختام',
  checklist: 'حقيبة الحاج والتجهيزات',
};

export function formatAudioDuration(seconds?: number): string {
  const secs = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface RitualAudioManagerProps {
  campaignSettings: CampaignSettings;
  onUpdateCampaignSettings: (updated: CampaignSettings) => Promise<boolean> | boolean | void;
  currentSupervisorName?: string;
}

export const RitualAudioManager: React.FC<RitualAudioManagerProps> = ({
  campaignSettings,
  onUpdateCampaignSettings,
  currentSupervisorName,
}) => {
  const guides: RitualAudioGuide[] = Array.isArray(campaignSettings.ritualAudioGuides)
    ? campaignSettings.ritualAudioGuides
    : [];

  const [title, setTitle] = useState('');
  const [speakerName, setSpeakerName] = useState(currentSupervisorName || 'مشرف الإرشاد الديني');
  const [ritualScope, setRitualScope] = useState<RitualAudioScope>('general');
  const [description, setDescription] = useState('');

  const [stagedBlob, setStagedBlob] = useState<Blob | null>(null);
  const [stagedFileName, setStagedFileName] = useState('');
  const [stagedMimeType, setStagedMimeType] = useState('');
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState('');

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] = useState(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    return () => {
      if (stagedPreviewUrl) URL.revokeObjectURL(stagedPreviewUrl);
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (recordStreamRef.current) {
        recordStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [stagedPreviewUrl]);

  const clearStagedAudio = () => {
    if (stagedPreviewUrl) URL.revokeObjectURL(stagedPreviewUrl);
    setStagedBlob(null);
    setStagedFileName('');
    setStagedMimeType('');
    setStagedPreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg('');
    setSuccessMsg('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('حجم التسجيل الصوتي يتجاوز 15 ميجابايت. يرجى رفع تسجيل قصير ومضغوط.');
      return;
    }
    if (stagedPreviewUrl) URL.revokeObjectURL(stagedPreviewUrl);
    setStagedBlob(file);
    setStagedFileName(file.name);
    setStagedMimeType(file.type || 'audio/mpeg');
    setStagedPreviewUrl(URL.createObjectURL(file));
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120));
    }
  };

  const startLiveRecording = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorMsg('المتصفح الحالي لا يدعم التسجيل المباشر بالميكروفون. يمكنك رفع ملف صوتي جاهز من جهازك.');
      return;
    }
    try {
      clearStagedAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const recorder = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream);
      recordChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const mime = recorder.mimeType || preferredMime || 'audio/webm';
        const blob = new Blob(recordChunksRef.current, { type: mime });
        stream.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        setIsRecording(false);
        if (blob.size > 0) {
          setStagedBlob(blob);
          setStagedFileName(`recording-${Date.now()}.webm`);
          setStagedMimeType(mime);
          setStagedPreviewUrl(URL.createObjectURL(blob));
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setRecordSeconds(0);

      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => {
          if (prev + 1 >= 300) {
            stopLiveRecording();
            return 300;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      const errName = String(err?.name || '');
      const errDetail = String(err?.message || '').toLowerCase();
      if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setErrorMsg('لم يتم العثور على ميكروفون متصل بهذا الجهاز. يمكنك استخدام زر «اختيار ملف صوتي» لرفع التسجيل.');
      } else if (errDetail.includes('policy') || errDetail.includes('permissions')) {
        setErrorMsg(
          'إذن الميكروفون محجوب داخل نافذة المعاينة الحالية. أعد تحميل الصفحة بعد تحديث الصلاحيات، أو افتح التطبيق في متصفح مستقل، أو استخدم زر «اختيار ملف صوتي» لرفع التسجيل.'
        );
      } else {
        setErrorMsg(
          'يرجى السماح بالوصول إلى الميكروفون من إعدادات المتصفح ثم إعادة المحاولة، أو استخدام زر «اختيار ملف صوتي» لرفع التسجيل من جهازك.'
        );
      }
      setIsRecording(false);
    }
  };

  const stopLiveRecording = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const persistGuidesList = async (nextGuides: RitualAudioGuide[], successText: string) => {
    const res = await onUpdateCampaignSettings({
      ...campaignSettings,
      ritualAudioGuides: nextGuides,
    });
    if (res === false) {
      setErrorMsg('تم تجهيز التعديل محلياً لكن تعذر تأكيد الحفظ في السحابة. يرجى التحقق من الاتصال.');
      return false;
    }
    setSuccessMsg(successText);
    setTimeout(() => setSuccessMsg(''), 4000);
    return true;
  };

  const handlePublishAudio = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!title.trim()) {
      setErrorMsg('يرجى كتابة عنوان واضح للتسجيل الصوتي (مثل: صفة الإحرام من الميقات).');
      return;
    }
    if (!stagedBlob) {
      setErrorMsg('يرجى اختيار ملف صوتي أو تسجيل مقطع صوتي مباشر أولاً.');
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadRitualAudioBlob({
        blob: stagedBlob,
        fileName: stagedFileName,
        mimeType: stagedMimeType,
        cloudinaryConfig: campaignSettings.cloudinaryConfig,
      });

      const newItem: RitualAudioGuide = {
        id: `rag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: title.trim().slice(0, 180),
        description: description.trim().slice(0, 350),
        speakerName: speakerName.trim().slice(0, 100) || currentSupervisorName || 'مشرف الإرشاد الديني',
        ritualScope,
        audioUrl: uploaded.url,
        storagePath: uploaded.storagePath,
        mimeType: uploaded.mimeType,
        durationSeconds: uploaded.durationSeconds || recordSeconds || 0,
        fileSizeBytes: uploaded.fileSizeBytes,
        fileHash: uploaded.fileHash,
        isActive: true,
        createdAt: new Date().toISOString(),
        uploadedBy: currentSupervisorName || 'مشرف',
      };

      const nextList = [newItem, ...guides];
      const ok = await persistGuidesList(nextList, 'تم رفع ونشر التسجيل الصوتي في دليل المناسك بنجاح.');
      if (ok) {
        setTitle('');
        setDescription('');
        setRecordSeconds(0);
        clearStagedAudio();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء رفع التسجيل الصوتي.');
    } finally {
      setUploading(false);
    }
  };

  const handleToggleActive = async (id: string) => {
    setErrorMsg('');
    setSavingRowId(id);
    try {
      const nextList = guides.map((g) => (g.id === id ? { ...g, isActive: !g.isActive } : g));
      await persistGuidesList(nextList, 'تم تحديث حالة ظهور التسجيل الصوتي في دليل المناسك.');
    } finally {
      setSavingRowId(null);
    }
  };

  const handleChangeScope = async (id: string, nextScope: RitualAudioScope) => {
    setErrorMsg('');
    setSavingRowId(id);
    try {
      const nextList = guides.map((g) => (g.id === id ? { ...g, ritualScope: nextScope } : g));
      await persistGuidesList(nextList, 'تم تحديث تصنيف المرحلة للتسجيل الصوتي.');
    } finally {
      setSavingRowId(null);
    }
  };

  const handleDeleteGuide = async (guide: RitualAudioGuide) => {
    setErrorMsg('');
    setSavingRowId(guide.id);
    try {
      const nextList = guides.filter((g) => g.id !== guide.id);
      const ok = await persistGuidesList(nextList, 'تم حذف التسجيل الصوتي بنجاح.');
      if (ok) {
        setConfirmDeleteId(null);
        await deleteRitualAudioFile(guide.storagePath);
      }
    } finally {
      setSavingRowId(null);
    }
  };

  const activeCount = guides.filter((g) => g.isActive !== false).length;

  return (
    <div className="bg-[#0B1221] border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-xl space-y-6 text-right text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Headphones className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2 flex-wrap">
              <span>التسجيلات الصوتية القصيرة لشرح مناسك الحج والعمرة</span>
              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold">
                مرتبط بدليل المناسك
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              ارفع ملفاً صوتياً قصيراً أو سجّل إرشاداً مباشراً بصوتك ليظهر للحجاج داخل مشغل الصوت في واجهة (دليل المناسك).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-[#070C18] border border-slate-800 px-4 py-2.5 rounded-2xl shrink-0">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-bold">إجمالي التسجيلات</span>
            <strong className="text-sm font-black text-amber-400">{guides.length}</strong>
          </div>
          <div className="w-px h-6 bg-slate-800" />
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-bold">الظاهر للحجاج</span>
            <strong className="text-sm font-black text-emerald-400">{activeCount}</strong>
          </div>
        </div>
      </div>

      {/* Upload / Record Form */}
      <form onSubmit={handlePublishAudio} className="bg-[#070C18] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-300 mb-1.5">عنوان الشرح الصوتي *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: صفة الإحرام والنية من الميقات - أو أعمال يوم التروية"
              className="w-full bg-[#0B1221] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">المرحلة في دليل المناسك</label>
            <select
              value={ritualScope}
              onChange={(e) => setRitualScope(e.target.value as RitualAudioScope)}
              className="w-full bg-[#0B1221] border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-amber-300 focus:outline-none focus:border-amber-500"
            >
              {(Object.keys(RITUAL_AUDIO_SCOPE_LABELS) as RitualAudioScope[]).map((key) => (
                <option key={key} value={key}>
                  {RITUAL_AUDIO_SCOPE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">اسم المشرف / المتحدث</label>
            <input
              type="text"
              value={speakerName}
              onChange={(e) => setSpeakerName(e.target.value)}
              placeholder="اسم المشرف أو المرشد الديني"
              className="w-full bg-[#0B1221] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-300 mb-1.5">نبذة مختصرة للحاج (اختياري)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="توضيح سريع لمحتوى التسجيل الصوتي..."
              className="w-full bg-[#0B1221] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Audio Source Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.webm"
              onChange={handleSelectFile}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading || isRecording}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-white flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-4 h-4 text-amber-400" />
              <span>اختيار ملف صوتي (MP3 / M4A / WAV)</span>
            </button>

            {!isRecording ? (
              <button
                type="button"
                disabled={uploading}
                onClick={startLiveRecording}
                className="px-4 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-xs font-bold text-emerald-300 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <Mic className="w-4 h-4" />
                <span>تسجيل صوتي مباشر بالميكروفون</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopLiveRecording}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-black text-white flex items-center gap-2 transition cursor-pointer animate-pulse"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>إيقاف التسجيل ({formatAudioDuration(recordSeconds)})</span>
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={uploading || isRecording || !stagedBlob}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileAudio className="w-4 h-4" />}
            <span>{uploading ? 'جاري الرفع والنشر...' : 'رفع ونشر في دليل المناسك'}</span>
          </button>
        </div>

        {/* Staged Preview */}
        {stagedPreviewUrl && stagedBlob && (
          <div className="bg-[#0B1221] border border-emerald-500/30 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <FileAudio className="w-4 h-4" />
                <span>معاينة المقطع الجاهز للرفع ({(stagedBlob.size / 1024).toFixed(0)} كيلوبايت)</span>
              </div>
              <p className="text-[11px] text-slate-400">{stagedFileName}</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <audio controls src={stagedPreviewUrl} className="h-9 w-full sm:w-64" />
              <button
                type="button"
                onClick={clearStagedAudio}
                className="px-2.5 py-2 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 transition shrink-0"
                title="إزالة المقطع المحدد"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-300 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            {typeof window !== 'undefined' && window.self !== window.top && errorMsg.includes('الميكروفون') && (
              <div className="pt-1 flex flex-wrap items-center gap-2">
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-black text-[11px] hover:bg-amber-400 transition"
                >
                  فتح البوابة في نافذة مستقلة لتفعيل الميكروفون
                </a>
              </div>
            )}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </form>

      {/* Published Guides List */}
      <div className="space-y-3">
        <h4 className="text-xs font-black text-amber-400">
          التسجيلات المنشورة في دليل المناسك ({guides.length})
        </h4>

        {guides.length === 0 ? (
          <div className="bg-[#070C18] border border-dashed border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
            لا توجد تسجيلات صوتية مرفوعة حالياً. ارفع أول شرح صوتي قصير من النموذج أعلاه ليظهر مباشرة للحجاج في صفحة دليل المناسك.
          </div>
        ) : (
          <div className="space-y-3">
            {guides.map((guide) => {
              const isBusy = savingRowId === guide.id;
              return (
                <div
                  key={guide.id}
                  className={`bg-[#070C18] border rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                    guide.isActive !== false ? 'border-slate-800' : 'border-slate-800/60 opacity-75'
                  }`}
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-white">{guide.title}</span>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {formatAudioDuration(guide.durationSeconds)}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                          guide.isActive !== false
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {guide.isActive !== false ? 'ظاهر للحجاج' : 'مخفي'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-3">
                      <span>المتحدث: {guide.speakerName}</span>
                      {guide.description && <span>• {guide.description}</span>}
                    </div>
                    <audio controls preload="metadata" src={guide.audioUrl} className="h-9 w-full max-w-md mt-2" />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      value={guide.ritualScope}
                      disabled={isBusy}
                      onChange={(e) => handleChangeScope(guide.id, e.target.value as RitualAudioScope)}
                      className="bg-[#0B1221] border border-slate-700 rounded-xl px-2.5 py-2 text-[11px] font-bold text-slate-200 focus:outline-none focus:border-amber-500"
                    >
                      {(Object.keys(RITUAL_AUDIO_SCOPE_LABELS) as RitualAudioScope[]).map((key) => (
                        <option key={key} value={key}>
                          {RITUAL_AUDIO_SCOPE_LABELS[key]}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleToggleActive(guide.id)}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      title={guide.isActive !== false ? 'إخفاء عن الحجاج' : 'إظهار للحجاج'}
                    >
                      {guide.isActive !== false ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                          <span>إخفاء</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 text-emerald-400" />
                          <span>إظهار</span>
                        </>
                      )}
                    </button>

                    {confirmDeleteId === guide.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDeleteGuide(guide)}
                          className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-black text-white transition cursor-pointer"
                        >
                          تأكيد الحذف
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-2 rounded-xl bg-slate-800 text-xs text-slate-300 cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setConfirmDeleteId(guide.id)}
                        className="p-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                        title="حذف التسجيل"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
