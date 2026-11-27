import React, { useState, useMemo } from 'react';
import {
  DynamicFormTemplate,
  DynamicFormSection,
  DynamicFormField,
  DynamicFieldType,
  DynamicFieldTargetSector,
  CorePilgrimFieldKey,
  DYNAMIC_FIELD_TYPE_LABELS,
  DYNAMIC_SECTOR_LABELS,
  CORE_PILGRIM_FIELD_OPTIONS,
} from '../../types/dynamicForms';
import { HajjPackage, CampaignSettings, Pilgrim } from '../../types';
import {
  buildBlankStarterTemplate,
  buildDefault1448MirrorTemplate,
  saveDynamicFormTemplate,
  deleteDynamicFormTemplate,
  duplicateDynamicFormTemplate,
  generateFormEntityId,
} from '../../lib/dynamicFormsDb';
import { DynamicFormRenderer } from './DynamicFormRenderer';
import {
  Plus,
  Copy,
  Trash2,
  Edit3,
  Eye,
  Save,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  Lock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Layers,
  Sliders,
  Link2,
  FileText,
  Settings2,
  Loader2,
  X,
  Package,
  GitBranch,
  ShieldCheck,
} from 'lucide-react';

interface DynamicFormBuilderAdminProps {
  dynamicForms: DynamicFormTemplate[];
  packages: HajjPackage[];
  pilgrims: Pilgrim[];
  campaignSettings: CampaignSettings;
  adminName?: string;
  onUpdatePackage: (pkg: HajjPackage) => Promise<boolean> | boolean | void;
  onLogActivity?: (action: string, target: string, details?: string) => void;
}

const ALL_SECTORS: DynamicFieldTargetSector[] = [
  'general',
  'housing',
  'transport_bus',
  'transport_flight',
  'health',
  'finance',
  'religious',
  'gifts',
];

const SECTION_ICONS: { value: NonNullable<DynamicFormSection['icon']>; label: string }[] = [
  { value: 'user', label: 'شخصي / هوية' },
  { value: 'phone', label: 'تواصل' },
  { value: 'plane', label: 'نقل ورحلات' },
  { value: 'hotel', label: 'سكن وتسكين' },
  { value: 'heart', label: 'رعاية صحية' },
  { value: 'bank', label: 'مالية وبنك' },
  { value: 'shield', label: 'توثيق وتعهد' },
  { value: 'list', label: 'قائمة عامة' },
];

