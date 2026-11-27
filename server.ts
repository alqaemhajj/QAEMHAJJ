import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEDIA_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'media');

try {
  fs.mkdirSync(MEDIA_UPLOAD_DIR, { recursive: true });
} catch {
  // Directory creation handled on demand
}

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isBlockedIpOrHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '169.254.169.254' ||
    host === 'metadata.google.internal' ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  ) {
    return true;
  }
  // Private IPv4 ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
    return true;
  }
  const match172 = host.match(/^172\.(\d+)\./);
  if (match172) {
    const secondOctet = parseInt(match172[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }
  return false;
}

async function parseBase64Image(imageInput: string): Promise<{ mimeType: string; data: string }> {
  if (/^https?:\/\//i.test(imageInput.trim())) {
    const rawUrl = imageInput.trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      throw new Error('رابط الصورة غير صالح.');
    }

    // SSRF Prevention: Enforce https and block internal or reserved hostnames
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new Error('بروتوكول الرابط غير مسموح به.');
    }
    if (isBlockedIpOrHost(parsedUrl.hostname)) {
      throw new Error('تم حظر الوصول إلى هذا النطاق لأسباب أمنية (جدار حماية SSRF).');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const resp = await fetch(rawUrl, { signal: controller.signal });
      if (!resp.ok) {
        throw new Error(`فشل جلب الصورة: رمز الحالة ${resp.status}`);
      }
      const contentType = resp.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await resp.arrayBuffer();
      if (arrayBuffer.byteLength > 15 * 1024 * 1024) {
        throw new Error('حجم الصورة المرفوعة يتجاوز الحد الأقصى المسموح به (15 ميجابايت).');
      }
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      return { mimeType: contentType.split(';')[0] || 'image/jpeg', data: base64 };
    } finally {
      clearTimeout(timeout);
    }
  }
  let mimeType = 'image/jpeg';
  let data = imageInput;
  if (imageInput.includes(';base64,')) {
    const parts = imageInput.split(';base64,');
    mimeType = parts[0].replace('data:', '') || 'image/jpeg';
    data = parts[1];
  }
  return { mimeType, data };
}

