import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Briefcase,
  Wallet,
  BookOpen,
  Compass,
  UserPlus,
  UserCheck,
  Edit3,
  Trash2,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  Settings,
  Check,
  RefreshCw,
  Layers,
  Info,
  FileSpreadsheet,
  QrCode,
  Smartphone,
  Copy,
  RotateCcw,
  KeyRound,
  Mail,
  Wand2,
  Clock,
  Fingerprint,
  Monitor,
  ShieldOff,
  Laptop,
  Tablet,
} from 'lucide-react';
import { exportAlQaemExcelReport } from '../utils/alqaemExcelEngine';
import {
  AdminUser,
  CampaignSettings,
  DetailedPermissionsMap,
  OfficialAdminRole,
  PermissionModuleId,
  PermissionOperation,
  TrustedDevice,
} from '../types';
import {
  DEFAULT_ROLE_PERMISSIONS,
  getEffectiveDetailedPermissions,
  getRoleDefinition,
  isLastActiveGeneralAdmin,
  isLegacyRoleName,
  isSuperAdminGoogleEmail,
  isSuperAdminUser,
  migrateAdminUserRecord,
  normalizeOfficialRole,
  OFFICIAL_ROLES,
  PERMISSION_MODULES,
  PERMISSION_OPERATIONS,
  summarizePermissionsForAudit,
  SUPER_ADMIN_GOOGLE_EMAIL,
  syncLegacyPermissionsFromDetailed,
} from '../utils/rbac';
import { recordActivityLog } from '../lib/db';
import {
  generateTemporaryPassword,
  hashPasswordSecure,
  normalizePinInput,
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
  AuthLockoutRecord,
  clearAuthLockout,
  formatCountdownMMSS,
  listActiveAuthLockouts,
} from '../utils/authSecurity';
import {
  formatDeviceTimestampAr,
  revokeAllTrustedDevicesForUser,
  revokeTrustedDevice,
  subscribeToTrustedDevices,
} from '../utils/trustedDevices';

interface StaffManagementViewProps {
  adminUsers: AdminUser[];
  currentAdminUser: AdminUser | null;
  campaignSettings: CampaignSettings;
  onAddAdminUser: (user: AdminUser) => Promise<void> | void;
  onUpdateAdminUser: (user: AdminUser) => Promise<void> | void;
  onDeleteAdminUser: (id: string) => Promise<void> | void;
  onUpdateCampaignSettings: (settings: CampaignSettings) => Promise<boolean | void> | boolean | void;
}

const STAFF_DOMAIN_OPTIONS = [
  { value: '@alqaemhajj.com', label: '@alqaemhajj.com (النطاق الرسمي للقافلة)' },
  { value: '@alqaem.org', label: '@alqaem.org (نطاق الإدارة)' },
  { value: '@gmail.com', label: '@gmail.com (حساب Google للربط المباشر)' },
];

const SEASON_OPTIONS = [
  'موسم 1448هـ',
  'موسم 1449هـ',
  'عمرة رجب وشعبان 1448هـ',
  'جميع المواسم',
];

const CARAVAN_OPTIONS = [
  'جميع القوافل والأفواج',
  'قافلة الطيران (VIP والمميزة)',
  'قافلة الحافلات والبر',
  'الفوج الأول - مكة والمدينة',
  'الفوج الثاني - مكة والمدينة',
  'لجنة الاستقبال والتفويج الميداني',
];

const splitUsernameAndDomain = (rawUsername?: string): { localPart: string; domain: string } => {
  const clean = (rawUsername || '').trim().toLowerCase();
  if (!clean.includes('@')) {
    return { localPart: clean, domain: '@alqaemhajj.com' };
  }
  const [localPart, domPart] = clean.split('@');
  const fullDom = `@${domPart || 'alqaemhajj.com'}`;
  return { localPart: localPart || '', domain: fullDom };
};

