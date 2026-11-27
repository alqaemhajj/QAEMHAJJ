import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getCountFromServer,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { sanitizeDocumentMediaFields } from './mediaManager';
import { safeSessionStorage, safeStorage } from '../utils/safeStorage';
import { fetchWithTimeout } from '../utils/safeFetch';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface CentralSyncState {
  status: 'online' | 'saving' | 'synced' | 'offline' | 'error';
  pendingWrites: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastErrorCode?: string | null;
  skippedRedundantWrites: number;
}

const syncState: CentralSyncState = {
  status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online',
  pendingWrites: 0,
  lastSyncedAt: null,
  lastError: null,
  lastErrorCode: null,
  skippedRedundantWrites: 0,
};

const syncListeners = new Set<(state: CentralSyncState) => void>();

function notifySyncState(patch: Partial<CentralSyncState>) {
  Object.assign(syncState, patch);
  const snapshot = { ...syncState };
  syncListeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch {
      // ignore listener error
    }
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('qaem-sync-status', { detail: snapshot }));
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => notifySyncState({ status: 'online', lastError: null, lastErrorCode: null }));
  window.addEventListener('offline', () => notifySyncState({ status: 'offline' }));
}

export function getCentralSyncState(): CentralSyncState {
  return { ...syncState };
}

export function subscribeToCentralSyncState(callback: (state: CentralSyncState) => void): () => void {
  syncListeners.add(callback);
  callback({ ...syncState });
  return () => {
    syncListeners.delete(callback);
  };
}

// ============================================================================
// Short-TTL Read Cache & In-Flight Request Deduplication
// Prevents duplicate concurrent Firestore reads and protects free-tier quota.
// ============================================================================
const READ_CACHE_TTL_MS = 12000;
const docReadCache = new Map<string, { data: any; expiresAt: number }>();
const collectionReadCache = new Map<string, { data: any[]; expiresAt: number }>();
const inflightDocReads = new Map<string, Promise<any>>();
const inflightCollectionReads = new Map<string, Promise<any[]>>();

function invalidateReadCaches(collectionPath: string, docId?: string) {
  collectionReadCache.delete(collectionPath);
  if (docId) {
    docReadCache.delete(`${collectionPath}/${docId}`);
  }
}

// ============================================================================
// Payload Diffing & Version Control Registry
// Prevents redundant writes to Firestore when data has not changed,
// and tracks document `_version` to prevent stale overwrites.
// ============================================================================
const payloadFingerprintCache = new Map<string, string>();
const documentVersionCache = new Map<string, number>();

const IGNORED_DIFF_KEYS = new Set([
  'updatedAt',
  'updatedAtIso',
  '_version',
  'updatedBy',
]);

function canonicalizeForDiff(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'object') return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if ('_methodName' in val) return undefined;
  if (Array.isArray(val)) return val.map(canonicalizeForDiff);

  const sortedKeys = Object.keys(val)
    .filter((k) => !IGNORED_DIFF_KEYS.has(k) && val[k] !== undefined)
    .sort();
  const result: Record<string, any> = {};
  for (const k of sortedKeys) {
    result[k] = canonicalizeForDiff(val[k]);
  }
  return result;
}

function computePayloadFingerprint(data: any): string {
  try {
    return JSON.stringify(canonicalizeForDiff(data));
  } catch {
    return String(Date.now());
  }
}

function recordDocumentCacheState(path: string, id: string, rawData: Record<string, any>) {
  const docKey = `${path}/${id}`;
  const fp = computePayloadFingerprint({ ...rawData, id });
  payloadFingerprintCache.set(docKey, fp);
  if (typeof rawData._version === 'number') {
    documentVersionCache.set(docKey, rawData._version);
  }
}

