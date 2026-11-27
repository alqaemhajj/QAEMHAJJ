import React from 'react';
import { Phone, Mail, MapPin, MessageCircle, Clock } from 'lucide-react';
import { CampaignSettings } from '../types';
import { CampaignLocationMap } from './maps/CampaignLocationMap';

interface ContactViewProps {
  campaignSettings: CampaignSettings;
}

export const ContactView: React.FC<ContactViewProps> = ({ campaignSettings }) => {
  return (
    <div className="max-w-5xl mx-auto py-12 px-4 sm:px-6 text-right space-y-12">
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 bg-amber-500/12 dark:bg-amber-500/15 border border-amber-500/30 px-4 py-1.5 rounded-full text-amber-800 dark:text-amber-400 text-xs font-bold">
          <Phone className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span>نسعد بخدمتكم والإجابة على استفساراتكم</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-amber-400">تواصل مع إدارة قافلة القائم</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">نحن في خدمتك طوال أيام الأسبوع للإجابة على تفاصيل الباقات والتسجيل لموسم 1448هـ</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
        <div className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-amber-500/30 p-8 rounded-3xl shadow-md dark:shadow-2xl text-center space-y-4">
          <div className="w-16 h-16 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/30 shadow-xs">
            <Phone className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white">الهاتف والاتصال</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300">للاستفسارات السريعة وتنسيق الحجوزات</p>
          <a href={`tel:${campaignSettings.phone}`} className="block text-amber-700 dark:text-amber-400 font-mono font-black text-lg hover:underline" dir="ltr">
            {campaignSettings.phone}
          </a>
        </div>

        <div className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-amber-500/30 p-8 rounded-3xl shadow-md dark:shadow-2xl text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/30 shadow-xs">
            <MessageCircle className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white">تواصل عبر الواتساب</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300">خدمة العملاء متاحة على مدار الساعة</p>
          <a
            href={`https://wa.me/966${campaignSettings.whatsapp.replace(/^0/, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition shadow-md"
          >
            مراسلة عبر واتساب
          </a>
        </div>

        <div className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-amber-500/30 p-8 rounded-3xl shadow-md dark:shadow-2xl text-center space-y-4">
          <div className="w-16 h-16 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/30 shadow-xs">
            <Mail className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white">البريد الإلكتروني</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300">للمراسلات الرسمية وإرسال المستندات</p>
          <a href={`mailto:${campaignSettings.email}`} className="block text-amber-700 dark:text-amber-400 font-bold text-sm hover:underline" dir="ltr">
            {campaignSettings.email}
          </a>
        </div>
      </div>

      <div className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-amber-500/30 p-6 sm:p-10 rounded-3xl shadow-md dark:shadow-2xl space-y-8">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="w-16 h-16 bg-amber-500 text-slate-950 rounded-2xl flex items-center justify-center shadow-lg shrink-0">
            <MapPin className="w-8 h-8" />
          </div>
          <div className="space-y-2 text-right flex-1">
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-amber-400">مقر القافلة الرئيسي والخريطة التفاعلية</h3>
            <p className="text-sm text-slate-600 dark:text-slate-200 leading-relaxed">
              {campaignSettings.address}. نتشرف بزيارتكم لمقر القافلة لاستكمال إجراءات التسجيل وتسليم المستندات وحقيبة الحاج.
            </p>
            <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 font-bold">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>أوقات العمل: من الأحد إلى الخميس (صباحاً ومساءً)</span>
            </div>
          </div>
        </div>

        <CampaignLocationMap campaignAddress={campaignSettings.address} />
      </div>
    </div>
  );
};
