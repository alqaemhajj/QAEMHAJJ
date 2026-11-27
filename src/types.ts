import type { PilgrimDynamicFieldSnapshotItem } from './types/dynamicForms';

export interface Pilgrim {
  id: string;
  createdAt: string;
  termsAccepted: string; // "نعم"
  firstName: string;
  secondName: string; // الاب
  thirdName: string; // الجد
  lastName: string; // العائلة
  name?: string; // الاسم الرباعي الموحد (الاسم الكامل)
  packageType?: string; // الباقة المختارة
  hotelRoom?: string; // رقم الغرفة بالسكن
  englishFullName: string;
  gender: string; // "ذكر" | "أنثى"
  nationality: string;
  nationalId: string;
  idIssueDate: string;
  idIssueDateHijri?: string;
  idExpiryDate: string;
  idExpiryDateHijri?: string;
  birthDate: string;
  birthDateHijri?: string;
  mobile: string;
  whatsapp: string;
  email: string;
  bankAccountName: string;
  iban: string;
  bankName: string;
  transport: string; // "باص" | "طائرة"
  hajjType: string; // "مستحب" | "تمتع" | "قِران" | "إفراد" | "عمرة"
  seasonYear?: string; // حقل سنة الموسم الحصري (مثال: "1448")
  hajjYear?: string; // عام الحج للموسم المسجل فيه (مثال: "1448")
  season?: string; // مسمى الموسم (مثال: "موسم حج 1448هـ")
  lastHajjYear: string;
  currentMarji: string; // مرجع التقليد الحالي (مثل السيستاني، الخامنئي، الحكيم، الشيرازي، إلخ)
  customMarji?: string; // اسم مرجع التقليد الآخر عند اختيار "مرجع آخر"
  previousMarji: string; // مرجع التقليد السابق
  madinahPrivateRoomRequested?: boolean; // طلب غرفة خاصة في المدينة المنورة (اختياري)
  madinahPrivateRoomNote?: string; // ملاحظة إضافية حول الغرفة الخاصة بالمدينة المنورة
  status: 'قيد المراجعة' | 'تم القبول' | 'مكتمل' | 'مقبول ومؤكد' | 'مكتمل الدفع' | 'معتذر' | 'مرفوض' | 'محذوف';
  rejectionReason?: string; // سبب الرفض في حال اختيار حالة "مرفوض"
  applicationStatus?: 'قيد المراجعة' | 'تم القبول' | 'مكتمل';
  documentsReceived?: boolean;
  paymentReceived?: boolean;
  statusNotes?: string;
  isDeleted?: boolean;
  mobilityIndependence?: string;
  roomNumber?: string;
  roomNumberMakkah?: string; // رقم غرفة سكن مكة المكرمة
  roomNumberMadinah?: string; // رقم غرفة السكن بالمدينة المنورة
  roomNumberMina?: string; // تسكين منى (رقم المخيم / الخيمة / المقر)
  busNumber?: string; // رقم الباص / الحافلة
  busSeat?: string; // رقم المقعد في الباص (1 - 49)
  flightNumberOutbound?: string; // بيانات رحلة الطيران (الذهاب)
  flightNumberReturn?: string; // بيانات رحلة الطيران (العودة)
  flightTicketNumber?: string; // رقم الحجز / التذكرة (PNR)
  selectedPackage?: string; // الباقة المختارة
  registrationReference: string; // رقم مرجعي مشفر للاستعلام
  nationalIdImage?: string; // رابط خارجي (External / Cloudinary URL) لصورة الهوية الوطنية
  paymentReceiptDate?: string; // تاريخ السداد المالي المعتمد
  transferAmount?: string; // المبلغ المحول
  bankReferenceNumber?: string; // رقم الحوالة البنكية / المرجع
  totalPackagePrice?: string; // إجمالي سعر الباقة
  paidAmount?: string; // إجمالي المسدد
  remainingAmount?: string; // المبلغ المتبقي
  paymentInstallments?: PaymentRecord[]; // كشف الدفعات المالية المسددة
  // Pilgrim Self-Declarations & Admin Approval (حالة السداد لوزارة الحج وتطعيمات الحج — بدون ملفات/صور)
  paymentReportedByPilgrim?: boolean; // إقرار الحاج بسداد باقة الحج لوزارة الحج
  paymentReportedDate?: string; // تاريخ السداد (ميلادي YYYY-MM-DD)
  paymentReportedDateHijri?: string; // تاريخ السداد (هجري أم القرى YYYY-MM-DD)
  paymentReportedAt?: string; // وقت إبلاغ الحاج بالسداد
  paymentApprovedByAdmin?: boolean; // اعتماد الإدارة لحالة السداد
  paymentApprovedBy?: string; // اسم المشرف الذي اعتمد السداد
  paymentApprovedAt?: string; // وقت اعتماد الإدارة للسداد
  vaccinationCompleted?: boolean; // إقرار الحاج بأخذ تطعيمات الحج المعتمدة
  vaccinationDate?: string; // تاريخ التطعيم (ميلادي YYYY-MM-DD)
  vaccinationDateHijri?: string; // تاريخ التطعيم (هجري أم القرى YYYY-MM-DD)
  vaccinationReportedAt?: string; // وقت إبلاغ الحاج بالتطعيم
  membershipNumber?: string; // رقم العضوية في القافلة (مثال: QAEM-1448-1003)
  pilgrimSequenceNumber?: number; // رقم التسلسل في سجل الحجاج
  whatsappNotificationsEnabled?: boolean; // هل تم تفعيل إشعارات الواتساب
  whatsappNotificationMobile?: string; // رقم الواتساب المخصص للإشعارات
  whatsappNotificationTopics?: string[]; // أنواع التنبيهات المفعلة (مواعيد المغادرة، السكن، الإرشاد)
  pushNotificationsEnabled?: boolean; // تفعيل إشعارات المتصفح الفورية (Web Push)
  fcmTokens?: string[]; // معرّفات أجهزة ومتصفح الحاج لاستقبال الإشعارات
  // Health & Care
  healthConditions?: string[];
  otherHealthCondition?: string;
  hasBackPain?: boolean;
  needsAssistance?: boolean;
  isPregnant?: boolean; // For females
  hasSpeechDifficulty?: boolean;
  // Mahram/Companion
  hasMahram?: boolean;
  mahramDetails?: {
    name: string;
    nationalId?: string;
    relation: string;
  }[];
  // Dynamic Form Builder Metadata & Custom Responses (Strictly Optional — 100% Backward Compatible with 1448 & earlier records)
  formTemplateId?: string;
  formTemplateName?: string;
  formVersion?: number;
  customFields?: Record<string, any>;
  formSchemaSnapshot?: PilgrimDynamicFieldSnapshotItem[];
}

