import React from 'react';
import { APIProvider, APILoadingStatus, useApiLoadingStatus } from '@vis.gl/react-google-maps';
import { Loader2, MapPinOff, ExternalLink } from 'lucide-react';
import { useMapsApiKey } from './mapsUtils';

interface MapsProviderWrapperProps {
  children: React.ReactNode;
  fallbackMapsUrl?: string;
  fallbackTitle?: string;
}

const MapsStatusGuard: React.FC<{
  children: React.ReactNode;
  fallbackMapsUrl?: string;
  fallbackTitle?: string;
}> = ({ children, fallbackMapsUrl, fallbackTitle }) => {
  const status = useApiLoadingStatus();

  if (status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED) {
    return (
      <div className="bg-white dark:bg-[#070C18] border border-amber-300 dark:border-amber-500/30 rounded-2xl p-6 text-center space-y-3 shadow-sm dark:shadow-none">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
          <MapPinOff className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-black text-amber-800 dark:text-amber-300">
          {fallbackTitle || 'تعذر تحميل الخريطة التفاعلية حالياً'}
        </h4>
        <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
          يمكنك فتح الموقع مباشرة عبر تطبيق خرائط قوقل أو المحاولة مجدداً لاحقاً.
        </p>
        {fallbackMapsUrl && (
          <a
            href={fallbackMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2 rounded-xl text-xs transition"
          >
            <ExternalLink className="w-4 h-4" />
            <span>فتح في خرائط قوقل</span>
          </a>
        )}
      </div>
    );
  }

  return <>{children}</>;
};

export const MapsProviderWrapper: React.FC<MapsProviderWrapperProps> = ({
  children,
  fallbackMapsUrl,
  fallbackTitle,
}) => {
  const { apiKey, resolving } = useMapsApiKey();

  if (resolving) {
    return (
      <div className="bg-white dark:bg-[#070C18] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 min-h-[260px]">
        <Loader2 className="w-7 h-7 text-amber-600 dark:text-amber-400 animate-spin" />
        <p className="text-xs font-bold text-slate-600 dark:text-slate-300">جاري تهيئة خرائط قوقل التفاعلية...</p>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="bg-white dark:bg-[#070C18] border border-amber-300 dark:border-amber-500/30 rounded-2xl p-6 text-center space-y-3 shadow-sm dark:shadow-none">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
          <MapPinOff className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-black text-amber-800 dark:text-amber-300">
          {fallbackTitle || 'الخريطة التفاعلية بانتظار تفعيل مفتاح خرائط قوقل'}
        </h4>
        <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          يرجى التأكد من ربط مفتاح Google Maps Platform في إعدادات البيئة ليتم عرض الخريطة والمسارات مباشرة.
        </p>
        {fallbackMapsUrl && (
          <a
            href={fallbackMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2 rounded-xl text-xs transition"
          >
            <ExternalLink className="w-4 h-4" />
            <span>عرض الموقع على خرائط قوقل</span>
          </a>
        )}
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      language="ar"
      region="SA"
      libraries={['marker', 'places', 'routes']}
    >
      <MapsStatusGuard fallbackMapsUrl={fallbackMapsUrl} fallbackTitle={fallbackTitle}>
        {children}
      </MapsStatusGuard>
    </APIProvider>
  );
};
