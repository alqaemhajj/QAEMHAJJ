import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Map as GoogleMap,
  InfoWindow,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Map as MapIcon,
  Navigation,
  Route as RouteIcon,
  Loader2,
  ExternalLink,
  Footprints,
  Car,
  Crosshair,
  Building2,
} from 'lucide-react';
import { MapsProviderWrapper } from './MapsProviderWrapper';
import {
  AdvancedMarkerWithRef,
  GMP_ATTRIBUTION_ID,
  REGIONAL_INITIAL_CAMERA,
  ResolvedPlaceItem,
  extractLatLng,
  formatDistanceAr,
  formatDurationAr,
  reportMapsErrorIfQuota,
} from './mapsUtils';

type GuideTabKey = 'day1' | 'day2' | 'day3' | 'day4' | 'day5' | 'checklist';

interface RitualSiteDefinition {
  id: string;
  label: string;
  textQuery: string;
  relatedDays: GuideTabKey[];
  roleDescription: string;
}

// Search queries ONLY — coordinates are resolved live from Google Maps Places API (New)
const SACRED_SITE_DEFINITIONS: RitualSiteDefinition[] = [
  {
    id: 'haram',
    label: 'المسجد الحرام',
    textQuery: 'المسجد الحرام مكة المكرمة السعودية',
    relatedDays: ['day1', 'day3', 'day5', 'checklist'],
    roleDescription: 'الطواف والسعي وطواف الإفاضة وطواف الوداع',
  },
  {
    id: 'mina',
    label: 'مشعر منى',
    textQuery: 'مشعر منى مكة المكرمة السعودية',
    relatedDays: ['day1', 'day3', 'day4'],
    roleDescription: 'يوم التروية 8 ذو الحجة والمبيت وأيام التشريق',
  },
  {
    id: 'arafat',
    label: 'مشعر عرفات',
    textQuery: 'مشعر عرفات جبل الرحمة مكة المكرمة السعودية',
    relatedDays: ['day2'],
    roleDescription: 'الوقوف بعرفة الركن الأعظم 9 ذو الحجة',
  },
  {
    id: 'muzdalifah',
    label: 'مشعر مزدلفة',
    textQuery: 'مشعر مزدلفة مكة المكرمة السعودية',
    relatedDays: ['day2', 'day3'],
    roleDescription: 'النفير والمبيت ليلة العيد وجمع الحصى',
  },
  {
    id: 'jamarat',
    label: 'جسر الجمرات',
    textQuery: 'جسر الجمرات منى مكة المكرمة السعودية',
    relatedDays: ['day3', 'day4'],
    roleDescription: 'رمي جمرة العقبة الكبرى والجمرات الثلاث',
  },
  {
    id: 'nabawi',
    label: 'المسجد النبوي',
    textQuery: 'المسجد النبوي المدينة المنورة السعودية',
    relatedDays: ['day5', 'checklist'],
    roleDescription: 'زيارة الرسول الأعظم ﷺ بالمدينة المنورة',
  },
];

const NEARBY_SERVICE_FILTERS = [
  { id: 'medical', label: 'مراكز طبية ومستشفيات', query: 'مستشفى مركز صحي' },
  { id: 'train', label: 'محطات قطار المشاعر', query: 'محطة قطار المشاعر المقدسة' },
  { id: 'mosque', label: 'مساجد قريبة', query: 'مسجد' },
];

interface RitualSitesMapProps {
  activeDayTab: GuideTabKey;
}

