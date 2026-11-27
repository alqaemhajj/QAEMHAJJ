import {
  getDocuments,
  recordActivityLog,
  removeDocument,
  setDocument,
  subscribeToCollection,
  updateDocument,
} from '../lib/db';
import { AdminUser, TrustedDevice } from '../types';
import { sha256Hex } from './pinAuth';
import { safeStorage } from './safeStorage';

/**
 * Trusted Device Recognition, Cryptographic Token Verification & Cloud Persistence
 *
 * Security model:
 * - Each trusted device holds a 256-bit cryptographically random `device_token` stored
 *   locally via `safeStorage` (iframe-resilient) scoped per user ID.
 * - Firestore (`trusted_devices/{docId}`) stores ONLY `SHA-256(device_token)` and
 *   `SHA-256(deviceFingerprint)` — never the raw token.
 * - Verification checks constant-time equality of BOTH `deviceTokenHash` AND
 *   `deviceFingerprint` against live non-revoked cloud records (`bypassCache: true`).
 * - Revocation by the user or Super Admin immediately invalidates the cloud record,
 *   forcing full 2FA verification on next login and disabling device biometrics.
 */

export const TRUSTED_DEVICES_COLLECTION = 'trusted_devices';
const LOCAL_TOKEN_PREFIX = 'qaem_td_token_v1_';
const LOCAL_DEVICE_ID_PREFIX = 'qaem_td_id_v1_';

export interface DeviceEnvironmentInfo {
  deviceName: string;
  browserName: string;
  osName: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
}

function constantTimeEquals(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function generateCryptoHex(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Parses the current browser and OS into a readable label such as
 * "Chrome on Windows" or "Safari on iPhone".
 */
export function detectDeviceEnvironment(): DeviceEnvironmentInfo {
  if (typeof navigator === 'undefined') {
    return {
      deviceName: 'Web Browser',
      browserName: 'Web Browser',
      osName: 'Unknown OS',
      deviceType: 'desktop',
    };
  }

  const ua = navigator.userAgent || '';

  // Detect OS
  let osName = 'Unknown OS';
  let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';

  if (/iPhone/i.test(ua)) {
    osName = 'iPhone';
    deviceType = 'mobile';
  } else if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    osName = 'iPad';
    deviceType = 'tablet';
  } else if (/Android/i.test(ua)) {
    osName = 'Android';
    deviceType = /Mobile/i.test(ua) ? 'mobile' : 'tablet';
  } else if (/Windows NT/i.test(ua) || /Win32|Win64/i.test(ua)) {
    osName = 'Windows';
    deviceType = 'desktop';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    osName = 'macOS';
    deviceType = 'desktop';
  } else if (/CrOS/i.test(ua)) {
    osName = 'ChromeOS';
    deviceType = 'desktop';
  } else if (/Linux/i.test(ua)) {
    osName = 'Linux';
    deviceType = 'desktop';
  }

  // Detect Browser
  let browserName = 'Browser';
  if (/Edg\//i.test(ua) || /EdgiOS|EdgA/i.test(ua)) {
    browserName = 'Edge';
  } else if (/OPR\/|Opera/i.test(ua)) {
    browserName = 'Opera';
  } else if (/SamsungBrowser/i.test(ua)) {
    browserName = 'Samsung Internet';
  } else if (/Firefox\/|FxiOS/i.test(ua)) {
    browserName = 'Firefox';
  } else if (/CriOS/i.test(ua) || (/Chrome\//i.test(ua) && !/Edg\//i.test(ua))) {
    browserName = 'Chrome';
  } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    browserName = 'Safari';
  }

  return {
    deviceName: `${browserName} on ${osName}`,
    browserName,
    osName,
    deviceType,
  };
}

/**
 * Generates a deterministic, privacy-preserving SHA-256 fingerprint of the current
 * browser + OS + hardware/timezone environment so stolen tokens cannot be replayed
 * on a different machine.
 */
export async function computeDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return sha256Hex('server-runtime');
  }

  const env = detectDeviceEnvironment();
  let timezone = 'UTC';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    timezone = 'UTC';
  }

  const screenBucket =
    typeof screen !== 'undefined'
      ? `${Math.min(screen.width || 0, screen.height || 0)}x${Math.max(screen.width || 0, screen.height || 0)}x${screen.colorDepth || 24}`
      : '0x0x24';

  const rawSignals = [
    env.osName,
    env.browserName,
    env.deviceType,
    navigator.platform || '',
    navigator.language || '',
    String(navigator.hardwareConcurrency || 0),
    screenBucket,
    timezone,
  ].join('|');

  return sha256Hex(`qaem_fp_v1::${rawSignals}`);
}

