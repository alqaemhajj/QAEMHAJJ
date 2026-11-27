import React, { useEffect, useState, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Copy,
  Check,
  Share2,
  Download,
  QrCode,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { CampaignSettings } from '../../types';

const CAMPAIGN_LOGO_PATH =
  '/assets/aistudio/Screenshot_20261107_174409_com_instagram_android_InstagramMainActivity_441b738d.png';

/**
 * Resolves the clean main official URL of the portal for QR encoding and sharing.
 * Prefers admin-configured `officialWebsiteUrl` (normalized to clean https:// origin/path),
 * falling back to `window.location.origin` (clean root URL without subpaths/query noise).
 */
export function resolveOfficialPortalUrl(campaignSettings: CampaignSettings): string {
  const customRaw = (campaignSettings.officialWebsiteUrl || '').trim();
  if (customRaw) {
    try {
      const withProtocol = /^https?:\/\//i.test(customRaw) ? customRaw : `https://${customRaw}`;
      const parsed = new URL(withProtocol);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        const cleanPath = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/, '') : '';
        return `${parsed.origin}${cleanPath}`;
      }
    } catch {
      // Fall back to window.location.origin if custom URL is malformed
    }
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/+$/, '');
    const isPreviewOrLocal =
      /localhost|127\.0\.0\.1|ais-dev-|ais-pre-/i.test(origin);
    if (!isPreviewOrLocal) {
      return origin;
    }
  }
  return 'https://qaemhajj.pages.dev';
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function copyTextReliable(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below for restricted iframe contexts
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

interface SharePortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignSettings: CampaignSettings;
}

