import React, { useEffect, useState } from 'react';
import {
  AdvancedMarker,
  AdvancedMarkerProps,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import type { CampaignSettings, GroupLocationCoordinate, Pilgrim } from '../../types';
import { fetchWithTimeout } from '../../utils/safeFetch';

export const GMP_ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

// Broad regional view of Saudi Arabia used strictly before Places API (New) resolves live locations
export const REGIONAL_INITIAL_CAMERA = {
  center: { lat: 23.8859, lng: 45.0792 },
  zoom: 5,
};

export function isValidCoordinatePair(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Resolves the assigned group's GPS coordinates set by the admin in campaignSettings.groupLocations.
 * Checks busNumber, flightNumberOutbound, flight group, and Mina camp assignment in priority order.
 */
export function resolvePilgrimGroupLocation(
  pilgrim: Pilgrim | null | undefined,
  campaignSettings?: CampaignSettings | null
): GroupLocationCoordinate | null {
  if (!pilgrim || !campaignSettings?.groupLocations) return null;
  const mapEntries = campaignSettings.groupLocations;
  const keys = Object.keys(mapEntries);
  if (keys.length === 0) return null;

  const isAirPilgrim =
    (pilgrim.selectedPackage || '').includes('طيران') ||
    pilgrim.transport === 'طائرة' ||
    Boolean((pilgrim.flightNumberOutbound || '').trim());

  const candidateKeys = [
    !isAirPilgrim ? pilgrim.busNumber : '',
    isAirPilgrim ? pilgrim.flightNumberOutbound : '',
    isAirPilgrim ? 'رحلات الطيران' : '',
    pilgrim.busNumber,
    pilgrim.flightNumberOutbound,
    pilgrim.roomNumberMina,
  ]
    .map((k) => (k || '').trim())
    .filter(Boolean);

  for (const candidate of candidateKeys) {
    const direct = mapEntries[candidate];
    if (direct && isValidCoordinatePair(direct.lat, direct.lng)) {
      return direct;
    }
    const normalizedCandidate = candidate.toLowerCase();
    const fuzzyKey = keys.find(
      (k) =>
        k.trim().toLowerCase() === normalizedCandidate ||
        (mapEntries[k]?.groupName || '').trim().toLowerCase() === normalizedCandidate
    );
    if (fuzzyKey) {
      const matched = mapEntries[fuzzyKey];
      if (matched && isValidCoordinatePair(matched.lat, matched.lng)) {
        return matched;
      }
    }
  }

  return null;
}

function cleanAccommodationLabel(raw?: string): string {
  if (!raw) return '';
  let text = raw.trim();
  if (!text || text.includes('قيد التخصيص') || text.includes('غير محدد') || text.includes('لايوجد')) {
    return '';
  }
  // Strip room prefixes like "غرفة 102 - فندق أنوار المدينة" or "جناح 5 / ..."
  text = text.replace(/^(غرفة|غرفه|جناح|دور|مبنى|خيمة|مخيم رقم)\s*[\dA-Za-z\u0660-\u0669]+\s*[-–/|،]?\s*/i, '').trim();
  // Strip trailing parenthetical meal/duration notes
  text = text.replace(/\([^)]*\)/g, '').trim();
  return text;
}

export function buildHotelSearchQuery(
  roomText?: string,
  packageAccommodation?: string,
  city: 'makkah' | 'madinah' = 'makkah'
): string {
  const fromRoom = cleanAccommodationLabel(roomText);
  const fromPkg = cleanAccommodationLabel(packageAccommodation);
  const chosen = fromRoom || fromPkg;
  const citySuffix = city === 'madinah' ? 'المدينة المنورة السعودية' : 'مكة المكرمة السعودية';

  if (chosen && chosen.length >= 4 && !chosen.startsWith('فندق 4') && !chosen.startsWith('فندق خمس') && !chosen.startsWith('فندق قريب') && !chosen.startsWith('فندق أرقى')) {
    return `${chosen} ${citySuffix}`;
  }

  return city === 'madinah'
    ? 'فنادق المسجد النبوي المدينة المنورة السعودية'
    : 'أبراج البيت المسجد الحرام مكة المكرمة السعودية';
}

export function buildMinaSearchQuery(
  roomMina?: string,
  packageCampMina?: string
): string {
  const fromRoom = cleanAccommodationLabel(roomMina);
  const fromPkg = cleanAccommodationLabel(packageCampMina);
  const chosen = fromRoom || fromPkg;
  if (chosen && chosen.length >= 4 && !chosen.includes('مكيفة') && !chosen.includes('مطورة')) {
    return `${chosen} مشعر منى مكة المكرمة السعودية`;
  }
  return 'مشعر منى مخيمات الحجاج مكة المكرمة السعودية';
}

export function findAdminSavedLocationByKeywords(
  campaignSettings: CampaignSettings | undefined,
  excludeGroupName: string,
  explicitKeys: string[],
  keywords: string[]
): GroupLocationCoordinate | null {
  const mapEntries = campaignSettings?.groupLocations;
  if (!mapEntries) return null;
  const normalizedExclude = excludeGroupName.trim().toLowerCase();

  for (const key of explicitKeys) {
    const clean = (key || '').trim();
    if (!clean || clean.toLowerCase() === normalizedExclude) continue;
    const direct = mapEntries[clean];
    if (direct && isValidCoordinatePair(direct.lat, direct.lng)) {
      return direct;
    }
  }

  for (const entry of Object.values(mapEntries)) {
    if (!entry || !isValidCoordinatePair(entry.lat, entry.lng)) continue;
    if (entry.groupName.trim().toLowerCase() === normalizedExclude) continue;
    const haystack = `${entry.groupName} ${entry.locationTitle || ''}`.toLowerCase();
    if (keywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
      return entry;
    }
  }

  return null;
}

export function computeStraightDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

let cachedRuntimeKey: string | null = null;
let inflightKeyPromise: Promise<string> | null = null;

async function resolveMapsApiKey(): Promise<string> {
  const buildTimeKey = String(import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  if (buildTimeKey) {
    cachedRuntimeKey = buildTimeKey;
    return buildTimeKey;
  }
  if (cachedRuntimeKey !== null) {
    return cachedRuntimeKey;
  }
  if (!inflightKeyPromise) {
    inflightKeyPromise = fetchWithTimeout('/api/maps/config', { timeoutMs: 4000 })
      .then((res) => {
        const ct = res.headers.get('content-type') || '';
        return res.ok && ct.includes('application/json') ? res.json() : { apiKey: '' };
      })
      .then((data) => {
        const key = typeof data?.apiKey === 'string' ? data.apiKey.trim() : '';
        cachedRuntimeKey = key;
        return key;
      })
      .catch(() => {
        cachedRuntimeKey = '';
        return '';
      })
      .finally(() => {
        inflightKeyPromise = null;
      });
  }
  return inflightKeyPromise;
}

export function useMapsApiKey() {
  const initialKey = String(import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || cachedRuntimeKey || '').trim();
  const [apiKey, setApiKey] = useState<string>(initialKey);
  const [resolving, setResolving] = useState<boolean>(!initialKey);

  useEffect(() => {
    if (initialKey) {
      setApiKey(initialKey);
      setResolving(false);
      return;
    }
    let active = true;
    resolveMapsApiKey().then((key) => {
      if (!active) return;
      setApiKey(key);
      setResolving(false);
    });
    return () => {
      active = false;
    };
  }, [initialKey]);

  return { apiKey, resolving };
}

export function reportMapsErrorIfQuota(err: unknown): boolean {
  const raw =
    typeof err === 'string'
      ? err
      : err instanceof Error
      ? `${err.name} ${err.message}`
      : JSON.stringify(err || '');

  const isQuotaError =
    raw.includes('OVER_QUERY_LIMIT') ||
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('OverQuotaMapError') ||
    raw.includes('QuotaExceededError') ||
    /\b429\b/.test(raw);

  if (isQuotaError) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
  return isQuotaError;
}

export function extractLatLng(
  loc: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined
): google.maps.LatLngLiteral | null {
  if (!loc) return null;
  if (typeof (loc as google.maps.LatLng).lat === 'function') {
    const fnLoc = loc as google.maps.LatLng;
    return { lat: fnLoc.lat(), lng: fnLoc.lng() };
  }
  const lit = loc as google.maps.LatLngLiteral;
  if (typeof lit.lat === 'number' && typeof lit.lng === 'number') {
    return { lat: lit.lat, lng: lit.lng };
  }
  return null;
}

export function formatDistanceAr(meters?: number | null): string {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters <= 0) {
    return '—';
  }
  if (meters < 1000) {
    return `${Math.round(meters)} متر`;
  }
  const km = meters / 1000;
  return `${km >= 100 ? Math.round(km) : km.toFixed(1)} كم`;
}

export function formatDurationAr(durationMillis?: number | null): string {
  if (typeof durationMillis !== 'number' || !Number.isFinite(durationMillis) || durationMillis <= 0) {
    return '—';
  }
  const totalMinutes = Math.max(1, Math.round(durationMillis / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes} دقيقة`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours} ساعة و${mins} دقيقة` : `${hours} ساعة`;
}

export interface ResolvedPlaceItem {
  id: string;
  label: string;
  displayName: string;
  formattedAddress: string;
  location: google.maps.LatLngLiteral;
  googleMapsURI?: string;
}

interface AdvancedMarkerWithRefProps extends Omit<AdvancedMarkerProps, 'onClick'> {
  onMarkerClick: (marker: google.maps.marker.AdvancedMarkerElement) => void;
}

export const AdvancedMarkerWithRef: React.FC<AdvancedMarkerWithRefProps> = ({
  children,
  onMarkerClick,
  ...advancedMarkerProps
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <AdvancedMarker
      ref={markerRef}
      onClick={() => {
        if (marker) {
          onMarkerClick(marker);
        }
      }}
      {...advancedMarkerProps}
    >
      {children}
    </AdvancedMarker>
  );
};
