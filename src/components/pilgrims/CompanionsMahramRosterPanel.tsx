import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  UserCheck,
  Search,
  Filter,
  SlidersHorizontal,
  Printer,
  FileSpreadsheet,
  Download,
  X,
  Check,
  CheckCircle2,
  RotateCcw,
  Eye,
  ChevronDown,
  ChevronUp,
  Home,
  Sparkles,
  AlertCircle,
  Square,
  Phone,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { safeStorage } from '../../utils/safeStorage';
import { jsPDF } from 'jspdf';
import {
  Pilgrim,
  HajjPackage,
  HajjSeason,
  AdminUser,
  CampaignSettings,
} from '../../types';
import { PilgrimEducationalProgress } from '../../types/religiousGuidance';
import { subscribeToCollection } from '../../lib/db';
import {
  getPilgrimDisplayName,
  getPilgrimEffectiveMarji,
} from '../../lib/religiousGuidanceDb';
import { exportAlQaemExcelReport } from '../../utils/alqaemExcelEngine';
import {
  isPilgrimInSeason,
  getActiveSeasonYear,
} from '../../utils/pilgrimStats';
import {
  loadPersistedColumnSelection,
  savePersistedColumnSelection,
  getAutoOrientationForColumnCount,
} from '../common/DynamicColumnSelector';

export type CompanionRosterColumnKey =
  // المجموعة الأولى: بيانات المرافق / المحرم
  | 'companionName'
  | 'companionNationalId'
  | 'companionRelation'
  | 'companionOrder'
  // المجموعة الثانية: بيانات الحاج الرئيسي (المرتبط به) وتفاصيل الرحلة
  | 'primaryName'
  | 'primaryNationalId'
  | 'primaryMobile'
  | 'primaryGender'
  | 'packageTransport'
  | 'madinahPrivateRoom'
  | 'mutawwifName'
  | 'marjiName'
  | 'paymentApprovalStatus'
  | 'notesSignature';

export interface CompanionRosterColumnDef {
  key: CompanionRosterColumnKey;
  group: 'companion' | 'primary';
  /** Whether this cell merges across the family's companion rows using rowSpan */
  mergeAcrossFamily: boolean;
  label: string;
  shortHeader: string;
  defaultEnabled: boolean;
  isTextProtected?: boolean;
}

export const COMPANION_ROSTER_COLUMNS: CompanionRosterColumnDef[] = [
  // المجموعة الأولى — أعمدة بيانات المرافق / المحرم
  {
    key: 'companionName',
    group: 'companion',
    mergeAcrossFamily: false,
    label: 'الاسم الكامل للمرافق',
    shortHeader: 'الاسم الكامل للمرافق',
    defaultEnabled: true,
  },
  {
    key: 'companionNationalId',
    group: 'companion',
    mergeAcrossFamily: false,
    label: 'رقم بطاقة / هوية المرافق',
    shortHeader: 'رقم بطاقة / هوية المرافق',
    defaultEnabled: true,
    isTextProtected: true,
  },
  {
    key: 'companionRelation',
    group: 'companion',
    mergeAcrossFamily: false,
    label: 'صلة القرابة بالحاج الرئيسي',
    shortHeader: 'صلة القرابة',
    defaultEnabled: true,
  },
  {
    key: 'companionOrder',
    group: 'companion',
    mergeAcrossFamily: false,
    label: 'ترتيب المرافق (المرافق 1، 2، ...)',
    shortHeader: 'ترتيب المرافق',
    defaultEnabled: false,
  },

  // المجموعة الثانية — أعمدة بيانات الحاج الرئيسي (المرتبط به) وتفاصيل الرحلة
  {
    key: 'primaryName',
    group: 'primary',
    mergeAcrossFamily: true,
    label: 'اسم الحاج الرئيسي (صاحب الطلب)',
    shortHeader: 'اسم الحاج الرئيسي',
    defaultEnabled: true,
  },
  {
    key: 'primaryNationalId',
    group: 'primary',
    mergeAcrossFamily: true,
    label: 'رقم هوية الحاج الرئيسي',
    shortHeader: 'رقم هوية الحاج الرئيسي',
    defaultEnabled: true,
    isTextProtected: true,
  },
  {
    key: 'primaryMobile',
    group: 'primary',
    mergeAcrossFamily: true,
    label: 'رقم جوال الحاج الرئيسي / الواتساب',
    shortHeader: 'جوال الحاج الرئيسي / الواتساب',
    defaultEnabled: true,
    isTextProtected: true,
  },
  {
    key: 'primaryGender',
    group: 'primary',
    mergeAcrossFamily: true,
    label: 'الجنس (ذكر / أنثى)',
    shortHeader: 'الجنس',
    defaultEnabled: false,
  },
  {
    key: 'packageTransport',
    group: 'primary',
    mergeAcrossFamily: true,
    label: 'الباقة المختارة / وسيلة النقل (باص أو طيران)',
    shortHeader: 'الباقة / وسيلة النقل',
    defaultEnabled: false,
  },
  {
    key: 'madinahPrivateRoom',
    group: 'primary',
    mergeAcrossFamily: true,
    label: 'طلب غرفة خاصة بالمدينة المنورة (نعم / لا)',
    shortHeader: 'غرفة خاصة بالمدينة',
    defaultEnabled: false,
  },
  {
    key: 'mutawwifName',
    group: 'primary',
    mergeAcrossFamily: true,
    label: 'اسم المطوّف المكلّف',
    shortHeader: 'المطوّف المكلّف',
    defaultEnabled: false,
  },
  {
    key: 'marjiName',
    group: 'primary',
    mergeAcrossFamily: true,
    label: 'اسم مرجع التقليد',
    shortHeader: 'مرجع التقليد',
    defaultEnabled: false,
  },
  {
    key: 'paymentApprovalStatus',
    group: 'primary',
    mergeAcrossFamily: true,
    label: 'حالة السداد / الاعتماد',
    shortHeader: 'حالة السداد / الاعتماد',
    defaultEnabled: false,
  },
  {
    key: 'notesSignature',
    group: 'primary',
    mergeAcrossFamily: false,
    label: 'خانة ملاحظات / توقيع أو تحضير يدوي',
    shortHeader: 'ملاحظات / توقيع وتحضير',
    defaultEnabled: false,
  },
];

const COMPANION_GROUP_COLS = COMPANION_ROSTER_COLUMNS.filter((c) => c.group === 'companion');
const PRIMARY_GROUP_COLS = COMPANION_ROSTER_COLUMNS.filter((c) => c.group === 'primary');

function buildDefaultColumnSelection(): Record<CompanionRosterColumnKey, boolean> {
  const selection = {} as Record<CompanionRosterColumnKey, boolean>;
  COMPANION_ROSTER_COLUMNS.forEach((col) => {
    selection[col.key] = col.defaultEnabled;
  });
  return selection;
}

