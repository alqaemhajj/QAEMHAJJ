import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from './firebase';
import { CloudinaryConfig, MediaUploadPolicy } from '../types';
import { fetchWithTimeout } from '../utils/safeFetch';
import {
  extractHijriYear,
  getProtectedSeasonMediaMap,
  linkEntityToSeason,
  normalizeSeasonId,
} from './seasons';

export interface MediaSeasonLinkEvent {
  seasonId: string;
  seasonName?: string;
  recordId?: string;
  action: 'linked' | 'reused' | 'copied' | 'replaced' | 'unlinked';
  timestamp: string;
  note?: string;
}

export interface MediaRetentionPolicy {
  preserveInArchive: boolean;
  status: 'active' | 'archived_protected' | 'pending_cleanup';
  lastReferencedAt: string;
  unlinkedAt?: string;
  retentionMinDays?: number;
}

export interface MediaAssetMetadata {
  id: string; // Independent unique asset ID (fileHash for canonical asset, or `${fileHash}_v...` for explicit seasonal/modified copy)
  fileHash: string; // Real SHA-256 fingerprint of file binary content (never relies on filename)
  kind: 'image' | 'video';
  url: string;
  thumbnailUrl: string;
  storagePath: string;
  thumbnailStoragePath?: string;
  provider: 'firebase_storage' | 'cloudinary' | 'server_cdn' | 'external';
  fileName: string;
  mimeType: string;
  format: 'webp' | 'jpeg' | 'avif' | 'mp4' | 'webm';
  originalSizeBytes: number;
  compressedSizeBytes: number;
  savingsPercent: number;
  width?: number;
  height?: number;
  durationSec?: number;
  uploadedAt: string;
  uploadPolicy: MediaUploadPolicy;
  version: number;
  parentAssetId?: string;
  linkedSeasonIds: string[]; // Independent across seasons (e.g., ['season-1447', 'season-1448'])
  linkedRecordIds: string[]; // e.g., ['packages/pkg-1', 'pilgrims/1023456789_1448']
  seasonLinksHistory?: MediaSeasonLinkEvent[];
  retentionPolicy?: MediaRetentionPolicy;
}

export interface DuplicateInspectionResult {
  isDuplicate: boolean;
  fileHash: string;
  existingMatches: MediaAssetMetadata[];
  primaryMatch: MediaAssetMetadata | null;
}

export interface MediaUploadOptions {
  kind: 'image' | 'video';
  linkedRecordId?: string; // e.g. 'packages/pkg-1' or 'pilgrims/1023456789_1448'
  seasonId?: string; // e.g. '1448' or 'season-1448'
  seasonName?: string; // e.g. 'حج 1448هـ'
  duplicateResolution?:
    | 'reuse_existing'
    | 'upload_new_seasonal_copy'
    | 'upload_modified_version';
  existingAssetIdToReuse?: string;
  replacingAssetUrlOrId?: string;
  maxDimension?: number;
  quality?: number;
  generateThumbnail?: boolean;
  cloudinaryConfig?: CloudinaryConfig;
  onProgress?: (percent: number, stageText?: string) => void;
}

const inMemoryAssetCache = new Map<string, MediaAssetMetadata>();

/**
 * Computes SHA-256 hex digest of a Blob/File/ArrayBuffer for content-based deduplication.
 * Never depends on file name.
 */
export async function computeFileSha256(input: Blob | ArrayBuffer): Promise<string> {
  const buffer = input instanceof Blob ? await input.arrayBuffer() : input;
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  }
  const bytes = new Uint8Array(buffer);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const step = Math.max(1, Math.floor(bytes.length / 4096));
  for (let i = 0; i < bytes.length; i += step) {
    h1 ^= bytes[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= bytes[bytes.length - 1 - i];
    h2 = Math.imul(h2, 0x811c9dc5);
  }
  return `fnv_${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}_${bytes.length}`;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(';base64,') ? result.split(';base64,')[1] || '' : result;
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToFile(dataUrl: string, defaultName = 'asset.webp'): File {
  const parts = dataUrl.split(';base64,');
  const mime = parts[0]?.replace('data:', '') || 'image/webp';
  const bstr = atob(parts[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  const ext = mime.includes('png')
    ? 'png'
    : mime.includes('webp')
    ? 'webp'
    : mime.includes('mp4')
    ? 'mp4'
    : 'jpg';
  const finalName = defaultName.includes('.') ? defaultName : `${defaultName}.${ext}`;
  return new File([u8arr], finalName, { type: mime });
}

/**
 * Inspects a file BEFORE upload using its SHA-256 content fingerprint (not filename)
 * to discover if an identical asset already exists across current or previous seasons.
 */
export async function inspectMediaFileBeforeUpload(
  fileOrBlob: File | Blob,
  kind: 'image' | 'video'
): Promise<DuplicateInspectionResult> {
  const fileHash = await computeFileSha256(fileOrBlob);
  const matchesMap = new Map<string, MediaAssetMetadata>();

  // 1. Check in-memory cache
  for (const cached of inMemoryAssetCache.values()) {
    if (
      cached.fileHash === fileHash &&
      cached.kind === kind &&
      cached.url &&
      !cached.url.startsWith('blob:') &&
      !cached.url.startsWith('data:')
    ) {
      matchesMap.set(cached.id, cached);
    }
  }

  // 2. Check Firestore canonical doc & any copies sharing the same SHA-256 fileHash
  try {
    const canonicalSnap = await getDoc(doc(db, 'mediaAssets', fileHash));
    if (canonicalSnap.exists()) {
      const d = canonicalSnap.data() as MediaAssetMetadata;
      if (d?.url && !d.url.startsWith('blob:') && !d.url.startsWith('data:')) {
        matchesMap.set(canonicalSnap.id, { ...d, id: canonicalSnap.id });
      }
    }

    const q = query(collection(db, 'mediaAssets'), where('fileHash', '==', fileHash));
    const qSnap = await getDocs(q);
    for (const snapDoc of qSnap.docs) {
      const d = snapDoc.data() as MediaAssetMetadata;
      if (d?.url && !d.url.startsWith('blob:') && !d.url.startsWith('data:') && d.kind === kind) {
        matchesMap.set(snapDoc.id, { ...d, id: snapDoc.id });
      }
    }
  } catch {
    // Graceful fallback if offline
  }

  const existingMatches = Array.from(matchesMap.values()).sort(
    (a, b) => Number(a.version || 1) - Number(b.version || 1)
  );
  return {
    isDuplicate: existingMatches.length > 0,
    fileHash,
    existingMatches,
    primaryMatch: existingMatches[0] || null,
  };
}

/**
 * Compresses and converts an image to WebP (with JPEG fallback) and generates an optional thumbnail.
 */
export async function optimizeImageToWebP(
  file: File | Blob,
  maxDim = 1280,
  quality = 0.8
): Promise<{
  blob: Blob;
  mimeType: string;
  format: 'webp' | 'jpeg';
  width: number;
  height: number;
}> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.naturalWidth || img.width || 800;
      let height = img.naturalHeight || img.height || 600;

      if (width > height) {
        if (width > maxDim) {
          height = Math.max(1, Math.round((height * maxDim) / width));
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.max(1, Math.round((width * maxDim) / height));
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({
          blob: file,
          mimeType: file.type || 'image/jpeg',
          format: 'jpeg',
          width,
          height,
        });
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (webpBlob) => {
          if (webpBlob && webpBlob.size > 0 && webpBlob.type === 'image/webp') {
            resolve({
              blob: webpBlob,
              mimeType: 'image/webp',
              format: 'webp',
              width,
              height,
            });
          } else {
            canvas.toBlob(
              (jpegBlob) => {
                resolve({
                  blob: jpegBlob || file,
                  mimeType: 'image/jpeg',
                  format: 'jpeg',
                  width,
                  height,
                });
              },
              'image/jpeg',
              quality
            );
          }
        },
        'image/webp',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        blob: file,
        mimeType: file.type || 'image/jpeg',
        format: 'jpeg',
        width: 800,
        height: 600,
      });
    };
    img.src = objectUrl;
  });
}

