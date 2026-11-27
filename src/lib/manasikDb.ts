import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { INITIAL_MANASIK_STAGES } from '../data/manasikSeedData';
import { ManasikRitualItem, ManasikStage, PilgrimManasikProgress } from '../types';
import { OperationType, recordActivityLog } from './db';
import { safeStorage } from '../utils/safeStorage';

export const MANASIK_COLLECTION = 'manasik_stages';
export const PILGRIM_PROGRESS_COLLECTION = 'pilgrim_manasik_progress';
export const MANASIK_STAGES_CACHE_KEY = 'qaem_manasik_stages_cache_v1';
export const MANASIK_PROGRESS_STORAGE_KEY = 'qaem_manasik_completed_ids_v1';
const MANASIK_SEED_GUARD_KEY = 'qaem_manasik_seeded_once_v1';

interface ManasikFirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: { providerId?: string | null; email?: string | null }[];
  };
}

function handleManasikFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const rawMsg = error instanceof Error ? error.message : String(error);
  const lower = rawMsg.toLowerCase();
  if (
    lower.includes('the client is offline') ||
    lower.includes('could not reach cloud firestore') ||
    lower.includes('unavailable') ||
    lower.includes('network') ||
    lower.includes('quota') ||
    lower.includes('resource-exhausted') ||
    lower.includes('resource_exhausted')
  ) {
    console.warn(`Manasik Firestore offline/quota fallback (${operationType} on ${path})`);
    return;
  }

  const errInfo: ManasikFirestoreErrorInfo = {
    error: rawMsg,
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  if (lower.includes('permission') || lower.includes('insufficient')) {
    throw new Error(JSON.stringify(errInfo));
  }
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export function normalizeStageRituals(rituals: unknown): ManasikRitualItem[] {
  if (!Array.isArray(rituals)) return [];
  return rituals
    .filter((r) => r && typeof r === 'object' && typeof (r as any).title === 'string')
    .map((r: any, idx: number) => {
      const item: ManasikRitualItem = {
        id: String(r.id || `ritual-${idx + 1}`).slice(0, 120),
        title: String(r.title || '').trim().slice(0, 300),
        ruling: (r.ruling || '') as ManasikRitualItem['ruling'],
        explanation: String(r.explanation || '').slice(0, 5000),
        campaignNote: String(r.campaignNote || '').slice(0, 1000),
        order: typeof r.order === 'number' && Number.isFinite(r.order) ? r.order : idx + 1,
        isEnabled: r.isEnabled !== false,
      };
      if (r.updatedAt) {
        item.updatedAt = String(r.updatedAt);
      }
      return item;
    })
    .sort((a, b) => a.order - b.order);
}

export function normalizeManasikStage(raw: any, docId?: string): ManasikStage {
  const stage: ManasikStage = {
    id: String(raw?.id || docId || `stage-${Date.now()}`).slice(0, 120),
    title: String(raw?.title || '').trim().slice(0, 250),
    subtitle: String(raw?.subtitle || '').slice(0, 300),
    summary: String(raw?.summary || '').slice(0, 2000),
    campaignTip: String(raw?.campaignTip || '').slice(0, 1500),
    order: typeof raw?.order === 'number' && Number.isFinite(raw.order) ? raw.order : 99,
    isEnabled: raw?.isEnabled !== false,
    rituals: normalizeStageRituals(raw?.rituals),
  };
  if (raw?.updatedAt) {
    stage.updatedAt = String(raw.updatedAt);
  }
  if (raw?.updatedBy) {
    stage.updatedBy = String(raw.updatedBy).slice(0, 120);
  }
  return stage;
}

export function readCachedManasikStages(): ManasikStage[] {
  try {
    const raw = safeStorage.getItem(MANASIK_STAGES_CACHE_KEY);
    if (!raw) {
      const wasSeeded = safeStorage.getItem(MANASIK_SEED_GUARD_KEY) === '1';
      return wasSeeded ? [] : INITIAL_MANASIK_STAGES;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return INITIAL_MANASIK_STAGES;
    return parsed.map((s: any) => normalizeManasikStage(s)).sort((a, b) => a.order - b.order);
  } catch {
    return INITIAL_MANASIK_STAGES;
  }
}

export function writeCachedManasikStages(stages: ManasikStage[]): void {
  safeStorage.setJSON(MANASIK_STAGES_CACHE_KEY, stages);
}

let manasikSeedPromise: Promise<ManasikStage[]> | null = null;

/**
 * Seeds the 6 default Manasik stages + 24 rituals into Firestore ONLY on very first run
 * (before `settings/manasikMeta.isSeeded` is marked true), never overwriting admin edits or deletions.
 */
export async function ensureManasikSeededOnce(): Promise<ManasikStage[]> {
  if (manasikSeedPromise) return manasikSeedPromise;

  manasikSeedPromise = (async () => {
    try {
      const [snap, metaSnap] = await Promise.all([
        getDocs(collection(db, MANASIK_COLLECTION)),
        getDoc(doc(db, 'settings', 'manasikMeta')).catch(() => null),
      ]);

      if (!snap.empty) {
        const existing = snap.docs
          .map((d) => normalizeManasikStage(d.data(), d.id))
          .sort((a, b) => a.order - b.order);
        safeStorage.setItem(MANASIK_SEED_GUARD_KEY, '1');
        if (metaSnap && !metaSnap.exists()) {
          setDoc(
            doc(db, 'settings', 'manasikMeta'),
            { isSeeded: true, seededAt: new Date().toISOString() },
            { merge: true }
          ).catch(() => {});
        }
        writeCachedManasikStages(existing);
        return existing;
      }

      const alreadySeededRemote = Boolean(metaSnap && metaSnap.exists() && metaSnap.data()?.isSeeded);
      const alreadySeededLocal = safeStorage.getItem(MANASIK_SEED_GUARD_KEY) === '1';

      // If already seeded in the past and admin intentionally deleted all stages, keep empty
      if (alreadySeededRemote || alreadySeededLocal) {
        writeCachedManasikStages([]);
        return [];
      }

      const nowIso = new Date().toISOString();
      const batch = writeBatch(db);
      const seeded = INITIAL_MANASIK_STAGES.map((stage) => {
        const cleanStage = stripUndefinedDeep(
          normalizeManasikStage(
            {
              ...stage,
              updatedAt: nowIso,
              updatedBy: 'النظام (تعبئة أولية)',
            },
            stage.id
          )
        );
        batch.set(doc(db, MANASIK_COLLECTION, cleanStage.id), cleanStage);
        return cleanStage;
      });
      batch.set(
        doc(db, 'settings', 'manasikMeta'),
        { isSeeded: true, seededAt: nowIso },
        { merge: true }
      );

      await batch.commit();
      safeStorage.setItem(MANASIK_SEED_GUARD_KEY, '1');
      writeCachedManasikStages(seeded);
      return seeded;
    } catch (error) {
      handleManasikFirestoreError(error, OperationType.LIST, MANASIK_COLLECTION);
      return readCachedManasikStages();
    } finally {
      manasikSeedPromise = null;
    }
  })();

  return manasikSeedPromise;
}

/**
 * Real-time subscription to `manasik_stages` with offline localStorage cache fallback.
 */
export function subscribeToManasikStages(
  onStages: (stages: ManasikStage[]) => void
): () => void {
  onStages(readCachedManasikStages());

  let seedFinished = false;
  ensureManasikSeededOnce()
    .then((seeded) => {
      seedFinished = true;
      if (seeded.length === 0) {
        onStages([]);
      }
    })
    .catch(() => {
      seedFinished = true;
    });

  const q = query(collection(db, MANASIK_COLLECTION), orderBy('order', 'asc'));
  const unsub = onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        const isGuarded = safeStorage.getItem(MANASIK_SEED_GUARD_KEY) === '1';
        if (seedFinished || isGuarded) {
          writeCachedManasikStages([]);
          onStages([]);
        }
        return;
      }
      const list = snapshot.docs
        .map((d) => normalizeManasikStage(d.data(), d.id))
        .sort((a, b) => a.order - b.order);
      safeStorage.setItem(MANASIK_SEED_GUARD_KEY, '1');
      writeCachedManasikStages(list);
      onStages(list);
    },
    (error) => {
      handleManasikFirestoreError(error, OperationType.GET, MANASIK_COLLECTION);
      onStages(readCachedManasikStages());
    }
  );

  return unsub;
}