export interface PaymentRecord {
  id: string;
  title: string; // مثال: "الدفعة الأولى (تأكيد الحجز)"، "الدفعة النهائية"، "سداد كامل الرسوم"
  amount: string; // المبلغ بالريال
  date: string; // تاريخ السداد
  paymentMethod: string; // "حوالة بنكية" | "بطاقة مدى / شبكة" | "إيداع مباشر" | "نقدي"
  bankName?: string; // اسم البنك
  referenceNumber?: string; // رقم العملية / الحوالة
  notes?: string;
  confirmedBy?: string; // اسم المحاسب أو المشرف
  receiptImage?: string; // رابط خارجي (External / Cloudinary URL) لصورة الإيصال
  receiptId?: string; // unique identifier
}

export interface HajjPackage {
  id: string;
  title: string;
  type: string;
  price: string;
  transport: string;
  accommodationMakkah: string;
  accommodationMadinah: string;
  campMina: string;
  features: string[];
  image: string; // رابط خارجي أو مضغوط (URL) لصورة الباقة
  seasonId?: string; // معرف الموسم المرتبط بالباقة
  seasonYear?: string; // السنة الهجرية للموسم
  mediaAssetId?: string; // معرف أصل الوسائط الموحد في mediaAssets
  showOnHomepage?: boolean; // حالة الظهور في الصفحة الرئيسية (مفعل / مخفي)
  maxCapacity?: number; // الحد الأقصى للمقاعد
  registrationDeadline?: string; // تاريخ ووقت انتهاء التسجيل (ISO / datetime-local)
  forceClose?: boolean; // الإغلاق اليدوي الطارئ
  forceCloseReason?: string; // سبب الإغلاق اليدوي الطارئ (مثال: مغلق لانتهاء الموسم)
  formTemplateId?: string; // معرف الاستمارة الديناميكية المرتبطة بالباقة (اختياري — إذا فارغ يستخدم الاستمارة الافتراضية 1448)
  formTemplateName?: string; // مسمى الاستمارة الديناميكية للعرض السريع
}

