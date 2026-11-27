import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  X,
  Shield,
  Phone,
  UserCheck,
  Users,
  Calendar,
  BookOpen,
  Sparkles,
  Home as HomeIcon,
  Package,
  Share2,
  ChevronDown,
  CornerDownLeft,
  Bus,
  Plane,
  Hotel,
  HeartPulse,
  CreditCard,
  Settings,
  BarChart3,
  Megaphone,
  Compass,
  CheckSquare,
  FileText,
  UserPlus,
  Lock,
  LogOut,
  Bell,
  Sun,
  Moon,
} from 'lucide-react';
import { CampaignSettings, HajjPackage, AdminUser } from '../types';
import { PWAInstallButton } from './pwa/PWAInstallButton';
import { isGeneralAdminUser, isSuperAdminUser, canPerformOperation, normalizeOfficialRole } from '../utils/rbac';
import { useOnlinePresence } from '../utils/presence';
import { getActiveSocialLinks, SocialPlatformIcon } from './common/SocialMediaConfig';
import { SharePortalModal } from './common/SharePortalModal';

export type GuideTabId = 'all' | 'day1' | 'day2' | 'day3' | 'day4' | 'day5' | 'checklist';

interface SubMenuItem {
  id: string;
  label: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  onSelect: () => void;
}

interface MainMenuItem {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  onMainSelect: () => void;
  subItems?: SubMenuItem[];
}

