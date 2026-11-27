import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Map as GoogleMap,
  InfoWindow,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Building2,
  Car,
  Crosshair,
  ExternalLink,
  Eye,
  EyeOff,
  Footprints,
  Loader2,
  MapPin,
  Maximize2,
  Navigation,
  Route as RouteIcon,
  Tent,
} from 'lucide-react';
import type {
  CampaignSettings,
  GroupLocationCoordinate,
  HajjPackage,
  Pilgrim,
} from '../../types';
import { MapsProviderWrapper } from './MapsProviderWrapper';
import {
  AdvancedMarkerWithRef,
  GMP_ATTRIBUTION_ID,
  buildHotelSearchQuery,
  buildMinaSearchQuery,
  computeStraightDistanceMeters,
  extractLatLng,
  findAdminSavedLocationByKeywords,
  formatDistanceAr,
  formatDurationAr,
  reportMapsErrorIfQuota,
} from './mapsUtils';

type KeySiteId = 'makkah_hotel' | 'mina_camp' | 'madinah_hotel';
type RouteFilterMode = 'all' | KeySiteId;

interface ResolvedKeySite {
  id: KeySiteId;
  label: string;
  displayName: string;
  formattedAddress: string;
  location: google.maps.LatLngLiteral;
  googleMapsURI?: string;
  source: 'admin' | 'places';
  strokeColor: string;
  pinBg: string;
  pinBorder: string;
  dotClass: string;
  straightDistanceMeters: number;
}

interface PilgrimGroupMiniMapProps {
  groupLocation: GroupLocationCoordinate;
  pilgrim?: Pilgrim;
  pilgrimName?: string;
  campaignSettings?: CampaignSettings;
  pilgrimPackage?: HajjPackage | null;
}

