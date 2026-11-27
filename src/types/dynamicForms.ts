export type DynamicFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'tel'
  | 'email'
  | 'select'
  | 'radio'
  | 'checkbox_group'
  | 'boolean'
  | 'dual_date'
  | 'file'
  | 'iban'
  | 'notice';

export type DynamicFieldTargetSector =
  | 'general'
  | 'housing'
  | 'transport_bus'
  | 'transport_flight'
  | 'health'
  | 'finance'
  | 'religious'
  | 'gifts';

export type CorePilgrimFieldKey =
  | 'firstName'
  | 'secondName'
  | 'thirdName'
  | 'lastName'
  | 'englishFullName'
  | 'nationalId'
  | 'gender'
  | 'nationality'
  | 'birthDate'
  | 'idIssueDate'
  | 'idExpiryDate'
  | 'mobile'
  | 'whatsapp'
  | 'email'
  | 'transport'
  | 'hajjType'
  | 'lastHajjYear'
  | 'currentMarji'
  | 'previousMarji'
  | 'bankName'
  | 'bankAccountName'
  | 'iban'
  | 'madinahPrivateRoomRequested'
  | 'madinahPrivateRoomNote'
  | 'mobilityIndependence'
  | 'healthConditions'
  | 'otherHealthCondition'
  | 'hasSpeechDifficulty'
  | 'isPregnant'
  | 'hasMahram'
  | 'nationalIdImage'
  | 'termsAccepted';

export interface DynamicFieldCondition {
  dependsOnFieldId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'is_truthy' | 'is_falsy';
  value?: string;
}

export interface DynamicFormField {
  id: string;
  key: string;
  label: string;
  type: DynamicFieldType;
  required: boolean;
  enabled: boolean;
  isSystemLocked?: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string | boolean | string[];
  options?: string[];
  optionsSource?: 'custom' | 'approved_banks' | 'marji_list';
  mappedCoreKey?: CorePilgrimFieldKey;
  targetSectors: DynamicFieldTargetSector[];
  showInReports: boolean;
  showInPilgrimPortal: boolean;
  width?: 'full' | 'half';
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    patternHint?: string;
  };
  condition?: DynamicFieldCondition;
  order: number;
}

export interface DynamicFormSection {
  id: string;
  title: string;
  description?: string;
  icon?: 'user' | 'phone' | 'plane' | 'hotel' | 'heart' | 'bank' | 'shield' | 'list';
  enabled: boolean;
  order: number;
  fields: DynamicFormField[];
}