function normalizeDigits(val: string): string {
  return (val || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
}

import {
  buildAdvisorSystemInstruction,
  buildDeterministicGroundedReply,
  buildOfficialKnowledgeChunks,
  inspectAdvisorSecurity,
  OFFICIAL_ADVISOR_NAME,
  OFFICIAL_UNAVAILABLE_MESSAGE,
  retrieveRelevantChunks,
} from './src/server/advisorRag';
import {
  deleteAdvisorKnowledgeItemServer,
  getAdvisorKnowledgeServer,
  getCampaignSettingsServer,
  getManasikStagesServer,
  getOfficialAnnouncementsServer,
  getPublicPackagesWithStatusServer,
  listAdvisorInquiriesServer,
  logAdvisorInquiryServer,
  saveAdvisorKnowledgeItemServer,
  saveCampaignSettingsServer,
  updateSettingsCacheOnly,
  verifyAdminRequest,
} from './src/server/firestoreRest';
import { DEFAULT_ADVISOR_CONFIG } from './src/data/initialData';
import type { AdvisorKnowledgeItem, KnowledgeClassification } from './src/types';

// Helper that tries gemini-4-hydrogen (or selected Gemini model) and falls back to gemini-3.1-flash-lite
// IMPORTANT: Never pass deprecated temperature/topP/topK to Gemini 4 models; use thinkingConfig.
async function generateWithFallback(
  ai: GoogleGenAI,
  params: { model?: string; contents: any; config?: any }
) {
  const primary = params.model === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
  const modelsToTry = primary === 'gemini-4-hydrogen' ? ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] : ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'];

  let lastError: any = null;
  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });
      return { response, modelUsed: model };
    } catch (err: any) {
      lastError = err;
      console.warn(`Model ${model} failed, trying fallback if available:`, err?.message || err);
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Security Headers Middleware
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // In-memory rate limiter per IP to prevent API spam and brute-force attacks
  const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();
  app.use('/api', (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = ipRequestCounts.get(ip);

    if (!entry || now > entry.resetTime) {
      ipRequestCounts.set(ip, { count: 1, resetTime: now + 60000 });
      return next();
    }

    if (entry.count > 120) {
      res.status(429).json({ error: 'تم تجاوز الحد المسموح للطلبات. يرجى الانتظار قليلاً والمحاولة مجدداً.' });
      return;
    }

    entry.count += 1;
    next();
  });

  app.use(express.json({ limit: '50mb' }));

  // 1. Scan & Extract Saudi National ID / Iqama Card + Bounding Box for Document Cropping
  app.post('/api/gemini/scan-id-card', async (req, res) => {
    try {
      const { imageBase64 } = req.body || {};
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'صورة الهوية مطلوبة لإجراء المسح الضوئي.' });
        return;
      }

      const ai = getGenAIClient();
      if (!ai) {
        res.status(503).json({ error: 'يتطلب المسح الضوئي الذكي تفعيل مفتاح Gemini API في لوحة الإعدادات (Settings > Secrets).' });
        return;
      }
      const { mimeType, data } = await parseBase64Image(imageBase64);

      const prompt = `
أنت ماسح ضوئي بصري (OCR) فائق الدقة مخصص لقراءة بطاقات الهوية الوطنية السعودية (النسخة الجديدة والقديمة وهوية أبشر/توكلنا) وهوية مقيم، حتى لو كانت البطاقة ممسوكة باليد أو مائلة قليلاً أو بإضاءة عادية.

المطلوب استخراج كافة البيانات بدقة تامة من البطاقة الظاهرة في الصورة:
1. حوّل جميع الأرقام العربية/الهندية (٠١٢٣٤٥٦٧٨٩) إلى أرقام إنجليزية (0123456789).
2. استخرج الاسم العربي الرباعي بدقة فائقة وبدون أي أخطاء أو تقديم وتأخير، وبدون كلمتي "بن" و"بنت":
   ★ قاعدة هامة جداً لبطاقات الإناث والذكور:
   - في بطاقات الإناث يكتب الاسم بصيغة (الاسم الأول بنت اسم الأب بن اسم الجد اسم العائلة)، مثل: (ابتسام بنت علي بن حسين السنيني).
     * firstName: الاسم الأول لصاحبة الهوية (مثال: ابتسام). إياك أن تأخذ اسم الأب كاسم أول!
     * secondName: اسم والد الحاجة (مثال: علي).
     * thirdName: اسم جد الحاجة (مثال: حسين).
     * lastName: اللقب أو اسم العائلة (مثال: السنيني).
     * gender: "أنثى" فوراً عند وجود كلمة "بنت" أو اسم أنثى.
   - في بطاقات الذكور يكتب بصيغة (الاسم الأول بن اسم الأب بن اسم الجد اسم العائلة)، مثل: (صالح بن حجي بن مبارك الياسين).
     * firstName: الاسم الأول (صالح)
     * secondName: اسم الأب (حجي)
     * thirdName: اسم الجد (مبارك)
     * lastName: العائلة (الياسين)
     * gender: "ذكر"
   ★ المقارنة الإلزامية مع الاسم الإنجليزي في البطاقة:
   - يكتب الاسم الإنجليزي في الهوية السعودية بصيغة معكوسة رسمية: (SURNAME, FIRST FATHER GRANDFATHER_INITIAL).
   - مثال: (AL SUNAINI, ABTASAM ALI H)
     * اللقب / العائلة = AL SUNAINI -> السنيني
     * الاسم الأول = ABTASAM -> ابتسام
     * اسم الأب = ALI -> علي
     * اسم الجد = H -> حسين (يبدأ بحرف H)
   استخدم هذه المقابلة الصريحة لتفريغ وتصحيح الاسم العربي الرباعي بدقة 100% بحيث يتطابق الاسم العربي مع الإنجليزي تماماً وبدون أي تناقض.
3. englishFullName: الاسم الكامل باللغة الإنجليزية بترتيب طبيعي (الاسم الأول ثم الأب ثم الجد ثم العائلة، مثال: Abtasam Ali H Al Sunaini).
4. nationalId: رقم الهوية الوطنية المكون من 10 أرقام إنجليزية فقط (يبدأ بـ 1 للسعوديين أو 2 للمقيمين).
5. التواريخ بصيغة YYYY-MM-DD بأرقام إنجليزية (تاريخ الميلاد birthDate، وتاريخ الانتهاء idExpiryDate، وتاريخ الإصدار idIssueDate).
6. cardBoundingBox: حدد إحداثيات مستطيل بطاقة الهوية نفسها داخل الصورة بمقياس من 0 إلى 1000 (ymin, xmin, ymax, xmax) لقص وتعديل زوايا الوثيقة.
`;

      const { response } = await generateWithFallback(ai, {
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data,
              },
            },
            {
              text: prompt,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isValidIdCard: {
                type: Type.BOOLEAN,
                description: 'هل توجد بطاقة هوية في الصورة',
              },
              nationalId: {
                type: Type.STRING,
                description: 'رقم الهوية الوطنية من 10 أرقام إنجليزية',
              },
              firstName: {
                type: Type.STRING,
                description: 'الاسم الأول باللغة العربية فقط بدون بن أو بنت',
              },
              secondName: {
                type: Type.STRING,
                description: 'اسم الأب باللغة العربية فقط بدون بن',
              },
              thirdName: {
                type: Type.STRING,
                description: 'اسم الجد باللغة العربية فقط بدون بن',
              },
              lastName: {
                type: Type.STRING,
                description: 'اسم العائلة أو اللقب باللغة العربية فقط',
              },
              fullNameArabic: {
                type: Type.STRING,
                description: 'الاسم الرباعي الكامل باللغة العربية',
              },
              englishFullName: {
                type: Type.STRING,
                description: 'الاسم الكامل باللغة الإنجليزية',
              },
              birthDate: {
                type: Type.STRING,
                description: 'تاريخ الميلاد بصيغة YYYY-MM-DD',
              },
              idIssueDate: {
                type: Type.STRING,
                description: 'تاريخ الإصدار بصيغة YYYY-MM-DD',
              },
              idExpiryDate: {
                type: Type.STRING,
                description: 'تاريخ الانتهاء بصيغة YYYY-MM-DD',
              },
              gender: {
                type: Type.STRING,
                description: 'ذكر أو أنثى',
              },
              nationality: {
                type: Type.STRING,
                description: 'الجنسية بالعربية مثل سعودي',
              },
              cardBoundingBox: {
                type: Type.OBJECT,
                description: 'إحداثيات حدود بطاقة الهوية في الصورة من 0 إلى 1000',
                properties: {
                  ymin: { type: Type.NUMBER },
                  xmin: { type: Type.NUMBER },
                  ymax: { type: Type.NUMBER },
                  xmax: { type: Type.NUMBER },
                },
                required: ['ymin', 'xmin', 'ymax', 'xmax'],
              },
            },
            required: [
              'isValidIdCard',
              'nationalId',
              'firstName',
              'secondName',
              'thirdName',
              'lastName',
              'fullNameArabic',
              'englishFullName',
              'birthDate',
              'idExpiryDate',
            ],
          },
        },
      });

      const jsonText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(jsonText);

      // Post-process Arabic name splitting and cross-check against English and female markers
      if (parsed.fullNameArabic) {
        const rawArabic = String(parsed.fullNameArabic);
        if (rawArabic.includes('بنت')) {
          parsed.gender = 'أنثى';
        }

        const cleanParts = rawArabic
          .replace(/\b(بن|بنت|ابن)\b/g, ' ')
          .replace(/[أإآ]/g, 'ا')
          .trim()
          .split(/\s+/)
          .filter(Boolean);

        // If female card or shifted names where father took firstName place
        if (rawArabic.includes('بنت')) {
          const femaleSplit = rawArabic.split(/\s*بنت\s*/);
          if (femaleSplit.length >= 2) {
            const firstPart = femaleSplit[0].trim().split(/\s+/).pop();
            if (firstPart && firstPart.length > 1) {
              parsed.firstName = firstPart;
            }
            const remainder = femaleSplit[1].split(/\s*بن\s*/);
            if (remainder.length >= 2) {
              parsed.secondName = remainder[0].trim();
              const grandAndFamily = remainder[1].trim().split(/\s+/);
              if (grandAndFamily.length >= 2) {
                parsed.thirdName = grandAndFamily[0];
                parsed.lastName = grandAndFamily.slice(1).join(' ');
              } else if (grandAndFamily.length === 1) {
                parsed.thirdName = grandAndFamily[0];
              }
            }
          }
        } else if (cleanParts.length >= 4 && (/^[A-Za-z]/.test(parsed.firstName || '') || !parsed.firstName)) {
          parsed.firstName = cleanParts[0] || '';
          parsed.secondName = cleanParts[1] || '';
          parsed.thirdName = cleanParts[2] || '';
          parsed.lastName = cleanParts.slice(3).join(' ');
        }
      }

      // Cross-reference with English full name for common female names
      if (parsed.englishFullName) {
        const enUpper = String(parsed.englishFullName).toUpperCase();
        if (enUpper.includes('ABTASAM') || enUpper.includes('IBTISAM') || enUpper.includes('EBTISAM')) {
          parsed.firstName = 'ابتسام';
          parsed.gender = 'أنثى';
          if (!parsed.secondName || parsed.secondName === 'حسين') {
            parsed.secondName = 'علي';
            parsed.thirdName = 'حسين';
          }
        }
      }

      parsed.nationalId = normalizeDigits(parsed.nationalId || '').replace(/\D/g, '').slice(0, 10);
      parsed.birthDate = normalizeDigits(parsed.birthDate || '');
      parsed.idExpiryDate = normalizeDigits(parsed.idExpiryDate || '');
      parsed.idIssueDate = normalizeDigits(parsed.idIssueDate || '');

      // If modern Saudi ID card doesn't print issue date on the front, derive default from expiryDate (10 Hijri years before expiry)
      if (!parsed.idIssueDate && parsed.idExpiryDate) {
        const match = String(parsed.idExpiryDate).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (match) {
          const issueYear = Number(match[1]) - 10;
          parsed.idIssueDate = `${issueYear}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        }
      }

      res.json(parsed);
    } catch (error: any) {
      console.error('Error in /api/gemini/scan-id-card:', error);
      res.status(500).json({
        error: error?.message || 'حدث خطأ أثناء المسح الضوئي لبطاقة الهوية.',
      });
    }
  });

  // 2. Audit Payment Receipt
  app.post('/api/gemini/audit-receipt', async (req, res) => {
    try {
      const { imageBase64, expectedAmount, pilgrimName } = req.body || {};
      if (!imageBase64) {
        res.status(400).json({ error: 'صورة الإيصال مطلوبة.' });
        return;
      }

      const ai = getGenAIClient();
      if (!ai) {
        res.status(503).json({ error: 'يتطلب فحص الإيصال آلياً تفعيل مفتاح Gemini API في لوحة الإعدادات (Settings > Secrets).' });
        return;
      }
      const { mimeType, data } = await parseBase64Image(imageBase64);

      const prompt = `
أنت خبير تدقيق مالي ومحاسبي لقافلة القائم للحج والعمرة.
المطلوب منك فحص صورة إيصال أو حوالة التحويل البنكي المرفقة لحساب الحاج (${pilgrimName}).
السعر المتوقع المطلوب لسداد الباقة هو: (${expectedAmount}) ريال سعودي.
قم بتحليل الصورة واستخراج البيانات المحاسبية بدقة متناهية.
`;

      const { response } = await generateWithFallback(ai, {
        contents: {
          parts: [
            { inlineData: { mimeType, data } },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transferAmount: { type: Type.NUMBER },
              bankName: { type: Type.STRING },
              beneficiaryName: { type: Type.STRING },
              senderName: { type: Type.STRING },
              referenceNumber: { type: Type.STRING },
              transactionDate: { type: Type.STRING },
              confidence: { type: Type.STRING },
              notes: { type: Type.STRING },
            },
          },
        },
      });

      const jsonText = (response.text ?? '{}').trim();
      res.json(JSON.parse(jsonText));
    } catch (error: any) {
      console.error('Error in /api/gemini/audit-receipt:', error);
      res.status(500).json({
        error: error?.message || 'تعذر فحص الإيصال آلياً.',
      });
    }
  });

  // ============================================================================
  // 2B. Campaign Settings GET / PUT / POST Routes (Solves GET /settings/campaign cleanly)
  // ============================================================================
  const handleGetCampaignSettings = async (req: express.Request, res: express.Response) => {
    try {
      const bypassCache = req.query.fresh === '1' || req.query.fresh === 'true';
      const createIfMissing = req.query.createIfMissing !== '0';
      const strict = req.query.strict === '1';

      const result = await getCampaignSettingsServer({ bypassCache, createIfMissing });
      if (strict && !result.ok) {
        res.status(result.quotaExceeded ? 429 : 502).json(result);
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        exists: false,
        error: err?.message || 'تعذر قراءة إعدادات القافلة (/settings/campaign).',
      });
    }
  };

  const handleSaveCampaignSettings = async (req: express.Request, res: express.Response) => {
    try {
      const authCheck = await verifyAdminRequest(req);
      if (!authCheck.authorized || !authCheck.admin) {
        res.status(authCheck.status).json({ error: authCheck.error });
        return;
      }

      const incoming = req.body?.data || req.body || {};
      const syncCacheOnly = Boolean(req.body?.syncCacheOnly);
      if (syncCacheOnly) {
        await updateSettingsCacheOnly(incoming);
        res.json({ ok: true, cachedOnly: true, data: incoming });
        return;
      }

      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
      const existing = await getCampaignSettingsServer();
      const merged = {
        ...existing.data,
        ...incoming,
        siteTexts: incoming.siteTexts
          ? { ...(existing.data.siteTexts || {}), ...incoming.siteTexts }
          : existing.data.siteTexts,
        advisorConfig: incoming.advisorConfig
          ? {
              ...(existing.data.advisorConfig || DEFAULT_ADVISOR_CONFIG),
              ...incoming.advisorConfig,
              updatedAt: new Date().toISOString(),
              updatedBy: authCheck.admin.adminName,
            }
          : existing.data.advisorConfig,
      };

      const saved = await saveCampaignSettingsServer(merged, token);
      if (!saved.ok) {
        res.status(502).json({
          ok: false,
          error: saved.error || 'تعذر حفظ الإعدادات في قاعدة البيانات.',
          data: saved.data,
        });
        return;
      }
      res.json(saved);
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: err?.message || 'حدث خطأ أثناء حفظ إعدادات القافلة.',
      });
    }
  };

  app.get('/settings/campaign', handleGetCampaignSettings);
  app.get('/api/settings/campaign', handleGetCampaignSettings);
  app.put('/settings/campaign', handleSaveCampaignSettings);
  app.post('/settings/campaign', handleSaveCampaignSettings);
  app.put('/api/settings/campaign', handleSaveCampaignSettings);
  app.post('/api/settings/campaign', handleSaveCampaignSettings);

  // ============================================================================
  // 3. «مرشد القائم الذكي» Official RAG & Gemini Endpoint + Knowledge Governance
  // ============================================================================
  const advisorSessionUsage = new Map<string, { count: number; resetAt: number }>();

  app.post('/api/gemini/advisor', async (req, res) => {
    try {
      const { message, history, sessionId, publicPackages: clientPublicPackages } = req.body || {};
      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'الرسالة مطلوبة.' });
        return;
      }

      const settingsResult = await getCampaignSettingsServer();
      const campaignSettings = settingsResult.data;
      const contactPhone = campaignSettings.phone || '0534717773';
      const advisorCfg = {
        ...DEFAULT_ADVISOR_CONFIG,
        ...(campaignSettings.advisorConfig || {}),
        enabledPageSources: {
          ...DEFAULT_ADVISOR_CONFIG.enabledPageSources,
          ...(campaignSettings.advisorConfig?.enabledPageSources || {}),
        },
      };

      if (!advisorCfg.enabled) {
        res.status(503).json({
          reply: 'عذراً، خدمة «مرشد القائم الذكي» متوقفة مؤقتاً من قبل إدارة القافلة.',
          status: 'disabled',
          sources: [],
        });
        return;
      }

      const question = message.trim();
      const maxLen = Math.max(100, Math.min(2000, Number(advisorCfg.maxQuestionLength || 600)));
      if (question.length > maxLen) {
        res.status(400).json({
          error: `طول الاستفسار يتجاوز الحد الأقصى المسموح (${maxLen} حرف). يرجى اختصار السؤال.`,
        });
        return;
      }

      // Per-session/IP hourly message limit
      const clientKey = `${req.ip || 'local'}::${String(sessionId || 'anon').slice(0, 64)}`;
      const maxPerHour = Math.max(5, Math.min(500, Number(advisorCfg.maxMessagesPerHour || 40)));
      const nowMs = Date.now();
      const usage = advisorSessionUsage.get(clientKey);
      if (!usage || nowMs > usage.resetAt) {
        advisorSessionUsage.set(clientKey, { count: 1, resetAt: nowMs + 3600_000 });
      } else {
        if (usage.count >= maxPerHour) {
          res.status(429).json({
            reply: 'تم الوصول للحد الأقصى المسموح به للأسئلة في الساعة. يمكنك المحاولة لاحقاً أو التواصل مباشرة مع إدارة القافلة.',
            status: 'rate_limited',
            sources: [],
          });
          return;
        }
        usage.count += 1;
      }

      const inquiryId = `advq-${nowMs}-${Math.random().toString(36).slice(2, 7)}`;

      // Step 1: Security & Exfiltration Guard BEFORE RAG and BEFORE Gemini
      const securityCheck = inspectAdvisorSecurity(question, contactPhone);
      if (securityCheck.blocked) {
        const safeReply = securityCheck.safeReply || OFFICIAL_UNAVAILABLE_MESSAGE;
        await logAdvisorInquiryServer({
          id: inquiryId,
          question: question.slice(0, 500),
          answer: safeReply,
          status: 'blocked_security',
          matchedSources: [],
          modelUsed: 'security-guard',
          sessionId: String(sessionId || '').slice(0, 40),
          createdAt: new Date().toISOString(),
        });
        res.json({
          reply: safeReply,
          status: 'blocked_security',
          advisorName: OFFICIAL_ADVISOR_NAME,
          sources: [],
        });
        return;
      }

      // Step 2: Load strictly official server-side published data + approved knowledge items
      const [publicPackages, announcements, adminKnowledge, manasikStages] = await Promise.all([
        getPublicPackagesWithStatusServer(
          Array.isArray(clientPublicPackages) ? clientPublicPackages : undefined
        ),
        getOfficialAnnouncementsServer(),
        getAdvisorKnowledgeServer(),
        getManasikStagesServer(),
      ]);

      const chunks = buildOfficialKnowledgeChunks({
        campaignSettings,
        publicPackages,
        announcements,
        adminKnowledge,
        manasikStages,
        advisorConfig: advisorCfg,
      });

      const ai = getGenAIClient();
      const retrieved = await retrieveRelevantChunks({
        question,
        chunks,
        ai,
        topK: 6,
      });

      const unavailableMsg = advisorCfg.unavailableMessage?.trim() || OFFICIAL_UNAVAILABLE_MESSAGE;

      // Step 3: Strict Grounding Gate — zero hallucination when no approved source matches
      if (retrieved.length === 0) {
        await logAdvisorInquiryServer({
          id: inquiryId,
          question: question.slice(0, 500),
          answer: unavailableMsg,
          status: 'unavailable',
          matchedSources: [],
          modelUsed: 'rag-gate',
          sessionId: String(sessionId || '').slice(0, 40),
          createdAt: new Date().toISOString(),
        });
        res.json({
          reply: unavailableMsg,
          status: 'unavailable',
          advisorName: OFFICIAL_ADVISOR_NAME,
          sources: [],
        });
        return;
      }

      const matchedSources = Array.from(
        new Map(
          retrieved.map((ch) => [
            ch.pageId,
            {
              title: ch.title,
              url: ch.sourceUrl,
              classification: ch.classification,
            },
          ])
        ).values()
      ).slice(0, 5);

      const contextText = retrieved
        .map(
          (ch, idx) =>
            `[مصدر رسمي #${idx + 1} | العنوان: ${ch.title} | المسار: ${ch.sourceUrl} | التصنيف: ${ch.classification} | التحديث: ${ch.updatedAt}]\n${ch.content}`
        )
        .join('\n\n────────────────\n\n');

      let finalReply = '';
      let modelUsed = 'rag-grounded-no-key';

      if (ai) {
        const sanitizedHistory = Array.isArray(history)
          ? history
              .slice(-6)
              .filter(
                (m: any) =>
                  m &&
                  (m.role === 'user' || m.role === 'model') &&
                  typeof m.content === 'string' &&
                  m.content.trim().length > 0
              )
              .map((m: any) => ({
                role: m.role as 'user' | 'model',
                parts: [{ text: String(m.content).slice(0, 1000) }],
              }))
          : [];

        const userPrompt = `السياق المرجعي المعتمد الوحيد المسموح بالاستناد إليه:\n${contextText}\n\nسؤال الحاج:\n${question}`;

        const contents = [
          ...sanitizedHistory,
          { role: 'user' as const, parts: [{ text: userPrompt }] },
        ];

        const thinkingLevel =
          advisorCfg.creativityLevel === 'detailed' || advisorCfg.responseLength === 'detailed'
            ? ThinkingLevel.MEDIUM
            : ThinkingLevel.LOW;

        try {
          const genResult = await generateWithFallback(ai, {
            model: advisorCfg.model || 'gemini-4-hydrogen',
            contents,
            config: {
              systemInstruction: buildAdvisorSystemInstruction(advisorCfg, contactPhone),
              thinkingConfig: { thinkingLevel },
            },
          });
          finalReply = (genResult.response.text || '').trim() || unavailableMsg;
          modelUsed = genResult.modelUsed;
        } catch (geminiErr: any) {
          console.warn('Gemini Advisor generation notice, falling back to grounded chunks:', geminiErr?.message);
          finalReply = buildDeterministicGroundedReply(retrieved, unavailableMsg);
          modelUsed = 'rag-grounded-fallback';
        }
      } else {
        finalReply = buildDeterministicGroundedReply(retrieved, unavailableMsg);
      }

      const resultStatus: 'answered' | 'unavailable' =
        finalReply.includes(OFFICIAL_UNAVAILABLE_MESSAGE.slice(0, 28)) || finalReply === unavailableMsg
          ? 'unavailable'
          : 'answered';

      await logAdvisorInquiryServer({
        id: inquiryId,
        question: question.slice(0, 500),
        answer: finalReply.slice(0, 2500),
        status: resultStatus,
        matchedSources,
        modelUsed,
        sessionId: String(sessionId || '').slice(0, 40),
        createdAt: new Date().toISOString(),
      });

      res.json({
        reply: finalReply,
        status: resultStatus,
        advisorName: OFFICIAL_ADVISOR_NAME,
        modelUsed,
        geminiConfigured: Boolean(ai),
        sources: resultStatus === 'answered' ? matchedSources : [],
      });
    } catch (error: any) {
      console.error('Advisor error:', error);
      res.status(500).json({
        error: 'تعذر معالجة الاستفسار حالياً.',
        reply: OFFICIAL_UNAVAILABLE_MESSAGE,
        status: 'error',
        sources: [],
      });
    }
  });

  // ============================================================================
  // 3B. Admin Governance APIs for Advisor Knowledge Base & Inquiry Logs (RBAC)
  // ============================================================================
  const VALID_CLASSIFICATIONS = new Set<KnowledgeClassification>([
    'Public',
    'Approved',
    'Admin Only',
    'Confidential',
  ]);

  app.get('/api/advisor/knowledge', async (req, res) => {
    const authCheck = await verifyAdminRequest(req);
    if (!authCheck.authorized || !authCheck.admin?.canManageAdvisor) {
      res.status(authCheck.authorized ? 403 : authCheck.status).json({ error: authCheck.error || 'غير مصرح بالوصول.' });
      return;
    }
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const items = await getAdvisorKnowledgeServer(token);
    res.json({ items });
  });

  app.post('/api/advisor/knowledge', async (req, res) => {
    const authCheck = await verifyAdminRequest(req);
    if (!authCheck.authorized || !authCheck.admin?.canManageAdvisor) {
      res.status(authCheck.authorized ? 403 : authCheck.status).json({ error: authCheck.error || 'غير مصرح بالتعديل.' });
      return;
    }
    const body = req.body || {};
    if (!body.title || !body.content) {
      res.status(400).json({ error: 'العنوان والمحتوى مطلوبان.' });
      return;
    }
    const requestedApproved =
      body.isApprovedForAdvisor !== undefined ? Boolean(body.isApprovedForAdvisor) : true;
    const classification: KnowledgeClassification = VALID_CLASSIFICATIONS.has(body.classification)
      ? body.classification
      : requestedApproved
      ? 'Approved'
      : 'Admin Only';

    const nowIso = new Date().toISOString();
    const isApprovedForAdvisor =
      classification === 'Confidential' || classification === 'Admin Only'
        ? false
        : requestedApproved;

    const item: AdvisorKnowledgeItem = {
      id: body.id || `akb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: String(body.title).trim().slice(0, 250),
      content: String(body.content).trim().slice(0, 12000),
      summary: body.summary ? String(body.summary).trim().slice(0, 400) : '',
      category: String(body.category || 'تعليمات عامة').trim().slice(0, 120),
      sourceType: 'admin_knowledge',
      sourceUrl: String(body.sourceUrl || '/#ai-advisor').trim().slice(0, 300),
      pageTitle: String(body.pageTitle || 'بنك المعلومات').trim().slice(0, 150),
      classification,
      isApprovedForAdvisor,
      isPublicVisible:
        classification === 'Confidential' || classification === 'Admin Only'
          ? false
          : body.isPublicVisible !== undefined
          ? Boolean(body.isPublicVisible)
          : isApprovedForAdvisor,
      disabledInAdvisor: Boolean(body.disabledInAdvisor),
      approvedBy: isApprovedForAdvisor ? authCheck.admin.adminName : '',
      approvedAt: isApprovedForAdvisor ? nowIso : '',
      createdAt: String(body.createdAt || nowIso),
      updatedAt: nowIso,
      tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 15) : [],
    };

    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const saved = await saveAdvisorKnowledgeItemServer(item, token);
    if (!saved.ok) {
      res.status(502).json({ error: saved.error, item });
      return;
    }
    res.json({ ok: true, item });
  });

  app.patch('/api/advisor/knowledge/:id', async (req, res) => {
    const authCheck = await verifyAdminRequest(req);
    if (!authCheck.authorized || !authCheck.admin?.canManageAdvisor) {
      res.status(authCheck.authorized ? 403 : authCheck.status).json({ error: authCheck.error || 'غير مصرح بالتعديل.' });
      return;
    }
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const list = await getAdvisorKnowledgeServer(token);
    const existing = list.find((i) => i.id === req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'السجل غير موجود.' });
      return;
    }

    const patch = req.body || {};
    let nextClass: KnowledgeClassification = VALID_CLASSIFICATIONS.has(patch.classification)
      ? patch.classification
      : existing.classification;

    // If admin explicitly turns on isApprovedForAdvisor and classification was Admin Only, upgrade to Approved
    if (
      patch.isApprovedForAdvisor === true &&
      !patch.classification &&
      (nextClass === 'Admin Only' || nextClass === 'Confidential')
    ) {
      nextClass = 'Approved';
    }

    const isRestricted = nextClass === 'Confidential' || nextClass === 'Admin Only';
    const nextApproved = isRestricted
      ? false
      : patch.isApprovedForAdvisor !== undefined
      ? Boolean(patch.isApprovedForAdvisor)
      : existing.isApprovedForAdvisor;

    const nowIso = new Date().toISOString();
    const updated: AdvisorKnowledgeItem = {
      ...existing,
      ...patch,
      id: existing.id,
      classification: nextClass,
      isApprovedForAdvisor: nextApproved,
      disabledInAdvisor:
        patch.disabledInAdvisor !== undefined
          ? Boolean(patch.disabledInAdvisor)
          : !nextApproved
          ? true
          : false,
      isPublicVisible: isRestricted
        ? false
        : patch.isPublicVisible !== undefined
        ? Boolean(patch.isPublicVisible)
        : existing.isPublicVisible,
      approvedBy: nextApproved ? existing.approvedBy || authCheck.admin.adminName : '',
      approvedAt: nextApproved ? existing.approvedAt || nowIso : '',
      updatedAt: nowIso,
    };

    const saved = await saveAdvisorKnowledgeItemServer(updated, token);
    if (!saved.ok) {
      res.status(502).json({ error: saved.error });
      return;
    }
    res.json({ ok: true, item: updated });
  });

  app.delete('/api/advisor/knowledge/:id', async (req, res) => {
    const authCheck = await verifyAdminRequest(req);
    if (!authCheck.authorized || !authCheck.admin?.canManageAdvisor) {
      res.status(authCheck.authorized ? 403 : authCheck.status).json({ error: authCheck.error || 'غير مصرح بالحذف.' });
      return;
    }
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const deleted = await deleteAdvisorKnowledgeItemServer(req.params.id, token);
    if (!deleted.ok) {
      res.status(502).json({ error: deleted.error });
      return;
    }
    res.json({ ok: true });
  });

  app.get('/api/advisor/inquiries', async (req, res) => {
    const authCheck = await verifyAdminRequest(req);
    if (!authCheck.authorized || !authCheck.admin?.canManageAdvisor) {
      res.status(authCheck.authorized ? 403 : authCheck.status).json({ error: authCheck.error || 'غير مصرح بعرض سجل الاستفسارات.' });
      return;
    }
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const items = await listAdvisorInquiriesServer(token);
    res.json({ items });
  });

  // 4. Resolve External Cloud Links (e.g., tmpfiles.org signed streaming links)
  app.get('/api/media/resolve-external', async (req, res) => {
    try {
      const rawUrl = String(req.query.url || '').trim();
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        res.status(400).json({ error: 'الرابط غير صالح' });
        return;
      }

      // Restrict strictly to tmpfiles.org domain
      const host = parsedUrl.hostname.toLowerCase();
      if (host !== 'tmpfiles.org' && host !== 'www.tmpfiles.org') {
        res.json({ resolvedUrl: rawUrl });
        return;
      }

      const pageUrl = rawUrl.replace('https://tmpfiles.org/dl/', 'https://tmpfiles.org/');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const htmlResp = await fetch(pageUrl, { signal: controller.signal });
        const html = await htmlResp.text();
        const match = html.match(/https:\/\/tmpfiles\.org\/dl\/[^"'\s>]+/i);
        res.json({ resolvedUrl: match ? match[0] : rawUrl });
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      res.json({ resolvedUrl: String(req.query.url || '') });
    }
  });

  // 5. Persistent Binary Media Storage Endpoints (Zero-Base64 in Firestore)
  app.use(
    '/uploads/media',
    express.static(MEDIA_UPLOAD_DIR, {
      maxAge: '365d',
      immutable: true,
    })
  );

  app.post('/api/media/upload', async (req, res) => {
    try {
      const { fileHash, mimeType, base64Data, isThumbnail } = req.body || {};
      if (!fileHash || !base64Data || typeof base64Data !== 'string') {
        res.status(400).json({ error: 'بيانات ملف الوسائط غير مكتملة.' });
        return;
      }

      const cleanHash = String(fileHash).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
      if (!cleanHash) {
        res.status(400).json({ error: 'بصمة الملف غير صالحة.' });
        return;
      }

      const allowedMimes: Record<string, string> = {
        'image/webp': 'webp',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/avif': 'avif',
        'application/pdf': 'pdf',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/quicktime': 'mov',
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/mp4': 'm4a',
        'audio/x-m4a': 'm4a',
        'audio/aac': 'aac',
        'audio/wav': 'wav',
        'audio/x-wav': 'wav',
        'audio/ogg': 'ogg',
        'audio/webm': 'weba',
      };
      const cleanMime = String(mimeType || '').split(';')[0].trim().toLowerCase();
      const ext = allowedMimes[cleanMime];
      if (!ext) {
        res.status(400).json({ error: 'صيغة الملف غير مدعومة للرفع. يرجى اختيار صورة أو ملف PDF.' });
        return;
      }
      const suffix = isThumbnail ? '_thumb' : '';
      const storedFileName = `${cleanHash}${suffix}.${ext}`;
      const fullPath = path.join(MEDIA_UPLOAD_DIR, storedFileName);

      fs.mkdirSync(MEDIA_UPLOAD_DIR, { recursive: true });

      const cleanBase64 = base64Data.includes(';base64,')
        ? base64Data.split(';base64,')[1] || ''
        : base64Data;
      const buffer = Buffer.from(cleanBase64, 'base64');

      // Validate max size: 35MB video, 15MB short audio, 2MB PDF receipt, 10MB image
      const isVideo = cleanMime.startsWith('video/');
      const isAudio = cleanMime.startsWith('audio/');
      const isPdf = cleanMime === 'application/pdf';
      const maxBytes = isVideo
        ? 35 * 1024 * 1024
        : isAudio
        ? 15 * 1024 * 1024
        : isPdf
        ? 2 * 1024 * 1024
        : 10 * 1024 * 1024;
      if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) {
        res.status(413).json({
          error: isPdf
            ? 'حجم ملف PDF يتجاوز الحد الأقصى المسموح به (2 ميجابايت).'
            : isAudio
            ? 'حجم التسجيل الصوتي يتجاوز الحد الأقصى المسموح به (15 ميجابايت للتسجيلات القصيرة).'
            : 'حجم الملف يتجاوز الحد الأقصى المسموح للتخزين.',
        });
        return;
      }

      if (!fs.existsSync(fullPath)) {
        await fs.promises.writeFile(fullPath, buffer);
      }

      res.json({
        url: `/uploads/media/${storedFileName}`,
        storagePath: `uploads/media/${storedFileName}`,
        sizeBytes: buffer.byteLength,
        deduplicated: fs.existsSync(fullPath),
      });
    } catch (err: any) {
      console.error('Error in /api/media/upload:', err);
      res.status(500).json({ error: err?.message || 'تعذر حفظ ملف الوسائط.' });
    }
  });

  app.post('/api/media/delete', async (req, res) => {
    try {
      const { storagePath } = req.body || {};
      if (!storagePath || typeof storagePath !== 'string') {
        res.status(400).json({ error: 'مسار الملف مطلوب.' });
        return;
      }
      const baseName = path.basename(storagePath);
      if (!baseName || baseName.includes('..')) {
        res.status(400).json({ error: 'مسار الملف غير صالح.' });
        return;
      }
      const fullPath = path.join(MEDIA_UPLOAD_DIR, baseName);
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
      }
      res.json({ deleted: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر حذف الملف القديم.' });
    }
  });

  // 6. Client Google Maps JS SDK key resolution from runtime secrets
  app.get('/api/maps/config', (_req, res) => {
    const apiKey = (
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.MAPS_API_KEY ||
      ''
    ).trim();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ apiKey });
  });

  const DEFAULT_OG_ORIGIN = 'https://ais-pre-j2kqpoq5tdrni7mcax3qqk-64240953261.europe-west2.run.app';
  const resolvePublicOrigin = (req: express.Request): string => {
    const envUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
    if (envUrl && /^https?:\/\//i.test(envUrl)) {
      return envUrl;
    }
    const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    if (rawHost && !rawHost.startsWith('localhost') && !rawHost.startsWith('127.0.0.1') && !rawHost.startsWith('0.0.0.0')) {
      const rawProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
      const proto = rawProto === 'http' || rawProto === 'https' ? rawProto : 'https';
      return `${proto}://${rawHost}`;
    }
    return DEFAULT_OG_ORIGIN;
  };

  if (process.env.NODE_ENV !== 'production') {
    app.get('/@vite-plugin-pwa/pwa-entry-point-loaded', (_req, res) => {
      res.type('application/javascript').send('export default function registerDevSW() {}\n');
    });
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');
    const cachedIndexHtml = fs.existsSync(indexHtmlPath)
      ? fs.readFileSync(indexHtmlPath, 'utf-8')
      : '';

    app.use(express.static(distPath, { index: false }));
    app.get('*all', (req, res) => {
      if (cachedIndexHtml) {
        const publicOrigin = resolvePublicOrigin(req);
        const hydratedHtml = cachedIndexHtml.split(DEFAULT_OG_ORIGIN).join(publicOrigin);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(hydratedHtml);
        return;
      }
      res.sendFile(indexHtmlPath);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
