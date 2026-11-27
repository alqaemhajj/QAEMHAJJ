import {
  DynamicFormTemplate,
  DynamicFormField,
  DynamicFieldCondition,
  DynamicFieldTargetSector,
  DynamicFieldType,
  PilgrimDynamicFieldSnapshotItem,
} from '../types/dynamicForms';
import { Pilgrim } from '../types';
import {
  subscribeToCollection,
  getDocuments,
  setDocument,
  removeDocument,
} from './db';

export const DYNAMIC_FORMS_COLLECTION = 'registration_forms';

/**
 * Generates a unique safe ID for forms, sections, or fields.
 */
export function generateFormEntityId(prefix: 'form' | 'sec' | 'fld'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Creates a clean minimal starter template from scratch with ONLY the 3 minimum locked core fields
 * (Name, National ID, Mobile) so Pilgrim Inquiry Portal & duplicate detection always work reliably.
 */
export function buildBlankStarterTemplate(createdBy = 'الإدارة العامة'): DynamicFormTemplate {
  const now = new Date().toISOString();
  return {
    id: generateFormEntityId('form'),
    name: 'استمارة تسجيل جديدة (مخصصة)',
    description: 'قالب مرن يبدأ بالحقول الأساسية المقفلة فقط ويمكن تخصيصه بالكامل لأي باقة حج أو عمرة أو زيارة.',
    seasonYear: '1449',
    category: 'عام',
    status: 'draft',
    version: 1,
    enableIdOcrScanner: true,
    pledgeText:
      'أقر وأتعهد بأن جميع البيانات المدخلة في هذه الاستمارة صحيحة ودقيقة، وأوافق على كافة شروط وتعليمات قافلة القائم للحج والعمرة والزيارة.',
    sections: [
      {
        id: 'sec_core_identity',
        title: 'البيانات الأساسية والتواصل',
        description: 'الحقول الأساسية الإلزامية لتعريف الحاج وربط ملفه ببوابة الاستعلام والكشوفات.',
        icon: 'user',
        enabled: true,
        order: 1,
        fields: [
          {
            id: 'fld_first_name',
            key: 'firstName',
            label: 'الاسم الأول',
            type: 'text',
            required: true,
            enabled: true,
            isSystemLocked: true,
            placeholder: 'مثال: محمد',
            mappedCoreKey: 'firstName',
            targetSectors: ['general'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 1,
          },
          {
            id: 'fld_last_name',
            key: 'lastName',
            label: 'اسم العائلة / الفخذ',
            type: 'text',
            required: true,
            enabled: true,
            isSystemLocked: true,
            placeholder: 'مثال: العلي',
            mappedCoreKey: 'lastName',
            targetSectors: ['general'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 2,
          },
          {
            id: 'fld_national_id',
            key: 'nationalId',
            label: 'رقم الهوية الوطنية / الإقامة',
            type: 'text',
            required: true,
            enabled: true,
            isSystemLocked: true,
            placeholder: '10 أرقام تبدأ بـ 1 أو 2',
            mappedCoreKey: 'nationalId',
            targetSectors: ['general'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            validation: { minLength: 10, maxLength: 10, patternHint: 'يجب أن يتكون من 10 أرقام' },
            order: 3,
          },
          {
            id: 'fld_mobile',
            key: 'mobile',
            label: 'رقم الجوال الأساسي',
            type: 'tel',
            required: true,
            enabled: true,
            isSystemLocked: true,
            placeholder: '05XXXXXXXX',
            mappedCoreKey: 'mobile',
            targetSectors: ['general'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 4,
          },
        ],
      },
    ],
    createdAt: now,
    updatedAt: now,
    createdBy,
    updatedBy: createdBy,
  };
}

/**
 * Creates a full-featured template mirroring the official Hajj 1448 form so admins
 * can clone & customize it for 1449+ seasons without ever touching historical 1448 records.
 */
export function buildDefault1448MirrorTemplate(createdBy = 'الإدارة العامة'): DynamicFormTemplate {
  const now = new Date().toISOString();
  return {
    id: generateFormEntityId('form'),
    name: 'استمارة الحج الشاملة (نسخة قابلة للتخصيص)',
    description:
      'قالب متكامل مطابق لأقسام استمارة حج 1448 المعتمدة (الهوية، التواريخ المزدوجة، النقل، المرجع، السكن، الصحة، والبيانات البنكية) مع حرية التعديل الكاملة للمواسم والباقات الجديدة.',
    seasonYear: '1449',
    category: 'حج',
    status: 'active',
    version: 1,
    isDefaultTemplate: true,
    enableIdOcrScanner: true,
    pledgeText:
      'أقر وأتعهد بأن جميع البيانات المدخلة صحيحة ومطابقة للهوية الرسمية، وألتزم بكافة تعليمات وتنظيمات قافلة القائم للحج والعمرة والزيارة وأنظمة وزارة الحج والعمرة.',
    sections: [
      {
        id: 'sec_personal',
        title: 'البيانات الشخصية والهوية الوطنية',
        description: 'بيانات الهوية الرباعية والتواريخ المزدوجة (هجري أم القرى وميلادي).',
        icon: 'user',
        enabled: true,
        order: 1,
        fields: [
          {
            id: 'fld_firstName',
            key: 'firstName',
            label: 'الاسم الأول',
            type: 'text',
            required: true,
            enabled: true,
            isSystemLocked: true,
            mappedCoreKey: 'firstName',
            targetSectors: ['general'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 1,
          },
          {
            id: 'fld_secondName',
            key: 'secondName',
            label: 'اسم الأب',
            type: 'text',
            required: true,
            enabled: true,
            mappedCoreKey: 'secondName',
            targetSectors: ['general'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 2,
          },
          {
            id: 'fld_thirdName',
            key: 'thirdName',
            label: 'اسم الجد',
            type: 'text',
            required: false,
            enabled: true,
            mappedCoreKey: 'thirdName',
            targetSectors: ['general'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 3,
          },
          {
            id: 'fld_lastName',
            key: 'lastName',
            label: 'اسم العائلة / الفخذ',
            type: 'text',
            required: true,
            enabled: true,
            isSystemLocked: true,
            mappedCoreKey: 'lastName',
            targetSectors: ['general'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 4,
          },
          {
            id: 'fld_englishFullName',
            key: 'englishFullName',
            label: 'الاسم الكامل بالإنجليزية (مطابق لجواز السفر)',
            type: 'text',
            required: false,
            enabled: true,
            placeholder: 'MOHAMMED ALI AL...',
            mappedCoreKey: 'englishFullName',
            targetSectors: ['general', 'transport_flight'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'full',
            order: 5,
          },
          {
            id: 'fld_nationalId',
            key: 'nationalId',
            label: 'رقم الهوية الوطنية / الإقامة',
            type: 'text',
            required: true,
            enabled: true,
            isSystemLocked: true,
            placeholder: '10 أرقام',
            mappedCoreKey: 'nationalId',
            targetSectors: ['general'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            validation: { minLength: 10, maxLength: 10, patternHint: '10 أرقام صحيحة' },
            order: 6,
          },
          {
            id: 'fld_gender',
            key: 'gender',
            label: 'الجنس',
            type: 'radio',
            required: true,
            enabled: true,
            options: ['ذكر', 'أنثى'],
            defaultValue: 'ذكر',
            mappedCoreKey: 'gender',
            targetSectors: ['general', 'housing'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 7,
          },
          {
            id: 'fld_nationality',
            key: 'nationality',
            label: 'الجنسية',
            type: 'text',
            required: true,
            enabled: true,
            defaultValue: 'سعودي',
            mappedCoreKey: 'nationality',
            targetSectors: ['general'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 8,
          },
          {
            id: 'fld_birthDate',
            key: 'birthDate',
            label: 'تاريخ الميلاد',
            type: 'dual_date',
            required: true,
            enabled: true,
            mappedCoreKey: 'birthDate',
            targetSectors: ['general', 'transport_flight'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 9,
          },
          {
            id: 'fld_idIssueDate',
            key: 'idIssueDate',
            label: 'تاريخ إصدار الهوية',
            type: 'dual_date',
            required: false,
            enabled: true,
            mappedCoreKey: 'idIssueDate',
            targetSectors: ['general'],
            showInReports: true,
            showInPilgrimPortal: false,
            width: 'half',
            order: 10,
          },
          {
            id: 'fld_idExpiryDate',
            key: 'idExpiryDate',
            label: 'تاريخ انتهاء الهوية',
            type: 'dual_date',
            required: false,
            enabled: true,
            mappedCoreKey: 'idExpiryDate',
            targetSectors: ['general'],
            showInReports: true,
            showInPilgrimPortal: false,
            width: 'half',
            order: 11,
          },
          {
            id: 'fld_idImage',
            key: 'nationalIdImage',
            label: 'إرفاق صورة الهوية الوطنية (اختياري)',
            type: 'file',
            required: false,
            enabled: true,
            mappedCoreKey: 'nationalIdImage',
            targetSectors: ['general'],
            showInReports: false,
            showInPilgrimPortal: false,
            width: 'full',
            order: 12,
          },
        ],
      },
      {
        id: 'sec_contact',
        title: 'بيانات التواصل',
        description: 'أرقام الجوال والواتساب لاستلام تنبيهات ومواعيد القافلة.',
        icon: 'phone',
        enabled: true,
        order: 2,
        fields: [
          {
            id: 'fld_mobile',
            key: 'mobile',
            label: 'رقم الجوال الأساسي',
            type: 'tel',
            required: true,
            enabled: true,
            isSystemLocked: true,
            placeholder: '05XXXXXXXX',
            mappedCoreKey: 'mobile',
            targetSectors: ['general'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 1,
          },
          {
            id: 'fld_whatsapp',
            key: 'whatsapp',
            label: 'رقم الواتساب',
            type: 'tel',
            required: false,
            enabled: true,
            placeholder: '05XXXXXXXX',
            mappedCoreKey: 'whatsapp',
            targetSectors: ['general'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 2,
          },
          {
            id: 'fld_email',
            key: 'email',
            label: 'البريد الإلكتروني (اختياري)',
            type: 'email',
            required: false,
            enabled: true,
            placeholder: 'example@email.com',
            mappedCoreKey: 'email',
            targetSectors: ['general'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'full',
            order: 3,
          },
        ],
      },
      {
        id: 'sec_journey',
        title: 'تفاصيل الرحلة والإرشاد الفقهي',
        description: 'وسيلة النقل، نوع النسك، ومرجع التقليد لتوجيه الإرشاد الديني.',
        icon: 'plane',
        enabled: true,
        order: 3,
        fields: [
          {
            id: 'fld_transport',
            key: 'transport',
            label: 'وسيلة النقل',
            type: 'radio',
            required: true,
            enabled: true,
            options: ['باص', 'طائرة'],
            defaultValue: 'باص',
            mappedCoreKey: 'transport',
            targetSectors: ['general', 'transport_bus', 'transport_flight'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 1,
          },
          {
            id: 'fld_hajjType',
            key: 'hajjType',
            label: 'نوع النسك / الحج',
            type: 'select',
            required: true,
            enabled: true,
            options: ['تمتع', 'مستحب', 'نيابة', 'قِران', 'إفراد', 'عمرة'],
            defaultValue: 'تمتع',
            mappedCoreKey: 'hajjType',
            targetSectors: ['general', 'religious'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 2,
          },
          {
            id: 'fld_currentMarji',
            key: 'currentMarji',
            label: 'مرجع التقليد الحالي',
            type: 'select',
            required: true,
            enabled: true,
            optionsSource: 'marji_list',
            mappedCoreKey: 'currentMarji',
            targetSectors: ['general', 'religious'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 3,
          },
          {
            id: 'fld_lastHajjYear',
            key: 'lastHajjYear',
            label: 'سنة آخر حجة (إن وُجدت)',
            type: 'text',
            required: false,
            enabled: true,
            placeholder: 'أول مرة أو مثال: 1440',
            mappedCoreKey: 'lastHajjYear',
            targetSectors: ['general', 'religious'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 4,
          },
        ],
      },
      {
        id: 'sec_housing_health',
        title: 'السكن والرعاية الصحية',
        description: 'طلبات السكن الخاصة والحالة الصحية لضمان الرعاية المناسبة للحاج.',
        icon: 'heart',
        enabled: true,
        order: 4,
        fields: [
          {
            id: 'fld_madinahRoom',
            key: 'madinahPrivateRoomRequested',
            label: 'هل ترغب بطلب غرفة خاصة في المدينة المنورة؟',
            type: 'boolean',
            required: false,
            enabled: true,
            defaultValue: false,
            mappedCoreKey: 'madinahPrivateRoomRequested',
            targetSectors: ['general', 'housing'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'full',
            order: 1,
          },
          {
            id: 'fld_madinahRoomNote',
            key: 'madinahPrivateRoomNote',
            label: 'تفاصيل أو ملاحظات الغرفة الخاصة بالمدينة',
            type: 'textarea',
            required: false,
            enabled: true,
            placeholder: 'مثال: غرفة ثنائية مع الزوجة / العائلة...',
            mappedCoreKey: 'madinahPrivateRoomNote',
            targetSectors: ['general', 'housing'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'full',
            condition: {
              dependsOnFieldId: 'fld_madinahRoom',
              operator: 'is_truthy',
            },
            order: 2,
          },
          {
            id: 'fld_mobility',
            key: 'mobilityIndependence',
            label: 'القدرة الحركية والاعتماد على النفس',
            type: 'select',
            required: false,
            enabled: true,
            options: ['مستقل تماماً ولله الحمد', 'يحتاج مساعدة بسيطة بالمشي', 'يحتاج كرسي متحرك / عربة'],
            defaultValue: 'مستقل تماماً ولله الحمد',
            mappedCoreKey: 'mobilityIndependence',
            targetSectors: ['general', 'health'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 3,
          },
          {
            id: 'fld_healthConditions',
            key: 'healthConditions',
            label: 'الأمراض المزمنة أو الحالات الصحية (إن وُجدت)',
            type: 'checkbox_group',
            required: false,
            enabled: true,
            options: ['السكري', 'ضغط الدم', 'أمراض القلب', 'الربو / الحساسية', 'آلام الظهر / المفاصل'],
            mappedCoreKey: 'healthConditions',
            targetSectors: ['general', 'health'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'full',
            order: 4,
          },
          {
            id: 'fld_otherHealth',
            key: 'otherHealthCondition',
            label: 'ملاحظات صحية أو أدوية مستمرة',
            type: 'textarea',
            required: false,
            enabled: true,
            placeholder: 'اذكر أي ملاحظات طبية تهم الفريق الصحي...',
            mappedCoreKey: 'otherHealthCondition',
            targetSectors: ['general', 'health'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'full',
            order: 5,
          },
        ],
      },
      {
        id: 'sec_banking',
        title: 'البيانات البنكية والتعهد النهائي',
        description: 'رقم الحساب البنكي المعتمد لرد الفائض أو الرجيع للحاج من قبل وزارة الحج.',
        icon: 'bank',
        enabled: true,
        order: 5,
        fields: [
          {
            id: 'fld_bankNotice',
            key: 'bankNotice',
            label: 'ملاحظة هامة حول الحساب البنكي',
            type: 'notice',
            required: false,
            enabled: true,
            helpText:
              '• رقم الحساب البنكي المعتمد لرد الفائض أو الرجيع للحاج من قبل وزارة الحج.\n• يمكن تسجيل حساب بنكي باسم أحد الأقارب أو المعارف في حال عدم وجود حساب نشط باسم الحاج.',
            targetSectors: ['finance'],
            showInReports: false,
            showInPilgrimPortal: false,
            width: 'full',
            order: 1,
          },
          {
            id: 'fld_bankName',
            key: 'bankName',
            label: 'اسم البنك المعتمد',
            type: 'select',
            required: false,
            enabled: true,
            optionsSource: 'approved_banks',
            mappedCoreKey: 'bankName',
            targetSectors: ['general', 'finance'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 2,
          },
          {
            id: 'fld_bankAccountName',
            key: 'bankAccountName',
            label: 'اسم صاحب الحساب البنكي',
            type: 'text',
            required: false,
            enabled: true,
            placeholder: 'الاسم الكامل لصاحب الحساب البنكي',
            mappedCoreKey: 'bankAccountName',
            targetSectors: ['general', 'finance'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'half',
            order: 3,
          },
          {
            id: 'fld_iban',
            key: 'iban',
            label: 'رقم الآيبان (IBAN)',
            type: 'iban',
            required: false,
            enabled: true,
            placeholder: 'SA0000000000000000000000',
            mappedCoreKey: 'iban',
            targetSectors: ['general', 'finance'],
            showInReports: true,
            showInPilgrimPortal: true,
            width: 'full',
            order: 4,
          },
        ],
      },
    ],
    createdAt: now,
    updatedAt: now,
    createdBy,
    updatedBy: createdBy,
  };
}

// ============================================================================
// Firestore CRUD Operations
// ============================================================================

export function subscribeToDynamicForms(
  onUpdate: (forms: DynamicFormTemplate[]) => void
): () => void {
  return subscribeToCollection<DynamicFormTemplate>(DYNAMIC_FORMS_COLLECTION, (docs) => {
    const sorted = [...(docs || [])].sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });
    onUpdate(sorted);
  });
}

export async function getDynamicForms(): Promise<DynamicFormTemplate[]> {
  const docs = await getDocuments<DynamicFormTemplate>(DYNAMIC_FORMS_COLLECTION);
  return [...(docs || [])].sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return timeB - timeA;
  });
}

export async function saveDynamicFormTemplate(
  template: DynamicFormTemplate,
  incrementVersion = false
): Promise<{ ok: boolean; savedTemplate: DynamicFormTemplate; error?: string }> {
  const now = new Date().toISOString();
  const normalizedSections = (template.sections || []).map((sec, sIdx) => ({
    ...sec,
    order: sIdx + 1,
    fields: (sec.fields || []).map((fld, fIdx) => ({
      ...fld,
      order: fIdx + 1,
      targetSectors:
        Array.isArray(fld.targetSectors) && fld.targetSectors.length > 0
          ? fld.targetSectors
          : (['general'] as DynamicFieldTargetSector[]),
    })),
  }));

  const savedTemplate: DynamicFormTemplate = {
    ...template,
    version: incrementVersion ? (template.version || 1) + 1 : template.version || 1,
    sections: normalizedSections,
    updatedAt: now,
    createdAt: template.createdAt || now,
  };

  const res = await setDocument(DYNAMIC_FORMS_COLLECTION, savedTemplate.id, savedTemplate, {
    forceWrite: true,
  });
  return {
    ok: Boolean(res?.confirmed),
    savedTemplate,
    error: res?.confirmed ? undefined : 'تعذر حفظ الاستمارة في قاعدة البيانات، يرجى المحاولة مرة أخرى.',
  };
}

export async function deleteDynamicFormTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  const ok = await removeDocument(DYNAMIC_FORMS_COLLECTION, id);
  return { ok: Boolean(ok), error: ok ? undefined : 'تعذر حذف الاستمارة من قاعدة البيانات.' };
}

export async function duplicateDynamicFormTemplate(
  source: DynamicFormTemplate,
  newName: string,
  createdBy = 'الإدارة العامة'
): Promise<{ ok: boolean; savedTemplate: DynamicFormTemplate; error?: string }> {
  const now = new Date().toISOString();
  const cloned: DynamicFormTemplate = {
    ...JSON.parse(JSON.stringify(source)),
    id: generateFormEntityId('form'),
    name: newName.trim() || `${source.name} (نسخة)`,
    version: 1,
    status: 'draft',
    isDefaultTemplate: false,
    createdAt: now,
    updatedAt: now,
    createdBy,
    updatedBy: createdBy,
  };
  return saveDynamicFormTemplate(cloned, false);
}

// ============================================================================
// Conditional Logic Evaluation
// ============================================================================

export function evaluateFieldCondition(
  condition: DynamicFieldCondition | undefined,
  valuesByFieldId: Record<string, any>
): boolean {
  if (!condition || !condition.dependsOnFieldId) return true;
  const targetVal = valuesByFieldId[condition.dependsOnFieldId];
  const expected = (condition.value || '').trim();

  switch (condition.operator) {
    case 'is_truthy':
      if (Array.isArray(targetVal)) return targetVal.length > 0;
      if (typeof targetVal === 'boolean') return targetVal === true;
      if (typeof targetVal === 'string') {
        const s = targetVal.trim().toLowerCase();
        return s !== '' && s !== 'false' && s !== 'لا' && s !== '0';
      }
      return Boolean(targetVal);

    case 'is_falsy':
      if (Array.isArray(targetVal)) return targetVal.length === 0;
      if (typeof targetVal === 'boolean') return targetVal === false;
      if (typeof targetVal === 'string') {
        const s = targetVal.trim().toLowerCase();
        return s === '' || s === 'false' || s === 'لا' || s === '0';
      }
      return !targetVal;

    case 'equals':
      return String(targetVal ?? '').trim() === expected;

    case 'not_equals':
      return String(targetVal ?? '').trim() !== expected;

    case 'contains':
      if (Array.isArray(targetVal)) {
        return targetVal.some((item) => String(item).includes(expected));
      }
      return String(targetVal ?? '').includes(expected);

    default:
      return true;
  }
}

// ============================================================================
// Formatting & Reflection Helpers (Reports, Sectors, Admin Modal, Pilgrim Portal)
// ============================================================================

export function formatDynamicFieldValue(val: any, type?: DynamicFieldType): string {
  if (val === undefined || val === null || val === '') return '-';
  if (typeof val === 'boolean') return val ? 'نعم' : 'لا';
  if (Array.isArray(val)) {
    const clean = val.map((v) => String(v || '').trim()).filter(Boolean);
    return clean.length > 0 ? clean.join('، ') : '-';
  }
  if (typeof val === 'object') {
    // Support dual_date object { gregorian, hijri }
    if (val.hijri || val.gregorian) {
      const h = val.hijri ? `${val.hijri} هـ` : '';
      const g = val.gregorian ? `${val.gregorian} م` : '';
      return [h, g].filter(Boolean).join(' / ') || '-';
    }
    return JSON.stringify(val);
  }
  if (type === 'file' && typeof val === 'string' && val.startsWith('http')) {
    return 'مرفق محفوظ';
  }
  return String(val).trim() || '-';
}

export interface ResolvedPilgrimCustomFieldEntry {
  key: string;
  label: string;
  type: DynamicFieldType;
  sectionTitle?: string;
  targetSectors: DynamicFieldTargetSector[];
  showInReports: boolean;
  showInPilgrimPortal: boolean;
  rawValue: any;
  displayValue: string;
}

/**
 * Safely resolves all custom dynamic fields recorded on a pilgrim.
 * Returns [] for all legacy 1448 records (zero interference!).
 */
export function getPilgrimCustomFieldEntries(
  pilgrim: Pilgrim | null | undefined,
  options?: {
    sector?: DynamicFieldTargetSector;
    onlyForReports?: boolean;
    onlyForPortal?: boolean;
  }
): ResolvedPilgrimCustomFieldEntry[] {
  if (!pilgrim || !pilgrim.customFields || typeof pilgrim.customFields !== 'object') {
    return [];
  }

  const snapshotMap = new Map<string, PilgrimDynamicFieldSnapshotItem>();
  (pilgrim.formSchemaSnapshot || []).forEach((item) => {
    if (item && item.key) snapshotMap.set(item.key, item);
  });

  const entries: ResolvedPilgrimCustomFieldEntry[] = [];
  const seenKeys = new Set<string>();

  // First iterate snapshot order so fields stay in the exact section/field order designed by admin
  for (const snap of pilgrim.formSchemaSnapshot || []) {
    if (!snap || !snap.key || !(snap.key in pilgrim.customFields)) continue;
    seenKeys.add(snap.key);
    const rawValue = pilgrim.customFields[snap.key];
    const targetSectors =
      Array.isArray(snap.targetSectors) && snap.targetSectors.length > 0
        ? snap.targetSectors
        : (['general'] as DynamicFieldTargetSector[]);
    const showInReports = snap.showInReports !== false;
    const showInPilgrimPortal = snap.showInPilgrimPortal !== false;

    if (options?.onlyForReports && !showInReports) continue;
    if (options?.onlyForPortal && !showInPilgrimPortal) continue;
    if (options?.sector && !targetSectors.includes(options.sector)) continue;

    entries.push({
      key: snap.key,
      label: snap.label || snap.key,
      type: snap.type || 'text',
      sectionTitle: snap.sectionTitle,
      targetSectors,
      showInReports,
      showInPilgrimPortal,
      rawValue,
      displayValue: formatDynamicFieldValue(rawValue, snap.type),
    });
  }

  // Include any remaining keys in customFields not present in snapshot
  for (const [key, rawValue] of Object.entries(pilgrim.customFields)) {
    if (seenKeys.has(key)) continue;
    if (options?.sector && options.sector !== 'general') continue;
    entries.push({
      key,
      label: key,
      type: 'text',
      targetSectors: ['general'],
      showInReports: true,
      showInPilgrimPortal: true,
      rawValue,
      displayValue: formatDynamicFieldValue(rawValue, 'text'),
    });
  }

  return entries;
}

/**
 * Extracts dynamic custom columns across a list of pilgrims for Excel and PDF reports.
 * CRITICAL BACKWARD COMPATIBILITY:
 * - If all pilgrims in the list are legacy 1448 records (no customFields), returns `[]`!
 * - Zero blank columns are ever added to historical 1448 reports.
 */
export function extractDynamicReportColumns(
  pilgrims: Pilgrim[],
  sector?: DynamicFieldTargetSector
): {
  columns: { key: string; label: string; type: DynamicFieldType }[];
  getRowValues: (pilgrim: Pilgrim) => string[];
} {
  const colMap = new Map<string, { key: string; label: string; type: DynamicFieldType }>();

  for (const p of pilgrims || []) {
    const entries = getPilgrimCustomFieldEntries(p, {
      sector,
      onlyForReports: true,
    });
    for (const entry of entries) {
      if (!colMap.has(entry.key)) {
        colMap.set(entry.key, {
          key: entry.key,
          label: entry.label,
          type: entry.type,
        });
      }
    }
  }

  const columns = Array.from(colMap.values());

  const getRowValues = (pilgrim: Pilgrim): string[] => {
    if (columns.length === 0) return [];
    const map = new Map<string, string>();
    const entries = getPilgrimCustomFieldEntries(pilgrim, {
      sector,
      onlyForReports: true,
    });
    entries.forEach((e) => map.set(e.key, e.displayValue));
    return columns.map((c) => map.get(c.key) || '-');
  };

  return { columns, getRowValues };
}

/**
 * Collects all enabled fields across all enabled sections of a template in order.
 */
export function getFlattenedTemplateFields(template: DynamicFormTemplate): {
  sectionTitle: string;
  field: DynamicFormField;
}[] {
  const result: { sectionTitle: string; field: DynamicFormField }[] = [];
  const sortedSections = [...(template.sections || [])]
    .filter((s) => s.enabled !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  for (const sec of sortedSections) {
    const sortedFields = [...(sec.fields || [])]
      .filter((f) => f.enabled !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    for (const field of sortedFields) {
      result.push({ sectionTitle: sec.title, field });
    }
  }
  return result;
}
