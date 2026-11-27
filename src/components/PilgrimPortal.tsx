import React, { useMemo, useState } from 'react';
import { Pilgrim, CampaignSettings, HajjPackage } from '../types';
import { 
  Search, ShieldCheck, CheckCircle2, AlertCircle, 
  Loader2, Sparkles, Star, MessageSquare, Send, Smartphone, FileCheck,
  Lock, KeyRound, CreditCard, RotateCcw, ShieldAlert, Clock,
  ListChecks, User, ArrowLeft, Users, Hotel, Calendar, Building2
} from 'lucide-react';
import { getDocument, queryDocuments, updateDocument, recordActivityLog } from '../lib/db';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { PilgrimNotificationCenter } from './PilgrimNotificationCenter';
import { PilgrimGroupMiniMap } from './maps/PilgrimGroupMiniMap';
import { resolvePilgrimGroupLocation } from './maps/mapsUtils';
import { PilgrimManasikTracker } from './PilgrimManasikTracker';
import { formatDualDateSummary } from '../utils/dualCalendar';
import { getPilgrimCustomFieldEntries } from '../lib/dynamicFormsDb';
import { PilgrimPaymentVaccinationCard } from './pilgrim/PilgrimPaymentVaccinationCard';

interface PilgrimPortalProps {
  pilgrims: Pilgrim[];
  packages?: HajjPackage[];
  campaignSettings?: CampaignSettings;
}

