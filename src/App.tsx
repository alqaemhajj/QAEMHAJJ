import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Pilgrim, HajjPackage, Announcement, AdminUser, CampaignSettings, PilgrimFeedback, NotificationItem, HajjSeason } from './types';
import { initialPilgrims, hajjPackages as defaultPackages, announcements as defaultAnnouncements, initialAdminUsers, defaultCampaignSettings, defaultSiteTexts } from './data/initialData';
import { Navbar, GuideTabId } from './components/Navbar';
import { Footer } from './components/Footer';
import { Home } from './components/Home';
import { RegistrationForm } from './components/RegistrationForm';
import { PilgrimPortal } from './components/PilgrimPortal';
import { AdminDashboard } from './components/AdminDashboard';
import { PackagesView } from './components/PackagesView';
import { GuideView } from './components/GuideView';
import { AiAdvisor } from './components/AiAdvisor';
import { ContactView } from './components/ContactView';
import { Share2, WifiOff, AlertTriangle } from 'lucide-react';
import { auth } from './lib/firebase';
import { PWAInstallButton } from './components/pwa/PWAInstallButton';
import { 
  getDocuments, getDocument, setDocument, updateDocument, removeDocument, 
  subscribeToCollection, subscribeToDocument, testFirestoreConnection, recordActivityLog,
  getSeasonPilgrims, subscribeToSeasonPilgrims, ensureSystemSeededOnce,
  subscribeToCentralSyncState, CentralSyncState
} from './lib/db';
import { runMediaStorageAuditAndCleanup } from './lib/mediaManager';
import {
  ensureInitialSeasonsOnce,
  subscribeToSeasons,
  linkEntityToSeason,
  unlinkEntityFromSeason,
  normalizeSeasonId,
  extractHijriYear,
} from './lib/seasons';
import { calculatePilgrimStatsBreakdown, getActiveSeasonYear } from './utils/pilgrimStats';
import { processDueScheduledNotifications } from './lib/notifications';
import {
  DEFAULT_ROLE_PERMISSIONS,
  isGeneralAdminUser,
  isSuperAdminGoogleEmail,
  migrateAdminUserRecord,
  SUPER_ADMIN_GOOGLE_EMAIL,
} from './utils/rbac';
import { MASTER_DEFAULT_PIN_HASH } from './utils/pinAuth';
import { DynamicFormTemplate } from './types/dynamicForms';
import { subscribeToDynamicForms } from './lib/dynamicFormsDb';
import { safeStorage } from './utils/safeStorage';
import { fetchWithTimeout } from './utils/safeFetch';
import { recordNewDeviceSecurityAlert, verifyCurrentDeviceTrust } from './utils/trustedDevices';
import type { AdminAuthMethod } from './components/AdminAuthGate';

