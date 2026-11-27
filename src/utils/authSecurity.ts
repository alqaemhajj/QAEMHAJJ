import { getDocument, getDocuments, recordActivityLog, removeDocument, setDocument } from '../lib/db';
import { safeStorage } from './safeStorage';

/**
 * Brute-Force Login Protection & Lockout Manager
 * Enforces strict 15-minute lockout after 5 consecutive failed password or 2FA attempts.
 * Persists lockout state in Firestore (`auth_lockouts`) with localStorage mirror so
 * refreshing the page or switching browsers cannot bypass the lockout.
 */

export const MAX_FAILED_AUTH_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const LOCAL_LOCKOUT_PREFIX = 'qaem_auth_lockout_v1_';

export interface AuthLockoutRecord {
  id: string;
  identifier: string;
  failedAttempts: number;
  lockedUntil: number; // Unix epoch ms (0 if not locked)
  lastAttemptAt: string;
  lastReason?: string;
}

export interface LockoutStatusResult {
  isLocked: boolean;
  failedAttempts: number;
  remainingAttempts: number;
  lockedUntil: number;
  remainingMs: number;
  remainingSeconds: number;
}

export function normalizeLockoutKey(identifier: string): string {
  const clean = (identifier || '').trim().toLowerCase();
  if (!clean) return 'anonymous_client';
  const safe = clean.replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 96);
  return `lock_${safe || 'unknown'}`;
}

function readLocalLockout(docId: string): AuthLockoutRecord | null {
  return safeStorage.getJSON<AuthLockoutRecord | null>(`${LOCAL_LOCKOUT_PREFIX}${docId}`, null);
}

function writeLocalLockout(docId: string, record: AuthLockoutRecord | null) {
  if (!record) {
    safeStorage.removeItem(`${LOCAL_LOCKOUT_PREFIX}${docId}`);
  } else {
    safeStorage.setJSON(`${LOCAL_LOCKOUT_PREFIX}${docId}`, record);
  }
}

function mergeLockoutRecords(
  remote: AuthLockoutRecord | null,
  local: AuthLockoutRecord | null
): AuthLockoutRecord | null {
  if (!remote && !local) return null;
  if (!remote) return local;
  if (!local) return remote;

  const now = Date.now();
  const remoteActiveLock = (remote.lockedUntil || 0) > now ? remote.lockedUntil : 0;
  const localActiveLock = (local.lockedUntil || 0) > now ? local.lockedUntil : 0;

  return {
    id: remote.id || local.id,
    identifier: remote.identifier || local.identifier,
    failedAttempts: Math.max(remote.failedAttempts || 0, local.failedAttempts || 0),
    lockedUntil: Math.max(remoteActiveLock, localActiveLock),
    lastAttemptAt:
      (remote.lastAttemptAt || '') >= (local.lastAttemptAt || '')
        ? remote.lastAttemptAt
        : local.lastAttemptAt,
    lastReason: remote.lastReason || local.lastReason,
  };
}

function computeLockoutStatus(record: AuthLockoutRecord | null): LockoutStatusResult {
  const now = Date.now();
  if (!record) {
    return {
      isLocked: false,
      failedAttempts: 0,
      remainingAttempts: MAX_FAILED_AUTH_ATTEMPTS,
      lockedUntil: 0,
      remainingMs: 0,
      remainingSeconds: 0,
    };
  }

  // If lockout has expired, treat as unlocked and reset attempts
  if (record.lockedUntil > 0 && record.lockedUntil <= now) {
    return {
      isLocked: false,
      failedAttempts: 0,
      remainingAttempts: MAX_FAILED_AUTH_ATTEMPTS,
      lockedUntil: 0,
      remainingMs: 0,
      remainingSeconds: 0,
    };
  }

  if (record.lockedUntil > now) {
    const remainingMs = record.lockedUntil - now;
    return {
      isLocked: true,
      failedAttempts: Math.max(record.failedAttempts || MAX_FAILED_AUTH_ATTEMPTS, MAX_FAILED_AUTH_ATTEMPTS),
      remainingAttempts: 0,
      lockedUntil: record.lockedUntil,
      remainingMs,
      remainingSeconds: Math.ceil(remainingMs / 1000),
    };
  }

  const attempts = Math.max(0, record.failedAttempts || 0);
  return {
    isLocked: false,
    failedAttempts: attempts,
    remainingAttempts: Math.max(0, MAX_FAILED_AUTH_ATTEMPTS - attempts),
    lockedUntil: 0,
    remainingMs: 0,
    remainingSeconds: 0,
  };
}

