import React, { useState } from 'react';
import { Loader2, ZoomIn, Play } from 'lucide-react';
import { getEmbeddedVideoInfo, useResolvedMediaUrl } from '../utils/announcementMedia';

interface AnnouncementImageViewProps {
  imageUrl?: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  enableLightbox?: boolean;
  onOpenLightbox?: (resolvedSrc: string, title: string) => void;
  overlayChildren?: React.ReactNode;
}

export const AnnouncementImageView: React.FC<AnnouncementImageViewProps> = ({
  imageUrl,
  alt,
  className = 'w-full h-full object-cover',
  containerClassName = 'relative w-full h-52 bg-slate-950 overflow-hidden group',
  enableLightbox = false,
  onOpenLightbox,
  overlayChildren,
}) => {
  const { resolvedUrl, isLoading } = useResolvedMediaUrl(imageUrl);

  if (!imageUrl) return null;

  return (
    <div
      className={`${containerClassName} ${enableLightbox && resolvedUrl ? 'cursor-pointer' : ''}`}
      onClick={() => {
        if (enableLightbox && resolvedUrl && onOpenLightbox) {
          onOpenLightbox(resolvedUrl, alt);
        }
      }}
    >
      {isLoading ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-amber-400 text-xs bg-slate-950">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>جاري تحميل الصورة...</span>
        </div>
      ) : resolvedUrl ? (
        <img
          src={resolvedUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={className}
        />
      ) : null}

      {overlayChildren}

      {enableLightbox && resolvedUrl && (
        <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center pointer-events-none">
          <span className="bg-slate-950/80 text-amber-400 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 border border-amber-500/30">
            <ZoomIn className="w-4 h-4" />
            <span>تكبير الصورة</span>
          </span>
        </div>
      )}
    </div>
  );
};

interface AnnouncementVideoViewProps {
  videoUrl?: string;
  thumbnailUrl?: string;
  title: string;
  videoClassName?: string;
}

export const AnnouncementVideoView: React.FC<AnnouncementVideoViewProps> = ({
  videoUrl,
  thumbnailUrl,
  title,
  videoClassName = 'w-full max-h-64 object-contain bg-black',
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoInfo = getEmbeddedVideoInfo(videoUrl);
  const { resolvedUrl, isLoading } = useResolvedMediaUrl(
    videoInfo.type === 'direct' ? videoInfo.src : ''
  );

  if (!videoUrl || videoInfo.type === 'none') return null;

  // Derive automatic WebP thumbnail path if stored in /uploads/media/
  const effectivePoster =
    thumbnailUrl ||
    (resolvedUrl && resolvedUrl.startsWith('/uploads/media/') && /\.(mp4|webm|mov)$/i.test(resolvedUrl)
      ? resolvedUrl.replace(/\.(mp4|webm|mov)$/i, '_thumb.webp')
      : '');

  if (videoInfo.type === 'youtube') {
    const ytIdMatch = videoInfo.src.match(/\/embed\/([^?&/]+)/);
    const ytId = ytIdMatch ? ytIdMatch[1] : '';
    const ytPoster = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '';

    return (
      <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950">
        <div className="relative w-full pt-[56.25%]">
          {!isPlaying && ytPoster ? (
            <button
              type="button"
              onClick={() => setIsPlaying(true)}
              className="absolute inset-0 w-full h-full group cursor-pointer bg-slate-950 flex items-center justify-center"
              aria-label={`تشغيل الفيديو: ${title}`}
            >
              <img
                src={ytPoster}
                alt={title}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition"
              />
              <div className="absolute inset-0 bg-slate-950/35 flex flex-col items-center justify-center gap-2">
                <span className="w-14 h-14 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-xl group-hover:scale-105 transition">
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                </span>
                <span className="text-[11px] font-bold text-white bg-slate-950/80 px-3 py-1 rounded-lg border border-amber-500/30">
                  اضغط لتشغيل الفيديو
                </span>
              </div>
            </button>
          ) : (
            <iframe
              src={`${videoInfo.src}${isPlaying ? '?autoplay=1' : ''}`}
              title={title}
              loading="lazy"
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950">
      {isLoading ? (
        <div className="w-full h-44 flex flex-col items-center justify-center gap-2 text-sky-400 text-xs bg-slate-950">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>جاري تجهيز الفيديو للتشغيل...</span>
        </div>
      ) : resolvedUrl ? (
        !isPlaying && effectivePoster ? (
          <button
            type="button"
            onClick={() => setIsPlaying(true)}
            className="relative w-full h-52 group cursor-pointer bg-slate-950 flex items-center justify-center overflow-hidden"
            aria-label={`تشغيل الفيديو: ${title}`}
          >
            <img
              src={effectivePoster}
              alt={title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-slate-950/40 flex flex-col items-center justify-center gap-2">
              <span className="w-14 h-14 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-xl group-hover:scale-105 transition">
                <Play className="w-6 h-6 fill-current ml-0.5" />
              </span>
              <span className="text-[11px] font-bold text-white bg-slate-950/80 px-3 py-1 rounded-lg border border-amber-500/30">
                اضغط لتشغيل الفيديو
              </span>
            </div>
          </button>
        ) : (
          <video
            key={resolvedUrl}
            src={resolvedUrl}
            poster={effectivePoster || undefined}
            controls
            autoPlay={isPlaying}
            preload={isPlaying ? 'auto' : 'none'}
            playsInline
            className={videoClassName}
          />
        )
      ) : null}
    </div>
  );
};

