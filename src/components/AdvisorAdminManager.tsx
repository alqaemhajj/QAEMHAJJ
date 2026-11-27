import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  ShieldCheck,
  BookOpen,
  Settings,
  MessageSquareText,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Lock,
  Activity,
  Search,
  Upload,
  FileText,
  Zap,
  Package,
  Filter,
} from 'lucide-react';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import {
  AdminUser,
  AdvisorInquiryLog,
  AdvisorKnowledgeItem,
  AdvisorSettings,
  CampaignSettings,
  HajjPackage,
  KnowledgeClassification,
  Pilgrim,
} from '../types';
import { DEFAULT_ADVISOR_CONFIG } from '../data/initialData';
import { buildPublicPackagesForAdvisorClient } from '../utils/packageStatus';
import { fetchWithTimeout } from '../utils/safeFetch';

interface AdvisorAdminManagerProps {
  campaignSettings: CampaignSettings;
  currentAdminUser: AdminUser | null;
  onUpdateCampaignSettings: (updated: CampaignSettings) => Promise<boolean> | boolean | void;
  initialSubTab?: 'knowledge' | 'settings' | 'inquiries';
  packages?: HajjPackage[];
  pilgrims?: Pilgrim[];
}

const OFFICIAL_CATEGORIES = [
  'تعليمات عامة',
  'أحكام الحج',
  'الإجراءات المالية',
  'السكن والمواصلات',
  'شروط التسجيل والالتحاق',
  'مواعيد التفويج والرحلات',
  'سياسة الإلغاء والاسترجاع',
  'أرقام التواصل والمقر',
  'توجيهات إدارية للمرشد',
];

const QUICK_TEMPLATES: Array<{ title: string; category: string; content: string }> = [
  {
    title: 'شروط التسجيل والالتحاق في قافلة القائم',
    category: 'شروط التسجيل والالتحاق',
    content:
      'يشترط للتسجيل في قافلة القائم للحج والعمرة: الهوية الوطنية السارية، تصريح الحج الرسمي من منصة نسك للموسم الحالي، استكمال البيانات الصحية، وسداد الدفعة المعتمدة وتأكيد الإيصال لدى الإدارة.',
  },
  {
    title: 'سياسة الإلغاء والاسترجاع المعتمدة',
    category: 'سياسة الإلغاء والاسترجاع',
    content:
      'تخضع طلبات الإلغاء والاسترجاع للضوابط الرسمية المعتمدة لدى إدارة قافلة القائم ومواعيد إقفال المسار الإلكتروني. لطلب الإلغاء أو الاستفسار عن الرسوم المستردة يرجى التواصل مباشرة مع الإدارة المالية.',
  },
  {
    title: 'مواعيد التفويج ونقاط التجمع',
    category: 'مواعيد التفويج والرحلات',
    content:
      'يتم الإعلان عن مواعيد التفويج الدقيقة ونقاط تجمع الحافلات ومواعيد رحلات الطيران للمسجلين عبر الإعلانات الرسمية وبوابة الحاج قبل موعد الانطلاق بوقت كافٍ.',
  },
];