const MiniMapInner: React.FC<PilgrimGroupMiniMapProps> = ({
  groupLocation,
  pilgrim,
  pilgrimName,
  campaignSettings,
  pilgrimPackage,
}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const coreLib = useMapsLibrary('core');
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');

  const isMadinahRegionGroup = groupLocation.lat > 23.5;

  const [keySites, setKeySites] = useState<Partial<Record<KeySiteId, ResolvedKeySite>>>({});
  const [loadingSites, setLoadingSites] = useState<boolean>(false);
  const [includeMadinahHotel, setIncludeMadinahHotel] = useState<boolean>(isMadinahRegionGroup);
  const [filterMode, setFilterMode] = useState<RouteFilterMode>('all');
  const [showPolyline, setShowPolyline] = useState<boolean>(true);

  const [selectedSiteId, setSelectedSiteId] = useState<'group' | KeySiteId | null>(null);
  const [activeMarker, setActiveMarker] =
    useState<google.maps.marker.AdvancedMarkerElement | null>(null);

  // Optional live Road Route (Routes API) when user requests exact driving/walking route
  const [roadTravelMode, setRoadTravelMode] = useState<'DRIVING' | 'WALKING'>('DRIVING');
  const [computingRoadRoute, setComputingRoadRoute] = useState<boolean>(false);
  const [roadRouteSummary, setRoadRouteSummary] = useState<{
    targetLabel: string;
    distanceMeters: number;
    durationMillis: number;
  } | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const illustrativePolylinesRef = useRef<google.maps.Polyline[]>([]);
  const roadPolylinesRef = useRef<google.maps.Polyline[]>([]);

  const center = useMemo(
    () => ({
      lat: groupLocation.lat,
      lng: groupLocation.lng,
    }),
    [groupLocation.lat, groupLocation.lng]
  );

  const clearIllustrativePolylines = useCallback(() => {
    illustrativePolylinesRef.current.forEach((poly) => poly.setMap(null));
    illustrativePolylinesRef.current = [];
  }, []);

  const clearRoadPolylines = useCallback(() => {
    roadPolylinesRef.current.forEach((poly) => poly.setMap(null));
    roadPolylinesRef.current = [];
    setRoadRouteSummary(null);
  }, []);

  useEffect(() => {
    return () => {
      clearIllustrativePolylines();
      clearRoadPolylines();
    };
  }, [clearIllustrativePolylines, clearRoadPolylines]);

  // Reset region toggle when groupLocation shifts significantly
  useEffect(() => {
    setIncludeMadinahHotel(groupLocation.lat > 23.5);
    setFilterMode('all');
    clearRoadPolylines();
    setSelectedSiteId(null);
    setActiveMarker(null);
  }, [groupLocation.groupName, groupLocation.lat, groupLocation.lng, clearRoadPolylines]);

  // Resolve key campaign/pilgrim locations (Hotels & Mina Camp) from Admin groupLocations or Google Places API (New)
  useEffect(() => {
    let active = true;
    clearRoadPolylines();

    const adminMakkahHotel = findAdminSavedLocationByKeywords(
      campaignSettings,
      groupLocation.groupName,
      ['فندق مكة المكرمة', 'فندق مكة', 'سكن مكة'],
      ['فندق مكة', 'سكن مكة', 'أبراج', 'فندق']
    );

    const adminMinaCamp = findAdminSavedLocationByKeywords(
      campaignSettings,
      groupLocation.groupName,
      [pilgrim?.roomNumberMina || '', 'مخيم منى', 'مخيم منى المطور'],
      ['منى', 'مخيم']
    );

    const adminMadinahHotel = findAdminSavedLocationByKeywords(
      campaignSettings,
      groupLocation.groupName,
      ['فندق المدينة المنورة', 'فندق المدينة', 'سكن المدينة'],
      ['المدينة', 'النبوي']
    );

    const nextImmediate: Partial<Record<KeySiteId, ResolvedKeySite>> = {};

    if (!isMadinahRegionGroup && adminMakkahHotel) {
      const loc = { lat: adminMakkahHotel.lat, lng: adminMakkahHotel.lng };
      nextImmediate.makkah_hotel = {
        id: 'makkah_hotel',
        label: 'فندق السكن (مكة المكرمة)',
        displayName: adminMakkahHotel.locationTitle || adminMakkahHotel.groupName,
        formattedAddress: pilgrim?.roomNumberMakkah || pilgrimPackage?.accommodationMakkah || 'مكة المكرمة',
        location: loc,
        source: 'admin',
        strokeColor: '#10b981',
        pinBg: '#10b981',
        pinBorder: '#065f46',
        dotClass: 'bg-emerald-500',
        straightDistanceMeters: computeStraightDistanceMeters(center, loc),
      };
    }

    if (!isMadinahRegionGroup && adminMinaCamp) {
      const loc = { lat: adminMinaCamp.lat, lng: adminMinaCamp.lng };
      nextImmediate.mina_camp = {
        id: 'mina_camp',
        label: 'مخيم منى',
        displayName: adminMinaCamp.locationTitle || adminMinaCamp.groupName,
        formattedAddress: pilgrim?.roomNumberMina || pilgrimPackage?.campMina || 'مشعر منى - مكة المكرمة',
        location: loc,
        source: 'admin',
        strokeColor: '#38bdf8',
        pinBg: '#0ea5e9',
        pinBorder: '#0369a1',
        dotClass: 'bg-sky-400',
        straightDistanceMeters: computeStraightDistanceMeters(center, loc),
      };
    }

    if (includeMadinahHotel && adminMadinahHotel) {
      const loc = { lat: adminMadinahHotel.lat, lng: adminMadinahHotel.lng };
      nextImmediate.madinah_hotel = {
        id: 'madinah_hotel',
        label: 'فندق المدينة المنورة',
        displayName: adminMadinahHotel.locationTitle || adminMadinahHotel.groupName,
        formattedAddress: pilgrim?.roomNumberMadinah || pilgrimPackage?.accommodationMadinah || 'المدينة المنورة',
        location: loc,
        source: 'admin',
        strokeColor: '#a78bfa',
        pinBg: '#8b5cf6',
        pinBorder: '#5b21b6',
        dotClass: 'bg-violet-400',
        straightDistanceMeters: computeStraightDistanceMeters(center, loc),
      };
    }

    setKeySites(nextImmediate);

    if (!placesLib) return;

    const tasks: Array<{
      id: KeySiteId;
      label: string;
      textQuery: string;
      fallbackAddress: string;
      strokeColor: string;
      pinBg: string;
      pinBorder: string;
      dotClass: string;
    }> = [];

    if (!isMadinahRegionGroup && !nextImmediate.makkah_hotel) {
      tasks.push({
        id: 'makkah_hotel',
        label: 'فندق السكن (مكة المكرمة)',
        textQuery: buildHotelSearchQuery(
          pilgrim?.roomNumberMakkah,
          pilgrimPackage?.accommodationMakkah,
          'makkah'
        ),
        fallbackAddress:
          pilgrim?.roomNumberMakkah || pilgrimPackage?.accommodationMakkah || 'مكة المكرمة',
        strokeColor: '#10b981',
        pinBg: '#10b981',
        pinBorder: '#065f46',
        dotClass: 'bg-emerald-500',
      });
    }

    if (!isMadinahRegionGroup && !nextImmediate.mina_camp) {
      tasks.push({
        id: 'mina_camp',
        label: 'مخيم منى',
        textQuery: buildMinaSearchQuery(pilgrim?.roomNumberMina, pilgrimPackage?.campMina),
        fallbackAddress:
          pilgrim?.roomNumberMina || pilgrimPackage?.campMina || 'مشعر منى، مكة المكرمة',
        strokeColor: '#38bdf8',
        pinBg: '#0ea5e9',
        pinBorder: '#0369a1',
        dotClass: 'bg-sky-400',
      });
    }

    if (includeMadinahHotel && !nextImmediate.madinah_hotel) {
      tasks.push({
        id: 'madinah_hotel',
        label: 'فندق المدينة المنورة',
        textQuery: buildHotelSearchQuery(
          pilgrim?.roomNumberMadinah,
          pilgrimPackage?.accommodationMadinah,
          'madinah'
        ),
        fallbackAddress:
          pilgrim?.roomNumberMadinah ||
          pilgrimPackage?.accommodationMadinah ||
          'المدينة المنورة',
        strokeColor: '#a78bfa',
        pinBg: '#8b5cf6',
        pinBorder: '#5b21b6',
        dotClass: 'bg-violet-400',
      });
    }

    if (tasks.length === 0) return;

    setLoadingSites(true);
    setStatusNotice(null);

    Promise.all(
      tasks.map(async (task) => {
        try {
          const { places } = await placesLib.Place.searchByText({
            textQuery: task.textQuery,
            fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI'],
            language: 'ar',
            region: 'SA',
            maxResultCount: 1,
            internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
          });
          const place = places?.[0];
          const coords = extractLatLng(place?.location);
          if (!place || !coords) return null;

          const item: ResolvedKeySite = {
            id: task.id,
            label: task.label,
            displayName: place.displayName || task.label,
            formattedAddress: place.formattedAddress || task.fallbackAddress,
            location: coords,
            googleMapsURI: place.googleMapsURI || undefined,
            source: 'places',
            strokeColor: task.strokeColor,
            pinBg: task.pinBg,
            pinBorder: task.pinBorder,
            dotClass: task.dotClass,
            straightDistanceMeters: computeStraightDistanceMeters(center, coords),
          };
          return item;
        } catch (err) {
          reportMapsErrorIfQuota(err);
          return null;
        }
      })
    )
      .then((results) => {
        if (!active) return;
        setKeySites((prev) => {
          const updated = { ...prev };
          results.forEach((res) => {
            if (res) {
              updated[res.id] = res;
            }
          });
          return updated;
        });
      })
      .finally(() => {
        if (active) setLoadingSites(false);
      });

    return () => {
      active = false;
    };
  }, [
    placesLib,
    center,
    groupLocation.groupName,
    pilgrim?.roomNumberMakkah,
    pilgrim?.roomNumberMadinah,
    pilgrim?.roomNumberMina,
    pilgrimPackage?.accommodationMakkah,
    pilgrimPackage?.accommodationMadinah,
    pilgrimPackage?.campMina,
    campaignSettings,
    includeMadinahHotel,
    isMadinahRegionGroup,
    clearRoadPolylines,
  ]);

  const visibleKeySites = useMemo(() => {
    const orderedIds: KeySiteId[] = ['makkah_hotel', 'mina_camp', 'madinah_hotel'];
    return orderedIds
      .filter((id) => {
        if (id === 'madinah_hotel' && !includeMadinahHotel) return false;
        if (filterMode !== 'all' && filterMode !== id) return false;
        return Boolean(keySites[id]);
      })
      .map((id) => keySites[id]!);
  }, [keySites, includeMadinahHotel, filterMode]);

  const fitFullRouteBounds = useCallback(() => {
    if (!map || !coreLib) return;
    if (visibleKeySites.length === 0) {
      map.panTo(center);
      map.setZoom(16);
      return;
    }
    const bounds = new coreLib.LatLngBounds();
    bounds.extend(center);
    visibleKeySites.forEach((site) => bounds.extend(site.location));
    map.fitBounds(bounds, { top: 44, right: 44, bottom: 44, left: 44 });
  }, [map, coreLib, center, visibleKeySites]);

  // Draw illustrative Polyline paths between the group's meeting point and key locations
  useEffect(() => {
    clearIllustrativePolylines();
    if (!map || !mapsLib || !coreLib || !showPolyline || visibleKeySites.length === 0) {
      return;
    }

    const created: google.maps.Polyline[] = visibleKeySites.map((site) => {
      const arrowSymbol: google.maps.Symbol = {
        path: coreLib.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 3,
        strokeColor: '#ffffff',
        strokeWeight: 1,
        fillColor: site.strokeColor,
        fillOpacity: 1,
      };

      const dashSymbol: google.maps.Symbol = {
        path: 'M 0,-1 0,1',
        strokeOpacity: 0.95,
        strokeColor: site.strokeColor,
        scale: 3,
      };

      const polyline = new mapsLib.Polyline({
        path: [center, site.location],
        geodesic: true,
        strokeColor: site.strokeColor,
        strokeOpacity: 0,
        strokeWeight: 3,
        icons: [
          {
            icon: dashSymbol,
            offset: '0',
            repeat: '14px',
          },
          {
            icon: arrowSymbol,
            offset: '52%',
          },
          {
            icon: arrowSymbol,
            offset: '96%',
          },
        ],
        zIndex: filterMode === site.id ? 60 : 40,
      });

      polyline.setMap(map);
      return polyline;
    });

    illustrativePolylinesRef.current = created;

    return () => {
      created.forEach((p) => p.setMap(null));
    };
  }, [map, mapsLib, coreLib, center, visibleKeySites, showPolyline, filterMode, clearIllustrativePolylines]);

  // Auto-frame the illustrative route when sites resolve or filter changes
  useEffect(() => {
    if (!map) return;
    if (visibleKeySites.length > 0 && coreLib) {
      fitFullRouteBounds();
    } else {
      map.panTo(center);
      map.setZoom(16);
    }
  }, [map, coreLib, center, visibleKeySites, fitFullRouteBounds]);

  const handleRecenterGroup = () => {
    if (!map) return;
    map.panTo(center);
    map.setZoom(16);
  };

  const handleComputeRoadRoute = async (
    targetSite: ResolvedKeySite,
    mode: 'DRIVING' | 'WALKING' = roadTravelMode
  ) => {
    if (!routesLib || !map) return;
    clearRoadPolylines();
    setComputingRoadRoute(true);
    setStatusNotice(null);
    setRoadTravelMode(mode);

    try {
      const response = await routesLib.Route.computeRoutes({
        origin: center,
        destination: targetSite.location,
        travelMode: mode,
        fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
        language: 'ar',
        internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
      });

      const primaryRoute = response.routes?.[0];
      if (!primaryRoute) {
        setStatusNotice(`تعذر حساب مسار الطرق إلى ${targetSite.label} بهذه الوسيلة.`);
        return;
      }

      const polylines = primaryRoute.createPolylines({
        polylineOptions: {
          strokeColor: mode === 'WALKING' ? '#22c55e' : '#f59e0b',
          strokeWeight: 5,
          strokeOpacity: 0.92,
          zIndex: 80,
        },
      });
      polylines.forEach((p) => p.setMap(map));
      roadPolylinesRef.current = polylines;

      if (primaryRoute.viewport) {
        map.fitBounds(primaryRoute.viewport);
      }

      setRoadRouteSummary({
        targetLabel: targetSite.label,
        distanceMeters: primaryRoute.distanceMeters ?? 0,
        durationMillis: primaryRoute.durationMillis ?? 0,
      });
    } catch (err) {
      const isQuota = reportMapsErrorIfQuota(err);
      setStatusNotice(
        isQuota
          ? 'تم بلوغ الحد المؤقت لخدمة المسارات، ويظل المسار التوضيحي ظاهراً على الخريطة.'
          : 'تعذر حساب مسار الطرق الفعلي حالياً؛ تم الإبقاء على المسار التوضيحي.'
      );
    } finally {
      setComputingRoadRoute(false);
    }
  };

  const externalMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${groupLocation.lat},${groupLocation.lng}`
  )}`;

  const activeInfoSite =
    selectedSiteId && selectedSiteId !== 'group' ? keySites[selectedSiteId] : null;

  const allAvailableTargets = useMemo(() => {
    const items: ResolvedKeySite[] = [];
    if (keySites.makkah_hotel) items.push(keySites.makkah_hotel);
    if (keySites.mina_camp) items.push(keySites.mina_camp);
    if (includeMadinahHotel && keySites.madinah_hotel) items.push(keySites.madinah_hotel);
    return items;
  }, [keySites, includeMadinahHotel]);

  return (
    <div className="bg-white dark:bg-[#090F1E] border border-slate-200 dark:border-amber-500/35 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-sm dark:shadow-lg">
      {/* Header & Camera Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start gap-2.5 text-right">
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/35 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-black text-amber-700 dark:text-amber-400">
                خريطة الفوج ومسارات الوصول ({groupLocation.groupName})
              </h4>
              {groupLocation.locationTitle && (
                <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                  {groupLocation.locationTitle}
                </span>
              )}
              {loadingSites && (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 font-bold">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>جاري ربط الفنادق ومخيم منى...</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              مسار توضيحي (Polyline) يربط نقطة تجمع الفوج بالفنادق ومخيم منى لتسهيل الوصول والتنقل
              {groupLocation.updatedAt
                ? ` • آخر تحديث: ${new Date(groupLocation.updatedAt).toLocaleString('ar-SA')}`
                : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowPolyline((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 border font-bold px-2.5 py-1.5 rounded-xl text-[11px] transition cursor-pointer ${
              showPolyline
                ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/25'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {showPolyline ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{showPolyline ? 'المسار ظاهر' : 'إظهار المسار'}</span>
          </button>

          <button
            type="button"
            onClick={fitFullRouteBounds}
            className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold px-2.5 py-1.5 rounded-xl text-[11px] transition cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>كامل المسار</span>
          </button>

          <button
            type="button"
            onClick={handleRecenterGroup}
            className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold px-2.5 py-1.5 rounded-xl text-[11px] transition cursor-pointer"
          >
            <Crosshair className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>توسيط الفوج</span>
          </button>

          <a
            href={externalMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-3 py-1.5 rounded-xl text-[11px] transition shadow"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>خرائط قوقل</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Filter & Route Mode Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setFilterMode('all');
              clearRoadPolylines();
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
              filterMode === 'all'
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                : 'bg-white dark:bg-[#090F1E] border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-amber-400 dark:hover:border-amber-500/40'
            }`}
          >
            كل المواقع الرئيسية
          </button>

          {!isMadinahRegionGroup && (
            <>
              <button
                type="button"
                onClick={() => {
                  setFilterMode('makkah_hotel');
                  clearRoadPolylines();
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                  filterMode === 'makkah_hotel'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                    : 'bg-white dark:bg-[#090F1E] border-slate-300 dark:border-slate-700 text-emerald-700 dark:text-emerald-300 hover:border-emerald-400 dark:hover:border-emerald-500/40'
                }`}
              >
                <Building2 className="w-3 h-3" />
                <span>فندق مكة</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFilterMode('mina_camp');
                  clearRoadPolylines();
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                  filterMode === 'mina_camp'
                    ? 'bg-sky-500 text-slate-950 border-sky-400 font-black'
                    : 'bg-white dark:bg-[#090F1E] border-slate-300 dark:border-slate-700 text-sky-700 dark:text-sky-300 hover:border-sky-400 dark:hover:border-sky-500/40'
                }`}
              >
                <Tent className="w-3 h-3" />
                <span>مخيم منى</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              const nextInclude = !includeMadinahHotel;
              setIncludeMadinahHotel(nextInclude);
              if (nextInclude) {
                setFilterMode('madinah_hotel');
              } else if (filterMode === 'madinah_hotel') {
                setFilterMode('all');
              }
              clearRoadPolylines();
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
              includeMadinahHotel && filterMode === 'madinah_hotel'
                ? 'bg-violet-500 text-white border-violet-400 font-black'
                : includeMadinahHotel
                ? 'bg-violet-50 dark:bg-violet-500/20 border-violet-300 dark:border-violet-500/40 text-violet-700 dark:text-violet-300'
                : 'bg-white dark:bg-[#090F1E] border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-violet-400 dark:hover:border-violet-500/40'
            }`}
          >
            <Building2 className="w-3 h-3" />
            <span>{includeMadinahHotel ? 'فندق المدينة ✓' : '+ مسار فندق المدينة'}</span>
          </button>
        </div>

        {/* Optional Road Route Action for Currently Filtered Single Destination */}
        {filterMode !== 'all' && keySites[filterMode] && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleComputeRoadRoute(keySites[filterMode]!, 'DRIVING')}
              disabled={computingRoadRoute}
              className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 dark:hover:bg-amber-500/25 border border-amber-300 dark:border-amber-500/35 text-amber-800 dark:text-amber-300 font-bold px-2.5 py-1 rounded-lg text-[11px] transition cursor-pointer disabled:opacity-50"
            >
              {computingRoadRoute && roadTravelMode === 'DRIVING' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Car className="w-3 h-3" />
              )}
              <span>مسار الطريق</span>
            </button>
            <button
              type="button"
              onClick={() => handleComputeRoadRoute(keySites[filterMode]!, 'WALKING')}
              disabled={computingRoadRoute}
              className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 border border-emerald-300 dark:border-emerald-500/35 text-emerald-700 dark:text-emerald-300 font-bold px-2.5 py-1 rounded-lg text-[11px] transition cursor-pointer disabled:opacity-50"
            >
              {computingRoadRoute && roadTravelMode === 'WALKING' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Footprints className="w-3 h-3" />
              )}
              <span>مسار المشاة</span>
            </button>
          </div>
        )}
      </div>

      {roadRouteSummary && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl px-3.5 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-200">
          <div className="flex flex-wrap items-center gap-2">
            <RouteIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              المسار الفعلي من نقطة الفوج إلى {roadRouteSummary.targetLabel}:
            </span>
            <span className="text-slate-900 dark:text-white">{formatDistanceAr(roadRouteSummary.distanceMeters)}</span>
            <span className="text-emerald-500/60">|</span>
            <span className="text-slate-900 dark:text-white">
              ({roadTravelMode === 'WALKING' ? 'مشياً' : 'بالحافلة/السيارة'}):{' '}
              {formatDurationAr(roadRouteSummary.durationMillis)}
            </span>
          </div>
          <button
            type="button"
            onClick={clearRoadPolylines}
            className="text-[11px] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white underline cursor-pointer"
          >
            إزالة مسار الطريق
          </button>
        </div>
      )}

      {statusNotice && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium px-1">{statusNotice}</p>
      )}

      {/* Explicit CSS height required by Google Maps JS SDK (CF2) */}
      <div className="w-full h-[260px] sm:h-[310px] rounded-xl overflow-hidden border border-slate-200 dark:border-amber-500/30 bg-slate-100 dark:bg-[#070C18]">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={center}
          defaultZoom={16}
          gestureHandling="cooperative"
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={true}
          internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
          className="w-full h-full"
          style={{ width: '100%', height: '100%' }}
          onClick={() => {
            setSelectedSiteId(null);
            setActiveMarker(null);
          }}
        >
          {/* 1. Group Meeting Point Origin Marker */}
          <AdvancedMarkerWithRef
            position={center}
            title={`نقطة تجمع ${groupLocation.groupName}`}
            zIndex={120}
            onMarkerClick={(marker) => {
              setActiveMarker(marker);
              setSelectedSiteId('group');
            }}
          >
            <Pin
              background="#f59e0b"
              borderColor="#78350f"
              glyphColor="#0B1221"
            />
          </AdvancedMarkerWithRef>

          {/* 2. Key Campaign / Pilgrim Destinations Markers */}
          {visibleKeySites.map((site) => (
            <AdvancedMarkerWithRef
              key={site.id}
              position={site.location}
              title={site.displayName}
              zIndex={90}
              onMarkerClick={(marker) => {
                setActiveMarker(marker);
                setSelectedSiteId(site.id);
              }}
            >
              <Pin
                background={site.pinBg}
                borderColor={site.pinBorder}
                glyphColor="#ffffff"
              />
            </AdvancedMarkerWithRef>
          ))}

          {/* 3. InfoWindow for Clicked Marker */}
          {selectedSiteId && activeMarker && (
            <InfoWindow
              anchor={activeMarker}
              pixelOffset={[0, -6]}
              onCloseClick={() => {
                setSelectedSiteId(null);
                setActiveMarker(null);
              }}
            >
              {selectedSiteId === 'group' ? (
                <div dir="rtl" className="text-right text-slate-900 p-1 max-w-[230px] space-y-1">
                  <p className="text-[11px] font-black text-amber-700">
                    نقطة تجمع الفوج — {groupLocation.groupName}
                  </p>
                  {groupLocation.locationTitle && (
                    <p className="text-xs font-bold text-slate-800">
                      {groupLocation.locationTitle}
                    </p>
                  )}
                  {pilgrimName && (
                    <p className="text-[11px] text-slate-600">الحاج: {pilgrimName}</p>
                  )}
                  <p className="text-[10px] font-mono text-slate-500" dir="ltr">
                    {groupLocation.lat.toFixed(5)}, {groupLocation.lng.toFixed(5)}
                  </p>
                </div>
              ) : activeInfoSite ? (
                <div dir="rtl" className="text-right text-slate-900 p-1 max-w-[240px] space-y-1.5">
                  <p className="text-[11px] font-black text-emerald-700">
                    {activeInfoSite.label}
                  </p>
                  <p className="text-xs font-bold text-slate-900">
                    {activeInfoSite.displayName}
                  </p>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    {activeInfoSite.formattedAddress}
                  </p>
                  <p className="text-[11px] font-bold text-amber-700">
                    البُعد التوضيحي عن الفوج: {formatDistanceAr(activeInfoSite.straightDistanceMeters)}
                  </p>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${groupLocation.lat},${groupLocation.lng}&destination=${activeInfoSite.location.lat},${activeInfoSite.location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:underline"
                  >
                    <span>فتح الاتجاهات من الفوج إلى الموقع</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : null}
            </InfoWindow>
          )}
        </GoogleMap>
      </div>

      {/* Connected Stops & Polyline Legend Cards */}
      {allAvailableTargets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-0.5">
          {/* Group Origin Summary */}
          <button
            type="button"
            onClick={handleRecenterGroup}
            className="text-right bg-amber-50/70 dark:bg-[#070C18] hover:bg-amber-100/70 dark:hover:bg-slate-900 border border-amber-300 dark:border-amber-500/35 rounded-xl p-2.5 transition flex items-start gap-2 cursor-pointer"
          >
            <span className="w-3 h-3 rounded-full bg-amber-500 dark:bg-amber-400 ring-2 ring-amber-500/30 mt-1 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-black text-amber-800 dark:text-amber-400 truncate">
                نقطة تجمع الفوج (الأصل)
              </p>
              <p className="text-[11px] text-slate-800 dark:text-slate-200 font-bold truncate">
                {groupLocation.locationTitle || groupLocation.groupName}
              </p>
            </div>
          </button>

          {/* Key Connected Targets */}
          {allAvailableTargets.map((site) => {
            const isActiveFilter = filterMode === site.id;
            const directionsHref = `https://www.google.com/maps/dir/?api=1&origin=${groupLocation.lat},${groupLocation.lng}&destination=${site.location.lat},${site.location.lng}`;
            return (
              <div
                key={site.id}
                className={`bg-slate-50 dark:bg-[#070C18] border rounded-xl p-2.5 transition flex items-start justify-between gap-2 ${
                  isActiveFilter ? 'border-amber-500 dark:border-amber-400/70' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode(site.id);
                    if (map) {
                      map.panTo(site.location);
                      map.setZoom(14);
                    }
                  }}
                  className="text-right flex items-start gap-2 min-w-0 flex-1 cursor-pointer"
                >
                  <span className={`w-3 h-3 rounded-full mt-1 shrink-0 ${site.dotClass}`} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-900 dark:text-slate-100 truncate">
                      {site.label}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {site.displayName} • ~{formatDistanceAr(site.straightDistanceMeters)}
                    </p>
                  </div>
                </button>
                <a
                  href={directionsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`الاتجاهات إلى ${site.label}`}
                  className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-amber-700 dark:text-amber-400 transition shrink-0"
                >
                  <Navigation className="w-3.5 h-3.5" />
                </a>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 px-0.5">
        <span>الخطوط المتقطعة ذات الأسهم تمثل مساراً توضيحياً يربط الفوج بالفندق ومخيم منى — اضغط على أي دبوس للتفاصيل</span>
        <span className="font-mono" dir="ltr">
          {groupLocation.lat.toFixed(5)}, {groupLocation.lng.toFixed(5)}
        </span>
      </div>
    </div>
  );
};

export const PilgrimGroupMiniMap: React.FC<PilgrimGroupMiniMapProps> = (props) => {
  const { groupLocation } = props;
  const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${groupLocation.lat},${groupLocation.lng}`
  )}`;

  return (
    <MapsProviderWrapper
      fallbackMapsUrl={fallbackUrl}
      fallbackTitle={`الموقع الحالي لمجموعة ${groupLocation.groupName}`}
    >
      <MiniMapInner {...props} />
    </MapsProviderWrapper>
  );
};