interface CompanionEntry {
  orderNumber: number; // 1..10
  name: string;
  nationalId: string;
  relation: string;
}

interface FamilyGroupRow {
  familyKey: string;
  pilgrim: Pilgrim;
  primaryName: string;
  primaryNationalId: string;
  primaryMobileDisplay: string;
  primaryGender: string;
  packageTransportDisplay: string;
  madinahPrivateRoomDisplay: string;
  hasMadinahPrivateRoom: boolean;
  mutawwifName: string;
  marjiName: string;
  paymentApprovalDisplay: string;
  isApprovedOrPaid: boolean;
  seasonYear: string;
  companions: CompanionEntry[];
}

interface CompanionsMahramRosterPanelProps {
  activePilgrims: Pilgrim[];
  packages: HajjPackage[];
  seasons?: HajjSeason[];
  currentAdminUser: AdminUser | null;
  campaignSettings: CampaignSettings;
}

function normalizeText(value?: string): string {
  return (value || '').trim().toLowerCase();
}

function extractPilgrimSeasonYear(p: Pilgrim): string {
  if (p.seasonYear?.trim()) {
    const clean = p.seasonYear.replace(/[^0-9]/g, '');
    if (clean.length === 4) return clean;
  }
  if (p.hajjYear?.trim()) {
    const clean = p.hajjYear.replace(/[^0-9]/g, '');
    if (clean.length === 4) return clean;
  }
  if (p.season?.trim()) {
    const match = p.season.match(/\d{4}/);
    if (match) return match[0];
  }
  if (p.id && p.id.includes('_')) {
    const suffix = p.id.split('_').pop()?.replace(/[^0-9]/g, '');
    if (suffix && suffix.length === 4) return suffix;
  }
  return '1448';
}

function getPilgrimPackageTransport(p: Pilgrim): string {
  const pkg = (p.selectedPackage || p.packageType || '').trim();
  const transportRaw = (p.transport || '').trim();
  let transportLabel = transportRaw;
  if (!transportLabel) {
    if (pkg.includes('طيران') || p.flightNumberOutbound || p.flightTicketNumber) {
      transportLabel = 'طيران';
    } else if (pkg.includes('باص') || pkg.includes('حافلة') || p.busNumber) {
      transportLabel = 'باص';
    }
  } else if (transportLabel === 'طائرة') {
    transportLabel = 'طيران';
  } else if (transportLabel === 'حافلة') {
    transportLabel = 'باص';
  }

  const busLabel = p.busNumber?.trim() ? `باص ${p.busNumber.trim()}` : '';
  const parts: string[] = [];
  if (pkg) parts.push(pkg);
  if (transportLabel && !pkg.includes(transportLabel)) {
    parts.push(transportLabel);
  }
  if (busLabel) parts.push(busLabel);

  return parts.length > 0 ? parts.join(' — ') : 'غير محدد';
}

function getPilgrimPaymentApproval(p: Pilgrim): { label: string; isPositive: boolean } {
  const status = (p.status || '').trim();
  const paid =
    p.paymentReceived === true ||
    status === 'مكتمل' ||
    status === 'مكتمل الدفع';
  const accepted =
    status === 'تم القبول' ||
    status === 'مقبول ومؤكد' ||
    p.documentsReceived === true;

  if (paid && accepted) {
    return { label: 'مؤكد السداد ومعتمد', isPositive: true };
  }
  if (paid) {
    return { label: 'تم السداد (مكتمل الدفع)', isPositive: true };
  }
  if (accepted) {
    return { label: status || 'تم القبول والاعتماد', isPositive: true };
  }
  const paidNum = Number(String(p.paidAmount || '').replace(/[^0-9.]/g, '')) || 0;
  if (paidNum > 0) {
    return { label: `دفعة جزئية (${paidNum.toLocaleString()} ر.س)`, isPositive: false };
  }
  return { label: status || 'قيد المراجعة / بانتظار السداد', isPositive: false };
}

function getCellValue(
  family: FamilyGroupRow,
  companion: CompanionEntry,
  key: CompanionRosterColumnKey
): string {
  switch (key) {
    case 'companionName':
      return companion.name || '—';
    case 'companionNationalId':
      return companion.nationalId || '—';
    case 'companionRelation':
      return companion.relation || 'غير محدد';
    case 'companionOrder':
      return `المرافق ${companion.orderNumber}`;
    case 'primaryName':
      return family.primaryName;
    case 'primaryNationalId':
      return family.primaryNationalId || '—';
    case 'primaryMobile':
      return family.primaryMobileDisplay;
    case 'primaryGender':
      return family.primaryGender;
    case 'packageTransport':
      return family.packageTransportDisplay;
    case 'madinahPrivateRoom':
      return family.madinahPrivateRoomDisplay;
    case 'mutawwifName':
      return family.mutawwifName;
    case 'marjiName':
      return family.marjiName;
    case 'paymentApprovalStatus':
      return family.paymentApprovalDisplay;
    case 'notesSignature':
      return '';
    default:
      return '—';
  }
}