interface NavbarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  adminLoggedIn: boolean;
  currentAdminUser?: AdminUser | null;
  campaignSettings: CampaignSettings;
  packages?: HajjPackage[];
  guideSubTab?: GuideTabId;
  onSelectGuideSubTab?: (tab: GuideTabId) => void;
  adminSubTab?: string;
  onSelectAdminSubTab?: (tab: string) => void;
  highlightedPackageId?: string | null;
  onSelectPackageHighlight?: (pkgId: string | null) => void;
  onLogout?: () => Promise<void> | void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  adminLoggedIn,
  currentAdminUser,
  campaignSettings,
  packages = [],
  guideSubTab = 'all',
  onSelectGuideSubTab,
  adminSubTab = 'dashboard',
  onSelectAdminSubTab,
  highlightedPackageId = null,
  onSelectPackageHighlight,
  onLogout,
  theme = 'dark',
  onToggleTheme,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedMobileMenuId, setExpandedMobileMenuId] = useState<string | null>(null);
  const [openDesktopDropdownId, setOpenDesktopDropdownId] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLogoutConfirmModal, setShowLogoutConfirmModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showPresencePopover, setShowPresencePopover] = useState(false);
  const { activeAdmins } = useOnlinePresence(adminLoggedIn, currentAdminUser);
  const desktopNavRef = useRef<HTMLElement | null>(null);
  const desktopPresenceRef = useRef<HTMLDivElement | null>(null);
  const mobilePresenceRef = useRef<HTMLDivElement | null>(null);
  const closeDropdownTimerRef = useRef<number | null>(null);

  const handleConfirmLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await onLogout?.();
    } finally {
      setIsLoggingOut(false);
      setShowLogoutConfirmModal(false);
      setMobileMenuOpen(false);
      setOpenDesktopDropdownId(null);
      setShowPresencePopover(false);
    }
  };

  const handleShareSite = () => {
    setMobileMenuOpen(false);
    setOpenDesktopDropdownId(null);
    setShowShareModal(true);
  };

  // Lock background page scroll when mobile navigation drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [mobileMenuOpen]);

  // Automatically sync expanded mobile accordion with the active view when opening the drawer
  useEffect(() => {
    if (mobileMenuOpen) {
      if (['packages', 'portal', 'guide', 'admin'].includes(currentView)) {
        setExpandedMobileMenuId(currentView);
      } else {
        setExpandedMobileMenuId(null);
      }
    }
  }, [mobileMenuOpen, currentView]);

  // Close mobile menu, desktop dropdowns, and presence popover on Escape key or outside click
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLogoutConfirmModal) {
          setShowLogoutConfirmModal(false);
          return;
        }
        setMobileMenuOpen(false);
        setOpenDesktopDropdownId(null);
        setShowPresencePopover(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (desktopNavRef.current && !desktopNavRef.current.contains(target)) {
        setOpenDesktopDropdownId(null);
      }
      const inDesktopPresence = desktopPresenceRef.current?.contains(target);
      const inMobilePresence = mobilePresenceRef.current?.contains(target);
      if (!inDesktopPresence && !inMobilePresence) {
        setShowPresencePopover(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showLogoutConfirmModal]);

  // Determine admin user permissions for dynamic admin sub-menus
  const roleTemplates = campaignSettings.rolePermissionTemplates;
  const isMasterAdmin = isGeneralAdminUser(currentAdminUser);
  const canManagePilgrims = Boolean(
    isMasterAdmin ||
      canPerformOperation(currentAdminUser, 'pilgrims', 'view', roleTemplates) ||
      canPerformOperation(currentAdminUser, 'housing_transport', 'view', roleTemplates) ||
      currentAdminUser?.permissions?.managePilgrims
  );
  const canManageReligious = Boolean(
    isMasterAdmin ||
      canPerformOperation(currentAdminUser, 'religious', 'view', roleTemplates) ||
      currentAdminUser?.permissions?.manageReligiousGuide ||
      normalizeOfficialRole(currentAdminUser?.role) === 'الإشراف الديني'
  );
  const canManageAnnouncements = Boolean(
    isMasterAdmin ||
      canPerformOperation(currentAdminUser, 'cultural', 'view', roleTemplates) ||
      currentAdminUser?.permissions?.manageAnnouncements ||
      currentAdminUser?.permissions?.manageCultural ||
      normalizeOfficialRole(currentAdminUser?.role) === 'الإشراف الثقافي'
  );
  const canManageFinance = Boolean(
    isMasterAdmin ||
      canPerformOperation(currentAdminUser, 'finance', 'view', roleTemplates) ||
      canPerformOperation(currentAdminUser, 'packages', 'view', roleTemplates) ||
      currentAdminUser?.permissions?.manageFinance ||
      currentAdminUser?.permissions?.managePackages ||
      normalizeOfficialRole(currentAdminUser?.role) === 'الإشراف المالي'
  );

  // Build dynamic Admin sub-items strictly according to the logged-in supervisor's permissions
  const adminSubItems: SubMenuItem[] = [];
  if (adminLoggedIn) {
    adminSubItems.push({
      id: 'admin-dashboard',
      label: 'لوحة البيانات والإحصائيات',
      subtitle: 'الملخص العام والمؤشرات المباشرة',
      icon: BarChart3,
      isActive: currentView === 'admin' && adminSubTab === 'dashboard',
      onSelect: () => {
        onSelectAdminSubTab?.('dashboard');
        setCurrentView('admin');
      },
    });
    if (canManagePilgrims) {
      adminSubItems.push(
        {
          id: 'admin-pilgrims',
          label: 'سجل الحجاج',
          subtitle: 'كشف الحجاج المعتمدين والمستبعدين',
          icon: FileText,
          isActive: currentView === 'admin' && (adminSubTab === 'pilgrims' || adminSubTab === 'excluded'),
          onSelect: () => {
            onSelectAdminSubTab?.('pilgrims');
            setCurrentView('admin');
          },
        },
        {
          id: 'admin-buses',
          label: 'رحلات الحافلات',
          subtitle: 'إركاب الباصات وتوزيع المقاعد',
          icon: Bus,
          isActive: currentView === 'admin' && adminSubTab === 'busBoarding',
          onSelect: () => {
            onSelectAdminSubTab?.('busBoarding');
            setCurrentView('admin');
          },
        },
        {
          id: 'admin-flights',
          label: 'رحلات الطيران',
          subtitle: 'تذاكر السفر الجوي وأرقام الرحلات',
          icon: Plane,
          isActive: currentView === 'admin' && adminSubTab === 'flightsList',
          onSelect: () => {
            onSelectAdminSubTab?.('flightsList');
            setCurrentView('admin');
          },
        },
        {
          id: 'admin-housing',
          label: 'السكن والفنادق',
          subtitle: 'تسكين مكة والمدينة ومخيمات منى',
          icon: Hotel,
          isActive: currentView === 'admin' && adminSubTab === 'housingList',
          onSelect: () => {
            onSelectAdminSubTab?.('housingList');
            setCurrentView('admin');
          },
        },
        {
          id: 'admin-health',
          label: 'الحالات الصحية',
          subtitle: 'الرعاية الطبية والاحتياجات الخاصة',
          icon: HeartPulse,
          isActive: currentView === 'admin' && adminSubTab === 'healthList',
          onSelect: () => {
            onSelectAdminSubTab?.('healthList');
            setCurrentView('admin');
          },
        },
        {
          id: 'admin-companions',
          label: 'كشف المرافقين والمحارم',
          subtitle: 'العوائل والمرافقون وتخصيص التقارير',
          icon: Users,
          isActive: currentView === 'admin' && adminSubTab === 'companionsList',
          onSelect: () => {
            onSelectAdminSubTab?.('companionsList');
            setCurrentView('admin');
          },
        }
      );
    }
    if (canManageReligious) {
      adminSubItems.push(
        {
          id: 'admin-religious',
          label: 'الإرشاد الديني',
          subtitle: 'كشف المراجع وبرامج التوعية',
          icon: Compass,
          isActive: currentView === 'admin' && adminSubTab === 'marjiList',
          onSelect: () => {
            onSelectAdminSubTab?.('marjiList');
            setCurrentView('admin');
          },
        },
        {
          id: 'admin-manasik-guide',
          label: 'إدارة دليل المناسك (الإرشاد الديني)',
          subtitle: 'المراحل، المناسك التفاعلية، الأدعية والتنبيهات',
          icon: BookOpen,
          isActive:
            currentView === 'admin' &&
            (adminSubTab === 'manasikGuide' || adminSubTab === 'hajjTimeline'),
          onSelect: () => {
            onSelectAdminSubTab?.('manasikGuide');
            setCurrentView('admin');
          },
        }
      );
    }
    if (canManageAnnouncements || isMasterAdmin) {
      adminSubItems.push({
        id: 'admin-announcements',
        label: 'الإعلانات والدروس',
        subtitle: 'المستجدات والمرئيات وبث يوتيوب',
        icon: Megaphone,
        isActive: currentView === 'admin' && adminSubTab === 'announcements',
        onSelect: () => {
          onSelectAdminSubTab?.('announcements');
          setCurrentView('admin');
        },
      });
      adminSubItems.push({
        id: 'admin-notifications',
        label: 'إدارة الإشعارات',
        subtitle: 'بث الرسائل الفورية والمجدولة للحجاج',
        icon: Bell,
        isActive: currentView === 'admin' && adminSubTab === 'notifications',
        onSelect: () => {
          onSelectAdminSubTab?.('notifications');
          setCurrentView('admin');
        },
      });
    }
    if (canManageFinance) {
      adminSubItems.push({
        id: 'admin-finance',
        label: 'الإدارة المالية',
        subtitle: 'كشف المدفوعات وإدارة الباقات',
        icon: CreditCard,
        isActive: currentView === 'admin' && (adminSubTab === 'paymentsList' || adminSubTab === 'packages'),
        onSelect: () => {
          onSelectAdminSubTab?.('paymentsList');
          setCurrentView('admin');
        },
      });
    }
    adminSubItems.push({
      id: 'admin-knowledge-base',
      label: 'بنك المعلومات (قاعدة المعرفة)',
      subtitle: 'الإجابات المعتمدة وتغذية مرشد القائم الذكي',
      icon: BookOpen,
      isActive:
        currentView === 'admin' &&
        (adminSubTab === 'knowledgeBase' || adminSubTab === 'advisorManager'),
      onSelect: () => {
        onSelectAdminSubTab?.('knowledgeBase');
        setCurrentView('admin');
      },
    });
    adminSubItems.push({
      id: 'admin-settings',
      label: 'إعدادات القافلة',
      subtitle: isSuperAdminUser(currentAdminUser) ? 'الإعدادات والمشرفون وسجل التدقيق' : 'إعدادات القافلة والتواصل',
      icon: Settings,
      isActive:
        currentView === 'admin' &&
        (adminSubTab === 'settings' || adminSubTab === 'staff' || adminSubTab === 'activityLog'),
      onSelect: () => {
        onSelectAdminSubTab?.('settings');
        setCurrentView('admin');
      },
    });
  }

  // Build Packages Sub-Items from real packages data
  const packageSubItems: SubMenuItem[] = [
    {
      id: 'pkg-all',
      label: 'جميع باقات الحج والعمرة',
      subtitle: 'استعراض كافة الباقات والأسعار المتاحة',
      icon: Package,
      isActive: currentView === 'packages' && !highlightedPackageId,
      onSelect: () => {
        onSelectPackageHighlight?.(null);
        setCurrentView('packages');
      },
    },
    ...packages
      .filter((pkg) => pkg.showOnHomepage !== false)
      .slice(0, 4)
      .map((pkg) => {
        const isAir = (pkg.transport || '').includes('طيران') || (pkg.title || '').includes('طيران');
        return {
        id: `pkg-${pkg.id}`,
        label: pkg.title,
        subtitle: `${pkg.price} · ${pkg.transport}`,
        icon: isAir ? Plane : Bus,
        isActive: currentView === 'packages' && highlightedPackageId === pkg.id,
        onSelect: () => {
          onSelectPackageHighlight?.(pkg.id);
          setCurrentView('packages');
        },
      };
    }),
    {
      id: 'pkg-register',
      label: 'التسجيل والالتحاق بالقافلة',
      subtitle: 'تعبئة استمارة التسجيل الإلكتروني',
      icon: UserPlus,
      isActive: currentView === 'register',
      onSelect: () => {
        setCurrentView('register');
      },
    },
  ];

  // Build Pilgrim Portal Sub-Items
  const portalSubItems: SubMenuItem[] = [
    {
      id: 'portal-inquiry',
      label: 'الاستعلام عن حالة الطلب والقبول',
      subtitle: 'التحقق برقم الهوية ورقم التسجيل المرجعي',
      icon: UserCheck,
      isActive: currentView === 'portal',
      onSelect: () => setCurrentView('portal'),
    },
    {
      id: 'portal-receipt',
      label: 'رفع وإرفاق إيصال السداد',
      subtitle: 'تأكيد الدفعة المالية وإصدار العضوية',
      icon: CreditCard,
      isActive: false,
      onSelect: () => setCurrentView('portal'),
    },
    {
      id: 'portal-housing-transport',
      label: 'بيانات السكن والحافلة والطيران',
      subtitle: 'معرفة رقم الغرفة ومقعد الحافلة أو الرحلة',
      icon: Hotel,
      isActive: false,
      onSelect: () => setCurrentView('portal'),
    },
    {
      id: 'portal-manasik',
      label: 'متابعة مناسكي وأعمالي',
      subtitle: 'قائمة التحقق التفاعلية المحفوظة برقم الهوية',
      icon: CheckSquare,
      isActive: false,
      onSelect: () => setCurrentView('portal'),
    },
    {
      id: 'portal-new-register',
      label: 'تسجيل حاج جديد في القافلة',
      subtitle: 'الانتقال إلى نموذج التسجيل المباشر',
      icon: UserPlus,
      isActive: currentView === 'register',
      onSelect: () => setCurrentView('register'),
    },
  ];

  // Build Guide Sub-Items mapped to real GuideView tabs (Educational Reference Only)
  const guideSubItems: SubMenuItem[] = [
    {
      id: 'guide-all',
      label: 'جميع المراحل (الدليل المرجعي الشامل)',
      subtitle: 'تصفح مراحل الحج والأدعية وتوجيهات القافلة',
      icon: BookOpen,
      isActive: currentView === 'guide' && guideSubTab === 'all',
      onSelect: () => {
        onSelectGuideSubTab?.('all');
        setCurrentView('guide');
      },
    },
    {
      id: 'guide-day1',
      label: '8 ذو الحجة — يوم التروية',
      subtitle: 'الإحرام والتوجه إلى مشعر منى',
      icon: Calendar,
      isActive: currentView === 'guide' && guideSubTab === 'day1',
      onSelect: () => {
        onSelectGuideSubTab?.('day1');
        setCurrentView('guide');
      },
    },
    {
      id: 'guide-day2',
      label: '9 ذو الحجة — يوم عرفة',
      subtitle: 'الوقوف بعرفة والنفرة إلى مزدلفة',
      icon: Compass,
      isActive: currentView === 'guide' && guideSubTab === 'day2',
      onSelect: () => {
        onSelectGuideSubTab?.('day2');
        setCurrentView('guide');
      },
    },
    {
      id: 'guide-day3',
      label: '10 ذو الحجة — يوم العيد',
      subtitle: 'رمي جمرة العقبة وأعمال يوم النحر',
      icon: Calendar,
      isActive: currentView === 'guide' && guideSubTab === 'day3',
      onSelect: () => {
        onSelectGuideSubTab?.('day3');
        setCurrentView('guide');
      },
    },
    {
      id: 'guide-day4',
      label: 'أيام التشريق بمنى',
      subtitle: 'المبيت بمنى ورمي الجمرات الثلاث',
      icon: Calendar,
      isActive: currentView === 'guide' && guideSubTab === 'day4',
      onSelect: () => {
        onSelectGuideSubTab?.('day4');
        setCurrentView('guide');
      },
    },
    {
      id: 'guide-day5',
      label: 'طواف الوداع والختام',
      subtitle: 'ختام أعمال الحج والاستعداد للمغادرة',
      icon: BookOpen,
      isActive: currentView === 'guide' && guideSubTab === 'day5',
      onSelect: () => {
        onSelectGuideSubTab?.('day5');
        setCurrentView('guide');
      },
    },
    {
      id: 'guide-checklist',
      label: 'حقيبة وتجهيزات الحاج',
      subtitle: 'قائمة المستلزمات والوثائق والأدوية',
      icon: CheckSquare,
      isActive: currentView === 'guide' && guideSubTab === 'checklist',
      onSelect: () => {
        onSelectGuideSubTab?.('checklist');
        setCurrentView('guide');
      },
    },
  ];

  // Construct Main Navigation Items
  // Note: "لوحة التحكم (مدير)" is only shown as an administrative control panel item when adminLoggedIn is true
  const mainMenuItems: MainMenuItem[] = [
    {
      id: 'home',
      label: 'الرئيسية',
      subtitle: 'الصفحة الرئيسية ومستجدات القافلة',
      icon: HomeIcon,
      isActive: currentView === 'home',
      onMainSelect: () => setCurrentView('home'),
    },
    {
      id: 'packages',
      label: 'الباقات والرحلات',
      subtitle: 'باقات الطيران والحافلات والتسجيل',
      icon: Package,
      isActive: currentView === 'packages' || currentView === 'register',
      onMainSelect: () => {
        onSelectPackageHighlight?.(null);
        setCurrentView('packages');
      },
      subItems: packageSubItems,
    },
    {
      id: 'portal',
      label: 'بوابة الحاج',
      subtitle: 'الاستعلام عن الطلب والسكن والمقعد',
      icon: UserCheck,
      isActive: currentView === 'portal',
      onMainSelect: () => setCurrentView('portal'),
      subItems: portalSubItems,
    },
    {
      id: 'guide',
      label: 'دليل المناسك',
      subtitle: 'الدليل المرجعي لمناسك الحج وحقيبة الحاج',
      icon: BookOpen,
      isActive: currentView === 'guide',
      onMainSelect: () => setCurrentView('guide'),
      subItems: guideSubItems,
    },
    {
      id: 'ai-advisor',
      label: 'مرشد القائم الذكي',
      subtitle: 'المساعد الرسمي المعتمد لاستفسارات الحج والعمرة',
      icon: Sparkles,
      isActive: currentView === 'ai-advisor',
      onMainSelect: () => setCurrentView('ai-advisor'),
    },
    {
      id: 'contact',
      label: 'تواصل معنا',
      subtitle: 'أرقام الهواتف وموقع مكتب القافلة',
      icon: Phone,
      isActive: currentView === 'contact',
      onMainSelect: () => setCurrentView('contact'),
    },
    ...(adminLoggedIn
      ? [
          {
            id: 'admin',
            label: 'لوحة التحكم (مدير)',
            subtitle: 'إدارة الحجاج والعمليات التشغيلية',
            icon: Shield,
            isActive: currentView === 'admin',
            onMainSelect: () => setCurrentView('admin'),
            subItems: adminSubItems,
          },
        ]
      : []),
  ];

  const handleDesktopMouseEnter = (itemId: string, hasSub: boolean) => {
    if (closeDropdownTimerRef.current) {
      window.clearTimeout(closeDropdownTimerRef.current);
      closeDropdownTimerRef.current = null;
    }
    if (hasSub) {
      setOpenDesktopDropdownId(itemId);
    } else {
      setOpenDesktopDropdownId(null);
    }
  };

  const handleDesktopMouseLeave = () => {
    closeDropdownTimerRef.current = window.setTimeout(() => {
      setOpenDesktopDropdownId(null);
    }, 160);
  };

  const brandName = campaignSettings.siteTexts?.brandName || 'قافلة القائم';
  const brandSubtitle = campaignSettings.siteTexts?.brandSubtitle || 'للحج والعمرة والزيارة';
  const activeSocialLinks = getActiveSocialLinks(campaignSettings.socialAccounts);

  return (
    <>
      <header className="sticky top-0 z-50 w-full max-w-[100vw] bg-white dark:bg-[#0B1221]/95 backdrop-blur-xl border-b border-[#CBD5E1] dark:border-slate-800/90 text-[#0F172A] dark:text-white shadow-[0_2px_12px_rgba(15,23,42,0.07)] dark:shadow-xl relative after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-amber-500/50 dark:after:via-amber-500/35 after:to-transparent transition-colors duration-200">

        {/* Executive Top Utility Bar — Crisp Dark Charcoal (#1E293B) with Gold/White Contrast in Light Mode */}
        <div className="w-full bg-[#1E293B] dark:bg-gradient-to-r dark:from-[#080D1A] dark:via-[#0E172A] dark:to-[#080D1A] border-b border-amber-500/40 dark:border-amber-500/20 text-slate-100 dark:text-slate-200 px-3 sm:px-4 lg:px-8 py-1.5 text-xs transition-colors">
          <div className="w-full max-w-[1440px] mx-auto flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 min-w-0">
            {/* Right: Campaign Announcement Only (no license badge or trailing dot) */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 max-w-full">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <span className="font-bold text-amber-300 leading-snug truncate">
                {campaignSettings.siteTexts?.topBarAnnouncement || 'قافلة القائم للحج والعمرة - موسم 1448هـ'}
              </span>
            </div>

            {/* Center/Flexible: Enabled Official Social Media Icons Only */}
            {activeSocialLinks.length > 0 && (
              <div
                className="flex items-center flex-wrap justify-center gap-1.5 order-3 sm:order-2 w-full sm:w-auto pt-1 sm:pt-0 border-t border-slate-700/80 sm:border-t-0"
                aria-label="حسابات التواصل الاجتماعي لقافلة القائم"
              >
                {activeSocialLinks.map((item) => (
                  <a
                    key={item.key}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={item.tooltip}
                    aria-label={item.tooltip}
                    className="group relative w-6 h-6 sm:w-[26px] sm:h-[26px] rounded-lg bg-slate-800/95 hover:bg-amber-500 dark:bg-slate-900/90 dark:hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-400/35 hover:border-amber-400 flex items-center justify-center transition-all duration-150 hover:scale-105 shadow-2xs shrink-0"
                  >
                    <SocialPlatformIcon platform={item.key} className="w-3.5 h-3.5" />
                    <span className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 absolute top-full mt-1.5 left-1/2 -translate-x-1/2 z-[70] px-2 py-1 rounded-lg bg-slate-900 dark:bg-slate-950 text-amber-300 border border-amber-500/40 text-[10px] font-bold whitespace-nowrap shadow-lg hidden sm:block">
                      {item.labelAr}
                      {item.displayHandle ? (
                        <span className="text-slate-200 font-mono mr-1" dir="ltr">
                          {item.displayHandle}
                        </span>
                      ) : null}
                    </span>
                  </a>
                ))}
              </div>
            )}

            {/* Left: Phone & Location */}
            <div className="flex items-center gap-2 shrink-0 order-2 sm:order-3">
              <a
                href={`tel:${campaignSettings.phone}`}
                className="hover:text-white dark:hover:text-amber-300 transition-colors flex items-center gap-1 font-mono tabular-nums font-bold text-amber-300 dark:text-amber-400 whitespace-nowrap"
                dir="ltr"
              >
                <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                <span>{campaignSettings.phone}</span>
              </a>
              {campaignSettings.siteTexts?.topBarSubtext?.trim() && (
                <>
                  <span className="hidden sm:inline text-slate-500 dark:text-slate-600">·</span>
                  <span className="hidden sm:inline text-slate-300 dark:text-slate-400 whitespace-nowrap">
                    {campaignSettings.siteTexts.topBarSubtext}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Header Container */}
        <div className="w-full max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-[72px] gap-2 xl:gap-2.5 2xl:gap-4 min-w-0">
            {/* Zone 1: Compact Brand Identity Lockup */}
            <button
              type="button"
              onClick={() => setCurrentView('home')}
              className="flex items-center gap-2 sm:gap-2.5 text-right cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-xl p-1 -mr-1 min-w-0 shrink-0 max-w-[52vw] sm:max-w-[240px] xl:max-w-[190px] 2xl:max-w-[230px]"
            >
              <div className="w-9 h-9 sm:w-11 sm:h-11 bg-white rounded-xl p-1 sm:p-1.5 shadow-sm dark:shadow-md flex items-center justify-center border border-amber-500/45 group-hover:border-amber-500 dark:group-hover:border-amber-400 group-hover:scale-[1.03] transition-all duration-200 overflow-hidden shrink-0">
                <img
                  src="/assets/aistudio/Screenshot_20261107_174409_com_instagram_android_InstagramMainActivity_441b738d.png"
                  alt="شعار قافلة القائم"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0 space-y-0.5">
                <span className="text-sm sm:text-base 2xl:text-lg font-black tracking-tight text-slate-900 dark:text-white group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors block leading-tight truncate">
                  {brandName}
                </span>
                <span className="text-[10px] sm:text-[11px] text-amber-700 dark:text-amber-400/90 font-semibold block leading-tight truncate">
                  {brandSubtitle}
                </span>
              </div>
            </button>

            {/* Zone 2: Desktop Horizontal Navigation (xl+ / >=1280px) */}
            <nav
              ref={desktopNavRef}
              aria-label="القائمة الرئيسية للموقع"
              className="hidden xl:flex items-center justify-center gap-1 2xl:gap-1.5 min-w-0 flex-1"
            >
              {mainMenuItems.map((item) => {
                const Icon = item.icon;
                const hasSub = Boolean(item.subItems && item.subItems.length > 0);
                const isDropdownOpen = openDesktopDropdownId === item.id;
                const alignLeftEdge = item.id === 'admin' || item.id === 'guide';

                return (
                  <div
                    key={item.id}
                    className="relative shrink-0"
                    onMouseEnter={() => handleDesktopMouseEnter(item.id, hasSub)}
                    onMouseLeave={handleDesktopMouseLeave}
                  >
                    <div
                      className={`h-9 2xl:h-10 rounded-xl border transition-all duration-200 flex items-center relative overflow-hidden ${
                        item.isActive
                          ? 'bg-amber-50 dark:bg-gradient-to-l dark:from-amber-500/[0.16] dark:via-[#131F38] dark:to-[#0E172A] border-amber-500 dark:border-amber-500/50 text-[#92400E] dark:text-amber-300 shadow-xs dark:shadow-[0_0_20px_-6px_rgba(245,158,11,0.28)]'
                          : isDropdownOpen
                          ? 'bg-amber-50/70 dark:bg-[#131F38] border-amber-500/60 dark:border-amber-500/35 text-[#0F172A] dark:text-white'
                          : 'bg-[#F8FAFC] dark:bg-[#10192D]/70 hover:bg-amber-50/70 dark:hover:bg-[#142038] border-[#CBD5E1] dark:border-slate-800/80 hover:border-amber-500/60 dark:hover:border-slate-700 text-[#1E293B] dark:text-slate-200 hover:text-[#0F172A] dark:hover:text-white'
                      }`}
                    >
                      {/* Subtle bottom gold indicator bar for active desktop item */}
                      {item.isActive && (
                        <span className="absolute bottom-0 right-2 left-2 h-0.5 bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 dark:from-amber-400 dark:via-amber-500 dark:to-orange-500 rounded-full" />
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          item.onMainSelect();
                          setOpenDesktopDropdownId(null);
                        }}
                        className={`h-full flex items-center gap-1.5 text-xs 2xl:text-[13px] font-bold whitespace-nowrap cursor-pointer focus-visible:outline-none active:scale-[0.98] transition-transform ${
                          hasSub ? 'pr-2.5 pl-1 2xl:pr-3 2xl:pl-1.5' : 'px-2.5 2xl:px-3'
                        }`}
                      >
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                            item.isActive
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-amber-600 dark:text-amber-400/85'
                          }`}
                        />
                        {item.id === 'admin' ? (
                          <span>
                            لوحة التحكم
                            <span className="hidden 2xl:inline"> (مدير)</span>
                          </span>
                        ) : (
                          <span>{item.label}</span>
                        )}
                      </button>

                      {hasSub && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDesktopDropdownId((prev) => (prev === item.id ? null : item.id));
                          }}
                          aria-expanded={isDropdownOpen}
                          aria-label={`القوائم الفرعية لـ ${item.label}`}
                          className="pl-2 pr-0.5 h-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 transition-colors cursor-pointer focus-visible:outline-none"
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              isDropdownOpen ? 'rotate-180 text-amber-700 dark:text-amber-400' : ''
                            }`}
                          />
                        </button>
                      )}
                    </div>

                    {/* Desktop Dropdown Panel for Sub-Menus (Viewport-Safe RTL Alignment) */}
                    {hasSub && (
                      <div
                        className={`absolute top-full pt-2 w-72 max-w-[calc(100vw-2rem)] z-50 transition-all duration-200 ${
                          alignLeftEdge ? 'left-0 origin-top-left' : 'right-0 origin-top-right'
                        } ${
                          isDropdownOpen
                            ? 'opacity-100 translate-y-0 pointer-events-auto'
                            : 'opacity-0 -translate-y-1.5 pointer-events-none'
                        }`}
                      >
                        <div className="bg-white dark:bg-[#0B1221]/98 backdrop-blur-2xl border border-[#CBD5E1] dark:border-amber-500/35 rounded-2xl p-2.5 shadow-[0_14px_34px_rgba(15,23,42,0.14)] dark:shadow-2xl space-y-1.5 text-right">
                          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[#CBD5E1] dark:border-slate-800/90">
                            <span className="text-[11px] font-bold text-[#B45309] dark:text-amber-400 flex items-center gap-1.5">
                              <CornerDownLeft className="w-3 h-3" />
                              <span>{item.label}</span>
                            </span>
                            <span className="text-[10px] font-mono tabular-nums text-[#475569] dark:text-slate-400">
                              {item.subItems?.length} خيارات
                            </span>
                          </div>

                          <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1">
                            {item.subItems?.map((sub) => {
                              const SubIcon = sub.icon;
                              return (
                                <button
                                  key={sub.id}
                                  type="button"
                                  onClick={() => {
                                    sub.onSelect();
                                    setOpenDesktopDropdownId(null);
                                  }}
                                  className={`w-full text-right px-3 py-2.5 rounded-xl border transition-all duration-150 flex items-center justify-between gap-2.5 relative overflow-hidden group cursor-pointer active:scale-[0.99] ${
                                    sub.isActive
                                      ? 'bg-amber-50 dark:bg-gradient-to-l dark:from-amber-500/[0.16] dark:via-[#131F38] dark:to-[#0D1628] border-amber-500 dark:border-amber-500/45 text-[#92400E] dark:text-amber-300 shadow-xs'
                                      : 'bg-[#F8FAFC] dark:bg-[#0E172A]/80 hover:bg-amber-50/75 dark:hover:bg-[#14223D] border-[#CBD5E1] dark:border-slate-800/70 hover:border-amber-500/60 dark:hover:border-slate-700 text-[#1E293B] dark:text-slate-200 hover:text-[#0F172A] dark:hover:text-white'
                                  }`}
                                >
                                  {sub.isActive && (
                                    <span className="absolute right-0 top-2 bottom-2 w-1 bg-gradient-to-b from-amber-400 via-amber-500 to-orange-500 rounded-l-full" />
                                  )}
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                        sub.isActive
                                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                                          : 'bg-white dark:bg-[#080D1A] text-amber-700 dark:text-amber-400/80 border-slate-200 dark:border-slate-800 group-hover:text-amber-600 dark:group-hover:text-amber-300'
                                      }`}
                                    >
                                      <SubIcon className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <span className="text-xs font-bold block leading-snug">
                                        {sub.label}
                                      </span>
                                      {sub.subtitle && (
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-normal">
                                          {sub.subtitle}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* Account Management Logout Option inside Admin Desktop Dropdown */}
                          {item.id === 'admin' && adminLoggedIn && (
                            <div className="pt-2 mt-1.5 border-t border-slate-200 dark:border-slate-800/90 space-y-1.5">
                              <span className="px-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                                إدارة الحساب
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenDesktopDropdownId(null);
                                  setShowLogoutConfirmModal(true);
                                }}
                                className="w-full text-right px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-gradient-to-l dark:from-rose-500/[0.12] dark:via-[#10192D] dark:to-[#0D1526] hover:bg-rose-100 dark:hover:from-rose-500/[0.22] dark:hover:via-[#161F36] border border-rose-200 dark:border-rose-500/30 hover:border-rose-300 dark:hover:border-rose-400/50 transition-all duration-200 flex items-center justify-between gap-2.5 group cursor-pointer active:scale-[0.98]"
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 group-hover:bg-rose-500/25 flex items-center justify-center shrink-0 transition-colors">
                                    <LogOut className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-xs font-bold text-rose-700 dark:text-rose-300 block leading-snug">
                                      تسجيل الخروج
                                    </span>
                                    <span className="text-[10px] text-rose-600/80 dark:text-rose-300/75 block mt-0.5 leading-normal">
                                      الخروج الآمن من حسابك
                                    </span>
                                  </div>
                                </div>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* Zone 3: Desktop Utility Actions (Compact, Zero Duplication) */}
            <div className="hidden xl:flex items-center gap-1.5 2xl:gap-2 shrink-0">
              {adminLoggedIn && currentAdminUser ? (
                <div className="relative" ref={desktopPresenceRef}>
                  <button
                    type="button"
                    onClick={() => setShowPresencePopover((prev) => !prev)}
                    aria-expanded={showPresencePopover}
                    className="h-9 2xl:h-10 px-2.5 2xl:px-3 rounded-xl bg-emerald-50 dark:bg-gradient-to-l dark:from-emerald-500/[0.14] dark:via-[#10192D] dark:to-[#0D1526] hover:bg-emerald-100 dark:hover:from-emerald-500/[0.22] border border-emerald-500/40 hover:border-emerald-500 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="حساب المشرف والمتصلون الآن — اضغط للخيارات وتسجيل الخروج"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <div className="text-right leading-tight max-w-[105px] 2xl:max-w-[140px] truncate">
                      <span className="block text-[11px] 2xl:text-xs text-emerald-700 dark:text-emerald-300 font-black truncate">
                        {currentAdminUser.fullName || currentAdminUser.username}
                      </span>
                      <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {currentAdminUser.role || 'صاحب صلاحية'}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 transition-transform duration-200 ${
                        showPresencePopover ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {showPresencePopover && (
                    <div className="absolute left-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-amber-500/30 rounded-2xl shadow-2xl p-4 z-50 text-right animate-fadeIn space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                          <h4 className="text-sm font-black text-slate-900 dark:text-white truncate">
                            المتصلون الآن بالنظام
                          </h4>
                        </div>
                        <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-mono font-bold shrink-0">
                          {activeAdmins.length} مشرف نشط
                        </span>
                      </div>

                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {activeAdmins.map((adm) => (
                          <div
                            key={adm.id}
                            className="bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-2.5 rounded-xl flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <strong className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                                {adm.name}
                              </strong>
                              <span className="text-[10px] text-amber-700 dark:text-amber-400 block truncate">
                                {adm.role}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shrink-0">
                              متصل الآن
                            </span>
                          </div>
                        ))}
                        {activeAdmins.length === 0 && (
                          <div className="text-center py-3 text-xs text-slate-500 dark:text-slate-400">
                            لا يوجد مشرفون آخرون متصلون حالياً
                          </div>
                        )}
                      </div>

                      {/* Integrated Actions inside Supervisor Account Menu */}
                      <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowPresencePopover(false);
                            setCurrentView('admin');
                          }}
                          className="w-full h-9 px-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 border border-amber-500/35 text-amber-800 dark:text-amber-300 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                        >
                          <Shield className="w-3.5 h-3.5" />
                          <span>فتح لوحة التحكم</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowPresencePopover(false);
                            setShowLogoutConfirmModal(true);
                          }}
                          className="w-full h-9 px-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                        >
                          <LogOut className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                          <span>تسجيل الخروج من الحساب</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCurrentView('admin')}
                  className={`h-9 2xl:h-10 px-2.5 2xl:px-3 rounded-xl border text-xs font-bold whitespace-nowrap transition-all duration-200 flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                    currentView === 'admin'
                      ? 'bg-amber-50 dark:bg-gradient-to-l dark:from-amber-500/[0.16] dark:to-[#10192D] border-amber-500 text-[#92400E] dark:text-amber-300'
                      : 'bg-white dark:bg-[#10192D] hover:bg-amber-50 dark:hover:bg-[#15223B] border-[#94A3B8] dark:border-slate-800 hover:border-amber-500 text-[#1E293B] dark:text-slate-300 hover:text-[#0F172A] dark:hover:text-amber-300'
                  }`}
                  title="دخول المشرفين والإدارة"
                >
                  <Lock className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-400 shrink-0" />
                  <span>دخول الإدارة</span>
                </button>
              )}

              {/* Visitor Theme Switcher Button (Desktop) */}
              {onToggleTheme && (
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="h-9 w-9 2xl:h-10 2xl:w-10 rounded-xl bg-white dark:bg-[#10192D] hover:bg-amber-50 dark:hover:bg-[#16233E] text-[#D97706] dark:text-amber-400 hover:text-[#B45309] dark:hover:text-amber-300 transition-all duration-200 border border-[#94A3B8] dark:border-slate-800 hover:border-amber-500 flex items-center justify-center cursor-pointer active:scale-95 shadow-2xs shrink-0"
                  title={theme === 'dark' ? 'التبديل إلى الوضع الفاتح (النهاري)' : 'التبديل إلى الوضع الداكن (الليلي)'}
                  aria-label={theme === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              )}

              <button
                type="button"
                onClick={handleShareSite}
                className="h-9 w-9 2xl:h-10 2xl:w-auto 2xl:px-3 rounded-xl bg-white dark:bg-[#10192D] hover:bg-amber-50 dark:hover:bg-[#16233E] text-[#1E293B] dark:text-amber-400 hover:text-[#92400E] dark:hover:text-amber-300 transition-all duration-200 border border-[#94A3B8] dark:border-slate-800 hover:border-amber-500 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer active:scale-95 shadow-2xs shrink-0"
                title="مشاركة الموقع"
                aria-label="مشاركة الموقع"
              >
                <Share2 className="w-4 h-4 text-[#D97706] dark:text-amber-400 shrink-0" />
                <span className="hidden 2xl:inline whitespace-nowrap">مشاركة</span>
              </button>
              <PWAInstallButton compact />
            </div>

            {/* Mobile & Tablet Compact Action Bar (<1280px): Single Primary Supervisor Badge + Theme + Share + Menu */}
            <div className="xl:hidden flex items-center gap-1 sm:gap-2 shrink-0">
              {adminLoggedIn && currentAdminUser && (
                <div className="relative" ref={mobilePresenceRef}>
                  <button
                    type="button"
                    onClick={() => setShowPresencePopover((prev) => !prev)}
                    aria-expanded={showPresencePopover}
                    className="h-9 sm:h-10 px-2 sm:px-2.5 rounded-xl bg-emerald-50 dark:bg-[#10192D] hover:bg-emerald-100 dark:hover:bg-[#16233E] border border-emerald-500/40 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    title="حساب المشرف والمتصلون الآن — اضغط للخيارات وتسجيل الخروج"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <div className="text-right leading-tight max-w-[68px] sm:max-w-[130px] truncate">
                      <span className="block text-[11px] sm:text-xs text-emerald-700 dark:text-emerald-300 font-black truncate">
                        {currentAdminUser.fullName || currentAdminUser.username}
                      </span>
                      <span className="hidden sm:block text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {currentAdminUser.role || 'صاحب صلاحية'}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 transition-transform duration-200 ${
                        showPresencePopover ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {showPresencePopover && (
                    <div className="absolute left-0 top-full mt-2 w-72 sm:w-80 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-amber-500/30 rounded-2xl shadow-2xl p-3.5 z-50 text-right animate-fadeIn space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                            {currentAdminUser.fullName || currentAdminUser.username}
                          </h4>
                          <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold block truncate">
                            {currentAdminUser.role || 'صاحب صلاحية'}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 rounded-lg text-[10px] font-mono font-bold shrink-0">
                          {activeAdmins.length} متصل
                        </span>
                      </div>

                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block px-0.5">
                          المتصلون الآن بالنظام
                        </span>
                        {activeAdmins.map((adm) => (
                          <div
                            key={adm.id}
                            className="bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-2 rounded-xl flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <strong className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                                {adm.name}
                              </strong>
                              <span className="text-[10px] text-amber-700 dark:text-amber-400 block truncate">
                                {adm.role}
                              </span>
                            </div>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shrink-0">
                              متصل
                            </span>
                          </div>
                        ))}
                        {activeAdmins.length === 0 && (
                          <div className="text-center py-2.5 text-xs text-slate-500 dark:text-slate-400">
                            لا يوجد مشرفون آخرون متصلون حالياً
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setShowPresencePopover(false);
                            setCurrentView('admin');
                          }}
                          className="w-full h-9 px-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 border border-amber-500/35 text-amber-800 dark:text-amber-300 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Shield className="w-3.5 h-3.5" />
                          <span>فتح لوحة التحكم</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowPresencePopover(false);
                            setShowLogoutConfirmModal(true);
                          }}
                          className="w-full h-9 px-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                          <span>تسجيل الخروج</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Visitor Theme Switcher Button (Mobile & Tablet) */}
              {onToggleTheme && (
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white dark:bg-[#10192D] hover:bg-amber-50 dark:hover:bg-[#16233E] text-[#D97706] dark:text-amber-400 transition-all border border-[#94A3B8] dark:border-slate-800 hover:border-amber-500 flex items-center justify-center cursor-pointer active:scale-95 shadow-2xs shrink-0"
                  title={theme === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
                  aria-label={theme === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              )}

              {/* Share Portal QR Modal Button (Mobile & Tablet) */}
              <button
                type="button"
                onClick={handleShareSite}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white dark:bg-[#10192D] hover:bg-amber-50 dark:hover:bg-[#16233E] text-[#D97706] dark:text-amber-400 transition-all border border-[#94A3B8] dark:border-slate-800 hover:border-amber-500 flex items-center justify-center cursor-pointer active:scale-95 shadow-2xs shrink-0"
                title="مشاركة الموقع والباركود"
                aria-label="مشاركة الموقع والباركود"
              >
                <Share2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="w-8 h-8 sm:w-auto sm:h-10 sm:px-3.5 rounded-xl bg-amber-50 dark:bg-gradient-to-l dark:from-amber-500/[0.18] dark:to-[#10192D] text-[#92400E] dark:text-amber-300 hover:bg-amber-100 dark:hover:text-white transition-all border border-amber-500 flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-2xs shrink-0"
                aria-label="فتح القائمة الرئيسية"
                aria-expanded={mobileMenuOpen}
              >
                <Menu className="w-4 h-4 text-[#B45309] dark:text-amber-400" />
                <span className="text-xs font-bold hidden sm:inline">القائمة</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile & Tablet Slide-Over Navigation Drawer + Dark Blurred Backdrop */}
      <div
        className={`xl:hidden fixed inset-0 z-[100] transition-all duration-300 ${
          mobileMenuOpen ? 'pointer-events-auto visible' : 'pointer-events-none invisible'
        }`}
        aria-hidden={!mobileMenuOpen}
      >
        {/* Dark Translucent Backdrop */}
        <div
          onClick={() => setMobileMenuOpen(false)}
          className={`fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-300 ${
            mobileMenuOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Slide-Over RTL Drawer Panel */}
        <aside
          aria-label="لوحة التنقل الرئيسية"
          className={`fixed inset-y-0 right-0 w-full max-w-[365px] sm:max-w-[395px] bg-white dark:bg-[#0B1221] border-l border-slate-200 dark:border-amber-500/25 shadow-2xl flex flex-col justify-between text-right transition-transform duration-300 ease-out ${
            mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* 1. Redesigned Drawer Header: Logo, Brand Name, Subtitle, Theme, Share & Close */}
          <div className="p-4 sm:p-5 bg-gradient-to-b from-slate-50 to-white dark:from-[#101A30] dark:to-[#0B1221] border-b border-slate-200 dark:border-slate-800/90 flex items-center justify-between gap-3 shrink-0">
            <div
              onClick={() => {
                setCurrentView('home');
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
            >
              <div className="w-12 h-12 bg-white rounded-2xl p-1.5 shadow-sm dark:shadow-md flex items-center justify-center border border-amber-500/45 shrink-0">
                <img
                  src="/assets/aistudio/Screenshot_20261107_174409_com_instagram_android_InstagramMainActivity_441b738d.png"
                  alt="شعار قافلة القائم"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-black text-slate-900 dark:text-white leading-snug">
                  {brandName}
                </h2>
                <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold mt-0.5">
                  {brandSubtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {onToggleTheme && (
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#111C33] hover:bg-amber-50 dark:hover:bg-[#172644] text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-slate-800 hover:border-amber-500/40 flex items-center justify-center transition-all cursor-pointer active:scale-95"
                  title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
                  aria-label={theme === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              )}
              <button
                type="button"
                onClick={handleShareSite}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#111C33] hover:bg-amber-50 dark:hover:bg-[#172644] text-amber-700 dark:text-amber-400 border border-slate-200 dark:border-slate-800 hover:border-amber-500/40 flex items-center justify-center transition-all cursor-pointer active:scale-95"
                title="مشاركة الموقع"
                aria-label="مشاركة الموقع"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#111C33] hover:bg-rose-50 dark:hover:bg-rose-950/60 text-slate-500 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-800 hover:border-rose-500/40 flex items-center justify-center transition-all cursor-pointer active:scale-95"
                title="إغلاق القائمة"
                aria-label="إغلاق القائمة"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 2. Scrollable Main & Nested Navigation List */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-2">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                أقسام الموقع والخدمات الإلكترونية
              </span>
              <span className="text-[10px] text-amber-700 dark:text-amber-400/80 font-semibold">
                موسم 1448هـ
              </span>
            </div>

            {mainMenuItems.map((item) => {
              const Icon = item.icon;
              const hasSub = Boolean(item.subItems && item.subItems.length > 0);
              const isExpanded = expandedMobileMenuId === item.id;

              return (
                <div key={item.id} className="space-y-1.5">
                  {/* Main Menu Card */}
                  <div
                    className={`w-full min-h-[62px] rounded-2xl border transition-all duration-200 flex items-center justify-between relative overflow-hidden ${
                      item.isActive
                        ? 'bg-amber-50 dark:bg-gradient-to-l dark:from-amber-500/[0.16] dark:via-[#131F38] dark:to-[#0E172A] border-amber-500/55 text-slate-900 dark:text-white shadow-sm dark:shadow-[0_0_20px_-6px_rgba(245,158,11,0.28)]'
                        : isExpanded
                        ? 'bg-slate-100 dark:bg-[#131F38] border-amber-500/40 text-slate-900 dark:text-white'
                        : 'bg-slate-50 dark:bg-[#10192D] hover:bg-slate-100 dark:hover:bg-[#15223B] border-slate-200/90 dark:border-slate-800/90 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {item.isActive && (
                      <span className="absolute right-0 top-2.5 bottom-2.5 w-1 bg-gradient-to-b from-amber-400 via-amber-500 to-orange-500 rounded-l-full" />
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        item.onMainSelect();
                        setMobileMenuOpen(false);
                      }}
                      className="flex-1 text-right py-3 pr-3.5 pl-2 flex items-center gap-3 min-w-0 cursor-pointer active:scale-[0.99] transition-transform focus-visible:outline-none"
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                          item.isActive
                            ? 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/45 shadow-sm'
                            : 'bg-white dark:bg-[#0B1221] text-amber-700 dark:text-amber-400/90 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span
                          className={`text-sm font-bold block leading-snug ${
                            item.isActive ? 'text-amber-800 dark:text-amber-300' : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {item.label}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-relaxed">
                          {item.subtitle}
                        </span>
                      </div>
                    </button>

                    {hasSub ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedMobileMenuId((prev) => (prev === item.id ? null : item.id));
                        }}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? `إغلاق القائمة الفرعية لـ ${item.label}` : `فتح القائمة الفرعية لـ ${item.label}`}
                        className="pl-3.5 pr-2 py-3 self-stretch flex items-center justify-center cursor-pointer focus-visible:outline-none"
                      >
                        <span
                          className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-200 ${
                            isExpanded
                              ? 'bg-amber-500/15 dark:bg-amber-500/20 border-amber-500/50 text-amber-700 dark:text-amber-400'
                              : 'bg-white dark:bg-[#0B1221]/90 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-300'
                          }`}
                        >
                          <ChevronDown
                            className={`w-4 h-4 transition-transform duration-200 ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </span>
                      </button>
                    ) : (
                      item.isActive && (
                        <span className="ml-3 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 shrink-0">
                          نشط
                        </span>
                      )
                    )}
                  </div>

                  {/* Nested Accordion Sub-Menu Drawer */}
                  {hasSub && (
                    <div
                      className={`grid transition-all duration-200 ease-out ${
                        isExpanded
                          ? 'grid-rows-[1fr] opacity-100'
                          : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="mr-4 pr-3 border-r-2 border-amber-500/35 pt-0.5 pb-1">
                          <div className="bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-slate-800/90 rounded-2xl p-2 space-y-1.5 shadow-inner">
                            {item.subItems?.map((sub) => {
                              const SubIcon = sub.icon;
                              return (
                                <button
                                  key={sub.id}
                                  type="button"
                                  onClick={() => {
                                    sub.onSelect();
                                    setMobileMenuOpen(false);
                                  }}
                                  className={`w-full min-h-[46px] text-right px-3 py-2 rounded-xl border transition-all duration-150 flex items-center justify-between gap-2.5 relative overflow-hidden group cursor-pointer active:scale-[0.98] ${
                                    sub.isActive
                                      ? 'bg-amber-50 dark:bg-gradient-to-l dark:from-amber-500/[0.16] dark:via-[#131F38] dark:to-[#0D1628] border-amber-500/50 text-amber-800 dark:text-amber-300 shadow-sm'
                                      : 'bg-white dark:bg-[#0D1628] hover:bg-slate-100 dark:hover:bg-[#13203A] border-slate-200/80 dark:border-slate-800/80 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                  }`}
                                >
                                  {sub.isActive && (
                                    <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-500 dark:bg-amber-400 rounded-l-full" />
                                  )}
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                        sub.isActive
                                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                                          : 'bg-slate-50 dark:bg-[#080D1A] text-amber-700 dark:text-amber-400/80 border-slate-200 dark:border-slate-800 group-hover:text-amber-600 dark:group-hover:text-amber-300'
                                      }`}
                                    >
                                      <SubIcon className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <span className="text-xs font-bold block leading-snug">
                                        {sub.label}
                                      </span>
                                      {sub.subtitle && (
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-normal">
                                          {sub.subtitle}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 3. Clean Compact Utility Footer at Bottom of Navigation Drawer (No Duplicate Supervisor Badge) */}
          <div className="bg-slate-50 dark:bg-[#080D1A] border-t border-slate-200 dark:border-slate-800/90 p-3.5 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <a
                href={`tel:${campaignSettings.phone}`}
                className="flex-1 min-w-[140px] h-10 px-3 rounded-xl bg-white dark:bg-[#10192D] hover:bg-amber-50 dark:hover:bg-[#16233E] border border-slate-200 dark:border-slate-800 text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <Phone className="w-3.5 h-3.5" />
                <span dir="ltr">{campaignSettings.phone}</span>
              </a>

              <PWAInstallButton />

              {!adminLoggedIn && (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentView('admin');
                    setMobileMenuOpen(false);
                  }}
                  className="h-10 px-3.5 rounded-xl bg-white dark:bg-[#10192D] hover:bg-amber-50 dark:hover:bg-[#16233E] border border-slate-200 dark:border-slate-800 hover:border-amber-500/40 text-slate-700 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>دخول الإدارة</span>
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Elegant Logout Confirmation Modal */}
      {showLogoutConfirmModal && adminLoggedIn && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-modal-title"
        >
          <div
            onClick={() => !isLoggingOut && setShowLogoutConfirmModal(false)}
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm transition-opacity animate-fadeIn"
          />

          <div className="relative w-full max-w-md bg-white dark:bg-gradient-to-b dark:from-[#111C33] dark:to-[#0B1221] border border-slate-200 dark:border-amber-500/30 rounded-3xl p-6 shadow-2xl text-right space-y-5 z-10 animate-fadeIn">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-inner">
                  <LogOut className="w-6 h-6" />
                </div>
                <div>
                  <h3 id="logout-modal-title" className="text-lg font-black text-slate-900 dark:text-white leading-snug">
                    تسجيل الخروج
                  </h3>
                  <p className="text-xs text-amber-700 dark:text-amber-400/90 font-semibold mt-0.5">
                    إدارة الحساب · {brandName}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isLoggingOut}
                onClick={() => setShowLogoutConfirmModal(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#0B1221] hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="إغلاق نافذة التأكيد"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-[#080D1A]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-4">
              <p className="text-sm text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
                هل أنت متأكد أنك تريد تسجيل الخروج من حسابك؟
              </p>
              {currentAdminUser?.fullName && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5">
                  <span>الحساب الحالي:</span>
                  <span className="font-bold text-amber-700 dark:text-amber-300">{currentAdminUser.fullName}</span>
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-center gap-2.5 pt-1">
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={() => setShowLogoutConfirmModal(false)}
                className="w-full sm:flex-1 h-11 px-4 rounded-xl bg-slate-100 dark:bg-[#131F38] hover:bg-slate-200 dark:hover:bg-[#192847] text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/80 hover:border-amber-500/40 text-xs sm:text-sm font-bold transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-[0.98]"
              >
                البقاء في الحساب
              </button>

              <button
                type="button"
                disabled={isLoggingOut}
                onClick={handleConfirmLogout}
                className="w-full sm:flex-1 h-11 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white border border-rose-400/40 shadow-lg shadow-rose-950/30 text-xs sm:text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-60"
              >
                <LogOut className="w-4 h-4" />
                <span>{isLoggingOut ? 'جاري تسجيل الخروج...' : 'نعم، تسجيل الخروج'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Interactive Share & Promotional QR Code Modal */}
      <SharePortalModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        campaignSettings={campaignSettings}
      />
    </>
  );
};