export default function App() {
  const [currentView, setCurrentView] = useState('home');
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [packages, setPackages] = useState<HajjPackage[]>(defaultPackages);
  const [announcements, setAnnouncements] = useState<Announcement[]>(defaultAnnouncements);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>(initialAdminUsers);
  const [feedback, setFeedback] = useState<PilgrimFeedback[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [seasons, setSeasons] = useState<HajjSeason[]>([]);
  const [dynamicForms, setDynamicForms] = useState<DynamicFormTemplate[]>([]);
  const [campaignSettings, setCampaignSettings] = useState<CampaignSettings>(defaultCampaignSettings);
  const [selectedPackageForReg, setSelectedPackageForReg] = useState<string>('');
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [currentAdminUser, setCurrentAdminUser] = useState<AdminUser | null>(null);
  const [pendingSuperAdmin2FA, setPendingSuperAdmin2FA] = useState<AdminUser | null>(null);
  const [authGateNotice, setAuthGateNotice] = useState<string>('');
  const superAdmin2faVerifiedRef = useRef<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [guideSubTab, setGuideSubTab] = useState<GuideTabId>('all');
  const [adminSubTab, setAdminSubTab] = useState<string>('dashboard');
  const [highlightedPackageId, setHighlightedPackageId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<CentralSyncState>({
    status: 'online',
    pendingWrites: 0,
    lastSyncedAt: null,
    lastError: null,
    skippedRedundantWrites: 0,
  });

  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  // Visitor Theme Preference (Dark / Light) persisted via safeStorage (iframe-resilient)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = safeStorage.getItem('qaem_theme_preference');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    safeStorage.setItem('qaem_theme_preference', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Global Site Font Scale controlled from Admin Dashboard (compact: 90%, normal: 100%, large: 110%)
  useEffect(() => {
    const scale = campaignSettings.fontScale || 'normal';
    const scalePercentMap: Record<'compact' | 'normal' | 'large', string> = {
      compact: '90%',
      normal: '100%',
      large: '110%',
    };
    const pct = scalePercentMap[scale] || '100%';
    document.documentElement.style.setProperty('--qaem-root-font-size', pct);
    safeStorage.setItem('qaem_font_scale', scale);
  }, [campaignSettings.fontScale]);

  useEffect(() => {
    const handleQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  useEffect(() => {
    return subscribeToCentralSyncState((state) => {
      setSyncState(state);
    });
  }, []);

  // Prevent mobile hardware Back button from exiting the app when on a sub-view
  useEffect(() => {
    if (currentView !== 'home') {
      window.history.pushState({ appView: currentView }, '');
    }
  }, [currentView]);

  useEffect(() => {
    const handleViewPopState = (e: PopStateEvent) => {
      // Prevent returning to protected admin views after logout via browser Back button
      if (!adminLoggedIn && (currentView === 'admin' || e.state?.appView === 'admin')) {
        window.history.replaceState({ appView: 'home', loggedOut: true }, '', window.location.pathname);
        setCurrentView('home');
        return;
      }
      // If an admin modal was just closed via popstate, do not also exit the admin view
      if (e.state && e.state.appView) {
        return;
      }
      if (currentView !== 'home') {
        setCurrentView('home');
      }
    };
    window.addEventListener('popstate', handleViewPopState);
    return () => window.removeEventListener('popstate', handleViewPopState);
  }, [currentView, adminLoggedIn]);

  // Strict Super Admin Google Whitelist helpers (ONLY alqaemhajj313@gmail.com)
  const normalizeAdminKey = (val?: string) => (val || '').trim().toLowerCase();
  const isMasterAdminAlias = (username?: string) => {
    const norm = normalizeAdminKey(username);
    return (
      norm === SUPER_ADMIN_GOOGLE_EMAIL ||
      norm === 'admin' ||
      norm === 'admin@alqaemhajj.com'
    );
  };

  // Deduplicate adminUsers list and automatically remove redundant duplicate docs from Firestore
  const deduplicateAndSyncAdmins = (rawList: AdminUser[]): AdminUser[] => {
    const seenByKey = new Map<string, AdminUser>();
    const seenByName = new Map<string, AdminUser>();
    const duplicateIdsToDelete: string[] = [];

    // Sort so canonical IDs ('usr-1', 'usr-2') come first and are preserved over random/UID duplicates
    const sorted = [...rawList].sort((a, b) => {
      const aCanonical = a.id === 'usr-1' || a.id === 'usr-2' ? 0 : 1;
      const bCanonical = b.id === 'usr-1' || b.id === 'usr-2' ? 0 : 1;
      return aCanonical - bCanonical;
    });

    for (const item of sorted) {
      const normUser = normalizeAdminKey(item.username);
      const normName = (item.fullName || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const canonicalKey =
        isMasterAdminAlias(normUser) ||
        ((item.role === 'مدير عام (Master Admin)' || item.role === 'الإدارة العامة') &&
          normName === 'المدير العام للقافلة')
          ? '__master_admin__'
          : normUser;

      if (!canonicalKey) continue;

      const existing = seenByKey.get(canonicalKey) || (normName ? seenByName.get(normName) : undefined);
      if (existing) {
        if (item.pin && item.pin !== MASTER_DEFAULT_PIN_HASH && existing.pin === MASTER_DEFAULT_PIN_HASH) {
          existing.pin = item.pin;
          updateDocument('adminUsers', existing.id, { pin: item.pin }, { forceWrite: true }).catch(() => {});
        }
        duplicateIdsToDelete.push(item.id);
      } else {
        const migrated = migrateAdminUserRecord(item, campaignSettings.rolePermissionTemplates);
        seenByKey.set(canonicalKey, migrated);
        if (normName) seenByName.set(normName, migrated);
      }
    }

    if (duplicateIdsToDelete.length > 0) {
      duplicateIdsToDelete.forEach((dupId) => {
        removeDocument('adminUsers', dupId).catch(() => {});
      });
    }

    return Array.from(seenByKey.values());
  };

  // Initialize and Test Connection
  useEffect(() => {
    testFirestoreConnection();

    // Ensure one-time initial database seed only if database is brand-new and never seeded before
    ensureSystemSeededOnce({
      defaultPackages,
      defaultAnnouncements,
      defaultCampaignSettings,
      initialAdminUsers,
    }).catch(() => {});

    // Always pre-load live adminUsers from Firestore (even before login) so stale initialAdminUsers never shadows updated PINs
    getDocuments<AdminUser>('adminUsers', { bypassCache: true })
      .then((rawAdmins) => {
        if (rawAdmins && rawAdmins.length > 0) {
          const synced = deduplicateAndSyncAdmins(rawAdmins);
          if (synced.length > 0) setAdminUsers(synced);
        }
      })
      .catch(() => {});

    // Auth Listener — STRICT Super Admin Google Whitelist (ONLY alqaemhajj313@gmail.com)
    const unsubscribeAuth = onAuthStateChanged(auth, async (user: User | null) => {
      if (user) {
        try {
          // Anonymous auth is never sufficient by itself to grant dashboard access;
          // staff login is strictly handled through AdminAuthGate (Email + Password + 2FA).
          if (user.isAnonymous) {
            return;
          }

          const normEmail = normalizeAdminKey(user.email || '');

          // Strict Google Whitelist: ONLY alqaemhajj313@gmail.com with verified email is permitted
          if (!isSuperAdminGoogleEmail(normEmail) || user.emailVerified === false) {
            await auth.signOut().catch(() => {});
            superAdmin2faVerifiedRef.current = false;
            setPendingSuperAdmin2FA(null);
            setAdminLoggedIn(false);
            setCurrentAdminUser(null);
            setAuthGateNotice('عذراً، هذا الحساب غير مصرح له بالدخول عبر Google');
            return;
          }

          const rawAdmins = await getDocuments<AdminUser>('adminUsers', { bypassCache: true });
          const admins = deduplicateAndSyncAdmins(rawAdmins);
          if (admins.length > 0) setAdminUsers(admins);

          const existingOwner = admins.find(
            (a) =>
              a.id === 'usr-1' ||
              a.isSuperAdminOwner === true ||
              isSuperAdminGoogleEmail(a.email) ||
              isSuperAdminGoogleEmail(a.username) ||
              normalizeAdminKey(a.username) === 'admin'
          );

          let superAdminRecord: AdminUser;
          if (existingOwner) {
            superAdminRecord = migrateAdminUserRecord(
              {
                ...existingOwner,
                username: SUPER_ADMIN_GOOGLE_EMAIL,
                email: SUPER_ADMIN_GOOGLE_EMAIL,
                isSuperAdminOwner: true,
                role: 'الإدارة العامة',
                status: 'active',
                sessionVersion: existingOwner.sessionVersion || 1,
              },
              campaignSettings.rolePermissionTemplates
            );
            if (
              normalizeAdminKey(existingOwner.username) !== SUPER_ADMIN_GOOGLE_EMAIL ||
              !existingOwner.isSuperAdminOwner
            ) {
              updateDocument('adminUsers', superAdminRecord.id, superAdminRecord, {
                forceWrite: true,
              }).catch(() => {});
            }
          } else {
            superAdminRecord = {
              id: 'usr-1',
              username: SUPER_ADMIN_GOOGLE_EMAIL,
              email: SUPER_ADMIN_GOOGLE_EMAIL,
              pin: '',
              fullName: 'المدير العام للقافلة (المالك الرئيسي)',
              role: 'الإدارة العامة',
              status: 'active',
              isSuperAdminOwner: true,
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
              createdAt: new Date().toISOString().split('T')[0],
            };
            await setDocument('adminUsers', 'usr-1', superAdminRecord, { forceWrite: true });
          }

          // If Super Admin has enabled optional 2FA, check if current device is trusted before requiring 6-digit TOTP
          if (
            superAdminRecord.totpEnabled &&
            superAdminRecord.totpSecret &&
            !superAdmin2faVerifiedRef.current
          ) {
            const trustedDev = await verifyCurrentDeviceTrust(superAdminRecord.id);
            if (trustedDev) {
              superAdmin2faVerifiedRef.current = true;
            } else {
              void recordNewDeviceSecurityAlert(superAdminRecord);
              setPendingSuperAdmin2FA(superAdminRecord);
              setAdminLoggedIn(false);
              setCurrentAdminUser(null);
              return;
            }
          }

          setPendingSuperAdmin2FA(null);
          setAuthGateNotice('');
          setAdminLoggedIn(true);
          setCurrentAdminUser(superAdminRecord);
        } catch (e) {
          console.warn("Auth-related data fetch notice:", e);
        }
      } else {
        superAdmin2faVerifiedRef.current = false;
        setPendingSuperAdmin2FA(null);
        // Only clear adminLoggedIn if the current user was authenticated via Google (Super Admin),
        // or if not logged in via staff session
        setCurrentAdminUser((prev) => {
          if (prev && (prev.isSuperAdminOwner || isSuperAdminGoogleEmail(prev.email || prev.username))) {
            setAdminLoggedIn(false);
            return null;
          }
          return prev;
        });
      }
    });

    // Immediate lightweight non-blocking fetch with short timeout for settings/campaign
    fetchWithTimeout('/api/settings/campaign', { timeoutMs: 4000 })
      .then((res) => {
        const ct = res.headers.get('content-type') || '';
        return res.ok && ct.includes('application/json') ? res.json() : null;
      })
      .then((payload) => {
        if (payload?.data) {
          setCampaignSettings((prev) => ({
            ...prev,
            ...payload.data,
          }));
        }
      })
      .catch(() => {});

    // Ensure one-time initial seasons registry exists
    ensureInitialSeasonsOnce({
      activeYear: '1448',
      packageIds: defaultPackages.map((p) => p.id),
      announcementIds: defaultAnnouncements.map((a) => a.id),
    }).catch(() => {});

    // Real-time Subscriptions (Packages, Announcements, Campaign Settings, Seasons)
    const unsubPackages = subscribeToCollection<HajjPackage>('packages', (data) => {
      if (data.length > 0) setPackages(data);
    });
    const unsubAnnouncements = subscribeToCollection<Announcement>('announcements', (data) => {
      if (data.length > 0) setAnnouncements(data);
    });
    const unsubSettings = subscribeToDocument<CampaignSettings>('settings', 'campaign', (data) => {
      if (data) setCampaignSettings(data);
    });
    const unsubSeasons = subscribeToSeasons((data) => {
      setSeasons(data);
    });
    const unsubDynamicForms = subscribeToDynamicForms((data) => {
      setDynamicForms(data);
    });

    return () => {
      unsubscribeAuth();
      unsubPackages();
      unsubAnnouncements();
      unsubSettings();
      unsubSeasons();
      unsubDynamicForms();
    };
  }, []);

  // Derive current active Hijri season year dynamically from Seasons registry or Campaign Settings
  const activeSeasonObj = seasons.find((s) => s.status === 'active');
  const activeSeasonYear =
    activeSeasonObj?.hijriYear ||
    getActiveSeasonYear(campaignSettings) ||
    '1448';
  const activeSeasonId = activeSeasonObj?.id || normalizeSeasonId(activeSeasonYear);

  // Real-time & direct season-scoped pilgrims subscription (adapts automatically if active season changes)
  useEffect(() => {
    let mounted = true;
    getSeasonPilgrims<Pilgrim>(activeSeasonYear)
      .then((directPilgrims) => {
        if (mounted && directPilgrims.length > 0) {
          setPilgrims(directPilgrims);
        }
      })
      .catch(() => {});

    const unsubPilgrims = subscribeToSeasonPilgrims<Pilgrim>(activeSeasonYear, (data) => {
      if (mounted) setPilgrims(data);
    });

    return () => {
      mounted = false;
      unsubPilgrims();
    };
  }, [activeSeasonYear]);

  const refreshAllData = async () => {
    try {
      const [freshPilgrims, freshPackages, freshAnnouncements, freshSettings] = await Promise.all([
        getSeasonPilgrims<Pilgrim>(activeSeasonYear),
        getDocuments<HajjPackage>('packages'),
        getDocuments<Announcement>('announcements'),
        getDocument<CampaignSettings>('settings', 'campaign'),
      ]);
      setPilgrims(freshPilgrims);
      if (freshPackages.length > 0) setPackages(freshPackages);
      if (freshAnnouncements.length > 0) setAnnouncements(freshAnnouncements);
      if (freshSettings) setCampaignSettings(freshSettings);
    } catch (e) {
      console.warn('Manual refresh notice:', e);
    }
  };

  // Privileged Real-time Subscriptions (Admin Users, Feedback, Notifications)
  // Strictly attached ONLY when an administrative session is authenticated
  useEffect(() => {
    if (!adminLoggedIn) {
      setFeedback([]);
      setNotifications([]);
      return;
    }

    const unsubAdmins = subscribeToCollection<AdminUser>('adminUsers', (data) => {
      if (data.length > 0) {
        const uniqueAdmins = deduplicateAndSyncAdmins(data);
        setAdminUsers(uniqueAdmins);
        // Live session sync: update currentAdminUser permissions or force instant logout
        // if account was suspended, deleted, or sessionVersion was incremented (e.g. Freeze / 2FA reset)
        setCurrentAdminUser((prevUser) => {
          if (!prevUser) return null;
          const updatedSelf = uniqueAdmins.find(
            (u) =>
              u.id === prevUser.id ||
              normalizeAdminKey(u.username) === normalizeAdminKey(prevUser.username) ||
              (u.email && prevUser.email && normalizeAdminKey(u.email) === normalizeAdminKey(prevUser.email))
          );

          const isOwner = Boolean(
            prevUser.isSuperAdminOwner || isSuperAdminGoogleEmail(prevUser.email || prevUser.username)
          );

          if (!updatedSelf && !isOwner) {
            superAdmin2faVerifiedRef.current = false;
            auth.signOut().catch(() => {});
            setAdminLoggedIn(false);
            setPendingSuperAdmin2FA(null);
            setAuthGateNotice('تم حذف حسابك أو إنهاء جلستك من قِبل المالك الرئيسي للنظام.');
            return null;
          }

          if (!updatedSelf) return prevUser;

          const prevVer = prevUser.sessionVersion || 1;
          const nextVer = updatedSelf.sessionVersion || 1;
          if (!isOwner && (updatedSelf.status === 'suspended' || nextVer > prevVer)) {
            superAdmin2faVerifiedRef.current = false;
            auth.signOut().catch(() => {});
            setAdminLoggedIn(false);
            setPendingSuperAdmin2FA(null);
            setAuthGateNotice(
              updatedSelf.status === 'suspended'
                ? 'تم تجميد وإيقاف حسابك فوراً من قِبل المالك الرئيسي للنظام وتم تسجيل خروجك تلقائياً.'
                : 'تم إنهاء جلستك النشطة من قِبل المالك الرئيسي (إعادة تعيين المصادقة أو تحديث أمني). يرجى تسجيل الدخول مجدداً.'
            );
            return null;
          }
          return updatedSelf;
        });
      }
    });
    const unsubFeedback = subscribeToCollection<PilgrimFeedback>('feedback', (data) => {
      setFeedback(
        data.sort((a, b) =>
          String(typeof b.createdAt === 'string' ? b.createdAt : '').localeCompare(
            String(typeof a.createdAt === 'string' ? a.createdAt : '')
          )
        )
      );
    });
    const unsubNotifications = subscribeToCollection<NotificationItem>('notifications', (data) => {
      setNotifications(
        data.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      );
    });

    return () => {
      unsubAdmins();
      unsubFeedback();
      unsubNotifications();
    };
  }, [adminLoggedIn]);

  // Periodic background dispatcher for scheduled notifications when admin is active
  useEffect(() => {
    if (!adminLoggedIn || notifications.length === 0 || pilgrims.length === 0) return;

    const checkScheduled = () => {
      processDueScheduledNotifications(notifications, pilgrims).catch(() => {});
    };
    checkScheduled();
    const timer = setInterval(checkScheduled, 30000);
    return () => clearInterval(timer);
  }, [adminLoggedIn, notifications, pilgrims]);

  // Safe Admin Session Verification & Background Media Cleanup (Never overwrites existing packages/settings)
  useEffect(() => {
    const isMaster = isGeneralAdminUser(currentAdminUser) || isMasterAdminAlias(currentAdminUser?.username);

    if (adminLoggedIn && currentAdminUser && !isMaster) {
      setLoading(false);
      return;
    }

    if (!adminLoggedIn) {
      const timer = setTimeout(() => setLoading(false), 350);
      return () => clearTimeout(timer);
    }

    if (!isMaster) return;

    const verifyAdminAndOptimizeStorage = async () => {
      try {
        await ensureSystemSeededOnce({
          defaultPackages,
          defaultAnnouncements,
          defaultCampaignSettings,
          initialAdminUsers,
        });

        const existingAdmins = await getDocuments<AdminUser>('adminUsers');
        if (existingAdmins.length > 0) {
          deduplicateAndSyncAdmins(existingAdmins);
        }

        // Run background media audit to migrate any legacy Base64 fields to Storage URLs & clean orphans
        runMediaStorageAuditAndCleanup().catch(() => {});
      } catch (e) {
        console.warn('Admin verification notice:', e);
      } finally {
        setLoading(false);
      }
    };
    verifyAdminAndOptimizeStorage();
  }, [adminLoggedIn, currentAdminUser]);

  const getActorMeta = () => ({
    adminId: currentAdminUser?.id || auth.currentUser?.uid || 'admin',
    adminName: currentAdminUser?.fullName || auth.currentUser?.displayName || 'المدير العام',
    username: currentAdminUser?.username || auth.currentUser?.email || 'admin',
    userRole: currentAdminUser?.role || 'مدير عام (Master Admin)',
  });

  const handleAddPilgrim = async (newPilgrim: Pilgrim) => {
    const pSeasonYear = extractHijriYear(newPilgrim.seasonYear || newPilgrim.hajjYear || activeSeasonYear);
    const enriched: Pilgrim = {
      ...newPilgrim,
      seasonYear: pSeasonYear,
      hajjYear: newPilgrim.hajjYear || pSeasonYear,
      season: newPilgrim.season || `موسم حج ${pSeasonYear}هـ`,
    };
    await setDocument('pilgrims', enriched.id, enriched);
    linkEntityToSeason({
      seasonIdOrYear: pSeasonYear,
      entityType: 'pilgrim',
      entityId: enriched.id,
      note: `تسجيل الحاج: ${enriched.firstName} ${enriched.lastName}`,
    }).catch(() => {});
    await recordActivityLog({
      adminId: enriched.nationalId || enriched.id,
      adminName: `${enriched.firstName} ${enriched.secondName || ''} ${enriched.lastName}`.replace(/\s+/g, ' ').trim(),
      username: enriched.mobile || enriched.nationalId,
      userRole: 'حاج (تسجيل جديد)',
      category: 'بوابة الحاج والتسجيل',
      action: 'تسجيل طلب التحاق جديد بالقافلة',
      target: `الحاج: ${enriched.firstName} ${enriched.lastName} — الهوية: ${enriched.nationalId}`,
      details: `الموسم: ${enriched.season} | الباقة: ${enriched.selectedPackage || 'غير محدد'} | رقم المرجع: #${enriched.registrationReference}`,
    });
  };

  const handleUpdatePilgrim = async (updated: Pilgrim) => {
    const prev = pilgrims.find(p => p.id === updated.id);
    const enriched: Pilgrim = {
      ...updated,
      seasonYear: updated.seasonYear || '1448',
      hajjYear: updated.hajjYear || '1448',
      season: updated.season || 'موسم حج 1448هـ',
    };
    await updateDocument('pilgrims', enriched.id, enriched);

    const changes: string[] = [];
    if (prev && prev.status !== updated.status) {
      if (updated.status === 'مرفوض') {
        const reason = updated.rejectionReason || updated.statusNotes;
        changes.push(`رفض طلب التسجيل${reason ? ` (السبب: ${reason})` : ''}`);
      } else {
        changes.push(`تغيير الحالة من (${prev.status}) إلى (${updated.status})`);
      }
    } else if (updated.status === 'مرفوض' && prev && (prev.rejectionReason || '') !== (updated.rejectionReason || '')) {
      changes.push(`تحديث سبب الرفض: ${updated.rejectionReason || 'غير محدد'}`);
    }
    if (prev && Boolean(prev.documentsReceived) !== Boolean(updated.documentsReceived)) {
      changes.push(updated.documentsReceived ? 'تأكيد استلام المستندات ✓' : 'إلغاء استلام المستندات');
    }
    if (prev && Boolean(prev.paymentReceived) !== Boolean(updated.paymentReceived)) {
      changes.push(updated.paymentReceived ? 'تأكيد استلام الدفعة المالية وإصدار العضوية ✓' : 'إلغاء تأكيد السداد');
    }
    if (prev && Boolean(prev.paymentApprovedByAdmin) !== Boolean(updated.paymentApprovedByAdmin)) {
      changes.push(
        updated.paymentApprovedByAdmin
          ? 'اعتماد سداد وزارة الحج من الإدارة ✓'
          : 'إلغاء اعتماد سداد وزارة الحج'
      );
    }
    if (prev && Number(prev.paidAmount || 0) !== Number(updated.paidAmount || 0)) {
      changes.push(
        `تعديل المبلغ المسدد من (${Number(prev.paidAmount || 0).toLocaleString('ar-SA')} ر.س) إلى (${Number(updated.paidAmount || 0).toLocaleString('ar-SA')} ر.س)`
      );
    }
    if (prev) {
      const prevInst = prev.paymentInstallments || [];
      const nextInst = updated.paymentInstallments || [];
      if (nextInst.length > prevInst.length) {
        const added = nextInst[nextInst.length - 1];
        changes.push(`إضافة دفعة مالية جديدة (${added?.amount || 0} ر.س)`);
      } else if (nextInst.length < prevInst.length) {
        changes.push('حذف دفعة مالية مسجلة');
      } else if (JSON.stringify(prevInst) !== JSON.stringify(nextInst)) {
        changes.push('تعديل بيانات دفعة مالية مسجلة');
      }
    }
    if (prev && Boolean(prev.isDeleted) !== Boolean(updated.isDeleted)) {
      changes.push(updated.isDeleted ? 'نقل سجل الحجز/الحاج إلى سلة المحذوفات' : 'استعادة سجل الحاج من المحذوفات');
    }
    if (prev && (prev.selectedPackage || '') !== (updated.selectedPackage || '')) {
      changes.push(`تعديل الباقة إلى (${updated.selectedPackage || 'التسجيل العام'})`);
    }
    if (prev && prev.transport !== updated.transport) {
      changes.push(`تعديل المواصلات إلى (${updated.transport})`);
    }
    if (prev && prev.hajjType !== updated.hajjType) {
      changes.push(`تعديل نوع النسك إلى (${updated.hajjType})`);
    }
    if (
      prev &&
      (`${prev.firstName} ${prev.secondName} ${prev.thirdName} ${prev.lastName}` !==
        `${updated.firstName} ${updated.secondName} ${updated.thirdName} ${updated.lastName}` ||
        prev.nationalId !== updated.nationalId ||
        prev.mobile !== updated.mobile)
    ) {
      changes.push('تعديل البيانات الشخصية/الهوية/الجوال');
    }
    if (prev && ((prev.roomNumberMakkah || prev.roomNumber || '') !== (updated.roomNumberMakkah || updated.roomNumber || ''))) {
      changes.push(`سكن مكة: ${updated.roomNumberMakkah || updated.roomNumber || 'غير محدد'}`);
    }
    if (prev && ((prev.roomNumberMadinah || '') !== (updated.roomNumberMadinah || ''))) {
      changes.push(`سكن المدينة: ${updated.roomNumberMadinah || 'غير محدد'}`);
    }
    if (prev && ((prev.roomNumberMina || '') !== (updated.roomNumberMina || ''))) {
      changes.push(`تسكين منى: ${updated.roomNumberMina || 'غير محدد'}`);
    }
    if (prev && (prev.busNumber || '') !== (updated.busNumber || '')) {
      changes.push(`تخصيص الباص: ${updated.busNumber || 'غير مخصص'}`);
    }
    if (prev && prev.busSeat !== updated.busSeat) {
      changes.push(`مقعد الباص/الرحلة: ${updated.busSeat || 'غير محدد'}`);
    }
    if (
      prev &&
      ((prev.flightNumberOutbound || '') !== (updated.flightNumberOutbound || '') ||
        (prev.flightNumberReturn || '') !== (updated.flightNumberReturn || '') ||
        (prev.flightTicketNumber || '') !== (updated.flightTicketNumber || ''))
    ) {
      changes.push(`تحديث بيانات رحلة الطيران (${updated.flightNumberOutbound || '—'} / ${updated.flightNumberReturn || '—'})`);
    }

    const rejectionSummary =
      updated.status === 'مرفوض' && (updated.rejectionReason || updated.statusNotes)
        ? ` | سبب الرفض: ${updated.rejectionReason || updated.statusNotes}`
        : '';

    const isFinancialChange = changes.some(
      (c) => c.includes('المالية') || c.includes('المبلغ') || c.includes('دفعة') || c.includes('السداد') || c.includes('سداد')
    );
    const isDestructiveChange =
      Boolean(updated.isDeleted && !prev?.isDeleted) ||
      updated.status === 'محذوف' ||
      changes.some((c) => c.includes('حذف'));

    await recordActivityLog({
      ...getActorMeta(),
      category: isFinancialChange ? 'المالية والإيصالات' : 'إدارة الحجاج',
      severity: isDestructiveChange ? 'warning' : 'info',
      action: changes.length > 0 ? changes.join(' + ') : 'تحديث بيانات وطلب حاج مسجل',
      target: `الحاج: ${updated.firstName} ${updated.lastName} (${updated.nationalId})`,
      details: `الحالة: ${updated.status}${rejectionSummary} | الباقة: ${updated.selectedPackage || 'التسجيل العام'} | سكن مكة: ${updated.roomNumberMakkah || updated.roomNumber || '—'} | سكن المدينة: ${updated.roomNumberMadinah || '—'} | تسكين منى: ${updated.roomNumberMina || '—'} | الباص: ${updated.busNumber || '—'} | الطيران: ${updated.flightNumberOutbound || '—'}`,
    });
  };

  const handleDeletePilgrim = async (id: string) => {
    const target = pilgrims.find(p => p.id === id);
    await removeDocument('pilgrims', id);
    await recordActivityLog({
      ...getActorMeta(),
      category: 'إدارة الحجاج',
      severity: 'critical',
      action: 'حذف نهائي لسجل حجز/حاج من النظام',
      target: target ? `الحاج: ${target.firstName} ${target.lastName} (${target.nationalId})` : `معرف السجل: ${id}`,
      details: target ? `الباقة: ${target.selectedPackage || '—'} | الجوال: ${target.mobile || '—'} | المرجع: #${target.registrationReference || '—'}` : undefined,
    });
  };

  const handleAddPackage = async (pkg: HajjPackage): Promise<boolean> => {
    const pkgSeasonId = normalizeSeasonId(pkg.seasonId || pkg.seasonYear || activeSeasonId);
    const enrichedPkg: HajjPackage = {
      ...pkg,
      seasonId: pkgSeasonId,
      seasonYear: extractHijriYear(pkg.seasonYear || pkgSeasonId),
    };
    const res = await setDocument('packages', enrichedPkg.id, enrichedPkg);
    if (!res.confirmed) return false;
    linkEntityToSeason({
      seasonIdOrYear: pkgSeasonId,
      entityType: 'package',
      entityId: enrichedPkg.id,
      note: `إضافة باقة: ${enrichedPkg.title}`,
      actorName: getActorMeta().adminName,
    }).catch(() => {});
    await recordActivityLog({
      ...getActorMeta(),
      category: 'الباقات والإعلانات',
      action: 'إضافة باقة حج/عمرة جديدة',
      target: `${enrichedPkg.title} (${enrichedPkg.price})`,
      details: `النوع: ${enrichedPkg.type} | المواصلات: ${enrichedPkg.transport}`,
    });
    return true;
  };

  const handleUpdatePackage = async (updated: HajjPackage): Promise<boolean> => {
    const prev = packages.find((p) => p.id === updated.id);
    const pkgSeasonId = normalizeSeasonId(updated.seasonId || updated.seasonYear || activeSeasonId);
    const enrichedPkg: HajjPackage = {
      ...updated,
      seasonId: pkgSeasonId,
      seasonYear: extractHijriYear(updated.seasonYear || pkgSeasonId),
    };
    const res = await updateDocument('packages', enrichedPkg.id, enrichedPkg);
    if (!res.confirmed) return false;

    if (prev?.image && enrichedPkg.image && prev.image !== enrichedPkg.image) {
      const { unlinkAndCleanupMediaIfUnused } = await import('./lib/mediaManager');
      unlinkAndCleanupMediaIfUnused(prev.mediaAssetId || prev.image, `packages/${enrichedPkg.id}`, pkgSeasonId).catch(() => {});
    }
    linkEntityToSeason({
      seasonIdOrYear: pkgSeasonId,
      entityType: 'package',
      entityId: enrichedPkg.id,
      note: `تحديث باقة: ${enrichedPkg.title}`,
      actorName: getActorMeta().adminName,
    }).catch(() => {});

    await recordActivityLog({
      ...getActorMeta(),
      category: 'الباقات والإعلانات',
      action: 'تعديل تفاصيل أو سعر باقة',
      target: `${enrichedPkg.title} — السعر: ${enrichedPkg.price}`,
      details: `النوع: ${enrichedPkg.type} | السكن بمكة: ${enrichedPkg.accommodationMakkah}`,
    });
    return true;
  };

  const handleDeletePackage = async (id: string): Promise<boolean> => {
    const pkg = packages.find((p) => p.id === id);
    const ok = await removeDocument('packages', id);
    if (!ok) return false;

    const pkgSeasonId = normalizeSeasonId(pkg?.seasonId || pkg?.seasonYear || activeSeasonId);
    if (pkg?.image) {
      const { unlinkAndCleanupMediaIfUnused } = await import('./lib/mediaManager');
      unlinkAndCleanupMediaIfUnused(pkg.mediaAssetId || pkg.image, `packages/${id}`, pkgSeasonId).catch(() => {});
    }
    unlinkEntityFromSeason({
      seasonIdOrYear: pkgSeasonId,
      entityType: 'package',
      entityId: id,
      note: `حذف باقة: ${pkg?.title || id}`,
      actorName: getActorMeta().adminName,
    }).catch(() => {});

    await recordActivityLog({
      ...getActorMeta(),
      category: 'الباقات والإعلانات',
      action: 'حذف باقة من قائمة الباقات',
      target: pkg ? pkg.title : id,
    });
    return true;
  };

  const handleAddAnnouncement = async (ann: Announcement): Promise<boolean> => {
    const annSeasonId = normalizeSeasonId(ann.seasonId || ann.seasonYear || activeSeasonId);
    const enrichedAnn: Announcement = {
      ...ann,
      seasonId: annSeasonId,
      seasonYear: extractHijriYear(ann.seasonYear || annSeasonId),
    };
    const res = await setDocument('announcements', enrichedAnn.id, enrichedAnn);
    if (!res.confirmed) return false;
    linkEntityToSeason({
      seasonIdOrYear: annSeasonId,
      entityType: 'announcement',
      entityId: enrichedAnn.id,
      note: `نشر تعميم: ${enrichedAnn.title}`,
      actorName: getActorMeta().adminName,
    }).catch(() => {});
    await recordActivityLog({
      ...getActorMeta(),
      category: 'الباقات والإعلانات',
      action: `نشر إعلان أو درس جديد (${enrichedAnn.category})`,
      target: enrichedAnn.title,
      details: enrichedAnn.content.slice(0, 120),
    });
    return true;
  };

  const handleUpdateAnnouncement = async (updated: Announcement): Promise<boolean> => {
    const prev = announcements.find((a) => a.id === updated.id);
    const annSeasonId = normalizeSeasonId(updated.seasonId || updated.seasonYear || activeSeasonId);
    const enrichedAnn: Announcement = {
      ...updated,
      seasonId: annSeasonId,
      seasonYear: extractHijriYear(updated.seasonYear || annSeasonId),
    };
    const res = await updateDocument('announcements', enrichedAnn.id, enrichedAnn);
    if (!res.confirmed) return false;

    if (prev?.imageUrl && prev.imageUrl !== enrichedAnn.imageUrl) {
      const { unlinkAndCleanupMediaIfUnused } = await import('./lib/mediaManager');
      unlinkAndCleanupMediaIfUnused(prev.imageAssetId || prev.imageUrl, `announcements/${enrichedAnn.id}`, annSeasonId).catch(() => {});
    }
    if (prev?.videoUrl && prev.videoUrl !== enrichedAnn.videoUrl) {
      const { unlinkAndCleanupMediaIfUnused } = await import('./lib/mediaManager');
      unlinkAndCleanupMediaIfUnused(prev.videoAssetId || prev.videoUrl, `announcements/${enrichedAnn.id}`, annSeasonId).catch(() => {});
    }

    await recordActivityLog({
      ...getActorMeta(),
      category: 'الباقات والإعلانات',
      action: `تعديل إعلان أو درس (${enrichedAnn.category})`,
      target: enrichedAnn.title,
    });
    return true;
  };

  const handleDeleteAnnouncement = async (id: string): Promise<boolean> => {
    const ann = announcements.find((a) => a.id === id);
    const ok = await removeDocument('announcements', id);
    if (!ok) return false;

    const annSeasonId = normalizeSeasonId(ann?.seasonId || ann?.seasonYear || activeSeasonId);
    if (ann?.imageUrl || ann?.videoUrl) {
      const { unlinkAndCleanupMediaIfUnused } = await import('./lib/mediaManager');
      if (ann.imageUrl) unlinkAndCleanupMediaIfUnused(ann.imageAssetId || ann.imageUrl, `announcements/${id}`, annSeasonId).catch(() => {});
      if (ann.videoUrl) unlinkAndCleanupMediaIfUnused(ann.videoAssetId || ann.videoUrl, `announcements/${id}`, annSeasonId).catch(() => {});
    }
    unlinkEntityFromSeason({
      seasonIdOrYear: annSeasonId,
      entityType: 'announcement',
      entityId: id,
      note: `حذف تعميم: ${ann?.title || id}`,
      actorName: getActorMeta().adminName,
    }).catch(() => {});

    await recordActivityLog({
      ...getActorMeta(),
      category: 'الباقات والإعلانات',
      action: 'حذف إعلان أو درس',
      target: ann ? ann.title : id,
    });
    return true;
  };

  const handleAddAdminUser = async (user: AdminUser) => {
    const cleanUsername = normalizeAdminKey(user.username);
    const cleanName = (user.fullName || '').trim().replace(/\s+/g, ' ');

    // Check against both Firestore and local state (with Firestore first) to guarantee zero duplicates
    const currentDbAdmins = await getDocuments<AdminUser>('adminUsers', { bypassCache: true });
    const allKnown = [...currentDbAdmins, ...adminUsers];
    const duplicate = allKnown.find(
      (existing) =>
        normalizeAdminKey(existing.username) === cleanUsername ||
        (isMasterAdminAlias(cleanUsername) && isMasterAdminAlias(existing.username)) ||
        existing.fullName.trim().replace(/\s+/g, ' ').toLowerCase() === cleanName.toLowerCase()
    );

    if (duplicate) {
      // Do not create a second user document; update the existing one instead
      const merged: AdminUser = {
        ...duplicate,
        ...user,
        id: duplicate.id,
        username: duplicate.username,
        fullName: cleanName || duplicate.fullName,
      };
      await updateDocument('adminUsers', duplicate.id, merged, { forceWrite: true });
      return;
    }

    const sanitizedUser: AdminUser = {
      ...user,
      username: cleanUsername,
      fullName: cleanName,
    };

    await setDocument('adminUsers', sanitizedUser.id, sanitizedUser, { forceWrite: true });
    await recordActivityLog({
      ...getActorMeta(),
      category: 'المشرفين والإعدادات',
      action: 'إنشاء حساب مشرف إداري جديد',
      target: `${sanitizedUser.fullName} (${sanitizedUser.username})`,
      details: `الدور الوظيفي: ${sanitizedUser.role}`,
    });
  };

  const handleUpdateAdminUser = async (updated: AdminUser) => {
    const cleanUsername = normalizeAdminKey(updated.username);
    const cleanLocal = cleanUsername.split('@')[0] || '';
    const cleanName = (updated.fullName || '').trim().replace(/\s+/g, ' ');

    const currentDbAdmins = await getDocuments<AdminUser>('adminUsers', { bypassCache: true });

    const sanitizedUpdate: AdminUser = {
      ...updated,
      username: cleanUsername || updated.username,
      fullName: cleanName || updated.fullName,
    };

    // Always forceWrite so PIN and permission updates immediately persist to Firestore
    await updateDocument('adminUsers', sanitizedUpdate.id, sanitizedUpdate, { forceWrite: true });

    // Also sync PIN if there is any other record in Firestore belonging to the same user / Master Admin alias
    const isMasterTarget =
      sanitizedUpdate.id === 'usr-1' ||
      isMasterAdminAlias(cleanUsername) ||
      cleanLocal === 'admin' ||
      cleanLocal === 'alahsaey' ||
      cleanLocal === 'alqaemhajj313';

    for (const dbDoc of currentDbAdmins) {
      if (!dbDoc || dbDoc.id === sanitizedUpdate.id) continue;
      const dbNorm = normalizeAdminKey(dbDoc.username);
      const dbLocal = dbNorm.split('@')[0] || '';
      const isSameUserOrMaster =
        dbNorm === cleanUsername ||
        (cleanLocal && dbLocal === cleanLocal) ||
        (isMasterTarget &&
          (dbDoc.id === 'usr-1' ||
            isMasterAdminAlias(dbNorm) ||
            dbLocal === 'admin' ||
            dbLocal === 'alahsaey' ||
            dbLocal === 'alqaemhajj313'));
      if (isSameUserOrMaster && dbDoc.pin !== sanitizedUpdate.pin) {
        await updateDocument(
          'adminUsers',
          dbDoc.id,
          { ...dbDoc, pin: sanitizedUpdate.pin },
          { forceWrite: true }
        );
      }
    }

    setAdminUsers((prev) => {
      const exists = prev.some((u) => u.id === sanitizedUpdate.id);
      if (!exists) return [sanitizedUpdate, ...prev];
      return prev.map((u) => {
        if (u.id === sanitizedUpdate.id) return sanitizedUpdate;
        const uNorm = normalizeAdminKey(u.username);
        const uLocal = uNorm.split('@')[0] || '';
        if (
          uNorm === cleanUsername ||
          (cleanLocal && uLocal === cleanLocal) ||
          (isMasterTarget && (u.id === 'usr-1' || isMasterAdminAlias(uNorm) || uLocal === 'admin'))
        ) {
          return { ...u, pin: sanitizedUpdate.pin };
        }
        return u;
      });
    });

    await recordActivityLog({
      ...getActorMeta(),
      category: 'المشرفين والإعدادات',
      action: 'تعديل بيانات أو صلاحيات مشرف',
      target: `${sanitizedUpdate.fullName} (${sanitizedUpdate.username})`,
      details: `الدور الوظيفي: ${sanitizedUpdate.role}`,
    });
  };

  const handleDeleteAdminUser = async (id: string) => {
    const targetUser = adminUsers.find((u) => u.id === id);
    await removeDocument('adminUsers', id);
    await recordActivityLog({
      ...getActorMeta(),
      category: 'المشرفين والإعدادات',
      action: 'حذف حساب مشرف من النظام',
      target: targetUser ? `${targetUser.fullName} (${targetUser.username})` : id,
    });
  };

  const handleUpdateSettings = async (settings: CampaignSettings): Promise<boolean> => {
    const res = await setDocument('settings', 'campaign', settings);
    if (res.confirmed) {
      setCampaignSettings(settings);
      await recordActivityLog({
        ...getActorMeta(),
        category: 'المشرفين والإعدادات',
        action: 'تحديث إعدادات القافلة ونصوص الواجهة الرئيسية',
        target: `هاتف التواصل: ${settings.phone} | العنوان: ${settings.address}`,
      });
      return true;
    }
    // If client SDK write failed due to quota/network, attempt verified admin REST write via /api/settings/campaign
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => '');
      const resp = await fetchWithTimeout('/api/settings/campaign', {
        method: 'PUT',
        timeoutMs: 8000,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ data: settings }),
      });
      if (resp.ok) {
        setCampaignSettings(settings);
        return true;
      }
    } catch {
      // fall through
    }
    return false;
  };

  const handleAuthGateSuccess = (
    user: AdminUser,
    method: AdminAuthMethod
  ) => {
    if (
      method === 'google' ||
      method === 'google_2fa' ||
      user.isSuperAdminOwner ||
      isSuperAdminGoogleEmail(user.email || user.username)
    ) {
      superAdmin2faVerifiedRef.current = true;
    }
    setPendingSuperAdmin2FA(null);
    setAuthGateNotice('');
    setCurrentAdminUser(user);
    setAdminLoggedIn(true);
  };

  const handleCancelPendingSuperAdmin2FA = async () => {
    superAdmin2faVerifiedRef.current = false;
    setPendingSuperAdmin2FA(null);
    try {
      await auth.signOut();
    } catch {
      // ignore
    }
  };

  const handleAdminLogout = async () => {
    if (currentAdminUser) {
      await recordActivityLog({
        ...getActorMeta(),
        category: 'تسجيل دخول / خروج',
        action: 'تسجيل خروج من الحساب (القائمة الرئيسية)',
        target: `${currentAdminUser.fullName} (${currentAdminUser.username})`,
      });
    }
    superAdmin2faVerifiedRef.current = false;
    setPendingSuperAdmin2FA(null);
    try {
      await auth.signOut();
    } catch (e) {
      console.error('Logout error:', e);
    }
    // Clear sensitive admin session states immediately
    setFeedback([]);
    setAdminLoggedIn(false);
    setCurrentAdminUser(null);
    setAdminSubTab('dashboard');
    setCurrentView('home');
    // Replace history state so pressing Back cannot re-enter protected admin pages
    window.history.replaceState({ appView: 'home', loggedOut: true }, '', window.location.pathname);
  };

  const pilgrimStatsBreakdown = calculatePilgrimStatsBreakdown(pilgrims, campaignSettings);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F1F5F9] dark:bg-slate-950 flex items-center justify-center transition-colors duration-200">
        <div className="w-12 h-12 border-4 border-amber-600 dark:border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-clip bg-[#F1F5F9] dark:bg-slate-950 text-[#0F172A] dark:text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950 transition-colors duration-200">
      {mapsQuotaExceeded && (
        <div
          dir="ltr"
          className="bg-amber-50 border-b border-amber-300 text-amber-950 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm"
        >
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        adminLoggedIn={adminLoggedIn}
        currentAdminUser={currentAdminUser}
        campaignSettings={campaignSettings}
        packages={packages}
        guideSubTab={guideSubTab}
        onSelectGuideSubTab={(tab) => setGuideSubTab(tab)}
        adminSubTab={adminSubTab}
        onSelectAdminSubTab={(tab) => setAdminSubTab(tab)}
        highlightedPackageId={highlightedPackageId}
        onSelectPackageHighlight={(pkgId) => setHighlightedPackageId(pkgId)}
        onLogout={handleAdminLogout}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {(syncState.status === 'offline' || (syncState.status === 'error' && syncState.lastError)) && (
        <div
          dir="rtl"
          className={`px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 border-b ${
            syncState.status === 'offline'
              ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-300'
              : 'bg-rose-50 dark:bg-rose-500/15 border-rose-300 dark:border-rose-500/30 text-rose-900 dark:text-rose-300'
          }`}
        >
          {syncState.status === 'offline' ? (
            <>
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>الاتصال بالإنترنت متوقف حالياً — يتم عرض البيانات المخبأة ولن تُحفظ التعديلات على السحابة حتى عودة الاتصال.</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{syncState.lastError}</span>
            </>
          )}
        </div>
      )}

      <main className="flex-1">
        {currentView === 'home' && (
          <Home
            setCurrentView={setCurrentView}
            pilgrimCount={pilgrimStatsBreakdown.totalPilgrims}
            pilgrims={pilgrims}
            announcements={announcements}
            packages={packages}
            campaignSettings={campaignSettings}
            onSelectPackageForRegistration={(pkgTitle) => setSelectedPackageForReg(pkgTitle)}
          />
        )}
        {currentView === 'register' && (
          <RegistrationForm
            onAddPilgrim={handleAddPilgrim}
            onSuccessNavigate={() => setCurrentView('portal')}
            selectedPackage={selectedPackageForReg}
            onSelectPackage={(pkgTitle) => setSelectedPackageForReg(pkgTitle)}
            onNavigateToPackages={() => setCurrentView('packages')}
            packages={packages}
            campaignSettings={campaignSettings}
            pilgrims={pilgrims}
            dynamicForms={dynamicForms}
          />
        )}
        {currentView === 'portal' && (
          <PilgrimPortal
            pilgrims={pilgrims}
            packages={packages}
            campaignSettings={campaignSettings}
          />
        )}
        {currentView === 'packages' && (
          <PackagesView
            setCurrentView={setCurrentView}
            packages={packages}
            pilgrims={pilgrims}
            onSelectPackageForRegistration={(pkgTitle) => setSelectedPackageForReg(pkgTitle)}
            externalHighlightedPkgId={highlightedPackageId}
          />
        )}
        {currentView === 'guide' && (
          <GuideView
            campaignSettings={campaignSettings}
            initialTab={guideSubTab}
            onNavigateToPortal={() => setCurrentView('portal')}
          />
        )}
        {currentView === 'ai-advisor' && (
          <AiAdvisor
            announcements={announcements}
            packages={packages}
            pilgrims={pilgrims}
            campaignSettings={campaignSettings}
          />
        )}
        {currentView === 'contact' && <ContactView campaignSettings={campaignSettings} />}
        {currentView === 'admin' && (
          <AdminDashboard
            pilgrims={pilgrims}
            packages={packages}
            announcements={announcements}
            notifications={notifications}
            seasons={seasons}
            dynamicForms={dynamicForms}
            adminUsers={adminUsers}
            feedback={feedback}
            currentAdminUser={currentAdminUser}
            campaignSettings={campaignSettings}
            onAddPilgrim={handleAddPilgrim}
            onUpdatePilgrim={handleUpdatePilgrim}
            onDeletePilgrim={handleDeletePilgrim}
            onAddPackage={handleAddPackage}
            onUpdatePackage={handleUpdatePackage}
            onDeletePackage={handleDeletePackage}
            onAddAnnouncement={handleAddAnnouncement}
            onUpdateAnnouncement={handleUpdateAnnouncement}
            onDeleteAnnouncement={handleDeleteAnnouncement}
            onAddAdminUser={handleAddAdminUser}
            onUpdateAdminUser={handleUpdateAdminUser}
            onDeleteAdminUser={handleDeleteAdminUser}
            onUpdateCampaignSettings={handleUpdateSettings}
            adminLoggedIn={adminLoggedIn}
            setAdminLoggedIn={setAdminLoggedIn}
            setCurrentAdminUser={setCurrentAdminUser}
            pendingSuperAdmin2FA={pendingSuperAdmin2FA}
            authGateNotice={authGateNotice}
            onClearAuthGateNotice={() => setAuthGateNotice('')}
            onCancelPendingSuperAdmin2FA={handleCancelPendingSuperAdmin2FA}
            onAuthGateSuccess={handleAuthGateSuccess}
            externalActiveTab={adminSubTab}
            onActiveTabChange={(tab) => setAdminSubTab(tab)}
            onRefreshData={refreshAllData}
          />
        )}

        <PWAInstallButton variant="floating" />
      </main>

      {/* Public Footer - Hidden inside the Admin Dashboard to keep admin workspace clean */}
      {currentView !== 'admin' && (
        <Footer setCurrentView={setCurrentView} campaignSettings={campaignSettings} />
      )}
    </div>
  );
}