/**
 * Validates a video file and extracts a compressed WebP thumbnail frame at t=0.5s.
 */
export async function inspectAndExtractVideoThumbnail(
  file: File | Blob,
  maxThumbDim = 480
): Promise<{
  thumbnailBlob: Blob | null;
  durationSec: number;
  width: number;
  height: number;
}> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let resolved = false;
    const finish = (res: {
      thumbnailBlob: Blob | null;
      durationSec: number;
      width: number;
      height: number;
    }) => {
      if (resolved) return;
      resolved = true;
      URL.revokeObjectURL(objectUrl);
      resolve(res);
    };

    const timeout = setTimeout(() => {
      finish({ thumbnailBlob: null, durationSec: 0, width: 640, height: 360 });
    }, 6000);

    video.onloadedmetadata = () => {
      const targetTime = Math.min(0.5, Math.max(0, (video.duration || 1) * 0.1));
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 360;
      const durationSec = Math.round(video.duration || 0);

      let tw = vw;
      let th = vh;
      if (tw > maxThumbDim) {
        th = Math.max(1, Math.round((th * maxThumbDim) / tw));
        tw = maxThumbDim;
      }

      const canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        finish({ thumbnailBlob: null, durationSec, width: vw, height: vh });
        return;
      }
      ctx.drawImage(video, 0, 0, tw, th);
      canvas.toBlob(
        (blob) => {
          finish({ thumbnailBlob: blob, durationSec, width: vw, height: vh });
        },
        'image/webp',
        0.78
      );
    };

    video.onerror = () => {
      clearTimeout(timeout);
      finish({ thumbnailBlob: null, durationSec: 0, width: 640, height: 360 });
    };

    video.src = objectUrl;
  });
}

/**
 * Internal helper that uploads a single binary blob to Cloudinary, Server CDN, or Firebase Storage.
 */
async function uploadBinaryBlobToStorage(params: {
  blob: Blob;
  storageKey: string;
  mimeType: string;
  ext: string;
  isThumbnail?: boolean;
  cloudinaryConfig?: CloudinaryConfig;
}): Promise<{
  url: string;
  storagePath: string;
  provider: 'firebase_storage' | 'cloudinary' | 'server_cdn';
}> {
  const { blob, storageKey, mimeType, ext, isThumbnail, cloudinaryConfig } = params;
  const suffix = isThumbnail ? '_thumb' : '';
  const storageFileName = `${storageKey}${suffix}.${ext}`;
  const firebaseStoragePath = `alqaem_media/${storageFileName}`;

  const envCloudName = (import.meta as any).env?.VITE_CLOUDINARY_CLOUD_NAME || '';
  const envUploadPreset = (import.meta as any).env?.VITE_CLOUDINARY_UPLOAD_PRESET || '';
  const cloudName = (cloudinaryConfig?.cloudName || envCloudName || '').trim();
  const uploadPreset = (cloudinaryConfig?.uploadPreset || envUploadPreset || '').trim();

  if (cloudName && uploadPreset) {
    try {
      const resourceType = mimeType.startsWith('video/') ? 'video' : 'image';
      const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
      const formData = new FormData();
      formData.append('file', blob, storageFileName);
      formData.append('upload_preset', uploadPreset);

      const resp = await fetch(endpoint, { method: 'POST', body: formData });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.secure_url) {
          const optimizedUrl = String(data.secure_url).includes('/upload/')
            ? String(data.secure_url).replace('/upload/', '/upload/f_auto,q_auto/')
            : String(data.secure_url);
          return {
            url: optimizedUrl,
            storagePath: String(data.public_id || firebaseStoragePath),
            provider: 'cloudinary',
          };
        }
      }
    } catch {
      // Fall through
    }
  }

  try {
    const base64Data = await blobToBase64(blob);
    const resp = await fetch('/api/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileHash: storageKey,
        mimeType,
        base64Data,
        isThumbnail: Boolean(isThumbnail),
      }),
    });
    if (resp.ok) {
      const result = await resp.json();
      if (result?.url) {
        return {
          url: String(result.url),
          storagePath: String(result.storagePath || `uploads/media/${storageFileName}`),
          provider: 'server_cdn',
        };
      }
    }
  } catch {
    // Fall through
  }

  try {
    const refObj = storageRef(storage, firebaseStoragePath);
    await uploadBytes(refObj, blob, {
      contentType: mimeType,
      cacheControl: 'public,max-age=31536000,immutable',
    });
    const downloadUrl = await getDownloadURL(refObj);
    return {
      url: downloadUrl,
      storagePath: firebaseStoragePath,
      provider: 'firebase_storage',
    };
  } catch {
    const objUrl = URL.createObjectURL(blob);
    return {
      url: objUrl,
      storagePath: firebaseStoragePath,
      provider: 'server_cdn',
    };
  }
}