export const CompanionsMahramRosterPanel: React.FC<CompanionsMahramRosterPanelProps> = ({
  activePilgrims,
  packages,
  seasons = [],
  currentAdminUser,
  campaignSettings,
}) => {
  // Live Mutawwif assignment map from religious_pilgrim_progress (with safeStorage hydration)
  const [progressRecords, setProgressRecords] = useState<PilgrimEducationalProgress[]>(() => {
    const parsed = safeStorage.getJSON<unknown>('qaem_rel_progress_v1', []);
    return Array.isArray(parsed) ? (parsed as PilgrimEducationalProgress[]) : [];
  });

  useEffect(() => {
    const unsub = subscribeToCollection<PilgrimEducationalProgress>(
      'religious_pilgrim_progress',
      (docs) => {
        if (Array.isArray(docs) && docs.length > 0) {
          setProgressRecords(docs);
        }
      }
    );
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const mutawwifLookup = useMemo(() => {
    const map = new Map<string, string>();
    progressRecords.forEach((rec) => {
      const name = (rec.assignedMutawwifName || '').trim();
      if (!name) return;
      if (rec.pilgrimId) map.set(rec.pilgrimId.trim(), name);
      if (rec.nationalId) map.set(rec.nationalId.trim(), name);
      if (rec.id) map.set(rec.id.trim(), name);
    });
    return map;
  }, [progressRecords]);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [relationFilter, setRelationFilter] = useState('all');
  const [packageFilter, setPackageFilter] = useState('all');
  const [madinahRoomFilter, setMadinahRoomFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [seasonFilter, setSeasonFilter] = useState('all');

  // Dynamic Column Selector State (Shared across Screen Table + PDF + Excel, persisted in localStorage)
  const [selectedColumns, setSelectedColumns] = useState<Record<CompanionRosterColumnKey, boolean>>(
    () =>
      loadPersistedColumnSelection(
        'companionsList',
        COMPANION_ROSTER_COLUMNS
      ) as Record<CompanionRosterColumnKey, boolean>
  );
  const [showColumnConfigurator, setShowColumnConfigurator] = useState(true);

  // PDF Preview & Export States
  const [showPdfPreviewModal, setShowPdfPreviewModal] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  const pdfPageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showPdfPreviewModal) return;
    document.body.classList.add('qaem-printing-report');
    return () => {
      document.body.classList.remove('qaem-printing-report');
    };
  }, [showPdfPreviewModal]);

  const showToast = (msg: string) => {
    setToastNotice(msg);
    setTimeout(() => {
      setToastNotice((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Build master list of all active primary pilgrims who have registered companions/mahrams (1..10+)
  const allFamilyGroups = useMemo<FamilyGroupRow[]>(() => {
    const groups: FamilyGroupRow[] = [];

    activePilgrims.forEach((p, idx) => {
      const rawDetails = Array.isArray(p.mahramDetails) ? p.mahramDetails : [];
      const validCompanions: CompanionEntry[] = rawDetails
        .map((m, mIdx) => ({
          orderNumber: mIdx + 1,
          name: (m?.name || '').trim(),
          nationalId: (m?.nationalId || '').trim(),
          relation: (m?.relation || '').trim(),
        }))
        .filter((m) => Boolean(m.name || m.nationalId || m.relation));

      if (validCompanions.length === 0) return;

      const primaryName = getPilgrimDisplayName(p);
      const primaryNationalId = (p.nationalId || '').trim();
      const mobile = (p.mobile || '').trim();
      const whatsapp = (p.whatsapp || '').trim();
      const primaryMobileDisplay =
        mobile && whatsapp && mobile !== whatsapp
          ? `${mobile} / واتساب: ${whatsapp}`
          : mobile || whatsapp || '—';

      const mutawwifName =
        (p.id && mutawwifLookup.get(p.id.trim())) ||
        (primaryNationalId && mutawwifLookup.get(primaryNationalId)) ||
        'غير معيّن بعد';

      const paymentInfo = getPilgrimPaymentApproval(p);
      const hasPrivateRoom = Boolean(p.madinahPrivateRoomRequested);
      const madinahNote = (p.madinahPrivateRoomNote || '').trim();

      groups.push({
        familyKey: p.id || primaryNationalId || `fam-${idx}`,
        pilgrim: p,
        primaryName,
        primaryNationalId,
        primaryMobileDisplay,
        primaryGender: (p.gender || '').trim() || '—',
        packageTransportDisplay: getPilgrimPackageTransport(p),
        madinahPrivateRoomDisplay: hasPrivateRoom
          ? madinahNote
            ? `نعم (${madinahNote})`
            : 'نعم'
          : 'لا',
        hasMadinahPrivateRoom: hasPrivateRoom,
        mutawwifName,
        marjiName: getPilgrimEffectiveMarji(p),
        paymentApprovalDisplay: paymentInfo.label,
        isApprovedOrPaid: paymentInfo.isPositive,
        seasonYear: extractPilgrimSeasonYear(p),
        companions: validCompanions,
      });
    });

    return groups;
  }, [activePilgrims, mutawwifLookup]);

  // Dynamic Filter Options derived from real records
  const availableRelations = useMemo(() => {
    const counts = new Map<string, number>();
    allFamilyGroups.forEach((fam) => {
      fam.companions.forEach((comp) => {
        const rel = comp.relation || 'غير محدد';
        counts.set(rel, (counts.get(rel) || 0) + 1);
      });
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [allFamilyGroups]);

  const availablePackages = useMemo(() => {
    const set = new Set<string>();
    packages.forEach((pkg) => {
      if (pkg.title?.trim()) set.add(pkg.title.trim());
    });
    allFamilyGroups.forEach((fam) => {
      const pkg = (fam.pilgrim.selectedPackage || fam.pilgrim.packageType || '').trim();
      if (pkg) set.add(pkg);
    });
    return Array.from(set);
  }, [packages, allFamilyGroups]);

  const availableSeasons = useMemo(() => {
    const years = new Set<string>();
    years.add(getActiveSeasonYear(campaignSettings));
    seasons.forEach((s) => {
      const clean = (s.hijriYear || s.id || '').replace(/[^0-9]/g, '');
      if (clean.length === 4) years.add(clean);
    });
    allFamilyGroups.forEach((fam) => {
      if (fam.seasonYear) years.add(fam.seasonYear);
    });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [seasons, allFamilyGroups, campaignSettings]);

  // Apply all filters cleanly while preserving family grouping
  const filteredFamilies = useMemo<FamilyGroupRow[]>(() => {
    const q = normalizeText(searchQuery);

    return allFamilyGroups
      .map((fam) => {
        // 1. Season filter
        if (seasonFilter !== 'all' && !isPilgrimInSeason(fam.pilgrim, seasonFilter)) {
          return null;
        }

        // 2. Package filter
        if (packageFilter !== 'all') {
          const pkg = (fam.pilgrim.selectedPackage || fam.pilgrim.packageType || '').trim();
          if (pkg !== packageFilter) return null;
        }

        // 3. Madinah private room filter
        if (madinahRoomFilter === 'yes' && !fam.hasMadinahPrivateRoom) return null;
        if (madinahRoomFilter === 'no' && fam.hasMadinahPrivateRoom) return null;

        // 4. Relation filter (keeps matching companions inside the family)
        let matchingCompanions = fam.companions;
        if (relationFilter !== 'all') {
          matchingCompanions = matchingCompanions.filter(
            (c) => (c.relation || 'غير محدد') === relationFilter
          );
          if (matchingCompanions.length === 0) return null;
        }

        // 5. Search query (matches Primary Pilgrim OR any Companion!)
        if (q) {
          const primaryMatches =
            normalizeText(fam.primaryName).includes(q) ||
            normalizeText(fam.primaryNationalId).includes(q) ||
            normalizeText(fam.primaryMobileDisplay).includes(q) ||
            normalizeText(fam.mutawwifName).includes(q);

          if (!primaryMatches) {
            const companionMatches = matchingCompanions.filter(
              (c) =>
                normalizeText(c.name).includes(q) ||
                normalizeText(c.nationalId).includes(q) ||
                normalizeText(c.relation).includes(q)
            );
            if (companionMatches.length === 0) return null;
            matchingCompanions = companionMatches;
          }
        }

        return {
          ...fam,
          companions: matchingCompanions,
        };
      })
      .filter((item): item is FamilyGroupRow => Boolean(item));
  }, [
    allFamilyGroups,
    searchQuery,
    relationFilter,
    packageFilter,
    madinahRoomFilter,
    seasonFilter,
  ]);

  // Live Statistics
  const totalFamiliesAll = allFamilyGroups.length;
  const totalCompanionsAll = useMemo(
    () => allFamilyGroups.reduce((sum, f) => sum + f.companions.length, 0),
    [allFamilyGroups]
  );

  const filteredFamiliesCount = filteredFamilies.length;
  const filteredCompanionsCount = useMemo(
    () => filteredFamilies.reduce((sum, f) => sum + f.companions.length, 0),
    [filteredFamilies]
  );

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    relationFilter !== 'all' ||
    packageFilter !== 'all' ||
    madinahRoomFilter !== 'all' ||
    seasonFilter !== 'all';

  const handleClearFilters = () => {
    setSearchQuery('');
    setRelationFilter('all');
    setPackageFilter('all');
    setMadinahRoomFilter('all');
    setSeasonFilter('all');
  };

  // Ordered Active Columns (Primary first or Companion first? Let's put Primary pilgrim columns first when selected, followed by Companion columns, then Notes/Signature — super natural RTL family reading order!)
  const orderedActiveColumns = useMemo<CompanionRosterColumnDef[]>(() => {
    const primaryCols = COMPANION_ROSTER_COLUMNS.filter(
      (c) => c.group === 'primary' && c.key !== 'notesSignature' && selectedColumns[c.key]
    );
    const companionCols = COMPANION_ROSTER_COLUMNS.filter(
      (c) => c.group === 'companion' && selectedColumns[c.key]
    );
    const notesCol = COMPANION_ROSTER_COLUMNS.filter(
      (c) => c.key === 'notesSignature' && selectedColumns[c.key]
    );
    return [...primaryCols, ...companionCols, ...notesCol];
  }, [selectedColumns]);

  const updateSelectedColumns = (
    updater: (
      prev: Record<CompanionRosterColumnKey, boolean>
    ) => Record<CompanionRosterColumnKey, boolean>
  ) => {
    setSelectedColumns((prev) => {
      const next = updater(prev);
      savePersistedColumnSelection('companionsList', next);
      return next;
    });
  };

  const toggleColumn = (key: CompanionRosterColumnKey) => {
    updateSelectedColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectAllColumns = () => {
    updateSelectedColumns(() => {
      const next = {} as Record<CompanionRosterColumnKey, boolean>;
      COMPANION_ROSTER_COLUMNS.forEach((c) => {
        next[c.key] = true;
      });
      return next;
    });
  };

  const handleDeselectAllColumns = () => {
    updateSelectedColumns(() => {
      const next = {} as Record<CompanionRosterColumnKey, boolean>;
      COMPANION_ROSTER_COLUMNS.forEach((c) => {
        next[c.key] = false;
      });
      return next;
    });
  };

  const handleResetDefaultColumns = () => {
    updateSelectedColumns(() => buildDefaultColumnSelection());
  };

  // Active Filter Description for Reports
  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (seasonFilter !== 'all') parts.push(`الموسم: ${seasonFilter}هـ`);
    if (relationFilter !== 'all') parts.push(`صلة القرابة: ${relationFilter}`);
    if (packageFilter !== 'all') parts.push(`الباقة: ${packageFilter}`);
    if (madinahRoomFilter === 'yes') parts.push('طلب غرفة خاصة بالمدينة: نعم');
    if (madinahRoomFilter === 'no') parts.push('طلب غرفة خاصة بالمدينة: لا');
    if (searchQuery.trim()) parts.push(`بحث: "${searchQuery.trim()}"`);
    return parts.length > 0 ? parts.join(' • ') : 'كشف شامل لجميع العوائل والمرافقين المسجلين';
  }, [seasonFilter, relationFilter, packageFilter, madinahRoomFilter, searchQuery]);

  const activeSeasonDisplay =
    seasonFilter !== 'all'
      ? `موسم حج ${seasonFilter}هـ`
      : `موسم حج ${getActiveSeasonYear(campaignSettings)}هـ`;

  const generatedByName =
    currentAdminUser?.fullName || currentAdminUser?.username || 'إدارة قافلة القائم';

  const nowDate = useMemo(
    () =>
      new Date().toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    []
  );
  const nowTime = useMemo(
    () =>
      new Date().toLocaleTimeString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    []
  );

  // Excel (.xlsx) Export with Strict Text Format Protection on IDs & Mobiles
  const handleExportExcel = async () => {
    if (isGeneratingExcel || orderedActiveColumns.length === 0) return;
    setIsGeneratingExcel(true);
    try {
      const headers = ['م العائلة', ...orderedActiveColumns.map((col) => col.label)];
      const rows: (string | number)[][] = [];

      filteredFamilies.forEach((fam, famIdx) => {
        fam.companions.forEach((comp) => {
          const rowValues: (string | number)[] = [
            famIdx + 1,
            ...orderedActiveColumns.map((col) => getCellValue(fam, comp, col.key)),
          ];
          rows.push(rowValues);
        });
      });

      const dateStamp = new Date().toISOString().split('T')[0];

      await exportAlQaemExcelReport({
        reportTitle: 'كشف المرافقين والمحارم — قافلة القائم للحج والعمرة والزيارة',
        subtitle: activeFilterSummary,
        category: 'إدارة الحجاج — كشف المرافقين والمحارم',
        filename: `كشف_المرافقين_والمحارم_${dateStamp}`,
        columns: headers,
        rows,
        generatedBy: generatedByName,
        summaryCards: [
          { label: 'إجمالي العوائل / المجموعات', value: `${filteredFamiliesCount} عائلة` },
          { label: 'إجمالي الحجاج الرئيسيين', value: `${filteredFamiliesCount} حاج` },
          { label: 'إجمالي المرافقين والمحارم', value: `${filteredCompanionsCount} مرافق` },
          { label: 'الموسم المعتمد', value: activeSeasonDisplay },
        ],
      });

      showToast(
        `تم تصدير ملف Excel (.xlsx) بنجاح (${filteredFamiliesCount} عائلة — ${filteredCompanionsCount} مرافق) مع حماية نصية كاملة لأرقام الهويات والجوالات.`
      );
    } catch (err) {
      console.error('Companions Excel export error:', err);
      showToast('تعذر تصدير ملف Excel، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsGeneratingExcel(false);
    }
  };

  // Direct Official PDF Download (A4 Portrait / Auto-Landscape)
  const handleDownloadPdf = async () => {
    if (isGeneratingPdf || !pdfPageRef.current || orderedActiveColumns.length === 0) return;
    setIsGeneratingPdf(true);
    try {
      const pdfOrientation = getAutoOrientationForColumnCount(orderedActiveColumns.length);
      const pdf = new jsPDF({
        orientation: pdfOrientation,
        unit: 'mm',
        format: 'a4',
      });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginMm = 8;
      const printableW = pageW - marginMm * 2;
      const printableH = pageH - marginMm * 2;

      const dataUrl = await toPng(pdfPageRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });

      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const scaledH = (img.height * printableW) / img.width;

      if (scaledH <= printableH) {
        pdf.addImage(dataUrl, 'PNG', marginMm, marginMm, printableW, scaledH);
      } else {
        let heightLeft = scaledH;
        let sliceIndex = 0;
        while (heightLeft > 0) {
          if (sliceIndex > 0) pdf.addPage();
          pdf.addImage(
            dataUrl,
            'PNG',
            marginMm,
            marginMm - sliceIndex * printableH,
            printableW,
            scaledH
          );
          heightLeft -= printableH;
          sliceIndex += 1;
        }
      }

      const dateStamp = new Date().toISOString().split('T')[0];
      pdf.save(`كشف_المرافقين_والمحارم_${dateStamp}.pdf`);
      showToast('تم تحميل الكشف الرسمي بصيغة PDF (A4) بنجاح.');
    } catch (err) {
      console.error('Companions PDF download error:', err);
      showToast('تعذر تجهيز ملف PDF، يمكنك استخدام زر الطباعة الرسمية (A4) وحفظه كـ PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrintOfficial = () => {
    window.print();
  };

  const renderStyledTableCell = (
    family: FamilyGroupRow,
    companion: CompanionEntry,
    col: CompanionRosterColumnDef,
    isPrintMode: boolean
  ) => {
    const val = getCellValue(family, companion, col.key);

    if (col.key === 'companionRelation') {
      return (
        <span
          className={
            isPrintMode
              ? 'inline-block px-2 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-900 font-bold text-[11px]'
              : 'inline-block px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-bold text-[11px]'
          }
        >
          {val}
        </span>
      );
    }

    if (col.key === 'companionOrder') {
      return (
        <span
          className={
            isPrintMode
              ? 'inline-block px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-800 font-bold text-[10px] whitespace-nowrap'
              : 'inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[11px] whitespace-nowrap'
          }
        >
          {val}
        </span>
      );
    }

    if (col.key === 'madinahPrivateRoom') {
      return (
        <span
          className={
            family.hasMadinahPrivateRoom
              ? isPrintMode
                ? 'inline-block px-2 py-0.5 rounded bg-amber-50 border border-amber-400 text-amber-900 font-black text-[11px]'
                : 'inline-block px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold text-[11px]'
              : isPrintMode
              ? 'text-slate-600 text-[11px]'
              : 'text-slate-400 text-xs'
          }
        >
          {val}
        </span>
      );
    }

    if (col.key === 'paymentApprovalStatus') {
      return (
        <span
          className={
            family.isApprovedOrPaid
              ? isPrintMode
                ? 'inline-block px-2 py-0.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-[11px]'
                : 'inline-block px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]'
              : isPrintMode
              ? 'inline-block px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700 font-bold text-[11px]'
              : 'inline-block px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-[11px]'
          }
        >
          {val}
        </span>
      );
    }

    if (col.key === 'primaryName') {
      return (
        <div>
          <div className={isPrintMode ? 'font-black text-slate-950' : 'font-bold text-slate-900 dark:text-white'}>
            {val}
          </div>
          <div
            className={
              isPrintMode
                ? 'text-[10px] font-bold text-amber-800 mt-0.5'
                : 'text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-0.5'
            }
          >
            {family.companions.length === 1
              ? 'مرافق واحد'
              : family.companions.length === 2
              ? 'مرافقان'
              : `${family.companions.length} مرافقين`}
          </div>
        </div>
      );
    }

    if (col.key === 'primaryMobile' && !isPrintMode && family.pilgrim.mobile) {
      return (
        <a
          href={`tel:${family.pilgrim.mobile}`}
          className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-slate-800 dark:text-slate-200 hover:text-amber-500 transition"
          dir="ltr"
        >
          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
          <span>{val}</span>
        </a>
      );
    }

    if (col.key === 'notesSignature') {
      return (
        <div
          className={
            isPrintMode
              ? 'min-w-[100px] h-5 border-b border-dashed border-slate-300'
              : 'min-w-[110px] h-5 border-b border-dashed border-slate-300 dark:border-slate-700'
          }
        />
      );
    }

    return <span>{val}</span>;
  };

  return (
    <div className="space-y-5 animate-fadeIn" dir="rtl">
      {/* Toast Notification */}
      {toastNotice && (
        <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{toastNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastNotice(null)}
            className="text-emerald-600 dark:text-emerald-300 hover:opacity-75 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Executive Header + Direct Export Actions */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-500 shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  كشف المرافقين والمحارم
                </h2>
                <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-black">
                  ترابط عائلي ديناميكي (1 — 10 مرافقين)
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                عرض منظم للحجاج الرئيسيين وقائمة المرافقين والمحارم المرتبطين بهم مع تخصيص كامل للأعمدة وتصدير فوري بصيغتي PDF الرسمي (A4) و Excel.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isGeneratingExcel || orderedActiveColumns.length === 0 || filteredFamiliesCount === 0}
              className="px-4 py-2.5 rounded-xl bg-[#12192C] hover:bg-slate-800 disabled:opacity-50 text-[#F4C84A] border border-[#C5A45D] text-xs font-black shadow-sm flex items-center gap-2 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#20B995]" />
              <span>{isGeneratingExcel ? 'جاري التصدير...' : 'تصدير Excel (.xlsx)'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPdfPreviewModal(true)}
              disabled={orderedActiveColumns.length === 0 || filteredFamiliesCount === 0}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black shadow-md flex items-center gap-2 transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>معاينة وطباعة PDF الرسمي (A4)</span>
            </button>
          </div>
        </div>

        {/* 2. Live Summary KPI Counters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-5 border-t border-slate-200 dark:border-slate-800">
          <div className="bg-slate-50 dark:bg-[#0B1221] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">
                إجمالي العوائل / المجموعات
              </span>
              <strong className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1 block">
                {filteredFamiliesCount}
              </strong>
              {hasActiveFilters && filteredFamiliesCount !== totalFamiliesAll && (
                <span className="text-[10px] font-bold text-slate-400">
                  من أصل {totalFamiliesAll} عائلة مسجلة
                </span>
              )}
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
              <Home className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-[#0B1221] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">
                إجمالي الحجاج الرئيسيين
              </span>
              <strong className="text-2xl font-black font-mono text-sky-600 dark:text-sky-400 mt-1 block">
                {filteredFamiliesCount}
              </strong>
              <span className="text-[10px] font-bold text-slate-400">
                أصحاب الطلبات المرتبط بهم مرافقون
              </span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-500 shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-[#0B1221] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">
                إجمالي المرافقين والمحارم
              </span>
              <strong className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1 block">
                {filteredCompanionsCount}
              </strong>
              {hasActiveFilters && filteredCompanionsCount !== totalCompanionsAll ? (
                <span className="text-[10px] font-bold text-slate-400">
                  من أصل {totalCompanionsAll} مرافق مسجل
                </span>
              ) : (
                <span className="text-[10px] font-bold text-slate-400">
                  بمتوسط{' '}
                  {filteredFamiliesCount > 0
                    ? (filteredCompanionsCount / filteredFamiliesCount).toFixed(1)
                    : '0'}{' '}
                  مرافق لكل عائلة
                </span>
              )}
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Quick Search & Multi-Criteria Filter Bar */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-black text-slate-700 dark:text-amber-400">
            <Filter className="w-4 h-4 text-amber-500" />
            <span>البحث السريع والتصفية المتقدمة</span>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-xs font-bold text-rose-500 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>مسح جميع الفلاتر</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input (Primary OR Companion) */}
          <div className="sm:col-span-2 lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم أو الهوية أو الجوال (للحاج الرئيسي أو المرافق)..."
              className="w-full bg-slate-50 dark:bg-[#0B1221] border border-slate-300 dark:border-slate-700 rounded-xl pr-10 pl-3 py-2.5 text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          {/* Relation Filter */}
          <select
            value={relationFilter}
            onChange={(e) => setRelationFilter(e.target.value)}
            className="bg-slate-50 dark:bg-[#0B1221] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 transition"
          >
            <option value="all">صلة القرابة: الكل ({totalCompanionsAll})</option>
            {availableRelations.map(([rel, cnt]) => (
              <option key={rel} value={rel}>
                {rel} ({cnt})
              </option>
            ))}
          </select>

          {/* Package Filter */}
          <select
            value={packageFilter}
            onChange={(e) => setPackageFilter(e.target.value)}
            className="bg-slate-50 dark:bg-[#0B1221] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 transition"
          >
            <option value="all">الباقة: جميع الباقات</option>
            {availablePackages.map((pkg) => (
              <option key={pkg} value={pkg}>
                {pkg}
              </option>
            ))}
          </select>

          {/* Madinah Private Room + Season combined grid or 2 selects */}
          <div className="grid grid-cols-2 gap-2">
            <select
              value={madinahRoomFilter}
              onChange={(e) => setMadinahRoomFilter(e.target.value as 'all' | 'yes' | 'no')}
              title="طلب غرفة خاصة بالمدينة المنورة"
              className="bg-slate-50 dark:bg-[#0B1221] border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 transition"
            >
              <option value="all">غرفة المدينة: الكل</option>
              <option value="yes">غرفة خاصة: نعم</option>
              <option value="no">غرفة خاصة: لا</option>
            </select>

            <select
              value={seasonFilter}
              onChange={(e) => setSeasonFilter(e.target.value)}
              title="الموسم"
              className="bg-slate-50 dark:bg-[#0B1221] border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 transition"
            >
              <option value="all">الموسم: الكل</option>
              {availableSeasons.map((yr) => (
                <option key={yr} value={yr}>
                  موسم {yr}هـ
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 4. Dynamic Column Selector (تخصيص حقول وأعمدة الكشف) */}
      <div className="bg-white dark:bg-[#0F172A] border border-amber-500/35 rounded-3xl overflow-hidden shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-amber-500/5 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowColumnConfigurator((prev) => !prev)}
            className="flex items-center gap-2.5 text-right cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
              تخصيص حقول وأعمدة الكشف
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-mono font-black">
              {orderedActiveColumns.length} / {COMPANION_ROSTER_COLUMNS.length} عمود مفعل
            </span>
            {showColumnConfigurator ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAllColumns}
              className="px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>تحديد الكل</span>
            </button>
            <button
              type="button"
              onClick={handleDeselectAllColumns}
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
            >
              <Square className="w-3 h-3" />
              <span>إلغاء تحديد الكل</span>
            </button>
            <button
              type="button"
              onClick={handleResetDefaultColumns}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>استعادة الافتراضي</span>
            </button>
          </div>
        </div>

        {showColumnConfigurator && (
          <div className="p-4 sm:p-5 space-y-4">
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>
                الأعمدة المختارة أدناه تنعكس فوراً على جدول العرض المباشر وعلى ملفات الطباعة (PDF الرسمي) وتصدير (Excel).
              </span>
            </p>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              {/* Group 1: أعمدة بيانات المرافق / المحرم */}
              <div className="xl:col-span-4 bg-slate-50 dark:bg-[#0B1221] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                    1) أعمدة بيانات المرافق / المحرم
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-400">
                    {COMPANION_GROUP_COLS.filter((c) => selectedColumns[c.key]).length} /{' '}
                    {COMPANION_GROUP_COLS.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {COMPANION_GROUP_COLS.map((col) => {
                    const checked = selectedColumns[col.key];
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                          checked
                            ? 'bg-emerald-500/10 border-emerald-500/45 text-slate-900 dark:text-white'
                            : 'bg-white dark:bg-[#10192D] border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleColumn(col.key)}
                          className="w-4 h-4 accent-emerald-500 rounded cursor-pointer shrink-0"
                        />
                        <span className="leading-snug">{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Group 2: أعمدة بيانات الحاج الرئيسي وتفاصيل الرحلة */}
              <div className="xl:col-span-8 bg-slate-50 dark:bg-[#0B1221] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <span className="text-xs font-black text-amber-600 dark:text-amber-400">
                    2) أعمدة بيانات الحاج الرئيسي (المرتبط به) وتفاصيل الرحلة
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-400">
                    {PRIMARY_GROUP_COLS.filter((c) => selectedColumns[c.key]).length} /{' '}
                    {PRIMARY_GROUP_COLS.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PRIMARY_GROUP_COLS.map((col) => {
                    const checked = selectedColumns[col.key];
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                          checked
                            ? 'bg-amber-500/10 border-amber-500/45 text-slate-900 dark:text-white'
                            : 'bg-white dark:bg-[#10192D] border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleColumn(col.key)}
                          className="w-4 h-4 accent-amber-500 rounded cursor-pointer shrink-0"
                        />
                        <span className="leading-snug">{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Warning if all columns deselected */}
      {orderedActiveColumns.length === 0 && (
        <div className="bg-amber-500/15 border border-amber-500/40 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>لم تقم بتحديد أي عمود للعرض حالياً — يرجى اختيار عمود واحد على الأقل لعرض الكشف وتصديره.</span>
          </div>
          <button
            type="button"
            onClick={handleResetDefaultColumns}
            className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-black text-xs cursor-pointer"
          >
            استعادة الأعمدة الافتراضية
          </button>
        </div>
      )}

      {/* 5. Live Family-Grouped Roster Table */}
      {orderedActiveColumns.length > 0 && (
        <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
              <Eye className="w-4 h-4 text-amber-500" />
              <span>
                معرض البيانات المترابط عائلياً: <strong className="text-slate-900 dark:text-white">{filteredFamiliesCount}</strong> عائلة تضم{' '}
                <strong className="text-emerald-600 dark:text-emerald-400">{filteredCompanionsCount}</strong> مرافق ومحرم
              </span>
            </div>
            <span className="text-[11px] font-bold text-slate-400">
              كل عائلة مميزة بلون وفواصل واضحة لضمان عدم تداخل المرافقين
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 dark:bg-[#0B1221] text-slate-700 dark:text-amber-400 border-b-2 border-slate-300 dark:border-slate-700">
                  <th className="py-3.5 px-3 text-center font-black whitespace-nowrap w-12 border-l border-slate-200 dark:border-slate-800">
                    عائلة #
                  </th>
                  {orderedActiveColumns.map((col) => (
                    <th
                      key={col.key}
                      className={`py-3.5 px-3.5 font-black whitespace-nowrap border-l border-slate-200 dark:border-slate-800 ${
                        col.group === 'companion'
                          ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/5'
                          : ''
                      }`}
                    >
                      {col.shortHeader}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredFamilies.length === 0 ? (
                  <tr>
                    <td
                      colSpan={orderedActiveColumns.length + 1}
                      className="py-14 px-6 text-center text-slate-400 font-bold"
                    >
                      {allFamilyGroups.length === 0
                        ? 'لا يوجد حجاج نشطون لديهم مرافقون أو محارم مسجلون حالياً.'
                        : 'لا توجد نتائج مطابقة لخيارات البحث والتصفية الحالية.'}
                    </td>
                  </tr>
                ) : (
                  filteredFamilies.map((family, famIdx) => {
                    const rowSpan = family.companions.length;
                    const isAltFamily = famIdx % 2 === 1;
                    const familyRowBg = isAltFamily
                      ? 'bg-slate-50/90 dark:bg-[#131F38]/70'
                      : 'bg-white dark:bg-[#0F172A]';

                    return family.companions.map((companion, compIdx) => {
                      const isFirstInFamily = compIdx === 0;
                      const isLastInFamily = compIdx === rowSpan - 1;
                      const bottomBorderClass = isLastInFamily
                        ? 'border-b-2 border-slate-300 dark:border-slate-700'
                        : 'border-b border-slate-200/70 dark:border-slate-800/70';

                      return (
                        <tr
                          key={`${family.familyKey}-comp-${companion.orderNumber}-${compIdx}`}
                          className={`${familyRowBg} hover:bg-amber-50/40 dark:hover:bg-amber-500/5 transition`}
                        >
                          {isFirstInFamily && (
                            <td
                              rowSpan={rowSpan}
                              className="py-3 px-3 text-center align-middle font-mono font-black text-amber-600 dark:text-amber-400 border-l border-slate-200 dark:border-slate-800 border-b-2 border-b-slate-300 dark:border-b-slate-700 bg-amber-500/5"
                            >
                              {famIdx + 1}
                            </td>
                          )}

                          {orderedActiveColumns.map((col) => {
                            if (col.mergeAcrossFamily) {
                              if (!isFirstInFamily) return null;
                              return (
                                <td
                                  key={col.key}
                                  rowSpan={rowSpan}
                                  dir={col.key === 'primaryNationalId' ? 'ltr' : 'rtl'}
                                  className={`py-3 px-3.5 align-middle border-l border-slate-200 dark:border-slate-800 border-b-2 border-b-slate-300 dark:border-b-slate-700 ${
                                    col.isTextProtected
                                      ? 'font-mono font-bold text-slate-800 dark:text-slate-200'
                                      : 'text-slate-700 dark:text-slate-200'
                                  }`}
                                >
                                  {renderStyledTableCell(family, companion, col, false)}
                                </td>
                              );
                            }

                            return (
                              <td
                                key={col.key}
                                dir={col.key === 'companionNationalId' ? 'ltr' : 'rtl'}
                                className={`py-3 px-3.5 align-middle border-l border-slate-200 dark:border-slate-800 ${bottomBorderClass} ${
                                  col.key === 'companionName'
                                    ? 'font-bold text-slate-900 dark:text-white'
                                    : col.isTextProtected
                                    ? 'font-mono font-bold text-slate-800 dark:text-slate-200'
                                    : 'text-slate-700 dark:text-slate-200'
                                }`}
                              >
                                {renderStyledTableCell(family, companion, col, false)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    });
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Official A4 PDF Preview & Print Modal (Al-Qaem Triple Header + Family RowSpan Grouping) */}
      {showPdfPreviewModal &&
        createPortal(
          <div
            className="qaem-print-portal fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn"
            dir="rtl"
          >
            <div className="qaem-print-shell bg-[#0B1221] border border-amber-500/40 rounded-3xl w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden my-auto">
              {/* Top Action Bar (Screen Only) */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-800 bg-[#0F172A] shrink-0 print:hidden">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-400 shrink-0">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-white">
                      معاينة الكشف الرسمي للمرافقين والمحارم (PDF A4 & Excel)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      يظهر فقط الأعمدة المحددة ({orderedActiveColumns.length} أعمدة) مع تجميع عائلي واضح لكل حاج رئيسي ومرافقيه
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    disabled={isGeneratingExcel || orderedActiveColumns.length === 0}
                    className="px-3.5 py-2 rounded-xl bg-[#12192C] hover:bg-slate-800 disabled:opacity-60 text-[#F4C84A] border border-[#C5A45D] text-xs font-black shadow-md flex items-center gap-2 transition cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-[#20B995]" />
                    <span>{isGeneratingExcel ? 'جاري التجهيز...' : 'تصدير Excel (.xlsx)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isGeneratingPdf || orderedActiveColumns.length === 0}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-black shadow-md flex items-center gap-2 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isGeneratingPdf ? 'جاري تجهيز PDF...' : 'تحميل PDF مباشر'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintOfficial}
                    disabled={orderedActiveColumns.length === 0}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-black shadow-md flex items-center gap-2 transition cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة رسمية (A4)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowPdfPreviewModal(false)}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    aria-label="إغلاق"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Printable Official A4 Sheet */}
              <div className="qaem-print-scroll p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-200 print:bg-white print:p-0">
                <div
                  ref={pdfPageRef}
                  className="bg-white text-slate-950 rounded-2xl p-6 sm:p-8 shadow-lg border border-slate-200 max-w-5xl mx-auto print:shadow-none print:border-0 print:rounded-none print:p-4"
                  dir="rtl"
                >
                  {/* 1. Al-Qaem Official Triple Header */}
                  <div className="border-b-2 border-amber-600 pb-4 mb-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-right space-y-1">
                      <span className="text-[11px] font-bold text-amber-800 block">
                        المملكة العربية السعودية • وزارة الحج والعمرة
                      </span>
                      <h1 className="text-lg sm:text-xl font-black text-slate-900">
                        قافلة القائم للحج والعمرة والزيارة
                      </h1>
                      <p className="text-xs font-bold text-amber-700">
                        إدارة شؤون الحجاج — قسم المرافقين والمحارم والترابط العائلي
                      </p>
                    </div>

                    <div className="text-center shrink-0">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white border-2 border-amber-500/50 shadow-sm flex items-center justify-center p-1.5 mx-auto">
                        <img
                          src="/assets/aistudio/media_1794134676879_98f1e0ea.png"
                          alt="شعار قافلة القائم"
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (!img.src.includes('Screenshot_20261107_174409')) {
                              img.src =
                                '/assets/aistudio/Screenshot_20261107_174409_com_instagram_android_InstagramMainActivity_441b738d.png';
                            }
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-black text-amber-800 block mt-1">
                        نظام القائم للحج والعمرة
                      </span>
                    </div>

                    <div className="text-right text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 min-w-[195px]">
                      <p>
                        تاريخ الاستخراج: <strong className="font-mono text-slate-950">{nowDate}</strong>
                      </p>
                      <p>
                        وقت الاستخراج: <strong className="font-mono text-slate-950">{nowTime}</strong>
                      </p>
                      <p>
                        الموسم: <strong className="text-amber-800">{activeSeasonDisplay}</strong>
                      </p>
                      <p>
                        المستخرج: <strong className="text-slate-950">{generatedByName}</strong>
                      </p>
                    </div>
                  </div>

                  {/* 2. Title Banner */}
                  <div className="text-center my-4">
                    <div className="inline-block bg-amber-50 border-2 border-amber-300 rounded-2xl px-6 sm:px-8 py-2.5">
                      <h2 className="text-base sm:text-lg font-black text-slate-950">
                        كشف المرافقين والمحارم
                      </h2>
                      <p className="text-xs font-bold text-amber-800 mt-0.5">
                        {activeFilterSummary}
                      </p>
                    </div>
                  </div>

                  {/* 3. Summary Counters Bar */}
                  <div className="grid grid-cols-3 gap-2.5 my-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center">
                      <span className="text-[10px] font-bold text-slate-600 block">
                        إجمالي العوائل / المجموعات
                      </span>
                      <strong className="text-sm font-black text-slate-950 font-mono mt-0.5 block">
                        {filteredFamiliesCount} عائلة
                      </strong>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center">
                      <span className="text-[10px] font-bold text-slate-600 block">
                        إجمالي الحجاج الرئيسيين
                      </span>
                      <strong className="text-sm font-black text-slate-950 font-mono mt-0.5 block">
                        {filteredFamiliesCount} حاج رئيسي
                      </strong>
                    </div>
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 text-center">
                      <span className="text-[10px] font-bold text-amber-900 block">
                        إجمالي المرافقين والمحارم
                      </span>
                      <strong className="text-sm font-black text-amber-950 font-mono mt-0.5 block">
                        {filteredCompanionsCount} مرافق
                      </strong>
                    </div>
                  </div>

                  {/* 4. Official Family-Grouped Table (Selected Columns Only) */}
                  <div className="qaem-print-table-wrap overflow-x-auto border border-slate-300 rounded-xl mt-4">
                    <table
                      className={`w-full text-right border-collapse ${
                        orderedActiveColumns.length <= 5
                          ? 'text-[13px]'
                          : orderedActiveColumns.length === 6
                          ? 'text-xs'
                          : 'text-[11px]'
                      }`}
                    >
                      <thead>
                        <tr className="bg-slate-900 text-white">
                          <th className="py-2.5 px-2 text-center font-black border border-slate-700 w-10">
                            م
                          </th>
                          {orderedActiveColumns.map((col) => (
                            <th
                              key={col.key}
                              className="py-2.5 px-2.5 font-black border border-slate-700 whitespace-nowrap"
                            >
                              {col.shortHeader}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFamilies.map((family, famIdx) => {
                          const rowSpan = family.companions.length;
                          const familyTint = famIdx % 2 === 1 ? 'bg-amber-50/35' : 'bg-white';

                          return family.companions.map((companion, compIdx) => {
                            const isFirstInFamily = compIdx === 0;
                            const isLastInFamily = compIdx === rowSpan - 1;
                            const bottomBorder = isLastInFamily
                              ? 'border-b-2 border-b-slate-500'
                              : 'border-b border-b-slate-300';

                            return (
                              <tr
                                key={`pdf-${family.familyKey}-${companion.orderNumber}-${compIdx}`}
                                className={familyTint}
                              >
                                {isFirstInFamily && (
                                  <td
                                    rowSpan={rowSpan}
                                    className="py-2 px-2 text-center align-middle font-mono font-black text-slate-900 border border-slate-300 border-b-2 border-b-slate-500 bg-slate-100"
                                  >
                                    {famIdx + 1}
                                  </td>
                                )}

                                {orderedActiveColumns.map((col) => {
                                  if (col.mergeAcrossFamily) {
                                    if (!isFirstInFamily) return null;
                                    return (
                                      <td
                                        key={col.key}
                                        rowSpan={rowSpan}
                                        dir={col.key === 'primaryNationalId' ? 'ltr' : 'rtl'}
                                        className={`py-2 px-2.5 align-middle border border-slate-300 border-b-2 border-b-slate-500 ${
                                          col.isTextProtected
                                            ? 'font-mono font-bold text-slate-950'
                                            : 'text-slate-900'
                                        }`}
                                      >
                                        {renderStyledTableCell(family, companion, col, true)}
                                      </td>
                                    );
                                  }

                                  return (
                                    <td
                                      key={col.key}
                                      dir={col.key === 'companionNationalId' ? 'ltr' : 'rtl'}
                                      className={`py-2 px-2.5 align-middle border border-slate-300 ${bottomBorder} ${
                                        col.key === 'companionName'
                                          ? 'font-bold text-slate-950'
                                          : col.isTextProtected
                                          ? 'font-mono font-bold text-slate-950'
                                          : 'text-slate-900'
                                      }`}
                                    >
                                      {renderStyledTableCell(family, companion, col, true)}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* 5. Official Signatures Footer */}
                  <div className="qaem-avoid-break mt-6 pt-4 border-t border-slate-300 grid grid-cols-2 sm:grid-cols-3 gap-4 text-center text-xs text-slate-700">
                    <div className="space-y-4">
                      <p className="font-black text-slate-900">معدّ الكشف / شؤون الحجاج</p>
                      <p className="text-[11px] text-slate-500">{generatedByName}</p>
                      <div className="border-b border-dashed border-slate-400 w-36 mx-auto pt-2" />
                    </div>
                    <div className="space-y-4">
                      <p className="font-black text-slate-900">مشرف السكن والتنقلات</p>
                      <p className="text-[11px] text-slate-500">المراجعة والتدقيق العائلي</p>
                      <div className="border-b border-dashed border-slate-400 w-36 mx-auto pt-2" />
                    </div>
                    <div className="space-y-4 col-span-2 sm:col-span-1">
                      <p className="font-black text-slate-900">ختم واعتماد إدارة القافلة</p>
                      <p className="text-[11px] text-slate-500">قافلة القائم للحج والعمرة والزيارة</p>
                      <div className="border-b border-dashed border-slate-400 w-36 mx-auto pt-2" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