const RitualSitesMapInner: React.FC<RitualSitesMapProps> = ({ activeDayTab }) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');

  const [resolvedSites, setResolvedSites] = useState<Record<string, ResolvedPlaceItem>>({});
  const [selectedSiteId, setSelectedSiteId] = useState<string>('mina');
  const [nearbyPlaces, setNearbyPlaces] = useState<ResolvedPlaceItem[]>([]);
  const [activeNearbyFilter, setActiveNearbyFilter] = useState<string | null>(null);
  const [loadingSiteId, setLoadingSiteId] = useState<string | null>(null);
  const [loadingNearby, setLoadingNearby] = useState<boolean>(false);

  const [infoTarget, setInfoTarget] = useState<ResolvedPlaceItem | null>(null);
  const [activeMarkerEl, setActiveMarkerEl] = useState<google.maps.marker.AdvancedMarkerElement | null>(null);

  const [originId, setOriginId] = useState<string>('mina');
  const [destinationId, setDestinationId] = useState<string>('arafat');
  const [travelMode, setTravelMode] = useState<'DRIVING' | 'WALKING'>('DRIVING');
  const [userOrigin, setUserOrigin] = useState<ResolvedPlaceItem | null>(null);
  const [computingRoute, setComputingRoute] = useState<boolean>(false);
  const [routeSummary, setRouteSummary] = useState<{
    distanceMeters: number;
    durationMillis: number;
    fromLabel: string;
    toLabel: string;
  } | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  const clearPolylines = useCallback(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearPolylines();
  }, [clearPolylines]);

  const resolveSiteById = useCallback(
    async (siteId: string): Promise<ResolvedPlaceItem | null> => {
      if (resolvedSites[siteId]) return resolvedSites[siteId];
      if (!placesLib) return null;
      const def = SACRED_SITE_DEFINITIONS.find((s) => s.id === siteId);
      if (!def) return null;

      setLoadingSiteId(siteId);
      setStatusNotice(null);
      try {
        const { places } = await placesLib.Place.searchByText({
          textQuery: def.textQuery,
          fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI'],
          language: 'ar',
          region: 'SA',
          maxResultCount: 1,
          internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
        });

        const place = places?.[0];
        const coords = extractLatLng(place?.location);
        if (!place || !coords) {
          setStatusNotice(`تعذر تحديد إحداثيات "${def.label}" حالياً.`);
          return null;
        }

        const resolved: ResolvedPlaceItem = {
          id: def.id,
          label: def.label,
          displayName: place.displayName || def.label,
          formattedAddress: place.formattedAddress || def.roleDescription,
          location: coords,
          googleMapsURI: place.googleMapsURI || undefined,
        };

        setResolvedSites((prev) => ({ ...prev, [siteId]: resolved }));
        return resolved;
      } catch (err) {
        const isQuota = reportMapsErrorIfQuota(err);
        if (!isQuota) {
          setStatusNotice(`تعذر تحميل موقع "${def.label}" من خرائط قوقل.`);
        }
        return null;
      } finally {
        setLoadingSiteId(null);
      }
    },
    [placesLib, resolvedSites]
  );

  // Sync highlighted site automatically with the selected day tab in GuideView
  const recommendedSiteId = useMemo(() => {
    if (activeDayTab === 'day1') return 'mina';
    if (activeDayTab === 'day2') return 'arafat';
    if (activeDayTab === 'day3') return 'jamarat';
    if (activeDayTab === 'day4') return 'mina';
    if (activeDayTab === 'day5') return 'haram';
    return 'haram';
  }, [activeDayTab]);

  useEffect(() => {
    if (!placesLib) return;
    let active = true;
    setSelectedSiteId(recommendedSiteId);
    setNearbyPlaces([]);
    setActiveNearbyFilter(null);

    resolveSiteById(recommendedSiteId).then((resolved) => {
      if (active && resolved && map) {
        map.panTo(resolved.location);
        map.setZoom(13);
      }
    });

    return () => {
      active = false;
    };
  }, [placesLib, recommendedSiteId, map, resolveSiteById]);

  const handleSelectSite = async (siteId: string) => {
    setSelectedSiteId(siteId);
    setNearbyPlaces([]);
    setActiveNearbyFilter(null);
    setInfoTarget(null);
    setActiveMarkerEl(null);
    const resolved = await resolveSiteById(siteId);
    if (resolved && map) {
      map.panTo(resolved.location);
      map.setZoom(14);
    }
  };

  const handleSearchNearbyServices = async (filterId: string, queryText: string) => {
    if (!placesLib) return;
    const targetSite = await resolveSiteById(selectedSiteId);
    if (!targetSite) return;

    setActiveNearbyFilter(filterId);
    setLoadingNearby(true);
    setStatusNotice(null);

    try {
      const { places } = await placesLib.Place.searchByText({
        textQuery: `${queryText} ${targetSite.label}`,
        locationBias: {
          center: targetSite.location,
          radius: 4000,
        },
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI'],
        language: 'ar',
        region: 'SA',
        maxResultCount: 5,
        internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
      });

      const items: ResolvedPlaceItem[] = [];
      for (const p of places || []) {
        const coords = extractLatLng(p.location);
        if (!coords) continue;
        items.push({
          id: `nearby-${p.id}`,
          label: 'خدمة قريبة',
          displayName: p.displayName || queryText,
          formattedAddress: p.formattedAddress || '',
          location: coords,
          googleMapsURI: p.googleMapsURI || undefined,
        });
      }

      setNearbyPlaces(items);
      if (items.length === 0) {
        setStatusNotice('لم يُعثر على نتائج قريبة مطابقة لهذا التصنيف في محيط المشعر.');
      }
    } catch (err) {
      const isQuota = reportMapsErrorIfQuota(err);
      if (!isQuota) {
        setStatusNotice('تعذر جلب الخدمات القريبة حالياً.');
      }
    } finally {
      setLoadingNearby(false);
    }
  };

  const handleComputeSiteRoute = async (customOrigin?: ResolvedPlaceItem) => {
    if (!routesLib || !map) return;
    setStatusNotice(null);
    setComputingRoute(true);
    clearPolylines();
    setRouteSummary(null);

    try {
      const originItem =
        customOrigin ||
        (originId === '__my_location__' && userOrigin
          ? userOrigin
          : await resolveSiteById(originId));
      const destItem = await resolveSiteById(destinationId);

      if (!originItem || !destItem) {
        setComputingRoute(false);
        return;
      }

      if (originItem.id === destItem.id) {
        setStatusNotice('نقطة البداية والوجهة متطابقتان؛ اختر مشعراً مختلفاً.');
        setComputingRoute(false);
        return;
      }

      const response = await routesLib.Route.computeRoutes({
        origin: originItem.location,
        destination: destItem.location,
        travelMode,
        fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
        language: 'ar',
        internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
      });

      const primaryRoute = response.routes?.[0];
      if (!primaryRoute) {
        setStatusNotice('لم يتوفر مسار بين المشعرين بهذه الوسيلة.');
        return;
      }

      const newPolylines = primaryRoute.createPolylines({
        polylineOptions: {
          strokeColor: travelMode === 'WALKING' ? '#10b981' : '#f59e0b',
          strokeWeight: 6,
          strokeOpacity: 0.9,
        },
      });
      newPolylines.forEach((p) => p.setMap(map));
      polylinesRef.current = newPolylines;

      if (primaryRoute.viewport) {
        map.fitBounds(primaryRoute.viewport);
      }

      setRouteSummary({
        distanceMeters: primaryRoute.distanceMeters ?? 0,
        durationMillis: primaryRoute.durationMillis ?? 0,
        fromLabel: originItem.label,
        toLabel: destItem.label,
      });
    } catch (err) {
      const isQuota = reportMapsErrorIfQuota(err);
      setRouteNoticeFallback(isQuota);
    } finally {
      setComputingRoute(false);
    }
  };

  const setRouteNoticeFallback = (isQuota: boolean) => {
    setStatusNotice(
      isQuota
        ? 'تم بلوغ الحد المؤقت لخدمة المسارات.'
        : 'تعذر حساب المسار بين المشعرين حالياً.'
    );
  };

  // Explicit user-consent geolocation for pilgrim position in Mina/Arafat/Makkah
  const handleLocatePilgrim = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatusNotice('جهازك لا يدعم خدمة تحديد الموقع الجغرافي.');
      return;
    }
    setStatusNotice(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords: google.maps.LatLngLiteral = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        const currentLoc: ResolvedPlaceItem = {
          id: '__my_location__',
          label: 'موقعي الحالي',
          displayName: 'موقع الحاج الحالي',
          formattedAddress: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
          location: coords,
        };
        setUserOrigin(currentLoc);
        setOriginId('__my_location__');
        if (map) {
          map.panTo(coords);
          map.setZoom(14);
        }
        await handleComputeSiteRoute(currentLoc);
      },
      () => {
        setStatusNotice('يرجى تفعيل إذن الموقع في المتصفح لعرض المسار من موقعك الحالي.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const activeSiteDef = SACRED_SITE_DEFINITIONS.find((s) => s.id === selectedSiteId);
  const activeResolvedSite = resolvedSites[selectedSiteId];

  return (
    <div className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-amber-500/35 text-slate-900 dark:text-white rounded-3xl p-5 sm:p-6 shadow-md dark:shadow-2xl space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/30 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0">
            <MapIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-amber-700 dark:text-amber-400">
              خريطة المشاعر المقدسة ومسارات الحج التفاعلية
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              استعرض مواقع المناسك عبر خرائط قوقل واحسب مسافة التنقل بين المشاعر بالسيارة أو مشياً على الأقدام
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLocatePilgrim}
          className="inline-flex items-center justify-center gap-2 bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold px-3.5 py-2 rounded-xl text-xs transition cursor-pointer shrink-0"
        >
          <Crosshair className="w-4 h-4" />
          <span>تحديد موقعي الحالي</span>
        </button>
      </div>

      {/* Sacred Site Quick Selector Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {SACRED_SITE_DEFINITIONS.map((site) => {
          const isSelected = selectedSiteId === site.id;
          const isSuggestedForTab = site.relatedDays.includes(activeDayTab);
          return (
            <button
              key={site.id}
              type="button"
              onClick={() => handleSelectSite(site.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border ${
                isSelected
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow'
                  : isSuggestedForTab
                  ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/35 hover:bg-amber-100 dark:hover:bg-amber-500/20'
                  : 'bg-slate-50 dark:bg-[#070C18] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>{site.label}</span>
              {loadingSiteId === site.id && <Loader2 className="w-3 h-3 animate-spin" />}
            </button>
          );
        })}
      </div>

      {/* Route Planner Between Sacred Sites */}
      <div className="bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4 space-y-1">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">من نقطة الانطلاق:</label>
            <select
              value={originId}
              onChange={(e) => setOriginId(e.target.value)}
              className="w-full bg-white dark:bg-[#0B1221] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-bold outline-none focus:border-amber-500"
            >
              {userOrigin && <option value="__my_location__">موقعي الحالي</option>}
              {SACRED_SITE_DEFINITIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4 space-y-1">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">إلى الوجهة:</label>
            <select
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              className="w-full bg-white dark:bg-[#0B1221] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-bold outline-none focus:border-amber-500"
            >
              {SACRED_SITE_DEFINITIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 flex items-center gap-1 bg-white dark:bg-[#0B1221] p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setTravelMode('DRIVING')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
                travelMode === 'DRIVING'
                  ? 'bg-amber-500 text-slate-950 font-black'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              <span>حافلة/سيارة</span>
            </button>
            <button
              type="button"
              onClick={() => setTravelMode('WALKING')}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
                travelMode === 'WALKING'
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Footprints className="w-3.5 h-3.5" />
              <span>مشياً</span>
            </button>
          </div>

          <div className="md:col-span-2">
            <button
              type="button"
              onClick={() => handleComputeSiteRoute()}
              disabled={computingRoute}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 px-3 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {computingRoute ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RouteIcon className="w-4 h-4" />
              )}
              <span>عرض المسار</span>
            </button>
          </div>
        </div>

        {/* Nearby Services Search Buttons around selected site */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-600 dark:text-slate-400 font-bold flex items-center gap-1 ml-1">
              <Building2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>خدمات قريبة من {activeSiteDef?.label}:</span>
            </span>
            {NEARBY_SERVICE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => handleSearchNearbyServices(f.id, f.query)}
                disabled={loadingNearby}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                  activeNearbyFilter === f.id
                    ? 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
                    : 'bg-white dark:bg-[#0B1221] border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-amber-400 dark:hover:border-amber-500/40'
                }`}
              >
                {f.label}
              </button>
            ))}
            {loadingNearby && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 dark:text-amber-400" />}
          </div>

          {activeResolvedSite?.googleMapsURI && (
            <a
              href={activeResolvedSite.googleMapsURI}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>فتح {activeResolvedSite.label} في خرائط قوقل</span>
            </a>
          )}
        </div>

        {routeSummary && (
          <div className="flex flex-wrap items-center gap-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl px-3.5 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-200">
            <Navigation className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              المسار من {routeSummary.fromLabel} إلى {routeSummary.toLabel}:
            </span>
            <span className="text-slate-900 dark:text-white">{formatDistanceAr(routeSummary.distanceMeters)}</span>
            <span className="text-emerald-500/60">|</span>
            <span className="text-slate-900 dark:text-white">
              المدة التقديرية ({travelMode === 'WALKING' ? 'مشياً' : 'بالحافلة/السيارة'}):{' '}
              {formatDurationAr(routeSummary.durationMillis)}
            </span>
          </div>
        )}

        {statusNotice && <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">{statusNotice}</p>}
      </div>

      {/* Explicit-height Map Viewport (CF2 + CF9 + mandatory internalUsageAttributionIds) */}
      <div className="w-full h-[380px] sm:h-[440px] rounded-2xl overflow-hidden border border-slate-200 dark:border-amber-500/30 bg-slate-100 dark:bg-[#070C18]">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={REGIONAL_INITIAL_CAMERA.center}
          defaultZoom={REGIONAL_INITIAL_CAMERA.zoom}
          gestureHandling="greedy"
          streetViewControl={false}
          internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
          className="w-full h-full"
          style={{ width: '100%', height: '100%' }}
          onClick={() => {
            setInfoTarget(null);
            setActiveMarkerEl(null);
          }}
        >
          {Object.values(resolvedSites).map((site) => {
            const isSelected = site.id === selectedSiteId;
            return (
              <AdvancedMarkerWithRef
                key={site.id}
                position={site.location}
                title={site.displayName}
                zIndex={isSelected ? 100 : 50}
                onMarkerClick={(marker) => {
                  setInfoTarget(site);
                  setActiveMarkerEl(marker);
                }}
              >
                <Pin
                  background={isSelected ? '#f59e0b' : '#1e293b'}
                  borderColor={isSelected ? '#78350f' : '#f59e0b'}
                  glyphColor={isSelected ? '#0B1221' : '#fbbf24'}
                />
              </AdvancedMarkerWithRef>
            );
          })}

          {userOrigin && (
            <AdvancedMarkerWithRef
              position={userOrigin.location}
              title={userOrigin.displayName}
              zIndex={120}
              onMarkerClick={(marker) => {
                setInfoTarget(userOrigin);
                setActiveMarkerEl(marker);
              }}
            >
              <Pin background="#0ea5e9" borderColor="#0369a1" glyphColor="#ffffff" />
            </AdvancedMarkerWithRef>
          )}

          {nearbyPlaces.map((np) => (
            <AdvancedMarkerWithRef
              key={np.id}
              position={np.location}
              title={np.displayName}
              zIndex={40}
              onMarkerClick={(marker) => {
                setInfoTarget(np);
                setActiveMarkerEl(marker);
              }}
            >
              <Pin background="#10b981" borderColor="#065f46" glyphColor="#ffffff" />
            </AdvancedMarkerWithRef>
          ))}

          {infoTarget && activeMarkerEl && (
            <InfoWindow
              anchor={activeMarkerEl}
              pixelOffset={[0, -8]}
              onCloseClick={() => {
                setInfoTarget(null);
                setActiveMarkerEl(null);
              }}
            >
              <div dir="rtl" className="text-right text-slate-900 p-1 max-w-[240px] space-y-1.5">
                <p className="text-[11px] font-black text-amber-700">{infoTarget.label}</p>
                <p className="text-sm font-bold">{infoTarget.displayName}</p>
                {infoTarget.formattedAddress && (
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {infoTarget.formattedAddress}
                  </p>
                )}
                {infoTarget.googleMapsURI && (
                  <a
                    href={infoTarget.googleMapsURI}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:underline"
                  >
                    <span>التفاصيل والاتجاهات في خرائط قوقل</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>
    </div>
  );
};

export const RitualSitesMap: React.FC<RitualSitesMapProps> = ({ activeDayTab }) => {
  return (
    <MapsProviderWrapper
      fallbackMapsUrl="https://www.google.com/maps/search/?api=1&query=%D9%85%D9%83%D8%A9+%D8%A7%D9%84%D9%85%D9%83%D8%B1%D9%85%D8%A9"
      fallbackTitle="خريطة المشاعر المقدسة التفاعلية"
    >
      <RitualSitesMapInner activeDayTab={activeDayTab} />
    </MapsProviderWrapper>
  );
};
