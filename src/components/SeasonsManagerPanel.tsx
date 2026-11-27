import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Plus,
  CheckCircle2,
  Archive,
  FolderArchive,
  Package,
  Users,
  Megaphone,
  Image as ImageIcon,
  Video,
  History,
  ShieldCheck,
  Edit3,
  Hash,
  Sparkles,
  Loader2,
  X,
  Clock,
} from 'lucide-react';
import {
  Announcement,
  CampaignSettings,
  HajjPackage,
  HajjSeason,
  Pilgrim,
  SeasonStatus,
} from '../types';
import {
  activateSeasonAcrossSystem,
  extractHijriYear,
  getSeasonStatusArabic,
  normalizeSeasonId,
  saveSeason,
  updateSeasonStatus,
} from '../lib/seasons';
import {
  MediaAssetMetadata,
  getMediaLibraryAssets,
} from '../lib/mediaManager';
import { isPilgrimInSeason } from '../utils/pilgrimStats';

interface SeasonsManagerPanelProps {
  seasons: HajjSeason[];
  activeSeasonYear: string;
  packages: HajjPackage[];
  announcements: Announcement[];
  pilgrims: Pilgrim[];
  campaignSettings: CampaignSettings;
  actorName: string;
  onUpdateCampaignSettings: (settings: CampaignSettings) => Promise<boolean> | boolean | void;
  onReuseAssetInNewPackage?: (asset: MediaAssetMetadata) => void;
}