export const PilgrimPortal: React.FC<PilgrimPortalProps> = ({ 
  pilgrims: initialPilgrims,
  packages = [],
  campaignSettings = {
    phone: '0534717773',
    whatsapp: '0534717773',
    email: 'alqaemhajj@gmail.com',
    address: 'المملكة العربية السعودية - المنطقة الشرقية (الأحساء-المبرز)',
    marjiList: []
  }
}) => {
  const [nationalIdInput, setNationalIdInput] = useState('');
  const [registrationRefInput, setRegistrationRefInput] = useState('');
  const [searchedPilgrim, setSearchedPilgrim] = useState<Pilgrim | null>(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [portalTab, setPortalTab] = useState<'details' | 'manasik'>('details');

  const livePilgrim = useMemo(() => {
    if (!searchedPilgrim) return null;
    return (
      initialPilgrims.find(
        (p) =>
          p.id === searchedPilgrim.id ||
          p.nationalId.trim() === searchedPilgrim.nationalId.trim()
      ) || searchedPilgrim
    );
  }, [searchedPilgrim, initialPilgrims]);

  const assignedGroupLocation = useMemo(
    () => resolvePilgrimGroupLocation(livePilgrim, campaignSettings),
    [livePilgrim, campaignSettings]
  );

  const pilgrimPackage = useMemo(() => {
    if (!livePilgrim?.selectedPackage || packages.length === 0) return null;
    const targetTitle = livePilgrim.selectedPackage.trim().toLowerCase();
    return (
      packages.find((pkg) => pkg.title.trim().toLowerCase() === targetTitle) ||
      null
    );
  }, [livePilgrim?.selectedPackage, packages]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = nationalIdInput.trim();
    const cleanRef = registrationRefInput.trim().toLowerCase();

    if (!cleanId && !cleanRef) {
      setValidationError('يرجى إدخال رقم البطاقة (الهوية) ورقم التسجيل معاً لإتمام التحقق.');
      return;
    }

    if (!cleanId) {
      setValidationError('يرجى إدخال رقم البطاقة (الهوية الوطنية / الإقامة).');
      return;
    }

    if (!cleanRef) {
      setValidationError('يرجى إدخال رقم التسجيل المرجعي الصادر لك عند التسجيل.');
      return;
    }

    setValidationError('');
    setSearching(true);
    setSearched(false);
    setPortalTab('details');

    try {
      // 1. Search in local pilgrims list first (MUST match both nationalId AND registrationReference)
      let found = initialPilgrims.find(p => {
        const idMatches = p.nationalId.trim() === cleanId;
        const pilgrimRef = (p.registrationReference || '').trim().toLowerCase();
        const refMatches = pilgrimRef === cleanRef;
        return idMatches && refMatches;
      });

      // 2. If not found locally, query Firestore
      if (!found) {
        try {
          // Attempt direct document lookup by season-specific id or bare nationalId
          let docById = await getDocument<Pilgrim>('pilgrims', `${cleanId}_1448`);
          if (!docById) {
            docById = await getDocument<Pilgrim>('pilgrims', cleanId);
          }
          if (docById) {
            const docRef = (docById.registrationReference || '').trim().toLowerCase();
            if (docRef === cleanRef) {
              found = docById;
            }
          }

          // Fallback: query documents where nationalId equals cleanId
          if (!found) {
            const results = await queryDocuments<Pilgrim>('pilgrims', 'nationalId', '==', cleanId);
            if (results && results.length > 0) {
              const matched = results.find(p => (p.registrationReference || '').trim().toLowerCase() === cleanRef);
              if (matched) {
                found = matched;
              }
            }
          }
        } catch (dbErr) {
          console.warn("Firestore dual-verification query fallback warning:", dbErr);
        }
      }

      setSearchedPilgrim(found || null);
      if (found) {
        recordActivityLog({
          adminId: found.nationalId,
          adminName: `${found.firstName} ${found.secondName || ''} ${found.lastName}`.replace(/\s+/g, ' ').trim(),
          username: found.nationalId,
          userRole: 'حاج مسجل (بوابة الحاج)',
          category: 'بوابة الحاج والتسجيل',
          action: 'تسجيل دخول واستعلام عبر بوابة الحجاج الآمنة',
          target: `رقم الهوية: ${found.nationalId} — رقم التسجيل: #${found.registrationReference}`,
          details: `حالة الطلب: ${found.status}`,
        }).catch(() => {});
      }
    } catch (err) {
      console.error("Dual-verification search error:", err);
      setSearchedPilgrim(null);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  const handleResetSearch = () => {
    setNationalIdInput('');
    setRegistrationRefInput('');
    setSearchedPilgrim(null);
    setSearched(false);
    setValidationError('');
    setPortalTab('details');
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6">
      <div className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-amber-500/30 text-slate-900 dark:text-white rounded-3xl shadow-md dark:shadow-2xl overflow-hidden p-6 sm:p-12 text-right">
        {/* Header with Privacy Emphasis */}
        <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10 space-y-3">
          <div className="w-16 h-16 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto border border-amber-300 dark:border-amber-500/30 shadow-inner">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-amber-700 dark:text-amber-400">بوابة استعلام الحجاج الآمنة</h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            حفاظاً على خصوصية وسرية بيانات الحجاج ومنع الاطلاع غير المصرح به، يتطلب النظام إدخال 
            <strong className="text-amber-700 dark:text-amber-400 mx-1">رقم البطاقة (الهوية)</strong> و
            <strong className="text-amber-700 dark:text-amber-400 mx-1">رقم التسجيل المرجعي</strong> معاً للتحقق من هوية الحاج.
          </p>

          <div className="inline-flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 px-4 py-1.5 rounded-full text-xs font-bold mt-1">
            <Lock className="w-3.5 h-3.5" />
            <span>نظام تحقق ثنائي مشفر لضمان أقصى درجات الخصوصية</span>
          </div>
        </div>

        {/* Dual Input Form */}
        <form onSubmit={handleSearch} className="max-w-2xl mx-auto space-y-4 mb-8 bg-slate-50 dark:bg-[#070C18] p-5 sm:p-7 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Field 1: National ID / Card Number */}
            <div className="space-y-1.5">
              <label className="block text-xs font-black text-slate-700 dark:text-slate-200">
                <span className="flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>1. رقم البطاقة (الهوية الوطنية / الإقامة) <span className="text-amber-600 dark:text-amber-400">*</span></span>
                </span>
              </label>
              <input
                type="text"
                value={nationalIdInput}
                onChange={(e) => {
                  setNationalIdInput(e.target.value);
                  if (validationError) setValidationError('');
                }}
                placeholder="أدخل رقم الهوية (10 أرقام)"
                maxLength={10}
                className="w-full bg-white dark:bg-[#090F1E] border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 font-mono font-bold transition"
                dir="ltr"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">مثال: 1003300132</span>
            </div>

            {/* Field 2: Registration Reference Number */}
            <div className="space-y-1.5">
              <label className="block text-xs font-black text-slate-700 dark:text-slate-200">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>2. رقم التسجيل (الرقم المرجعي) <span className="text-amber-600 dark:text-amber-400">*</span></span>
                </span>
              </label>
              <input
                type="text"
                value={registrationRefInput}
                onChange={(e) => {
                  setRegistrationRefInput(e.target.value);
                  if (validationError) setValidationError('');
                }}
                placeholder="أدخل رقم التسجيل المرجعي (مثال: 1001)"
                className="w-full bg-white dark:bg-[#090F1E] border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 font-mono font-bold transition"
                dir="ltr"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">الرقم المرجعي المسلّم لك في استمارة التسجيل</span>
            </div>
          </div>

          {validationError && (
            <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-xl text-red-500 text-xs font-bold flex items-center gap-2 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={searching}
              className="w-full sm:flex-1 bg-[#D97706] hover:bg-[#B45309] dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-black py-3.5 px-6 rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-amber-700/20 dark:shadow-amber-500/20 hover:shadow-lg active:scale-98 disabled:opacity-50 cursor-pointer"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span>{searching ? 'جاري التحقق من مطابقة البيانات...' : 'التحقق والاستعلام عن البيانات'}</span>
            </button>

            {(nationalIdInput || registrationRefInput || searched) && (
              <button
                type="button"
                onClick={handleResetSearch}
                className="w-full sm:w-auto bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-slate-700 text-[#1E293B] dark:text-slate-300 border border-[#94A3B8] dark:border-slate-700 hover:border-amber-500 font-bold py-3.5 px-5 rounded-xl shadow-2xs transition text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-400" />
                <span>مسح الحقول</span>
              </button>
            )}
          </div>
        </form>

        {searched && (
          <div>
            {searchedPilgrim ? (
              <div className="bg-slate-50 dark:bg-slate-950 border-2 border-amber-500/40 rounded-3xl p-6 sm:p-8 space-y-8 shadow-xl animate-fadeIn">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-amber-500 text-slate-950 rounded-2xl flex items-center justify-center font-black text-xl shadow">
                      🕋
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                        {searchedPilgrim.firstName} {searchedPilgrim.secondName} {searchedPilgrim.thirdName} {searchedPilgrim.lastName}
                      </h3>
                      <p className="text-xs text-slate-400 font-mono" dir="ltr">رقم مرجعي: {searchedPilgrim.registrationReference}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <PilgrimNotificationCenter pilgrim={searchedPilgrim} />
                    <span className={`px-4 py-1.5 rounded-full text-xs font-bold ${
                      searchedPilgrim.status === 'مقبول ومؤكد' || searchedPilgrim.status === 'مكتمل الدفع' || searchedPilgrim.status === 'مكتمل' || searchedPilgrim.status === 'تم القبول'
                        ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                        : searchedPilgrim.status === 'مرفوض'
                        ? 'bg-red-500/15 text-red-500 border border-red-500/30'
                        : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                    }`}>
                      {searchedPilgrim.status}
                    </span>
                    <button
                      type="button"
                      onClick={handleResetSearch}
                      className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 shadow-sm hover:shadow"
                      title="البحث عن حاج آخر أو مسح الحقول"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>استعلام آخر</span>
                    </button>
                  </div>
                </div>

                {/* Authenticated Pilgrim Sub-Navigation Tabs */}
                <div className="bg-white dark:bg-[#090F1E] p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setPortalTab('details')}
                    className={`px-4 py-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition cursor-pointer ${
                      portalTab === 'details'
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <User className="w-4 h-4 shrink-0" />
                    <span>بياناتي وتفاصيل الحجز والتفويج</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPortalTab('manasik')}
                    className={`px-4 py-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition cursor-pointer ${
                      portalTab === 'manasik'
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-white bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 hover:bg-amber-100 dark:hover:bg-amber-500/20'
                    }`}
                  >
                    <ListChecks className="w-4 h-4 shrink-0" />
                    <span>متابعة مناسكي وأعمالي</span>
                  </button>
                </div>

                {portalTab === 'manasik' ? (
                  <PilgrimManasikTracker
                    pilgrim={livePilgrim || searchedPilgrim}
                    campaignSettings={campaignSettings}
                  />
                ) : (
                  <div className="space-y-8">
                    {/* Quick Shortcut Card to Personal Manasik Tracker */}
                    <div className="bg-gradient-to-l from-amber-50 via-white to-white dark:from-amber-500/15 dark:via-[#090F1E] dark:to-[#090F1E] border border-amber-300 dark:border-amber-500/35 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow">
                          <ListChecks className="w-5 h-5" />
                        </div>
                        <div className="space-y-0.5">
                          <h4 className="text-sm font-black text-amber-800 dark:text-amber-300">
                            قائمة متابعة مناسكي وأعمالي الشخصية
                          </h4>
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            سجّل إنجاز مناسكك خطوة بخطوة بحفظ سحابي دائم مرتبط برقم هويتك مع إمكانية مشاركة إنجازك باسمك الرباعي.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPortalTab('manasik')}
                        className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition shadow"
                      >
                        <span>فتح متابعة مناسكي</span>
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                    </div>

                {searchedPilgrim.status === 'مرفوض' && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3 text-right">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-black text-red-600 dark:text-red-400">
                        نعتذر، تم رفض طلب التسجيل
                      </h4>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        <strong className="text-red-600 dark:text-red-400">سبب الرفض: </strong>
                        {searchedPilgrim.rejectionReason || searchedPilgrim.statusNotes || 'لم يتم تحديد سبب إضافي، يرجى التواصل مع إدارة القافلة للاستفسار.'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-amber-300 dark:border-amber-500/40 space-y-1 sm:col-span-2 lg:col-span-3 shadow-sm">
                    <span className="text-xs text-amber-700 dark:text-amber-400 block font-bold">الباقة المحجوزة والمرتبطة بالطلب</span>
                    <strong className="text-slate-900 dark:text-white text-base font-black">{searchedPilgrim.selectedPackage || 'التسجيل العام'}</strong>
                  </div>
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block font-bold">رقم الهوية</span>
                    <strong className="text-slate-900 dark:text-white text-xs font-mono font-bold" dir="ltr">{searchedPilgrim.nationalId}</strong>
                  </div>
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block font-bold">وسيلة المواصلات</span>
                    <strong className="text-slate-900 dark:text-white font-bold">
                      {(searchedPilgrim.selectedPackage || '').includes('طيران') || searchedPilgrim.transport === 'طائرة'
                        ? 'طائرة'
                        : searchedPilgrim.transport || 'باص'}
                    </strong>
                  </div>
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block font-bold">نوع الحجة</span>
                    <strong className="text-slate-900 dark:text-white font-bold">{searchedPilgrim.hajjType}</strong>
                  </div>
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block font-bold">مرجع التقليد</span>
                    <strong className="text-slate-900 dark:text-white font-bold">{(livePilgrim || searchedPilgrim).currentMarji}</strong>
                  </div>
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block font-bold">سنة آخر حجة</span>
                    <strong className="text-slate-900 dark:text-white font-bold">
                      {(livePilgrim || searchedPilgrim).lastHajjYear
                        ? (livePilgrim || searchedPilgrim).lastHajjYear === 'لا أتذكر'
                          ? 'لا أتذكر'
                          : `${(livePilgrim || searchedPilgrim).lastHajjYear} هـ`
                        : 'غير محددة'}
                    </strong>
                  </div>
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block font-bold flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>البنك المعتمد</span>
                    </span>
                    <strong className="text-slate-900 dark:text-white font-bold">{(livePilgrim || searchedPilgrim).bankName || 'غير محدد'}</strong>
                  </div>
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block font-bold flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>رقم الآيبان (IBAN)</span>
                    </span>
                    <strong className="text-emerald-700 dark:text-emerald-400 font-mono text-xs font-bold block" dir="ltr">
                      {(livePilgrim || searchedPilgrim).iban || 'غير مدخل'}
                    </strong>
                  </div>
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block font-bold flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>اسم صاحب الحساب البنكي</span>
                    </span>
                    <strong className="text-slate-900 dark:text-white font-bold">{(livePilgrim || searchedPilgrim).bankAccountName || 'غير محدد'}</strong>
                  </div>
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block font-bold flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>تاريخ الميلاد (هجري / ميلادي)</span>
                    </span>
                    <strong className="text-slate-900 dark:text-white text-xs font-mono font-bold block" dir="ltr">
                      {formatDualDateSummary((livePilgrim || searchedPilgrim).birthDate, (livePilgrim || searchedPilgrim).birthDateHijri)}
                    </strong>
                  </div>
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block font-bold flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>تاريخ انتهاء الهوية (هجري / ميلادي)</span>
                    </span>
                    <strong className="text-slate-900 dark:text-white text-xs font-mono font-bold block" dir="ltr">
                      {formatDualDateSummary((livePilgrim || searchedPilgrim).idExpiryDate, (livePilgrim || searchedPilgrim).idExpiryDateHijri)}
                    </strong>
                  </div>
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block font-bold flex items-center gap-1">
                      <Hotel className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>غرفة خاصة في المدينة المنورة</span>
                    </span>
                    <strong className={`font-bold text-xs block ${
                      (livePilgrim || searchedPilgrim).madinahPrivateRoomRequested
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}>
                      {(livePilgrim || searchedPilgrim).madinahPrivateRoomRequested
                        ? 'نعم (مطلوب غرفة خاصة بالمدينة)'
                        : 'لا (سكن مشترك ضمن المجموعة)'}
                    </strong>
                    {(livePilgrim || searchedPilgrim).madinahPrivateRoomRequested &&
                      (livePilgrim || searchedPilgrim).madinahPrivateRoomNote && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                          {(livePilgrim || searchedPilgrim).madinahPrivateRoomNote}
                        </span>
                      )}
                  </div>
                  {(() => {
                    const activeP = livePilgrim || searchedPilgrim;
                    const customEntries = getPilgrimCustomFieldEntries(activeP, {
                      onlyForPortal: true,
                    });
                    if (customEntries.length === 0) return null;
                    return (
                      <div className="sm:col-span-2 lg:col-span-3 bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-amber-300 dark:border-amber-500/30 space-y-3 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                          <span className="text-xs font-black text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>بيانات الاستمارة الإضافية</span>
                          </span>
                          {activeP.formTemplateName && (
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
                              {activeP.formTemplateName} {activeP.formVersion ? `(v${activeP.formVersion})` : ''}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {customEntries.map((entry) => (
                            <div
                              key={entry.key}
                              className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3 space-y-1"
                            >
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-bold">
                                {entry.label}
                              </span>
                              {entry.type === 'file' &&
                              typeof entry.rawValue === 'string' &&
                              entry.rawValue.startsWith('http') ? (
                                <a
                                  href={entry.rawValue}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
                                >
                                  <FileCheck className="w-3.5 h-3.5" />
                                  <span>عرض المرفق المحفوظ</span>
                                </a>
                              ) : (
                                <strong className="text-slate-900 dark:text-white text-xs font-bold block">
                                  {entry.displayValue}
                                </strong>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block font-bold">غرفة سكن مكة المكرمة</span>
                    <strong className="text-amber-700 dark:text-amber-400 font-bold">{searchedPilgrim.roomNumberMakkah || searchedPilgrim.roomNumber || 'قيد التخصيص'}</strong>
                  </div>
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block font-bold">غرفة سكن المدينة المنورة</span>
                    <strong className="text-amber-700 dark:text-amber-400 font-bold">{searchedPilgrim.roomNumberMadinah || 'قيد التخصيص'}</strong>
                  </div>
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block font-bold">تسكين منى (المخيم / المقر)</span>
                    <strong className="text-amber-700 dark:text-amber-400 font-bold">{searchedPilgrim.roomNumberMina || 'قيد التخصيص'}</strong>
                  </div>
                  <div className="bg-white dark:bg-[#090F1E] p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 sm:col-span-2 lg:col-span-3 shadow-sm">
                    <span className="text-xs text-slate-500 dark:text-slate-400 block font-bold">
                      {(searchedPilgrim.selectedPackage || '').includes('طيران') || searchedPilgrim.transport === 'طائرة' || searchedPilgrim.flightNumberOutbound || searchedPilgrim.flightNumberReturn
                        ? 'بيانات رحلة الطيران (الذهاب / العودة)'
                        : 'رقم الباص والمقعد'}
                    </span>
                    <strong className="text-amber-700 dark:text-amber-400 font-bold">
                      {(searchedPilgrim.selectedPackage || '').includes('طيران') || searchedPilgrim.transport === 'طائرة' || searchedPilgrim.flightNumberOutbound || searchedPilgrim.flightNumberReturn
                        ? `${searchedPilgrim.flightNumberOutbound || 'الذهاب قيد التحديد'} | ${searchedPilgrim.flightNumberReturn || 'العودة قيد التحديد'}${searchedPilgrim.flightTicketNumber ? ` (حجز: ${searchedPilgrim.flightTicketNumber})` : ''}`
                        : searchedPilgrim.busNumber || searchedPilgrim.busSeat
                        ? `${searchedPilgrim.busNumber || 'الباص قيد التحديد'} — ${searchedPilgrim.busSeat ? `مقعد ${searchedPilgrim.busSeat}` : 'المقعد قيد التحديد'}`
                        : 'قيد التخصيص'}
                    </strong>
                  </div>
                </div>

                {/* Registered Companions Display */}
                {((livePilgrim || searchedPilgrim).mahramDetails || []).length > 0 && (
                  <div className="bg-white dark:bg-[#090F1E] border border-amber-300 dark:border-amber-500/30 rounded-2xl p-4 sm:p-5 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
                      <h4 className="text-xs sm:text-sm font-black text-amber-700 dark:text-amber-400 flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span>المحرم والمرافقون المسجلون معك</span>
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30 text-[11px] font-black">
                        {((livePilgrim || searchedPilgrim).mahramDetails || []).length} مرافق
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {((livePilgrim || searchedPilgrim).mahramDetails || []).map((comp, cIdx) => (
                        <div
                          key={cIdx}
                          className="bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col gap-1 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <strong className="text-slate-900 dark:text-white font-black">{comp.name || '—'}</strong>
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-slate-800 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                              {comp.relation || 'مرافق'}
                            </span>
                          </div>
                          {comp.nationalId && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono" dir="ltr">
                              رقم الهوية: {comp.nationalId}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {assignedGroupLocation && livePilgrim && (
                  <PilgrimGroupMiniMap
                    groupLocation={assignedGroupLocation}
                    pilgrim={livePilgrim}
                    pilgrimName={`${livePilgrim.firstName} ${livePilgrim.lastName}`.trim()}
                    campaignSettings={campaignSettings}
                    pilgrimPackage={pilgrimPackage}
                  />
                )}

                <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 shrink-0" />
                    <span>بطاقة تعريف الحاج الرسمية لقافلة القائم صالحة لموسم 1448هـ</span>
                  </div>
                  <button
                    onClick={() => window.print()}
                    className="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-xl shadow hover:bg-amber-400 transition"
                  >
                    طباعة البطاقة
                  </button>
                </div>

                {/* Hajj Payment & Vaccination Self-Declaration Card */}
                <PilgrimPaymentVaccinationCard
                  pilgrim={livePilgrim || searchedPilgrim}
                  onUpdated={(updated) => setSearchedPilgrim(updated)}
                />

                {/* Official Electronic Payment Receipt PDF Download Banner (Strictly only for confirmed paid pilgrims) */}
                {(livePilgrim || searchedPilgrim).status === 'مكتمل الدفع' || (livePilgrim || searchedPilgrim).status === 'مكتمل' ? (
                  <div className="bg-emerald-500/10 border-2 border-emerald-500/40 p-4 rounded-2xl flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300 flex-wrap gap-3">
                    <div className="flex items-center gap-2.5">
                      <FileCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                      <div>
                        <strong className="block text-slate-900 dark:text-white text-sm">وصل وسند الدفع الإلكتروني المعتمد (PDF)</strong>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">سند قبض مالي رسمي ومختوم - تم تأكيد واستلام السداد بنجاح</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowReceiptModal(true)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl shadow transition flex items-center gap-2 cursor-pointer"
                    >
                      <FileCheck className="w-4 h-4" />
                      <span>تحميل / طباعة سند الدفع PDF</span>
                    </button>
                  </div>
                ) : searchedPilgrim.status === 'تم القبول' || searchedPilgrim.status === 'مقبول ومؤكد' ? (
                  <div className="bg-emerald-500/10 border-2 border-emerald-500/30 p-4 rounded-2xl flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 flex-wrap gap-3">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      <div>
                        <strong className="block text-slate-900 dark:text-white text-sm">حالة الطلب: تم القبول واعتماد المستندات ✓</strong>
                        <span className="text-[11px] text-slate-600 dark:text-slate-400">
                          تم قبول طلبك واستلام المستندات المطلوبة. بانتظار استكمال إجراءات السداد لدى الإدارة المالية لإصدار سند القبض الرسمي وتثبيت الحجز النهائي.
                        </span>
                      </div>
                    </div>
                    <div className="bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 px-3.5 py-1.5 rounded-xl font-bold text-[11px] border border-emerald-500/30">
                      مقبول مبدئياً - بانتظار السداد
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-500/10 border-2 border-amber-500/30 p-4 rounded-2xl flex items-center justify-between text-xs text-amber-800 dark:text-amber-300 flex-wrap gap-3">
                    <div className="flex items-center gap-2.5">
                      <Clock className="w-5 h-5 text-amber-500 shrink-0" />
                      <div>
                        <strong className="block text-slate-900 dark:text-white text-sm">حالة الطلب: قيد المراجعة والتدقيق الإداري</strong>
                        <span className="text-[11px] text-slate-600 dark:text-slate-400">
                          طلبك قيد المراجعة من قبل إدارة القافلة، وسيتم إشعارك فور الاعتماد لاستكمال إجراءات السداد وتثبيت الحجز.
                        </span>
                      </div>
                    </div>
                    <div className="bg-amber-500/20 text-amber-900 dark:text-amber-200 px-3.5 py-1.5 rounded-xl font-bold text-[11px] border border-amber-500/30">
                      يصدر السند فور تأكيد الإدارة للسداد 🔒
                    </div>
                  </div>
                )}

                {/* WhatsApp Notification Preferences Feature */}
                <WhatsAppNotificationSection 
                  pilgrim={searchedPilgrim}
                  onUpdatePilgrim={(updated) => setSearchedPilgrim(updated)}
                />

                {/* Feedback Section */}
                <div className="pt-8 border-t border-slate-200 dark:border-slate-800 space-y-6">
                  <div className="text-right">
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 justify-end">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      <span>تقديم تقييم وملاحظات حول الرحلة</span>
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">نسعى دائماً لتطوير خدماتنا.. رأيك يهمنا جداً في تحسين الجودة للأعوام القادمة.</p>
                  </div>

                  <FeedbackForm 
                    pilgrimId={searchedPilgrim.nationalId} 
                    pilgrimName={`${searchedPilgrim.firstName} ${searchedPilgrim.lastName}`} 
                  />
                </div>
                  </div>
                )}

                {showReceiptModal && (
                  <PaymentReceiptModal
                    pilgrim={{
                      ...searchedPilgrim,
                      pilgrimSequenceNumber: (initialPilgrims && initialPilgrims.findIndex(p => p.nationalId === searchedPilgrim.nationalId) + 1) || undefined,
                      membershipNumber: searchedPilgrim.membershipNumber || `QAEM-1448-${searchedPilgrim.registrationReference || '1001'}`
                    }}
                    campaignSettings={campaignSettings}
                    onClose={() => setShowReceiptModal(false)}
                  />
                )}
              </div>
            ) : (
              <div className="text-center py-12 px-4 bg-slate-50 dark:bg-slate-950 border-2 border-red-500/20 rounded-3xl space-y-4 animate-fadeIn max-w-xl mx-auto">
                <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto border border-red-500/20">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">تعذر مطابقة البيانات المدخلة</h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                    لم يتم العثور على أي حاج يطابق 
                    <strong className="text-red-500 mx-1">رقم البطاقة</strong> مع 
                    <strong className="text-red-500 mx-1">رقم التسجيل</strong> المدخلين معاً.
                  </p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-2xl text-xs text-amber-700 dark:text-amber-300 text-right space-y-1">
                  <span className="font-bold block">🔒 تنبيه الخصوصية والأمان:</span>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    لحماية خصوصية الحجاج وسرية السكن والحجوزات، لن يتم عرض أي بيانات إلا عند إدخال رقم الهوية الوطنية ورقم التسجيل الصحيحين لنفس الحاج وتطابقهما معاً.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetSearch}
                  className="bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-bold px-6 py-2.5 rounded-xl transition text-xs inline-flex items-center gap-2 shadow"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>إعادة المحاولة وتعديل الأرقام</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface WhatsAppNotificationSectionProps {
  pilgrim: Pilgrim;
  onUpdatePilgrim?: (updated: Pilgrim) => void;
}

const WhatsAppNotificationSection: React.FC<WhatsAppNotificationSectionProps> = ({ pilgrim, onUpdatePilgrim }) => {
  const [enabled, setEnabled] = useState<boolean>(pilgrim.whatsappNotificationsEnabled ?? true);
  const [mobileNumber, setMobileNumber] = useState<string>(
    pilgrim.whatsappNotificationMobile || pilgrim.whatsapp || pilgrim.mobile || ''
  );
  const [selectedTopics, setSelectedTopics] = useState<string[]>(
    pilgrim.whatsappNotificationTopics || [
      'مواعيد المغادرة والرحلات',
      'التفويج ومقاعد الباصات',
      'الإرشاد الديني والمناسك',
      'استلام مفاتيح السكن والغرف'
    ]
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  const allTopics = [
    { id: 'مواعيد المغادرة والرحلات', label: 'تذكير بمواعيد المغادرة وتجهيز الحقائب (قبل 24 ساعة و 6 ساعات)', icon: '🛫' },
    { id: 'التفويج ومقاعد الباصات', label: 'تحديثات حافلات النقل والتفويج وتأكيد المقاعد', icon: '🚌' },
    { id: 'الإرشاد الديني والمناسك', label: 'تنبيهات الإرشاد الديني ومناسك التروية وعرفة ومزدلفة', icon: '🕋' },
    { id: 'استلام مفاتيح السكن والغرف', label: 'تنبيهات السكن واستلام المفاتيح والوجبات', icon: '🏨' },
  ];

  const handleToggleTopic = (topicId: string) => {
    setSelectedTopics(prev =>
      prev.includes(topicId) ? prev.filter(t => t !== topicId) : [...prev, topicId]
    );
  };

  const handleSavePreferences = async () => {
    if (enabled && !mobileNumber.trim()) {
      setSaveError('يرجى إدخال رقم جوال صحيح لربط خدمة الواتساب.');
      return;
    }

    setIsSaving(true);
    setSaveError('');
    setSaveSuccess(false);

    try {
      const updatedData = {
        whatsappNotificationsEnabled: enabled,
        whatsappNotificationMobile: mobileNumber.trim(),
        whatsappNotificationTopics: selectedTopics
      };

      await updateDocument('pilgrims', pilgrim.nationalId, updatedData);

      if (onUpdatePilgrim) {
        onUpdatePilgrim({
          ...pilgrim,
          ...updatedData
        });
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      console.error('Failed to update WhatsApp preferences:', err);
      setSaveError('حدث خطأ أثناء حفظ التفضيلات. يرجى المحاولة لاحقاً.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTestMessage = () => {
    const cleanPhone = mobileNumber.replace(/\D/g, '');
    let formattedPhone = cleanPhone;
    if (formattedPhone.startsWith('05')) {
      formattedPhone = '966' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('5')) {
      formattedPhone = '966' + formattedPhone;
    }

    const text = encodeURIComponent(
      `سلام الله عليك حاجنا الكريم/ة (${pilgrim.firstName} ${pilgrim.lastName}) 🕋✨\n\nتم تفعيل خدمة التذكير المباشر عبر الواتساب لقافلة القائم لحج موسم 1448هـ بنجاح! 📱\n\n- الرقم المرجعي: ${pilgrim.registrationReference}\n- وسيلة النقل: ${pilgrim.transport}\n- حالة الخدمة: نشطة ومفعلة ✅\n\nستصلك كافة الإشعارات الهامة قبل مواعيد الرحلة والتفويج.`
    );

    const waUrl = `https://wa.me/${formattedPhone}?text=${text}`;
    const anchor = document.createElement('a');
    anchor.href = waUrl;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  return (
    <div className="bg-emerald-50/70 dark:bg-emerald-950/40 border-2 border-emerald-300 dark:border-emerald-500/40 rounded-3xl p-6 sm:p-8 space-y-6 text-right">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-emerald-200 dark:border-emerald-500/20 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center font-bold shadow-lg shrink-0">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-black text-slate-900 dark:text-white">إشعارات وتنبيهات الواتساب المباشرة</h4>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                enabled ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/40' : 'bg-slate-200 dark:bg-slate-500/20 text-slate-600 dark:text-slate-400'
              }`}>
                {enabled ? 'مُفعّل - متصل' : 'غير مُفعّل'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              احصل على تذكيرات فورية ومهمة قبل الرحلات، التفويج، كروت الغرف والمناسك مباشرة على جوالك.
            </p>
          </div>
        </div>

        {/* Master Toggle Switch */}
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-14 h-7 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500"></div>
          <span className="mr-3 text-xs font-bold text-slate-700 dark:text-slate-300">
            {enabled ? 'التنبيهات مفعلة' : 'التنبيهات معطلة'}
          </span>
        </label>
      </div>

      {enabled && (
        <div className="space-y-6 animate-fadeIn">
          {/* Mobile Linking Section */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              رقم الواتساب المعتمد لتلقي التنبيهات:
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="05XXXXXXXX أو 9665XXXXXXXX"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 text-left font-mono"
                  dir="ltr"
                />
                <Smartphone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
              <button
                type="button"
                onClick={() => setMobileNumber(pilgrim.whatsapp || pilgrim.mobile || '')}
                className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold px-4 py-2.5 rounded-xl transition text-xs flex items-center justify-center gap-1.5 border border-emerald-500/30"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>ربط الرقم المسجل بملفك تلقائياً</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              الرقم المسجل بالاستمارة: <span className="font-mono font-bold text-emerald-500">{pilgrim.mobile || pilgrim.whatsapp}</span>
            </p>
          </div>

          {/* Topics selection */}
          <div className="space-y-3">
            <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300">اختر مواضيع التنبيهات والتذكيرات المطلوبة:</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {allTopics.map((topic) => {
                const isSelected = selectedTopics.includes(topic.id);
                return (
                  <div
                    key={topic.id}
                    onClick={() => handleToggleTopic(topic.id)}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center gap-3 ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-slate-900 dark:text-white'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="w-4 h-4 text-emerald-500 rounded focus:ring-emerald-500"
                    />
                    <span className="text-base">{topic.icon}</span>
                    <span className="text-xs font-bold leading-snug">{topic.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Save & Test Action Bar */}
          {saveError && (
            <p className="text-xs font-bold text-red-500">{saveError}</p>
          )}

          {saveSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl text-emerald-500 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>تم حفظ تفضيلات إشعارات الواتساب بنجاح في نظام القافلة!</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleSavePreferences}
              disabled={isSaving}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-6 py-3 rounded-xl transition text-xs flex items-center gap-2 shadow-lg disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{isSaving ? 'جاري الحفظ...' : 'حفظ وتفعيل التفضيلات'}</span>
            </button>

            <button
              type="button"
              onClick={handleSendTestMessage}
              className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-emerald-400 font-bold px-5 py-3 rounded-xl transition text-xs flex items-center gap-2 border border-emerald-500/30"
            >
              <Send className="w-3.5 h-3.5" />
              <span>اختبار التذكير الآن (تجربة إرسال عبر الواتساب)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const FeedbackForm: React.FC<{ pilgrimId: string; pilgrimName: string }> = ({ pilgrimId, pilgrimName }) => {
  const [rating, setRating] = useState(5);
  const [category, setCategory] = useState<any>('عام');
  const [comment, setComment] = useState('');
  const [submitting, setSearching] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    setFeedbackError(null);
    try {
      const { setDocument, recordActivityLog: logFeedbackActivity } = await import('../lib/db');
      
      const id = 'fb-' + Date.now();
      await setDocument('feedback', id, {
        id,
        pilgrimId,
        pilgrimName,
        rating,
        category,
        comment,
        createdAt: new Date().toISOString().split('T')[0]
      });
      await logFeedbackActivity({
        adminId: pilgrimId,
        adminName: pilgrimName || 'حاج مسجل',
        username: pilgrimId,
        userRole: 'حاج مسجل (تقييم)',
        category: 'بوابة الحاج والتسجيل',
        action: `إرسال تقييم وملاحظة (${rating} نجوم — ${category})`,
        target: `الحاج: ${pilgrimName} (${pilgrimId})`,
        details: comment || 'تقييم بدون تعليق نصي',
      });
      setSubmitted(true);
    } catch (err) {
      console.error("Feedback error:", err);
      setFeedbackError('حدث خطأ أثناء إرسال التقييم. يرجى المحاولة لاحقاً.');
    } finally {
      setSearching(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded-2xl text-center space-y-3 animate-fadeIn">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
        <h4 className="text-lg font-bold text-emerald-600 dark:text-emerald-400">شكراً لك! تم استلام تقييمك بنجاح</h4>
        <p className="text-sm text-slate-500">تقييمك يساعدنا على تقديم خدمة أفضل لضيوف الرحمن في المستقبل.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-right">
      {feedbackError && (
        <div className="bg-red-500/20 border border-red-500/40 text-red-300 text-xs p-3 rounded-xl flex items-center justify-between">
          <span>⚠️ {feedbackError}</span>
          <button type="button" onClick={() => setFeedbackError(null)} className="text-red-400 hover:text-white font-bold">×</button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-6 mb-4">
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 block">التصنيف</label>
          <select 
            value={category} 
            onChange={(e) => setCategory(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-amber-500"
          >
            <option value="عام">تقييم عام</option>
            <option value="التنظيم">التنظيم والتنسيق</option>
            <option value="السكن">السكن والإقامة</option>
            <option value="الإعاشة">الإعاشة والوجبات</option>
            <option value="الإرشاد الديني">الإرشاد الديني</option>
            <option value="المواصلات">المواصلات والنقل</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 block">التقييم العام</label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="transition-transform active:scale-90"
              >
                <Star 
                  className={`w-6 h-6 ${star <= rating ? 'text-amber-500 fill-amber-500' : 'text-slate-300 dark:text-slate-700'}`} 
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 block">ملاحظاتك واقتراحاتك</label>
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="أخبرنا عن تجربتك.. ما الذي أعجبك؟ وما الذي يمكننا تحسينه؟"
          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-amber-500"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full sm:w-auto px-10 py-3 bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold rounded-xl shadow-lg transition active:scale-95 disabled:opacity-50"
      >
        {submitting ? 'جاري الإرسال...' : 'إرسال التقييم'}
      </button>
    </form>
  );
};