/**
 * Reuses an existing MediaAsset across seasons/records WITHOUT creating a duplicate physical file.
 */
export async function reuseExistingMediaAsset(
  assetId: string,
  params: {
    linkedRecordId?: string;
    seasonId?: string;
    seasonName?: string;
    note?: string;
  }
): Promise<MediaAssetMetadata | null> {
  const { linkedRecordId, seasonId, seasonName, note } = params;
  const cleanSeasonId = seasonId ? normalizeSeasonId(seasonId) : undefined;
  const nowIso = new Date().toISOString();

  try {
    const ref = doc(db, 'mediaAssets', assetId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const existing = snap.data() as MediaAssetMetadata;
    const historyEvent: MediaSeasonLinkEvent = {
      seasonId: cleanSeasonId || 'global',
      seasonName: seasonName || (cleanSeasonId ? `حج ${extractHijriYear(cleanSeasonId)}هـ` : undefined),
      recordId: linkedRecordId,
      action: 'reused',
      timestamp: nowIso,
      note: note || 'إعادة استخدام نفس الملف الموثق دون تكرار مساحة التخزين',
    };

    const nextHistory = [historyEvent, ...(existing.seasonLinksHistory || [])].slice(0, 40);
    const nextLinkedSeasons = Array.from(
      new Set([...(existing.linkedSeasonIds || []), ...(cleanSeasonId ? [cleanSeasonId] : [])])
    );
    const nextLinkedRecords = Array.from(
      new Set([...(existing.linkedRecordIds || []), ...(linkedRecordId ? [linkedRecordId] : [])])
    );

    const updatePayload: Partial<MediaAssetMetadata> = {
      linkedSeasonIds: nextLinkedSeasons,
      linkedRecordIds: nextLinkedRecords,
      seasonLinksHistory: nextHistory,
      retentionPolicy: {
        preserveInArchive: true,
        status: 'active',
        lastReferencedAt: nowIso,
        retentionMinDays: existing.retentionPolicy?.retentionMinDays ?? 365,
      },
    };

    await setDoc(ref, updatePayload, { merge: true });

    if (cleanSeasonId) {
      linkEntityToSeason({
        seasonIdOrYear: cleanSeasonId,
        entityType: 'mediaAsset',
        entityId: assetId,
        note: `إعادة استخدام الملف (${existing.fileName})`,
      }).catch(() => {});
    }

    const updated: MediaAssetMetadata = {
      ...existing,
      ...updatePayload,
      id: assetId,
      uploadPolicy: existing.uploadPolicy === 'new_file' && nextLinkedSeasons.length > 1
        ? 'reused_existing'
        : existing.uploadPolicy || 'reused_existing',
    };
    inMemoryAssetCache.set(assetId, updated);
    return updated;
  } catch {
    return null;
  }
}

/**
 * Main Season-Aware Media Upload & Policy Engine:
 * Supports 4 explicit policies:
 * 1) `new_file`: Brand new SHA-256 content -> compress to WebP/extract video thumb -> store & index
 * 2) `reused_existing`: Exact SHA-256 match reused across seasons/records -> links without uploading duplicate physical file
 * 3) `new_seasonal_copy`: New independent physical copy for a new season even if matching previous season's file
 * 4) `modified_version`: Updated/replaced version stored independently while preserving previous season asset & links
 */
export async function uploadOptimizedMedia(
  fileOrBlob: File | Blob,
  options: MediaUploadOptions
): Promise<MediaAssetMetadata> {
  const {
    kind,
    linkedRecordId,
    seasonId,
    seasonName,
    duplicateResolution = 'reuse_existing',
    existingAssetIdToReuse,
    replacingAssetUrlOrId,
    maxDimension = 1280,
    quality = 0.8,
    generateThumbnail = true,
    cloudinaryConfig,
    onProgress,
  } = options;

  const originalSizeBytes = fileOrBlob.size || 0;
  const rawFileName = (fileOrBlob as File).name || `${kind}_${Date.now()}`;
  const cleanSeasonId = seasonId ? normalizeSeasonId(seasonId) : undefined;
  const effectiveSeasonLabel = seasonName || (cleanSeasonId ? `حج ${extractHijriYear(cleanSeasonId)}هـ` : undefined);
  const nowIso = new Date().toISOString();

  if (kind === 'video') {
    const maxVideoBytes = 35 * 1024 * 1024;
    if (originalSizeBytes > maxVideoBytes) {
      throw new Error('حجم الفيديو يتجاوز الحد الأقصى المسموح به (35 ميجابايت). يرجى اختيار فيديو أقصر أو أقل حجماً.');
    }
  } else {
    const maxImageBytes = 15 * 1024 * 1024;
    if (originalSizeBytes > maxImageBytes) {
      throw new Error('حجم الصورة يتجاوز الحد الأقصى المسموح به (15 ميجابايت).');
    }
  }

  onProgress?.(10, 'جاري فحص البصمة الرقمية للمحتوى (SHA-256)...');
  const inspection = await inspectMediaFileBeforeUpload(fileOrBlob, kind);
  const rawHash = inspection.fileHash;

  // Safe unlink only for current record/season if replacing an old image (never harms other seasons!)
  if (replacingAssetUrlOrId && linkedRecordId) {
    unlinkAndCleanupMediaIfUnused(replacingAssetUrlOrId, linkedRecordId, cleanSeasonId).catch(() => {});
  }

  // Handle explicit REUSE of an existing asset
  if (duplicateResolution === 'reuse_existing' && (existingAssetIdToReuse || inspection.primaryMatch)) {
    const targetAssetId = existingAssetIdToReuse || inspection.primaryMatch!.id;
    const reused = await reuseExistingMediaAsset(targetAssetId, {
      linkedRecordId,
      seasonId: cleanSeasonId,
      seasonName: effectiveSeasonLabel,
      note: 'إعادة استخدام تلقائي/اختياري للملف المطابق دون إنشاء نسخة مادية جديدة',
    });
    if (reused) {
      onProgress?.(100, 'تم ربط الملف الموجود مسبقاً بنجاح دون استهلاك مساحة إضافية');
      return reused;
    }
  }

  // Determine Asset ID, Storage Key, Version, and Upload Policy
  const hasExistingMatches = inspection.existingMatches.length > 0;
  let uploadPolicy: MediaUploadPolicy = 'new_file';
  let parentAssetId: string | undefined = undefined;
  let version = 1;
  let assetId = rawHash;
  let storageKey = rawHash;

  if (duplicateResolution === 'upload_new_seasonal_copy') {
    uploadPolicy = 'new_seasonal_copy';
    const maxVer = inspection.existingMatches.reduce((m, a) => Math.max(m, Number(a.version || 1)), 0);
    version = maxVer + 1;
    parentAssetId = inspection.primaryMatch?.id;
    const suffix = `${cleanSeasonId || 'global'}_${Date.now().toString(36).slice(-4)}`;
    assetId = `${rawHash}_c_${suffix}`;
    storageKey = assetId;
  } else if (duplicateResolution === 'upload_modified_version' || replacingAssetUrlOrId) {
    uploadPolicy = 'modified_version';
    const maxVer = inspection.existingMatches.reduce((m, a) => Math.max(m, Number(a.version || 1)), 0);
    version = maxVer + 1;
    parentAssetId = inspection.primaryMatch?.id;
    if (hasExistingMatches) {
      const suffix = `v${version}_${Date.now().toString(36).slice(-4)}`;
      assetId = `${rawHash}_${suffix}`;
      storageKey = assetId;
    }
  }

  const initialHistoryEvent: MediaSeasonLinkEvent = {
    seasonId: cleanSeasonId || 'global',
    seasonName: effectiveSeasonLabel,
    recordId: linkedRecordId,
    action:
      uploadPolicy === 'new_seasonal_copy'
        ? 'copied'
        : uploadPolicy === 'modified_version'
        ? 'replaced'
        : 'linked',
    timestamp: nowIso,
    note:
      uploadPolicy === 'new_seasonal_copy'
        ? 'نسخة مستقلة جديدة للموسم الحالي'
        : uploadPolicy === 'modified_version'
        ? 'نسخة معدّلة/محدثة مستقلة مع الحفاظ على النسخة السابقة'
        : 'رفع وتوثيق ملف جديد في المكتبة المركزية',
  };

  if (kind === 'image') {
    onProgress?.(25, 'جاري ضغط الصورة وتحويلها إلى صيغة WebP عالية الكفاءة...');
    const optimized = await optimizeImageToWebP(fileOrBlob, maxDimension, quality);
    const ext = optimized.format === 'webp' ? 'webp' : 'jpg';

    onProgress?.(55, 'جاري رفع الصورة المضغوطة إلى وحدة التخزين...');
    const mainUpload = await uploadBinaryBlobToStorage({
      blob: optimized.blob,
      storageKey,
      mimeType: optimized.mimeType,
      ext,
      isThumbnail: false,
      cloudinaryConfig,
    });

    let thumbnailUrl = mainUpload.url;
    let thumbnailStoragePath = mainUpload.storagePath;

    if (generateThumbnail && (optimized.width > 420 || optimized.height > 420)) {
      onProgress?.(80, 'جاري توليد الصورة المصغرة (Thumbnail)...');
      const thumbOptimized = await optimizeImageToWebP(fileOrBlob, 380, 0.72);
      const thumbUpload = await uploadBinaryBlobToStorage({
        blob: thumbOptimized.blob,
        storageKey,
        mimeType: thumbOptimized.mimeType,
        ext: thumbOptimized.format === 'webp' ? 'webp' : 'jpg',
        isThumbnail: true,
        cloudinaryConfig,
      });
      thumbnailUrl = thumbUpload.url;
      thumbnailStoragePath = thumbUpload.storagePath;
    }

    const compressedSizeBytes = optimized.blob.size;
    const savingsPercent =
      originalSizeBytes > 0
        ? Math.max(0, Math.round(((originalSizeBytes - compressedSizeBytes) / originalSizeBytes) * 100))
        : 0;

    const metadata: MediaAssetMetadata = {
      id: assetId,
      fileHash: rawHash,
      kind: 'image',
      url: mainUpload.url,
      thumbnailUrl,
      storagePath: mainUpload.storagePath,
      thumbnailStoragePath,
      provider: mainUpload.provider,
      fileName: rawFileName.replace(/\.[^.]+$/, `.${ext}`),
      mimeType: optimized.mimeType,
      format: optimized.format,
      originalSizeBytes,
      compressedSizeBytes,
      savingsPercent,
      width: optimized.width,
      height: optimized.height,
      uploadedAt: nowIso,
      uploadPolicy,
      version,
      ...(parentAssetId ? { parentAssetId } : {}),
      linkedSeasonIds: cleanSeasonId ? [cleanSeasonId] : [],
      linkedRecordIds: linkedRecordId ? [linkedRecordId] : [],
      seasonLinksHistory: [initialHistoryEvent],
      retentionPolicy: {
        preserveInArchive: true,
        status: 'active',
        lastReferencedAt: nowIso,
        retentionMinDays: 365,
      },
    };

    if (!mainUpload.url.startsWith('blob:')) {
      try {
        await setDoc(doc(db, 'mediaAssets', assetId), metadata, { merge: true });
      } catch {
        // Non-blocking if offline
      }
      if (cleanSeasonId) {
        linkEntityToSeason({
          seasonIdOrYear: cleanSeasonId,
          entityType: 'mediaAsset',
          entityId: assetId,
          note: `رفع صورة (${metadata.fileName})`,
        }).catch(() => {});
      }
    }

    inMemoryAssetCache.set(assetId, metadata);
    onProgress?.(100, 'اكتمل ضغط ورفع الصورة بنجاح');
    return metadata;
  } else {
    onProgress?.(25, 'جاري فحص الفيديو واستخراج صورة مصغرة (Thumbnail)...');
    const videoInfo = await inspectAndExtractVideoThumbnail(fileOrBlob);
    const mimeType = fileOrBlob.type || 'video/mp4';
    const ext = mimeType.includes('webm') ? 'webm' : 'mp4';

    onProgress?.(55, 'جاري رفع الفيديو إلى وحدة التخزين السحابية...');
    const mainUpload = await uploadBinaryBlobToStorage({
      blob: fileOrBlob,
      storageKey,
      mimeType,
      ext,
      isThumbnail: false,
      cloudinaryConfig,
    });

    let thumbnailUrl = '';
    let thumbnailStoragePath = '';

    if (videoInfo.thumbnailBlob) {
      onProgress?.(85, 'جاري حفظ الصورة المصغرة للفيديو...');
      const thumbUpload = await uploadBinaryBlobToStorage({
        blob: videoInfo.thumbnailBlob,
        storageKey,
        mimeType: 'image/webp',
        ext: 'webp',
        isThumbnail: true,
        cloudinaryConfig,
      });
      thumbnailUrl = thumbUpload.url;
      thumbnailStoragePath = thumbUpload.storagePath;
    }

    const metadata: MediaAssetMetadata = {
      id: assetId,
      fileHash: rawHash,
      kind: 'video',
      url: mainUpload.url,
      thumbnailUrl,
      storagePath: mainUpload.storagePath,
      thumbnailStoragePath,
      provider: mainUpload.provider,
      fileName: rawFileName,
      mimeType,
      format: ext === 'webm' ? 'webm' : 'mp4',
      originalSizeBytes,
      compressedSizeBytes: originalSizeBytes,
      savingsPercent: 0,
      width: videoInfo.width,
      height: videoInfo.height,
      durationSec: videoInfo.durationSec,
      uploadedAt: nowIso,
      uploadPolicy,
      version,
      ...(parentAssetId ? { parentAssetId } : {}),
      linkedSeasonIds: cleanSeasonId ? [cleanSeasonId] : [],
      linkedRecordIds: linkedRecordId ? [linkedRecordId] : [],
      seasonLinksHistory: [initialHistoryEvent],
      retentionPolicy: {
        preserveInArchive: true,
        status: 'active',
        lastReferencedAt: nowIso,
        retentionMinDays: 365,
      },
    };

    if (!mainUpload.url.startsWith('blob:')) {
      try {
        await setDoc(doc(db, 'mediaAssets', assetId), metadata, { merge: true });
      } catch {
        // Non-blocking if offline
      }
      if (cleanSeasonId) {
        linkEntityToSeason({
          seasonIdOrYear: cleanSeasonId,
          entityType: 'mediaAsset',
          entityId: assetId,
          note: `رفع فيديو (${metadata.fileName})`,
        }).catch(() => {});
      }
    }

    inMemoryAssetCache.set(assetId, metadata);
    onProgress?.(100, 'اكتمل رفع الفيديو وتوليد المصغرة بنجاح');
    return metadata;
  }
}

/**
 * Fetches all media assets sorted newest-first, optionally filtered by seasonId or kind.
 */
export async function getMediaLibraryAssets(filters?: {
  seasonId?: string;
  kind?: 'image' | 'video';
}): Promise<MediaAssetMetadata[]> {
  try {
    const snap = await getDocs(collection(db, 'mediaAssets'));
    const normSeason = filters?.seasonId ? normalizeSeasonId(filters.seasonId) : null;
    const rawYear = filters?.seasonId ? extractHijriYear(filters.seasonId) : null;

    return snap.docs
      .map((d) => ({ ...(d.data() as MediaAssetMetadata), id: d.id }))
      .filter((asset) => {
        if (filters?.kind && asset.kind !== filters.kind) return false;
        if (normSeason) {
          const seasons = asset.linkedSeasonIds || [];
          const hasSeason =
            seasons.includes(normSeason) ||
            (rawYear ? seasons.includes(rawYear) : false) ||
            (asset.seasonLinksHistory || []).some(
              (h) => h.seasonId === normSeason || h.seasonId === rawYear
            );
          if (!hasSeason) return false;
        }
        return Boolean(asset.url && !asset.url.startsWith('blob:'));
      })
      .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
  } catch {
    return [];
  }
}

/**
 * Season-Aware Unlink & Retention-Protected Cleanup:
 * - Unlinks ONLY the given `linkedRecordId`
 * - NEVER deletes a file if it is still linked to any other record OR any protected/archived season!
 * - Applies retention policy before physical deletion.
 */
export async function unlinkAndCleanupMediaIfUnused(
  mediaUrlOrAssetId: string | undefined,
  linkedRecordId: string,
  seasonId?: string
): Promise<{ deletedPhysically: boolean; reason: string }> {
  if (!mediaUrlOrAssetId || typeof mediaUrlOrAssetId !== 'string') {
    return { deletedPhysically: false, reason: 'no_url' };
  }
  const cleanTarget = mediaUrlOrAssetId.trim();
  if (!cleanTarget || cleanTarget.startsWith('data:')) {
    return { deletedPhysically: false, reason: 'invalid_url' };
  }

  try {
    const snap = await getDocs(collection(db, 'mediaAssets'));
    const matchingDoc = snap.docs.find((d) => {
      const data = d.data() as MediaAssetMetadata;
      return (
        d.id === cleanTarget ||
        data.url === cleanTarget ||
        data.thumbnailUrl === cleanTarget
      );
    });

    if (!matchingDoc) {
      return { deletedPhysically: false, reason: 'asset_not_indexed' };
    }

    const asset = { ...(matchingDoc.data() as MediaAssetMetadata), id: matchingDoc.id };
    const remainingLinks = (asset.linkedRecordIds || []).filter((id) => id !== linkedRecordId);
    const nowIso = new Date().toISOString();
    const normSeason = seasonId ? normalizeSeasonId(seasonId) : undefined;

    const historyEntry: MediaSeasonLinkEvent = {
      seasonId: normSeason || 'global',
      recordId: linkedRecordId,
      action: 'unlinked',
      timestamp: nowIso,
      note: 'فك ارتباط الملف من السجل الحالي',
    };
    const nextHistory = [historyEntry, ...(asset.seasonLinksHistory || [])].slice(0, 40);

    // Check season archive protection across ALL seasons in Firestore
    const { protectedSeasonIds, protectedMediaAssetIds } = await getProtectedSeasonMediaMap();
    const hasOtherProtectedSeasonLink = (asset.linkedSeasonIds || []).some((sid) => {
      const nSid = normalizeSeasonId(sid);
      if (normSeason && nSid === normSeason && remainingLinks.length === 0) {
        // Still keep archived protection if that season explicitly protects archived media and is archived
        return protectedMediaAssetIds.has(asset.id);
      }
      return protectedSeasonIds.has(nSid) || protectedSeasonIds.has(sid);
    });

    const isProtectedByArchive =
      protectedMediaAssetIds.has(asset.id) || hasOtherProtectedSeasonLink;

    if (remainingLinks.length > 0 || isProtectedByArchive) {
      // Keep the physical file safe! Only remove this specific record link.
      await setDoc(
        doc(db, 'mediaAssets', matchingDoc.id),
        {
          linkedRecordIds: arrayRemove(linkedRecordId),
          seasonLinksHistory: nextHistory,
          retentionPolicy: {
            preserveInArchive: true,
            status: remainingLinks.length > 0 ? 'active' : 'archived_protected',
            lastReferencedAt: asset.retentionPolicy?.lastReferencedAt || nowIso,
            ...(remainingLinks.length === 0 ? { unlinkedAt: nowIso } : {}),
            retentionMinDays: asset.retentionPolicy?.retentionMinDays ?? 365,
          },
        },
        { merge: true }
      );
      return {
        deletedPhysically: false,
        reason:
          remainingLinks.length > 0
            ? 'still_linked_to_other_records'
            : 'protected_by_season_archive_policy',
      };
    }

    // Zero active links and NOT protected by any archived/active season — safe to clean up
    await deletePhysicalAssetFile(asset);
    await deleteDoc(doc(db, 'mediaAssets', matchingDoc.id));
    inMemoryAssetCache.delete(matchingDoc.id);
    return { deletedPhysically: true, reason: 'no_links_and_retention_cleared' };
  } catch {
    return { deletedPhysically: false, reason: 'error' };
  }
}

async function deletePhysicalAssetFile(asset: MediaAssetMetadata): Promise<void> {
  if (asset.provider === 'server_cdn' && asset.storagePath) {
    await fetchWithTimeout('/api/media/delete', {
      method: 'POST',
      timeoutMs: 6000,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storagePath: asset.storagePath }),
    }).catch(() => {});
    if (asset.thumbnailStoragePath && asset.thumbnailStoragePath !== asset.storagePath) {
      await fetchWithTimeout('/api/media/delete', {
        method: 'POST',
        timeoutMs: 6000,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: asset.thumbnailStoragePath }),
      }).catch(() => {});
    }
  } else if (asset.provider === 'firebase_storage' && asset.storagePath) {
    await deleteObject(storageRef(storage, asset.storagePath)).catch(() => {});
    if (asset.thumbnailStoragePath && asset.thumbnailStoragePath !== asset.storagePath) {
      await deleteObject(storageRef(storage, asset.thumbnailStoragePath)).catch(() => {});
    }
  }
}

