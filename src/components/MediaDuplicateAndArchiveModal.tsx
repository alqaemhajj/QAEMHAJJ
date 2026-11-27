import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  UploadCloud,
  Sparkles,
  CheckCircle2,
  FolderArchive,
  Image as ImageIcon,
  Video,
  Calendar,
  Hash,
  Layers,
  ShieldCheck,
  RefreshCw,
  Search,
} from 'lucide-react';
import { HajjSeason } from '../types';
import {
  MediaAssetMetadata,
  getMediaLibraryAssets,
} from '../lib/mediaManager';
import { extractHijriYear, normalizeSeasonId } from '../lib/seasons';

export type DuplicateDecisionChoice =
  | 'reuse_existing'
  | 'upload_new_seasonal_copy'
  | 'upload_modified_version';

interface MediaDuplicateDecisionModalProps {
  isOpen: boolean;
  fileName: string;
  fileSizeBytes: number;
  kind: 'image' | 'video';
  targetSeasonName: string;
  existingMatch: MediaAssetMetadata | null;
  isReplacingExisting?: boolean;
  onSelect: (choice: DuplicateDecisionChoice, match: MediaAssetMetadata) => void;
  onCancel: () => void;
}

export const MediaDuplicateDecisionModal: React.FC<MediaDuplicateDecisionModalProps> = ({
  isOpen,
  fileName,
  fileSizeBytes,
  kind,
  targetSeasonName,
  existingMatch,
  isReplacingExisting,
  onSelect,
  onCancel,
}) => {
  if (!isOpen || !existingMatch) return null;

  const formatKb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const linkedSeasonsLabels = (existingMatch.linkedSeasonIds || []).map((sid) => {
    const year = extractHijriYear(sid);
    return `موسم ${year}هـ`;
  });

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-[#0B1221] border-2 border-amber-500/40 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 my-auto text-right">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-400 flex items-center justify-center shrink-0">
              <Copy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">
                تم العثور على ملف مطابق بالبصمة الرقمية
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                الملف المرفق (<span className="text-slate-200 font-bold">{fileName}</span>) يطابق ملفاً محفوظاً مسبقاً في مكتبة القافلة.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview of existing asset */}
        <div className="bg-[#070C18] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-center">
          <div className="w-28 h-24 rounded-xl overflow-hidden bg-slate-900 border border-slate-700 shrink-0 flex items-center justify-center">
            {existingMatch.thumbnailUrl || existingMatch.url ? (
              <img
                src={existingMatch.thumbnailUrl || existingMatch.url}
                alt={existingMatch.fileName}
                className="w-full h-full object-cover"
              />
            ) : kind === 'video' ? (
              <Video className="w-8 h-8 text-sky-400" />
            ) : (
              <ImageIcon className="w-8 h-8 text-amber-400" />
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1.5 text-xs w-full">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold text-[11px]">
                تطابق 100% (SHA-256)
              </span>
              <span className="text-slate-400 font-mono text-[11px]" dir="ltr">
                #{existingMatch.fileHash.slice(0, 12)}
              </span>
            </div>
            <div className="text-slate-300 font-bold truncate">
              الاسم المؤرشف: {existingMatch.fileName}
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
              <span>حجم الملف الأصلي: <strong className="text-slate-200">{formatKb(fileSizeBytes)}</strong></span>
              <span>المساحة المحفوظة: <strong className="text-emerald-400">{formatKb(existingMatch.compressedSizeBytes)}</strong></span>
              <span>الإصدار: <strong className="text-amber-300">v{existingMatch.version || 1}</strong></span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-slate-400">المواسم المرتبطة:</span>
              {linkedSeasonsLabels.length > 0 ? (
                linkedSeasonsLabels.map((lbl, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/25 text-[10px] font-bold"
                  >
                    {lbl}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-slate-500">المكتبة العامة للقافلة</span>
              )}
            </div>
          </div>
        </div>

        {/* Interactive Policy Choices */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => onSelect('reuse_existing', existingMatch)}
            className="w-full text-right p-4 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border-2 border-emerald-500/40 transition flex items-start gap-3 cursor-pointer"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-black text-emerald-300 flex items-center justify-between gap-2">
                <span>إعادة استخدام الملف السابق الموجود</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200">
                  توفير 100% من المساحة
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                يربط هذا العنصر في <strong className="text-white">{targetSeasonName}</strong> بنفس الملف المحفوظ مسبقاً دون رفع نسخة مادية مكررة. مثالي للصور المعتمدة والمتكررة بين المواسم.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelect('upload_new_seasonal_copy', existingMatch)}
            className="w-full text-right p-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/35 transition flex items-start gap-3 cursor-pointer"
          >
            <UploadCloud className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-black text-amber-300 flex items-center justify-between gap-2">
                <span>رفع كنسخة مستقلة جديدة للموسم الحالي</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-200">
                  عزل كامل للموسم
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                يسمح بإنشاء نسخة مستقلة خاصة بـ <strong className="text-white">{targetSeasonName}</strong> بمعرّف مستقل دون أي تأثير على ارتباطات المواسم السابقة.
              </p>
            </div>
          </button>

          {isReplacingExisting && (
            <button
              type="button"
              onClick={() => onSelect('upload_modified_version', existingMatch)}
              className="w-full text-right p-3.5 rounded-2xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/35 transition flex items-start gap-3 cursor-pointer"
            >
              <RefreshCw className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-xs sm:text-sm font-black text-sky-300">
                  حفظ كنسخة معدّلة/محدثة مع إبقاء النسخة السابقة في الأرشيف
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  سيتم الاحتفاظ بالملف القديم للمواسم السابقة وتحديث ارتباط السجل الحالي فقط.
                </p>
              </div>
            </button>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
          >
            إلغاء العملية
          </button>
        </div>
      </div>
    </div>
  );
};

interface SeasonMediaArchiveModalProps {
  isOpen: boolean;
  kind?: 'image' | 'video';
  seasons: HajjSeason[];
  activeSeasonId: string;
  onSelectAsset: (asset: MediaAssetMetadata) => void;
  onClose: () => void;
}

export const SeasonMediaArchiveModal: React.FC<SeasonMediaArchiveModalProps> = ({
  isOpen,
  kind,
  seasons,
  activeSeasonId,
  onSelectAsset,
  onClose,
}) => {
  const [assets, setAssets] = useState<MediaAssetMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSeasonFilter, setSelectedSeasonFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    getMediaLibraryAssets({
      kind,
      seasonId: selectedSeasonFilter === 'all' ? undefined : selectedSeasonFilter,
    })
      .then((list) => setAssets(list))
      .finally(() => setLoading(false));
  }, [isOpen, kind, selectedSeasonFilter]);

  if (!isOpen) return null;

  const filtered = assets.filter((a) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.trim().toLowerCase();
    return (
      (a.fileName || '').toLowerCase().includes(q) ||
      (a.fileHash || '').toLowerCase().includes(q) ||
      (a.linkedRecordIds || []).some((r) => r.toLowerCase().includes(q))
    );
  });

  const policyLabel = (policy?: string) => {
    if (policy === 'reused_existing') return 'معاد استخدامه';
    if (policy === 'new_seasonal_copy') return 'نسخة موسم مستقل';
    if (policy === 'modified_version') return 'نسخة معدّلة';
    return 'ملف أصلي';
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#0B1221] border border-amber-500/35 rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto text-right max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-400 flex items-center justify-center shrink-0">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">
                أرشيف الوسائط المشتركة عبر المواسم
              </h3>
              <p className="text-xs text-slate-400">
                اختر أي صورة أو فيديو من مواسم سابقة لإعادة استخدامه في الموسم النشط دون استهلاك مساحة إضافية.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-col sm:flex-row gap-2.5 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث باسم الملف أو البصمة أو الباقة المرتبطة..."
              className="w-full bg-[#070C18] border border-slate-800 focus:border-amber-500 rounded-xl pr-9 pl-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>

          <select
            value={selectedSeasonFilter}
            onChange={(e) => setSelectedSeasonFilter(e.target.value)}
            className="bg-[#070C18] border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-amber-300 font-bold focus:outline-none"
          >
            <option value="all">جميع المواسم والأرشيف</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status === 'active' ? 'نشط' : s.status === 'completed' ? 'مكتمل' : 'مؤرشف'})
              </option>
            ))}
          </select>
        </div>

        {/* Assets Grid */}
        <div className="flex-1 overflow-y-auto min-h-[240px]">
          {loading ? (
            <div className="py-16 text-center text-xs text-slate-400">
              جاري تحميل أرشيف الوسائط والمواسم...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center space-y-2 bg-[#070C18] rounded-2xl border border-slate-800/80">
              <FolderArchive className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-300">لا توجد ملفات في هذا الفلتر حالياً</p>
              <p className="text-xs text-slate-500">
                كل صورة أو فيديو يتم رفعه في أي موسم يُحفظ تلقائياً هنا ليكون متاحاً لإعادة الاستخدام بأمان.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((asset) => {
                const alreadyInActiveSeason = (asset.linkedSeasonIds || []).includes(
                  normalizeSeasonId(activeSeasonId)
                );
                return (
                  <div
                    key={asset.id}
                    className="bg-[#070C18] border border-slate-800 hover:border-amber-500/45 rounded-2xl overflow-hidden flex flex-col transition group"
                  >
                    <div className="relative h-36 bg-slate-900 overflow-hidden">
                      {asset.thumbnailUrl || asset.url ? (
                        <img
                          src={asset.thumbnailUrl || asset.url}
                          alt={asset.fileName}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          {asset.kind === 'video' ? <Video className="w-8 h-8" /> : <ImageIcon className="w-8 h-8" />}
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-slate-950/80 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                          {policyLabel(asset.uploadPolicy)}
                        </span>
                        {asset.savingsPercent > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-950/85 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                            -{asset.savingsPercent}%
                          </span>
                        )}
                      </div>
                      <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-950/80 text-slate-300 text-[10px] font-mono">
                        v{asset.version || 1}
                      </span>
                    </div>

                    <div className="p-3 flex-1 flex flex-col justify-between gap-2.5 text-xs">
                      <div className="space-y-1">
                        <div className="font-bold text-white truncate" title={asset.fileName}>
                          {asset.fileName}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span className="flex items-center gap-1 font-mono" dir="ltr">
                            <Hash className="w-3 h-3 text-slate-500" />
                            {asset.fileHash.slice(0, 10)}
                          </span>
                          <span>
                            {Math.max(1, Math.round((asset.compressedSizeBytes || 0) / 1024))} KB
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 pt-1">
                          {(asset.linkedSeasonIds || []).map((sid) => (
                            <span
                              key={sid}
                              className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-amber-300 font-bold flex items-center gap-1"
                            >
                              <Calendar className="w-2.5 h-2.5" />
                              حج {extractHijriYear(sid)}هـ
                            </span>
                          ))}
                          {asset.retentionPolicy?.preserveInArchive && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-[10px] text-emerald-400 flex items-center gap-1">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              محمي بالأرشيف
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectAsset(asset)}
                        className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          {alreadyInActiveSeason
                            ? 'إعادة الاستخدام في هذا العنصر'
                            : 'استيراد للموسم الحالي (دون تكرار)'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