export const SeasonsManagerPanel: React.FC<SeasonsManagerPanelProps> = ({
  seasons,
  activeSeasonYear,
  packages,
  announcements,
  pilgrims,
  campaignSettings,
  actorName,
  onUpdateCampaignSettings,
}) => {
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>(() =>
    normalizeSeasonId(activeSeasonYear)
  );
  const [detailSubTab, setDetailSubTab] = useState<'media' | 'records' | 'history'>('media');
  const [allMediaAssets, setAllMediaAssets] = useState<MediaAssetMetadata[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSeason, setEditingSeason] = useState<HajjSeason | null>(null);
  const [savingSeason, setSavingSeason] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState('');

  const [seasonForm, setSeasonForm] = useState({
    hijriYear: '',
    name: '',
    startDate: '',
    endDate: '',
    status: 'active' as SeasonStatus,
    protectArchivedMedia: true,
    retentionDays: 365,
    notes: '',
  });

  const refreshMedia = async () => {
    setLoadingMedia(true);
    try {
      const list = await getMediaLibraryAssets();
      setAllMediaAssets(list);
    } finally {
      setLoadingMedia(false);
    }
  };

  useEffect(() => {
    refreshMedia();
  }, [seasons.length]);

  useEffect(() => {
    if (seasons.length > 0 && !seasons.some((s) => s.id === selectedSeasonId)) {
      const active = seasons.find((s) => s.status === 'active') || seasons[0];
      if (active) setSelectedSeasonId(active.id);
    }
  }, [seasons, selectedSeasonId]);

  const selectedSeason =
    seasons.find((s) => s.id === selectedSeasonId) || seasons[0] || null;

  const openCreateModal = () => {
    const nextYearNum =
      Math.max(
        1448,
        ...seasons.map((s) => Number(s.hijriYear) || 1448)
      ) + 1;
    const nextYear = String(nextYearNum);
    setEditingSeason(null);
    setSeasonForm({
      hijriYear: nextYear,
      name: `حج ${nextYear}هـ`,
      startDate: `${new Date().getFullYear() + 1}-05-01`,
      endDate: `${new Date().getFullYear() + 1}-12-30`,
      status: 'completed',
      protectArchivedMedia: true,
      retentionDays: 365,
      notes: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (season: HajjSeason) => {
    setEditingSeason(season);
    setSeasonForm({
      hijriYear: season.hijriYear,
      name: season.name,
      startDate: season.startDate || '',
      endDate: season.endDate || '',
      status: season.status,
      protectArchivedMedia: season.protectArchivedMedia !== false,
      retentionDays: season.retentionDays || 365,
      notes: season.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSaveSeasonForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const year = extractHijriYear(seasonForm.hijriYear);
    if (!year) return;
    setSavingSeason(true);
    try {
      const id = editingSeason?.id || normalizeSeasonId(year);
      const base: HajjSeason = editingSeason || {
        id,
        hijriYear: year,
        name: seasonForm.name.trim() || `حج ${year}هـ`,
        startDate: seasonForm.startDate,
        endDate: seasonForm.endDate,
        status: seasonForm.status,
        protectArchivedMedia: seasonForm.protectArchivedMedia,
        retentionDays: seasonForm.retentionDays,
        notes: seasonForm.notes.trim(),
        linkedPackageIds: [],
        linkedAnnouncementIds: [],
        linkedPilgrimIds: [],
        linkedMediaAssetIds: [],
        history: [],
        createdAt: new Date().toISOString(),
      };

      const ok = await saveSeason(
        {
          ...base,
          hijriYear: year,
          name: seasonForm.name.trim() || `حج ${year}هـ`,
          startDate: seasonForm.startDate,
          endDate: seasonForm.endDate,
          status: seasonForm.status,
          protectArchivedMedia: seasonForm.protectArchivedMedia,
          retentionDays: Number(seasonForm.retentionDays) || 365,
          notes: seasonForm.notes.trim(),
        },
        editingSeason ? 'تعديل بيانات الموسم' : 'إنشاء موسم جديد',
        `${seasonForm.name.trim() || `حج ${year}هـ`} (${seasonForm.startDate} ← ${seasonForm.endDate})`,
        actorName
      );

      if (ok) {
        setSelectedSeasonId(id);
        setIsModalOpen(false);
        setStatusFeedback('تم حفظ بيانات الموسم وتوثيق سجل التعديلات بنجاح.');
        setTimeout(() => setStatusFeedback(''), 3500);
      }
    } finally {
      setSavingSeason(false);
    }
  };

  const getSeasonStats = (season: HajjSeason) => {
    const sYear = extractHijriYear(season.hijriYear || season.id);
    const sId = normalizeSeasonId(season.id || sYear);

    const linkedPkgs = packages.filter(
      (p) =>
        (season.linkedPackageIds || []).includes(p.id) ||
        normalizeSeasonId(p.seasonId || p.seasonYear || activeSeasonYear) === sId
    );
    const linkedAnns = announcements.filter(
      (a) =>
        (season.linkedAnnouncementIds || []).includes(a.id) ||
        normalizeSeasonId(a.seasonId || a.seasonYear || activeSeasonYear) === sId
    );
    const linkedPilgs = pilgrims.filter(
      (p) => (season.linkedPilgrimIds || []).includes(p.id) || isPilgrimInSeason(p, sYear)
    );
    const linkedMedia = allMediaAssets.filter(
      (m) =>
        (season.linkedMediaAssetIds || []).includes(m.id) ||
        (m.linkedSeasonIds || []).some((sid) => normalizeSeasonId(sid) === sId)
    );

    return { linkedPkgs, linkedAnns, linkedPilgs, linkedMedia };
  };

  const statusBadgeClass = (status: SeasonStatus) => {
    if (status === 'active') {
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';
    }
    if (status === 'completed') {
      return 'bg-sky-500/15 text-sky-300 border-sky-500/35';
    }
    return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
  };

  const policyBadge = (policy?: string) => {
    if (policy === 'reused_existing') {
      return {
        label: 'ملف مطابق معاد استخدامه',
        cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      };
    }
    if (policy === 'new_seasonal_copy') {
      return {
        label: 'نسخة مستقلة لموسم جديد',
        cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      };
    }
    if (policy === 'modified_version') {
      return {
        label: 'نسخة معدّلة مستقلة',
        cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
      };
    }
    return {
      label: 'ملف جديد أصلي',
      cls: 'bg-slate-800 text-slate-300 border-slate-700',
    };
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto text-right animate-fadeIn">
      {/* Header Card */}
      <div className="bg-[#0B1221] border border-amber-500/30 rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-400 flex items-center justify-center shrink-0">
              <FolderArchive className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black text-white">
                منظومة إدارة المواسم وأرشيف الوسائط
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                إدارة المواسم المتعاقبة (نشط / مكتمل / مؤرشف) وعزل ارتباطات كل موسم مع دعم إعادة استخدام الصور والفيديوهات عبر المواسم دون تكرار أو فقدان للأرشيف.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow cursor-pointer shrink-0 transition"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة موسم جديد</span>
          </button>
        </div>

        {statusFeedback && (
          <div className="bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-xs font-bold p-3 rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusFeedback}</span>
          </div>
        )}

        {/* File Policy Overview Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-[#070C18] border border-slate-800 rounded-xl p-3 space-y-1">
            <span className="font-black text-white block">1. ملف جديد</span>
            <p className="text-[11px] text-slate-400">بصمة SHA-256 فريدة: يتم ضغطه WebP وتوثيقه بمعرف مستقل.</p>
          </div>
          <div className="bg-[#070C18] border border-emerald-500/25 rounded-xl p-3 space-y-1">
            <span className="font-black text-emerald-300 block">2. ملف مطابق موجود</span>
            <p className="text-[11px] text-slate-400">يُعرض للمستخدم لإعادة استخدامه عبر المواسم دون نسخة مادية مكررة.</p>
          </div>
          <div className="bg-[#070C18] border border-amber-500/25 rounded-xl p-3 space-y-1">
            <span className="font-black text-amber-300 block">3. ملف جديد لموسم جديد</span>
            <p className="text-[11px] text-slate-400">يسمح برفع نسخة مستقلة خاصة بالموسم الجديد حتى لو طابقت موسماً سابقاً.</p>
          </div>
          <div className="bg-[#070C18] border border-sky-500/25 rounded-xl p-3 space-y-1">
            <span className="font-black text-sky-300 block">4. ملف معدّل + سياسة الاحتفاظ</span>
            <p className="text-[11px] text-slate-400">يحفظ النسخة المعدلة مستقلة دون حذف النسخة السابقة أو كسر أرشيف المواسم.</p>
          </div>
        </div>
      </div>

      {/* Seasons Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {seasons.map((season) => {
          const stats = getSeasonStats(season);
          const isSelected = selectedSeason?.id === season.id;
          return (
            <div
              key={season.id}
              onClick={() => setSelectedSeasonId(season.id)}
              className={`rounded-3xl p-5 border-2 transition cursor-pointer space-y-4 ${
                isSelected
                  ? 'bg-[#0F172A] border-amber-500/70 shadow-xl'
                  : 'bg-[#0B1221] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-black text-white">{season.name}</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${statusBadgeClass(
                        season.status
                      )}`}
                    >
                      {getSeasonStatusArabic(season.status)}
                    </span>
                    {season.protectArchivedMedia !== false && (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        أرشيف محمي
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono flex items-center gap-3 flex-wrap">
                    <span>ID: {season.id}</span>
                    {season.startDate && season.endDate && (
                      <span>
                        {season.startDate} → {season.endDate}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => openEditModal(season)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                    title="تعديل بيانات الموسم"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Counts Breakdown */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-[#070C18] border border-slate-800/80 rounded-xl p-2">
                  <Package className="w-3.5 h-3.5 text-amber-400 mx-auto mb-0.5" />
                  <strong className="text-sm font-black text-white font-mono block">
                    {stats.linkedPkgs.length}
                  </strong>
                  <span className="text-[10px] text-slate-400">باقات</span>
                </div>
                <div className="bg-[#070C18] border border-slate-800/80 rounded-xl p-2">
                  <Users className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-0.5" />
                  <strong className="text-sm font-black text-white font-mono block">
                    {stats.linkedPilgs.length}
                  </strong>
                  <span className="text-[10px] text-slate-400">حجاج</span>
                </div>
                <div className="bg-[#070C18] border border-slate-800/80 rounded-xl p-2">
                  <Megaphone className="w-3.5 h-3.5 text-sky-400 mx-auto mb-0.5" />
                  <strong className="text-sm font-black text-white font-mono block">
                    {stats.linkedAnns.length}
                  </strong>
                  <span className="text-[10px] text-slate-400">تعاميم</span>
                </div>
                <div className="bg-[#070C18] border border-slate-800/80 rounded-xl p-2">
                  <ImageIcon className="w-3.5 h-3.5 text-purple-400 mx-auto mb-0.5" />
                  <strong className="text-sm font-black text-white font-mono block">
                    {stats.linkedMedia.length}
                  </strong>
                  <span className="text-[10px] text-slate-400">وسائط</span>
                </div>
              </div>

              {/* Action Controls */}
              <div
                className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80"
                onClick={(e) => e.stopPropagation()}
              >
                {season.status !== 'active' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await activateSeasonAcrossSystem({
                        targetSeason: season,
                        allSeasons: seasons,
                        campaignSettings,
                        onUpdateCampaignSettings,
                        actorName,
                      });
                      if (ok) {
                        setStatusFeedback(`تم تفعيل (${season.name}) كموسم نشط في النظام.`);
                        setTimeout(() => setStatusFeedback(''), 3500);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>تفعيل كموسم نشط</span>
                  </button>
                )}

                {season.status !== 'completed' && (
                  <button
                    type="button"
                    onClick={() => updateSeasonStatus(season, 'completed', actorName)}
                    className="px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-bold cursor-pointer"
                  >
                    تحديد كمكتمل
                  </button>
                )}

                {season.status !== 'archived' && (
                  <button
                    type="button"
                    onClick={() => updateSeasonStatus(season, 'archived', actorName)}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>أرشفة وحماية</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Season Details & Media Archive Browser */}
      {selectedSeason && (() => {
        const stats = getSeasonStats(selectedSeason);
        return (
          <div className="bg-[#0B1221] border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h4 className="text-base font-black text-amber-300 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>تفاصيل وأرشيف: {selectedSeason.name}</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedSeason.notes || 'استعراض كافة الملفات والارتباطات وتاريخ التعديلات الخاصة بهذا الموسم'}
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-[#070C18] p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setDetailSubTab('media')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    detailSubTab === 'media'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  أرشيف الصور والملفات ({stats.linkedMedia.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDetailSubTab('records')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    detailSubTab === 'records'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  الارتباطات ({stats.linkedPkgs.length + stats.linkedAnns.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDetailSubTab('history')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    detailSubTab === 'history'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  تاريخ التعديلات ({(selectedSeason.history || []).length})
                </button>
              </div>
            </div>

            {detailSubTab === 'media' && (
              <div>
                {loadingMedia ? (
                  <div className="py-10 text-center text-xs text-slate-400">
                    جاري تحميل ملفات الوسائط...
                  </div>
                ) : stats.linkedMedia.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400 bg-[#070C18] rounded-2xl border border-slate-800">
                    لا توجد صور أو فيديوهات مرتبطة مباشرة بهذا الموسم في المكتبة بعد.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {stats.linkedMedia.map((asset) => {
                      const pb = policyBadge(asset.uploadPolicy);
                      return (
                        <div
                          key={asset.id}
                          className="bg-[#070C18] border border-slate-800 rounded-2xl overflow-hidden flex flex-col"
                        >
                          <div className="relative h-36 bg-slate-900">
                            {asset.thumbnailUrl || asset.url ? (
                              <img
                                src={asset.thumbnailUrl || asset.url}
                                alt={asset.fileName}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-600">
                                {asset.kind === 'video' ? <Video className="w-8 h-8" /> : <ImageIcon className="w-8 h-8" />}
                              </div>
                            )}
                            <span
                              className={`absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold border ${pb.cls}`}
                            >
                              {pb.label}
                            </span>
                            <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-950/85 text-slate-300 text-[10px] font-mono">
                              v{asset.version || 1}
                            </span>
                          </div>
                          <div className="p-3 space-y-1.5 text-xs">
                            <div className="font-bold text-white truncate">{asset.fileName}</div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span className="font-mono flex items-center gap-1" dir="ltr">
                                <Hash className="w-3 h-3" />
                                {asset.fileHash.slice(0, 10)}
                              </span>
                              <span>
                                {Math.max(1, Math.round((asset.compressedSizeBytes || 0) / 1024))} KB
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              مستخدم في:{' '}
                              <strong className="text-amber-300">
                                {(asset.linkedSeasonIds || [])
                                  .map((s) => `حج ${extractHijriYear(s)}هـ`)
                                  .join('، ') || selectedSeason.name}
                              </strong>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              السجلات المرتبطة: {(asset.linkedRecordIds || []).length}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {detailSubTab === 'records' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-[#070C18] border border-slate-800 rounded-2xl p-4 space-y-2.5">
                  <h5 className="font-black text-amber-300 flex items-center gap-1.5">
                    <Package className="w-4 h-4" />
                    <span>الباقات المرتبطة ({stats.linkedPkgs.length})</span>
                  </h5>
                  {stats.linkedPkgs.length === 0 ? (
                    <p className="text-slate-500">لا توجد باقات مرتبطة بهذا الموسم.</p>
                  ) : (
                    <div className="space-y-2">
                      {stats.linkedPkgs.map((pkg) => (
                        <div
                          key={pkg.id}
                          className="flex items-center justify-between bg-[#0B1221] border border-slate-800 rounded-xl p-2.5"
                        >
                          <span className="font-bold text-white">{pkg.title}</span>
                          <span className="text-amber-400 font-mono font-bold">{pkg.price}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-[#070C18] border border-slate-800 rounded-2xl p-4 space-y-2.5">
                  <h5 className="font-black text-sky-300 flex items-center gap-1.5">
                    <Megaphone className="w-4 h-4" />
                    <span>التعاميم والدروس ({stats.linkedAnns.length})</span>
                  </h5>
                  {stats.linkedAnns.length === 0 ? (
                    <p className="text-slate-500">لا توجد تعاميم مرتبطة بهذا الموسم.</p>
                  ) : (
                    <div className="space-y-2">
                      {stats.linkedAnns.map((ann) => (
                        <div
                          key={ann.id}
                          className="flex items-center justify-between bg-[#0B1221] border border-slate-800 rounded-xl p-2.5"
                        >
                          <span className="font-bold text-white truncate">{ann.title}</span>
                          <span className="text-slate-400 font-mono text-[11px] shrink-0">{ann.date}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {detailSubTab === 'history' && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {(selectedSeason.history || []).length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 bg-[#070C18] rounded-2xl border border-slate-800">
                    لا توجد تعديلات مسجلة لهذا الموسم بعد.
                  </div>
                ) : (
                  (selectedSeason.history || []).map((entry) => (
                    <div
                      key={entry.id}
                      className="bg-[#070C18] border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-start gap-2.5">
                        <History className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-white">{entry.action}</div>
                          {entry.details && (
                            <div className="text-[11px] text-slate-400 mt-0.5">{entry.details}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 shrink-0">
                        <span>{entry.actorName || 'النظام'}</span>
                        <span className="font-mono flex items-center gap-1" dir="ltr">
                          <Clock className="w-3 h-3" />
                          {new Date(entry.timestamp).toLocaleDateString('ar-SA')}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Create / Edit Season Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <form
            onSubmit={handleSaveSeasonForm}
            className="bg-[#0B1221] border border-amber-500/35 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-auto text-right"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base sm:text-lg font-black text-white">
                {editingSeason ? `تعديل موسم: ${editingSeason.name}` : 'إضافة موسم حج/عمرة جديد'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">السنة الهجرية *</label>
                <input
                  type="text"
                  required
                  value={seasonForm.hijriYear}
                  onChange={(e) => {
                    const y = e.target.value.replace(/[^\d]/g, '').slice(0, 4);
                    setSeasonForm((prev) => ({
                      ...prev,
                      hijriYear: y,
                      name: prev.name.startsWith('حج ') || !prev.name ? `حج ${y}هـ` : prev.name,
                    }));
                  }}
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono"
                  placeholder="1449"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">اسم الموسم *</label>
                <input
                  type="text"
                  required
                  value={seasonForm.name}
                  onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })}
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2.5 text-white"
                  placeholder="حج 1449هـ"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">تاريخ بداية الموسم</label>
                <input
                  type="date"
                  value={seasonForm.startDate}
                  onChange={(e) => setSeasonForm({ ...seasonForm, startDate: e.target.value })}
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">تاريخ نهاية الموسم</label>
                <input
                  type="date"
                  value={seasonForm.endDate}
                  onChange={(e) => setSeasonForm({ ...seasonForm, endDate: e.target.value })}
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">حالة الموسم</label>
                <select
                  value={seasonForm.status}
                  onChange={(e) =>
                    setSeasonForm({ ...seasonForm, status: e.target.value as SeasonStatus })
                  }
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2.5 text-white"
                >
                  <option value="active">نشط</option>
                  <option value="completed">مكتمل</option>
                  <option value="archived">مؤرشف</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">مدة الاحتفاظ بالملفات (أيام)</label>
                <input
                  type="number"
                  min={30}
                  value={seasonForm.retentionDays}
                  onChange={(e) =>
                    setSeasonForm({
                      ...seasonForm,
                      retentionDays: Math.max(30, parseInt(e.target.value, 10) || 365),
                    })
                  }
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono"
                  dir="ltr"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 bg-[#070C18] border border-slate-800 rounded-xl p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={seasonForm.protectArchivedMedia}
                onChange={(e) =>
                  setSeasonForm({ ...seasonForm, protectArchivedMedia: e.target.checked })
                }
                className="w-4 h-4 accent-amber-500"
              />
              <div>
                <span className="text-xs font-bold text-emerald-300 block">
                  تفعيل سياسة حماية ملفات وأرشيف هذا الموسم
                </span>
                <span className="text-[11px] text-slate-400">
                  يمنع حذف الصور والفيديوهات المرتبطة بهذا الموسم تلقائياً حتى مع تغيير المواسم أو تعديل الباقات.
                </span>
              </div>
            </label>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات الموسم</label>
              <textarea
                rows={2}
                value={seasonForm.notes}
                onChange={(e) => setSeasonForm({ ...seasonForm, notes: e.target.value })}
                className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                placeholder="ملاحظات إدارية أو توصيف للموسم..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={savingSeason}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {savingSeason ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>حفظ الموسم</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
