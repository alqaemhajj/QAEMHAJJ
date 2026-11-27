import React, { useState, useEffect } from 'react';
import { Pilgrim, HajjPackage, Announcement, AdminUser, CampaignSettings, ActivityLog, PilgrimFeedback, NotificationItem, HajjSeason } from '../types';
import { defaultCampaignSettings } from '../data/initialData';
import { Shield, Lock, Search, Download, Trash2, Edit3, CheckCircle2, UserPlus, Users, Bus, Plane, Hotel, Building2, FileSpreadsheet, LogOut, Plus, BookOpen, Package, UserCheck, Key, Settings, Phone, BarChart3, ShieldCheck, Eye, EyeOff, Star, Receipt, UploadCloud, FileCheck, Sparkles, Loader2, AlertCircle, RotateCw, Clock, CreditCard, FileText, CheckCircle, XCircle, Image as ImageIcon, Video, Type, Bold, AlignRight, AlignCenter, Share2, HeartPulse, ChevronDown, Megaphone, Compass, CornerDownLeft, Bell, Gift, FolderArchive, Calendar, Printer, Sliders, Link2, Fingerprint } from 'lucide-react';
import { DynamicFormTemplate } from '../types/dynamicForms';
import { DynamicFormBuilderAdmin } from './forms/DynamicFormBuilderAdmin';
import { extractDynamicReportColumns, getPilgrimCustomFieldEntries } from '../lib/dynamicFormsDb';
import { FONT_SIZE_OPTIONS, getAnnouncementTypographyClasses, getEmbeddedVideoInfo, compressAnnouncementImage, uploadMediaAsReference, extractMediaId } from '../utils/announcementMedia';
import { AnnouncementImageView, AnnouncementVideoView } from './AnnouncementMediaView';
import { shareAnnouncementItem, sharePackageItem } from '../utils/shareItem';
import { ConfirmModal } from './ConfirmModal';
import { AdminAnalyticsDashboard } from './AdminAnalyticsDashboard';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import {
  getPilgrimPaymentDeclaration,
  getPilgrimVaccinationDeclaration,
} from '../utils/pilgrimDeclarations';
import { YouTubeAdminControl } from './YouTubeAdminControl';
import { AdminNotificationCenter } from './AdminNotificationCenter';
import { GiftDistributionManager } from './gifts/GiftDistributionManager';
import { ReligiousGuidanceManager, RELIGIOUS_11_UNITS } from './religious/ReligiousGuidanceManager';
import { ReligiousUnitKey } from '../types/religiousGuidance';
import { RoleDashboardWorkspace } from './RoleDashboardWorkspace';
import { StaffManagementView } from './StaffManagementView';
import { ExcelReportCustomizerModal } from './ExcelReportCustomizerModal';
import { OfficialReportPrintModal, PilgrimExportButtons } from './common/OfficialReportPrintModal';
import { useMutawwifAndGuideLookup } from './common/DynamicColumnSelector';
import { DynamicPilgrimRosterSection, InlineQuickTextCell } from './common/DynamicPilgrimRosterTable';
import { SeasonsManagerPanel } from './SeasonsManagerPanel';
import { AdvisorAdminManager } from './AdvisorAdminManager';
import { ManasikGuideAdmin } from './religious/ManasikGuideAdmin';
import { GroupLocationsManager } from './maps/GroupLocationsManager';
import { CompanionsMahramRosterPanel } from './pilgrims/CompanionsMahramRosterPanel';
import { MediaDuplicateDecisionModal, SeasonMediaArchiveModal, DuplicateDecisionChoice } from './MediaDuplicateAndArchiveModal';
import {
  exportAlQaemExcelReport,
  openAlQaemExcelCustomizer,
  getLastExportedAlQaemReport,
} from '../utils/alqaemExcelEngine';
import {
  isGeneralAdminUser,
  isSuperAdminUser,
  canPerformOperation,
  normalizeOfficialRole,
  DEFAULT_ROLE_PERMISSIONS,
  migrateAdminUserRecord,
} from '../utils/rbac';
import { DualCalendarDatePicker } from './common/DualCalendarDatePicker';
import { formatDualDateSummary } from '../utils/dualCalendar';
import { ActivityLogPanel } from './ActivityLogPanel';
import { AdminAuthGate, AdminAuthMethod } from './AdminAuthGate';
import { UserSecuritySettingsModal } from './UserSecuritySettingsModal';
import { subscribeToCollection, recordActivityLog, getActivityLogsDayCount, getLocalDateString, getDocuments, getSeasonPilgrims, downloadSystemBackupJson } from '../lib/db';
import { resetVisitorStats } from '../utils/presence';
import { uploadOptimizedMedia, runMediaStorageAuditAndCleanup, inspectMediaFileBeforeUpload, reuseExistingMediaAsset, MediaAssetMetadata } from '../lib/mediaManager';
import { normalizeSeasonId, extractHijriYear } from '../lib/seasons';
import {
  calculatePilgrimStatsBreakdown,
  getEffectivePilgrimStatsConfig,
  formatPilgrimsCountWithPlus,
  isPilgrimInSeason,
  getActiveSeasonYear,
} from '../utils/pilgrimStats';
import {
  evaluatePackageStatus,
  formatRegistrationDeadlineAr,
} from '../utils/packageStatus';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip
} from 'recharts';

import {
  hashPIN,
  hashPasswordSecure,
  validateStrongPassword,
  normalizePinInput,
} from '../utils/pinAuth';
import {
  SocialAccountsAdminSection,
  normalizeSocialAccountsMap,
} from './common/SocialMediaConfig';
import { safeStorage } from '../utils/safeStorage';

interface AdminDashboardProps {
  pilgrims: Pilgrim[];
  packages: HajjPackage[];
  announcements: Announcement[];
  notifications?: NotificationItem[];
  seasons?: HajjSeason[];
  dynamicForms?: DynamicFormTemplate[];
  adminUsers: AdminUser[];
  feedback: PilgrimFeedback[];
  currentAdminUser: AdminUser | null;
  campaignSettings: CampaignSettings;
  onAddPilgrim?: (pilgrim: Pilgrim) => Promise<void> | void;
  onUpdatePilgrim: (pilgrim: Pilgrim) => void;
  onDeletePilgrim: (id: string) => void;
  onAddPackage: (pkg: HajjPackage) => Promise<boolean> | boolean | void;
  onUpdatePackage: (pkg: HajjPackage) => Promise<boolean> | boolean | void;
  onDeletePackage: (id: string) => Promise<boolean> | boolean | void;
  onAddAnnouncement: (ann: Announcement) => Promise<boolean> | boolean | void;
  onUpdateAnnouncement: (ann: Announcement) => Promise<boolean> | boolean | void;
  onDeleteAnnouncement: (id: string) => Promise<boolean> | boolean | void;
  onAddAdminUser: (user: AdminUser) => Promise<void> | void;
  onUpdateAdminUser: (user: AdminUser) => Promise<void> | void;
  onDeleteAdminUser: (id: string) => Promise<void> | void;
  onUpdateCampaignSettings: (settings: CampaignSettings) => Promise<boolean> | boolean | void;
  adminLoggedIn: boolean;
  setAdminLoggedIn: (val: boolean) => void;
  setCurrentAdminUser: (user: AdminUser | null) => void;
  pendingSuperAdmin2FA?: AdminUser | null;
  authGateNotice?: string;
  onClearAuthGateNotice?: () => void;
  onCancelPendingSuperAdmin2FA?: () => Promise<void> | void;
  onAuthGateSuccess?: (user: AdminUser, method: AdminAuthMethod) => void;
  externalActiveTab?: string;
  onActiveTabChange?: (tab: string) => void;
  onRefreshData?: () => Promise<void> | void;
}

interface HousingTableRowProps {
  pilgrim: Pilgrim;
  index: number;
  onUpdate: (updated: Pilgrim) => void;
}

const HousingTableRow: React.FC<HousingTableRowProps> = ({
  pilgrim,
  index,
  onUpdate,
}) => {
  const [madinahRoom, setMadinahRoom] = useState(pilgrim.roomNumberMadinah || '');
  const [makkahRoom, setMakkahRoom] = useState(pilgrim.roomNumberMakkah || pilgrim.roomNumber || '');
  const [minaRoom, setMinaRoom] = useState(pilgrim.roomNumberMina || '');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setMadinahRoom(pilgrim.roomNumberMadinah || '');
    setMakkahRoom(pilgrim.roomNumberMakkah || pilgrim.roomNumber || '');
    setMinaRoom(pilgrim.roomNumberMina || '');
  }, [pilgrim.roomNumberMadinah, pilgrim.roomNumberMakkah, pilgrim.roomNumber, pilgrim.roomNumberMina]);

  const isChanged =
    madinahRoom.trim() !== (pilgrim.roomNumberMadinah || '').trim() ||
    makkahRoom.trim() !== (pilgrim.roomNumberMakkah || pilgrim.roomNumber || '').trim() ||
    minaRoom.trim() !== (pilgrim.roomNumberMina || '').trim();

  const handleSave = () => {
    const cleanMadinah = madinahRoom.trim();
    const cleanMakkah = makkahRoom.trim();
    const cleanMina = minaRoom.trim();
    onUpdate({
      ...pilgrim,
      roomNumberMadinah: cleanMadinah,
      roomNumberMakkah: cleanMakkah,
      roomNumberMina: cleanMina,
      roomNumber: cleanMakkah || pilgrim.roomNumber,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const cleanPhone = (pilgrim.mobile || '').replace(/[^\d+]/g, '');
  const waLink = cleanPhone.startsWith('05')
    ? `https://wa.me/966${cleanPhone.slice(1)}`
    : cleanPhone.startsWith('+')
    ? `https://wa.me/${cleanPhone.slice(1)}`
    : `https://wa.me/${cleanPhone}`;

  return (
    <tr className="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition">
      <td className="px-4 py-4 text-center font-mono font-black text-blue-500 text-xs bg-blue-500/5">
        {index + 1}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="font-bold text-slate-900 dark:text-white text-sm">
          {pilgrim.firstName} {pilgrim.secondName} {pilgrim.thirdName} {pilgrim.lastName}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          <span className="text-[11px] text-slate-400 font-mono" dir="ltr">
            {pilgrim.nationalId}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
            {pilgrim.selectedPackage || 'التسجيل العام'}
          </span>
          {pilgrim.madinahPrivateRoomRequested && (
            <span
              className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
              title={pilgrim.madinahPrivateRoomNote || 'طلب غرفة خاصة في المدينة المنورة'}
            >
              طلب غرفة خاصة بالمدينة
            </span>
          )}
        </div>
        {pilgrim.madinahPrivateRoomRequested && pilgrim.madinahPrivateRoomNote && (
          <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 max-w-[240px] truncate" title={pilgrim.madinahPrivateRoomNote}>
            ملاحظة السكن: {pilgrim.madinahPrivateRoomNote}
          </div>
        )}
      </td>
      <td className="px-6 py-4 font-mono text-xs whitespace-nowrap" dir="ltr">
        <div className="flex items-center gap-2">
          <a
            href={`tel:${pilgrim.mobile}`}
            className="inline-flex items-center gap-1.5 text-slate-800 dark:text-slate-200 hover:text-blue-500 font-bold transition"
            title="اتصال هاتفياً"
          >
            <Phone className="w-3.5 h-3.5 text-slate-400" />
            <span>{pilgrim.mobile}</span>
          </a>
          {cleanPhone && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition"
              title="مراسلة واتساب"
            >
              <Phone className="w-3 h-3" />
            </a>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="relative min-w-[170px]">
          <input
            type="text"
            value={madinahRoom}
            onChange={(e) => setMadinahRoom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            placeholder="مثال: غرفة 102 - فندق أنوار المدينة"
            className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-1 transition placeholder:font-normal placeholder:text-slate-400 ${
              pilgrim.madinahPrivateRoomRequested
                ? 'border-amber-400 dark:border-amber-500 focus:border-amber-500 focus:ring-amber-500/30'
                : 'border-emerald-300 dark:border-emerald-700/60 focus:border-emerald-500 focus:ring-emerald-500/30'
            }`}
          />
          {madinahRoom && (
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-500" title="تم تحديد غرفة المدينة" />
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="relative min-w-[170px]">
          <input
            type="text"
            value={makkahRoom}
            onChange={(e) => setMakkahRoom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            placeholder="مثال: غرفة 304 - برج مكة"
            className="w-full bg-slate-50 dark:bg-slate-950 border border-amber-300 dark:border-amber-700/60 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition placeholder:font-normal placeholder:text-slate-400"
          />
          {makkahRoom && (
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-500" title="تم تحديد غرفة مكة" />
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="relative min-w-[170px]">
          <input
            type="text"
            value={minaRoom}
            onChange={(e) => setMinaRoom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            placeholder="مثال: مخيم 4 - صالة أ - مقعد 12"
            className="w-full bg-slate-50 dark:bg-slate-950 border border-purple-300 dark:border-purple-700/60 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition placeholder:font-normal placeholder:text-slate-400"
          />
          {minaRoom && (
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-purple-500" title="تم تحديد تسكين منى" />
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-center gap-2">
          {savedSuccess ? (
            <span className="px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-1 shadow animate-fadeIn">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>تم الحفظ ✓</span>
            </span>
          ) : (
            <button
              onClick={handleSave}
              disabled={!isChanged}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 ${
                isChanged
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md active:scale-95'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
              }`}
              title="حفظ رقم الغرفة بالمدينة ومكة"
            >
              <span>حفظ السكن</span>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

interface FlightTableRowProps {
  pilgrim: Pilgrim;
  index: number;
  onUpdate: (updated: Pilgrim) => void;
  onOpenEditModal: (pilgrim: Pilgrim) => void;
}

const FlightTableRow: React.FC<FlightTableRowProps> = ({
  pilgrim,
  index,
  onUpdate,
  onOpenEditModal,
}) => {
  const [outbound, setOutbound] = useState(pilgrim.flightNumberOutbound || '');
  const [returnFlight, setReturnFlight] = useState(pilgrim.flightNumberReturn || '');
  const [ticketNo, setTicketNo] = useState(pilgrim.flightTicketNumber || '');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setOutbound(pilgrim.flightNumberOutbound || '');
    setReturnFlight(pilgrim.flightNumberReturn || '');
    setTicketNo(pilgrim.flightTicketNumber || '');
  }, [pilgrim.flightNumberOutbound, pilgrim.flightNumberReturn, pilgrim.flightTicketNumber]);

  const isChanged =
    outbound.trim() !== (pilgrim.flightNumberOutbound || '').trim() ||
    returnFlight.trim() !== (pilgrim.flightNumberReturn || '').trim() ||
    ticketNo.trim() !== (pilgrim.flightTicketNumber || '').trim();

  const handleSave = () => {
    const cleanOutbound = outbound.trim();
    const cleanReturn = returnFlight.trim();
    const cleanTicket = ticketNo.trim();
    onUpdate({
      ...pilgrim,
      transport: (cleanOutbound || cleanReturn || cleanTicket) ? 'طائرة' : pilgrim.transport,
      flightNumberOutbound: cleanOutbound,
      flightNumberReturn: cleanReturn,
      flightTicketNumber: cleanTicket,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const cleanPhone = (pilgrim.mobile || '').replace(/[^\d+]/g, '');
  const waLink = cleanPhone.startsWith('05')
    ? `https://wa.me/966${cleanPhone.slice(1)}`
    : cleanPhone.startsWith('+')
    ? `https://wa.me/${cleanPhone.slice(1)}`
    : `https://wa.me/${cleanPhone}`;

  return (
    <tr className="hover:bg-sky-50/30 dark:hover:bg-sky-900/10 transition">
      <td className="px-4 py-4 text-center font-mono font-black text-sky-500 text-xs bg-sky-500/5">
        {index + 1}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="font-bold text-slate-900 dark:text-white text-sm">
          {pilgrim.firstName} {pilgrim.secondName} {pilgrim.thirdName} {pilgrim.lastName}
        </div>
        {pilgrim.englishFullName && (
          <div className="text-[11px] font-mono text-sky-600 dark:text-sky-400 font-bold mt-0.5" dir="ltr">
            {pilgrim.englishFullName}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="text-[11px] text-slate-400 font-mono" dir="ltr">
            {pilgrim.nationalId}
          </span>
          {pilgrim.birthDate && (
            <span className="text-[10px] text-slate-400 font-mono" dir="ltr">
              • ميلاد: {pilgrim.birthDate}
            </span>
          )}
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 text-sky-500 border border-sky-500/20">
            {pilgrim.selectedPackage || 'التسجيل العام'}
          </span>
        </div>
      </td>
      <td className="px-6 py-4 font-mono text-xs whitespace-nowrap" dir="ltr">
        <div className="flex items-center gap-2">
          <a
            href={`tel:${pilgrim.mobile}`}
            className="inline-flex items-center gap-1.5 text-slate-800 dark:text-slate-200 hover:text-sky-500 font-bold transition"
            title="اتصال هاتفياً"
          >
            <Phone className="w-3.5 h-3.5 text-slate-400" />
            <span>{pilgrim.mobile}</span>
          </a>
          {cleanPhone && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition"
              title="مراسلة واتساب"
            >
              <Phone className="w-3 h-3" />
            </a>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="relative min-w-[175px]">
          <input
            type="text"
            value={outbound}
            onChange={(e) => setOutbound(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            placeholder="مثال: SV 1422 - الدمام 08:30 ص"
            className="w-full bg-slate-50 dark:bg-slate-950 border border-sky-300 dark:border-sky-700/60 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition placeholder:font-normal placeholder:text-slate-400"
          />
          {outbound && (
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-sky-500" title="تم تحديد رحلة الذهاب" />
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="relative min-w-[175px]">
          <input
            type="text"
            value={returnFlight}
            onChange={(e) => setReturnFlight(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            placeholder="مثال: SV 1435 - جدة 09:15 م"
            className="w-full bg-slate-50 dark:bg-slate-950 border border-indigo-300 dark:border-indigo-700/60 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition placeholder:font-normal placeholder:text-slate-400"
          />
          {returnFlight && (
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-indigo-500" title="تم تحديد رحلة العودة" />
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="relative min-w-[155px]">
          <input
            type="text"
            value={ticketNo}
            onChange={(e) => setTicketNo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            placeholder="مثال: PNR: 8XK92M"
            dir="ltr"
            className="w-full bg-slate-50 dark:bg-slate-950 border border-amber-300 dark:border-amber-700/60 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition placeholder:font-normal placeholder:text-slate-400"
          />
          {ticketNo && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-500" title="تم تحديد رقم التذكرة / الحجز" />
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-center gap-2">
          {savedSuccess ? (
            <span className="px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-1 shadow animate-fadeIn">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>تم الحفظ ✓</span>
            </span>
          ) : (
            <button
              onClick={handleSave}
              disabled={!isChanged}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 ${
                isChanged
                  ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-md active:scale-95'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
              }`}
              title="حفظ بيانات رحلة الطيران"
            >
              <span>حفظ الرحلة</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenEditModal(pilgrim)}
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-500/20 text-slate-600 dark:text-slate-300 hover:text-amber-500 transition"
            title="تعديل ملف الحاج الكامل"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
};


const isPilgrimPaymentConfirmed = (pilgrim: Pilgrim): boolean => {
  return (
    pilgrim.status === 'مكتمل الدفع' ||
    pilgrim.status === 'مكتمل' ||
    pilgrim.status === 'مقبول ومؤكد' ||
    pilgrim.paymentReceived === true
  );
};

const getPilgrimPaidAmount = (pilgrim: Pilgrim, packages: HajjPackage[]): number => {
  if (!isPilgrimPaymentConfirmed(pilgrim)) {
    return 0;
  }
  if (pilgrim.paidAmount) {
    const parsedPaid = parseFloat(String(pilgrim.paidAmount).replace(/[^0-9.]/g, ''));
    if (!isNaN(parsedPaid) && parsedPaid > 0) return parsedPaid;
  }
  if (pilgrim.paymentInstallments && pilgrim.paymentInstallments.length > 0) {
    const sumInst = pilgrim.paymentInstallments.reduce((acc, inst) => {
      const val = parseFloat(String(inst.amount).replace(/[^0-9.]/g, '')) || 0;
      return acc + val;
    }, 0);
    if (sumInst > 0) return sumInst;
  }
  if (pilgrim.transferAmount) {
    const parsedTransfer = parseFloat(String(pilgrim.transferAmount).replace(/[^0-9.]/g, ''));
    if (!isNaN(parsedTransfer) && parsedTransfer > 0) return parsedTransfer;
  }
  if (pilgrim.totalPackagePrice) {
    const parsedPkgTotal = parseFloat(String(pilgrim.totalPackagePrice).replace(/[^0-9.]/g, ''));
    if (!isNaN(parsedPkgTotal) && parsedPkgTotal > 0) return parsedPkgTotal;
  }
  const matchedPkg = packages.find(pkg => pkg.title === pilgrim.selectedPackage);
  if (matchedPkg?.price) {
    const parsedMatched = parseFloat(String(matchedPkg.price).replace(/[^0-9.]/g, ''));
    if (!isNaN(parsedMatched) && parsedMatched > 0) return parsedMatched;
  }
  return 0;
};

interface FinancialStatementRowProps {
  pilgrim: Pilgrim;
  index: number;
  packages: HajjPackage[];
  onUpdate: (updated: Pilgrim) => void;
  onOpenReceipt: (pilgrim: Pilgrim) => void;
}

const FinancialStatementRow: React.FC<FinancialStatementRowProps> = ({
  pilgrim,
  index,
  packages,
  onUpdate,
  onOpenReceipt,
}) => {
  const computedPaid = getPilgrimPaidAmount(pilgrim, packages);
  const isConfirmed = isPilgrimPaymentConfirmed(pilgrim);
  const [paidInput, setPaidInput] = useState<string>(computedPaid > 0 ? String(computedPaid) : '');
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    const nextVal = getPilgrimPaidAmount(pilgrim, packages);
    setPaidInput(nextVal > 0 ? String(nextVal) : '');
  }, [
    pilgrim.paidAmount,
    pilgrim.transferAmount,
    pilgrim.status,
    pilgrim.paymentReceived,
    pilgrim.selectedPackage,
    pilgrim.totalPackagePrice,
    packages,
  ]);

  const parsedInputAmount = parseFloat(String(paidInput).replace(/[^0-9.]/g, '')) || 0;
  const isAmountChanged = parsedInputAmount !== computedPaid;

  const handleSavePaidAmount = () => {
    const formattedAmount = parsedInputAmount > 0 ? `${parsedInputAmount.toLocaleString('en-US')} ريال` : '';
    onUpdate({
      ...pilgrim,
      paidAmount: formattedAmount,
      transferAmount: parsedInputAmount > 0 ? String(parsedInputAmount) : pilgrim.transferAmount,
      paymentReceived: parsedInputAmount > 0 ? true : pilgrim.paymentReceived,
      status:
        parsedInputAmount > 0 && pilgrim.status === 'قيد المراجعة'
          ? 'مكتمل الدفع'
          : pilgrim.status,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleToggleConfirm = () => {
    const nextConfirmed = !isConfirmed;
    const defaultAmount =
      computedPaid > 0
        ? computedPaid
        : (() => {
            const matchedPkg = packages.find(pkg => pkg.title === pilgrim.selectedPackage);
            if (matchedPkg?.price) {
              const p = parseFloat(String(matchedPkg.price).replace(/[^0-9.]/g, ''));
              if (!isNaN(p) && p > 0) return p;
            }
            return pilgrim.selectedPackage?.includes('طيران') || pilgrim.selectedPackage?.includes('VIP')
              ? 28500
              : 16800;
          })();

    onUpdate({
      ...pilgrim,
      paymentReceived: nextConfirmed,
      status: nextConfirmed ? 'مكتمل الدفع' : 'قيد المراجعة',
      paidAmount: nextConfirmed ? `${defaultAmount.toLocaleString('en-US')} ريال` : pilgrim.paidAmount,
    });
  };

  return (
    <tr className="hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 transition">
      <td className="px-4 py-4 text-center font-mono font-black text-emerald-500 text-xs bg-emerald-500/5">
        {index + 1}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="font-bold text-slate-900 dark:text-white text-sm">
          {pilgrim.firstName} {pilgrim.secondName} {pilgrim.thirdName} {pilgrim.lastName}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[11px] text-slate-400 font-mono" dir="ltr">
            الهوية: {pilgrim.nationalId}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
            {pilgrim.selectedPackage || 'التسجيل العام'}
          </span>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <button
          type="button"
          onClick={handleToggleConfirm}
          className={`px-3 py-1.5 rounded-xl text-xs font-black transition inline-flex items-center gap-1.5 border ${
            isConfirmed
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
          }`}
          title="اضغط لتأكيد أو إلغاء تأكيد الدفع"
        >
          {isConfirmed ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>مؤكد الدفع ({pilgrim.status})</span>
            </>
          ) : (
            <>
              <Clock className="w-3.5 h-3.5" />
              <span>غير مؤكد ({pilgrim.status})</span>
            </>
          )}
        </button>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <div className="relative w-36">
            <input
              type="text"
              value={paidInput}
              onChange={(e) => setPaidInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSavePaidAmount();
              }}
              placeholder="أدخل المبلغ..."
              dir="ltr"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-emerald-300 dark:border-emerald-700/60 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white font-mono font-black focus:outline-none focus:border-emerald-500"
            />
          </div>
          <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono font-black text-xs">
            {computedPaid.toLocaleString('en-US')} ر.س
          </span>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center justify-center gap-2">
          {savedNotice ? (
            <span className="px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-1 shadow animate-fadeIn">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>تم الحفظ ✓</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleSavePaidAmount}
              disabled={!isAmountChanged}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                isAmountChanged
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
              }`}
            >
              <span>حفظ المبلغ</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenReceipt(pilgrim)}
            className="px-2.5 py-1.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-slate-950 rounded-xl transition text-xs font-bold flex items-center gap-1"
            title="عرض وطباعة سند القبض المالي"
          >
            <img
              src="/assets/aistudio/Saudi_Riyal_Symbol-1_96cf3a0c.png"
              alt="ريال سعودي"
              className="w-3.5 h-3.5 object-contain opacity-90 filter brightness-0 saturate-100 invert-[.4] sepia-[.8] hue-rotate-[10deg]"
            />
            <span className="hidden lg:inline">سند قبض</span>
          </button>
        </div>
      </td>
    </tr>
  );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  pilgrims,
  packages,
  announcements,
  notifications = [],
  seasons = [],
  dynamicForms = [],
  adminUsers,
  feedback,
  currentAdminUser,
  campaignSettings,
  onAddPilgrim,
  onUpdatePilgrim,
  onDeletePilgrim,
  onAddPackage,
  onUpdatePackage,
  onDeletePackage,
  onAddAnnouncement,
  onUpdateAnnouncement,
  onDeleteAnnouncement,
  onAddAdminUser,
  onUpdateAdminUser,
  onDeleteAdminUser,
  onUpdateCampaignSettings,
  adminLoggedIn,
  setAdminLoggedIn,
  setCurrentAdminUser,
  pendingSuperAdmin2FA,
  authGateNotice,
  onClearAuthGateNotice,
  onCancelPendingSuperAdmin2FA,
  onAuthGateSuccess,
  externalActiveTab,
  onActiveTabChange,
  onRefreshData
}) => {
  const [isSyncingData, setIsSyncingData] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const { mutawwifByPilgrim, busSupervisorByBus } = useMutawwifAndGuideLookup();

  const sharedRosterColumnContext = React.useMemo(
    () => ({
      packages,
      campaignSettings,
      mutawwifByPilgrim,
      busSupervisorByBus,
      isPilgrimPaymentConfirmed,
      getPilgrimPaidAmount: (p: Pilgrim) => getPilgrimPaidAmount(p, packages),
      getPilgrimExpectedPrice: (p: Pilgrim) => {
        const direct = Number(String(p.totalPackagePrice || '').replace(/[^0-9.]/g, ''));
        if (!Number.isNaN(direct) && direct > 0) return direct;
        const matched = packages.find(
          (pkg) => pkg.title.trim() === (p.selectedPackage || p.packageType || '').trim()
        );
        const pkgPrice = Number(String(matched?.price || '').replace(/[^0-9.]/g, ''));
        return !Number.isNaN(pkgPrice) && pkgPrice > 0 ? pkgPrice : 0;
      },
    }),
    [packages, campaignSettings, mutawwifByPilgrim, busSupervisorByBus]
  );

  const handleManualSync = async () => {
    if (!onRefreshData || isSyncingData) return;
    setIsSyncingData(true);
    try {
      await onRefreshData();
      const now = new Date();
      setLastSyncTime(now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.error('Error during manual sync:', err);
    } finally {
      setIsSyncingData(false);
    }
  };

  useEffect(() => {
    if (adminLoggedIn && pilgrims.length === 0 && onRefreshData) {
      handleManualSync();
    }
  }, [adminLoggedIn, pilgrims.length, onRefreshData]);

  const [showStaffPin, setShowStaffPin] = useState(false);
  const [showOwnPin, setShowOwnPin] = useState(false);
  const [ownPasswordError, setOwnPasswordError] = useState('');

  const STAFF_DOMAIN_OPTIONS = [
    { value: '@alqaemhajj.com', label: '@alqaemhajj.com (نطاق القافلة الرسمي)' },
    { value: '@gmail.com', label: '@gmail.com (نطاق Google المعتمد)' },
    { value: '@alqaem.org', label: '@alqaem.org (نطاق القافلة البديل)' },
    { value: '', label: 'بدون نطاق (اسم مستخدم مباشر)' },
  ];

  const splitUsernameAndDomain = (rawUsername?: string): { localPart: string; domain: string } => {
    const clean = (rawUsername || '').trim().toLowerCase();
    if (!clean.includes('@')) {
      return { localPart: clean, domain: '' };
    }
    const [localPart, domPart] = clean.split('@');
    const fullDom = `@${domPart || 'alqaemhajj.com'}`;
    return { localPart: localPart || '', domain: fullDom };
  };

  const [activeTab, setActiveTab] = useState<
    | 'dashboard'
    | 'pilgrims'
    | 'busBoarding'
    | 'flightsList'
    | 'housingList'
    | 'healthList'
    | 'companionsList'
    | 'excluded'
    | 'religiousGuidance'
    | 'marjiList'
    | 'manasikGuide'
    | 'hajjTimeline'
    | 'announcements'
    | 'notifications'
    | 'packages'
    | 'paymentsList'
    | 'giftDashboard'
    | 'giftRegistry'
    | 'giftFollowUp'
    | 'giftReports'
    | 'staff'
    | 'settings'
    | 'seasons'
    | 'formBuilder'
    | 'knowledgeBase'
    | 'advisorManager'
    | 'activityLog'
    | 'feedback'
  >((externalActiveTab as any) || 'dashboard');
  const [selectedReligiousUnit, setSelectedReligiousUnit] = useState<ReligiousUnitKey>('dashboard');
  const [expandedMainMenu, setExpandedMainMenu] = useState<
    'pilgrimsGroup' | 'religiousGroup' | 'financeGroup' | 'giftsGroup' | 'settingsGroup' | null
  >(null);

  useEffect(() => {
    if (externalActiveTab && externalActiveTab !== activeTab) {
      setActiveTab(externalActiveTab as any);
    }
  }, [externalActiveTab]);

  useEffect(() => {
    if (onActiveTabChange) {
      onActiveTabChange(activeTab);
    }
    if (
      activeTab === 'pilgrims' ||
      activeTab === 'busBoarding' ||
      activeTab === 'flightsList' ||
      activeTab === 'housingList' ||
      activeTab === 'healthList' ||
      activeTab === 'companionsList' ||
      activeTab === 'excluded'
    ) {
      setExpandedMainMenu('pilgrimsGroup');
    } else if (
      activeTab === 'religiousGuidance' ||
      activeTab === 'marjiList' ||
      activeTab === 'hajjTimeline'
    ) {
      setExpandedMainMenu('religiousGroup');
    } else if (activeTab === 'paymentsList' || activeTab === 'packages') {
      setExpandedMainMenu('financeGroup');
    } else if (
      activeTab === 'giftDashboard' ||
      activeTab === 'giftRegistry' ||
      activeTab === 'giftFollowUp' ||
      activeTab === 'giftReports'
    ) {
      setExpandedMainMenu('giftsGroup');
    } else if (activeTab === 'settings' || activeTab === 'seasons' || activeTab === 'formBuilder' || activeTab === 'advisorManager' || activeTab === 'staff' || activeTab === 'activityLog') {
      setExpandedMainMenu('settingsGroup');
    } else {
      setExpandedMainMenu(null);
    }
  }, [activeTab]);

  // Search & Filter for Pilgrims
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentDeclarationFilter, setPaymentDeclarationFilter] = useState<'all' | 'paid' | 'reported' | 'approved' | 'unpaid'>('all');
  const [vaccinationFilter, setVaccinationFilter] = useState<'all' | 'vaccinated' | 'unvaccinated'>('all');
  const [seasonFilter, setSeasonFilter] = useState<'all' | '1448' | 'previous'>('all');
  const [marjiFilter, setMarjiFilter] = useState('all');
  const [busFilter, setBusFilter] = useState('all');
  const [flightFilter, setFlightFilter] = useState<'flight_pilgrims' | 'assigned' | 'unassigned'>('flight_pilgrims');
  const [housingFilter, setHousingFilter] = useState<'all' | 'both_assigned' | 'makkah_unassigned' | 'madinah_unassigned' | 'mina_unassigned' | 'unassigned' | 'madinah_private_requested'>('all');
  const [newBankNameInput, setNewBankNameInput] = useState('');
  const [bankSavedNotice, setBankSavedNotice] = useState(false);
  const [healthFilter, setHealthFilter] = useState<'all' | 'with_conditions' | 'mobility_aid' | 'chronic_disease' | 'speech_difficulty' | 'healthy'>('with_conditions');
  const [healthPaymentFilter, setHealthPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [healthVaccinationFilter, setHealthVaccinationFilter] = useState<'all' | 'vaccinated' | 'unvaccinated'>('all');
  const [financeFilter, setFinanceFilter] = useState<'confirmed' | 'all'>('confirmed');
  const [housingQuickSaveSuccessId, setHousingQuickSaveSuccessId] = useState<string | null>(null);
  const [busCapacityWarning, setBusCapacityWarning] = useState<string | null>(null);
  const [editModalBusError, setEditModalBusError] = useState<string | null>(null);
  const [editingPilgrim, setEditingPilgrim] = useState<Pilgrim | null>(null);

  // Announcement modal / form state
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [isNewAnnouncement, setIsNewAnnouncement] = useState(false);
  const [annForm, setAnnForm] = useState<{
    title: string;
    category: 'هام' | 'توجيهات' | 'مواعيد';
    date: string;
    content: string;
    fontSize: NonNullable<Announcement['fontSize']>;
    isBold: boolean;
    textAlign: NonNullable<Announcement['textAlign']>;
    imageUrl: string;
    videoUrl: string;
    displaySettings: {
      showImage: boolean;
      showVideo: boolean;
      enableLightbox: boolean;
      highlightCard: boolean;
    };
  }>({
    title: '',
    category: 'هام',
    date: new Date().toISOString().split('T')[0],
    content: '',
    fontSize: 'normal',
    isBold: false,
    textAlign: 'right',
    imageUrl: '',
    videoUrl: '',
    displaySettings: {
      showImage: true,
      showVideo: true,
      enableLightbox: true,
      highlightCard: false,
    },
  });
  const [activeAnnToolTab, setActiveAnnToolTab] = useState<'none' | 'image' | 'video'>('none');
  const [isUploadingAnnImage, setIsUploadingAnnImage] = useState(false);
  const [isUploadingAnnVideo, setIsUploadingAnnVideo] = useState(false);
  const [annMediaProgress, setAnnMediaProgress] = useState(0);
  const [annMediaError, setAnnMediaError] = useState('');

  // Package modal / form state
  const [editingPackage, setEditingPackage] = useState<HajjPackage | null>(null);
  const [isNewPackage, setIsNewPackage] = useState(false);
  const [isUploadingPkgImage, setIsUploadingPkgImage] = useState(false);
  const [pkgSaveLoading, setPkgSaveLoading] = useState(false);
  const [annSaveLoading, setAnnSaveLoading] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState('');
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [backupExportResult, setBackupExportResult] = useState<{
    fileName: string;
    totalCollections: number;
    totalDocuments: number;
    failedCollections: string[];
  } | null>(null);
  const [isRunningMediaAudit, setIsRunningMediaAudit] = useState(false);
  const [mediaAuditResult, setMediaAuditResult] = useState<{
    totalAssetsScanned: number;
    orphansDeleted: number;
    protectedArchivedCount?: number;
    base64MigratedCount: number;
    bytesSavedEstimate: number;
  } | null>(null);

  // Season-Aware Media Policy & Archive Picker States
  const activeSeasonRecord = (seasons || []).find((s) => s.status === 'active');
  const currentSeasonYear =
    activeSeasonRecord?.hijriYear || getActiveSeasonYear(campaignSettings) || '1448';
  const currentSeasonId = activeSeasonRecord?.id || normalizeSeasonId(currentSeasonYear);
  const currentSeasonLabel = activeSeasonRecord?.name || `حج ${currentSeasonYear}هـ`;

  const [pkgMediaAssetId, setPkgMediaAssetId] = useState<string | undefined>(undefined);
  const [annImageAssetId, setAnnImageAssetId] = useState<string | undefined>(undefined);
  const [annVideoAssetId, setAnnVideoAssetId] = useState<string | undefined>(undefined);
  const [pendingDuplicatePrompt, setPendingDuplicatePrompt] = useState<{
    file: File;
    kind: 'image' | 'video';
    target: 'pkg' | 'ann_image' | 'ann_video';
    existingMatch: MediaAssetMetadata;
    isReplacing: boolean;
  } | null>(null);
  const [archivePickerTarget, setArchivePickerTarget] = useState<
    'pkg' | 'ann_image' | 'ann_video' | null
  >(null);

  useEffect(() => {
    setPkgMediaAssetId(editingPackage?.mediaAssetId);
  }, [editingPackage, isNewPackage]);

  useEffect(() => {
    setAnnImageAssetId(editingAnnouncement?.imageAssetId);
    setAnnVideoAssetId(editingAnnouncement?.videoAssetId);
  }, [editingAnnouncement, isNewAnnouncement]);

  const executeSeasonAwareMediaUpload = async (params: {
    file: File;
    kind: 'image' | 'video';
    target: 'pkg' | 'ann_image' | 'ann_video';
    choice: DuplicateDecisionChoice;
    existingMatch?: MediaAssetMetadata;
  }) => {
    const { file, kind, target, choice, existingMatch } = params;
    const targetRecordId =
      target === 'pkg'
        ? isNewPackage
          ? 'packages/new'
          : `packages/${editingPackage?.id || 'pkg'}`
        : isNewAnnouncement
        ? 'announcements/new'
        : `announcements/${editingAnnouncement?.id || 'ann'}`;

    const replacingUrl =
      target === 'pkg'
        ? pkgForm.image
        : target === 'ann_image'
        ? annForm.imageUrl
        : annForm.videoUrl;

    if (target === 'pkg') setIsUploadingPkgImage(true);
    else if (target === 'ann_image') {
      setAnnMediaError('');
      setIsUploadingAnnImage(true);
      setAnnMediaProgress(5);
    } else {
      setAnnMediaError('');
      setIsUploadingAnnVideo(true);
      setAnnMediaProgress(5);
    }

    try {
      let asset: MediaAssetMetadata | null = null;
      if (choice === 'reuse_existing' && existingMatch) {
        asset = await reuseExistingMediaAsset(existingMatch.id, {
          linkedRecordId: targetRecordId,
          seasonId: currentSeasonId,
          seasonName: currentSeasonLabel,
        });
      }

      if (!asset) {
        asset = await uploadOptimizedMedia(file, {
          kind,
          linkedRecordId: targetRecordId,
          seasonId: currentSeasonId,
          seasonName: currentSeasonLabel,
          duplicateResolution: choice,
          existingAssetIdToReuse: existingMatch?.id,
          replacingAssetUrlOrId: replacingUrl || undefined,
          maxDimension: 1280,
          quality: 0.82,
          generateThumbnail: kind === 'image',
          cloudinaryConfig: campaignSettings?.cloudinaryConfig,
          onProgress: (pct) => {
            if (target !== 'pkg') setAnnMediaProgress(pct);
          },
        });
      }

      if (target === 'pkg') {
        setPkgForm((prev) => ({ ...prev, image: asset!.url }));
        setPkgMediaAssetId(asset.id);
      } else if (target === 'ann_image') {
        setAnnForm((prev) => ({
          ...prev,
          imageUrl: asset!.url,
          displaySettings: { ...prev.displaySettings, showImage: true },
        }));
        setAnnImageAssetId(asset.id);
      } else {
        setAnnForm((prev) => ({
          ...prev,
          videoUrl: asset!.url,
          displaySettings: { ...prev.displaySettings, showVideo: true },
        }));
        setAnnVideoAssetId(asset.id);
      }
    } catch (err: any) {
      if (target !== 'pkg') {
        setAnnMediaError(err?.message || 'تعذر رفع الملف إلى وحدة التخزين');
      }
    } finally {
      if (target === 'pkg') setIsUploadingPkgImage(false);
      else if (target === 'ann_image') {
        setIsUploadingAnnImage(false);
        setAnnMediaProgress(0);
      } else {
        setIsUploadingAnnVideo(false);
        setAnnMediaProgress(0);
      }
    }
  };

  const handleInteractiveMediaSelection = async (
    file: File,
    kind: 'image' | 'video',
    target: 'pkg' | 'ann_image' | 'ann_video'
  ) => {
    try {
      const inspection = await inspectMediaFileBeforeUpload(file, kind);
      const isReplacing = Boolean(
        target === 'pkg'
          ? pkgForm.image
          : target === 'ann_image'
          ? annForm.imageUrl
          : annForm.videoUrl
      );

      if (inspection.isDuplicate && inspection.primaryMatch) {
        setPendingDuplicatePrompt({
          file,
          kind,
          target,
          existingMatch: inspection.primaryMatch,
          isReplacing,
        });
        return;
      }

      await executeSeasonAwareMediaUpload({
        file,
        kind,
        target,
        choice: isReplacing ? 'upload_modified_version' : 'reuse_existing',
      });
    } catch {
      await executeSeasonAwareMediaUpload({
        file,
        kind,
        target,
        choice: 'reuse_existing',
      });
    }
  };
  const [isAddingNewPilgrim, setIsAddingNewPilgrim] = useState(false);

  const openAddNewPilgrimModal = (defaultPkgTitle?: string) => {
    const matchedPkg = packages.find((p) => p.title === defaultPkgTitle);
    const isAir =
      (defaultPkgTitle || '').includes('طيران') ||
      matchedPkg?.transport === 'طائرة' ||
      (matchedPkg?.transport || '').includes('طيران');
    const seqNum = 1001 + (pilgrims.length || Math.floor(Date.now() % 9000));
    setEditModalBusError(null);
    setIsAddingNewPilgrim(true);
    setEditingPilgrim({
      id: `admin_${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
      termsAccepted: 'نعم',
      firstName: '',
      secondName: '',
      thirdName: '',
      lastName: '',
      englishFullName: '',
      gender: 'ذكر',
      nationality: 'سعودي',
      nationalId: '',
      idIssueDate: '',
      idIssueDateHijri: '',
      idExpiryDate: '',
      idExpiryDateHijri: '',
      birthDate: '',
      birthDateHijri: '',
      mobile: '',
      whatsapp: '',
      email: '',
      bankAccountName: '',
      iban: '',
      bankName: (campaignSettings?.approvedBanks || defaultCampaignSettings.approvedBanks || []).find((b) => b.isActive !== false)?.name || 'بنك الرياض',
      transport: isAir ? 'طائرة' : 'باص',
      hajjType: 'تمتع',
      lastHajjYear: '',
      currentMarji: campaignSettings?.marjiList?.[0] || 'السيستاني',
      customMarji: '',
      previousMarji: '',
      madinahPrivateRoomRequested: false,
      madinahPrivateRoomNote: '',
      hasMahram: false,
      mahramDetails: [],
      mobilityIndependence: 'نعم',
      status: 'مقبول ومؤكد',
      selectedPackage: defaultPkgTitle || '',
      totalPackagePrice: matchedPkg?.price || '',
      registrationReference: String(seqNum),
    });
  };

  const [pkgForm, setPkgForm] = useState<{
    title: string;
    type: string;
    price: string;
    transport: string;
    accommodationMakkah: string;
    accommodationMadinah: string;
    campMina: string;
    featuresStr: string;
    image: string;
    showOnHomepage: boolean;
    maxCapacity: string;
    registrationDeadline: string;
    forceClose: boolean;
    forceCloseReason: string;
    formTemplateId: string;
    formTemplateName: string;
  }>({
    title: '',
    type: 'VIP طيران',
    price: '18,000 ريال',
    transport: 'طيران + باصات VIP',
    accommodationMakkah: 'فندق مكة المكرمة',
    accommodationMadinah: 'فندق المدينة المنورة',
    campMina: 'مخيم منى المطور',
    featuresStr: 'إقامة فاخرة, إشراف ديني, وجبات بوفيه',
    image: 'https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?auto=format&fit=crop&q=80&w=800',
    showOnHomepage: true,
    maxCapacity: '50',
    registrationDeadline: '',
    forceClose: false,
    forceCloseReason: 'مغلق لانتهاء الموسم',
    formTemplateId: '',
    formTemplateName: '',
  });

  // Staff User Modal / Form state
  const [isNewStaff, setIsNewStaff] = useState(false);
  const [editingStaff, setEditingStaff] = useState<AdminUser | null>(null);
  const [staffFormError, setStaffFormError] = useState('');
  const [isSavingStaff, setIsSavingStaff] = useState(false);
  const [staffDomain, setStaffDomain] = useState<string>('@alqaemhajj.com');
  const [staffForm, setStaffForm] = useState<{
    username: string;
    pin: string;
    fullName: string;
    role: 'مدير عام (Master Admin)' | 'مشرف إداري' | 'مشرف إرشاد وديني' | 'محاسب القافلة';
    permissions: {
      managePilgrims: boolean;
      manageAnnouncements: boolean;
      managePackages: boolean;
      manageStaff: boolean;
      manageFinance: boolean;
      manageReligiousGuide: boolean;
      manageTravelKit: boolean;
      manageGifts?: boolean;
    }
  }>({
    username: '',
    pin: '',
    fullName: '',
    role: 'مشرف إداري',
    permissions: {
      managePilgrims: true,
      manageAnnouncements: true,
      managePackages: false,
      manageStaff: false,
      manageFinance: false,
      manageReligiousGuide: false,
      manageTravelKit: false,
      manageGifts: true,
    }
  });

  // Campaign settings form state
  const [settingsForm, setSettingsForm] = useState<CampaignSettings>(() => {
    return {
      phone: campaignSettings.phone,
      whatsapp: campaignSettings.whatsapp,
      email: campaignSettings.email,
      address: campaignSettings.address,
      fontScale: campaignSettings.fontScale || 'normal',
      siteTexts: {
        topBarAnnouncement: campaignSettings.siteTexts?.topBarAnnouncement || 'قافلة القائم للحج والعمرة - موسم 1448هـ',
        topBarSubtext: campaignSettings.siteTexts?.topBarSubtext || 'الأحساء - المبرز',
        brandName: campaignSettings.siteTexts?.brandName || 'قافلة القائم',
        brandSubtitle: campaignSettings.siteTexts?.brandSubtitle || 'للحج والعمرة والزيارة',
        heroBadge: campaignSettings.siteTexts?.heroBadge || 'فتح باب التسجيل لحج موسم 1448 هـ - المقاعد محدودة',
        heroTitlePrefix: campaignSettings.siteTexts?.heroTitlePrefix || 'رفيقكم الموثوق في رحلة العمر',
        heroTitleHighlight: campaignSettings.siteTexts?.heroTitleHighlight || 'قافلة القائم',
        heroDescription: campaignSettings.siteTexts?.heroDescription || 'نقدم خدمات متكاملة وراقية لحجاج بيت الله الحرام والمعتمرين. إشراف ديني وإداري بخبرة سنوية طويلة، مخيمات مطورة في منى وعرفات، وسكن فندقي يليق بضيوف الرحمن.',
        registerButtonText: campaignSettings.siteTexts?.registerButtonText || 'استعراض باقات الحج والعمرة',
        portalButtonText: campaignSettings.siteTexts?.portalButtonText || 'بوابة الاستعلام للحاج',
        cardTitle: campaignSettings.siteTexts?.cardTitle || 'قافلة القائم للحج والعمرة',
        cardSubtitle: campaignSettings.siteTexts?.cardSubtitle || 'خدمة ضيوف الرحمن شرف وفخر لنا منذ سنوات طويلة',
        cardFeatures: campaignSettings.siteTexts?.cardFeatures || [
          'سكن فندقي فاخر في مكة المكرمة والمدينة المنورة',
          'مخيمات منى وعرفات المكيفة والمجهزة',
          'إشراف فقهي وإداري وطبي متكامل'
        ]
      },
      officialWebsiteUrl: campaignSettings.officialWebsiteUrl || '',
      socialAccounts: normalizeSocialAccountsMap(campaignSettings.socialAccounts),
      marjiList: campaignSettings.marjiList || [],
      approvedBanks:
        campaignSettings.approvedBanks && campaignSettings.approvedBanks.length > 0
          ? campaignSettings.approvedBanks
          : (defaultCampaignSettings.approvedBanks || []),
      busList: campaignSettings.busList,
      groupLocations: campaignSettings.groupLocations,
      youtubeConfig: campaignSettings.youtubeConfig,
      cloudinaryConfig: campaignSettings.cloudinaryConfig,
      operationalCostTarget: campaignSettings.operationalCostTarget,
      pilgrimStatsConfig: getEffectivePilgrimStatsConfig(campaignSettings),
      hajjDaysTimeline: campaignSettings.hajjDaysTimeline,
      ritualAudioGuides: campaignSettings.ritualAudioGuides || []
    };
  });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [pilgrimStatsSavedNotice, setPilgrimStatsSavedNotice] = useState(false);
  const [newHistYearInput, setNewHistYearInput] = useState('');
  const [newHistCountInput, setNewHistCountInput] = useState('');
  const [newHistNotesInput, setNewHistNotesInput] = useState('');

  // Keep full settingsForm synchronized when campaignSettings updates from Firestore or server REST API
  useEffect(() => {
    setSettingsForm((prev) => ({
      ...prev,
      phone: campaignSettings.phone || prev.phone,
      whatsapp: campaignSettings.whatsapp || prev.whatsapp,
      email: campaignSettings.email || prev.email,
      address: campaignSettings.address || prev.address,
      fontScale: campaignSettings.fontScale || prev.fontScale || 'normal',
      siteTexts: campaignSettings.siteTexts || prev.siteTexts,
      officialWebsiteUrl: campaignSettings.officialWebsiteUrl ?? prev.officialWebsiteUrl ?? '',
      socialAccounts: campaignSettings.socialAccounts
        ? normalizeSocialAccountsMap(campaignSettings.socialAccounts)
        : prev.socialAccounts,
      marjiList: campaignSettings.marjiList || prev.marjiList,
      approvedBanks:
        campaignSettings.approvedBanks && campaignSettings.approvedBanks.length > 0
          ? campaignSettings.approvedBanks
          : prev.approvedBanks || defaultCampaignSettings.approvedBanks || [],
      busList: campaignSettings.busList || prev.busList,
      groupLocations: campaignSettings.groupLocations || prev.groupLocations,
      youtubeConfig: campaignSettings.youtubeConfig || prev.youtubeConfig,
      cloudinaryConfig: campaignSettings.cloudinaryConfig || prev.cloudinaryConfig,
      operationalCostTarget: campaignSettings.operationalCostTarget ?? prev.operationalCostTarget,
      pilgrimStatsConfig: campaignSettings.pilgrimStatsConfig
        ? getEffectivePilgrimStatsConfig(campaignSettings)
        : prev.pilgrimStatsConfig,
      hajjDaysTimeline: campaignSettings.hajjDaysTimeline || prev.hajjDaysTimeline,
      ritualAudioGuides: campaignSettings.ritualAudioGuides || prev.ritualAudioGuides,
      advisorConfig: campaignSettings.advisorConfig || prev.advisorConfig,
    }));
  }, [campaignSettings]);
  const [todayActivityLogsCount, setTodayActivityLogsCount] = useState<number>(0);

  // Lightweight server-side count for today's activities ONLY (no full-collection download!)
  useEffect(() => {
    let cancelled = false;
    const refreshTodayCount = async () => {
      try {
        const count = await getActivityLogsDayCount(getLocalDateString());
        if (!cancelled) {
          setTodayActivityLogsCount(count);
        }
      } catch {
        // Non-blocking badge count
      }
    };

    void refreshTodayCount();

    const handleLocalLogEvent = () => {
      setTodayActivityLogsCount((prev) => prev + 1);
    };
    window.addEventListener('qaem-activity-logged', handleLocalLogEvent);

    return () => {
      cancelled = true;
      window.removeEventListener('qaem-activity-logged', handleLocalLogEvent);
    };
  }, []);

  // Change own password & Security/Trusted Devices modal state
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showUserSecurityModal, setShowUserSecurityModal] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [isSavingOwnPassword, setIsSavingOwnPassword] = useState(false);

  // Official PDF payment receipt modal state
  const [officialReceiptPilgrim, setOfficialReceiptPilgrim] = useState<Pilgrim | null>(null);

  const handleApprovePilgrimPaymentDeclaration = (targetPilgrim: Pilgrim, approve: boolean) => {
    const reviewerName =
      currentAdminUser?.fullName || currentAdminUser?.username || 'الإدارة المالية';
    const nowIso = new Date().toISOString();
    const todayDate = nowIso.split('T')[0];
    const payInfo = getPilgrimPaymentDeclaration(targetPilgrim);

    const updated: Pilgrim = approve
      ? {
          ...targetPilgrim,
          paymentApprovedByAdmin: true,
          paymentApprovedBy: reviewerName,
          paymentApprovedAt: nowIso,
          paymentReceived: true,
          status: 'مكتمل الدفع',
          paymentReceiptDate:
            targetPilgrim.paymentReportedDate || targetPilgrim.paymentReceiptDate || todayDate,
        }
      : {
          ...targetPilgrim,
          paymentApprovedByAdmin: false,
          paymentReceived: false,
          status: targetPilgrim.status === 'مكتمل الدفع' ? 'تم القبول' : targetPilgrim.status,
        };

    onUpdatePilgrim(updated);

    void recordActivityLog({
      adminId: currentAdminUser?.id,
      adminName: reviewerName,
      username: currentAdminUser?.username,
      userRole: currentAdminUser?.role || 'الإدارة العامة',
      category: 'المالية والإيصالات',
      action: approve ? 'اعتماد حالة سداد الحاج من الإدارة' : 'إلغاء اعتماد سداد الحاج',
      target: `${targetPilgrim.firstName} ${targetPilgrim.lastName} (${targetPilgrim.nationalId})`,
      details: approve
        ? `تم اعتماد سداد الحاج ${targetPilgrim.firstName} ${targetPilgrim.lastName} رسمياً من الإدارة${payInfo.formattedDate ? ` — تاريخ السداد: ${payInfo.formattedDate}` : ''}.`
        : `تم إلغاء اعتماد السداد للحاج ${targetPilgrim.firstName} ${targetPilgrim.lastName}.`,
    });
  };

  const renderPaymentDeclarationStatusCell = (pilgrim: Pilgrim) => {
    const payInfo = getPilgrimPaymentDeclaration(pilgrim);
    return (
      <div className="flex flex-col items-start gap-1.5 min-w-[165px]">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black whitespace-nowrap ${
            payInfo.isApproved
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/35'
              : payInfo.key === 'reported'
              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/35'
              : 'bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60'
          }`}
        >
          {payInfo.label}
        </span>

        {payInfo.formattedDate && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-tight">
            {payInfo.formattedDate}
          </span>
        )}

        {!payInfo.isApproved ? (
          <button
            type="button"
            onClick={() => handleApprovePilgrimPaymentDeclaration(pilgrim, true)}
            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black transition cursor-pointer whitespace-nowrap"
            title="تغيير حالة السداد إلى معتمد من الإدارة ✓"
          >
            اعتماد من الإدارة ✓
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleApprovePilgrimPaymentDeclaration(pilgrim, false)}
            className="text-[10px] font-bold text-slate-400 hover:text-amber-500 transition cursor-pointer"
          >
            إلغاء الاعتماد
          </button>
        )}
      </div>
    );
  };

  const renderPaymentDeclarationDateCell = (pilgrim: Pilgrim) => {
    const payInfo = getPilgrimPaymentDeclaration(pilgrim);
    return payInfo.formattedDate ? (
      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
        {payInfo.formattedDate}
      </span>
    ) : (
      <span className="text-xs text-slate-400">—</span>
    );
  };

  const renderVaccinationStatusCell = (pilgrim: Pilgrim) => {
    const vacInfo = getPilgrimVaccinationDeclaration(pilgrim);
    return (
      <div className="flex flex-col items-start gap-1 min-w-[140px]">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black whitespace-nowrap ${
            vacInfo.completed
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/35'
              : 'bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60'
          }`}
        >
          {vacInfo.shortLabel}
        </span>
        {vacInfo.formattedDate && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-tight">
            {vacInfo.formattedDate}
          </span>
        )}
      </div>
    );
  };

  const renderVaccinationDateCell = (pilgrim: Pilgrim) => {
    const vacInfo = getPilgrimVaccinationDeclaration(pilgrim);
    return vacInfo.formattedDate ? (
      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
        {vacInfo.formattedDate}
      </span>
    ) : (
      <span className="text-xs text-slate-400">—</span>
    );
  };

  // Confirm Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Mobile Hardware Back Button Guard: Close open modals instead of exiting the app
  const isAnyAdminModalOpen = Boolean(
    isNewStaff ||
      editingStaff ||
      editingPilgrim ||
      isNewAnnouncement ||
      editingAnnouncement ||
      isNewPackage ||
      editingPackage ||
      showChangePasswordModal ||
      showUserSecurityModal ||
      officialReceiptPilgrim ||
      confirmModal.isOpen
  );

  useEffect(() => {
    if (!isAnyAdminModalOpen) return;

    window.history.pushState({ qaemAdminModal: true }, '');

    const handlePopState = () => {
      setIsNewStaff(false);
      setEditingStaff(null);
      setStaffFormError('');
      setEditingPilgrim(null);
      setEditModalBusError(null);
      setIsNewAnnouncement(false);
      setEditingAnnouncement(null);
      setAnnMediaError('');
      setIsNewPackage(false);
      setEditingPackage(null);
      setShowChangePasswordModal(false);
      setShowUserSecurityModal(false);
      setOfficialReceiptPilgrim(null);
      setConfirmModal((prev) => ({ ...prev, isOpen: false }));
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isAnyAdminModalOpen]);

  const handleLogout = async () => {
    if (currentAdminUser) {
      await recordActivityLog({
        adminId: currentAdminUser.id,
        adminName: currentAdminUser.fullName,
        username: currentAdminUser.username,
        userRole: currentAdminUser.role,
        category: 'تسجيل دخول / خروج',
        action: 'تسجيل خروج من لوحة التحكم',
        target: `المستخدم: ${currentAdminUser.fullName} (${currentAdminUser.username})`,
      });
    }
    const { auth } = await import('../lib/firebase');
    await auth.signOut();
    setAdminLoggedIn(false);
    setCurrentAdminUser(null);
  };

  const [csvExportSuccess, setCsvExportSuccess] = useState<string | null>(null);
  const [officialReportModal, setOfficialReportModal] = useState<{
    title: string;
    subtitle?: string;
    category?: string;
    filterSummary?: string;
    filename: string;
    columns: string[];
    data: (string | number)[][];
    summaryCards?: { label: string; value: string | number }[];
    signatureRightLabel?: string;
    onExportExcel?: () => void;
  } | null>(null);

  // Automatic Audit Log whenever any official PDF/Print report is generated
  useEffect(() => {
    if (!officialReportModal || !currentAdminUser) return;
    recordActivityLog({
      adminId: currentAdminUser.id,
      adminName: currentAdminUser.fullName,
      username: currentAdminUser.email || currentAdminUser.username,
      userRole: currentAdminUser.role,
      category: 'تصدير الكشوفات والتقارير',
      severity: 'info',
      action: 'استخراج ومعاينة تقرير رسمي للطباعة / PDF',
      target: officialReportModal.title,
      details: `التصنيف: ${officialReportModal.category || 'عام'} | عدد السجلات: ${officialReportModal.data.length} | الملف: ${officialReportModal.filename}`,
    }).catch(() => {});
  }, [officialReportModal]);

  const handleExportCSV = (targetList: Pilgrim[] = pilgrims, customLabel = 'كافة_الحجاج') => {
    const canExport =
      isGeneralAdminUser(currentAdminUser) ||
      canPerformOperation(currentAdminUser, 'pilgrims', 'export', campaignSettings.rolePermissionTemplates) ||
      canPerformOperation(currentAdminUser, 'finance', 'export', campaignSettings.rolePermissionTemplates) ||
      canPerformOperation(currentAdminUser, 'religious', 'export', campaignSettings.rolePermissionTemplates) ||
      canPerformOperation(currentAdminUser, 'housing_transport', 'export', campaignSettings.rolePermissionTemplates);

    if (!canExport) {
      setCsvExportSuccess('تنبيه أمني: لا يمتلك دورك الوظيفي الحالي صلاحية تصدير التقارير (Export).');
      setTimeout(() => setCsvExportSuccess(null), 4000);
      return;
    }

    if (!targetList || targetList.length === 0) {
      setCsvExportSuccess('تنبيه: لا توجد بيانات حجاج مسجلين لتصديرها حالياً.');
      setTimeout(() => setCsvExportSuccess(null), 4000);
      return;
    }

    const headers = [
      '# (التسلسل)',
      'الرقم التسلسلي المرجعي',
      'رقم التسلسل بالحملة',
      'رقم العضوية',
      'تاريخ التسجيل',
      'حالة الطلب',
      'استلام المستندات',
      'تأكيد استلام الدفع',
      'الباقة المختارة',
      'إجمالي سعر الباقة',
      'المبلغ المسدد / المدفوع',
      'المبلغ المحول',
      'المبلغ المتبقي',
      'رقم الحوالة البنكية / المرجع',
      'تاريخ التحويل البنكي',
      'الاسم الكامل',
      'الاسم الأول',
      'اسم الأب',
      'اسم الجد',
      'اسم العائلة',
      'الاسم الكامل بالإنجليزية',
      'الجنس',
      'الجنسية',
      'رقم الهوية الوطنية / الإقامة',
      'تاريخ إصدار الهوية (هجري / ميلادي)',
      'تاريخ انتهاء الهوية (هجري / ميلادي)',
      'تاريخ الميلاد (هجري / ميلادي)',
      'رقم الجوال',
      'رقم الواتساب',
      'البريد الإلكتروني',
      'اسم صاحب الحساب البنكي',
      'اسم البنك',
      'وسيلة المواصلات',
      'نوع الحج',
      'سنة آخر حجة',
      'مرجع التقليد الحالي',
      'مرجع التقليد السابق',
      'القدرة على الحركة دون مساعدة',
      'يحتاج مساعدة خاصة',
      'يعاني من آلام بالظهر',
      'صعوبة في النطق',
      'حالة الحمل (للإناث)',
      'الأمراض المزمنة / الحالات الصحية',
      'ملاحظات صحية أخرى',
      'وجود محرم / مرافقين',
      'عدد المرافقين',
      'بيانات المحرم / المرافقين (الاسم | الهوية | القرابة)',
      'طلب غرفة خاصة بالمدينة المنورة',
      'ملاحظة الغرفة الخاصة بالمدينة',
      'رقم غرفة سكن مكة المكرمة',
      'رقم غرفة السكن بالمدينة المنورة',
      'تسكين منى (المخيم / المقعد)',
      'رقم الباص / الحافلة',
      'رقم المقعد بالباص',
      'رحلة الطيران (الذهاب)',
      'رحلة الطيران (العودة)',
      'رقم التذكرة / الحجز (PNR)',
      'إشعارات الواتساب مفعلة',
      'رقم الواتساب المخصص للإشعارات',
      'سبب الرفض / ملاحظات الحالة',
      'الموافقة على الشروط'
    ];

    const dynMainExcel = extractDynamicReportColumns(targetList);
    if (dynMainExcel.columns.length > 0) {
      headers.push(...dynMainExcel.columns.map((c) => c.label));
    }

    const escapeCSV = (val: any) => {
      if (val === undefined || val === null) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = targetList.map((p, index) => [
      index + 1,
      p.registrationReference || (1001 + index),
      p.pilgrimSequenceNumber || (index + 1),
      p.membershipNumber || `QAEM-1448-${1001 + index}`,
      p.createdAt || '',
      p.status || 'قيد المراجعة',
      p.documentsReceived ? 'نعم' : 'لا',
      p.paymentReceived ? 'نعم (مؤكد)' : 'غير مؤكد',
      p.selectedPackage || 'غير محدد',
      p.totalPackagePrice || '',
      p.paidAmount || (isPilgrimPaymentConfirmed(p) ? `${getPilgrimPaidAmount(p, packages).toLocaleString('en-US')} ريال` : '0 ريال'),
      p.transferAmount || '',
      p.remainingAmount || '',
      p.bankReferenceNumber || '',
      p.paymentReceiptDate || '',
      `${p.firstName || ''} ${p.secondName || ''} ${p.thirdName || ''} ${p.lastName || ''}`.replace(/\s+/g, ' ').trim(),
      p.firstName || '',
      p.secondName || '',
      p.thirdName || '',
      p.lastName || '',
      p.englishFullName || '',
      p.gender || '',
      p.nationality || '',
      p.nationalId || '',
      formatDualDateSummary(p.idIssueDate, p.idIssueDateHijri) || p.idIssueDate || '',
      formatDualDateSummary(p.idExpiryDate, p.idExpiryDateHijri) || p.idExpiryDate || '',
      formatDualDateSummary(p.birthDate, p.birthDateHijri) || p.birthDate || '',
      p.mobile || '',
      p.whatsapp || '',
      p.email || '',
      p.bankAccountName || '',
      p.bankName || '',
      p.transport || '',
      p.hajjType || '',
      p.lastHajjYear || '',
      p.currentMarji || '',
      p.previousMarji || '',
      p.mobilityIndependence || '',
      p.needsAssistance ? 'نعم' : 'لا',
      p.hasBackPain ? 'نعم' : 'لا',
      p.hasSpeechDifficulty ? 'نعم' : 'لا',
      p.isPregnant ? 'نعم' : 'لا',
      (p.healthConditions || []).join(' - ') || 'سليم ولله الحمد',
      p.otherHealthCondition || '',
      p.hasMahram ? 'نعم' : 'لا',
      p.hasMahram && p.mahramDetails ? p.mahramDetails.length : 0,
      (p.mahramDetails || [])
        .map((m) => `${m.name || ''}${m.nationalId ? ` | الهوية: ${m.nationalId}` : ''} (${m.relation || ''})`)
        .join(' — ') || '',
      p.madinahPrivateRoomRequested ? 'نعم (طلب غرفة خاصة)' : 'لا',
      p.madinahPrivateRoomNote || '',
      p.roomNumberMakkah || p.roomNumber || 'غير محدد',
      p.roomNumberMadinah || 'غير محدد',
      p.roomNumberMina || 'غير محدد',
      p.busNumber || 'غير محدد',
      p.busSeat || 'غير محدد',
      p.flightNumberOutbound || 'غير محدد',
      p.flightNumberReturn || 'غير محدد',
      p.flightTicketNumber || 'غير محدد',
      p.whatsappNotificationsEnabled ? 'مفعلة' : 'غير مفعلة',
      p.whatsappNotificationMobile || '',
      p.rejectionReason || p.statusNotes || '',
      p.termsAccepted || 'نعم',
      ...dynMainExcel.getRowValues(p),
    ]);

    const confirmedCount = targetList.filter((p) => isPilgrimPaymentConfirmed(p)).length;
    const busCountInList = targetList.filter((p) => p.transport === 'باص').length;
    const flightCountInList = targetList.filter((p) => p.transport === 'طائرة').length;
    const dateStr = new Date().toISOString().split('T')[0];
    const cleanLabel = customLabel.replace(/_/g, ' ');

    void exportAlQaemExcelReport({
      reportTitle: `كشف بيانات الحجاج — ${cleanLabel}`,
      subtitle: `السجل الشامل لبيانات الحجاج والتواصل والباقات والسكن والمواصلات (${targetList.length} حاج)`,
      category: 'كشوف وسجلات الحجاج المعتمدة',
      filename: `قافلة_القائم_${customLabel}_${dateStr}`,
      columns: headers,
      rows,
      generatedBy: currentAdminUser?.fullName || 'الإدارة العامة',
      summaryCards: [
        { label: 'إجمالي السجلات في الكشف', value: `${targetList.length} حاج` },
        { label: 'المؤكد دفعهم', value: `${confirmedCount} حاج` },
        { label: 'حجاج الحافلات (البر)', value: `${busCountInList} حاج` },
        { label: 'حجاج الطيران (الجو)', value: `${flightCountInList} حاج` },
      ],
    });

    setCsvExportSuccess(
      `تم تصدير ملف Excel (.xlsx) الرسمي بالهوية البصرية لنظام قافلة القائم (${targetList.length} سجل)!`
    );
    setTimeout(() => setCsvExportSuccess(null), 5000);

    recordActivityLog({
      adminId: currentAdminUser?.id || 'admin',
      adminName: currentAdminUser?.fullName || 'المدير العام',
      username: currentAdminUser?.username || 'admin',
      userRole: currentAdminUser?.role || 'مدير عام (Master Admin)',
      category: 'إدارة الحجاج',
      action: `تصدير كشف بيانات الحجاج بصيغة CSV (${customLabel})`,
      target: `عدد السجلات المصدرة: ${targetList.length} حاج`,
    }).catch(() => {});
  };

  // Quick Status & Document / Payment Update Handlers
  const handleQuickStatusChange = (pilgrim: Pilgrim, newStatus: Pilgrim['status']) => {
    const seq = pilgrims.findIndex(p => p.nationalId === pilgrim.nationalId) + 1;
    const isPaid = newStatus === 'مكتمل' || newStatus === 'مكتمل الدفع';
    const isAccepted = newStatus === 'تم القبول' || newStatus === 'مقبول ومؤكد' || isPaid;

    const updated: Pilgrim = {
      ...pilgrim,
      status: newStatus,
      applicationStatus: isPaid ? 'مكتمل' : isAccepted ? 'تم القبول' : 'قيد المراجعة',
      documentsReceived: isAccepted ? true : (pilgrim.documentsReceived ?? false),
      paymentReceived: isPaid ? true : (pilgrim.paymentReceived ?? false),
      membershipNumber: pilgrim.membershipNumber || `QAEM-1448-${pilgrim.registrationReference || '1001'}`,
      pilgrimSequenceNumber: pilgrim.pilgrimSequenceNumber || (seq > 0 ? seq : undefined),
      paymentReceiptDate: isPaid ? (pilgrim.paymentReceiptDate || new Date().toISOString()) : pilgrim.paymentReceiptDate
    };
    onUpdatePilgrim(updated);
  };

  const handleToggleDocuments = (pilgrim: Pilgrim) => {
    const nextReceived = !pilgrim.documentsReceived;
    let nextStatus = pilgrim.status;
    if (nextReceived && (pilgrim.status === 'قيد المراجعة' || !pilgrim.status)) {
      nextStatus = 'تم القبول';
    } else if (!nextReceived && pilgrim.status === 'تم القبول') {
      nextStatus = 'قيد المراجعة';
    }
    const updated: Pilgrim = {
      ...pilgrim,
      documentsReceived: nextReceived,
      status: nextStatus,
      applicationStatus: (nextStatus === 'مكتمل' || nextStatus === 'مكتمل الدفع') ? 'مكتمل' : (nextStatus === 'تم القبول' || nextStatus === 'مقبول ومؤكد') ? 'تم القبول' : 'قيد المراجعة'
    };
    onUpdatePilgrim(updated);
  };

  const handleTogglePayment = (pilgrim: Pilgrim) => {
    const isCurrentlyPaid = pilgrim.status === 'مكتمل' || pilgrim.status === 'مكتمل الدفع' || pilgrim.paymentReceived === true;
    const nextPaid = !isCurrentlyPaid;
    const seq = pilgrims.findIndex(p => p.nationalId === pilgrim.nationalId) + 1;
    const nextStatus: Pilgrim['status'] = nextPaid ? 'مكتمل' : (pilgrim.documentsReceived ? 'تم القبول' : 'قيد المراجعة');

    const updated: Pilgrim = {
      ...pilgrim,
      paymentReceived: nextPaid,
      status: nextStatus,
      applicationStatus: nextPaid ? 'مكتمل' : (pilgrim.documentsReceived ? 'تم القبول' : 'قيد المراجعة'),
      paymentReceiptDate: nextPaid ? (pilgrim.paymentReceiptDate || new Date().toISOString()) : undefined,
      membershipNumber: pilgrim.membershipNumber || `QAEM-1448-${pilgrim.registrationReference || '1001'}`,
      pilgrimSequenceNumber: pilgrim.pilgrimSequenceNumber || (seq > 0 ? seq : undefined)
    };
    onUpdatePilgrim(updated);
  };

  // Lists separation: المعتذر والمرفوض والمحذوف ترحل بياناتهم إلى إدارة المستبعدين وتزال من سجل الحجاج المسجلين النشط
  const activePilgrims = pilgrims.filter(
    p => p.status !== 'معتذر' && p.status !== 'مرفوض' && p.status !== 'محذوف' && !p.isDeleted
  );
  const excludedPilgrimsList = pilgrims.filter(
    p => p.status === 'معتذر' || p.status === 'مرفوض' || p.status === 'محذوف' || p.isDeleted
  );

  // Recharts Dashboard Cards metrics & dataset (focused on active pilgrims)
  const totalPilgrimsCount = activePilgrims.length;
  const confirmedPaymentsCount = activePilgrims.filter(
    p => p.status === 'مكتمل' || p.status === 'مكتمل الدفع' || p.paymentReceived === true
  ).length;
  const pendingReviewCount = activePilgrims.filter(
    p => p.status === 'قيد المراجعة' || (!p.status && !p.paymentReceived)
  ).length;
  const acceptedCount = activePilgrims.filter(
    p => p.status === 'تم القبول' || p.status === 'مقبول ومؤكد' || p.documentsReceived === true
  ).length;
  const apologizedCount = excludedPilgrimsList.filter(p => p.status === 'معتذر').length;
  const rejectedCount = excludedPilgrimsList.filter(p => p.status === 'مرفوض').length;
  const deletedCount = excludedPilgrimsList.filter(p => p.status === 'محذوف' || (p.isDeleted && p.status !== 'معتذر' && p.status !== 'مرفوض')).length;

  const confirmedPct = totalPilgrimsCount > 0 ? Math.round((confirmedPaymentsCount / totalPilgrimsCount) * 100) : 0;
  const pendingPct = totalPilgrimsCount > 0 ? Math.round((pendingReviewCount / totalPilgrimsCount) * 100) : 0;
  const acceptedPct = totalPilgrimsCount > 0 ? Math.round((acceptedCount / totalPilgrimsCount) * 100) : 0;

  // Mini Sparkline dataset for Total Pilgrims Card
  const totalChartData = [
    { name: 'فترة 1', count: Math.max(1, Math.floor(totalPilgrimsCount * 0.2)) },
    { name: 'فترة 2', count: Math.max(1, Math.floor(totalPilgrimsCount * 0.45)) },
    { name: 'فترة 3', count: Math.max(1, Math.floor(totalPilgrimsCount * 0.75)) },
    { name: 'فترة 4', count: Math.max(1, Math.floor(totalPilgrimsCount * 0.9)) },
    { name: 'المسجلين', count: Math.max(1, totalPilgrimsCount) }
  ];

  // Mini Bar dataset for Confirmed Payments Card
  const paymentBarData = [
    { name: 'مؤكد', value: confirmedPaymentsCount, fill: '#10b981' },
    { name: 'بانتظار السداد', value: Math.max(0, totalPilgrimsCount - confirmedPaymentsCount), fill: '#f59e0b' }
  ];

  // Mini Donut dataset for Pending Review Card
  const pendingPieData = [
    { name: 'قيد المراجعة', value: Math.max(0.01, pendingReviewCount), fill: '#3b82f6' },
    { name: 'مكتمل أو مقبول', value: Math.max(0.01, totalPilgrimsCount - pendingReviewCount), fill: '#334155' }
  ];

  // Mini Bar dataset for Accepted Documents Card
  const acceptedBarData = [
    { name: 'مستندات مقبولة', value: acceptedCount, fill: '#8b5cf6' },
    { name: 'بانتظار المستندات', value: Math.max(0, totalPilgrimsCount - acceptedCount), fill: '#475569' }
  ];

  const baseListForFiltering = activeTab === 'excluded' ? excludedPilgrimsList : activePilgrims;

  const filteredPilgrims = baseListForFiltering.filter(p => {
    const query = searchQuery.trim().toLowerCase();
    const fullName = `${p.firstName} ${p.secondName} ${p.thirdName} ${p.lastName}`.toLowerCase();
    const matchesSearch = !query ||
      fullName.includes(query) ||
      p.firstName.toLowerCase().includes(query) ||
      p.secondName.toLowerCase().includes(query) ||
      p.thirdName.toLowerCase().includes(query) ||
      p.lastName.toLowerCase().includes(query) ||
      p.nationalId.toLowerCase().includes(query) ||
      p.mobile.toLowerCase().includes(query) ||
      (p.pilgrimSequenceNumber !== undefined && String(p.pilgrimSequenceNumber).includes(query)) ||
      (p.membershipNumber && p.membershipNumber.toLowerCase().includes(query)) ||
      (p.registrationReference && p.registrationReference.toLowerCase().includes(query)) ||
      (p.englishFullName && p.englishFullName.toLowerCase().includes(query)) ||
      (p.rejectionReason && p.rejectionReason.toLowerCase().includes(query)) ||
      (p.statusNotes && p.statusNotes.toLowerCase().includes(query));

    let matchesStatus = true;
    if (statusFilter === 'all') {
      matchesStatus = true;
    } else if (statusFilter === 'مكتمل' || statusFilter === 'مكتمل الدفع') {
      matchesStatus = p.status === 'مكتمل' || p.status === 'مكتمل الدفع' || p.paymentReceived === true;
    } else if (statusFilter === 'تم القبول' || statusFilter === 'مقبول ومؤكد') {
      matchesStatus = p.status === 'تم القبول' || p.status === 'مقبول ومؤكد' || p.documentsReceived === true;
    } else if (statusFilter === 'قيد المراجعة') {
      matchesStatus = p.status === 'قيد المراجعة' || (!p.status && !p.paymentReceived);
    } else if (statusFilter === 'محذوف') {
      matchesStatus = p.status === 'محذوف' || Boolean(p.isDeleted && p.status !== 'معتذر' && p.status !== 'مرفوض');
    } else {
      matchesStatus = p.status === statusFilter;
    }

    let matchesSeason = true;
    if (seasonFilter === '1448') {
      matchesSeason = !p.hajjYear || p.hajjYear === '1448' || (p.season || '').includes('1448');
    } else if (seasonFilter === 'previous') {
      matchesSeason = Boolean(p.hajjYear && p.hajjYear !== '1448' && !(p.season || '').includes('1448'));
    }

    let matchesPaymentDecl = true;
    if (activeTab === 'pilgrims' && paymentDeclarationFilter !== 'all') {
      const payDecl = getPilgrimPaymentDeclaration(p);
      if (paymentDeclarationFilter === 'paid') matchesPaymentDecl = payDecl.isPaidOrReported;
      else if (paymentDeclarationFilter === 'reported') matchesPaymentDecl = payDecl.key === 'reported';
      else if (paymentDeclarationFilter === 'approved') matchesPaymentDecl = payDecl.isApproved;
      else if (paymentDeclarationFilter === 'unpaid') matchesPaymentDecl = !payDecl.isPaidOrReported;
    }

    let matchesVaccination = true;
    if (activeTab === 'pilgrims' && vaccinationFilter !== 'all') {
      const vacDecl = getPilgrimVaccinationDeclaration(p);
      matchesVaccination = vaccinationFilter === 'vaccinated' ? vacDecl.completed : !vacDecl.completed;
    }

    return matchesSearch && matchesStatus && matchesSeason && matchesPaymentDecl && matchesVaccination;
  });

  const roleTemplates = campaignSettings.rolePermissionTemplates;
  const isSuperAdminOwner = isSuperAdminUser(currentAdminUser);
  const isMasterAdmin = isGeneralAdminUser(currentAdminUser);
  // Creating/managing staff accounts and inspecting the Audit Log are strictly reserved for the Super Admin owner (alqaemhajj313@gmail.com)
  const canManageStaffAndRoles = Boolean(isSuperAdminOwner);
  const hasReligiousSupervisionPermission = Boolean(
    isMasterAdmin ||
      canPerformOperation(currentAdminUser, 'religious', 'view', roleTemplates) ||
      currentAdminUser?.permissions?.manageReligiousGuide ||
      normalizeOfficialRole(currentAdminUser?.role) === 'الإشراف الديني'
  );
  const canViewPilgrimsModule = Boolean(
    isMasterAdmin ||
      canPerformOperation(currentAdminUser, 'pilgrims', 'view', roleTemplates) ||
      currentAdminUser?.permissions?.managePilgrims
  );
  const canAccessPilgrimsMenu = Boolean(
    canViewPilgrimsModule ||
      canPerformOperation(currentAdminUser, 'housing_transport', 'view', roleTemplates) ||
      hasReligiousSupervisionPermission
  );
  const hasFinancePermission = Boolean(
    isMasterAdmin ||
      canPerformOperation(currentAdminUser, 'finance', 'view', roleTemplates) ||
      currentAdminUser?.permissions?.manageFinance ||
      normalizeOfficialRole(currentAdminUser?.role) === 'الإشراف المالي'
  );
  const canAccessPackagesModule = Boolean(
    isMasterAdmin ||
      canPerformOperation(currentAdminUser, 'packages', 'view', roleTemplates) ||
      currentAdminUser?.permissions?.managePackages
  );
  const canAccessFinanceMenu = Boolean(
    hasFinancePermission || canAccessPackagesModule
  );
  const canManageNotifications = Boolean(
    isMasterAdmin ||
      canPerformOperation(currentAdminUser, 'cultural', 'view', roleTemplates) ||
      currentAdminUser?.permissions?.manageNotifications ||
      currentAdminUser?.permissions?.manageAnnouncements ||
      currentAdminUser?.permissions?.manageCultural ||
      normalizeOfficialRole(currentAdminUser?.role) === 'الإشراف الثقافي'
  );
  const canManageGifts = Boolean(
    isMasterAdmin ||
      canPerformOperation(currentAdminUser, 'gifts_kit', 'view', roleTemplates) ||
      currentAdminUser?.permissions?.manageGifts ||
      currentAdminUser?.permissions?.managePilgrims
  );
  const canExportPilgrimsData = Boolean(
    isMasterAdmin ||
      canPerformOperation(currentAdminUser, 'pilgrims', 'export', roleTemplates) ||
      canPerformOperation(currentAdminUser, 'finance', 'export', roleTemplates)
  );

  const MAX_BUS_CAPACITY = 49;

  // Helper to check if a pilgrim has any recorded medical condition or special care need
  const hasPilgrimHealthCondition = (p: Pilgrim): boolean => {
    const validDiseases = (p.healthConditions || []).filter(
      (c) => c && c.trim() !== '' && c !== 'لا شيء مما ذكر'
    );
    const hasOther = Boolean(p.otherHealthCondition && p.otherHealthCondition.trim() !== '');
    const needsMobility =
      Boolean(p.needsAssistance) ||
      Boolean(p.hasBackPain) ||
      p.mobilityIndependence === 'لا' ||
      validDiseases.includes('صعوبة في الحركة');
    return (
      validDiseases.length > 0 ||
      hasOther ||
      needsMobility ||
      Boolean(p.isPregnant) ||
      Boolean(p.hasSpeechDifficulty)
    );
  };

  const pilgrimsWithHealthConditionsCount = activePilgrims.filter(hasPilgrimHealthCondition).length;
  const totalCompanionsRosterCount = activePilgrims.reduce((sum, p) => {
    const validCount = Array.isArray(p.mahramDetails)
      ? p.mahramDetails.filter(
          (m) => Boolean((m?.name || '').trim() || (m?.nationalId || '').trim() || (m?.relation || '').trim())
        ).length
      : 0;
    return sum + validCount;
  }, 0);

  // Authoritative helper to distinguish Air Travel (طيران) vs Bus Travel (حافلات)
  // Prevents any overlap between Flights and Buses unless modified from the Pilgrim Registry
  const isPilgrimAirTravel = (p: Pilgrim): boolean => {
    const pkg = (p.selectedPackage || '').trim();
    const trans = (p.transport || '').trim();
    if (pkg.includes('طيران') || trans === 'طائرة' || trans.includes('طيران')) {
      return true;
    }
    if (
      Boolean(p.flightNumberOutbound?.trim()) ||
      Boolean(p.flightNumberReturn?.trim()) ||
      Boolean(p.flightTicketNumber?.trim())
    ) {
      return true;
    }
    return false;
  };

  const isPilgrimBusTravel = (p: Pilgrim): boolean => !isPilgrimAirTravel(p);

  const airPilgrimsList = React.useMemo(
    () => activePilgrims.filter(p => isPilgrimInSeason(p, '1448') && isPilgrimAirTravel(p)),
    [activePilgrims]
  );

  const busPilgrimsList = React.useMemo(
    () => activePilgrims.filter(p => isPilgrimInSeason(p, '1448') && isPilgrimBusTravel(p)),
    [activePilgrims]
  );

  // Automatic Data Sanitization: If an Air-Travel pilgrim (e.g. باقة الحج المميزة (طيران))
  // accidentally had a busNumber or busSeat assigned or transport !== 'طائرة', clean it automatically
  useEffect(() => {
    if (!adminLoggedIn) return;
    activePilgrims.forEach((p) => {
      if (isPilgrimAirTravel(p)) {
        const hasAccidentalBus = Boolean((p.busNumber || '').trim()) || Boolean((p.busSeat || '').trim());
        const needsTransportSync = p.transport !== 'طائرة';
        if (hasAccidentalBus || needsTransportSync) {
          onUpdatePilgrim({
            ...p,
            transport: 'طائرة',
            busNumber: '',
            busSeat: '',
          });
        }
      }
    });
  }, [adminLoggedIn, activePilgrims]);

  // Dynamic Bus Fleet List: managed by supervisors instead of hardcoded 10 buses
  const BUS_OPTIONS = React.useMemo(() => {
    const savedBuses =
      Array.isArray(campaignSettings?.busList) && campaignSettings.busList.length > 0
        ? campaignSettings.busList
        : ['حافلة 1', 'حافلة 2'];
    const merged = [...savedBuses];
    busPilgrimsList.forEach((p) => {
      const b = (p.busNumber || '').trim();
      if (b && !merged.includes(b)) {
        merged.push(b);
      }
    });
    return merged;
  }, [campaignSettings?.busList, busPilgrimsList]);

  const getBusPassengersCount = (busName: string, excludePilgrimId?: string) => {
    const cleanBus = (busName || '').trim();
    if (!cleanBus) return 0;
    return busPilgrimsList.filter(
      (p) =>
        (p.busNumber || '').trim() === cleanBus &&
        p.id !== excludePilgrimId &&
        p.nationalId !== excludePilgrimId
    ).length;
  };

  const getNextBusName = () => {
    let nextNum = BUS_OPTIONS.length + 1;
    while (BUS_OPTIONS.includes(`حافلة ${nextNum}`)) {
      nextNum++;
    }
    return `حافلة ${nextNum}`;
  };

  const handleAddNewBus = () => {
    const newBusName = getNextBusName();
    const updatedList = [...BUS_OPTIONS, newBusName];
    onUpdateCampaignSettings({
      ...campaignSettings,
      busList: updatedList,
    });
    if (currentAdminUser) {
      recordActivityLog({
        adminId: currentAdminUser.id,
        adminName: currentAdminUser.fullName,
        username: currentAdminUser.username,
        userRole: currentAdminUser.role,
        category: 'إدارة الحجاج',
        action: 'إضافة حافلة جديدة للأسطول',
        target: newBusName,
        details: `تمت إضافة (${newBusName}) إلى قائمة حافلات القافلة (إجمالي الحافلات: ${updatedList.length})`,
      });
    }
    return newBusName;
  };

  const handleRemoveEmptyBus = (busName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const count = getBusPassengersCount(busName);
    if (count > 0 || BUS_OPTIONS.length <= 1) return;
    const updatedList = BUS_OPTIONS.filter((b) => b !== busName);
    if (busFilter === busName) {
      setBusFilter('all');
    }
    onUpdateCampaignSettings({
      ...campaignSettings,
      busList: updatedList,
    });
  };

  if (!adminLoggedIn) {
    return (
      <AdminAuthGate
        adminUsers={adminUsers}
        campaignSettings={campaignSettings}
        pendingSuperAdmin2FA={pendingSuperAdmin2FA}
        externalNotice={authGateNotice}
        onClearExternalNotice={onClearAuthGateNotice}
        onCancelPendingSuperAdmin2FA={onCancelPendingSuperAdmin2FA}
        onAuthSuccess={(user, method) => {
          if (onAuthGateSuccess) {
            onAuthGateSuccess(user, method);
          } else {
            setCurrentAdminUser(user);
            setAdminLoggedIn(true);
          }
        }}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-4 sm:py-8 px-3 sm:px-6 lg:px-8 space-y-3.5 sm:space-y-6 text-right">
      {/* Admin Header — Compact Executive Profile Card */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4 bg-white dark:bg-[#0B1221] p-3.5 sm:p-5 rounded-2xl border border-[#CBD5E1] dark:border-slate-800/90 shadow-[0_2px_8px_rgba(15,23,42,0.06)] dark:shadow-md">
        <div className="flex items-center gap-3 w-full md:w-auto min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-amber-500 to-amber-600 dark:from-amber-400 dark:to-amber-500 text-white dark:text-slate-950 rounded-xl flex items-center justify-center font-bold shadow-sm border border-amber-400/60 shrink-0">
            <Shield className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-xl font-black text-[#0F172A] dark:text-white tracking-tight">لوحة تحكم قافلة القائم</h1>
              <span className="whitespace-nowrap text-xs font-bold text-[#92400E] dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-500/40 dark:border-amber-500/30 px-3 py-1 rounded-full shadow-2xs shrink-0 inline-flex items-center gap-1">
                {currentAdminUser?.fullName || 'الإدارة العامة للقافلة'} • {normalizeOfficialRole(currentAdminUser?.role)}
              </span>
              {currentAdminUser?.assignedSeason && (
                <span className="whitespace-nowrap text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-500/35 dark:border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                  {currentAdminUser.assignedSeason}
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-[#475569] dark:text-slate-400 mt-0.5 truncate font-medium">
              نظام الإدارة والتشغيل المعتمد — إشراف لحجاج موسم 1448هـ
            </p>
          </div>
        </div>

        {/* Streamlined Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end shrink-0">
          {onRefreshData && (
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncingData}
              className="bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 dark:hover:bg-amber-500/25 text-[#92400E] dark:text-amber-300 text-xs font-bold py-2 px-2.5 sm:px-3 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 border border-amber-500/50 dark:border-amber-500/35 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer active:scale-95 whitespace-nowrap disabled:opacity-50"
              title={lastSyncTime ? `آخر مزامنة: ${lastSyncTime} — اضغط لتحديث البيانات` : 'تحديث ومزامنة البيانات من السيرفر'}
            >
              <RotateCw className={`w-3.5 h-3.5 shrink-0 text-[#D97706] dark:text-amber-400 ${isSyncingData ? 'animate-spin' : ''}`} />
              <span className="truncate">{isSyncingData ? 'جارِ المزامنة...' : 'مزامنة البيانات'}</span>
            </button>
          )}
          {canExportPilgrimsData && (
            <button
              type="button"
              onClick={() => handleExportCSV(pilgrims, 'كافة_الحجاج')}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-2 sm:px-3 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 border border-emerald-500/40 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer active:scale-95 whitespace-nowrap"
              title="تصدير بيانات الحجاج إلى ملف CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">تصدير CSV</span>
            </button>
          )}
          {currentAdminUser && (
            <button
              type="button"
              onClick={() => setShowUserSecurityModal(true)}
              className="relative bg-white dark:bg-[#111C33] hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-[#1E293B] dark:text-emerald-300 text-xs font-bold py-2 px-2 sm:px-3 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 border border-[#94A3B8] dark:border-emerald-500/35 hover:border-emerald-500 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer active:scale-95 whitespace-nowrap"
              title="الأمان والأجهزة الموثوقة والدخول بالبصمة"
            >
              <Fingerprint className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="truncate">الأمان والأجهزة الموثوقة</span>
              {currentAdminUser.lastNewDeviceAlert && !currentAdminUser.lastNewDeviceAlert.dismissed && (
                <span
                  className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0"
                  title="تنبيه أمني: دخول حديث من جهاز جديد"
                />
              )}
            </button>
          )}
          {!isSuperAdminOwner && (
            <button
              type="button"
              onClick={() => {
                setNewPasswordInput('');
                setOwnPasswordError('');
                setShowChangePasswordModal(true);
              }}
              className="bg-white dark:bg-[#111C33] hover:bg-amber-50 dark:hover:bg-[#172542] text-[#1E293B] dark:text-amber-400 text-xs font-bold py-2 px-2 sm:px-3 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 border border-[#94A3B8] dark:border-amber-500/30 hover:border-amber-500 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer active:scale-95 whitespace-nowrap"
              title="تغيير كلمة المرور الخاصة بي"
            >
              <Key className="w-3.5 h-3.5 shrink-0 text-[#D97706] dark:text-amber-400" />
              <span className="truncate">تغيير كلمة المرور</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="bg-white dark:bg-[#111C33] hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-700 dark:text-slate-200 hover:text-rose-800 dark:hover:text-rose-200 text-xs font-bold py-2 px-2 sm:px-3 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 border border-rose-300 dark:border-slate-800 hover:border-rose-500 dark:hover:border-rose-500/40 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 cursor-pointer active:scale-95 whitespace-nowrap"
            title="تسجيل الخروج من الحساب"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span className="truncate">تسجيل خروج</span>
          </button>
        </div>
      </div>

      {/* Quick Glance KPI Strip — Compact 3-Column Mini-Stats Bar */}
      {(() => {
        const dashboardStatsConfig = getEffectivePilgrimStatsConfig({
          ...campaignSettings,
          pilgrimStatsConfig: settingsForm.pilgrimStatsConfig || campaignSettings.pilgrimStatsConfig,
        });
        const dashboardPilgrimStats = calculatePilgrimStatsBreakdown(pilgrims, {
          ...campaignSettings,
          pilgrimStatsConfig: dashboardStatsConfig,
        });
        const currentSeasonCount = airPilgrimsList.length + busPilgrimsList.length;

        return (
          <div className="grid grid-cols-3 gap-2 sm:gap-3 bg-white dark:bg-[#0B1221] border border-[#CBD5E1] dark:border-amber-500/25 p-2 sm:p-3 rounded-2xl shadow-[0_2px_8px_rgba(15,23,42,0.06)] dark:shadow-sm text-center">
            {/* KPI 1: حجاج الموسم (الطيران والباصات) */}
            <div className="bg-[#F8FAFC] dark:bg-[#10192D]/90 border border-[#CBD5E1] dark:border-slate-800/90 rounded-xl py-2 px-1.5 sm:p-3 flex flex-col items-center justify-center">
              <div className="flex items-center justify-center gap-1 text-[11px] sm:text-xs font-bold text-[#92400E] dark:text-amber-300">
                <Users className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-400 shrink-0 hidden xs:inline" />
                <span>حجاج الموسم</span>
              </div>
              <div className="text-base sm:text-xl font-black text-[#0F172A] dark:text-white font-mono tabular-nums mt-0.5">
                {currentSeasonCount.toLocaleString('en-US')}
              </div>
              <div className="text-[10px] text-[#475569] dark:text-slate-400 mt-0.5 font-medium truncate max-w-full">
                طيران {airPilgrimsList.length} · باص {busPilgrimsList.length}
              </div>
            </div>

            {/* KPI 2: سجل الأعوام السابقة */}
            <div className="bg-[#F8FAFC] dark:bg-[#10192D]/90 border border-[#CBD5E1] dark:border-slate-800/90 rounded-xl py-2 px-1.5 sm:p-3 flex flex-col items-center justify-center">
              <div className="flex items-center justify-center gap-1 text-[11px] sm:text-xs font-bold text-[#1E293B] dark:text-slate-300">
                <Clock className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-400 shrink-0 hidden xs:inline" />
                <span>سجل الأعوام السابقة</span>
              </div>
              <div className="text-base sm:text-xl font-black text-[#B45309] dark:text-amber-400 font-mono tabular-nums mt-0.5">
                {dashboardPilgrimStats.pastYearsPilgrimsTotal.toLocaleString('en-US')}
              </div>
              <div className="text-[10px] text-[#475569] dark:text-slate-400 mt-0.5 font-medium truncate max-w-full">
                {dashboardPilgrimStats.historicalRecords.length} مواسم مؤرشفة
              </div>
            </div>

            {/* KPI 3: الإجمالي العام بالموقع */}
            <div className="bg-gradient-to-br from-amber-50 via-[#FEF3C7]/60 to-amber-50/70 dark:from-amber-500/15 dark:via-[#10192D] dark:to-[#0D1526] border border-[#F59E0B]/50 dark:border-amber-500/40 rounded-xl py-2 px-1.5 sm:p-3 flex flex-col items-center justify-center">
              <div className="flex items-center justify-center gap-1 text-[11px] sm:text-xs font-bold text-[#92400E] dark:text-amber-300">
                <Sparkles className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-400 shrink-0 hidden xs:inline" />
                <span>الإجمالي العام بالموقع</span>
              </div>
              <div className="text-base sm:text-xl font-black text-[#B45309] dark:text-amber-400 font-mono tabular-nums mt-0.5" dir="ltr">
                {formatPilgrimsCountWithPlus(dashboardPilgrimStats.totalPilgrims)}
              </div>
              <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5 font-bold truncate max-w-full">
                عداد الصفحة الرئيسية
              </div>
            </div>
          </div>
        );
      })()}

      {/* Unified Executive Navigation System — Compact 2-Column Mobile Grid */}
      {(() => {
        const isPilgrimsGroupActive =
          activeTab === 'pilgrims' ||
          activeTab === 'busBoarding' ||
          activeTab === 'flightsList' ||
          activeTab === 'housingList' ||
          activeTab === 'healthList' ||
          activeTab === 'companionsList' ||
          activeTab === 'excluded';
        const isReligiousGroupActive =
          activeTab === 'religiousGuidance' ||
          activeTab === 'marjiList' ||
          activeTab === 'hajjTimeline';
        const isFinanceGroupActive = activeTab === 'paymentsList' || activeTab === 'packages';
        const isGiftsGroupActive =
          activeTab === 'giftDashboard' ||
          activeTab === 'giftRegistry' ||
          activeTab === 'giftFollowUp' ||
          activeTab === 'giftReports';
        const isSettingsGroupActive = activeTab === 'settings' || activeTab === 'seasons' || activeTab === 'formBuilder' || activeTab === 'advisorManager' || activeTab === 'staff' || activeTab === 'activityLog';

        const mainCardBaseClass =
          'w-full min-h-[58px] sm:min-h-[64px] text-right p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all duration-200 flex items-center justify-between gap-3 relative overflow-hidden group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1221] disabled:opacity-40 disabled:pointer-events-none active:scale-[0.99]';
        const mainCardActiveClass =
          'bg-amber-500/10 border-amber-500/60 text-white shadow-md shadow-amber-500/5';
        const mainCardExpandedClass =
          'bg-[#131F38] border-amber-500/35 text-white shadow-sm';
        const mainCardDefaultClass =
          'bg-[#10192D] hover:bg-[#15223B] border-slate-800/90 hover:border-slate-700 text-slate-200 hover:text-white shadow-sm';

        const subCardBaseClass =
          'w-full min-h-[44px] sm:min-h-[50px] text-right px-3 sm:px-4 py-2.5 rounded-xl border transition-all duration-150 flex items-center justify-between gap-2.5 relative overflow-hidden group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#070C18] disabled:opacity-40 disabled:pointer-events-none active:scale-[0.99]';
        const subCardActiveClass =
          'bg-gradient-to-l from-amber-500/[0.18] via-amber-500/[0.08] to-[#0D1628] border-amber-500/55 text-amber-300 shadow-sm';
        const subCardDefaultClass =
          'bg-[#0D1628] hover:bg-[#13203A] border-slate-800/80 hover:border-slate-700 text-slate-300 hover:text-white';

        return (
          <nav
            aria-label="القوائم الرئيسية والفرعية للوحة التحكم"
            className="bg-[#0B1221] border border-slate-800/90 p-3.5 sm:p-5 rounded-2xl shadow-md space-y-3.5"
          >
            {/* Header Bar of Navigation */}
            <div className="flex items-center justify-between gap-2 px-1 pb-2.5 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-amber-400" />
                <span className="text-xs sm:text-sm font-bold text-slate-200">
                  نظام التنقل والأقسام الإدارية
                </span>
              </div>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                اضغط على أي قسم رئيسي لفتح أو إغلاق القوائم الفرعية المرتبطة به أسفله مباشرة
              </span>
            </div>

            {/* Stacked Vertical Navigation System — All main items stacked vertically with sub-menus directly underneath */}
            <div className="flex flex-col gap-2.5">
              {/* 1. لوحة البيانات والإحصائيات */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('dashboard');
                    setExpandedMainMenu(null);
                  }}
                  aria-current={activeTab === 'dashboard' ? 'page' : undefined}
                  className={`${mainCardBaseClass} ${
                    activeTab === 'dashboard' ? mainCardActiveClass : mainCardDefaultClass
                  }`}
                >
                  {activeTab === 'dashboard' && (
                    <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                  )}
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <div
                      className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 border transition-all duration-200 ${
                        activeTab === 'dashboard'
                          ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 border-amber-300 shadow-sm'
                          : 'bg-[#0B1221] text-amber-400/90 border-slate-800 group-hover:border-amber-500/40 group-hover:text-amber-300'
                      }`}
                    >
                      <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs sm:text-[15px] font-bold leading-snug block text-white truncate">
                        لوحة البيانات والإحصائيات
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal leading-relaxed mt-0.5 hidden xs:block sm:block truncate">
                        ملخص ومؤشرات مباشرة
                      </span>
                    </div>
                  </div>
                  {activeTab === 'dashboard' && (
                    <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                      نشط
                    </span>
                  )}
                </button>
              </div>

              {/* 2. إدارة الحجاج (Main Menu with 5 Sub-Menus) */}
              {canAccessPilgrimsMenu && (
                <div className="space-y-2">
                  <div>
                    <button
                      type="button"
                      aria-expanded={expandedMainMenu === 'pilgrimsGroup'}
                      onClick={() => {
                        if (!isPilgrimsGroupActive) {
                          if (currentAdminUser?.permissions?.managePilgrims) {
                            setActiveTab('pilgrims');
                          } else {
                            setActiveTab('marjiList');
                          }
                          setStatusFilter('all');
                          setExpandedMainMenu('pilgrimsGroup');
                        } else {
                          setExpandedMainMenu((prev) => (prev === 'pilgrimsGroup' ? null : 'pilgrimsGroup'));
                        }
                      }}
                      className={`${mainCardBaseClass} ${
                        isPilgrimsGroupActive
                          ? mainCardActiveClass
                          : expandedMainMenu === 'pilgrimsGroup'
                          ? mainCardExpandedClass
                          : mainCardDefaultClass
                      }`}
                    >
                      {isPilgrimsGroupActive && (
                        <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                      )}
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div
                          className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 border transition-all duration-200 ${
                            isPilgrimsGroupActive
                              ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 border-amber-300 shadow-sm'
                              : 'bg-[#0B1221] text-amber-400/90 border-slate-800 group-hover:border-amber-500/40 group-hover:text-amber-300'
                          }`}
                        >
                          <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs sm:text-[15px] font-bold leading-snug block text-white truncate">
                            إدارة الحجاج
                          </span>
                          <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal leading-relaxed mt-0.5 hidden xs:block sm:block truncate">
                            السجل، الحافلات، الطيران، السكن
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                        {isPilgrimsGroupActive ? (
                          <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                            نشط
                          </span>
                        ) : (
                          <span
                            className="px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-mono tabular-nums font-bold border bg-[#0B1221] text-slate-200 border-slate-800"
                            title="الحجاج المسجلون النشطون"
                          >
                            {activePilgrims.length}
                          </span>
                        )}
                        <span
                          className={`w-5 h-5 sm:w-7 sm:h-7 rounded-md sm:rounded-lg flex items-center justify-center border transition-all duration-200 ${
                            expandedMainMenu === 'pilgrimsGroup'
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                              : 'bg-[#0B1221]/80 border-slate-800 text-slate-400 group-hover:text-slate-200 group-hover:border-slate-700'
                          }`}
                          title="يحتوي على 5 قوائم فرعية"
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              expandedMainMenu === 'pilgrimsGroup' ? 'rotate-180' : ''
                            }`}
                          />
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Accordion Sub-Menu for إدارة الحجاج directly underneath */}
                  <div
                    className={`grid transition-all duration-200 ease-out ${
                      expandedMainMenu === 'pilgrimsGroup'
                        ? 'grid-rows-[1fr] opacity-100'
                        : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="mr-1 sm:mr-6 pr-2 sm:pr-4 border-r-2 border-amber-500/40 pt-1 pb-1">
                        <div className="bg-[#070C18] border border-slate-800/90 rounded-2xl p-2.5 sm:p-4 space-y-2.5 shadow-inner">
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80 px-1">
                            <div className="flex items-center gap-2">
                              <CornerDownLeft className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="text-xs font-bold text-amber-400">
                                القوائم الفرعية — إدارة الحجاج
                              </span>
                            </div>
                            <span className="text-[11px] font-mono tabular-nums text-slate-400">
                              6 أقسام فرعية
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {/* Sub 1: سجل الحجاج */}
                            {currentAdminUser?.permissions.managePilgrims && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab('pilgrims');
                                  setStatusFilter('all');
                                }}
                                className={`${subCardBaseClass} ${
                                  activeTab === 'pilgrims' || activeTab === 'excluded'
                                    ? subCardActiveClass
                                    : subCardDefaultClass
                                }`}
                              >
                                {(activeTab === 'pilgrims' || activeTab === 'excluded') && (
                                  <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                                )}
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div
                                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                      activeTab === 'pilgrims' || activeTab === 'excluded'
                                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                                        : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                    }`}
                                  >
                                    <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                      سجل الحجاج
                                    </span>
                                    <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                      السجل والمستبعدين
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span
                                    className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono tabular-nums font-bold border ${
                                      activeTab === 'pilgrims' || activeTab === 'excluded'
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                        : 'bg-[#090F1D] text-slate-400 border-slate-800'
                                    }`}
                                  >
                                    {activePilgrims.length}
                                  </span>
                                  <ChevronDown
                                    className={`w-3.5 h-3.5 transition-transform duration-150 ${
                                      activeTab === 'pilgrims' || activeTab === 'excluded'
                                        ? 'rotate-180 text-amber-400'
                                        : 'text-slate-500'
                                    }`}
                                  />
                                </div>
                              </button>
                            )}

                            {/* Sub 2: رحلات الحافلات */}
                            {currentAdminUser?.permissions.managePilgrims && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab('busBoarding');
                                  setBusFilter('all');
                                  setBusCapacityWarning(null);
                                }}
                                className={`${subCardBaseClass} ${
                                  activeTab === 'busBoarding' ? subCardActiveClass : subCardDefaultClass
                                }`}
                              >
                                {activeTab === 'busBoarding' && (
                                  <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                                )}
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div
                                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                      activeTab === 'busBoarding'
                                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                                        : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                    }`}
                                  >
                                    <Bus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                      رحلات الحافلات
                                    </span>
                                    <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                      النقل البري والمقاعد
                                    </span>
                                  </div>
                                </div>
                                <span
                                  className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono tabular-nums font-bold border shrink-0 ${
                                    activeTab === 'busBoarding'
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                      : 'bg-[#090F1D] text-slate-400 border-slate-800'
                                  }`}
                                >
                                  {busPilgrimsList.length}
                                </span>
                              </button>
                            )}

                            {/* Sub 3: رحلات الطيران */}
                            {currentAdminUser?.permissions.managePilgrims && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab('flightsList');
                                  setFlightFilter('flight_pilgrims');
                                }}
                                className={`${subCardBaseClass} ${
                                  activeTab === 'flightsList' ? subCardActiveClass : subCardDefaultClass
                                }`}
                              >
                                {activeTab === 'flightsList' && (
                                  <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                                )}
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div
                                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                      activeTab === 'flightsList'
                                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                                        : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                    }`}
                                  >
                                    <Plane className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                      رحلات الطيران
                                    </span>
                                    <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                      النقل الجوي والتذاكر
                                    </span>
                                  </div>
                                </div>
                                <span
                                  className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono tabular-nums font-bold border shrink-0 ${
                                    activeTab === 'flightsList'
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                      : 'bg-[#090F1D] text-slate-400 border-slate-800'
                                  }`}
                                >
                                  {airPilgrimsList.length}
                                </span>
                              </button>
                            )}

                            {/* Sub 4: السكن والفنادق */}
                            {currentAdminUser?.permissions.managePilgrims && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab('housingList');
                                  setHousingFilter('all');
                                }}
                                className={`${subCardBaseClass} ${
                                  activeTab === 'housingList' ? subCardActiveClass : subCardDefaultClass
                                }`}
                              >
                                {activeTab === 'housingList' && (
                                  <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                                )}
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div
                                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                      activeTab === 'housingList'
                                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                                        : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                    }`}
                                  >
                                    <Hotel className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                      السكن والفنادق
                                    </span>
                                    <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                      مكة والمدينة ومنى
                                    </span>
                                  </div>
                                </div>
                                <span
                                  className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono tabular-nums font-bold border shrink-0 ${
                                    activeTab === 'housingList'
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                      : 'bg-[#090F1D] text-slate-400 border-slate-800'
                                  }`}
                                >
                                  {activePilgrims.length}
                                </span>
                              </button>
                            )}

                            {/* Sub 5: الحالات الصحية */}
                            {currentAdminUser?.permissions.managePilgrims && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab('healthList');
                                  setHealthFilter('all');
                                }}
                                className={`${subCardBaseClass} ${
                                  activeTab === 'healthList' ? subCardActiveClass : subCardDefaultClass
                                }`}
                              >
                                {activeTab === 'healthList' && (
                                  <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                                )}
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div
                                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                      activeTab === 'healthList'
                                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                                        : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                    }`}
                                  >
                                    <HeartPulse className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                      الحالات الصحية
                                    </span>
                                    <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                      الرعاية والمتابعة الطبية
                                    </span>
                                  </div>
                                </div>
                                <span
                                  className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono tabular-nums font-bold border shrink-0 ${
                                    activeTab === 'healthList'
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                      : 'bg-[#090F1D] text-slate-400 border-slate-800'
                                  }`}
                                >
                                  {pilgrimsWithHealthConditionsCount}
                                </span>
                              </button>
                            )}

                            {/* Sub 6: كشف المرافقين والمحارم */}
                            {currentAdminUser?.permissions.managePilgrims && (
                              <button
                                type="button"
                                onClick={() => setActiveTab('companionsList')}
                                className={`${subCardBaseClass} ${
                                  activeTab === 'companionsList' ? subCardActiveClass : subCardDefaultClass
                                }`}
                              >
                                {activeTab === 'companionsList' && (
                                  <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                                )}
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div
                                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                      activeTab === 'companionsList'
                                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                                        : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                    }`}
                                  >
                                    <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                      كشف المرافقين والمحارم
                                    </span>
                                    <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                      العوائل والمرافقون (1-10)
                                    </span>
                                  </div>
                                </div>
                                <span
                                  className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono tabular-nums font-bold border shrink-0 ${
                                    activeTab === 'companionsList'
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                      : 'bg-[#090F1D] text-slate-400 border-slate-800'
                                  }`}
                                >
                                  {totalCompanionsRosterCount}
                                </span>
                              </button>
                            )}
                          </div>

                          {/* Level-3 Nested Sub-Menu inside سجل الحجاج (Active Pilgrims vs Excluded List) */}
                          <div
                            className={`grid transition-all duration-200 ease-out ${
                              (activeTab === 'pilgrims' || activeTab === 'excluded') &&
                              currentAdminUser?.permissions.managePilgrims
                                ? 'grid-rows-[1fr] opacity-100 pt-2 border-t border-slate-800/80'
                                : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                            }`}
                          >
                            <div className="overflow-hidden">
                              <div className="mr-1 sm:mr-5 pr-2 sm:pr-4 border-r-2 border-amber-500/30 space-y-2">
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                                  <CornerDownLeft className="w-3 h-3 text-amber-400 shrink-0" />
                                  <span>أقسام سجل الحجاج:</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveTab('pilgrims');
                                      setStatusFilter('all');
                                    }}
                                    className={`w-full min-h-[42px] sm:min-h-[44px] text-right px-3 py-2 rounded-xl border transition-all duration-150 flex items-center justify-between gap-2 relative overflow-hidden group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                                      activeTab === 'pilgrims'
                                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 font-bold'
                                        : 'bg-[#0A1120] hover:bg-[#101B30] border-slate-800/80 text-slate-300 hover:text-white'
                                    }`}
                                  >
                                    {activeTab === 'pilgrims' && (
                                      <span className="absolute right-0 top-1.5 bottom-1.5 w-1 bg-amber-400 rounded-l-full" />
                                    )}
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <div
                                        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                                          activeTab === 'pilgrims'
                                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                                            : 'bg-[#070C18] text-slate-400 border-slate-800'
                                        }`}
                                      >
                                        <UserCheck className="w-3.5 h-3.5" />
                                      </div>
                                      <span className="text-xs font-bold leading-snug truncate">
                                        الحجاج المسجلين (النشطين)
                                      </span>
                                    </div>
                                    <span
                                      className={`px-2 py-0.5 rounded text-[11px] font-mono tabular-nums font-bold ${
                                        activeTab === 'pilgrims'
                                          ? 'bg-amber-500 text-slate-950'
                                          : 'bg-[#070C18] text-slate-400 border border-slate-800'
                                      }`}
                                    >
                                      {activePilgrims.length}
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveTab('excluded');
                                      setStatusFilter('all');
                                    }}
                                    className={`w-full min-h-[42px] sm:min-h-[44px] text-right px-3 py-2 rounded-xl border transition-all duration-150 flex items-center justify-between gap-2 relative overflow-hidden group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                                      activeTab === 'excluded'
                                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 font-bold'
                                        : 'bg-[#0A1120] hover:bg-[#101B30] border-slate-800/80 text-slate-300 hover:text-white'
                                    }`}
                                  >
                                    {activeTab === 'excluded' && (
                                      <span className="absolute right-0 top-1.5 bottom-1.5 w-1 bg-amber-400 rounded-l-full" />
                                    )}
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <div
                                        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                                          activeTab === 'excluded'
                                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                                            : 'bg-[#070C18] text-slate-400 border-slate-800'
                                        }`}
                                      >
                                        <XCircle className="w-3.5 h-3.5" />
                                      </div>
                                      <span className="text-xs font-bold leading-snug truncate">
                                        قائمة المستبعدين
                                      </span>
                                    </div>
                                    <span
                                      className={`px-2 py-0.5 rounded text-[11px] font-mono tabular-nums font-bold ${
                                        activeTab === 'excluded'
                                          ? 'bg-amber-500 text-slate-950'
                                          : 'bg-[#070C18] text-slate-400 border border-slate-800'
                                      }`}
                                    >
                                      {excludedPilgrimsList.length}
                                    </span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. الإرشاد الديني (Main Menu with 11 Integrated Units + Legacy Quick Links) */}
              {hasReligiousSupervisionPermission && (
                <div className="space-y-2">
                  <div>
                    <button
                      type="button"
                      aria-expanded={expandedMainMenu === 'religiousGroup'}
                      onClick={() => {
                        if (!isReligiousGroupActive) {
                          setActiveTab('religiousGuidance');
                          setSelectedReligiousUnit('dashboard');
                          setExpandedMainMenu('religiousGroup');
                        } else {
                          setExpandedMainMenu((prev) => (prev === 'religiousGroup' ? null : 'religiousGroup'));
                        }
                      }}
                      className={`${mainCardBaseClass} ${
                        isReligiousGroupActive
                          ? mainCardActiveClass
                          : expandedMainMenu === 'religiousGroup'
                          ? mainCardExpandedClass
                          : mainCardDefaultClass
                      }`}
                    >
                      {isReligiousGroupActive && (
                        <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                      )}
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div
                          className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 border transition-all duration-200 ${
                            isReligiousGroupActive
                              ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 border-amber-300 shadow-sm'
                              : 'bg-[#0B1221] text-amber-400/90 border-slate-800 group-hover:border-amber-500/40 group-hover:text-amber-300'
                          }`}
                        >
                          <Compass className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs sm:text-[15px] font-bold leading-snug block text-white truncate">
                            منظومة الإرشاد الديني
                          </span>
                          <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal leading-relaxed mt-0.5 hidden xs:block sm:block truncate">
                            التوعية والملفات التعليمية والدروس والمطوّفين (12 وحدة)
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                        {isReligiousGroupActive ? (
                          <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                            نشط
                          </span>
                        ) : (
                          <span
                            className="px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-mono tabular-nums font-bold border bg-[#0B1221] text-slate-200 border-slate-800"
                          >
                            12 وحدة
                          </span>
                        )}
                        <span
                          className={`w-5 h-5 sm:w-7 sm:h-7 rounded-md sm:rounded-lg flex items-center justify-center border transition-all duration-200 ${
                            expandedMainMenu === 'religiousGroup'
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                              : 'bg-[#0B1221]/80 border-slate-800 text-slate-400 group-hover:text-slate-200 group-hover:border-slate-700'
                          }`}
                          title="يحتوي على وحدات منظومة الإرشاد الديني"
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              expandedMainMenu === 'religiousGroup' ? 'rotate-180' : ''
                            }`}
                          />
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Accordion Sub-Menu for الإرشاد الديني directly underneath */}
                  <div
                    className={`grid transition-all duration-200 ease-out ${
                      expandedMainMenu === 'religiousGroup'
                        ? 'grid-rows-[1fr] opacity-100'
                        : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="mr-1 sm:mr-6 pr-2 sm:pr-4 border-r-2 border-amber-500/40 pt-1 pb-1">
                        <div className="bg-[#070C18] border border-slate-800/90 rounded-2xl p-2.5 sm:p-4 space-y-2.5 shadow-inner">
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80 px-1">
                            <div className="flex items-center gap-2">
                              <CornerDownLeft className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="text-xs font-bold text-amber-400">
                                وحدات منظومة الإرشاد الديني المتكاملة (قبل وأثناء وبعد الحج)
                              </span>
                            </div>
                            <span className="text-[11px] font-mono tabular-nums text-slate-400">
                              12 وحدة تخصصية + قسمان سريعان
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {RELIGIOUS_11_UNITS.map((unit) => {
                              const UnitIcon = unit.icon;
                              const isUnitActive =
                                activeTab === 'religiousGuidance' &&
                                selectedReligiousUnit === unit.key;
                              return (
                                <button
                                  key={unit.key}
                                  type="button"
                                  onClick={() => {
                                    setActiveTab('religiousGuidance');
                                    setSelectedReligiousUnit(unit.key);
                                  }}
                                  className={`${subCardBaseClass} ${
                                    isUnitActive ? subCardActiveClass : subCardDefaultClass
                                  }`}
                                >
                                  {isUnitActive && (
                                    <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                                  )}
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <div
                                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                        isUnitActive
                                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                                          : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                      }`}
                                    >
                                      <UnitIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                        {unit.title}
                                      </span>
                                      <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                        {unit.shortDesc}
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}

                            {/* Preserved Direct Quick Links for marjiList & hajjTimeline */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('marjiList');
                                setMarjiFilter('all');
                              }}
                              className={`${subCardBaseClass} ${
                                activeTab === 'marjiList' ? subCardActiveClass : subCardDefaultClass
                              }`}
                            >
                              {activeTab === 'marjiList' && (
                                <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                              )}
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div
                                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                    activeTab === 'marjiList'
                                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                                      : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                  }`}
                                >
                                  <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                    كشف المراجع الدينية (سريع)
                                  </span>
                                  <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                    توزيع الحجاج حسب مرجع التقليد
                                  </span>
                                </div>
                              </div>
                              <span
                                className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono tabular-nums font-bold border shrink-0 ${
                                  activeTab === 'marjiList'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-[#090F1D] text-slate-400 border-slate-800'
                                }`}
                              >
                                {activePilgrims.length}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setActiveTab('manasikGuide')}
                              className={`${subCardBaseClass} ${
                                activeTab === 'manasikGuide' || activeTab === 'hajjTimeline'
                                  ? subCardActiveClass
                                  : subCardDefaultClass
                              }`}
                            >
                              {(activeTab === 'manasikGuide' || activeTab === 'hajjTimeline') && (
                                <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                              )}
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div
                                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                    activeTab === 'manasikGuide' || activeTab === 'hajjTimeline'
                                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                                      : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                  }`}
                                >
                                  <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                    إدارة دليل المناسك (الإرشاد الديني)
                                  </span>
                                  <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                    إدارة المراحل والأعمال والأدعية والتنبيهات
                                  </span>
                                </div>
                              </div>
                              <span
                                className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold border shrink-0 ${
                                  activeTab === 'manasikGuide' || activeTab === 'hajjTimeline'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-[#090F1D] text-emerald-400 border-slate-800'
                                }`}
                              >
                                ديناميكي
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. الإعلانات والدروس */}
              {currentAdminUser?.permissions.manageAnnouncements && (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('announcements');
                      setExpandedMainMenu(null);
                    }}
                    aria-current={activeTab === 'announcements' ? 'page' : undefined}
                    className={`${mainCardBaseClass} ${
                      activeTab === 'announcements' ? mainCardActiveClass : mainCardDefaultClass
                    }`}
                  >
                    {activeTab === 'announcements' && (
                      <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                    )}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div
                        className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 border transition-all duration-200 ${
                          activeTab === 'announcements'
                            ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 border-amber-300 shadow-sm'
                            : 'bg-[#0B1221] text-amber-400/90 border-slate-800 group-hover:border-amber-500/40 group-hover:text-amber-300'
                        }`}
                      >
                        <Megaphone className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs sm:text-[15px] font-bold leading-snug block text-white truncate">
                          الإعلانات والدروس
                        </span>
                        <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal leading-relaxed mt-0.5 hidden xs:block sm:block truncate">
                          المستجدات والمرئيات وبث يوتيوب
                        </span>
                      </div>
                    </div>
                    {activeTab === 'announcements' ? (
                      <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                        نشط
                      </span>
                    ) : (
                      <span
                        className="px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-mono tabular-nums font-bold border bg-[#0B1221] text-slate-200 border-slate-800 shrink-0"
                      >
                        {announcements.length}
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* 5. إدارة وبث الإشعارات */}
              {canManageNotifications && (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('notifications');
                      setExpandedMainMenu(null);
                    }}
                    aria-current={activeTab === 'notifications' ? 'page' : undefined}
                    className={`${mainCardBaseClass} ${
                      activeTab === 'notifications' ? mainCardActiveClass : mainCardDefaultClass
                    }`}
                  >
                    {activeTab === 'notifications' && (
                      <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                    )}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div
                        className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 border transition-all duration-200 ${
                          activeTab === 'notifications'
                            ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 border-amber-300 shadow-sm'
                            : 'bg-[#0B1221] text-amber-400/90 border-slate-800 group-hover:border-amber-500/40 group-hover:text-amber-300'
                        }`}
                      >
                        <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs sm:text-[15px] font-bold leading-snug block text-white truncate">
                          مركز إدارة وبث الإشعارات
                        </span>
                        <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal leading-relaxed mt-0.5 hidden xs:block sm:block truncate">
                          بث فوري ومجدول حسب الباقات والمجموعات
                        </span>
                      </div>
                    </div>
                    {activeTab === 'notifications' ? (
                      <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                        نشط
                      </span>
                    ) : (
                      <span
                        className="px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-mono tabular-nums font-bold border bg-[#0B1221] text-slate-200 border-slate-800 shrink-0"
                      >
                        {notifications.length}
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* 6. الإدارة المالية (Main Menu with 2 Sub-Menus) */}
              {canAccessFinanceMenu && (
                <div className="space-y-2">
                  <div>
                    <button
                      type="button"
                      aria-expanded={expandedMainMenu === 'financeGroup'}
                      onClick={() => {
                        if (!isFinanceGroupActive) {
                          setActiveTab('paymentsList');
                          setExpandedMainMenu('financeGroup');
                        } else {
                          setExpandedMainMenu((prev) => (prev === 'financeGroup' ? null : 'financeGroup'));
                        }
                      }}
                      className={`${mainCardBaseClass} ${
                        isFinanceGroupActive
                          ? mainCardActiveClass
                          : expandedMainMenu === 'financeGroup'
                          ? mainCardExpandedClass
                          : mainCardDefaultClass
                      }`}
                    >
                      {isFinanceGroupActive && (
                        <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                      )}
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div
                          className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 border transition-all duration-200 ${
                            isFinanceGroupActive
                              ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 border-amber-300 shadow-sm'
                              : 'bg-[#0B1221] text-amber-400/90 border-slate-800 group-hover:border-amber-500/40 group-hover:text-amber-300'
                          }`}
                        >
                          <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs sm:text-[15px] font-bold leading-snug block text-white truncate">
                            الإدارة المالية
                          </span>
                          <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal leading-relaxed mt-0.5 hidden xs:block sm:block truncate">
                            كشف المدفوعات وإدارة الباقات
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                        {isFinanceGroupActive ? (
                          <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                            نشط
                          </span>
                        ) : (
                          <span
                            className="px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-mono tabular-nums font-bold border bg-[#0B1221] text-emerald-400 border-emerald-500/30"
                            title="عدد الحجاج المؤكد دفعهم"
                          >
                            {activePilgrims.filter((p) => isPilgrimPaymentConfirmed(p)).length}
                          </span>
                        )}
                        <span
                          className={`w-5 h-5 sm:w-7 sm:h-7 rounded-md sm:rounded-lg flex items-center justify-center border transition-all duration-200 ${
                            expandedMainMenu === 'financeGroup'
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                              : 'bg-[#0B1221]/80 border-slate-800 text-slate-400 group-hover:text-slate-200 group-hover:border-slate-700'
                          }`}
                          title="يحتوي على قائمتين فرعيتين"
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              expandedMainMenu === 'financeGroup' ? 'rotate-180' : ''
                            }`}
                          />
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Accordion Sub-Menu for الإدارة المالية directly underneath */}
                  <div
                    className={`grid transition-all duration-200 ease-out ${
                      expandedMainMenu === 'financeGroup'
                        ? 'grid-rows-[1fr] opacity-100'
                        : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="mr-1 sm:mr-6 pr-2 sm:pr-4 border-r-2 border-amber-500/40 pt-1 pb-1">
                        <div className="bg-[#070C18] border border-slate-800/90 rounded-2xl p-2.5 sm:p-4 space-y-2.5 shadow-inner">
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80 px-1">
                            <div className="flex items-center gap-2">
                              <CornerDownLeft className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="text-xs font-bold text-amber-400">
                                القوائم الفرعية — الإدارة المالية
                              </span>
                            </div>
                            <span className="text-[11px] font-mono tabular-nums text-slate-400">
                              قسمان فرعيان
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveTab('paymentsList')}
                              className={`${subCardBaseClass} ${
                                activeTab === 'paymentsList' ? subCardActiveClass : subCardDefaultClass
                              }`}
                            >
                              {activeTab === 'paymentsList' && (
                                <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                              )}
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div
                                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                    activeTab === 'paymentsList'
                                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                                      : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                  }`}
                                >
                                  <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                    كشف المبالغ المدفوعة
                                  </span>
                                  <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                    سجل الدفعات المؤكدة
                                  </span>
                                </div>
                              </div>
                              <span
                                className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono tabular-nums font-bold border shrink-0 ${
                                  activeTab === 'paymentsList'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-[#090F1D] text-slate-400 border-slate-800'
                                }`}
                              >
                                {activePilgrims.filter((p) => isPilgrimPaymentConfirmed(p)).length}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setActiveTab('packages')}
                              className={`${subCardBaseClass} ${
                                activeTab === 'packages' ? subCardActiveClass : subCardDefaultClass
                              }`}
                            >
                              {activeTab === 'packages' && (
                                <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                              )}
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div
                                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                    activeTab === 'packages'
                                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                                      : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                  }`}
                                >
                                  <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                    إدارة الباقات والأسعار
                                  </span>
                                  <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                    تعديل الأسعار والمواصفات
                                  </span>
                                </div>
                              </div>
                              <span
                                className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono tabular-nums font-bold border shrink-0 ${
                                  activeTab === 'packages'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-[#090F1D] text-slate-400 border-slate-800'
                                }`}
                              >
                                {packages.length}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* إدارة وتوزيع هدايا الحجاج */}
              {canManageGifts && (
                <div className="space-y-2">
                  <div>
                    <button
                      type="button"
                      aria-expanded={expandedMainMenu === 'giftsGroup'}
                      onClick={() => {
                        if (!isGiftsGroupActive) {
                          setActiveTab('giftDashboard');
                          setExpandedMainMenu('giftsGroup');
                        } else {
                          setExpandedMainMenu((prev) => (prev === 'giftsGroup' ? null : 'giftsGroup'));
                        }
                      }}
                      className={`${mainCardBaseClass} ${
                        isGiftsGroupActive
                          ? mainCardActiveClass
                          : expandedMainMenu === 'giftsGroup'
                          ? mainCardExpandedClass
                          : mainCardDefaultClass
                      }`}
                    >
                      {isGiftsGroupActive && (
                        <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                      )}
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div
                          className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 border transition-all duration-200 ${
                            isGiftsGroupActive
                              ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 border-amber-300 shadow-sm'
                              : 'bg-[#0B1221] text-amber-400/90 border-slate-800 group-hover:border-amber-500/40 group-hover:text-amber-300'
                          }`}
                        >
                          <Gift className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs sm:text-[15px] font-bold leading-snug block text-white truncate">
                            إدارة توزيع هدايا الحجاج
                          </span>
                          <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal leading-relaxed mt-0.5 hidden xs:block sm:block truncate">
                            توثيق الاستلام، متابعة غير المستلمين، والتقارير
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                        {isGiftsGroupActive ? (
                          <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                            نشط
                          </span>
                        ) : (
                          <span
                            className="px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-mono tabular-nums font-bold border bg-[#0B1221] text-amber-400 border-amber-500/30"
                            title="إجمالي الحجاج المخصص لهم هدايا"
                          >
                            {activePilgrims.length}
                          </span>
                        )}
                        <span
                          className={`w-5 h-5 sm:w-7 sm:h-7 rounded-md sm:rounded-lg flex items-center justify-center border transition-all duration-200 ${
                            expandedMainMenu === 'giftsGroup'
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                              : 'bg-[#0B1221]/80 border-slate-800 text-slate-400 group-hover:text-slate-200 group-hover:border-slate-700'
                          }`}
                          title="يحتوي على 4 أقسام فرعية"
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              expandedMainMenu === 'giftsGroup' ? 'rotate-180' : ''
                            }`}
                          />
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Accordion Sub-Menu for توزيع الهدايا directly underneath */}
                  <div
                    className={`grid transition-all duration-200 ease-out ${
                      expandedMainMenu === 'giftsGroup'
                        ? 'grid-rows-[1fr] opacity-100'
                        : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="mr-1 sm:mr-6 pr-2 sm:pr-4 border-r-2 border-amber-500/40 pt-1 pb-1">
                        <div className="bg-[#070C18] border border-slate-800/90 rounded-2xl p-2.5 sm:p-4 space-y-2.5 shadow-inner">
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80 px-1">
                            <div className="flex items-center gap-2">
                              <CornerDownLeft className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="text-xs font-bold text-amber-400">
                                القوائم الفرعية — توزيع هدايا الحجاج
                              </span>
                            </div>
                            <span className="text-[11px] font-mono tabular-nums text-slate-400">
                              4 أقسام رئيسية
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {/* 1. لوحة التحكم */}
                            <button
                              type="button"
                              onClick={() => setActiveTab('giftDashboard')}
                              className={`${subCardBaseClass} ${
                                activeTab === 'giftDashboard' ? subCardActiveClass : subCardDefaultClass
                              }`}
                            >
                              {activeTab === 'giftDashboard' && (
                                <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                              )}
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div
                                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                    activeTab === 'giftDashboard'
                                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                                      : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                  }`}
                                >
                                  <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                    لوحة التحكم والإحصائيات
                                  </span>
                                  <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                    مؤشرات الإنجاز والرسوم البيانية
                                  </span>
                                </div>
                              </div>
                            </button>

                            {/* 2. سجل توزيع الهدايا */}
                            <button
                              type="button"
                              onClick={() => setActiveTab('giftRegistry')}
                              className={`${subCardBaseClass} ${
                                activeTab === 'giftRegistry' ? subCardActiveClass : subCardDefaultClass
                              }`}
                            >
                              {activeTab === 'giftRegistry' && (
                                <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                              )}
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div
                                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                    activeTab === 'giftRegistry'
                                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                                      : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                  }`}
                                >
                                  <Gift className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                    سجل توزيع الهدايا
                                  </span>
                                  <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                    كافة الحجاج والبحث والتسليم
                                  </span>
                                </div>
                              </div>
                              <span
                                className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono tabular-nums font-bold border shrink-0 ${
                                  activeTab === 'giftRegistry'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-[#090F1D] text-slate-400 border-slate-800'
                                }`}
                              >
                                {activePilgrims.length}
                              </span>
                            </button>

                            {/* 3. متابعة غير المستلمين */}
                            <button
                              type="button"
                              onClick={() => setActiveTab('giftFollowUp')}
                              className={`${subCardBaseClass} ${
                                activeTab === 'giftFollowUp' ? subCardActiveClass : subCardDefaultClass
                              }`}
                            >
                              {activeTab === 'giftFollowUp' && (
                                <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                              )}
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div
                                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                    activeTab === 'giftFollowUp'
                                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                                      : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                  }`}
                                >
                                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                    متابعة غير المستلمين
                                  </span>
                                  <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                    سجل الاتصالات والمواعيد القادمة
                                  </span>
                                </div>
                              </div>
                            </button>

                            {/* 4. منظومة التقارير */}
                            <button
                              type="button"
                              onClick={() => setActiveTab('giftReports')}
                              className={`${subCardBaseClass} ${
                                activeTab === 'giftReports' ? subCardActiveClass : subCardDefaultClass
                              }`}
                            >
                              {activeTab === 'giftReports' && (
                                <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                              )}
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div
                                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                    activeTab === 'giftReports'
                                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                                      : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                  }`}
                                >
                                  <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                    منظومة التقارير الشاملة
                                  </span>
                                  <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                    13 تقريراً مع الطباعة و Excel
                                  </span>
                                </div>
                              </div>
                              <span
                                className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold border shrink-0 ${
                                  activeTab === 'giftReports'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-[#090F1D] text-amber-400 border-amber-500/30'
                                }`}
                              >
                                13
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 6. تقييمات وملاحظات الحجاج */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('feedback');
                    setExpandedMainMenu(null);
                  }}
                  aria-current={activeTab === 'feedback' ? 'page' : undefined}
                  className={`${mainCardBaseClass} ${
                    activeTab === 'feedback' ? mainCardActiveClass : mainCardDefaultClass
                  }`}
                >
                  {activeTab === 'feedback' && (
                    <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                  )}
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <div
                      className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 border transition-all duration-200 ${
                        activeTab === 'feedback'
                          ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 border-amber-300 shadow-sm'
                          : 'bg-[#0B1221] text-amber-400/90 border-slate-800 group-hover:border-amber-500/40 group-hover:text-amber-300'
                      }`}
                    >
                      <Star className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs sm:text-[15px] font-bold leading-snug block text-white truncate">
                        تقييمات الحجاج
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal leading-relaxed mt-0.5 hidden xs:block sm:block truncate">
                        آراء ومقترحات التطوير
                      </span>
                    </div>
                  </div>
                  {activeTab === 'feedback' ? (
                    <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                      نشط
                    </span>
                  ) : (
                    <span
                      className="px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-mono tabular-nums font-bold border bg-[#0B1221] text-slate-200 border-slate-800 shrink-0"
                    >
                      {feedback.length}
                    </span>
                  )}
                </button>
              </div>

              {/* 6.5 بنك المعلومات (قاعدة المعرفة) — تغذية مرشد القائم الذكي */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('knowledgeBase');
                    setExpandedMainMenu(null);
                  }}
                  aria-current={activeTab === 'knowledgeBase' ? 'page' : undefined}
                  className={`${mainCardBaseClass} ${
                    activeTab === 'knowledgeBase' ? mainCardActiveClass : mainCardDefaultClass
                  }`}
                >
                  {activeTab === 'knowledgeBase' && (
                    <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                  )}
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <div
                      className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 border transition-all duration-200 ${
                        activeTab === 'knowledgeBase'
                          ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 border-amber-300 shadow-sm'
                          : 'bg-[#0B1221] text-amber-400/90 border-slate-800 group-hover:border-amber-500/40 group-hover:text-amber-300'
                      }`}
                    >
                      <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs sm:text-[15px] font-bold leading-snug block text-white truncate">
                        بنك المعلومات (قاعدة المعرفة)
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal leading-relaxed mt-0.5 hidden xs:block sm:block truncate">
                        إدارة الإجابات المعتمدة وتغذية «مرشد القائم الذكي» وعزل البيانات السرية
                      </span>
                    </div>
                  </div>
                  {activeTab === 'knowledgeBase' ? (
                    <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                      نشط
                    </span>
                  ) : (
                    <span className="px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-bold border bg-emerald-500/15 text-emerald-300 border-emerald-500/35 shrink-0">
                      مرشد القائم الذكي
                    </span>
                  )}
                </button>
              </div>

              {/* 6.6 إدارة دليل المناسك (الإرشاد الديني) */}
              {hasReligiousSupervisionPermission && (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('manasikGuide');
                      setExpandedMainMenu(null);
                    }}
                    aria-current={
                      activeTab === 'manasikGuide' || activeTab === 'hajjTimeline'
                        ? 'page'
                        : undefined
                    }
                    className={`${mainCardBaseClass} ${
                      activeTab === 'manasikGuide' || activeTab === 'hajjTimeline'
                        ? mainCardActiveClass
                        : mainCardDefaultClass
                    }`}
                  >
                    {(activeTab === 'manasikGuide' || activeTab === 'hajjTimeline') && (
                      <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                    )}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div
                        className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 border transition-all duration-200 ${
                          activeTab === 'manasikGuide' || activeTab === 'hajjTimeline'
                            ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 border-amber-300 shadow-sm'
                            : 'bg-[#0B1221] text-amber-400/90 border-slate-800 group-hover:border-amber-500/40 group-hover:text-amber-300'
                        }`}
                      >
                        <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs sm:text-[15px] font-bold leading-snug block text-white truncate">
                          إدارة دليل المناسك (الإرشاد الديني)
                        </span>
                        <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal leading-relaxed mt-0.5 hidden xs:block sm:block truncate">
                          إضافة وتعديل المراحل والأعمال والأحكام والأدعية ومواعيد القافلة ديناميكياً
                        </span>
                      </div>
                    </div>
                    {activeTab === 'manasikGuide' || activeTab === 'hajjTimeline' ? (
                      <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                        نشط
                      </span>
                    ) : (
                      <span className="px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-bold border bg-amber-500/15 text-amber-300 border-amber-500/35 shrink-0">
                        الإرشاد الديني
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* 7. إعدادات القافلة (Main Menu with 3 Sub-Menus) */}
              <div className="space-y-2">
                <div>
                  <button
                    type="button"
                    aria-expanded={expandedMainMenu === 'settingsGroup'}
                    onClick={() => {
                      if (!isSettingsGroupActive) {
                        setActiveTab('settings');
                        setExpandedMainMenu('settingsGroup');
                      } else {
                        setExpandedMainMenu((prev) => (prev === 'settingsGroup' ? null : 'settingsGroup'));
                      }
                    }}
                    className={`${mainCardBaseClass} ${
                      isSettingsGroupActive
                        ? mainCardActiveClass
                        : expandedMainMenu === 'settingsGroup'
                        ? mainCardExpandedClass
                        : mainCardDefaultClass
                    }`}
                  >
                    {isSettingsGroupActive && (
                      <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                    )}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div
                        className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 border transition-all duration-200 ${
                          isSettingsGroupActive
                            ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 border-amber-300 shadow-sm'
                            : 'bg-[#0B1221] text-amber-400/90 border-slate-800 group-hover:border-amber-500/40 group-hover:text-amber-300'
                        }`}
                      >
                        <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs sm:text-[15px] font-bold leading-snug block text-white truncate">
                          إعدادات القافلة
                        </span>
                        <span className="text-[10px] sm:text-[11px] text-slate-400 font-normal leading-relaxed mt-0.5 hidden xs:block sm:block truncate">
                          الإعدادات والمشرفون وسجل النشاط
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                      {isSettingsGroupActive ? (
                        <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                          نشط
                        </span>
                      ) : isMasterAdmin ? (
                        <span
                          className="px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-mono tabular-nums font-bold border bg-[#0B1221] text-slate-200 border-slate-800"
                          title="عدد المشرفين"
                        >
                          {adminUsers.length}
                        </span>
                      ) : null}
                      <span
                        className={`w-5 h-5 sm:w-7 sm:h-7 rounded-md sm:rounded-lg flex items-center justify-center border transition-all duration-200 ${
                          expandedMainMenu === 'settingsGroup'
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                            : 'bg-[#0B1221]/80 border-slate-800 text-slate-400 group-hover:text-slate-200 group-hover:border-slate-700'
                        }`}
                        title="يحتوي على قوائم فرعية"
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${
                            expandedMainMenu === 'settingsGroup' ? 'rotate-180' : ''
                          }`}
                        />
                      </span>
                    </div>
                  </button>
                </div>

                {/* Accordion Sub-Menu for إعدادات القافلة directly underneath */}
                <div
                  className={`grid transition-all duration-200 ease-out ${
                    expandedMainMenu === 'settingsGroup'
                      ? 'grid-rows-[1fr] opacity-100'
                      : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                  }`}
                >
                <div className="overflow-hidden">
                  <div className="mr-1 sm:mr-6 pr-2 sm:pr-4 border-r-2 border-amber-500/40 pt-1 pb-1">
                    <div className="bg-[#070C18] border border-slate-800/90 rounded-2xl p-2.5 sm:p-4 space-y-2.5 shadow-inner">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80 px-1">
                        <div className="flex items-center gap-2">
                          <CornerDownLeft className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="text-xs font-bold text-amber-400">
                            القوائم الفرعية — إعدادات القافلة
                          </span>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          {canManageStaffAndRoles ? '3 أقسام فرعية' : 'قسم فرعي'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab('settings')}
                          className={`${subCardBaseClass} ${
                            activeTab === 'settings' ? subCardActiveClass : subCardDefaultClass
                          }`}
                        >
                          {activeTab === 'settings' && (
                            <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                          )}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                activeTab === 'settings'
                                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                                  : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                              }`}
                            >
                              <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                إعدادات القافلة والتواصل
                              </span>
                              <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                بيانات التواصل والتصدير
                              </span>
                            </div>
                          </div>
                          <span
                            className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono tabular-nums font-bold border shrink-0 ${
                              activeTab === 'settings'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-[#090F1D] text-slate-400 border-slate-800'
                            }`}
                          >
                            {pilgrims.length}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab('seasons')}
                          className={`${subCardBaseClass} ${
                            activeTab === 'seasons' ? subCardActiveClass : subCardDefaultClass
                          }`}
                        >
                          {activeTab === 'seasons' && (
                            <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                          )}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                activeTab === 'seasons'
                                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                                  : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                              }`}
                            >
                              <FolderArchive className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                إدارة المواسم والأرشيف
                              </span>
                              <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                المواسم وأرشيف الوسائط المشتركة
                              </span>
                            </div>
                          </div>
                          <span
                            className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono tabular-nums font-bold border shrink-0 ${
                              activeTab === 'seasons'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-[#090F1D] text-slate-400 border-slate-800'
                            }`}
                          >
                            {seasons.length || 1}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab('formBuilder')}
                          className={`${subCardBaseClass} ${
                            activeTab === 'formBuilder' ? subCardActiveClass : subCardDefaultClass
                          }`}
                        >
                          {activeTab === 'formBuilder' && (
                            <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                          )}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                activeTab === 'formBuilder'
                                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                                  : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                              }`}
                            >
                              <Sliders className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                منشئ الاستمارات الديناميكي
                              </span>
                              <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                تصميم الاستمارات وربطها بباقات الحجاج
                              </span>
                            </div>
                          </div>
                          <span
                            className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono tabular-nums font-bold border shrink-0 ${
                              activeTab === 'formBuilder'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-[#090F1D] text-slate-400 border-slate-800'
                            }`}
                          >
                            {dynamicForms.length}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab('advisorManager')}
                          className={`${subCardBaseClass} ${
                            activeTab === 'advisorManager' ? subCardActiveClass : subCardDefaultClass
                          }`}
                        >
                          {activeTab === 'advisorManager' && (
                            <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                          )}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                activeTab === 'advisorManager'
                                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                                  : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                              }`}
                            >
                              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                إدارة مرشد القائم الذكي
                              </span>
                              <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                قاعدة المعرفة المعتمدة و Gemini RAG
                              </span>
                            </div>
                          </div>
                          <span
                            className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold border shrink-0 ${
                              campaignSettings.advisorConfig?.enabled !== false
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                                : 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                            }`}
                          >
                            {campaignSettings.advisorConfig?.enabled !== false ? 'نشط' : 'متوقف'}
                          </span>
                        </button>

                        {canManageStaffAndRoles && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('staff')}
                            className={`${subCardBaseClass} ${
                              activeTab === 'staff' ? subCardActiveClass : subCardDefaultClass
                            }`}
                          >
                            {activeTab === 'staff' && (
                              <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                            )}
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div
                                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                  activeTab === 'staff'
                                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                                    : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                }`}
                              >
                                <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                  المشرفون والصلاحيات
                                </span>
                                <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                  نظام الأدوار الـ 5 والصلاحيات التفصيلية
                                </span>
                              </div>
                            </div>
                            <span
                              className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono tabular-nums font-bold border shrink-0 ${
                                activeTab === 'staff'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-[#090F1D] text-slate-400 border-slate-800'
                              }`}
                            >
                              {adminUsers.length}
                            </span>
                          </button>
                        )}

                        {canManageStaffAndRoles && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('activityLog')}
                            className={`${subCardBaseClass} ${
                              activeTab === 'activityLog' ? subCardActiveClass : subCardDefaultClass
                            }`}
                          >
                            {activeTab === 'activityLog' && (
                              <span className="absolute right-0 top-2 bottom-2 w-1 bg-amber-400 rounded-l-full" />
                            )}
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div
                                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                  activeTab === 'activityLog'
                                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                                    : 'bg-[#090F1D] text-slate-400 border-slate-800 group-hover:text-amber-400'
                                }`}
                              >
                                <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-xs sm:text-[13px] font-bold leading-snug block truncate">
                                  سجل النشاطات والرقابة
                                </span>
                                <span className="text-[10px] text-slate-400 hidden xs:block truncate">
                                  توثيق دخول وعمليات النظام
                                </span>
                              </div>
                            </div>
                            <span
                              className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono tabular-nums font-bold border shrink-0 ${
                                activeTab === 'activityLog'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-[#090F1D] text-slate-400 border-slate-800'
                              }`}
                            >
                              {todayActivityLogsCount}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </nav>
        );
      })()}

      {/* TAB 0: ROLE-SPECIFIC WORKSPACE & ANALYTICS DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {currentAdminUser && (
            <RoleDashboardWorkspace
              currentAdminUser={currentAdminUser}
              activePilgrims={activePilgrims}
              packages={packages}
              announcements={announcements}
              adminUsers={adminUsers}
              campaignSettings={campaignSettings}
              onNavigateTab={(tab) => setActiveTab(tab as any)}
            />
          )}

          {(isMasterAdmin || canViewPilgrimsModule || hasFinancePermission) && (
            <AdminAnalyticsDashboard
              pilgrims={activePilgrims}
              packages={packages}
              announcements={announcements}
              feedback={feedback}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onExportCSV={() => handleExportCSV(activePilgrims, 'الحجاج_المسجلين')}
            />
          )}
        </div>
      )}

      {/* TAB 1: PILGRIMS MANAGEMENT */}
      {activeTab === 'pilgrims' && canViewPilgrimsModule && (
        <div className="space-y-6">
          {/* Unified Header & Segmented Stats Banner (Matches Housing Manifest Style) */}
          <div className="bg-gradient-to-r from-blue-500/10 via-emerald-500/10 to-amber-500/10 border border-blue-500/30 rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-500 shrink-0 shadow-sm">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                  <span>سجل الحجاج المسجلين ومراجعة الطلبات</span>
                  <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-amber-500 text-slate-950">
                    موسم 1448هـ
                  </span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed max-w-2xl">
                  السجل الشامل لكافة الحجاج المسجلين في القافلة، تدقيق الهويات الوطنية، مراجعة إيصالات السداد، وتعديل بيانات الحاج والباقة ووسيلة المواصلات.
                </p>
              </div>
            </div>

            <div className="w-full lg:w-auto flex items-center justify-end">
              <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex items-center justify-around sm:justify-start gap-3 sm:gap-4 shadow-sm w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`text-right transition cursor-pointer ${statusFilter === 'all' ? 'opacity-100 underline decoration-amber-500 decoration-2 underline-offset-4' : 'opacity-85 hover:opacity-100'}`}
                >
                  <span className="text-[11px] text-slate-400 block font-bold">إجمالي الحجاج</span>
                  <strong className="text-sm font-black text-slate-900 dark:text-white">{totalPilgrimsCount} حاج</strong>
                </button>
                <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                <button
                  type="button"
                  onClick={() => setStatusFilter('مكتمل')}
                  className={`text-right transition cursor-pointer ${statusFilter === 'مكتمل' || statusFilter === 'مكتمل الدفع' ? 'opacity-100 underline decoration-emerald-500 decoration-2 underline-offset-4' : 'opacity-85 hover:opacity-100'}`}
                >
                  <span className="text-[11px] text-emerald-500 block font-bold">مؤكد الدفع</span>
                  <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400">{confirmedPaymentsCount}</strong>
                </button>
                <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                <button
                  type="button"
                  onClick={() => setStatusFilter('قيد المراجعة')}
                  className={`text-right transition cursor-pointer ${statusFilter === 'قيد المراجعة' ? 'opacity-100 underline decoration-amber-500 decoration-2 underline-offset-4' : 'opacity-85 hover:opacity-100'}`}
                >
                  <span className="text-[11px] text-amber-500 block font-bold">قيد المراجعة</span>
                  <strong className="text-sm font-black text-amber-600 dark:text-amber-400">{pendingReviewCount}</strong>
                </button>
                <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                <button
                  type="button"
                  onClick={() => setStatusFilter('تم القبول')}
                  className={`text-right transition cursor-pointer ${statusFilter === 'تم القبول' || statusFilter === 'مقبول ومؤكد' ? 'opacity-100 underline decoration-purple-500 decoration-2 underline-offset-4' : 'opacity-85 hover:opacity-100'}`}
                >
                  <span className="text-[11px] text-purple-500 block font-bold">تم القبول</span>
                  <strong className="text-sm font-black text-purple-600 dark:text-purple-400">{acceptedCount}</strong>
                </button>
              </div>
            </div>
          </div>

          {csvExportSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl text-emerald-500 text-sm flex items-center justify-between animate-fadeIn">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span className="font-bold">{csvExportSuccess}</span>
              </div>
              <span className="text-xs text-emerald-600 dark:text-emerald-400">الملف جاهز للاستخدام في Excel و Google Sheets</span>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
              <div className="relative flex-1 lg:max-w-md">
                <Search className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث باسم الحاج، رقم الهوية، أو رقم التسلسل..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 whitespace-nowrap">الموسم:</span>
                  <select
                    value={seasonFilter}
                    onChange={(e) => setSeasonFilter(e.target.value as any)}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="all">كافة المواسم ({totalPilgrimsCount})</option>
                    <option value="1448">موسم 1448هـ</option>
                    <option value="previous">المواسم السابقة</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 whitespace-nowrap">حالة الطلب:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="all">جميع الحالات النشطة ({totalPilgrimsCount})</option>
                    <option value="قيد المراجعة">قيد المراجعة ({pendingReviewCount})</option>
                    <option value="تم القبول">تم القبول ({acceptedCount})</option>
                    <option value="مكتمل">مكتمل / الدفع مؤكد ({confirmedPaymentsCount})</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Quick Payment & Vaccination Filters for Supervisors */}
            {(() => {
              const paidOrReportedCount = activePilgrims.filter((p) => getPilgrimPaymentDeclaration(p).isPaidOrReported).length;
              const reportedPendingCount = activePilgrims.filter((p) => getPilgrimPaymentDeclaration(p).key === 'reported').length;
              const approvedPayCount = activePilgrims.filter((p) => getPilgrimPaymentDeclaration(p).isApproved).length;
              const unpaidCount = activePilgrims.length - paidOrReportedCount;
              const vaccinatedCount = activePilgrims.filter((p) => getPilgrimVaccinationDeclaration(p).completed).length;
              const unvaccinatedCount = activePilgrims.length - vaccinatedCount;

              return (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                      فلتر السداد:
                    </span>
                    <select
                      value={paymentDeclarationFilter}
                      onChange={(e) => setPaymentDeclarationFilter(e.target.value as any)}
                      className="bg-slate-50 dark:bg-slate-950 border border-amber-500/40 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="all">جميع حالات السداد ({activePilgrims.length})</option>
                      <option value="paid">المسددون (مُبلّغ أو معتمد) ({paidOrReportedCount})</option>
                      <option value="reported">أبلغوا بالسداد — بانتظار الاعتماد ({reportedPendingCount})</option>
                      <option value="approved">المعتمدون من الإدارة ✓ ({approvedPayCount})</option>
                      <option value="unpaid">غير المسددين ({unpaidCount})</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      فلتر التطعيم:
                    </span>
                    <select
                      value={vaccinationFilter}
                      onChange={(e) => setVaccinationFilter(e.target.value as any)}
                      className="bg-slate-50 dark:bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="all">جميع حالات التطعيم ({activePilgrims.length})</option>
                      <option value="vaccinated">المطعّمون ({vaccinatedCount})</option>
                      <option value="unvaccinated">غير المطعّمين ({unvaccinatedCount})</option>
                    </select>
                  </div>

                  {(paymentDeclarationFilter !== 'all' || vaccinationFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentDeclarationFilter('all');
                        setVaccinationFilter('all');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold transition cursor-pointer"
                    >
                      إعادة ضبط فلاتر السداد والتطعيم
                    </button>
                  )}
                </div>
              );
            })()}
          </div>

          {(() => {
            const payFilterLabels: Record<string, string> = {
              paid: 'المسددون (مُبلّغ أو معتمد)',
              reported: 'أبلغوا بالسداد بانتظار الاعتماد',
              approved: 'المعتمدون من الإدارة',
              unpaid: 'غير المسددين',
            };
            const vacFilterLabels: Record<string, string> = {
              vaccinated: 'المطعّمون',
              unvaccinated: 'غير المطعّمين',
            };
            const filterParts: string[] = [];
            if (seasonFilter !== 'all') {
              filterParts.push(`الموسم: ${seasonFilter === '1448' ? '1448هـ' : 'المواسم السابقة'}`);
            }
            if (statusFilter !== 'all') filterParts.push(`الحالة: ${statusFilter}`);
            if (paymentDeclarationFilter !== 'all') {
              filterParts.push(`السداد: ${payFilterLabels[paymentDeclarationFilter]}`);
            }
            if (vaccinationFilter !== 'all') {
              filterParts.push(`التطعيم: ${vacFilterLabels[vaccinationFilter]}`);
            }
            if (searchQuery.trim()) filterParts.push(`بحث: "${searchQuery.trim()}"`);
            const activeFilterText = filterParts.length > 0 ? filterParts.join(' • ') : undefined;

            return (
              <DynamicPilgrimRosterSection
                rosterType="pilgrims"
                pilgrims={filteredPilgrims}
                columnContext={sharedRosterColumnContext}
                accentColorClass="text-amber-500 bg-amber-500/5"
                onOpenOfficialPrintModal={(payload) => setOfficialReportModal(payload)}
                reportMeta={{
                  title: 'كشف بيانات الحجاج المسجلين',
                  subtitle: `سجل الحجاج المعتمدين في قافلة القائم (${filteredPilgrims.length} حاج)`,
                  category: 'كشوف وسجلات الحجاج المعتمدة',
                  filterSummary: activeFilterText,
                  filename: 'كشف_حجاج_قافلة_القائم',
                  signatureRightLabel: 'مشرف تسجيل الحجاج',
                  generatedBy: currentAdminUser?.fullName || currentAdminUser?.username || 'إدارة قافلة القائم',
                  summaryCards: [
                    { label: 'إجمالي الحجاج بالكشف', value: `${filteredPilgrims.length} حاج` },
                    {
                      label: 'المؤكد دفعهم',
                      value: `${filteredPilgrims.filter((p) => isPilgrimPaymentConfirmed(p)).length} حاج`,
                    },
                    {
                      label: 'حجاج الحافلات',
                      value: `${filteredPilgrims.filter((p) => !isPilgrimAirTravel(p)).length} حاج`,
                    },
                    {
                      label: 'حجاج الطيران',
                      value: `${filteredPilgrims.filter((p) => isPilgrimAirTravel(p)).length} حاج`,
                    },
                  ],
                }}
                tableHeaderContent={
                  <>
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-amber-500" />
                      <span className="font-bold text-slate-900 dark:text-white text-sm">سجل الحجاج المسجلين</span>
                      <span className="bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono font-bold px-3 py-1 rounded-xl text-xs border border-amber-500/30">
                        إجمالي الحجاج في السجل: {activePilgrims.length} حاج
                      </span>
                    </div>
                    {filteredPilgrims.length !== activePilgrims.length && (
                      <span className="bg-blue-500/20 text-blue-600 dark:text-blue-400 font-mono font-bold px-3 py-1 rounded-xl text-xs border border-blue-500/30">
                        عدد حجاج نتيجة التصفية: {filteredPilgrims.length} حاج
                      </span>
                    )}
                  </>
                }
                renderCustomCell={(pilgrim, colKey) => {
                  if (colKey === 'fullName') {
                    return (
                      <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        <span>{pilgrim.firstName} {pilgrim.secondName} {pilgrim.lastName}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/25">
                          {pilgrim.hajjYear ? `${pilgrim.hajjYear}هـ` : '1448هـ'}
                        </span>
                      </div>
                    );
                  }
                  if (colKey === 'nationalId') {
                    return (
                      <div className="flex items-center gap-2 font-mono text-xs" dir="ltr">
                        <span>{pilgrim.nationalId}</span>
                        {pilgrim.nationalIdImage && (
                          <button
                            onClick={() => setEditingPilgrim(pilgrim)}
                            className="px-2 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-md text-[10px] font-sans font-bold hover:bg-amber-500/25 transition"
                            title="عرض صورة بطاقة الأحوال المرفقة"
                          >
                            بطاقة مرفقة
                          </button>
                        )}
                      </div>
                    );
                  }
                  if (colKey === 'selectedPackage') {
                    return (
                      <span className="text-xs font-bold text-amber-500">
                        {pilgrim.selectedPackage || 'التسجيل العام'}
                      </span>
                    );
                  }
                  if (colKey === 'transport') {
                    return isPilgrimAirTravel(pilgrim) ? (
                      <span className="inline-flex items-center gap-1.5 bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 px-2.5 py-1 rounded-lg text-xs font-black whitespace-nowrap">
                        <Plane className="w-3.5 h-3.5" />
                        <span>طائرة</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-xs font-black whitespace-nowrap">
                        <Bus className="w-3.5 h-3.5" />
                        <span>باص</span>
                      </span>
                    );
                  }
                  if (colKey === 'companionsCount') {
                    return (
                      <div className="flex flex-col items-start gap-1">
                        {pilgrim.hasMahram && pilgrim.mahramDetails && pilgrim.mahramDetails.length > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25 rounded-lg text-[11px] font-bold"
                            title={pilgrim.mahramDetails.map((m) => `${m.name} (${m.relation})`).join('، ')}
                          >
                            <Users className="w-3 h-3" />
                            <span>{pilgrim.mahramDetails.length} مرافق</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">بدون مرافقين</span>
                        )}
                        {pilgrim.madinahPrivateRoomRequested && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-lg text-[10px] font-black"
                            title={pilgrim.madinahPrivateRoomNote || 'طلب غرفة خاصة في المدينة المنورة'}
                          >
                            <Hotel className="w-3 h-3" />
                            <span>غرفة خاصة بالمدينة</span>
                          </span>
                        )}
                      </div>
                    );
                  }
                  if (colKey === 'pilgrimStatus') {
                    return (
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                            pilgrim.status === 'مقبول ومؤكد' || pilgrim.status === 'مكتمل الدفع' || pilgrim.status === 'مكتمل' || pilgrim.status === 'تم القبول'
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : pilgrim.status === 'مرفوض'
                              ? 'bg-red-500/15 text-red-500 border border-red-500/30'
                              : pilgrim.status === 'معتذر'
                              ? 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
                              : 'bg-amber-500/15 text-amber-500'
                          }`}
                        >
                          {pilgrim.status}
                        </span>
                        {pilgrim.status === 'مرفوض' && (pilgrim.rejectionReason || pilgrim.statusNotes) && (
                          <span className="text-[11px] text-red-500 dark:text-red-400 font-medium bg-red-500/5 border border-red-500/20 rounded-lg px-2 py-0.5 max-w-[220px] break-words leading-snug">
                            سبب الرفض: {pilgrim.rejectionReason || pilgrim.statusNotes}
                          </span>
                        )}
                      </div>
                    );
                  }
                  if (colKey === 'paymentDeclarationStatus') {
                    return renderPaymentDeclarationStatusCell(pilgrim);
                  }
                  if (colKey === 'paymentDeclarationDate') {
                    return renderPaymentDeclarationDateCell(pilgrim);
                  }
                  if (colKey === 'vaccinationStatus') {
                    return renderVaccinationStatusCell(pilgrim);
                  }
                  if (colKey === 'vaccinationDate') {
                    return renderVaccinationDateCell(pilgrim);
                  }
                  return undefined;
                }}
                renderActions={(pilgrim) => (
                  <div className="flex items-center justify-center gap-2">
                    {pilgrim.status === 'مكتمل الدفع' ? (
                      <button
                        onClick={() => {
                          const seq = pilgrims.findIndex((p) => p.nationalId === pilgrim.nationalId) + 1;
                          setOfficialReceiptPilgrim({
                            ...pilgrim,
                            pilgrimSequenceNumber: seq > 0 ? seq : undefined,
                            membershipNumber: pilgrim.membershipNumber || `QAEM-1448-${pilgrim.registrationReference || '1001'}`,
                          });
                        }}
                        className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 rounded-xl transition cursor-pointer"
                        title="عرض وتحميل سند القبض والدفع المالي الرسمي PDF"
                      >
                        <FileCheck className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        disabled
                        className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 rounded-xl transition cursor-not-allowed opacity-40"
                        title="سند الدفع غير متاح - يمنع إصدار السند قبل تأكيد الدفع"
                      >
                        <FileCheck className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setEditingPilgrim(pilgrim)}
                      className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 rounded-xl transition cursor-pointer"
                      title="تعديل البيانات"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: 'تحذير: استبعاد الحاج',
                          message: `هل أنت متأكد من رغبتك في استبعاد الحاج ${pilgrim.firstName} ${pilgrim.lastName} ونقله لكشف المستبعدين؟`,
                          onConfirm: () => {
                            onUpdatePilgrim({ ...pilgrim, status: 'محذوف', isDeleted: true });
                            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                          },
                        });
                      }}
                      className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition cursor-pointer"
                      title="استبعاد ونقل لكشف المستبعدين"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              />
            );
          })()}
        </div>
      )}

      {/* TAB 1.5: EXCLUDED PILGRIMS MANAGEMENT */}
      {activeTab === 'excluded' && currentAdminUser?.permissions.managePilgrims && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-blue-500/10 via-emerald-500/10 to-amber-500/10 border border-blue-500/30 rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-500 shrink-0 shadow-sm">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                  <span>قائمة المستبعدين (المعتذرين والمرفوضين والمحذوفين)</span>
                  <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-red-600 text-white">
                    الأرشيف
                  </span>
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed max-w-2xl">
                  يتم ترحيل بيانات الحاج المعتذر أو المرفوض أو المستبعد تلقائياً إلى هذا الكشف مع حفظ أسباب الرفض أو الاعتذار وإمكانية استعادته للسجل النشط.
                </p>
              </div>
            </div>
            <div className="w-full lg:w-auto flex items-center justify-end">
              <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex items-center justify-around sm:justify-start gap-3 sm:gap-4 shadow-sm w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className="text-right transition cursor-pointer"
                >
                  <span className="text-[11px] text-slate-400 block font-bold">إجمالي المستبعدين</span>
                  <strong className="text-sm font-black text-slate-900 dark:text-white">{excludedPilgrimsList.length} حاج</strong>
                </button>
                <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                <button
                  type="button"
                  onClick={() => setStatusFilter('معتذر')}
                  className="text-right transition cursor-pointer"
                >
                  <span className="text-[11px] text-emerald-500 block font-bold">معتذر</span>
                  <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400">{apologizedCount}</strong>
                </button>
                <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                <button
                  type="button"
                  onClick={() => setStatusFilter('مرفوض')}
                  className="text-right transition cursor-pointer"
                >
                  <span className="text-[11px] text-amber-500 block font-bold">مرفوض</span>
                  <strong className="text-sm font-black text-amber-600 dark:text-amber-400">{rejectedCount}</strong>
                </button>
                <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                <button
                  type="button"
                  onClick={() => setStatusFilter('محذوف')}
                  className="text-right transition cursor-pointer"
                >
                  <span className="text-[11px] text-purple-500 block font-bold">محذوف</span>
                  <strong className="text-sm font-black text-purple-600 dark:text-purple-400">{deletedCount}</strong>
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center flex-1">
              <div className="relative flex-1 sm:max-w-md">
                <Search className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث في المستبعدين بالاسم أو الهوية أو سبب الرفض..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 whitespace-nowrap">تصفية بالحالة:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                >
                  <option value="all">جميع المستبعدين ({excludedPilgrimsList.length})</option>
                  <option value="مرفوض">مرفوض ({rejectedCount})</option>
                  <option value="معتذر">معتذر ({apologizedCount})</option>
                  <option value="محذوف">محذوف ({deletedCount})</option>
                </select>
              </div>
            </div>
          </div>

          {(() => {
            const filterParts: string[] = [];
            if (statusFilter !== 'all') filterParts.push(`حالة الاستبعاد: ${statusFilter}`);
            if (searchQuery.trim()) filterParts.push(`بحث: "${searchQuery.trim()}"`);

            return (
              <DynamicPilgrimRosterSection
                rosterType="excluded"
                pilgrims={filteredPilgrims}
                columnContext={sharedRosterColumnContext}
                accentColorClass="text-red-500 bg-red-500/5"
                onOpenOfficialPrintModal={(payload) => setOfficialReportModal(payload)}
                reportMeta={{
                  title: 'كشف الحجاج المستبعدين والمعتذرين',
                  subtitle: `سجل الحالات المستبعدة والمعتذرة والمرفوضة (${filteredPilgrims.length} سجل)`,
                  category: 'كشوف وسجلات الحجاج المعتمدة',
                  filterSummary: filterParts.length > 0 ? filterParts.join(' • ') : undefined,
                  filename: 'كشف_المستبعدين_قافلة_القائم',
                  signatureRightLabel: 'مشرف إدارة السجلات',
                  generatedBy: currentAdminUser?.fullName || currentAdminUser?.username || 'إدارة قافلة القائم',
                  summaryCards: [
                    { label: 'إجمالي المعروض بالكشف', value: filteredPilgrims.length },
                    { label: 'معتذر', value: filteredPilgrims.filter((p) => p.status === 'معتذر').length },
                    { label: 'مرفوض', value: filteredPilgrims.filter((p) => p.status === 'مرفوض').length },
                  ],
                }}
                renderCustomCell={(pilgrim, colKey) => {
                  if (colKey === 'exclusionStatus') {
                    return (
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-black tracking-wider shadow-sm border w-fit inline-block ${
                          pilgrim.status === 'معتذر'
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                            : pilgrim.status === 'مرفوض'
                            ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
                            : 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30'
                        }`}
                      >
                        {pilgrim.status === 'معتذر'
                          ? 'معتذر عن الحج'
                          : pilgrim.status === 'مرفوض'
                          ? 'مرفوض'
                          : 'محذوف من الكشف'}
                      </span>
                    );
                  }
                  if (colKey === 'exclusionReason') {
                    const reason = (pilgrim.rejectionReason || pilgrim.statusNotes || '').trim();
                    return reason ? (
                      <div className="text-xs text-red-500 dark:text-red-400 font-medium bg-red-500/5 border border-red-500/20 rounded-xl px-2.5 py-1.5 max-w-xs break-words leading-relaxed">
                        {reason}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    );
                  }
                  return undefined;
                }}
                renderActions={(pilgrim) => (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setEditingPilgrim(pilgrim)}
                      className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 rounded-xl transition cursor-pointer"
                      title="تعديل الحالة أو سبب الرفض"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: 'استعادة الحاج',
                          message: `هل تريد استعادة الحاج ${pilgrim.firstName} ${pilgrim.lastName} وإعادته لسجل الحجاج المسجلين النشط؟`,
                          onConfirm: () => {
                            onUpdatePilgrim({ ...pilgrim, status: 'قيد المراجعة', rejectionReason: '', isDeleted: false });
                            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                          },
                        });
                      }}
                      className="px-3 py-1.5 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 rounded-xl text-[10px] font-black transition border border-emerald-500/20 flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle className="w-3 h-3" />
                      <span>إعادة تنشيط</span>
                    </button>
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: 'حذف نهائي',
                          message: `سيتم حذف الحاج ${pilgrim.firstName} نهائياً من قاعدة البيانات. لا يمكن التراجع!`,
                          onConfirm: () => {
                            onDeletePilgrim(pilgrim.id || pilgrim.nationalId);
                            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                          },
                        });
                      }}
                      className="p-1.5 text-red-400 hover:text-red-600 transition cursor-pointer"
                      title="حذف نهائي"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                emptyStateContent="لا يوجد حجاج مستبعدون حالياً"
              />
            );
          })()}
        </div>
      )}

      {/* TAB 1.65: COMPANIONS & MAHRAMS ROSTER (كشف المرافقين والمحارم) */}
      {activeTab === 'companionsList' && currentAdminUser?.permissions.managePilgrims && (
        <CompanionsMahramRosterPanel
          activePilgrims={activePilgrims}
          packages={packages}
          seasons={seasons}
          currentAdminUser={currentAdminUser}
          campaignSettings={campaignSettings}
        />
      )}

      {/* TAB 1.75: INTEGRATED RELIGIOUS GUIDANCE SYSTEM (منظومة الإرشاد الديني المتكاملة - 11 وحدة) */}
      {activeTab === 'religiousGuidance' && hasReligiousSupervisionPermission && (
        <ReligiousGuidanceManager
          activePilgrims={activePilgrims}
          currentAdminUser={currentAdminUser}
          campaignSettings={campaignSettings}
          onUpdateCampaignSettings={onUpdateCampaignSettings}
          initialUnit={selectedReligiousUnit}
          onActiveUnitChange={(unit) => setSelectedReligiousUnit(unit)}
        />
      )}

      {/* TAB 1.8: MARJI LIST (كشف المراجع - ضمن صلاحيات الإشراف الديني) */}
      {activeTab === 'marjiList' && hasReligiousSupervisionPermission && (() => {
        const uniqueMarjis = Array.from(
          new Set(
            activePilgrims.map(p => (p.currentMarji || 'غير محدد').trim()).filter(Boolean)
          )
        );

        const marjiFilteredPilgrims = activePilgrims.filter(p => {
          const currentM = (p.currentMarji || 'غير محدد').trim();
          const matchesMarji = marjiFilter === 'all' || currentM === marjiFilter;
          const q = searchQuery.trim().toLowerCase();
          const fullName = `${p.firstName || ''} ${p.secondName || ''} ${p.thirdName || ''} ${p.lastName || ''}`.toLowerCase();
          const matchesQuery =
            !q ||
            fullName.includes(q) ||
            (p.mobile || '').toLowerCase().includes(q) ||
            currentM.toLowerCase().includes(q) ||
            (p.previousMarji || '').toLowerCase().includes(q);
          return matchesMarji && matchesQuery;
        });

        const handleExportMarjiCSV = () => {
          if (marjiFilteredPilgrims.length === 0) return;
          const dynRel = extractDynamicReportColumns(marjiFilteredPilgrims, 'religious');
          const headers = ['# (م)', 'اسم الحاج', 'رقم الجوال', 'اسم المرجع', ...dynRel.columns.map((c) => c.label)];
          const rows = marjiFilteredPilgrims.map((p, i) => [
            i + 1,
            `${p.firstName || ''} ${p.secondName || ''} ${p.thirdName || ''} ${p.lastName || ''}`.replace(/\s+/g, ' ').trim(),
            p.mobile || '',
            p.currentMarji || 'غير محدد',
            ...dynRel.getRowValues(p),
          ]);
          const dateStr = new Date().toISOString().split('T')[0];
          void exportAlQaemExcelReport({
            reportTitle: 'كشف مراجع التقليد للحجاج المسجلين',
            subtitle: 'توزيع الحجاج حسب مرجع التقليد المعتمد للإرشاد والتوعية الفقهية',
            category: 'منظومة الإرشاد الديني والتوعية',
            filename: `كشف_المراجع_قافلة_القائم_${dateStr}`,
            columns: headers,
            rows,
            generatedBy: currentAdminUser?.fullName || 'الإدارة العامة',
            summaryCards: [
              { label: 'إجمالي الحجاج في الكشف', value: `${marjiFilteredPilgrims.length} حاج` },
              { label: 'التصفية الحالية', value: marjiFilter === 'all' ? 'جميع المراجع' : marjiFilter },
            ],
          });
        };

        return (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-500/10 via-emerald-500/10 to-amber-500/10 border border-blue-500/30 rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-500 shrink-0 shadow-sm">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">كشف المراجع للحجاج المسجلين</h2>
                    <span className="bg-purple-600 text-white px-2.5 py-0.5 rounded-lg text-[11px] font-bold">
                      الإشراف الديني
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed max-w-2xl">
                    كشف مخصص للجنة الإشراف والإرشاد الديني يتضمن اسم الحاج ورقم جواله واسم مرجع التقليد.
                  </p>
                </div>
              </div>
              <div className="w-full lg:w-auto flex items-center justify-end">
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex items-center justify-around sm:justify-start gap-3 sm:gap-4 shadow-sm w-full sm:w-auto">
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block font-bold">إجمالي الحجاج</span>
                    <strong className="text-sm font-black text-slate-900 dark:text-white">{activePilgrims.length} حاج</strong>
                  </div>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <div className="text-right">
                    <span className="text-[11px] text-emerald-500 block font-bold">بالكشف الحالي</span>
                    <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400">{marjiFilteredPilgrims.length}</strong>
                  </div>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <div className="text-right">
                    <span className="text-[11px] text-amber-500 block font-bold">عدد المراجع</span>
                    <strong className="text-sm font-black text-amber-600 dark:text-amber-400">{uniqueMarjis.length}</strong>
                  </div>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <div className="text-right">
                    <span className="text-[11px] text-purple-500 block font-bold">حج التمتع</span>
                    <strong className="text-sm font-black text-purple-600 dark:text-purple-400">
                      {activePilgrims.filter(p => (p.hajjType || '').includes('تمتع') || (p.hajjType || '').includes('أول مرة')).length}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {uniqueMarjis.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMarjiFilter('all')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition border ${
                    marjiFilter === 'all'
                      ? 'bg-purple-600 text-white border-purple-600 shadow'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-purple-500/40'
                  }`}
                >
                  جميع المراجع ({activePilgrims.length})
                </button>
                {uniqueMarjis.map(marji => {
                  const count = activePilgrims.filter(p => (p.currentMarji || 'غير محدد').trim() === marji).length;
                  return (
                    <button
                      key={marji}
                      type="button"
                      onClick={() => setMarjiFilter(marji)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition border ${
                        marjiFilter === marji
                          ? 'bg-purple-600 text-white border-purple-600 shadow'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-purple-500/40'
                      }`}
                    >
                      {marji} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
              <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center flex-1">
                <div className="relative flex-1 sm:max-w-md">
                  <Search className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="بحث باسم الحاج، رقم الجوال، أو اسم المرجع..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 whitespace-nowrap">تصفية بالمرجع:</span>
                  <select
                    value={marjiFilter}
                    onChange={(e) => setMarjiFilter(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="all">جميع المراجع ({activePilgrims.length})</option>
                    {uniqueMarjis.map(marji => (
                      <option key={marji} value={marji}>
                        {marji} ({activePilgrims.filter(p => (p.currentMarji || 'غير محدد').trim() === marji).length})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {(() => {
              const filterParts: string[] = [];
              if (marjiFilter !== 'all') filterParts.push(`المرجع: ${marjiFilter}`);
              if (searchQuery.trim()) filterParts.push(`بحث: "${searchQuery.trim()}"`);

              return (
                <DynamicPilgrimRosterSection
                  rosterType="marjiList"
                  pilgrims={marjiFilteredPilgrims}
                  columnContext={sharedRosterColumnContext}
                  accentColorClass="text-purple-500 bg-purple-500/5"
                  onOpenOfficialPrintModal={(payload) => setOfficialReportModal(payload)}
                  reportMeta={{
                    title: 'كشف مراجع التقليد للحجاج المسجلين',
                    subtitle: 'توزيع الحجاج حسب مرجع التقليد المعتمد للإرشاد والتوعية الفقهية',
                    category: 'منظومة الإرشاد الديني والتوعية',
                    filterSummary: filterParts.length > 0 ? filterParts.join(' • ') : undefined,
                    filename: 'كشف_المراجع_قافلة_القائم',
                    signatureRightLabel: 'مشرف الإرشاد الديني',
                    generatedBy: currentAdminUser?.fullName || currentAdminUser?.username || 'إدارة قافلة القائم',
                    summaryCards: [
                      { label: 'إجمالي الحجاج بالكشف', value: `${marjiFilteredPilgrims.length} حاج` },
                      { label: 'التصفية الحالية', value: marjiFilter === 'all' ? 'جميع المراجع' : marjiFilter },
                    ],
                  }}
                  renderCustomCell={(pilgrim, colKey) => {
                    if (colKey === 'mobile') {
                      return (
                        <a
                          href={`tel:${pilgrim.mobile}`}
                          dir="ltr"
                          className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-800 dark:text-slate-200 hover:text-purple-500 font-bold transition"
                        >
                          <span>{pilgrim.mobile}</span>
                        </a>
                      );
                    }
                    if (colKey === 'marji') {
                      return (
                        <span className="px-3 py-1 rounded-xl text-xs font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 inline-block">
                          {pilgrim.currentMarji || 'غير محدد'}
                        </span>
                      );
                    }
                    return undefined;
                  }}
                  emptyStateContent="لا توجد سجلات مطابقة في كشف المراجع حالياً"
                />
              );
            })()}
          </div>
        );
      })()}

      {/* TAB 1.9: DYNAMIC MANASIK GUIDE MANAGEMENT (إدارة دليل المناسك - الإرشاد الديني) */}
      {(activeTab === 'manasikGuide' || activeTab === 'hajjTimeline') &&
        hasReligiousSupervisionPermission && (
          <ManasikGuideAdmin
            campaignSettings={campaignSettings}
            currentAdminUser={currentAdminUser}
            onUpdateCampaignSettings={onUpdateCampaignSettings}
          />
        )}

      {/* TAB 1.6: BUS BOARDING (رحلات الحافلات) */}
      {activeTab === 'busBoarding' && currentAdminUser?.permissions.managePilgrims && (() => {
        const busFilteredPilgrims = busPilgrimsList.filter((p) => {
          const fullName = `${p.firstName} ${p.secondName} ${p.thirdName} ${p.lastName}`;
          const busLabel = (p.busNumber || 'غير مخصص').trim();
          const seatLabel = (p.busSeat || '').trim();
          const matchesSearch =
            fullName.includes(searchQuery) ||
            (p.nationalId || '').includes(searchQuery) ||
            busLabel.includes(searchQuery) ||
            seatLabel.includes(searchQuery);
          const matchesBus =
            busFilter === 'all'
              ? true
              : busFilter === 'unassigned'
              ? !(p.busNumber || '').trim()
              : busLabel === busFilter;
          return matchesSearch && matchesBus;
        });

        const assignedBusPilgrimsCount = busPilgrimsList.filter(p => Boolean((p.busNumber || '').trim())).length;
        const unassignedBusPilgrimsCount = busPilgrimsList.length - assignedBusPilgrimsCount;

        const handleAssignBusAndSeat = (pilgrim: Pilgrim, nextBus: string, nextSeat: string) => {
          if (isPilgrimAirTravel(pilgrim)) {
            setBusCapacityWarning(
              `تنبيه: الحاج (${pilgrim.firstName} ${pilgrim.lastName}) مسجل في رحلات الطيران ولا يمكن تسكينه في الحافلات إلا بعد تعديل طلبه من (سجل الحجاج).`
            );
            return;
          }
          const cleanBus = nextBus.trim();
          const cleanSeat = nextSeat.trim();

          if (cleanBus) {
            const currentCountExcludingThis = getBusPassengersCount(cleanBus, pilgrim.id);
            if (currentCountExcludingThis >= MAX_BUS_CAPACITY) {
              setBusCapacityWarning(
                `تنبيه: العدد أكبر من المقاعد! (${cleanBus}) وصلت للحد الأقصى المسموح به وهو ${MAX_BUS_CAPACITY} راكب في الحافلة الواحدة. يرجى اختيار حافلة أخرى.`
              );
              return;
            }
          }

          if (cleanSeat) {
            const numericSeat = parseInt(cleanSeat.replace(/[^\d]/g, ''), 10);
            if (!isNaN(numericSeat) && (numericSeat > MAX_BUS_CAPACITY || numericSeat < 1)) {
              setBusCapacityWarning(
                `تنبيه: العدد أكبر من المقاعد! رقم المقعد (${numericSeat}) يتجاوز سعة الحافلة المحددة بـ ${MAX_BUS_CAPACITY} مقعداً (من 1 إلى 49).`
              );
              return;
            }
            if (cleanBus) {
              const duplicateSeatHolder = busPilgrimsList.find(
                p =>
                  p.id !== pilgrim.id &&
                  (p.busNumber || '').trim() === cleanBus &&
                  (p.busSeat || '').trim() === cleanSeat
              );
              if (duplicateSeatHolder) {
                setBusCapacityWarning(
                  `تنبيه: المقعد رقم (${cleanSeat}) في (${cleanBus}) محجوز مسبقاً للحاج: ${duplicateSeatHolder.firstName} ${duplicateSeatHolder.lastName}.`
                );
                return;
              }
            }
          }

          setBusCapacityWarning(null);
          onUpdatePilgrim({
            ...pilgrim,
            transport: 'باص',
            busNumber: cleanBus,
            busSeat: cleanSeat,
          });
        };

        const handleExportBusBoardingCSV = () => {
          const dynBus = extractDynamicReportColumns(busFilteredPilgrims, 'transport_bus');
          const headers = ['#', 'اسم الحاج', 'رقم البطاقة (الهوية)', 'رقم الباص', 'رقم المقعد', 'رقم الجوال', 'الباقة', ...dynBus.columns.map((c) => c.label)];
          const rows = busFilteredPilgrims.map((p, idx) => [
            idx + 1,
            `${p.firstName} ${p.secondName} ${p.thirdName} ${p.lastName}`.replace(/\s+/g, ' ').trim(),
            p.nationalId || '',
            p.busNumber || 'غير مخصص',
            p.busSeat || 'غير مخصص',
            p.mobile || '',
            p.selectedPackage || 'التسجيل العام',
            ...dynBus.getRowValues(p),
          ]);
          void exportAlQaemExcelReport({
            reportTitle: 'كشف المجموعات وإركاب الباصات وتوزيع المقاعد',
            subtitle: 'كشف رسمي لحجاج رحلات البر وتوزيع الحافلات والمقاعد المعتمدة',
            category: 'كشوف المجموعات وإركاب الحافلات',
            filename: `كشف_اركاب_الباصات_${new Date().toISOString().split('T')[0]}`,
            columns: headers,
            rows,
            generatedBy: currentAdminUser?.fullName || 'الإدارة العامة',
            summaryCards: [
              { label: 'إجمالي حجاج الحافلات', value: `${busPilgrimsList.length} حاج` },
              { label: 'تم إركابهم', value: `${assignedBusPilgrimsCount} حاج` },
              { label: 'بانتظار الباص', value: `${unassignedBusPilgrimsCount} حاج` },
              { label: 'عدد الحافلات المعتمدة', value: `${BUS_OPTIONS.length} حافلات` },
            ],
          });
        };

        return (
          <div className="space-y-6 animate-fadeIn">
            {/* Header & Unified Segmented Stats (Matches Housing Manifest Style) */}
            <div className="bg-gradient-to-r from-blue-500/10 via-emerald-500/10 to-amber-500/10 border border-blue-500/30 rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-500 shrink-0 shadow-sm">
                  <Bus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                    <span>رحلات الحافلات وتوزيع المقاعد (حجاج البر فقط)</span>
                    <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-sky-500 text-white">
                      الحد الأقصى: {MAX_BUS_CAPACITY} راكب لكل حافلة
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed max-w-2xl">
                    يعرض هذا الكشف <strong>حجاج رحلات الحافلات (الباص) فقط</strong> لمنع التداخل مع حجاج الطيران. لتغيير وسيلة سفر أي حاج من طيران إلى باص (أو العكس)، يرجى تعديل الطلب من <strong>سجل الحجاج</strong> أولاً.
                  </p>
                </div>
              </div>

              <div className="w-full lg:w-auto flex items-center justify-end">
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex items-center justify-around sm:justify-start gap-3 sm:gap-4 shadow-sm w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setBusFilter('all')}
                    className="text-right transition cursor-pointer"
                  >
                    <span className="text-[11px] text-slate-400 block font-bold">حجاج الحافلات</span>
                    <strong className="text-sm font-black text-slate-900 dark:text-white">{busPilgrimsList.length} حاج</strong>
                  </button>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <button
                    type="button"
                    onClick={() => setBusFilter('all')}
                    className="text-right transition cursor-pointer"
                  >
                    <span className="text-[11px] text-emerald-500 block font-bold">تم إركابهم</span>
                    <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400">{assignedBusPilgrimsCount}</strong>
                  </button>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <button
                    type="button"
                    onClick={() => setBusFilter('unassigned')}
                    className="text-right transition cursor-pointer"
                  >
                    <span className="text-[11px] text-amber-500 block font-bold">بانتظار الباص</span>
                    <strong className="text-sm font-black text-amber-600 dark:text-amber-400">{unassignedBusPilgrimsCount}</strong>
                  </button>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <div className="text-right">
                    <span className="text-[11px] text-purple-500 block font-bold">عدد الحافلات</span>
                    <strong className="text-sm font-black text-purple-600 dark:text-purple-400">{BUS_OPTIONS.length}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Capacity Warning Alert Banner */}
            {busCapacityWarning && (
              <div className="bg-red-500/15 border-2 border-red-500 rounded-2xl p-4 flex items-center justify-between gap-3 text-red-600 dark:text-red-300 shadow-lg animate-fadeIn">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
                  <div>
                    <h4 className="text-xs sm:text-sm font-black">تنبيه إركاب الحافلات!</h4>
                    <p className="text-xs font-bold mt-0.5">{busCapacityWarning}</p>
                  </div>
                </div>
                <button
                  onClick={() => setBusCapacityWarning(null)}
                  className="px-3 py-1.5 bg-red-500 text-white rounded-xl text-xs font-bold hover:bg-red-600 transition shrink-0"
                >
                  إغلاق التنبيه
                </button>
              </div>
            )}

            {/* Bus Fleet Capacity Cards */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <span className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Bus className="w-4 h-4 text-sky-500" />
                  <span>عداد ركاب الحافلات (الحد الأقصى {MAX_BUS_CAPACITY} مقعداً لكل حافلة):</span>
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {busFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setBusFilter('all')}
                      className="text-xs font-bold text-sky-500 hover:underline px-2 py-1"
                    >
                      عرض جميع حجاج الحافلات ({busPilgrimsList.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAddNewBus}
                    className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs transition flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0"
                    title="إضافة حافلة جديدة عند الحاجة"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة حافلة جديدة ({getNextBusName()})</span>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                {BUS_OPTIONS.map((busName) => {
                  const count = getBusPassengersCount(busName);
                  const isFull = count >= MAX_BUS_CAPACITY;
                  const isSelected = busFilter === busName;
                  const canRemoveEmpty = count === 0 && BUS_OPTIONS.length > 1;
                  return (
                    <div
                      key={busName}
                      onClick={() => setBusFilter(isSelected ? 'all' : busName)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setBusFilter(isSelected ? 'all' : busName);
                        }
                      }}
                      className={`p-3 rounded-2xl border text-right transition flex flex-col justify-between gap-1.5 cursor-pointer relative ${
                        isSelected
                          ? 'bg-sky-500 text-white border-sky-400 shadow-md'
                          : isFull
                          ? 'bg-red-500/10 border-red-500/40 text-red-600 dark:text-red-400'
                          : count > 0
                          ? 'bg-sky-500/5 border-sky-500/30 text-slate-800 dark:text-slate-200 hover:bg-sky-500/10'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full gap-1">
                        <span className="text-xs font-black">{busName}</span>
                        <div className="flex items-center gap-1">
                          {canRemoveEmpty && (
                            <button
                              type="button"
                              onClick={(e) => handleRemoveEmptyBus(busName, e)}
                              title={`حذف ${busName} (فارغة)`}
                              className={`p-1 rounded-lg transition ${
                                isSelected
                                  ? 'hover:bg-white/20 text-white'
                                  : 'hover:bg-red-500/15 text-slate-400 hover:text-red-500'
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <Bus className="w-3.5 h-3.5 opacity-80" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between w-full text-[11px] font-bold">
                        <span>{count} / {MAX_BUS_CAPACITY}</span>
                        {isFull && (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${isSelected ? 'bg-white text-red-600' : 'bg-red-500 text-white'}`}>
                            ممتلئة
                          </span>
                        )}
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            isFull ? 'bg-red-500' : isSelected ? 'bg-white' : 'bg-sky-500'
                          }`}
                          style={{ width: `${Math.min(100, (count / MAX_BUS_CAPACITY) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Filter & Export Bar */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="بحث باسم الحاج، رقم البطاقة، رقم الباص، أو المقعد..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 whitespace-nowrap">تصفية بالحافلة:</span>
                  <select
                    value={busFilter}
                    onChange={(e) => setBusFilter(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-sky-500 font-bold"
                  >
                    <option value="all">جميع حجاج الحافلات ({busPilgrimsList.length})</option>
                    <option value="unassigned">غير مخصص لهم باص ({unassignedBusPilgrimsCount})</option>
                    {BUS_OPTIONS.map((busName) => {
                      const cnt = getBusPassengersCount(busName);
                      return (
                        <option key={busName} value={busName}>
                          {busName} ({cnt} / {MAX_BUS_CAPACITY} راكب){cnt >= MAX_BUS_CAPACITY ? ' - ممتلئة' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>

            {(() => {
              const filterParts: string[] = [];
              if (busFilter !== 'all') {
                filterParts.push(busFilter === 'unassigned' ? 'غير مخصص لهم باص' : `الحافلة: ${busFilter}`);
              }
              if (searchQuery.trim()) filterParts.push(`بحث: "${searchQuery.trim()}"`);

              return (
                <DynamicPilgrimRosterSection
                  rosterType="busBoarding"
                  pilgrims={busFilteredPilgrims}
                  columnContext={sharedRosterColumnContext}
                  accentColorClass="text-sky-500 bg-sky-500/5"
                  onOpenOfficialPrintModal={(payload) => setOfficialReportModal(payload)}
                  reportMeta={{
                    title: 'كشف تفويج وإركاب الباصات وتوزيع المقاعد',
                    subtitle: 'كشف رسمي لحجاج رحلات البر وتوزيع الحافلات والمقاعد المعتمدة',
                    category: 'كشوف المجموعات وإركاب الحافلات',
                    filterSummary: filterParts.length > 0 ? filterParts.join(' • ') : undefined,
                    filename: 'كشف_اركاب_الباصات_قافلة_القائم',
                    signatureRightLabel: 'مشرف النقل والتفويج',
                    generatedBy: currentAdminUser?.fullName || currentAdminUser?.username || 'إدارة قافلة القائم',
                    summaryCards: [
                      { label: 'الحجاج بالكشف الحالي', value: `${busFilteredPilgrims.length} حاج` },
                      { label: 'إجمالي حجاج الحافلات', value: `${busPilgrimsList.length} حاج` },
                      { label: 'تم إركابهم', value: `${assignedBusPilgrimsCount} حاج` },
                      { label: 'بانتظار الباص', value: `${unassignedBusPilgrimsCount} حاج` },
                    ],
                  }}
                  renderCustomCell={(pilgrim, colKey) => {
                    const currentBus = (pilgrim.busNumber || '').trim();
                    const currentSeat = (pilgrim.busSeat || '').trim();
                    const currentBusCount = currentBus ? getBusPassengersCount(currentBus) : 0;

                    if (colKey === 'busNumber') {
                      return currentBus ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 whitespace-nowrap">
                          <Bus className="w-3.5 h-3.5" />
                          <span>{currentBus}</span>
                          <span className="text-[10px] opacity-80">({currentBusCount}/{MAX_BUS_CAPACITY})</span>
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-400">
                          غير مخصص
                        </span>
                      );
                    }
                    if (colKey === 'busSeat') {
                      return currentSeat ? (
                        <span className="px-3 py-1 rounded-xl text-xs font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-mono whitespace-nowrap">
                          مقعد {currentSeat}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-400">
                          غير محدد
                        </span>
                      );
                    }
                    return undefined;
                  }}
                  actionsHeader="إجراءات (تخصيص الباص والمقعد)"
                  renderActions={(pilgrim) => {
                    const currentBus = (pilgrim.busNumber || '').trim();
                    const currentSeat = (pilgrim.busSeat || '').trim();
                    return (
                      <div className="flex items-center justify-center gap-2 flex-wrap sm:flex-nowrap">
                        <select
                          value={currentBus}
                          onChange={(e) => handleAssignBusAndSeat(pilgrim, e.target.value, currentSeat)}
                          className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
                          title="اختيار رقم الباص للحاج (حد أقصى 49 راكب)"
                        >
                          <option value="">-- اختر الباص --</option>
                          {BUS_OPTIONS.map((busOpt) => {
                            const countExcl = getBusPassengersCount(busOpt, pilgrim.id);
                            const isBusFull = countExcl >= MAX_BUS_CAPACITY;
                            return (
                              <option key={busOpt} value={busOpt}>
                                {busOpt} ({countExcl}/{MAX_BUS_CAPACITY}){isBusFull ? ' [ممتلئة - 49 راكب]' : ''}
                              </option>
                            );
                          })}
                        </select>

                        <select
                          value={currentSeat}
                          onChange={(e) => handleAssignBusAndSeat(pilgrim, currentBus, e.target.value)}
                          className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 font-mono"
                          title="اختيار رقم المقعد (من 1 إلى 49)"
                        >
                          <option value="">-- المقعد (1-49) --</option>
                          {Array.from({ length: MAX_BUS_CAPACITY }, (_, i) => String(i + 1)).map((seatNum) => {
                            const takenBy = currentBus
                              ? busPilgrimsList.find(
                                  (p) =>
                                    p.id !== pilgrim.id &&
                                    (p.busNumber || '').trim() === currentBus &&
                                    (p.busSeat || '').trim() === seatNum
                                )
                              : undefined;
                            return (
                              <option key={seatNum} value={seatNum}>
                                مقعد {seatNum}{takenBy ? ` (محجوز: ${takenBy.firstName} ${takenBy.lastName})` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    );
                  }}
                  emptyStateContent={
                    <div className="flex flex-col items-center gap-2">
                      <Bus className="w-8 h-8 text-slate-500/40" />
                      <span>لا يوجد حجاج مسجلون في رحلات الحافلات حالياً</span>
                      {airPilgrimsList.length > 0 && (
                        <span className="text-xs text-sky-500 font-bold not-italic">
                          ملاحظة: يوجد ({airPilgrimsList.length}) من الحجاج مسجلين في باقة الطيران وقد تم عزلهم تلقائياً في قسم (رحلات الطيران) لمنع التداخل.
                        </span>
                      )}
                    </div>
                  }
                />
              );
            })()}

            {/* Admin Group GPS Location Picker for Bus Groups */}
            <GroupLocationsManager
              campaignSettings={campaignSettings}
              pilgrims={pilgrims}
              busOptions={BUS_OPTIONS}
              adminName={currentAdminUser?.fullName}
              onSaveGroupLocations={async (nextLocations) => {
                const ok = await onUpdateCampaignSettings({
                  ...campaignSettings,
                  groupLocations: nextLocations,
                });
                return ok !== false;
              }}
            />
          </div>
        );
      })()}

      {/* TAB 1.85: FLIGHTS LIST (رحلات الطيران) */}
      {activeTab === 'flightsList' && currentAdminUser?.permissions.managePilgrims && (() => {
        const assignedFlightsCount = airPilgrimsList.filter(
          (p) => Boolean(p.flightNumberOutbound?.trim()) || Boolean(p.flightNumberReturn?.trim())
        ).length;
        const unassignedFlightsCount = Math.max(0, airPilgrimsList.length - assignedFlightsCount);

        const flightsFilteredPilgrims = airPilgrimsList.filter((p) => {
          const fullName = `${p.firstName} ${p.secondName} ${p.thirdName} ${p.lastName}`;
          const englishName = (p.englishFullName || '').trim().toLowerCase();
          const outbound = (p.flightNumberOutbound || '').trim().toLowerCase();
          const retFlight = (p.flightNumberReturn || '').trim().toLowerCase();
          const ticket = (p.flightTicketNumber || '').trim().toLowerCase();
          const mobile = (p.mobile || '').trim();
          const nationalId = (p.nationalId || '').trim();
          const query = searchQuery.trim().toLowerCase();

          const matchesSearch =
            !query ||
            fullName.toLowerCase().includes(query) ||
            englishName.includes(query) ||
            outbound.includes(query) ||
            retFlight.includes(query) ||
            ticket.includes(query) ||
            mobile.includes(query) ||
            nationalId.includes(query);

          if (!matchesSearch) return false;

          if (flightFilter === 'assigned') return Boolean(outbound || retFlight);
          if (flightFilter === 'unassigned') return !outbound && !retFlight;
          return true;
        });

        const handleExportFlightsCSV = () => {
          const dynFlt = extractDynamicReportColumns(flightsFilteredPilgrims, 'transport_flight');
          const headers = [
            'م',
            'الاسم الرباعي (عربي)',
            'الاسم الكامل بالإنجليزية (Passport / ID)',
            'رقم الهوية الوطنية',
            'تاريخ الميلاد',
            'تاريخ انتهاء الهوية',
            'الجنس',
            'الجنسية',
            'رقم الجوال',
            'الباقة المختارة',
            'رحلة الذهاب / الوصول (Outbound)',
            'رحلة العودة / المغادرة (Return)',
            'رقم التذكرة / الحجز (PNR)',
            ...dynFlt.columns.map((c) => c.label),
          ];
          const rows = flightsFilteredPilgrims.map((p, idx) => [
            idx + 1,
            `${p.firstName} ${p.secondName} ${p.thirdName} ${p.lastName}`.replace(/\s+/g, ' ').trim(),
            p.englishFullName || '',
            p.nationalId || '',
            p.birthDate || '',
            p.idExpiryDate || '',
            p.gender || '',
            p.nationality || '',
            p.mobile || '',
            p.selectedPackage || 'التسجيل العام',
            p.flightNumberOutbound || 'غير محدد',
            p.flightNumberReturn || 'غير محدد',
            p.flightTicketNumber || 'غير محدد',
            ...dynFlt.getRowValues(p),
          ]);
          const dateStr = new Date().toISOString().split('T')[0];
          void exportAlQaemExcelReport({
            reportTitle: 'كشف رحلات الطيران والتذاكر والوصول والمغادرة (حجاج الجو)',
            subtitle: 'بيان رسمي برحلات الذهاب والعودة وأرقام التذاكر والحجوزات (PNR) لحجاج الطيران',
            category: 'تقارير الطيران والتذاكر والوصول والمغادرة',
            filename: `كشف_رحلات_الطيران_قافلة_القائم_${dateStr}`,
            columns: headers,
            rows,
            generatedBy: currentAdminUser?.fullName || 'الإدارة العامة',
            summaryCards: [
              { label: 'إجمالي حجاج الطيران', value: `${airPilgrimsList.length} حاج` },
              { label: 'مكتمل تحديد الرحلة', value: `${assignedFlightsCount} حاج` },
              { label: 'بانتظار تحديد الرحلة', value: `${unassignedFlightsCount} حاج` },
              {
                label: 'تذاكر PNR الصادرة',
                value: `${airPilgrimsList.filter((p) => Boolean(p.flightTicketNumber?.trim())).length} تذكرة`,
              },
            ],
          });
        };

        return (
          <div className="space-y-6 animate-fadeIn">
            {/* Flight Management Header & Unified Segmented Stats (Matches Housing Manifest Style) */}
            <div className="bg-gradient-to-r from-blue-500/10 via-emerald-500/10 to-amber-500/10 border border-blue-500/30 rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-500 shrink-0 shadow-sm">
                  <Plane className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                    <span>رحلات الطيران وتذاكر السفر (حجاج الجو فقط)</span>
                    <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-sky-600 text-white">
                      موسم 1448هـ
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed max-w-2xl">
                    يعرض هذا الكشف <strong>حجاج رحلات الطيران فقط</strong> مع عزل تام عن كشف الحافلات. لتحويل حاج من حافلة إلى طيران، يتم تعديل طلبه من <strong>سجل الحجاج</strong> أولاً.
                  </p>
                </div>
              </div>

              <div className="w-full lg:w-auto flex items-center justify-end">
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex items-center justify-around sm:justify-start gap-3 sm:gap-4 shadow-sm w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setFlightFilter('flight_pilgrims')}
                    className="text-right transition cursor-pointer"
                  >
                    <span className="text-[11px] text-slate-400 block font-bold">حجاج الطيران</span>
                    <strong className="text-sm font-black text-slate-900 dark:text-white">{airPilgrimsList.length} حاج</strong>
                  </button>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <button
                    type="button"
                    onClick={() => setFlightFilter('assigned')}
                    className="text-right transition cursor-pointer"
                  >
                    <span className="text-[11px] text-emerald-500 block font-bold">تم تحديد الرحلة</span>
                    <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400">{assignedFlightsCount}</strong>
                  </button>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <button
                    type="button"
                    onClick={() => setFlightFilter('unassigned')}
                    className="text-right transition cursor-pointer"
                  >
                    <span className="text-[11px] text-amber-500 block font-bold">بانتظار الرحلة</span>
                    <strong className="text-sm font-black text-amber-600 dark:text-amber-400">{unassignedFlightsCount}</strong>
                  </button>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <div className="text-right">
                    <span className="text-[11px] text-purple-500 block font-bold">تذاكر PNR</span>
                    <strong className="text-sm font-black text-purple-600 dark:text-purple-400">
                      {airPilgrimsList.filter(p => Boolean(p.flightTicketNumber?.trim())).length}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Search, Filter & Export Controls */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="ابحث بالاسم العربي أو الإنجليزي، رقم الهوية، رقم الرحلة، أو رقم الحجز PNR..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 whitespace-nowrap">تصفية الرحلات:</span>
                  <select
                    value={flightFilter}
                    onChange={(e) => setFlightFilter(e.target.value as any)}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="flight_pilgrims">جميع حجاج الطيران ({airPilgrimsList.length})</option>
                    <option value="assigned">مكتمل تحديد الرحلة ({assignedFlightsCount})</option>
                    <option value="unassigned">بانتظار رقم الرحلة ({unassignedFlightsCount})</option>
                  </select>
                </div>
              </div>
            </div>

            {(() => {
              const filterParts: string[] = [];
              if (flightFilter === 'assigned') filterParts.push('مكتمل تحديد الرحلة');
              if (flightFilter === 'unassigned') filterParts.push('بانتظار رقم الرحلة');
              if (searchQuery.trim()) filterParts.push(`بحث: "${searchQuery.trim()}"`);

              return (
                <DynamicPilgrimRosterSection
                  rosterType="flightsList"
                  pilgrims={flightsFilteredPilgrims}
                  columnContext={sharedRosterColumnContext}
                  accentColorClass="text-sky-500 bg-sky-500/5"
                  onOpenOfficialPrintModal={(payload) => setOfficialReportModal(payload)}
                  reportMeta={{
                    title: 'كشف رحلات الطيران والتذاكر والوصول والمغادرة',
                    subtitle: 'بيان رسمي برحلات الذهاب والعودة وأرقام التذاكر والحجوزات (PNR) لحجاج الجو',
                    category: 'تقارير الطيران والتذاكر والوصول والمغادرة',
                    filterSummary: filterParts.length > 0 ? filterParts.join(' • ') : undefined,
                    filename: 'كشف_رحلات_الطيران_قافلة_القائم',
                    signatureRightLabel: 'مشرف التفويج والطيران',
                    generatedBy: currentAdminUser?.fullName || currentAdminUser?.username || 'إدارة قافلة القائم',
                    summaryCards: [
                      { label: 'الحجاج بالكشف الحالي', value: `${flightsFilteredPilgrims.length} حاج` },
                      { label: 'إجمالي حجاج الطيران', value: `${airPilgrimsList.length} حاج` },
                      { label: 'مكتمل تحديد الرحلة', value: `${assignedFlightsCount} حاج` },
                      { label: 'بانتظار الرحلة', value: `${unassignedFlightsCount} حاج` },
                    ],
                  }}
                  renderCustomCell={(pilgrim, colKey) => {
                    if (colKey === 'flightOutbound') {
                      return (
                        <InlineQuickTextCell
                          value={pilgrim.flightNumberOutbound || ''}
                          placeholder="مثال: SV1120 - الدمام ← جدة"
                          accentClass="border-sky-300 dark:border-sky-700/60 focus:border-sky-500"
                          onSave={(val) =>
                            onUpdatePilgrim({
                              ...pilgrim,
                              flightNumberOutbound: val,
                              transport: 'طائرة',
                              busNumber: '',
                              busSeat: '',
                            })
                          }
                        />
                      );
                    }
                    if (colKey === 'flightReturn') {
                      return (
                        <InlineQuickTextCell
                          value={pilgrim.flightNumberReturn || ''}
                          placeholder="مثال: SV1125 - جدة ← الدمام"
                          accentClass="border-indigo-300 dark:border-indigo-700/60 focus:border-indigo-500"
                          onSave={(val) =>
                            onUpdatePilgrim({
                              ...pilgrim,
                              flightNumberReturn: val,
                              transport: 'طائرة',
                              busNumber: '',
                              busSeat: '',
                            })
                          }
                        />
                      );
                    }
                    if (colKey === 'flightTicketPnr') {
                      return (
                        <InlineQuickTextCell
                          value={pilgrim.flightTicketNumber || ''}
                          placeholder="PNR / رقم التذكرة"
                          dir="ltr"
                          accentClass="border-amber-300 dark:border-amber-700/60 focus:border-amber-500 font-mono"
                          onSave={(val) =>
                            onUpdatePilgrim({
                              ...pilgrim,
                              flightTicketNumber: val,
                              transport: 'طائرة',
                              busNumber: '',
                              busSeat: '',
                            })
                          }
                        />
                      );
                    }
                    return undefined;
                  }}
                  actionsHeader="إجراء"
                  renderActions={(pilgrim) => (
                    <button
                      type="button"
                      onClick={() => {
                        setEditModalBusError(null);
                        setEditingPilgrim(pilgrim);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500 text-sky-600 dark:text-sky-400 hover:text-white font-bold text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                  )}
                  emptyStateContent={
                    <div className="flex flex-col items-center gap-2">
                      <Plane className="w-8 h-8 text-slate-500/50" />
                      <p className="font-bold text-sm">لا توجد سجلات مطابقة في كشف رحلات الطيران حالياً</p>
                      <p className="text-xs text-slate-500">
                        لإضافة حاج إلى رحلات الطيران، قم بتعديل وسيلة المواصلات أو الباقة من <strong>سجل الحجاج</strong>.
                      </p>
                    </div>
                  }
                />
              );
            })()}
          </div>
        );
      })()}

      {/* TAB 1.9: HOUSING LIST (كشف السكن) */}
      {activeTab === 'housingList' && currentAdminUser?.permissions.managePilgrims && (() => {
        const housingFilteredPilgrims = activePilgrims.filter((p) => {
          const fullName = `${p.firstName} ${p.secondName} ${p.thirdName} ${p.lastName}`;
          const makkahRoom = (p.roomNumberMakkah || p.roomNumber || '').trim();
          const madinahRoom = (p.roomNumberMadinah || '').trim();
          const minaRoom = (p.roomNumberMina || '').trim();
          const mobile = (p.mobile || '').trim();
          const nationalId = (p.nationalId || '').trim();
          const query = searchQuery.trim().toLowerCase();

          const matchesSearch =
            !query ||
            fullName.toLowerCase().includes(query) ||
            mobile.includes(query) ||
            nationalId.includes(query) ||
            makkahRoom.toLowerCase().includes(query) ||
            madinahRoom.toLowerCase().includes(query) ||
            minaRoom.toLowerCase().includes(query);

          const matchesFilter =
            housingFilter === 'all'
              ? true
              : housingFilter === 'both_assigned'
              ? Boolean(makkahRoom && madinahRoom && minaRoom)
              : housingFilter === 'makkah_unassigned'
              ? !makkahRoom
              : housingFilter === 'madinah_unassigned'
              ? !madinahRoom
              : housingFilter === 'mina_unassigned'
              ? !minaRoom
              : housingFilter === 'madinah_private_requested'
              ? Boolean(p.madinahPrivateRoomRequested)
              : housingFilter === 'unassigned'
              ? (!makkahRoom && !madinahRoom && !minaRoom)
              : true;

          return matchesSearch && matchesFilter;
        });

        const totalActive = activePilgrims.length;
        const makkahAssignedCount = activePilgrims.filter(p => Boolean((p.roomNumberMakkah || p.roomNumber)?.trim())).length;
        const madinahAssignedCount = activePilgrims.filter(p => Boolean((p.roomNumberMadinah || '')?.trim())).length;
        const minaAssignedCount = activePilgrims.filter(p => Boolean((p.roomNumberMina || '')?.trim())).length;
        const bothAssignedCount = activePilgrims.filter(p => Boolean((p.roomNumberMakkah || p.roomNumber)?.trim()) && Boolean((p.roomNumberMadinah || '')?.trim()) && Boolean((p.roomNumberMina || '')?.trim())).length;
        const unassignedHousingCount = activePilgrims.filter(p => !Boolean((p.roomNumberMakkah || p.roomNumber)?.trim()) && !Boolean((p.roomNumberMadinah || '')?.trim()) && !Boolean((p.roomNumberMina || '')?.trim())).length;
        const madinahPrivateRequestedCount = activePilgrims.filter(p => Boolean(p.madinahPrivateRoomRequested)).length;

        const handleExportHousingCSV = () => {
          const dynHsg = extractDynamicReportColumns(housingFilteredPilgrims, 'housing');
          const headers = ['#', 'اسم الحاج', 'رقم الجوال', 'طلب غرفة خاصة بالمدينة', 'رقم غرفة السكن بالمدينة المنورة', 'رقم غرفة سكن مكة المكرمة', 'تسكين منى (المخيم / المقعد)', 'رقم الهوية الوطنية', 'الباقة المختارة', ...dynHsg.columns.map((c) => c.label)];
          const rows = housingFilteredPilgrims.map((p, idx) => [
            idx + 1,
            `${p.firstName} ${p.secondName} ${p.thirdName} ${p.lastName}`.replace(/\s+/g, ' ').trim(),
            p.mobile || '',
            p.madinahPrivateRoomRequested
              ? (p.madinahPrivateRoomNote ? `نعم — ${p.madinahPrivateRoomNote}` : 'نعم (طلب غرفة خاصة)')
              : 'لا',
            p.roomNumberMadinah || 'غير محدد',
            p.roomNumberMakkah || p.roomNumber || 'غير محدد',
            p.roomNumberMina || 'غير محدد',
            p.nationalId || '',
            p.selectedPackage || 'التسجيل العام',
            ...dynHsg.getRowValues(p),
          ]);
          void exportAlQaemExcelReport({
            reportTitle: 'كشف السكن والوصول والمغادرة (المدينة المنورة • مكة المكرمة • مشعر منى)',
            subtitle: 'بيان تسكين الغرف والفنادق والمخيمات المعتمد لحجاج القافلة',
            category: 'تقارير السكن والوصول والمغادرة',
            filename: `كشف_سكن_الحجاج_المدينة_ومكة_ومنى_${new Date().toISOString().split('T')[0]}`,
            columns: headers,
            rows,
            generatedBy: currentAdminUser?.fullName || 'الإدارة العامة',
            summaryCards: [
              { label: 'إجمالي الحجاج', value: `${totalActive} حاج` },
              { label: 'طلب غرفة خاصة بالمدينة', value: `${madinahPrivateRequestedCount} طلب` },
              { label: 'سكن المدينة المنورة', value: `${madinahAssignedCount} مسكّن` },
              { label: 'سكن مكة المكرمة', value: `${makkahAssignedCount} مسكّن` },
            ],
          });
        };

        return (
          <div className="space-y-6 animate-fadeIn">
            {/* Header & Stats Banner */}
            <div className="bg-gradient-to-r from-blue-500/10 via-emerald-500/10 to-amber-500/10 border border-blue-500/30 rounded-3xl p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-500 shrink-0 shadow-sm">
                  <Hotel className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                    <span>كشف السكن وتوزيع الغرف (المدينة المنورة، مكة المكرمة، وتسكين منى)</span>
                    <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-blue-600 text-white">
                      موسم 1448هـ
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed max-w-2xl">
                    كشف رسمي لتوزيع وتسكين الحجاج في فنادق المدينة المنورة، مكة المكرمة، ومخيمات مشعر منى يشتمل على: <strong>اسم الحاج، رقم جواله، سكن المدينة المنورة، سكن مكة المكرمة، وتسكين منى</strong>، مع إمكانية التعديل السريع المباشر وحفظ التعديلات بضغطة زر.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex items-center gap-3 shadow-sm">
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block font-bold">إجمالي الحجاج</span>
                    <strong className="text-sm font-black text-slate-900 dark:text-white">{totalActive} حاج</strong>
                  </div>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <div className="text-right">
                    <span className="text-[11px] text-emerald-500 block font-bold">سكن المدينة</span>
                    <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400">{madinahAssignedCount}</strong>
                  </div>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <div className="text-right">
                    <span className="text-[11px] text-amber-500 block font-bold">سكن مكة</span>
                    <strong className="text-sm font-black text-amber-600 dark:text-amber-400">{makkahAssignedCount}</strong>
                  </div>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <div className="text-right">
                    <span className="text-[11px] text-purple-500 block font-bold">تسكين منى</span>
                    <strong className="text-sm font-black text-purple-600 dark:text-purple-400">{minaAssignedCount}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter & Export Controls */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="بحث باسم الحاج، رقم الجوال، رقم الغرفة، أو مخيم منى..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 whitespace-nowrap">تصفية التسكين:</span>
                  <select
                    value={housingFilter}
                    onChange={(e) => setHousingFilter(e.target.value as any)}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-bold"
                  >
                    <option value="all">جميع الحجاج ({totalActive})</option>
                    <option value="madinah_private_requested">طالبو غرفة خاصة بالمدينة ({madinahPrivateRequestedCount})</option>
                    <option value="both_assigned">مكتمل التسكين (المدينة ومكة ومنى) ({bothAssignedCount})</option>
                    <option value="madinah_unassigned">بانتظار سكن المدينة المنورة ({totalActive - madinahAssignedCount})</option>
                    <option value="makkah_unassigned">بانتظار سكن مكة المكرمة ({totalActive - makkahAssignedCount})</option>
                    <option value="mina_unassigned">بانتظار تسكين منى ({totalActive - minaAssignedCount})</option>
                    <option value="unassigned">غير مسكن بالكامل ({unassignedHousingCount})</option>
                  </select>
                </div>
              </div>
            </div>

            {(() => {
              const housingLabels: Record<string, string> = {
                madinah_private_requested: 'طالبو غرفة خاصة بالمدينة المنورة',
                both_assigned: 'مكتمل التسكين (المدينة ومكة ومنى)',
                madinah_unassigned: 'بانتظار سكن المدينة المنورة',
                makkah_unassigned: 'بانتظار سكن مكة المكرمة',
                mina_unassigned: 'بانتظار تسكين منى',
                unassigned: 'غير مسكن بالكامل',
              };
              const filterParts: string[] = [];
              if (housingFilter !== 'all') filterParts.push(housingLabels[housingFilter] || housingFilter);
              if (searchQuery.trim()) filterParts.push(`بحث: "${searchQuery.trim()}"`);

              return (
                <DynamicPilgrimRosterSection
                  rosterType="housingList"
                  pilgrims={housingFilteredPilgrims}
                  columnContext={sharedRosterColumnContext}
                  accentColorClass="text-blue-500 bg-blue-500/5"
                  onOpenOfficialPrintModal={(payload) => setOfficialReportModal(payload)}
                  reportMeta={{
                    title: 'كشف السكن وتوزيع الغرف والمخيمات',
                    subtitle: 'بيان تسكين فنادق المدينة المنورة ومكة المكرمة ومخيمات مشعر منى',
                    category: 'تقارير السكن والوصول والمغادرة',
                    filterSummary: filterParts.length > 0 ? filterParts.join(' • ') : undefined,
                    filename: 'كشف_سكن_الحجاج_المدينة_ومكة_ومنى',
                    signatureRightLabel: 'مشرف الإسكان والمخيمات',
                    generatedBy: currentAdminUser?.fullName || currentAdminUser?.username || 'إدارة قافلة القائم',
                    summaryCards: [
                      { label: 'الحجاج بالكشف الحالي', value: `${housingFilteredPilgrims.length} حاج` },
                      { label: 'طلب غرفة خاصة بالمدينة', value: `${madinahPrivateRequestedCount} طلب` },
                      { label: 'سكن المدينة المنورة', value: `${madinahAssignedCount} مسكّن` },
                      { label: 'سكن مكة المكرمة', value: `${makkahAssignedCount} مسكّن` },
                    ],
                  }}
                  renderCustomCell={(pilgrim, colKey) => {
                    if (colKey === 'madinahRoom') {
                      return (
                        <InlineQuickTextCell
                          value={pilgrim.roomNumberMadinah || ''}
                          placeholder="مثال: غرفة 102 - أنوار المدينة"
                          accentClass={
                            pilgrim.madinahPrivateRoomRequested
                              ? 'border-amber-400 dark:border-amber-500 focus:border-amber-500'
                              : 'border-emerald-300 dark:border-emerald-700/60 focus:border-emerald-500'
                          }
                          onSave={(val) =>
                            onUpdatePilgrim({
                              ...pilgrim,
                              roomNumberMadinah: val,
                            })
                          }
                        />
                      );
                    }
                    if (colKey === 'makkahRoom') {
                      return (
                        <InlineQuickTextCell
                          value={pilgrim.roomNumberMakkah || pilgrim.roomNumber || ''}
                          placeholder="مثال: غرفة 304 - برج مكة"
                          accentClass="border-amber-300 dark:border-amber-700/60 focus:border-amber-500"
                          onSave={(val) =>
                            onUpdatePilgrim({
                              ...pilgrim,
                              roomNumberMakkah: val,
                              roomNumber: val || pilgrim.roomNumber,
                            })
                          }
                        />
                      );
                    }
                    if (colKey === 'minaCampRoom') {
                      return (
                        <InlineQuickTextCell
                          value={pilgrim.roomNumberMina || ''}
                          placeholder="مثال: خيمة 12 / مربع 4"
                          accentClass="border-purple-300 dark:border-purple-700/60 focus:border-purple-500"
                          onSave={(val) =>
                            onUpdatePilgrim({
                              ...pilgrim,
                              roomNumberMina: val,
                            })
                          }
                        />
                      );
                    }
                    if (colKey === 'madinahPrivateRoom') {
                      return pilgrim.madinahPrivateRoomRequested ? (
                        <span
                          className="inline-block px-2.5 py-1 rounded-lg text-[11px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                          title={pilgrim.madinahPrivateRoomNote || 'طلب غرفة خاصة بالمدينة المنورة'}
                        >
                          نعم{pilgrim.madinahPrivateRoomNote ? ` (${pilgrim.madinahPrivateRoomNote})` : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">لا</span>
                      );
                    }
                    return undefined;
                  }}
                  actionsHeader="تعديل الملف"
                  renderActions={(pilgrim) => (
                    <button
                      type="button"
                      onClick={() => setEditingPilgrim(pilgrim)}
                      className="px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500 text-blue-600 dark:text-blue-400 hover:text-white font-bold text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                  )}
                  emptyStateContent="لا توجد سجلات مطابقة في كشف السكن حالياً"
                />
              );
            })()}
          </div>
        );
      })()}

      {/* TAB 1.95: HEALTH CONDITIONS ROSTER (كشف الحالات الصحية) */}
      {activeTab === 'healthList' && currentAdminUser?.permissions.managePilgrims && (() => {
        const getCleanDiseases = (p: Pilgrim): string[] =>
          (p.healthConditions || []).filter((c) => c && c.trim() !== '' && c !== 'لا شيء مما ذكر');

        const needsMobilityCare = (p: Pilgrim): boolean =>
          Boolean(p.needsAssistance) ||
          Boolean(p.hasBackPain) ||
          p.mobilityIndependence === 'لا' ||
          getCleanDiseases(p).includes('صعوبة في الحركة');

        const hasChronicDisease = (p: Pilgrim): boolean => {
          const diseases = getCleanDiseases(p);
          const hasOther = Boolean(p.otherHealthCondition && p.otherHealthCondition.trim() !== '');
          return diseases.some((d) => d !== 'صعوبة في الحركة') || hasOther;
        };

        const healthFilteredPilgrims = activePilgrims.filter((p) => {
          const fullName = `${p.firstName} ${p.secondName} ${p.thirdName} ${p.lastName}`;
          const diseasesStr = getCleanDiseases(p).join(' ');
          const otherStr = (p.otherHealthCondition || '').trim();
          const mobile = (p.mobile || '').trim();
          const nationalId = (p.nationalId || '').trim();
          const busStr = (p.busNumber || '').trim();
          const roomStr = `${p.roomNumberMakkah || p.roomNumber || ''} ${p.roomNumberMadinah || ''}`;
          const query = searchQuery.trim().toLowerCase();

          const matchesSearch =
            !query ||
            fullName.toLowerCase().includes(query) ||
            mobile.includes(query) ||
            nationalId.includes(query) ||
            diseasesStr.toLowerCase().includes(query) ||
            otherStr.toLowerCase().includes(query) ||
            busStr.toLowerCase().includes(query) ||
            roomStr.toLowerCase().includes(query);

          const hasCondition = hasPilgrimHealthCondition(p);

          const matchesFilter =
            healthFilter === 'all'
              ? true
              : healthFilter === 'with_conditions'
              ? hasCondition
              : healthFilter === 'mobility_aid'
              ? needsMobilityCare(p)
              : healthFilter === 'chronic_disease'
              ? hasChronicDisease(p)
              : healthFilter === 'speech_difficulty'
              ? Boolean(p.hasSpeechDifficulty)
              : healthFilter === 'healthy'
              ? !hasCondition
              : true;

          const payDecl = getPilgrimPaymentDeclaration(p);
          const vacDecl = getPilgrimVaccinationDeclaration(p);

          const matchesHealthPayment =
            healthPaymentFilter === 'all'
              ? true
              : healthPaymentFilter === 'paid'
              ? payDecl.isPaidOrReported
              : !payDecl.isPaidOrReported;

          const matchesHealthVaccination =
            healthVaccinationFilter === 'all'
              ? true
              : healthVaccinationFilter === 'vaccinated'
              ? vacDecl.completed
              : !vacDecl.completed;

          return matchesSearch && matchesFilter && matchesHealthPayment && matchesHealthVaccination;
        });

        const totalActive = activePilgrims.length;
        const withConditionsCount = activePilgrims.filter(hasPilgrimHealthCondition).length;
        const mobilityAidCount = activePilgrims.filter(needsMobilityCare).length;
        const chronicDiseaseCount = activePilgrims.filter(hasChronicDisease).length;
        const speechDifficultyCount = activePilgrims.filter((p) => Boolean(p.hasSpeechDifficulty)).length;
        const healthyCount = totalActive - withConditionsCount;
        const healthPaidCount = activePilgrims.filter((p) => getPilgrimPaymentDeclaration(p).isPaidOrReported).length;
        const healthUnpaidCount = totalActive - healthPaidCount;
        const healthVaccinatedCount = activePilgrims.filter((p) => getPilgrimVaccinationDeclaration(p).completed).length;
        const healthUnvaccinatedCount = totalActive - healthVaccinatedCount;

        const handleExportHealthCSV = () => {
          const dynHlth = extractDynamicReportColumns(healthFilteredPilgrims, 'health');
          const headers = [
            '#',
            'اسم الحاج',
            'الجنس',
            'رقم الجوال',
            'رقم الهوية',
            'الأمراض المزمنة المسجلة',
            'أمراض وملاحظات صحية أخرى',
            'يحتاج كرسي متحرك / وسيلة مساعدة',
            'آلام بالظهر أو صعوبة بالحركة',
            'القدرة على الحركة دون مساعدة',
            'صعوبة في نطق بعض الحروف',
            'يوجد حمل (للنساء)',
            'رقم الباص والمقعد',
            'غرفة مكة المكرمة',
            'غرفة المدينة المنورة',
            ...dynHlth.columns.map((c) => c.label),
          ];
          const rows = healthFilteredPilgrims.map((p, idx) => {
            const cleanDiseases = getCleanDiseases(p);
            return [
              idx + 1,
              `${p.firstName} ${p.secondName} ${p.thirdName} ${p.lastName}`.replace(/\s+/g, ' ').trim(),
              p.gender || '',
              p.mobile || '',
              p.nationalId || '',
              cleanDiseases.length > 0 ? cleanDiseases.join(' - ') : 'سليم ولله الحمد',
              p.otherHealthCondition || 'لا يوجد',
              p.needsAssistance ? 'نعم (يحتاج كرسي متحرك/مساعدة)' : 'لا',
              p.hasBackPain ? 'نعم' : 'لا',
              p.mobilityIndependence || 'نعم',
              p.hasSpeechDifficulty ? 'نعم' : 'لا',
              p.gender === 'أنثى' ? (p.isPregnant ? 'نعم' : 'لا') : 'غير منطبق',
              p.busNumber ? `${p.busNumber}${p.busSeat ? ` (مقعد ${p.busSeat})` : ''}` : 'غير محدد',
              p.roomNumberMakkah || p.roomNumber || 'غير محدد',
              p.roomNumberMadinah || 'غير محدد',
              ...dynHlth.getRowValues(p),
            ];
          });
          void exportAlQaemExcelReport({
            reportTitle: 'كشف الحالات الصحية والرعاية الطبية للحجاج',
            subtitle: 'بيان اللجنة الطبية والإدارية للأمراض المزمنة والاحتياجات الحركية والغرف',
            category: 'تقارير الرعاية الطبية والحالات الصحية',
            filename: `كشف_الحالات_الصحية_للحجاج_${new Date().toISOString().split('T')[0]}`,
            columns: headers,
            rows,
            generatedBy: currentAdminUser?.fullName || 'اللجنة الطبية والإدارية',
            summaryCards: [
              { label: 'إجمالي الحجاج', value: `${totalActive} حاج` },
              { label: 'أصحاب حالات صحية', value: `${withConditionsCount} حالة` },
              { label: 'يحتاجون كرسي / مساعدة', value: `${mobilityAidCount} حاج` },
              { label: 'أمراض مزمنة', value: `${chronicDiseaseCount} حالة` },
            ],
          });
        };

        return (
          <div className="space-y-6 animate-fadeIn">
            {/* Header & Unified Segmented Medical Stats Banner (Matches Housing Manifest Style) */}
            <div className="bg-gradient-to-r from-blue-500/10 via-emerald-500/10 to-amber-500/10 border border-blue-500/30 rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-500 shrink-0 shadow-sm">
                  <HeartPulse className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                    <span>كشف الحالات الصحية والرعاية الطبية للحجاج</span>
                    <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-rose-600 text-white">
                      اللجنة الطبية والإدارية
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed max-w-2xl">
                    بيان تفصيلي بالحالة الصحية للحجاج المسجلين، يشمل <strong>الأمراض المزمنة (الضغط، السكري، القلب، الدم)، الحاجة لكرسي متحرك أو مساعدة حركية، آلام الظهر، وصعوبات النطق</strong>، مرتبطاً بأرقام الغرف والحافلات لسرعة المتابعة الميدانية.
                  </p>
                </div>
              </div>

              <div className="w-full lg:w-auto flex items-center justify-end">
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex items-center justify-around sm:justify-start gap-3 sm:gap-4 shadow-sm w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setHealthFilter('all')}
                    className="text-right transition cursor-pointer"
                  >
                    <span className="text-[11px] text-slate-400 block font-bold">إجمالي الحجاج</span>
                    <strong className="text-sm font-black text-slate-900 dark:text-white">{totalActive} حاج</strong>
                  </button>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <button
                    type="button"
                    onClick={() => setHealthFilter('with_conditions')}
                    className="text-right transition cursor-pointer"
                  >
                    <span className="text-[11px] text-emerald-500 block font-bold">حالات صحية</span>
                    <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400">{withConditionsCount}</strong>
                  </button>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <button
                    type="button"
                    onClick={() => setHealthFilter('mobility_aid')}
                    className="text-right transition cursor-pointer"
                  >
                    <span className="text-[11px] text-amber-500 block font-bold">كرسي / حركة</span>
                    <strong className="text-sm font-black text-amber-600 dark:text-amber-400">{mobilityAidCount}</strong>
                  </button>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <button
                    type="button"
                    onClick={() => setHealthFilter('chronic_disease')}
                    className="text-right transition cursor-pointer"
                  >
                    <span className="text-[11px] text-purple-500 block font-bold">أمراض مزمنة</span>
                    <strong className="text-sm font-black text-purple-600 dark:text-purple-400">{chronicDiseaseCount}</strong>
                  </button>
                </div>
              </div>
            </div>

            {/* Search, Filter & Export Controls */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="بحث باسم الحاج، الجوال، المرض (سكري، ضغط...)، الباص، أو الغرفة..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 whitespace-nowrap">تصنيف الكشف:</span>
                  <select
                    value={healthFilter}
                    onChange={(e) => setHealthFilter(e.target.value as any)}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 font-bold"
                  >
                    <option value="all">جميع الحجاج ({totalActive})</option>
                    <option value="with_conditions">أصحاب الحالات الصحية والاحتياجات فقط ({withConditionsCount})</option>
                    <option value="mobility_aid">يحتاجون كرسي متحرك / مساعدة حركية ({mobilityAidCount})</option>
                    <option value="chronic_disease">أصحاب الأمراض المزمنة ({chronicDiseaseCount})</option>
                    <option value="speech_difficulty">لديهم صعوبة في نطق الحروف ({speechDifficultyCount})</option>
                    <option value="healthy">الأصحاء بدون ملاحظات صحية ({healthyCount})</option>
                  </select>
                </div>
              </div>

              {/* Quick Vaccination & Payment Filters inside Health Section */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                    فلتر التطعيم:
                  </span>
                  <select
                    value={healthVaccinationFilter}
                    onChange={(e) => setHealthVaccinationFilter(e.target.value as any)}
                    className="bg-slate-50 dark:bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="all">جميع الحجاج ({totalActive})</option>
                    <option value="vaccinated">المطعّمون ({healthVaccinatedCount})</option>
                    <option value="unvaccinated">غير المطعّمين ({healthUnvaccinatedCount})</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                    فلتر السداد:
                  </span>
                  <select
                    value={healthPaymentFilter}
                    onChange={(e) => setHealthPaymentFilter(e.target.value as any)}
                    className="bg-slate-50 dark:bg-slate-950 border border-amber-500/40 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="all">جميع حالات السداد ({totalActive})</option>
                    <option value="paid">المسددون ({healthPaidCount})</option>
                    <option value="unpaid">غير المسددين ({healthUnpaidCount})</option>
                  </select>
                </div>

                {(healthVaccinationFilter !== 'all' || healthPaymentFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setHealthVaccinationFilter('all');
                      setHealthPaymentFilter('all');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold transition cursor-pointer"
                  >
                    إعادة ضبط
                  </button>
                )}
              </div>
            </div>

            {(() => {
              const healthLabels: Record<string, string> = {
                with_conditions: 'أصحاب الحالات الصحية والاحتياجات فقط',
                mobility_aid: 'يحتاجون كرسي متحرك / مساعدة حركية',
                chronic_disease: 'أصحاب الأمراض المزمنة',
                speech_difficulty: 'لديهم صعوبة في نطق الحروف',
                healthy: 'الأصحاء بدون ملاحظات صحية',
              };
              const filterParts: string[] = [];
              if (healthFilter !== 'all') filterParts.push(healthLabels[healthFilter] || healthFilter);
              if (healthVaccinationFilter !== 'all') {
                filterParts.push(healthVaccinationFilter === 'vaccinated' ? 'المطعّمون فقط' : 'غير المطعّمين فقط');
              }
              if (healthPaymentFilter !== 'all') {
                filterParts.push(healthPaymentFilter === 'paid' ? 'المسددون فقط' : 'غير المسددين فقط');
              }
              if (searchQuery.trim()) filterParts.push(`بحث: "${searchQuery.trim()}"`);

              return (
                <DynamicPilgrimRosterSection
                  rosterType="healthList"
                  pilgrims={healthFilteredPilgrims}
                  columnContext={sharedRosterColumnContext}
                  accentColorClass="text-rose-500 bg-rose-500/5"
                  onOpenOfficialPrintModal={(payload) => setOfficialReportModal(payload)}
                  reportMeta={{
                    title: 'كشف الحالات الصحية والرعاية الطبية والاحتياجات الخاصة',
                    subtitle: 'بيان اللجنة الطبية للأمراض المزمنة والاحتياجات الحركية والغرف والحافلات',
                    category: 'تقارير الرعاية الطبية والحالات الصحية',
                    filterSummary: filterParts.length > 0 ? filterParts.join(' • ') : undefined,
                    filename: 'كشف_الحالات_الصحية_للحجاج',
                    signatureRightLabel: 'مشرف اللجنة الطبية والرعاية',
                    generatedBy: currentAdminUser?.fullName || currentAdminUser?.username || 'إدارة قافلة القائم',
                    summaryCards: [
                      { label: 'الحجاج بالكشف الحالي', value: `${healthFilteredPilgrims.length} حاج` },
                      { label: 'أصحاب حالات صحية', value: `${withConditionsCount} حالة` },
                      { label: 'كرسي / مساعدة حركية', value: `${mobilityAidCount} حاج` },
                      { label: 'أمراض مزمنة', value: `${chronicDiseaseCount} حالة` },
                    ],
                  }}
                  renderCustomCell={(pilgrim, colKey) => {
                    if (colKey === 'healthConditionType') {
                      const cleanDiseases = getCleanDiseases(pilgrim);
                      return cleanDiseases.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {cleanDiseases.map((d, i) => (
                            <span
                              key={i}
                              className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-bold"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          سليم ولله الحمد
                        </span>
                      );
                    }
                    if (colKey === 'specialNeedsMobility') {
                      const hasAnyCond = hasPilgrimHealthCondition(pilgrim);
                      return (
                        <div className="flex flex-wrap gap-1.5">
                          {(pilgrim.needsAssistance || pilgrim.mobilityIndependence === 'لا') && (
                            <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 text-xs font-black">
                              كرسي متحرك / مساعدة
                            </span>
                          )}
                          {pilgrim.hasBackPain && (
                            <span className="px-2.5 py-1 rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 text-xs font-bold">
                              آلام بالظهر
                            </span>
                          )}
                          {pilgrim.isPregnant && pilgrim.gender === 'أنثى' && (
                            <span className="px-2.5 py-1 rounded-lg bg-pink-500/15 text-pink-600 dark:text-pink-400 border border-pink-500/30 text-xs font-bold">
                              حامل (رعاية خاصة)
                            </span>
                          )}
                          {pilgrim.hasSpeechDifficulty && (
                            <span className="px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-xs font-bold">
                              صعوبة نطق الحروف
                            </span>
                          )}
                          {!hasAnyCond && (
                            <span className="text-xs text-slate-400">قادر على الحركة</span>
                          )}
                        </div>
                      );
                    }
                    if (colKey === 'medicalNotesMeds') {
                      const otherCond = (pilgrim.otherHealthCondition || '').trim();
                      return otherCond ? (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-1 inline-block">
                          {otherCond}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      );
                    }
                    if (colKey === 'vaccinationStatus') {
                      return renderVaccinationStatusCell(pilgrim);
                    }
                    if (colKey === 'vaccinationDate') {
                      return renderVaccinationDateCell(pilgrim);
                    }
                    if (colKey === 'paymentDeclarationStatus') {
                      return renderPaymentDeclarationStatusCell(pilgrim);
                    }
                    if (colKey === 'paymentDeclarationDate') {
                      return renderPaymentDeclarationDateCell(pilgrim);
                    }
                    return undefined;
                  }}
                  renderActions={(pilgrim) => (
                    <button
                      type="button"
                      onClick={() => {
                        setEditModalBusError(null);
                        setEditingPilgrim(pilgrim);
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-500 hover:text-white text-slate-700 dark:text-slate-200 font-bold text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تعديل الحالة</span>
                    </button>
                  )}
                  emptyStateContent="لا توجد حالات صحية مطابقة لمعايير التصفية الحالية"
                />
              );
            })()}
          </div>
        );
      })()}

      {/* TAB 2: ANNOUNCEMENTS, MEETINGS & LESSONS */}
      {activeTab === 'announcements' && currentAdminUser?.permissions.manageAnnouncements && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">إدارة إعلانات اللقاءات والدروس والمقالات</h3>
              <p className="text-xs text-slate-500 mt-1">إضافة، تعديل، أو حذف التعاميم وإعلانات اللقاءات التعريفية والدروس الفقهية</p>
            </div>
            <button
              onClick={() => {
                setAnnForm({
                  title: '',
                  category: 'هام',
                  date: new Date().toISOString().split('T')[0],
                  content: '',
                  fontSize: 'normal',
                  isBold: false,
                  textAlign: 'right',
                  imageUrl: '',
                  videoUrl: '',
                  displaySettings: {
                    showImage: true,
                    showVideo: true,
                    enableLightbox: true,
                    highlightCard: false,
                  },
                });
                setActiveAnnToolTab('none');
                setAnnMediaError('');
                setIsNewAnnouncement(true);
                setEditingAnnouncement(null);
              }}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-3 rounded-xl transition flex items-center gap-2 shadow text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة إعلان أو درس جديد</span>
            </button>
          </div>

          {/* YouTube Channel Latest Video & Live Stream Quick Control */}
          <YouTubeAdminControl
            campaignSettings={campaignSettings}
            onUpdateCampaignSettings={onUpdateCampaignSettings}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {announcements.map((ann) => {
              const showImg = Boolean(ann.imageUrl && ann.displaySettings?.showImage !== false);
              const showVid = Boolean(ann.videoUrl && ann.displaySettings?.showVideo !== false);
              const videoInfo = showVid ? getEmbeddedVideoInfo(ann.videoUrl) : { type: 'none' as const, src: '' };
              const typographyClasses = getAnnouncementTypographyClasses(ann);
              const fontSizeLabel = FONT_SIZE_OPTIONS.find((f) => f.value === (ann.fontSize || 'normal'))?.label || 'عادي';

              return (
                <div
                  key={ann.id}
                  className={`bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-sm flex flex-col justify-between transition ${
                    ann.displaySettings?.highlightCard
                      ? 'border-2 border-amber-500 ring-1 ring-amber-500/30'
                      : 'border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div>
                    {showImg && ann.imageUrl && (
                      <AnnouncementImageView
                        imageUrl={ann.imageUrl}
                        alt={ann.title}
                        containerClassName="relative h-44 w-full bg-slate-950 overflow-hidden"
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="p-6 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            {ann.category}
                          </span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            الخط: {fontSizeLabel}
                          </span>
                          {ann.imageUrl && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                              <ImageIcon className="w-3 h-3" />
                              <span>
                                {ann.displaySettings?.showImage === false
                                  ? 'صورة (مخفية)'
                                  : extractMediaId(ann.imageUrl)
                                  ? `#${extractMediaId(ann.imageUrl)}`
                                  : 'صورة مفعلة'}
                              </span>
                            </span>
                          )}
                          {ann.videoUrl && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center gap-1">
                              <Video className="w-3 h-3" />
                              <span>
                                {ann.displaySettings?.showVideo === false
                                  ? 'فيديو (مخفي)'
                                  : extractMediaId(ann.videoUrl)
                                  ? `#${extractMediaId(ann.videoUrl)}`
                                  : 'فيديو مفعل'}
                              </span>
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">{ann.date}</span>
                      </div>

                      <h4 className={`text-lg font-bold text-slate-900 dark:text-white ${ann.textAlign === 'center' ? 'text-center' : 'text-right'}`}>
                        {ann.title}
                      </h4>
                      <p className={`text-slate-600 dark:text-slate-300 ${typographyClasses}`}>{ann.content}</p>

                      {showVid && videoInfo.type !== 'none' && (
                        <div className="pt-2">
                          <AnnouncementVideoView
                            videoUrl={ann.videoUrl}
                            title={ann.title}
                            videoClassName="w-full max-h-48 object-contain bg-black"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick Display Feature Toggles & Actions */}
                  <div className="px-6 pb-5 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    {(ann.imageUrl || ann.videoUrl) && (
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        {ann.imageUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateAnnouncement({
                                ...ann,
                                displaySettings: {
                                  ...ann.displaySettings,
                                  showImage: ann.displaySettings?.showImage === false ? true : false,
                                },
                              })
                            }
                            className={`px-2.5 py-1 rounded-lg font-bold border transition flex items-center gap-1 ${
                              ann.displaySettings?.showImage !== false
                                ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {ann.displaySettings?.showImage !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            <span>{ann.displaySettings?.showImage !== false ? 'الصورة معروضة' : 'الصورة مخفية'}</span>
                          </button>
                        )}
                        {ann.videoUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateAnnouncement({
                                ...ann,
                                displaySettings: {
                                  ...ann.displaySettings,
                                  showVideo: ann.displaySettings?.showVideo === false ? true : false,
                                },
                              })
                            }
                            className={`px-2.5 py-1 rounded-lg font-bold border transition flex items-center gap-1 ${
                              ann.displaySettings?.showVideo !== false
                                ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {ann.displaySettings?.showVideo !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            <span>{ann.displaySettings?.showVideo !== false ? 'الفيديو معروض' : 'الفيديو مخفي'}</span>
                          </button>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => shareAnnouncementItem(ann)}
                        className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-amber-500/20 hover:text-amber-500 transition text-xs font-bold flex items-center gap-1.5"
                        title="مشاركة رابط الموضوع مباشرة"
                      >
                        <Share2 className="w-4 h-4" /> مشاركة
                      </button>
                      <button
                        onClick={() => {
                          setEditingAnnouncement(ann);
                          setAnnForm({
                            title: ann.title,
                            category: ann.category,
                            date: ann.date,
                            content: ann.content,
                            fontSize: ann.fontSize || 'normal',
                            isBold: Boolean(ann.isBold),
                            textAlign: ann.textAlign || 'right',
                            imageUrl: ann.imageUrl || '',
                            videoUrl: ann.videoUrl || '',
                            displaySettings: {
                              showImage: ann.displaySettings?.showImage !== false,
                              showVideo: ann.displaySettings?.showVideo !== false,
                              enableLightbox: ann.displaySettings?.enableLightbox !== false,
                              highlightCard: Boolean(ann.displaySettings?.highlightCard),
                            },
                          });
                          setActiveAnnToolTab(ann.imageUrl ? 'image' : ann.videoUrl ? 'video' : 'none');
                          setAnnMediaError('');
                          setIsNewAnnouncement(false);
                        }}
                        className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl hover:bg-amber-500/20 transition text-xs font-bold flex items-center gap-1.5"
                      >
                        <Edit3 className="w-4 h-4" /> تعديل
                      </button>
                      <button
                        onClick={() => {
                          setConfirmModal({
                            isOpen: true,
                            title: 'تأكيد حذف الإعلان أو الدرس',
                            message: `هل أنت متأكد من حذف "${ann.title}" نهائياً من قائمة الإعلانات؟`,
                            onConfirm: () => {
                              onDeleteAnnouncement(ann.id);
                              setConfirmModal(prev => ({ ...prev, isOpen: false }));
                            }
                          });
                        }}
                        className="p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition text-xs font-bold flex items-center gap-1.5"
                      >
                        <Trash2 className="w-4 h-4" /> حذف
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Financial Management Sub-Menus are now integrated in the top Navigation System */}

      {/* TAB 3.5: FINANCIAL PAYMENTS STATEMENT (كشف المبالغ المدفوعة) */}
      {activeTab === 'paymentsList' && canAccessFinanceMenu && (() => {
        const statementPilgrims = activePilgrims.filter((p) => {
          const fullName = `${p.firstName} ${p.secondName} ${p.thirdName} ${p.lastName}`;
          const query = searchQuery.trim().toLowerCase();
          const paidVal = getPilgrimPaidAmount(p, packages);
          const matchesSearch =
            !query ||
            fullName.toLowerCase().includes(query) ||
            (p.nationalId || '').includes(query) ||
            (p.mobile || '').includes(query) ||
            String(paidVal).includes(query);

          const isConfirmed = isPilgrimPaymentConfirmed(p);
          const matchesFinanceFilter =
            financeFilter === 'confirmed' ? isConfirmed : true;

          return matchesSearch && matchesFinanceFilter;
        });

        const confirmedInStatement = statementPilgrims.filter((p) =>
          isPilgrimPaymentConfirmed(p)
        );

        const totalConfirmedPaidAmount = confirmedInStatement.reduce(
          (sum, p) => sum + getPilgrimPaidAmount(p, packages),
          0
        );

        const allConfirmedCount = activePilgrims.filter((p) =>
          isPilgrimPaymentConfirmed(p)
        ).length;

        const handleExportPaymentsCSV = () => {
          const dynFin = extractDynamicReportColumns(statementPilgrims, 'finance');
          const headers = ['#', 'اسم الحاج', 'رقم الهوية', 'رقم الجوال', 'الباقة', 'حالة الدفع', 'المبلغ المدفوع (ريال)', 'اسم البنك', 'رقم الآيبان (IBAN)', ...dynFin.columns.map((c) => c.label)];
          const rows: (string | number)[][] = statementPilgrims.map((p, idx) => {
            const isConf = isPilgrimPaymentConfirmed(p);
            const paid = getPilgrimPaidAmount(p, packages);
            return [
              idx + 1,
              `${p.firstName} ${p.secondName} ${p.thirdName} ${p.lastName}`.replace(/\s+/g, ' ').trim(),
              p.nationalId || '',
              p.mobile || '',
              p.selectedPackage || 'التسجيل العام',
              isConf ? `مؤكد الدفع (${p.status})` : `غير مؤكد (${p.status})`,
              `${paid.toLocaleString('en-US')} ريال`,
              p.bankName || '—',
              p.iban || '—',
              ...dynFin.getRowValues(p),
            ];
          });

          // Append grand total row at the end of the Excel statement
          rows.push([
            '',
            'إجمالي المبالغ المدفوعة لكافة الحجاج المؤكد دفعهم في هذا الكشف',
            `عدد المؤكد دفعهم: ${confirmedInStatement.length} حاج`,
            '',
            '',
            'الإجمالي الكلي المؤكد',
            `${totalConfirmedPaidAmount.toLocaleString('en-US')} ريال سعودي`,
            '',
            '',
            ...dynFin.columns.map(() => ''),
          ]);

          void exportAlQaemExcelReport({
            reportTitle: 'الكشف المالي للمبالغ المدفوعة والتحصيلات المعتمدة',
            subtitle: 'تقرير التدقيق المالي لحالات السداد والبنوك والآيبان وإجمالي المبالغ المحصلة من الحجاج',
            category: 'التقارير المالية والتحصيلات',
            filename: `كشف_المبالغ_المدفوعة_${new Date().toISOString().split('T')[0]}`,
            columns: headers,
            rows,
            generatedBy: currentAdminUser?.fullName || 'الإشراف المالي',
            summaryCards: [
              { label: 'عدد الحجاج في الكشف', value: `${statementPilgrims.length} حاج` },
              { label: 'الحجاج المؤكد دفعهم', value: `${confirmedInStatement.length} حاج` },
              {
                label: 'الإجمالي الكلي المحصل',
                value: `${totalConfirmedPaidAmount.toLocaleString('en-US')} ريال سعودي`,
              },
            ],
          });
        };

        return (
          <div className="space-y-6 animate-fadeIn">
            {/* Header & Unified Segmented Summary (Matches Housing Manifest Style) */}
            <div className="bg-gradient-to-r from-blue-500/10 via-emerald-500/10 to-amber-500/10 border border-blue-500/30 rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500 shrink-0 shadow-sm">
                  <img
                    src="/assets/aistudio/Saudi_Riyal_Symbol-1_96cf3a0c.png"
                    alt="ريال سعودي"
                    className="w-6 h-6 object-contain opacity-95 filter brightness-0 saturate-100 invert-[.5] sepia-[.8] hue-rotate-[90deg]"
                  />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                    <span>كشف الحجاج والمبالغ المدفوعة</span>
                    <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-600 text-white">
                      الإدارة المالية - موسم 1448هـ
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed max-w-2xl">
                    يعرض هذا الكشف <strong>اسم الحاج والمبلغ المدفوع</strong> لكل حاج مع إمكانية تعديل أو حفظ المبلغ مباشرة، وفي نهاية الكشف يظهر <strong>إجمالي المبالغ المدفوعة لكافة الحجاج المؤكد دفعهم في هذا الكشف</strong>.
                  </p>
                </div>
              </div>

              <div className="w-full lg:w-auto flex items-center justify-end">
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex items-center justify-around sm:justify-start gap-3 sm:gap-4 shadow-sm w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setFinanceFilter('all')}
                    className="text-right transition cursor-pointer"
                  >
                    <span className="text-[11px] text-slate-400 block font-bold">إجمالي الحجاج</span>
                    <strong className="text-sm font-black text-slate-900 dark:text-white">{activePilgrims.length} حاج</strong>
                  </button>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <button
                    type="button"
                    onClick={() => setFinanceFilter('confirmed')}
                    className="text-right transition cursor-pointer"
                  >
                    <span className="text-[11px] text-emerald-500 block font-bold">مؤكد دفعهم</span>
                    <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400">{confirmedInStatement.length}</strong>
                  </button>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <div className="text-right">
                    <span className="text-[11px] text-amber-500 block font-bold">قيد المراجعة</span>
                    <strong className="text-sm font-black text-amber-600 dark:text-amber-400">{Math.max(0, activePilgrims.length - allConfirmedCount)}</strong>
                  </div>
                  <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                  <div className="text-right">
                    <span className="text-[11px] text-purple-500 block font-bold">إجمالي المحصّل</span>
                    <strong className="text-sm font-black text-purple-600 dark:text-purple-400 font-mono">
                      {totalConfirmedPaidAmount.toLocaleString('en-US')} ر.س
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* FINANCIAL RECHARTS & OPERATIONAL COST THRESHOLD ALERT */}
            {(() => {
              const getPilgrimExpectedPrice = (p: Pilgrim, pkgs: HajjPackage[]): number => {
                if (p.totalPackagePrice) {
                  const num = Number(String(p.totalPackagePrice).replace(/[^\d.]/g, ''));
                  if (!isNaN(num) && num > 0) return num;
                }
                if (p.selectedPackage) {
                  const matched = pkgs.find(pkg => pkg.title === p.selectedPackage);
                  if (matched && matched.price) {
                    const num = Number(String(matched.price).replace(/[^\d.]/g, ''));
                    if (!isNaN(num) && num > 0) return num;
                  }
                }
                return 0;
              };

              const activePilgrimsForTarget = pilgrims.filter(p => !p.isDeleted && p.status !== 'محذوف' && p.status !== 'معتذر' && p.status !== 'مرفوض');
              const OPERATIONAL_COST_TARGET = activePilgrimsForTarget.reduce((sum, p) => sum + getPilgrimExpectedPrice(p, packages), 0);

              const percentageOfTarget = OPERATIONAL_COST_TARGET > 0
                ? Math.min(100, Math.round((totalConfirmedPaidAmount / OPERATIONAL_COST_TARGET) * 100))
                : 0;
              const isNearOrExceeded = OPERATIONAL_COST_TARGET > 0 && totalConfirmedPaidAmount >= OPERATIONAL_COST_TARGET * 0.85;

              // Compute distribution by package for confirmed payments
              const packageRevenueMap: Record<string, { count: number; totalPaid: number }> = {};
              packages.forEach(pkg => {
                packageRevenueMap[pkg.title] = { count: 0, totalPaid: 0 };
              });
              packageRevenueMap['التسجيل العام (بدون باقة محددة)'] = { count: 0, totalPaid: 0 };

              confirmedInStatement.forEach(p => {
                const pkgTitle = p.selectedPackage && packageRevenueMap[p.selectedPackage] ? p.selectedPackage : 'التسجيل العام (بدون باقة محددة)';
                packageRevenueMap[pkgTitle].count += 1;
                packageRevenueMap[pkgTitle].totalPaid += getPilgrimPaidAmount(p, packages);
              });

              const chartData = Object.entries(packageRevenueMap).map(([name, data]) => ({
                name: name.length > 22 ? name.substring(0, 20) + '...' : name,
                fullName: name,
                'المحصّل': data.totalPaid,
                'عدد الحجاج': data.count,
              }));

              return (
                <div className="space-y-6">
                  {/* Visual Operational Cost Alert Banner */}
                  <div className={`border-2 rounded-3xl p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg transition animate-fadeIn ${
                    totalConfirmedPaidAmount >= OPERATIONAL_COST_TARGET
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                      : isNearOrExceeded
                      ? 'bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300'
                      : 'bg-blue-500/10 border-blue-500/40 text-blue-800 dark:text-blue-300'
                  }`}>
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow font-black text-lg ${
                        totalConfirmedPaidAmount >= OPERATIONAL_COST_TARGET
                          ? 'bg-emerald-500 text-white'
                          : isNearOrExceeded
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-blue-600 text-white'
                      }`}>
                        {totalConfirmedPaidAmount >= OPERATIONAL_COST_TARGET ? '✓' : '⚠️'}
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm sm:text-base font-black flex items-center gap-2">
                          <span>مؤشر التكلفة التشغيلية للرحلة ومستهدف الميزانية</span>
                          <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-white/40 dark:bg-slate-900/40">
                            {percentageOfTarget}% من المستهدف
                          </span>
                        </h4>
                        <p className="text-xs sm:text-sm font-bold leading-relaxed opacity-90">
                          {totalConfirmedPaidAmount >= OPERATIONAL_COST_TARGET
                            ? `تهانينا! تجاوز إجمالي التحصيل المؤكد (${totalConfirmedPaidAmount.toLocaleString('en-US')} ريال) التكلفة التشغيلية المستهدفة (${OPERATIONAL_COST_TARGET.toLocaleString('en-US')} ريال).`
                            : isNearOrExceeded
                            ? `تنبيه مرئي هام: اقترب إجمالي التحصيل المؤكد (${totalConfirmedPaidAmount.toLocaleString('en-US')} ريال) من تغطية التكلفة التشغيلية المتوقعة (${OPERATIONAL_COST_TARGET.toLocaleString('en-US')} ريال)! متبقي القليل لاكتمال المستهدف.`
                            : `إجمالي التحصيل الحالي (${totalConfirmedPaidAmount.toLocaleString('en-US')} ريال) جارٍ رصده نحو تغطية التكلفة التشغيلية المتوقعة للرحلة البالغة (${OPERATIONAL_COST_TARGET.toLocaleString('en-US')} ريال).`}
                        </p>
                      </div>
                    </div>

                    <div className="w-full md:w-64 space-y-1.5 shrink-0">
                      <div className="flex justify-between text-xs font-black">
                        <span>التحصيل المؤكد</span>
                        <span className="font-mono">{percentageOfTarget}%</span>
                      </div>
                      <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-300 dark:border-slate-700">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            totalConfirmedPaidAmount >= OPERATIONAL_COST_TARGET
                              ? 'bg-emerald-500'
                              : isNearOrExceeded
                              ? 'bg-amber-500'
                              : 'bg-blue-600'
                          }`}
                          style={{ width: `${percentageOfTarget}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] opacity-75 font-mono">
                        <span>0 ريال</span>
                        <span>المستهدف: {OPERATIONAL_COST_TARGET.toLocaleString('en-US')} ريال</span>
                      </div>
                    </div>
                  </div>

                  {/* Recharts Bar Chart: Distribution of Collected Revenue by Package */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div>
                        <h4 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                          <BarChart3 className="w-5 h-5 text-emerald-500" />
                          <span>توزيع المبالغ المحصلة المؤكدة حسب الباقة</span>
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">رسم بياني تفاعلي يوضح حجم الإيرادات المحصلة لكل باقة حج وعمرة</p>
                      </div>
                      <span className="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold font-mono">
                        إجمالي المحصّل: {totalConfirmedPaidAmount.toLocaleString('en-US')} ريال
                      </span>
                    </div>

                    <div className="h-72 w-full" dir="ltr">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 20, bottom: 35 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                          <XAxis
                            dataKey="name"
                            angle={-20}
                            textAnchor="end"
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            height={40}
                          />
                          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderRadius: '12px',
                              color: '#f8fafc',
                              fontSize: '12px',
                              textAlign: 'right'
                            }}
                            formatter={(value: any) => [`${Number(value || 0).toLocaleString('en-US')} ريال`, 'المبلغ المحصّل']}
                            labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                          />
                          <Bar dataKey="المحصّل" fill="#10b981" radius={[10, 10, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Search, Filter & Export Bar */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="بحث باسم الحاج، رقم الهوية، أو المبلغ المدفوع..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 whitespace-nowrap">عرض في الكشف:</span>
                  <select
                    value={financeFilter}
                    onChange={(e) => setFinanceFilter(e.target.value as 'confirmed' | 'all')}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-bold"
                  >
                    <option value="confirmed">الحجاج المؤكد دفعهم ({allConfirmedCount})</option>
                    <option value="all">جميع الحجاج المسجلين ({activePilgrims.length})</option>
                  </select>
                </div>
              </div>
            </div>

            {(() => {
              const filterParts: string[] = [
                financeFilter === 'confirmed' ? 'الحجاج المؤكد دفعهم فقط' : 'جميع الحجاج المسجلين',
              ];
              if (searchQuery.trim()) filterParts.push(`بحث: "${searchQuery.trim()}"`);

              return (
                <DynamicPilgrimRosterSection
                  rosterType="paymentsList"
                  pilgrims={statementPilgrims}
                  columnContext={sharedRosterColumnContext}
                  accentColorClass="text-emerald-500 bg-emerald-500/5"
                  onOpenOfficialPrintModal={(payload) => setOfficialReportModal(payload)}
                  reportMeta={{
                    title: 'الكشف المالي للمبالغ المدفوعة والآيبان',
                    subtitle: 'تقرير التدقيق المالي لحالات السداد والبنوك والآيبان وإجمالي المبالغ المحصلة من الحجاج',
                    category: 'التقارير المالية والتحصيلات',
                    filterSummary: filterParts.join(' • '),
                    filename: 'كشف_المبالغ_المدفوعة_قافلة_القائم',
                    signatureRightLabel: 'مشرف الشؤون المالية',
                    generatedBy: currentAdminUser?.fullName || currentAdminUser?.username || 'إدارة قافلة القائم',
                    summaryCards: [
                      { label: 'عدد الحجاج بالكشف', value: `${statementPilgrims.length} حاج` },
                      { label: 'المؤكد دفعهم', value: `${confirmedInStatement.length} حاج` },
                      { label: 'إجمالي المحصّل', value: `${totalConfirmedPaidAmount.toLocaleString('en-US')} ريال` },
                    ],
                    buildSummaryRow: (activeCols) => [
                      '∑',
                      ...activeCols.map((col, i) => {
                        if (col.key === 'paidAmount') return `${totalConfirmedPaidAmount.toLocaleString('en-US')} ريال`;
                        if (col.key === 'paymentStatus') return `${confirmedInStatement.length} حاج مؤكد`;
                        if (i === 0) return 'إجمالي المبالغ المحصلة للمؤكد دفعهم';
                        return '—';
                      }),
                    ],
                  }}
                  renderCustomCell={(pilgrim, colKey) => {
                    const isConf = isPilgrimPaymentConfirmed(pilgrim);
                    const paid = getPilgrimPaidAmount(pilgrim, packages);

                    if (colKey === 'paymentStatus') {
                      return (
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black border whitespace-nowrap ${
                            isConf
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {isConf ? 'مؤكد الدفع' : pilgrim.status || 'بانتظار التأكيد'}
                        </span>
                      );
                    }
                    if (colKey === 'paidAmount') {
                      return (
                        <InlineQuickTextCell
                          value={String(paid || '')}
                          placeholder="المبلغ بالريال"
                          dir="ltr"
                          accentClass="border-emerald-300 dark:border-emerald-700/60 focus:border-emerald-500 font-mono"
                          onSave={(val) => {
                            const cleaned = val.replace(/[^0-9.]/g, '');
                            const num = Number(cleaned) || 0;
                            onUpdatePilgrim({
                              ...pilgrim,
                              paidAmount: num > 0 ? String(num) : '0',
                              paymentReceived: num > 0 ? true : pilgrim.paymentReceived,
                              status: num > 0 ? 'مكتمل الدفع' : pilgrim.status,
                            });
                          }}
                        />
                      );
                    }
                    if (colKey === 'paymentDeclarationStatus') {
                      return renderPaymentDeclarationStatusCell(pilgrim);
                    }
                    if (colKey === 'paymentDeclarationDate') {
                      return renderPaymentDeclarationDateCell(pilgrim);
                    }
                    if (colKey === 'vaccinationStatus') {
                      return renderVaccinationStatusCell(pilgrim);
                    }
                    if (colKey === 'vaccinationDate') {
                      return renderVaccinationDateCell(pilgrim);
                    }
                    return undefined;
                  }}
                  actionsHeader="إجراءات مالية"
                  renderActions={(pilgrim) => {
                    const isConf = isPilgrimPaymentConfirmed(pilgrim);
                    return (
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdatePilgrim({
                              ...pilgrim,
                              paymentReceived: !isConf,
                              status: !isConf ? 'مكتمل الدفع' : 'قيد المراجعة',
                            })
                          }
                          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black transition cursor-pointer ${
                            isConf
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25'
                              : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25'
                          }`}
                        >
                          {isConf ? 'إلغاء التأكيد' : 'تأكيد السداد'}
                        </button>
                        <button
                          type="button"
                          disabled={!isConf}
                          onClick={() => setOfficialReceiptPilgrim(pilgrim)}
                          className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-35 transition cursor-pointer"
                          title="عرض سند القبض الرسمي PDF"
                        >
                          <Receipt className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  }}
                  renderTableFooter={(totalCols) => (
                    <tfoot className="bg-emerald-500/10 dark:bg-emerald-950/40 border-t-2 border-emerald-500/40">
                      <tr>
                        <td colSpan={Math.max(1, totalCols - 1)} className="px-6 py-5 text-right">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black shrink-0">
                              ∑
                            </div>
                            <div>
                              <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white block">
                                إجمالي المبالغ المدفوعة لكافة الحجاج المؤكد دفعهم في هذا الكشف
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                إجمالي عدد الحجاج المؤكد دفعهم في هذا الكشف: <strong>{confirmedInStatement.length} حاج</strong>
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-left">
                          <div className="inline-flex flex-col items-end bg-emerald-600 text-white px-5 py-2.5 rounded-2xl shadow-lg whitespace-nowrap">
                            <span className="text-[10px] font-bold uppercase opacity-90">
                              الإجمالي النهائي المحصّل
                            </span>
                            <span className="text-lg font-black font-mono tracking-tight">
                              {totalConfirmedPaidAmount.toLocaleString('en-US')} ريال سعودي
                            </span>
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                  emptyStateContent="لا توجد سجلات مطابقة في كشف المبالغ المدفوعة حالياً"
                />
              );
            })()}
          </div>
        );
      })()}

      {/* TAB: NOTIFICATIONS MANAGEMENT CENTER */}
      {activeTab === 'notifications' && canManageNotifications && (
        <AdminNotificationCenter
          pilgrims={activePilgrims}
          packages={packages}
          notifications={notifications}
          currentAdminUser={currentAdminUser}
        />
      )}

      {/* TAB 3: PACKAGES & PRICING MANAGEMENT */}
      {activeTab === 'packages' && canAccessFinanceMenu && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-blue-500/10 via-emerald-500/10 to-amber-500/10 border border-blue-500/30 rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-500 shrink-0 shadow-sm">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                  <span>إدارة الباقات وتعديل الأسعار</span>
                  <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-amber-500 text-slate-950">
                    موسم 1448هـ
                  </span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  تعديل أسعار الباقات، إضافة باقات جديدة، أو حذف الباقات الحالية
                </p>
              </div>
            </div>

            <div className="w-full lg:w-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
              <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex items-center justify-around sm:justify-start gap-3 sm:gap-4 shadow-sm">
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block font-bold">إجمالي الباقات</span>
                  <strong className="text-sm font-black text-slate-900 dark:text-white">{packages.length} باقات</strong>
                </div>
                <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                <div className="text-right">
                  <span className="text-[11px] text-emerald-500 block font-bold">حجاج الطيران</span>
                  <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400">{airPilgrimsList.length}</strong>
                </div>
                <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                <div className="text-right">
                  <span className="text-[11px] text-amber-500 block font-bold">حجاج الحافلات</span>
                  <strong className="text-sm font-black text-amber-600 dark:text-amber-400">{busPilgrimsList.length}</strong>
                </div>
                <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
                <div className="text-right">
                  <span className="text-[11px] text-purple-500 block font-bold">إجمالي الحجاج</span>
                  <strong className="text-sm font-black text-purple-600 dark:text-purple-400">{activePilgrims.length}</strong>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const headers = [
                    'م',
                    'اسم الباقة',
                    'تصنيف الباقة',
                    'سعر الباقة المعتمد',
                    'المدة الزمنية',
                    'عدد الحجاج المسجلين',
                    'المؤكد دفعهم في الباقة',
                    'إجمالي الإيرادات التقديرية',
                    'المميزات والخدمات المشمولة',
                  ];
                  let totalRevenueAll = 0;
                  const rows: (string | number)[][] = packages.map((pkg, idx) => {
                    const pkgPilgrims = activePilgrims.filter((p) => p.selectedPackage === pkg.title);
                    const pkgConfirmed = pkgPilgrims.filter((p) => isPilgrimPaymentConfirmed(p));
                    const numericPrice = parseInt(pkg.price.replace(/[^\d]/g, ''), 10) || 0;
                    const estRev = pkgPilgrims.length * numericPrice;
                    totalRevenueAll += estRev;
                    return [
                      idx + 1,
                      pkg.title,
                      pkg.type || 'حج',
                      pkg.price,
                      'موسم 1448هـ',
                      pkgPilgrims.length,
                      pkgConfirmed.length,
                      `${estRev.toLocaleString('en-US')} ريال`,
                      (pkg.features || []).join(' • '),
                    ];
                  });
                  void exportAlQaemExcelReport({
                    reportTitle: 'تقرير الحجوزات والباقات وتوزيع الحجاج والإيرادات',
                    subtitle: 'بيان تفصيلي بباقات الحج والعمرة المعتمدة وأعداد الحجاج المسجلين في كل باقة',
                    category: 'تقارير الحجوزات والباقات',
                    filename: `تقرير_الحجوزات_والباقات_قافلة_القائم_${new Date().toISOString().split('T')[0]}`,
                    columns: headers,
                    rows,
                    generatedBy: currentAdminUser?.fullName || 'الإدارة العامة',
                    summaryCards: [
                      { label: 'إجمالي الباقات المعتمدة', value: `${packages.length} باقات` },
                      { label: 'إجمالي الحجاج النشطين', value: `${activePilgrims.length} حاج` },
                      {
                        label: 'إجمالي الإيرادات التقديرية',
                        value: `${totalRevenueAll.toLocaleString('en-US')} ريال`,
                      },
                    ],
                  });
                }}
                className="bg-[#12192C] hover:bg-slate-800 text-[#F4C84A] border border-[#C5A45D] font-bold px-4 py-3 rounded-xl transition flex items-center justify-center gap-2 shadow text-xs sm:text-sm whitespace-nowrap cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-[#20B995]" />
                <span>تصدير تقرير الباقات Excel</span>
              </button>

              <button
                type="button"
                onClick={() => openAddNewPilgrimModal(packages[0]?.title || '')}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-4 py-3 rounded-2xl transition flex items-center justify-center gap-2 shadow text-xs whitespace-nowrap cursor-pointer"
                title="إضافة حاج يدوياً إلى أي باقة حتى بعد اكتمال العدد أو انتهاء الوقت (استثناء الإدارة)"
              >
                <UserPlus className="w-4 h-4" />
                <span>إضافة حاج يدوياً (استثناء الإدارة)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('formBuilder')}
                className="bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/35 font-black px-4 py-3 rounded-2xl transition flex items-center justify-center gap-2 shadow text-xs whitespace-nowrap cursor-pointer"
                title="تصميم وتخصيص استمارات التسجيل الديناميكية وربطها بالباقات"
              >
                <Sliders className="w-4 h-4" />
                <span>منشئ الاستمارات ({dynamicForms.length})</span>
              </button>

              <button
                onClick={() => {
                  setPkgForm({
                    title: '',
                    type: 'VIP طيران',
                    price: '18,000 ريال',
                    transport: 'طيران + باصات VIP',
                    accommodationMakkah: 'فندق مكة المكرمة',
                    accommodationMadinah: 'فندق المدينة المنورة',
                    campMina: 'مخيم منى المطور',
                    featuresStr: 'إقامة فاخرة, إشراف ديني, وجبات بوفيه',
                    image: 'https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?auto=format&fit=crop&q=80&w=800',
                    showOnHomepage: true,
                    maxCapacity: '50',
                    registrationDeadline: '',
                    forceClose: false,
                    forceCloseReason: 'مغلق لانتهاء الموسم',
                    formTemplateId: '',
                    formTemplateName: '',
                  });
                  setIsNewPackage(true);
                  setEditingPackage(null);
                }}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-5 py-3 rounded-2xl transition flex items-center justify-center gap-2 shadow text-xs whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة باقة جديدة</span>
              </button>
            </div>
          </div>

          {/* PACKAGES MANAGEMENT LIVE TABLE (جدول الباقات والعداد الحي للمقاعد وحالة الباقة) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-950/50">
              <div>
                <h4 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-amber-500" />
                  <span>جدول متابعة الباقات والعداد الحي للمقاعد</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  متابعة فورية لعدد الحجاج المسجلين مقابل الحد الأقصى للمقاعد، حالة الظهور في الصفحة الرئيسية، ومواعيد إغلاق التسجيل
                </p>
              </div>
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl self-start sm:self-auto">
                إجمالي الباقات: {packages.length}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm">
                <thead className="bg-slate-100/80 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-black border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">الباقة والسعر</th>
                    <th className="py-3.5 px-4">العداد الحي للمقاعد</th>
                    <th className="py-3.5 px-4">حالة الباقة الحالية</th>
                    <th className="py-3.5 px-4">انتهاء التسجيل</th>
                    <th className="py-3.5 px-4">الظهور بالرئيسية</th>
                    <th className="py-3.5 px-4">الإغلاق الطارئ</th>
                    <th className="py-3.5 px-4 text-left">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {packages.map((pkg) => {
                    const status = evaluatePackageStatus(pkg, pilgrims);
                    const statusBadgeClasses =
                      status.adminPrimaryStatus.key === 'available'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : status.adminPrimaryStatus.key === 'full'
                        ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
                        : status.adminPrimaryStatus.key === 'expired'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                        : status.adminPrimaryStatus.key === 'force_closed'
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                        : 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30';

                    return (
                      <tr
                        key={`table-${pkg.id}`}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                      >
                        <td className="py-4 px-4">
                          <div className="font-black text-slate-900 dark:text-white">
                            {pkg.title}
                          </div>
                          <div className="text-xs text-amber-600 dark:text-amber-400 font-bold mt-0.5">
                            {pkg.price} · <span className="text-slate-500">{pkg.type}</span>
                          </div>
                          {pkg.formTemplateId && (
                            <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-[10px] font-bold">
                              <Link2 className="w-3 h-3" />
                              <span>
                                استمارة مخصصة:{' '}
                                {dynamicForms.find((f) => f.id === pkg.formTemplateId)?.name ||
                                  pkg.formTemplateName ||
                                  'نموذج ديناميكي'}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Live Seat Counter Column */}
                        <td className="py-4 px-4 min-w-[165px]">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span
                              dir="ltr"
                              className={`font-mono font-black text-sm ${
                                status.isOverCapacity
                                  ? 'text-red-500'
                                  : status.isFull
                                  ? 'text-amber-500'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {status.maxCapacity !== null
                                ? `${status.registeredCount} / ${status.maxCapacity}`
                                : `${status.registeredCount} / ∞`}
                            </span>
                            {status.maxCapacity !== null ? (
                              <span className="text-[11px] font-bold text-slate-500">
                                {status.isOverCapacity
                                  ? `تجاوز بـ ${status.registeredCount - status.maxCapacity} (استثناء)`
                                  : status.isFull
                                  ? 'مكتملة 100%'
                                  : `متبقي ${status.remainingSeats}`}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">سعة مفتوحة</span>
                            )}
                          </div>
                          {status.maxCapacity !== null && (
                            <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  status.isOverCapacity || status.isFull
                                    ? 'bg-red-500'
                                    : status.capacityPercentage >= 80
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, status.capacityPercentage)}%` }}
                              />
                            </div>
                          )}
                        </td>

                        {/* Current Package Status Column */}
                        <td className="py-4 px-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`px-2.5 py-1 rounded-xl text-xs font-black border inline-flex items-center gap-1 ${statusBadgeClasses}`}
                            >
                              <span>{status.adminPrimaryStatus.label}</span>
                            </span>
                            {!status.isVisibleOnHomepage && (status.isFull || status.isDeadlineExpired || status.isForceClosed) && (
                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                {status.isForceClosed
                                  ? 'مغلقة يدوياً'
                                  : status.isFull
                                  ? 'مكتملة'
                                  : 'منتهية التاريخ'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Registration Deadline Column */}
                        <td className="py-4 px-4 text-xs">
                          {pkg.registrationDeadline ? (
                            <div
                              className={`font-bold ${
                                status.isDeadlineExpired
                                  ? 'text-red-500'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {formatRegistrationDeadlineAr(pkg.registrationDeadline)}
                              {status.isDeadlineExpired && (
                                <span className="block text-[10px] text-red-400 font-black">
                                  انتهى الموعد
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">مفتوح (بدون موعد إغلاق)</span>
                          )}
                        </td>

                        {/* Show on Homepage Quick Toggle */}
                        <td className="py-4 px-4">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdatePackage({
                                ...pkg,
                                showOnHomepage: pkg.showOnHomepage === false ? true : false,
                              })
                            }
                            className={`px-3 py-1.5 rounded-xl text-xs font-black border transition flex items-center gap-1.5 cursor-pointer ${
                              pkg.showOnHomepage !== false
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-300'
                            }`}
                          >
                            {pkg.showOnHomepage !== false ? (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                <span>مفعل</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3.5 h-3.5" />
                                <span>مخفي</span>
                              </>
                            )}
                          </button>
                        </td>

                        {/* Force Close Quick Toggle */}
                        <td className="py-4 px-4">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdatePackage({
                                ...pkg,
                                forceClose: !pkg.forceClose,
                                forceCloseReason:
                                  pkg.forceCloseReason || 'مغلق لانتهاء الموسم',
                              })
                            }
                            className={`px-3 py-1.5 rounded-xl text-xs font-black border transition flex items-center gap-1.5 cursor-pointer ${
                              pkg.forceClose
                                ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/25'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-amber-500/40'
                            }`}
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>{pkg.forceClose ? 'مغلق يدوياً' : 'مفتوح'}</span>
                          </button>
                        </td>

                        {/* Actions Column */}
                        <td className="py-4 px-4">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => openAddNewPilgrimModal(pkg.title)}
                              className="px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                              title="إضافة حاج يدوياً إلى هذه الباقة (استثناء الإدارة)"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>+ حاج</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPackage(pkg);
                                setPkgForm({
                                  title: pkg.title,
                                  type: pkg.type,
                                  price: pkg.price,
                                  transport: pkg.transport,
                                  accommodationMakkah: pkg.accommodationMakkah,
                                  accommodationMadinah: pkg.accommodationMadinah,
                                  campMina: pkg.campMina,
                                  featuresStr: pkg.features.join(', '),
                                  image: pkg.image,
                                  showOnHomepage: pkg.showOnHomepage !== false,
                                  maxCapacity:
                                    typeof pkg.maxCapacity === 'number' && pkg.maxCapacity > 0
                                      ? String(pkg.maxCapacity)
                                      : '',
                                  registrationDeadline: pkg.registrationDeadline || '',
                                  forceClose: Boolean(pkg.forceClose),
                                  forceCloseReason:
                                    pkg.forceCloseReason || 'مغلق لانتهاء الموسم',
                                  formTemplateId: pkg.formTemplateId || '',
                                  formTemplateName: pkg.formTemplateName || '',
                                });
                                setIsNewPackage(false);
                              }}
                              className="px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>تعديل</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {packages.map((pkg) => {
              const status = evaluatePackageStatus(pkg, pilgrims);
              return (
                <div
                  key={pkg.id}
                  className={`bg-white dark:bg-slate-900 border rounded-3xl overflow-hidden shadow-sm flex flex-col justify-between ${
                    !status.isVisibleOnHomepage
                      ? 'border-dashed border-slate-400 dark:border-slate-700 opacity-85'
                      : status.isClosedOnHomepage
                      ? 'border-red-500/40'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div>
                    <div className="relative h-48 overflow-hidden">
                      <img src={pkg.image} alt={pkg.title} className="w-full h-full object-cover" />
                      <div className="absolute top-4 right-4 bg-slate-950/80 backdrop-blur-md text-amber-400 px-3 py-1.5 rounded-xl text-sm font-black border border-amber-500/30">
                        {pkg.price}
                      </div>
                      <div className="absolute top-4 left-4 flex flex-col gap-1.5 items-end">
                        <span
                          className={`px-2.5 py-1 rounded-xl text-xs font-black backdrop-blur-md border ${
                            status.adminPrimaryStatus.key === 'available'
                              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40'
                              : status.adminPrimaryStatus.key === 'hidden'
                              ? 'bg-slate-900/90 text-slate-300 border-slate-600'
                              : 'bg-red-950/90 text-red-200 border-red-500/50'
                          }`}
                        >
                          {status.adminPrimaryStatus.label}
                        </span>
                      </div>
                    </div>
                    <div className="p-6 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                          {pkg.type}
                        </span>
                        <span
                          dir="ltr"
                          className="text-xs font-mono font-black px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                        >
                          المقاعد:{' '}
                          {status.maxCapacity !== null
                            ? `${status.registeredCount} / ${status.maxCapacity}`
                            : `${status.registeredCount} / ∞`}
                        </span>
                      </div>
                      <h4 className="text-xl font-black text-slate-900 dark:text-white">{pkg.title}</h4>
                      <p className="text-xs text-slate-500">{pkg.accommodationMakkah}</p>
                      {pkg.formTemplateId && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 text-[11px] font-bold">
                          <Link2 className="w-3.5 h-3.5" />
                          <span>
                            استمارة:{' '}
                            {dynamicForms.find((f) => f.id === pkg.formTemplateId)?.name ||
                              pkg.formTemplateName ||
                              'نموذج ديناميكي'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-6 pt-3 flex justify-end gap-2 flex-wrap border-t border-slate-100 dark:border-slate-800 mt-4">
                    <button
                      type="button"
                      onClick={() => sharePackageItem(pkg)}
                      className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-amber-500/20 hover:text-amber-500 transition text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      title="مشاركة رابط الباقة مباشرة"
                    >
                      <Share2 className="w-4 h-4" /> مشاركة
                    </button>
                    <button
                      onClick={() => {
                        setEditingPackage(pkg);
                        setPkgForm({
                          title: pkg.title,
                          type: pkg.type,
                          price: pkg.price,
                          transport: pkg.transport,
                          accommodationMakkah: pkg.accommodationMakkah,
                          accommodationMadinah: pkg.accommodationMadinah,
                          campMina: pkg.campMina,
                          featuresStr: pkg.features.join(', '),
                          image: pkg.image,
                          showOnHomepage: pkg.showOnHomepage !== false,
                          maxCapacity:
                            typeof pkg.maxCapacity === 'number' && pkg.maxCapacity > 0
                              ? String(pkg.maxCapacity)
                              : '',
                          registrationDeadline: pkg.registrationDeadline || '',
                          forceClose: Boolean(pkg.forceClose),
                          forceCloseReason:
                            pkg.forceCloseReason || 'مغلق لانتهاء الموسم',
                          formTemplateId: pkg.formTemplateId || '',
                          formTemplateName: pkg.formTemplateName || '',
                        });
                        setIsNewPackage(false);
                      }}
                      className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl hover:bg-amber-500/20 transition text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" /> تعديل السعر والباقة
                    </button>
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: 'تأكيد حذف الباقة',
                          message: `هل أنت متأكد من حذف باقة "${pkg.title}"؟`,
                          onConfirm: () => {
                            onDeletePackage(pkg.id);
                            setConfirmModal(prev => ({ ...prev, isOpen: false }));
                          }
                        });
                      }}
                      className="p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" /> حذف
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: PILGRIM GIFT DISTRIBUTION MANAGEMENT (إدارة وتوزيع هدايا الحجاج) */}
      {(activeTab === 'giftDashboard' ||
        activeTab === 'giftRegistry' ||
        activeTab === 'giftFollowUp' ||
        activeTab === 'giftReports') &&
        canManageGifts && (
          <GiftDistributionManager
            activePilgrims={activePilgrims}
            currentStaffName={currentAdminUser?.fullName || 'مشرف القافلة'}
            seasonYear={campaignSettings?.pilgrimStatsConfig?.activeSeasonYear || '1448'}
            initialSubTab={
              activeTab === 'giftRegistry'
                ? 'registry'
                : activeTab === 'giftFollowUp'
                ? 'followup'
                : activeTab === 'giftReports'
                ? 'reports'
                : 'dashboard'
            }
            onNavigateTab={(tab) => {
              if (
                tab === 'giftDashboard' ||
                tab === 'giftRegistry' ||
                tab === 'giftFollowUp' ||
                tab === 'giftReports'
              ) {
                setActiveTab(tab as any);
              }
            }}
          />
        )}

      {/* Campaign Settings Sub-Menus are now integrated in the top Navigation System */}

      {/* TAB 4: STAFF & ROLES MANAGEMENT (5 ROLES & GRANULAR PERMISSIONS SYSTEM) */}
      {activeTab === 'staff' && canManageStaffAndRoles && (
        <StaffManagementView
          adminUsers={adminUsers}
          currentAdminUser={currentAdminUser}
          campaignSettings={campaignSettings}
          onAddAdminUser={onAddAdminUser}
          onUpdateAdminUser={onUpdateAdminUser}
          onDeleteAdminUser={onDeleteAdminUser}
          onUpdateCampaignSettings={onUpdateCampaignSettings}
        />
      )}

      {/* TAB 4.5: SEASONS MANAGEMENT & ARCHIVED MEDIA CONSOLE */}
      {activeTab === 'seasons' && (
        <SeasonsManagerPanel
          seasons={seasons}
          activeSeasonYear={currentSeasonYear}
          packages={packages}
          announcements={announcements}
          pilgrims={pilgrims}
          campaignSettings={campaignSettings}
          actorName={currentAdminUser?.fullName || 'المدير العام'}
          onUpdateCampaignSettings={onUpdateCampaignSettings}
        />
      )}

      {/* TAB 4.55: DYNAMIC FORM BUILDER STUDIO (منشئ الاستمارات الديناميكي وربطها بالباقات) */}
      {activeTab === 'formBuilder' && (
        <DynamicFormBuilderAdmin
          dynamicForms={dynamicForms}
          packages={packages}
          pilgrims={pilgrims}
          campaignSettings={campaignSettings}
          adminName={currentAdminUser?.fullName || 'الإدارة العامة'}
          onUpdatePackage={onUpdatePackage}
          onLogActivity={(action, target, details) => {
            recordActivityLog({
              adminId: currentAdminUser?.id || 'admin',
              adminName: currentAdminUser?.fullName || 'المدير العام',
              username: currentAdminUser?.username || 'admin',
              userRole: currentAdminUser?.role || 'مدير عام (Master Admin)',
              category: 'المشرفين والإعدادات',
              action,
              target,
              details: details || '',
            });
          }}
        />
      )}

      {/* TAB 4.6: KNOWLEDGE BASE ("بنك المعلومات") & ADVISOR («مرشد القائم الذكي») CONTROL CENTER */}
      {(activeTab === 'knowledgeBase' || activeTab === 'advisorManager') && (
        <AdvisorAdminManager
          campaignSettings={campaignSettings}
          currentAdminUser={currentAdminUser}
          onUpdateCampaignSettings={onUpdateCampaignSettings}
          initialSubTab={activeTab === 'knowledgeBase' ? 'knowledge' : 'settings'}
          packages={packages}
          pilgrims={pilgrims}
        />
      )}

      {/* TAB 5: CAMPAIGN CONTACT SETTINGS & CSV EXPORT */}
      {activeTab === 'settings' && (
        <div className="space-y-8 max-w-4xl mx-auto animate-fadeIn">
          {/* CARD 1: EXPORT PILGRIMS CSV CARD (تصدير بيانات الحجاج إلى ملف CSV) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center font-bold border border-emerald-500/20 shadow-sm shrink-0">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                    <span>تصدير وطباعة قائمة بيانات الحجاج (Excel .xlsx و PDF)</span>
                    <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      قاعدة بيانات كاملة والتقارير الرسمية
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    تصدير قائمة الحجاج الحالية بجميع البيانات المسجلة إلى ملفات Excel (.xlsx) بالهوية الرسمية، أو طباعة الكشوف المعتمدة بصيغة PDF.
                  </p>
                </div>
              </div>
            </div>

            {/* إحصائيات موحدة للبيانات الجاهزة للتصدير (بنفس تنسيق كشف التسكين) */}
            <div className="bg-white/80 dark:bg-slate-950/80 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 flex items-center justify-around gap-3 shadow-sm">
              <div className="text-right">
                <span className="text-[11px] text-slate-400 block font-bold">إجمالي الحجاج</span>
                <strong className="text-sm font-black text-slate-900 dark:text-white">{pilgrims.length} حاج</strong>
              </div>
              <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
              <div className="text-right">
                <span className="text-[11px] text-emerald-500 block font-bold">المؤكد دفعهم</span>
                <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                  {activePilgrims.filter(p => isPilgrimPaymentConfirmed(p)).length}
                </strong>
              </div>
              <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
              <div className="text-right">
                <span className="text-[11px] text-amber-500 block font-bold">الحجاج النشطين</span>
                <strong className="text-sm font-black text-amber-600 dark:text-amber-400">{activePilgrims.length}</strong>
              </div>
              <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
              <div className="text-right">
                <span className="text-[11px] text-purple-500 block font-bold">قائمة المستبعدين</span>
                <strong className="text-sm font-black text-purple-600 dark:text-purple-400">{excludedPilgrimsList.length}</strong>
              </div>
            </div>

            {/* تنبيه نجاح التصدير */}
            {csvExportSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm flex items-center justify-between gap-2 animate-fadeIn">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
                  <span className="font-bold">{csvExportSuccess}</span>
                </div>
                <span className="text-[11px] font-mono opacity-80 hidden sm:inline">UTF-8 BOM جاهز للاستخدام المباشر</span>
              </div>
            )}

            {/* أزرار وخيارات التصدير المتعددة */}
            <div className="space-y-3">
              {/* الزر الرئيسي الشامل */}
              <button
                type="button"
                onClick={() => handleExportCSV(pilgrims, 'كافة_بيانات_الحجاج_الشاملة')}
                className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm shadow-lg hover:shadow-xl transition-all flex items-center justify-between gap-4 cursor-pointer active:scale-[0.99] border border-emerald-400/40"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-right">
                    <span className="block text-sm font-black">تصدير قائمة الحجاج الحالية بالكامل (Excel .xlsx بالهوية الرسمية)</span>
                    <span className="block text-[11px] text-emerald-100 font-normal">
                      يتضمن كافة الحقول والبيانات المسجلة لجميع الحجاج ({pilgrims.length} حاج) بتصميم وهوية قافلة القائم المعتمدة
                    </span>
                  </div>
                </div>
                <Download className="w-5 h-5 shrink-0" />
              </button>

              {/* زر فتح نافذة إعداد وتخصيص أعمدة التقرير وترتيبها */}
              <button
                type="button"
                onClick={() => {
                  const lastRep = getLastExportedAlQaemReport();
                  if (lastRep) {
                    openAlQaemExcelCustomizer(lastRep);
                  } else {
                    handleExportCSV(activePilgrims, 'الحجاج_النشطين_المقبولين');
                    setTimeout(() => {
                      const generated = getLastExportedAlQaemReport();
                      if (generated) openAlQaemExcelCustomizer(generated);
                    }, 100);
                  }
                }}
                className="w-full p-3.5 rounded-2xl bg-[#0C1220] hover:bg-[#12192C] text-[#F4C84A] border border-[#C5A45D] font-black text-xs sm:text-sm shadow transition-all flex items-center justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#12192C] border border-[#C5A45D]/40 flex items-center justify-center shrink-0 text-[#F4C84A]">
                    <Settings className="w-4 h-4" />
                  </div>
                  <div className="text-right">
                    <span className="block text-xs sm:text-sm font-black text-[#F4C84A]">
                      نافذة إعداد التقرير وتخصيص وترتيب الأعمدة (محرك Excel المركزي)
                    </span>
                    <span className="block text-[11px] text-[#D6DCE8] font-normal">
                      اختيار أعمدة محددة أو إعادة ترتيبها ومعاينة الهوية البصرية لنظام قافلة القائم قبل التصدير
                    </span>
                  </div>
                </div>
                <Sparkles className="w-4 h-4 text-[#20B995] shrink-0" />
              </button>

              {/* أزرار تصدير فرعية حسب الحالة */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => handleExportCSV(activePilgrims, 'الحجاج_النشطين_المقبولين')}
                  className="p-3.5 bg-slate-50 dark:bg-slate-950 hover:bg-amber-500/10 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 rounded-2xl text-right transition cursor-pointer flex items-center gap-3"
                >
                  <div className="p-2 bg-amber-500/15 text-amber-500 rounded-xl shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">الحجاج النشطين فقط</span>
                    <span className="text-[10px] text-slate-400 font-mono">{activePilgrims.length} حاج مسجل</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const conf = activePilgrims.filter(p => isPilgrimPaymentConfirmed(p));
                    handleExportCSV(conf, 'الحجاج_المؤكد_دفعهم');
                  }}
                  className="p-3.5 bg-slate-50 dark:bg-slate-950 hover:bg-emerald-500/10 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 rounded-2xl text-right transition cursor-pointer flex items-center gap-3"
                >
                  <div className="p-2 bg-emerald-500/15 text-emerald-500 rounded-xl shrink-0">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">المؤكد دفعهم فقط</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {activePilgrims.filter(p => isPilgrimPaymentConfirmed(p)).length} حاج مؤكد
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportCSV(excludedPilgrimsList, 'المستبعدين')}
                  className="p-3.5 bg-slate-50 dark:bg-slate-950 hover:bg-red-500/10 border border-slate-200 dark:border-slate-800 hover:border-red-500/50 rounded-2xl text-right transition cursor-pointer flex items-center gap-3"
                >
                  <div className="p-2 bg-red-500/15 text-red-500 rounded-xl shrink-0">
                    <XCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">قائمة المستبعدين</span>
                    <span className="text-[10px] text-slate-400 font-mono">{excludedPilgrimsList.length} مستبعد</span>
                  </div>
                </button>
              </div>
            </div>

            {/* تفاصيل الحقول المضمنة بالملف */}
            <div className="bg-slate-50 dark:bg-slate-950/70 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-2">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>البيانات الشاملة المتضمنة في ملف الـ CSV المصدر:</span>
              </span>
              <p className="leading-relaxed">
                الرقم التسلسلي، رقم العضوية، الاسم الرباعي الكامل، الاسم بالإنجليزية، رقم الهوية الوطنية/الإقامة، تواريخ الإصدار والانتهاء والميلاد، الجنس والجنسية، بيانات التواصل (الجوال، الواتساب، البريد)، رقم الآيبان والبنك واسم الحساب، الباقة المختارة، إجمالي السعر، المبالغ المسددة والمحولة والمتبقية، رقم العملية البنكية وتاريخها، وسيلة النقل، رقم الباص والمقعد، رقم غرفة سكن مكة وسكن المدينة، مرجع التقليد الحالي والسابق، القدرة على الحركة، الحالات الصحية والاحتياجات الخاصة، وبيانات المحرم والمرافقين.
              </p>
            </div>
          </div>

          {/* CARD 1.5: PILGRIMS & HISTORICAL STATISTICS (إحصائيات الحجاج والأعوام السابقة) */}
          {(() => {
            const currentStatsConfig = getEffectivePilgrimStatsConfig({
              ...campaignSettings,
              pilgrimStatsConfig: settingsForm.pilgrimStatsConfig || campaignSettings.pilgrimStatsConfig,
            });
            const liveStats = calculatePilgrimStatsBreakdown(pilgrims, {
              ...campaignSettings,
              pilgrimStatsConfig: currentStatsConfig,
            });

            const persistPilgrimStatsConfig = (nextConfig: typeof currentStatsConfig) => {
              const updatedSettings: CampaignSettings = {
                ...campaignSettings,
                ...settingsForm,
                pilgrimStatsConfig: nextConfig,
                youtubeConfig: campaignSettings.youtubeConfig || settingsForm.youtubeConfig,
              };
              setSettingsForm(updatedSettings);
              onUpdateCampaignSettings(updatedSettings);
              setPilgrimStatsSavedNotice(true);
              setTimeout(() => setPilgrimStatsSavedNotice(false), 3500);
            };

            const handleAddHistoricalRecord = () => {
              const cleanYear = newHistYearInput.trim();
              const parsedCount = Math.max(0, parseInt(newHistCountInput.replace(/[^\d]/g, ''), 10) || 0);
              if (!cleanYear || parsedCount <= 0) return;

              const formattedYear = cleanYear.endsWith('هـ') ? cleanYear : `${cleanYear}هـ`;
              const newRecord = {
                id: `hist-${Date.now()}`,
                hijriYear: formattedYear,
                pilgrimsCount: parsedCount,
                notes: newHistNotesInput.trim() || `موسم حج ${formattedYear}`,
              };

              const nextConfig = {
                ...currentStatsConfig,
                historicalRecords: [newRecord, ...(currentStatsConfig.historicalRecords || [])],
              };
              persistPilgrimStatsConfig(nextConfig);
              setNewHistYearInput('');
              setNewHistCountInput('');
              setNewHistNotesInput('');
            };

            const handleRemoveHistoricalRecord = (recordId: string) => {
              const nextConfig = {
                ...currentStatsConfig,
                historicalRecords: (currentStatsConfig.historicalRecords || []).filter(
                  (r) => r.id !== recordId
                ),
              };
              persistPilgrimStatsConfig(nextConfig);
            };

            const handleUpdateHistoricalRecordCount = (recordId: string, newCountVal: string) => {
              const parsed = Math.max(0, parseInt(newCountVal.replace(/[^\d]/g, ''), 10) || 0);
              const nextRecords = (currentStatsConfig.historicalRecords || []).map((r) =>
                r.id === recordId ? { ...r, pilgrimsCount: parsed } : r
              );
              setSettingsForm((prev) => ({
                ...prev,
                pilgrimStatsConfig: {
                  ...currentStatsConfig,
                  historicalRecords: nextRecords,
                },
              }));
            };

            return (
              <div className="bg-[#0B1221] border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-right">
                {/* Card Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/90 pb-5">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 bg-amber-500/15 text-amber-400 rounded-2xl flex items-center justify-center font-bold border border-amber-500/35 shadow-sm shrink-0">
                      <BarChart3 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg sm:text-xl font-black text-white flex items-center gap-2 flex-wrap">
                        <span>إحصائيات الحجاج والأعوام السابقة</span>
                        <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          عداد الصفحة الرئيسية المباشر
                        </span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        إدارة أعداد حجاج الأعوام السابقة وربطها التلقائي بمسافري الطيران والباصات الفعليين لتحديث عداد «حاج مسجل ومنضم» في الصفحة الرئيسية لحظياً.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => persistPilgrimStatsConfig(currentStatsConfig)}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer shrink-0"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>حفظ وتحديث العداد فوراً</span>
                  </button>
                </div>

                {pilgrimStatsSavedNotice && (
                  <div className="bg-emerald-500/15 border border-emerald-500/35 p-3.5 rounded-2xl text-emerald-300 text-xs sm:text-sm font-bold flex items-center gap-2.5 animate-fadeIn">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <span>تم حفظ إحصائيات الحجاج وتحديث الرقم المعروض في الصفحة الرئيسية بنجاح!</span>
                  </div>
                )}

                {/* Live Equation Breakdown Box: إجمالي السنوات السابقة + مسافري الطيران الفعليين + مسافري الباصات الفعليين = الرقم المعروض في الصفحة الرئيسية */}
                <div className="bg-gradient-to-l from-amber-500/[0.12] via-[#10192D] to-[#080D1A] border border-amber-500/40 rounded-2xl p-4 sm:p-5 space-y-4 shadow-inner">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-black text-amber-300 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>معادلة الاحتساب الحي لعداد الصفحة الرئيسية («حاج مسجل ومنضم»):</span>
                    </span>
                    <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg">
                      تحديث تلقائي متزامن
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-7 items-center gap-2.5 text-center">
                    {/* 1. Past Years Total */}
                    <div className="bg-[#0B1221]/90 border border-slate-800 rounded-xl p-3">
                      <span className="text-[11px] text-slate-400 font-bold block">إجمالي السنوات السابقة</span>
                      <strong className="text-lg font-black text-white font-mono tabular-nums mt-0.5 block">
                        {liveStats.pastYearsPilgrimsTotal.toLocaleString('en-US')}
                      </strong>
                    </div>

                    <div className="text-amber-400 font-black text-lg">+</div>

                    {/* 2. Active Flight Passengers */}
                    <div className={`bg-[#0B1221]/90 border rounded-xl p-3 transition-opacity ${liveStats.autoIncludeCurrentPassengers ? 'border-sky-500/30' : 'border-slate-800 opacity-50'}`}>
                      <span className="text-[11px] text-sky-400 font-bold flex items-center justify-center gap-1">
                        <Plane className="w-3.5 h-3.5" />
                        <span>مسافري الطيران الفعليين</span>
                      </span>
                      <strong className="text-lg font-black text-sky-300 font-mono tabular-nums mt-0.5 block">
                        {liveStats.autoIncludeCurrentPassengers ? liveStats.activeFlightPassengersCount.toLocaleString('en-US') : 0}
                      </strong>
                    </div>

                    <div className="text-amber-400 font-black text-lg">+</div>

                    {/* 3. Active Bus Passengers */}
                    <div className={`bg-[#0B1221]/90 border rounded-xl p-3 transition-opacity ${liveStats.autoIncludeCurrentPassengers ? 'border-emerald-500/30' : 'border-slate-800 opacity-50'}`}>
                      <span className="text-[11px] text-emerald-400 font-bold flex items-center justify-center gap-1">
                        <Bus className="w-3.5 h-3.5" />
                        <span>مسافري الباصات الفعليين</span>
                      </span>
                      <strong className="text-lg font-black text-emerald-300 font-mono tabular-nums mt-0.5 block">
                        {liveStats.autoIncludeCurrentPassengers ? liveStats.activeBusPassengersCount.toLocaleString('en-US') : 0}
                      </strong>
                    </div>

                    <div className="text-amber-400 font-black text-lg">=</div>

                    {/* 4. Final Displayed Number on Homepage */}
                    <div className="bg-amber-500/20 border-2 border-amber-500/60 rounded-xl p-3 shadow-md">
                      <span className="text-[11px] text-amber-300 font-bold block">الرقم المعروض في الرئيسية</span>
                      <strong dir="ltr" className="text-xl font-black text-amber-400 font-mono tabular-nums mt-0.5 inline-block">
                        {formatPilgrimsCountWithPlus(liveStats.totalPilgrims)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Toggle Option: Auto-include current active passengers from Flights & Buses */}
                <div className="bg-[#10192D] border border-slate-800/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                      <span>الاحتساب التلقائي لمسافري الطيران والباصات الفعليين للموسم الحالي</span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          currentStatsConfig.autoIncludeCurrentPassengers
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {currentStatsConfig.autoIncludeCurrentPassengers ? 'مفعّل تلقائياً' : 'متوقف'}
                      </span>
                    </span>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      عند التفعيل، يتم إضافة عدد حجاج رحلات الطيران النشطين ({liveStats.activeFlightPassengersCount}) وحجاج رحلات الحافلات النشطين ({liveStats.activeBusPassengersCount}) تلقائياً وبشكل فوري إلى إجمالي السنوات السابقة.
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={currentStatsConfig.autoIncludeCurrentPassengers}
                    onClick={() => {
                      const nextConfig = {
                        ...currentStatsConfig,
                        autoIncludeCurrentPassengers: !currentStatsConfig.autoIncludeCurrentPassengers,
                      };
                      persistPilgrimStatsConfig(nextConfig);
                    }}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs border transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                      currentStatsConfig.autoIncludeCurrentPassengers
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/40 shadow'
                        : 'bg-[#080D1A] hover:bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {currentStatsConfig.autoIncludeCurrentPassengers
                        ? 'مفعّل: يشمل الطيران والباصات'
                        : 'تفعيل دمج الطيران والباصات'}
                    </span>
                  </button>
                </div>

                {/* Active Season Year Setting */}
                <div className="bg-[#10192D] border border-amber-500/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>العام الهجري لموسم الحج النشط</span>
                    </span>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      يحدد هذا العام أي حجاج يعتبرون ضمن الموسم الحالي النشط لعزل إحصائياتهم عن مواسم الأعوام السابقة ومنع التضارب.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={currentStatsConfig.activeSeasonYear || '1448'}
                      onChange={(e) => {
                        const cleanYear = e.target.value.replace(/[^\d]/g, '');
                        const nextConfig = {
                          ...currentStatsConfig,
                          activeSeasonYear: cleanYear || '1448',
                        };
                        setSettingsForm((prev) => ({
                          ...prev,
                          pilgrimStatsConfig: nextConfig,
                        }));
                      }}
                      className="w-24 bg-[#080D1A] border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-center text-amber-300 font-mono font-bold text-sm focus:outline-none"
                      placeholder="1448"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => persistPilgrimStatsConfig(currentStatsConfig)}
                      className="px-4 py-2 bg-[#16233E] hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-amber-500/35 rounded-xl text-xs font-bold transition cursor-pointer shrink-0"
                    >
                      تثبيت العام
                    </button>
                  </div>
                </div>

                {/* Base Historical Total + Add New Hijri Year Record */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  {/* Base Historical Pilgrim Count Input */}
                  <div className="lg:col-span-5 bg-[#10192D]/80 border border-slate-800/90 rounded-2xl p-4 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-amber-300 mb-1">
                        الرصيد التأسيسي للأعوام السابقة (إجمالي عام اختياري)
                      </label>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        يمكنك إدخال رصيد تأسيسي تراكمي للأعوام السابقة (أو الاكتفاء بجدول الأعوام الهجرية أدناه، حيث يتم جمعهما معاً):
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={currentStatsConfig.baseHistoricalCount || 0}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setSettingsForm((prev) => ({
                            ...prev,
                            pilgrimStatsConfig: {
                              ...currentStatsConfig,
                              baseHistoricalCount: val,
                            },
                          }));
                        }}
                        className="w-full bg-[#080D1A] border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none"
                        dir="ltr"
                        placeholder="0"
                      />
                      <button
                        type="button"
                        onClick={() => persistPilgrimStatsConfig(currentStatsConfig)}
                        className="px-4 py-2.5 bg-[#16233E] hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-amber-500/35 rounded-xl text-xs font-bold transition cursor-pointer shrink-0"
                      >
                        تطبيق
                      </button>
                    </div>
                  </div>

                  {/* Add Historical Hijri Year Record Form */}
                  <div className="lg:col-span-7 bg-[#10192D]/80 border border-slate-800/90 rounded-2xl p-4 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-amber-300 mb-1">
                        إضافة سجل عام هجري سابق إلى الأرشيف الإحصائي
                      </label>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        أدخل السنة الهجرية وعدد الحجاج ليتم إضافتها إلى إجمالي السنوات السابقة وتحديث العداد تلقائياً:
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <input
                        type="text"
                        value={newHistYearInput}
                        onChange={(e) => setNewHistYearInput(e.target.value)}
                        className="bg-[#080D1A] border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none"
                        placeholder="السنة الهجرية (مثال: 1447هـ)"
                      />
                      <input
                        type="number"
                        min={1}
                        value={newHistCountInput}
                        onChange={(e) => setNewHistCountInput(e.target.value)}
                        className="bg-[#080D1A] border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-white font-mono text-xs focus:outline-none"
                        dir="ltr"
                        placeholder="عدد الحجاج (مثال: 280)"
                      />
                      <button
                        type="button"
                        onClick={handleAddHistoricalRecord}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl px-4 py-2.5 text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                        <span>إضافة عام سابق</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Historical Years Records Table / List */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-slate-300">
                      سجل أعداد الحجاج للأعوام الهجرية السابقة ({currentStatsConfig.historicalRecords.length} أعوام مسجلة)
                    </span>
                    <span className="text-xs font-mono text-amber-400 font-bold">
                      مجموع السجلات السنوية: {liveStats.historicalRecordsTotal.toLocaleString('en-US')} حاج
                    </span>
                  </div>

                  {currentStatsConfig.historicalRecords.length === 0 ? (
                    <div className="bg-[#080D1A] border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                      لا توجد سجلات أعوام سابقة مضافة حالياً. يمكنك إضافة أعوام هجرية من الحقل أعلاه أو تحديد الرصيد التأسيسي.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {currentStatsConfig.historicalRecords.map((rec) => (
                        <div
                          key={rec.id}
                          className="bg-[#080D1A] border border-slate-800/90 hover:border-amber-500/35 rounded-2xl p-3.5 flex items-center justify-between gap-3 transition"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-black text-amber-300 block">
                              عام {rec.hijriYear}
                            </span>
                            {rec.notes && (
                              <span className="text-[11px] text-slate-400 block mt-0.5 truncate">
                                {rec.notes}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1.5 bg-[#10192D] border border-slate-700 rounded-xl px-2.5 py-1.5">
                              <input
                                type="number"
                                min={0}
                                value={rec.pilgrimsCount}
                                onChange={(e) => handleUpdateHistoricalRecordCount(rec.id, e.target.value)}
                                onBlur={() => persistPilgrimStatsConfig(currentStatsConfig)}
                                className="w-20 bg-transparent text-white font-mono font-bold text-xs text-center focus:outline-none"
                                dir="ltr"
                                aria-label={`عدد حجاج عام ${rec.hijriYear}`}
                              />
                              <span className="text-[10px] text-slate-400 font-bold">حاج</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveHistoricalRecord(rec.id)}
                              className="w-8 h-8 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 flex items-center justify-center transition cursor-pointer"
                              title="حذف هذا العام من السجل"
                              aria-label={`حذف سجل عام ${rec.hijriYear}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* CARD 2: CAMPAIGN CONTACT SETTINGS & SITE TEXTS */}
          <div className="space-y-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center font-bold">
                <Settings className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">إعدادات التواصل ومعلومات القافلة</h3>
                <p className="text-xs text-slate-500 mt-0.5">تعديل أرقام الهواتف، الواتساب، البريد الإلكتروني، وعنوان المقر لتظهر في كافة صفحات الموقع</p>
              </div>
            </div>

            <div className="flex justify-between items-center bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400">أي تعديل في هذه الحقول يُحفظ مركزياً ويظهر فوراً في جميع الأجهزة</span>
            <button
              type="button"
              disabled={isSavingSettings}
              onClick={async () => {
                setSettingsSaveError('');
                setIsSavingSettings(true);
                try {
                  const res = await onUpdateCampaignSettings({
                    ...campaignSettings,
                    ...settingsForm,
                    youtubeConfig: campaignSettings.youtubeConfig || settingsForm.youtubeConfig,
                    advisorConfig: campaignSettings.advisorConfig || settingsForm.advisorConfig,
                  });
                  if (res === false) {
                    setSettingsSaveError('تعذر تأكيد الحفظ في السحابة. يرجى التحقق من الاتصال.');
                  } else {
                    setSettingsSaved(true);
                    setTimeout(() => setSettingsSaved(false), 4000);
                  }
                } finally {
                  setIsSavingSettings(false);
                }
              }}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow flex items-center gap-2 transition active:scale-95 disabled:opacity-60"
            >
              {isSavingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{isSavingSettings ? 'جاري الحفظ...' : 'حفظ ونشر التعديلات فوراً'}</span>
            </button>
          </div>

          {settingsSaveError && (
            <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl text-rose-400 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{settingsSaveError}</span>
            </div>
          )}

          {settingsSaved && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl text-emerald-500 text-sm flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>تم تأكيد الحفظ المركزي ونشر التعديلات بنجاح!</span>
            </div>
          )}

          {/* YouTube Channel & Live Stream Control inside Settings Tab */}
          <YouTubeAdminControl
            campaignSettings={campaignSettings}
            onUpdateCampaignSettings={(updated) => {
              setSettingsForm((prev) => ({
                ...prev,
                youtubeConfig: updated.youtubeConfig,
              }));
              onUpdateCampaignSettings(updated);
            }}
          />

          {/* Central Data Backup & Media Storage Optimization Center */}
          <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-black text-amber-400 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span>إدارة النسخ الاحتياطي وتحسين مساحة الوسائط</span>
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  تصدير نسخة احتياطية شاملة لجميع أقسام ومجموعات قاعدة البيانات (29 مجموعة + ملفات الوسائط والإعدادات) أو فحص وتنظيف الصور والفيديوهات غير المستخدمة.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('seasons')}
                  className="px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                >
                  <FolderArchive className="w-3.5 h-3.5" />
                  <span>إدارة المواسم والأرشيف</span>
                </button>
                <button
                  type="button"
                  disabled={isExportingBackup}
                  onClick={async () => {
                    setIsExportingBackup(true);
                    setBackupExportResult(null);
                    try {
                      const summary = await downloadSystemBackupJson();
                      setBackupExportResult(summary);
                    } finally {
                      setIsExportingBackup(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {isExportingBackup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>تصدير نسخة احتياطية شاملة (JSON)</span>
                </button>
                <button
                  type="button"
                  disabled={isRunningMediaAudit}
                  onClick={async () => {
                    setIsRunningMediaAudit(true);
                    try {
                      const summary = await runMediaStorageAuditAndCleanup();
                      setMediaAuditResult(summary);
                    } finally {
                      setIsRunningMediaAudit(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {isRunningMediaAudit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>فحص وتنظيف الوسائط الآن</span>
                </button>
              </div>
            </div>
            {backupExportResult && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200 flex flex-wrap items-center gap-4">
                <span>تم تنزيل النسخة الاحتياطية الشاملة: <strong>{backupExportResult.fileName}</strong></span>
                <span>الأقسام المشمولة: <strong>{backupExportResult.totalCollections} مجموعة</strong></span>
                <span>إجمالي السجلات: <strong>{backupExportResult.totalDocuments.toLocaleString('en-US')} سجل</strong></span>
                {backupExportResult.failedCollections.length > 0 && (
                  <span className="text-red-300">
                    مجموعات لم تكتمل قراءتها: <strong>{backupExportResult.failedCollections.join(', ')}</strong>
                  </span>
                )}
              </div>
            )}
            {mediaAuditResult && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300 flex flex-wrap items-center gap-4">
                <span>الأصول المفحوصة: <strong>{mediaAuditResult.totalAssetsScanned}</strong></span>
                <span>ملفات محمية بأرشيف المواسم: <strong>{mediaAuditResult.protectedArchivedCount || 0}</strong></span>
                <span>ملفات يتيمة تم حذفها: <strong>{mediaAuditResult.orphansDeleted}</strong></span>
                <span>صور قديمة تم نقلها للتخزين المضغوط: <strong>{mediaAuditResult.base64MigratedCount}</strong></span>
                <span>المساحة المحررة التقديرية: <strong>{Math.round(mediaAuditResult.bytesSavedEstimate / 1024)} KB</strong></span>
              </div>
            )}
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSettingsSaveError('');
              setIsSavingSettings(true);
              try {
                const res = await onUpdateCampaignSettings({
                  ...campaignSettings,
                  ...settingsForm,
                  youtubeConfig: campaignSettings.youtubeConfig || settingsForm.youtubeConfig,
                  advisorConfig: campaignSettings.advisorConfig || settingsForm.advisorConfig,
                });
                if (res === false) {
                  setSettingsSaveError('تعذر تأكيد الحفظ في السحابة. يرجى التحقق من الاتصال.');
                } else {
                  setSettingsSaved(true);
                  setTimeout(() => setSettingsSaved(false), 4000);
                }
              } finally {
                setIsSavingSettings(false);
              }
            }}
            className="space-y-5 text-right text-sm"
          >
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">رقم هاتف القافلة الرئيسي *</label>
              <input
                type="text"
                value={settingsForm.phone}
                onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-mono"
                dir="ltr"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">رقم الواتساب الرسمي *</label>
              <input
                type="text"
                value={settingsForm.whatsapp}
                onChange={(e) => setSettingsForm({ ...settingsForm, whatsapp: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-mono"
                dir="ltr"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">البريد الإلكتروني للقافلة *</label>
              <input
                type="email"
                value={settingsForm.email}
                onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-mono"
                dir="ltr"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">عنوان مقر القافلة الرئيسي *</label>
              <input
                type="text"
                value={settingsForm.address}
                onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white"
                required
              />
            </div>

            {/* Appearance & Global Font Scale Control (Admin Visual Identity Settings) */}
            <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-black text-base">
                    <span>إعدادات المظهر وحجم الخط العام للموقع</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    اختر مقياس حجم الخط المناسب للمنصة؛ ينعكس التغيير فوراً وبشكل متناسب على جميع العناوين والنصوص والبطاقات دون التأثير على تناسق الصفحات أو التقارير المطبوعة.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-mono font-bold">
                  المقياس الحالي:{' '}
                  {(settingsForm.fontScale || 'normal') === 'compact'
                    ? '90% (صغير / مدمج)'
                    : (settingsForm.fontScale || 'normal') === 'large'
                    ? '110% (كبير / مريح)'
                    : '100% (متوسط / قياسي)'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    id: 'compact' as const,
                    title: 'صغير / مدمج',
                    badge: 'Compact - 90%',
                    pct: '90%',
                    desc: 'عرض مكثف ومرتب يعرض محتوى أكثر في الشاشة',
                    sampleClass: 'text-xs',
                  },
                  {
                    id: 'normal' as const,
                    title: 'متوسط / قياسي',
                    badge: 'Normal - 100%',
                    pct: '100%',
                    desc: 'الوضع الافتراضي المتوازن والموصى به للجميع',
                    sampleClass: 'text-sm',
                    isDefault: true,
                  },
                  {
                    id: 'large' as const,
                    title: 'كبير / مريح للقراءة',
                    badge: 'Large - 110%',
                    pct: '110%',
                    desc: 'خط أكبر وأوضح لراحة العين وكبار السن',
                    sampleClass: 'text-base',
                  },
                ].map((opt) => {
                  const isSelected = (settingsForm.fontScale || 'normal') === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        const updatedSettings: CampaignSettings = {
                          ...settingsForm,
                          fontScale: opt.id,
                        };
                        setSettingsForm(updatedSettings);
                        document.documentElement.style.setProperty('--qaem-root-font-size', opt.pct);
                        safeStorage.setItem('qaem_font_scale', opt.id);
                        onUpdateCampaignSettings(updatedSettings);
                        setSettingsSaved(true);
                        setTimeout(() => setSettingsSaved(false), 3000);
                      }}
                      className={`text-right p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                        isSelected
                          ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-500 shadow-md ring-2 ring-amber-500/20'
                          : 'bg-slate-50 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800 hover:border-amber-500/45'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`font-black ${opt.sampleClass} ${
                            isSelected ? 'text-amber-800 dark:text-amber-300' : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {opt.title}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950 border-amber-400'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                          }`}
                          dir="ltr"
                        >
                          {opt.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {opt.desc}
                      </p>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/80 dark:border-slate-800/80 text-[11px]">
                        <span className="font-bold text-slate-500 dark:text-slate-400">
                          {opt.isDefault ? 'الوضع الافتراضي' : 'تطبيق فوري'}
                        </span>
                        <span
                          className={`font-black ${
                            isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {isSelected ? 'مُفعّل حالياً ✓' : 'اختيار وتطبيق'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Editable Site Texts Section */}
            <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 font-bold text-base">
                <span>تحرير وتعديل نصوص وكتابات الواجهة الرئيسية</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                يمكنك تخصيص وتعديل جميع العناوين والنصوص المعروضة في الصفحة الرئيسية لتناسب إعلانات ومواسم القافلة:
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">نص شريط الإعلان العلوي (الشريط البرتقالي أعلى الموقع) *</label>
                <input
                  type="text"
                  value={settingsForm.siteTexts?.topBarAnnouncement || ''}
                  onChange={(e) => setSettingsForm({
                    ...settingsForm,
                    siteTexts: {
                      ...(settingsForm.siteTexts || {} as any),
                      topBarAnnouncement: e.target.value
                    }
                  })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-sm"
                  placeholder="قافلة القائم للحج والعمرة - موسم 1448هـ"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">اسم القافلة في الترويسة *</label>
                  <input
                    type="text"
                    value={settingsForm.siteTexts?.brandName || ''}
                    onChange={(e) => setSettingsForm({
                      ...settingsForm,
                      siteTexts: {
                        ...(settingsForm.siteTexts || {} as any),
                        brandName: e.target.value
                      }
                    })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-sm"
                    placeholder="قافلة القائم"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">النص الفرعي للاسم *</label>
                  <input
                    type="text"
                    value={settingsForm.siteTexts?.brandSubtitle || ''}
                    onChange={(e) => setSettingsForm({
                      ...settingsForm,
                      siteTexts: {
                        ...(settingsForm.siteTexts || {} as any),
                        brandSubtitle: e.target.value
                      }
                    })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-sm"
                    placeholder="للحج والعمرة والزيارة"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">نص الشارة العلوية (Badge الإعلان) *</label>
                <input
                  type="text"
                  value={settingsForm.siteTexts?.heroBadge || ''}
                  onChange={(e) => setSettingsForm({
                    ...settingsForm,
                    siteTexts: {
                      ...(settingsForm.siteTexts || {} as any),
                      heroBadge: e.target.value
                    }
                  })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-sm"
                  placeholder="فتح باب التسجيل لحج موسم 1448 هـ - المقاعد محدودة"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">بداية العنوان الرئيسي *</label>
                  <input
                    type="text"
                    value={settingsForm.siteTexts?.heroTitlePrefix || ''}
                    onChange={(e) => setSettingsForm({
                      ...settingsForm,
                      siteTexts: {
                        ...(settingsForm.siteTexts || {} as any),
                        heroTitlePrefix: e.target.value
                      }
                    })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-sm"
                    placeholder="رفيقكم الموثوق في رحلة العمر"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">الكلمة المميزة باللون الذهبي *</label>
                  <input
                    type="text"
                    value={settingsForm.siteTexts?.heroTitleHighlight || ''}
                    onChange={(e) => setSettingsForm({
                      ...settingsForm,
                      siteTexts: {
                        ...(settingsForm.siteTexts || {} as any),
                        heroTitleHighlight: e.target.value
                      }
                    })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-sm font-bold text-amber-500"
                    placeholder="قافلة القائم"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">النص الوصفي الترحيبي *</label>
                <textarea
                  rows={3}
                  value={settingsForm.siteTexts?.heroDescription || ''}
                  onChange={(e) => setSettingsForm({
                    ...settingsForm,
                    siteTexts: {
                      ...(settingsForm.siteTexts || {} as any),
                      heroDescription: e.target.value
                    }
                  })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-sm"
                  placeholder="نقدم خدمات متكاملة وراقية لحجاج بيت الله الحرام والمعتمرين..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">نص زر استعراض الباقات في الصفحة الرئيسية (البرتقالي) *</label>
                  <input
                    type="text"
                    value={settingsForm.siteTexts?.registerButtonText || ''}
                    onChange={(e) => setSettingsForm({
                      ...settingsForm,
                      siteTexts: {
                        ...(settingsForm.siteTexts || {} as any),
                        registerButtonText: e.target.value
                      }
                    })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-sm"
                    placeholder="استعراض باقات الحج والعمرة"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">نص زر بوابة الاستعلام *</label>
                  <input
                    type="text"
                    value={settingsForm.siteTexts?.portalButtonText || ''}
                    onChange={(e) => setSettingsForm({
                      ...settingsForm,
                      siteTexts: {
                        ...(settingsForm.siteTexts || {} as any),
                        portalButtonText: e.target.value
                      }
                    })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-sm"
                    placeholder="بوابة الاستعلام للحاج"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">عنوان كرت الشعار *</label>
                  <input
                    type="text"
                    value={settingsForm.siteTexts?.cardTitle || ''}
                    onChange={(e) => setSettingsForm({
                      ...settingsForm,
                      siteTexts: {
                        ...(settingsForm.siteTexts || {} as any),
                        cardTitle: e.target.value
                      }
                    })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-sm"
                    placeholder="قافلة القائم للحج والعمرة"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">الموقع الجغرافي بالشريط العلوي *</label>
                  <input
                    type="text"
                    value={settingsForm.siteTexts?.topBarSubtext || ''}
                    onChange={(e) => setSettingsForm({
                      ...settingsForm,
                      siteTexts: {
                        ...(settingsForm.siteTexts || {} as any),
                        topBarSubtext: e.target.value
                      }
                    })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-sm"
                    placeholder="الأحساء - المبرز"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">وصف كرت الشعار *</label>
                <input
                  type="text"
                  value={settingsForm.siteTexts?.cardSubtitle || ''}
                  onChange={(e) => setSettingsForm({
                    ...settingsForm,
                    siteTexts: {
                      ...(settingsForm.siteTexts || {} as any),
                      cardSubtitle: e.target.value
                    }
                  })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-sm"
                  placeholder="خدمة ضيوف الرحمن شرف وفخر لنا منذ سنوات طويلة"
                />
              </div>

              {/* Official Website URL for QR Code & Share Card */}
              <div className="md:col-span-2 bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>الرابط الرسمي المعتمد للموقع (لرمز الباركود QR وبطاقة المشاركة)</span>
                </label>
                <input
                  type="url"
                  dir="ltr"
                  value={settingsForm.officialWebsiteUrl || ''}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      officialWebsiteUrl: e.target.value,
                    })
                  }
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-sm font-mono focus:outline-none focus:border-amber-500"
                  placeholder="https://alqaemhajj.com"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  اتركه فارغاً لاستخدام النطاق الرئيسي الحالي للموقع تلقائياً، أو أدخل النطاق الرسمي الدائم للقافلة ليُعتمد في الباركود وبطاقة الإعلانات المطبوعة.
                </p>
              </div>

              {/* Official Social Media Accounts Section (replaces removed side card badge & top bar license badge) */}
              <SocialAccountsAdminSection
                socialAccounts={settingsForm.socialAccounts}
                onChange={(nextSocial) =>
                  setSettingsForm({
                    ...settingsForm,
                    socialAccounts: nextSocial,
                  })
                }
              />
            </div>

            {/* Editable Marji List Section */}
            <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-2 text-indigo-500 font-bold text-base">
                <span>تعديل قائمة مراجع التقليد في الاستمارة</span>
              </div>
              <p className="text-xs text-slate-400">
                إضافة أو تعديل أسماء مراجع التقليد التي تظهر للحاج عند التسجيل:
              </p>
              
              <div className="space-y-2">
                {settingsForm.marjiList.map((marji, idx) => (
                    <div key={idx} className="flex gap-2">
                        <input
                            type="text"
                            value={marji}
                            onChange={(e) => {
                                const updated = [...settingsForm.marjiList];
                                updated[idx] = e.target.value;
                                setSettingsForm({...settingsForm, marjiList: updated});
                            }}
                            className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                const updated = settingsForm.marjiList.filter((_, i) => i !== idx);
                                setSettingsForm({...settingsForm, marjiList: updated});
                            }}
                            className="p-2 bg-red-500/10 text-red-500 rounded-xl"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => {
                        setSettingsForm({...settingsForm, marjiList: [...settingsForm.marjiList, '']});
                    }}
                    className="w-full py-2 bg-indigo-500/10 text-indigo-500 rounded-xl text-xs font-bold"
                >
                    + إضافة مرجع جديد
                </button>
              </div>
            </div>

            {/* Approved Banks Management Section */}
            <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2 text-emerald-500 font-bold text-base">
                    <Building2 className="w-5 h-5" />
                    <span>إدارة قائمة البنوك المعتمدة في استمارة التسجيل</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    إضافة أو تعديل أو إخفاء أو حذف أسماء البنوك التي تظهر للحاج في القائمة المنسدلة عند التسجيل:
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const cleanBanks = (settingsForm.approvedBanks || [])
                      .map((b) => ({ ...b, name: b.name.trim() }))
                      .filter((b) => b.name.length > 0);
                    const nextSettings: CampaignSettings = {
                      ...campaignSettings,
                      ...settingsForm,
                      approvedBanks: cleanBanks,
                      youtubeConfig: campaignSettings.youtubeConfig || settingsForm.youtubeConfig,
                      advisorConfig: campaignSettings.advisorConfig || settingsForm.advisorConfig,
                    };
                    setSettingsForm(nextSettings);
                    const ok = await onUpdateCampaignSettings(nextSettings);
                    if (ok !== false) {
                      setBankSavedNotice(true);
                      setTimeout(() => setBankSavedNotice(false), 3500);
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>حفظ قائمة البنوك فوراً</span>
                </button>
              </div>

              {bankSavedNotice && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 rounded-xl px-4 py-2.5 text-xs font-bold flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>تم حفظ وتحديث قائمة البنوك المعتمدة في استمارة التسجيل بنجاح!</span>
                </div>
              )}

              {/* Add New Bank Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBankNameInput}
                  onChange={(e) => setNewBankNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const trimmed = newBankNameInput.trim();
                      if (!trimmed) return;
                      const currentBanks = settingsForm.approvedBanks || [];
                      if (currentBanks.some((b) => b.name.trim() === trimmed)) return;
                      setSettingsForm({
                        ...settingsForm,
                        approvedBanks: [
                          ...currentBanks,
                          { id: `bank-${Date.now()}`, name: trimmed, isActive: true },
                        ],
                      });
                      setNewBankNameInput('');
                    }
                  }}
                  placeholder="أدخل اسم البنك المراد إضافته (مثال: البنك العربي الوطني)"
                  className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white font-bold"
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = newBankNameInput.trim();
                    if (!trimmed) return;
                    const currentBanks = settingsForm.approvedBanks || [];
                    if (currentBanks.some((b) => b.name.trim() === trimmed)) return;
                    setSettingsForm({
                      ...settingsForm,
                      approvedBanks: [
                        ...currentBanks,
                        { id: `bank-${Date.now()}`, name: trimmed, isActive: true },
                      ],
                    });
                    setNewBankNameInput('');
                  }}
                  className="px-4 py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة بنك</span>
                </button>
              </div>

              {/* Existing Banks List */}
              <div className="space-y-2">
                {(settingsForm.approvedBanks || []).map((bank, idx) => (
                  <div
                    key={bank.id || idx}
                    className={`flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 rounded-xl border transition ${
                      bank.isActive !== false
                        ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                        : 'bg-slate-100/70 dark:bg-slate-950/60 border-slate-200/70 dark:border-slate-800 opacity-75'
                    }`}
                  >
                    <input
                      type="text"
                      value={bank.name}
                      onChange={(e) => {
                        const updated = [...(settingsForm.approvedBanks || [])];
                        updated[idx] = { ...bank, name: e.target.value };
                        setSettingsForm({ ...settingsForm, approvedBanks: updated });
                      }}
                      className="flex-1 min-w-[180px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...(settingsForm.approvedBanks || [])];
                        updated[idx] = { ...bank, isActive: bank.isActive === false };
                        setSettingsForm({ ...settingsForm, approvedBanks: updated });
                      }}
                      className={`px-3 py-2 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                        bank.isActive !== false
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                      }`}
                      title={bank.isActive !== false ? 'إخفاء من الاستمارة' : 'إظهار في الاستمارة'}
                    >
                      {bank.isActive !== false ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>مفعل</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>مخفي</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = (settingsForm.approvedBanks || []).filter((_, i) => i !== idx);
                        setSettingsForm({ ...settingsForm, approvedBanks: updated });
                      }}
                      className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl transition cursor-pointer shrink-0"
                      title="حذف البنك"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Visitor Counter Reset Section (General Manager / Admin only) */}
            <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                    <Users className="w-4 h-4" />
                    <span>تصفير عداد الزوار (إحصائيات الإطلاق الرسمي)</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    إعادة ضبط عداد إجمالي الزوار إلى الصفر (0) وإزالة إحصائيات فترة التجربة قبل الإطلاق الرسمي.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm('هل أنت متأكد من رغبتك في تصفير عداد إجمالي الزوار إلى الصفر (0)؟')) {
                      await resetVisitorStats();
                      alert('تم تصفير عداد الزوار بنجاح إلى الصفر!');
                      if (onRefreshData) await onRefreshData();
                    }
                  }}
                  className="px-4 py-2.5 bg-red-500/15 hover:bg-red-500/25 text-red-600 dark:text-red-400 border border-red-500/30 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>تصفير عداد الزوار</span>
                </button>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-4 rounded-2xl text-base shadow-xl flex items-center justify-center gap-3 transition active:scale-95"
              >
                <CheckCircle2 className="w-6 h-6" />
                <span>حفظ ونشر التعديلات فوراً في الموقع</span>
              </button>
            </div>
          </form>

          <div className="pt-4">
            <GroupLocationsManager
              campaignSettings={campaignSettings}
              pilgrims={pilgrims}
              busOptions={BUS_OPTIONS}
              adminName={currentAdminUser?.fullName}
              onSaveGroupLocations={async (nextLocations) => {
                const ok = await onUpdateCampaignSettings({
                  ...campaignSettings,
                  groupLocations: nextLocations,
                });
                return ok !== false;
              }}
            />
          </div>
          </div>
        </div>
      )}

      {/* TAB 6: FEEDBACK & RATINGS */}
      {activeTab === 'feedback' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <span className="text-xs text-slate-400 block">إجمالي التقييمات</span>
              <div className="text-3xl font-black text-amber-500">{feedback.length}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <span className="text-xs text-slate-400 block">متوسط التقييم العام</span>
              <div className="flex items-center gap-2">
                <div className="text-3xl font-black text-emerald-500">
                  {feedback.length > 0 
                    ? (feedback.reduce((acc, curr) => acc + curr.rating, 0) / feedback.length).toFixed(1) 
                    : '0.0'}
                </div>
                <Star className="w-6 h-6 text-amber-500 fill-amber-500" />
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2 sm:col-span-2">
              <span className="text-xs text-slate-400 block mb-2">أبرز مجالات التميز / التحسين (بالتصنيف)</span>
              <div className="flex flex-wrap gap-2">
                {['عام', 'التنظيم', 'السكن', 'الإعاشة', 'الإرشاد الديني', 'المواصلات'].map(cat => {
                  const count = feedback.filter(f => f.category === cat).length;
                  if (count === 0) return null;
                  return (
                    <span key={cat} className="bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300">
                      {cat}: {count}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
            {/* عرض البطاقات الكاملة للجوال لضمان ظهور كامل التعليق والملاحظة بوضوح تام */}
            <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800">
              {feedback.map((f) => {
                const formattedDate =
                  typeof f.createdAt === 'string'
                    ? f.createdAt
                    : typeof (f.createdAt as any)?.toDate === 'function'
                    ? (f.createdAt as any).toDate().toLocaleDateString('ar-SA')
                    : typeof (f.createdAt as any)?.seconds === 'number'
                    ? new Date((f.createdAt as any).seconds * 1000).toLocaleDateString('ar-SA')
                    : '—';

                return (
                  <div key={f.id} className="p-5 space-y-3 text-right">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white text-sm">
                          {f.pilgrimName || 'حاج مسجل'}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono" dir="ltr">
                          {f.pilgrimId}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-lg text-xs font-bold">
                          {f.category}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono" dir="ltr">
                          {formattedDate}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-4 h-4 ${
                            star <= f.rating ? 'text-amber-500 fill-amber-500' : 'text-slate-200 dark:text-slate-800'
                          }`}
                        />
                      ))}
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5">
                      <span className="block text-[11px] font-bold text-amber-600 dark:text-amber-400 mb-1">
                        الملاحظات والاقتراحات الكاملة:
                      </span>
                      <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
                        {f.comment || 'لا توجد ملاحظات مكتوبة'}
                      </p>
                    </div>
                  </div>
                );
              })}
              {feedback.length === 0 && (
                <div className="px-6 py-12 text-center text-slate-400 text-sm">
                  لا توجد تقييمات مقدمة حتى الآن
                </div>
              )}
            </div>

            {/* عرض الجدول الكامل للشاشات الكبيرة بدون أي اقتصاص للتعليق */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-right text-slate-500 dark:text-slate-400">
                <thead className="bg-slate-50 dark:bg-slate-950 text-xs uppercase text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4 whitespace-nowrap">اسم الحاج</th>
                    <th className="px-6 py-4 whitespace-nowrap">التصنيف</th>
                    <th className="px-6 py-4 whitespace-nowrap">التقييم</th>
                    <th className="px-6 py-4 min-w-[340px]">الملاحظات والاقتراحات</th>
                    <th className="px-6 py-4 whitespace-nowrap">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {feedback.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition align-top">
                      <td className="px-6 py-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {f.pilgrimName || 'حاج مسجل'}
                        <div className="text-[10px] text-slate-400 font-mono" dir="ltr">{f.pilgrimId}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-lg text-xs font-bold">
                          {f.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star 
                              key={star} 
                              className={`w-3.5 h-3.5 ${star <= f.rating ? 'text-amber-500 fill-amber-500' : 'text-slate-200 dark:text-slate-800'}`} 
                            />
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 min-w-[340px]">
                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
                          {f.comment || 'لا توجد ملاحظات مكتوبة'}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-[10px] text-slate-400 whitespace-nowrap">
                         {typeof f.createdAt === 'string'
                            ? f.createdAt
                            : typeof (f.createdAt as any)?.toDate === 'function'
                            ? (f.createdAt as any).toDate().toLocaleDateString('ar-SA')
                            : typeof (f.createdAt as any)?.seconds === 'number'
                            ? new Date((f.createdAt as any).seconds * 1000).toLocaleDateString('ar-SA')
                            : '—'}
                      </td>
                    </tr>
                  ))}
                  {feedback.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                        لا توجد تقييمات مقدمة حتى الآن
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: ACTIVITY & AUDIT LOG (سجل الرقابة والأمان — حصري للمالك الرئيسي فقط) */}
      {activeTab === 'activityLog' && canManageStaffAndRoles && (
        <ActivityLogPanel
          adminUsers={adminUsers}
          currentAdminUser={currentAdminUser}
          onTodayCountChange={(count) => setTodayActivityLogsCount(count)}
          onOpenPdfReport={(payload) => setOfficialReportModal(payload)}
        />
      )}

      {/* MODAL 1: EDIT PILGRIM (FULL APPLICATION & DATA EDITOR) */}

      {editingPilgrim && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-8 max-w-4xl w-full max-h-[92vh] overflow-y-auto space-y-6 text-right shadow-2xl my-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 sticky top-0 bg-white dark:bg-slate-900 z-10 pt-1">
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  {isAddingNewPilgrim
                    ? 'إضافة حاج جديد يدوياً (صلاحية استثناء الإدارة - Admin Override)'
                    : `تعديل طلب وبيانات الحاج: ${editingPilgrim.firstName} ${editingPilgrim.secondName} ${editingPilgrim.lastName}`}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  يمكنك تسكين الحاج في أي باقة حتى بعد اكتمال العدد أو انتهاء تاريخ التسجيل، وتعديل كافة بياناته
                </p>
              </div>
              <button
                onClick={() => {
                  setIsAddingNewPilgrim(false);
                  setEditingPilgrim(null);
                }}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
                title="إغلاق"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6 text-sm">
              {/* SECTION 1: PACKAGE, STATUS & TRIP DETAILS */}
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 sm:p-5 space-y-4">
                <h4 className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  <span>1. حالة الطلب والباقة والرحلة والتسكين</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">حالة التسجيل</label>
                    <select
                      value={editingPilgrim.status}
                      onChange={(e) => {
                        const nextStatus = e.target.value as Pilgrim['status'];
                        setEditingPilgrim({
                          ...editingPilgrim,
                          status: nextStatus,
                        });
                      }}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white font-bold focus:outline-none focus:border-amber-500"
                    >
                      <option value="قيد المراجعة">قيد المراجعة</option>
                      <option value="مقبول ومؤكد">مقبول ومؤكد</option>
                      <option value="مكتمل الدفع">مكتمل الدفع</option>
                      <option value="معتذر">معتذر</option>
                      <option value="مرفوض">مرفوض</option>
                    </select>
                  </div>

                  <div className="sm:col-span-1 lg:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      الباقة المختارة (متاح للمشرف التسكين حتى بعد اكتمال العدد)
                    </label>
                    <select
                      value={editingPilgrim.selectedPackage || ''}
                      onChange={(e) => {
                        const selectedTitle = e.target.value;
                        const matchedPkg = packages.find(pkg => pkg.title === selectedTitle);
                        const isAirPkg =
                          selectedTitle.includes('طيران') ||
                          matchedPkg?.transport === 'طائرة' ||
                          (matchedPkg?.transport || '').includes('طيران');
                        const nextTransport = selectedTitle
                          ? isAirPkg
                            ? 'طائرة'
                            : 'باص'
                          : editingPilgrim.transport || 'باص';
                        setEditModalBusError(null);
                        setEditingPilgrim({
                          ...editingPilgrim,
                          selectedPackage: selectedTitle,
                          transport: nextTransport,
                          totalPackagePrice: matchedPkg?.price || editingPilgrim.totalPackagePrice,
                          ...(nextTransport === 'طائرة'
                            ? { busNumber: '', busSeat: '' }
                            : { flightNumberOutbound: '', flightNumberReturn: '', flightTicketNumber: '' }),
                        });
                      }}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white font-bold focus:outline-none focus:border-amber-500"
                    >
                      <option value="">التسجيل العام (بدون باقة محددة)</option>
                      {packages.map((pkg) => {
                        const st = evaluatePackageStatus(
                          pkg,
                          pilgrims,
                          new Date(),
                          editingPilgrim.id
                        );
                        const seatText =
                          st.maxCapacity !== null
                            ? `${st.registeredCount}/${st.maxCapacity}`
                            : `${st.registeredCount}`;
                        return (
                          <option key={pkg.id} value={pkg.title}>
                            {pkg.title} — ({pkg.price}) — [المسجلين: {seatText} · {st.adminPrimaryStatus.label}]
                          </option>
                        );
                      })}
                      {editingPilgrim.selectedPackage &&
                        !packages.some((pkg) => pkg.title === editingPilgrim.selectedPackage) && (
                          <option value={editingPilgrim.selectedPackage}>
                            {editingPilgrim.selectedPackage}
                          </option>
                        )}
                    </select>

                    {/* ADMIN OVERRIDE WARNING BANNER WHEN PACKAGE IS FULL / EXPIRED / CLOSED */}
                    {(() => {
                      const chosenPkg = packages.find(
                        (p) => p.title === editingPilgrim.selectedPackage
                      );
                      if (!chosenPkg) return null;
                      const st = evaluatePackageStatus(
                        chosenPkg,
                        pilgrims,
                        new Date(),
                        editingPilgrim.id
                      );
                      if (!st.adminOverrideWarning) return null;
                      return (
                        <div className="mt-2.5 bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300 font-bold">
                          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <span>{st.adminOverrideWarning}</span>
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      وسيلة المواصلات (تتحكم في ظهور الحاج بالطيران أو الباصات)
                    </label>
                    <select
                      value={isPilgrimAirTravel(editingPilgrim) ? 'طائرة' : 'باص'}
                      onChange={(e) => {
                        const nextTransport = e.target.value;
                        setEditModalBusError(null);
                        if (nextTransport === 'طائرة') {
                          const airPkg = packages.find(
                            (pkg) => pkg.title.includes('طيران') || pkg.transport === 'طائرة'
                          );
                          const currentPkgIsBus =
                            Boolean(editingPilgrim.selectedPackage) &&
                            !editingPilgrim.selectedPackage!.includes('طيران');
                          setEditingPilgrim({
                            ...editingPilgrim,
                            transport: 'طائرة',
                            selectedPackage:
                              currentPkgIsBus && airPkg ? airPkg.title : editingPilgrim.selectedPackage,
                            totalPackagePrice:
                              currentPkgIsBus && airPkg ? airPkg.price : editingPilgrim.totalPackagePrice,
                            busNumber: '',
                            busSeat: '',
                          });
                        } else {
                          const busPkg = packages.find(
                            (pkg) => !pkg.title.includes('طيران') && pkg.transport !== 'طائرة'
                          );
                          const currentPkgIsAir = (editingPilgrim.selectedPackage || '').includes('طيران');
                          setEditingPilgrim({
                            ...editingPilgrim,
                            transport: 'باص',
                            selectedPackage: currentPkgIsAir
                              ? busPkg?.title || ''
                              : editingPilgrim.selectedPackage,
                            totalPackagePrice:
                              currentPkgIsAir && busPkg ? busPkg.price : editingPilgrim.totalPackagePrice,
                            flightNumberOutbound: '',
                            flightNumberReturn: '',
                            flightTicketNumber: '',
                          });
                        }
                      }}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-bold focus:outline-none focus:border-amber-500"
                    >
                      <option value="باص">باص (يُدرج في كشف رحلات الحافلات فقط)</option>
                      <option value="طائرة">طائرة (يُدرج في كشف رحلات الطيران فقط)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">نوع الحج / النسك</label>
                    <select
                      value={editingPilgrim.hajjType || 'تمتع'}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, hajjType: e.target.value })}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="تمتع">تمتع</option>
                      <option value="مستحب">مستحب</option>
                      <option value="قِران">قِران</option>
                      <option value="إفراد">إفراد</option>
                      <option value="عمرة">عمرة</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">الرقم المرجعي للطلب</label>
                    <input
                      type="text"
                      value={editingPilgrim.registrationReference || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, registrationReference: e.target.value })}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      رقم غرفة سكن مكة المكرمة
                    </label>
                    <input
                      type="text"
                      value={editingPilgrim.roomNumberMakkah || editingPilgrim.roomNumber || ''}
                      onChange={(e) => setEditingPilgrim({
                        ...editingPilgrim,
                        roomNumberMakkah: e.target.value,
                        roomNumber: e.target.value
                      })}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                      placeholder="مثال: غرفة 304 - برج مكة"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      رقم غرفة السكن بالمدينة المنورة
                    </label>
                    <input
                      type="text"
                      value={editingPilgrim.roomNumberMadinah || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, roomNumberMadinah: e.target.value })}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                      placeholder="مثال: غرفة 102 - فندق أنوار المدينة"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      تسكين منى (المخيم / المقعد)
                    </label>
                    <input
                      type="text"
                      value={editingPilgrim.roomNumberMina || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, roomNumberMina: e.target.value })}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                      placeholder="مثال: مخيم 4 - صالة أ - مقعد 12"
                    />
                  </div>

                  {!isPilgrimAirTravel(editingPilgrim) ? (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            رقم الباص / الحافلة (الحد الأقصى {MAX_BUS_CAPACITY} راكب)
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const newBus = handleAddNewBus();
                              setEditModalBusError(null);
                              setEditingPilgrim({ ...editingPilgrim, busNumber: newBus });
                            }}
                            className="text-[11px] font-bold text-sky-500 hover:underline flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            <span>+ إضافة حافلة جديدة ({getNextBusName()})</span>
                          </button>
                        </div>
                        <select
                          value={editingPilgrim.busNumber || ''}
                          onChange={(e) => {
                            const chosenBus = e.target.value;
                            if (chosenBus) {
                              const countInChosenBus = getBusPassengersCount(chosenBus, editingPilgrim.id);
                              if (countInChosenBus >= MAX_BUS_CAPACITY) {
                                setEditModalBusError(
                                  `تنبيه: العدد أكبر من المقاعد! (${chosenBus}) مكتملة العدد (${MAX_BUS_CAPACITY}/${MAX_BUS_CAPACITY} راكب). لا يمكن إضافة أكثر من 49 راكباً في الحافلة الواحدة.`
                                );
                                return;
                              }
                            }
                            setEditModalBusError(null);
                            setEditingPilgrim({ ...editingPilgrim, busNumber: chosenBus });
                          }}
                          className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-bold focus:outline-none focus:border-sky-500"
                        >
                          <option value="">غير مخصص بعد</option>
                          {BUS_OPTIONS.map((busOpt) => {
                            const countExcl = getBusPassengersCount(busOpt, editingPilgrim.id);
                            const isFull = countExcl >= MAX_BUS_CAPACITY;
                            return (
                              <option key={busOpt} value={busOpt}>
                                {busOpt} — ({countExcl} / {MAX_BUS_CAPACITY} راكب){isFull ? ' [مكتملة العدد]' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">
                          رقم المقعد في الباص (من 1 إلى {MAX_BUS_CAPACITY})
                        </label>
                        <select
                          value={editingPilgrim.busSeat || ''}
                          onChange={(e) => {
                            const nextSeat = e.target.value;
                            setEditModalBusError(null);
                            setEditingPilgrim({ ...editingPilgrim, busSeat: nextSeat });
                          }}
                          className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-bold font-mono focus:outline-none focus:border-amber-500"
                        >
                          <option value="">غير محدد</option>
                          {Array.from({ length: MAX_BUS_CAPACITY }, (_, i) => String(i + 1)).map((seatNo) => {
                            const chosenBus = (editingPilgrim.busNumber || '').trim();
                            const holder = chosenBus
                              ? busPilgrimsList.find(
                                  p =>
                                    p.id !== editingPilgrim.id &&
                                    (p.busNumber || '').trim() === chosenBus &&
                                    (p.busSeat || '').trim() === seatNo
                                )
                              : undefined;
                            return (
                              <option key={seatNo} value={seatNo}>
                                مقعد {seatNo}{holder ? ` (محجوز: ${holder.firstName} ${holder.lastName})` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </>
                  ) : (
                    <div className="sm:col-span-2 bg-sky-500/10 border border-sky-500/30 rounded-2xl p-3.5 flex items-center gap-3 text-xs text-sky-700 dark:text-sky-300">
                      <Plane className="w-5 h-5 text-sky-500 shrink-0" />
                      <div>
                        <strong className="font-black block">هذا الحاج مسجل في (رحلات الطيران) ومعزول عن كشف الباصات</strong>
                        <span className="text-[11px] opacity-90">
                          تم إخفاء حقول الحافلة والمقعد لمنع التداخل. لتحويل الحاج إلى الباصات، قم بتغيير "وسيلة المواصلات" أو "الباقة المختارة" أعلاه إلى باص.
                        </span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">رقم العضوية بالقافلة</label>
                    <input
                      type="text"
                      value={editingPilgrim.membershipNumber || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, membershipNumber: e.target.value })}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono"
                      placeholder="مثال: QAEM-1448-1001"
                      dir="ltr"
                    />
                  </div>

                  {isPilgrimAirTravel(editingPilgrim) ? (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-sky-700 dark:text-sky-400 mb-1">
                          رحلة الطيران — الذهاب
                        </label>
                        <input
                          type="text"
                          value={editingPilgrim.flightNumberOutbound || ''}
                          onChange={(e) => setEditingPilgrim({ ...editingPilgrim, flightNumberOutbound: e.target.value })}
                          className="w-full bg-white dark:bg-slate-950 border border-sky-300 dark:border-sky-700/60 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                          placeholder="مثال: SV 1422 - الدمام 08:30 ص"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-1">
                          رحلة الطيران — العودة
                        </label>
                        <input
                          type="text"
                          value={editingPilgrim.flightNumberReturn || ''}
                          onChange={(e) => setEditingPilgrim({ ...editingPilgrim, flightNumberReturn: e.target.value })}
                          className="w-full bg-white dark:bg-slate-950 border border-indigo-300 dark:border-indigo-700/60 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                          placeholder="مثال: SV 1435 - جدة 09:15 م"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">
                          رقم التذكرة / الحجز PNR
                        </label>
                        <input
                          type="text"
                          value={editingPilgrim.flightTicketNumber || ''}
                          onChange={(e) => setEditingPilgrim({ ...editingPilgrim, flightTicketNumber: e.target.value })}
                          className="w-full bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-700/60 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono"
                          placeholder="مثال: PNR: 8XK92M"
                          dir="ltr"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="sm:col-span-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3.5 flex items-center gap-3 text-xs text-emerald-700 dark:text-emerald-300">
                      <Bus className="w-5 h-5 text-emerald-500 shrink-0" />
                      <div>
                        <strong className="font-black block">هذا الحاج مسجل في (رحلات الحافلات) ومعزول عن كشف الطيران</strong>
                        <span className="text-[11px] opacity-90">
                          لتحويل الحاج إلى رحلات الطيران وتخصيص تذكرة سفر له، قم بتغيير "وسيلة المواصلات" أو "الباقة المختارة" أعلاه إلى طائرة أولاً.
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {editingPilgrim.status === 'مرفوض' && (
                  <div className="bg-red-500/5 border border-red-500/30 rounded-2xl p-4 space-y-2 animate-fadeIn">
                    <label className="block text-xs font-black text-red-600 dark:text-red-400">
                      سبب الرفض *
                    </label>
                    <textarea
                      rows={3}
                      value={editingPilgrim.rejectionReason ?? editingPilgrim.statusNotes ?? ''}
                      onChange={(e) =>
                        setEditingPilgrim({
                          ...editingPilgrim,
                          rejectionReason: e.target.value,
                          statusNotes: e.target.value,
                        })
                      }
                      className="w-full bg-white dark:bg-slate-950 border border-red-300 dark:border-red-500/40 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-red-500 leading-relaxed"
                      placeholder="اكتب سبب رفض تسجيل الحاج هنا (مثال: عدم استيفاء شروط التصريح، نقص الوثائق، اكتمال العدد...)"
                    />
                    <p className="text-[11px] text-red-500/80">
                      سيتم حفظ سبب الرفض وترحيل الحاج إلى كشف المستبعدين مع إظهار السبب عند استعلام الحاج.
                    </p>
                  </div>
                )}

                {editingPilgrim.status === 'معتذر' && (
                  <div className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-4 space-y-2 animate-fadeIn">
                    <label className="block text-xs font-bold text-amber-600 dark:text-amber-400">
                      سبب الاعتذار / ملاحظات (اختياري)
                    </label>
                    <textarea
                      rows={2}
                      value={editingPilgrim.statusNotes ?? ''}
                      onChange={(e) =>
                        setEditingPilgrim({
                          ...editingPilgrim,
                          statusNotes: e.target.value,
                        })
                      }
                      className="w-full bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-500/40 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                      placeholder="ملاحظات حول اعتذار الحاج..."
                    />
                  </div>
                )}
              </div>

              {/* SECTION 2: PERSONAL & NATIONAL ID DETAILS */}
              <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-500" />
                  <span>2. البيانات الشخصية وبيانات الهوية الوطنية</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">الاسم الأول</label>
                    <input
                      type="text"
                      value={editingPilgrim.firstName || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, firstName: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">اسم الأب</label>
                    <input
                      type="text"
                      value={editingPilgrim.secondName || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, secondName: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">اسم الجد</label>
                    <input
                      type="text"
                      value={editingPilgrim.thirdName || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, thirdName: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">اسم العائلة / اللقب</label>
                    <input
                      type="text"
                      value={editingPilgrim.lastName || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, lastName: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">الاسم الكامل بالإنجليزية</label>
                    <input
                      type="text"
                      value={editingPilgrim.englishFullName || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, englishFullName: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono"
                      dir="ltr"
                      placeholder="FULL NAME IN ENGLISH"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">رقم الهوية الوطنية / الإقامة</label>
                    <input
                      type="text"
                      value={editingPilgrim.nationalId || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, nationalId: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">الجنس</label>
                    <select
                      value={editingPilgrim.gender || 'ذكر'}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, gender: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                    >
                      <option value="ذكر">ذكر</option>
                      <option value="أنثى">أنثى</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">الجنسية</label>
                    <input
                      type="text"
                      value={editingPilgrim.nationality || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, nationality: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <DualCalendarDatePicker
                      label="تاريخ الميلاد"
                      theme="auto"
                      value={editingPilgrim.birthDate || ''}
                      hijriValue={editingPilgrim.birthDateHijri || ''}
                      defaultMode="hijri"
                      minHijriYear={1340}
                      maxHijriYear={1450}
                      onChange={(gregorianDate, hijriDate) =>
                        setEditingPilgrim({
                          ...editingPilgrim,
                          birthDate: gregorianDate,
                          birthDateHijri: hijriDate,
                        })
                      }
                    />
                    <DualCalendarDatePicker
                      label="تاريخ إصدار الهوية"
                      theme="auto"
                      value={editingPilgrim.idIssueDate || ''}
                      hijriValue={editingPilgrim.idIssueDateHijri || ''}
                      defaultMode="hijri"
                      minHijriYear={1390}
                      maxHijriYear={1460}
                      onChange={(gregorianDate, hijriDate) =>
                        setEditingPilgrim({
                          ...editingPilgrim,
                          idIssueDate: gregorianDate,
                          idIssueDateHijri: hijriDate,
                        })
                      }
                    />
                    <DualCalendarDatePicker
                      label="تاريخ انتهاء الهوية"
                      theme="auto"
                      value={editingPilgrim.idExpiryDate || ''}
                      hijriValue={editingPilgrim.idExpiryDateHijri || ''}
                      defaultMode="hijri"
                      minHijriYear={1435}
                      maxHijriYear={1480}
                      onChange={(gregorianDate, hijriDate) =>
                        setEditingPilgrim({
                          ...editingPilgrim,
                          idExpiryDate: gregorianDate,
                          idExpiryDateHijri: hijriDate,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: CONTACT & BANKING DETAILS */}
              <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-500" />
                  <span>3. بيانات التواصل والحساب البنكي والمالية</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">رقم الجوال</label>
                    <input
                      type="text"
                      value={editingPilgrim.mobile || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, mobile: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">رقم الواتساب</label>
                    <input
                      type="text"
                      value={editingPilgrim.whatsapp || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, whatsapp: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">البريد الإلكتروني</label>
                    <input
                      type="email"
                      value={editingPilgrim.email || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, email: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">اسم البنك المعتمد</label>
                    {(() => {
                      const banksList = (
                        campaignSettings.approvedBanks && campaignSettings.approvedBanks.length > 0
                          ? campaignSettings.approvedBanks
                          : (defaultCampaignSettings.approvedBanks || [])
                      ).filter((b) => b.isActive !== false);
                      const currentVal = editingPilgrim.bankName || '';
                      const hasCurrentInList = !currentVal || banksList.some((b) => b.name === currentVal);
                      return (
                        <select
                          value={currentVal}
                          onChange={(e) => setEditingPilgrim({ ...editingPilgrim, bankName: e.target.value })}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                        >
                          <option value="">— اختر البنك —</option>
                          {!hasCurrentInList && (
                            <option value={currentVal}>{currentVal}</option>
                          )}
                          {banksList.map((b) => (
                            <option key={b.id} value={b.name}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">اسم صاحب الحساب البنكي</label>
                    <input
                      type="text"
                      value={editingPilgrim.bankAccountName || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, bankAccountName: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">رقم الآيبان (IBAN)</label>
                    <input
                      type="text"
                      value={editingPilgrim.iban || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, iban: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono"
                      dir="ltr"
                      placeholder="SA0335000000012345678901"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">إجمالي سعر الباقة</label>
                    <input
                      type="text"
                      value={editingPilgrim.totalPackagePrice || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, totalPackagePrice: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                      placeholder="مثال: 12,500 ريال"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">إجمالي المبلغ المسدد</label>
                    <input
                      type="text"
                      value={editingPilgrim.paidAmount || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, paidAmount: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                      placeholder="مثال: 6,000 ريال"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">المبلغ المتبقي</label>
                    <input
                      type="text"
                      value={editingPilgrim.remainingAmount || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, remainingAmount: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                      placeholder="مثال: 6,500 ريال"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: FIQH & HEALTH DETAILS */}
              <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-purple-500" />
                  <span>4. البيانات الفقهية والصحية وطلبات السكن والمرافقين</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">مرجع التقليد الحالي</label>
                    <input
                      type="text"
                      value={editingPilgrim.currentMarji || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, currentMarji: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                      placeholder="مثال: السيد السيستاني"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">مرجع التقليد السابق</label>
                    <input
                      type="text"
                      value={editingPilgrim.previousMarji || ''}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, previousMarji: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">سنة آخر حجة (هجري)</label>
                    {(() => {
                      const activeYrNum = parseInt(String(currentSeasonYear).replace(/[^\d]/g, ''), 10) || 1448;
                      const hijriYears = Array.from({ length: 40 }, (_, i) => String(activeYrNum - 1 - i));
                      const val = editingPilgrim.lastHajjYear || '';
                      const isLegacyCustom = Boolean(val) && val !== 'لا أتذكر' && !hijriYears.includes(val);
                      return (
                        <select
                          value={val}
                          onChange={(e) => setEditingPilgrim({ ...editingPilgrim, lastHajjYear: e.target.value })}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                        >
                          <option value="">— غير محدد —</option>
                          <option value="لا أتذكر">لا أتذكر</option>
                          {isLegacyCustom && <option value={val}>{val}</option>}
                          {hijriYears.map((yr) => (
                            <option key={yr} value={yr}>
                              {yr} هـ
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">القدرة على الحركة دون مساعدة</label>
                    <select
                      value={editingPilgrim.mobilityIndependence || 'نعم'}
                      onChange={(e) => setEditingPilgrim({ ...editingPilgrim, mobilityIndependence: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                    >
                      <option value="نعم">نعم (قادر على المشي والحركة)</option>
                      <option value="لا">لا (يحتاج كرسي متحرك أو مساعدة)</option>
                    </select>
                  </div>
                </div>

                {/* Madinah Private Room Request Editor */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-amber-600 dark:text-amber-400">
                    <input
                      type="checkbox"
                      checked={Boolean(editingPilgrim.madinahPrivateRoomRequested)}
                      onChange={(e) =>
                        setEditingPilgrim({
                          ...editingPilgrim,
                          madinahPrivateRoomRequested: e.target.checked,
                          madinahPrivateRoomNote: e.target.checked ? editingPilgrim.madinahPrivateRoomNote || '' : '',
                        })
                      }
                      className="w-4 h-4 accent-amber-500 rounded"
                    />
                    <span>طلب غرفة خاصة في المدينة المنورة (اختياري)</span>
                  </label>
                  {editingPilgrim.madinahPrivateRoomRequested && (
                    <input
                      type="text"
                      value={editingPilgrim.madinahPrivateRoomNote || ''}
                      onChange={(e) =>
                        setEditingPilgrim({ ...editingPilgrim, madinahPrivateRoomNote: e.target.value })
                      }
                      placeholder="ملاحظة طلب الغرفة الخاصة بالمدينة المنورة..."
                      className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700/60 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white"
                    />
                  )}
                </div>

                {/* Companions / Mahram Editor (Up to 10) */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      <input
                        type="checkbox"
                        checked={Boolean(editingPilgrim.hasMahram)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const existing = editingPilgrim.mahramDetails || [];
                          setEditingPilgrim({
                            ...editingPilgrim,
                            hasMahram: checked,
                            mahramDetails: checked
                              ? (existing.length > 0 ? existing : [{ name: '', nationalId: '', relation: '' }])
                              : [],
                          });
                        }}
                        className="w-4 h-4 accent-indigo-500 rounded"
                      />
                      <span>لديه محرم / مرافقون مسجلون معه ({(editingPilgrim.mahramDetails || []).length} / 10)</span>
                    </label>
                    {editingPilgrim.hasMahram && (editingPilgrim.mahramDetails || []).length < 10 && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingPilgrim({
                            ...editingPilgrim,
                            mahramDetails: [
                              ...(editingPilgrim.mahramDetails || []),
                              { name: '', nationalId: '', relation: '' },
                            ],
                          })
                        }
                        className="px-3 py-1.5 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة مرافق ({(editingPilgrim.mahramDetails || []).length}/10)</span>
                      </button>
                    )}
                  </div>

                  {editingPilgrim.hasMahram && (
                    <div className="space-y-2">
                      {(editingPilgrim.mahramDetails || []).map((comp, cIdx) => (
                        <div
                          key={cIdx}
                          className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800"
                        >
                          <div className="sm:col-span-5">
                            <input
                              type="text"
                              value={comp.name || ''}
                              onChange={(e) => {
                                const next = [...(editingPilgrim.mahramDetails || [])];
                                next[cIdx] = { ...comp, name: e.target.value };
                                setEditingPilgrim({ ...editingPilgrim, mahramDetails: next });
                              }}
                              placeholder={`اسم المرافق (${cIdx + 1})`}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <input
                              type="text"
                              value={comp.nationalId || ''}
                              onChange={(e) => {
                                const next = [...(editingPilgrim.mahramDetails || [])];
                                next[cIdx] = { ...comp, nationalId: e.target.value };
                                setEditingPilgrim({ ...editingPilgrim, mahramDetails: next });
                              }}
                              placeholder="رقم الهوية"
                              dir="ltr"
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white font-mono"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <input
                              type="text"
                              value={comp.relation || ''}
                              onChange={(e) => {
                                const next = [...(editingPilgrim.mahramDetails || [])];
                                next[cIdx] = { ...comp, relation: e.target.value };
                                setEditingPilgrim({ ...editingPilgrim, mahramDetails: next });
                              }}
                              placeholder="صلة القرابة"
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                            />
                          </div>
                          <div className="sm:col-span-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                const next = (editingPilgrim.mahramDetails || []).filter((_, i) => i !== cIdx);
                                setEditingPilgrim({
                                  ...editingPilgrim,
                                  mahramDetails: next,
                                  hasMahram: next.length > 0,
                                });
                              }}
                              className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg cursor-pointer"
                              title="حذف المرافق"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Health Conditions & Medical Care Editor inside Pilgrim Modal */}
                <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-rose-500 font-black text-xs">
                    <HeartPulse className="w-4 h-4" />
                    <span>البيانات الصحية والاحتياجات الطبية الخاصة بالحاج:</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                      الأمراض المزمنة المسجلة:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {['الضغط', 'السكري', 'أمراض القلب', 'تكسر الدم', 'فقر الدم', 'صعوبة في الحركة'].map((cond) => {
                        const checked = (editingPilgrim.healthConditions || []).includes(cond);
                        return (
                          <label
                            key={cond}
                            className="flex items-center gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const current = (editingPilgrim.healthConditions || []).filter(
                                  (c) => c !== 'لا شيء مما ذكر'
                                );
                                const next = e.target.checked
                                  ? [...current, cond]
                                  : current.filter((c) => c !== cond);
                                setEditingPilgrim({
                                  ...editingPilgrim,
                                  healthConditions: next,
                                });
                              }}
                              className="w-4 h-4 accent-rose-600 rounded"
                            />
                            <span>{cond}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      أمراض أو ملاحظات صحية أخرى (اختياري):
                    </label>
                    <input
                      type="text"
                      value={editingPilgrim.otherHealthCondition || ''}
                      onChange={(e) =>
                        setEditingPilgrim({ ...editingPilgrim, otherHealthCondition: e.target.value })
                      }
                      placeholder="مثال: حساسية صدر، ربو، أدوية خاصة..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingPilgrim.needsAssistance)}
                        onChange={(e) =>
                          setEditingPilgrim({
                            ...editingPilgrim,
                            needsAssistance: e.target.checked,
                            mobilityIndependence: e.target.checked ? 'لا' : editingPilgrim.mobilityIndependence,
                          })
                        }
                        className="w-4 h-4 accent-amber-500 rounded"
                      />
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        يحتاج وسيلة مساعدة للحركة (كرسي متحرك)
                      </span>
                    </label>

                    <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingPilgrim.hasBackPain)}
                        onChange={(e) =>
                          setEditingPilgrim({ ...editingPilgrim, hasBackPain: e.target.checked })
                        }
                        className="w-4 h-4 accent-amber-500 rounded"
                      />
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        يشكو من آلام بالظهر أو صعوبة بالحركة
                      </span>
                    </label>

                    <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingPilgrim.hasSpeechDifficulty)}
                        onChange={(e) =>
                          setEditingPilgrim({ ...editingPilgrim, hasSpeechDifficulty: e.target.checked })
                        }
                        className="w-4 h-4 accent-purple-500 rounded"
                      />
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        لديه صعوبة في نطق بعض الحروف
                      </span>
                    </label>

                    {editingPilgrim.gender === 'أنثى' && (
                      <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(editingPilgrim.isPregnant)}
                          onChange={(e) =>
                            setEditingPilgrim({ ...editingPilgrim, isPregnant: e.target.checked })
                          }
                          className="w-4 h-4 accent-pink-500 rounded"
                        />
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          يوجد حمل (للنساء)
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* القسم 5: بيانات الاستمارة الديناميكية المخصصة (يظهر فقط للحجاج المسجلين عبر استمارة ديناميكية) */}
              {(() => {
                const dynamicEntries = getPilgrimCustomFieldEntries(editingPilgrim);
                if (dynamicEntries.length === 0) return null;

                const updateCustomField = (fieldKey: string, nextVal: any) => {
                  setEditingPilgrim({
                    ...editingPilgrim,
                    customFields: {
                      ...(editingPilgrim.customFields || {}),
                      [fieldKey]: nextVal,
                    },
                  });
                };

                return (
                  <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-emerald-200/70 dark:border-emerald-800/50">
                      <h4 className="text-xs font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[11px] font-black">5</span>
                        <span>بيانات الاستمارة الديناميكية المخصصة</span>
                      </h4>
                      {editingPilgrim.formTemplateName && (
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                          {editingPilgrim.formTemplateName}
                          {editingPilgrim.formVersion ? ` (v${editingPilgrim.formVersion})` : ''}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                      {dynamicEntries.map((entry) => {
                        const rawVal = editingPilgrim.customFields?.[entry.key];

                        if (entry.type === 'boolean') {
                          return (
                            <label
                              key={entry.key}
                              className="flex items-center gap-2.5 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(rawVal)}
                                onChange={(e) => updateCustomField(entry.key, e.target.checked)}
                                className="w-4 h-4 accent-emerald-500 rounded"
                              />
                              <span className="font-bold text-slate-800 dark:text-slate-200">
                                {entry.label}
                              </span>
                            </label>
                          );
                        }

                        if (entry.type === 'file') {
                          const fileUrl = typeof rawVal === 'string' ? rawVal : '';
                          return (
                            <div
                              key={entry.key}
                              className="sm:col-span-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <label className="font-bold text-slate-700 dark:text-slate-300">
                                  {entry.label}
                                </label>
                                {fileUrl && (
                                  <a
                                    href={fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>عرض / حفظ المرفق</span>
                                  </a>
                                )}
                              </div>
                              <input
                                type="text"
                                dir="ltr"
                                value={fileUrl}
                                onChange={(e) => updateCustomField(entry.key, e.target.value)}
                                placeholder="رابط المرفق..."
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-slate-900 dark:text-white font-mono text-[11px]"
                              />
                            </div>
                          );
                        }

                        if (entry.type === 'checkbox_group') {
                          const strVal = Array.isArray(rawVal) ? rawVal.join('، ') : String(rawVal || '');
                          return (
                            <div key={entry.key} className="sm:col-span-2">
                              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {entry.label} <span className="text-[10px] text-slate-400">(مفصولة بفاصلة)</span>
                              </label>
                              <input
                                type="text"
                                value={strVal}
                                onChange={(e) =>
                                  updateCustomField(
                                    entry.key,
                                    e.target.value
                                      .split(/[،,]/)
                                      .map((s) => s.trim())
                                      .filter(Boolean)
                                  )
                                }
                                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white"
                              />
                            </div>
                          );
                        }

                        if (entry.type === 'textarea') {
                          return (
                            <div key={entry.key} className="sm:col-span-2">
                              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {entry.label}
                              </label>
                              <textarea
                                rows={2}
                                value={typeof rawVal === 'string' ? rawVal : entry.displayValue === '-' ? '' : entry.displayValue}
                                onChange={(e) => updateCustomField(entry.key, e.target.value)}
                                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white"
                              />
                            </div>
                          );
                        }

                        if (entry.type === 'dual_date' && rawVal && typeof rawVal === 'object') {
                          return (
                            <div key={entry.key}>
                              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {entry.label}
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  dir="ltr"
                                  placeholder="ميلادي YYYY-MM-DD"
                                  value={rawVal.gregorian || ''}
                                  onChange={(e) =>
                                    updateCustomField(entry.key, {
                                      ...rawVal,
                                      gregorian: e.target.value,
                                    })
                                  }
                                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 text-slate-900 dark:text-white font-mono"
                                />
                                <input
                                  type="text"
                                  dir="ltr"
                                  placeholder="هجري YYYY-MM-DD"
                                  value={rawVal.hijri || ''}
                                  onChange={(e) =>
                                    updateCustomField(entry.key, {
                                      ...rawVal,
                                      hijri: e.target.value,
                                    })
                                  }
                                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 text-slate-900 dark:text-white font-mono"
                                />
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={entry.key}>
                            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                              {entry.label}
                            </label>
                            <input
                              type={entry.type === 'number' ? 'number' : 'text'}
                              dir={entry.type === 'tel' || entry.type === 'email' || entry.type === 'iban' || entry.type === 'number' ? 'ltr' : 'rtl'}
                              value={rawVal !== undefined && rawVal !== null ? String(rawVal) : ''}
                              onChange={(e) => updateCustomField(entry.key, e.target.value)}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {editingPilgrim.nationalIdImage && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-amber-600 dark:text-amber-400">
                      صورة بطاقة الأحوال / الهوية الوطنية المرفقة ({editingPilgrim.nationalId})
                    </label>
                    <a
                      href={editingPilgrim.nationalIdImage}
                      download={`بطاقة-الهوية-${editingPilgrim.nationalId}.jpg`}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>حفظ البطاقة</span>
                    </a>
                  </div>
                  <img
                    src={editingPilgrim.nationalIdImage}
                    alt="صورة بطاقة الأحوال"
                    className="w-full max-h-56 object-contain rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-950/40 p-2"
                  />
                </div>
              )}
            </div>

            {editModalBusError && (
              <div className="bg-red-500/15 border-2 border-red-500 rounded-2xl p-3.5 flex items-center gap-2.5 text-red-600 dark:text-red-300 text-xs font-black animate-fadeIn">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                <span>{editModalBusError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-900 pb-1">
              <button
                onClick={() => {
                  setEditModalBusError(null);
                  setIsAddingNewPilgrim(false);
                  setEditingPilgrim(null);
                }}
                className="px-5 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  if (isAddingNewPilgrim && (!editingPilgrim.firstName.trim() || !editingPilgrim.lastName.trim())) {
                    setEditModalBusError('يرجى إدخال الاسم الأول والعائلة للحاج على الأقل قبل الحفظ.');
                    return;
                  }
                  const isAir = isPilgrimAirTravel(editingPilgrim);
                  const chosenBus = isAir ? '' : (editingPilgrim.busNumber || '').trim();
                  const chosenSeat = isAir ? '' : (editingPilgrim.busSeat || '').trim();
                  if (!isAir && chosenBus) {
                    const countInBus = getBusPassengersCount(chosenBus, editingPilgrim.id);
                    if (countInBus >= MAX_BUS_CAPACITY) {
                      setEditModalBusError(
                        `تنبيه: العدد أكبر من المقاعد! (${chosenBus}) وصلت للحد الأقصى المسموح به وهو ${MAX_BUS_CAPACITY} راكباً في الحافلة الواحدة.`
                      );
                      return;
                    }
                  }
                  if (!isAir && chosenSeat) {
                    const numericSeat = parseInt(chosenSeat.replace(/[^\d]/g, ''), 10);
                    if (!isNaN(numericSeat) && (numericSeat > MAX_BUS_CAPACITY || numericSeat < 1)) {
                      setEditModalBusError(
                        `تنبيه: العدد أكبر من المقاعد! رقم المقعد (${numericSeat}) أكبر من عدد مقاعد الحافلة (${MAX_BUS_CAPACITY} مقعداً).`
                      );
                      return;
                    }
                  }

                  const finalId =
                    isAddingNewPilgrim && editingPilgrim.nationalId.trim()
                      ? `${editingPilgrim.nationalId.trim()}_${currentSeasonYear}`
                      : editingPilgrim.id;

                  const normalizedPilgrim: Pilgrim = {
                    ...editingPilgrim,
                    id: finalId,
                    transport: isAir ? 'طائرة' : 'باص',
                    roomNumberMakkah: (editingPilgrim.roomNumberMakkah || editingPilgrim.roomNumber || '').trim(),
                    roomNumberMadinah: (editingPilgrim.roomNumberMadinah || '').trim(),
                    roomNumberMina: (editingPilgrim.roomNumberMina || '').trim(),
                    roomNumber: (editingPilgrim.roomNumberMakkah || editingPilgrim.roomNumber || '').trim(),
                    busNumber: chosenBus,
                    busSeat: chosenSeat,
                    flightNumberOutbound: isAir ? (editingPilgrim.flightNumberOutbound || '').trim() : '',
                    flightNumberReturn: isAir ? (editingPilgrim.flightNumberReturn || '').trim() : '',
                    flightTicketNumber: isAir ? (editingPilgrim.flightTicketNumber || '').trim() : '',
                    rejectionReason:
                      editingPilgrim.status === 'مرفوض'
                        ? (editingPilgrim.rejectionReason || editingPilgrim.statusNotes || '').trim()
                        : '',
                    statusNotes:
                      editingPilgrim.status === 'مرفوض'
                        ? (editingPilgrim.rejectionReason || editingPilgrim.statusNotes || '').trim()
                        : editingPilgrim.status === 'معتذر'
                        ? (editingPilgrim.statusNotes || '').trim()
                        : editingPilgrim.statusNotes,
                  };
                  setEditModalBusError(null);
                  if (isAddingNewPilgrim && onAddPilgrim) {
                    onAddPilgrim(normalizedPilgrim);
                  } else {
                    onUpdatePilgrim(normalizedPilgrim);
                  }
                  setIsAddingNewPilgrim(false);
                  setEditingPilgrim(null);
                }}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow"
              >
                {isAddingNewPilgrim ? 'إضافة وتسكين الحاج الآن' : 'حفظ كافة التعديلات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD / EDIT ANNOUNCEMENT OR LESSON */}
      {(isNewAnnouncement || editingAnnouncement) && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-8 max-w-2xl w-full space-y-5 text-right shadow-2xl max-h-[90dvh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 sticky top-0 bg-white dark:bg-slate-900 z-10 pt-1">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                {isNewAnnouncement ? 'إضافة إعلان، لقاء أو درس جديد' : 'تعديل الإعلان أو الدرس'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsNewAnnouncement(false);
                  setEditingAnnouncement(null);
                  setAnnMediaError('');
                }}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
                title="إغلاق"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">عنوان الإعلان أو الدرس *</label>
                <input
                  type="text"
                  value={annForm.title}
                  onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white"
                  placeholder="مثال: اللقاء التعريفي الثاني لأحكام الحج"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">التصنيف *</label>
                  <select
                    value={annForm.category}
                    onChange={(e) => setAnnForm({ ...annForm, category: e.target.value as any })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                  >
                    <option value="هام">هام</option>
                    <option value="مواعيد">مواعيد اللقاءات</option>
                    <option value="توجيهات">دروس وتوجيهات</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">التاريخ *</label>
                  <input
                    type="date"
                    value={annForm.date}
                    onChange={(e) => setAnnForm({ ...annForm, date: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* TOPIC EDITOR BOX WITH RICH TOOLBAR (تكبير الخط + إرفاق صورة + إرفاق فيديو) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    محتوى الإعلان أو المقال *
                  </label>
                  <span className="text-[11px] text-amber-500 font-bold">
                    حجم الخط الحالي: {FONT_SIZE_OPTIONS.find((f) => f.value === annForm.fontSize)?.label || 'عادي'}
                  </span>
                </div>

                <div className="border border-slate-300 dark:border-slate-700 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-950">
                  {/* Toolbar */}
                  <div className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-2.5 flex flex-wrap items-center justify-between gap-2">
                    {/* Font Size & Formatting Controls */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 ml-1">
                        <Type className="w-3.5 h-3.5 text-amber-500" />
                        <span>تكبير الخط:</span>
                      </span>

                      {FONT_SIZE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setAnnForm({ ...annForm, fontSize: opt.value })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                            annForm.fontSize === opt.value
                              ? 'bg-amber-500 text-slate-950 shadow-sm'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                          }`}
                          title={`حجم الخط: ${opt.label}`}
                        >
                          {opt.label}
                        </button>
                      ))}

                      <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" />

                      <button
                        type="button"
                        onClick={() => setAnnForm({ ...annForm, isBold: !annForm.isBold })}
                        className={`p-1.5 rounded-lg text-xs font-bold transition border ${
                          annForm.isBold
                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                        title="خط عريض (غامق)"
                      >
                        <Bold className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setAnnForm({
                            ...annForm,
                            textAlign: annForm.textAlign === 'center' ? 'right' : 'center',
                          })
                        }
                        className={`p-1.5 rounded-lg text-xs font-bold transition border ${
                          annForm.textAlign === 'center'
                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                        title={annForm.textAlign === 'center' ? 'محاذاة لليمين' : 'توسيط النص'}
                      >
                        {annForm.textAlign === 'center' ? (
                          <AlignCenter className="w-4 h-4" />
                        ) : (
                          <AlignRight className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Media Attachment Buttons (إرفاق صورة / إرفاق فيديو) */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveAnnToolTab(activeAnnToolTab === 'image' ? 'none' : 'image')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                          activeAnnToolTab === 'image' || annForm.imageUrl
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-emerald-500/50'
                        }`}
                      >
                        <ImageIcon className="w-4 h-4 text-emerald-500" />
                        <span>{annForm.imageUrl ? 'تعديل الصورة المرفقة ✓' : 'إرفاق صورة'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveAnnToolTab(activeAnnToolTab === 'video' ? 'none' : 'video')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                          activeAnnToolTab === 'video' || annForm.videoUrl
                            ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-sky-500/50'
                        }`}
                      >
                        <Video className="w-4 h-4 text-sky-400" />
                        <span>{annForm.videoUrl ? 'تعديل الفيديو المرفق ✓' : 'إرفاق فيديو'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Textarea with live font size, weight, and alignment preview */}
                  <textarea
                    value={annForm.content}
                    onChange={(e) => setAnnForm({ ...annForm, content: e.target.value })}
                    rows={5}
                    className={`w-full bg-transparent px-4 py-3 text-slate-900 dark:text-white focus:outline-none ${getAnnouncementTypographyClasses(
                      annForm
                    )}`}
                    placeholder="اكتب تفاصيل الإعلان أو الدرس أو اللقاء هنا..."
                  />
                </div>
              </div>

              {annMediaError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold p-3 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{annMediaError}</span>
                </div>
              )}

              {/* Image Attachment Panel */}
              {(activeAnnToolTab === 'image' || annForm.imageUrl) && (
                <div className="bg-slate-50 dark:bg-slate-950 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4" />
                      <span>إرفاق صورة للموضوع (رابط سحابي Cloudinary أو رابط خارجي مباشر)</span>
                    </span>
                    {annForm.imageUrl && (
                      <button
                        type="button"
                        onClick={() => setAnnForm({ ...annForm, imageUrl: '' })}
                        className="text-xs text-red-400 hover:text-red-300 font-bold flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف الصورة</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <label className="flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-dashed border-emerald-500/40 text-emerald-400 font-bold py-2.5 px-3 rounded-xl cursor-pointer transition text-xs">
                      <UploadCloud className="w-4 h-4 shrink-0" />
                      <span>
                        {isUploadingAnnImage
                          ? `جاري الضغط والرفع (${annMediaProgress}%)...`
                          : 'رفع صورة (WebP ذكي)'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={isUploadingAnnImage}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          await handleInteractiveMediaSelection(file, 'image', 'ann_image');
                          e.target.value = '';
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => setArchivePickerTarget('ann_image')}
                      className="flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/35 text-amber-400 font-bold py-2.5 px-3 rounded-xl cursor-pointer transition text-xs"
                    >
                      <FolderArchive className="w-4 h-4 shrink-0" />
                      <span>اختيار من أرشيف المواسم</span>
                    </button>

                    <input
                      type="text"
                      value={annForm.imageUrl}
                      onChange={(e) =>
                        setAnnForm((prev) => ({
                          ...prev,
                          imageUrl: e.target.value,
                          displaySettings: { ...prev.displaySettings, showImage: true },
                        }))
                      }
                      placeholder="الصق رابط صورة خارجي (https://...)"
                      className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                      dir="ltr"
                    />
                  </div>

                  {annForm.imageUrl && (
                    <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2 text-[11px] text-emerald-400 font-bold">
                      <span>✓ محفوظ كرابط خارجي فقط ({extractMediaId(annForm.imageUrl) || 'External URL'})</span>
                      <span>بدون تخزين ملفات ثنائية (Blobs) في قاعدة البيانات</span>
                    </div>
                  )}

                  {annForm.imageUrl && (
                    <AnnouncementImageView
                      imageUrl={annForm.imageUrl}
                      alt="معاينة الصورة"
                      containerClassName="relative h-40 w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-800"
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>
              )}

              {/* Video Attachment Panel */}
              {(activeAnnToolTab === 'video' || annForm.videoUrl) && (
                <div className="bg-slate-50 dark:bg-slate-950 border border-sky-500/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                      <Video className="w-4 h-4" />
                      <span>إرفاق فيديو للموضوع (رابط Cloudinary / يوتيوب / رابط خارجي مباشر)</span>
                    </span>
                    {annForm.videoUrl && (
                      <button
                        type="button"
                        onClick={() => setAnnForm({ ...annForm, videoUrl: '' })}
                        className="text-xs text-red-400 hover:text-red-300 font-bold flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف الفيديو</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      value={annForm.videoUrl}
                      onChange={(e) =>
                        setAnnForm((prev) => ({
                          ...prev,
                          videoUrl: e.target.value,
                          displaySettings: { ...prev.displaySettings, showVideo: true },
                        }))
                      }
                      placeholder="رابط YouTube أو MP4 خارجي (https://...)"
                      className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white font-mono"
                      dir="ltr"
                    />

                    <label className="flex items-center justify-center gap-2 bg-sky-500/10 hover:bg-sky-500/20 border border-dashed border-sky-500/40 text-sky-400 font-bold py-2.5 px-3 rounded-xl cursor-pointer transition text-xs">
                      <UploadCloud className="w-4 h-4 shrink-0" />
                      <span>
                        {isUploadingAnnVideo
                          ? `جاري الرفع (${annMediaProgress}%)...`
                          : 'رفع فيديو (+ مصغرة ذكية)'}
                      </span>
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime,video/*"
                        className="hidden"
                        disabled={isUploadingAnnVideo}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          await handleInteractiveMediaSelection(file, 'video', 'ann_video');
                          e.target.value = '';
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => setArchivePickerTarget('ann_video')}
                      className="flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/35 text-amber-400 font-bold py-2.5 px-3 rounded-xl cursor-pointer transition text-xs"
                    >
                      <FolderArchive className="w-4 h-4 shrink-0" />
                      <span>اختيار من أرشيف المواسم</span>
                    </button>
                  </div>

                  {isUploadingAnnVideo && (
                    <div className="space-y-1.5">
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-500 transition-all duration-300"
                          style={{ width: `${annMediaProgress}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-sky-400 text-center font-bold">
                        جاري رفع الفيديو للسحابة الخارجية وتوليد رابط مباشر ({annMediaProgress}%)...
                      </p>
                    </div>
                  )}

                  {annForm.videoUrl && (
                    <div className="flex items-center justify-between bg-sky-500/10 border border-sky-500/30 rounded-xl px-3 py-2 text-[11px] text-sky-400 font-bold">
                      <span>✓ محفوظ كرابط خارجي فقط ({extractMediaId(annForm.videoUrl) || 'External URL'})</span>
                      <span>بدون تخزين ملفات ثنائية (Blobs) في قاعدة البيانات</span>
                    </div>
                  )}

                  {annForm.videoUrl && (
                    <AnnouncementVideoView
                      videoUrl={annForm.videoUrl}
                      title="معاينة الفيديو"
                      videoClassName="w-full max-h-48 object-contain bg-black"
                    />
                  )}
                </div>
              )}

              {/* Optional Cloudinary Settings Panel */}
              {(activeAnnToolTab === 'image' || activeAnnToolTab === 'video') && (
                <details className="bg-slate-900/50 border border-slate-800 rounded-2xl p-3 text-xs">
                  <summary className="cursor-pointer font-bold text-slate-300 flex items-center justify-between">
                    <span>إعدادات الربط السحابي (Cloudinary) — اختياري</span>
                    <span className="text-[10px] text-amber-400">
                      {campaignSettings?.cloudinaryConfig?.cloudName
                        ? `مربوط بـ Cloudinary (${campaignSettings.cloudinaryConfig.cloudName})`
                        : 'يعمل تلقائياً عبر السحابة الخارجية'}
                    </span>
                  </summary>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 mt-2 border-t border-slate-800">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Cloudinary Cloud Name</label>
                      <input
                        type="text"
                        defaultValue={campaignSettings?.cloudinaryConfig?.cloudName || ''}
                        onBlur={(e) => {
                          if (!campaignSettings) return;
                          onUpdateCampaignSettings({
                            ...campaignSettings,
                            cloudinaryConfig: {
                              cloudName: e.target.value.trim(),
                              uploadPreset: campaignSettings.cloudinaryConfig?.uploadPreset || '',
                            },
                          });
                        }}
                        placeholder="مثال: dxyz12345"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Unsigned Upload Preset</label>
                      <input
                        type="text"
                        defaultValue={campaignSettings?.cloudinaryConfig?.uploadPreset || ''}
                        onBlur={(e) => {
                          if (!campaignSettings) return;
                          onUpdateCampaignSettings({
                            ...campaignSettings,
                            cloudinaryConfig: {
                              cloudName: campaignSettings.cloudinaryConfig?.cloudName || '',
                              uploadPreset: e.target.value.trim(),
                            },
                          });
                        }}
                        placeholder="مثال: alqaem_unsigned"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </details>
              )}

              {/* DISPLAY PROPERTIES ACTIVATION PANEL (تفعيل الخصائص في صفحة العرض) */}
              <div className="bg-amber-500/5 border border-amber-500/25 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-500 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    <span>خصائص العرض في الصفحة الرئيسية للموقع:</span>
                  </span>
                  <span className="text-[11px] text-slate-400">تحكم بظهور وتفعيل المرفقات والتنسيق</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={annForm.displaySettings.showImage}
                      onChange={(e) =>
                        setAnnForm({
                          ...annForm,
                          displaySettings: { ...annForm.displaySettings, showImage: e.target.checked },
                        })
                      }
                      className="w-4 h-4 accent-amber-500 rounded"
                    />
                    <span className="font-bold text-slate-800 dark:text-slate-200">تفعيل عرض الصورة في صفحة العرض</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={annForm.displaySettings.showVideo}
                      onChange={(e) =>
                        setAnnForm({
                          ...annForm,
                          displaySettings: { ...annForm.displaySettings, showVideo: e.target.checked },
                        })
                      }
                      className="w-4 h-4 accent-amber-500 rounded"
                    />
                    <span className="font-bold text-slate-800 dark:text-slate-200">تفعيل عرض وتشغيل الفيديو في العرض</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={annForm.displaySettings.enableLightbox}
                      onChange={(e) =>
                        setAnnForm({
                          ...annForm,
                          displaySettings: { ...annForm.displaySettings, enableLightbox: e.target.checked },
                        })
                      }
                      className="w-4 h-4 accent-amber-500 rounded"
                    />
                    <span className="font-bold text-slate-800 dark:text-slate-200">تفعيل تكبير الصورة بالضغط عليها</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={annForm.displaySettings.highlightCard}
                      onChange={(e) =>
                        setAnnForm({
                          ...annForm,
                          displaySettings: { ...annForm.displaySettings, highlightCard: e.target.checked },
                        })
                      }
                      className="w-4 h-4 accent-amber-500 rounded"
                    />
                    <span className="font-bold text-slate-800 dark:text-slate-200">تمييز الموضوع بإطار ذهبي في العرض</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-900 pb-1">
              <button
                onClick={() => {
                  setIsNewAnnouncement(false);
                  setEditingAnnouncement(null);
                  setAnnMediaError('');
                }}
                className="px-5 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={annSaveLoading || isUploadingAnnImage || isUploadingAnnVideo}
                onClick={async () => {
                  if (!annForm.title || !annForm.content) return;
                  setAnnSaveLoading(true);
                  try {
                    const payload: Announcement = {
                      id: isNewAnnouncement ? 'ann-' + Date.now() : editingAnnouncement!.id,
                      title: annForm.title,
                      category: annForm.category as any,
                      date: annForm.date,
                      content: annForm.content,
                      fontSize: annForm.fontSize,
                      isBold: annForm.isBold,
                      textAlign: annForm.textAlign,
                      imageUrl: annForm.imageUrl.trim(),
                      videoUrl: annForm.videoUrl.trim(),
                      displaySettings: annForm.displaySettings,
                      seasonId: editingAnnouncement?.seasonId || currentSeasonId,
                      seasonYear: editingAnnouncement?.seasonYear || currentSeasonYear,
                      ...(annImageAssetId ? { imageAssetId: annImageAssetId } : {}),
                      ...(annVideoAssetId ? { videoAssetId: annVideoAssetId } : {}),
                    };
                    const res = isNewAnnouncement
                      ? await onAddAnnouncement(payload)
                      : await onUpdateAnnouncement(payload);
                    if (res !== false) {
                      setIsNewAnnouncement(false);
                      setEditingAnnouncement(null);
                      setAnnMediaError('');
                    } else {
                      setAnnMediaError('تعذر تأكيد الحفظ في السحابة. يرجى التحقق من الاتصال.');
                    }
                  } finally {
                    setAnnSaveLoading(false);
                  }
                }}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow flex items-center gap-2 disabled:opacity-60"
              >
                {annSaveLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{annSaveLoading ? 'جاري الحفظ...' : 'حفظ الإعلان'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD / EDIT PACKAGE & PRICING */}
      {(isNewPackage || editingPackage) && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-8 max-w-xl w-full space-y-6 text-right shadow-2xl max-h-[90dvh] overflow-y-auto my-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 sticky top-0 bg-white dark:bg-slate-900 z-10 pt-1">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                {isNewPackage ? 'إضافة باقة جديدة' : `تعديل الباقة والأسعار: ${editingPackage?.title}`}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsNewPackage(false);
                  setEditingPackage(null);
                }}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
                title="إغلاق"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">اسم الباقة *</label>
                <input
                  type="text"
                  value={pkgForm.title}
                  onChange={(e) => setPkgForm({ ...pkgForm, title: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white"
                  placeholder="مثال: باقة الحج الاقتصادية"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">نوع الباقة *</label>
                  <input
                    type="text"
                    value={pkgForm.type}
                    onChange={(e) => setPkgForm({ ...pkgForm, type: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                    placeholder="VIP / باصات حديثة"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">السعر (مع العملة) *</label>
                  <input
                    type="text"
                    value={pkgForm.price}
                    onChange={(e) => setPkgForm({ ...pkgForm, price: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-bold text-amber-500"
                    placeholder="16,800 ريال"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">وسيلة المواصلات *</label>
                <input
                  type="text"
                  value={pkgForm.transport}
                  onChange={(e) => setPkgForm({ ...pkgForm, transport: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">السكن في مكة المكرمة *</label>
                <input
                  type="text"
                  value={pkgForm.accommodationMakkah}
                  onChange={(e) => setPkgForm({ ...pkgForm, accommodationMakkah: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">السكن في المدينة المنورة *</label>
                <input
                  type="text"
                  value={pkgForm.accommodationMadinah}
                  onChange={(e) => setPkgForm({ ...pkgForm, accommodationMadinah: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">مميزات الباقة (افصل بينها بفواصل) *</label>
                <input
                  type="text"
                  value={pkgForm.featuresStr}
                  onChange={(e) => setPkgForm({ ...pkgForm, featuresStr: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                  placeholder="ميزة 1, ميزة 2, ميزة 3"
                />
              </div>

              {/* NEW SECTION: VISIBILITY, CAPACITY, DEADLINE & FORCE CLOSE SETTINGS */}
              <div className="bg-slate-50 dark:bg-slate-950/80 border border-amber-500/30 rounded-2xl p-4 space-y-4">
                <h4 className="text-xs font-black text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  <span>إعدادات الظهور والسعة وموعد إغلاق التسجيل</span>
                </h4>

                {/* 1. Show on Homepage Toggle Switch */}
                <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-xs font-black text-slate-900 dark:text-white block">
                      حالة الظهور في الصفحة الرئيسية (Show on Homepage)
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      عند الإخفاء لن تظهر الباقة نهائياً للزوار في الصفحة الرئيسية أو صفحة التسجيل
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPkgForm({ ...pkgForm, showOnHomepage: !pkgForm.showOnHomepage })
                    }
                    className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 shrink-0 cursor-pointer border ${
                      pkgForm.showOnHomepage
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {pkgForm.showOnHomepage ? (
                      <>
                        <Eye className="w-4 h-4" />
                        <span>مفعل (ظاهر)</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-4 h-4" />
                        <span>مخفي</span>
                      </>
                    )}
                  </button>
                </div>

                {/* 2. Max Capacity & 3. Registration Deadline */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      الحد الأقصى للمقاعد (Max Capacity)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={pkgForm.maxCapacity}
                      onChange={(e) => setPkgForm({ ...pkgForm, maxCapacity: e.target.value })}
                      placeholder="مثال: 50 (اتركه فارغاً لغير محدود)"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono font-bold"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      تتحول الباقة تلقائياً إلى &quot;مكتملة العدد&quot; عند وصول المسجلين لهذا الرقم
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      تاريخ ووقت انتهاء التسجيل (Deadline)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="datetime-local"
                        value={pkgForm.registrationDeadline}
                        onChange={(e) =>
                          setPkgForm({ ...pkgForm, registrationDeadline: e.target.value })
                        }
                        dir="ltr"
                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                      />
                      {pkgForm.registrationDeadline && (
                        <button
                          type="button"
                          onClick={() => setPkgForm({ ...pkgForm, registrationDeadline: '' })}
                          className="p-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-500 hover:text-red-500 text-xs font-bold"
                          title="مسح التاريخ"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      تُغلق الباقة تلقائياً للزوار فور تجاوز هذا التاريخ والوقت
                    </span>
                  </div>
                </div>

                {/* 4. Manual Emergency Force Close */}
                <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-black text-slate-900 dark:text-white block">
                        الإغلاق اليدوي الطارئ (Force Close)
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        إغلاق التسجيل في الباقة فوراً للزوار مع بقائها معروضة بشارة الإغلاق
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPkgForm({ ...pkgForm, forceClose: !pkgForm.forceClose })
                      }
                      className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 shrink-0 cursor-pointer border ${
                        pkgForm.forceClose
                          ? 'bg-red-600 text-white border-red-500 shadow-sm'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      <Lock className="w-4 h-4" />
                      <span>{pkgForm.forceClose ? 'مغلق يدوياً' : 'مفتوح للتسجيل'}</span>
                    </button>
                  </div>

                  {pkgForm.forceClose && (
                    <div>
                      <label className="block text-[11px] font-bold text-red-500 dark:text-red-400 mb-1">
                        عبارة شارة الإغلاق الظاهرة للزوار:
                      </label>
                      <input
                        type="text"
                        value={pkgForm.forceCloseReason}
                        onChange={(e) =>
                          setPkgForm({ ...pkgForm, forceCloseReason: e.target.value })
                        }
                        placeholder="مغلق لانتهاء الموسم"
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-red-500/40 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white font-bold"
                      />
                    </div>
                  )}
                </div>

                {/* 5. Dynamic Form Builder Binding */}
                <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-emerald-500/35 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5" />
                        <span>الاستمارة الديناميكية المرتبطة بالباقة (Form Builder)</span>
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                        اختر استمارة مخصصة لتمريرها تلقائياً للزوار عند التسجيل في هذه الباقة، أو اتركها على الاستمارة الافتراضية المعتمدة لموسم 1448هـ
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewPackage(false);
                        setEditingPackage(null);
                        setActiveTab('formBuilder');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>فتح منشئ الاستمارات</span>
                    </button>
                  </div>
                  <select
                    value={pkgForm.formTemplateId}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      const matchedForm = dynamicForms.find((f) => f.id === selectedId);
                      setPkgForm({
                        ...pkgForm,
                        formTemplateId: selectedId,
                        formTemplateName: matchedForm ? matchedForm.name : '',
                      });
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">الاستمارة الافتراضية المعتمدة (حج 1448 — النموذج الكلاسيكي)</option>
                    {dynamicForms
                      .filter((f) => f.status === 'active' || f.id === pkgForm.formTemplateId)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                          {f.status !== 'active' ? ' (غير مفعلة حالياً)' : ` — الإصدار v${f.version || 1}`}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">صورة الباقة (رابط URL أو إرفاق ملف صورة أو اختيار من أرشيف المواسم) *</label>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={pkgForm.image}
                    onChange={(e) => setPkgForm({ ...pkgForm, image: e.target.value })}
                    className="flex-1 min-w-[180px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                    placeholder="رابط الصورة أو ارفع صورة..."
                    dir="ltr"
                  />
                  <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-amber-400 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 border border-amber-500/30">
                    {isUploadingPkgImage && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{isUploadingPkgImage ? 'جاري الضغط والرفع...' : 'رفع صورة (WebP)'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingPkgImage}
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        await handleInteractiveMediaSelection(file, 'image', 'pkg');
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setArchivePickerTarget('pkg')}
                    className="cursor-pointer bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 border border-amber-500/35"
                  >
                    <FolderArchive className="w-3.5 h-3.5" />
                    <span>أرشيف المواسم</span>
                  </button>
                </div>
                {pkgForm.image && (
                  <div className="mt-3 relative h-36 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                    <img src={pkgForm.image} alt="معاينة الصورة" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-900 pb-1">
              <button
                onClick={() => { setIsNewPackage(false); setEditingPackage(null); }}
                className="px-5 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={pkgSaveLoading || isUploadingPkgImage}
                onClick={async () => {
                  if (!pkgForm.title || !pkgForm.price) return;
                  setPkgSaveLoading(true);
                  try {
                    const featuresArray = pkgForm.featuresStr.split(',').map((s) => s.trim()).filter(Boolean);
                    const parsedMaxCapacity =
                      pkgForm.maxCapacity && Number(pkgForm.maxCapacity) > 0
                        ? Math.floor(Number(pkgForm.maxCapacity))
                        : 0;
                    let ok: boolean | void = true;
                    if (isNewPackage) {
                      ok = await onAddPackage({
                        id: 'pkg-' + Date.now(),
                        title: pkgForm.title,
                        type: pkgForm.type,
                        price: pkgForm.price,
                        transport: pkgForm.transport,
                        accommodationMakkah: pkgForm.accommodationMakkah,
                        accommodationMadinah: pkgForm.accommodationMadinah,
                        campMina: pkgForm.campMina,
                        features: featuresArray,
                        image: pkgForm.image,
                        seasonId: currentSeasonId,
                        seasonYear: currentSeasonYear,
                        showOnHomepage: pkgForm.showOnHomepage,
                        maxCapacity: parsedMaxCapacity,
                        registrationDeadline: pkgForm.registrationDeadline || '',
                        forceClose: Boolean(pkgForm.forceClose),
                        forceCloseReason:
                          (pkgForm.forceCloseReason || '').trim() || 'مغلق لانتهاء الموسم',
                        ...(pkgForm.formTemplateId
                          ? {
                              formTemplateId: pkgForm.formTemplateId,
                              formTemplateName:
                                dynamicForms.find((f) => f.id === pkgForm.formTemplateId)?.name ||
                                pkgForm.formTemplateName ||
                                '',
                            }
                          : { formTemplateId: '', formTemplateName: '' }),
                        ...(pkgMediaAssetId ? { mediaAssetId: pkgMediaAssetId } : {}),
                      });
                    } else if (editingPackage) {
                      ok = await onUpdatePackage({
                        ...editingPackage,
                        title: pkgForm.title,
                        type: pkgForm.type,
                        price: pkgForm.price,
                        transport: pkgForm.transport,
                        accommodationMakkah: pkgForm.accommodationMakkah,
                        accommodationMadinah: pkgForm.accommodationMadinah,
                        campMina: pkgForm.campMina,
                        features: featuresArray,
                        image: pkgForm.image,
                        seasonId: editingPackage.seasonId || currentSeasonId,
                        seasonYear: editingPackage.seasonYear || currentSeasonYear,
                        showOnHomepage: pkgForm.showOnHomepage,
                        maxCapacity: parsedMaxCapacity,
                        registrationDeadline: pkgForm.registrationDeadline || '',
                        forceClose: Boolean(pkgForm.forceClose),
                        forceCloseReason:
                          (pkgForm.forceCloseReason || '').trim() || 'مغلق لانتهاء الموسم',
                        formTemplateId: pkgForm.formTemplateId || '',
                        formTemplateName: pkgForm.formTemplateId
                          ? dynamicForms.find((f) => f.id === pkgForm.formTemplateId)?.name ||
                            pkgForm.formTemplateName ||
                            ''
                          : '',
                        ...(pkgMediaAssetId ? { mediaAssetId: pkgMediaAssetId } : {}),
                      });
                    }
                    if (ok !== false) {
                      setIsNewPackage(false);
                      setEditingPackage(null);
                    }
                  } finally {
                    setPkgSaveLoading(false);
                  }
                }}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow flex items-center gap-2 disabled:opacity-60"
              >
                {pkgSaveLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{pkgSaveLoading ? 'جاري الحفظ...' : 'حفظ التغييرات'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CREATE OR EDIT STAFF USER (MASTER ADMIN ONLY) */}
      {(isNewStaff || editingStaff) && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsNewStaff(false);
              setEditingStaff(null);
              setStaffFormError('');
            }
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full max-h-[90dvh] flex flex-col text-right shadow-2xl overflow-hidden my-auto">
            {/* Sticky Header with Title & Close (X) Button */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <h3 className="text-base sm:text-xl font-black text-slate-900 dark:text-white">
                {editingStaff ? 'تعديل بيانات المشرف وصلاحياته' : 'إنشاء حساب مشرف إداري جديد'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsNewStaff(false);
                  setEditingStaff(null);
                  setStaffFormError('');
                }}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition flex items-center gap-1 text-xs font-bold"
                title="إغلاق النافذة"
              >
                <XCircle className="w-5 h-5" />
                <span className="sm:hidden">إغلاق</span>
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 sm:p-6 space-y-4 text-sm overflow-y-auto flex-1">
              {staffFormError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{staffFormError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">اسم المشرف الكامل *</label>
                <input
                  type="text"
                  value={staffForm.fullName}
                  onChange={(e) => {
                    setStaffForm({ ...staffForm, fullName: e.target.value });
                    if (staffFormError) setStaffFormError('');
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white"
                  placeholder="مثال: صالح الياسين"
                />
              </div>

              <div className="space-y-3 bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      1. كتابة اسم المستخدم (اليوزر) *
                    </label>
                    <input
                      type="text"
                      value={staffForm.username}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw.includes('@')) {
                          const { localPart, domain } = splitUsernameAndDomain(raw);
                          setStaffForm({ ...staffForm, username: localPart });
                          if (STAFF_DOMAIN_OPTIONS.some((o) => o.value === domain)) {
                            setStaffDomain(domain);
                          }
                        } else {
                          setStaffForm({ ...staffForm, username: raw.replace(/\s+/g, '') });
                        }
                        if (staffFormError) setStaffFormError('');
                      }}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono text-xs"
                      placeholder="مثال: saleh أو supervisor"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      2. اختيار النطاق المعتمد *
                    </label>
                    <select
                      value={staffDomain}
                      onChange={(e) => {
                        setStaffDomain(e.target.value);
                        if (staffFormError) setStaffFormError('');
                      }}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-amber-600 dark:text-amber-400 font-mono font-bold text-xs"
                      dir="ltr"
                    >
                      {STAFF_DOMAIN_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Live Preview of Resulting Identifier */}
                <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-xs">
                  <span className="text-slate-600 dark:text-slate-300 font-bold">المعرّف المعتمد للدخول:</span>
                  <span className="font-mono font-black text-amber-600 dark:text-amber-400" dir="ltr">
                    {staffForm.username.trim()
                      ? `${staffForm.username.trim().toLowerCase().split('@')[0]}${staffDomain}`
                      : `username${staffDomain}`}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رمز المرور السري (PIN) {editingStaff ? '(اتركه فارغاً للإبقاء على الرمز الحالي)' : '*'}
                  </label>
                  <div className="relative">
                    <input
                      type={showStaffPin ? "text" : "password"}
                      value={staffForm.pin}
                      onChange={(e) => setStaffForm({ ...staffForm, pin: e.target.value })}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono"
                      placeholder="1234"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStaffPin(!showStaffPin)}
                      className="absolute left-2.5 top-2 text-slate-400 hover:text-amber-500 transition"
                    >
                      {showStaffPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">الدور الوظيفي *</label>
                <select
                  value={staffForm.role}
                  onChange={(e) => {
                    const nextRole = e.target.value as any;
                    setStaffForm({
                      ...staffForm,
                      role: nextRole,
                      permissions: {
                        ...staffForm.permissions,
                        manageReligiousGuide:
                          nextRole === 'مشرف إرشاد وديني' ? true : staffForm.permissions.manageReligiousGuide,
                      },
                    });
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                >
                  <option value="مشرف إداري">مشرف إداري</option>
                  <option value="مشرف إرشاد وديني">مشرف إرشاد وديني</option>
                  <option value="محاسب القافلة">محاسب القافلة</option>
                </select>
              </div>

              <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">صلاحيات الوصول:</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={staffForm.permissions.managePilgrims}
                    onChange={(e) => setStaffForm({
                      ...staffForm,
                      permissions: { ...staffForm.permissions, managePilgrims: e.target.checked }
                    })}
                    className="w-4 h-4 text-amber-600 rounded"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300">إدارة الحجاج والاطلاع على السجلات وتصدير البيانات</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={staffForm.permissions.manageAnnouncements}
                    onChange={(e) => setStaffForm({
                      ...staffForm,
                      permissions: { ...staffForm.permissions, manageAnnouncements: e.target.checked }
                    })}
                    className="w-4 h-4 text-amber-600 rounded"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300">إدارة الإعلانات، اللقاءات والدروس</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={staffForm.permissions.manageFinance}
                    onChange={(e) => setStaffForm({
                      ...staffForm,
                      permissions: { ...staffForm.permissions, manageFinance: e.target.checked }
                    })}
                    className="w-4 h-4 text-amber-600 rounded"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300">إدارة الأمور المالية وقبول الطلبات</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={staffForm.permissions.manageReligiousGuide}
                    onChange={(e) => setStaffForm({
                      ...staffForm,
                      permissions: { ...staffForm.permissions, manageReligiousGuide: e.target.checked }
                    })}
                    className="w-4 h-4 text-amber-600 rounded"
                  />
                  <span className="text-xs font-bold text-purple-600 dark:text-purple-400">صلاحيات الإشراف الديني (الوصول إلى كشف المراجع وإدارة الإرشاد الديني)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={staffForm.permissions.managePackages}
                    onChange={(e) => setStaffForm({
                      ...staffForm,
                      permissions: { ...staffForm.permissions, managePackages: e.target.checked }
                    })}
                    className="w-4 h-4 text-amber-600 rounded"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300">إدارة الباقات والأسعار</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={staffForm.permissions.manageTravelKit}
                    onChange={(e) => setStaffForm({
                      ...staffForm,
                      permissions: { ...staffForm.permissions, manageTravelKit: e.target.checked }
                    })}
                    className="w-4 h-4 text-amber-600 rounded"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-300">إدارة حقيبة السفر والتجهيزات</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(staffForm.permissions.manageGifts)}
                    onChange={(e) => setStaffForm({
                      ...staffForm,
                      permissions: { ...staffForm.permissions, manageGifts: e.target.checked }
                    })}
                    className="w-4 h-4 text-amber-600 rounded"
                  />
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400">إدارة وتوزيع هدايا الحجاج وتوثيق الاستلام والتقارير</span>
                </label>
              </div>
            </div>

            {/* Sticky Footer with Save & Cancel Buttons (Always visible on mobile) */}
            <div className="flex items-center justify-end gap-3 px-5 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsNewStaff(false);
                  setEditingStaff(null);
                  setStaffFormError('');
                }}
                className="px-5 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSavingStaff}
                onClick={async () => {
                  const cleanLocalUser = staffForm.username.trim().toLowerCase().split('@')[0].replace(/\s+/g, '');
                  const cleanUsername = `${cleanLocalUser}${staffDomain}`;
                  const cleanFullName = staffForm.fullName.trim().replace(/\s+/g, ' ');

                  if (!cleanFullName) {
                    setStaffFormError('يرجى إدخال اسم المشرف الكامل.');
                    return;
                  }
                  if (!cleanLocalUser) {
                    setStaffFormError('يرجى كتابة اسم المستخدم (اليوزر) في الحقل الأول.');
                    return;
                  }
                  if (!editingStaff && !staffForm.pin.trim()) {
                    setStaffFormError('يرجى إدخال رمز المرور (PIN) للمشرف الجديد.');
                    return;
                  }

                  // Check for duplicate username (either exact user@domain OR same local username part)
                  const isMasterAlias = (val: string) =>
                    val === 'admin' ||
                    val === 'alahsaey@gmail.com' ||
                    val === 'alqaemhajj313@gmail.com' ||
                    val === 'admin@alqaemhajj.com' ||
                    val === 'alahsaey' ||
                    val === 'alqaemhajj313';
                  const usernameConflict = adminUsers.find((u) => {
                    if (editingStaff && u.id === editingStaff.id) return false;
                    const existingUser = (u.username || '').trim().toLowerCase();
                    const existingLocal = existingUser.split('@')[0] || '';
                    return (
                      existingUser === cleanUsername ||
                      existingLocal === cleanLocalUser ||
                      (isMasterAlias(cleanLocalUser) && isMasterAlias(existingLocal))
                    );
                  });

                  if (usernameConflict) {
                    setStaffFormError(
                      `عفواً، اسم المستخدم (${cleanLocalUser}) مسجل مسبقاً للمشرف "${usernameConflict.fullName}" بالحساب (${usernameConflict.username}) ولا يمكن تكراره.`
                    );
                    return;
                  }

                  // Check for duplicate full name
                  const nameConflict = adminUsers.find((u) => {
                    if (editingStaff && u.id === editingStaff.id) return false;
                    const existingName = (u.fullName || '').trim().replace(/\s+/g, ' ').toLowerCase();
                    return existingName === cleanFullName.toLowerCase();
                  });

                  if (nameConflict) {
                    setStaffFormError(
                      `عفواً، المشرف "${cleanFullName}" موجود مسبقاً في القائمة برقم/حساب (${nameConflict.username}) ولا يمكن إضافة نفس المشرف مرتين.`
                    );
                    return;
                  }

                  setIsSavingStaff(true);
                  try {
                    // If editing and PIN is empty, keep existing. If new or not empty, hash it.
                    let finalPin = '';
                    if (editingStaff) {
                      if (!staffForm.pin.trim()) {
                        finalPin = editingStaff.pin;
                      } else {
                        finalPin = await hashPIN(staffForm.pin.trim());
                      }
                    } else {
                      finalPin = await hashPIN(staffForm.pin.trim());
                    }

                    if (editingStaff) {
                      await onUpdateAdminUser({
                        ...editingStaff,
                        username: cleanUsername,
                        pin: finalPin,
                        fullName: cleanFullName,
                        role: staffForm.role,
                        permissions: staffForm.permissions,
                      });
                    } else {
                      // Deterministic ID based on normalized username so the same user can never be created twice
                      const safeSlug = cleanUsername.replace(/[^a-z0-9]/g, '_');
                      const deterministicId = `usr-${safeSlug || Date.now()}`;
                      await onAddAdminUser({
                        id: deterministicId,
                        username: cleanUsername,
                        pin: finalPin,
                        fullName: cleanFullName,
                        role: staffForm.role,
                        permissions: staffForm.permissions,
                        createdAt: new Date().toISOString().split('T')[0],
                      });
                    }
                    setIsNewStaff(false);
                    setEditingStaff(null);
                    setStaffFormError('');
                  } finally {
                    setIsSavingStaff(false);
                  }
                }}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs shadow"
              >
                {isSavingStaff ? 'جاري الحفظ...' : editingStaff ? 'حفظ التعديلات' : 'إنشاء حساب المشرف'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: CHANGE OWN STRONG PASSWORD */}
      {showChangePasswordModal && currentAdminUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 text-right shadow-2xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-500" />
                <span>تغيير كلمة المرور الخاصة بي</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowChangePasswordModal(false);
                  setOwnPasswordError('');
                }}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
                title="إغلاق"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {ownPasswordError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-300 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold">
                {ownPasswordError}
              </div>
            )}

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">البريد الإلكتروني للحساب</label>
                <input
                  type="text"
                  value={currentAdminUser.email || currentAdminUser.username}
                  disabled
                  className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-500 cursor-not-allowed font-mono text-xs"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">كلمة المرور الجديدة القوية *</label>
                <div className="relative">
                  <input
                    type={showOwnPin ? "text" : "password"}
                    value={newPasswordInput}
                    onChange={(e) => {
                      setNewPasswordInput(e.target.value);
                      if (ownPasswordError) setOwnPasswordError('');
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white font-mono text-sm"
                    dir="ltr"
                    placeholder="8 أحرف+ (حرف كبير، صغير، رقم، رمز)"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowOwnPin(!showOwnPin)}
                    className="absolute left-3 top-2.5 text-slate-400 hover:text-amber-500 transition"
                  >
                    {showOwnPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  الشروط: 8 أحرف على الأقل، حرف إنجليزي كبير (A-Z)، حرف صغير (a-z)، رقم (0-9)، ورمز خاص (!@#$...).
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowChangePasswordModal(false);
                  setOwnPasswordError('');
                }}
                className="px-5 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSavingOwnPassword || !normalizePinInput(newPasswordInput)}
                onClick={async () => {
                  const cleanPwd = normalizePinInput(newPasswordInput);
                  const check = validateStrongPassword(cleanPwd);
                  if (!check.isValid) {
                    setOwnPasswordError(check.errors[0] || 'كلمة المرور غير قوية بما يكفي.');
                    return;
                  }
                  setIsSavingOwnPassword(true);
                  try {
                    const hashed = await hashPasswordSecure(cleanPwd);
                    const updatedUser: AdminUser = {
                      ...currentAdminUser,
                      pin: hashed,
                      mustChangePassword: false,
                      passwordChangedAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    };
                    await onUpdateAdminUser(updatedUser);
                    setCurrentAdminUser(updatedUser);
                    await recordActivityLog({
                      adminId: currentAdminUser.id,
                      adminName: currentAdminUser.fullName,
                      username: currentAdminUser.email || currentAdminUser.username,
                      userRole: currentAdminUser.role,
                      category: 'الأمان والمصادقة',
                      severity: 'info',
                      action: 'تحديث كلمة المرور الشخصية للموظف بنجاح',
                      target: currentAdminUser.email || currentAdminUser.username,
                    });
                    setShowChangePasswordModal(false);
                    setNewPasswordInput('');
                    setOwnPasswordError('');
                  } finally {
                    setIsSavingOwnPassword(false);
                  }
                }}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs shadow cursor-pointer"
              >
                {isSavingOwnPassword ? 'جاري التشفير والحفظ...' : 'حفظ كلمة المرور الجديدة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: USER SECURITY, TRUSTED DEVICES & BIOMETRIC OPT-IN SETTINGS */}
      {currentAdminUser && (
        <UserSecuritySettingsModal
          isOpen={showUserSecurityModal}
          onClose={() => setShowUserSecurityModal(false)}
          currentAdminUser={currentAdminUser}
          onUserUpdated={(updatedUser) => setCurrentAdminUser(updatedUser)}
        />
      )}

      {/* Reusable Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Official PDF Payment Receipt Modal */}
      {officialReceiptPilgrim && (
        <PaymentReceiptModal
          pilgrim={officialReceiptPilgrim}
          campaignSettings={campaignSettings}
          onClose={() => setOfficialReceiptPilgrim(null)}
          onUpdatePilgrim={(updated) => {
            onUpdatePilgrim(updated);
            setOfficialReceiptPilgrim(updated);
          }}
          isEditable={true}
        />
      )}

      {/* Central Al-Qaem Excel Report Customizer & Identity Preview Modal */}
      <ExcelReportCustomizerModal />

      {/* Unified Official Report Print & PDF Preview Modal */}
      {officialReportModal && (
        <OfficialReportPrintModal
          title={officialReportModal.title}
          subtitle={officialReportModal.subtitle}
          category={officialReportModal.category}
          filterSummary={officialReportModal.filterSummary}
          generatedBy={currentAdminUser?.fullName || currentAdminUser?.username || 'الإدارة العامة للقافلة'}
          seasonLabel={`موسم ${getActiveSeasonYear(campaignSettings)}هـ`}
          columns={officialReportModal.columns}
          data={officialReportModal.data}
          summaryCards={officialReportModal.summaryCards}
          excelFilename={officialReportModal.filename}
          onExportExcel={officialReportModal.onExportExcel}
          signatureRightLabel={officialReportModal.signatureRightLabel}
          onClose={() => setOfficialReportModal(null)}
        />
      )}

      {/* Interactive SHA-256 Duplicate Media Reuse vs New Copy Modal */}
      <MediaDuplicateDecisionModal
        isOpen={Boolean(pendingDuplicatePrompt)}
        fileName={pendingDuplicatePrompt?.file.name || ''}
        fileSizeBytes={pendingDuplicatePrompt?.file.size || 0}
        kind={pendingDuplicatePrompt?.kind || 'image'}
        targetSeasonName={currentSeasonLabel}
        existingMatch={pendingDuplicatePrompt?.existingMatch || null}
        isReplacingExisting={pendingDuplicatePrompt?.isReplacing}
        onSelect={async (choice, match) => {
          const pending = pendingDuplicatePrompt;
          setPendingDuplicatePrompt(null);
          if (!pending) return;
          await executeSeasonAwareMediaUpload({
            file: pending.file,
            kind: pending.kind,
            target: pending.target,
            choice,
            existingMatch: match,
          });
        }}
        onCancel={() => setPendingDuplicatePrompt(null)}
      />

      {/* Cross-Season Media Archive Browser Modal */}
      <SeasonMediaArchiveModal
        isOpen={Boolean(archivePickerTarget)}
        kind={archivePickerTarget === 'ann_video' ? 'video' : 'image'}
        seasons={seasons}
        activeSeasonId={currentSeasonId}
        onSelectAsset={async (asset) => {
          const target = archivePickerTarget;
          setArchivePickerTarget(null);
          if (!target) return;

          const targetRecordId =
            target === 'pkg'
              ? isNewPackage
                ? 'packages/new'
                : `packages/${editingPackage?.id || 'pkg'}`
              : isNewAnnouncement
              ? 'announcements/new'
              : `announcements/${editingAnnouncement?.id || 'ann'}`;

          const reused =
            (await reuseExistingMediaAsset(asset.id, {
              linkedRecordId: targetRecordId,
              seasonId: currentSeasonId,
              seasonName: currentSeasonLabel,
              note: 'استيراد وإعادة استخدام من أرشيف المواسم',
            })) || asset;

          if (target === 'pkg') {
            setPkgForm((prev) => ({ ...prev, image: reused.url }));
            setPkgMediaAssetId(reused.id);
          } else if (target === 'ann_image') {
            setAnnForm((prev) => ({
              ...prev,
              imageUrl: reused.url,
              displaySettings: { ...prev.displaySettings, showImage: true },
            }));
            setAnnImageAssetId(reused.id);
          } else {
            setAnnForm((prev) => ({
              ...prev,
              videoUrl: reused.url,
              displaySettings: { ...prev.displaySettings, showVideo: true },
            }));
            setAnnVideoAssetId(reused.id);
          }
        }}
        onClose={() => setArchivePickerTarget(null)}
      />
    </div>
  );
};
