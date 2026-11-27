import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  CampaignSettings,
  HajjSeason,
  SeasonAuditEntry,
  SeasonStatus,
} from '../types';
import { setDocument } from './db';

export function extractHijriYear(seasonIdOrYear?: string): string {
  if (!seasonIdOrYear) return '1448';
  const digits = seasonIdOrYear.replace(/[^\d]/g, '');
  if (digits.length >= 4) return digits.slice(0, 4);
  return '1448';
}

export function normalizeSeasonId(seasonIdOrYear?: string): string {
  if (!seasonIdOrYear || !seasonIdOrYear.trim()) return 'season-1448';
  const trimmed = seasonIdOrYear.trim();
  if (trimmed.startsWith('season-')) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length >= 4) return `season-${digits.slice(0, 4)}`;
  return `season-${trimmed.replace(/[^a-zA-Z0-9_-]/g, '') || '1448'}`;
}

export function getSeasonStatusArabic(status: SeasonStatus): string {
  if (status === 'active') return 'نشط';
  if (status === 'completed') return 'مكتمل';
  return 'مؤرشف';
}

function buildAuditEntry(
  action: string,
  details?: string,
  actorName = 'إدارة النظام'
): SeasonAuditEntry {
  return {
    id: `sa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    action,
    details: details || '',
    actorName,
  };
}

function appendAuditHistory(
  existing: SeasonAuditEntry[] | undefined,
  entry: SeasonAuditEntry
): SeasonAuditEntry[] {
  const list = Array.isArray(existing) ? existing : [];
  return [entry, ...list].slice(0, 60);
}

/**
 * Ensures initial seasons (`season-1448` active and `season-1447` archived) exist once if `seasons` collection is empty.
 * Never overwrites existing seasons once present.
 */
let initialSeasonsSeeded = false;
export async function ensureInitialSeasonsOnce(params?: {
  activeYear?: string;
  packageIds?: string[];
  announcementIds?: string[];
  pilgrimIds?: string[];
  mediaAssetIds?: string[];
}): Promise<void> {
  if (initialSeasonsSeeded) return;
  initialSeasonsSeeded = true;

  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const snap = await getDocs(collection(db, 'seasons'));
    if (snap.docs.length > 0) return;

    const nowIso = new Date().toISOString();
    const activeYear = extractHijriYear(params?.activeYear || '1448');
    const activeId = normalizeSeasonId(activeYear);

    const activeSeason: HajjSeason = {
      id: activeId,
      hijriYear: activeYear,
      name: `حج ${activeYear}هـ`,
      startDate: '2026-06-01',
      endDate: '2026-12-30',
      status: 'active',
      protectArchivedMedia: true,
      retentionDays: 365,
      notes: 'الموسم التشغيلي النشط حالياً',
      linkedPackageIds: params?.packageIds || [],
      linkedAnnouncementIds: params?.announcementIds || [],
      linkedPilgrimIds: params?.pilgrimIds || [],
      linkedMediaAssetIds: params?.mediaAssetIds || [],
      history: [
        buildAuditEntry(
          'تهيئة الموسم النشط',
          `تم تأسيس سجل موسم حج ${activeYear}هـ وربطه بالباقات والحجاج النشطين`,
          'النظام المركزي'
        ),
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const prevYearNum = Number(activeYear) - 1;
    const prevYear = Number.isFinite(prevYearNum) && prevYearNum > 1400 ? String(prevYearNum) : '1447';
    const archivedSeason: HajjSeason = {
      id: normalizeSeasonId(prevYear),
      hijriYear: prevYear,
      name: `حج ${prevYear}هـ`,
      startDate: '2025-05-01',
      endDate: '2025-11-30',
      status: 'archived',
      protectArchivedMedia: true,
      retentionDays: 730,
      notes: 'أرشيف الموسم السابق — محفوظ بجميع ملفاته وصوره للرجوع وإعادة الاستخدام',
      linkedPackageIds: [],
      linkedAnnouncementIds: [],
      linkedPilgrimIds: [],
      linkedMediaAssetIds: [],
      history: [
        buildAuditEntry(
          'أرشفة الموسم السابق',
          `تم حفظ أرشيف موسم حج ${prevYear}هـ مع تفعيل سياسة حماية الوسائط`,
          'النظام المركزي'
        ),
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await setDocument('seasons', activeSeason.id, activeSeason);
    await setDocument('seasons', archivedSeason.id, archivedSeason);
  } catch (err) {
    console.warn('Season initialization notice:', err);
  }
}

export async function getSeasons(): Promise<HajjSeason[]> {
  try {
    const snap = await getDocs(collection(db, 'seasons'));
    return snap.docs
      .map((d) => ({ ...(d.data() as HajjSeason), id: d.id }))
      .sort((a, b) => Number(b.hijriYear || 0) - Number(a.hijriYear || 0));
  } catch {
    return [];
  }
}

export function subscribeToSeasons(callback: (seasons: HajjSeason[]) => void): () => void {
  return onSnapshot(
    collection(db, 'seasons'),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ ...(d.data() as HajjSeason), id: d.id }))
        .sort((a, b) => Number(b.hijriYear || 0) - Number(a.hijriYear || 0));
      callback(list);
    },
    (err) => {
      console.warn('Seasons subscription notice:', err);
    }
  );
}

export async function saveSeason(
  season: HajjSeason,
  auditAction = 'تحديث بيانات الموسم',
  auditDetails?: string,
  actorName = 'إدارة النظام'
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const payload: HajjSeason = {
    ...season,
    id: normalizeSeasonId(season.id || season.hijriYear),
    hijriYear: extractHijriYear(season.hijriYear || season.id),
    name: (season.name || `حج ${extractHijriYear(season.hijriYear)}هـ`).trim(),
    linkedPackageIds: Array.from(new Set(season.linkedPackageIds || [])),
    linkedAnnouncementIds: Array.from(new Set(season.linkedAnnouncementIds || [])),
    linkedPilgrimIds: Array.from(new Set(season.linkedPilgrimIds || [])),
    linkedMediaAssetIds: Array.from(new Set(season.linkedMediaAssetIds || [])),
    history: appendAuditHistory(
      season.history,
      buildAuditEntry(auditAction, auditDetails, actorName)
    ),
    createdAt: season.createdAt || nowIso,
    updatedAt: nowIso,
  };

  const res = await setDocument('seasons', payload.id, payload);
  return res.confirmed;
}

export async function updateSeasonStatus(
  season: HajjSeason,
  nextStatus: SeasonStatus,
  actorName = 'إدارة النظام'
): Promise<boolean> {
  const label = getSeasonStatusArabic(nextStatus);
  return saveSeason(
    {
      ...season,
      status: nextStatus,
      protectArchivedMedia: nextStatus === 'archived' ? true : season.protectArchivedMedia,
    },
    `تغيير حالة الموسم إلى (${label})`,
    `الموسم: ${season.name} (${season.hijriYear})`,
    actorName
  );
}

export async function activateSeasonAcrossSystem(params: {
  targetSeason: HajjSeason;
  allSeasons: HajjSeason[];
  campaignSettings: CampaignSettings;
  onUpdateCampaignSettings: (settings: CampaignSettings) => Promise<boolean> | boolean | void;
  actorName?: string;
}): Promise<boolean> {
  const {
    targetSeason,
    allSeasons,
    campaignSettings,
    onUpdateCampaignSettings,
    actorName = 'المدير العام',
  } = params;

  // Mark previous active seasons as 'completed' unless they were already archived
  for (const s of allSeasons) {
    if (s.id !== targetSeason.id && s.status === 'active') {
      await saveSeason(
        { ...s, status: 'completed' },
        'تحويل حالة الموسم إلى مكتمل',
        `تم تفعيل موسم ${targetSeason.name} بدلاً منه`,
        actorName
      );
    }
  }

  const ok = await saveSeason(
    { ...targetSeason, status: 'active' },
    'تفعيل الموسم كـ (موسم نشط)',
    `تم اعتماد ${targetSeason.name} كموسم نشط في النظام`,
    actorName
  );

  if (ok) {
    await onUpdateCampaignSettings({
      ...campaignSettings,
      pilgrimStatsConfig: {
        ...(campaignSettings.pilgrimStatsConfig || {
          baseHistoricalCount: 0,
          historicalRecords: [],
          autoIncludeCurrentPassengers: true,
        }),
        activeSeasonYear: targetSeason.hijriYear,
      },
    });
  }

  return ok;
}

/**
 * Links a package, announcement, pilgrim, or mediaAsset to a season safely.
 */
export async function linkEntityToSeason(params: {
  seasonIdOrYear?: string;
  entityType: 'package' | 'announcement' | 'pilgrim' | 'mediaAsset';
  entityId: string;
  note?: string;
  actorName?: string;
}): Promise<void> {
  const { seasonIdOrYear = '1448', entityType, entityId, note, actorName = 'النظام' } = params;
  if (!entityId) return;

  const seasonId = normalizeSeasonId(seasonIdOrYear);
  const hijriYear = extractHijriYear(seasonIdOrYear);
  const seasonRef = doc(db, 'seasons', seasonId);

  const fieldMap = {
    package: 'linkedPackageIds',
    announcement: 'linkedAnnouncementIds',
    pilgrim: 'linkedPilgrimIds',
    mediaAsset: 'linkedMediaAssetIds',
  } as const;
  const fieldName = fieldMap[entityType];

  try {
    const snap = await getDoc(seasonRef);
    const nowIso = new Date().toISOString();

    if (!snap.exists()) {
      const freshSeason: HajjSeason = {
        id: seasonId,
        hijriYear,
        name: `حج ${hijriYear}هـ`,
        startDate: `${new Date().getFullYear()}-01-01`,
        endDate: `${new Date().getFullYear()}-12-30`,
        status: hijriYear === '1448' ? 'active' : 'archived',
        protectArchivedMedia: true,
        retentionDays: 365,
        linkedPackageIds: entityType === 'package' ? [entityId] : [],
        linkedAnnouncementIds: entityType === 'announcement' ? [entityId] : [],
        linkedPilgrimIds: entityType === 'pilgrim' ? [entityId] : [],
        linkedMediaAssetIds: entityType === 'mediaAsset' ? [entityId] : [],
        history: [
          buildAuditEntry(
            `ربط سجل بالموسم (${entityType})`,
            note || `معرف العنصر: ${entityId}`,
            actorName
          ),
        ],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await setDoc(seasonRef, freshSeason, { merge: true });
      return;
    }

    const existing = snap.data() as HajjSeason;
    const currentList = (existing[fieldName] as string[] | undefined) || [];
    if (currentList.includes(entityId)) return;

    const updatedHistory = appendAuditHistory(
      existing.history,
      buildAuditEntry(
        `ربط ${
          entityType === 'package'
            ? 'باقة'
            : entityType === 'announcement'
            ? 'تعميم'
            : entityType === 'pilgrim'
            ? 'حاج'
            : 'ملف وسائط'
        } بالموسم`,
        note || `المعرف: ${entityId}`,
        actorName
      )
    );

    await setDoc(
      seasonRef,
      {
        [fieldName]: arrayUnion(entityId),
        history: updatedHistory,
        updatedAt: nowIso,
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Season link notice:', err);
  }
}

export async function unlinkEntityFromSeason(params: {
  seasonIdOrYear?: string;
  entityType: 'package' | 'announcement' | 'pilgrim' | 'mediaAsset';
  entityId: string;
  note?: string;
  actorName?: string;
}): Promise<void> {
  const { seasonIdOrYear = '1448', entityType, entityId, note, actorName = 'النظام' } = params;
  if (!entityId) return;

  const seasonId = normalizeSeasonId(seasonIdOrYear);
  const seasonRef = doc(db, 'seasons', seasonId);
  const fieldMap = {
    package: 'linkedPackageIds',
    announcement: 'linkedAnnouncementIds',
    pilgrim: 'linkedPilgrimIds',
    mediaAsset: 'linkedMediaAssetIds',
  } as const;
  const fieldName = fieldMap[entityType];

  try {
    const snap = await getDoc(seasonRef);
    if (!snap.exists()) return;
    const existing = snap.data() as HajjSeason;
    const updatedHistory = appendAuditHistory(
      existing.history,
      buildAuditEntry(
        `فك ارتباط ${
          entityType === 'package'
            ? 'باقة'
            : entityType === 'announcement'
            ? 'تعميم'
            : entityType === 'pilgrim'
            ? 'حاج'
            : 'ملف وسائط'
        } من الموسم`,
        note || `المعرف: ${entityId}`,
        actorName
      )
    );

    await setDoc(
      seasonRef,
      {
        [fieldName]: arrayRemove(entityId),
        history: updatedHistory,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Season unlink notice:', err);
  }
}

/**
 * Returns all season IDs/years and linked media asset IDs that are protected by active or archived retention policies.
 */
export async function getProtectedSeasonMediaMap(): Promise<{
  protectedSeasonIds: Set<string>;
  protectedMediaAssetIds: Set<string>;
  seasonRetentionDaysById: Map<string, number>;
}> {
  const protectedSeasonIds = new Set<string>();
  const protectedMediaAssetIds = new Set<string>();
  const seasonRetentionDaysById = new Map<string, number>();

  try {
    const seasons = await getSeasons();
    for (const s of seasons) {
      const sId = normalizeSeasonId(s.id || s.hijriYear);
      const isProtected =
        s.status === 'active' ||
        s.status === 'archived' ||
        s.protectArchivedMedia !== false;

      if (isProtected) {
        protectedSeasonIds.add(sId);
        if (s.hijriYear) protectedSeasonIds.add(s.hijriYear);
        (s.linkedMediaAssetIds || []).forEach((mid) => protectedMediaAssetIds.add(mid));
      }
      seasonRetentionDaysById.set(sId, Number(s.retentionDays || (s.status === 'archived' ? 730 : 365)));
    }
  } catch {
    // non-fatal
  }

  return {
    protectedSeasonIds,
    protectedMediaAssetIds,
    seasonRetentionDaysById,
  };
}
