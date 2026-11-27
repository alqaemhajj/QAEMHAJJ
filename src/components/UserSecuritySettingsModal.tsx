import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Laptop,
  Loader2,
  Lock,
  Monitor,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
  X,
} from 'lucide-react';
import { AdminUser, TrustedDevice } from '../types';
import { updateDocument } from '../lib/db';
import { verifyPasswordSecure } from '../utils/pinAuth';
import { normalizeOtpDigits, verifyTotpCode } from '../utils/totpAuth';
import { isSuperAdminUser } from '../utils/rbac';
import {
  detectDeviceEnvironment,
  formatDeviceTimestampAr,
  getLocalTrustedDeviceId,
  registerTrustedDeviceForUser,
  revokeTrustedDevice,
  subscribeToTrustedDevices,
  verifyCurrentDeviceTrust,
} from '../utils/trustedDevices';
import {
  BiometricSupportStatus,
  checkBiometricSupport,
  disableDeviceBiometric,
  enrollDeviceBiometric,
  removeLocalBiometricBinding,
} from '../utils/biometricAuth';

interface UserSecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAdminUser: AdminUser;
  onUserUpdated?: (updated: AdminUser) => void;
}

export const UserSecuritySettingsModal: React.FC<UserSecuritySettingsModalProps> = ({
  isOpen,
  onClose,
  currentAdminUser,
  onUserUpdated,
}) => {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [verifiedCurrentDevice, setVerifiedCurrentDevice] = useState<TrustedDevice | null>(null);
  const [biometricSupport, setBiometricSupport] = useState<BiometricSupportStatus | null>(null);

  // Ownership confirmation state (required when enabling Trust/Biometric from an untrusted device)
  const [showOwnershipPrompt, setShowOwnershipPrompt] = useState<'trust' | 'biometric' | null>(null);
  const [ownershipCodeInput, setOwnershipCodeInput] = useState('');
  const [ownershipPasswordInput, setOwnershipPasswordInput] = useState('');

  // Status & busy flags
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const currentEnv = useMemo(() => detectDeviceEnvironment(), []);
  const isOwnerAccount = isSuperAdminUser(currentAdminUser);
  const userEmail = (currentAdminUser.email || currentAdminUser.username || '').trim().toLowerCase();

  // Subscribe to this user's trusted devices + check current device trust & biometric capability
  useEffect(() => {
    if (!isOpen) return;
    setFeedback(null);
    setShowOwnershipPrompt(null);
    setOwnershipCodeInput('');
    setOwnershipPasswordInput('');
    setLoadingDevices(true);

    let active = true;

    const unsub = subscribeToTrustedDevices((allActive) => {
      if (!active) return;
      const mine = allActive.filter((d) => d.userId === currentAdminUser.id);
      setDevices(mine);
      setLoadingDevices(false);
    });

    verifyCurrentDeviceTrust(currentAdminUser.id)
      .then((matched) => {
        if (!active) return;
        setVerifiedCurrentDevice(matched);
      })
      .catch(() => {});

    checkBiometricSupport()
      .then((status) => {
        if (!active) return;
        setBiometricSupport(status);
      })
      .catch(() => {});

    return () => {
      active = false;
      unsub();
    };
  }, [isOpen, currentAdminUser.id]);

  // Keep verifiedCurrentDevice synchronized with live Firestore device updates
  const localDeviceId = getLocalTrustedDeviceId(currentAdminUser.id);
  const liveCurrentDevice = useMemo(() => {
    if (verifiedCurrentDevice) {
      return devices.find((d) => d.id === verifiedCurrentDevice.id) || null;
    }
    if (localDeviceId) {
      return devices.find((d) => d.id === localDeviceId) || null;
    }
    return null;
  }, [devices, verifiedCurrentDevice, localDeviceId]);

  const isCurrentDeviceTrusted = Boolean(liveCurrentDevice);
  const isBiometricActiveOnCurrentDevice = Boolean(
    liveCurrentDevice?.biometricEnabled && liveCurrentDevice?.biometricCredentialId
  );

  if (!isOpen) return null;

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
  };

  const renderDeviceIcon = (type: TrustedDevice['deviceType']) => {
    if (type === 'mobile') return <Smartphone className="w-5 h-5" />;
    if (type === 'tablet') return <Tablet className="w-5 h-5" />;
    return <Monitor className="w-5 h-5" />;
  };

  const needsOwnershipVerificationForCurrentDevice = (): boolean => {
    // Already verified as a Trusted Device -> ownership is proven
    if (isCurrentDeviceTrusted) return false;
    // If user has 2FA enabled or has a password hash -> require explicit 2FA/PIN ownership proof
    if (currentAdminUser.totpEnabled && currentAdminUser.totpSecret) return true;
    if (!isOwnerAccount && currentAdminUser.pin) return true;
    // Super Admin logged in via strict Google whitelist without optional 2FA
    return false;
  };

  const verifyOwnershipInputs = async (): Promise<boolean> => {
    if (currentAdminUser.totpEnabled && currentAdminUser.totpSecret) {
      const cleanOtp = normalizeOtpDigits(ownershipCodeInput);
      if (cleanOtp.length !== 6) {
        showToast('error', 'يرجى إدخال رمز التحقق بخطوتين (6 أرقام) لتأكيد ملكية الحساب.');
        return false;
      }
      const ok = await verifyTotpCode(currentAdminUser.totpSecret, cleanOtp, 1);
      if (!ok) {
        showToast('error', 'رمز التحقق بخطوتين (2FA) غير صحيح أو منتهي الصلاحية.');
        return false;
      }
      return true;
    }

    if (currentAdminUser.pin) {
      if (!ownershipPasswordInput.trim()) {
        showToast('error', 'يرجى إدخال كلمة المرور أو الرقم السري لتأكيد ملكية الحساب.');
        return false;
      }
      const ok = await verifyPasswordSecure(currentAdminUser.pin, ownershipPasswordInput);
      if (!ok) {
        showToast('error', 'كلمة المرور المدخلة غير صحيحة.');
        return false;
      }
      return true;
    }

    return true;
  };

  const executeTrustCurrentDevice = async () => {
    setBusyAction('trust_current');
    setFeedback(null);
    try {
      const registered = await registerTrustedDeviceForUser(currentAdminUser);
      setVerifiedCurrentDevice(registered);
      setShowOwnershipPrompt(null);
      setOwnershipCodeInput('');
      setOwnershipPasswordInput('');
      showToast(
        'success',
        `تم توثيق هذا الجهاز (${registered.deviceName}) بنجاح. لن يُطلب رمز الـ 2FA عليه مستقبلاً.`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'تعذر توثيق الجهاز حالياً.');
    } finally {
      setBusyAction(null);
    }
  };

  const executeEnableBiometric = async () => {
    setBusyAction('enable_biometric');
    setFeedback(null);
    try {
      // Ensure this device is registered as a Trusted Device first
      let targetDevice = liveCurrentDevice;
      if (!targetDevice) {
        targetDevice = await registerTrustedDeviceForUser(currentAdminUser);
        setVerifiedCurrentDevice(targetDevice);
      }

      const { updatedDevice } = await enrollDeviceBiometric({
        user: currentAdminUser,
        trustedDevice: targetDevice,
      });

      setVerifiedCurrentDevice(updatedDevice);
      setShowOwnershipPrompt(null);
      setOwnershipCodeInput('');
      setOwnershipPasswordInput('');
      showToast(
        'success',
        `تم تفعيل الدخول السريع بالبصمة (${updatedDevice.biometricLabel || 'البصمة الحيوية'}) وربطه بهذا الجهاز الموثوق بنجاح.`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'تعذر تفعيل البصمة على هذا الجهاز.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRequestTrustDevice = async () => {
    setFeedback(null);
    if (needsOwnershipVerificationForCurrentDevice()) {
      setShowOwnershipPrompt('trust');
      return;
    }
    await executeTrustCurrentDevice();
  };

  const handleRequestEnableBiometric = async () => {
    setFeedback(null);
    if (needsOwnershipVerificationForCurrentDevice()) {
      setShowOwnershipPrompt('biometric');
      return;
    }
    await executeEnableBiometric();
  };

  const handleConfirmOwnershipAndProceed = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setBusyAction('verify_owner');
    try {
      const verified = await verifyOwnershipInputs();
      if (!verified) return;

      if (showOwnershipPrompt === 'biometric') {
        await executeEnableBiometric();
      } else if (showOwnershipPrompt === 'trust') {
        await executeTrustCurrentDevice();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisableBiometric = async () => {
    if (!liveCurrentDevice) return;
    setBusyAction('disable_biometric');
    setFeedback(null);
    try {
      const updated = await disableDeviceBiometric(currentAdminUser, liveCurrentDevice);
      setVerifiedCurrentDevice(updated);
      showToast('success', 'تم إيقاف الدخول بالبصمة على هذا الجهاز بنجاح.');
    } catch {
      showToast('error', 'تعذر إيقاف البصمة حالياً.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRevokeDevice = async (device: TrustedDevice) => {
    setBusyAction(`revoke_${device.id}`);
    setFeedback(null);
    try {
      await revokeTrustedDevice(device, {
        id: currentAdminUser.id,
        fullName: currentAdminUser.fullName,
        email: userEmail,
        role: currentAdminUser.role,
      });
      if (liveCurrentDevice?.id === device.id) {
        removeLocalBiometricBinding(currentAdminUser.id, device.id);
        setVerifiedCurrentDevice(null);
      }
      showToast(
        'success',
        `تم إلغاء توثيق الجهاز (${device.deviceName}) فوراً. سيُطلب التحقق بخطوتين عند الدخول منه مستقبلاً.`
      );
    } catch {
      showToast('error', 'تعذر إلغاء توثيق الجهاز. يرجى المحاولة مرة أخرى.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDismissAlert = async () => {
    if (!currentAdminUser.lastNewDeviceAlert) return;
    const updatedAlert = { ...currentAdminUser.lastNewDeviceAlert, dismissed: true };
    await updateDocument(
      'adminUsers',
      currentAdminUser.id,
      { lastNewDeviceAlert: updatedAlert },
      { forceWrite: true }
    ).catch(() => {});
    onUserUpdated?.({
      ...currentAdminUser,
      lastNewDeviceAlert: updatedAlert,
    });
  };

  const activeNewDeviceAlert =
    currentAdminUser.lastNewDeviceAlert && !currentAdminUser.lastNewDeviceAlert.dismissed
      ? currentAdminUser.lastNewDeviceAlert
      : null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white dark:bg-[#0B1221] border border-[#CBD5E1] dark:border-amber-500/35 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-[#CBD5E1] dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#0F172A] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0 text-right">
              <h3 className="text-base sm:text-lg font-black text-[#0F172A] dark:text-white truncate">
                الأمان والأجهزة الموثوقة (Security &amp; Trusted Devices)
              </h3>
              <p className="text-xs text-[#475569] dark:text-slate-400 truncate">
                {currentAdminUser.fullName} — <span className="font-mono" dir="ltr">{userEmail}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 text-[#475569] dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto text-right">
          {/* Status Feedback Banner */}
          {feedback && (
            <div
              className={`p-3.5 rounded-2xl border text-xs font-bold flex items-start gap-2.5 leading-relaxed ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-500/15 border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* New Untrusted Device Security Alert */}
          {activeNewDeviceAlert && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-400/60 dark:border-amber-500/40 rounded-2xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-black text-xs sm:text-sm">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>تنبيه أمني: تم رصد دخول من جهاز جديد غير موثوق</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDismissAlert()}
                  className="text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer shrink-0"
                >
                  اطلعت عليه
                </button>
              </div>
              <p className="text-xs text-amber-900/90 dark:text-amber-200/85 leading-relaxed">
                الجهاز: <strong dir="ltr">{activeNewDeviceAlert.deviceName}</strong> — التوقيت:{' '}
                <strong>{formatDeviceTimestampAr(activeNewDeviceAlert.detectedAt)}</strong>. إذا لم تكن أنت، قم
                بإلغاء توثيق الأجهزة وتغيير كلمة مرورك فوراً.
              </p>
            </div>
          )}

          {/* Current Device Status Summary */}
          <div className="bg-[#F8FAFC] dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  isCurrentDeviceTrusted
                    ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-600 dark:text-emerald-400'
                    : 'bg-slate-200/80 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Laptop className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-black text-[#0F172A] dark:text-white" dir="ltr">
                    {currentEnv.deviceName}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/35 font-black">
                    هذا الجهاز
                  </span>
                </div>
                <p className="text-[11px] text-[#475569] dark:text-slate-400 mt-0.5">
                  {isCurrentDeviceTrusted
                    ? 'هذا الجهاز موثوق حالياً — يتم تجاوز رمز 2FA تلقائياً عند دخولك منه.'
                    : 'هذا الجهاز غير موثوق بعد — سيُطلب رمز الـ 2FA عند كل دخول جديد.'}
                </p>
              </div>
            </div>

            {!isCurrentDeviceTrusted && (
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleRequestTrustDevice()}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
              >
                {busyAction === 'trust_current' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                <span>توثيق هذا الجهاز</span>
              </button>
            )}
          </div>

          {/* Inline Ownership Verification Gate (shown only if untrusted device requests Trust or Biometric) */}
          {showOwnershipPrompt && (
            <form
              onSubmit={handleConfirmOwnershipAndProceed}
              className="bg-amber-50/80 dark:bg-amber-500/10 border-2 border-amber-400/70 dark:border-amber-500/40 rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-black text-amber-900 dark:text-amber-300">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>
                    تأكيد ملكية الحساب قبل{' '}
                    {showOwnershipPrompt === 'biometric' ? 'تفعيل البصمة الحيوية' : 'توثيق هذا الجهاز'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowOwnershipPrompt(null);
                    setOwnershipCodeInput('');
                    setOwnershipPasswordInput('');
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>

              {currentAdminUser.totpEnabled && currentAdminUser.totpSecret ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#1E293B] dark:text-slate-200 block">
                    أدخل رمز التحقق بخطوتين (6 أرقام) من تطبيق المصادقة *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={ownershipCodeInput}
                    onChange={(e) => setOwnershipCodeInput(normalizeOtpDigits(e.target.value).slice(0, 6))}
                    placeholder="000000"
                    dir="ltr"
                    className="w-full bg-white dark:bg-[#070C18] border border-amber-400/60 dark:border-slate-700 rounded-xl px-4 py-2.5 text-center font-mono text-lg tracking-[0.4em] font-black text-[#0F172A] dark:text-amber-400 focus:outline-none focus:border-amber-500"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#1E293B] dark:text-slate-200 block">
                    أدخل كلمة المرور الخاصة بحسابك لتأكيد الملكية *
                  </label>
                  <input
                    type="password"
                    required
                    value={ownershipPasswordInput}
                    onChange={(e) => setOwnershipPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    dir="ltr"
                    className="w-full bg-white dark:bg-[#070C18] border border-amber-400/60 dark:border-slate-700 rounded-xl px-4 py-2.5 font-mono text-sm text-[#0F172A] dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busyAction !== null}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {busyAction ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>تأكيد الهوية والمتابعة</span>
                </button>
              </div>
            </form>
          )}

          {/* SECTION 1: BIOMETRIC / WEBAUTHN OPT-IN */}
          <div className="bg-white dark:bg-[#0F172A] border border-[#CBD5E1] dark:border-sky-500/30 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                    isBiometricActiveOnCurrentDevice
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                      : 'bg-sky-500/15 border-sky-500/35 text-sky-600 dark:text-sky-400'
                  }`}
                >
                  <Fingerprint className="w-6 h-6" />
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-black text-[#0F172A] dark:text-white">
                      الدخول السريع بالبصمة الحيوية (Biometric / WebAuthn)
                    </h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30 font-bold">
                      خيار اختياري
                    </span>
                  </div>
                  <p className="text-xs text-[#475569] dark:text-slate-400 leading-relaxed">
                    فعّل بصمة الإصبع أو التعرف على الوجه أو Windows Hello للدخول السريع من هذا الجهاز الموثوق دون الحاجة لإدخال كلمة المرور ورمز 2FA في كل مرة.
                  </p>
                </div>
              </div>
            </div>

            {biometricSupport && !biometricSupport.supported && (
              <div className="text-xs bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-600 dark:text-slate-400">
                {biometricSupport.reasonAr}
              </div>
            )}

            {biometricSupport?.inCrossOriginIframe && (
              <div className="text-[11px] bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-xl p-3 text-amber-800 dark:text-amber-300 leading-relaxed">
                ملاحظة: في حال فتح الموقع داخل نافذة معاينة مضمنة (iframe)، قد يمنع المتصفح استدعاء مستشعر البصمة لأسباب أمنية؛ تعمل البصمة بكفاءة كاملة عند فتح البوابة مباشرة عبر رابط HTTPS المستقل.
              </div>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
              {isBiometricActiveOnCurrentDevice ? (
                <>
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      البصمة مفعّلة على هذا الجهاز ({liveCurrentDevice?.biometricLabel || 'WebAuthn'})
                      {liveCurrentDevice?.biometricEnabledAt
                        ? ` — منذ ${formatDeviceTimestampAr(liveCurrentDevice.biometricEnabledAt)}`
                        : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void handleDisableBiometric()}
                    className="px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/35 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    {busyAction === 'disable_biometric' ? 'جاري الإيقاف...' : 'إيقاف البصمة على هذا الجهاز'}
                  </button>
                </>
              ) : (
                <>
                  <div className="text-[11px] text-[#475569] dark:text-slate-400 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>
                      {isCurrentDeviceTrusted
                        ? 'تم التحقق من الجهاز الموثوق — جاهز لتسجيل البصمة.'
                        : 'يتطلب تأكيد الملكية وتوثيق الجهاز أولاً قبل حفظ مفتاح البصمة.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busyAction !== null || (biometricSupport !== null && !biometricSupport.supported)}
                    onClick={() => void handleRequestEnableBiometric()}
                    className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
                  >
                    {busyAction === 'enable_biometric' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Fingerprint className="w-4 h-4" />
                    )}
                    <span>تفعيل الدخول بالبصمة على هذا الجهاز</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* SECTION 2: USER TRUSTED DEVICES LIST */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-black text-[#0F172A] dark:text-white flex items-center gap-2">
                <Monitor className="w-4 h-4 text-amber-500" />
                <span>قائمة الأجهزة الموثوقة لحسابك ({devices.length})</span>
              </h4>
              <span className="text-[11px] text-[#475569] dark:text-slate-400">
                يمكنك إلغاء توثيق أي جهاز قديم أو مفقود فوراً
              </span>
            </div>

            {loadingDevices ? (
              <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                <span>جاري تحميل قائمة الأجهزة الموثوقة...</span>
              </div>
            ) : devices.length === 0 ? (
              <div className="bg-[#F8FAFC] dark:bg-[#0F172A] border border-dashed border-[#CBD5E1] dark:border-slate-700 rounded-2xl p-6 text-center space-y-1.5">
                <p className="text-xs font-bold text-[#334155] dark:text-slate-300">
                  لا توجد أجهزة موثوقة مسجلة لهذا الحساب حالياً.
                </p>
                <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                  عند توثيق جهازك هنا أو أثناء التحقق بخطوتين (2FA)، سيظهر ضمن هذه القائمة مع خيار الإدارة والإلغاء الفوري.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {devices.map((dev) => {
                  const isThisDevice = liveCurrentDevice?.id === dev.id;
                  return (
                    <div
                      key={dev.id}
                      className={`p-3.5 sm:p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isThisDevice
                          ? 'bg-emerald-50/70 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/35'
                          : 'bg-[#F8FAFC] dark:bg-[#0F172A] border-[#CBD5E1] dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                            isThisDevice
                              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-600 dark:text-emerald-400'
                              : 'bg-white dark:bg-slate-900 border-[#CBD5E1] dark:border-slate-700 text-[#475569] dark:text-slate-300'
                          }`}
                        >
                          {renderDeviceIcon(dev.deviceType)}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-black text-[#0F172A] dark:text-white" dir="ltr">
                              {dev.deviceName}
                            </span>
                            {isThisDevice && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-600 text-white font-black">
                                هذا الجهاز
                              </span>
                            )}
                            {dev.biometricEnabled && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30 font-bold">
                                <Fingerprint className="w-3 h-3" />
                                <span>بصمة مفعّلة</span>
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#475569] dark:text-slate-400">
                            <span>تاريخ التوثيق: {formatDeviceTimestampAr(dev.trustedAt)}</span>
                            <span>آخر نشاط: {formatDeviceTimestampAr(dev.lastUsedAt)}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => void handleRevokeDevice(dev)}
                        className="px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/35 text-xs font-bold transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
                      >
                        {busyAction === `revoke_${dev.id}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        <span>إلغاء توثيق الجهاز (Revoke)</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#CBD5E1] dark:border-slate-800 bg-[#F8FAFC] dark:bg-[#0F172A] flex items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-[#64748B] dark:text-slate-400">
            يُخزّن رمز الجهاز بصيغة مشفرة (SHA-256) ومرتبطة ببصمة المتصفح والنظام.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
