import React, { useState, useMemo, useRef } from 'react';
import {
  DynamicFormTemplate,
  DynamicFormField,
  PilgrimDynamicFieldSnapshotItem,
} from '../../types/dynamicForms';
import { Pilgrim, HajjPackage, CampaignSettings } from '../../types';
import {
  evaluateFieldCondition,
  getFlattenedTemplateFields,
} from '../../lib/dynamicFormsDb';
import { DualCalendarDatePicker } from '../common/DualCalendarDatePicker';
import { resolveDualDates } from '../../utils/dualCalendar';
import { scanSaudiIdCardHybrid, normalizeDigitsOnly } from '../../utils/idCardOcr';
import { uploadOptimizedMedia } from '../../lib/mediaManager';
import { extractHijriYear, normalizeSeasonId } from '../../lib/seasons';
import { defaultCampaignSettings } from '../../data/initialData';
import {
  CheckCircle2,
  AlertCircle,
  User,
  Phone,
  Plane,
  Hotel,
  HeartPulse,
  Building2,
  ShieldCheck,
  ListChecks,
  ScanLine,
  UploadCloud,
  Loader2,
  Sparkles,
  FileCheck,
  Eye,
} from 'lucide-react';

interface DynamicFormRendererProps {
  template: DynamicFormTemplate;
  selectedPackageObj?: HajjPackage | null;
  selectedPackageTitle?: string;
  campaignSettings: CampaignSettings;
  pilgrims?: Pilgrim[];
  isPreview?: boolean;
  onAddPilgrim?: (pilgrim: Pilgrim) => void;
  onSuccessNavigate?: () => void;
}

const SECTION_ICON_MAP = {
  user: User,
  phone: Phone,
  plane: Plane,
  hotel: Hotel,
  heart: HeartPulse,
  bank: Building2,
  shield: ShieldCheck,
  list: ListChecks,
} as const;