export const AdvisorAdminManager: React.FC<AdvisorAdminManagerProps> = ({
  campaignSettings,
  currentAdminUser,
  onUpdateCampaignSettings,
  initialSubTab = 'knowledge',
  packages = [],
  pilgrims = [],
}) => {
  const [subTab, setSubTab] = useState<'knowledge' | 'settings' | 'inquiries'>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const [advisorForm, setAdvisorForm] = useState<AdvisorSettings>(() => ({
    ...DEFAULT_ADVISOR_CONFIG,
    ...(campaignSettings.advisorConfig || {}),
    enabledPageSources: {
      ...DEFAULT_ADVISOR_CONFIG.enabledPageSources,
      ...(campaignSettings.advisorConfig?.enabledPageSources || {}),
    },
  }));

  useEffect(() => {
    setAdvisorForm({
      ...DEFAULT_ADVISOR_CONFIG,
      ...(campaignSettings.advisorConfig || {}),
      enabledPageSources: {
        ...DEFAULT_ADVISOR_CONFIG.enabledPageSources,
        ...(campaignSettings.advisorConfig?.enabledPageSources || {}),
      },
    });
  }, [campaignSettings.advisorConfig]);

  // Live sanitized public packages that feed the AI Advisor
  const livePublicPackages = useMemo(
    () => buildPublicPackagesForAdvisorClient(packages, pilgrims),
    [packages, pilgrims]
  );
  const hiddenPackagesCount = useMemo(
    () => packages.filter((p) => p && p.showOnHomepage === false).length,
    [packages]
  );

  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // GET /settings/campaign diagnostic probe state
  const [diagResult, setDiagResult] = useState<{
    loading: boolean;
    status?: number;
    source?: string;
    exists?: boolean;
    quotaExceeded?: boolean;
    warning?: string;
    latencyMs?: number;
  }>({ loading: false });

  // Knowledge Base state
  const [knowledgeItems, setKnowledgeItems] = useState<AdvisorKnowledgeItem[]>([]);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [knowledgeSuccess, setKnowledgeSuccess] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Partial<AdvisorKnowledgeItem> | null>(null);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [kbSearch, setKbSearch] = useState('');
  const [kbCategoryFilter, setKbCategoryFilter] = useState<string>('all');
  const [kbStatusFilter, setKbStatusFilter] = useState<'all' | 'active' | 'draft'>('all');

  // Quick Feed / File Upload state
  const [showQuickFeedPanel, setShowQuickFeedPanel] = useState(false);
  const [quickDirectiveTitle, setQuickDirectiveTitle] = useState('');
  const [quickDirectiveCategory, setQuickDirectiveCategory] = useState('توجيهات إدارية للمرشد');
  const [quickDirectiveContent, setQuickDirectiveContent] = useState('');
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Inquiry logs state
  const [inquiries, setInquiries] = useState<AdvisorInquiryLog[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(false);
  const [inquiryFilter, setInquiryFilter] = useState<string>('all');
  const [inquirySearch, setInquirySearch] = useState('');

  const showTempSuccess = (msg: string) => {
    setKnowledgeSuccess(msg);
    setTimeout(() => {
      setKnowledgeSuccess((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const buildAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    try {
      const token = await auth.currentUser?.getIdToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch {
      // ignore token error
    }
    if (currentAdminUser?.username) {
      headers['X-Admin-Username'] = encodeURIComponent(currentAdminUser.username);
    }
    if (currentAdminUser?.id) {
      headers['X-Admin-Id'] = encodeURIComponent(currentAdminUser.id);
    }
    return headers;
  };

  const runSettingsDiagnostic = async () => {
    setDiagResult({ loading: true });
    const started = performance.now();
    try {
      const resp = await fetchWithTimeout('/settings/campaign?fresh=1', { timeoutMs: 6000 });
      const latencyMs = Math.round(performance.now() - started);
      const data = await resp.json().catch(() => ({}));
      setDiagResult({
        loading: false,
        status: resp.status,
        source: data?.source || 'unknown',
        exists: Boolean(data?.exists),
        quotaExceeded: Boolean(data?.quotaExceeded),
        warning: data?.warning || data?.error,
        latencyMs,
      });
    } catch (err: any) {
      setDiagResult({
        loading: false,
        status: 0,
        warning: err?.message || 'فشل الاتصال بنقطة النهاية /settings/campaign',
      });
    }
  };

  const fetchKnowledgeItems = async () => {
    setLoadingKnowledge(true);
    setKnowledgeError(null);
    try {
      const headers = await buildAuthHeaders();
      const resp = await fetchWithTimeout('/api/advisor/knowledge', { headers, timeoutMs: 6000 });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (Array.isArray(data.items)) {
          setKnowledgeItems(data.items);
          return;
        }
      }
      // Fallback direct Firestore read if server route is unavailable
      const snap = await getDocs(collection(db, 'advisor_knowledge'));
      const list = snap.docs.map((d) => ({
        ...(d.data() as AdvisorKnowledgeItem),
        id: d.id,
      }));
      list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      setKnowledgeItems(list);
    } catch (err: any) {
      setKnowledgeError(err?.message || 'تعذر جلب بنك المعلومات');
    } finally {
      setLoadingKnowledge(false);
    }
  };

  const fetchInquiries = async () => {
    setLoadingInquiries(true);
    try {
      const headers = await buildAuthHeaders();
      const resp = await fetchWithTimeout('/api/advisor/inquiries', { headers, timeoutMs: 6000 });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (Array.isArray(data.items)) {
          setInquiries(data.items);
          return;
        }
      }
      const snap = await getDocs(collection(db, 'advisor_inquiries'));
      const list = snap.docs.map((d) => ({
        ...(d.data() as AdvisorInquiryLog),
        id: d.id,
      }));
      list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      setInquiries(list.slice(0, 150));
    } finally {
      setLoadingInquiries(false);
    }
  };

  useEffect(() => {
    fetchKnowledgeItems();
  }, []);

  useEffect(() => {
    if (subTab === 'knowledge') {
      fetchKnowledgeItems();
    } else if (subTab === 'inquiries') {
      fetchInquiries();
    }
  }, [subTab]);

  const handleSaveAdvisorSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsFeedback(null);
    try {
      const updatedSettings: CampaignSettings = {
        ...campaignSettings,
        advisorConfig: {
          ...advisorForm,
          advisorName: 'مرشد القائم الذكي',
          updatedAt: new Date().toISOString(),
          updatedBy: currentAdminUser?.fullName || 'الإدارة',
        },
      };
      const result = await onUpdateCampaignSettings(updatedSettings);
      if (result === false) {
        setSettingsFeedback({
          type: 'err',
          text: 'تعذر تأكيد الحفظ في السحابة. تحقق من صلاحيات الحساب أو حصة Firestore.',
        });
      } else {
        setSettingsFeedback({
          type: 'ok',
          text: 'تم حفظ إعدادات «مرشد القائم الذكي» في /settings/campaign بنجاح.',
        });
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const persistKnowledgeItem = async (
    payload: Partial<AdvisorKnowledgeItem>,
    isEdit: boolean
  ): Promise<AdvisorKnowledgeItem | null> => {
    const nowIso = new Date().toISOString();
    const isActiveForAdvisor =
      payload.isApprovedForAdvisor !== undefined ? Boolean(payload.isApprovedForAdvisor) : true;
    const classification: KnowledgeClassification = isActiveForAdvisor ? 'Approved' : 'Admin Only';

    const fullItem: AdvisorKnowledgeItem = {
      id: payload.id || `akb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: String(payload.title || '').trim().slice(0, 250),
      content: String(payload.content || '').trim().slice(0, 12000),
      summary: payload.summary ? String(payload.summary).trim().slice(0, 400) : '',
      category: String(payload.category || 'تعليمات عامة').trim().slice(0, 120),
      sourceType: 'admin_knowledge',
      sourceUrl: String(payload.sourceUrl || '/#ai-advisor').trim().slice(0, 300),
      pageTitle: 'بنك المعلومات',
      classification,
      isApprovedForAdvisor: isActiveForAdvisor,
      isPublicVisible: isActiveForAdvisor,
      disabledInAdvisor: !isActiveForAdvisor,
      approvedBy: isActiveForAdvisor ? currentAdminUser?.fullName || 'إدارة القافلة' : '',
      approvedAt: isActiveForAdvisor ? nowIso : '',
      createdAt: String(payload.createdAt || nowIso),
      updatedAt: nowIso,
      tags: Array.isArray(payload.tags) ? payload.tags.map(String).slice(0, 15) : [],
    };

    // 1. Write directly to Firestore so client & server SDK immediately see it
    try {
      await setDoc(doc(db, 'advisor_knowledge', fullItem.id), fullItem, { merge: true });
    } catch (fsErr) {
      console.warn('Direct Firestore knowledge write notice:', fsErr);
    }

    // 2. Also notify backend API so in-memory RAG cache updates immediately
    try {
      const headers = await buildAuthHeaders();
      const url = isEdit ? `/api/advisor/knowledge/${fullItem.id}` : '/api/advisor/knowledge';
      const method = isEdit ? 'PATCH' : 'POST';
      await fetchWithTimeout(url, {
        method,
        timeoutMs: 6000,
        headers,
        body: JSON.stringify(fullItem),
      });
    } catch (apiErr) {
      console.warn('API knowledge sync notice:', apiErr);
    }

    return fullItem;
  };

  const handleSaveKnowledgeItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem?.title?.trim() || !editingItem?.content?.trim()) return;

    setSavingKnowledge(true);
    setKnowledgeError(null);
    try {
      const isEdit = Boolean(editingItem.id);
      await persistKnowledgeItem(editingItem, isEdit);
      setEditingItem(null);
      await fetchKnowledgeItems();
      showTempSuccess(
        isEdit
          ? 'تم تحديث البند في بنك المعلومات وتغذية المرشد الذكي فوراً.'
          : 'تمت إضافة البند الجديد إلى بنك المعلومات وتغذية المرشد الذكي فوراً.'
      );
    } catch (err: any) {
      setKnowledgeError(err?.message || 'تعذر حفظ البند في بنك المعلومات.');
    } finally {
      setSavingKnowledge(false);
    }
  };

  const handleToggleItemActive = async (item: AdvisorKnowledgeItem) => {
    const currentlyActive =
      (item.classification === 'Approved' || item.classification === 'Public') &&
      item.isApprovedForAdvisor &&
      !item.disabledInAdvisor;
    const nextActive = !currentlyActive;

    setKnowledgeError(null);
    try {
      await persistKnowledgeItem(
        {
          ...item,
          isApprovedForAdvisor: nextActive,
          classification: nextActive ? 'Approved' : 'Admin Only',
          disabledInAdvisor: !nextActive,
          isPublicVisible: nextActive,
        },
        true
      );
      await fetchKnowledgeItems();
      showTempSuccess(
        nextActive
          ? `تم تفعيل «${item.title}» للمرشد الذكي فوراً.`
          : `تم تحويل «${item.title}» إلى مخفي / مسودة (معزول عن المرشد الذكي).`
      );
    } catch (err: any) {
      setKnowledgeError(err?.message || 'تعذر تغيير حالة النشر.');
    }
  };

  const handleDeleteKnowledgeItem = async (id: string, title?: string) => {
    setKnowledgeError(null);
    try {
      try {
        await deleteDoc(doc(db, 'advisor_knowledge', id));
      } catch {
        // ignore
      }
      const headers = await buildAuthHeaders();
      await fetchWithTimeout(`/api/advisor/knowledge/${id}`, {
        method: 'DELETE',
        timeoutMs: 6000,
        headers,
      }).catch(() => {});
      setKnowledgeItems((prev) => prev.filter((item) => item.id !== id));
      showTempSuccess(`تم حذف «${title || 'البند'}» من بنك المعلومات.`);
    } catch (err: any) {
      setKnowledgeError(err?.message || 'تعذر حذف البند.');
    }
  };

  const handleQuickDirectiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickDirectiveContent.trim()) return;
    setSavingKnowledge(true);
    setKnowledgeError(null);
    try {
      const autoTitle =
        quickDirectiveTitle.trim() ||
        `توجيه إداري معتمد — ${new Date().toLocaleDateString('ar-SA')}`;
      await persistKnowledgeItem(
        {
          title: autoTitle,
          category: quickDirectiveCategory || 'توجيهات إدارية للمرشد',
          content: quickDirectiveContent.trim(),
          isApprovedForAdvisor: true,
          classification: 'Approved',
          disabledInAdvisor: false,
        },
        false
      );
      setQuickDirectiveTitle('');
      setQuickDirectiveContent('');
      setShowQuickFeedPanel(false);
      await fetchKnowledgeItems();
      showTempSuccess('تمت تغذية المرشد الذكي بالنص / التوجيه الإداري فوراً.');
    } catch (err: any) {
      setKnowledgeError(err?.message || 'تعذر حفظ التوجيه الإداري.');
    } finally {
      setSavingKnowledge(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFiles(true);
    setKnowledgeError(null);
    let importedCount = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const rawText = await file.text();
        const cleanText = rawText.trim();
        if (!cleanText) continue;

        const baseName = file.name.replace(/\.[^/.]+$/, '').trim() || `ملف معرفي ${i + 1}`;

        // If JSON array of knowledge items, import each entry
        if (file.name.toLowerCase().endsWith('.json')) {
          try {
            const parsed = JSON.parse(cleanText);
            if (Array.isArray(parsed)) {
              for (const entry of parsed) {
                if (entry && (entry.title || entry.question) && (entry.content || entry.answer)) {
                  await persistKnowledgeItem(
                    {
                      title: String(entry.title || entry.question).trim(),
                      category: String(entry.category || 'تعليمات عامة').trim(),
                      content: String(entry.content || entry.answer).trim(),
                      isApprovedForAdvisor: true,
                      classification: 'Approved',
                      disabledInAdvisor: false,
                    },
                    false
                  );
                  importedCount++;
                }
              }
              continue;
            }
          } catch {
            // Fall through and treat as plain text
          }
        }

        await persistKnowledgeItem(
          {
            title: `ملف توجيهي: ${baseName}`,
            category: quickDirectiveCategory || 'توجيهات إدارية للمرشد',
            content: cleanText.slice(0, 12000),
            isApprovedForAdvisor: true,
            classification: 'Approved',
            disabledInAdvisor: false,
          },
          false
        );
        importedCount++;
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      await fetchKnowledgeItems();
      if (importedCount > 0) {
        showTempSuccess(`تم رفع وتغذية المرشد الذكي بـ (${importedCount}) بند معرفي بنجاح.`);
      } else {
        setKnowledgeError('لم يتم العثور على نصوص صالحة داخل الملف المرفوع.');
      }
    } catch (err: any) {
      setKnowledgeError(err?.message || 'حدث خطأ أثناء قراءة الملف النصي.');
    } finally {
      setUploadingFiles(false);
    }
  };

  const isItemActiveForAdvisor = (item: AdvisorKnowledgeItem): boolean => {
    return (
      (item.classification === 'Approved' || item.classification === 'Public') &&
      Boolean(item.isApprovedForAdvisor) &&
      !item.disabledInAdvisor
    );
  };

  const activeKnowledgeCount = useMemo(
    () => knowledgeItems.filter(isItemActiveForAdvisor).length,
    [knowledgeItems]
  );
  const draftKnowledgeCount = knowledgeItems.length - activeKnowledgeCount;

  const filteredKnowledge = knowledgeItems.filter((item) => {
    const active = isItemActiveForAdvisor(item);
    if (kbStatusFilter === 'active' && !active) return false;
    if (kbStatusFilter === 'draft' && active) return false;
    if (kbCategoryFilter !== 'all' && item.category !== kbCategoryFilter) return false;
    if (!kbSearch.trim()) return true;
    const q = kbSearch.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.content.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  });

  const filteredInquiries = inquiries.filter((log) => {
    if (inquiryFilter !== 'all' && log.status !== inquiryFilter) return false;
    if (!inquirySearch.trim()) return true;
    const q = inquirySearch.toLowerCase();
    return log.question.toLowerCase().includes(q) || log.answer.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#070C18] via-[#0E182D] to-[#070C18] border border-amber-500/30 rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-black text-white">
                بنك المعلومات (قاعدة المعرفة) ومرشد القائم الذكي
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>عزل أمني تام لبيانات الإدارة</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              يستمد «مرشد القائم الذكي» إجاباته حصرياً من مصدرين فقط: المحتوى العام المنشور للزوار + البنود المفعّلة في بنك المعلومات أدناه
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSubTab('knowledge')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              subTab === 'knowledge'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'bg-[#0B1221] text-slate-300 border border-slate-700 hover:border-amber-500/40'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>بنك المعلومات (قاعدة المعرفة) ({knowledgeItems.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('settings')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              subTab === 'settings'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'bg-[#0B1221] text-slate-300 border border-slate-700 hover:border-amber-500/40'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>إعدادات ومصادر المرشد</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('inquiries')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              subTab === 'inquiries'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'bg-[#0B1221] text-slate-300 border border-slate-700 hover:border-amber-500/40'
            }`}
          >
            <MessageSquareText className="w-4 h-4" />
            <span>سجل استفسارات الزوار ({inquiries.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1 (PRIMARY): KNOWLEDGE BASE ("بنك المعلومات - قاعدة المعرفة") */}
      {subTab === 'knowledge' && (
        <div className="space-y-6">
          {/* Live Data Grounding & Security Isolation Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Card 1: Knowledge Base Stats */}
            <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4" />
                  <span>المصدر الأول: بنك المعلومات المعتمد</span>
                </span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {activeKnowledgeCount} مفعّل للمرشد
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                البنود المفعّلة ({activeKnowledgeCount}) يتغذى عليها المرشد الذكي فوراً، بينما البنود المخفية/المسودات ({draftKnowledgeCount}) معزولة تماماً عن الزوار.
              </p>
            </div>

            {/* Card 2: Live Public Packages Grounding (100% Realistic Prices) */}
            <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-sky-400 flex items-center gap-1.5">
                  <Package className="w-4 h-4" />
                  <span>المصدر الثاني: الباقات المنشورة للزوار ({livePublicPackages.length})</span>
                </span>
                {hiddenPackagesCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30">
                    {hiddenPackagesCount} مخفية (معزولة)
                  </span>
                )}
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                {livePublicPackages.length === 0 ? (
                  <p className="text-[11px] text-slate-500">لا توجد باقات مفعلة للظهور في الصفحة الرئيسية حالياً.</p>
                ) : (
                  livePublicPackages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="flex items-center justify-between gap-2 text-[11px] bg-[#070C18] border border-slate-800/80 rounded-lg px-2.5 py-1"
                    >
                      <span className="font-bold text-slate-200 truncate">{pkg.title}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-amber-300 font-bold">
                          {pkg.hasDefinedPrice ? pkg.priceDisplay : 'لم يُحدد السعر'}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            pkg.isAvailableForRegistration
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {pkg.publicStatusLabel}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Card 3: Strict Security Isolation Rules */}
            <div className="bg-[#0B1221] border border-emerald-500/30 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                  <Lock className="w-4 h-4" />
                  <span>حماية وعزل البيانات السرية 100%</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300">
                  مفعّل دائماً
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                يُمنع منعاً باتاً تمرير أسماء الحجاج، الهويات، الجوالات، الآيبان، الإحصائيات المالية، أعداد المقاعد المتبقية السرية، أو الباقات المخفية إلى سياق المرشد الذكي.
              </p>
            </div>
          </div>

          {/* Action Toolbar: Search, Filter, Add Article, Quick Text/File Feed */}
          <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  value={kbSearch}
                  onChange={(e) => setKbSearch(e.target.value)}
                  placeholder="ابحث بالعنوان، السؤال الشائع، التصنيف، أو المحتوى..."
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl pr-9 pl-4 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={kbCategoryFilter}
                  onChange={(e) => setKbCategoryFilter(e.target.value)}
                  className="bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="all">كل التصنيفات</option>
                  {OFFICIAL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                <select
                  value={kbStatusFilter}
                  onChange={(e) => setKbStatusFilter(e.target.value as any)}
                  className="bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="all">كل الحالات ({knowledgeItems.length})</option>
                  <option value="active">مفعّل للمرشد الذكي ({activeKnowledgeCount})</option>
                  <option value="draft">مخفي أو مسودة ({draftKnowledgeCount})</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.csv,.json"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploadingFiles}
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/35 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                title="رفع ملف نصي (.txt, .md, .csv, .json) لتغذية المرشد الذكي فوراً"
              >
                {uploadingFiles ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>رفع ملف نصي / توجيهات</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQuickFeedPanel((prev) => !prev)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                  showQuickFeedPanel
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/35'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>تغذية نصية فورية</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingItem({
                    title: '',
                    content: '',
                    category: 'تعليمات عامة',
                    sourceUrl: '/#ai-advisor',
                    classification: 'Approved',
                    isApprovedForAdvisor: true,
                    isPublicVisible: true,
                    disabledInAdvisor: false,
                  });
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة مقال / إجابة معتمدة</span>
              </button>

              <button
                type="button"
                onClick={fetchKnowledgeItems}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold cursor-pointer"
                title="تحديث القائمة"
              >
                <RefreshCw className={`w-4 h-4 ${loadingKnowledge ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Feedback Banners */}
          {knowledgeSuccess && (
            <div className="bg-emerald-500/15 border border-emerald-500/35 rounded-2xl p-4 text-xs text-emerald-300 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{knowledgeSuccess}</span>
            </div>
          )}

          {knowledgeError && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 text-xs text-rose-300 font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{knowledgeError}</span>
            </div>
          )}

          {/* Quick Text / Administrative Directive Immediate Feed Panel */}
          {showQuickFeedPanel && (
            <form
              onSubmit={handleQuickDirectiveSubmit}
              className="bg-[#0B1221] border border-emerald-500/40 rounded-3xl p-5 space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-black text-emerald-400">
                      إضافة نصوص عامة أو توجيهات إدارية فورية للمرشد الذكي
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      ألصق أي تعليمات أو إجابات رسمية ليتم اعتمادها وتغذية «مرشد القائم الذكي» بها فوراً، أو ارفع ملفاً نصياً (.txt / .md / .csv / .json).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickFeedPanel(false)}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  إغلاق
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    عنوان النص أو التوجيه الإداري (اختياري)
                  </label>
                  <input
                    type="text"
                    value={quickDirectiveTitle}
                    onChange={(e) => setQuickDirectiveTitle(e.target.value)}
                    placeholder="مثال: تعليمات التفويج ليوم التروية أو أرقام الطوارئ"
                    className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">التصنيف</label>
                  <select
                    value={quickDirectiveCategory}
                    onChange={(e) => setQuickDirectiveCategory(e.target.value)}
                    className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    {OFFICIAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  النص العام / التوجيه الإداري المعتمد *
                </label>
                <textarea
                  rows={4}
                  required
                  value={quickDirectiveContent}
                  onChange={(e) => setQuickDirectiveContent(e.target.value)}
                  placeholder="اكتب أو ألصق النص الرسمي الذي تريد أن يجيب المرشد الذكي بناءً عليه فوراً..."
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>أو اختر ملفاً نصياً من جهازك (.txt, .md, .csv, .json)</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowQuickFeedPanel(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={savingKnowledge || !quickDirectiveContent.trim()}
                    className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                  >
                    {savingKnowledge ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    <span>تغذية المرشد الذكي فوراً</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Create / Edit Knowledge Base Article Modal Form */}
          {editingItem && (
            <form
              onSubmit={handleSaveKnowledgeItem}
              className="bg-[#0B1221] border border-amber-500/50 rounded-3xl p-6 space-y-5 shadow-2xl"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-black text-amber-400">
                    {editingItem.id
                      ? 'تعديل بند في بنك المعلومات (قاعدة المعرفة)'
                      : 'إضافة مقال / سؤال شائع جديد إلى بنك المعلومات'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    أدخل السؤال الشائع أو العنوان الرسمي والإجابة التفصيلية المعتمدة لقافلة القائم للحج والعمرة
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800/80 cursor-pointer self-start sm:self-auto"
                >
                  إغلاق
                </button>
              </div>

              {/* Quick Templates Helper */}
              {!editingItem.id && (
                <div className="flex flex-wrap items-center gap-2 bg-[#070C18] border border-slate-800 rounded-xl p-3">
                  <span className="text-[11px] font-bold text-slate-400">نماذج سريعة:</span>
                  {QUICK_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.title}
                      type="button"
                      onClick={() =>
                        setEditingItem({
                          ...editingItem,
                          title: tpl.title,
                          category: tpl.category,
                          content: tpl.content,
                        })
                      }
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-amber-300 border border-slate-700 hover:border-amber-500/40 transition cursor-pointer"
                    >
                      + {tpl.title}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    العنوان / السؤال الشائع *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingItem.title || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                    className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                    placeholder="مثال: شروط التسجيل، مواعيد التفويج، سياسة الإلغاء، أرقام التواصل"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    التصنيف *
                  </label>
                  <select
                    value={editingItem.category || 'تعليمات عامة'}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                    className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                  >
                    {OFFICIAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  المحتوى / الإجابة التفصيلية المعتمدة *
                </label>
                <textarea
                  rows={6}
                  required
                  value={editingItem.content || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, content: e.target.value })}
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white leading-relaxed focus:outline-none focus:border-amber-500"
                  placeholder="أدخل الإجابة الرسمية التفصيلية المعتمدة التي سيلتزم بها مرشد القائم الذكي حرفياً عند إجابة الزوار والحجاج..."
                />
              </div>

              {/* Publish Status Toggle Switch (حالة النشر: مفعّل للمرشد الذكي / مخفي أو مسودة) */}
              <div className="bg-[#070C18] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-black text-white flex items-center gap-2">
                    <span>حالة النشر في «مرشد القائم الذكي» (Toggle Switch)</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        editingItem.isApprovedForAdvisor !== false
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {editingItem.isApprovedForAdvisor !== false
                        ? 'مفعّل للمرشد الذكي'
                        : 'مخفي أو مسودة'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    عند التفعيل، يعتمد المرشد الذكي على هذا البند فوراً في إجاباته. وعند تحويله إلى «مخفي أو مسودة»، يتم عزله تماماً عن الزوار.
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={editingItem.isApprovedForAdvisor !== false}
                  onClick={() => {
                    const nextActive = editingItem.isApprovedForAdvisor === false;
                    setEditingItem({
                      ...editingItem,
                      isApprovedForAdvisor: nextActive,
                      classification: nextActive ? 'Approved' : 'Admin Only',
                      disabledInAdvisor: !nextActive,
                      isPublicVisible: nextActive,
                    });
                  }}
                  className={`relative inline-flex h-9 w-44 shrink-0 cursor-pointer items-center rounded-xl border px-3 transition-all ${
                    editingItem.isApprovedForAdvisor !== false
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded-full ml-2 transition-colors ${
                      editingItem.isApprovedForAdvisor !== false ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                  <span className="text-xs font-black">
                    {editingItem.isApprovedForAdvisor !== false
                      ? 'مفعّل للمرشد الذكي'
                      : 'مخفي أو مسودة'}
                  </span>
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingKnowledge}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow cursor-pointer"
                >
                  {savingKnowledge ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>حفظ في بنك المعلومات</span>
                </button>
              </div>
            </form>
          )}

          {/* Knowledge Base Items List */}
          <div className="space-y-3">
            {filteredKnowledge.length === 0 && !loadingKnowledge && (
              <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-8 text-center space-y-3">
                <BookOpen className="w-8 h-8 text-amber-400/70 mx-auto" />
                <div className="text-sm font-bold text-white">
                  لا توجد بنود مضافة في «بنك المعلومات» تطابق البحث الحالي
                </div>
                <p className="text-xs text-slate-400 max-w-lg mx-auto">
                  يمكنك إضافة الأسئلة الشائعة، شروط التسجيل، مواعيد التفويج، سياسة الإلغاء، أو رفع ملف نصي ليقوم «مرشد القائم الذكي» بالاعتماد عليها فوراً.
                </p>
              </div>
            )}

            {filteredKnowledge.map((item) => {
              const isActive = isItemActiveForAdvisor(item);

              return (
                <div
                  key={item.id}
                  className={`bg-[#0B1221] border rounded-2xl p-4 sm:p-5 transition ${
                    isActive
                      ? 'border-slate-800 hover:border-amber-500/40'
                      : 'border-slate-800/60 opacity-80'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          {item.category || 'تعليمات عامة'}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${
                            isActive
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {isActive ? 'مفعّل للمرشد الذكي ✓' : 'مخفي أو مسودة'}
                        </span>
                      </div>

                      <h4 className="text-base font-black text-white">{item.title}</h4>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                        {item.content}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400 pt-1">
                        {item.approvedBy && (
                          <span>
                            بواسطة: <strong className="text-amber-300">{item.approvedBy}</strong>
                          </span>
                        )}
                        <span>
                          آخر تحديث:{' '}
                          <span className="font-mono">
                            {String(item.updatedAt || '').slice(0, 16).replace('T', ' ')}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Direct Toggle Switch + Edit & Delete Controls */}
                    <div className="flex flex-wrap sm:flex-col items-center sm:items-end justify-between gap-2.5 shrink-0">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isActive}
                        onClick={() => handleToggleItemActive(item)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-2 transition cursor-pointer ${
                          isActive
                            ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
                        }`}
                        title="تبديل حالة النشر (مفعّل للمرشد الذكي / مخفي أو مسودة)"
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            isActive ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                        />
                        <span>{isActive ? 'مفعّل للمرشد الذكي' : 'مخفي أو مسودة'}</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingItem(item)}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          title="تعديل"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>تعديل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteKnowledgeItem(item.id, item.title)}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: SETTINGS & DIAGNOSTICS */}
      {subTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-black text-amber-400">
                <Activity className="w-4 h-4" />
                <span>فحص وصحة المسار الرسمي: GET /settings/campaign</span>
              </div>
              <p className="text-xs text-slate-400">
                يتحقق من قراءة مستند إعدادات القافلة عبر الخادم وقاعدة البيانات.
              </p>
              {diagResult.status !== undefined && (
                <div className="pt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono text-slate-200">
                    HTTP {diagResult.status}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-amber-300 font-bold">
                    المصدر: {diagResult.source}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-emerald-300 font-mono">
                    {diagResult.latencyMs}ms
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={diagResult.loading}
              onClick={runSettingsDiagnostic}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/35 text-xs font-bold flex items-center gap-2 shrink-0 transition cursor-pointer"
            >
              {diagResult.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>اختبار المسار الآن</span>
            </button>
          </div>

          <form onSubmit={handleSaveAdvisorSettings} className="bg-[#0B1221] border border-slate-800 rounded-3xl p-6 space-y-6">
            {settingsFeedback && (
              <div
                className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
                  settingsFeedback.type === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {settingsFeedback.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                <span>{settingsFeedback.text}</span>
              </div>
            )}

            <div className="flex items-center justify-between bg-[#070C18] border border-slate-800 rounded-2xl p-4">
              <div>
                <h4 className="text-sm font-bold text-white">تفعيل «مرشد القائم الذكي» للزوار والحجاج</h4>
                <p className="text-xs text-slate-400 mt-0.5">يمكنك إيقاف الخدمة مؤقتاً أو إعادة تشغيلها في أي وقت</p>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={advisorForm.enabled}
                  onChange={(e) => setAdvisorForm({ ...advisorForm, enabled: e.target.checked })}
                  className="w-5 h-5 accent-amber-500 rounded"
                />
                <span className={`text-xs font-bold ${advisorForm.enabled ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {advisorForm.enabled ? 'مفعّل' : 'متوقف'}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">رسالة الترحيب الرسمية لـ «مرشد القائم الذكي»</label>
                <textarea
                  rows={3}
                  value={advisorForm.welcomeMessage}
                  onChange={(e) => setAdvisorForm({ ...advisorForm, welcomeMessage: e.target.value })}
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">رسالة الاعتذار عند السؤال عن بيانات سرية أو غير متوفرة</label>
                <textarea
                  rows={2}
                  value={advisorForm.unavailableMessage}
                  onChange={(e) => setAdvisorForm({ ...advisorForm, unavailableMessage: e.target.value })}
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">نموذج Gemini المعتمد</label>
                <select
                  value={advisorForm.model}
                  onChange={(e) => setAdvisorForm({ ...advisorForm, model: e.target.value as any })}
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono text-amber-300"
                >
                  <option value="gemini-4-hydrogen">gemini-4-hydrogen (الأدق والرئيسي)</option>
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (سريع وخفيف)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">أسلوب الصياغة</label>
                <select
                  value={advisorForm.creativityLevel}
                  onChange={(e) => setAdvisorForm({ ...advisorForm, creativityLevel: e.target.value as any })}
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white"
                >
                  <option value="strict">صارم (التزام حرفي بالمصادر)</option>
                  <option value="balanced">متوازن</option>
                  <option value="detailed">مفصل</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">طول الإجابة</label>
                <select
                  value={advisorForm.responseLength}
                  onChange={(e) => setAdvisorForm({ ...advisorForm, responseLength: e.target.value as any })}
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white"
                >
                  <option value="short">مختصرة ومباشرة</option>
                  <option value="medium">متوسطة</option>
                  <option value="detailed">مفصلة مع النقاط</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">حد الأسئلة / ساعة للمستخدم</label>
                <input
                  type="number"
                  min={5}
                  max={500}
                  value={advisorForm.maxMessagesPerHour}
                  onChange={(e) =>
                    setAdvisorForm({ ...advisorForm, maxMessagesPerHour: Number(e.target.value) || 40 })
                  }
                  className="w-full bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono text-white"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2 text-xs font-black text-amber-400">
                <ShieldCheck className="w-4 h-4" />
                <span>المصادر العامة المسموح لـ «مرشد القائم الذكي» الاستناد إليها</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { key: 'home', label: 'الصفحة الرئيسية ونبذة القافلة' },
                  { key: 'packages', label: 'الباقات الظاهرة للزوار وأسعارها' },
                  { key: 'announcements', label: 'الإعلانات والتعاميم المنشورة' },
                  { key: 'guide', label: 'دليل الحاج وخطة الرحلة والحقيبة' },
                  { key: 'religiousGuidance', label: 'كشف المراجع الدينية المعتمدة' },
                  { key: 'registrationTerms', label: 'شروط الالتحاق والتسجيل' },
                  { key: 'contact', label: 'معلومات التواصل والمقر' },
                  { key: 'adminKnowledge', label: 'بنك المعلومات (قاعدة المعرفة)' },
                ].map((src) => (
                  <label
                    key={src.key}
                    className="flex items-center gap-2.5 bg-[#070C18] border border-slate-800 hover:border-amber-500/40 rounded-xl p-3 cursor-pointer text-xs text-slate-200 font-bold"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean((advisorForm.enabledPageSources as any)?.[src.key])}
                      onChange={(e) =>
                        setAdvisorForm({
                          ...advisorForm,
                          enabledPageSources: {
                            ...advisorForm.enabledPageSources,
                            [src.key]: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 accent-amber-500 rounded shrink-0"
                    />
                    <span>{src.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingSettings}
                className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow flex items-center gap-2 transition cursor-pointer disabled:opacity-60"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>حفظ إعدادات مرشد القائم الذكي</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: INQUIRIES AUDIT LOG */}
      {subTab === 'inquiries' && (
        <div className="space-y-4">
          <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  value={inquirySearch}
                  onChange={(e) => setInquirySearch(e.target.value)}
                  placeholder="بحث في الأسئلة والإجابات..."
                  className="bg-[#070C18] border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-xs text-white"
                />
              </div>
              <select
                value={inquiryFilter}
                onChange={(e) => setInquiryFilter(e.target.value)}
                className="bg-[#070C18] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200"
              >
                <option value="all">جميع الحالات</option>
                <option value="answered">تمت الإجابة بمصدر معتمد</option>
                <option value="unavailable">معلومة غير متوفرة</option>
                <option value="blocked_security">محجوب أمنياً (حماية سرية)</option>
              </select>
            </div>
            <button
              type="button"
              onClick={fetchInquiries}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingInquiries ? 'animate-spin' : ''}`} />
              <span>تحديث السجل</span>
            </button>
          </div>

          <div className="space-y-3">
            {filteredInquiries.length === 0 && !loadingInquiries && (
              <div className="bg-[#0B1221] border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-400">
                لا توجد استفسارات مسجلة تطابق التصفية الحالية.
              </div>
            )}
            {filteredInquiries.map((log) => (
              <div key={log.id} className="bg-[#0B1221] border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span
                    className={`px-2 py-0.5 rounded font-bold border ${
                      log.status === 'answered'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                        : log.status === 'blocked_security'
                        ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                    }`}
                  >
                    {log.status === 'answered'
                      ? 'تمت الإجابة'
                      : log.status === 'blocked_security'
                      ? 'محجوب أمنياً (حماية بيانات سرية)'
                      : 'معلومة غير متوفرة'}
                  </span>
                  <div className="flex items-center gap-3 text-slate-400 font-mono">
                    {log.modelUsed && <span>{log.modelUsed}</span>}
                    <span>{String(log.createdAt || '').slice(0, 19).replace('T', ' ')}</span>
                  </div>
                </div>
                <p className="text-xs font-bold text-amber-300">سؤال الزائر: {log.question}</p>
                <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">{log.answer}</p>
                {Array.isArray(log.matchedSources) && log.matchedSources.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-400">المصادر المعتمدة:</span>
                    {log.matchedSources.map((s, idx) => (
                      <span
                        key={`${s.title}-${idx}`}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                      >
                        {s.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