/**
 * Checks whether an email/identifier is currently locked out (checks both Firestore and local cache).
 */
export async function checkAuthLockout(identifier: string): Promise<LockoutStatusResult> {
  const docId = normalizeLockoutKey(identifier);
  const local = readLocalLockout(docId);

  let remote: AuthLockoutRecord | null = null;
  try {
    remote = await getDocument<AuthLockoutRecord>('auth_lockouts', docId, { bypassCache: true });
  } catch {
    // fallback to local if offline
  }

  const merged = mergeLockoutRecords(remote, local);
  const status = computeLockoutStatus(merged);

  // Clean up expired lockout record automatically
  if (merged && merged.lockedUntil > 0 && merged.lockedUntil <= Date.now()) {
    writeLocalLockout(docId, null);
    removeDocument('auth_lockouts', docId).catch(() => {});
  }

  return status;
}

/**
 * Records a failed login or 2FA attempt. Locks the identifier for 15 minutes on the 5th consecutive failure.
 */
export async function recordFailedAuthAttempt(
  identifier: string,
  reason: 'password' | 'totp',
  meta?: { fullName?: string; role?: string }
): Promise<LockoutStatusResult> {
  const cleanId = (identifier || '').trim().toLowerCase() || 'unknown';
  const docId = normalizeLockoutKey(cleanId);

  const currentStatus = await checkAuthLockout(cleanId);
  if (currentStatus.isLocked) {
    return currentStatus;
  }

  const nextAttempts = currentStatus.failedAttempts + 1;
  const now = Date.now();
  const shouldLock = nextAttempts >= MAX_FAILED_AUTH_ATTEMPTS;
  const lockedUntil = shouldLock ? now + LOCKOUT_DURATION_MS : 0;

  const record: AuthLockoutRecord = {
    id: docId,
    identifier: cleanId,
    failedAttempts: nextAttempts,
    lockedUntil,
    lastAttemptAt: new Date(now).toISOString(),
    lastReason: reason === 'totp' ? 'رمز تحقق 2FA خاطئ' : 'كلمة مرور خاطئة',
  };

  writeLocalLockout(docId, record);
  setDocument('auth_lockouts', docId, record, { forceWrite: true }).catch(() => {});

  const reasonLabel = reason === 'totp' ? 'رمز التحقق بخطوتين (2FA)' : 'كلمة المرور';

  if (shouldLock) {
    await recordActivityLog({
      adminId: docId,
      adminName: meta?.fullName || cleanId,
      username: cleanId,
      userRole: meta?.role || 'حماية الدخول',
      category: 'الأمان والمصادقة',
      action: `حظر مؤقت لمدة 15 دقيقة بعد ${MAX_FAILED_AUTH_ATTEMPTS} محاولات فاشلة متتالية (${reasonLabel})`,
      target: `الحساب: ${cleanId}`,
      details: `تم تعليق محاولات تسجيل الدخول لمدة 15 دقيقة تلقائياً لحماية النظام من التخمين.`,
    });
  } else {
    await recordActivityLog({
      adminId: docId,
      adminName: meta?.fullName || cleanId,
      username: cleanId,
      userRole: meta?.role || 'محاولة دخول فاشلة',
      category: 'الأمان والمصادقة',
      action: `محاولة دخول فاشلة #${nextAttempts} من ${MAX_FAILED_AUTH_ATTEMPTS} (${reasonLabel} غير صحيح)`,
      target: `الحساب: ${cleanId}`,
      details: `المحاولات المتبقية قبل الحظر المؤقت: ${Math.max(0, MAX_FAILED_AUTH_ATTEMPTS - nextAttempts)}`,
    });
  }

  return computeLockoutStatus(record);
}

/**
 * Clears failed attempts and lifts lockout for an identifier (called on successful auth or Super Admin unlock).
 */
export async function clearAuthLockout(identifier: string): Promise<void> {
  const docId = normalizeLockoutKey(identifier);
  writeLocalLockout(docId, null);
  try {
    await removeDocument('auth_lockouts', docId);
  } catch {
    // non-blocking
  }
}

/**
 * Lists all active (unexpired) lockouts for Super Admin visibility in Staff Management.
 */
export async function listActiveAuthLockouts(): Promise<AuthLockoutRecord[]> {
  try {
    const all = await getDocuments<AuthLockoutRecord>('auth_lockouts', { bypassCache: true });
    const now = Date.now();
    return all.filter((r) => (r.lockedUntil || 0) > now);
  } catch {
    return [];
  }
}

/**
 * Formats remaining seconds as MM:SS for lockout countdown banners.
 */
export function formatCountdownMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