export const SharePortalModal: React.FC<SharePortalModalProps> = ({
  isOpen,
  onClose,
  campaignSettings,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrLoading, setQrLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [nativeShareNotice, setNativeShareNotice] = useState<string>('');
  const [downloadingCard, setDownloadingCard] = useState<boolean>(false);
  const [downloadDone, setDownloadDone] = useState<boolean>(false);

  const shareUrl = useMemo(
    () => resolveOfficialPortalUrl(campaignSettings),
    [campaignSettings.officialWebsiteUrl]
  );

  const fullBrandTitle = useMemo(() => {
    const name = (campaignSettings.siteTexts?.brandName || 'قافلة القائم').trim();
    const subtitle = (campaignSettings.siteTexts?.brandSubtitle || 'للحج والعمرة والزيارة').trim();
    if (!subtitle || name.includes(subtitle)) return name;
    return `${name} ${subtitle}`;
  }, [campaignSettings.siteTexts?.brandName, campaignSettings.siteTexts?.brandSubtitle]);

  const whatsappShareHref = useMemo(() => {
    const message = `*قافلة القائم للحج والعمرة*\n\n*بوابة القافلة*\nالرسمية والتسجيل الموسمي\n\n${shareUrl}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [shareUrl]);

  // Generate high-accuracy QR Code (Level H, strict #000000 on #FFFFFF, Quiet Zone margin: 4)
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setQrLoading(true);
    QRCode.toDataURL(shareUrl, {
      errorCorrectionLevel: 'H',
      margin: 4,
      width: 640,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) {
          setQrDataUrl(url);
          setQrLoading(false);
        }
      })
      .catch((err) => {
        console.warn('QR generation error:', err);
        if (active) setQrLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, shareUrl]);

  // Body scroll lock and Escape-to-close while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  // Reset transient notices whenever modal re-opens
  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setNativeShareNotice('');
      setDownloadDone(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    const success = await copyTextReliable(shareUrl);
    if (success) {
      setCopied(true);
      setNativeShareNotice('');
      window.setTimeout(() => setCopied(false), 2600);
    }
  };

  const handleNativeShare = async () => {
    setNativeShareNotice('');
    const formattedText = `*قافلة القائم للحج والعمرة*\n\n*بوابة القافلة*\nالرسمية والتسجيل الموسمي`;
    const shareData = {
      title: 'قافلة القائم للحج والعمرة',
      text: formattedText,
      url: shareUrl,
    };

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: any) {
        if (
          err?.name === 'AbortError' ||
          String(err?.message || '').toLowerCase().includes('cancel')
        ) {
          return;
        }
      }
    }

    // Graceful fallback when navigator.share is unavailable (e.g. desktop browsers / embedded frames)
    const ok = await copyTextReliable(`${formattedText}\n\n${shareUrl}`);
    if (ok) {
      setCopied(true);
      setNativeShareNotice('تم نسخ رسالة ورابط المشاركة السريعة');
      window.setTimeout(() => {
        setCopied(false);
        setNativeShareNotice('');
      }, 3000);
    }
  };

  const handleDownloadPromotionalCard = async () => {
    if (downloadingCard) return;
    setDownloadingCard(true);
    setDownloadDone(false);

    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      const WIDTH = 1000;
      const HEIGHT = 1200;
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');

      // 1. Deep dark slate campaign backdrop
      const bgGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      bgGrad.addColorStop(0, '#0E172A');
      bgGrad.addColorStop(0.45, '#0B1221');
      bgGrad.addColorStop(1, '#070C18');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Subtle warm golden atmospheric glow at top center
      const topGlow = ctx.createRadialGradient(WIDTH / 2, 160, 20, WIDTH / 2, 160, 480);
      topGlow.addColorStop(0, 'rgba(245, 158, 11, 0.16)');
      topGlow.addColorStop(0.6, 'rgba(245, 158, 11, 0.04)');
      topGlow.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = topGlow;
      ctx.fillRect(0, 0, WIDTH, 640);

      // 2. Architectural gold double border frame
      drawRoundedRect(ctx, 36, 36, WIDTH - 72, HEIGHT - 72, 36);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
      ctx.lineWidth = 3;
      ctx.stroke();

      drawRoundedRect(ctx, 52, 52, WIDTH - 104, HEIGHT - 104, 26);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Top accent gold bar
      const topBarGrad = ctx.createLinearGradient(320, 0, 680, 0);
      topBarGrad.addColorStop(0, 'rgba(245, 158, 11, 0)');
      topBarGrad.addColorStop(0.5, '#F59E0B');
      topBarGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = topBarGrad;
      ctx.fillRect(320, 52, 360, 4);

      // 3. Campaign Logo Emblem Container
      const logoBoxSize = 140;
      const logoBoxX = (WIDTH - logoBoxSize) / 2;
      const logoBoxY = 88;

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      drawRoundedRect(ctx, logoBoxX, logoBoxY, logoBoxSize, logoBoxSize, 28);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();

      drawRoundedRect(ctx, logoBoxX, logoBoxY, logoBoxSize, logoBoxSize, 28);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 3;
      ctx.stroke();

      const logoImg = await loadImageElement(CAMPAIGN_LOGO_PATH);
      if (logoImg) {
        const pad = 14;
        const maxDim = logoBoxSize - pad * 2;
        const scale = Math.min(maxDim / logoImg.naturalWidth, maxDim / logoImg.naturalHeight);
        const drawW = logoImg.naturalWidth * scale;
        const drawH = logoImg.naturalHeight * scale;
        ctx.drawImage(
          logoImg,
          logoBoxX + (logoBoxSize - drawW) / 2,
          logoBoxY + (logoBoxSize - drawH) / 2,
          drawW,
          drawH
        );
      }

      // 4. Campaign Official Name (Arabic RTL)
      ctx.direction = 'rtl';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 40px "Cairo", "Segoe UI", Tahoma, sans-serif';
      ctx.fillText(fullBrandTitle, WIDTH / 2, 282, WIDTH - 140);

      // Hairline gold ornamental divider under title
      const dividerGrad = ctx.createLinearGradient(250, 0, 750, 0);
      dividerGrad.addColorStop(0, 'rgba(245, 158, 11, 0)');
      dividerGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.85)');
      dividerGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = dividerGrad;
      ctx.fillRect(250, 326, 500, 2);

      // 5. High-Precision QR Code Container (Strict #000000 on #FFFFFF + Quiet Zone)
      const qrFrameSize = 556;
      const qrFrameX = (WIDTH - qrFrameSize) / 2;
      const qrFrameY = 368;

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 32;
      ctx.shadowOffsetY = 12;
      drawRoundedRect(ctx, qrFrameX, qrFrameY, qrFrameSize, qrFrameSize, 32);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();

      drawRoundedRect(ctx, qrFrameX, qrFrameY, qrFrameSize, qrFrameSize, 32);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Render QR onto its own offscreen canvas at exact 512x512 with Error Correction Level 'H' & margin 4
      const qrCanvas = document.createElement('canvas');
      const qrRenderSize = 512;
      await QRCode.toCanvas(qrCanvas, shareUrl, {
        errorCorrectionLevel: 'H',
        margin: 4,
        width: qrRenderSize,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      const qrDrawX = qrFrameX + (qrFrameSize - qrRenderSize) / 2;
      const qrDrawY = qrFrameY + (qrFrameSize - qrRenderSize) / 2;
      ctx.drawImage(qrCanvas, qrDrawX, qrDrawY, qrRenderSize, qrRenderSize);
      ctx.restore();

      // 6. Promotional Caption below QR Code
      ctx.direction = 'rtl';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FBBF24';
      ctx.font = '800 33px "Cairo", "Segoe UI", Tahoma, sans-serif';
      ctx.fillText('امسح الرمز للدخول إلى بوابة القافلة والتسجيل', WIDTH / 2, 996, WIDTH - 140);

      // 7. Clean Official URL & Phone Footer Strip
      const urlDisplay = shareUrl.replace(/^https?:\/\//i, '');
      ctx.direction = 'ltr';
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '700 22px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.fillText(urlDisplay, WIDTH / 2, 1062, WIDTH - 180);

      if (campaignSettings.phone) {
        ctx.direction = 'rtl';
        ctx.fillStyle = '#94A3B8';
        ctx.font = '600 21px "Cairo", "Segoe UI", Tahoma, sans-serif';
        ctx.fillText(`للتواصل والاستفسار: ${campaignSettings.phone}`, WIDTH / 2, 1110, WIDTH - 180);
      }

      // 8. Export High-Resolution PNG & trigger download
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 1.0)
      );

      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = 'alqaem-hajj-qr-card.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      } else {
        const dataUrl = canvas.toDataURL('image/png', 1.0);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = 'alqaem-hajj-qr-card.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      setDownloadDone(true);
      window.setTimeout(() => setDownloadDone(false), 3000);
    } catch (err) {
      console.warn('Promotional QR card download failed:', err);
    } finally {
      setDownloadingCard(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-portal-modal-title"
      dir="rtl"
    >
      {/* Translucent Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm transition-opacity animate-fadeIn"
      />

      {/* Modal Container — Campaign Dark Slate & Gold + Full Light Mode Support */}
      <div className="relative z-10 w-full max-w-md max-h-[92vh] overflow-y-auto bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-amber-500/35 rounded-3xl shadow-2xl text-right animate-fadeIn">
        {/* Top Subtle Gold Hairline */}
        <div className="h-1 w-full bg-gradient-to-r from-transparent via-amber-500 to-transparent" />

        <div className="p-5 sm:p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                <QrCode className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2
                  id="share-portal-modal-title"
                  className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug"
                >
                  مشاركة بوابة القافلة
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {fullBrandTitle}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق نافذة المشاركة"
              className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* High-Accuracy QR Code Center Stage (Strict #000000 on #FFFFFF + Quiet Zone) */}
          <div className="flex flex-col items-center text-center space-y-3 py-1">
            <div className="p-3 bg-white rounded-2xl border-2 border-amber-500/45 shadow-md">
              {qrLoading || !qrDataUrl ? (
                <div className="w-52 h-52 sm:w-56 sm:h-56 flex items-center justify-center bg-white text-slate-400">
                  <Loader2 className="w-7 h-7 animate-spin text-amber-600" />
                </div>
              ) : (
                <img
                  src={qrDataUrl}
                  alt={`رمز باركود الدخول المباشر إلى ${fullBrandTitle}`}
                  className="w-52 h-52 sm:w-56 sm:h-56 block select-none [image-rendering:pixelated]"
                  draggable={false}
                />
              )}
            </div>

            <p className="text-xs font-bold text-amber-800 dark:text-amber-300 leading-relaxed max-w-xs">
              امسح الرمز بكاميرا الجوال للدخول مباشرة إلى بوابة القافلة والتسجيل
            </p>
          </div>

          {/* Primary Promotional PNG Download CTA */}
          <button
            type="button"
            onClick={handleDownloadPromotionalCard}
            disabled={downloadingCard || qrLoading}
            className={`w-full min-h-[46px] px-4 py-3 rounded-xl font-black text-xs sm:text-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
              downloadDone
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
            }`}
          >
            {downloadingCard ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>جاري تجهيز بطاقة الإعلانات عالية الدقة...</span>
              </>
            ) : downloadDone ? (
              <>
                <Check className="w-4 h-4 shrink-0" />
                <span>تم تحميل بطاقة الباركود (PNG) بنجاح</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 shrink-0" />
                <span>تحميل الباركود للإعلانات (PNG عالي الجودة)</span>
              </>
            )}
          </button>

          {/* Hairline Divider */}
          <div className="border-t border-slate-200 dark:border-slate-800" />

          {/* Direct Official URL Copy Field */}
          <div className="space-y-2">
            <label
              htmlFor="portal-share-url-input"
              className="text-xs font-bold text-slate-700 dark:text-slate-300 block"
            >
              الرابط الرسمي المباشر للموقع
            </label>
            <div className="flex items-stretch gap-2">
              <input
                id="portal-share-url-input"
                type="text"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                dir="ltr"
                className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500 select-all"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`px-3.5 rounded-xl font-bold text-xs transition-all duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-[0.98] border ${
                  copied
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white border-slate-800 dark:border-slate-700'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>تم النسخ ✓</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 shrink-0" />
                    <span>نسخ الرابط</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Share Actions: WhatsApp + Native System Share */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <a
              href={whatsappShareHref}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-4 h-4 shrink-0"
                aria-hidden="true"
              >
                <path d="M12.031 2C6.504 2 2.008 6.494 2.008 12.02c0 1.766.461 3.49 1.337 5.012L2 22l5.102-1.337a9.978 9.978 0 0 0 4.929 1.302h.004c5.524 0 10.02-4.496 10.02-10.022C22.055 6.494 17.558 2 12.031 2zm5.826 14.15c-.244.688-1.425 1.318-1.976 1.396-.505.072-1.158.103-1.868-.122-.43-.137-.983-.321-1.693-.628-2.978-1.287-4.923-4.293-5.072-4.492-.148-.199-1.21-1.61-1.21-3.071 0-1.461.764-2.18 1.036-2.478.272-.298.593-.372.791-.372.198 0 .396.002.569.01.183.009.428-.07.67.512.248.595.842 2.056.916 2.205.074.149.124.322.025.521-.099.199-.149.322-.297.496-.149.174-.312.388-.446.521-.149.149-.304.31-.131.608.174.298.771 1.272 1.656 2.061 1.139 1.015 2.099 1.33 2.397 1.479.297.149.471.124.644-.074.174-.199.743-.868.942-1.166.198-.298.396-.248.669-.149.272.1 1.734.818 2.031.967.297.149.495.223.569.347.074.124.074.719-.17 1.407z" />
              </svg>
              <span>مشاركة عبر واتساب</span>
              <ExternalLink className="w-3 h-3 opacity-80 shrink-0" />
            </a>

            <button
              type="button"
              onClick={handleNativeShare}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer active:scale-[0.98]"
            >
              <Share2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>مشاركة عبر التطبيقات</span>
            </button>
          </div>

          {nativeShareNotice && (
            <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 text-center">
              {nativeShareNotice}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