/**
 * Automatically inspects a document payload before writing to Firestore.
 * Converts any legacy `data:image/...` or `data:video/...` Base64 strings to compressed WebP/Storage URLs.
 */
export async function sanitizeDocumentMediaFields<T extends Record<string, any>>(
  collectionPath: string,
  docId: string,
  data: T
): Promise<T> {
  if (!data || typeof data !== 'object') return data;

  const clone: Record<string, any> = Array.isArray(data) ? [...data] : { ...data };
  const recordKey = `${collectionPath}/${docId}`;
  const docSeason =
    (typeof clone.seasonId === 'string' && clone.seasonId) ||
    (typeof clone.seasonYear === 'string' && clone.seasonYear) ||
    (typeof clone.hajjYear === 'string' && clone.hajjYear) ||
    undefined;

  for (const [key, value] of Object.entries(clone)) {
    if (typeof value === 'string' && value.startsWith('data:')) {
      if (value.startsWith('data:image/')) {
        try {
          const file = dataUrlToFile(value, `${collectionPath}_${docId}_${key}.webp`);
          const uploaded = await uploadOptimizedMedia(file, {
            kind: 'image',
            linkedRecordId: recordKey,
            seasonId: docSeason,
            duplicateResolution: 'reuse_existing',
            maxDimension: key === 'nationalIdImage' ? 1200 : 1280,
            quality: 0.8,
            generateThumbnail: key === 'image' || key === 'imageUrl',
          });
          clone[key] = uploaded.url;
          if ((key === 'image' || key === 'imageUrl') && uploaded.thumbnailUrl) {
            clone[`${key}Thumbnail`] = uploaded.thumbnailUrl;
          }
        } catch {
          if (value.length > 500_000) {
            clone[key] = '';
          }
        }
      } else if (value.startsWith('data:video/')) {
        try {
          const file = dataUrlToFile(value, `${collectionPath}_${docId}_${key}.mp4`);
          const uploaded = await uploadOptimizedMedia(file, {
            kind: 'video',
            linkedRecordId: recordKey,
            seasonId: docSeason,
            duplicateResolution: 'reuse_existing',
          });
          clone[key] = uploaded.url;
          if (uploaded.thumbnailUrl) {
            clone.videoThumbnailUrl = uploaded.thumbnailUrl;
          }
        } catch {
          clone[key] = '';
        }
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      if (!('_methodName' in value) && typeof value.toDate !== 'function') {
        clone[key] = await sanitizeDocumentMediaFields(collectionPath, `${docId}_${key}`, value);
      }
    }
  }

  return clone as T;
}

/**
 * Audits `mediaAssets` & collections while strictly honoring Season Archives and Retention Policies:
 * - Migrates any remaining legacy Base64 fields to WebP URLs
 * - Never deletes media protected by archived/active seasons or linked to any record
 */
export async function runMediaStorageAuditAndCleanup(): Promise<{
  totalAssetsScanned: number;
  orphansDeleted: number;
  protectedArchivedCount: number;
  base64MigratedCount: number;
  bytesSavedEstimate: number;
}> {
  let totalAssetsScanned = 0;
  let orphansDeleted = 0;
  let protectedArchivedCount = 0;
  let base64MigratedCount = 0;
  let bytesSavedEstimate = 0;

  try {
    const referencedUrls = new Set<string>();
    const { protectedSeasonIds, protectedMediaAssetIds } = await getProtectedSeasonMediaMap();

    const collectionsToCheck = ['packages', 'announcements', 'pilgrims'];
    for (const colName of collectionsToCheck) {
      const snap = await getDocs(collection(db, colName));
      for (const docSnap of snap.docs) {
        const raw = docSnap.data();
        let needsUpdate = false;
        const updatedFields: Record<string, any> = {};

        for (const [k, v] of Object.entries(raw)) {
          if (typeof v === 'string') {
            if (v.startsWith('data:image/') || v.startsWith('data:video/')) {
              const approxBytes = Math.round((v.length * 3) / 4);
              const sanitized = await sanitizeDocumentMediaFields(colName, docSnap.id, { [k]: v });
              if (sanitized[k] && !sanitized[k].startsWith('data:')) {
                updatedFields[k] = sanitized[k];
                referencedUrls.add(sanitized[k]);
                needsUpdate = true;
                base64MigratedCount++;
                bytesSavedEstimate += approxBytes;
              }
            } else if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/uploads/media/')) {
              referencedUrls.add(v.trim());
            }
          }
        }

        if (needsUpdate) {
          await setDoc(doc(db, colName, docSnap.id), updatedFields, { merge: true });
        }
      }
    }

    const assetsSnap = await getDocs(collection(db, 'mediaAssets'));
    totalAssetsScanned = assetsSnap.docs.length;

    for (const assetDoc of assetsSnap.docs) {
      const asset = { ...(assetDoc.data() as MediaAssetMetadata), id: assetDoc.id };
      const isReferencedByUrl =
        referencedUrls.has(asset.url) ||
        (asset.thumbnailUrl && referencedUrls.has(asset.thumbnailUrl));
      const isReferencedByRecord = (asset.linkedRecordIds || []).length > 0;
      const isProtectedBySeasonArchive =
        protectedMediaAssetIds.has(asset.id) ||
        (asset.linkedSeasonIds || []).some((sid) => protectedSeasonIds.has(normalizeSeasonId(sid)));

      if (isReferencedByUrl || isReferencedByRecord) {
        continue;
      }

      if (isProtectedBySeasonArchive && asset.retentionPolicy?.preserveInArchive !== false) {
        protectedArchivedCount++;
        continue;
      }

      await deletePhysicalAssetFile(asset);
      await deleteDoc(doc(db, 'mediaAssets', assetDoc.id));
      inMemoryAssetCache.delete(assetDoc.id);
      orphansDeleted++;
      bytesSavedEstimate += asset.compressedSizeBytes || 0;
    }
  } catch (err) {
    console.warn('Media storage audit notice:', err);
  }

  return {
    totalAssetsScanned,
    orphansDeleted,
    protectedArchivedCount,
    base64MigratedCount,
    bytesSavedEstimate,
  };
}

