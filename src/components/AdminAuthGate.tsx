import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  Mail,
  Monitor,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { AdminUser, CampaignSettings } from '../types';
import { getDocuments, recordActivityLog, setDocument, updateDocument } from '../lib/db';
import {
  hashPasswordSecure,
  normalizePinInput,
  validateStrongPassword,
  verifyPasswordSecure,
} from '../utils/pinAuth';
import {
  buildOtpAuthUri,
  formatTotpSecretForDisplay,
  generateTotpQrDataUrl,
  generateTotpSecret,
  normalizeOtpDigits,
  verifyTotpCode,
} from '../utils/totpAuth';
import {
  checkAuthLockout,
  clearAuthLockout,
  formatCountdownMMSS,
  MAX_FAILED_AUTH_ATTEMPTS,
  recordFailedAuthAttempt,
} from '../utils/authSecurity';
import {
  DEFAULT_ROLE_PERMISSIONS,
  isSuperAdminGoogleEmail,
  isSuperAdminUser,
  migrateAdminUserRecord,
  SUPER_ADMIN_GOOGLE_EMAIL,
} from '../utils/rbac';
import {
  detectDeviceEnvironment,
  recordNewDeviceSecurityAlert,
  registerTrustedDeviceForUser,
  verifyCurrentDeviceTrust,
} from '../utils/trustedDevices';
import {
  getLocalBiometricBindings,
  LocalBiometricBinding,
  verifyBiometricQuickLogin,
} from '../utils/biometricAuth';

type AuthStage = 'login' | 'force_password_change' | 'setup_2fa' | 'verify_2fa';

export type AdminAuthMethod =
  | 'google'
  | 'password_2fa'
  | 'google_2fa'
  | 'trusted_device'
  | 'biometric';

interface AdminAuthGateProps {
  adminUsers: AdminUser[];
  campaignSettings: CampaignSettings;
  pendingSuperAdmin2FA?: AdminUser | null;
  externalNotice?: string;
  onClearExternalNotice?: () => void;
  onCancelPendingSuperAdmin2FA?: () => Promise<void> | void;
  onAuthSuccess: (user: AdminUser, method: AdminAuthMethod) => void;
}