export async function saveManasikStage(
  stage: ManasikStage,
  actorName?: string
): Promise<ManasikStage> {
  const nowIso = new Date().toISOString();
  const normalized = stripUndefinedDeep(
    normalizeManasikStage(
      {
        ...stage,
        updatedAt: nowIso,
        updatedBy: actorName || stage.updatedBy || 'الإشراف الديني',
      },
      stage.id
    )
  );

  const path = `${MANASIK_COLLECTION}/${normalized.id}`;
  try {
    await setDoc(doc(db, MANASIK_COLLECTION, normalized.id), normalized, { merge: true });
    const cached = readCachedManasikStages();
    const exists = cached.some((s) => s.id === normalized.id);
    const nextCache = (exists
      ? cached.map((s) => (s.id === normalized.id ? normalized : s))
      : [...cached, normalized]
    ).sort((a, b) => a.order - b.order);
    writeCachedManasikStages(nextCache);

    if (actorName) {
      recordActivityLog({
        adminName: actorName,
        category: 'المشرفين والإعدادات',
        action: exists ? 'تحديث مرحلة أو مناسك في دليل الحاج' : 'إضافة مرحلة جديدة لدليل المناسك',
        target: normalized.title,
        details: `عدد المناسك: ${normalized.rituals.length} | الحالة: ${normalized.isEnabled ? 'مفعّل' : 'مخفي'}`,
      }).catch(() => {});
    }
    return normalized;
  } catch (error) {
    handleManasikFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function saveAllManasikStagesBatch(
  stages: ManasikStage[],
  actorName?: string
): Promise<ManasikStage[]> {
  const nowIso = new Date().toISOString();
  const normalizedList = stages.map((st, idx) =>
    stripUndefinedDeep(
      normalizeManasikStage(
        {
          ...st,
          order: idx + 1,
          updatedAt: nowIso,
          updatedBy: actorName || st.updatedBy || 'الإشراف الديني',
        },
        st.id
      )
    )
  );

  try {
    const batch = writeBatch(db);
    for (const st of normalizedList) {
      batch.set(doc(db, MANASIK_COLLECTION, st.id), st, { merge: true });
    }
    await batch.commit();
    writeCachedManasikStages(normalizedList);
    return normalizedList;
  } catch (error) {
    handleManasikFirestoreError(error, OperationType.WRITE, MANASIK_COLLECTION);
    throw error;
  }
}

export async function deleteManasikStage(
  stageId: string,
  stageTitle?: string,
  actorName?: string
): Promise<void> {
  const path = `${MANASIK_COLLECTION}/${stageId}`;
  try {
    await deleteDoc(doc(db, MANASIK_COLLECTION, stageId));
    const nextCache = readCachedManasikStages().filter((s) => s.id !== stageId);
    writeCachedManasikStages(nextCache);

    if (actorName) {
      recordActivityLog({
        adminName: actorName,
        category: 'المشرفين والإعدادات',
        action: 'حذف مرحلة من دليل المناسك',
        target: stageTitle || stageId,
      }).catch(() => {});
    }
  } catch (error) {
    handleManasikFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
}

export async function restoreDefaultManasikStages(actorName?: string): Promise<ManasikStage[]> {
  const nowIso = new Date().toISOString();
  try {
    const existingSnap = await getDocs(collection(db, MANASIK_COLLECTION));
    const batch = writeBatch(db);
    const defaultIds = new Set(INITIAL_MANASIK_STAGES.map((s) => s.id));

    existingSnap.docs.forEach((d) => {
      if (!defaultIds.has(d.id)) {
        batch.delete(d.ref);
      }
    });

    const restored = INITIAL_MANASIK_STAGES.map((st) => {
      const clean = stripUndefinedDeep(
        normalizeManasikStage(
          {
            ...st,
            updatedAt: nowIso,
            updatedBy: actorName || 'الإشراف الديني',
          },
          st.id
        )
      );
      batch.set(doc(db, MANASIK_COLLECTION, clean.id), clean);
      return clean;
    });
    batch.set(
      doc(db, 'settings', 'manasikMeta'),
      { isSeeded: true, seededAt: nowIso },
      { merge: true }
    );

    await batch.commit();
    safeStorage.setItem(MANASIK_SEED_GUARD_KEY, '1');
    writeCachedManasikStages(restored);
    return restored;
  } catch (error) {
    handleManasikFirestoreError(error, OperationType.WRITE, MANASIK_COLLECTION);
    throw error;
  }
}

// ============================================================================
// Cloud-Synced Per-Pilgrim Progress (`pilgrim_manasik_progress/{pilgrimKey}`)
// Tied strictly to each pilgrim's unique National ID / Pilgrim ID
// ============================================================================

export function getPilgrimProgressDocId(nationalId?: string, pilgrimId?: string): string {
  const cleanNat = String(nationalId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleanNat) return cleanNat;
  return String(pilgrimId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
}

function getPilgrimLocalCacheKey(docId: string): string {
  return `qaem_pilgrim_manasik_v1_${docId}`;
}

export function readCachedPilgrimProgress(docId: string): string[] {
  if (!docId) return [];
  const parsed = safeStorage.getJSON<unknown>(getPilgrimLocalCacheKey(docId), []);
  if (!Array.isArray(parsed)) return [];
  return Array.from(new Set(parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));
}

export function writeCachedPilgrimProgress(docId: string, ids: string[]): void {
  if (!docId) return;
  const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0)));
  safeStorage.setJSON(getPilgrimLocalCacheKey(docId), unique);
}

export function subscribeToPilgrimManasikProgress(
  params: { nationalId: string; pilgrimId?: string },
  onChange: (completedIds: string[], syncedFromCloud: boolean) => void
): () => void {
  const docId = getPilgrimProgressDocId(params.nationalId, params.pilgrimId);
  if (!docId) {
    onChange([], false);
    return () => {};
  }

  onChange(readCachedPilgrimProgress(docId), false);

  const docRef = doc(db, PILGRIM_PROGRESS_COLLECTION, docId);
  const unsub = onSnapshot(
    docRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        const local = readCachedPilgrimProgress(docId);
        onChange(local, true);
        return;
      }
      const data = snapshot.data() as Partial<PilgrimManasikProgress>;
      const list = Array.isArray(data.completedRitualIds)
        ? Array.from(
            new Set(
              data.completedRitualIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
            )
          )
        : [];
      writeCachedPilgrimProgress(docId, list);
      onChange(list, true);
    },
    (error) => {
      handleManasikFirestoreError(
        error,
        OperationType.GET,
        `${PILGRIM_PROGRESS_COLLECTION}/${docId}`
      );
      onChange(readCachedPilgrimProgress(docId), false);
    }
  );

  return unsub;
}

