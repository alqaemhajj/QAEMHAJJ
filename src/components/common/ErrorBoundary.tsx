import React from 'react';
import { AlertTriangle, RotateCw, Trash2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: true,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ error, errorInfo });
    console.error('[Al-Qaem ErrorBoundary] Uncaught UI Error:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    });
  };

  handleReload = (): void => {
    try {
      window.location.reload();
    } catch {
      this.handleRetry();
    }
  };

  handleClearCacheAndReload = async (): Promise<void> => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister().catch(() => {})));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
      }
    } catch {
      // ignore cache clear errors
    }
    this.handleReload();
  };

  handleCopyDetails = (): void => {
    const { error, errorInfo } = this.state;
    const text = [
      `Error: ${error?.name || 'Error'}: ${error?.message || 'Unknown error'}`,
      error?.stack ? `\nStack:\n${error.stack}` : '',
      errorInfo?.componentStack ? `\nComponent Stack:\n${errorInfo.componentStack}` : '',
    ].join('\n');

    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            this.setState({ copied: true });
            setTimeout(() => this.setState({ copied: false }), 2500);
          })
          .catch(() => {});
      }
    } catch {
      // ignore clipboard errors inside restricted iframes
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo, showDetails, copied } = this.state;
    const errorMessage = error?.message || 'حدث خطأ غير متوقع أثناء عرض الصفحة.';

    return (
      <div
        dir="rtl"
        className="min-h-screen w-full bg-[#F1F5F9] dark:bg-[#0B1221] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 sm:p-6"
      >
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border-2 border-amber-500/40 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                حدث خطأ غير متوقع أثناء تشغيل البوابة
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                تم التقاط الخطأ تلقائياً لمنع توقف العرض بصمت. يمكنك الضغط على «إعادة المحاولة» لاستئناف العرض فوراً، أو تحديث الصفحة ومسح الذاكرة المؤقتة.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm transition flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <RotateCw className="w-4 h-4" />
              <span>إعادة المحاولة</span>
            </button>

            <button
              type="button"
              onClick={this.handleReload}
              className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white border border-slate-700 font-bold text-xs sm:text-sm transition flex items-center gap-2 cursor-pointer"
            >
              <RotateCw className="w-4 h-4 text-amber-400" />
              <span>إعادة تحميل الصفحة</span>
            </button>

            <button
              type="button"
              onClick={() => void this.handleClearCacheAndReload()}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold text-xs sm:text-sm transition flex items-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-rose-500" />
              <span>مسح الذاكرة المؤقتة</span>
            </button>
          </div>

          {/* Diagnostic Details */}
          <div className="rounded-2xl border border-rose-500/30 bg-rose-50/70 dark:bg-rose-950/25 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-rose-500/20">
              <button
                type="button"
                onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                className="flex items-center gap-2 text-xs font-black text-rose-700 dark:text-rose-300 cursor-pointer"
              >
                {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                <span>تفاصيل الخطأ التقني</span>
              </button>

              <button
                type="button"
                onClick={this.handleCopyDetails}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-rose-500/30 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'تم النسخ' : 'نسخ الخطأ'}</span>
              </button>
            </div>

            {showDetails && (
              <div className="p-4 space-y-2 text-left" dir="ltr">
                <div className="font-mono text-xs font-bold text-rose-700 dark:text-rose-300 break-words">
                  {error?.name ? `${error.name}: ` : ''}
                  {errorMessage}
                </div>
                {errorInfo?.componentStack && (
                  <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-950/70 p-3 rounded-xl overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {errorInfo.componentStack.trim()}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