export const StaffManagementView: React.FC<StaffManagementViewProps> = ({
  adminUsers,
  currentAdminUser,
  campaignSettings,
  onAddAdminUser,
  onUpdateAdminUser,
  onDeleteAdminUser,
  onUpdateCampaignSettings,
}) => {
  const roleTemplates = campaignSettings.rolePermissionTemplates || {};

  // Modal state for Adding / Editing a supervisor
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<AdminUser | null>(null);
  const [formError, setFormError] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showPin, setShowPin] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [pin, setPin] = useState('');
  const [copiedTempPwd, setCopiedTempPwd] = useState(false);
  const [selectedRole, setSelectedRole] = useState<OfficialAdminRole>('الإشراف المكتبي');
  const [accountStatus, setAccountStatus] = useState<'active' | 'suspended'>('active');
  const [assignedSeason, setAssignedSeason] = useState('موسم 1448هـ');
  const [assignedCaravan, setAssignedCaravan] = useState('جميع القوافل والأفواج');
  const [customOverride, setCustomOverride] = useState(false);
  const [detailedPerms, setDetailedPerms] = useState<DetailedPermissionsMap>(
    DEFAULT_ROLE_PERMISSIONS['الإشراف المكتبي']
  );

  // Role Template Editor Modal state
  const [editingTemplateRole, setEditingTemplateRole] = useState<OfficialAdminRole | null>(null);
  const [templatePermsDraft, setTemplatePermsDraft] = useState<DetailedPermissionsMap>(
    DEFAULT_ROLE_PERMISSIONS['الإشراف المكتبي']
  );
  const [applyTemplateToAllRoleUsers, setApplyTemplateToAllRoleUsers] = useState(true);

  // Delete, Reset 2FA & Trusted Devices Oversight modals
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<AdminUser | null>(null);
  const [confirmReset2FAUser, setConfirmReset2FAUser] = useState<AdminUser | null>(null);
  const [confirmRevokeAllDevicesUser, setConfirmRevokeAllDevicesUser] = useState<AdminUser | null>(null);
  const [inspectDevicesUser, setInspectDevicesUser] = useState<AdminUser | null>(null);
  const [allTrustedDevices, setAllTrustedDevices] = useState<TrustedDevice[]>([]);

  // Active brute-force lockouts (15-min lockouts after 5 failed attempts)
  const [activeLockouts, setActiveLockouts] = useState<AuthLockoutRecord[]>([]);

  // Super Admin Optional Self-2FA Modal
  const [own2faModalMode, setOwn2faModalMode] = useState<'enable' | 'disable' | null>(null);
  const [own2faSecret, setOwn2faSecret] = useState('');
  const [own2faQr, setOwn2faQr] = useState('');
  const [own2faOtp, setOwn2faOtp] = useState('');
  const [own2faError, setOwn2faError] = useState('');
  const [own2faCopied, setOwn2faCopied] = useState(false);
  const [own2faBusy, setOwn2faBusy] = useState(false);

  const superAdminRecord =
    adminUsers.find((u) => isSuperAdminUser(u)) ||
    (isSuperAdminUser(currentAdminUser) ? currentAdminUser : null);

  const refreshLockouts = async () => {
    try {
      const locks = await listActiveAuthLockouts();
      setActiveLockouts(locks);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void refreshLockouts();
  }, [adminUsers.length]);

  useEffect(() => {
    const unsub = subscribeToTrustedDevices((devices) => {
      setAllTrustedDevices(devices);
    });
    return () => unsub();
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const handleOpenSuperAdmin2FAEnable = async () => {
    setOwn2faError('');
    setOwn2faOtp('');
    setOwn2faCopied(false);
    const secret = generateTotpSecret();
    const uri = buildOtpAuthUri(
      SUPER_ADMIN_GOOGLE_EMAIL,
      secret,
      'قافلة القائم للحج والعمرة'
    );
    const qr = await generateTotpQrDataUrl(uri);
    setOwn2faSecret(secret);
    setOwn2faQr(qr);
    setOwn2faModalMode('enable');
  };

  const handleConfirmSuperAdmin2FAEnable = async () => {
    if (!superAdminRecord) return;
    const cleanOtp = normalizeOtpDigits(own2faOtp);
    if (cleanOtp.length !== 6) {
      setOwn2faError('يرجى إدخال الرمز المكون من 6 أرقام من تطبيق المصادقة.');
      return;
    }
    setOwn2faBusy(true);
    setOwn2faError('');
    try {
      const valid = await verifyTotpCode(own2faSecret, cleanOtp, 1);
      if (!valid) {
        setOwn2faError('الرمز غير صحيح أو منتهي الصلاحية. تأكد من إدخال أحدث رمز مكون من 6 أرقام.');
        return;
      }
      const updatedOwner: AdminUser = {
        ...superAdminRecord,
        totpEnabled: true,
        totpSecret: own2faSecret,
        totpConfiguredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await onUpdateAdminUser(updatedOwner);
      await recordActivityLog({
        adminId: superAdminRecord.id,
        adminName: superAdminRecord.fullName,
        username: SUPER_ADMIN_GOOGLE_EMAIL,
        userRole: superAdminRecord.role,
        category: 'الأمان والمصادقة',
        severity: 'info',
        action: 'تفعيل المصادقة الثنائية (2FA - TOTP) لحساب المالك الرئيسي',
        target: SUPER_ADMIN_GOOGLE_EMAIL,
      });
      setOwn2faModalMode(null);
      showToast('success', 'تم تفعيل المصادقة الثنائية (2FA) لحساب المالك الرئيسي بنجاح.');
    } finally {
      setOwn2faBusy(false);
    }
  };

  const handleConfirmSuperAdmin2FADisable = async () => {
    if (!superAdminRecord) return;
    const cleanOtp = normalizeOtpDigits(own2faOtp);
    if (superAdminRecord.totpSecret && cleanOtp.length !== 6) {
      setOwn2faError('يرجى إدخال الرمز الحالي (6 أرقام) لتأكيد إلغاء المصادقة الثنائية.');
      return;
    }
    setOwn2faBusy(true);
    setOwn2faError('');
    try {
      if (superAdminRecord.totpSecret) {
        const valid = await verifyTotpCode(superAdminRecord.totpSecret, cleanOtp, 1);
        if (!valid) {
          setOwn2faError('الرمز غير صحيح. أدخل الرمز الصحيح من تطبيق المصادقة لتأكيد الإلغاء.');
          return;
        }
      }
      const updatedOwner: AdminUser = {
        ...superAdminRecord,
        totpEnabled: false,
        totpSecret: '',
        updatedAt: new Date().toISOString(),
      };
      await onUpdateAdminUser(updatedOwner);
      await recordActivityLog({
        adminId: superAdminRecord.id,
        adminName: superAdminRecord.fullName,
        username: SUPER_ADMIN_GOOGLE_EMAIL,
        userRole: superAdminRecord.role,
        category: 'الأمان والمصادقة',
        severity: 'warning',
        action: 'إلغاء تفعيل المصادقة الثنائية (2FA) لحساب المالك الرئيسي',
        target: SUPER_ADMIN_GOOGLE_EMAIL,
      });
      setOwn2faModalMode(null);
      showToast('success', 'تم إلغاء تفعيل المصادقة الثنائية الاختيارية لحساب المالك الرئيسي.');
    } finally {
      setOwn2faBusy(false);
    }
  };

  const handleResetStaff2FA = async (usr: AdminUser) => {
    setIsSaving(true);
    try {
      const updated: AdminUser = {
        ...usr,
        totpEnabled: false,
        totpSecret: '',
        totpResetAt: new Date().toISOString(),
        totpResetBy: currentAdminUser?.fullName || SUPER_ADMIN_GOOGLE_EMAIL,
        sessionVersion: (usr.sessionVersion || 1) + 1,
        updatedAt: new Date().toISOString(),
      };
      await onUpdateAdminUser(updated);
      await clearAuthLockout(usr.email || usr.username);
      await revokeAllTrustedDevicesForUser(usr, {
        id: currentAdminUser?.id || 'usr-1',
        fullName: currentAdminUser?.fullName || 'المالك الرئيسي',
        email: currentAdminUser?.email || currentAdminUser?.username || SUPER_ADMIN_GOOGLE_EMAIL,
        role: currentAdminUser?.role || 'الإدارة العامة',
      }).catch(() => {});
      await recordActivityLog({
        adminId: currentAdminUser?.id || 'usr-1',
        adminName: currentAdminUser?.fullName || 'المالك الرئيسي',
        username: currentAdminUser?.email || currentAdminUser?.username || SUPER_ADMIN_GOOGLE_EMAIL,
        userRole: currentAdminUser?.role || 'الإدارة العامة',
        category: 'الأمان والمصادقة',
        severity: 'warning',
        action: 'إعادة تعيين المصادقة الثنائية (Reset 2FA) وسحب الثقة من الأجهزة وإنهاء الجلسات النشطة للموظف',
        target: `${usr.fullName} (${usr.email || usr.username})`,
        details: 'سيُطلب من الموظف مسح رمز QR جديد وربط تطبيق المصادقة عند تسجيل الدخول القادم.',
      });
      setConfirmReset2FAUser(null);
      await refreshLockouts();
      showToast(
        'success',
        `تم إعادة تعيين المصادقة الثنائية (2FA) وإلغاء توثيق أجهزة الموظف "${usr.fullName}" بنجاح.`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeAllDevicesForStaff = async (usr: AdminUser) => {
    setIsSaving(true);
    try {
      const revokedCount = await revokeAllTrustedDevicesForUser(usr, {
        id: currentAdminUser?.id || 'usr-1',
        fullName: currentAdminUser?.fullName || 'المالك الرئيسي',
        email: currentAdminUser?.email || currentAdminUser?.username || SUPER_ADMIN_GOOGLE_EMAIL,
        role: currentAdminUser?.role || 'الإدارة العامة',
      });
      setConfirmRevokeAllDevicesUser(null);
      if (inspectDevicesUser?.id === usr.id) {
        setInspectDevicesUser(null);
      }
      showToast(
        'success',
        revokedCount > 0
          ? `تم إلغاء توثيق جميع أجهزة المشرف "${usr.fullName}" (${revokedCount} جهاز) وتعطيل البصمة عليها دون المساس ببياناته التشغيلية.`
          : `تم تحديث رقم الجلسة الأمني للمشرف "${usr.fullName}" والتأكد من عدم وجود أي أجهزة موثوقة مرتبطة به.`
      );
    } catch {
      showToast('error', 'تعذر إلغاء توثيق الأجهزة حالياً. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeSingleDeviceForStaff = async (device: TrustedDevice) => {
    setIsSaving(true);
    try {
      await revokeTrustedDevice(device, {
        id: currentAdminUser?.id || 'usr-1',
        fullName: currentAdminUser?.fullName || 'المالك الرئيسي',
        email: currentAdminUser?.email || currentAdminUser?.username || SUPER_ADMIN_GOOGLE_EMAIL,
        role: currentAdminUser?.role || 'الإدارة العامة',
      });
      showToast('success', `تم إلغاء توثيق الجهاز "${device.deviceName}" بنجاح.`);
    } catch {
      showToast('error', 'تعذر إلغاء توثيق هذا الجهاز حالياً.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnlockStaffLockout = async (usr: AdminUser) => {
    const email = (usr.email || usr.username || '').trim().toLowerCase();
    await clearAuthLockout(email);
    await recordActivityLog({
      adminId: currentAdminUser?.id || 'usr-1',
      adminName: currentAdminUser?.fullName || 'المالك الرئيسي',
      username: currentAdminUser?.email || currentAdminUser?.username || SUPER_ADMIN_GOOGLE_EMAIL,
      userRole: currentAdminUser?.role || 'الإدارة العامة',
      category: 'الأمان والمصادقة',
      severity: 'info',
      action: 'فك الحظر المؤقت (Brute-Force Lockout) عن حساب موظف',
      target: `${usr.fullName} (${email})`,
    });
    await refreshLockouts();
    showToast('success', `تم فك الحظر المؤقت عن حساب "${usr.fullName}" بنجاح.`);
  };

  const renderRoleIcon = (iconName: string, className = 'w-5 h-5') => {
    switch (iconName) {
      case 'ShieldCheck':
        return <ShieldCheck className={className} />;
      case 'Briefcase':
        return <Briefcase className={className} />;
      case 'Wallet':
        return <Wallet className={className} />;
      case 'BookOpen':
        return <BookOpen className={className} />;
      case 'Compass':
        return <Compass className={className} />;
      default:
        return <UserCheck className={className} />;
    }
  };

  const getTemplateForRole = (role: OfficialAdminRole): DetailedPermissionsMap => {
    const template = roleTemplates[role] || DEFAULT_ROLE_PERMISSIONS[role];
    return JSON.parse(JSON.stringify(template));
  };

  const handleOpenAddModal = () => {
    const generated = generateTemporaryPassword();
    setEditingStaff(null);
    setFullName('');
    setEmailInput('');
    setPin(generated);
    setShowPin(true);
    setCopiedTempPwd(false);
    setSelectedRole('الإشراف المكتبي');
    setAccountStatus('active');
    setAssignedSeason(
      campaignSettings.pilgrimStatsConfig?.activeSeasonYear
        ? `موسم ${campaignSettings.pilgrimStatsConfig.activeSeasonYear}هـ`
        : 'موسم 1448هـ'
    );
    setAssignedCaravan('جميع القوافل والأفواج');
    setCustomOverride(false);
    setDetailedPerms(getTemplateForRole('الإشراف المكتبي'));
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (usr: AdminUser) => {
    const officialRole = normalizeOfficialRole(usr.role, usr.username);
    const effectiveDetailed = getEffectiveDetailedPermissions(usr, roleTemplates);

    setEditingStaff(usr);
    setFullName(usr.fullName);
    setEmailInput((usr.email || usr.username || '').trim().toLowerCase());
    setPin('');
    setShowPin(false);
    setCopiedTempPwd(false);
    setSelectedRole(officialRole);
    setAccountStatus(usr.status === 'suspended' ? 'suspended' : 'active');
    setAssignedSeason(usr.assignedSeason || 'موسم 1448هـ');
    setAssignedCaravan(usr.assignedCaravan || 'جميع القوافل والأفواج');
    setCustomOverride(Boolean(usr.customPermissionsOverride));
    setDetailedPerms(JSON.parse(JSON.stringify(effectiveDetailed)));
    setFormError('');
    setIsModalOpen(true);
  };

  const handleRoleChangeInForm = (nextRole: OfficialAdminRole) => {
    if (
      editingStaff &&
      nextRole !== 'الإدارة العامة' &&
      isLastActiveGeneralAdmin(editingStaff.id, adminUsers)
    ) {
      setFormError(
        'لا يمكن تغيير دور هذا المشرف لأنه الحساب النشط الوحيد الذي يمتلك صلاحيات "الإدارة العامة" في النظام.'
      );
      return;
    }
    setFormError('');
    setSelectedRole(nextRole);
    setDetailedPerms(getTemplateForRole(nextRole));
  };

  const toggleOperationPermission = (
    modId: PermissionModuleId,
    opId: PermissionOperation,
    isTemplateEditor = false
  ) => {
    if (isTemplateEditor) {
      setTemplatePermsDraft((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as DetailedPermissionsMap;
        const newVal = !next[modId][opId];
        next[modId][opId] = newVal;
        if (newVal && opId !== 'view') {
          next[modId].view = true;
        }
        if (!newVal && opId === 'view') {
          PERMISSION_OPERATIONS.forEach((op) => {
            next[modId][op.id] = false;
          });
        }
        return next;
      });
    } else {
      setCustomOverride(true);
      setDetailedPerms((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as DetailedPermissionsMap;
        const newVal = !next[modId][opId];
        next[modId][opId] = newVal;
        // Enabling any action automatically enables 'view'
        if (newVal && opId !== 'view') {
          next[modId].view = true;
        }
        // Disabling 'view' disables other operations in that module
        if (!newVal && opId === 'view') {
          PERMISSION_OPERATIONS.forEach((op) => {
            next[modId][op.id] = false;
          });
        }
        return next;
      });
    }
  };

  const toggleEntireModule = (
    modId: PermissionModuleId,
    enable: boolean,
    isTemplateEditor = false
  ) => {
    if (isTemplateEditor) {
      setTemplatePermsDraft((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as DetailedPermissionsMap;
        PERMISSION_OPERATIONS.forEach((op) => {
          next[modId][op.id] = enable;
        });
        return next;
      });
    } else {
      setCustomOverride(true);
      setDetailedPerms((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as DetailedPermissionsMap;
        PERMISSION_OPERATIONS.forEach((op) => {
          next[modId][op.id] = enable;
        });
        return next;
      });
    }
  };

  // Toggle Account Active / Suspended immediately from the table (Instant Freeze + Forced Logout)
  const handleQuickToggleStatus = async (usr: AdminUser) => {
    if (isSuperAdminUser(usr)) {
      showToast('error', 'منع أمني: لا يمكن تجميد أو إيقاف حساب المالك الرئيسي للنظام.');
      return;
    }
    const nextStatus = usr.status === 'suspended' ? 'active' : 'suspended';
    if (nextStatus === 'suspended' && isLastActiveGeneralAdmin(usr.id, adminUsers)) {
      showToast(
        'error',
        'منع أمني: لا يمكن إيقاف الحساب الوحيد النشط الذي يمتلك صلاحية الإدارة العامة.'
      );
      return;
    }

    const updated: AdminUser = {
      ...usr,
      status: nextStatus,
      sessionVersion: (usr.sessionVersion || 1) + 1,
      suspendedAt: nextStatus === 'suspended' ? new Date().toISOString() : undefined,
      suspendedBy:
        nextStatus === 'suspended'
          ? currentAdminUser?.fullName || SUPER_ADMIN_GOOGLE_EMAIL
          : undefined,
      updatedAt: new Date().toISOString(),
    };
    await onUpdateAdminUser(updated);
    if (nextStatus === 'suspended') {
      await revokeAllTrustedDevicesForUser(usr, {
        id: currentAdminUser?.id || 'usr-1',
        fullName: currentAdminUser?.fullName || 'المالك الرئيسي',
        email: currentAdminUser?.email || currentAdminUser?.username || SUPER_ADMIN_GOOGLE_EMAIL,
        role: currentAdminUser?.role || 'الإدارة العامة',
      }).catch(() => {});
    }
    await recordActivityLog({
      adminId: currentAdminUser?.id || 'usr-1',
      adminName: currentAdminUser?.fullName || 'المالك الرئيسي',
      username: currentAdminUser?.email || currentAdminUser?.username || SUPER_ADMIN_GOOGLE_EMAIL,
      userRole: currentAdminUser?.role || 'الإدارة العامة',
      category: 'الأمان والمصادقة',
      severity: nextStatus === 'suspended' ? 'critical' : 'info',
      action:
        nextStatus === 'suspended'
          ? 'تجميد وإيقاف فوري لحساب موظف وطرده من جميع الجلسات النشطة'
          : 'إعادة تفعيل حساب موظف مجمّد',
      target: `${usr.fullName} (${usr.email || usr.username})`,
      previousValue: usr.status === 'suspended' ? 'موقوف / مجمّد' : 'نشط',
      newValue: nextStatus === 'suspended' ? 'موقوف / مجمّد' : 'نشط',
      details: `الدور الوظيفي: ${normalizeOfficialRole(usr.role, usr.username)} | رقم الجلسة الجديد: v${updated.sessionVersion}`,
    });

    showToast(
      'success',
      nextStatus === 'suspended'
        ? `تم تجميد حساب "${usr.fullName}" وطرده فوراً من أي جلسة نشطة.`
        : `تم إعادة تفعيل حساب "${usr.fullName}" بنجاح.`
    );
  };

  // Migrate any legacy roles in the database after admin review
  const legacyUsers = adminUsers.filter((u) => isLegacyRoleName(u.role));
  const handleMigrateLegacyRoles = async () => {
    setIsSaving(true);
    try {
      for (const usr of legacyUsers) {
        const prevRole = usr.role;
        const migrated = migrateAdminUserRecord(usr, roleTemplates);
        await onUpdateAdminUser(migrated);
        await recordActivityLog({
          adminId: currentAdminUser?.id || 'usr-1',
          adminName: currentAdminUser?.fullName || 'الإدارة العامة',
          username: currentAdminUser?.username || 'admin',
          userRole: currentAdminUser?.role || 'الإدارة العامة',
          category: 'المشرفين والإعدادات',
          action: 'ترحيل واعتماد الدور الوظيفي إلى هيكل الأدوار الخمسة الجديد',
          target: `${usr.fullName} (${usr.username})`,
          previousValue: prevRole,
          newValue: migrated.role,
          details: `تم الترحيل الآمن من (${prevRole}) إلى (${migrated.role}) مع ضبط الصلاحيات التفصيلية.`,
        });
      }
      showToast('success', 'تم ترحيل واعتماد جميع الأدوار إلى الهيكل الخماسي الجديد بنجاح.');
    } finally {
      setIsSaving(false);
    }
  };

  // Save Role Permission Template & Propagate to Supervisors of that Role
  const handleSaveRoleTemplate = async () => {
    if (!editingTemplateRole) return;
    setIsSaving(true);
    try {
      const prevTemplate = getTemplateForRole(editingTemplateRole);
      const nextTemplates = {
        ...(campaignSettings.rolePermissionTemplates || {}),
        [editingTemplateRole]: templatePermsDraft,
      };

      await onUpdateCampaignSettings({
        ...campaignSettings,
        rolePermissionTemplates: nextTemplates,
      });

      // Propagate to users of this role so changing a role's permissions immediately reflects on concerned users
      const matchingUsers = adminUsers.filter(
        (u) => normalizeOfficialRole(u.role, u.username) === editingTemplateRole
      );
      let updatedCount = 0;
      for (const u of matchingUsers) {
        if (applyTemplateToAllRoleUsers || !u.customPermissionsOverride) {
          const syncedLegacy = syncLegacyPermissionsFromDetailed(
            templatePermsDraft,
            editingTemplateRole
          );
          await onUpdateAdminUser({
            ...u,
            role: editingTemplateRole,
            detailedPermissions: templatePermsDraft,
            permissions: syncedLegacy,
            customPermissionsOverride: false,
            updatedAt: new Date().toISOString(),
          });
          updatedCount++;
        }
      }

      await recordActivityLog({
        adminId: currentAdminUser?.id || 'usr-1',
        adminName: currentAdminUser?.fullName || 'الإدارة العامة',
        username: currentAdminUser?.username || 'admin',
        userRole: currentAdminUser?.role || 'الإدارة العامة',
        category: 'المشرفين والإعدادات',
        action: `تحديث قالب الصلاحيات الافتراضية لدور (${editingTemplateRole})`,
        target: `دور: ${editingTemplateRole} (تأثر ${updatedCount} مشرفين)`,
        previousValue: summarizePermissionsForAudit(prevTemplate),
        newValue: summarizePermissionsForAudit(templatePermsDraft),
        details: `تم تحديث مصفوفة الصلاحيات لدور ${editingTemplateRole} وتطبيقها على ${updatedCount} حساب.`,
      });

      setEditingTemplateRole(null);
      showToast(
        'success',
        `تم حفظ صلاحيات دور "${editingTemplateRole}" وتحديث ${updatedCount} مشرفين مرتبطين به بنجاح.`
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Save Add / Edit Supervisor (Email + Temporary Password + Mandatory First-Login Change & 2FA)
  const handleSaveSupervisor = async () => {
    const cleanEmail = emailInput.trim().toLowerCase().replace(/\s+/g, '');
    const cleanFullName = fullName.trim().replace(/\s+/g, ' ');
    const cleanTempPwd = normalizePinInput(pin);
    const isEditingOwner = Boolean(editingStaff && isSuperAdminUser(editingStaff));

    if (!cleanFullName) {
      setFormError('يرجى إدخال اسم الموظف / المشرف الكامل.');
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormError('يرجى إدخال بريد إلكتروني صحيح للموظف (مثال: name@alqaemhajj.com).');
      return;
    }
    if (!isEditingOwner && isSuperAdminGoogleEmail(cleanEmail)) {
      setFormError(
        `البريد (${SUPER_ADMIN_GOOGLE_EMAIL}) محجوز حصرياً لحساب المالك الرئيسي ولا يمكن استخدامه لحساب موظف.`
      );
      return;
    }
    if (!editingStaff && cleanTempPwd.length < 6) {
      setFormError('يرجى إدخال كلمة مرور مؤقتة لا تقل عن 6 أحرف (أو الضغط على زر التوليد التلقائي).');
      return;
    }

    // Security Guard: Prevent suspending or demoting the Super Admin owner or last active General Admin
    if (
      editingStaff &&
      (isEditingOwner || isLastActiveGeneralAdmin(editingStaff.id, adminUsers)) &&
      (accountStatus === 'suspended' || selectedRole !== 'الإدارة العامة')
    ) {
      setFormError(
        'منع أمني: لا يمكن إيقاف أو خفض صلاحيات حساب المالك الرئيسي أو المشرف الوحيد الذي يمتلك دور الإدارة العامة.'
      );
      return;
    }

    // Duplicate email check
    const emailConflict = adminUsers.find((u) => {
      if (editingStaff && u.id === editingStaff.id) return false;
      const existingEmail = (u.email || u.username || '').trim().toLowerCase();
      return existingEmail === cleanEmail;
    });

    if (emailConflict) {
      setFormError(
        `عفواً، البريد الإلكتروني (${cleanEmail}) مسجل مسبقاً للمشرف "${emailConflict.fullName}".`
      );
      return;
    }

    // Duplicate full name check
    const nameConflict = adminUsers.find((u) => {
      if (editingStaff && u.id === editingStaff.id) return false;
      const existingName = (u.fullName || '').trim().replace(/\s+/g, ' ').toLowerCase();
      return existingName === cleanFullName.toLowerCase();
    });

    if (nameConflict) {
      setFormError(`عفواً، الاسم "${cleanFullName}" مسجل مسبقاً لمشرف آخر.`);
      return;
    }

    setIsSaving(true);
    try {
      let finalPin = editingStaff?.pin || '';
      const didResetPassword = Boolean(cleanTempPwd && !isEditingOwner);
      if (didResetPassword) {
        finalPin = await hashPasswordSecure(cleanTempPwd);
      }

      const finalDetailed =
        selectedRole === 'الإدارة العامة'
          ? DEFAULT_ROLE_PERMISSIONS['الإدارة العامة']
          : detailedPerms;
      const syncedBooleanPerms = syncLegacyPermissionsFromDetailed(finalDetailed, selectedRole);

      if (editingStaff) {
        const prevSummary = `الدور: ${editingStaff.role} | الحالة: ${
          editingStaff.status === 'suspended' ? 'موقوف' : 'نشط'
        } | ${summarizePermissionsForAudit(
          getEffectiveDetailedPermissions(editingStaff, roleTemplates)
        )}`;
        const newSummary = `الدور: ${selectedRole} | الحالة: ${
          accountStatus === 'suspended' ? 'موقوف' : 'نشط'
        } | ${summarizePermissionsForAudit(finalDetailed)}`;

        const shouldBumpSession =
          didResetPassword || (accountStatus === 'suspended' && editingStaff.status !== 'suspended');

        const updatedUser: AdminUser = {
          ...editingStaff,
          username: isEditingOwner ? SUPER_ADMIN_GOOGLE_EMAIL : cleanEmail,
          email: isEditingOwner ? SUPER_ADMIN_GOOGLE_EMAIL : cleanEmail,
          pin: isEditingOwner ? '' : finalPin,
          mustChangePassword: isEditingOwner
            ? false
            : didResetPassword
            ? true
            : editingStaff.mustChangePassword,
          sessionVersion: shouldBumpSession
            ? (editingStaff.sessionVersion || 1) + 1
            : editingStaff.sessionVersion || 1,
          fullName: cleanFullName,
          role: selectedRole,
          status: accountStatus,
          assignedSeason,
          assignedCaravan,
          customPermissionsOverride: customOverride,
          detailedPermissions: finalDetailed,
          permissions: syncedBooleanPerms,
          updatedAt: new Date().toISOString(),
        };

        await onUpdateAdminUser(updatedUser);
        await recordActivityLog({
          adminId: currentAdminUser?.id || 'usr-1',
          adminName: currentAdminUser?.fullName || 'المالك الرئيسي',
          username: currentAdminUser?.email || currentAdminUser?.username || SUPER_ADMIN_GOOGLE_EMAIL,
          userRole: currentAdminUser?.role || 'الإدارة العامة',
          category: didResetPassword ? 'الأمان والمصادقة' : 'المشرفين والإعدادات',
          severity: didResetPassword ? 'warning' : 'info',
          action: didResetPassword
            ? 'تعديل بيانات مشرف وتعيين كلمة مرور مؤقتة جديدة (إجبار التغيير عند الدخول)'
            : 'تعديل بيانات وصلاحيات مشرف',
          target: `${cleanFullName} (${cleanEmail})`,
          previousValue: prevSummary,
          newValue: newSummary,
          details: `الدور: ${selectedRole} | القافلة/الموسم: ${assignedSeason} - ${assignedCaravan}`,
        });
        showToast(
          'success',
          didResetPassword
            ? `تم حفظ تعديلات "${cleanFullName}" وتعيين كلمة مرور مؤقتة جديدة (سيُجبر على تغييرها عند الدخول التالي).`
            : `تم حفظ تعديلات المشرف "${cleanFullName}" بنجاح.`
        );
      } else {
        const safeSlug = cleanEmail.replace(/[^a-z0-9]/g, '_');
        const deterministicId = `usr-${safeSlug || Date.now()}`;
        const newUser: AdminUser = {
          id: deterministicId,
          username: cleanEmail,
          email: cleanEmail,
          pin: finalPin,
          fullName: cleanFullName,
          role: selectedRole,
          status: accountStatus,
          isSuperAdminOwner: false,
          mustChangePassword: true,
          totpEnabled: false,
          totpSecret: '',
          sessionVersion: 1,
          assignedSeason,
          assignedCaravan,
          customPermissionsOverride: customOverride,
          detailedPermissions: finalDetailed,
          permissions: syncedBooleanPerms,
          createdAt: new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString(),
        };

        await onAddAdminUser(newUser);
        await recordActivityLog({
          adminId: currentAdminUser?.id || 'usr-1',
          adminName: currentAdminUser?.fullName || 'المالك الرئيسي',
          username: currentAdminUser?.email || currentAdminUser?.username || SUPER_ADMIN_GOOGLE_EMAIL,
          userRole: currentAdminUser?.role || 'الإدارة العامة',
          category: 'الأمان والمصادقة',
          severity: 'info',
          action: 'إنشاء حساب موظف مخوّل جديد (كلمة مرور مؤقتة + 2FA إلزامي)',
          target: `${cleanFullName} (${cleanEmail})`,
          previousValue: 'غير موجود',
          newValue: `الدور: ${selectedRole} | الحالة: ${
            accountStatus === 'suspended' ? 'موقوف' : 'نشط'
          } | ${summarizePermissionsForAudit(finalDetailed)}`,
          details: `الدور: ${selectedRole} | القافلة/الموسم: ${assignedSeason} - ${assignedCaravan}`,
        });
        showToast(
          'success',
          `تم إنشاء حساب الموظف "${cleanFullName}" (${cleanEmail}) بنجاح. سيُطلب منه تغيير كلمة المرور المؤقتة وتفعيل 2FA عند أول دخول.`
        );
      }

      setIsModalOpen(false);
      setEditingStaff(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Status Toast */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 shadow-lg animate-fadeIn ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-red-500/15 border-red-500/40 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-75 hover:opacity-100 cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#0E1726] via-[#10192D] to-[#0B1221] border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500 text-slate-950">
                منظومة الأدوار الخمسة والصلاحيات التفصيلية
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                حماية RBAC نشطة
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mt-1">
              إدارة المشرفين والأدوار الوظيفية ومصفوفة الصلاحيات
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed max-w-2xl">
              تحكم مرن وشامل في الأدوار الخمسة المعتمدة (الإدارة العامة، الإشراف المكتبي، الإشراف المالي، الإشراف الثقافي، الإشراف الديني) مع تخصيص العمليات الـ 8 لكل قسم.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <button
            type="button"
            onClick={() => {
              const columns = [
                'م',
                'الاسم الكامل للمشرف',
                'اسم المستخدم / المعرف',
                'الدور الوظيفي المعتمد',
                'حالة الحساب',
                'الموسم المكلف به',
                'القافلة / المجموعة',
                'نوع الصلاحيات',
                'تاريخ الإنشاء',
              ];
              const rows = adminUsers.map((u, idx) => [
                idx + 1,
                u.fullName || u.username,
                u.username,
                normalizeOfficialRole(u.role),
                u.status === 'suspended' ? 'موقوف' : 'نشط',
                u.assignedSeason || 'موسم 1448هـ',
                u.assignedCaravan || 'جميع القوافل',
                u.customPermissionsOverride ? 'مخصصة استثنائياً' : 'قالب الدور القياسي',
                u.createdAt || '—',
              ]);
              const activeCount = adminUsers.filter((u) => u.status !== 'suspended').length;
              void exportAlQaemExcelReport({
                reportTitle: 'كشف المشرفين والأدوار الوظيفية والصلاحيات المعتمدة',
                subtitle: 'منظومة إدارة المشرفين والأدوار الخمسة — قافلة القائم للحج والعمرة والزيارة',
                category: 'تقارير المشرفين والإشراف والرقابة',
                filename: `كشف_المشرفين_والأدوار_قافلة_القائم_${new Date().toISOString().split('T')[0]}`,
                columns,
                rows,
                generatedBy: currentAdminUser?.fullName || 'الإدارة العامة',
                summaryCards: [
                  { label: 'إجمالي المشرفين', value: adminUsers.length },
                  { label: 'الحسابات النشطة', value: activeCount },
                  { label: 'الحسابات الموقوفة', value: adminUsers.length - activeCount },
                ],
              });
              showToast('success', 'تم تصدير كشف المشرفين والأدوار بصيغة Excel (.xlsx) بالهوية الرسمية.');
            }}
            className="w-full sm:w-auto bg-[#12192C] hover:bg-slate-800 text-[#F4C84A] border border-[#C5A45D] font-black px-4 py-3.5 rounded-2xl transition flex items-center justify-center gap-2 shadow-md text-xs sm:text-sm cursor-pointer active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#20B995]" />
            <span>تصدير كشف المشرفين Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black px-5 py-3.5 rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 text-xs sm:text-sm cursor-pointer active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>إضافة مشرف جديد</span>
          </button>
        </div>
      </div>

      {/* Super Admin Security Policy & Optional Self-2FA Card */}
      {superAdminRecord && (
        <div className="bg-[#0B1221] border border-emerald-500/35 rounded-3xl p-4 sm:p-5 shadow-lg flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-black text-white">
                  حماية حساب المالك الرئيسي (Super Admin Security)
                </h4>
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-slate-800 text-amber-300 border border-slate-700" dir="ltr">
                  {SUPER_ADMIN_GOOGLE_EMAIL}
                </span>
                {superAdminRecord.totpEnabled && superAdminRecord.totpSecret ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    2FA مفعّلة ✓
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                    2FA اختيارية (غير مفعّلة)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                الدخول عبر Google محصور حصرياً بحسابك الرسمي أعلاه. يمكنك اختيارياً تفعيل المصادقة الثنائية (Google / Microsoft Authenticator) لطبقة حماية إضافية، بينما تُفرض إلزامياً على جميع الموظفين المخولين.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full lg:w-auto">
            {superAdminRecord.totpEnabled && superAdminRecord.totpSecret ? (
              <button
                type="button"
                onClick={() => {
                  setOwn2faOtp('');
                  setOwn2faError('');
                  setOwn2faModalMode('disable');
                }}
                className="w-full lg:w-auto px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>إلغاء تفعيل 2FA لحسابي</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleOpenSuperAdmin2FAEnable()}
                className="w-full lg:w-auto px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center justify-center gap-2 transition shadow cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                <span>تفعيل المصادقة الثنائية (2FA) لحسابي</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Safe Legacy Roles Migration Banner (if any legacy role names exist) */}
      {legacyUsers.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs sm:text-sm font-black text-amber-300">
                مراجعة وترحيل الأدوار السابقة إلى الهيكل الخماسي الجديد ({legacyUsers.length} حساب)
              </h4>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                تم رصد مشرفين بمسميات الأدوار القديمة (مثل &quot;مشرف إداري&quot;). يقوم النظام تلقائياً بمعاملتهم وفق الدور المكافئ الآمن (&quot;الإشراف المكتبي&quot;) دون منح أي صلاحيات إدارة عامة تلقائياً. يمكنك اعتماد حفظ المسميات الجديدة في قاعدة البيانات بضغطة زر.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleMigrateLegacyRoles}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
            <span>اعتماد ترحيل المسميات</span>
          </button>
        </div>
      )}

      {/* The 5 Official Roles Cards & Role Permission Template Customizer */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <span>الأدوار الوظيفية الخمسة المعتمدة وقوالب صلاحياتها</span>
          </h4>
          <span className="text-xs text-slate-400 hidden sm:inline">
            تغيير صلاحيات أي دور ينعكس مباشرة على المشرفين المرتبطين به
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3.5">
          {OFFICIAL_ROLES.map((role) => {
            const count = adminUsers.filter(
              (u) => normalizeOfficialRole(u.role, u.username) === role.id
            ).length;
            const activeCount = adminUsers.filter(
              (u) =>
                normalizeOfficialRole(u.role, u.username) === role.id && u.status !== 'suspended'
            ).length;

            return (
              <div
                key={role.id}
                className={`bg-[#0B1221] border ${role.borderColor} rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-md hover:shadow-lg transition relative overflow-hidden`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center border ${role.badgeColor}`}
                    >
                      {renderRoleIcon(role.iconName, 'w-5 h-5')}
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-[#10192D] border border-slate-800 text-xs font-mono font-bold text-white">
                      {activeCount} / {count} مشرف
                    </span>
                  </div>

                  <div>
                    <h5 className={`text-sm font-black ${role.textColor}`}>{role.title}</h5>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed line-clamp-3">
                      {role.shortDesc}
                    </p>
                  </div>

                  <ul className="space-y-1 pt-1 border-t border-slate-800/80">
                    {role.responsibilities.slice(0, 3).map((resp, idx) => (
                      <li key={idx} className="text-[10px] text-slate-400 flex items-start gap-1.5">
                        <span className={`mt-1 w-1 h-1 rounded-full shrink-0 bg-current ${role.textColor}`} />
                        <span className="line-clamp-1">{resp}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {role.id !== 'الإدارة العامة' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTemplateRole(role.id);
                      setTemplatePermsDraft(getTemplateForRole(role.id));
                      setApplyTemplateToAllRoleUsers(true);
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-[#10192D] hover:bg-slate-800 border border-slate-700/80 hover:border-amber-500/40 text-xs font-bold text-slate-200 hover:text-amber-300 flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5 text-amber-400" />
                    <span>تخصيص صلاحيات الدور</span>
                  </button>
                ) : (
                  <div className="w-full py-2 px-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] font-bold text-amber-300 text-center">
                    صلاحيات الإدارة الشاملة (كاملة)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Supervisors Table */}
      <div className="bg-[#0B1221] border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-[#0F172A]">
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-5 h-5 text-amber-400" />
            <h4 className="text-sm sm:text-base font-black text-white">
              سجل حسابات المشرفين وصلاحياتهم ({adminUsers.length})
            </h4>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              نشط: {adminUsers.filter((u) => u.status !== 'suspended').length}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              موقوف: {adminUsers.filter((u) => u.status === 'suspended').length}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right text-slate-300">
            <thead className="bg-[#070C18] text-xs uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">اسم المشرف والنطاق</th>
                <th className="px-4 py-3.5">البريد الإلكتروني</th>
                <th className="px-4 py-3.5">الدور الوظيفي</th>
                <th className="px-4 py-3.5">حالة الحساب والأمان (2FA)</th>
                <th className="px-4 py-3.5">الصلاحيات التفصيلية المفعلة</th>
                <th className="px-4 py-3.5">إجراءات أمنية وإدارية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {adminUsers.map((usr) => {
                const officialRole = normalizeOfficialRole(usr.role, usr.username);
                const rDef = getRoleDefinition(officialRole, usr.username);
                const usrDetailed = getEffectiveDetailedPermissions(usr, roleTemplates);
                const isSuspended = usr.status === 'suspended';
                const isOwnerRow = isSuperAdminUser(usr);
                const isLastAdmin = isOwnerRow || isLastActiveGeneralAdmin(usr.id, adminUsers);
                const displayEmail = (usr.email || usr.username || '').trim().toLowerCase();
                const activeLock = activeLockouts.find(
                  (l) => l.identifier.toLowerCase() === displayEmail && l.lockedUntil > Date.now()
                );
                const userTrustedDevices = allTrustedDevices.filter(
                  (d) => d.userId === usr.id && !d.revoked
                );
                const hasBiometricDevice = userTrustedDevices.some((d) => d.biometricEnabled);

                return (
                  <tr
                    key={usr.id}
                    className={`transition ${
                      isSuspended
                        ? 'bg-red-950/10 opacity-75 hover:bg-red-950/20'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-white text-sm">{usr.fullName}</span>
                        {isOwnerRow && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black">
                            المالك الرئيسي
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
                          {usr.assignedSeason || 'موسم 1448هـ'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800/70 text-slate-300 border border-slate-700/70">
                          {usr.assignedCaravan || 'جميع القوافل'}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-4 font-mono text-xs text-slate-300" dir="ltr">
                      <div>{displayEmail}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {isOwnerRow ? 'دخول Google فقط' : 'بريد + كلمة مرور + 2FA'}
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-bold ${rDef.badgeColor}`}>
                        <span className={rDef.textColor}>
                          {renderRoleIcon(rDef.iconName, 'w-3.5 h-3.5')}
                        </span>
                        <span className={rDef.textColor}>{officialRole}</span>
                      </div>
                      {usr.customPermissionsOverride && officialRole !== 'الإدارة العامة' && (
                        <div className="text-[10px] text-amber-400 mt-1 font-bold">
                          • صلاحيات مخصصة فردياً
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-4 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isSuspended ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 text-[11px] font-bold">
                            <Lock className="w-3 h-3" />
                            <span>مجمّد / موقوف</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>نشط</span>
                          </span>
                        )}

                        {usr.totpEnabled && usr.totpSecret ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-bold">
                            <Smartphone className="w-3 h-3" />
                            <span>2FA مفعّل ✓</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                            <QrCode className="w-3 h-3" />
                            <span>{isOwnerRow ? '2FA اختياري' : 'بانتظار ربط 2FA'}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setInspectDevicesUser(usr)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold transition cursor-pointer ${
                            userTrustedDevices.length > 0
                              ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/35 hover:bg-indigo-500/25'
                              : 'bg-slate-800/80 text-slate-400 border-slate-700/80 hover:text-slate-200'
                          }`}
                          title="عرض تفاصيل الأجهزة الموثوقة لهذا المشرف"
                        >
                          <Monitor className="w-3 h-3" />
                          <span>
                            {userTrustedDevices.length === 0
                              ? 'لا توجد أجهزة موثوقة'
                              : userTrustedDevices.length === 1
                              ? 'جهاز واحد موثوق'
                              : userTrustedDevices.length === 2
                              ? 'جهازان موثوقان'
                              : `${userTrustedDevices.length} أجهزة موثوقة`}
                          </span>
                        </button>

                        {hasBiometricDevice && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                            <Fingerprint className="w-3 h-3" />
                            <span>بصمة مفعّلة</span>
                          </span>
                        )}
                      </div>

                      {!isOwnerRow && usr.mustChangePassword && (
                        <div className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                          <KeyRound className="w-3 h-3 shrink-0" />
                          <span>بانتظار تغيير كلمة المرور المؤقتة</span>
                        </div>
                      )}

                      {activeLock && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-black">
                            <Clock className="w-3 h-3" />
                            <span>
                              محظور مؤقتاً ({formatCountdownMMSS(Math.ceil((activeLock.lockedUntil - Date.now()) / 1000))})
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleUnlockStaffLockout(usr)}
                            className="text-[10px] font-black text-emerald-400 hover:underline cursor-pointer"
                          >
                            فك الحظر
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-4 max-w-md">
                      {officialRole === 'الإدارة العامة' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-bold">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>كامل الصلاحيات على جميع الأقسام والعمليات الـ 8</span>
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {PERMISSION_MODULES.map((mod) => {
                            const mPerm = usrDetailed[mod.id];
                            if (!mPerm?.view) return null;
                            const enabledOps = PERMISSION_OPERATIONS.filter(
                              (op) => mPerm[op.id]
                            ).map((op) => op.shortLabel);
                            return (
                              <span
                                key={mod.id}
                                className="px-2 py-0.5 rounded-md bg-[#10192D] border border-slate-700/80 text-[10px] text-slate-200"
                              >
                                <strong className="text-amber-300">
                                  {mod.title.split(' ')[0]} {mod.title.split(' ')[1]}:
                                </strong>{' '}
                                {enabledOps.join('، ')}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(usr)}
                          className="p-2 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded-xl transition cursor-pointer"
                          title="تعديل بيانات المشرف وتخصيص الصلاحيات"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {!isOwnerRow && (
                          <button
                            type="button"
                            onClick={() => setConfirmReset2FAUser(usr)}
                            className="px-2.5 py-2 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 border border-sky-500/30 rounded-xl transition cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                            title="إعادة تعيين المصادقة الثنائية (في حال فقدان أو تغيير جوال الموظف)"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline">إعادة تعيين الـ 2FA</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setConfirmRevokeAllDevicesUser(usr)}
                          className={`px-2.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1 text-[11px] font-bold border ${
                            userTrustedDevices.length > 0
                              ? 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border-rose-500/35'
                              : 'bg-slate-800/70 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border-slate-700/80'
                          }`}
                          title="إلغاء توثيق جميع أجهزة المشرف (دون حذف أي بيانات تشغيلية)"
                        >
                          <ShieldOff className="w-3.5 h-3.5" />
                          <span className="hidden xl:inline">
                            إلغاء توثيق جميع أجهزة المشرف
                            {userTrustedDevices.length > 0 ? ` (${userTrustedDevices.length})` : ''}
                          </span>
                        </button>

                        {!isOwnerRow && (
                          <button
                            type="button"
                            disabled={isLastAdmin && !isSuspended}
                            onClick={() => handleQuickToggleStatus(usr)}
                            className={`px-2.5 py-2 rounded-xl transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 text-[11px] font-bold ${
                              isSuspended
                                ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30'
                                : 'bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 border border-orange-500/30'
                            }`}
                            title={
                              isSuspended
                                ? 'إعادة تفعيل الحساب'
                                : 'تجميد وإيقاف الحساب فوراً وطرده من الجلسة النشطة'
                            }
                          >
                            {isSuspended ? (
                              <>
                                <Unlock className="w-3.5 h-3.5" />
                                <span className="hidden xl:inline">تفعيل</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                <span className="hidden xl:inline">تجميد فوري</span>
                              </>
                            )}
                          </button>
                        )}

                        {!isLastAdmin && !isOwnerRow && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteUser(usr)}
                            className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl transition cursor-pointer"
                            title="حذف حساب المشرف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Add / Edit Supervisor & Granular Permissions Matrix */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn"
          dir="rtl"
        >
          <div className="bg-[#0B1221] border border-amber-500/35 rounded-3xl w-full max-w-4xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden my-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#0F172A] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-400 flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    {editingStaff ? 'تعديل حساب المشرف والصلاحيات التفصيلية' : 'إضافة مشرف جديد وتحديد دوره وصلاحياته'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    اختر الدور الوظيفي من الأدوار الخمسة، ثم خصص الصلاحيات التفصيلية حسب الحاجة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 space-y-6 overflow-y-auto flex-1 text-sm">
              {formError && (
                <div className="bg-red-500/15 border border-red-500/40 text-red-300 px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Section 1: Basic Identity, Account Status, and Assigned Caravan/Season */}
              <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <h4 className="text-xs sm:text-sm font-black text-amber-400 border-b border-slate-800 pb-2">
                  أولاً: البيانات الأساسية وحالة الحساب والنطاق التشغيلي
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      اسم المشرف الكامل *
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        if (formError) setFormError('');
                      }}
                      className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-xs sm:text-sm focus:border-amber-400 focus:outline-none"
                      placeholder="مثال: صالح الياسين"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      حالة الحساب *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAccountStatus('active')}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                          accountStatus === 'active'
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                            : 'bg-[#070C18] border-slate-800 text-slate-400'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>نشط</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAccountStatus('suspended')}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                          accountStatus === 'suspended'
                            ? 'bg-red-500/20 border-red-500 text-red-300'
                            : 'bg-[#070C18] border-slate-800 text-slate-400'
                        }`}
                      >
                        <Lock className="w-4 h-4" />
                        <span>موقوف</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      {editingStaff
                        ? 'كلمة مرور مؤقتة جديدة (اختياري — يجبر التغيير عند الدخول)'
                        : 'كلمة المرور المؤقتة (يُجبر الموظف على تغييرها أول دخول) *'}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <input
                          type={showPin ? 'text' : 'password'}
                          value={pin}
                          disabled={Boolean(editingStaff && isSuperAdminUser(editingStaff))}
                          onChange={(e) => {
                            setPin(e.target.value);
                            setCopiedTempPwd(false);
                          }}
                          className="w-full bg-[#070C18] border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-white font-mono text-xs sm:text-sm focus:border-amber-400 focus:outline-none disabled:opacity-40"
                          placeholder={
                            editingStaff && isSuperAdminUser(editingStaff)
                              ? 'دخول Google فقط'
                              : 'كلمة مرور مؤقتة قوية'
                          }
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPin(!showPin)}
                          className="absolute left-2.5 top-2.5 text-slate-400 hover:text-amber-400 cursor-pointer"
                        >
                          {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {!(editingStaff && isSuperAdminUser(editingStaff)) && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setPin(generateTemporaryPassword());
                              setShowPin(true);
                              setCopiedTempPwd(false);
                            }}
                            title="توليد كلمة مرور مؤقتة قوية"
                            className="p-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 transition cursor-pointer shrink-0"
                          >
                            <Wand2 className="w-4 h-4" />
                          </button>
                          {pin && (
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(pin).catch(() => {});
                                setCopiedTempPwd(true);
                                setTimeout(() => setCopiedTempPwd(false), 2000);
                              }}
                              title="نسخ كلمة المرور المؤقتة لتسليمها للموظف"
                              className="p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 transition cursor-pointer shrink-0"
                            >
                              {copiedTempPwd ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      البريد الإلكتروني للموظف (معرّف الدخول) *
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                      <input
                        type="email"
                        value={emailInput}
                        disabled={Boolean(editingStaff && isSuperAdminUser(editingStaff))}
                        onChange={(e) => {
                          setEmailInput(e.target.value.replace(/\s+/g, ''));
                          if (formError) setFormError('');
                        }}
                        className="w-full bg-[#070C18] border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-white font-mono text-xs focus:border-amber-400 focus:outline-none disabled:opacity-50"
                        placeholder="staff@alqaemhajj.com"
                        dir="ltr"
                      />
                    </div>
                    {!(editingStaff && isSuperAdminUser(editingStaff)) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5" dir="ltr">
                        {STAFF_DOMAIN_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              const base = emailInput.split('@')[0] || 'staff';
                              setEmailInput(`${base}${opt.value}`);
                            }}
                            className="px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-[10px] font-mono text-amber-300 cursor-pointer"
                          >
                            {opt.value}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      موسم الحج المخصص
                    </label>
                    <select
                      value={assignedSeason}
                      onChange={(e) => setAssignedSeason(e.target.value)}
                      className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-bold"
                    >
                      {SEASON_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      القافلة أو الفوج المخصص
                    </label>
                    <select
                      value={assignedCaravan}
                      onChange={(e) => setAssignedCaravan(e.target.value)}
                      className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-bold"
                    >
                      {CARAVAN_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Elegant 5-Role Selector with Icons & Descriptions */}
              <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="text-xs sm:text-sm font-black text-amber-400">
                    ثانياً: اختيار الدور الوظيفي (الأدوار الخمسة المعتمدة) *
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    يتم تحميل الصلاحيات المعيارية للدور تلقائياً عند اختياره
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                  {OFFICIAL_ROLES.map((role) => {
                    const isSelected = selectedRole === role.id;
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => handleRoleChangeInForm(role.id)}
                        className={`p-3 rounded-2xl border text-right transition flex flex-col justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? `bg-gradient-to-b ${role.bgAccent} ${role.borderColor} ring-2 ring-amber-400/50 shadow-lg`
                            : 'bg-[#070C18] border-slate-800 hover:border-slate-700 opacity-80 hover:opacity-100'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center border ${role.badgeColor}`}
                            >
                              {renderRoleIcon(role.iconName, 'w-4 h-4')}
                            </div>
                            {isSelected && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black">
                                محدد
                              </span>
                            )}
                          </div>
                          <div className={`text-xs font-black ${role.textColor}`}>{role.title}</div>
                          <p className="text-[10px] text-slate-300 leading-relaxed">
                            {role.shortDesc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Role Responsibilities Box */}
                {(() => {
                  const activeRoleInfo = getRoleDefinition(selectedRole);
                  return (
                    <div className="bg-[#070C18] border border-slate-800 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-black ${activeRoleInfo.textColor}`}>
                          مسؤوليات وصلاحيات دور: {activeRoleInfo.title}
                        </span>
                        {selectedRole !== 'الإدارة العامة' && (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomOverride(false);
                              setDetailedPerms(getTemplateForRole(selectedRole));
                            }}
                            className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                          >
                            إعادة ضبط لصلاحيات الدور الافتراضية
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {activeRoleInfo.responsibilities.map((item, i) => (
                          <div key={i} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-amber-300/90 pt-1 border-t border-slate-800/80">
                        <strong>ضابط الصلاحيات:</strong> {activeRoleInfo.restrictions}
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Section 3: Granular 8-Operation × 8-Module Permissions Matrix */}
              <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div>
                    <h4 className="text-xs sm:text-sm font-black text-amber-400">
                      ثالثاً: مصفوفة الصلاحيات التفصيلية (مشاهدة، إضافة، تعديل، حذف، اعتماد، طباعة، تصدير، إدارة)
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      يمكن للإدارة العامة تفعيل أو إلغاء أي عملية بشكل مستقل لهذا المشرف
                    </p>
                  </div>
                  {selectedRole === 'الإدارة العامة' && (
                    <span className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold">
                      الإدارة العامة تمتلك جميع الصلاحيات تلقائياً
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {PERMISSION_MODULES.map((mod) => {
                    const modPerms = detailedPerms[mod.id];
                    const allChecked = PERMISSION_OPERATIONS.every((op) => modPerms?.[op.id]);
                    const isLockedMaster = selectedRole === 'الإدارة العامة';

                    return (
                      <div
                        key={mod.id}
                        className="bg-[#070C18] border border-slate-800/90 rounded-2xl p-3.5 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-xs sm:text-sm font-black text-white">
                              {mod.title}
                            </div>
                            <div className="text-[10px] sm:text-[11px] text-slate-400">
                              {mod.subtitle}
                            </div>
                          </div>

                          {!isLockedMaster && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleEntireModule(mod.id, !allChecked, false)}
                                className="px-2.5 py-1 rounded-lg bg-[#10192D] hover:bg-slate-800 border border-slate-700 text-[10px] font-bold text-amber-400 cursor-pointer"
                              >
                                {allChecked ? 'إلغاء تحديد القسم' : 'تفعيل كامل القسم'}
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-1">
                          {PERMISSION_OPERATIONS.map((op) => {
                            const checked = isLockedMaster ? true : Boolean(modPerms?.[op.id]);
                            return (
                              <label
                                key={op.id}
                                className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold transition select-none ${
                                  isLockedMaster
                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 opacity-80 cursor-not-allowed'
                                    : checked
                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 cursor-pointer'
                                    : 'bg-[#10192D]/70 border-slate-800 text-slate-400 hover:border-slate-700 cursor-pointer'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={isLockedMaster}
                                  checked={checked}
                                  onChange={() => toggleOperationPermission(mod.id, op.id, false)}
                                  className="w-3.5 h-3.5 accent-amber-500 rounded"
                                />
                                <span className="truncate">{op.shortLabel}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-800 bg-[#0F172A] shrink-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveSupervisor}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg cursor-pointer"
              >
                {isSaving
                  ? 'جاري الحفظ والتوثيق...'
                  : editingStaff
                  ? 'حفظ تعديلات المشرف والصلاحيات'
                  : 'إنشاء حساب المشرف واعتماد الصلاحيات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Role Default Permissions Template Customizer */}
      {editingTemplateRole && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn"
          dir="rtl"
        >
          <div className="bg-[#0B1221] border border-amber-500/40 rounded-3xl w-full max-w-4xl max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#0F172A] shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  تخصيص الصلاحيات المعيارية لدور: <span className="text-amber-400">{editingTemplateRole}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  أي تعديل هنا يُحفظ كقالب رسمي للدور وينعكس فوراً على جميع المشرفين الحاملين لهذا الدور
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingTemplateRole(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-3 overflow-y-auto flex-1">
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyTemplateToAllRoleUsers}
                  onChange={(e) => setApplyTemplateToAllRoleUsers(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded"
                />
                <span>
                  تطبيق الصلاحيات المحدثة فوراً على جميع المشرفين المسجلين تحت دور &quot;{editingTemplateRole}&quot;
                </span>
              </label>

              {PERMISSION_MODULES.map((mod) => {
                const modPerms = templatePermsDraft[mod.id];
                const allChecked = PERMISSION_OPERATIONS.every((op) => modPerms?.[op.id]);
                return (
                  <div
                    key={mod.id}
                    className="bg-[#070C18] border border-slate-800 rounded-2xl p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs sm:text-sm font-black text-white">{mod.title}</div>
                        <div className="text-[11px] text-slate-400">{mod.subtitle}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleEntireModule(mod.id, !allChecked, true)}
                        className="px-2.5 py-1 rounded-lg bg-[#10192D] border border-slate-700 text-[10px] font-bold text-amber-400 cursor-pointer"
                      >
                        {allChecked ? 'إلغاء الكل' : 'تحديد الكل'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                      {PERMISSION_OPERATIONS.map((op) => {
                        const checked = Boolean(modPerms?.[op.id]);
                        return (
                          <label
                            key={op.id}
                            className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold cursor-pointer ${
                              checked
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                : 'bg-[#10192D]/70 border-slate-800 text-slate-400'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleOperationPermission(mod.id, op.id, true)}
                              className="w-3.5 h-3.5 accent-amber-500 rounded"
                            />
                            <span>{op.shortLabel}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-800 bg-[#0F172A] shrink-0">
              <button
                type="button"
                onClick={() =>
                  setTemplatePermsDraft(
                    JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS[editingTemplateRole]))
                  )
                }
                className="text-xs font-bold text-amber-400 hover:underline cursor-pointer"
              >
                استعادة الضبط الافتراضي الأصلي للدور
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingTemplateRole(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveRoleTemplate}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer"
                >
                  {isSaving ? 'جاري الحفظ...' : 'حفظ قالب الدور وتحديث المشرفين'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Delete Confirmation */}
      {confirmDeleteUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
        >
          <div className="bg-[#0B1221] border border-red-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 text-right shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h4 className="text-base font-black text-white">تأكيد حذف حساب المشرف</h4>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              هل أنت متأكد من حذف حساب المشرف{' '}
              <strong className="text-amber-400">{confirmDeleteUser.fullName}</strong> (
              <span className="font-mono">{confirmDeleteUser.username}</span>)؟ سيتم تسجيل العملية في سجل التدقيق.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (isLastActiveGeneralAdmin(confirmDeleteUser.id, adminUsers)) {
                    showToast(
                      'error',
                      'منع أمني: لا يمكن حذف المشرف الوحيد الذي يملك صلاحية الإدارة العامة.'
                    );
                    setConfirmDeleteUser(null);
                    return;
                  }
                  await onDeleteAdminUser(confirmDeleteUser.id);
                  setConfirmDeleteUser(null);
                  showToast('success', 'تم حذف حساب المشرف بنجاح.');
                }}
                className="px-5 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white font-black text-xs cursor-pointer"
              >
                تأكيد الحذف النهائي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Reset Staff 2FA Confirmation */}
      {confirmReset2FAUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
        >
          <div className="bg-[#0B1221] border border-sky-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 text-right shadow-2xl">
            <div className="flex items-center gap-3 text-sky-400">
              <RotateCcw className="w-6 h-6 shrink-0" />
              <h4 className="text-base font-black text-white">إعادة تعيين المصادقة الثنائية (Reset 2FA)</h4>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              هل تريد إعادة تعيين المصادقة الثنائية للموظف{' '}
              <strong className="text-amber-400">{confirmReset2FAUser.fullName}</strong> (
              <span className="font-mono">{confirmReset2FAUser.email || confirmReset2FAUser.username}</span>)؟
              سيتم إلغاء المفتاح السابق وإنهاء جلسته الحالية فوراً، وسيُطلب منه مسح رمز QR جديد عبر Google أو Microsoft Authenticator عند الدخول القادم.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmReset2FAUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleResetStaff2FA(confirmReset2FAUser)}
                className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs cursor-pointer"
              >
                {isSaving ? 'جاري التنفيذ...' : 'تأكيد إعادة تعيين الـ 2FA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Super Admin Optional 2FA Enable / Disable */}
      {own2faModalMode && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          dir="rtl"
        >
          <div className="bg-[#0B1221] border border-emerald-500/40 rounded-3xl max-w-md w-full p-6 space-y-5 text-right shadow-2xl my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <QrCode className="w-5 h-5" />
                <h4 className="text-base font-black text-white">
                  {own2faModalMode === 'enable'
                    ? 'تفعيل المصادقة الثنائية لحساب المالك الرئيسي'
                    : 'إلغاء المصادقة الثنائية لحساب المالك الرئيسي'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setOwn2faModalMode(null)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {own2faError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold">
                {own2faError}
              </div>
            )}

            {own2faModalMode === 'enable' ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  امسح رمز الاستجابة السريعة (QR) التالي باستخدام <strong>Google Authenticator</strong> أو <strong>Microsoft Authenticator</strong> ثم أدخل الرمز المكون من 6 أرقام لتأكيد الربط.
                </p>

                {own2faQr && (
                  <div className="flex justify-center">
                    <div className="p-3 bg-white rounded-2xl border-2 border-emerald-400/50 shadow-lg">
                      <img src={own2faQr} alt="Super Admin 2FA QR Code" className="w-48 h-48" />
                    </div>
                  </div>
                )}

                <div className="bg-[#070C18] border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400">المفتاح السري للإدخال اليدوي:</div>
                    <div className="font-mono text-xs text-amber-300 font-bold truncate" dir="ltr">
                      {formatTotpSecretForDisplay(own2faSecret)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(own2faSecret).catch(() => {});
                      setOwn2faCopied(true);
                      setTimeout(() => setOwn2faCopied(false), 2000);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {own2faCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{own2faCopied ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    أدخل رمز التحقق (6 أرقام) *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={own2faOtp}
                    onChange={(e) => {
                      setOwn2faOtp(normalizeOtpDigits(e.target.value));
                      if (own2faError) setOwn2faError('');
                    }}
                    placeholder="000000"
                    dir="ltr"
                    className="w-full bg-[#070C18] border border-slate-700 focus:border-emerald-400 rounded-xl px-4 py-3 text-center font-mono text-xl tracking-[0.4em] text-white focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setOwn2faModalMode(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    disabled={own2faBusy || own2faOtp.length !== 6}
                    onClick={() => void handleConfirmSuperAdmin2FAEnable()}
                    className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs cursor-pointer"
                  >
                    {own2faBusy ? 'جاري التحقق...' : 'تأكيد وتفعيل 2FA'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  لتأكيد إلغاء تفعيل المصادقة الثنائية الاختيارية لحساب المالك الرئيسي، يرجى إدخال رمز التحقق الحالي (6 أرقام) من تطبيق المصادقة.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={own2faOtp}
                  onChange={(e) => {
                    setOwn2faOtp(normalizeOtpDigits(e.target.value));
                    if (own2faError) setOwn2faError('');
                  }}
                  placeholder="000000"
                  dir="ltr"
                  className="w-full bg-[#070C18] border border-slate-700 focus:border-rose-400 rounded-xl px-4 py-3 text-center font-mono text-xl tracking-[0.4em] text-white focus:outline-none"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setOwn2faModalMode(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    تراجع
                  </button>
                  <button
                    type="button"
                    disabled={own2faBusy || own2faOtp.length !== 6}
                    onClick={() => void handleConfirmSuperAdmin2FADisable()}
                    className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white font-black text-xs cursor-pointer"
                  >
                    {own2faBusy ? 'جاري الإلغاء...' : 'تأكيد إلغاء 2FA'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 6: Confirm Revoke ALL Trusted Devices for a Supervisor (Preserves Operational Data) */}
      {confirmRevokeAllDevicesUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
        >
          <div className="bg-[#0B1221] border border-rose-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 text-right shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <ShieldOff className="w-6 h-6 shrink-0" />
              <h4 className="text-base font-black text-white">إلغاء توثيق جميع أجهزة المشرف</h4>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              هل تريد سحب الثقة وإلغاء توثيق كافة الأجهزة الموثوقة المرتبطة بالمشرف{' '}
              <strong className="text-amber-400">{confirmRevokeAllDevicesUser.fullName}</strong> (
              <span className="font-mono">
                {confirmRevokeAllDevicesUser.email || confirmRevokeAllDevicesUser.username}
              </span>
              )؟
            </p>
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 text-xs text-slate-300 space-y-1.5">
              <p>• سيتم تعطيل الدخول السريع بالبصمة على جميع أجهزته السابقة فوراً.</p>
              <p>• سيُطلب منه إدخال رمز التحقق بخطوتين (2FA) عند أي محاولة دخول جديدة.</p>
              <p className="text-emerald-400 font-bold">
                • لن يتم حذف أو تعديل أي بيانات تشغيلية أو سجلات حجاج قام بإدخالها.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRevokeAllDevicesUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleRevokeAllDevicesForStaff(confirmRevokeAllDevicesUser)}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs cursor-pointer"
              >
                {isSaving ? 'جاري التنفيذ...' : 'تأكيد إلغاء توثيق جميع الأجهزة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: Inspect Trusted Devices for a Supervisor */}
      {inspectDevicesUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          dir="rtl"
        >
          {(() => {
            const targetDevices = allTrustedDevices.filter(
              (d) => d.userId === inspectDevicesUser.id && !d.revoked
            );
            return (
              <div className="bg-[#0B1221] border border-indigo-500/40 rounded-3xl max-w-lg w-full p-6 space-y-4 text-right shadow-2xl my-auto">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center justify-center">
                      <Monitor className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm sm:text-base font-black text-white">
                        الأجهزة الموثوقة — {inspectDevicesUser.fullName}
                      </h4>
                      <p className="text-[11px] font-mono text-slate-400" dir="ltr">
                        {inspectDevicesUser.email || inspectDevicesUser.username}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInspectDevicesUser(null)}
                    className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                {targetDevices.length === 0 ? (
                  <div className="bg-[#070C18] border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                    لا توجد حالياً أي أجهزة موثوقة مرتبطة بهذا الحساب.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {targetDevices.map((dev) => (
                      <div
                        key={dev.id}
                        className="bg-[#070C18] border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-slate-800 text-indigo-300 flex items-center justify-center shrink-0">
                            {dev.deviceType === 'mobile' ? (
                              <Smartphone className="w-4 h-4" />
                            ) : dev.deviceType === 'tablet' ? (
                              <Tablet className="w-4 h-4" />
                            ) : (
                              <Laptop className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-black text-white" dir="ltr">
                                {dev.deviceName}
                              </span>
                              {dev.biometricEnabled && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                  <Fingerprint className="w-3 h-3" />
                                  <span>بصمة</span>
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1 space-y-0.5">
                              <div>تاريخ التوثيق: {formatDeviceTimestampAr(dev.trustedAt)}</div>
                              <div>آخر نشاط: {formatDeviceTimestampAr(dev.lastUsedAt)}</div>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => void handleRevokeSingleDeviceForStaff(dev)}
                          className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-bold shrink-0 cursor-pointer disabled:opacity-50"
                        >
                          إلغاء توثيق
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                  {targetDevices.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        const target = inspectDevicesUser;
                        setInspectDevicesUser(null);
                        setConfirmRevokeAllDevicesUser(target);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                    >
                      <ShieldOff className="w-3.5 h-3.5" />
                      <span>إلغاء توثيق جميع أجهزة المشرف</span>
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => setInspectDevicesUser(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
