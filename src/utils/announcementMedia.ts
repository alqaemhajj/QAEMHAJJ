import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Announcement, CloudinaryConfig } from '../types';
import { uploadOptimizedMedia } from '../lib/mediaManager';
import { fetchWithTimeout } from './safeFetch';

export const FONT_SIZE_OPTIONS: {
  value: NonNullable<Announcement['fontSize']>;
  label: string;
  shortLabel: string;
  className: string;
}[] = [
  { value: 'sm', label: 'صغير', shortLabel: 'A-', className: 'text-xs leading-relaxed' },
  { value: 'normal', label: 'عادي', shortLabel: 'A', className: 'text-sm leading-relaxed' },
  { value: 'lg', label: 'كبير', shortLabel: 'A+', className: 'text-base leading-relaxed' },
  { value: 'xl', label: 'كبير جداً', shortLabel: 'A++', className: 'text-lg leading-relaxed' },
  { value: '2xl', label: 'بارز / ضخم', shortLabel: 'A+++', className: 'text-xl sm:text-2xl leading-relaxed' },
];

export function getAnnouncementTypographyClasses(ann: Partial<Announcement>): string {
  const sizeObj = FONT_SIZE_OPTIONS.find((o) => o.value === (ann.fontSize || 'normal')) || FONT_SIZE_OPTIONS[1];
  const weightClass = ann.isBold ? 'font-bold' : 'font-normal';
  const alignClass =
    ann.textAlign === 'center' ? 'text-center' : ann.textAlign === 'justify' ? 'text-justify' : 'text-right';
  return `${sizeObj.className} ${weightClass} ${alignClass} whitespace-pre-line`;
}

// ============================================================================
// Unified Cloud Media URL System (Zero-Base64 in Firestore):
// 1. Compresses images to WebP and extracts WebP thumbnails for videos
// 2. Deduplicates files via SHA-256 hash (`mediaAssets/{fileHash}`)
// 3. Uploads binaries to Storage/CDN and stores ONLY clean URLs in Firestore
// 4. Maintains backward-compatible reading for legacy `IMG-...`/`VID-...` refs
// ============================================================================

const memoryMediaCache = new Map<string, string>();
const pendingResolutions = new Map<string, Promise<string>>();

export function extractCloudReferenceId(val?: string): string | null {
  if (!val || !val.trim()) return null;
  const clean = val.trim();
  if (clean.startsWith('media://')) {
    return clean.replace('media://', '').trim();
  }
  const cloudMatch = clean.match(/media\.alqaem\.cloud\/((?:IMG|VID)-\d+)/i);
  if (cloudMatch && cloudMatch[1]) {
    return cloudMatch[1].toUpperCase();
  }
  if (/^(IMG|VID)-\d+$/i.test(clean)) {
    return clean.toUpperCase();
  }
  return null;
}

export function extractMediaId(val?: string): string | null {
  if (!val || !val.trim()) return null;
  const refId = extractCloudReferenceId(val);
  if (refId) return refId;

  const clean = val.trim();
  if (clean.startsWith('/uploads/media/')) {
    return clean.replace('/uploads/media/', '');
  }
  if (clean.includes('cloudinary.com')) {
    const parts = clean.split('/');
    return parts[parts.length - 1] || 'Cloudinary CDN';
  }
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    try {
      const parsed = new URL(clean);
      return parsed.hostname;
    } catch {
      return 'External URL';
    }
  }
  return null;
}