export interface DynamicFormTemplate {
  id: string;
  name: string;
  description?: string;
  seasonYear?: string;
  category: 'حج' | 'عمرة' | 'زيارة' | 'VIP' | 'عام';
  status: 'active' | 'draft' | 'archived';
  version: number;
  isDefaultTemplate?: boolean;
  enableIdOcrScanner?: boolean;
  pledgeText?: string;
  sections: DynamicFormSection[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface PilgrimDynamicFieldSnapshotItem {
  key: string;
  label: string;
  type: DynamicFieldType;
  sectionTitle?: string;
  targetSectors?: DynamicFieldTargetSector[];
  showInReports?: boolean;
  showInPilgrimPortal?: boolean;
}

export const DYNAMIC_FIELD_TYPE_LABELS: Record<DynamicFieldType, string> = {
  text: 'نص قصير',
  textarea: 'نص طويل / ملاحظات',
  number: 'رقم',
  tel: 'رقم جوال / هاتف',
  email: 'بريد إلكتروني',
  select: 'قائمة منسدلة',
  radio: 'اختيار واحد (Radio)',
  checkbox_group: 'اختيار متعدد',
  boolean: 'نعم / لا (تبديل)',
  dual_date: 'تاريخ مزدوج (هجري أم القرى + ميلادي)',
  file: 'رفع صورة / مرفق',
  iban: 'رقم حساب بنكي (IBAN)',
  notice: 'تنبيه أو نص إرشادي',
};

export const DYNAMIC_SECTOR_LABELS: Record<DynamicFieldTargetSector, string> = {
  general: 'السجل العام وملف الحاج',
  housing: 'قطاع السكن والتسكين',
  transport_bus: 'قطاع الحافلات والنقل البري',
  transport_flight: 'قطاع الطيران والرحلات',
  health: 'قطاع الرعاية الصحية',
  finance: 'القطاع المالي والبنكي',
  religious: 'قطاع الإرشاد الديني',
  gifts: 'قطاع الهدايا والحقائب',
};

export const CORE_PILGRIM_FIELD_OPTIONS: {
  key: CorePilgrimFieldKey;
  label: string;
  defaultType: DynamicFieldType;
  defaultSectors: DynamicFieldTargetSector[];
  locked?: boolean;
}[] = [
  { key: 'firstName', label: 'الاسم الأول', defaultType: 'text', defaultSectors: ['general'], locked: true },
  { key: 'secondName', label: 'اسم الأب', defaultType: 'text', defaultSectors: ['general'] },
  { key: 'thirdName', label: 'اسم الجد', defaultType: 'text', defaultSectors: ['general'] },
  { key: 'lastName', label: 'اسم العائلة / الفخذ', defaultType: 'text', defaultSectors: ['general'], locked: true },
  { key: 'englishFullName', label: 'الاسم الكامل بالإنجليزية (مطابق للجواز)', defaultType: 'text', defaultSectors: ['general', 'transport_flight'] },
  { key: 'nationalId', label: 'رقم الهوية الوطنية / الإقامة', defaultType: 'text', defaultSectors: ['general'], locked: true },
  { key: 'gender', label: 'الجنس', defaultType: 'radio', defaultSectors: ['general', 'housing'] },
  { key: 'nationality', label: 'الجنسية', defaultType: 'text', defaultSectors: ['general'] },
  { key: 'birthDate', label: 'تاريخ الميلاد', defaultType: 'dual_date', defaultSectors: ['general', 'transport_flight'] },
  { key: 'idIssueDate', label: 'تاريخ إصدار الهوية', defaultType: 'dual_date', defaultSectors: ['general'] },
  { key: 'idExpiryDate', label: 'تاريخ انتهاء الهوية', defaultType: 'dual_date', defaultSectors: ['general'] },
  { key: 'mobile', label: 'رقم الجوال الأساسي', defaultType: 'tel', defaultSectors: ['general'], locked: true },
  { key: 'whatsapp', label: 'رقم الواتساب', defaultType: 'tel', defaultSectors: ['general'] },
  { key: 'email', label: 'البريد الإلكتروني', defaultType: 'email', defaultSectors: ['general'] },
  { key: 'transport', label: 'وسيلة النقل المفضلة', defaultType: 'radio', defaultSectors: ['general', 'transport_bus', 'transport_flight'] },
  { key: 'hajjType', label: 'نوع النسك / الحج', defaultType: 'select', defaultSectors: ['general', 'religious'] },
  { key: 'lastHajjYear', label: 'سنة آخر حجة', defaultType: 'text', defaultSectors: ['general', 'religious'] },
  { key: 'currentMarji', label: 'مرجع التقليد الحالي', defaultType: 'select', defaultSectors: ['general', 'religious'] },
  { key: 'previousMarji', label: 'مرجع التقليد السابق', defaultType: 'text', defaultSectors: ['general', 'religious'] },
  { key: 'madinahPrivateRoomRequested', label: 'طلب غرفة خاصة في المدينة المنورة', defaultType: 'boolean', defaultSectors: ['general', 'housing'] },
  { key: 'madinahPrivateRoomNote', label: 'ملاحظات الغرفة الخاصة بالمدينة', defaultType: 'textarea', defaultSectors: ['general', 'housing'] },
  { key: 'mobilityIndependence', label: 'القدرة الحركية والاعتماد على النفس', defaultType: 'select', defaultSectors: ['general', 'health'] },
  { key: 'healthConditions', label: 'الأمراض المزمنة أو الحالات الصحية', defaultType: 'checkbox_group', defaultSectors: ['general', 'health'] },
  { key: 'otherHealthCondition', label: 'تفاصيل صحية إضافية', defaultType: 'textarea', defaultSectors: ['general', 'health'] },
  { key: 'hasSpeechDifficulty', label: 'وجود صعوبة في النطق أو السمع', defaultType: 'boolean', defaultSectors: ['general', 'health'] },
  { key: 'isPregnant', label: 'هل الحاجة حامل (للنساء)', defaultType: 'boolean', defaultSectors: ['general', 'health'] },
  { key: 'hasMahram', label: 'هل يوجد مرافق / محرم', defaultType: 'boolean', defaultSectors: ['general', 'housing'] },
  { key: 'bankName', label: 'اسم البنك المعتمد', defaultType: 'select', defaultSectors: ['general', 'finance'] },
  { key: 'bankAccountName', label: 'اسم صاحب الحساب البنكي', defaultType: 'text', defaultSectors: ['general', 'finance'] },
  { key: 'iban', label: 'رقم الآيبان (IBAN)', defaultType: 'iban', defaultSectors: ['general', 'finance'] },
  { key: 'nationalIdImage', label: 'صورة الهوية الوطنية / الإقامة', defaultType: 'file', defaultSectors: ['general'] },
  { key: 'termsAccepted', label: 'الموافقة على التعهد والشروط', defaultType: 'boolean', defaultSectors: ['general'] },
];