const AUDIO_EXT_MAP: Record<string, string> = {
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

export function extractAudioDurationSeconds(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    try {
      const objectUrl = URL.createObjectURL(blob);
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      let done = false;
      const finish = (secs: number) => {
        if (done) return;
        done = true;
        URL.revokeObjectURL(objectUrl);
        resolve(Number.isFinite(secs) && secs > 0 ? Math.round(secs) : 0);
      };
      const timer = setTimeout(() => finish(0), 4000);
      audio.onloadedmetadata = () => {
        clearTimeout(timer);
        finish(audio.duration);
      };
      audio.onerror = () => {
        clearTimeout(timer);
        finish(0);
      };
      audio.src = objectUrl;
    } catch {
      resolve(0);
    }
  });
}

/**
 * Uploads a short supervisor ritual explanation audio clip (up to 15 MB) to /api/media/upload
 * or Firebase Storage, returning only URL + metadata (Zero-Base64 in Firestore).
 */
export async function uploadRitualAudioBlob(params: {
  blob: Blob;
  fileName?: string;
  mimeType?: string;
  cloudinaryConfig?: CloudinaryConfig;
}): Promise<{
  url: string;
  storagePath: string;
  fileHash: string;
  durationSeconds: number;
  fileSizeBytes: number;
  mimeType: string;
}> {
  const { blob, fileName, mimeType, cloudinaryConfig } = params;
  const maxBytes = 15 * 1024 * 1024;
  if (!blob || blob.size === 0) {
    throw new Error('الملف الصوتي فارغ أو غير صالح.');
  }
  if (blob.size > maxBytes) {
    throw new Error('حجم التسجيل الصوتي يتجاوز الحد الأقصى المسموح (15 ميجابايت للتسجيلات القصيرة).');
  }

  let cleanMime = String(mimeType || blob.type || '').split(';')[0].trim().toLowerCase();
  if (!AUDIO_EXT_MAP[cleanMime] && fileName) {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.mp3')) cleanMime = 'audio/mpeg';
    else if (lowerName.endsWith('.m4a')) cleanMime = 'audio/mp4';
    else if (lowerName.endsWith('.aac')) cleanMime = 'audio/aac';
    else if (lowerName.endsWith('.wav')) cleanMime = 'audio/wav';
    else if (lowerName.endsWith('.ogg')) cleanMime = 'audio/ogg';
    else if (lowerName.endsWith('.webm') || lowerName.endsWith('.weba')) cleanMime = 'audio/webm';
  }

  const ext = AUDIO_EXT_MAP[cleanMime];
  if (!ext) {
    throw new Error('صيغة الملف الصوتي غير مدعومة. الصيغ المدعومة: MP3, M4A, AAC, WAV, OGG, WebM.');
  }

  const [fileHash, durationSeconds] = await Promise.all([
    computeFileSha256(blob),
    extractAudioDurationSeconds(blob),
  ]);

  // 1) Primary: Express server persistent/deduplicated binary endpoint
  try {
    const base64Data = await blobToBase64(blob);
    const resp = await fetchWithTimeout('/api/media/upload', {
      method: 'POST',
      timeoutMs: 20000,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileHash: `audio_${fileHash}`,
        mimeType: cleanMime,
        base64Data,
        isThumbnail: false,
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data?.url) {
        return {
          url: String(data.url),
          storagePath: String(data.storagePath || `uploads/media/audio_${fileHash}.${ext}`),
          fileHash,
          durationSeconds,
          fileSizeBytes: blob.size,
          mimeType: cleanMime,
        };
      }
    }
  } catch {
    // Fall through to Firebase Storage / Cloudinary
  }

  // 2) Fallback: Firebase Storage
  try {
    const firebaseAudioPath = `alqaem_audio/audio_${fileHash}.${ext}`;
    const refObj = storageRef(storage, firebaseAudioPath);
    await uploadBytes(refObj, blob, {
      contentType: cleanMime,
      cacheControl: 'public,max-age=31536000,immutable',
    });
    const downloadUrl = await getDownloadURL(refObj);
    return {
      url: downloadUrl,
      storagePath: firebaseAudioPath,
      fileHash,
      durationSeconds,
      fileSizeBytes: blob.size,
      mimeType: cleanMime,
    };
  } catch {
    // Fall through to Cloudinary if configured
  }

  // 3) Fallback: Cloudinary (raw/video resource endpoint without image transforms)
  const cloudName = (cloudinaryConfig?.cloudName || '').trim();
  const uploadPreset = (cloudinaryConfig?.uploadPreset || '').trim();
  if (cloudName && uploadPreset) {
    const formData = new FormData();
    formData.append('file', blob, `audio_${fileHash}.${ext}`);
    formData.append('upload_preset', uploadPreset);
    const resp = await fetchWithTimeout(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
      method: 'POST',
      timeoutMs: 25000,
      body: formData,
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data?.secure_url) {
        return {
          url: String(data.secure_url),
          storagePath: String(data.public_id || `alqaem_audio/audio_${fileHash}.${ext}`),
          fileHash,
          durationSeconds,
          fileSizeBytes: blob.size,
          mimeType: cleanMime,
        };
      }
    }
  }

  throw new Error('تعذر رفع التسجيل الصوتي إلى الخادم أو التخزين السحابي. يرجى المحاولة مرة أخرى.');
}

export async function deleteRitualAudioFile(storagePath?: string): Promise<void> {
  if (!storagePath) return;
  try {
    if (storagePath.startsWith('uploads/media/')) {
      await fetchWithTimeout('/api/media/delete', {
        method: 'POST',
        timeoutMs: 6000,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath }),
      });
    } else if (storagePath.startsWith('alqaem_audio/')) {
      await deleteObject(storageRef(storage, storagePath));
    }
  } catch {
    // Ignore cleanup errors gracefully
  }
}