export interface AnnouncementDisplaySettings {
  showImage?: boolean;
  showVideo?: boolean;
  enableLightbox?: boolean;
  highlightCard?: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  date: string;
  content: string;
  category: 'هام' | 'توجيهات' | 'مواعيد';
  fontSize?: 'sm' | 'normal' | 'lg' | 'xl' | '2xl';
  isBold?: boolean;
  textAlign?: 'right' | 'center' | 'justify';
  imageUrl?: string; // رابط خارجي أو سحابي (Cloudinary / External URL) للصورة
  videoUrl?: string; // رابط خارجي أو سحابي (Cloudinary / YouTube / External MP4 URL) للفيديو
  mediaProvider?: 'cloudinary' | 'external' | 'youtube';
  displaySettings?: AnnouncementDisplaySettings;
  seasonId?: string; // معرف الموسم المرتبط
  seasonYear?: string; // السنة الهجرية للموسم
  imageAssetId?: string; // معرف أصل الصورة في mediaAssets
  videoAssetId?: string; // معرف أصل الفيديو في mediaAssets
}

export type OfficialAdminRole =
  | 'الإدارة العامة'
  | 'الإشراف المكتبي'
  | 'الإشراف المالي'
  | 'الإشراف الثقافي'
  | 'الإشراف الديني';

export type LegacyAdminRole =
  | 'مدير عام (Master Admin)'
  | 'مشرف إداري'
  | 'مشرف إرشاد وديني'
  | 'محاسب القافلة';

export type AdminRole = OfficialAdminRole | LegacyAdminRole;

export type PermissionOperation =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'print'
  | 'export'
  | 'manage';

export type PermissionModuleId =
  | 'pilgrims'
  | 'housing_transport'
  | 'finance'
  | 'packages'
  | 'cultural'
  | 'religious'
  | 'gifts_kit'
  | 'staff_system';

export type ModulePermissions = Record<PermissionOperation, boolean>;

export type DetailedPermissionsMap = Record<PermissionModuleId, ModulePermissions>;

export interface NewDeviceSecurityAlert {
  deviceName: string;
  osName?: string;
  browserName?: string;
  detectedAt: string;
  dismissed?: boolean;
}

export interface TrustedDevice {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  deviceName: string; // e.g., "Chrome on Windows" or "Safari on iPhone"
  deviceType: 'desktop' | 'mobile' | 'tablet';
  browserName: string;
  osName: string;
  deviceTokenHash: string; // SHA-256 hash of local cryptographic device_token
  deviceFingerprint: string; // SHA-256 hash of normalized device/browser attributes
  trustedAt: string; // ISO timestamp
  lastUsedAt: string; // ISO timestamp
  biometricEnabled: boolean;
  biometricCredentialId?: string; // Base64URL WebAuthn Credential ID
  biometricPublicKeySpki?: string; // Base64URL SPKI public key (if provided by authenticator)
  biometricEnabledAt?: string;
  biometricLabel?: string;
  revoked?: boolean;
  revokedAt?: string;
  revokedBy?: string;
}