export function optimizeExternalMediaUrl(url?: string): string {
  if (!url || !url.trim()) return '';
  const clean = url.trim();
  if (clean.includes('res.cloudinary.com') && clean.includes('/upload/') && !clean.includes('/upload/f_auto')) {
    return clean.replace('/upload/', '/upload/f_auto,q_auto/');
  }
  return clean;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Uploads an image or video via the Unified Media Manager (`src/lib/mediaManager.ts`):
 * - Converts images to WebP & resizes to optimal display dimensions
 * - Extracts lightweight WebP thumbnails for videos
 * - Deduplicates via SHA-256 hash so identical files are never uploaded twice
 * - Stores binary files in Storage/CDN and NEVER writes Base64 chunks into Firestore
 */
export async function uploadMediaAsReference(
  file: File,
  kind: 'image' | 'video',
  onProgress?: (percent: number) => void,
  cloudinaryConfig?: CloudinaryConfig,
  linkedRecordId?: string,
  seasonOptions?: {
    seasonId?: string;
    seasonName?: string;
    duplicateResolution?: 'reuse_existing' | 'upload_new_seasonal_copy' | 'upload_modified_version';
    replacingAssetUrlOrId?: string;
  }
): Promise<{
  refUrl: string;
  thumbnailUrl: string;
  mediaId: string;
  assetId: string;
  uploadPolicy: string;
  provider: 'cloudinary' | 'external';
  originalSizeKb: number;
  compressedSizeKb: number;
  savingsPercent: number;
}> {
  const asset = await uploadOptimizedMedia(file, {
    kind,
    linkedRecordId,
    seasonId: seasonOptions?.seasonId,
    seasonName: seasonOptions?.seasonName,
    duplicateResolution: seasonOptions?.duplicateResolution,
    replacingAssetUrlOrId: seasonOptions?.replacingAssetUrlOrId,
    cloudinaryConfig,
    onProgress: (pct) => {
      if (onProgress) onProgress(pct);
    },
  });

  return {
    refUrl: asset.url,
    thumbnailUrl: asset.thumbnailUrl || asset.url,
    mediaId: asset.fileHash,
    assetId: asset.id,
    uploadPolicy: asset.uploadPolicy,
    provider: asset.provider === 'cloudinary' ? 'cloudinary' : 'external',
    originalSizeKb: Math.max(1, Math.round(asset.originalSizeBytes / 1024)),
    compressedSizeKb: Math.max(1, Math.round(asset.compressedSizeBytes / 1024)),
    savingsPercent: asset.savingsPercent,
  };
}

/**
 * Resolves any media URL:
 * - Standard external/Cloudinary URLs (`https://res.cloudinary.com/...`, `https://...`) -> returned directly
 * - Temporary `tmpfiles.org` URLs -> resolved to signed direct stream URL
 * - Cloud Reference URIs (`https://media.alqaem.cloud/VID-...` or `media://VID-...`) -> resolved from cloud store
 */
export async function resolveMediaReferenceUrl(urlOrRef?: string): Promise<string> {
  if (!urlOrRef || !urlOrRef.trim()) return '';
  const clean = urlOrRef.trim();

  // Check if it's a tmpfiles.org link that needs signed token resolution
  if (clean.includes('tmpfiles.org/')) {
    const cachedTmp = memoryMediaCache.get(clean);
    if (cachedTmp) return cachedTmp;
    try {
      const resp = await fetchWithTimeout(
        `/api/media/resolve-external?url=${encodeURIComponent(clean)}`,
        { timeoutMs: 4500 }
      );
      const contentType = resp.headers.get('content-type') || '';
      if (resp.ok && contentType.includes('application/json')) {
        const data = await resp.json();
        if (data?.resolvedUrl) {
          memoryMediaCache.set(clean, data.resolvedUrl);
          return data.resolvedUrl;
        }
      }
    } catch {
      // Fallback if on static host (e.g. Cloudflare Pages)
    }
    return clean.replace('http://', 'https://');
  }

  const mediaId = extractCloudReferenceId(clean);
  if (!mediaId) {
    return optimizeExternalMediaUrl(clean);
  }

  const mem = memoryMediaCache.get(mediaId);
  if (mem) return mem;

  const inflight = pendingResolutions.get(mediaId);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      const assetSnap = await getDoc(doc(db, 'settings', 'mediaStore', 'assets', mediaId));
      if (!assetSnap.exists()) {
        return '';
      }
      const meta = assetSnap.data() as {
        mimeType?: string;
        chunkCount?: number;
      };
      const chunkCount = Number(meta.chunkCount || 0);
      if (chunkCount <= 0) return '';

      const chunkIndices = Array.from({ length: chunkCount }, (_, i) => i);
      const chunkParts: string[] = new Array(chunkCount).fill('');

      const batchSize = 6;
      for (let i = 0; i < chunkIndices.length; i += batchSize) {
        const batch = chunkIndices.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (idx) => {
            const cSnap = await getDoc(doc(db, 'settings', 'mediaStore', 'chunks', `${mediaId}_${idx}`));
            if (cSnap.exists()) {
              chunkParts[idx] = String(cSnap.data()?.data || '');
            }
          })
        );
      }

      const fullBase64 = chunkParts.join('');
      if (!fullBase64) return '';

      const bytes = base64ToUint8Array(fullBase64);
      const mimeType = meta.mimeType || (mediaId.startsWith('IMG') ? 'image/jpeg' : 'video/mp4');
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });

      const objUrl = URL.createObjectURL(blob);
      memoryMediaCache.set(mediaId, objUrl);
      return objUrl;
    } catch (err) {
      console.warn('Error resolving cloud media reference:', mediaId, err);
      return '';
    } finally {
      pendingResolutions.delete(mediaId);
    }
  })();

  pendingResolutions.set(mediaId, task);
  return task;
}

