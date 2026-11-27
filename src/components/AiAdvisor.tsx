import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Send,
  Bot,
  User,
  Loader2,
  ShieldCheck,
  BookOpen,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { Announcement, HajjPackage, CampaignSettings, Pilgrim } from '../types';
import { DEFAULT_ADVISOR_CONFIG } from '../data/initialData';
import { buildPublicPackagesForAdvisorClient } from '../utils/packageStatus';
import { fetchWithTimeout } from '../utils/safeFetch';

interface AiAdvisorProps {
  announcements?: Announcement[];
  packages?: HajjPackage[];
  pilgrims?: Pilgrim[];
  campaignSettings?: CampaignSettings;
}

interface MatchedSource {
  title: string;
  url?: string;
  classification: string;
}

interface Message {
  role: 'user' | 'model';
  content: string;
  status?: 'answered' | 'unavailable' | 'blocked_security' | 'error' | 'disabled' | 'rate_limited';
  sources?: MatchedSource[];
}

const SUGGESTED_QUESTIONS = [
  'ما هي الباقات المتاحة وأسعارها؟',
  'ما هي شروط الالتحاق والتسجيل في القافلة؟',
  'كيف أتواصل مع إدارة قافلة القائم وأين يقع المقر؟',
  'ما محتويات حقيبة الحاج والتجهيزات المطلوبة؟',
  'ما خطة سير رحلة الحج في يوم التروية وعرفة؟',
];