export const AdminAuthGate: React.FC<AdminAuthGateProps> = ({
  adminUsers,
  campaignSettings,
  pendingSuperAdmin2FA,
  externalNotice,
  onClearExternalNotice,
  onCancelPendingSuperAdmin2FA,
  onAuthSuccess,
}) => {
  const [stage, setStage] = useState<AuthStage>('login');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Forced password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [tempPasswordUsed, setTempPasswordUsed] = useState('');

  // 2FA setup & verification state
  const [pendingUser, setPendingUser] = useState<AdminUser | null>(null);
  const [pendingLoginMethod, setPendingLoginMethod] = useState<'google_2fa' | 'password_2fa'>('password_2fa');
  const [setupSecret, setSetupSecret] = useState('');
  const [setupQrDataUrl, setSetupQrDataUrl] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [otpInput, setOtpInput] = useState('');

  // Trusted Devices & Biometric Quick Login state
  const [trustThisDevice, setTrustThisDevice] = useState(true);
  const [isNewDeviceChallenge, setIsNewDeviceChallenge] = useState(false);
  const [biometricBindings, setBiometricBindings] = useState<LocalBiometricBinding[]>([]);
  const [biometricBusyUserId, setBiometricBusyUserId] = useState<string | null>(null);
  const currentDeviceEnv = detectDeviceEnvironment();

  // Error, info, loading & brute-force lockout state
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lockoutUntilMs, setLockoutUntilMs] = useState<number>(0);
  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState<number>(0);
  const [remainingAttemptsWarn, setRemainingAttemptsWarn] = useState<number | null>(null);

  // Load locally bound WebAuthn biometric accounts on this trusted device
  useEffect(() => {
    setBiometricBindings(getLocalBiometricBindings());
  }, [stage]);

  // If App.tsx detected an existing Google session for Super Admin with optional 2FA enabled, jump to verify_2fa
  useEffect(() => {
    if (pendingSuperAdmin2FA && pendingSuperAdmin2FA.totpEnabled && pendingSuperAdmin2FA.totpSecret) {
      setPendingUser(pendingSuperAdmin2FA);
      setPendingLoginMethod('google_2fa');
      setIsNewDeviceChallenge(true);
      setTrustThisDevice(true);
      setStage('verify_2fa');
      setOtpInput('');
      setErrorMsg('');
      setInfoMsg('يرجى إدخال رمز التحقق بخطوتين (6 أرقام) من تطبيق المصادقة لإتمام دخول المالك الرئيسي.');
    }
  }, [pendingSuperAdmin2FA]);

  // Live 1-second countdown timer during 15-minute lockout
  useEffect(() => {
    if (!lockoutUntilMs || lockoutUntilMs <= Date.now()) {
      setLockoutSecondsLeft(0);
      return;
    }
    const tick = () => {
      const diff = Math.ceil((lockoutUntilMs - Date.now()) / 1000);
      if (diff <= 0) {
        setLockoutSecondsLeft(0);
        setLockoutUntilMs(0);
        setRemainingAttemptsWarn(null);
      } else {
        setLockoutSecondsLeft(diff);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [lockoutUntilMs]);

  const isLockedOut = lockoutSecondsLeft > 0;

  const prepareTotpSetupStage = async (user: AdminUser) => {
    const freshSecret = generateTotpSecret(20);
    const accountLabel = (user.email || user.username || 'staff@alqaemhajj.com').trim().toLowerCase();
    const uri = buildOtpAuthUri(accountLabel, freshSecret);
    const qrUrl = await generateTotpQrDataUrl(uri);
    setPendingUser(user);
    setSetupSecret(freshSecret);
    setSetupQrDataUrl(qrUrl);
    setOtpInput('');
    setErrorMsg('');
    setInfoMsg('التحقق بخطوتين (2FA) إلزامي لحسابات المخولين. امسح رمز QR بتطبيق Google أو Microsoft Authenticator ثم أدخل الرمز المكون من 6 أرقام.');
    setStage('setup_2fa');
  };

  const resetToLogin = async () => {
    if (pendingLoginMethod === 'google_2fa' && onCancelPendingSuperAdmin2FA) {
      await onCancelPendingSuperAdmin2FA();
    }
    setStage('login');
    setPendingUser(null);
    setSetupSecret('');
    setSetupQrDataUrl('');
    setOtpInput('');
    setNewPassword('');
    setConfirmNewPassword('');
    setTempPasswordUsed('');
    setIsNewDeviceChallenge(false);
    setTrustThisDevice(true);
    setErrorMsg('');
    setInfoMsg('');
  };

  // =========================================================================
  // 0. BIOMETRIC QUICK LOGIN (WebAuthn Platform Authenticator on Trusted Device)
  // =========================================================================
  const handleBiometricQuickLogin = async (binding: LocalBiometricBinding) => {
    if (isSubmitting || biometricBusyUserId) return;
    setErrorMsg('');
    setInfoMsg('');
    onClearExternalNotice?.();

    const lockCheck = await checkAuthLockout(binding.userEmail);
    if (lockCheck.isLocked) {
      setLockoutUntilMs(lockCheck.lockedUntil);
      setErrorMsg('تم حظر تسجيل الدخول مؤقتاً لمدة 15 دقيقة بسبب تكرار المحاولات الخاطئة.');
      return;
    }

    setBiometricBusyUserId(binding.userId);
    try {
      const result = await verifyBiometricQuickLogin(binding);
      const normalizedUser = migrateAdminUserRecord(
        result.user,
        campaignSettings.rolePermissionTemplates
      );
      await clearAuthLockout(binding.userEmail);
      onAuthSuccess(normalizedUser, 'biometric');
    } catch (err: any) {
      setBiometricBindings(getLocalBiometricBindings());
      setErrorMsg(
        err?.message || 'تعذر تسجيل الدخول بالبصمة على هذا الجهاز. يرجى الدخول بالطريقة الاعتيادية.'
      );
    } finally {
      setBiometricBusyUserId(null);
    }
  };

  // =========================================================================
  // 1. SUPER ADMIN ONLY GOOGLE SIGN-IN (Strict Whitelist: alqaemhajj313@gmail.com)
  // =========================================================================
  const handleGoogleOwnerLogin = async () => {
    if (isSubmitting) return;
    setErrorMsg('');
    setInfoMsg('');
    onClearExternalNotice?.();
    setIsSubmitting(true);

    try {
      const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
      const { auth } = await import('../lib/firebase');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      const cred = await signInWithPopup(auth, provider);
      const normEmail = (cred.user.email || '').trim().toLowerCase();

      // STRICT WHITELIST: ONLY alqaemhajj313@gmail.com is permitted via Google
      if (!isSuperAdminGoogleEmail(normEmail) || cred.user.emailVerified === false) {
        await auth.signOut();
        await recordActivityLog({
          adminId: 'blocked-google-auth',
          adminName: cred.user.displayName || normEmail || 'حساب غير مصرح',
          username: normEmail || 'unknown',
          userRole: 'محاولة دخول مرفوضة عبر Google',
          category: 'الأمان والمصادقة',
          severity: 'critical',
          action: 'رفض تسجيل دخول عبر Google لحساب غير مدرج في القائمة البيضاء للمالك الرئيسي',
          target: `البريد المرفوض: ${normEmail || 'غير معروف'}`,
          details: `الدخول عبر Google محصور حصرياً بالمالك الرئيسي (${SUPER_ADMIN_GOOGLE_EMAIL}).`,
        });
        setErrorMsg('عذراً، هذا الحساب غير مصرح له بالدخول عبر Google');
        return;
      }

      // Check lockout for Super Admin (if 2FA was repeatedly failed)
      const lockCheck = await checkAuthLockout(SUPER_ADMIN_GOOGLE_EMAIL);
      if (lockCheck.isLocked) {
        await auth.signOut();
        setLockoutUntilMs(lockCheck.lockedUntil);
        setErrorMsg(
          `تم حظر محاولات الدخول مؤقتاً لمدة 15 دقيقة بسبب تكرار المحاولات الخاطئة. يرجى الانتظار حتى انتهاء المؤقت.`
        );
        return;
      }

      // Load or bootstrap canonical Super Admin record ('usr-1')
      const dbAdmins = await getDocuments<AdminUser>('adminUsers', { bypassCache: true });
      const existingOwner = dbAdmins.find(
        (u) =>
          u.id === 'usr-1' ||
          u.isSuperAdminOwner === true ||
          isSuperAdminGoogleEmail(u.email) ||
          isSuperAdminGoogleEmail(u.username)
      );

      const nowIso = new Date().toISOString();
      const baseOwner: AdminUser = existingOwner
        ? {
            ...migrateAdminUserRecord(existingOwner, campaignSettings.rolePermissionTemplates),
            id: existingOwner.id || 'usr-1',
            username: SUPER_ADMIN_GOOGLE_EMAIL,
            email: SUPER_ADMIN_GOOGLE_EMAIL,
            role: 'الإدارة العامة',
            isSuperAdminOwner: true,
            status: 'active',
            sessionVersion: existingOwner.sessionVersion || 1,
          }
        : {
            id: 'usr-1',
            username: SUPER_ADMIN_GOOGLE_EMAIL,
            email: SUPER_ADMIN_GOOGLE_EMAIL,
            pin: '',
            fullName: cred.user.displayName || 'المالك الرئيسي — الإدارة العامة للقافلة',
            role: 'الإدارة العامة',
            isSuperAdminOwner: true,
            status: 'active',
            mustChangePassword: false,
            totpEnabled: false,
            sessionVersion: 1,
            assignedSeason: 'موسم 1448هـ',
            assignedCaravan: 'جميع القوافل والأفواج',
            detailedPermissions: DEFAULT_ROLE_PERMISSIONS['الإدارة العامة'],
            permissions: {
              managePilgrims: true,
              manageAnnouncements: true,
              managePackages: true,
              manageStaff: true,
              manageFinance: true,
              manageReligiousGuide: true,
              manageTravelKit: true,
              manageNotifications: true,
              manageGifts: true,
              manageCultural: true,
            },
            createdAt: nowIso.split('T')[0],
          };

      // Persist/update owner record cleanly
      await setDocument(
        'adminUsers',
        baseOwner.id,
        {
          ...baseOwner,
          lastLoginAt: nowIso,
          updatedAt: nowIso,
        },
        { forceWrite: true }
      ).catch(() => {});

      // If Super Admin voluntarily enabled optional 2FA, check if this device is already trusted first
      if (baseOwner.totpEnabled && baseOwner.totpSecret) {
        const trustedDevice = await verifyCurrentDeviceTrust(baseOwner.id);
        if (trustedDevice) {
          await clearAuthLockout(SUPER_ADMIN_GOOGLE_EMAIL);
          await recordActivityLog({
            adminId: baseOwner.id,
            adminName: baseOwner.fullName,
            username: SUPER_ADMIN_GOOGLE_EMAIL,
            userRole: 'الإدارة العامة (المالك الرئيسي)',
            category: 'تسجيل دخول / خروج',
            action: `تسجيل دخول مباشر للمالك الرئيسي من جهاز موثوق (${trustedDevice.deviceName})`,
            target: `الحساب: ${SUPER_ADMIN_GOOGLE_EMAIL}`,
            details: 'تم التحقق من بصمة ورمز الجهاز الموثوق وتجاوز خطوة 2FA تلقائياً.',
          });
          onAuthSuccess({ ...baseOwner, lastLoginAt: nowIso }, 'trusted_device');
          return;
        }

        void recordNewDeviceSecurityAlert(baseOwner);
        setPendingUser(baseOwner);
        setPendingLoginMethod('google_2fa');
        setIsNewDeviceChallenge(true);
        setTrustThisDevice(true);
        setOtpInput('');
        setInfoMsg('حساب المالك محمي بالتحقق بخطوتين (2FA) وهذا جهاز غير موثوق. يرجى إدخال الرمز المكون من 6 أرقام من تطبيق المصادقة.');
        setStage('verify_2fa');
        return;
      }

      await clearAuthLockout(SUPER_ADMIN_GOOGLE_EMAIL);
      await recordActivityLog({
        adminId: baseOwner.id,
        adminName: baseOwner.fullName,
        username: SUPER_ADMIN_GOOGLE_EMAIL,
        userRole: 'الإدارة العامة (المالك الرئيسي)',
        category: 'تسجيل دخول / خروج',
        action: 'تسجيل دخول ناجح للمالك الرئيسي عبر حساب Google المعتمد',
        target: `الحساب: ${SUPER_ADMIN_GOOGLE_EMAIL}`,
        details: 'تم التحقق من القائمة البيضاء الصارمة للمالك الرئيسي.',
      });

      onAuthSuccess({ ...baseOwner, lastLoginAt: nowIso }, 'google');
    } catch (err: any) {
      const errCode = err?.code || '';
      if (errCode === 'auth/popup-closed-by-user' || errCode === 'auth/cancelled-popup-request') {
        setErrorMsg('تم إغلاق نافذة تسجيل الدخول عبر Google قبل إتمام المصادقة.');
      } else if (errCode === 'auth/operation-not-allowed') {
        setErrorMsg('خاصية تسجيل الدخول عبر Google غير مفعّلة حالياً في إعدادات Firebase (auth/operation-not-allowed).');
      } else if (errCode === 'auth/unauthorized-domain') {
        setErrorMsg('هذا النطاق (Domain) غير مضاف في Authorized domains داخل لوحة تحكم Firebase.');
      } else if (errCode === 'auth/popup-blocked') {
        setErrorMsg('تم حظر النافذة المنبثقة من المتصفح. يرجى السماح بالنوافذ المنبثقة لهذا الموقع والمحاولة مجدداً.');
      } else {
        setErrorMsg('تعذر إتمام تسجيل الدخول عبر Google. يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================================
  // 2. STAFF EMAIL + PASSWORD LOGIN (No public sign-up, brute-force protected)
  // =========================================================================
  const handleStaffPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg('');
    setInfoMsg('');
    onClearExternalNotice?.();

    const cleanEmail = emailInput.trim().toLowerCase();
    const rawPassword = passwordInput;

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني الصحيح لحساب الموظف.');
      return;
    }
    if (!rawPassword.trim()) {
      setErrorMsg('يرجى إدخال كلمة المرور.');
      return;
    }

    // Super Admin owner account uses Google Sign-in exclusively unless a password was explicitly set
    setIsSubmitting(true);
    try {
      // Step 1: Check 15-minute brute-force lockout BEFORE verifying credentials
      const lockCheck = await checkAuthLockout(cleanEmail);
      if (lockCheck.isLocked) {
        setLockoutUntilMs(lockCheck.lockedUntil);
        setErrorMsg('تم حظر تسجيل الدخول مؤقتاً لمدة 15 دقيقة بسبب 5 محاولات خاطئة متتالية.');
        return;
      }

      // Step 2: Load fresh adminUsers from Firestore (bypass cache to detect instant freeze/updates)
      const dbAdmins = await getDocuments<AdminUser>('adminUsers', { bypassCache: true });
      const mergedMap = new Map<string, AdminUser>();
      for (const u of dbAdmins) {
        if (u?.id) mergedMap.set(u.id, u);
      }
      for (const u of adminUsers) {
        if (u?.id && !mergedMap.has(u.id)) mergedMap.set(u.id, u);
      }
      const allUsers = Array.from(mergedMap.values());

      const matched = allUsers.find((u) => {
        const uUsername = (u.username || '').trim().toLowerCase();
        const uEmail = (u.email || '').trim().toLowerCase();
        return uUsername === cleanEmail || uEmail === cleanEmail;
      });

      if (!matched) {
        const failRes = await recordFailedAuthAttempt(cleanEmail, 'password');
        if (failRes.isLocked) {
          setLockoutUntilMs(failRes.lockedUntil);
          setRemainingAttemptsWarn(0);
          setErrorMsg('تم تعليق الدخول مؤقتاً لمدة 15 دقيقة بعد 5 محاولات فاشلة متتالية.');
        } else {
          setRemainingAttemptsWarn(failRes.remainingAttempts);
          setErrorMsg('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
        }
        return;
      }

      // Reject Google-only Super Admin trying password login when no password hash is set
      if (isSuperAdminUser(matched) && !matched.pin) {
        setErrorMsg(
          `حساب المالك الرئيسي (${SUPER_ADMIN_GOOGLE_EMAIL}) مخصص للدخول الآمن عبر زر Google بالأعلى فقط.`
        );
        return;
      }

      // Step 3: Instant suspension / freeze check
      if (matched.status === 'suspended') {
        await recordActivityLog({
          adminId: matched.id,
          adminName: matched.fullName,
          username: matched.username,
          userRole: matched.role,
          category: 'الأمان والمصادقة',
          severity: 'warning',
          action: 'منع محاولة دخول لحساب موظف مجمد / موقوف',
          target: `الحساب الموقوف: ${matched.fullName} (${cleanEmail})`,
          details: 'الحساب معطل حالياً من قِبل المالك الرئيسي.',
        });
        setErrorMsg('عذراً، تم إيقاف وتجميد هذا الحساب من قِبل المالك الرئيسي للنظام.');
        return;
      }

      // Step 4: Verify hashed password (PBKDF2-SHA256 or legacy SHA-256)
      const passwordOk = await verifyPasswordSecure(matched.pin, rawPassword);
      if (!passwordOk) {
        const failRes = await recordFailedAuthAttempt(cleanEmail, 'password', {
          fullName: matched.fullName,
          role: matched.role,
        });
        if (failRes.isLocked) {
          setLockoutUntilMs(failRes.lockedUntil);
          setRemainingAttemptsWarn(0);
          setErrorMsg('تم حظر تسجيل الدخول مؤقتاً لمدة 15 دقيقة بعد 5 محاولات فاشلة متتالية.');
        } else {
          setRemainingAttemptsWarn(failRes.remainingAttempts);
          setErrorMsg('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
        }
        return;
      }

      // Password verified -> migrate role metadata cleanly
      const normalizedUser = migrateAdminUserRecord(matched, campaignSettings.rolePermissionTemplates);
      setRemainingAttemptsWarn(null);
      setPendingLoginMethod('password_2fa');
      setPendingUser(normalizedUser);
      setTempPasswordUsed(rawPassword);

      // Step 5: Mandatory first-login password change gate
      if (normalizedUser.mustChangePassword) {
        setNewPassword('');
        setConfirmNewPassword('');
        setInfoMsg('يرجى تعيين كلمة مرور قوية خاصة بك بدلاً من كلمة المرور المؤقتة قبل المتابعة.');
        setStage('force_password_change');
        return;
      }

      // Step 6: Mandatory 2FA (TOTP) gate for all staff accounts
      if (!normalizedUser.totpEnabled || !normalizedUser.totpSecret) {
        setTrustThisDevice(true);
        await prepareTotpSetupStage(normalizedUser);
        return;
      }

      // Step 7: Trusted Device Check — frictionless 2FA bypass on verified trusted device
      const trustedDevice = await verifyCurrentDeviceTrust(normalizedUser.id);
      if (trustedDevice) {
        const nowIso = new Date().toISOString();
        await updateDocument(
          'adminUsers',
          normalizedUser.id,
          { lastLoginAt: nowIso },
          { forceWrite: true }
        ).catch(() => {});
        await clearAuthLockout(cleanEmail);
        await recordActivityLog({
          adminId: normalizedUser.id,
          adminName: normalizedUser.fullName,
          username: cleanEmail,
          userRole: normalizedUser.role,
          category: 'تسجيل دخول / خروج',
          action: `تسجيل دخول مباشر للموظف من جهاز موثوق (${trustedDevice.deviceName})`,
          target: `الموظف: ${normalizedUser.fullName} (${cleanEmail})`,
          details: 'تم التحقق من كلمة المرور ومطابقة بصمة ورمز الجهاز الموثوق — تم تجاوز 2FA تلقائياً.',
        });
        onAuthSuccess({ ...normalizedUser, lastLoginAt: nowIso }, 'trusted_device');
        return;
      }

      // Step 8: Unrecognized / New Device -> strictly enforce 2FA + record New Device Security Alert
      void recordNewDeviceSecurityAlert(normalizedUser);
      setIsNewDeviceChallenge(true);
      setTrustThisDevice(true);
      setOtpInput('');
      setInfoMsg('تم رصد تسجيل دخول من جهاز جديد غير موثوق. أدخل الرمز المكون من 6 أرقام من تطبيق المصادقة للمتابعة.');
      setStage('verify_2fa');
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================================
  // 3. MANDATORY FIRST-LOGIN STRONG PASSWORD CHANGE
  // =========================================================================
  const strengthReport = validateStrongPassword(newPassword);

  const handleForcedPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUser || isSubmitting) return;
    setErrorMsg('');

    if (!strengthReport.isValid) {
      setErrorMsg(strengthReport.errors[0] || 'كلمة المرور الجديدة لا تستوفي شروط القوة المطلوبة.');
      return;
    }
    if (normalizePinInput(newPassword) === normalizePinInput(tempPasswordUsed)) {
      setErrorMsg('يجب اختيار كلمة مرور جديدة مختلفة تماماً عن كلمة المرور المؤقتة.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('تأكيد كلمة المرور غير متطابق.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Re-verify account wasn't suspended in the meantime
      const freshDocs = await getDocuments<AdminUser>('adminUsers', { bypassCache: true });
      const liveRec = freshDocs.find((u) => u.id === pendingUser.id);
      if (liveRec?.status === 'suspended') {
        await resetToLogin();
        setErrorMsg('تم إيقاف حسابك من قِبل المالك الرئيسي للنظام.');
        return;
      }

      const nowIso = new Date().toISOString();
      const newHash = await hashPasswordSecure(newPassword);
      const updatedUser: AdminUser = {
        ...pendingUser,
        pin: newHash,
        mustChangePassword: false,
        passwordChangedAt: nowIso,
        updatedAt: nowIso,
      };

      await updateDocument(
        'adminUsers',
        updatedUser.id,
        {
          pin: newHash,
          mustChangePassword: false,
          passwordChangedAt: nowIso,
          updatedAt: nowIso,
        },
        { forceWrite: true }
      );

      await recordActivityLog({
        adminId: updatedUser.id,
        adminName: updatedUser.fullName,
        username: updatedUser.email || updatedUser.username,
        userRole: updatedUser.role,
        category: 'الأمان والمصادقة',
        action: 'تعيين كلمة مرور قوية جديدة بنجاح (تغيير إجباري عند أول تسجيل دخول)',
        target: `الموظف: ${updatedUser.fullName} (${updatedUser.email || updatedUser.username})`,
      });

      setPendingUser(updatedUser);
      setNewPassword('');
      setConfirmNewPassword('');
      setTempPasswordUsed('');

      // Next mandatory gate: 2FA Setup or Verify
      if (!updatedUser.totpEnabled || !updatedUser.totpSecret) {
        await prepareTotpSetupStage(updatedUser);
      } else {
        setOtpInput('');
        setInfoMsg('تم تحديث كلمة المرور بنجاح. أدخل الآن رمز التحقق بخطوتين (6 أرقام).');
        setStage('verify_2fa');
      }
    } catch {
      setErrorMsg('تعذر حفظ كلمة المرور الجديدة. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================================
  // 4. FIRST-TIME 2FA QR SETUP CONFIRMATION
  // =========================================================================
  const handleConfirmTotpSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUser || !setupSecret || isSubmitting) return;
    setErrorMsg('');

    const accountEmail = (pendingUser.email || pendingUser.username || '').trim().toLowerCase();
    const lockCheck = await checkAuthLockout(accountEmail);
    if (lockCheck.isLocked) {
      setLockoutUntilMs(lockCheck.lockedUntil);
      setErrorMsg('تم حظر تسجيل الدخول مؤقتاً لمدة 15 دقيقة بسبب تكرار المحاولات الخاطئة.');
      return;
    }

    const cleanCode = normalizeOtpDigits(otpInput);
    if (cleanCode.length !== 6) {
      setErrorMsg('يرجى إدخال رمز التحقق المكون من 6 أرقام من تطبيق المصادقة.');
      return;
    }

    setIsSubmitting(true);
    try {
      const valid = await verifyTotpCode(setupSecret, cleanCode);
      if (!valid) {
        const failRes = await recordFailedAuthAttempt(accountEmail, 'totp', {
          fullName: pendingUser.fullName,
          role: pendingUser.role,
        });
        if (failRes.isLocked) {
          setLockoutUntilMs(failRes.lockedUntil);
          setStage('login');
          setErrorMsg('تم حظر الدخول مؤقتاً لمدة 15 دقيقة بعد 5 محاولات خاطئة متتالية.');
        } else {
          setRemainingAttemptsWarn(failRes.remainingAttempts);
          setErrorMsg('رمز التحقق غير صحيح أو منتهي الصلاحية. تأكد من تطابق وقت الهاتف وأعد المحاولة.');
        }
        return;
      }

      // Check account wasn't suspended while setting up 2FA
      const freshDocs = await getDocuments<AdminUser>('adminUsers', { bypassCache: true });
      const liveRec = freshDocs.find((u) => u.id === pendingUser.id);
      if (liveRec?.status === 'suspended') {
        await resetToLogin();
        setErrorMsg('تم إيقاف حسابك من قِبل المالك الرئيسي للنظام.');
        return;
      }

      const nowIso = new Date().toISOString();
      const activatedUser: AdminUser = {
        ...pendingUser,
        totpEnabled: true,
        totpSecret: setupSecret,
        totpConfiguredAt: nowIso,
        lastLoginAt: nowIso,
        updatedAt: nowIso,
        sessionVersion: liveRec?.sessionVersion || pendingUser.sessionVersion || 1,
      };

      await updateDocument(
        'adminUsers',
        activatedUser.id,
        {
          totpEnabled: true,
          totpSecret: setupSecret,
          totpConfiguredAt: nowIso,
          lastLoginAt: nowIso,
          updatedAt: nowIso,
        },
        { forceWrite: true }
      );

      await clearAuthLockout(accountEmail);
      if (trustThisDevice) {
        await registerTrustedDeviceForUser(activatedUser).catch(() => {});
      }
      await recordActivityLog({
        adminId: activatedUser.id,
        adminName: activatedUser.fullName,
        username: accountEmail,
        userRole: activatedUser.role,
        category: 'تسجيل دخول / خروج',
        action: 'تفعيل التحقق بخطوتين (2FA) وربط تطبيق المصادقة + تسجيل دخول ناجح',
        target: `الموظف: ${activatedUser.fullName} (${accountEmail})`,
        details: trustThisDevice
          ? `الدور الوظيفي: ${activatedUser.role} | تم توثيق الجهاز الحالي (${currentDeviceEnv.deviceName}) كجهاز آمن وموثوق.`
          : `الدور الوظيفي: ${activatedUser.role}`,
      });

      onAuthSuccess(activatedUser, 'password_2fa');
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================================
  // 5. SUBSEQUENT LOGIN 2FA VERIFICATION (Staff & Optional Super Admin 2FA)
  // =========================================================================
  const handleVerifyTotpLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUser || !pendingUser.totpSecret || isSubmitting) return;
    setErrorMsg('');

    const accountEmail = (pendingUser.email || pendingUser.username || '').trim().toLowerCase();
    const lockCheck = await checkAuthLockout(accountEmail);
    if (lockCheck.isLocked) {
      setLockoutUntilMs(lockCheck.lockedUntil);
      setErrorMsg('تم حظر تسجيل الدخول مؤقتاً لمدة 15 دقيقة بسبب تكرار المحاولات الخاطئة.');
      return;
    }

    const cleanCode = normalizeOtpDigits(otpInput);
    if (cleanCode.length !== 6) {
      setErrorMsg('يرجى إدخال الرمز المكون من 6 أرقام.');
      return;
    }

    setIsSubmitting(true);
    try {
      const valid = await verifyTotpCode(pendingUser.totpSecret, cleanCode);
      if (!valid) {
        const failRes = await recordFailedAuthAttempt(accountEmail, 'totp', {
          fullName: pendingUser.fullName,
          role: pendingUser.role,
        });
        if (failRes.isLocked) {
          setLockoutUntilMs(failRes.lockedUntil);
          await resetToLogin();
          setErrorMsg('تم حظر الدخول مؤقتاً لمدة 15 دقيقة بعد 5 محاولات خاطئة متتالية.');
        } else {
          setRemainingAttemptsWarn(failRes.remainingAttempts);
          setErrorMsg('رمز التحقق بخطوتين غير صحيح. يرجى إدخال الرمز الحالي من تطبيق المصادقة.');
        }
        return;
      }

      // Live re-check for suspension / 2FA reset
      const freshDocs = await getDocuments<AdminUser>('adminUsers', { bypassCache: true });
      const liveRec = freshDocs.find((u) => u.id === pendingUser.id);
      if (liveRec?.status === 'suspended') {
        await resetToLogin();
        setErrorMsg('عذراً، تم إيقاف وتجميد هذا الحساب من قِبل المالك الرئيسي للنظام.');
        return;
      }

      const nowIso = new Date().toISOString();
      const finalUser: AdminUser = {
        ...migrateAdminUserRecord(liveRec || pendingUser, campaignSettings.rolePermissionTemplates),
        lastLoginAt: nowIso,
      };

      await updateDocument(
        'adminUsers',
        finalUser.id,
        { lastLoginAt: nowIso },
        { forceWrite: true }
      ).catch(() => {});

      await clearAuthLockout(accountEmail);
      if (trustThisDevice) {
        await registerTrustedDeviceForUser(finalUser).catch(() => {});
      }
      await recordActivityLog({
        adminId: finalUser.id,
        adminName: finalUser.fullName,
        username: accountEmail,
        userRole: finalUser.role,
        category: 'تسجيل دخول / خروج',
        action:
          pendingLoginMethod === 'google_2fa'
            ? 'تسجيل دخول ناجح للمالك الرئيسي (Google + التحقق بخطوتين 2FA)'
            : 'تسجيل دخول ناجح للموظف (كلمة المرور + التحقق بخطوتين 2FA)',
        target: `المستخدم: ${finalUser.fullName} (${accountEmail})`,
        details: trustThisDevice
          ? `الدور الوظيفي: ${finalUser.role} | تم توثيق الجهاز (${currentDeviceEnv.deviceName}) كجهاز موثوق.`
          : `الدور الوظيفي: ${finalUser.role}`,
      });

      onAuthSuccess(finalUser, pendingLoginMethod);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-10 px-4" dir="rtl">
      <div className="bg-white dark:bg-[#0B1221] border border-[#CBD5E1] dark:border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-[0_8px_28px_rgba(15,23,42,0.09)] dark:shadow-2xl space-y-6">
        {/* Top Icon & Header */}
        <div className="text-center space-y-2.5">
          <div className="w-16 h-16 bg-amber-50 dark:bg-amber-500/15 text-[#D97706] dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/40 dark:border-amber-500/35 shadow-xs">
            {stage === 'login' && <Lock className="w-8 h-8" />}
            {stage === 'force_password_change' && <KeyRound className="w-8 h-8" />}
            {stage === 'setup_2fa' && <QrCode className="w-8 h-8" />}
            {stage === 'verify_2fa' && <Smartphone className="w-8 h-8" />}
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-[#0F172A] dark:text-white">
              {stage === 'login' && 'بوابة دخول الإدارة والمخولين'}
              {stage === 'force_password_change' && 'تعيين كلمة مرور قوية (إلزامي)'}
              {stage === 'setup_2fa' && 'تفعيل التحقق بخطوتين (2FA)'}
              {stage === 'verify_2fa' && 'التحقق بخطوتين (2FA)'}
            </h2>
            <p className="text-xs text-[#475569] dark:text-slate-400 mt-1 font-medium leading-relaxed">
              {stage === 'login' && 'نظام مصادقة محمي لقافلة القائم — الدخول محصور للمالك الرئيسي والمخولين المعتمدين فقط'}
              {stage === 'force_password_change' &&
                `مرحباً ${pendingUser?.fullName || ''} — يجب تغيير كلمة المرور المؤقتة عند أول دخول`}
              {stage === 'setup_2fa' &&
                `تأمين حساب ${pendingUser?.fullName || ''} عبر Google / Microsoft Authenticator`}
              {stage === 'verify_2fa' &&
                `أدخل رمز المصادقة المتغير (6 أرقام) لحساب ${pendingUser?.fullName || ''}`}
            </p>
          </div>
        </div>

        {/* External Notice (e.g., Instant Freeze / Forced Logout) */}
        {externalNotice && (
          <div className="bg-red-50 dark:bg-red-500/15 border border-red-300 dark:border-red-500/40 p-4 rounded-2xl text-red-700 dark:text-red-300 text-xs font-bold leading-relaxed flex items-start gap-2.5 text-right">
            <ShieldAlert className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
            <span>{externalNotice}</span>
          </div>
        )}

        {/* Active 15-Minute Brute-Force Lockout Banner */}
        {isLockedOut && (
          <div className="bg-rose-50 dark:bg-rose-500/15 border border-rose-300 dark:border-rose-500/40 p-4 rounded-2xl text-rose-800 dark:text-rose-200 text-xs leading-relaxed space-y-2 text-right">
            <div className="flex items-center gap-2 font-black text-rose-700 dark:text-rose-300">
              <Clock className="w-4 h-4 shrink-0" />
              <span>تم تعليق تسجيل الدخول مؤقتاً (حماية ضد التخمين)</span>
            </div>
            <p>
              تجاوز هذا الحساب الحد الأقصى ({MAX_FAILED_AUTH_ATTEMPTS} محاولات فاشلة متتالية). يرجى الانتظار 15 دقيقة قبل المحاولة مجدداً.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-rose-950/60 border border-rose-300 dark:border-rose-500/40 font-mono font-black text-sm text-rose-700 dark:text-rose-300">
              <span>الوقت المتبقي:</span>
              <span dir="ltr">{formatCountdownMMSS(lockoutSecondsLeft)}</span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {errorMsg && !isLockedOut && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 p-3.5 rounded-2xl text-red-700 dark:text-red-400 text-xs leading-relaxed text-right space-y-1.5">
            <div className="flex items-start gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            {remainingAttemptsWarn !== null && remainingAttemptsWarn > 0 && remainingAttemptsWarn <= 3 && (
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 pr-6">
                تنبيه أمني: تبقى لديك {remainingAttemptsWarn} {remainingAttemptsWarn === 1 ? 'محاولة واحدة' : 'محاولات'} قبل الحظر المؤقت لمدة 15 دقيقة.
              </p>
            )}
          </div>
        )}

        {/* Info Banner */}
        {infoMsg && !errorMsg && (
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 p-3.5 rounded-2xl text-amber-900 dark:text-amber-300 text-xs font-medium leading-relaxed text-right">
            {infoMsg}
          </div>
        )}

        {/* ============================================================
            STAGE 1: LOGIN SCREEN (Google for Owner + Email/Password for Staff)
           ============================================================ */}
        {stage === 'login' && (
          <div className="space-y-5">
            {/* Quick Biometric Login on Verified Trusted Devices (Opt-In WebAuthn) */}
            {biometricBindings.length > 0 && (
              <div className="bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/35 rounded-2xl p-3.5 space-y-2.5 text-right">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-black text-emerald-900 dark:text-emerald-300">
                    <Fingerprint className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>الدخول السريع بالبصمة (جهاز موثوق)</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                    WebAuthn
                  </span>
                </div>
                <div className="space-y-2">
                  {biometricBindings.map((binding) => {
                    const busy = biometricBusyUserId === binding.userId;
                    return (
                      <button
                        key={binding.userId}
                        type="button"
                        disabled={isSubmitting || isLockedOut || Boolean(biometricBusyUserId)}
                        onClick={() => void handleBiometricQuickLogin(binding)}
                        className="w-full flex items-center justify-between gap-3 bg-white dark:bg-[#0B1221] hover:bg-emerald-100/70 dark:hover:bg-emerald-500/15 border border-emerald-300/80 dark:border-emerald-500/35 rounded-xl px-3.5 py-2.5 transition shadow-2xs cursor-pointer disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 text-right">
                          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                            {busy ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Fingerprint className="w-5 h-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-black text-[#0F172A] dark:text-white truncate">
                              {binding.userName}
                            </div>
                            <div className="text-[10px] font-mono text-[#475569] dark:text-slate-400 truncate" dir="ltr">
                              {binding.userEmail}
                            </div>
                          </div>
                        </div>
                        <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 shrink-0">
                          {busy ? 'جارٍ التحقق...' : 'الدخول السريع بالبصمة'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Super Admin Google Sign-in Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#475569] dark:text-slate-400 px-1">
                <span>دخول المالك الرئيسي (Super Admin)</span>
                <span className="text-amber-700 dark:text-amber-400 font-black">Google فقط</span>
              </div>
              <button
                type="button"
                disabled={isSubmitting || isLockedOut}
                onClick={handleGoogleOwnerLogin}
                className="w-full flex items-center justify-center gap-3 bg-white dark:bg-[#10192D] text-[#1E293B] dark:text-white border border-[#94A3B8] dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-[#16233E] hover:border-amber-500 dark:hover:border-amber-500/40 py-3.5 px-5 rounded-xl font-bold transition shadow-xs hover:shadow active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                ) : (
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 shrink-0">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                )}
                <span>تسجيل الدخول بواسطة Google</span>
              </button>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-[#CBD5E1] dark:border-slate-800" />
              </div>
              <div className="relative flex justify-center text-[11px]">
                <span className="bg-white dark:bg-[#0B1221] px-3 text-[#475569] dark:text-slate-400 font-bold">
                  أو دخول المخولين والموظفين (البريد وكلمة المرور)
                </span>
              </div>
            </div>

            {/* Staff Email + Password Form */}
            <form onSubmit={handleStaffPasswordLogin} className="space-y-4 text-right">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1E293B] dark:text-slate-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-amber-500" />
                  <span>البريد الإلكتروني للموظف</span>
                </label>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  disabled={isSubmitting || isLockedOut}
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  className="w-full bg-[#F8FAFC] dark:bg-[#070C18] border border-[#CBD5E1] dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-mono text-[#0F172A] dark:text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
                  placeholder="staff@alqaemhajj.com"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1E293B] dark:text-slate-300 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                  <span>كلمة المرور</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    disabled={isSubmitting || isLockedOut}
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                    className="w-full bg-[#F8FAFC] dark:bg-[#070C18] border border-[#CBD5E1] dark:border-slate-700 rounded-xl px-4 py-3 pl-11 text-sm font-mono text-[#0F172A] dark:text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
                    placeholder="••••••••"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3.5 top-3 text-[#475569] dark:text-slate-400 hover:text-amber-500 transition cursor-pointer"
                    title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isLockedOut}
                className="w-full bg-[#D97706] hover:bg-[#B45309] dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-black py-3.5 rounded-xl transition shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري التحقق الآمن...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>المتابعة للتحقق بخطوتين (2FA)</span>
                  </>
                )}
              </button>
            </form>

            {/* Security Policy Notice — Strictly No Public Sign-Up */}
            <div className="bg-[#F8FAFC] dark:bg-[#070C18] border border-[#CBD5E1] dark:border-slate-800 rounded-2xl p-3.5 text-[11px] text-[#475569] dark:text-slate-400 space-y-1 text-right">
              <div className="font-black text-[#0F172A] dark:text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>سياسة الأمان والحماية المفعّلة:</span>
              </div>
              <p>• التسجيل الذاتي مغلق؛ تُنشأ حسابات الموظفين حصرياً عبر المالك الرئيسي.</p>
              <p>• التحقق بخطوتين (2FA) إلزامي لجميع الموظفين، مع حظر 15 دقيقة بعد 5 محاولات خاطئة.</p>
            </div>
          </div>
        )}

        {/* ============================================================
            STAGE 2: MANDATORY FIRST-LOGIN STRONG PASSWORD CHANGE
           ============================================================ */}
        {stage === 'force_password_change' && pendingUser && (
          <form onSubmit={handleForcedPasswordSubmit} className="space-y-4 text-right">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#1E293B] dark:text-slate-300 block">
                كلمة المرور الجديدة القوية *
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  className="w-full bg-[#F8FAFC] dark:bg-[#070C18] border border-[#CBD5E1] dark:border-slate-700 rounded-xl px-4 py-3 pl-11 text-sm font-mono text-[#0F172A] dark:text-white focus:outline-none focus:border-amber-500"
                  placeholder="أدخل كلمة مرور قوية"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute left-3.5 top-3 text-[#475569] dark:text-slate-400 hover:text-amber-500 cursor-pointer"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Live Strong Password Checklist */}
            <div className="bg-[#F8FAFC] dark:bg-[#070C18] border border-[#CBD5E1] dark:border-slate-800 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-[#475569] dark:text-slate-300">متطلبات كلمة المرور القوية:</span>
                <span
                  className={
                    strengthReport.score >= 5
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : strengthReport.score >= 3
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }
                >
                  {strengthReport.score}/5
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5 text-[11px]">
                {[
                  { ok: strengthReport.checks.minLength, label: '8 أحرف على الأقل' },
                  { ok: strengthReport.checks.hasUpper, label: 'حرف إنجليزي كبير واحد على الأقل (A-Z)' },
                  { ok: strengthReport.checks.hasLower, label: 'حرف إنجليزي صغير واحد على الأقل (a-z)' },
                  { ok: strengthReport.checks.hasDigit, label: 'رقم واحد على الأقل (0-9)' },
                  { ok: strengthReport.checks.hasSpecial, label: 'رمز خاص واحد على الأقل (@ # $ % ! & *)' },
                ].map((rule, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 font-medium ${
                      rule.ok
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-[#64748B] dark:text-slate-400'
                    }`}
                  >
                    {rule.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-slate-400/70 inline-block shrink-0" />
                    )}
                    <span>{rule.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#1E293B] dark:text-slate-300 block">
                تأكيد كلمة المرور الجديدة *
              </label>
              <input
                type={showNewPassword ? 'text' : 'password'}
                required
                value={confirmNewPassword}
                onChange={(e) => {
                  setConfirmNewPassword(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                className="w-full bg-[#F8FAFC] dark:bg-[#070C18] border border-[#CBD5E1] dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-mono text-[#0F172A] dark:text-white focus:outline-none focus:border-amber-500"
                placeholder="أعد كتابة كلمة المرور الجديدة"
                dir="ltr"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !strengthReport.isValid || newPassword !== confirmNewPassword}
              className="w-full bg-[#D97706] hover:bg-[#B45309] dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-black py-3.5 rounded-xl transition shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>اعتماد كلمة المرور الجديدة والمتابعة</span>
            </button>

            <button
              type="button"
              onClick={resetToLogin}
              className="w-full py-2.5 text-xs font-bold text-[#475569] dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>العودة لصفحة تسجيل الدخول</span>
            </button>
          </form>
        )}

        {/* ============================================================
            STAGE 3: MANDATORY FIRST-TIME 2FA QR CODE SETUP
           ============================================================ */}
        {stage === 'setup_2fa' && pendingUser && (
          <form onSubmit={handleConfirmTotpSetup} className="space-y-4 text-right">
            <div className="bg-[#F8FAFC] dark:bg-[#070C18] border border-[#CBD5E1] dark:border-slate-800 rounded-2xl p-4 space-y-3 text-center">
              <div className="text-xs font-bold text-[#0F172A] dark:text-slate-200 leading-relaxed">
                1. افتح تطبيق <span className="text-amber-600 dark:text-amber-400 font-black">Google Authenticator</span> أو{' '}
                <span className="text-amber-600 dark:text-amber-400 font-black">Microsoft Authenticator</span> وامسح الرمز التالي:
              </div>

              {setupQrDataUrl ? (
                <div className="inline-block bg-white p-3 rounded-2xl border border-slate-200 shadow-sm mx-auto">
                  <img
                    src={setupQrDataUrl}
                    alt="رمز QR للتحقق بخطوتين 2FA"
                    className="w-48 h-48 mx-auto"
                  />
                </div>
              ) : (
                <div className="w-48 h-48 mx-auto flex items-center justify-center bg-slate-100 dark:bg-slate-900 rounded-2xl">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                </div>
              )}

              {/* Manual Secret Key Fallback */}
              <div className="pt-2 border-t border-[#CBD5E1] dark:border-slate-800 space-y-1.5">
                <div className="text-[11px] text-[#475569] dark:text-slate-400">
                  أو أدخل مفتاح الإعداد يدوياً في التطبيق:
                </div>
                <div className="flex items-center justify-center gap-2">
                  <code
                    dir="ltr"
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 font-mono text-xs font-bold text-[#0F172A] dark:text-amber-300 select-all"
                  >
                    {formatTotpSecretForDisplay(setupSecret)}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(setupSecret).catch(() => {});
                      setCopiedSecret(true);
                      setTimeout(() => setCopiedSecret(false), 2000);
                    }}
                    className="p-2 rounded-xl bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30 hover:bg-amber-100 cursor-pointer"
                    title="نسخ المفتاح السري"
                  >
                    {copiedSecret ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#1E293B] dark:text-slate-300 block">
                2. أدخل الرمز المكون من 6 أرقام لتأكيد الربط *
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                disabled={isSubmitting || isLockedOut}
                value={otpInput}
                onChange={(e) => {
                  setOtpInput(normalizeOtpDigits(e.target.value).slice(0, 6));
                  if (errorMsg) setErrorMsg('');
                }}
                className="w-full bg-[#F8FAFC] dark:bg-[#070C18] border border-[#CBD5E1] dark:border-slate-700 rounded-xl px-4 py-3.5 text-center text-2xl tracking-[0.45em] font-mono font-black text-[#0F172A] dark:text-amber-400 focus:outline-none focus:border-amber-500"
                placeholder="000000"
                dir="ltr"
              />
            </div>

            {/* Trust This Device Checkbox */}
            <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-300/80 dark:border-emerald-500/30 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={trustThisDevice}
                onChange={(e) => setTrustThisDevice(e.target.checked)}
                className="mt-1 w-4 h-4 rounded accent-emerald-600 cursor-pointer shrink-0"
              />
              <div className="space-y-0.5 text-right">
                <div className="text-xs font-black text-[#0F172A] dark:text-emerald-200 leading-snug">
                  توثيق هذا الجهاز كجهاز آمن وموثوق (عدم طلب رمز التحقق مستقبلاً على هذا الجهاز)
                </div>
                <div className="text-[11px] text-[#475569] dark:text-slate-400 flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span dir="ltr">{currentDeviceEnv.deviceName}</span>
                </div>
              </div>
            </label>

            <button
              type="submit"
              disabled={isSubmitting || isLockedOut || otpInput.length !== 6}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3.5 rounded-xl transition shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>تأكيد الربط والدخول للوحة التحكم</span>
            </button>

            <button
              type="button"
              onClick={resetToLogin}
              className="w-full py-2 text-xs font-bold text-[#475569] dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>إلغاء والعودة لتسجيل الدخول</span>
            </button>
          </form>
        )}

        {/* ============================================================
            STAGE 4: VERIFY 6-DIGIT TOTP ON EVERY SUBSEQUENT LOGIN
           ============================================================ */}
        {stage === 'verify_2fa' && pendingUser && (
          <form onSubmit={handleVerifyTotpLogin} className="space-y-4 text-right">
            <div className="bg-[#F8FAFC] dark:bg-[#070C18] border border-[#CBD5E1] dark:border-slate-800 rounded-2xl p-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="min-w-0 text-xs">
                <div className="font-black text-[#0F172A] dark:text-white truncate">{pendingUser.fullName}</div>
                <div className="font-mono text-[11px] text-[#475569] dark:text-slate-400 truncate" dir="ltr">
                  {pendingUser.email || pendingUser.username}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#1E293B] dark:text-slate-300 block">
                رمز التحقق المتغير (6 أرقام) *
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                required
                disabled={isSubmitting || isLockedOut}
                value={otpInput}
                onChange={(e) => {
                  setOtpInput(normalizeOtpDigits(e.target.value).slice(0, 6));
                  if (errorMsg) setErrorMsg('');
                }}
                className="w-full bg-[#F8FAFC] dark:bg-[#070C18] border border-[#CBD5E1] dark:border-slate-700 rounded-xl px-4 py-3.5 text-center text-2xl tracking-[0.45em] font-mono font-black text-[#0F172A] dark:text-amber-400 focus:outline-none focus:border-amber-500"
                placeholder="000000"
                dir="ltr"
              />
              <p className="text-[11px] text-[#475569] dark:text-slate-400">
                افتح تطبيق Google Authenticator أو Microsoft Authenticator وأدخل الرمز الحالي. في حال فقدت هاتفك تواصل مع المالك الرئيسي لإعادة تعيين الـ 2FA.
              </p>
            </div>

            {isNewDeviceChallenge && (
              <div className="bg-amber-50/90 dark:bg-amber-500/10 border border-amber-300/80 dark:border-amber-500/30 rounded-xl px-3 py-2.5 text-[11px] text-amber-900 dark:text-amber-300 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <span>
                  جهاز جديد غير موثوق (<strong dir="ltr">{currentDeviceEnv.deviceName}</strong>) — تم تسجيل تنبيه أمني لصاحب الحساب.
                </span>
              </div>
            )}

            {/* Trust This Device Checkbox */}
            <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-300/80 dark:border-emerald-500/30 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={trustThisDevice}
                onChange={(e) => setTrustThisDevice(e.target.checked)}
                className="mt-1 w-4 h-4 rounded accent-emerald-600 cursor-pointer shrink-0"
              />
              <div className="space-y-0.5 text-right">
                <div className="text-xs font-black text-[#0F172A] dark:text-emerald-200 leading-snug">
                  توثيق هذا الجهاز كجهاز آمن وموثوق (عدم طلب رمز التحقق مستقبلاً على هذا الجهاز)
                </div>
                <div className="text-[11px] text-[#475569] dark:text-slate-400 flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span dir="ltr">{currentDeviceEnv.deviceName}</span>
                </div>
              </div>
            </label>

            <button
              type="submit"
              disabled={isSubmitting || isLockedOut || otpInput.length !== 6}
              className="w-full bg-[#D97706] hover:bg-[#B45309] dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-black py-3.5 rounded-xl transition shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>تحقق ودخول لوحة التحكم</span>
            </button>

            <button
              type="button"
              onClick={resetToLogin}
              className="w-full py-2 text-xs font-bold text-[#475569] dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>تبديل الحساب / العودة</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
