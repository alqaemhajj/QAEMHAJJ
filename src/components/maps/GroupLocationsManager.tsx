import React, { useEffect, useMemo, useState } from 'react';
import {
  Map as GoogleMap,
  MapMouseEvent,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  CheckCircle2,
  Crosshair,
  Loader2,
  MapPin,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  CampaignSettings,
  GroupLocationCoordinate,
  Pilgrim,
} from '../../types';
import { MapsProviderWrapper } from './MapsProviderWrapper';
import {
  AdvancedMarkerWithRef,
  GMP_ATTRIBUTION_ID,
  REGIONAL_INITIAL_CAMERA,
  extractLatLng,
  isValidCoordinatePair,
  reportMapsErrorIfQuota,
} from './mapsUtils';

interface GroupLocationsManagerProps {
  campaignSettings: CampaignSettings;
  pilgrims: Pilgrim[];
  busOptions: string[];
  adminName?: string;
  onSaveGroupLocations: (
    nextLocations: Record<string, GroupLocationCoordinate>
  ) => Promise<boolean>;
}

const PickerMapInner: React.FC<{
  selectedLat: number | null;
  selectedLng: number | null;
  selectedGroup: string;
  onPickCoordinate: (lat: number, lng: number, detectedTitle?: string) => void;
}> = ({ selectedLat, selectedLng, selectedGroup, onPickCoordinate }) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    if (map && selectedLat !== null && selectedLng !== null) {
      map.panTo({ lat: selectedLat, lng: selectedLng });
      map.setZoom(15);
    }
  }, [map, selectedLat, selectedLng]);

  const handleMapClick = (ev: MapMouseEvent) => {
    const latLng = ev.detail?.latLng;
    if (!latLng) return;
    onPickCoordinate(
      Number(latLng.lat.toFixed(6)),
      Number(latLng.lng.toFixed(6))
    );
  };

  const handlePlaceSearch = async () => {
    if (!placesLib || !searchText.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      const { places } = await placesLib.Place.searchByText({
        textQuery: searchText.trim(),
        fields: ['id', 'displayName', 'formattedAddress', 'location'],
        language: 'ar',
        region: 'SA',
        maxResultCount: 1,
        internalUsageAttributionIds: [GMP_ATTRIBUTION_ID],
      });
      const place = places?.[0];
      const coords = extractLatLng(place?.location);
      if (place && coords) {
        onPickCoordinate(
          Number(coords.lat.toFixed(6)),
          Number(coords.lng.toFixed(6)),
          place.displayName || undefined
        );
      } else {
        setSearchError('لم يُعثر على موقع مطابق للبحث.');
      }
    } catch (err) {
      const isQuota = reportMapsErrorIfQuota(err);
      setSearchError(
        isQuota ? 'تم بلوغ الحد المؤقت لخدمة البحث.' : 'تعذر البحث عن الموقع.'
      );
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-amber-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handlePlaceSearch();
              }
            }}
            placeholder="ابحث على الخريطة (مثال: مشعر منى، مواقف كدي، برج الساعة)..."
            className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl pr-9 pl-3 py-2 text-xs text-white outline-none"
          />
        </div>
        <button
          type="button"
          onClick={handlePlaceSearch}
          disabled={searching || !searchText.trim()}
          className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          {searching ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5" />
          )}
          <span>تحديد من البحث</span>
        </button>
      </div>

      {searchError && (
        <p className="text-[11px] text-amber-400 font-bold">{searchError}</p>
      )}

      <div className="w-full h-[250px] rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={
            selectedLat !== null && selectedLng !== null
              ? { lat: selectedLat, lng: selectedLng }
              : REGIONAL_INITIAL_CAMERA.center
          }
          defaultZoom={
            selectedLat !== null && selectedLng !== null
              ? 15
              : REGIONAL_INITIAL_CAMERA.zoom
          }
          gestureHandling="greedy"
          streetViewControl={false}
          internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
          className="w-full h-full"
          style={{ width: '100%', height: '100%' }}
          onClick={handleMapClick}
        >
          {selectedLat !== null && selectedLng !== null && (
            <AdvancedMarkerWithRef
              position={{ lat: selectedLat, lng: selectedLng }}
              title={selectedGroup}
              onMarkerClick={() => {}}
            >
              <Pin
                background="#f59e0b"
                borderColor="#78350f"
                glyphColor="#0B1221"
              />
            </AdvancedMarkerWithRef>
          )}
        </GoogleMap>
      </div>
      <p className="text-[11px] text-slate-400">
        انقر في أي نقطة على الخريطة أعلاه لتعبئة خط العرض والطول تلقائياً، أو أدخلهما مباشرة.
      </p>
    </div>
  );
};