interface FirestoreErrorInfo {
  error: string;
  code?: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function formatFirestoreErrorMessage(
  error: unknown,
  operationType: OperationType,
  path: string | null
): { code: string; message: string; isOffline: boolean; isNotFound: boolean } {
  const code = String((error as any)?.code || '').toLowerCase();
  const rawMessage = error instanceof Error ? error.message : String(error);
  const lowerMsg = rawMessage.toLowerCase();

  const isOffline =
    code === 'unavailable' ||
    lowerMsg.includes('the client is offline') ||
    lowerMsg.includes('could not reach cloud firestore backend') ||
    lowerMsg.includes('network error');

  if (isOffline) {
    return {
      code: code || 'unavailable',
      message: 'الاتصال بقاعدة البيانات السحابية متوقف حالياً، يتم العمل من الذاكرة المخبأة.',
      isOffline: true,
      isNotFound: false,
    };
  }

  if (code === 'not-found') {
    return {
      code: 'not-found',
      message: `المستند غير موجود على المسار (${path || ''}).`,
      isOffline: false,
      isNotFound: true,
    };
  }

  if (code === 'resource-exhausted' || lowerMsg.includes('quota') || lowerMsg.includes('resource_exhausted')) {
    return {
      code: 'resource-exhausted',
      message: `تم تجاوز الحد اليومي المجاني لقراءات Firestore على المسار (${path || ''}) — يتم استخدام قناة الخادم الاحتياطية لحين تجدد الحصة أو ترقية الخطة.`,
      isOffline: false,
      isNotFound: false,
    };
  }

  if (code === 'permission-denied' || lowerMsg.includes('permission_denied') || lowerMsg.includes('missing or insufficient permissions')) {
    return {
      code: 'permission-denied',
      message: `صلاحيات الوصول غير كافية لتنفيذ (${operationType}) على المسار (${path || ''}) وفق قواعد الأمان.`,
      isOffline: false,
      isNotFound: false,
    };
  }

  return {
    code: code || 'unknown',
    message: `تعذر إتمام العملية (${operationType}) على المسار (${path || ''}): ${rawMessage.slice(0, 140)}`,
    isOffline: false,
    isNotFound: false,
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const decoded = formatFirestoreErrorMessage(error, operationType, path);

  if (decoded.isOffline) {
    notifySyncState({ status: 'offline' });
    console.warn(`Firestore operating in offline/cached mode for ${operationType} on ${path}`);
    return;
  }

  if (decoded.isNotFound) {
    // Missing optional document is not a fatal sync error
    return;
  }

  if (decoded.code === 'resource-exhausted') {
    notifySyncState({ status: 'offline' });
    console.warn(`Firestore quota exceeded for ${operationType} on ${path}. Falling back to local cache.`);
    return;
  }

  notifySyncState({
    status: 'error',
    lastError: decoded.message,
    lastErrorCode: decoded.code,
  });

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    code: decoded.code,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Notice: ', JSON.stringify(errInfo));
}

function clearSyncErrorIfRecovered() {
  if (syncState.lastError || syncState.status === 'error' || syncState.status === 'offline') {
    notifySyncState({ status: 'online', lastError: null, lastErrorCode: null });
  }
}

// Connection check using an allowed collection path with deduplicated cache + HTTP fallback
export async function testFirestoreConnection() {
  try {
    await getDocument('settings', 'campaign');
    clearSyncErrorIfRecovered();
  } catch {
    notifySyncState({ status: 'offline' });
  }
}

function normalizeTimestampField(val: any): string {
  if (!val) return new Date().toISOString().split('T')[0] || '';
  if (typeof val === 'string') return val;
  if (typeof val?.toDate === 'function') {
    try {
      return val.toDate().toISOString().split('T')[0] || '';
    } catch {
      return new Date().toISOString().split('T')[0] || '';
    }
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString().split('T')[0] || '';
  }
  if (val instanceof Date) {
    return val.toISOString().split('T')[0] || '';
  }
  return new Date().toISOString().split('T')[0] || '';
}

function normalizeDocData<T>(raw: Record<string, any>, id: string, collectionPath?: string): T {
  const result: Record<string, any> = { ...raw, id };
  if ('createdAt' in result && typeof result.createdAt !== 'string') {
    result.createdAt = normalizeTimestampField(result.createdAt);
  }
  if ('updatedAt' in result && typeof result.updatedAt !== 'string') {
    result.updatedAt = normalizeTimestampField(result.updatedAt);
  }
  if (collectionPath) {
    recordDocumentCacheState(collectionPath, id, result);
  }
  return result as T;
}

// Generic CRUD helpers with error handling, deduplication, diffing, version control & Base64 media stripping
export async function getDocuments<T>(path: string, options?: { bypassCache?: boolean }): Promise<T[]> {
  if (!options?.bypassCache) {
    const cached = collectionReadCache.get(path);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T[];
    }
    const inflight = inflightCollectionReads.get(path);
    if (inflight) {
      return inflight as Promise<T[]>;
    }
  }

  const reqPromise = (async () => {
    try {
      const snap = await getDocs(collection(db, path));
      const docs = snap.docs.map((d) => normalizeDocData<T>(d.data(), d.id, path));
      collectionReadCache.set(path, { data: docs, expiresAt: Date.now() + READ_CACHE_TTL_MS });
      clearSyncErrorIfRecovered();
      return docs;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return collectionReadCache.get(path)?.data || [];
    } finally {
      inflightCollectionReads.delete(path);
    }
  })();

  inflightCollectionReads.set(path, reqPromise);
  return reqPromise;
}

export async function getDocument<T>(path: string, id: string, options?: { bypassCache?: boolean }): Promise<T | null> {
  const docKey = `${path}/${id}`;
  if (!options?.bypassCache) {
    const cached = docReadCache.get(docKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T | null;
    }
    const inflight = inflightDocReads.get(docKey);
    if (inflight) {
      return inflight as Promise<T | null>;
    }
  }

  const reqPromise = (async () => {
    try {
      const snap = await getDoc(doc(db, path, id));
      const data = snap.exists() ? normalizeDocData<T>(snap.data(), snap.id, path) : null;
      docReadCache.set(docKey, { data, expiresAt: Date.now() + READ_CACHE_TTL_MS });
      clearSyncErrorIfRecovered();
      return data;
    } catch (error) {
      // If reading settings/campaign via client SDK fails (e.g. free-tier quota exhausted), try server cached endpoint
      if (docKey === 'settings/campaign' && typeof window !== 'undefined') {
        try {
          const resp = await fetchWithTimeout('/api/settings/campaign', { timeoutMs: 4000 });
          const ct = resp.headers.get('content-type') || '';
          if (resp.ok && ct.includes('application/json')) {
            const payload = await resp.json();
            if (payload?.data) {
              docReadCache.set(docKey, { data: payload.data, expiresAt: Date.now() + READ_CACHE_TTL_MS });
              if (payload.source === 'firestore_live') {
                clearSyncErrorIfRecovered();
              } else {
                handleFirestoreError(error, OperationType.GET, docKey);
              }
              return payload.data as T;
            }
          }
        } catch {
          // fall through to standard error handling
        }
      }
      handleFirestoreError(error, OperationType.GET, docKey);
      return (docReadCache.get(docKey)?.data as T | null) ?? null;
    } finally {
      inflightDocReads.delete(docKey);
    }
  })();

  inflightDocReads.set(docKey, reqPromise);
  return reqPromise;
}

function cleanData<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (
    obj instanceof Date ||
    obj instanceof Timestamp ||
    Array.isArray(obj) ||
    '_methodName' in (obj as Record<string, any>) ||
    typeof (obj as Record<string, any>).toDate === 'function' ||
    (obj.constructor && obj.constructor.name === 'FieldValue')
  ) {
    return obj;
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = cleanData(value);
    }
  }
  return cleaned as T;
}

