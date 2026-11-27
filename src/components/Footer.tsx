import React from 'react';
import { Phone, Mail, MapPin, Heart, ShieldCheck } from 'lucide-react';
import { CampaignSettings } from '../types';
import { useOnlinePresence } from '../utils/presence';

interface FooterProps {
  setCurrentView: (v: string) => void;
  campaignSettings: CampaignSettings;
}

export const Footer: React.FC<FooterProps> = ({ setCurrentView, campaignSettings }) => {
  const { onlineVisitorsCount, totalVisitorsCount } = useOnlinePresence(false, null);
  return (
    <footer className="bg-white dark:bg-slate-950 text-[#475569] dark:text-slate-300 border-t border-[#CBD5E1] dark:border-amber-500/20 shadow-[0_-4px_16px_rgba(15,23,42,0.05)] dark:shadow-none pt-16 pb-12 text-right transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* About Campaign */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-xl p-1 shadow-sm flex items-center justify-center border border-amber-500/50">
                <img 
                  src="/assets/aistudio/Screenshot_20261107_174409_com_instagram_android_InstagramMainActivity_441b738d.png" 
                  alt="شعار القافلة" 
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h3 className="text-[#0F172A] dark:text-white font-black text-lg">قافلة القائم</h3>
                <p className="text-xs text-[#B45309] dark:text-amber-400 font-bold">للحج والعمرة والزيارة</p>
              </div>
            </div>
            <p className="text-sm text-[#475569] dark:text-slate-400 leading-relaxed">
              نرافقكم في رحلة الإيمان والخشوع بخدمات متميزة وكادر إداري وديني متمرس لتأدية مناسك الحج والعمرة بيسر وطمأنينة.
            </p>
            <div className="flex items-center gap-2 text-xs text-[#92400E] dark:text-amber-400 bg-[#FEF3C7]/60 dark:bg-amber-500/10 p-2.5 rounded-xl border border-[#F59E0B]/40 dark:border-amber-500/20 font-bold">
              <ShieldCheck className="w-4 h-4 shrink-0 text-[#D97706] dark:text-amber-400" />
              <span>مرخصة رسمياً لخدمة حجاج بيت الله الحرام 1448هـ</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-[#0F172A] dark:text-white font-black text-base mb-4 border-b border-[#CBD5E1] dark:border-slate-800 pb-2">روابط سريعة</h4>
            <ul className="space-y-2.5 text-sm text-[#475569] dark:text-slate-300 font-medium">
              <li>
                <button onClick={() => setCurrentView('home')} className="hover:text-[#B45309] dark:hover:text-amber-400 transition cursor-pointer">الرئيسية</button>
              </li>
              <li>
                <button onClick={() => setCurrentView('packages')} className="hover:text-[#B45309] dark:hover:text-amber-400 transition cursor-pointer">الباقات والأسعار</button>
              </li>
              <li>
                <button onClick={() => setCurrentView('packages')} className="hover:text-[#B45309] dark:hover:text-amber-400 transition cursor-pointer">باقات الحج والتسجيل</button>
              </li>
              <li>
                <button onClick={() => setCurrentView('portal')} className="hover:text-[#B45309] dark:hover:text-amber-400 transition cursor-pointer">بوابة الاستعلام للحاج</button>
              </li>
              <li>
                <button onClick={() => setCurrentView('guide')} className="hover:text-[#B45309] dark:hover:text-amber-400 transition cursor-pointer">دليل المناسك والإرشادات</button>
              </li>
            </ul>
          </div>

          {/* Services & Guidance */}
          <div>
            <h4 className="text-[#0F172A] dark:text-white font-black text-base mb-4 border-b border-[#CBD5E1] dark:border-slate-800 pb-2">خدمات الحجاج</h4>
            <ul className="space-y-2.5 text-sm text-[#475569] dark:text-slate-400 font-medium">
              <li>قوافل الحج والعمرة الفاخرة</li>
              <li>مخيمات منى وعرفات المكيفة</li>
              <li>الإرشاد الفقهي والديني المتخصص</li>
              <li>الرعاية الطبية والمتابعة المستمرة</li>
              <li>النقل الترددي المريح والآمن</li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h4 className="text-[#0F172A] dark:text-white font-black text-base mb-4 border-b border-[#CBD5E1] dark:border-slate-800 pb-2">تواصل معنا</h4>
            <ul className="space-y-3 text-sm text-[#475569] dark:text-slate-300">
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[#D97706] dark:text-amber-400 shrink-0 mt-0.5" />
                <span>{campaignSettings.address}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-[#D97706] dark:text-amber-400 shrink-0" />
                <a href={`tel:${campaignSettings.phone}`} className="text-[#0F172A] dark:text-slate-200 hover:text-[#B45309] dark:hover:text-amber-400 transition font-bold tabular-nums" dir="ltr">{campaignSettings.phone}</a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-[#D97706] dark:text-amber-400 shrink-0" />
                <a href={`mailto:${campaignSettings.email}`} className="text-[#0F172A] dark:text-slate-200 hover:text-[#B45309] dark:hover:text-amber-400 transition font-semibold" dir="ltr">{campaignSettings.email}</a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-[#CBD5E1] dark:border-slate-900 pt-8 flex flex-col md:flex-row items-center justify-between text-xs text-[#475569] dark:text-slate-400 gap-4">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
            <p className="font-medium">© {new Date().getFullYear()} قافلة القائم للحج والعمرة. جميع الحقوق محفوظة.</p>
            <div className="flex items-center gap-3 bg-[#F8FAFC] dark:bg-slate-900/90 px-3.5 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-slate-800 font-mono text-[11px] shadow-2xs">
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold" title="الزوار المتواجدون بالموقع الآن">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                <span>المتواجدون الآن: {onlineVisitorsCount} زائر</span>
              </div>
              <span className="text-[#CBD5E1] dark:text-slate-700">|</span>
              <div className="text-[#B45309] dark:text-amber-400 font-bold" title="إجمالي الزيارات للموقع منذ الإطلاق">
                <span>إجمالي الزوار: {totalVisitorsCount.toLocaleString('en-US')}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 font-medium">
            <span>صُمم لخدمة ضيوف الرحمن بإتقان</span>
            <Heart className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-500 fill-[#D97706] dark:fill-amber-500" />
          </div>
        </div>
      </div>
    </footer>
  );
};