export const DynamicFormBuilderAdmin: React.FC<DynamicFormBuilderAdminProps> = ({
  dynamicForms,
  packages,
  pilgrims,
  campaignSettings,
  adminName = 'الإدارة العامة',
  onUpdatePackage,
  onLogActivity,
}) => {
  const [editingForm, setEditingForm] = useState<DynamicFormTemplate | null>(null);
  const [isNewForm, setIsNewForm] = useState(false);
  const [previewForm, setPreviewForm] = useState<DynamicFormTemplate | null>(null);
  const [activeFieldEditor, setActiveFieldEditor] = useState<{
    sectionId: string;
    field: DynamicFormField;
  } | null>(null);
  const [optionsTextDraft, setOptionsTextDraft] = useState('');
  const [corePickerSectionId, setCorePickerSectionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);

  // Map each formId -> list of packages bound to it
  const packagesByFormId = useMemo(() => {
    const map = new Map<string, HajjPackage[]>();
    for (const pkg of packages) {
      if (!pkg.formTemplateId) continue;
      const arr = map.get(pkg.formTemplateId) || [];
      arr.push(pkg);
      map.set(pkg.formTemplateId, arr);
    }
    return map;
  }, [packages]);

  // Count how many pilgrims registered using each formId
  const pilgrimsCountByFormId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pilgrims) {
      if (!p.formTemplateId || p.isDeleted || p.status === 'محذوف') continue;
      map.set(p.formTemplateId, (map.get(p.formTemplateId) || 0) + 1);
    }
    return map;
  }, [pilgrims]);

  // All fields in currently edited form (for conditional logic dropdown)
  const allFieldsInEditingForm = useMemo(() => {
    if (!editingForm) return [];
    const list: { id: string; label: string; sectionTitle: string }[] = [];
    for (const sec of editingForm.sections || []) {
      for (const fld of sec.fields || []) {
        if (fld.type !== 'notice') {
          list.push({ id: fld.id, label: fld.label, sectionTitle: sec.title });
        }
      }
    }
    return list;
  }, [editingForm]);

  const showTempNotice = (type: 'success' | 'error', text: string) => {
    setSaveNotice({ type, text });
    setTimeout(() => setSaveNotice(null), 4500);
  };

  const handleStartNewBlank = () => {
    const fresh = buildBlankStarterTemplate(adminName);
    setEditingForm(fresh);
    setIsNewForm(true);
    setSaveNotice(null);
  };

  const handleStartFrom1448Mirror = () => {
    const mirror = buildDefault1448MirrorTemplate(adminName);
    setEditingForm(mirror);
    setIsNewForm(true);
    setSaveNotice(null);
  };

  const handleOpenEdit = (form: DynamicFormTemplate) => {
    setEditingForm(JSON.parse(JSON.stringify(form)));
    setIsNewForm(false);
    setSaveNotice(null);
  };

  const handleSaveForm = async (publishNow = false) => {
    if (!editingForm) return;
    if (!editingForm.name.trim()) {
      showTempNotice('error', 'يرجى إدخال اسم واضح للاستمارة قبل الحفظ.');
      return;
    }

    setIsSaving(true);
    try {
      const toSave: DynamicFormTemplate = {
        ...editingForm,
        status: publishNow ? 'active' : editingForm.status,
        updatedBy: adminName,
      };
      const shouldIncrementVersion = !isNewForm && (pilgrimsCountByFormId.get(toSave.id) || 0) > 0;
      const res = await saveDynamicFormTemplate(toSave, shouldIncrementVersion);
      if (res.ok) {
        setEditingForm(res.savedTemplate);
        setIsNewForm(false);
        showTempNotice(
          'success',
          shouldIncrementVersion
            ? `تم حفظ الاستمارة وترقية الإصدار إلى v${res.savedTemplate.version} بنجاح (مع حماية السجلات السابقة).`
            : 'تم حفظ الاستمارة الديناميكية في قاعدة البيانات بنجاح!'
        );
        onLogActivity?.(
          isNewForm ? 'إنشاء استمارة ديناميكية جديدة' : 'تحديث استمارة ديناميكية',
          `${res.savedTemplate.name} (v${res.savedTemplate.version})`,
          `الحالة: ${res.savedTemplate.status} | عدد الأقسام: ${res.savedTemplate.sections.length}`
        );
      } else {
        showTempNotice('error', res.error || 'تعذر حفظ الاستمارة حالياً.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicate = async (form: DynamicFormTemplate) => {
    const res = await duplicateDynamicFormTemplate(form, `${form.name} (نسخة)`, adminName);
    if (res.ok) {
      showTempNotice('success', `تم إنشاء نسخة جديدة: "${res.savedTemplate.name}"`);
      onLogActivity?.('نسخ استمارة ديناميكية', res.savedTemplate.name);
    }
  };

  const handleDelete = async (form: DynamicFormTemplate) => {
    const boundPkgs = packagesByFormId.get(form.id) || [];
    if (boundPkgs.length > 0) {
      showTempNotice(
        'error',
        `لا يمكن حذف الاستمارة "${form.name}" لأنها مربوطة حالياً بـ ${boundPkgs.length} باقة. يرجى فك ارتباطها بالباقات أولاً أو أرشفتها.`
      );
      return;
    }
    setDeletingFormId(form.id);
    try {
      const res = await deleteDynamicFormTemplate(form.id);
      if (res.ok) {
        showTempNotice('success', `تم حذف الاستمارة "${form.name}" بنجاح.`);
        onLogActivity?.('حذف استمارة ديناميكية', form.name);
      }
    } finally {
      setDeletingFormId(null);
    }
  };

  const handleTogglePackageBinding = async (pkg: HajjPackage, form: DynamicFormTemplate) => {
    const isCurrentlyBound = pkg.formTemplateId === form.id;
    const updatedPkg: HajjPackage = {
      ...pkg,
      formTemplateId: isCurrentlyBound ? '' : form.id,
      formTemplateName: isCurrentlyBound ? '' : form.name,
    };
    await onUpdatePackage(updatedPkg);
    showTempNotice(
      'success',
      isCurrentlyBound
        ? `تم فك ارتباط باقة "${pkg.title}" (ستعمل على الاستمارة الافتراضية).`
        : `تم ربط باقة "${pkg.title}" باستمارة "${form.name}" بنجاح!`
    );
  };

  // Section operations inside editingForm
  const addSection = () => {
    if (!editingForm) return;
    const nextSec: DynamicFormSection = {
      id: generateFormEntityId('sec'),
      title: `قسم جديد ${(editingForm.sections || []).length + 1}`,
      description: '',
      icon: 'list',
      enabled: true,
      order: (editingForm.sections || []).length + 1,
      fields: [],
    };
    setEditingForm({ ...editingForm, sections: [...editingForm.sections, nextSec] });
  };

  const updateSection = (secId: string, patch: Partial<DynamicFormSection>) => {
    if (!editingForm) return;
    setEditingForm({
      ...editingForm,
      sections: editingForm.sections.map((s) => (s.id === secId ? { ...s, ...patch } : s)),
    });
  };

  const moveSection = (index: number, dir: -1 | 1) => {
    if (!editingForm) return;
    const target = index + dir;
    if (target < 0 || target >= editingForm.sections.length) return;
    const next = [...editingForm.sections];
    [next[index], next[target]] = [next[target], next[index]];
    setEditingForm({
      ...editingForm,
      sections: next.map((s, i) => ({ ...s, order: i + 1 })),
    });
  };

  const deleteSection = (secId: string) => {
    if (!editingForm) return;
    const sec = editingForm.sections.find((s) => s.id === secId);
    if (sec?.fields.some((f) => f.isSystemLocked)) {
      showTempNotice(
        'error',
        'لا يمكن حذف هذا القسم لأنه يحتوي على حقول الهوية الأساسية المقفلة (الاسم، الهوية، الجوال).'
      );
      return;
    }
    setEditingForm({
      ...editingForm,
      sections: editingForm.sections.filter((s) => s.id !== secId),
    });
  };

  // Field operations inside editingForm
  const openFieldInspector = (sectionId: string, field: DynamicFormField) => {
    setActiveFieldEditor({ sectionId, field: JSON.parse(JSON.stringify(field)) });
    setOptionsTextDraft((field.options || []).join('\n'));
  };

  const addCustomField = (sectionId: string) => {
    if (!editingForm) return;
    const sec = editingForm.sections.find((s) => s.id === sectionId);
    const id = generateFormEntityId('fld');
    const newField: DynamicFormField = {
      id,
      key: `custom_${Date.now().toString(36)}`,
      label: 'حقل مخصص جديد',
      type: 'text',
      required: false,
      enabled: true,
      placeholder: '',
      helpText: '',
      options: [],
      optionsSource: 'custom',
      targetSectors: ['general'],
      showInReports: true,
      showInPilgrimPortal: true,
      width: 'half',
      order: (sec?.fields.length || 0) + 1,
    };
    setEditingForm({
      ...editingForm,
      sections: editingForm.sections.map((s) =>
        s.id === sectionId ? { ...s, fields: [...s.fields, newField] } : s
      ),
    });
    openFieldInspector(sectionId, newField);
  };

  const addPreMappedCoreField = (sectionId: string, coreKey: CorePilgrimFieldKey) => {
    if (!editingForm) return;
    const meta = CORE_PILGRIM_FIELD_OPTIONS.find((c) => c.key === coreKey);
    if (!meta) return;

    // Prevent duplicate core key in same form
    const alreadyExists = editingForm.sections.some((s) =>
      s.fields.some((f) => f.mappedCoreKey === coreKey)
    );
    if (alreadyExists) {
      showTempNotice('error', `الحقل الأساسي "${meta.label}" موجود مسبقاً في هذه الاستمارة.`);
      return;
    }

    const sec = editingForm.sections.find((s) => s.id === sectionId);
    const newField: DynamicFormField = {
      id: generateFormEntityId('fld'),
      key: coreKey,
      label: meta.label,
      type: meta.defaultType,
      required: Boolean(meta.locked),
      enabled: true,
      isSystemLocked: Boolean(meta.locked),
      mappedCoreKey: coreKey,
      optionsSource:
        coreKey === 'bankName'
          ? 'approved_banks'
          : coreKey === 'currentMarji'
          ? 'marji_list'
          : 'custom',
      options:
        coreKey === 'gender'
          ? ['ذكر', 'أنثى']
          : coreKey === 'transport'
          ? ['باص', 'طائرة']
          : coreKey === 'hajjType'
          ? ['تمتع', 'مستحب', 'نيابة', 'قِران', 'إفراد', 'عمرة']
          : coreKey === 'healthConditions'
          ? ['السكري', 'ضغط الدم', 'أمراض القلب', 'الربو / الحساسية', 'آلام الظهر / المفاصل']
          : [],
      targetSectors: [...meta.defaultSectors],
      showInReports: coreKey !== 'nationalIdImage',
      showInPilgrimPortal: coreKey !== 'nationalIdImage',
      width: meta.defaultType === 'textarea' || meta.defaultType === 'checkbox_group' ? 'full' : 'half',
      order: (sec?.fields.length || 0) + 1,
    };

    setEditingForm({
      ...editingForm,
      sections: editingForm.sections.map((s) =>
        s.id === sectionId ? { ...s, fields: [...s.fields, newField] } : s
      ),
    });
    setCorePickerSectionId(null);
  };

  const commitActiveFieldEdit = () => {
    if (!editingForm || !activeFieldEditor) return;
    const { sectionId, field } = activeFieldEditor;
    const cleanedOptions = optionsTextDraft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const updatedField: DynamicFormField = {
      ...field,
      label: field.label.trim() || 'حقل بدون عنوان',
      options: cleanedOptions,
      targetSectors:
        field.targetSectors.length > 0 ? field.targetSectors : ['general'],
    };

    setEditingForm({
      ...editingForm,
      sections: editingForm.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              fields: s.fields.map((f) => (f.id === updatedField.id ? updatedField : f)),
            }
          : s
      ),
    });
    setActiveFieldEditor(null);
  };

  const moveField = (sectionId: string, idx: number, dir: -1 | 1) => {
    if (!editingForm) return;
    setEditingForm({
      ...editingForm,
      sections: editingForm.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const target = idx + dir;
        if (target < 0 || target >= s.fields.length) return s;
        const next = [...s.fields];
        [next[idx], next[target]] = [next[target], next[idx]];
        return { ...s, fields: next.map((f, i) => ({ ...f, order: i + 1 })) };
      }),
    });
  };

  const deleteField = (sectionId: string, fieldId: string) => {
    if (!editingForm) return;
    setEditingForm({
      ...editingForm,
      sections: editingForm.sections.map((s) =>
        s.id === sectionId
          ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId || f.isSystemLocked) }
          : s
      ),
    });
  };

  const duplicateField = (sectionId: string, field: DynamicFormField) => {
    if (!editingForm) return;
    const clone: DynamicFormField = {
      ...JSON.parse(JSON.stringify(field)),
      id: generateFormEntityId('fld'),
      key: `custom_${Date.now().toString(36)}`,
      label: `${field.label} (نسخة)`,
      isSystemLocked: false,
      mappedCoreKey: undefined,
    };
    setEditingForm({
      ...editingForm,
      sections: editingForm.sections.map((s) =>
        s.id === sectionId ? { ...s, fields: [...s.fields, clone] } : s
      ),
    });
  };

  // ============================================================================
  // LIVE PREVIEW MODAL
  // ============================================================================
  if (previewForm) {
    return (
      <div className="space-y-4 animate-fadeIn">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0B1221] border border-amber-500/40 rounded-2xl p-4">
          <div className="flex items-center gap-2.5 text-amber-400 font-black text-sm">
            <Eye className="w-5 h-5" />
            <span>معاينة حية تفاعلية: {previewForm.name}</span>
          </div>
          <button
            type="button"
            onClick={() => setPreviewForm(null)}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة إلى منشئ الاستمارات</span>
          </button>
        </div>

        <div className="max-w-4xl mx-auto">
          <DynamicFormRenderer
            template={previewForm}
            campaignSettings={campaignSettings}
            pilgrims={pilgrims}
            isPreview={true}
          />
        </div>
      </div>
    );
  }

  // ============================================================================
  // VISUAL EDITOR VIEW
  // ============================================================================
  if (editingForm) {
    const boundPackages = packagesByFormId.get(editingForm.id) || [];

    return (
      <div className="space-y-6 animate-fadeIn">
        {/* Top Editor Action Bar */}
        <div className="sticky top-2 z-20 bg-[#0B1221]/95 backdrop-blur border border-amber-500/35 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditingForm(null)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
              title="العودة لقائمة الاستمارات"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white">{editingForm.name || 'استمارة جديدة'}</h3>
                <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-amber-300 text-[11px] font-mono">
                  v{editingForm.version || 1}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                تعديل الأقسام والحقول والمنطق الشرطي وربط القطاعات والكشوفات
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewForm(editingForm)}
              className="px-4 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/35 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
            >
              <Eye className="w-4 h-4" />
              <span>معاينة حية</span>
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSaveForm(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>حفظ التعديلات</span>
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSaveForm(true)}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-lg cursor-pointer transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>حفظ وتفعيل للباقات</span>
            </button>
          </div>
        </div>

        {saveNotice && (
          <div
            className={`rounded-2xl p-3.5 text-xs font-bold flex items-center gap-2 border ${
              saveNotice.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                : 'bg-red-500/10 border-red-500/35 text-red-300'
            }`}
          >
            {saveNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{saveNotice.text}</span>
          </div>
        )}

        {/* General Form Settings */}
        <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
            <Settings2 className="w-4 h-4" />
            <span>الإعدادات العامة للاستمارة</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-bold text-slate-300">اسم الاستمارة *</label>
              <input
                type="text"
                value={editingForm.name}
                onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })}
                placeholder="مثال: استمارة حج موسم 1449هـ — باقة الطيران VIP"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">حالة الاستمارة</label>
              <select
                value={editingForm.status}
                onChange={(e) =>
                  setEditingForm({
                    ...editingForm,
                    status: e.target.value as DynamicFormTemplate['status'],
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold"
              >
                <option value="active">نشطة (جاهزة للربط بالباقات)</option>
                <option value="draft">مسودة (قيد التصميم)</option>
                <option value="archived">مؤرشفة</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">التصنيف</label>
              <select
                value={editingForm.category}
                onChange={(e) =>
                  setEditingForm({
                    ...editingForm,
                    category: e.target.value as DynamicFormTemplate['category'],
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
              >
                <option value="حج">حج</option>
                <option value="عمرة">عمرة</option>
                <option value="زيارة">زيارة</option>
                <option value="VIP">VIP</option>
                <option value="عام">عام</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">سنة الموسم الهجرية</label>
              <input
                type="text"
                value={editingForm.seasonYear || ''}
                onChange={(e) => setEditingForm({ ...editingForm, seasonYear: e.target.value })}
                placeholder="مثال: 1449"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono"
              />
            </div>

            <div className="flex items-end">
              <label className="w-full flex items-center justify-between gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 cursor-pointer">
                <span className="text-xs font-bold text-slate-200">تفعيل مسح بطاقة الهوية (OCR)</span>
                <input
                  type="checkbox"
                  checked={editingForm.enableIdOcrScanner !== false}
                  onChange={(e) =>
                    setEditingForm({ ...editingForm, enableIdOcrScanner: e.target.checked })
                  }
                  className="accent-amber-500 w-4 h-4"
                />
              </label>
            </div>

            <div className="md:col-span-3 space-y-1">
              <label className="text-xs font-bold text-slate-300">وصف مختصر للاستمارة (يظهر للحاج أعلى النموذج)</label>
              <input
                type="text"
                value={editingForm.description || ''}
                onChange={(e) => setEditingForm({ ...editingForm, description: e.target.value })}
                placeholder="وصف اختياري يوضح هدف الاستمارة..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-200"
              />
            </div>

            <div className="md:col-span-3 space-y-1">
              <label className="text-xs font-bold text-slate-300">نص الإقرار والتعهد النهائي</label>
              <textarea
                rows={2}
                value={editingForm.pledgeText || ''}
                onChange={(e) => setEditingForm({ ...editingForm, pledgeText: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-200"
              />
            </div>
          </div>

          {/* Direct Package Binding (Available once saved) */}
          {!isNewForm && packages.length > 0 && (
            <div className="pt-4 border-t border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs font-black text-emerald-400">
                  <Link2 className="w-4 h-4" />
                  <span>تمرير وربط هذه الاستمارة بباقات الحجاج ({boundPackages.length} باقة مربوطة)</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  الباقات غير المحددة تبقى تلقائياً على الاستمارة الافتراضية دون تأثر.
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {packages.map((pkg) => {
                  const isBound = pkg.formTemplateId === editingForm.id;
                  const boundToOther = Boolean(pkg.formTemplateId && pkg.formTemplateId !== editingForm.id);
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => handleTogglePackageBinding(pkg, editingForm)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer ${
                        isBound
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : boundToOther
                          ? 'bg-slate-900 border-amber-500/30 text-amber-300/80 hover:border-amber-400'
                          : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-amber-500/40'
                      }`}
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>{pkg.title}</span>
                      {isBound && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sections & Fields Builder */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-white font-black text-base">
              <Layers className="w-5 h-5 text-amber-400" />
              <span>أقسام وحقول الاستمارة ({editingForm.sections.length} أقسام)</span>
            </div>
            <button
              type="button"
              onClick={addSection}
              className="px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة قسم جديد</span>
            </button>
          </div>

          {editingForm.sections.map((section, sIdx) => (
            <div
              key={section.id}
              className={`bg-[#0B1221] border rounded-2xl p-5 space-y-4 transition ${
                section.enabled !== false ? 'border-slate-800' : 'border-slate-800/50 opacity-60'
              }`}
            >
              {/* Section Header Controls */}
              <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={sIdx === 0}
                    onClick={() => moveSection(sIdx, -1)}
                    className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                    title="تحريك القسم للأعلى"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={sIdx === editingForm.sections.length - 1}
                    onClick={() => moveSection(sIdx, 1)}
                    className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                    title="تحريك القسم للأسفل"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                <input
                  type="text"
                  value={section.title}
                  onChange={(e) => updateSection(section.id, { title: e.target.value })}
                  className="flex-1 min-w-[200px] bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-sm font-black text-white"
                  placeholder="عنوان القسم..."
                />

                <select
                  value={section.icon || 'list'}
                  onChange={(e) =>
                    updateSection(section.id, {
                      icon: e.target.value as DynamicFormSection['icon'],
                    })
                  }
                  className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-300"
                >
                  {SECTION_ICONS.map((ic) => (
                    <option key={ic.value} value={ic.value}>
                      {ic.label}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={section.enabled !== false}
                    onChange={(e) => updateSection(section.id, { enabled: e.target.checked })}
                    className="accent-emerald-500"
                  />
                  <span>مفعّل</span>
                </label>

                <button
                  type="button"
                  onClick={() => deleteSection(section.id)}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer"
                  title="حذف القسم"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <input
                type="text"
                value={section.description || ''}
                onChange={(e) => updateSection(section.id, { description: e.target.value })}
                placeholder="وصف توضيحي اختياري لهذا القسم..."
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-400"
              />

              {/* Fields List */}
              <div className="space-y-2">
                {section.fields.map((field, fIdx) => (
                  <div
                    key={field.id}
                    className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border transition ${
                      field.enabled !== false
                        ? 'bg-slate-950/90 border-slate-800 hover:border-amber-500/35'
                        : 'bg-slate-950/40 border-slate-800/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          disabled={fIdx === 0}
                          onClick={() => moveField(section.id, fIdx, -1)}
                          className="text-slate-500 hover:text-white disabled:opacity-25 cursor-pointer"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={fIdx === section.fields.length - 1}
                          onClick={() => moveField(section.id, fIdx, 1)}
                          className="text-slate-500 hover:text-white disabled:opacity-25 cursor-pointer"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white">{field.label}</span>
                          {field.required && (
                            <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 text-[10px] font-bold">
                              إلزامي
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                            {DYNAMIC_FIELD_TYPE_LABELS[field.type]}
                          </span>
                          {field.isSystemLocked && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-bold inline-flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" />
                              أساسي مقفل
                            </span>
                          )}
                          {!field.isSystemLocked && field.mappedCoreKey && (
                            <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 text-[10px] font-bold">
                              مربوط بقطاع: {field.mappedCoreKey}
                            </span>
                          )}
                          {!field.mappedCoreKey && field.type !== 'notice' && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">
                              حقل مخصص (ينعكس بالكشوفات)
                            </span>
                          )}
                          {field.condition?.dependsOnFieldId && (
                            <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[10px] font-bold inline-flex items-center gap-1">
                              <GitBranch className="w-2.5 h-2.5" />
                              شرطي
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {(field.targetSectors || ['general']).map((secKey) => (
                            <span
                              key={secKey}
                              className="text-[10px] text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded"
                            >
                              {DYNAMIC_SECTOR_LABELS[secKey]}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openFieldInspector(section.id, field)}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>خصائص الحقل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateField(section.id, field)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                        title="تكرار الحقل"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {!field.isSystemLocked && (
                        <button
                          type="button"
                          onClick={() => deleteField(section.id, field.id)}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer"
                          title="حذف الحقل"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Field Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => addCustomField(section.id)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة حقل مخصص جديد</span>
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setCorePickerSectionId(corePickerSectionId === section.id ? null : section.id)
                    }
                    className="px-3.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/35 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>إضافة حقل نظام جاهز (مربوط بالقطاعات)</span>
                  </button>

                  {corePickerSectionId === section.id && (
                    <div className="absolute right-0 mt-2 w-80 max-h-72 overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2 z-30 space-y-1">
                      <div className="px-2 py-1 text-[11px] font-black text-amber-400 flex items-center justify-between">
                        <span>اختر حقلاً لإضافته للقسم</span>
                        <button
                          type="button"
                          onClick={() => setCorePickerSectionId(null)}
                          className="text-slate-400 hover:text-white cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {CORE_PILGRIM_FIELD_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => addPreMappedCoreField(section.id, opt.key)}
                          className="w-full text-right px-3 py-2 rounded-xl hover:bg-slate-800 text-xs text-slate-200 flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <span className="font-bold">{opt.label}</span>
                          <span className="text-[10px] text-slate-400">
                            {DYNAMIC_FIELD_TYPE_LABELS[opt.defaultType]}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Field Inspector Modal */}
        {activeFieldEditor && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-[#0B1221] border border-amber-500/40 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-amber-400 font-black text-base">
                  <Sliders className="w-5 h-5" />
                  <span>إعدادات وخصائص الحقل</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveFieldEditor(null)}
                  className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-300">تسمية الحقل الظاهرة للحاج *</label>
                  <input
                    type="text"
                    value={activeFieldEditor.field.label}
                    onChange={(e) =>
                      setActiveFieldEditor({
                        ...activeFieldEditor,
                        field: { ...activeFieldEditor.field, label: e.target.value },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">نوع الحقل</label>
                  <select
                    disabled={activeFieldEditor.field.isSystemLocked}
                    value={activeFieldEditor.field.type}
                    onChange={(e) =>
                      setActiveFieldEditor({
                        ...activeFieldEditor,
                        field: {
                          ...activeFieldEditor.field,
                          type: e.target.value as DynamicFieldType,
                        },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
                  >
                    {(Object.keys(DYNAMIC_FIELD_TYPE_LABELS) as DynamicFieldType[]).map((t) => (
                      <option key={t} value={t}>
                        {DYNAMIC_FIELD_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">عرض الحقل بالاستمارة</label>
                  <select
                    value={activeFieldEditor.field.width || 'half'}
                    onChange={(e) =>
                      setActiveFieldEditor({
                        ...activeFieldEditor,
                        field: {
                          ...activeFieldEditor.field,
                          width: e.target.value as 'full' | 'half',
                        },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="half">نصف السطر (عمودان)</option>
                    <option value="full">عرض كامل (سطر مستقل)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">نص إرشادي داخل الحقل (Placeholder)</label>
                  <input
                    type="text"
                    value={activeFieldEditor.field.placeholder || ''}
                    onChange={(e) =>
                      setActiveFieldEditor({
                        ...activeFieldEditor,
                        field: { ...activeFieldEditor.field, placeholder: e.target.value },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">ربط بحقل نظام أساسي (اختياري)</label>
                  <select
                    disabled={activeFieldEditor.field.isSystemLocked}
                    value={activeFieldEditor.field.mappedCoreKey || ''}
                    onChange={(e) =>
                      setActiveFieldEditor({
                        ...activeFieldEditor,
                        field: {
                          ...activeFieldEditor.field,
                          mappedCoreKey: (e.target.value || undefined) as CorePilgrimFieldKey | undefined,
                        },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-60"
                  >
                    <option value="">حقل مخصص مستقل (يُحفظ في البيانات الإضافية)</option>
                    {CORE_PILGRIM_FIELD_OPTIONS.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label} ({c.key})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-300">ملاحظة / نص مساعد أسفل الحقل</label>
                  <textarea
                    rows={2}
                    value={activeFieldEditor.field.helpText || ''}
                    onChange={(e) =>
                      setActiveFieldEditor({
                        ...activeFieldEditor,
                        field: { ...activeFieldEditor.field, helpText: e.target.value },
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                {/* Options Editor for select / radio / checkbox_group */}
                {(activeFieldEditor.field.type === 'select' ||
                  activeFieldEditor.field.type === 'radio' ||
                  activeFieldEditor.field.type === 'checkbox_group') && (
                  <div className="sm:col-span-2 bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-black text-amber-400">مصدر الخيارات</label>
                      <select
                        value={activeFieldEditor.field.optionsSource || 'custom'}
                        onChange={(e) =>
                          setActiveFieldEditor({
                            ...activeFieldEditor,
                            field: {
                              ...activeFieldEditor.field,
                              optionsSource: e.target.value as DynamicFormField['optionsSource'],
                            },
                          })
                        }
                        className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                      >
                        <option value="custom">قائمة خيارات مخصصة (تكتبها أدناه)</option>
                        <option value="approved_banks">البنوك المعتمدة في إعدادات النظام تلقائياً</option>
                        <option value="marji_list">قائمة المراجع الدينية المعتمدة تلقائياً</option>
                      </select>
                    </div>

                    {(activeFieldEditor.field.optionsSource || 'custom') === 'custom' && (
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-400">
                          اكتب كل خيار في سطر مستقل:
                        </label>
                        <textarea
                          rows={4}
                          value={optionsTextDraft}
                          onChange={(e) => setOptionsTextDraft(e.target.value)}
                          placeholder={'خيار 1\nخيار 2\nخيار 3'}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Visibility & Required Toggles */}
                <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <label className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={activeFieldEditor.field.isSystemLocked}
                      checked={activeFieldEditor.field.required}
                      onChange={(e) =>
                        setActiveFieldEditor({
                          ...activeFieldEditor,
                          field: { ...activeFieldEditor.field, required: e.target.checked },
                        })
                      }
                      className="accent-red-500"
                    />
                    <span>حقل إلزامي</span>
                  </label>

                  <label className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={activeFieldEditor.field.isSystemLocked}
                      checked={activeFieldEditor.field.enabled !== false}
                      onChange={(e) =>
                        setActiveFieldEditor({
                          ...activeFieldEditor,
                          field: { ...activeFieldEditor.field, enabled: e.target.checked },
                        })
                      }
                      className="accent-emerald-500"
                    />
                    <span>مفعّل بالاستمارة</span>
                  </label>

                  <label className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeFieldEditor.field.showInReports !== false}
                      onChange={(e) =>
                        setActiveFieldEditor({
                          ...activeFieldEditor,
                          field: { ...activeFieldEditor.field, showInReports: e.target.checked },
                        })
                      }
                      className="accent-amber-500"
                    />
                    <span>إظهار في Excel وPDF</span>
                  </label>

                  <label className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeFieldEditor.field.showInPilgrimPortal !== false}
                      onChange={(e) =>
                        setActiveFieldEditor({
                          ...activeFieldEditor,
                          field: {
                            ...activeFieldEditor.field,
                            showInPilgrimPortal: e.target.checked,
                          },
                        })
                      }
                      className="accent-sky-500"
                    />
                    <span>إظهار ببوابة الحاج</span>
                  </label>
                </div>

                {/* Target Operational Sectors */}
                <div className="sm:col-span-2 bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                  <div className="text-xs font-black text-emerald-400">
                    القطاعات التي ينعكس فيها هذا الحقل تلقائياً:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {ALL_SECTORS.map((secKey) => {
                      const selected = (activeFieldEditor.field.targetSectors || ['general']).includes(
                        secKey
                      );
                      return (
                        <label
                          key={secKey}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-[11px] font-bold cursor-pointer ${
                            selected
                              ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-300'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                              const current = activeFieldEditor.field.targetSectors || ['general'];
                              const next = e.target.checked
                                ? Array.from(new Set([...current, secKey]))
                                : current.filter((x) => x !== secKey);
                              setActiveFieldEditor({
                                ...activeFieldEditor,
                                field: {
                                  ...activeFieldEditor.field,
                                  targetSectors: next.length > 0 ? next : ['general'],
                                },
                              });
                            }}
                            className="accent-emerald-500"
                          />
                          <span>{DYNAMIC_SECTOR_LABELS[secKey]}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Conditional Logic */}
                <div className="sm:col-span-2 bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-black text-purple-400">
                    <GitBranch className="w-4 h-4" />
                    <span>المنطق الشرطي (إظهار الحقل بناءً على إجابة حقل آخر — اختياري)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={activeFieldEditor.field.condition?.dependsOnFieldId || ''}
                      onChange={(e) => {
                        const depId = e.target.value;
                        setActiveFieldEditor({
                          ...activeFieldEditor,
                          field: {
                            ...activeFieldEditor.field,
                            condition: depId
                              ? {
                                  dependsOnFieldId: depId,
                                  operator:
                                    activeFieldEditor.field.condition?.operator || 'equals',
                                  value: activeFieldEditor.field.condition?.value || '',
                                }
                              : undefined,
                          },
                        });
                      }}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                    >
                      <option value="">بدون شرط (يظهر دائماً)</option>
                      {allFieldsInEditingForm
                        .filter((f) => f.id !== activeFieldEditor.field.id)
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                    </select>

                    {activeFieldEditor.field.condition?.dependsOnFieldId && (
                      <>
                        <select
                          value={activeFieldEditor.field.condition.operator}
                          onChange={(e) =>
                            setActiveFieldEditor({
                              ...activeFieldEditor,
                              field: {
                                ...activeFieldEditor.field,
                                condition: {
                                  ...activeFieldEditor.field.condition!,
                                  operator: e.target.value as any,
                                },
                              },
                            })
                          }
                          className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                        >
                          <option value="is_truthy">نعم / مُفعّل</option>
                          <option value="is_falsy">لا / فارغ</option>
                          <option value="equals">يساوي القيمة</option>
                          <option value="not_equals">لا يساوي القيمة</option>
                          <option value="contains">يحتوي على</option>
                        </select>

                        {(activeFieldEditor.field.condition.operator === 'equals' ||
                          activeFieldEditor.field.condition.operator === 'not_equals' ||
                          activeFieldEditor.field.condition.operator === 'contains') && (
                          <input
                            type="text"
                            value={activeFieldEditor.field.condition.value || ''}
                            onChange={(e) =>
                              setActiveFieldEditor({
                                ...activeFieldEditor,
                                field: {
                                  ...activeFieldEditor.field,
                                  condition: {
                                    ...activeFieldEditor.field.condition!,
                                    value: e.target.value,
                                  },
                                },
                              })
                            }
                            placeholder="القيمة المطلوبة..."
                            className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveFieldEditor(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={commitActiveFieldEdit}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black cursor-pointer"
                >
                  اعتماد خصائص الحقل
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // TEMPLATES LIBRARY LIST VIEW
  // ============================================================================
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-[#0B1221] via-[#111B33] to-[#0B1221] border border-amber-500/30 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-black text-amber-400">
              <Sparkles className="w-4 h-4" />
              <span>نظام منشئ الاستمارات الديناميكي (Dynamic Form Builder)</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              تصميم استمارات الحجاج وتمريرها للباقات
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
              أنشئ استمارات مخصصة لكل باقة أو موسم بحرية كاملة في الأقسام والحقول والمنطق الشرطي، مع انعكاس تلقائي على كشوفات Excel وPDF وقطاعات الإدارة وبوابة استعلام الحاج —{' '}
              <strong className="text-emerald-400">
                مع حماية تامة 100% لسجلات حج 1448 والأعوام السابقة دون أي تعديل عليها.
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleStartFrom1448Mirror}
              className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-2 shadow-lg transition cursor-pointer"
            >
              <Copy className="w-4 h-4" />
              <span>استنساخ قالب حج 1448 المعتمد</span>
            </button>
            <button
              type="button"
              onClick={handleStartNewBlank}
              className="px-4 py-2.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 text-xs font-black flex items-center gap-2 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء استمارة من الصفر</span>
            </button>
          </div>
        </div>

        {/* Historical Protection Guarantee Strip */}
        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3 text-xs text-emerald-200">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>حماية البيانات التاريخية (1448هـ وما قبلها):</strong> جميع الباقات غير المربوطة باستمارة ديناميكية تواصل العمل تلقائياً على الاستمارة الأصلية، وكل تسجيل جديد يحفظ لقطة مستقلة من إصدار الاستمارة لضمان ثبات الكشوفات عبر السنوات.
          </span>
        </div>
      </div>

      {saveNotice && (
        <div
          className={`rounded-2xl p-3.5 text-xs font-bold flex items-center gap-2 border ${
            saveNotice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
              : 'bg-red-500/10 border-red-500/35 text-red-300'
          }`}
        >
          {saveNotice.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{saveNotice.text}</span>
        </div>
      )}

      {/* Templates Grid */}
      {dynamicForms.length === 0 ? (
        <div className="bg-[#0B1221] border border-dashed border-slate-700 rounded-3xl p-10 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
            <FileText className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-black text-white">لم يتم إنشاء استمارات ديناميكية بعد</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              تعمل جميع الباقات حالياً على الاستمارة الافتراضية المعتمدة لحج 1448. يمكنك البدء باستنساخ قالب 1448 الجاهز للتعديل عليه أو تصميم استمارة مخصصة من الصفر لأي باقة جديدة.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleStartFrom1448Mirror}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-2 cursor-pointer"
            >
              <Copy className="w-4 h-4" />
              <span>ابدأ بنسخة مطابقة لاستمارة 1448</span>
            </button>
            <button
              type="button"
              onClick={handleStartNewBlank}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء استمارة جديدة من الصفر</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {dynamicForms.map((form) => {
            const boundPkgs = packagesByFormId.get(form.id) || [];
            const regCount = pilgrimsCountByFormId.get(form.id) || 0;
            const totalFields = (form.sections || []).reduce(
              (acc, s) => acc + (s.fields || []).length,
              0
            );
            const customFieldsCount = (form.sections || []).reduce(
              (acc, s) =>
                acc + (s.fields || []).filter((f) => !f.mappedCoreKey && f.type !== 'notice').length,
              0
            );

            return (
              <div
                key={form.id}
                className="bg-[#0B1221] border border-slate-800 hover:border-amber-500/35 rounded-2xl p-5 flex flex-col justify-between gap-4 transition shadow-lg"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-black text-white">{form.name}</h3>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                            form.status === 'active'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : form.status === 'draft'
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {form.status === 'active'
                            ? 'نشطة'
                            : form.status === 'draft'
                            ? 'مسودة'
                            : 'مؤرشفة'}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-mono">
                          v{form.version || 1}
                        </span>
                      </div>
                      {form.description && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                          {form.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stats Chips */}
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                      التصنيف: <strong className="text-amber-300">{form.category}</strong>
                    </span>
                    {form.seasonYear && (
                      <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                        الموسم: <strong className="text-white">{form.seasonYear}هـ</strong>
                      </span>
                    )}
                    <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                      الأقسام: <strong className="text-white">{form.sections.length}</strong> • الحقول:{' '}
                      <strong className="text-white">{totalFields}</strong>
                      {customFieldsCount > 0 && (
                        <span className="text-emerald-400"> ({customFieldsCount} مخصص)</span>
                      )}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                      المسجلون بها: <strong className="text-sky-300">{regCount}</strong>
                    </span>
                  </div>

                  {/* Bound Packages */}
                  <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>الباقات المرتبطة بهذه الاستمارة ({boundPkgs.length}):</span>
                    </div>
                    {boundPkgs.length === 0 ? (
                      <div className="text-[11px] text-slate-500">
                        غير مربوطة بباقة بعد — يمكنك ربطها من زر "تحرير" أو من إدارة الباقات.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {boundPkgs.map((pkg) => (
                          <span
                            key={pkg.id}
                            className="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold"
                          >
                            {pkg.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(form)}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تحرير وتصميم</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewForm(form)}
                      className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>معاينة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(form)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={deletingFormId === form.id}
                    onClick={() => handleDelete(form)}
                    className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer transition disabled:opacity-40"
                    title="حذف الاستمارة"
                  >
                    {deletingFormId === form.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