export const DynamicFormRenderer: React.FC<DynamicFormRendererProps> = ({
  template,
  selectedPackageObj,
  selectedPackageTitle,
  campaignSettings,
  pilgrims = [],
  isPreview = false,
  onAddPilgrim,
  onSuccessNavigate,
}) => {
  const flattened = useMemo(() => getFlattenedTemplateFields(template), [template]);

  // Build initial state keyed by field.id
  const initialValues = useMemo(() => {
    const map: Record<string, any> = {};
    for (const { field } of flattened) {
      if (field.type === 'notice') continue;
      if (field.defaultValue !== undefined) {
        map[field.id] = field.defaultValue;
      } else if (field.type === 'checkbox_group') {
        map[field.id] = [];
      } else if (field.type === 'boolean') {
        map[field.id] = false;
      } else if (field.type === 'dual_date') {
        map[field.id] = { gregorian: '', hijri: '' };
      } else {
        map[field.id] = '';
      }
    }
    return map;
  }, [flattened]);

  const [valuesByFieldId, setValuesByFieldId] = useState<Record<string, any>>(initialValues);
  const [pledgeAccepted, setPledgeAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingFieldId, setUploadingFieldId] = useState<string | null>(null);
  const [submittedPilgrim, setSubmittedPilgrim] = useState<Pilgrim | null>(null);
  const [previewTestPassed, setPreviewTestPassed] = useState(false);

  // OCR Scanner State
  const ocrInputRef = useRef<HTMLInputElement | null>(null);
  const [isScanningOcr, setIsScanningOcr] = useState(false);
  const [ocrNotice, setOcrNotice] = useState('');

  const activeSeasonYear = useMemo(() => {
    return extractHijriYear(
      selectedPackageObj?.seasonYear ||
        template.seasonYear ||
        campaignSettings?.pilgrimStatsConfig?.activeSeasonYear ||
        '1448'
    );
  }, [selectedPackageObj, template.seasonYear, campaignSettings]);

  const approvedBankNames = useMemo(() => {
    const configured = (campaignSettings?.approvedBanks || defaultCampaignSettings.approvedBanks || [])
      .filter((b) => b.isActive !== false && b.name.trim())
      .map((b) => b.name.trim());
    return configured.length > 0
      ? configured
      : ['مصرف الراجحي', 'البنك الأهلي السعودي', 'بنك الرياض', 'مصرف الإنماء', 'البنك السعودي الأول (ساب)'];
  }, [campaignSettings]);

  const marjiNames = useMemo(() => {
    const configured = (campaignSettings?.marjiList || defaultCampaignSettings.marjiList || [])
      .map((m) => m.trim())
      .filter(Boolean);
    return configured.length > 0 ? configured : ['السيد علي السيستاني', 'السيد علي الخامنئي', 'مرجع آخر'];
  }, [campaignSettings]);

  const resolveFieldOptions = (field: DynamicFormField): string[] => {
    if (field.optionsSource === 'approved_banks') return approvedBankNames;
    if (field.optionsSource === 'marji_list') return marjiNames;
    return (field.options || []).map((o) => o.trim()).filter(Boolean);
  };

  const setFieldValue = (fieldId: string, value: any) => {
    setValuesByFieldId((prev) => ({ ...prev, [fieldId]: value }));
    setErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
    setPreviewTestPassed(false);
  };

  const handleOcrFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanningOcr(true);
    setOcrNotice('');
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const ocrResult = await scanSaudiIdCardHybrid(dataUrl);
      const scanned = ocrResult?.scannedData;
      if (scanned) {
        const nextValues = { ...valuesByFieldId };
        let filledCount = 0;

        for (const { field } of flattened) {
          const core = field.mappedCoreKey;
          if (!core) continue;
          if (core === 'nationalIdImage' && ocrResult?.croppedImage?.dataUrl) {
            nextValues[field.id] = ocrResult.croppedImage.dataUrl;
            filledCount++;
            continue;
          }
          if (core === 'firstName' && scanned.firstName) {
            nextValues[field.id] = scanned.firstName;
            filledCount++;
          } else if (core === 'secondName' && scanned.secondName) {
            nextValues[field.id] = scanned.secondName;
            filledCount++;
          } else if (core === 'thirdName' && scanned.thirdName) {
            nextValues[field.id] = scanned.thirdName;
            filledCount++;
          } else if (core === 'lastName' && scanned.lastName) {
            nextValues[field.id] = scanned.lastName;
            filledCount++;
          } else if (core === 'englishFullName' && scanned.englishFullName) {
            nextValues[field.id] = scanned.englishFullName;
            filledCount++;
          } else if (core === 'nationalId' && scanned.nationalId) {
            nextValues[field.id] = normalizeDigitsOnly(scanned.nationalId);
            filledCount++;
          } else if (core === 'nationality' && scanned.nationality) {
            nextValues[field.id] = scanned.nationality;
            filledCount++;
          } else if (core === 'birthDate' && scanned.birthDate) {
            const resolved = resolveDualDates(scanned.birthDate);
            nextValues[field.id] = { gregorian: resolved.gregorian, hijri: resolved.hijri };
            filledCount++;
          } else if (core === 'idIssueDate' && scanned.idIssueDate) {
            const resolved = resolveDualDates(scanned.idIssueDate);
            nextValues[field.id] = { gregorian: resolved.gregorian, hijri: resolved.hijri };
            filledCount++;
          } else if (core === 'idExpiryDate' && scanned.idExpiryDate) {
            const resolved = resolveDualDates(scanned.idExpiryDate);
            nextValues[field.id] = { gregorian: resolved.gregorian, hijri: resolved.hijri };
            filledCount++;
          }
        }

        setValuesByFieldId(nextValues);
        setOcrNotice(
          filledCount > 0
            ? `تمت قراءة البطاقة وتعبئة ${filledCount} حقل تلقائياً — يرجى مراجعة البيانات للتأكد من دقتها.`
            : 'تم فحص الصورة؛ يرجى إكمال الحقول يدوياً.'
        );
      }
    } catch {
      setOcrNotice('تعذرت القراءة التلقائية للصورة، يمكنك تعبئة الحقول يدوياً بسهولة.');
    } finally {
      setIsScanningOcr(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  };

  const handleFieldFileUpload = async (field: DynamicFormField, file: File) => {
    if (isPreview) {
      setFieldValue(field.id, `معاينة مرفق: ${file.name}`);
      return;
    }
    setUploadingFieldId(field.id);
    try {
      const asset = await uploadOptimizedMedia(file, {
        kind: 'image',
        linkedRecordId: `pilgrims/dynamic_${field.key}`,
        seasonId: normalizeSeasonId(activeSeasonYear),
        seasonName: `موسم ${activeSeasonYear}هـ`,
        cloudinaryConfig: campaignSettings?.cloudinaryConfig,
      });
      if (asset?.url) {
        setFieldValue(field.id, asset.url);
      }
    } catch {
      setErrors((prev) => ({
        ...prev,
        [field.id]: 'تعذر رفع الملف حالياً، يرجى المحاولة بصورة أصغر حجماً.',
      }));
    } finally {
      setUploadingFieldId(null);
    }
  };

  const enabledSections = useMemo(
    () =>
      [...(template.sections || [])]
        .filter((s) => s.enabled !== false)
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [template.sections]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setPreviewTestPassed(false);

    const newErrors: Record<string, string> = {};

    // Validate visible fields
    for (const sec of enabledSections) {
      const visibleFields = [...(sec.fields || [])]
        .filter((f) => f.enabled !== false && f.type !== 'notice')
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      for (const field of visibleFields) {
        if (!evaluateFieldCondition(field.condition, valuesByFieldId)) continue;
        const val = valuesByFieldId[field.id];

        if (field.required) {
          if (field.type === 'checkbox_group') {
            if (!Array.isArray(val) || val.length === 0) {
              newErrors[field.id] = `يرجى اختيار خيار واحد على الأقل في "${field.label}"`;
            }
          } else if (field.type === 'boolean') {
            if (val !== true && field.mappedCoreKey === 'termsAccepted') {
              newErrors[field.id] = 'يرجى الموافقة على هذا البند للمتابعة';
            }
          } else if (field.type === 'dual_date') {
            if (!val?.gregorian && !val?.hijri) {
              newErrors[field.id] = `يرجى تحديد "${field.label}"`;
            }
          } else if (String(val ?? '').trim() === '') {
            newErrors[field.id] = `حقل "${field.label}" مطلوب`;
          }
        }

        // Format-specific validation
        if (field.mappedCoreKey === 'nationalId' && String(val ?? '').trim()) {
          const digits = normalizeDigitsOnly(String(val));
          if (digits.length !== 10) {
            newErrors[field.id] = 'رقم الهوية / الإقامة يجب أن يتكون من 10 أرقام صحيحة';
          }
        }
        if (field.type === 'iban' && String(val ?? '').trim()) {
          const cleanIban = String(val).replace(/\s+/g, '').toUpperCase();
          if (!/^SA\d{22}$/.test(cleanIban)) {
            newErrors[field.id] = 'رقم الآيبان (IBAN) يجب أن يبدأ بـ SA ويتبعه 22 رقماً (إجمالي 24 خانة)';
          }
        }
        if (field.type === 'tel' && String(val ?? '').trim()) {
          const digits = normalizeDigitsOnly(String(val));
          if (digits.length < 9) {
            newErrors[field.id] = 'يرجى إدخال رقم جوال صحيح';
          }
        }
      }
    }

    if (!pledgeAccepted) {
      newErrors.__pledge = 'يرجى الموافقة على الإقرار والتعهد النهائي قبل إرسال الطلب.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setSubmitError('يرجى مراجعة الحقول المظللة بالأحمر وإكمال البيانات المطلوبة.');
      return;
    }

    if (isPreview) {
      setPreviewTestPassed(true);
      return;
    }

    setIsSubmitting(true);
    try {
      // Extract core mapped fields & custom fields + schema snapshot
      const coreData: Record<string, any> = {};
      const customFields: Record<string, any> = {};
      const formSchemaSnapshot: PilgrimDynamicFieldSnapshotItem[] = [];

      for (const sec of enabledSections) {
        const secFields = [...(sec.fields || [])]
          .filter((f) => f.enabled !== false && f.type !== 'notice')
          .sort((a, b) => (a.order || 0) - (b.order || 0));

        for (const field of secFields) {
          if (!evaluateFieldCondition(field.condition, valuesByFieldId)) continue;
          const rawVal = valuesByFieldId[field.id];

          if (field.mappedCoreKey) {
            if (field.type === 'dual_date') {
              const g = rawVal?.gregorian || '';
              const h = rawVal?.hijri || '';
              coreData[field.mappedCoreKey] = g || h;
              if (field.mappedCoreKey === 'birthDate') coreData.birthDateHijri = h;
              if (field.mappedCoreKey === 'idIssueDate') coreData.idIssueDateHijri = h;
              if (field.mappedCoreKey === 'idExpiryDate') coreData.idExpiryDateHijri = h;
            } else if (field.mappedCoreKey === 'nationalId') {
              coreData.nationalId = normalizeDigitsOnly(String(rawVal || ''));
            } else if (field.mappedCoreKey === 'iban') {
              coreData.iban = String(rawVal || '').replace(/\s+/g, '').toUpperCase();
            } else if (field.mappedCoreKey === 'mobile' || field.mappedCoreKey === 'whatsapp') {
              coreData[field.mappedCoreKey] = normalizeDigitsOnly(String(rawVal || ''));
            } else {
              coreData[field.mappedCoreKey] = rawVal;
            }
          } else {
            // Custom dynamic field (stored independently + snapshot preserved forever!)
            customFields[field.key] =
              field.type === 'iban'
                ? String(rawVal || '').replace(/\s+/g, '').toUpperCase()
                : rawVal;
            formSchemaSnapshot.push({
              key: field.key,
              label: field.label,
              type: field.type,
              sectionTitle: sec.title,
              targetSectors: field.targetSectors || ['general'],
              showInReports: field.showInReports !== false,
              showInPilgrimPortal: field.showInPilgrimPortal !== false,
            });
          }
        }
      }

      const nationalId = String(coreData.nationalId || '').trim();

      // Prevent duplicate registration in the same season
      const existingSameSeason = pilgrims.find(
        (p) =>
          !p.isDeleted &&
          p.status !== 'محذوف' &&
          normalizeDigitsOnly(p.nationalId) === nationalId &&
          extractHijriYear(p.seasonYear || p.hajjYear || p.season || '1448') === activeSeasonYear
      );
      if (existingSameSeason) {
        setSubmitError(
          `رقم الهوية (${nationalId}) مسجّل مسبقاً في موسم ${activeSeasonYear}هـ. يمكنك المتابعة عبر بوابة استعلام الحاج.`
        );
        setIsSubmitting(false);
        return;
      }

      const nextSeq =
        pilgrims.reduce((max, p) => Math.max(max, Number(p.pilgrimSequenceNumber || 0)), 1000) + 1;
      const regRef = `QAEM-${activeSeasonYear}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      const pkgTitle = selectedPackageObj?.title || selectedPackageTitle || 'التسجيل العام';
      const defaultTransport =
        coreData.transport ||
        (selectedPackageObj?.transport?.includes('طير') || pkgTitle.includes('طيران') ? 'طائرة' : 'باص');

      const newPilgrim: Pilgrim = {
        id: `${nationalId || Date.now()}_${activeSeasonYear}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString().split('T')[0],
        termsAccepted: 'نعم',
        firstName: String(coreData.firstName || '').trim(),
        secondName: String(coreData.secondName || '').trim(),
        thirdName: String(coreData.thirdName || '').trim(),
        lastName: String(coreData.lastName || '').trim(),
        name: [coreData.firstName, coreData.secondName, coreData.thirdName, coreData.lastName]
          .map((s) => String(s || '').trim())
          .filter(Boolean)
          .join(' '),
        englishFullName: String(coreData.englishFullName || '').trim(),
        gender: String(coreData.gender || 'ذكر'),
        nationality: String(coreData.nationality || 'سعودي'),
        nationalId,
        idIssueDate: String(coreData.idIssueDate || ''),
        idIssueDateHijri: String(coreData.idIssueDateHijri || ''),
        idExpiryDate: String(coreData.idExpiryDate || ''),
        idExpiryDateHijri: String(coreData.idExpiryDateHijri || ''),
        birthDate: String(coreData.birthDate || ''),
        birthDateHijri: String(coreData.birthDateHijri || ''),
        mobile: String(coreData.mobile || '').trim(),
        whatsapp: String(coreData.whatsapp || coreData.mobile || '').trim(),
        email: String(coreData.email || '').trim(),
        bankAccountName: String(coreData.bankAccountName || '').trim(),
        iban: String(coreData.iban || '').trim(),
        bankName: String(coreData.bankName || '').trim(),
        transport: defaultTransport,
        hajjType: String(coreData.hajjType || template.category || 'تمتع'),
        seasonYear: activeSeasonYear,
        hajjYear: activeSeasonYear,
        season: `موسم ${template.category === 'عمرة' ? 'عمرة' : 'حج'} ${activeSeasonYear}هـ`,
        lastHajjYear: String(coreData.lastHajjYear || 'أول مرة'),
        currentMarji: String(coreData.currentMarji || ''),
        previousMarji: String(coreData.previousMarji || ''),
        madinahPrivateRoomRequested: Boolean(coreData.madinahPrivateRoomRequested),
        madinahPrivateRoomNote: String(coreData.madinahPrivateRoomNote || ''),
        mobilityIndependence: String(coreData.mobilityIndependence || 'مستقل تماماً ولله الحمد'),
        healthConditions: Array.isArray(coreData.healthConditions) ? coreData.healthConditions : [],
        otherHealthCondition: String(coreData.otherHealthCondition || ''),
        hasSpeechDifficulty: Boolean(coreData.hasSpeechDifficulty),
        isPregnant: Boolean(coreData.isPregnant),
        hasMahram: Boolean(coreData.hasMahram),
        nationalIdImage: String(coreData.nationalIdImage || ''),
        status: 'قيد المراجعة',
        applicationStatus: 'قيد المراجعة',
        selectedPackage: pkgTitle,
        packageType: selectedPackageObj?.type || pkgTitle,
        totalPackagePrice: selectedPackageObj?.price || '',
        registrationReference: regRef,
        membershipNumber: `QAEM-${activeSeasonYear}-${nextSeq}`,
        pilgrimSequenceNumber: nextSeq,
        // Dynamic Form Metadata & Versioned Snapshot
        formTemplateId: template.id,
        formTemplateName: template.name,
        formVersion: template.version || 1,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
        formSchemaSnapshot: formSchemaSnapshot.length > 0 ? formSchemaSnapshot : undefined,
      };

      if (onAddPilgrim) {
        await Promise.resolve(onAddPilgrim(newPilgrim));
      }
      setSubmittedPilgrim(newPilgrim);
    } catch (err: any) {
      setSubmitError(err?.message || 'حدث خطأ أثناء حفظ التسجيل، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submittedPilgrim) {
    return (
      <div className="bg-white dark:bg-slate-900/90 border border-emerald-200 dark:border-emerald-500/40 rounded-3xl p-8 text-center space-y-6 shadow-md dark:shadow-2xl animate-fadeIn">
        <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/40 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-11 h-11 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-black text-slate-900 dark:text-white">تم استلام طلب التسجيل بنجاح!</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
            شكراً لك <strong className="text-amber-700 dark:text-amber-400">{submittedPilgrim.name}</strong>، تم تسجيل بياناتك ضمن{' '}
            <strong className="text-emerald-700 dark:text-emerald-400">{submittedPilgrim.selectedPackage}</strong> بنجاح.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto text-right">
          <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">رقم العضوية</div>
            <div className="text-base font-mono font-black text-amber-700 dark:text-amber-400 mt-1" dir="ltr">
              {submittedPilgrim.membershipNumber}
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">الرقم المرجعي للاستعلام</div>
            <div className="text-base font-mono font-black text-emerald-700 dark:text-emerald-400 mt-1" dir="ltr">
              {submittedPilgrim.registrationReference}
            </div>
          </div>
        </div>

        {onSuccessNavigate && (
          <button
            type="button"
            onClick={onSuccessNavigate}
            className="px-8 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-2xl text-sm shadow-lg transition cursor-pointer"
          >
            الانتقال إلى بوابة استعلام الحاج
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" dir="rtl">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-white via-amber-50/40 to-white dark:from-slate-900 dark:via-[#0E172B] dark:to-slate-900 border border-amber-300 dark:border-amber-500/30 rounded-3xl p-6 space-y-3 shadow-sm dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">
              <Sparkles className="w-4 h-4" />
              <span>
                {isPreview ? 'وضع المعاينة التفاعلية الحية للاستمارة' : `استمارة التسجيل الرسمية — ${template.category}`}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{template.name}</h2>
            {template.description && (
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">{template.description}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedPackageObj && (
              <span className="px-3.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-black">
                الباقة: {selectedPackageObj.title}
              </span>
            )}
            <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-mono">
              الإصدار v{template.version || 1} • موسم {activeSeasonYear}هـ
            </span>
          </div>
        </div>

        {/* Optional Saudi ID OCR Quick Scanner */}
        {template.enableIdOcrScanner && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
              <ScanLine className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>تعبئة سريعة: يمكنك مسح صورة الهوية الوطنية لتعبئة الحقول الأساسية تلقائياً.</span>
            </div>
            <div>
              <input
                ref={ocrInputRef}
                type="file"
                accept="image/*"
                onChange={handleOcrFileChange}
                className="hidden"
              />
              <button
                type="button"
                disabled={isScanningOcr}
                onClick={() => ocrInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/35 text-xs font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                {isScanningOcr ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ScanLine className="w-3.5 h-3.5" />
                )}
                <span>{isScanningOcr ? 'جارٍ قراءة البطاقة...' : 'مسح بطاقة الهوية تلقائياً'}</span>
              </button>
            </div>
            {ocrNotice && (
              <div className="w-full text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 rounded-xl px-3 py-2">
                {ocrNotice}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dynamic Sections */}
      {enabledSections.map((section, sIdx) => {
        const IconComp = SECTION_ICON_MAP[section.icon || 'list'] || ListChecks;
        const visibleFields = [...(section.fields || [])]
          .filter((f) => f.enabled !== false)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .filter((f) => evaluateFieldCondition(f.condition, valuesByFieldId));

        if (visibleFields.length === 0) return null;

        return (
          <div
            key={section.id}
            className="bg-white dark:bg-slate-900/75 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-sm dark:shadow-lg"
          >
            <div className="flex items-start gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/80">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <IconComp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  {sIdx + 1}. {section.title}
                </h3>
                {section.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{section.description}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleFields.map((field) => {
                const value = valuesByFieldId[field.id];
                const fieldErr = errors[field.id];
                const colSpanClass =
                  field.width === 'full' ||
                  field.type === 'textarea' ||
                  field.type === 'checkbox_group' ||
                  field.type === 'notice' ||
                  field.type === 'file'
                    ? 'md:col-span-2'
                    : '';

                if (field.type === 'notice') {
                  return (
                    <div
                      key={field.id}
                      className="md:col-span-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-4 space-y-1.5"
                    >
                      <div className="text-xs font-black text-amber-800 dark:text-amber-300 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{field.label}</span>
                      </div>
                      {field.helpText && (
                        <div className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed">
                          {field.helpText}
                        </div>
                      )}
                    </div>
                  );
                }

                const options = resolveFieldOptions(field);

                return (
                  <div key={field.id} className={`space-y-1.5 ${colSpanClass}`}>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                      <span>{field.label}</span>
                      {field.required && <span className="text-red-500 dark:text-red-400 mr-1">*</span>}
                    </label>

                    {/* TEXT / NUMBER / TEL / EMAIL / IBAN */}
                    {(field.type === 'text' ||
                      field.type === 'number' ||
                      field.type === 'tel' ||
                      field.type === 'email' ||
                      field.type === 'iban') && (
                      <input
                        type={
                          field.type === 'iban'
                            ? 'text'
                            : field.type === 'number'
                            ? 'number'
                            : field.type
                        }
                        value={value ?? ''}
                        dir={
                          field.type === 'tel' ||
                          field.type === 'email' ||
                          field.type === 'iban' ||
                          field.mappedCoreKey === 'nationalId' ||
                          field.mappedCoreKey === 'englishFullName'
                            ? 'ltr'
                            : 'rtl'
                        }
                        onChange={(e) => {
                          let nextVal = e.target.value;
                          if (field.type === 'iban') {
                            nextVal = nextVal.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
                          }
                          setFieldValue(field.id, nextVal);
                        }}
                        placeholder={field.placeholder || ''}
                        className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 transition ${
                          fieldErr
                            ? 'border-red-500 focus:ring-red-500/30'
                            : 'border-slate-300 dark:border-slate-700 focus:border-amber-500 focus:ring-amber-500/25'
                        }`}
                      />
                    )}

                    {/* TEXTAREA */}
                    {field.type === 'textarea' && (
                      <textarea
                        rows={3}
                        value={value ?? ''}
                        onChange={(e) => setFieldValue(field.id, e.target.value)}
                        placeholder={field.placeholder || ''}
                        className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 transition ${
                          fieldErr
                            ? 'border-red-500 focus:ring-red-500/30'
                            : 'border-slate-300 dark:border-slate-700 focus:border-amber-500 focus:ring-amber-500/25'
                        }`}
                      />
                    )}

                    {/* SELECT */}
                    {field.type === 'select' && (
                      <select
                        value={value ?? ''}
                        onChange={(e) => setFieldValue(field.id, e.target.value)}
                        className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 transition ${
                          fieldErr
                            ? 'border-red-500 focus:ring-red-500/30'
                            : 'border-slate-300 dark:border-slate-700 focus:border-amber-500 focus:ring-amber-500/25'
                        }`}
                      >
                        <option value="">-- اختر --</option>
                        {options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* RADIO */}
                    {field.type === 'radio' && (
                      <div className="flex flex-wrap gap-2.5 pt-1">
                        {options.map((opt) => {
                          const active = String(value ?? '') === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setFieldValue(field.id, opt)}
                              className={`px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                                active
                                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                                  : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-amber-500/50'
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* CHECKBOX GROUP */}
                    {field.type === 'checkbox_group' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                        {options.map((opt) => {
                          const arr: string[] = Array.isArray(value) ? value : [];
                          const checked = arr.includes(opt);
                          return (
                            <label
                              key={opt}
                              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition ${
                                checked
                                  ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-400 dark:border-amber-500/50 text-amber-800 dark:text-amber-200'
                                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...arr, opt]
                                    : arr.filter((x) => x !== opt);
                                  setFieldValue(field.id, next);
                                }}
                                className="accent-amber-500 w-4 h-4 rounded"
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* BOOLEAN TOGGLE */}
                    {field.type === 'boolean' && (
                      <div className="flex items-center gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setFieldValue(field.id, true)}
                          className={`px-5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            value === true
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-emerald-500/40'
                          }`}
                        >
                          نعم
                        </button>
                        <button
                          type="button"
                          onClick={() => setFieldValue(field.id, false)}
                          className={`px-5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            value === false
                              ? 'bg-slate-800 dark:bg-slate-700 text-white border-slate-700 dark:border-slate-500 shadow'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
                          }`}
                        >
                          لا
                        </button>
                      </div>
                    )}

                    {/* DUAL CALENDAR (UMM AL-QURA HIJRI + GREGORIAN) */}
                    {field.type === 'dual_date' && (
                      <DualCalendarDatePicker
                        label=""
                        value={value?.gregorian || ''}
                        hijriValue={value?.hijri || ''}
                        onChange={(greg, hijri) =>
                          setFieldValue(field.id, { gregorian: greg, hijri })
                        }
                        required={field.required}
                      />
                    )}

                    {/* FILE / IMAGE UPLOAD */}
                    {field.type === 'file' && (
                      <div className="bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                          {value ? (
                            <FileCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <UploadCloud className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          )}
                          <span>
                            {value
                              ? typeof value === 'string' && value.startsWith('http')
                                ? 'تم رفع المرفق وحفظه بنجاح ✓'
                                : String(value)
                              : 'اختر صورة أو ملفاً لإرفاقه'}
                          </span>
                        </div>
                        <label className="px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/15 dark:hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/35 text-xs font-bold cursor-pointer flex items-center gap-2 transition">
                          {uploadingFieldId === field.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <UploadCloud className="w-3.5 h-3.5" />
                          )}
                          <span>{uploadingFieldId === field.id ? 'جارٍ الرفع...' : 'اختيار ملف'}</span>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFieldFileUpload(field, file);
                            }}
                          />
                        </label>
                      </div>
                    )}

                    {field.helpText && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{field.helpText}</p>
                    )}
                    {fieldErr && (
                      <p className="text-xs text-red-600 dark:text-red-400 font-bold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{fieldErr}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Final Pledge & Submit */}
      <div className="bg-white dark:bg-slate-900/90 border border-amber-300 dark:border-amber-500/30 rounded-3xl p-6 space-y-4 shadow-sm dark:shadow-none">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={pledgeAccepted}
            onChange={(e) => {
              setPledgeAccepted(e.target.checked);
              setErrors((prev) => {
                const next = { ...prev };
                delete next.__pledge;
                return next;
              });
            }}
            className="mt-1 w-5 h-5 accent-amber-500 rounded shrink-0"
          />
          <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-semibold">
            {template.pledgeText ||
              'أقر وأتعهد بأن جميع البيانات المدخلة صحيحة ودقيقة وأوافق على كافة شروط وتعليمات قافلة القائم.'}
          </span>
        </label>

        {errors.__pledge && (
          <p className="text-xs text-red-600 dark:text-red-400 font-bold flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errors.__pledge}</span>
          </p>
        )}

        {submitError && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/35 rounded-2xl p-3.5 text-xs text-red-700 dark:text-red-300 font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {previewTestPassed && isPreview && (
          <div className="bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/40 rounded-2xl p-3.5 text-xs text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>نجح اختبار التحقق من الاستمارة! جميع الحقول الإلزامية والمنطق الشرطي تعمل بدقة 100%.</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-base shadow-xl flex items-center justify-center gap-2.5 transition active:scale-[0.99] cursor-pointer disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>جارٍ اعتماد وحفظ الطلب...</span>
            </>
          ) : isPreview ? (
            <>
              <Eye className="w-5 h-5" />
              <span>اختبار التحقق من الاستمارة (وضع المعاينة)</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5" />
              <span>إرسال وتأكيد التسجيل</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
};