export function useResolvedMediaUrl(urlOrRef?: string): {
  resolvedUrl: string;
  isLoading: boolean;
  mediaId: string | null;
} {
  const cloudRefId = extractCloudReferenceId(urlOrRef);
  const isTmpFiles = Boolean(urlOrRef && urlOrRef.includes('tmpfiles.org/'));
  const needsAsyncResolve = Boolean(cloudRefId || isTmpFiles);

  const [resolvedUrl, setResolvedUrl] = useState<string>(() => {
    if (!urlOrRef || !urlOrRef.trim()) return '';
    if (cloudRefId) return memoryMediaCache.get(cloudRefId) || '';
    if (isTmpFiles) return memoryMediaCache.get(urlOrRef.trim()) || '';
    return optimizeExternalMediaUrl(urlOrRef);
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (!urlOrRef || !needsAsyncResolve) return false;
    const key = cloudRefId || urlOrRef.trim();
    return !memoryMediaCache.has(key);
  });

  useEffect(() => {
    let active = true;
    if (!urlOrRef || !urlOrRef.trim()) {
      setResolvedUrl('');
      setIsLoading(false);
      return;
    }

    const refId = extractCloudReferenceId(urlOrRef);
    const tmp = urlOrRef.includes('tmpfiles.org/');

    if (!refId && !tmp) {
      setResolvedUrl(optimizeExternalMediaUrl(urlOrRef));
      setIsLoading(false);
      return;
    }

    const cacheKey = refId || urlOrRef.trim();
    const cached = memoryMediaCache.get(cacheKey);
    if (cached) {
      setResolvedUrl(cached);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    resolveMediaReferenceUrl(urlOrRef).then((res) => {
      if (!active) return;
      setResolvedUrl(res);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [urlOrRef]);

  return {
    resolvedUrl,
    isLoading,
    mediaId: extractMediaId(urlOrRef),
  };
}

export function getEmbeddedVideoInfo(url?: string): {
  type: 'youtube' | 'direct' | 'none';
  src: string;
} {
  if (!url || !url.trim()) {
    return { type: 'none', src: '' };
  }
  const clean = url.trim();

  const ytMatch =
    clean.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/) ||
    clean.match(/[?&]v=([A-Za-z0-9_-]{6,})/);

  if (ytMatch && ytMatch[1]) {
    return {
      type: 'youtube',
      src: `https://www.youtube.com/embed/${ytMatch[1]}`,
    };
  }

  return {
    type: 'direct',
    src: clean,
  };
}

export async function compressAnnouncementImage(
  file: File,
  onProgress?: (percent: number) => void,
  cloudinaryConfig?: CloudinaryConfig
): Promise<{ dataUrl: string; mediaId: string; sizeKb: number }> {
  const { refUrl, mediaId } = await uploadMediaAsReference(file, 'image', onProgress, cloudinaryConfig);
  return { dataUrl: refUrl, mediaId, sizeKb: 0 };
}