export const AiAdvisor: React.FC<AiAdvisorProps> = ({
  packages = [],
  pilgrims = [],
  campaignSettings,
}) => {
  const advisorCfg = useMemo(
    () => ({
      ...DEFAULT_ADVISOR_CONFIG,
      ...(campaignSettings?.advisorConfig || {}),
    }),
    [campaignSettings?.advisorConfig]
  );

  // Strictly sanitized public packages (visible on homepage only, no seat numbers, no pilgrim data)
  const sanitizedPublicPackages = useMemo(
    () => buildPublicPackagesForAdvisorClient(packages, pilgrims),
    [packages, pilgrims]
  );

  const welcomeMessage = advisorCfg.welcomeMessage || DEFAULT_ADVISOR_CONFIG.welcomeMessage;
  const advisorName = advisorCfg.advisorName || 'مرشد القائم الذكي';

  const [sessionId] = useState(
    () => `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      content: welcomeMessage,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [missingKeyNotice, setMissingKeyNotice] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Sync initial welcome message if settings load asynchronously and user hasn't chatted yet
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].role === 'model' && prev[0].content !== welcomeMessage) {
        return [{ role: 'model', content: welcomeMessage }];
      }
      return prev;
    });
  }, [welcomeMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const submitQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading || !advisorCfg.enabled) return;

    const maxLen = advisorCfg.maxQuestionLength || 600;
    if (trimmed.length > maxLen) {
      setErrorBanner(`طول الاستفسار (${trimmed.length} حرف) يتجاوز الحد الأقصى المسموح (${maxLen} حرف).`);
      return;
    }

    setErrorBanner(null);
    setInput('');
    const historyToSend = messages.slice(1).slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const nextMessages: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const response = await fetchWithTimeout('/api/gemini/advisor', {
        method: 'POST',
        timeoutMs: 15000,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: historyToSend,
          sessionId,
          publicPackages: sanitizedPublicPackages,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      const isJsonResponse = contentType.includes('application/json');
      const data = isJsonResponse ? await response.json().catch(() => ({})) : {};

      // Static hosting (e.g., Cloudflare Pages) or missing GEMINI_API_KEY: show friendly notice inside advisor only
      if (!isJsonResponse || response.status === 404 || response.status === 405) {
        const friendlyNotice =
          'خدمة «مرشد القائم الذكي» غير مفعّلة حالياً في بيئة الاستضافة (لم يُربط مفتاح Gemini API بعد). جميع صفحات وخدمات البوابة الأخرى تعمل بشكل طبيعي، ويمكنكم التواصل مباشرة مع إدارة القافلة لأي استفسار.';
        setMissingKeyNotice(friendlyNotice);
        setMessages([
          ...nextMessages,
          {
            role: 'model',
            content: friendlyNotice,
            status: 'unavailable',
          },
        ]);
        return;
      }

      if (!response.ok) {
        const replyText =
          data?.reply ||
          data?.error ||
          'تعذر الحصول على رد من الخادم حالياً. يرجى المحاولة مجدداً أو التواصل مع إدارة القائم.';
        if (response.status === 503 || String(replyText).includes('API') || String(replyText).includes('مفتاح')) {
          setMissingKeyNotice(replyText);
        }
        setMessages([
          ...nextMessages,
          {
            role: 'model',
            content: replyText,
            status: data?.status || 'error',
          },
        ]);
        return;
      }

      setMissingKeyNotice(null);
      setMessages([
        ...nextMessages,
        {
          role: 'model',
          content: data.reply || advisorCfg.unavailableMessage,
          status: data.status || 'answered',
          sources: Array.isArray(data.sources) ? data.sources : [],
        },
      ]);
    } catch {
      const fallbackMsg =
        'تعذر الاتصال بخدمة «مرشد القائم الذكي» حالياً. قد يكون مفتاح الذكاء الاصطناعي غير مضاف في بيئة الاستضافة؛ جميع خدمات البوابة الأخرى تعمل بانتظام ويمكنكم التواصل مع إدارة القافلة مباشرة.';
      setMissingKeyNotice(fallbackMsg);
      setMessages([
        ...nextMessages,
        {
          role: 'model',
          content: fallbackMsg,
          status: 'error',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitQuestion(input);
  };

  const handleResetChat = () => {
    setErrorBanner(null);
    setMessages([{ role: 'model', content: welcomeMessage }]);
  };

  return (
    <div className="max-w-4xl mx-auto py-8 sm:py-12 px-4 sm:px-6 text-right" dir="rtl">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl overflow-hidden flex flex-col h-[700px]">
        {/* Official Header */}
        <div className="bg-gradient-to-r from-amber-50 via-white to-slate-50 dark:from-[#070C18] dark:via-[#0F1B33] dark:to-[#070C18] p-5 sm:p-6 text-slate-900 dark:text-white border-b border-amber-500/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 rounded-2xl flex items-center justify-center font-bold shadow-lg shadow-amber-500/20 shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-amber-700 dark:text-amber-400">{advisorName}</h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3" />
                  <span>مصادر رسمية معتمدة</span>
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                المستشار الرسمي لقافلة القائم للحج والعمرة — يجيب من الصفحات المنشورة وقاعدة المعرفة المعتمدة فقط
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetChat}
            title="بدء محادثة جديدة"
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800/80 hover:bg-amber-50 dark:hover:bg-slate-700 text-[#1E293B] dark:text-slate-200 border border-[#94A3B8] dark:border-slate-700 hover:border-amber-500 text-xs font-bold flex items-center gap-1.5 transition shrink-0 cursor-pointer shadow-2xs"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-400" />
            <span className="hidden sm:inline">محادثة جديدة</span>
          </button>
        </div>

        {/* Service Disabled Notice */}
        {!advisorCfg.enabled && (
          <div className="bg-amber-50 dark:bg-amber-500/15 border-b border-amber-500/30 px-5 py-3 text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>تم إيقاف خدمة «{advisorName}» مؤقتاً من قبل إدارة النظام. يمكنك التواصل المباشر مع الإدارة عبر صفحة تواصل معنا.</span>
          </div>
        )}

        {/* Friendly Hosting Missing-Key Notice (Only inside Smart Advisor tool) */}
        {advisorCfg.enabled && missingKeyNotice && (
          <div className="bg-amber-50 dark:bg-amber-500/15 border-b border-amber-500/30 px-5 py-3 text-xs font-bold text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{missingKeyNotice}</span>
          </div>
        )}

        {/* Quick Questions Bar */}
        {messages.length <= 2 && advisorCfg.enabled && (
          <div className="px-4 sm:px-6 py-2.5 bg-slate-100/80 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0">استفسارات شائعة:</span>
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={loading}
                onClick={() => submitQuestion(q)}
                className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-amber-500/15 hover:border-amber-500/40 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/50 dark:bg-slate-950/50">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : msg.status === 'blocked_security'
                    ? 'bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                    : 'bg-amber-50 dark:bg-slate-800 text-amber-700 dark:text-amber-400 border border-amber-500/30 dark:border-slate-700'
                }`}
              >
                {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
              </div>
              <div className="max-w-xl space-y-2">
                <div
                  className={`rounded-2xl px-5 py-3.5 text-sm leading-relaxed whitespace-pre-line ${
                    msg.role === 'user'
                      ? 'bg-amber-500 text-slate-950 font-medium rounded-tl-none shadow-sm'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-tr-none shadow-sm'
                  }`}
                >
                  {msg.content.replace(/\*\*/g, '')}
                </div>

                {/* Official Sources Attribution */}
                {msg.role === 'model' && msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 px-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      <BookOpen className="w-3 h-3 text-amber-600 dark:text-amber-500" />
                      <span>المصادر المعتمدة:</span>
                    </span>
                    {msg.sources.map((src, sIdx) => (
                      <span
                        key={`${src.title}-${sIdx}`}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-slate-800/80 text-amber-800 dark:text-amber-300 border border-amber-500/30 dark:border-slate-700"
                        title={src.url || ''}
                      >
                        {src.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-slate-800 text-amber-700 dark:text-amber-400 border border-amber-500/30 dark:border-slate-700 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-3 text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-500" />
                <span>{advisorName} يتحقق من المصادر الرسمية المعتمدة...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Error Banner */}
        {errorBanner && (
          <div className="px-4 py-2 bg-rose-50 dark:bg-rose-500/15 border-t border-rose-200 dark:border-rose-500/30 text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorBanner}</span>
          </div>
        )}

        {/* Input Form */}
        <form
          onSubmit={handleSend}
          className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-3"
        >
          <input
            type="text"
            value={input}
            disabled={!advisorCfg.enabled || loading}
            onChange={(e) => setInput(e.target.value)}
            maxLength={advisorCfg.maxQuestionLength || 600}
            placeholder={
              advisorCfg.enabled
                ? 'اكتب سؤالك حول الباقات، شروط الالتحاق، المناسك، الإعلانات أو التواصل مع القافلة...'
                : 'الخدمة متوقفة مؤقتاً من الإدارة...'
            }
            className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!advisorCfg.enabled || loading || !input.trim()}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold px-6 py-3 rounded-xl transition flex items-center gap-2 shadow cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>إرسال</span>
          </button>
        </form>
      </div>
    </div>
  );
};
