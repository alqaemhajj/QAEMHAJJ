import fs from 'fs';
import path from 'path';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  AdvisorInquiryLog,
  AdvisorKnowledgeItem,
  Announcement,
  CampaignSettings,
  HajjPackage,
  ManasikStage,
  Pilgrim,
} from '../types';
import {
  announcements as defaultAnnouncements,
  defaultCampaignSettings,
  defaultSiteTexts,
  hajjPackages as defaultPackages,
  initialAdminUsers,
} from '../data/initialData';
import { INITIAL_MANASIK_STAGES } from '../data/manasikSeedData';
import { evaluatePackageStatus, formatRegistrationDeadlineAr } from '../utils/packageStatus';

export interface PublicPackageForAdvisor {
  id: string;
  title: string;
  type: string;
  price: string;
  displayPrice: string;
  hasDefinedPrice: boolean;
  transport: string;
  accommodationMakkah: string;
  accommodationMadinah: string;
  campMina: string;
  features: string[];
  seasonYear?: string;
  isAvailableForRegistration: boolean;
  publicStatusLabel: string;
  registrationDeadlineFormatted?: string;
  updatedAtIso?: string;
}

interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
}

const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
let cachedConfig: FirebaseAppletConfig | null = null;

export function getFirebaseAppletConfig(): FirebaseAppletConfig {
  if (cachedConfig) return cachedConfig;
  const raw = fs.readFileSync(configPath, 'utf-8');
  cachedConfig = JSON.parse(raw) as FirebaseAppletConfig;
  return cachedConfig;
}

/**
 * Converts Firestore Timestamp objects or internal SDK representations into plain JSON-safe values.
 */
function sanitizeFirestoreValue(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch {
      return String(val);
    }
  }
  if (typeof val.seconds === 'number' && typeof val.nanoseconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeFirestoreValue);
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    if (v !== undefined) {
      out[k] = sanitizeFirestoreValue(v);
    }
  }
  return out;
}

function sanitizeFirestoreDoc<T = Record<string, any>>(data: any, id: string): T & { id: string } {
  const cleaned = sanitizeFirestoreValue(data || {});
  return {
    ...cleaned,
    id: cleaned.id || id,
  } as T & { id: string };
}

// ============================================================================
// Server Disk + Memory Warm Cache (Private server directory, never under public/)
// ============================================================================
const SERVER_CACHE_DIR = path.join(process.cwd(), '.server-cache');
const SETTINGS_CACHE_FILE = path.join(SERVER_CACHE_DIR, 'settings_campaign.json');
const KNOWLEDGE_CACHE_FILE = path.join(SERVER_CACHE_DIR, 'advisor_knowledge.json');
const INQUIRIES_CACHE_FILE = path.join(SERVER_CACHE_DIR, 'advisor_inquiries.json');
const PACKAGES_CACHE_FILE = path.join(SERVER_CACHE_DIR, 'packages_live.json');
const ANNOUNCEMENTS_CACHE_FILE = path.join(SERVER_CACHE_DIR, 'announcements_live.json');
const MANASIK_CACHE_FILE = path.join(SERVER_CACHE_DIR, 'manasik_stages_live.json');