export function getLocalTrustedToken(userId: string): string | null {
  if (!userId) return null;
  return safeStorage.getItem(`${LOCAL_TOKEN_PREFIX}${userId}`);
}

export function getLocalTrustedDeviceId(userId: string): string | null {
  if (!userId) return null;
  return safeStorage.getItem(`${LOCAL_DEVICE_ID_PREFIX}${userId}`);
}

export function clearLocalTrustedDeviceCredentials(userId: string): void {
  if (!userId) return;
  safeStorage.removeItem(`${LOCAL_TOKEN_PREFIX}${userId}`);
  safeStorage.removeItem(`${LOCAL_DEVICE_ID_PREFIX}${userId}`);
}

/**
 * Fetches all active (non-revoked) trusted devices for a specific user from Firestore.
 */
export async function listUserTrustedDevices(userId: string): Promise<TrustedDevice[]> {
  if (!userId) return [];
  try {
    const all = await getDocuments<TrustedDevice>(TRUSTED_DEVICES_COLLECTION, { bypassCache: true });
    return all
      .filter((d) => d && d.userId === userId && !d.revoked)
      .sort((a, b) => (b.lastUsedAt || b.trustedAt || '').localeCompare(a.lastUsedAt || a.trustedAt || ''));
  } catch {
    return [];
  }
}

/**
 * Fetches all active trusted devices across all staff/admins (for Super Admin oversight).
 */
export async function listAllActiveTrustedDevices(): Promise<TrustedDevice[]> {
  try {
    const all = await getDocuments<TrustedDevice>(TRUSTED_DEVICES_COLLECTION, { bypassCache: true });
    return all
      .filter((d) => d && !d.revoked)
      .sort((a, b) => (b.lastUsedAt || b.trustedAt || '').localeCompare(a.lastUsedAt || a.trustedAt || ''));
  } catch {
    return [];
  }
}

/**
 * Real-time subscription to all active trusted devices.
 */
export function subscribeToTrustedDevices(
  onUpdate: (devices: TrustedDevice[]) => void
): () => void {
  return subscribeToCollection<TrustedDevice>(TRUSTED_DEVICES_COLLECTION, (docs) => {
    const active = (docs || [])
      .filter((d) => d && !d.revoked)
      .sort((a, b) => (b.lastUsedAt || b.trustedAt || '').localeCompare(a.lastUsedAt || a.trustedAt || ''));
    onUpdate(active);
  });
}

/**
 * Verifies whether the current browser/device is an active trusted device for `userId`.
 * Performs constant-time comparison of BOTH SHA-256(local device_token) AND current deviceFingerprint.
 */
export async function verifyCurrentDeviceTrust(userId: string): Promise<TrustedDevice | null> {
  if (!userId) return null;
  const rawToken = getLocalTrustedToken(userId);
  if (!rawToken || rawToken.length < 32) return null;

  try {
    const [tokenHash, fingerprint, userDevices] = await Promise.all([
      sha256Hex(rawToken),
      computeDeviceFingerprint(),
      listUserTrustedDevices(userId),
    ]);

    const matched = userDevices.find(
      (dev) =>
        !dev.revoked &&
        constantTimeEquals(dev.deviceTokenHash || '', tokenHash) &&
        constantTimeEquals(dev.deviceFingerprint || '', fingerprint)
    );

    if (!matched) {
      return null;
    }

    // Update lastUsedAt silently in Firestore
    const nowIso = new Date().toISOString();
    safeStorage.setItem(`${LOCAL_DEVICE_ID_PREFIX}${userId}`, matched.id);
    updateDocument(
      TRUSTED_DEVICES_COLLECTION,
      matched.id,
      { lastUsedAt: nowIso },
      { forceWrite: true }
    ).catch(() => {});

    return { ...matched, lastUsedAt: nowIso };
  } catch {
    return null;
  }
}