export async function savePilgrimManasikProgress(params: {
  nationalId: string;
  pilgrimId?: string;
  completedRitualIds: string[];
}): Promise<void> {
  const docId = getPilgrimProgressDocId(params.nationalId, params.pilgrimId);
  if (!docId) return;

  const uniqueIds = Array.from(
    new Set(
      (params.completedRitualIds || []).filter(
        (id) => typeof id === 'string' && id.trim().length > 0
      )
    )
  ).slice(0, 500);

  writeCachedPilgrimProgress(docId, uniqueIds);

  const payload = stripUndefinedDeep<PilgrimManasikProgress>({
    id: docId,
    pilgrimId: String(params.pilgrimId || docId).slice(0, 128),
    nationalId: String(params.nationalId || docId).trim().slice(0, 30),
    completedRitualIds: uniqueIds,
    updatedAt: new Date().toISOString(),
  });

  const path = `${PILGRIM_PROGRESS_COLLECTION}/${docId}`;
  try {
    await setDoc(doc(db, PILGRIM_PROGRESS_COLLECTION, docId), payload, { merge: true });
  } catch (error) {
    handleManasikFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Removes deleted ritual IDs from all pilgrim cloud progress records whenever
 * the Religious Guidance Admin deletes a ritual or a whole stage.
 */
export async function pruneDeletedRitualIdsFromAllPilgrims(
  validRitualIds: Set<string>
): Promise<number> {
  try {
    const snap = await getDocs(collection(db, PILGRIM_PROGRESS_COLLECTION));
    if (snap.empty) return 0;

    const batch = writeBatch(db);
    let updatedCount = 0;
    const nowIso = new Date().toISOString();

    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() as Partial<PilgrimManasikProgress>;
      const existing = Array.isArray(data.completedRitualIds) ? data.completedRitualIds : [];
      const cleaned = existing.filter((id) => validRitualIds.has(id));
      if (cleaned.length !== existing.length) {
        batch.set(
          docSnap.ref,
          {
            completedRitualIds: cleaned,
            updatedAt: nowIso,
          },
          { merge: true }
        );
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      await batch.commit();
    }
    return updatedCount;
  } catch (error) {
    handleManasikFirestoreError(error, OperationType.WRITE, PILGRIM_PROGRESS_COLLECTION);
    return 0;
  }
}

// Legacy browser helpers kept only as clean fallback utilities
export function loadCompletedRitualIds(): string[] {
  const parsed = safeStorage.getJSON<unknown>(MANASIK_PROGRESS_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return Array.from(new Set(parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));
}

export function saveCompletedRitualIds(ids: string[]): void {
  const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0)));
  safeStorage.setJSON(MANASIK_PROGRESS_STORAGE_KEY, unique);
}

export function clearCompletedRitualIds(): void {
  safeStorage.removeItem(MANASIK_PROGRESS_STORAGE_KEY);
}