export async function setDocument(
  path: string,
  id: string,
  data: any,
  options?: { forceWrite?: boolean }
): Promise<{ confirmed: boolean; skipped?: boolean; version?: number }> {
  const docKey = `${path}/${id}`;
  try {
    // 1. Automatically convert & upload any raw Base64 media fields to Storage so Firestore stays 100% clean
    const mediaSanitized =
      path === 'activityLogs' ? data : await sanitizeDocumentMediaFields(path, id, data);

    // 2. Check if payload is identical to what is already saved in Firestore (skip redundant write)
    const candidateFp = computePayloadFingerprint({ ...mediaSanitized, id });
    const existingFp = payloadFingerprintCache.get(docKey);
    if (!options?.forceWrite && existingFp && existingFp === candidateFp) {
      notifySyncState({
        skippedRedundantWrites: syncState.skippedRedundantWrites + 1,
      });
      return {
        confirmed: true,
        skipped: true,
        version: documentVersionCache.get(docKey) || 1,
      };
    }

    notifySyncState({
      status: 'saving',
      pendingWrites: syncState.pendingWrites + 1,
      lastError: null,
    });

    const nextVersion = (documentVersionCache.get(docKey) || Number(mediaSanitized._version || 0)) + 1;
    const nowIso = new Date().toISOString();

    const payload = cleanData({
      ...mediaSanitized,
      _version: nextVersion,
      updatedAtIso: nowIso,
      updatedAt: serverTimestamp(),
      createdAt:
        typeof mediaSanitized.createdAt === 'string' && mediaSanitized.createdAt
          ? mediaSanitized.createdAt
          : nowIso.split('T')[0],
    });

    await setDoc(doc(db, path, id), payload);

    payloadFingerprintCache.set(docKey, candidateFp);
    documentVersionCache.set(docKey, nextVersion);
    invalidateReadCaches(path, id);

    // Keep server-side warm settings cache in sync cleanly
    if (docKey === 'settings/campaign' && typeof window !== 'undefined') {
      docReadCache.set(docKey, { data: { ...mediaSanitized, id }, expiresAt: Date.now() + READ_CACHE_TTL_MS });
      auth.currentUser?.getIdToken().then((token) => {
        fetchWithTimeout('/api/settings/campaign', {
          method: 'PUT',
          timeoutMs: 5000,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ data: mediaSanitized, syncCacheOnly: true }),
        }).catch(() => {});
      }).catch(() => {});
    }

    notifySyncState({
      status: 'synced',
      pendingWrites: Math.max(0, syncState.pendingWrites - 1),
      lastSyncedAt: nowIso,
      lastError: null,
      lastErrorCode: null,
    });

    return { confirmed: true, skipped: false, version: nextVersion };
  } catch (error) {
    notifySyncState({
      pendingWrites: Math.max(0, syncState.pendingWrites - 1),
    });
    handleFirestoreError(error, OperationType.WRITE, docKey);
    return { confirmed: false };
  }
}

