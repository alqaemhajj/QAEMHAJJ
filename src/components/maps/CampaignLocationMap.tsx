import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Map as GoogleMap,
  InfoWindow,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Navigation,
  Search,
  Loader2,
  ExternalLink,
  Car,
  X,
  Compass,
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

interface CampaignLocationMapProps {
  campaignAddress: string;
}

interface AutocompleteItem {
  id: string;
  mainText: string;
  secondaryText: string;
  prediction: google.maps.places.PlacePrediction;
}

const CampaignLocationMapInner: React.FC<CampaignLocationMapProps> = ({ campaignAddress }) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');

  const [hqPlace, setHqPlace] = useState<ResolvedPlaceItem | null>(null);
  const [originPlace, setOriginPlace] = useState<ResolvedPlaceItem | null>(null);
  const [selectedMarkerKind, setSelectedMarkerKind] = useState<'hq' | 'origin' | null>(null);
  const [activeMarkerEl, setActiveMarkerEl] = useState<google.maps.marker.AdvancedMarkerElement | null>(null);

  const [loadingHq, setLoadingHq] = useState<boolean>(true);
  const [hqLookupNotice, setHqLookupNotice] = useState<string | null>(null);

  const [originQuery, setOriginQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState<boolean>(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const [computingRoute, setComputingRoute] = useState<boolean>(false);
  const [routeSummary, setRouteSummary] = useState<{
    distanceMeters: number;
    durationMillis: number;
  } | null>(null);
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  const clearPolylines = useCallback(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearPolylines();
    };
  }, [clearPolylines]);

  // Resolve Campaign HQ using Google Places API (New) Text Search
  useEffect(() => {
    if (!placesLib) return;
    let active = true;

    const cleanAddr = (campaignAddress || '').trim();
    const queryText = cleanAddr
      ? `${cleanAddr} قافلة القائم`
      : 'المبرز الأحساء المنطقة الشرقية السعودية';

    setLoadingHq(true);
    setHqLookupNotice(null);

    const resolveHq = async () => {
      try {
        let result = await placesLib.Place.searchByText({
          textQuery: queryText,
          fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI'],
          language: 'ar',
          region: 'SA',
          maxResultCount: 1,
          internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
        });

        if ((!result.places || result.places.length === 0) && cleanAddr) {
          result = await placesLib.Place.searchByText({
            textQuery: cleanAddr,
            fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI'],
            language: 'ar',
            region: 'SA',
            maxResultCount: 1,
            internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
          });
        }

        if (!active) return;

        const firstPlace = result.places?.[0];
        const coords = extractLatLng(firstPlace?.location);
        if (firstPlace && coords) {
          const resolved: ResolvedPlaceItem = {
            id: firstPlace.id || 'campaign-hq',
            label: 'مقر قافلة القائم الرئيسي',
            displayName: firstPlace.displayName || 'مقر قافلة القائم للحج والعمرة',
            formattedAddress: firstPlace.formattedAddress || cleanAddr,
            location: coords,
            googleMapsURI: firstPlace.googleMapsURI || undefined,
          };
          setHqPlace(resolved);
          if (map) {
            map.panTo(coords);
            map.setZoom(13);
          }
        } else {
          setHqLookupNotice('لم يتم العثور على إحداثيات مطابقة لعنوان المقر. يمكنك استخدام البحث أعلاه أو رابط خرائط قوقل.');
        }
      } catch (err) {
        if (!active) return;
        const isQuota = reportMapsErrorIfQuota(err);
        if (!isQuota) {
          setHqLookupNotice('تعذر تحديد موقع المقر تلقائياً حالياً.');
        }
      } finally {
        if (active) setLoadingHq(false);
      }
    };

    resolveHq();
    return () => {
      active = false;
    };
  }, [placesLib, campaignAddress, map]);

  // Recenter map once map instance becomes available after HQ resolved
  useEffect(() => {
    if (map && hqPlace && !originPlace) {
      map.panTo(hqPlace.location);
      map.setZoom(13);
    }
  }, [map, hqPlace, originPlace]);

  // Autocomplete Suggestions for visitor starting location with session tokens
  useEffect(() => {
    if (!placesLib) return;
    const trimmed = originQuery.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
        }
        const { suggestions: rawSuggestions } =
          await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: trimmed,
            sessionToken: sessionTokenRef.current,
            language: 'ar',
            region: 'SA',
            includedRegionCodes: ['sa'],
          });

        const parsed: AutocompleteItem[] = (rawSuggestions || [])
          .filter((s) => Boolean(s.placePrediction))
          .slice(0, 5)
          .map((s) => {
            const pred = s.placePrediction!;
            return {
              id: pred.placeId,
              mainText: pred.mainText?.text || pred.text?.text || '',
              secondaryText: pred.secondaryText?.text || '',
              prediction: pred,
            };
          });
        setSuggestions(parsed);
      } catch (err) {
        reportMapsErrorIfQuota(err);
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [originQuery, placesLib]);

  const computeDrivingRoute = useCallback(
    async (fromLocation: google.maps.LatLngLiteral, toLocation: google.maps.LatLngLiteral) => {
      if (!routesLib || !map) return;
      clearPolylines();
      setComputingRoute(true);
      setRouteNotice(null);
      setRouteSummary(null);

      try {
        const response = await routesLib.Route.computeRoutes({
          origin: fromLocation,
          destination: toLocation,
          travelMode: 'DRIVING',
          fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
          language: 'ar',
          internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
        });

        const primaryRoute = response.routes?.[0];
        if (!primaryRoute) {
          setRouteNotice('لم يتوفر مسار قيادة مباشر بين النقطتين.');
          return;
        }

        const newPolylines = primaryRoute.createPolylines({
          polylineOptions: {
            strokeColor: '#f59e0b',
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
        });
      } catch (err) {
        const isQuota = reportMapsErrorIfQuota(err);
        setRouteNotice(
          isQuota
            ? 'تم بلوغ الحد المؤقت لخدمة المسارات حالياً.'
            : 'تعذر حساب مسار القيادة في الوقت الحالي.'
        );
      } finally {
        setComputingRoute(false);
      }
    },
    [routesLib, map, clearPolylines]
  );

  const handleSelectPrediction = async (item: AutocompleteItem) => {
    if (!hqPlace) return;
    setSuggestions([]);
    setOriginQuery(item.mainText);
    try {
      const place = item.prediction.toPlace();
      await place.fetchFields({
        fields: ['id', 'displayName', 'formattedAddress', 'location'],
      });
      // End autocomplete billing session after fetchFields completes
      sessionTokenRef.current = null;
      const coords = extractLatLng(place.location);
      if (!coords) {
        setRouteNotice('تعذر قراءة إحداثيات نقطة الانطلاق المختارة.');
        return;
      }
      const resolvedOrigin: ResolvedPlaceItem = {
        id: place.id || item.id,
        label: 'نقطة الانطلاق المختارة',
        displayName: place.displayName || item.mainText,
        formattedAddress: place.formattedAddress || item.secondaryText,
        location: coords,
      };
      setOriginPlace(resolvedOrigin);
      await computeDrivingRoute(coords, hqPlace.location);
    } catch (err) {
      sessionTokenRef.current = null;
      reportMapsErrorIfQuota(err);
      setRouteNotice('تعذر جلب تفاصيل نقطة الانطلاق.');
    }
  };

  // Explicit user-triggered geolocation with user consent
  const handleUseMyLocation = () => {
    if (!hqPlace) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setRouteNotice('متصفحك لا يدعم تحديد الموقع الجغرافي.');
      return;
    }
    setRouteNotice(null);
    setComputingRoute(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords: google.maps.LatLngLiteral = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        const resolvedOrigin: ResolvedPlaceItem = {
          id: 'user-current-location',
          label: 'موقعي الحالي',
          displayName: 'موقعك الحالي',
          formattedAddress: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
          location: coords,
        };
        setOriginPlace(resolvedOrigin);
        setOriginQuery('موقعي الحالي');
        await computeDrivingRoute(coords, hqPlace.location);
      },
      () => {
        setComputingRoute(false);
        setRouteNotice('يرجى السماح بصلاحية الموقع في المتصفح أو كتابة اسم مدينتك في حقل البحث.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleClearRoute = () => {
    clearPolylines();
    setOriginPlace(null);
    setOriginQuery('');
    setRouteSummary(null);
    setRouteNotice(null);
    if (selectedMarkerKind === 'origin') {
      setSelectedMarkerKind(null);
      setActiveMarkerEl(null);
    }
    if (map && hqPlace) {
      map.panTo(hqPlace.location);
      map.setZoom(13);
    }
  };

  const externalDirectionsUrl = hqPlace?.googleMapsURI
    ? hqPlace.googleMapsURI
    : hqPlace
    ? `https://www.google.com/maps/dir/?api=1&destination=${hqPlace.location.lat},${hqPlace.location.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        campaignAddress || 'الأحساء المبرز السعودية'
      )}`;

  return (
    <div className="space-y-4">
      {/* Route & Origin Controls */}
      <div className="bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-amber-600 dark:text-amber-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={originQuery}
              onChange={(e) => setOriginQuery(e.target.value)}
              placeholder="اكتب مدينتك أو حيك لحساب المسافة والمسار إلى مقر القافلة..."
              className="w-full bg-white dark:bg-[#0B1221] border border-slate-300 dark:border-slate-700 focus:border-amber-500 rounded-xl pr-10 pl-10 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition"
            />
            {originQuery && (
              <button
                type="button"
                onClick={handleClearRoute}
                aria-label="مسح المسار"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {suggestions.length > 0 && (
              <div className="absolute right-0 left-0 top-full mt-1.5 z-30 bg-white dark:bg-[#0B1221] border border-amber-300 dark:border-amber-500/40 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-200 dark:divide-slate-800">
                {suggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectPrediction(item)}
                    className="w-full text-right px-4 py-2.5 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition flex items-start gap-2.5 cursor-pointer"
                  >
                    <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{item.mainText}</p>
                      {item.secondaryText && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{item.secondaryText}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={!hqPlace || computingRoute}
              className="inline-flex items-center justify-center gap-2 bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
            >
              {computingRoute ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Navigation className="w-4 h-4" />
              )}
              <span>انطلاق من موقعي الحالي</span>
            </button>

            <a
              href={externalDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs transition shadow"
            >
              <ExternalLink className="w-4 h-4" />
              <span>فتح في خرائط قوقل</span>
            </a>
          </div>
        </div>

        {(loadingSuggestions || hqLookupNotice || routeNotice || routeSummary) && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
            {loadingSuggestions && (
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 dark:text-amber-400" />
                <span>جاري البحث عن المواقع...</span>
              </span>
            )}
            {routeSummary && (
              <div className="flex flex-wrap items-center gap-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-xl px-3.5 py-2 text-amber-900 dark:text-amber-200 font-bold">
                <Car className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>المسافة بالسيارة: {formatDistanceAr(routeSummary.distanceMeters)}</span>
                <span className="text-amber-500/60">|</span>
                <span>الوقت التقديري: {formatDurationAr(routeSummary.durationMillis)}</span>
              </div>
            )}
            {(routeNotice || hqLookupNotice) && (
              <p className="text-amber-700 dark:text-amber-300 font-medium">{routeNotice || hqLookupNotice}</p>
            )}
          </div>
        )}
      </div>

      {/* Map Container with explicit non-zero CSS height (CF2) */}
      <div className="relative w-full h-[360px] sm:h-[420px] rounded-2xl overflow-hidden border border-slate-200 dark:border-amber-500/30 bg-slate-100 dark:bg-[#070C18] shadow-inner">
        {loadingHq && (
          <div className="absolute top-3 right-3 z-10 bg-white/95 dark:bg-[#0B1221]/90 border border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>جاري تحديد موقع المقر...</span>
          </div>
        )}

        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={REGIONAL_INITIAL_CAMERA.center}
          defaultZoom={REGIONAL_INITIAL_CAMERA.zoom}
          gestureHandling="greedy"
          streetViewControl={false}
          mapTypeControl={false}
          internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
          className="w-full h-full"
          style={{ width: '100%', height: '100%' }}
          onClick={() => {
            setSelectedMarkerKind(null);
            setActiveMarkerEl(null);
          }}
        >
          {hqPlace && (
            <AdvancedMarkerWithRef
              position={hqPlace.location}
              title={hqPlace.displayName}
              onMarkerClick={(marker) => {
                setSelectedMarkerKind('hq');
                setActiveMarkerEl(marker);
              }}
            >
              <Pin
                background="#f59e0b"
                borderColor="#78350f"
                glyphColor="#0B1221"
              />
            </AdvancedMarkerWithRef>
          )}

          {originPlace && (
            <AdvancedMarkerWithRef
              position={originPlace.location}
              title={originPlace.displayName}
              onMarkerClick={(marker) => {
                setSelectedMarkerKind('origin');
                setActiveMarkerEl(marker);
              }}
            >
              <Pin
                background="#10b981"
                borderColor="#065f46"
                glyphColor="#ffffff"
              />
            </AdvancedMarkerWithRef>
          )}

          {selectedMarkerKind && activeMarkerEl && (
            <InfoWindow
              anchor={activeMarkerEl}
              pixelOffset={[0, -8]}
              onCloseClick={() => {
                setSelectedMarkerKind(null);
                setActiveMarkerEl(null);
              }}
            >
              <div dir="rtl" className="text-right text-slate-900 p-1 max-w-[230px] space-y-1">
                <p className="text-xs font-black text-amber-700">
                  {selectedMarkerKind === 'hq' ? hqPlace?.label : originPlace?.label}
                </p>
                <p className="text-sm font-bold">
                  {selectedMarkerKind === 'hq' ? hqPlace?.displayName : originPlace?.displayName}
                </p>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {selectedMarkerKind === 'hq'
                    ? hqPlace?.formattedAddress
                    : originPlace?.formattedAddress}
                </p>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>

      {hqPlace && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 px-1">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>الموقع المعتمد: {hqPlace.formattedAddress || campaignAddress}</span>
          </div>
          <span className="font-mono text-[11px] text-slate-500" dir="ltr">
            {hqPlace.location.lat.toFixed(5)}, {hqPlace.location.lng.toFixed(5)}
          </span>
        </div>
      )}
    </div>
  );
};

export const CampaignLocationMap: React.FC<CampaignLocationMapProps> = ({ campaignAddress }) => {
  const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    campaignAddress || 'الأحساء المبرز السعودية'
  )}`;

  return (
    <MapsProviderWrapper
      fallbackMapsUrl={fallbackUrl}
      fallbackTitle="عرض موقع مقر قافلة القائم على الخريطة"
    >
      <CampaignLocationMapInner campaignAddress={campaignAddress} />
    </MapsProviderWrapper>
  );
};