export const GroupLocationsManager: React.FC<GroupLocationsManagerProps> = ({
  campaignSettings,
  pilgrims,
  busOptions,
  adminName,
  onSaveGroupLocations,
}) => {
  const existingMap = campaignSettings.groupLocations || {};

  const availableGroups = useMemo(() => {
    const set = new Set<string>();
    busOptions.forEach((b) => b.trim() && set.add(b.trim()));
    pilgrims.forEach((p) => {
      if (p.isDeleted || p.status === 'محذوف') return;
      if (p.busNumber?.trim()) set.add(p.busNumber.trim());
      if (p.flightNumberOutbound?.trim()) set.add(p.flightNumberOutbound.trim());
      if (p.roomNumberMina?.trim()) set.add(p.roomNumberMina.trim());
    });
    if (pilgrims.some((p) => (p.selectedPackage || '').includes('طيران') || p.transport === 'طائرة')) {
      set.add('رحلات الطيران');
    }
    Object.keys(existingMap).forEach((k) => k.trim() && set.add(k.trim()));
    return Array.from(set);
  }, [busOptions, pilgrims, existingMap]);

  const [selectedGroup, setSelectedGroup] = useState<string>(
    availableGroups[0] || 'حافلة 1'
  );
  const [customGroupInput, setCustomGroupInput] = useState<string>('');
  const [latInput, setLatInput] = useState<string>('');
  const [lngInput, setLngInput] = useState<string>('');
  const [titleInput, setTitleInput] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!selectedGroup && availableGroups.length > 0) {
      setSelectedGroup(availableGroups[0]);
    }
  }, [availableGroups, selectedGroup]);

  useEffect(() => {
    const existing = existingMap[selectedGroup];
    if (existing && isValidCoordinatePair(existing.lat, existing.lng)) {
      setLatInput(String(existing.lat));
      setLngInput(String(existing.lng));
      setTitleInput(existing.locationTitle || '');
    } else {
      setLatInput('');
      setLngInput('');
      setTitleInput('');
    }
    setFeedbackMsg(null);
  }, [selectedGroup, campaignSettings.groupLocations]);

  const parsedLat = Number(latInput.trim());
  const parsedLng = Number(lngInput.trim());
  const hasValidPreview =
    latInput.trim() !== '' &&
    lngInput.trim() !== '' &&
    isValidCoordinatePair(parsedLat, parsedLng);

  const handleUseCurrentGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setFeedbackMsg({ type: 'error', text: 'المتصفح لا يدعم خدمة GPS.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatInput(pos.coords.latitude.toFixed(6));
        setLngInput(pos.coords.longitude.toFixed(6));
        setFeedbackMsg(null);
      },
      () => {
        setFeedbackMsg({
          type: 'error',
          text: 'تعذر قراءة الموقع الحالي؛ يرجى السماح بصلاحية الموقع أو التحديد على الخريطة.',
        });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = async () => {
    const targetGroup = (customGroupInput.trim() || selectedGroup).trim();
    if (!targetGroup) {
      setFeedbackMsg({ type: 'error', text: 'يرجى اختيار اسم المجموعة أو الحافلة أولاً.' });
      return;
    }
    if (!hasValidPreview) {
      setFeedbackMsg({
        type: 'error',
        text: 'يرجى إدخال إحداثيات خط عرض وخط طول صحيحة (مثال: 21.4125 و 39.8933).',
      });
      return;
    }

    setSaving(true);
    setFeedbackMsg(null);
    try {
      const nextMap: Record<string, GroupLocationCoordinate> = {
        ...existingMap,
        [targetGroup]: {
          groupName: targetGroup,
          lat: Number(parsedLat.toFixed(6)),
          lng: Number(parsedLng.toFixed(6)),
          locationTitle: titleInput.trim() || undefined,
          updatedAt: new Date().toISOString(),
          updatedBy: adminName || 'الإدارة',
        },
      };
      const ok = await onSaveGroupLocations(nextMap);
      if (ok) {
        if (customGroupInput.trim()) {
          setSelectedGroup(targetGroup);
          setCustomGroupInput('');
        }
        setFeedbackMsg({
          type: 'success',
          text: `تم حفظ موقع "${targetGroup}" وتحديث الخريطة المصغرة في بوابة الحجاج فوراً.`,
        });
      } else {
        setFeedbackMsg({
          type: 'error',
          text: 'تعذر حفظ الإحداثيات في السحابة، يرجى المحاولة مرة أخرى.',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClearGroup = async (groupKey: string) => {
    setSaving(true);
    setFeedbackMsg(null);
    try {
      const nextMap = { ...existingMap };
      delete nextMap[groupKey];
      const ok = await onSaveGroupLocations(nextMap);
      if (ok) {
        if (groupKey === selectedGroup) {
          setLatInput('');
          setLngInput('');
          setTitleInput('');
        }
        setFeedbackMsg({
          type: 'success',
          text: `تم إزالة إحداثيات الموقع للمجموعة "${groupKey}".`,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5 text-right">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
              إدارة المواقع الجغرافية للمجموعات والحافلات (لبوابة الحاج)
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              حدد إحداثيات خط العرض والطول لأي حافلة أو فوج أو مخيم منى لتظهر خريطة مصغرة متمركزة في بوابة الحجاج التابعين لها.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Form Controls */}
        <div className="lg:col-span-5 space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              اختر المجموعة / الحافلة / المخيم:
            </label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-amber-500"
            >
              {availableGroups.map((g) => (
                <option key={g} value={g}>
                  {g} {existingMap[g] ? '✓ (موقع محدد)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
              أو أضف مسمى مجموعة/فوج أو موقع رئيسي مخصص (اختياري):
            </label>
            <input
              type="text"
              value={customGroupInput}
              onChange={(e) => setCustomGroupInput(e.target.value)}
              placeholder="مثال: حافلة 3 أو خيمة منى A4 أو فندق مكة المكرمة"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-amber-500"
            />
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {['فندق مكة المكرمة', 'مخيم منى', 'فندق المدينة المنورة'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    if (existingMap[preset]) {
                      setCustomGroupInput('');
                      setSelectedGroup(preset);
                    } else {
                      setCustomGroupInput(preset);
                    }
                  }}
                  className="px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-[10px] font-bold transition cursor-pointer"
                >
                  + {preset} {existingMap[preset] ? '✓' : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                خط العرض (Latitude) *
              </label>
              <input
                type="text"
                value={latInput}
                onChange={(e) => {
                  const val = e.target.value;
                  // Support pasting "lat, lng" pair in Latitude input
                  if (val.includes(',')) {
                    const [a, b] = val.split(',').map((s) => s.trim());
                    if (a && b && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) {
                      setLatInput(a);
                      setLngInput(b);
                      return;
                    }
                  }
                  setLatInput(val);
                }}
                placeholder="21.4125"
                dir="ltr"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                خط الطول (Longitude) *
              </label>
              <input
                type="text"
                value={lngInput}
                onChange={(e) => setLngInput(e.target.value)}
                placeholder="39.8933"
                dir="ltr"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              وصف نقطة التجمع / الموقع (اختياري):
            </label>
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="مثال: مخيم منى المطور - بوابة 4"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleUseCurrentGps}
              className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-600 dark:text-emerald-300 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>التقاط موقعي الحالي GPS</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center justify-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>حفظ موقع المجموعة</span>
            </button>
          </div>

          {feedbackMsg && (
            <div
              className={`p-3 rounded-xl text-xs font-bold border ${
                feedbackMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-500'
              }`}
            >
              {feedbackMsg.text}
            </div>
          )}

          {/* List of Saved Group Coordinates */}
          {Object.keys(existingMap).length > 0 && (
            <div className="pt-2 space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                المجموعات ذات المواقع المثبتة حالياً:
              </span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {Object.values(existingMap).map((loc) => (
                  <div
                    key={loc.groupName}
                    className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedGroup(loc.groupName)}
                      className="text-right flex-1 min-w-0 cursor-pointer"
                    >
                      <strong className="text-slate-900 dark:text-amber-400 font-bold block truncate">
                        {loc.groupName}
                        {loc.locationTitle ? ` — ${loc.locationTitle}` : ''}
                      </strong>
                      <span className="text-[10px] font-mono text-slate-500" dir="ltr">
                        {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClearGroup(loc.groupName)}
                      disabled={saving}
                      title="إزالة موقع المجموعة"
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Interactive Picker Map */}
        <div className="lg:col-span-7 bg-slate-950/60 border border-slate-800 rounded-2xl p-3.5">
          <MapsProviderWrapper fallbackTitle="تعذر تحميل خريطة التحديد — يمكنك إدخال الإحداثيات يدوياً">
            <PickerMapInner
              selectedLat={hasValidPreview ? parsedLat : null}
              selectedLng={hasValidPreview ? parsedLng : null}
              selectedGroup={customGroupInput.trim() || selectedGroup}
              onPickCoordinate={(lat, lng, detectedTitle) => {
                setLatInput(String(lat));
                setLngInput(String(lng));
                if (detectedTitle && !titleInput.trim()) {
                  setTitleInput(detectedTitle);
                }
              }}
            />
          </MapsProviderWrapper>
        </div>
      </div>
    </div>
  );
};
