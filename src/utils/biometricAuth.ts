import { getDocuments, recordActivityLog, updateDocument } from '../lib/db';
import { AdminUser, TrustedDevice } from '../types';
import { safeStorage } from './safeStorage';
import {
  detectDeviceEnvironment,
  TRUSTED_DEVICES_COLLECTION,
  verifyCurrentDeviceTrust,
} from './trustedDevices';

/**
 * WebAuthn / Biometric Authentication (Platform Authenticator Opt-In)
 *
 * Uses the standard W3C Web Authentication API (`navigator.credentials.create` and
 * `navigator.credentials.get`) bound strictly to a verified Trusted Device record in Firestore.
 * Supports Touch ID, Face ID, Windows Hello, and Android Fingerprint/Biometrics.
 */

const BIOMETRIC_BINDING_KEY = 'qaem_biometric_device_binding_v1';

export interface LocalBiometricBinding {
  userId: string;
  userEmail: string;
  userName: string;
  userRole: string;
  deviceId: string;
  credentialId: string; // Base64URL
  deviceName: string;
  enabledAt: string;
}

export interface BiometricSupportStatus {
  supported: boolean;
  platformAvailable: boolean;
  inCrossOriginIframe: boolean;
  reasonAr?: string;
}

function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

function generateChallengeBytes(size = 32): Uint8Array {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

function getSafeRpId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const host = (window.location.hostname || '').trim().toLowerCase();
  if (!host || host === '0.0.0.0') return undefined;
  // IPv4/IPv6 addresses cannot be passed as WebAuthn rp.id; omit to let browser derive origin
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return undefined;
  }
  return host;
}

function detectCrossOriginIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Checks whether the current browser & device supports WebAuthn platform biometrics
 * (Touch ID, Face ID, Windows Hello, Android Fingerprint).
 */
export async function checkBiometricSupport(): Promise<BiometricSupportStatus> {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    return {
      supported: false,
      platformAvailable: false,
      inCrossOriginIframe: detectCrossOriginIframe(),
      reasonAr: 'تتطلب المصادقة بالبصمة اتصالاً آمناً عبر HTTPS.',
    };
  }

  const hasWebAuthn =
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function';

  const inIframe = detectCrossOriginIframe();

  if (!hasWebAuthn) {
    return {
      supported: false,
      platformAvailable: false,
      inCrossOriginIframe: inIframe,
      reasonAr: 'هذا المتصفح لا يدعم معيار WebAuthn للمصادقة الحيوية.',
    };
  }

  let platformAvailable = false;
  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      platformAvailable =
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch {
    platformAvailable = false;
  }

  return {
    supported: true,
    platformAvailable,
    inCrossOriginIframe: inIframe,
    reasonAr: !platformAvailable
      ? 'لم يتم اكتشاف مستشعر بصمة/وجه مفعل (مثل Windows Hello أو Touch ID / Face ID) على هذا الجهاز.'
      : undefined,
  };
}

/**
 * Reads all local biometric bindings saved on this browser (supports multiple staff on shared workstation).
 */
export function getLocalBiometricBindings(): LocalBiometricBinding[] {
  const raw = safeStorage.getJSON<unknown>(BIOMETRIC_BINDING_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is LocalBiometricBinding =>
      Boolean(item && typeof item === 'object' && (item as any).userId && (item as any).credentialId)
  );
}

function saveLocalBiometricBindings(list: LocalBiometricBinding[]): void {
  safeStorage.setJSON(BIOMETRIC_BINDING_KEY, list);
}

export function getLocalBiometricBindingForUser(userId: string): LocalBiometricBinding | null {
  if (!userId) return null;
  return getLocalBiometricBindings().find((b) => b.userId === userId) || null;
}

export function removeLocalBiometricBinding(userId: string, deviceId?: string): void {
  const current = getLocalBiometricBindings();
  const next = current.filter((b) => {
    if (b.userId !== userId) return true;
    if (deviceId && b.deviceId !== deviceId) return true;
    return false;
  });
  saveLocalBiometricBindings(next);
}

/**
 * Registers a platform biometric credential (WebAuthn `navigator.credentials.create`)
 * and binds its Credential ID & public key strictly to the user's verified Trusted Device in Firestore.
 */