export async function updateDocument(
  path: string,
  id: string,
  data: any,
  options?: { forceWrite?: boolean }
): Promise<{ confirmed: boolean; skipped?: boolean; version?: number }> {
  const docKey = `${path}/${id}`;
  try {
    // 1. Automatically convert & upload any raw Base64 media fields to Storage
    const mediaSanitized = await sanitizeDocumentMediaFields(path, id, data);

    // 2. Check if payload is identical to what is already saved in Firestore
    const candidateFp = computePayloadFingerprint({ ...mediaSanitized, id });
    const existingFp = payloadFingerprintCache.get(docKey);
    if (!options?.forceWrite && existingFp && existingFp === candidateFp) {
      notifySyncState({
        skippedRedundantWrites: syncState.skippedRedundantWrites + 1,
      });
      return {
        confirmed: true,
        skipped: true,
        version: documentVersionCache.get(docKey) || 1,
      };
    }

    notifySyncState({
      status: 'saving',
      pendingWrites: syncState.pendingWrites + 1,
      lastError: null,
    });

    const nextVersion = (documentVersionCache.get(docKey) || Number(mediaSanitized._version || 0)) + 1;
    const nowIso = new Date().toISOString();

    const payload = cleanData({
      ...mediaSanitized,
      _version: nextVersion,
      updatedAtIso: nowIso,
      updatedAt: serverTimestamp(),
    });

    try {
      await updateDoc(doc(db, path, id), payload);
    } catch {
      // If document did not exist yet, create it cleanly with setDoc merge
      await setDoc(doc(db, path, id), payload, { merge: true });
    }

    payloadFingerprintCache.set(docKey, candidateFp);
    documentVersionCache.set(docKey, nextVersion);
    invalidateReadCaches(path, id);

    notifySyncState({
      status: 'synced',
      pendingWrites: Math.max(0, syncState.pendingWrites - 1),
      lastSyncedAt: nowIso,
      lastError: null,
      lastErrorCode: null,
    });

    return { confirmed: true, skipped: false, version: nextVersion };
  } catch (error) {
    notifySyncState({
      pendingWrites: Math.max(0, syncState.pendingWrites - 1),
    });
    handleFirestoreError(error, OperationType.UPDATE, docKey);
    return { confirmed: false };
  }
}

export async function removeDocument(path: string, id: string): Promise<boolean> {
  const docKey = `${path}/${id}`;
  try {
    notifySyncState({
      status: 'saving',
      pendingWrites: syncState.pendingWrites + 1,
    });
    await deleteDoc(doc(db, path, id));
    payloadFingerprintCache.delete(docKey);
    documentVersionCache.delete(docKey);
    invalidateReadCaches(path, id);
    notifySyncState({
      status: 'synced',
      pendingWrites: Math.max(0, syncState.pendingWrites - 1),
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      lastErrorCode: null,
    });
    return true;
  } catch (error) {
    notifySyncState({
      pendingWrites: Math.max(0, syncState.pendingWrites - 1),
    });
    handleFirestoreError(error, OperationType.DELETE, docKey);
    return false;
  }
}

export async function batchSetDocuments(
  path: string,
  items: Array<{ id: string; data: any }>
): Promise<boolean> {
  if (items.length === 0) return true;
  try {
    notifySyncState({
      status: 'saving',
      pendingWrites: syncState.pendingWrites + 1,
    });
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();

    for (const item of items) {
      const docKey = `${path}/${item.id}`;
      const sanitized = await sanitizeDocumentMediaFields(path, item.id, item.data);
      const nextVersion = (documentVersionCache.get(docKey) || 0) + 1;
      const payload = cleanData({
        ...sanitized,
        _version: nextVersion,
        updatedAtIso: nowIso,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, path, item.id), payload, { merge: true });
      payloadFingerprintCache.set(docKey, computePayloadFingerprint({ ...sanitized, id: item.id }));
      documentVersionCache.set(docKey, nextVersion);
    }

    await batch.commit();
    invalidateReadCaches(path);
    notifySyncState({
      status: 'synced',
      pendingWrites: Math.max(0, syncState.pendingWrites - 1),
      lastSyncedAt: nowIso,
      lastError: null,
      lastErrorCode: null,
    });
    return true;
  } catch (error) {
    notifySyncState({
      pendingWrites: Math.max(0, syncState.pendingWrites - 1),
    });
    handleFirestoreError(error, OperationType.WRITE, path);
    return false;
  }
}