/**
 * Registers the current device as a Trusted Device for `user` after successful 2FA or ownership proof.
 * Generates a fresh 256-bit `device_token`, stores it locally via safeStorage, and saves ONLY its hash
 * and fingerprint to Firestore (`trusted_devices`).
 */
export async function registerTrustedDeviceForUser(
  user: AdminUser
): Promise<TrustedDevice> {
  const env = detectDeviceEnvironment();
  const fingerprint = await computeDeviceFingerprint();
  const nowIso = new Date().toISOString();
  const cleanEmail = (user.email || user.username || '').trim().toLowerCase();

  // If this exact device is already trusted for this user, refresh its token/timestamp cleanly
  const existing = await verifyCurrentDeviceTrust(user.id);
  if (existing) {
    const refreshed: TrustedDevice = {
      ...existing,
      deviceName: env.deviceName,
      browserName: env.browserName,
      osName: env.osName,
      deviceType: env.deviceType,
      lastUsedAt: nowIso,
    };
    await setDocument(TRUSTED_DEVICES_COLLECTION, existing.id, refreshed, { forceWrite: true });
    return refreshed;
  }

  const rawToken = generateCryptoHex(32); // 256-bit cryptographic token
  const tokenHash = await sha256Hex(rawToken);
  const safeUserPart = (user.id || 'usr').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 36);
  const deviceId = `td_${safeUserPart}_${Date.now().toString(36)}_${generateCryptoHex(4)}`;

  const record: TrustedDevice = {
    id: deviceId,
    userId: user.id,
    userEmail: cleanEmail,
    userName: user.fullName || cleanEmail,
    deviceName: env.deviceName,
    deviceType: env.deviceType,
    browserName: env.browserName,
    osName: env.osName,
    deviceTokenHash: tokenHash,
    deviceFingerprint: fingerprint,
    trustedAt: nowIso,
    lastUsedAt: nowIso,
    biometricEnabled: false,
    revoked: false,
  };

  await setDocument(TRUSTED_DEVICES_COLLECTION, deviceId, record, { forceWrite: true });

  // Persist raw token strictly on this client device via iframe-safe storage
  safeStorage.setItem(`${LOCAL_TOKEN_PREFIX}${user.id}`, rawToken);
  safeStorage.setItem(`${LOCAL_DEVICE_ID_PREFIX}${user.id}`, deviceId);

  await recordActivityLog({
    adminId: user.id,
    adminName: user.fullName,
    username: cleanEmail,
    userRole: user.role,
    category: 'الأمان والمصادقة',
    severity: 'info',
    action: `توثيق جهاز جديد كجهاز آمن وموثوق (${env.deviceName})`,
    target: `المستخدم: ${user.fullName} — الجهاز: ${env.deviceName}`,
    details: 'تم إنشاء رمز جهاز مشفر وبصمة رقمية وحفظها في السحابة لتسهيل الدخول المستقبلي.',
  });

  return record;
}

/**
 * Revokes a single trusted device (by the account owner or Super Admin).
 * Permanently removes the record from Firestore and clears local credentials if matching current device.
 */