export async function enrollDeviceBiometric(params: {
  user: AdminUser;
  trustedDevice: TrustedDevice;
}): Promise<{ credentialId: string; updatedDevice: TrustedDevice }> {
  const { user, trustedDevice } = params;
  const support = await checkBiometricSupport();
  if (!support.supported) {
    throw new Error(support.reasonAr || 'المتصفح لا يدعم تسجيل البصمة الحيوية.');
  }

  const cleanEmail = (user.email || user.username || 'staff@alqaemhajj.com').trim().toLowerCase();
  const challenge = generateChallengeBytes(32);
  const userIdBytes = new TextEncoder().encode(`alqaem:${user.id}`);
  const rpId = getSafeRpId();

  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    challenge: challenge as unknown as BufferSource,
    rp: {
      name: 'قافلة القائم للحج والعمرة',
      ...(rpId ? { id: rpId } : {}),
    },
    user: {
      id: userIdBytes as unknown as BufferSource,
      name: cleanEmail,
      displayName: user.fullName || cleanEmail,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256 (ECDSA P-256)
      { type: 'public-key', alg: -257 }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred',
    },
    timeout: 60000,
    attestation: 'none',
  };

  let created: Credential | null = null;
  try {
    created = await navigator.credentials.create({ publicKey: publicKeyOptions });
  } catch (err: any) {
    const errName = err?.name || '';
    const errMsg = String(err?.message || '');
    if (errName === 'NotAllowedError') {
      if (support.inCrossOriginIframe || errMsg.toLowerCase().includes('publickey-credentials')) {
        throw new Error(
          'نافذة المعاينة المضمنة (iframe) تقيّد الوصول المباشر لمستشعر البصمة. افتح البوابة في تبويب مستقل أو على رابط النشر الرسمي (alqaemhajj.pages.dev) لتسجيل البصمة.'
        );
      }
      throw new Error('تم إلغاء عملية تسجيل البصمة أو انتهت المهلة. يرجى المحاولة مرة أخرى.');
    }
    if (errName === 'SecurityError') {
      throw new Error(
        'تعذر الوصول لمستشعر البصمة داخل الإطار المضمن. يرجى فتح البوابة مباشرة في نافذة مستقلة عبر HTTPS.'
      );
    }
    if (errName === 'InvalidStateError') {
      throw new Error('هذا الجهاز مسجل مسبقاً ببصمة لهذا الحساب.');
    }
    throw new Error('تعذر تفعيل البصمة على هذا الجهاز. تأكد من تفعيل Windows Hello أو Touch ID / Face ID.');
  }

  if (!created || created.type !== 'public-key') {
    throw new Error('لم يُرجع المتصفح مفتاح مصادقة حيوية صالحاً.');
  }

  const pkCred = created as PublicKeyCredential;
  const credentialId = pkCred.id || bufferToBase64Url(pkCred.rawId);
  const attestationResp = pkCred.response as AuthenticatorAttestationResponse & {
    getPublicKey?: () => ArrayBuffer | null;
  };

  let publicKeySpki: string | undefined;
  try {
    const spkiBuf = attestationResp.getPublicKey?.();
    if (spkiBuf) {
      publicKeySpki = bufferToBase64Url(spkiBuf);
    }
  } catch {
    // Some browsers omit getPublicKey(); credentialId remains the primary verified handle
  }

  const nowIso = new Date().toISOString();
  const env = detectDeviceEnvironment();
  const biometricLabel =
    env.osName === 'iPhone' || env.osName === 'iPad'
      ? 'Face ID / Touch ID'
      : env.osName === 'Windows'
      ? 'Windows Hello'
      : env.osName === 'macOS'
      ? 'Touch ID (macOS)'
      : env.osName === 'Android'
      ? 'بصمة جهاز Android'
      : 'البصمة الحيوية للجهاز';

  const updatedDevice: TrustedDevice = {
    ...trustedDevice,
    biometricEnabled: true,
    biometricCredentialId: credentialId,
    ...(publicKeySpki ? { biometricPublicKeySpki: publicKeySpki } : {}),
    biometricEnabledAt: nowIso,
    biometricLabel,
    lastUsedAt: nowIso,
  };

  await updateDocument(
    TRUSTED_DEVICES_COLLECTION,
    trustedDevice.id,
    {
      biometricEnabled: true,
      biometricCredentialId: credentialId,
      ...(publicKeySpki ? { biometricPublicKeySpki: publicKeySpki } : {}),
      biometricEnabledAt: nowIso,
      biometricLabel,
      lastUsedAt: nowIso,
    },
    { forceWrite: true }
  );

  // Store local pointer for quick biometric login button on this exact trusted device
  const existingBindings = getLocalBiometricBindings().filter((b) => b.userId !== user.id);
  saveLocalBiometricBindings([
    {
      userId: user.id,
      userEmail: cleanEmail,
      userName: user.fullName || cleanEmail,
      userRole: user.role,
      deviceId: trustedDevice.id,
      credentialId,
      deviceName: trustedDevice.deviceName,
      enabledAt: nowIso,
    },
    ...existingBindings,
  ]);

  await recordActivityLog({
    adminId: user.id,
    adminName: user.fullName,
    username: cleanEmail,
    userRole: user.role,
    category: 'الأمان والمصادقة',
    severity: 'info',
    action: `تفعيل الدخول السريع بالبصمة الحيوية (${biometricLabel}) على الجهاز الموثوق`,
    target: `المستخدم: ${user.fullName} — الجهاز: ${trustedDevice.deviceName}`,
    details: 'تم ربط مفتاح WebAuthn العام بالجهاز الموثوق بنجاح.',
  });

  return { credentialId, updatedDevice };
}

