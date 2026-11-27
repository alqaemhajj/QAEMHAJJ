import React, { useState, useMemo } from 'react';
import { HajjPackage, Pilgrim } from '../types';
import {
  CheckCircle2,
  MapPin,
  Bus,
  Sparkles,
  ArrowLeft,
  Share2,
  Check,
  X,
  Lock,
} from 'lucide-react';
import { sharePackageItem } from '../utils/shareItem';
import { PackagesCarousel } from './PackagesCarousel';
import { evaluatePackageStatus } from '../utils/packageStatus';

interface PackagesViewProps {
  setCurrentView: (view: string) => void;
  packages: HajjPackage[];
  pilgrims?: Pilgrim[];
  onSelectPackageForRegistration: (pkgTitle: string) => void;
  externalHighlightedPkgId?: string | null;
}

export const PackagesView: React.FC<PackagesViewProps> = ({
  setCurrentView,
  packages,
  pilgrims = [],
  onSelectPackageForRegistration,
  externalHighlightedPkgId,
}) => {
  const [spotlightPkg, setSpotlightPkg] = useState<HajjPackage | null>(null);
  const [copiedPkgId, setCopiedPkgId] = useState<string | null>(null);

  const visiblePackages = useMemo(
    () => packages.filter((pkg) => pkg.showOnHomepage !== false),
    [packages]
  );

  const handleSharePkg = async (pkg: HajjPackage, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const res = await sharePackageItem(pkg);
    if (res === 'copied' || res === 'shared') {
      setCopiedPkgId(pkg.id);
      setTimeout(() => setCopiedPkgId((prev) => (prev === pkg.id ? null : prev)), 2500);
    }
  };

  const spotlightStatus = spotlightPkg
    ? evaluatePackageStatus(spotlightPkg, pilgrims)
    : null;

  return (
    <div className="max-w-7xl mx-auto py-10 sm:py-12 px-4 sm:px-6 lg:px-8 space-y-8 text-right">
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 bg-amber-500/12 dark:bg-amber-500/15 border border-amber-500/30 px-4 py-1.5 rounded-full text-amber-800 dark:text-amber-400 text-xs font-bold">
          <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span>موسم الحج 1448هـ - باقات مميزة وخدمات راقية</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
          باقات قافلة القائم للحج والعمرة
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          تصفح الباقات بالسحب يميناً أو يساراً، واختر الباقة التي تناسبك أو شارك رابطها المباشر بضغطة زر
        </p>
      </div>

      {/* Interactive Horizontal Carousel / Slider */}
      <PackagesCarousel
        packages={visiblePackages}
        pilgrims={pilgrims}
        setCurrentView={setCurrentView}
        onSelectPackageForRegistration={onSelectPackageForRegistration}
        highlightedPkgId={externalHighlightedPkgId}
        onOpenDetailsModal={(pkg) => setSpotlightPkg(pkg)}
        cardIdPrefix="packages-view-card"
      />

      {/* Package Details Spotlight Modal */}
      {spotlightPkg && spotlightStatus && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSpotlightPkg(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-white dark:bg-[#0B1221] border-2 border-amber-500/45 dark:border-amber-500/50 rounded-3xl overflow-hidden shadow-2xl my-8 text-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400">
                <span>تفاصيل الباقة</span>
                <span aria-hidden="true">·</span>
                <span>{spotlightPkg.type}</span>
                {spotlightStatus.isClosedOnHomepage && spotlightStatus.publicBadgeText && (
                  <span className="px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/40 text-[11px] font-black">
                    {spotlightStatus.publicBadgeText}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSpotlightPkg(null)}
                className="p-2 rounded-xl bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[78vh] overflow-y-auto">
              <div className="relative h-60 w-full bg-slate-900 overflow-hidden">
                <img
                  src={spotlightPkg.image}
                  alt={spotlightPkg.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover ${
                    spotlightStatus.isClosedOnHomepage ? 'grayscale-[40%] brightness-75' : ''
                  }`}
                />
                <div className="absolute bottom-4 right-4 bg-slate-950/90 backdrop-blur-md text-amber-400 px-4 py-2 rounded-2xl text-base font-black border border-amber-500/40 shadow-lg tabular-nums">
                  {spotlightPkg.price}
                </div>
                {spotlightStatus.isClosedOnHomepage && spotlightStatus.publicBadgeText && (
                  <div className="absolute top-4 right-4 bg-red-600/95 text-white px-4 py-2 rounded-2xl text-xs font-black border border-red-400 shadow-lg flex items-center gap-1.5">
                    <Lock className="w-4 h-4" />
                    <span>{spotlightStatus.publicBadgeText}</span>
                  </div>
                )}
              </div>

              <div className="p-6 space-y-5">
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">{spotlightPkg.title}</h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 dark:bg-slate-950/70 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <Bus className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{spotlightPkg.transport}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>مكة: {spotlightPkg.accommodationMakkah}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>المدينة: {spotlightPkg.accommodationMadinah}</span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <h4 className="text-sm font-bold text-amber-700 dark:text-amber-400">مميزات وخدمات الباقة:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {spotlightPkg.features.map((feat, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800/80"
                      >
                        <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={spotlightStatus.isClosedForVisitors}
                  onClick={() => {
                    if (spotlightStatus.isClosedForVisitors) return;
                    onSelectPackageForRegistration(spotlightPkg.title);
                    setSpotlightPkg(null);
                    setCurrentView('register');
                  }}
                  className={`px-6 py-3 rounded-xl font-black text-xs transition flex items-center gap-2 shadow-lg ${
                    spotlightStatus.isClosedForVisitors
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700 cursor-not-allowed opacity-75'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                  }`}
                >
                  {spotlightStatus.isClosedForVisitors ? (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>سجل الآن — ({spotlightStatus.publicBadgeText || 'مغلق'})</span>
                    </>
                  ) : (
                    <>
                      <span>احجز وسجل في هذه الباقة الآن</span>
                      <ArrowLeft className="w-4 h-4" />
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSharePkg(spotlightPkg, e)}
                  className={`px-4 py-3 rounded-xl font-bold text-xs border transition flex items-center gap-1.5 cursor-pointer ${
                    copiedPkgId === spotlightPkg.id
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/35'
                      : 'bg-white dark:bg-slate-900 hover:bg-amber-50 dark:hover:bg-slate-800 text-amber-700 dark:text-amber-400 border-amber-500/35'
                  }`}
                >
                  {copiedPkgId === spotlightPkg.id ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>تم نسخ الرابط</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4" />
                      <span>مشاركة الباقة</span>
                    </>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setSpotlightPkg(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer"
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
