import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { HajjPackage, Pilgrim } from '../types';
import {
  CheckCircle2,
  MapPin,
  Bus,
  Plane,
  ArrowLeft,
  Share2,
  Check,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  Package as PackageIcon,
  Lock,
  Users,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { sharePackageItem } from '../utils/shareItem';
import {
  evaluatePackageStatus,
  formatRegistrationDeadlineAr,
} from '../utils/packageStatus';

interface PackagesCarouselProps {
  packages: HajjPackage[];
  pilgrims?: Pilgrim[];
  setCurrentView: (view: string) => void;
  onSelectPackageForRegistration?: (pkgTitle: string) => void;
  highlightedPkgId?: string | null;
  onOpenDetailsModal?: (pkg: HajjPackage) => void;
  cardIdPrefix?: string;
}

export const PackagesCarousel: React.FC<PackagesCarouselProps> = ({
  packages,
  pilgrims = [],
  setCurrentView,
  onSelectPackageForRegistration,
  highlightedPkgId,
  onOpenDetailsModal,
  cardIdPrefix = 'packages-view-card',
}) => {
  // Filter out packages hidden from the homepage
  const visiblePackages = useMemo(
    () => packages.filter((pkg) => pkg.showOnHomepage !== false),
    [packages]
  );

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [copiedPkgId, setCopiedPkgId] = useState<string | null>(null);
  const [loadedIndices, setLoadedIndices] = useState<Record<number, boolean>>({ 0: true, 1: true });
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Touch & Mouse Drag state
  const [dragOffsetPx, setDragOffsetPx] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartXRef = useRef<number | null>(null);
  const dragStartYRef = useRef<number | null>(null);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const totalPackages = visiblePackages.length;

  // Keep activeIndex within bounds if visiblePackages array changes
  useEffect(() => {
    if (totalPackages > 0 && activeIndex >= totalPackages) {
      setActiveIndex(0);
    }
  }, [totalPackages, activeIndex]);

  // Preload only current, previous, and next package images for fast performance
  useEffect(() => {
    if (totalPackages === 0) return;
    const prevIdx = (activeIndex - 1 + totalPackages) % totalPackages;
    const nextIdx = (activeIndex + 1) % totalPackages;
    setLoadedIndices((prev) => ({
      ...prev,
      [activeIndex]: true,
      [prevIdx]: true,
      [nextIdx]: true,
    }));
  }, [activeIndex, totalPackages]);

  // Sync carousel active slide when a package is highlighted via Navbar or URL ?package=ID
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetId = highlightedPkgId || params.get('package');
    if (targetId && visiblePackages.length > 0) {
      const idx = visiblePackages.findIndex((p) => p.id === targetId);
      if (idx !== -1) {
        setActiveIndex(idx);
        setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 250);
      }
    }
  }, [highlightedPkgId, visiblePackages]);

  const goToIndex = useCallback(
    (index: number) => {
      if (totalPackages === 0) return;
      const normalized = ((index % totalPackages) + totalPackages) % totalPackages;
      setActiveIndex(normalized);
      setDragOffsetPx(0);
    },
    [totalPackages]
  );

  const goToNext = useCallback(() => {
    if (totalPackages <= 1) return;
    goToIndex(activeIndex + 1);
  }, [activeIndex, totalPackages, goToIndex]);

  const goToPrev = useCallback(() => {
    if (totalPackages <= 1) return;
    goToIndex(activeIndex - 1);
  }, [activeIndex, totalPackages, goToIndex]);

  // Keyboard navigation support (Left / Right arrows)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') {
        goToNext();
      } else if (e.key === 'ArrowRight') {
        goToPrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev]);

  const handleSharePkg = async (pkg: HajjPackage, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const res = await sharePackageItem(pkg);
    if (res === 'copied' || res === 'shared') {
      setCopiedPkgId(pkg.id);
      setTimeout(() => setCopiedPkgId((prev) => (prev === pkg.id ? null : prev)), 2500);
    }
  };

  const handleSelectAndRegister = (pkg: HajjPackage) => {
    const status = evaluatePackageStatus(pkg, pilgrims);
    if (status.isClosedForVisitors) return;
    if (onSelectPackageForRegistration) {
      onSelectPackageForRegistration(pkg.title);
    }
    setCurrentView('register');
  };

  // Unified Touch & Mouse Drag Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (totalPackages <= 1) return;
    dragStartXRef.current = e.touches[0].clientX;
    dragStartYRef.current = e.touches[0].clientY;
    isHorizontalSwipeRef.current = null;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || dragStartXRef.current === null || dragStartYRef.current === null) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - dragStartXRef.current;
    const deltaY = currentY - dragStartYRef.current;

    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        isHorizontalSwipeRef.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }

    if (isHorizontalSwipeRef.current) {
      setDragOffsetPx(deltaX);
    }
  };

  const finishDrag = (deltaX: number) => {
    const swipeThreshold = 45;
    if (deltaX > swipeThreshold && activeIndex < totalPackages - 1) {
      goToNext();
    } else if (deltaX < -swipeThreshold && activeIndex > 0) {
      goToPrev();
    } else if (deltaX > swipeThreshold && activeIndex === totalPackages - 1) {
      goToIndex(0);
    } else if (deltaX < -swipeThreshold && activeIndex === 0) {
      goToIndex(totalPackages - 1);
    } else {
      setDragOffsetPx(0);
    }
    dragStartXRef.current = null;
    dragStartYRef.current = null;
    isHorizontalSwipeRef.current = null;
    setIsDragging(false);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    finishDrag(dragOffsetPx);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (totalPackages <= 1) return;
    if ((e.target as HTMLElement).closest('button')) return;
    dragStartXRef.current = e.clientX;
    dragStartYRef.current = e.clientY;
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || dragStartXRef.current === null) return;
    const deltaX = e.clientX - dragStartXRef.current;
    setDragOffsetPx(deltaX);
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    finishDrag(dragOffsetPx);
  };

  if (totalPackages === 0) {
    return (
      <div className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center text-slate-500 dark:text-slate-400 shadow-sm">
        لا توجد باقات متاحة للعرض حالياً.
      </div>
    );
  }

  const activePackage = visiblePackages[activeIndex] || visiblePackages[0];

  return (
    <div
      ref={containerRef}
      dir="rtl"
      className="w-full select-none space-y-5 text-right"
      aria-roledescription="carousel"
      aria-label="معرض باقات الحج والعمرة"
    >
      {/* Top Quick Package Selector Strip & Counter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#0B1221] border border-[#CBD5E1] dark:border-slate-800/90 p-2.5 sm:p-3 rounded-2xl shadow-[0_2px_8px_rgba(15,23,42,0.06)] dark:shadow-md">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
          {visiblePackages.map((pkg, idx) => {
            const isCurrent = idx === activeIndex;
            const isAir =
              (pkg.transport || '').includes('طيران') || (pkg.title || '').includes('طيران');
            const TransportIcon = isAir ? Plane : Bus;
            const pkgStatus = evaluatePackageStatus(pkg, pilgrims);

            return (
              <button
                key={pkg.id}
                type="button"
                onClick={() => goToIndex(idx)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                  isCurrent
                    ? 'bg-[#D97706] dark:bg-amber-500 text-white dark:text-slate-950 shadow-md shadow-amber-700/20 dark:shadow-amber-500/20 font-black'
                    : pkgStatus.isClosedOnHomepage
                    ? 'bg-slate-100 dark:bg-[#111C33]/60 text-[#475569] dark:text-slate-400 border border-[#CBD5E1] dark:border-slate-800/80 opacity-85'
                    : 'bg-[#F8FAFC] dark:bg-[#111C33] hover:bg-amber-50 dark:hover:bg-[#162440] text-[#1E293B] dark:text-slate-300 hover:text-[#0F172A] dark:hover:text-white border border-[#CBD5E1] dark:border-slate-800 hover:border-amber-500'
                }`}
              >
                <TransportIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{pkg.title}</span>
                {pkgStatus.isClosedOnHomepage && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                      isCurrent
                        ? 'bg-slate-950/80 text-amber-300'
                        : pkgStatus.isFull
                        ? 'bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {pkgStatus.isFull ? 'مكتملة' : 'مغلقة'}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Desktop & Mobile Quick Arrow Controls + Counter */}
        <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-800/80 pt-2 sm:pt-0 px-1">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
            الباقة <strong className="text-amber-700 dark:text-amber-400 font-black">{activeIndex + 1}</strong> من{' '}
            <strong className="text-slate-900 dark:text-white font-black">{totalPackages}</strong>
          </span>

          {totalPackages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={goToPrev}
                aria-label="الباقة السابقة"
                title="الباقة السابقة"
                className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-[#111C33] hover:bg-amber-500 text-amber-700 dark:text-amber-400 hover:text-slate-950 border border-amber-500/35 transition flex items-center justify-center cursor-pointer active:scale-95"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={goToNext}
                aria-label="الباقة التالية"
                title="الباقة التالية"
                className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-[#111C33] hover:bg-amber-500 text-amber-700 dark:text-amber-400 hover:text-slate-950 border border-amber-500/35 transition flex items-center justify-center cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Horizontal Carousel Viewport — Shows 1 Primary Card + Subtle Peek of Next Card */}
      <div
        className="relative overflow-hidden py-2"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Desktop Floating Side Navigation Arrows */}
        {totalPackages > 1 && (
          <>
            <button
              type="button"
              onClick={goToPrev}
              aria-label="السابق"
              className="hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-2xl bg-white/95 dark:bg-[#0B1221]/90 hover:bg-amber-500 text-amber-700 dark:text-amber-400 hover:text-slate-950 border border-amber-500/45 shadow-xl items-center justify-center transition-all duration-200 cursor-pointer active:scale-95"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={goToNext}
              aria-label="التالي"
              className="hidden lg:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-2xl bg-white/95 dark:bg-[#0B1221]/90 hover:bg-amber-500 text-amber-700 dark:text-amber-400 hover:text-slate-950 border border-amber-500/45 shadow-xl items-center justify-center transition-all duration-200 cursor-pointer active:scale-95"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Horizontal Track */}
        <div
          className={`flex items-stretch ${
            isDragging ? '' : 'transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]'
          }`}
          style={{
            transform: `translate3d(calc(${activeIndex * 86}% + ${dragOffsetPx}px), 0, 0)`,
          }}
        >
          {visiblePackages.map((pkg, idx) => {
            const isActive = idx === activeIndex;
            const isCopied = copiedPkgId === pkg.id;
            const isHighlighted = highlightedPkgId === pkg.id;
            const shouldLoadImg = Boolean(
              loadedIndices[idx] || Math.abs(idx - activeIndex) <= 1
            );
            const isImgBroken = Boolean(failedImages[pkg.id]);
            const isAir =
              (pkg.transport || '').includes('طيران') || (pkg.title || '').includes('طيران');
            const TransportIcon = isAir ? Plane : Bus;
            const status = evaluatePackageStatus(pkg, pilgrims);

            return (
              <div
                key={pkg.id}
                id={`${cardIdPrefix}-${pkg.id}`}
                onClick={() => {
                  if (!isActive && Math.abs(dragOffsetPx) < 10) {
                    goToIndex(idx);
                  }
                }}
                aria-hidden={!isActive}
                className={`w-[86%] shrink-0 pl-3 sm:pl-5 transition-all duration-500 ${
                  isActive
                    ? 'scale-100 opacity-100 z-20'
                    : 'scale-[0.95] opacity-55 hover:opacity-80 cursor-pointer z-10'
                }`}
              >
                <div
                  className={`h-full bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white rounded-3xl overflow-hidden shadow-lg dark:shadow-2xl flex flex-col lg:flex-row transition-all duration-300 ${
                    status.isClosedOnHomepage
                      ? 'opacity-85 border-2 border-slate-300 dark:border-slate-700/80'
                      : isActive || isHighlighted
                      ? 'border-2 border-amber-500/65 dark:border-amber-500/70 shadow-xl shadow-slate-200/80 dark:shadow-[0_20px_50px_-15px_rgba(245,158,11,0.22)]'
                      : 'border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {/* Visual Media Column (Right Side on Desktop, Top on Mobile) */}
                  <div className="relative h-60 sm:h-72 lg:h-auto lg:w-[44%] shrink-0 overflow-hidden bg-slate-900">
                    {shouldLoadImg && pkg.image && !isImgBroken ? (
                      <img
                        src={pkg.image}
                        alt={pkg.title}
                        loading={idx === 0 ? 'eager' : 'lazy'}
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedImages((prev) => ({ ...prev, [pkg.id]: true }))
                        }
                        className={`w-full h-full object-cover transition-transform duration-700 ${
                          status.isClosedOnHomepage
                            ? 'grayscale-[45%] brightness-75'
                            : 'hover:scale-105'
                        }`}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#101B33] via-[#0B1221] to-[#070B14] flex flex-col items-center justify-center p-6 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3">
                          <PackageIcon className="w-8 h-8" />
                        </div>
                        <span className="text-sm font-bold text-amber-300">{pkg.title}</span>
                      </div>
                    )}

                    {/* Subtle Gradient Overlay for Contrast */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0B1221] via-slate-950/30 to-transparent lg:bg-gradient-to-l lg:from-[#0B1221]/90 lg:via-transparent lg:to-transparent" />

                    {/* Price Badge */}
                    <div className="absolute top-4 right-4 bg-[#080D1A]/90 backdrop-blur-md text-amber-400 px-4 py-2 rounded-2xl text-sm sm:text-base font-black border border-amber-500/40 shadow-lg tabular-nums">
                      {pkg.price}
                    </div>

                    {/* Prominent Closed / Sold Out / Season Ended Badge */}
                    {status.isClosedOnHomepage && status.publicBadgeText && (
                      <div
                        className={`absolute top-16 right-4 px-4 py-2 rounded-2xl text-xs sm:text-sm font-black shadow-xl flex items-center gap-2 backdrop-blur-md border-2 ${
                          status.isFull && !status.isForceClosed && !status.isDeadlineExpired
                            ? 'bg-red-600/95 text-white border-red-400'
                            : 'bg-slate-900/95 text-amber-300 border-amber-500/60'
                        }`}
                      >
                        <Lock className="w-4 h-4 shrink-0" />
                        <span>{status.publicBadgeText}</span>
                      </div>
                    )}

                    {/* Share Direct Link Button */}
                    <button
                      type="button"
                      onClick={(e) => handleSharePkg(pkg, e)}
                      title="مشاركة هذه الباقة برابط مباشر"
                      className={`absolute top-4 left-4 px-3 py-2 rounded-2xl backdrop-blur-md border transition flex items-center gap-1.5 text-xs font-bold shadow-lg cursor-pointer ${
                        isCopied
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                          : 'bg-[#080D1A]/90 hover:bg-amber-500 text-amber-400 hover:text-slate-950 border-amber-500/35'
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>تم النسخ</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-4 h-4" />
                          <span>مشاركة</span>
                        </>
                      )}
                    </button>

                    {/* Bottom-Right Package Transport Indicator on Image */}
                    <div className="absolute bottom-4 right-4 flex items-center gap-2 text-xs text-slate-200 bg-[#080D1A]/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800/90">
                      <TransportIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="font-bold">{pkg.transport}</span>
                    </div>
                  </div>

                  {/* Package Details & Action Column */}
                  <div className="p-5 sm:p-7 lg:p-8 flex-1 flex flex-col justify-between space-y-6 bg-white dark:bg-gradient-to-b dark:from-[#0E172A] dark:to-[#0B1221]">
                    <div className="space-y-4">
                      {/* Category Kicker & Details Button */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400 flex-wrap">
                          <span>{pkg.type}</span>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                            ·
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">موسم 1448هـ</span>
                          {status.isClosedOnHomepage && status.publicBadgeText ? (
                            <span
                              className={`px-2.5 py-0.5 rounded-lg text-[11px] font-black border ${
                                status.isFull && !status.isForceClosed && !status.isDeadlineExpired
                                  ? 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40'
                                  : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40'
                              }`}
                            >
                              {status.publicBadgeText}
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                              متاحة للتسجيل
                            </span>
                          )}
                        </div>

                        {onOpenDetailsModal && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenDetailsModal(pkg);
                            }}
                            className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-400 transition flex items-center gap-1 cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>عرض التفاصيل</span>
                          </button>
                        )}
                      </div>

                      {/* Package Title */}
                      <h3
                        className={`text-xl sm:text-2xl lg:text-[1.65rem] font-black leading-snug ${
                          status.isClosedOnHomepage ? 'text-slate-500 dark:text-slate-300' : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {pkg.title}
                      </h3>

                      {/* Capacity & Deadline Status Banner (if configured or closed) */}
                      {(status.maxCapacity !== null ||
                        Boolean(pkg.registrationDeadline) ||
                        status.isClosedOnHomepage) && (
                        <div
                          className={`rounded-2xl p-3 border text-xs flex flex-wrap items-center justify-between gap-3 ${
                            status.isClosedOnHomepage
                              ? 'bg-red-50 dark:bg-red-950/25 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200'
                              : 'bg-slate-50 dark:bg-[#080D1A]/80 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {status.maxCapacity !== null && (
                            <div className="flex items-center gap-2">
                              <Users
                                className={`w-4 h-4 shrink-0 ${
                                  status.isFull ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                                }`}
                              />
                              <span>
                                {status.isFull ? (
                                  <strong className="font-black text-red-700 dark:text-red-300">
                                    مكتملة العدد
                                  </strong>
                                ) : (
                                  <>
                                    المقاعد المتاحة:{' '}
                                    <strong className="font-black text-emerald-700 dark:text-emerald-400">
                                      متبقي {status.remainingSeats} مقعد
                                    </strong>
                                  </>
                                )}
                              </span>
                            </div>
                          )}

                          {pkg.registrationDeadline && (
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <Clock
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  status.isDeadlineExpired ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                                }`}
                              />
                              <span>
                                {status.isDeadlineExpired
                                  ? 'انتهى التسجيل في: '
                                  : 'آخر موعد للتسجيل: '}
                                <strong className="font-bold">
                                  {formatRegistrationDeadlineAr(pkg.registrationDeadline)}
                                </strong>
                              </span>
                            </div>
                          )}

                          {status.isForceClosed && (
                            <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-bold">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>{status.forceCloseReasonText}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Key Accommodation & Transport Info Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-50 dark:bg-[#080D1A]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-3.5 text-xs text-slate-700 dark:text-slate-200">
                        <div className="flex items-center gap-2">
                          <TransportIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">وسيلة النقل</span>
                            <span className="font-bold text-slate-900 dark:text-white block truncate">{pkg.transport}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">سكن مكة المكرمة</span>
                            <span className="font-bold text-slate-900 dark:text-white block truncate">
                              {pkg.accommodationMakkah}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">سكن المدينة المنورة</span>
                            <span className="font-bold text-slate-900 dark:text-white block truncate">
                              {pkg.accommodationMadinah}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Package Features List */}
                      <div className="border-t border-slate-200 dark:border-slate-800/90 pt-4 space-y-2.5">
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400 block">
                          مميزات وخدمات الباقة ({pkg.features.length}):
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {pkg.features.map((feat, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-[#10192D]/80 border border-slate-200 dark:border-slate-800/80 px-3 py-2 rounded-xl"
                            >
                              <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                              <span className="leading-relaxed">{feat}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Action Footer Bound to Currently Active Package */}
                    <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                      <button
                        type="button"
                        disabled={status.isClosedForVisitors}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectAndRegister(pkg);
                        }}
                        className={`flex-1 font-black py-3.5 px-6 rounded-xl transition-all duration-200 text-sm flex items-center justify-center gap-2 ${
                          status.isClosedForVisitors
                            ? 'bg-slate-200 dark:bg-slate-800/90 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700 cursor-not-allowed opacity-75'
                            : 'bg-[#D97706] hover:bg-[#B45309] dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 shadow-md shadow-amber-700/20 dark:shadow-amber-500/20 cursor-pointer active:scale-[0.99]'
                        }`}
                      >
                        {status.isClosedForVisitors ? (
                          <>
                            <Lock className="w-4 h-4 shrink-0" />
                            <span>
                              سجل الآن — ({status.publicBadgeText || 'مغلق'})
                            </span>
                          </>
                        ) : (
                          <>
                            <span>اختيار هذه الباقة والتسجيل الآن</span>
                            <ArrowLeft className="w-4 h-4" />
                          </>
                        )}
                      </button>

                      {totalPackages > 1 && idx < totalPackages - 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            goToNext();
                          }}
                          className="sm:w-auto bg-white dark:bg-[#111C33] hover:bg-amber-50 dark:hover:bg-[#172644] text-[#1E293B] dark:text-amber-300 border border-[#94A3B8] dark:border-amber-500/35 hover:border-amber-500 font-bold py-3.5 px-4 rounded-xl shadow-2xs transition text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <span>الباقة التالية</span>
                          <ChevronLeft className="w-4 h-4 text-[#D97706] dark:text-amber-400" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Indicators Bar: Dots, Active Package Summary, and Swipe Hint */}
      <div className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-slate-800/90 rounded-2xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          {visiblePackages.map((pkg, idx) => {
            const isCurrent = idx === activeIndex;
            return (
              <button
                key={pkg.id}
                type="button"
                onClick={() => goToIndex(idx)}
                aria-label={`انتقل إلى الباقة ${idx + 1}: ${pkg.title}`}
                aria-current={isCurrent ? 'true' : undefined}
                className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                  isCurrent
                    ? 'w-9 bg-amber-500 dark:bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.45)]'
                    : 'w-2.5 bg-slate-300 dark:bg-slate-700 hover:bg-amber-500/60'
                }`}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span className="font-bold text-amber-700 dark:text-amber-400">{activePackage.title}</span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
            ·
          </span>
          <span className="text-slate-500 dark:text-slate-400">اسحب يميناً أو يساراً للتنقل بين الباقات</span>
        </div>
      </div>
    </div>
  );
};