function ensureCacheDir() {
  try {
    fs.mkdirSync(SERVER_CACHE_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function readJsonCache<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJsonCache(filePath: string, data: any) {
  try {
    ensureCacheDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

// Short in-memory TTL cache to keep responses fast while reflecting admin edits immediately
const MEM_TTL_MS = 5_000;
let settingsMemCache: { data: CampaignSettings; source: string; expiresAt: number } | null = null;
let knowledgeMemCache: { data: AdvisorKnowledgeItem[]; expiresAt: number } | null = null;
let packagesMemCache: { data: HajjPackage[]; expiresAt: number } | null = null;
let announcementsMemCache: { data: Announcement[]; expiresAt: number } | null = null;
let manasikMemCache: { data: ManasikStage[]; expiresAt: number } | null = null;

// ============================================================================
// Firebase Auth ID Token & Admin RBAC Verification (Supports both Google Auth & PIN Login)
// ============================================================================
const MASTER_ADMIN_EMAILS = new Set([
  'alqaemhajj313@gmail.com',
]);

export interface VerifiedAdminContext {
  uid: string;
  email: string;
  isAnonymous: boolean;
  adminName: string;
  adminRole: string;
  canManageAdvisor: boolean;
  canManageSettings: boolean;
}

export async function verifyAdminRequest(req: {
  headers: Record<string, string | string[] | undefined>;
}): Promise<{ authorized: boolean; status: number; error?: string; admin?: VerifiedAdminContext }> {
  const authHeader = String(req.headers['authorization'] || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const idToken = match?.[1]?.trim();
  const claimedUsername = decodeURIComponent(String(req.headers['x-admin-username'] || '')).trim().toLowerCase();
  const claimedAdminId = decodeURIComponent(String(req.headers['x-admin-id'] || '')).trim();

  let uid = '';
  let email = '';
  let emailVerified = false;
  let displayName = '';
  let isAnonymous = true;

  if (idToken) {
    try {
      const cfg = getFirebaseAppletConfig();
      const verifyResp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(cfg.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }
      );

      if (verifyResp.ok) {
        const verifyJson = (await verifyResp.json()) as any;
        const fbUser = verifyJson?.users?.[0];
        if (fbUser?.localId) {
          uid = String(fbUser.localId);
          email = String(fbUser.email || '').trim().toLowerCase();
          emailVerified = Boolean(fbUser.emailVerified);
          displayName = String(fbUser.displayName || '');
          const providerList = Array.isArray(fbUser.providerUserInfo) ? fbUser.providerUserInfo : [];
          isAnonymous = !email && providerList.length === 0;
        }
      }
    } catch {
      // Fall through to adminUsers verification if token lookup fails
    }
  }

  // 1. Strictly whitelisted Super Admin Google email (alqaemhajj313@gmail.com)
  if (email) {
    if (MASTER_ADMIN_EMAILS.has(email) && emailVerified) {
      return {
        authorized: true,
        status: 200,
        admin: {
          uid: uid || 'usr-1',
          email,
          isAnonymous: false,
          adminName: displayName || 'المالك الرئيسي — الإدارة العامة',
          adminRole: 'الإدارة العامة',
          canManageAdvisor: true,
          canManageSettings: true,
        },
      };
    }
    return {
      authorized: false,
      status: 403,
      error: 'عذراً، هذا الحساب غير مصرح له بالدخول عبر Google.',
    };
  }

  if (!claimedUsername && !claimedAdminId) {
    return {
      authorized: false,
      status: 401,
      error: 'يرجى تسجيل الدخول إلى لوحة التحكم أولاً لإجراء هذه العملية.',
    };
  }

  // 2. Load adminUsers from Firestore via Firebase SDK
  let adminsList: any[] = [];
  try {
    const snap = await getDocs(collection(db, 'adminUsers'));
    adminsList = snap.docs.map((d) => sanitizeFirestoreDoc<any>(d.data(), d.id));
  } catch {
    // fallback if offline
  }
  if (adminsList.length === 0) {
    adminsList = initialAdminUsers;
  }

  const matchedAdmin = adminsList.find((u) => {
    const uName = String(u.username || '').trim().toLowerCase();
    const uEmail = String(u.email || '').trim().toLowerCase();
    if (claimedAdminId && u.id === claimedAdminId) return true;
    if (claimedUsername && (uName === claimedUsername || uEmail === claimedUsername)) {
      return true;
    }
    return false;
  });

  if (!matchedAdmin) {
    return {
      authorized: false,
      status: 403,
      error: 'الحساب غير مسجل في قائمة مشرفي النظام المصرح لهم.',
    };
  }

  if (matchedAdmin.status === 'suspended') {
    return {
      authorized: false,
      status: 403,
      error: 'تم تعليق صلاحيات هذا الحساب الإداري.',
    };
  }

  const role = String(matchedAdmin.role || '');
  const isMaster =
    role === 'الإدارة العامة' ||
    role === 'مدير عام (Master Admin)' ||
    matchedAdmin.id === 'usr-1';
  const dp = matchedAdmin.detailedPermissions || {};
  const legacy = matchedAdmin.permissions || {};

  const canManageAdvisor =
    isMaster ||
    Boolean(
      dp?.religious?.edit ||
        dp?.religious?.create ||
        dp?.cultural?.edit ||
        dp?.cultural?.create ||
        dp?.packages?.edit ||
        dp?.staff_system?.edit ||
        legacy?.manageReligiousGuide ||
        legacy?.manageAnnouncements ||
        legacy?.manageStaff
    );
  const canManageSettings =
    isMaster ||
    Boolean(dp?.staff_system?.edit || dp?.settings?.edit || legacy?.manageStaff);

  return {
    authorized: true,
    status: 200,
    admin: {
      uid: uid || String(matchedAdmin.id || 'usr-1'),
      email: email || String(matchedAdmin.username || ''),
      isAnonymous,
      adminName: String(matchedAdmin.fullName || matchedAdmin.username || 'مشرف النظام'),
      adminRole: role,
      canManageAdvisor: true, // Any authenticated active supervisor in Admin Dashboard can manage Knowledge Base
      canManageSettings: canManageSettings || canManageAdvisor,
    },
  };
}

// ============================================================================
// Firestore SDK Read / Write Helpers
// ============================================================================
export async function listCollectionRest<T = Record<string, any>>(
  collectionPath: string,
  _bearerToken?: string
): Promise<Array<T & { id: string }>> {
  const snap = await getDocs(collection(db, collectionPath));
  return snap.docs.map((d) => sanitizeFirestoreDoc<T>(d.data(), d.id));
}

export interface CampaignSettingsResult {
  ok: boolean;
  exists: boolean;
  source:
    | 'firestore_live'
    | 'firestore_created_default'
    | 'memory_cache'
    | 'server_cache_quota_fallback'
    | 'defaults_fallback';
  quotaExceeded?: boolean;
  warning?: string;
  errorDetail?: string;
  data: CampaignSettings;
}

export async function getCampaignSettingsServer(options?: {
  bypassCache?: boolean;
  createIfMissing?: boolean;
}): Promise<CampaignSettingsResult> {
  if (!options?.bypassCache && settingsMemCache && settingsMemCache.expiresAt > Date.now()) {
    return {
      ok: true,
      exists: true,
      source: 'memory_cache',
      data: settingsMemCache.data,
    };
  }

  try {
    const snap = await getDoc(doc(db, 'settings', 'campaign'));
    if (snap.exists()) {
      const parsed = sanitizeFirestoreDoc<CampaignSettings>(snap.data(), snap.id);
      const merged: CampaignSettings = {
        ...defaultCampaignSettings,
        ...parsed,
        siteTexts: {
          ...defaultSiteTexts,
          ...(defaultCampaignSettings.siteTexts || {}),
          ...(parsed.siteTexts || {}),
        },
        socialAccounts: {
          ...(defaultCampaignSettings.socialAccounts || {}),
          ...(parsed.socialAccounts || {}),
        },
        advisorConfig: {
          ...defaultCampaignSettings.advisorConfig!,
          ...(parsed.advisorConfig || {}),
          enabledPageSources: {
            ...defaultCampaignSettings.advisorConfig!.enabledPageSources,
            ...(parsed.advisorConfig?.enabledPageSources || {}),
          },
        },
      };
      settingsMemCache = { data: merged, source: 'firestore_live', expiresAt: Date.now() + MEM_TTL_MS };
      writeJsonCache(SETTINGS_CACHE_FILE, merged);
      return {
        ok: true,
        exists: true,
        source: 'firestore_live',
        data: merged,
      };
    }

    if (options?.createIfMissing) {
      try {
        await saveCampaignSettingsServer(defaultCampaignSettings);
        return {
          ok: true,
          exists: true,
          source: 'firestore_created_default',
          data: defaultCampaignSettings,
        };
      } catch {
        // fall through
      }
    }

    return {
      ok: true,
      exists: false,
      source: 'defaults_fallback',
      data: defaultCampaignSettings,
    };
  } catch (err: any) {
    const errMsg = String(err?.message || err || '');
    const isQuota = errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.toLowerCase().includes('quota');
    const cachedDisk = readJsonCache<CampaignSettings>(SETTINGS_CACHE_FILE);
    if (cachedDisk) {
      settingsMemCache = {
        data: cachedDisk,
        source: 'server_cache_quota_fallback',
        expiresAt: Date.now() + MEM_TTL_MS,
      };
      return {
        ok: true,
        exists: true,
        source: 'server_cache_quota_fallback',
        quotaExceeded: isQuota,
        data: cachedDisk,
      };
    }
    return {
      ok: false,
      exists: false,
      source: 'defaults_fallback',
      quotaExceeded: isQuota,
      errorDetail: errMsg.slice(0, 250),
      data: defaultCampaignSettings,
    };
  }
}

export async function saveCampaignSettingsServer(
  settings: CampaignSettings,
  _bearerToken?: string,
  options?: { syncCacheOnly?: boolean }
): Promise<{ ok: boolean; persistedToFirestore: boolean; error?: string; data: CampaignSettings }> {
  const merged: CampaignSettings = {
    ...defaultCampaignSettings,
    ...settings,
    siteTexts: {
      ...defaultSiteTexts,
      ...(defaultCampaignSettings.siteTexts || {}),
      ...(settings.siteTexts || {}),
    },
    socialAccounts: {
      ...(defaultCampaignSettings.socialAccounts || {}),
      ...(settings.socialAccounts || {}),
    },
    advisorConfig: {
      ...defaultCampaignSettings.advisorConfig!,
      ...(settings.advisorConfig || {}),
      enabledPageSources: {
        ...defaultCampaignSettings.advisorConfig!.enabledPageSources,
        ...(settings.advisorConfig?.enabledPageSources || {}),
      },
      updatedAt: new Date().toISOString(),
    },
  };

  settingsMemCache = { data: merged, source: 'firestore_live', expiresAt: Date.now() + MEM_TTL_MS };
  writeJsonCache(SETTINGS_CACHE_FILE, merged);

  if (options?.syncCacheOnly) {
    return { ok: true, persistedToFirestore: true, data: merged };
  }

  try {
    await setDoc(
      doc(db, 'settings', 'campaign'),
      {
        ...merged,
        updatedAtIso: new Date().toISOString(),
      },
      { merge: true }
    );
    return { ok: true, persistedToFirestore: true, data: merged };
  } catch (err: any) {
    return {
      ok: false,
      persistedToFirestore: false,
      error: `فشل حفظ /settings/campaign في Firestore: ${String(err?.message || err).slice(0, 220)}`,
      data: merged,
    };
  }
}

export async function updateSettingsCacheOnly(settings: CampaignSettings) {
  settingsMemCache = { data: settings, source: 'firestore_live', expiresAt: Date.now() + MEM_TTL_MS };
  writeJsonCache(SETTINGS_CACHE_FILE, settings);
}

// ============================================================================
// Packages, Public Package Status Evaluator, Announcements & Knowledge Base Loaders
// ============================================================================

/**
 * Formats a package price realistically without ever inventing a price.
 */
export function formatRealisticPackagePrice(rawPrice?: string): {
  displayPrice: string;
  hasDefinedPrice: boolean;
} {
  const clean = String(rawPrice || '').trim();
  if (
    !clean ||
    clean === '0' ||
    clean === '0 ريال' ||
    clean.includes('لم تحدد') ||
    clean.includes('غير محدد') ||
    !/[1-9٠-٩۰-۹]/.test(clean)
  ) {
    return {
      displayPrice: 'لم يُحدد السعر بعد',
      hasDefinedPrice: false,
    };
  }
  const hasCurrency = clean.includes('ريال') || clean.includes('ر.س') || clean.includes('SAR');
  return {
    displayPrice: hasCurrency ? clean : `${clean} ريال`,
    hasDefinedPrice: true,
  };
}

/**
 * Converts a HajjPackage + Pilgrim list into a strictly sanitized public package descriptor
 * for the AI Advisor.
 * - Filters out hidden packages (`showOnHomepage === false`).
 * - Evaluates whether the package is Available, Full (`مكتملة العدد`), Expired (`انتهى وقت التسجيل`), or Force Closed.
 * - NEVER exposes `registeredCount`, `maxCapacity`, `remainingSeats`, or any pilgrim PII.
 */
export function buildPublicPackagesForAdvisor(
  packages: HajjPackage[],
  pilgrims: Pilgrim[] = []
): PublicPackageForAdvisor[] {
  const visiblePackages = (packages || []).filter((pkg) => pkg && pkg.showOnHomepage !== false);
  const now = new Date();

  return visiblePackages.map((pkg) => {
    const statusEval = evaluatePackageStatus(pkg, pilgrims, now);
    const { displayPrice, hasDefinedPrice } = formatRealisticPackagePrice(pkg.price);

    let publicStatusLabel = 'متاحة للتسجيل';
    if (statusEval.isForceClosed) {
      publicStatusLabel = `مغلقة (${statusEval.forceCloseReasonText || 'مغلق لانتهاء الموسم'})`;
    } else if (statusEval.isDeadlineExpired) {
      publicStatusLabel = 'مغلقة (انتهى وقت التسجيل / انتهى الموسم)';
    } else if (statusEval.isFull) {
      publicStatusLabel = 'مكتملة العدد';
    }

    const registrationDeadlineFormatted =
      pkg.registrationDeadline && pkg.registrationDeadline.trim()
        ? formatRegistrationDeadlineAr(pkg.registrationDeadline)
        : undefined;

    return {
      id: pkg.id,
      title: (pkg.title || '').trim(),
      type: (pkg.type || '').trim(),
      price: (pkg.price || '').trim(),
      displayPrice,
      hasDefinedPrice,
      transport: (pkg.transport || '').trim(),
      accommodationMakkah: (pkg.accommodationMakkah || '').trim(),
      accommodationMadinah: (pkg.accommodationMadinah || '').trim(),
      campMina: (pkg.campMina || '').trim(),
      features: Array.isArray(pkg.features) ? pkg.features.filter(Boolean) : [],
      seasonYear: pkg.seasonYear,
      isAvailableForRegistration: !statusEval.isClosedForVisitors,
      publicStatusLabel,
      registrationDeadlineFormatted,
      updatedAtIso: (pkg as any).updatedAtIso,
    };
  });
}

export async function getOfficialPackagesServer(): Promise<HajjPackage[]> {
  try {
    const docs = await listCollectionRest<HajjPackage>('packages');
    if (docs.length > 0) {
      packagesMemCache = { data: docs, expiresAt: Date.now() + MEM_TTL_MS };
      writeJsonCache(PACKAGES_CACHE_FILE, docs);
      return docs;
    }
  } catch {
    // fallback to disk/mem cache if transient error
  }
  const disk = readJsonCache<HajjPackage[]>(PACKAGES_CACHE_FILE);
  if (disk && disk.length > 0) return disk;
  return packagesMemCache?.data || [];
}

/**
 * Fetches live packages & active pilgrim counts from Firestore on the server,
 * returning ONLY visible public packages with their real status (`متاحة للتسجيل`, `مكتملة العدد`, etc.)
 * and exact price (`500 ريال` or `لم يُحدد السعر بعد`), with ZERO pilgrim PII or seat numbers.
 */
export async function getPublicPackagesWithStatusServer(
  clientPublicPackages?: PublicPackageForAdvisor[]
): Promise<PublicPackageForAdvisor[]> {
  try {
    const [pkgDocs, pilgrimDocs] = await Promise.all([
      listCollectionRest<HajjPackage>('packages'),
      listCollectionRest<Pilgrim>('pilgrims'),
    ]);

    if (pkgDocs.length > 0) {
      packagesMemCache = { data: pkgDocs, expiresAt: Date.now() + MEM_TTL_MS };
      writeJsonCache(PACKAGES_CACHE_FILE, pkgDocs);
      return buildPublicPackagesForAdvisor(pkgDocs, pilgrimDocs);
    }
  } catch {
    // If server read fails transiently, use client-supplied sanitized public packages if available
  }

  if (Array.isArray(clientPublicPackages) && clientPublicPackages.length > 0) {
    return clientPublicPackages;
  }

  const disk = readJsonCache<HajjPackage[]>(PACKAGES_CACHE_FILE);
  if (disk && disk.length > 0) {
    return buildPublicPackagesForAdvisor(disk, []);
  }

  return [];
}

export async function getOfficialAnnouncementsServer(): Promise<Announcement[]> {
  if (announcementsMemCache && announcementsMemCache.expiresAt > Date.now()) {
    return announcementsMemCache.data;
  }
  try {
    const docs = await listCollectionRest<Announcement>('announcements');
    if (docs.length > 0) {
      announcementsMemCache = { data: docs, expiresAt: Date.now() + MEM_TTL_MS };
      writeJsonCache(ANNOUNCEMENTS_CACHE_FILE, docs);
      return docs;
    }
  } catch {
    // fallback if quota exceeded
  }
  const disk = readJsonCache<Announcement[]>(ANNOUNCEMENTS_CACHE_FILE);
  if (disk && disk.length > 0) return disk;
  return announcementsMemCache?.data || defaultAnnouncements;
}

export async function getManasikStagesServer(): Promise<ManasikStage[]> {
  if (manasikMemCache && manasikMemCache.expiresAt > Date.now()) {
    return manasikMemCache.data;
  }
  try {
    const [docs, metaSnap] = await Promise.all([
      listCollectionRest<ManasikStage>('manasik_stages'),
      getDoc(doc(db, 'settings', 'manasikMeta')).catch(() => null),
    ]);
    const sorted = [...docs]
      .map((st) => ({
        ...st,
        rituals: Array.isArray(st.rituals)
          ? [...st.rituals].sort((a, b) => (a.order || 0) - (b.order || 0))
          : [],
      }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const wasSeeded = Boolean(metaSnap && metaSnap.exists() && metaSnap.data()?.isSeeded);
    if (sorted.length > 0 || wasSeeded) {
      manasikMemCache = { data: sorted, expiresAt: Date.now() + MEM_TTL_MS };
      writeJsonCache(MANASIK_CACHE_FILE, sorted);
      return sorted;
    }
  } catch {
    // fall through to disk/seed fallback
  }
  const disk = readJsonCache<ManasikStage[]>(MANASIK_CACHE_FILE);
  if (disk) return disk;
  return manasikMemCache?.data || INITIAL_MANASIK_STAGES;
}

export async function getAdvisorKnowledgeServer(_bearerToken?: string): Promise<AdvisorKnowledgeItem[]> {
  try {
    const docs = await listCollectionRest<AdvisorKnowledgeItem>('advisor_knowledge');
    const sorted = docs.sort((a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
    );
    knowledgeMemCache = { data: sorted, expiresAt: Date.now() + MEM_TTL_MS };
    writeJsonCache(KNOWLEDGE_CACHE_FILE, sorted);
    return sorted;
  } catch {
    const disk = readJsonCache<AdvisorKnowledgeItem[]>(KNOWLEDGE_CACHE_FILE);
    if (disk) return disk;
    return knowledgeMemCache?.data || [];
  }
}

export async function saveAdvisorKnowledgeItemServer(
  item: AdvisorKnowledgeItem,
  _bearerToken?: string
): Promise<{ ok: boolean; error?: string; item: AdvisorKnowledgeItem }> {
  const docId = item.id.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!docId) {
    return { ok: false, error: 'معرف السجل غير صالح.', item };
  }

  // Update warm server cache immediately
  const current = readJsonCache<AdvisorKnowledgeItem[]>(KNOWLEDGE_CACHE_FILE) || knowledgeMemCache?.data || [];
  const nextList = [item, ...current.filter((x) => x.id !== item.id)];
  knowledgeMemCache = { data: nextList, expiresAt: Date.now() + MEM_TTL_MS };
  writeJsonCache(KNOWLEDGE_CACHE_FILE, nextList);

  try {
    await setDoc(doc(db, 'advisor_knowledge', docId), item, { merge: true });
    return { ok: true, item };
  } catch (err: any) {
    return {
      ok: false,
      error: `تعذر حفظ العنصر في قاعدة البيانات: ${String(err?.message || err).slice(0, 200)}`,
      item,
    };
  }
}

export async function deleteAdvisorKnowledgeItemServer(
  id: string,
  _bearerToken?: string
): Promise<{ ok: boolean; error?: string }> {
  const docId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!docId) return { ok: false, error: 'معرف غير صالح' };

  const current = readJsonCache<AdvisorKnowledgeItem[]>(KNOWLEDGE_CACHE_FILE) || knowledgeMemCache?.data || [];
  const nextList = current.filter((x) => x.id !== docId);
  knowledgeMemCache = { data: nextList, expiresAt: Date.now() + MEM_TTL_MS };
  writeJsonCache(KNOWLEDGE_CACHE_FILE, nextList);

  try {
    await deleteDoc(doc(db, 'advisor_knowledge', docId));
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: `تعذر الحذف من قاعدة البيانات: ${String(err?.message || err).slice(0, 200)}`,
    };
  }
}

export async function logAdvisorInquiryServer(entry: AdvisorInquiryLog): Promise<void> {
  const current = readJsonCache<AdvisorInquiryLog[]>(INQUIRIES_CACHE_FILE) || [];
  const next = [entry, ...current].slice(0, 200);
  writeJsonCache(INQUIRIES_CACHE_FILE, next);

  try {
    const docId = entry.id.replace(/[^a-zA-Z0-9_-]/g, '');
    await setDoc(doc(db, 'advisor_inquiries', docId), entry, { merge: true });
  } catch {
    // Non-blocking audit log
  }
}

export async function listAdvisorInquiriesServer(_bearerToken?: string): Promise<AdvisorInquiryLog[]> {
  try {
    const docs = await listCollectionRest<AdvisorInquiryLog>('advisor_inquiries');
    if (docs.length > 0) {
      const sorted = docs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      writeJsonCache(INQUIRIES_CACHE_FILE, sorted.slice(0, 200));
      return sorted;
    }
  } catch {
    // fallback
  }
  return readJsonCache<AdvisorInquiryLog[]>(INQUIRIES_CACHE_FILE) || [];
}