/**
 * Disables biometric login on a specific trusted device without revoking device trust.
 */
export async function disableDeviceBiometric(
  user: AdminUser,
  trustedDevice: TrustedDevice
): Promise<TrustedDevice> {
  const cleanEmail = (user.email || user.username || '').trim().toLowerCase();
  const updatedDevice: TrustedDevice = {
    ...trustedDevice,
    biometricEnabled: false,
    biometricCredentialId: '',
    biometricPublicKeySpki: '',
  };

  await updateDocument(
    TRUSTED_DEVICES_COLLECTION,
    trustedDevice.id,
    {
      biometricEnabled: false,
      biometricCredentialId: '',
      biometricPublicKeySpki: '',
    },
    { forceWrite: true }
  );

  removeLocalBiometricBinding(user.id, trustedDevice.id);

  await recordActivityLog({
    adminId: user.id,
    adminName: user.fullName,
    username: cleanEmail,
    userRole: user.role,
    category: 'الأمان والمصادقة',
    severity: 'info',
    action: `إيقاف الدخول بالبصمة الحيوية على الجهاز (${trustedDevice.deviceName})`,
    target: `المستخدم: ${user.fullName} (${cleanEmail})`,
  });

  return updatedDevice;
}

/**
 * Authenticates a user on the Login Gate using their bound platform Biometric (WebAuthn Assertion).
 * Verifies:
 * 1. Fresh WebAuthn cryptographic assertion with User-Verified (UV) flag.
 * 2. Live Firestore check that the user account is active (not suspended, no pending temp password).
 * 3. Live Firestore check that this exact device is still a valid, non-revoked Trusted Device with
 *    matching `deviceTokenHash`, `deviceFingerprint`, AND `biometricCredentialId`.
 */