export async function revokeTrustedDevice(
  device: TrustedDevice,
  actor: { id: string; fullName: string; email: string; role: string }
): Promise<void> {
  await removeDocument(TRUSTED_DEVICES_COLLECTION, device.id);

  // If revoking the current browser's own trusted device, clear local token immediately
  const localDevId = getLocalTrustedDeviceId(device.userId);
  if (localDevId === device.id) {
    clearLocalTrustedDeviceCredentials(device.userId);
  }

  await recordActivityLog({
    adminId: actor.id,
    adminName: actor.fullName,
    username: actor.email,
    userRole: actor.role,
    category: 'الأمان والمصادقة',
    severity: 'warning',
    action: `إلغاء توثيق جهاز موثوق (${device.deviceName})`,
    target: `حساب: ${device.userName} (${device.userEmail})`,
    details: device.biometricEnabled
      ? 'تم إلغاء توثيق الجهاز وتعطيل الدخول بالبصمة المرتبط به فوراً.'
      : 'سيُطلب رمز التحقق بخطوتين (2FA) مجدداً عند أي محاولة دخول من هذا الجهاز.',
  });
}

/**
 * Admin Oversight Action: Revokes ALL trusted devices for a target supervisor/employee
 * (e.g., upon resignation or lost device) without touching any of their operational data.
 */
export async function revokeAllTrustedDevicesForUser(
  targetUser: AdminUser,
  actor: { id: string; fullName: string; email: string; role: string }
): Promise<number> {
  const userDevices = await listUserTrustedDevices(targetUser.id);

  await Promise.all(
    userDevices.map((dev) => removeDocument(TRUSTED_DEVICES_COLLECTION, dev.id).catch(() => {}))
  );

  // Clear local cache if Super Admin revoked their own devices on this browser
  clearLocalTrustedDeviceCredentials(targetUser.id);

  // Bump sessionVersion so any active session on revoked devices is forced to re-authenticate cleanly
  const nextSessionVersion = (targetUser.sessionVersion || 1) + 1;
  await updateDocument(
    'adminUsers',
    targetUser.id,
    {
      sessionVersion: nextSessionVersion,
      updatedAt: new Date().toISOString(),
    },
    { forceWrite: true }
  ).catch(() => {});

  const targetEmail = (targetUser.email || targetUser.username || '').trim().toLowerCase();
  await recordActivityLog({
    adminId: actor.id,
    adminName: actor.fullName,
    username: actor.email,
    userRole: actor.role,
    category: 'الأمان والمصادقة',
    severity: 'critical',
    action: `إلغاء توثيق جميع الأجهزة الموثوقة للمشرف (${userDevices.length} جهاز)`,
    target: `المشرف: ${targetUser.fullName} (${targetEmail})`,
    details:
      'تم سحب الثقة من كافة الأجهزة المرتبطة وتعطيل البصمة عليها وإنهاء الجلسات النشطة مع الاحتفاظ الكامل بجميع البيانات التشغيلية.',
  });

  return userDevices.length;
}

/**
 * Records a New Device Security Alert when a login occurs from an unrecognized device,
 * storing the alert on the user profile and in the Audit Log.
 */
export async function recordNewDeviceSecurityAlert(user: AdminUser): Promise<void> {
  const env = detectDeviceEnvironment();
  const nowIso = new Date().toISOString();
  const cleanEmail = (user.email || user.username || '').trim().toLowerCase();

  await updateDocument(
    'adminUsers',
    user.id,
    {
      lastNewDeviceAlert: {
        deviceName: env.deviceName,
        osName: env.osName,
        browserName: env.browserName,
        detectedAt: nowIso,
        dismissed: false,
      },
    },
    { forceWrite: true }
  ).catch(() => {});

  await recordActivityLog({
    adminId: user.id,
    adminName: user.fullName,
    username: cleanEmail,
    userRole: user.role,
    category: 'الأمان والمصادقة',
    severity: 'warning',
    action: `تنبيه أمني: محاولة دخول من جهاز جديد غير موثوق (${env.deviceName})`,
    target: `الحساب: ${user.fullName} (${cleanEmail})`,
    details: 'تم اكتشاف عدم وجود الجهاز في قائمة الأجهزة الموثوقة، وتم إلزام المستخدم بإدخال رمز التحقق بخطوتين (2FA).',
  });
}

/**
 * Formats an ISO timestamp into a clean Arabic date+time string for Trusted Devices cards.
 */
export function formatDeviceTimestampAr(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