export function subscribeToCollection<T>(path: string, callback: (data: T[]) => void) {
  return onSnapshot(
    collection(db, path),
    (snap) => {
      clearSyncErrorIfRecovered();
      const docs = snap.docs.map((d) => normalizeDocData<T>(d.data(), d.id, path));
      collectionReadCache.set(path, { data: docs, expiresAt: Date.now() + READ_CACHE_TTL_MS });
      callback(docs);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeToDocument<T>(path: string, id: string, callback: (data: T | null) => void) {
  const docKey = `${path}/${id}`;
  return onSnapshot(
    doc(db, path, id),
    (snap) => {
      clearSyncErrorIfRecovered();
      const data = snap.exists() ? normalizeDocData<T>(snap.data(), snap.id, path) : null;
      docReadCache.set(docKey, { data, expiresAt: Date.now() + READ_CACHE_TTL_MS });
      callback(data);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, docKey);
    }
  );
}

export async function queryDocuments<T>(
  path: string,
  field: string,
  operator: any,
  value: any
): Promise<T[]> {
  try {
    const q = query(collection(db, path), where(field, operator, value));
    const snap = await getDocs(q);
    clearSyncErrorIfRecovered();
    return snap.docs.map((d) => normalizeDocData<T>(d.data(), d.id, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export function subscribeToQuery<T>(
  path: string,
  field: string,
  operator: any,
  value: any,
  callback: (data: T[]) => void
) {
  const q = query(collection(db, path), where(field, operator, value));
  return onSnapshot(
    q,
    (snap) => {
      clearSyncErrorIfRecovered();
      callback(snap.docs.map((d) => normalizeDocData<T>(d.data(), d.id, path)));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

const seasonPilgrimsCache = new Map<string, { data: any[]; expiresAt: number }>();

export async function getSeasonPilgrims<T = any>(seasonYear: string = '1448'): Promise<T[]> {
  const cached = seasonPilgrimsCache.get(seasonYear);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T[];
  }
  try {
    const q = query(collection(db, 'pilgrims'), where('seasonYear', '==', seasonYear));
    const snap = await getDocs(q);
    clearSyncErrorIfRecovered();
    const docs = snap.docs.map((d) => normalizeDocData<T>(d.data(), d.id, 'pilgrims'));
    if (docs.length > 0) {
      seasonPilgrimsCache.set(seasonYear, { data: docs, expiresAt: Date.now() + READ_CACHE_TTL_MS });
      return docs;
    }
    const allSnap = await getDocs(collection(db, 'pilgrims'));
    const filtered = allSnap.docs
      .map((d) => normalizeDocData<T>(d.data(), d.id, 'pilgrims'))
      .filter(
        (p: any) =>
          p.seasonYear === seasonYear ||
          p.hajjYear === seasonYear ||
          (p.id && p.id.includes(`_${seasonYear}`)) ||
          (!p.seasonYear && !p.hajjYear && seasonYear === '1448')
      );
    seasonPilgrimsCache.set(seasonYear, { data: filtered, expiresAt: Date.now() + READ_CACHE_TTL_MS });
    return filtered;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'pilgrims');
    return (cached?.data as T[]) || [];
  }
}

export function subscribeToSeasonPilgrims<T = any>(
  seasonYear: string = '1448',
  callback: (data: T[]) => void
) {
  let didFallbackScan = false;
  const q = query(collection(db, 'pilgrims'), where('seasonYear', '==', seasonYear));
  return onSnapshot(
    q,
    (snap) => {
      clearSyncErrorIfRecovered();
      const items = snap.docs.map((d) => normalizeDocData<T>(d.data(), d.id, 'pilgrims'));
      if (items.length > 0) {
        seasonPilgrimsCache.set(seasonYear, { data: items, expiresAt: Date.now() + READ_CACHE_TTL_MS });
        callback(items);
      } else if (!didFallbackScan) {
        didFallbackScan = true;
        getDocuments<T>('pilgrims')
          .then((allItems) => {
            const matched = allItems.filter(
              (p: any) =>
                p.seasonYear === seasonYear ||
                p.hajjYear === seasonYear ||
                (p.id && p.id.includes(`_${seasonYear}`)) ||
                (!p.seasonYear && !p.hajjYear && seasonYear === '1448')
            );
            callback(matched);
          })
          .catch(() => {
            callback([]);
          });
      } else {
        callback([]);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'pilgrims');
    }
  );
}

// ============================================================================
// One-Time Database Seeding Protection (`settings/systemMeta`)
// Guarantees that default seed data NEVER overwrites real or edited data!
// ============================================================================
let seedCheckInProgress = false;
const SEED_SESSION_CONFIRMED_KEY = 'qaem_system_seeded_confirmed_v2';

export async function ensureSystemSeededOnce(params: {
  defaultPackages: any[];
  defaultAnnouncements: any[];
  defaultCampaignSettings: any;
  initialAdminUsers: any[];
}): Promise<void> {
  if (seedCheckInProgress) return;
  if (safeSessionStorage.getItem(SEED_SESSION_CONFIRMED_KEY) === '1') {
    return;
  }
  seedCheckInProgress = true;

  try {
    // Never attempt seeding if browser is offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    const metaRef = doc(db, 'settings', 'systemMeta');
    const metaSnap = await getDoc(metaRef);

    if (metaSnap.exists() && metaSnap.data()?.isSeeded === true) {
      safeSessionStorage.setItem(SEED_SESSION_CONFIRMED_KEY, '1');
      // Database has already been initialized — NEVER re-seed or overwrite packages/prices/settings!
      return;
    }

    // Check if there is already real data in packages, settings/campaign, or announcements
    const [existingPackagesSnap, existingCampaignSnap, existingAdminsSnap] = await Promise.all([
      getDocs(collection(db, 'packages')),
      getDoc(doc(db, 'settings', 'campaign')),
      getDocs(collection(db, 'adminUsers')),
    ]);

    const hasPackages = existingPackagesSnap.docs.length > 0;
    const hasCampaign = existingCampaignSnap.exists();
    const hasAdmins = existingAdminsSnap.docs.length > 0;

    if (hasPackages || hasCampaign) {
      // Existing data is already present! Lock `isSeeded: true` immediately without overwriting anything.
      await setDoc(
        metaRef,
        {
          isSeeded: true,
          seededAt: new Date().toISOString(),
          schemaVersion: 2,
          note: 'Existing production data detected and protected from seed overwrite',
        },
        { merge: true }
      );

      if (!hasAdmins) {
        for (const admin of params.initialAdminUsers) {
          await setDocument('adminUsers', admin.id, admin);
        }
      }
      return;
    }

    // Genuinely brand-new empty database: perform one-time atomic seed
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();

    for (const pkg of params.defaultPackages) {
      batch.set(doc(db, 'packages', pkg.id), {
        ...pkg,
        _version: 1,
        updatedAtIso: nowIso,
        updatedAt: serverTimestamp(),
      });
    }
    for (const ann of params.defaultAnnouncements) {
      batch.set(doc(db, 'announcements', ann.id), {
        ...ann,
        _version: 1,
        updatedAtIso: nowIso,
        updatedAt: serverTimestamp(),
      });
    }
    batch.set(doc(db, 'settings', 'campaign'), {
      ...params.defaultCampaignSettings,
      _version: 1,
      updatedAtIso: nowIso,
      updatedAt: serverTimestamp(),
    });
    if (!hasAdmins) {
      for (const admin of params.initialAdminUsers) {
        batch.set(doc(db, 'adminUsers', admin.id), {
          ...admin,
          _version: 1,
          updatedAtIso: nowIso,
          updatedAt: serverTimestamp(),
        });
      }
    }
    batch.set(metaRef, {
      isSeeded: true,
      seededAt: nowIso,
      schemaVersion: 2,
    });

    await batch.commit();
  } catch (err) {
    console.warn('Initial seed check notice:', err);
  } finally {
    seedCheckInProgress = false;
  }
}

// ============================================================================
// Full System Backup & Restore Utility (All 28+ Collections)
// ============================================================================
const FULL_BACKUP_COLLECTIONS = [
  'packages',
  'announcements',
  'pilgrims',
  'adminUsers',
  'settings',
  'feedback',
  'activityLogs',
  'notifications',
  'pilgrim_notifications',
  'gift_distributions',
  'gift_communications',
  'religious_guides',
  'religious_programs',
  'religious_lessons',
  'religious_attendance',
  'religious_questions',
  'religious_assessments',
  'religious_pilgrim_progress',
  'religious_references',
  'religious_inquiries',
  'religious_fiqh_sections',
  'mediaAssets',
  'seasons',
  'cultural_programs',
  'advisor_knowledge',
  'advisor_inquiries',
  'manasik_stages',
  'pilgrim_manasik_progress',
  'siteStats',
  'registration_forms',
] as const;

export interface SystemBackupDownloadResult {
  fileName: string;
  totalCollections: number;
  totalDocuments: number;
  exportedAt: string;
  failedCollections: string[];
}

export async function createSystemBackupSnapshot() {
  const failedCollections: string[] = [];

  const safeFetchCollection = async (colPath: string): Promise<any[]> => {
    try {
      const snap = await getDocs(collection(db, colPath));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn(`Backup warning: failed to fetch collection "${colPath}"`, err);
      failedCollections.push(colPath);
      return [];
    }
  };

  const safeFetchSubcollection = async (
    parentCol: string,
    parentDoc: string,
    subCol: string,
    label: string
  ): Promise<any[]> => {
    try {
      const snap = await getDocs(collection(db, parentCol, parentDoc, subCol));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn(`Backup warning: failed to fetch subcollection "${label}"`, err);
      return [];
    }
  };

  // Fetch all 29 top-level collections + campaign settings doc + mediaStore subcollections
  const [collectionEntries, campaignSettings, mediaStoreAssets, mediaStoreChunks] =
    await Promise.all([
      Promise.all(
        FULL_BACKUP_COLLECTIONS.map(async (colName) => {
          const docs = await safeFetchCollection(colName);
          return [colName, docs] as const;
        })
      ),
      getDocument('settings', 'campaign').catch(() => null),
      safeFetchSubcollection('settings', 'mediaStore', 'assets', 'settings/mediaStore/assets'),
      safeFetchSubcollection('settings', 'mediaStore', 'chunks', 'settings/mediaStore/chunks'),
    ]);

  const collectionsMap: Record<string, any[]> = {};
  const counts: Record<string, number> = {};
  let totalDocuments = 0;

  for (const [colName, docs] of collectionEntries) {
    collectionsMap[colName] = docs;
    counts[colName] = docs.length;
    totalDocuments += docs.length;
  }

  counts.mediaStoreAssets = mediaStoreAssets.length;
  counts.mediaStoreChunks = mediaStoreChunks.length;
  totalDocuments += mediaStoreAssets.length + mediaStoreChunks.length;

  const exportedAt = new Date().toISOString();

  const snapshot = {
    backupVersion: '3.0',
    exportedAt,
    system: 'قافلة القائم للحج والعمرة - النسخة الاحتياطية المركزية الشاملة',
    summary: {
      totalCollections: FULL_BACKUP_COLLECTIONS.length,
      totalDocuments,
      failedCollections,
    },
    counts,
    data: {
      ...collectionsMap,
      // Backwards-compatible explicit keys
      campaignSettings:
        campaignSettings ||
        collectionsMap.settings?.find((s: any) => s.id === 'campaign') ||
        null,
      religiousGuides: collectionsMap.religious_guides || [],
      religiousPrograms: collectionsMap.religious_programs || [],
      religiousLessons: collectionsMap.religious_lessons || [],
      religiousFiqhSections: collectionsMap.religious_fiqh_sections || [],
      mediaStore: {
        assets: mediaStoreAssets,
        chunks: mediaStoreChunks,
      },
    },
  };

  return snapshot;
}

export async function downloadSystemBackupJson(): Promise<SystemBackupDownloadResult> {
  const snapshot = await createSystemBackupSnapshot();
  const jsonString = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const datePart = new Date().toISOString().split('T')[0];
  const fileName = `نسخة-احتياطية-شاملة-قافلة-القائم-${datePart}.json`;
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return {
    fileName,
    totalCollections: snapshot.summary.totalCollections,
    totalDocuments: snapshot.summary.totalDocuments,
    exportedAt: snapshot.exportedAt,
    failedCollections: snapshot.summary.failedCollections,
  };
}

const LOCAL_LOGS_KEY = 'qaem_activity_logs_v1';

export function getCachedActivityLogs(): any[] {
  return safeStorage.getJSON<any[]>(LOCAL_LOGS_KEY, []);
}

export async function recordActivityLog(params: {
  adminId?: string;
  adminName: string;
  username?: string;
  userRole?: string;
  category?:
    | 'تسجيل دخول / خروج'
    | 'الأمان والمصادقة'
    | 'إدارة الحجاج'
    | 'المالية والإيصالات'
    | 'الباقات والإعلانات'
    | 'المشرفين والإعدادات'
    | 'بوابة الحاج والتسجيل'
    | 'تصدير الكشوفات والتقارير';
  severity?: 'info' | 'warning' | 'critical';
  action: string;
  target: string;
  details?: string;
  previousValue?: string;
  newValue?: string;
}) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone
  const timeStr = now.toLocaleTimeString('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  const id = `log-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`;

  const logEntry = {
    id,
    adminId: params.adminId || auth.currentUser?.uid || 'user',
    adminName: params.adminName || 'مستخدم النظام',
    username: params.username || auth.currentUser?.email || 'system',
    userRole: params.userRole || 'مستخدم',
    category: params.category || 'إدارة الحجاج',
    severity: params.severity || 'info',
    action: params.action,
    target: params.target,
    details: params.details || '',
    previousValue: params.previousValue || '',
    newValue: params.newValue || '',
    date: dateStr,
    time: timeStr,
    timestamp: now.toISOString(),
    createdAt: dateStr,
  };

  try {
    const existing = getCachedActivityLogs();
    const updated = [logEntry, ...existing].slice(0, 300);
    safeStorage.setJSON(LOCAL_LOGS_KEY, updated);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('qaem-activity-logged', { detail: logEntry }));
    }
  } catch {
    // Ignore storage/event errors
  }

  await setDocument('activityLogs', id, logEntry);
  return logEntry;
}

// ============================================================================
// Server-Side Daily Filtering & Cursor Pagination for Audit / Activity Logs
// Uses single-field timestamp range queries (no custom composite index needed)
// with fallback to single-field `date` equality for legacy records.
// ============================================================================

export function getLocalDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone
}

export function getLocalDayTimestampBounds(dateStr: string): {
  startIso: string;
  endIso: string;
} {
  const parts = String(dateStr || '').split('-').map(Number);
  const now = new Date();
  const year = Number.isFinite(parts[0]) && parts[0] > 1900 ? parts[0] : now.getFullYear();
  const month = Number.isFinite(parts[1]) && parts[1] >= 1 && parts[1] <= 12 ? parts[1] - 1 : now.getMonth();
  const day = Number.isFinite(parts[2]) && parts[2] >= 1 && parts[2] <= 31 ? parts[2] : now.getDate();

  const start = new Date(year, month, day, 0, 0, 0, 0);
  const end = new Date(year, month, day, 23, 59, 59, 999);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export interface ActivityLogsPageResult<T = any> {
  items: T[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
  usedDateFallback: boolean;
}

/**
 * Returns the exact server-side document count of activity logs for a single local day
 * using Firestore's getCountFromServer aggregation (minimal read cost, zero doc downloads).
 */
export async function getActivityLogsDayCount(dateStr: string): Promise<number> {
  const { startIso, endIso } = getLocalDayTimestampBounds(dateStr);
  try {
    const colRef = collection(db, 'activityLogs');
    const tsQuery = query(
      colRef,
      where('timestamp', '>=', startIso),
      where('timestamp', '<=', endIso)
    );
    const tsCountSnap = await getCountFromServer(tsQuery);
    const tsCount = tsCountSnap.data().count;
    if (tsCount > 0) return tsCount;

    // Fallback check for legacy logs that may have `date` set without an ISO `timestamp`
    const dateQuery = query(colRef, where('date', '==', dateStr));
    const dateCountSnap = await getCountFromServer(dateQuery);
    return dateCountSnap.data().count;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `activityLogs?countDate=${dateStr}`);
    // Graceful offline fallback using locally cached entries for that day
    const local = getCachedActivityLogs();
    return local.filter(
      (l) => (l?.date || (typeof l?.timestamp === 'string' ? l.timestamp.split('T')[0] : '')) === dateStr
    ).length;
  }
}

/**
 * Server-side paginated query for a single calendar day (default 100 records/page),
 * ordered newest-to-oldest using cursor-based `startAfter`.
 */
export async function fetchActivityLogsPageByDate<T = any>(params: {
  dateStr: string;
  pageSize?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
}): Promise<ActivityLogsPageResult<T>> {
  const { dateStr, pageSize = 100, cursor = null } = params;
  const { startIso, endIso } = getLocalDayTimestampBounds(dateStr);

  try {
    const colRef = collection(db, 'activityLogs');
    const constraints: any[] = [
      where('timestamp', '>=', startIso),
      where('timestamp', '<=', endIso),
      orderBy('timestamp', 'desc'),
    ];
    if (cursor) {
      constraints.push(startAfter(cursor));
    }
    constraints.push(limit(pageSize));

    const snap = await getDocs(query(colRef, ...constraints));

    if (!cursor && snap.empty) {
      // Fallback for legacy records storing `date` without ISO `timestamp`
      const fallbackSnap = await getDocs(
        query(colRef, where('date', '==', dateStr), limit(pageSize))
      );
      if (!fallbackSnap.empty) {
        const fallbackItems = fallbackSnap.docs
          .map((d) => ({ ...d.data(), id: d.id } as T))
          .sort((a: any, b: any) =>
            String(b.timestamp || b.id || '').localeCompare(String(a.timestamp || a.id || ''))
          );
        return {
          items: fallbackItems,
          lastDoc: fallbackSnap.docs[fallbackSnap.docs.length - 1] || null,
          hasMore: fallbackSnap.docs.length >= pageSize,
          usedDateFallback: true,
        };
      }
    }

    const items = snap.docs.map((d) => ({ ...d.data(), id: d.id } as T));
    const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

    return {
      items,
      lastDoc,
      hasMore: snap.docs.length >= pageSize,
      usedDateFallback: false,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `activityLogs?date=${dateStr}`);
    if (!cursor) {
      const local = getCachedActivityLogs()
        .filter(
          (l) => (l?.date || (typeof l?.timestamp === 'string' ? l.timestamp.split('T')[0] : '')) === dateStr
        )
        .sort((a: any, b: any) =>
          String(b.timestamp || b.date || '').localeCompare(String(a.timestamp || a.date || ''))
        )
        .slice(0, pageSize);
      return {
        items: local as T[],
        lastDoc: null,
        hasMore: false,
        usedDateFallback: true,
      };
    }
    return { items: [], lastDoc: null, hasMore: false, usedDateFallback: false };
  }
}

/**
 * Fetches all activity logs strictly for ONE selected calendar day in server-side
 * batches (never touching other days/months). Used on-demand when applying
 * day-level text/category/user filters or exporting Excel/PDF reports.
 */
export async function fetchAllActivityLogsForDate<T = any>(
  dateStr: string,
  maxDocs = 5000
): Promise<T[]> {
  const { startIso, endIso } = getLocalDayTimestampBounds(dateStr);
  const batchSize = 500;
  const collected: T[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;

  try {
    const colRef = collection(db, 'activityLogs');

    while (collected.length < maxDocs) {
      const remaining = Math.min(batchSize, maxDocs - collected.length);
      const constraints: any[] = [
        where('timestamp', '>=', startIso),
        where('timestamp', '<=', endIso),
        orderBy('timestamp', 'desc'),
      ];
      if (cursor) {
        constraints.push(startAfter(cursor));
      }
      constraints.push(limit(remaining));

      const snap = await getDocs(query(colRef, ...constraints));
      if (snap.empty) break;

      for (const d of snap.docs) {
        collected.push({ ...d.data(), id: d.id } as T);
      }

      if (snap.docs.length < remaining) break;
      cursor = snap.docs[snap.docs.length - 1];
    }

    if (collected.length === 0) {
      const fallbackSnap = await getDocs(
        query(colRef, where('date', '==', dateStr), limit(maxDocs))
      );
      if (!fallbackSnap.empty) {
        return fallbackSnap.docs
          .map((d) => ({ ...d.data(), id: d.id } as T))
          .sort((a: any, b: any) =>
            String(b.timestamp || b.id || '').localeCompare(String(a.timestamp || a.id || ''))
          );
      }
    }

    return collected;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `activityLogs?exportDate=${dateStr}`);
    return getCachedActivityLogs()
      .filter(
        (l) => (l?.date || (typeof l?.timestamp === 'string' ? l.timestamp.split('T')[0] : '')) === dateStr
      )
      .sort((a: any, b: any) =>
        String(b.timestamp || b.date || '').localeCompare(String(a.timestamp || a.date || ''))
      ) as T[];
  }
}