export async function verifyBiometricQuickLogin(
  binding: LocalBiometricBinding
): Promise<{ user: AdminUser; device: TrustedDevice }> {
  const support = await checkBiometricSupport();
  if (!support.supported) {
    throw new Error(support.reasonAr || 'المصادقة بالبصمة غير مدعومة على هذا المتصفح.');
  }

  // Step 1: Verify live cloud trust BEFORE prompting biometric (fail fast if revoked by admin!)
  const liveTrusted = await verifyCurrentDeviceTrust(binding.userId);
  if (
    !liveTrusted ||
    liveTrusted.id !== binding.deviceId ||
    !liveTrusted.biometricEnabled ||
    liveTrusted.biometricCredentialId !== binding.credentialId
  ) {
    removeLocalBiometricBinding(binding.userId);
    throw new Error(
      'تم إلغاء توثيق هذا الجهاز أو تعطيل البصمة عليه. يرجى تسجيل الدخول بالطريقة الاعتيادية وإعادة التوثيق.'
    );
  }

  // Step 2: Live account status check (ensure not suspended / forced password change)
  const freshAdmins = await getDocuments<AdminUser>('adminUsers', { bypassCache: true });
  const liveUser = freshAdmins.find((u) => u.id === binding.userId);
  if (!liveUser) {
    removeLocalBiometricBinding(binding.userId);
    throw new Error('لم يعد هذا الحساب موجوداً في النظام.');
  }
  if (liveUser.status === 'suspended') {
    removeLocalBiometricBinding(binding.userId);
    throw new Error('عذراً، تم إيقاف وتجميد هذا الحساب من قِبل المالك الرئيسي للنظام.');
  }
  if (liveUser.mustChangePassword) {
    throw new Error('يتطلب هذا الحساب تغيير كلمة المرور أولاً عبر نموذج البريد وكلمة المرور.');
  }

  // Step 3: Challenge platform authenticator via WebAuthn `navigator.credentials.get`
  const challenge = generateChallengeBytes(32);
  const expectedChallengeB64 = bufferToBase64Url(challenge);
  const rpId = getSafeRpId();

  let assertion: Credential | null = null;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge as unknown as BufferSource,
        allowCredentials: [
          {
            id: base64UrlToUint8Array(binding.credentialId) as unknown as BufferSource,
            type: 'public-key',
            transports: ['internal'],
          },
        ],
        userVerification: 'required',
        timeout: 60000,
        ...(rpId ? { rpId } : {}),
      },
    });
  } catch (err: any) {
    const errName = err?.name || '';
    if (errName === 'NotAllowedError') {
      throw new Error('تم إلغاء التحقق بالبصمة أو تعذر قراءتها. يمكنك المحاولة مجدداً أو الدخول بكلمة المرور.');
    }
    throw new Error('تعذر التحقق بالبصمة على هذا الجهاز. يرجى الدخول بالطريقة الاعتيادية.');
  }

  if (!assertion || assertion.type !== 'public-key') {
    throw new Error('فشل التحقق من استجابة المصادقة الحيوية.');
  }

  const pkAssertion = assertion as PublicKeyCredential;
  const resp = pkAssertion.response as AuthenticatorAssertionResponse;

  // Verify credential ID match
  const returnedId = pkAssertion.id || bufferToBase64Url(pkAssertion.rawId);
  if (returnedId !== binding.credentialId) {
    throw new Error('مفتاح البصمة لا يطابق الجهاز الموثوق المسجل.');
  }

  // Verify clientDataJSON challenge & type
  const clientDataText = new TextDecoder().decode(resp.clientDataJSON);
  const clientData = JSON.parse(clientDataText) as {
    type?: string;
    challenge?: string;
    origin?: string;
  };
  if (clientData.type !== 'webauthn.get' || clientData.challenge !== expectedChallengeB64) {
    throw new Error('فشل التحقق التشفيري من تحدي المصادقة الحيوية.');
  }

  // Verify AuthenticatorData flags: bit 0 = UP (User Present), bit 2 = UV (User Verified)
  const authDataBytes = new Uint8Array(resp.authenticatorData);
  const flags = authDataBytes.length >= 33 ? authDataBytes[32] : 0;
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  if (!userPresent || !userVerified) {
    throw new Error('لم يؤكد الجهاز التحقق الحيوي من هوية المستخدم.');
  }

  // Update timestamps & record Audit Log
  const nowIso = new Date().toISOString();
  const cleanEmail = (liveUser.email || liveUser.username || '').trim().toLowerCase();
  await Promise.all([
    updateDocument('adminUsers', liveUser.id, { lastLoginAt: nowIso }, { forceWrite: true }).catch(() => {}),
    updateDocument(TRUSTED_DEVICES_COLLECTION, liveTrusted.id, { lastUsedAt: nowIso }, { forceWrite: true }).catch(() => {}),
  ]);

  await recordActivityLog({
    adminId: liveUser.id,
    adminName: liveUser.fullName,
    username: cleanEmail,
    userRole: liveUser.role,
    category: 'تسجيل دخول / خروج',
    severity: 'info',
    action: `تسجيل دخول سريع بالبصمة الحيوية من جهاز موثوق (${liveTrusted.deviceName})`,
    target: `المستخدم: ${liveUser.fullName} (${cleanEmail})`,
    details: `تم التحقق من البصمة عبر WebAuthn ومطابقة رمز الجهاز الموثوق.`,
  });

  return {
    user: { ...liveUser, lastLoginAt: nowIso },
    device: { ...liveTrusted, lastUsedAt: nowIso },
  };
}