export interface AdminUser {
  id: string;
  username: string;
  email?: string;
  pin: string;
  fullName: string;
  role: AdminRole;
  legacyRole?: string;
  isSuperAdminOwner?: boolean;
  status?: 'active' | 'suspended';
  mustChangePassword?: boolean;
  passwordChangedAt?: string;
  totpEnabled?: boolean;
  totpSecret?: string;
  totpConfiguredAt?: string;
  totpResetAt?: string;
  totpResetBy?: string;
  lastLoginAt?: string;
  suspendedAt?: string;
  suspendedBy?: string;
  sessionVersion?: number;
  lastNewDeviceAlert?: NewDeviceSecurityAlert | null;
  assignedSeason?: string;
  assignedCaravan?: string;
  customPermissionsOverride?: boolean;
  detailedPermissions?: DetailedPermissionsMap;
  permissions: {
    managePilgrims: boolean;
    manageAnnouncements: boolean;
    managePackages: boolean;
    manageStaff: boolean;
    manageFinance: boolean;
    manageReligiousGuide: boolean;
    manageTravelKit: boolean;
    manageNotifications?: boolean;
    manageGifts?: boolean;
    manageCultural?: boolean;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface HajjGuideStep {
  id: string;
  order: number;
  title: string;
  description: string;
}

export interface TravelKitItem {
  id: string;
  category: string;
  item: string;
  isEssential: boolean;
}

export interface SiteTexts {
  topBarAnnouncement: string;
  topBarBadge?: string;
  topBarSubtext: string;
  brandName: string;
  brandSubtitle: string;
  heroBadge: string;
  heroTitlePrefix: string;
  heroTitleHighlight: string;
  heroDescription: string;
  registerButtonText: string;
  portalButtonText: string;
  cardSeasonBadge?: string;
  cardTitle: string;
  cardSubtitle: string;
  cardFeatures: string[];
}

export interface HajjTimelineStep {
  time: string;
  title: string;
  desc: string;
}

export interface HajjTimelineDay {
  id: string;
  dayTitle: string;
  subtitle: string;
  summary: string;
  steps: HajjTimelineStep[];
  campaignTip: string;
}

export type ManasikRulingCategory =
  | ''
  | 'ركن'
  | 'واجب'
  | 'سنة'
  | 'مستحب'
  | 'تنبيه خاص بالقافلة';

export interface ManasikRitualItem {
  id: string;
  title: string;
  ruling?: ManasikRulingCategory;
  explanation: string;
  campaignNote?: string;
  order: number;
  isEnabled: boolean;
  updatedAt?: string;
}

export interface ManasikStage {
  id: string;
  title: string;
  subtitle?: string;
  summary?: string;
  campaignTip?: string;
  order: number;
  isEnabled: boolean;
  rituals: ManasikRitualItem[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface PilgrimManasikProgress {
  id: string;
  pilgrimId?: string;
  nationalId: string;
  completedRitualIds: string[];
  updatedAt?: string;
}

export type RitualAudioScope =
  | 'general'
  | 'umrah'
  | 'day1'
  | 'day2'
  | 'day3'
  | 'day4'
  | 'day5'
  | 'checklist';

export interface RitualAudioGuide {
  id: string;
  title: string;
  description?: string;
  speakerName: string;
  ritualScope: RitualAudioScope;
  audioUrl: string;
  storagePath?: string;
  mimeType?: string;
  durationSeconds?: number;
  fileSizeBytes?: number;
  fileHash?: string;
  isActive: boolean;
  createdAt: string;
  uploadedBy?: string;
}

export interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
}

export interface YouTubeConfig {
  enabled: boolean;
  channelUrl: string;
  channelId: string;
  channelHandle?: string;
  isLiveActive: boolean;
  liveStreamUrl?: string;
  liveTitle?: string;
  cachedLatestVideoId?: string;
  cachedLatestVideoTitle?: string;
  cachedLatestVideoDate?: string;
}

export interface HistoricalYearRecord {
  id: string;
  hijriYear: string; // مثال: "1447هـ"
  pilgrimsCount: number; // عدد الحجاج في ذلك العام
  notes?: string; // ملاحظة اختيارية (مثال: موسم حج 1447هـ)
}

export interface PilgrimStatsConfig {
  activeSeasonYear?: string; // العام الهجري للموسم النشط (مثال: 1448)
  baseHistoricalCount: number; // رصيد تأسيسي للأعوام السابقة (اختياري)
  historicalRecords: HistoricalYearRecord[]; // سجلات الحجاج حسب الأعوام الهجرية
  autoIncludeCurrentPassengers: boolean; // احتساب مسافري الطيران والباصات الفعليين تلقائياً
}

export type KnowledgeClassification = 'Public' | 'Approved' | 'Admin Only' | 'Confidential';

export type KnowledgeSourceType =
  | 'official_page'
  | 'package'
  | 'announcement'
  | 'religious_guidance'
  | 'terms'
  | 'guide'
  | 'contact'
  | 'admin_knowledge';

export interface AdvisorKnowledgeItem {
  id: string;
  title: string;
  content: string;
  summary?: string;
  category: string;
  sourceType: KnowledgeSourceType;
  sourceUrl?: string;
  pageTitle?: string;
  classification: KnowledgeClassification;
  isApprovedForAdvisor: boolean;
  isPublicVisible: boolean;
  disabledInAdvisor?: boolean;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export interface AdvisorEnabledSources {
  home: boolean;
  packages: boolean;
  announcements: boolean;
  guide: boolean;
  religiousGuidance: boolean;
  registrationTerms: boolean;
  contact: boolean;
  adminKnowledge: boolean;
}

export interface AdvisorSettings {
  enabled: boolean;
  advisorName: string;
  welcomeMessage: string;
  unavailableMessage: string;
  model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  creativityLevel: 'strict' | 'balanced' | 'detailed';
  responseLength: 'short' | 'medium' | 'detailed';
  maxMessagesPerHour: number;
  maxQuestionLength: number;
  enabledPageSources: AdvisorEnabledSources;
  disabledPageIds?: string[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface AdvisorInquiryLog {
  id: string;
  question: string;
  answer: string;
  status: 'answered' | 'unavailable' | 'blocked_security' | 'error';
  matchedSources: Array<{
    title: string;
    url?: string;
    classification: string;
  }>;
  modelUsed?: string;
  sessionId?: string;
  createdAt: string;
}

export interface GroupLocationCoordinate {
  groupName: string;
  lat: number;
  lng: number;
  locationTitle?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ApprovedBank {
  id: string;
  name: string;
  isActive: boolean;
}

export type SiteFontScale = 'compact' | 'normal' | 'large';

export type SocialPlatformKey =
  | 'snapchat'
  | 'tiktok'
  | 'youtube'
  | 'instagram'
  | 'x'
  | 'whatsapp'
  | 'telegram'
  | 'facebook';

export interface SocialAccountEntry {
  enabled: boolean;
  value: string; // Username / @handle / phone or full direct URL
}

export type SocialAccountsMap = Record<SocialPlatformKey, SocialAccountEntry>;

export interface CampaignSettings {
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  officialWebsiteUrl?: string;
  siteTexts?: SiteTexts;
  socialAccounts?: Partial<SocialAccountsMap>;
  fontScale?: SiteFontScale;
  marjiList: string[];
  approvedBanks?: ApprovedBank[];
  busList?: string[];
  groupLocations?: Record<string, GroupLocationCoordinate>;
  operationalCostTarget?: number;
  pilgrimStatsConfig?: PilgrimStatsConfig;
  hajjDaysTimeline?: HajjTimelineDay[];
  ritualAudioGuides?: RitualAudioGuide[];
  cloudinaryConfig?: CloudinaryConfig;
  youtubeConfig?: YouTubeConfig;
  advisorConfig?: AdvisorSettings;
  rolePermissionTemplates?: Partial<Record<OfficialAdminRole, DetailedPermissionsMap>>;
}

export interface ActivityLog {
  id: string;
  adminId: string;
  adminName: string;
  username?: string;
  userRole?: string;
  category?:
    | 'تسجيل دخول / خروج'
    | 'الأمان والمصادقة'
    | 'إدارة الحجاج'
    | 'المالية والإيصالات'
    | 'تصدير الكشوفات والتقارير'
    | 'الباقات والإعلانات'
    | 'المشرفين والإعدادات'
    | 'بوابة الحاج والتسجيل';
  severity?: 'info' | 'warning' | 'critical';
  action: string;
  target: string;
  details?: string;
  previousValue?: string;
  newValue?: string;
  date?: string;
  time?: string;
  timestamp: string;
}

export interface PilgrimFeedback {
  id: string;
  pilgrimId: string; // nationalId
  pilgrimName: string;
  rating: number; // 1-5
  comment: string;
  category: 'التنظيم' | 'السكن' | 'الإعاشة' | 'الإرشاد الديني' | 'المواصلات' | 'عام';
  createdAt: string;
}

export type NotificationPriority = 'urgent' | 'high' | 'normal';
export type NotificationTargetType = 'all' | 'transport' | 'package' | 'bus' | 'flight' | 'gender' | 'individual';
export type NotificationDeliveryType = 'instant' | 'scheduled';
export type NotificationStatus = 'draft' | 'scheduled' | 'sent' | 'cancelled';

export interface NotificationStats {
  targetCount: number;
  sentCount: number;
  readCount: number;
  failureCount: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  targetType: NotificationTargetType;
  targetValue?: string; // e.g. "طائرة", "باقة الحج المميزة", "حافلة 1", "ذكر", or pilgrim nationalId
  deliveryType: NotificationDeliveryType;
  scheduledAt?: string; // ISO string / Asia/Riyadh local representation
  status: NotificationStatus;
  stats: NotificationStats;
  createdBy: {
    adminId: string;
    adminName: string;
    role: string;
  };
  createdAt: string;
  sentAt?: string;
  scheduledSendError?: string;
}

export interface PilgrimNotification {
  id: string;
  notificationId: string;
  pilgrimId: string; // nationalId
  title: string;
  body: string;
  priority: NotificationPriority;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

// -------------------------------------------------------------
// إدارة توزيع هدايا الحجاج (Pilgrim Gift Distribution Management)
// -------------------------------------------------------------
export type GiftDeliveryStatus =
  | 'delivered_direct' // تم التسليم مباشرة للحاج
  | 'delivered_proxy'  // تم التسليم لشخص ينوب عن الحاج
  | 'not_delivered'    // لم يتم التسليم
  | 'contacted_no_show'// تم التواصل مع الحاج ولم يحضر
  | 'unable_to_deliver'// تعذر التسليم
  | 'postponed';       // مؤجل لموعد آخر

export type GiftFollowUpStatus =
  | 'not_contacted'     // لم يتم التواصل معه
  | 'contacted_no_show' // تم التواصل ولم يحضر
  | 'unable_to_contact' // تعذر التواصل معه
  | 'new_date_set'      // تم تحديد موعد جديد
  | 'unable_other';     // تعذر التسليم لسبب آخر

export interface GiftOperationLog {
  id: string;
  timestamp: string;
  staffName: string;
  action: 'تسجيل تسليم مباشر' | 'تسجيل تسليم بالإنابة' | 'تعديل حالة' | 'تسجيل تواصل' | 'إلغاء تسليم' | 'إعادة فتح';
  previousStatus?: string;
  newStatus?: string;
  reason?: string;
  details?: string;
}

export interface GiftDistribution {
  id: string; // `${pilgrimId}_gift`
  pilgrimId: string;
  nationalId: string;
  pilgrimName: string;
  membershipNumber?: string;
  mobile: string;
  busNumber?: string;
  flightNumber?: string;
  seasonYear: string; // e.g. '1448'
  status: GiftDeliveryStatus;
  recipientType?: 'pilgrim' | 'proxy';
  recipientName?: string;
  recipientIdNumber?: string;
  recipientMobile?: string;
  recipientRelation?: string;
  proxyType?: 'قريب' | 'مرافق' | 'مشرف مجموعة' | 'مندوب' | 'أخرى';
  deliveryDate?: string;
  deliveryTime?: string;
  deliveredBy?: string;
  deliveryLocation?: string;
  notes?: string;
  reasonUnable?: string;
  postponedDate?: string;
  followUpStatus?: GiftFollowUpStatus;
  nextFollowUpDate?: string;
  lastContactDate?: string;
  lastContactStaff?: string;
  contactAttemptsCount?: number;
  history?: GiftOperationLog[];
  auditLogs?: GiftOperationLog[];
  gender?: string;
  packageType?: string;
  roomNumber?: string;
  allocatedGiftsCount?: number;
  updatedAt?: string;
  createdAt?: string;
}

export interface GiftCommunication {
  id: string;
  pilgrimId: string;
  nationalId: string;
  pilgrimName: string;
  mobile: string;
  busNumber?: string;
  flightNumber?: string;
  contactDate: string;
  contactTime: string;
  contactMethod: 'اتصال هاتفي' | 'واتساب' | 'رسالة نصية' | 'مقابلة مباشرة' | 'أخرى';
  contactStaff: string;
  result: 'تم التواصل ولم يحضر' | 'تعذر التواصل معه' | 'تم تحديد موعد جديد' | 'تم الاتفاق على الاستلام' | 'تعذر التسليم لسبب آخر' | 'أخرى';
  nextFollowUpDate?: string;
  notes?: string;
  createdAt: string;
}

// -------------------------------------------------------------
// منظومة إدارة المواسم والأرشيف (Season Management & Media Retention)
// -------------------------------------------------------------
export type SeasonStatus = 'active' | 'completed' | 'archived';

export type MediaUploadPolicy =
  | 'new_file'           // ملف جديد: بصمة غير موجودة مسبقاً
  | 'reused_existing'    // ملف مطابق موجود: أعيد استخدامه عبر أكثر من موسم دون تكرار
  | 'new_seasonal_copy'  // ملف جديد لموسم جديد: نسخة مستقلة جديدة للموسم
  | 'modified_version';  // ملف معدل: نسخة محدثة مستقلة مع الحفاظ على النسخة السابقة

export interface SeasonAuditEntry {
  id: string;
  timestamp: string;
  action: string;
  details?: string;
  actorName?: string;
}

export interface HajjSeason {
  id: string; // معرف الموسم الموحد (مثال: season-1448)
  hijriYear: string; // السنة الهجرية (مثال: 1448)
  name: string; // اسم الموسم (مثال: حج 1448هـ)
  startDate: string; // تاريخ البداية YYYY-MM-DD
  endDate: string; // تاريخ النهاية YYYY-MM-DD
  status: SeasonStatus; // 'active' | 'completed' | 'archived'
  protectArchivedMedia: boolean; // سياسة حماية ملفات الموسم من الحذف
  retentionDays?: number; // الحد الأدنى للأيام قبل إتاحة التنظيف بعد فك الارتباط
  notes?: string;
  linkedPackageIds: string[];
  linkedAnnouncementIds: string[];
  linkedPilgrimIds: string[];
  linkedMediaAssetIds: string[];
  history: SeasonAuditEntry[];
  createdAt: string;
  updatedAt?: string;
}
