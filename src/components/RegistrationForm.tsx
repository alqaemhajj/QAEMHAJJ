import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Pilgrim, HajjPackage, CampaignSettings } from '../types';
import { CheckCircle2, AlertCircle, User, CreditCard, Bus, Package, Trash2, ShieldCheck, Camera, ScanLine, Download, RefreshCw, Sparkles, X, Lock, Users, Clock, Plus, Hotel, Building2, UploadCloud } from 'lucide-react';
import {
  ScannedIdCardData,
  scanSaudiIdCardHybrid,
  normalizeDigitsOnly,
  normalizeDateStr,
} from '../utils/idCardOcr';
import { getDocument } from '../lib/db';
import { uploadOptimizedMedia, dataUrlToFile } from '../lib/mediaManager';
import { extractHijriYear, normalizeSeasonId } from '../lib/seasons';
import { evaluatePackageStatus, formatRegistrationDeadlineAr } from '../utils/packageStatus';
import { DualCalendarDatePicker } from './common/DualCalendarDatePicker';
import { resolveDualDates } from '../utils/dualCalendar';
import { defaultCampaignSettings } from '../data/initialData';
import { DynamicFormTemplate } from '../types/dynamicForms';
import { DynamicFormRenderer } from './forms/DynamicFormRenderer';

// Helper for ID card image compression
const compressIdCardImage = (file: File, maxDim = 1600, quality = 0.85): Promise<{ dataUrl: string; sizeKb: number }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Failed to create canvas context'));
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const approxBytes = Math.round((dataUrl.length * 3) / 4);
        const sizeKb = Math.round(approxBytes / 1024);
        resolve({ dataUrl, sizeKb });
      };
      img.onerror = (err) => reject(err);
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};


interface RegistrationFormProps {
  onAddPilgrim: (pilgrim: Pilgrim) => void;
  onSuccessNavigate: () => void;
  selectedPackage?: string;
  onSelectPackage?: (pkgTitle: string) => void;
  onNavigateToPackages?: () => void;
  packages: HajjPackage[];
  campaignSettings: CampaignSettings;
  pilgrims?: Pilgrim[];
  dynamicForms?: DynamicFormTemplate[];
}

export const RegistrationForm: React.FC<RegistrationFormProps> = ({
  onAddPilgrim,
  onSuccessNavigate,
  selectedPackage = '',
  onSelectPackage,
  onNavigateToPackages,
  packages,
  campaignSettings,
  pilgrims = [],
  dynamicForms = []
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const activeSeasonYearStr = extractHijriYear(
    campaignSettings?.pilgrimStatsConfig?.activeSeasonYear ||
      campaignSettings?.siteTexts?.cardSeasonBadge ||
      '1448'
  );
  const activeSeasonNum = parseInt(activeSeasonYearStr, 10) || 1448;

  const hijriLastHajjYears = useMemo(
    () => Array.from({ length: 40 }, (_, idx) => String(activeSeasonNum - 1 - idx)),
    [activeSeasonNum]
  );

  const approvedBanksList = useMemo(() => {
    const source =
      campaignSettings?.approvedBanks && campaignSettings.approvedBanks.length > 0
        ? campaignSettings.approvedBanks
        : defaultCampaignSettings.approvedBanks || [];
    return source.filter((b) => b.isActive && b.name.trim());
  }, [campaignSettings?.approvedBanks]);

  const marjiOptions = useMemo(() => {
    const base = (campaignSettings?.marjiList || []).map((m) => m.trim()).filter(Boolean);
    if (!base.some((m) => m === 'مرجع آخر' || m.includes('مرجع آخر'))) {
      base.push('مرجع آخر');
    }
    return base;
  }, [campaignSettings?.marjiList]);

  const [step, setStep] = useState(1);
  const [customMarjiText, setCustomMarjiText] = useState('');
  const [formData, setFormData] = useState<any>({
    createdAt: todayStr,
    termsAccepted: 'نعم',
    firstName: '',
    secondName: '',
    thirdName: '',
    lastName: '',
    englishFullName: '',
    gender: 'ذكر',
    nationality: 'سعودي',
    nationalId: '',
    idIssueDate: '',
    idIssueDateHijri: '',
    idExpiryDate: '',
    idExpiryDateHijri: '',
    birthDate: '',
    birthDateHijri: '',
    mobile: '',
    whatsapp: '',
    email: '',
    bankAccountName: '',
    iban: '',
    bankName: approvedBanksList[0]?.name || 'بنك الرياض',
    transport: selectedPackage?.includes('طيران') ? 'طائرة' : 'باص',
    hajjType: 'تمتع',
    lastHajjYear: '',
    currentMarji: marjiOptions[0] || 'السيد السيستاني (دام ظله)',
    previousMarji: '',
    madinahPrivateRoomRequested: false,
    madinahPrivateRoomNote: '',
    mobilityIndependence: 'نعم',
    selectedPackage: selectedPackage || '',
    healthConditions: [],
    otherHealthCondition: '',
    hasBackPain: false,
    needsAssistance: false,
    isPregnant: false,
    hasSpeechDifficulty: false,
    hasMahram: false,
    mahramDetails: []
  });

  useEffect(() => {
    if (approvedBanksList.length > 0) {
      setFormData((prev: any) => {
        const stillValid = approvedBanksList.some((b) => b.name === prev.bankName);
        if (stillValid) return prev;
        return { ...prev, bankName: approvedBanksList[0].name };
      });
    }
  }, [approvedBanksList]);

  useEffect(() => {
    if (selectedPackage) {
      const isAir = selectedPackage.includes('طيران');
      setFormData((prev: any) => ({
        ...prev,
        selectedPackage,
        transport: isAir ? 'طائرة' : 'باص',
      }));
    }
  }, [selectedPackage]);

  const [nationalIdImage, setNationalIdImage] = useState<string>('');
  const [idImageSizeKb, setIdImageSizeKb] = useState<number>(0);
  const [isCompressingIdImage, setIsCompressingIdImage] = useState<boolean>(false);
  const [idImageError, setIdImageError] = useState<string>('');
  const [isScanningIdCard, setIsScanningIdCard] = useState<boolean>(false);
  const [ocrStatusText, setOcrStatusText] = useState<string>('');
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [scannedIdCard, setScannedIdCard] = useState<ScannedIdCardData | null>(null);
  const [cardSavedToast, setCardSavedToast] = useState<boolean>(false);
  const [supervisorOverride, setSupervisorOverride] = useState<boolean>(false);

  // Live Camera Scanner state
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [isCameraStreamActive, setIsCameraStreamActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

  const [submittedPilgrim, setSubmittedPilgrim] = useState<Pilgrim | null>(null);
  const [error, setError] = useState('');

  // Convert Arabic/Persian digits to English digits and keep only numbers
  const normalizeDigits = (val: string): string => normalizeDigitsOnly(val);

  // Normalize Arabic text for accurate name comparison
  const normalizeArabicName = (val: string): string => {
    return (val || '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[ًٌٍَُِّْ]/g, '')
      .replace(/\b(بن|بنت|ابن)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Stop camera stream when modal closes or component unmounts
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraStreamActive(false);
    setIsCameraOpen(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const openCameraScanner = async () => {
    setIdImageError('');
    setIsCameraOpen(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsCameraStreamActive(false);
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }
      streamRef.current = stream;
      setIsCameraStreamActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      streamRef.current = null;
      setIsCameraStreamActive(false);
    }
  };

  const captureFromCamera = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;

    // Crop directly to the ID card scanner guide window (central 86% width, ID-1 card aspect ratio 1.58:1)
    const cropW = Math.round(vw * 0.86);
    const cropH = Math.min(vh, Math.round(cropW / 1.58));
    const sx = Math.round((vw - cropW) / 2);
    const sy = Math.round((vh - cropH) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Optical scanner enhancement filter
    ctx.filter = 'contrast(1.14) brightness(1.03)';
    ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    const approxBytes = Math.round((dataUrl.length * 3) / 4);
    const sizeKb = Math.round(approxBytes / 1024);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraStreamActive(false);
    setIsCameraOpen(false);
    setNationalIdImage(dataUrl);
    setIdImageSizeKb(sizeKb);
    await scanIdCardWithAI(dataUrl);
  };

  const handleSaveIdCardToDevice = () => {
    if (!nationalIdImage) return;
    const link = document.createElement('a');
    link.href = nationalIdImage;
    const fileId = formData.nationalId || scannedIdCard?.nationalId || 'pilgrim';
    link.download = `بطاقة-الهوية-${fileId}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setCardSavedToast(true);
    setTimeout(() => setCardSavedToast(false), 3500);
  };

  // Run Hybrid OCR scan (AI Vision API + Tesseract.js local OCR fallback) + automatic optical document cropping
  const scanIdCardWithAI = async (imageDataUrl: string) => {
    setIsScanningIdCard(true);
    setIdImageError('');
    setOcrProgress(10);
    setOcrStatusText('جاري تجهيز الماسح الضوئي وتحليل البطاقة...');
    try {
      const { scannedData, croppedImage } = await scanSaudiIdCardHybrid(
        imageDataUrl,
        (statusMsg, pct) => {
          setOcrStatusText(statusMsg);
          if (typeof pct === 'number') setOcrProgress(pct);
        }
      );

      setNationalIdImage(croppedImage.dataUrl);
      setIdImageSizeKb(croppedImage.sizeKb);

      if (!scannedData.isValidIdCard && !scannedData.nationalId && !scannedData.firstName) {
        setIdImageError('لم يتم العثور على نصوص واضحة في البطاقة. يرجى التأكد من إضاءة البطاقة أو الضغط على إعادة المسح الضوئي.');
        return;
      }

      setScannedIdCard(scannedData);

      // Automatically populate all extracted fields into their dedicated form inputs (syncing both Hijri & Gregorian calendars)
      setFormData((prev: any) => {
        const birthDual = scannedData.birthDate ? resolveDualDates(scannedData.birthDate) : null;
        const issueDual = scannedData.idIssueDate ? resolveDualDates(scannedData.idIssueDate) : null;
        const expiryDual = scannedData.idExpiryDate ? resolveDualDates(scannedData.idExpiryDate) : null;
        return {
          ...prev,
          firstName: scannedData.firstName || prev.firstName,
          secondName: scannedData.secondName || prev.secondName,
          thirdName: scannedData.thirdName || prev.thirdName,
          lastName: scannedData.lastName || prev.lastName,
          englishFullName: scannedData.englishFullName || prev.englishFullName,
          nationalId: scannedData.nationalId || prev.nationalId,
          birthDate: birthDual ? (birthDual.gregorian || birthDual.hijri || prev.birthDate) : prev.birthDate,
          birthDateHijri: birthDual ? (birthDual.hijri || prev.birthDateHijri) : prev.birthDateHijri,
          idIssueDate: issueDual ? (issueDual.gregorian || issueDual.hijri || prev.idIssueDate) : prev.idIssueDate,
          idIssueDateHijri: issueDual ? (issueDual.hijri || prev.idIssueDateHijri) : prev.idIssueDateHijri,
          idExpiryDate: expiryDual ? (expiryDual.gregorian || expiryDual.hijri || prev.idExpiryDate) : prev.idExpiryDate,
          idExpiryDateHijri: expiryDual ? (expiryDual.hijri || prev.idExpiryDateHijri) : prev.idExpiryDateHijri,
          gender: scannedData.gender || prev.gender,
          nationality: scannedData.nationality || prev.nationality
        };
      });
    } catch {
      setIdImageError('تعذر إتمام المسح الضوئي التلقائي للصورة. يرجى التأكد من وضوح البطاقة أو الضغط على إعادة المسح الضوئي.');
    } finally {
      setIsScanningIdCard(false);
    }
  };

  // Sync all form fields directly from the scanned ID card
  const syncFormWithScannedCard = () => {
    if (!scannedIdCard) return;
    setError('');
    setFormData((prev: any) => {
      const birthDual = scannedIdCard.birthDate ? resolveDualDates(scannedIdCard.birthDate) : null;
      const issueDual = scannedIdCard.idIssueDate ? resolveDualDates(scannedIdCard.idIssueDate) : null;
      const expiryDual = scannedIdCard.idExpiryDate ? resolveDualDates(scannedIdCard.idExpiryDate) : null;
      return {
        ...prev,
        firstName: scannedIdCard.firstName || prev.firstName,
        secondName: scannedIdCard.secondName || prev.secondName,
        thirdName: scannedIdCard.thirdName || prev.thirdName,
        lastName: scannedIdCard.lastName || prev.lastName,
        englishFullName: scannedIdCard.englishFullName || prev.englishFullName,
        nationalId: scannedIdCard.nationalId || prev.nationalId,
        birthDate: birthDual ? (birthDual.gregorian || birthDual.hijri || prev.birthDate) : prev.birthDate,
        birthDateHijri: birthDual ? (birthDual.hijri || prev.birthDateHijri) : prev.birthDateHijri,
        idIssueDate: issueDual ? (issueDual.gregorian || issueDual.hijri || prev.idIssueDate) : prev.idIssueDate,
        idIssueDateHijri: issueDual ? (issueDual.hijri || prev.idIssueDateHijri) : prev.idIssueDateHijri,
        idExpiryDate: expiryDual ? (expiryDual.gregorian || expiryDual.hijri || prev.idExpiryDate) : prev.idExpiryDate,
        idExpiryDateHijri: expiryDual ? (expiryDual.hijri || prev.idExpiryDateHijri) : prev.idExpiryDateHijri,
        gender: scannedIdCard.gender || prev.gender,
        nationality: scannedIdCard.nationality || prev.nationality
      };
    });
  };

  // Compare scanned card date against either Gregorian or Umm al-Qura Hijri representation in formData
  const isDualDateMatched = (scannedVal: string | undefined, primaryVal: string, hijriVal?: string): boolean => {
    if (!scannedVal) return true;
    const normScanned = normalizeDateStr(scannedVal);
    if (!normScanned) return true;
    if (!primaryVal && !hijriVal) return false;
    const resolvedForm = resolveDualDates(primaryVal, hijriVal);
    const resolvedScanned = resolveDualDates(scannedVal);
    const formCandidates = [
      normalizeDateStr(primaryVal),
      normalizeDateStr(hijriVal || ''),
      normalizeDateStr(resolvedForm.gregorian),
      normalizeDateStr(resolvedForm.hijri),
    ].filter(Boolean);
    const scannedCandidates = [
      normScanned,
      normalizeDateStr(resolvedScanned.gregorian),
      normalizeDateStr(resolvedScanned.hijri),
    ].filter(Boolean);
    return formCandidates.some((fc) => scannedCandidates.includes(fc));
  };

  // Audit comparison between formData and scannedIdCard
  const getCardVerificationAudit = () => {
    if (!scannedIdCard || !scannedIdCard.nationalId) {
      return null;
    }

    const idMatched =
      formData.nationalId.trim().length === 10 &&
      formData.nationalId.trim() === scannedIdCard.nationalId.trim();

    const firstMatched =
      !scannedIdCard.firstName ||
      normalizeArabicName(formData.firstName) === normalizeArabicName(scannedIdCard.firstName);
    const secondMatched =
      !scannedIdCard.secondName ||
      normalizeArabicName(formData.secondName) === normalizeArabicName(scannedIdCard.secondName);
    const thirdMatched =
      !scannedIdCard.thirdName ||
      normalizeArabicName(formData.thirdName) === normalizeArabicName(scannedIdCard.thirdName);
    const lastMatched =
      !scannedIdCard.lastName ||
      normalizeArabicName(formData.lastName) === normalizeArabicName(scannedIdCard.lastName);

    const nameMatched =
      Boolean(formData.firstName.trim() && formData.secondName.trim() && formData.thirdName.trim() && formData.lastName.trim()) &&
      firstMatched &&
      secondMatched &&
      thirdMatched &&
      lastMatched;

    const expiryMatched = isDualDateMatched(
      scannedIdCard.idExpiryDate,
      formData.idExpiryDate,
      formData.idExpiryDateHijri
    );

    const birthMatched = isDualDateMatched(
      scannedIdCard.birthDate,
      formData.birthDate,
      formData.birthDateHijri
    );

    const issueMatched =
      !scannedIdCard.idIssueDate ||
      !formData.idIssueDate.trim() ||
      isDualDateMatched(scannedIdCard.idIssueDate, formData.idIssueDate, formData.idIssueDateHijri);

    const originalMatched = idMatched && nameMatched && expiryMatched && birthMatched;
    const isManualOverrideApproved = supervisorOverride;
    const allMatched = originalMatched || isManualOverrideApproved;

    return {
      idMatched: idMatched || isManualOverrideApproved,
      nameMatched: nameMatched || isManualOverrideApproved,
      expiryMatched: expiryMatched || isManualOverrideApproved,
      birthMatched: birthMatched || isManualOverrideApproved,
      issueMatched,
      allMatched,
      originalMatched,
      isManualOverrideApproved,
      cardFullName: `${scannedIdCard.firstName} ${scannedIdCard.secondName} ${scannedIdCard.thirdName} ${scannedIdCard.lastName}`.trim(),
      formFullName: `${formData.firstName} ${formData.secondName} ${formData.thirdName} ${formData.lastName}`.trim()
    };
  };

  const cardAudit = getCardVerificationAudit();

  // Official Saudi National ID / Iqama 10-digit validation + Card Cross-Check
  const getNationalIdValidation = (rawId: string) => {
    const id = (rawId || '').trim();
    if (!id) {
      return {
        isValid: false,
        status: 'idle' as const,
        typeLabel: '',
        message: 'يتكون رقم الهوية من 10 أرقام (يبدأ بـ 1 للهوية الوطنية أو 2 للإقامة)'
      };
    }

    if (!/^[12]/.test(id)) {
      return {
        isValid: false,
        status: 'error' as const,
        typeLabel: 'بداية غير صحيحة',
        message: 'خطأ في الإدخال: يجب أن يبدأ رقم الهوية بالرقم (1) للسعوديين أو (2) للمقيمين'
      };
    }

    const typeLabel = id.startsWith('1') ? 'بطاقة أحوال / هوية وطنية' : 'هوية مقيم (إقامة)';

    if (id.length < 10) {
      return {
        isValid: false,
        status: 'typing' as const,
        typeLabel,
        message: `جاري التحقق... تم إدخال (${id.length} من 10 أرقام) — متبقي ${10 - id.length} أرقام`
      };
    }

    if (/^(\d)\1{9}$/.test(id)) {
      return {
        isValid: false,
        status: 'error' as const,
        typeLabel,
        message: 'خطأ: رقم الهوية المدخل غير صحيح (أرقام مكررة غير صالحة)'
      };
    }

    // Check if already registered in active pilgrims for CURRENT season (1448)
    const currentSeason = '1448';
    const isDuplicateThisSeason = pilgrims.some(
      (p) =>
        p.nationalId === id &&
        (p.hajjYear === currentSeason || (p.season && p.season.includes(currentSeason)) || (!p.hajjYear && !p.season)) &&
        p.status !== 'محذوف' &&
        !p.isDeleted
    );
    if (isDuplicateThisSeason) {
      return {
        isValid: false,
        status: 'error' as const,
        typeLabel,
        message: 'تنبيه: رقم الهوية هذا مسجل مسبقاً في موسم حج 1448هـ'
      };
    }

    // Cross-check against attached scanned ID card if available!
    if (scannedIdCard?.nationalId && scannedIdCard.nationalId.length === 10 && id !== scannedIdCard.nationalId) {
      return {
        isValid: false,
        status: 'error' as const,
        typeLabel,
        message: `✗ خطأ عدم تطابق: الرقم المدخل (${id}) لا يطابق رقم البطاقة المرفقة (${scannedIdCard.nationalId})!`
      };
    }

    // Official Modulo-10 Checksum for Saudi National ID / Iqama
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0) {
        const doubled = String(Number(id[i]) * 2).padStart(2, '0');
        sum += Number(doubled[0]) + Number(doubled[1]);
      } else {
        sum += Number(id[i]);
      }
    }
    const isChecksumExact = sum % 10 === 0;

    if (scannedIdCard?.nationalId && id === scannedIdCard.nationalId) {
      return {
        isValid: true,
        isChecksumExact: true,
        status: 'valid' as const,
        typeLabel,
        message: `✓ رقم ${typeLabel} صحيح ومطابق تماماً للبطاقة المرفقة (${id})`
      };
    }

    if (isChecksumExact) {
      return {
        isValid: true,
        isChecksumExact: true,
        status: 'valid' as const,
        typeLabel,
        message: `✓ رقم ${typeLabel} مكون من 10 أرقام — يرجى إرفاق ومسح البطاقة أدناه لمطابقة الاسم والتواريخ`
      };
    }

    return {
      isValid: false,
      isChecksumExact: false,
      status: 'error' as const,
      typeLabel,
      message: '✗ رقم الهوية المدخل غير صحيح (لا يطابق معادلة السجل المدني) — يرجى عمل مسح ضوئي للبطاقة أدناه لتصحيحه تلقائياً'
    };
  };

  const nationalIdValidation = getNationalIdValidation(formData.nationalId);

  const visiblePackages = useMemo(
    () => packages.filter((pkg) => pkg.showOnHomepage !== false),
    [packages]
  );

  const availablePackages = useMemo(
    () =>
      visiblePackages.filter(
        (pkg) => !evaluatePackageStatus(pkg, pilgrims).isClosedForVisitors
      ),
    [visiblePackages, pilgrims]
  );

  useEffect(() => {
    if (selectedPackage) {
      const matched = packages.find((p) => p.title === selectedPackage);
      if (matched) {
        const status = evaluatePackageStatus(matched, pilgrims);
        if (status.isClosedForVisitors) {
          setError(
            `عذراً، الباقة المختارة (${matched.title}) غير متاحة للتسجيل حالياً (${
              status.publicBadgeText || 'مغلقة'
            }). يرجى اختيار باقة متاحة.`
          );
          if (onSelectPackage) onSelectPackage('');
          setFormData((prev: any) => ({
            ...prev,
            selectedPackage: '',
          }));
          return;
        }
      }
      setFormData((prev: any) => ({
        ...prev,
        selectedPackage,
        transport: selectedPackage.includes('طيران') ? 'طائرة' : prev.transport
      }));
    }
  }, [selectedPackage, packages, pilgrims]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (error) setError('');
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev: any) => ({ ...prev, [name]: checked }));
    } else if (name === 'nationalId') {
      const cleanId = normalizeDigits(value).slice(0, 10);
      setFormData((prev: any) => ({ ...prev, nationalId: cleanId }));
    } else if (name === 'mobile' || name === 'whatsapp') {
      const cleanPhone = normalizeDigits(value).slice(0, 10);
      setFormData((prev: any) => ({ ...prev, [name]: cleanPhone }));
    } else if (name === 'birthDate' || name === 'idIssueDate' || name === 'idExpiryDate') {
      const cleanDate = value
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
      setFormData((prev: any) => ({ ...prev, [name]: cleanDate }));
    } else if (name === 'transport') {
      const isChoosingAir = value === 'طائرة';
      setFormData((prev: any) => {
        const currentPkg = (prev.selectedPackage || '').trim();
        let nextPkg = currentPkg;
        if (isChoosingAir && currentPkg && !currentPkg.includes('طيران')) {
          const airPkg = availablePackages.find(p => p.title.includes('طيران') || p.transport === 'طائرة');
          nextPkg = airPkg ? airPkg.title : '';
        } else if (!isChoosingAir && currentPkg.includes('طيران')) {
          const busPkg = availablePackages.find(p => !p.title.includes('طيران') && p.transport !== 'طائرة');
          nextPkg = busPkg ? busPkg.title : '';
        }
        if (onSelectPackage && nextPkg !== currentPkg) {
          onSelectPackage(nextPkg);
        }
        return {
          ...prev,
          transport: value,
          selectedPackage: nextPkg,
        };
      });
    } else {
      setFormData((prev: any) => ({ ...prev, [name]: value }));
    }
  };

  const handleIdImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setIdImageError('يرجى اختيار ملف صورة صحيح لبطاقة الأحوال (JPG, PNG, WEBP).');
      return;
    }
    setIdImageError('');
    setIsCompressingIdImage(true);
    try {
      // High resolution (1600px, 0.85 quality) for accurate optical scanning & card cropping
      const { dataUrl, sizeKb } = await compressIdCardImage(file, 1600, 0.85);
      setNationalIdImage(dataUrl);
      setIdImageSizeKb(sizeKb);
      setIsCompressingIdImage(false);
      await scanIdCardWithAI(dataUrl);
      setIsCameraOpen(false);
    } catch (err) {
      setIdImageError('حدث خطأ أثناء معالجة صورة بطاقة الأحوال. يرجى تجربة صورة أخرى.');
      setIsCompressingIdImage(false);
    }
  };

  const validateSelectedPackageAvailability = (): boolean => {
    if (visiblePackages.length > 0 && availablePackages.length === 0) {
      setError('عذراً، جميع الباقات المتاحة مغلقة حالياً لاكتمال العدد أو انتهاء وقت التسجيل.');
      return false;
    }
    const chosenTitle = (formData.selectedPackage || '').trim();
    if (chosenTitle) {
      const matched = packages.find((p) => p.title === chosenTitle);
      if (matched) {
        const status = evaluatePackageStatus(matched, pilgrims);
        if (status.isClosedForVisitors) {
          setError(
            `عذراً، الباقة المختارة (${matched.title}) مغلقة حالياً (${
              status.publicBadgeText || 'غير متاحة'
            }). يرجى اختيار باقة أخرى متاحة.`
          );
          return false;
        }
      }
    }
    return true;
  };

  const validateStep4Fields = (): boolean => {
    const isOtherMarji =
      formData.currentMarji === 'مرجع آخر' || (formData.currentMarji || '').includes('مرجع آخر');
    if (isOtherMarji && !customMarjiText.trim()) {
      setError('يرجى كتابة اسم مرجع التقليد الآخر في الحقل المخصص قبل المتابعة.');
      return false;
    }
    if (formData.hasMahram) {
      const companions = (formData.mahramDetails || []) as {
        name?: string;
        nationalId?: string;
        relation?: string;
      }[];
      if (companions.length === 0) {
        setError('يرجى إضافة بيانات مرافق واحد على الأقل أو إلغاء تحديد خيار وجود مرافقين.');
        return false;
      }
      for (let i = 0; i < companions.length; i++) {
        const comp = companions[i] || {};
        if (!comp.name?.trim()) {
          setError(`يرجى إدخال الاسم الكامل للمرافق رقم (${i + 1}).`);
          return false;
        }
        const cleanCompId = normalizeDigits(comp.nationalId || '');
        if (cleanCompId.length !== 10) {
          setError(`يرجى إدخال رقم الهوية / البطاقة الصحيح (10 أرقام) للمرافق رقم (${i + 1}).`);
          return false;
        }
        if (!comp.relation?.trim()) {
          setError(`يرجى إدخال صلة القرابة للمرافق رقم (${i + 1}).`);
          return false;
        }
      }
    }
    return true;
  };

  const handleNextStep = () => {
    setError('');
    if (!validateSelectedPackageAvailability()) {
      return;
    }
    if (step === 1) {
      if (formData.termsAccepted !== 'نعم') {
        setError('يرجى الموافقة على شروط الالتحاق للمتابعة.');
        return;
      }
    } else if (step === 2) {
      if (!nationalIdImage) {
        setError('يرجى إرفاق أو عمل مسح ضوئي لبطاقة الأحوال / الهوية الوطنية لتدقيق ومطابقة البيانات قبل الانتقال للخطوة التالية.');
        return;
      }
      if (isScanningIdCard) {
        setError('جاري إتمام المسح الضوئي وتدقيق بيانات البطاقة المرفقة، يرجى الانتظار لحظات...');
        return;
      }
      if (!formData.firstName.trim() || !formData.secondName.trim() || !formData.thirdName.trim() || !formData.lastName.trim()) {
        setError('يرجى إدخال الاسم الرباعي كاملاً (الاسم الأول، الأب، الجد، العائلة).');
        return;
      }
      if (!nationalIdValidation.isValid) {
        setError(nationalIdValidation.message || 'يرجى التأكد من صحة ومطابقة رقم بطاقة الهوية الوطنية (10 أرقام).');
        return;
      }
      if (!formData.idIssueDate.trim() || !formData.idExpiryDate.trim() || !formData.birthDate.trim()) {
        setError('يرجى تحديد تاريخ الإصدار وتاريخ الانتهاء وتاريخ الميلاد بالهجري (أم القرى) أو الميلادي.');
        return;
      }
      if (cardAudit && !cardAudit.allMatched) {
        const mismatches: string[] = [];
        if (!cardAudit.idMatched) mismatches.push(`رقم الهوية (في البطاقة: ${scannedIdCard?.nationalId})`);
        if (!cardAudit.nameMatched) mismatches.push(`الاسم الرباعي (في البطاقة: ${cardAudit.cardFullName})`);
        if (!cardAudit.expiryMatched) mismatches.push(`تاريخ الانتهاء (في البطاقة: ${scannedIdCard?.idExpiryDate})`);
        if (!cardAudit.birthMatched) mismatches.push(`تاريخ الميلاد (في البطاقة: ${scannedIdCard?.birthDate})`);
        setError(`تنبيه: قراءة الماسح الضوئي تختلف عن المدخلات في: ${mismatches.join(' ، ')}. يرجى تفعيل "خيار صحة المعلومات واعتماد تصحيح المشرف" أدناه لتأكيد صحة البيانات ومتابعة التسجيل فوراً.`);
        return;
      }
      if (!formData.mobile || formData.mobile.length < 10) {
        setError('يرجى إدخال رقم جوال صحيح مكون من 10 أرقام.');
        return;
      }
    } else if (step === 4) {
      if (!validateStep4Fields()) {
        return;
      }
    }
    setStep((prev) => Math.min(5, prev + 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateSelectedPackageAvailability()) {
      return;
    }

    // Final Validation
    if (!nationalIdValidation.isValid) {
      setError('رقم بطاقة الهوية الوطنية غير مكتمل أو غير مطابق للبطاقة المرفقة.');
      setStep(2);
      return;
    }
    if (cardAudit && !cardAudit.allMatched) {
      setError('يرجى مطابقة جميع البيانات مع بطاقة الأحوال أو تفعيل خيار صحة المعلومات واعتماد تصحيح المشرف قبل الإرسال.');
      setStep(2);
      return;
    }
    if (!formData.firstName || !formData.lastName || !formData.mobile) {
      setError('يرجى تعبئة كافة الحقول الأساسية المطلوبة.');
      setStep(2);
      return;
    }
    if (!validateStep4Fields()) {
      setStep(4);
      return;
    }
    if (!formData.bankAccountName?.trim() || !formData.bankName?.trim()) {
      setError('يرجى إدخال اسم صاحب الحساب واختيار البنك المعتمد من القائمة.');
      return;
    }
    const cleanIban = (formData.iban || '').replace(/\s+/g, '').toUpperCase();
    if (!cleanIban.startsWith('SA') || cleanIban.length !== 24) {
      setError('يرجى إدخال رقم آيبان (IBAN) صحيح يبدأ بـ SA ويتكون من 24 خانة (مثال: SA0335000000012345678901).');
      return;
    }

    const currentSeason = extractHijriYear(
      campaignSettings?.pilgrimStatsConfig?.activeSeasonYear ||
        campaignSettings?.siteTexts?.cardSeasonBadge ||
        '1448'
    );
    const currentSeasonId = normalizeSeasonId(currentSeason);
    const currentSeasonLabel = `حج ${currentSeason}هـ`;
    try {
      // Secure duplicate check for the CURRENT SEASON ONLY (allows re-registering across different years)
      const seasonalDocId = `${formData.nationalId.trim()}_${currentSeason}`;
      let existingRecord = await getDocument<Pilgrim>('pilgrims', seasonalDocId);
      if (!existingRecord) {
        // Also check legacy record with raw nationalId
        const legacy = await getDocument<Pilgrim>('pilgrims', formData.nationalId.trim());
        if (legacy && (legacy.hajjYear === currentSeason || legacy.season?.includes(currentSeason) || !legacy.hajjYear)) {
          existingRecord = legacy;
        }
      }
      if (existingRecord && existingRecord.status !== 'محذوف' && !existingRecord.isDeleted) {
        setError(`تنبيه: رقم الهوية الوطنية هذا مسجل مسبقاً في موسم حج ${currentSeason}هـ الحالي. يمكنك متابعة حالة طلبك عبر بوابة الاستعلام برقم الهوية والرقم المرجعي.`);
        setStep(2);
        return;
      }
    } catch {
      // Continue if offline or on error
    }

    const seqNum = 1001 + (pilgrims.length || Math.floor((Date.now() % 9000)));
    const isAirPackage =
      (formData.selectedPackage || '').includes('طيران') || formData.transport === 'طائرة';
    const pilgrimId = `${formData.nationalId.trim()}_${currentSeason}`;

    // Upload ID Card to Storage (WebP + Season-Aware SHA-256 Deduplication)
    let finalIdImageUrl = nationalIdImage;
    if (nationalIdImage && nationalIdImage.startsWith('data:image/')) {
      try {
        const uploadedId = await uploadOptimizedMedia(
          dataUrlToFile(nationalIdImage, `id_${pilgrimId}.webp`),
          {
            kind: 'image',
            linkedRecordId: `pilgrims/${pilgrimId}`,
            seasonId: currentSeasonId,
            seasonName: currentSeasonLabel,
            duplicateResolution: 'reuse_existing',
            maxDimension: 1200,
            quality: 0.82,
            generateThumbnail: false,
          }
        );
        finalIdImageUrl = uploadedId.url;
      } catch {
        // Fallback handled inside db.ts sanitization
      }
    }

    const isOtherMarji =
      formData.currentMarji === 'مرجع آخر' || (formData.currentMarji || '').includes('مرجع آخر');
    const finalCurrentMarji = isOtherMarji ? customMarjiText.trim() : formData.currentMarji;

    const cleanedCompanions = formData.hasMahram
      ? ((formData.mahramDetails || []) as { name?: string; nationalId?: string; relation?: string }[])
          .slice(0, 10)
          .map((m) => ({
            name: (m.name || '').trim(),
            nationalId: normalizeDigits(m.nationalId || ''),
            relation: (m.relation || '').trim(),
          }))
          .filter((m) => m.name || m.nationalId || m.relation)
      : [];

    const issueDual = resolveDualDates(formData.idIssueDate, formData.idIssueDateHijri);
    const expiryDual = resolveDualDates(formData.idExpiryDate, formData.idExpiryDateHijri);
    const birthDual = resolveDualDates(formData.birthDate, formData.birthDateHijri);

    const newPilgrim: Pilgrim = {
      ...formData,
      iban: (formData.iban || '').replace(/\s+/g, '').toUpperCase(),
      idIssueDate: issueDual.gregorian || formData.idIssueDate,
      idIssueDateHijri: issueDual.hijri || formData.idIssueDateHijri || '',
      idExpiryDate: expiryDual.gregorian || formData.idExpiryDate,
      idExpiryDateHijri: expiryDual.hijri || formData.idExpiryDateHijri || '',
      birthDate: birthDual.gregorian || formData.birthDate,
      birthDateHijri: birthDual.hijri || formData.birthDateHijri || '',
      currentMarji: finalCurrentMarji,
      ...(isOtherMarji ? { customMarji: customMarjiText.trim() } : {}),
      madinahPrivateRoomRequested: Boolean(formData.madinahPrivateRoomRequested),
      madinahPrivateRoomNote: formData.madinahPrivateRoomRequested
        ? (formData.madinahPrivateRoomNote || '').trim()
        : '',
      hasMahram: Boolean(formData.hasMahram && cleanedCompanions.length > 0),
      mahramDetails: cleanedCompanions,
      seasonYear: currentSeason,
      hajjYear: currentSeason,
      season: `موسم حج ${currentSeason}هـ`,
      transport: isAirPackage ? 'طائرة' : 'باص',
      busNumber: '',
      busSeat: '',
      id: pilgrimId,
      registrationReference: String(seqNum),
      pilgrimSequenceNumber: (pilgrims.length || 0) + 1,
      membershipNumber: `QAEM-${currentSeason}-${seqNum}`,
      status: 'قيد المراجعة',
      ...(finalIdImageUrl ? { nationalIdImage: finalIdImageUrl } : {}),
    };
    onAddPilgrim(newPilgrim);
    setSubmittedPilgrim(newPilgrim);
  };

  const steps = [
    { title: 'الشروط', icon: ShieldCheck },
    { title: 'البيانات الشخصية', icon: User },
    { title: 'البيانات الصحية', icon: AlertCircle },
    { title: 'الرحلة والمحرم', icon: Bus },
    { title: 'البيانات المالية', icon: CreditCard }
  ];

  if (submittedPilgrim) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 text-right">
        <div className="bg-white dark:bg-[#0B1221] border-2 border-amber-300 dark:border-amber-500/40 rounded-3xl p-8 sm:p-12 shadow-lg dark:shadow-2xl text-center space-y-6">
          <div className="w-20 h-20 bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto border-2 border-amber-200 dark:border-amber-500/30 shadow-md dark:shadow-lg">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white">تم استلام طلب تسجيلك بنجاح!</h2>
          <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
            بارك الله فيك حاجنا الكريم. تم توثيق طلبك برقم مرجعي:{' '}
            <strong className="text-amber-700 dark:text-amber-400 font-mono text-lg">{submittedPilgrim.registrationReference}</strong>
          </p>
          <button
            onClick={onSuccessNavigate}
            className="bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black px-8 py-3.5 rounded-xl transition shadow-lg text-sm sm:text-base cursor-pointer"
          >
            الانتقال لبوابة الاستعلام
          </button>
        </div>
      </div>
    );
  }

  const boundPackageObj = packages.find(
    (p) => p.title === (formData.selectedPackage || selectedPackage)
  ) || null;

  const boundDynamicForm = boundPackageObj?.formTemplateId
    ? dynamicForms.find(
        (f) => f.id === boundPackageObj.formTemplateId && f.status === 'active'
      ) || null
    : null;

  const boundPkgStatus = boundPackageObj
    ? evaluatePackageStatus(boundPackageObj, pilgrims)
    : null;

  if (boundDynamicForm && boundPackageObj && !boundPkgStatus?.isClosedForVisitors) {
    return (
      <div className="max-w-4xl mx-auto py-8 sm:py-10 px-4 sm:px-6 text-right space-y-6" dir="rtl">
        {/* Package Switcher Bar so pilgrims can freely switch between dynamic & standard packages */}
        {visiblePackages.length > 1 && (
          <div className="bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 shadow-sm dark:shadow-none">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-black text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <Package className="w-4 h-4" />
                <span>الباقة المختارة للتسجيل (يمكنك التبديل بين الباقات المتاحة):</span>
              </span>
              {onNavigateToPackages && (
                <button
                  type="button"
                  onClick={onNavigateToPackages}
                  className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 underline cursor-pointer"
                >
                  استعراض تفاصيل الباقات
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {visiblePackages.map((pkg) => {
                const st = evaluatePackageStatus(pkg, pilgrims);
                const isSelected = pkg.title === boundPackageObj.title;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    disabled={st.isClosedForVisitors}
                    onClick={() => {
                      setFormData((prev: any) => ({ ...prev, selectedPackage: pkg.title }));
                      onSelectPackage?.(pkg.title);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-amber-500/40'
                    }`}
                  >
                    {pkg.title} {pkg.price ? `(${pkg.price})` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <DynamicFormRenderer
          key={`${boundDynamicForm.id}_${boundPackageObj.id}`}
          template={boundDynamicForm}
          selectedPackageObj={boundPackageObj}
          selectedPackageTitle={boundPackageObj.title}
          campaignSettings={campaignSettings}
          pilgrims={pilgrims}
          onAddPilgrim={onAddPilgrim}
          onSuccessNavigate={onSuccessNavigate}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-10 sm:py-12 px-4 sm:px-6 text-right">
      <div className="bg-white dark:bg-[#0B1221] border border-amber-300 dark:border-amber-500/30 text-slate-900 dark:text-white rounded-3xl shadow-lg dark:shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-50/70 via-white to-amber-50/70 dark:from-[#070C18] dark:via-[#0B1221] dark:to-[#070C18] border-b border-amber-200 dark:border-amber-500/20 p-6 sm:p-8 text-center space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-black text-amber-700 dark:text-amber-400">استمارة تسجيل الحجاج الرسمية 1448هـ</h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium">نظام التقديم والتسجيل الآمن لقافلة القائم للحج والعمرة</p>
        </div>

        {/* Wizard Steps */}
        <div className="flex justify-center p-4 sm:p-5 bg-slate-50 dark:bg-[#070C18] border-b border-slate-200 dark:border-slate-800 overflow-x-auto gap-2">
          {steps.map((s, i) => (
            <div
              key={i}
              className={`flex items-center shrink-0 px-3 py-1.5 rounded-xl transition ${
                step === i + 1
                  ? 'text-amber-800 dark:text-amber-400 font-black bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/40 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 font-medium'
              }`}
            >
              <s.icon className="w-4 h-4 ml-1.5" />
              <span className="text-xs">{s.title}</span>
              {i < steps.length - 1 && <div className="w-5 h-px bg-slate-300 dark:bg-slate-800 mr-2 ml-1" />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
          {error && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-bold animate-fadeIn">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
              {step === 2 && scannedIdCard && !supervisorOverride && (
                <button
                  type="button"
                  onClick={() => {
                    setSupervisorOverride(true);
                    setError('');
                  }}
                  className="shrink-0 px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-md transition flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>اعتماد تصحيح المشرف الآن للمتابعة</span>
                </button>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6 animate-fadeIn">
              {/* Package Selection & Live Availability Section */}
              {visiblePackages.length > 0 && (
                <div className="bg-slate-50 dark:bg-[#070C18] border border-amber-300 dark:border-amber-500/30 rounded-2xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-black text-amber-700 dark:text-amber-400 flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        <span>اختر الباقة المطلوبة للتسجيل</span>
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        الباقات المكتملة أو المنتهية يظهر عليها إشعار الإغلاق ولا يمكن التسجيل فيها
                      </p>
                    </div>
                    {onNavigateToPackages && (
                      <button
                        type="button"
                        onClick={onNavigateToPackages}
                        className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 underline cursor-pointer self-start sm:self-auto"
                      >
                        عرض تفاصيل جميع الباقات
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {visiblePackages.map((pkg) => {
                      const status = evaluatePackageStatus(pkg, pilgrims);
                      const isSelected = formData.selectedPackage === pkg.title;
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          disabled={status.isClosedForVisitors}
                          onClick={() => {
                            if (status.isClosedForVisitors) return;
                            const isAir =
                              pkg.title.includes('طيران') ||
                              pkg.transport === 'طائرة' ||
                              (pkg.transport || '').includes('طيران');
                            setFormData((prev: any) => ({
                              ...prev,
                              selectedPackage: pkg.title,
                              transport: isAir ? 'طائرة' : 'باص',
                            }));
                            if (onSelectPackage) onSelectPackage(pkg.title);
                            setError('');
                          }}
                          className={`text-right p-4 rounded-2xl border transition flex flex-col justify-between gap-2.5 ${
                            status.isClosedForVisitors
                              ? 'bg-slate-100 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800/80 opacity-60 cursor-not-allowed'
                              : isSelected
                              ? 'bg-amber-50 dark:bg-amber-500/15 border-2 border-amber-500 dark:border-amber-400 shadow-md dark:shadow-lg dark:shadow-amber-500/10 cursor-pointer'
                              : 'bg-white dark:bg-[#0B1221] hover:bg-slate-50 dark:hover:bg-[#101B32] border-slate-200 dark:border-slate-800 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 w-full">
                            <div>
                              <span className="text-sm font-black text-slate-900 dark:text-white block">
                                {pkg.title}
                              </span>
                              <span className="text-[11px] text-amber-700 dark:text-amber-400 font-bold">
                                {pkg.price} · {pkg.transport}
                              </span>
                            </div>
                            {status.isClosedForVisitors ? (
                              <span className="px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/40 text-[10px] font-black flex items-center gap-1 shrink-0">
                                <Lock className="w-3 h-3" />
                                <span>{status.publicBadgeText || 'مغلقة'}</span>
                              </span>
                            ) : isSelected ? (
                              <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-[10px] font-black shrink-0">
                                محددة ✓
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 text-[10px] font-bold shrink-0">
                                متاحة
                              </span>
                            )}
                          </div>

                          {(status.maxCapacity !== null || pkg.registrationDeadline) && (
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/80 text-[11px] text-slate-600 dark:text-slate-300 w-full">
                              {status.maxCapacity !== null && (
                                <span className="flex items-center gap-1">
                                  <Users className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                  {status.isFull ? (
                                    <span className="text-red-600 dark:text-red-300 font-bold">
                                      مكتملة العدد
                                    </span>
                                  ) : (
                                    <span>
                                      متبقي {status.remainingSeats} مقعد
                                    </span>
                                  )}
                                </span>
                              )}
                              {pkg.registrationDeadline && (
                                <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                                  <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                  <span>
                                    {formatRegistrationDeadlineAr(pkg.registrationDeadline)}
                                  </span>
                                </span>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-xl font-black text-amber-700 dark:text-amber-400">شروط الالتحاق:</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">يرجى قراءة الشروط والأحكام بدقة والموافقة عليها للمتابعة</p>
              </div>

              <div className="bg-slate-50 dark:bg-[#070C18] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3.5 text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                <div className="space-y-3">
                  <p><strong className="text-amber-700 dark:text-amber-400">1 -</strong> الالتزام بروح الأخوة والأخلاق الإسلامية.</p>
                  <p><strong className="text-amber-700 dark:text-amber-400">2 -</strong> الالتزام بجميع الإجراءات التنظيمية للجان خدمة الحاج، كجداول المواصلات والضيافة والإسكان والبرامج الأخرى.</p>
                  <p><strong className="text-amber-700 dark:text-amber-400">3 -</strong> المحافظة على حقوق وممتلكات الآخرين.</p>
                  <p><strong className="text-amber-700 dark:text-amber-400">4 -</strong> إن تقديم هذه الاستمارة لا يعني إلزام الإدارة بالقبول، ولا يحق للحاج التنازل لغيره إلا بعد موافقة الإدارة.</p>
                  <p><strong className="text-amber-700 dark:text-amber-400">5 -</strong> إن ما يدفع من مبلغ هو أجرة في مقابل ما تقدمه الحملة من خدمات متعارفة، ولا يحق للحاج استرداد الأجرة إلا بمسوغ شرعي.</p>
                  <p><strong className="text-amber-700 dark:text-amber-400">6 -</strong> عند رغبة الحاج إلغاء هذا العقد، يلتزم الحاج بدفع قيمة المصروفات والرسوم وتصريح الحج حسب ما تقرره إدارة الحملة.</p>
                  <p><strong className="text-amber-700 dark:text-amber-400">7 -</strong> تتواصل القافلة مع الحاج عن طريق أرقام الاتصال المسجلة في الاستمارة، ولا تتحمل القافلة ما يترتب على عدم وصول إعلانات البرامج والمواعيد والرحلات وغيرها في حال وجود خطأ في الأرقام المسجلة في الاستمارة.</p>
                  <p><strong className="text-amber-700 dark:text-amber-400">8 -</strong> يلتزم الحاج بعدم التأخير عن مواعيد الرحلات، وفي حال التأخير يتحمل الحاج ما يترتب على ذلك.</p>
                  <p><strong className="text-amber-700 dark:text-amber-400">9 -</strong> في حال كون الحاج يحتاج لرعاية خاصة أو كرسي متحرك فيلزم وجود حاج مرافق له يقوم بشؤونه أثناء موسم الحج مع توفير كرسي متحرك خاص بالحاج.</p>
                  <p><strong className="text-amber-700 dark:text-amber-400">10 -</strong> القافلة غير مسؤولة عن تغيير مواعيد رحلات الطيران أو إلغائها من قبل شركة الطيران، ولا تلتزم القافلة بأي تعويض في حال إلغاء حجز الحاج، ويقبِل الحاج بوسيلة المواصلات البديلة التي تؤمنها القافلة.</p>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 p-4 rounded-2xl flex items-center gap-3">
                <input
                  type="checkbox"
                  id="agreeTerms"
                  checked={formData.termsAccepted === 'نعم'}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, termsAccepted: e.target.checked ? 'نعم' : 'لا' }))}
                  className="w-5 h-5 text-amber-500 accent-amber-500 rounded focus:ring-amber-500 bg-white dark:bg-[#070C18] border-slate-300 dark:border-slate-700"
                />
                <label htmlFor="agreeTerms" className="text-sm font-bold text-amber-900 dark:text-amber-300 cursor-pointer">
                  قرأت الشروط وأوافق عليها *
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-lg font-black text-amber-700 dark:text-amber-400">البيانات الشخصية والاتصال</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    يرجى عمل مسح ضوئي لبطاقة الهوية الوطنية لمطابقة الاسم ورقم الهوية وتاريخ الميلاد والانتهاء تلقائياً
                  </p>
                </div>
                {cardAudit && (
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border ${
                    cardAudit.isManualOverrideApproved
                      ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 shadow-sm'
                      : cardAudit.allMatched
                      ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30'
                      : 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30'
                  }`}>
                    {cardAudit.isManualOverrideApproved ? (
                      <>
                        <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span>تم اعتماد تصحيح المشرف وصحة المعلومات يدوياً ✓</span>
                      </>
                    ) : cardAudit.allMatched ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>جميع البيانات مطابقة للبطاقة المرفقة ✓</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        <span>يوجد اختلاف بين المدخلات والبطاقة المرفقة</span>
                      </>
                    )}
                  </span>
                )}
              </div>

              {/* قسم المسح الضوئي وإرفاق وحفظ بطاقة الهوية الوطنية */}
              <div className="bg-slate-50 dark:bg-[#070C18] p-5 sm:p-6 rounded-2xl border border-amber-300 dark:border-amber-500/30 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <ScanLine className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      <span>المسح الضوئي وإرفاق بطاقة الأحوال / الهوية الوطنية *</span>
                    </label>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                      يقوم النظام بقراءة البطاقة ضوئياً وتدقيق (الاسم الرباعي، رقم الهوية 10 أرقام، تاريخ الميلاد، وتاريخ الانتهاء) قبل الانتقال للخطوة التالية
                    </p>
                  </div>
                  {nationalIdValidation.typeLabel && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 px-2.5 py-1 rounded-lg shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {nationalIdValidation.typeLabel}
                    </span>
                  )}
                </div>

                {/* مدخل الكاميرا الأصلية للجوال كدعم مباشر وسريع */}
                <input
                  ref={nativeCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleIdImageUpload}
                  disabled={isCompressingIdImage || isScanningIdCard}
                  className="hidden"
                />

                {!nationalIdImage ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={openCameraScanner}
                      disabled={isCompressingIdImage || isScanningIdCard}
                      className="flex flex-col items-center justify-center border-2 border-amber-300 dark:border-amber-500/40 hover:border-amber-500 dark:hover:border-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100/70 dark:hover:bg-amber-500/20 rounded-2xl p-4 cursor-pointer transition group text-center"
                    >
                      <ScanLine className="w-7 h-7 text-amber-600 dark:text-amber-400 mb-2 group-hover:scale-110 transition" />
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        فتح الماسح الضوئي المباشر
                      </span>
                      <span className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                        مسح ضوئي حي عبر الكاميرا وتفريغ البيانات تلقائياً
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => nativeCameraInputRef.current?.click()}
                      disabled={isCompressingIdImage || isScanningIdCard}
                      className="flex flex-col items-center justify-center border-2 border-emerald-300 dark:border-emerald-500/40 hover:border-emerald-500 dark:hover:border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100/70 dark:hover:bg-emerald-500/20 rounded-2xl p-4 cursor-pointer transition group text-center"
                    >
                      <Camera className="w-7 h-7 text-emerald-600 dark:text-emerald-400 mb-2 group-hover:scale-110 transition" />
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        تصوير البطاقة بكاميرا الجوال
                      </span>
                      <span className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                        التقاط صورة مباشرة وتفريغ الحقول فوراً
                      </span>
                    </button>

                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-amber-500 dark:hover:border-amber-400 rounded-2xl p-4 cursor-pointer transition bg-white dark:bg-[#090F1E] hover:bg-amber-50/40 dark:hover:bg-[#0C1527] group text-center">
                      <UploadCloud className="w-7 h-7 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition mb-2" />
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        {isCompressingIdImage ? 'جاري معالجة صورة البطاقة...' : 'رفع صورة البطاقة من الجهاز'}
                      </span>
                      <span className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                        اختر صورة من الاستوديو أو أبشر / توكلنا
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleIdImageUpload}
                        disabled={isCompressingIdImage || isScanningIdCard}
                        className="hidden"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-[#090F1E] p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                      <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                        {/* معاينة البطاقة الممسوحة ضوئياً كوثيقة رسمية مع خط الليزر أثناء المسح */}
                        <div className="relative w-44 h-28 rounded-xl overflow-hidden border-2 border-emerald-500/50 bg-slate-100 dark:bg-slate-950 shadow-md shrink-0">
                          <img
                            src={nationalIdImage}
                            alt="معاينة بطاقة الأحوال الممسوحة ضوئياً"
                            className="w-full h-full object-contain bg-slate-100 dark:bg-slate-950"
                          />
                          {isScanningIdCard && (
                            <div className="absolute inset-0 bg-emerald-950/30 flex flex-col justify-between p-2">
                              <div className="w-full h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-bounce" />
                              <span className="text-[10px] font-black text-emerald-300 bg-slate-950/80 px-2 py-0.5 rounded text-center">
                                جاري المسح الضوئي وقص البطاقة...
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>تم المسح الضوئي وقص حدود بطاقة الهوية تلقائياً</span>
                          </p>
                          {idImageSizeKb > 0 && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              حجم الوثيقة الممسوحة: {idImageSizeKb} كيلوبايت (مقتصة ومحسنة ضوئياً)
                            </p>
                          )}
                          {isScanningIdCard && (
                            <div className="mt-2 space-y-1.5">
                              <p className="text-xs font-bold text-amber-600 dark:text-amber-500 flex items-center gap-1.5 animate-pulse">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                                <span>{ocrStatusText || 'جاري استخراج البيانات وتفريغها في الخانات...'}</span>
                              </p>
                              <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-emerald-500 h-full transition-all duration-300"
                                  style={{ width: `${Math.max(10, ocrProgress)}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                        <button
                          type="button"
                          onClick={handleSaveIdCardToDevice}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 rounded-xl text-xs font-bold transition"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>حفظ البطاقة</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => scanIdCardWithAI(nationalIdImage)}
                          disabled={isScanningIdCard}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 dark:hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 rounded-xl text-xs font-bold transition disabled:opacity-50"
                        >
                          <ScanLine className="w-3.5 h-3.5" />
                          <span>إعادة المسح الضوئي</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNationalIdImage('');
                            setIdImageSizeKb(0);
                            setScannedIdCard(null);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>استبدال</span>
                        </button>
                      </div>
                    </div>

                    {cardSavedToast && (
                      <div className="bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>تم حفظ نسخة من بطاقة الهوية الممسوحة ضوئياً على جهازك، كما تم حفظها تلقائياً ضمن مرفقات التسجيل.</span>
                      </div>
                    )}

                    {/* جدول تدقيق ومطابقة بيانات البطاقة المرفقة مع حقول الاستمارة */}
                    {scannedIdCard && !isScanningIdCard && (
                      <div className={`p-4 rounded-2xl border space-y-3.5 transition-all duration-300 ${
                        cardAudit?.isManualOverrideApproved
                          ? 'bg-white dark:bg-[#090F1E] border-amber-400 dark:border-amber-500/50 shadow-md dark:shadow-xl'
                          : cardAudit?.allMatched
                          ? 'bg-emerald-50/70 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/30'
                          : 'bg-red-50/70 dark:bg-red-500/5 border-red-200 dark:border-red-500/40'
                      }`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-2.5">
                          <div className="flex items-center gap-2">
                            <Sparkles className={`w-4 h-4 ${cardAudit?.isManualOverrideApproved ? 'text-amber-600 dark:text-amber-400' : cardAudit?.allMatched ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`} />
                            <span className="text-xs font-black text-slate-900 dark:text-white">
                              نتيجة المسح الضوئي وتفريغ البيانات في الخانات:
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSupervisorOverride(!supervisorOverride);
                                setError('');
                              }}
                              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black shadow transition ${
                                supervisorOverride
                                  ? 'bg-emerald-500 text-slate-950 font-black hover:bg-emerald-400'
                                  : 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-slate-950'
                              }`}
                            >
                              <ShieldCheck className="w-4 h-4" />
                              <span>{supervisorOverride ? '✓ تم اعتماد تصحيح المشرف' : 'تأكيد صحة المعلومات واعتماد تصحيح المشرف'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSupervisorOverride(false);
                                syncFormWithScannedCard();
                              }}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#070C18] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs border border-slate-300 dark:border-slate-700 shadow-sm transition"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>إعادة المطابقة تلقائياً من البطاقة</span>
                            </button>
                          </div>
                        </div>

                        {/* خيار إقرار صحة المعلومات واعتماد تصحيح المشرف */}
                        <div className={`p-3.5 rounded-xl border transition ${
                          supervisorOverride
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/40'
                            : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
                        }`}>
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              id="supervisorConfirmToggle"
                              checked={supervisorOverride}
                              onChange={(e) => {
                                setSupervisorOverride(e.target.checked);
                                setError('');
                              }}
                              className="w-5 h-5 text-amber-500 accent-amber-500 rounded mt-0.5 bg-white dark:bg-[#070C18] border-slate-300 dark:border-slate-700 cursor-pointer focus:ring-amber-500"
                            />
                            <label htmlFor="supervisorConfirmToggle" className="cursor-pointer text-xs font-bold leading-relaxed">
                              <span className={`block font-black text-sm mb-0.5 ${supervisorOverride ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-800 dark:text-amber-400'}`}>
                                {supervisorOverride ? '✓ تم تفعيل خيار صحة المعلومات واعتماد تصحيح المشرف بنجاح' : 'خيار صحة المعلومات واعتماد تصحيح المشرف:'}
                              </span>
                              <span className="text-slate-700 dark:text-slate-200">
                                أؤكد صحة وتدقيق البيانات المدخلة في الخانات يدوياً (الاسم ورقم الهوية والتواريخ) ومطابقتها للأصل، واعتماد تصحيح المشرف وتجاوز أي خطأ في قراءة الماسح الضوئي التلقائي.
                              </span>
                            </label>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                          {/* 1. مطابقة رقم البطاقة */}
                          <div className={`p-3 rounded-xl border flex items-start justify-between gap-2 ${
                            cardAudit?.idMatched
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/40 text-red-700 dark:text-red-300'
                          }`}>
                            <div>
                              <span className="font-black block text-slate-900 dark:text-slate-100">1. رقم الهوية الوطنية:</span>
                              <span className="font-mono text-[11px] block mt-0.5" dir="ltr">
                                في البطاقة: {scannedIdCard.nationalId || '—'} | المدخل: {formData.nationalId || '—'}
                              </span>
                            </div>
                            <span className="font-black shrink-0">
                              {cardAudit?.idMatched ? (supervisorOverride && !cardAudit.originalMatched ? '✓ معتمد بالمطابقة' : '✓ مطابق') : '✗ غير مطابق'}
                            </span>
                          </div>

                          {/* 2. مطابقة الاسم الرباعي */}
                          <div className={`p-3 rounded-xl border flex items-start justify-between gap-2 ${
                            cardAudit?.nameMatched
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/40 text-red-700 dark:text-red-300'
                          }`}>
                            <div>
                              <span className="font-black block text-slate-900 dark:text-slate-100">2. الاسم الرباعي:</span>
                              <span className="text-[11px] block mt-0.5">
                                في البطاقة: {cardAudit?.cardFullName || scannedIdCard.fullNameArabic || '—'}
                              </span>
                            </div>
                            <span className="font-black shrink-0">
                              {cardAudit?.nameMatched ? (supervisorOverride && !cardAudit.originalMatched ? '✓ معتمد بتصحيح المشرف' : '✓ مطابق') : '✗ غير مطابق'}
                            </span>
                          </div>

                          {/* 3. مطابقة تاريخ الانتهاء */}
                          <div className={`p-3 rounded-xl border flex items-start justify-between gap-2 ${
                            cardAudit?.expiryMatched
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/40 text-red-700 dark:text-red-300'
                          }`}>
                            <div>
                              <span className="font-black block text-slate-900 dark:text-slate-100">3. تاريخ انتهاء البطاقة:</span>
                              <span className="font-mono text-[11px] block mt-0.5" dir="ltr">
                                في البطاقة: {scannedIdCard.idExpiryDate || '—'} | المدخل: {formData.idExpiryDate || '—'}
                              </span>
                            </div>
                            <span className="font-black shrink-0">
                              {cardAudit?.expiryMatched ? (supervisorOverride && !cardAudit.originalMatched ? '✓ معتمد بالمطابقة' : '✓ مطابق') : '✗ غير مطابق'}
                            </span>
                          </div>

                          {/* 4. مطابقة تاريخ الميلاد */}
                          <div className={`p-3 rounded-xl border flex items-start justify-between gap-2 ${
                            cardAudit?.birthMatched
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/40 text-red-700 dark:text-red-300'
                          }`}>
                            <div>
                              <span className="font-black block text-slate-900 dark:text-slate-100">4. تاريخ الميلاد:</span>
                              <span className="font-mono text-[11px] block mt-0.5" dir="ltr">
                                في البطاقة: {scannedIdCard.birthDate || '—'} | المدخل: {formData.birthDate || '—'}
                              </span>
                            </div>
                            <span className="font-black shrink-0">
                              {cardAudit?.birthMatched ? (supervisorOverride && !cardAudit.originalMatched ? '✓ معتمد بالمطابقة' : '✓ مطابق') : '✗ غير مطابق'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {idImageError && (
                  <p className="text-xs text-red-600 dark:text-red-500 font-bold">{idImageError}</p>
                )}
              </div>

              {/* وحدة المسح الضوئي الذكي لبطاقة الهوية الوطنية (Optical Document Scanner HUD) */}
              {isCameraOpen && (
                <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
                  <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl space-y-4 p-5 text-center">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
                        <ScanLine className="w-5 h-5 animate-pulse" />
                        <span>الماسح الضوئي الذكي لبطاقة الهوية (OCR Scanner)</span>
                      </div>
                      <button
                        type="button"
                        onClick={stopCameraStream}
                        className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-[1.58/1] border-2 border-emerald-500/50 shadow-inner flex items-center justify-center">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={isCameraStreamActive ? 'w-full h-full object-cover' : 'hidden'}
                      />
                      {!isCameraStreamActive && (
                        <div className="p-6 text-center space-y-2">
                          <ScanLine className="w-12 h-12 text-emerald-400 mx-auto animate-pulse" />
                          <p className="text-xs font-bold text-slate-200">
                            وحدة المسح الضوئي جاهزة لالتقاط وقص حدود بطاقة الهوية تلقائياً
                          </p>
                          <p className="text-[11px] text-slate-400">
                            سيقوم الماسح الضوئي بعزل البطاقة عن الخلفية واستخراج الاسم والرقم والتواريخ فوراً
                          </p>
                        </div>
                      )}

                      {/* زوايا تحديد الماسح الضوئي وشعاع الليزر المتحرك */}
                      <div className="absolute inset-4 pointer-events-none">
                        <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
                        <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
                        <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />
                        <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />

                        {/* شعاع الليزر الضوئي */}
                        <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_#34d399] absolute top-1/2 animate-pulse" />
                      </div>

                      <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none">
                        <span className="bg-slate-950/85 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold px-3 py-1 rounded-full">
                          يتم قص حدود البطاقة فقط وتحسين وضوح النصوص تلقائياً
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      {isCameraStreamActive ? (
                        <button
                          type="button"
                          onClick={captureFromCamera}
                          className="sm:col-span-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3.5 px-6 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition"
                        >
                          <ScanLine className="w-4 h-4" />
                          <span>مسح البطاقة ضوئياً وتفريغ البيانات الآن</span>
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => nativeCameraInputRef.current?.click()}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow transition"
                      >
                        <Camera className="w-4 h-4" />
                        <span>التقاط البطاقة بالعدسة عالية الدقة للمسح الضوئي</span>
                      </button>

                      <button
                        type="button"
                        onClick={stopCameraStream}
                        className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition"
                      >
                        إغلاق
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    الاسم الأول (اسم الحاج) <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <input
                    name="firstName"
                    placeholder="مثال: صالح"
                    onChange={handleChange}
                    value={formData.firstName}
                    className={`w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 p-3 rounded-xl text-sm transition outline-none ${
                      cardAudit?.isManualOverrideApproved
                        ? 'border-amber-500/50'
                        : cardAudit && !cardAudit.nameMatched
                        ? 'border-red-500 ring-2 ring-red-500/30'
                        : ''
                    }`}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    الاسم الثاني (الأب) <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <input
                    name="secondName"
                    placeholder="مثال: حجي"
                    onChange={handleChange}
                    value={formData.secondName}
                    className={`w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 p-3 rounded-xl text-sm transition outline-none ${
                      cardAudit?.isManualOverrideApproved
                        ? 'border-amber-500/50'
                        : cardAudit && !cardAudit.nameMatched
                        ? 'border-red-500 ring-2 ring-red-500/30'
                        : ''
                    }`}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    الاسم الثالث (الجد) <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <input
                    name="thirdName"
                    placeholder="مثال: مبارك"
                    onChange={handleChange}
                    value={formData.thirdName}
                    className={`w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 p-3 rounded-xl text-sm transition outline-none ${
                      cardAudit?.isManualOverrideApproved
                        ? 'border-amber-500/50'
                        : cardAudit && !cardAudit.nameMatched
                        ? 'border-red-500 ring-2 ring-red-500/30'
                        : ''
                    }`}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    اللقب (العائلة) <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <input
                    name="lastName"
                    placeholder="مثال: الياسين"
                    onChange={handleChange}
                    value={formData.lastName}
                    className={`w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 p-3 rounded-xl text-sm transition outline-none ${
                      cardAudit?.isManualOverrideApproved
                        ? 'border-amber-500/50'
                        : cardAudit && !cardAudit.nameMatched
                        ? 'border-red-500 ring-2 ring-red-500/30'
                        : ''
                    }`}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    الاسم الكامل باللغة الإنجليزية <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <input
                    name="englishFullName"
                    placeholder="Saleh Hajji Alyassin"
                    onChange={handleChange}
                    value={formData.englishFullName}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 p-3 rounded-xl text-sm text-left outline-none transition"
                    dir="ltr"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    الجنس <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 p-3 rounded-xl text-sm outline-none transition"
                  >
                    <option value="ذكر" className="bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white">ذكر</option>
                    <option value="أنثى" className="bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white">أنثى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    الجنسية <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <input
                    name="nationality"
                    placeholder="سعودي أو..."
                    onChange={handleChange}
                    value={formData.nationality}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 p-3 rounded-xl text-sm outline-none transition"
                    required
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                      رقم الهوية الوطنية / الإقامة <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                    </label>
                    <span
                      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
                        formData.nationalId.length === 10
                          ? nationalIdValidation.isValid
                            ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40'
                            : 'bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/40'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                      dir="ltr"
                    >
                      {formData.nationalId.length} / 10
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      name="nationalId"
                      inputMode="numeric"
                      placeholder="10 أرقام (يبدأ بـ 1 أو 2)"
                      maxLength={10}
                      onChange={handleChange}
                      value={formData.nationalId}
                      dir="ltr"
                      className={`w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-mono font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 text-left p-3 rounded-xl text-sm transition outline-none ${
                        formData.nationalId.length > 0
                          ? nationalIdValidation.status === 'valid'
                            ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                            : nationalIdValidation.status === 'error'
                            ? 'border-red-500 ring-2 ring-red-500/30'
                            : 'border-amber-500 dark:border-amber-400 ring-2 ring-amber-400/20'
                          : 'focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25'
                      }`}
                      required
                    />
                  </div>
                  {formData.nationalId.length > 0 && (
                    <div
                      className={`mt-1.5 text-[11px] font-bold flex items-start gap-1.5 leading-relaxed ${
                        nationalIdValidation.status === 'valid'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : nationalIdValidation.status === 'error'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {nationalIdValidation.status === 'valid' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                      )}
                      <span>{nationalIdValidation.message}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <DualCalendarDatePicker
                  label="تاريخ إصدار الهوية الوطنية"
                  required
                  value={formData.idIssueDate}
                  hijriValue={formData.idIssueDateHijri}
                  onChange={(gregDate, hijriDate) => {
                    if (error) setError('');
                    setFormData((prev: any) => ({
                      ...prev,
                      idIssueDate: gregDate || hijriDate,
                      idIssueDateHijri: hijriDate,
                    }));
                  }}
                  minHijriYear={1370}
                  maxHijriYear={activeSeasonNum}
                  minGregorianYear={1950}
                  maxGregorianYear={2035}
                />

                <DualCalendarDatePicker
                  label="تاريخ انتهاء الهوية الوطنية"
                  required
                  value={formData.idExpiryDate}
                  hijriValue={formData.idExpiryDateHijri}
                  hasAuditError={Boolean(cardAudit && !cardAudit.expiryMatched)}
                  isOverrideApproved={Boolean(cardAudit?.isManualOverrideApproved)}
                  onChange={(gregDate, hijriDate) => {
                    if (error) setError('');
                    setFormData((prev: any) => ({
                      ...prev,
                      idExpiryDate: gregDate || hijriDate,
                      idExpiryDateHijri: hijriDate,
                    }));
                  }}
                  minHijriYear={activeSeasonNum - 5}
                  maxHijriYear={activeSeasonNum + 25}
                  minGregorianYear={2020}
                  maxGregorianYear={2055}
                />

                <DualCalendarDatePicker
                  label="تاريخ الميلاد"
                  required
                  value={formData.birthDate}
                  hijriValue={formData.birthDateHijri}
                  hasAuditError={Boolean(cardAudit && !cardAudit.birthMatched)}
                  isOverrideApproved={Boolean(cardAudit?.isManualOverrideApproved)}
                  onChange={(gregDate, hijriDate) => {
                    if (error) setError('');
                    setFormData((prev: any) => ({
                      ...prev,
                      birthDate: gregDate || hijriDate,
                      birthDateHijri: hijriDate,
                    }));
                  }}
                  minHijriYear={1340}
                  maxHijriYear={activeSeasonNum - 10}
                  minGregorianYear={1925}
                  maxGregorianYear={2020}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    رقم جوال الحاج (المسجل في أبشر) <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <input
                    name="mobile"
                    placeholder="05XXXXXXXX"
                    maxLength={10}
                    onChange={handleChange}
                    value={formData.mobile}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-mono font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 p-3 rounded-xl text-sm outline-none transition"
                    required
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    رقم الواتساب الخاص بالحاج <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <input
                    name="whatsapp"
                    placeholder="05XXXXXXXX"
                    maxLength={10}
                    onChange={handleChange}
                    value={formData.whatsapp}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-mono font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 p-3 rounded-xl text-sm outline-none transition"
                    required
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    البريد الإلكتروني <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    placeholder="بريد مستقل لكل حاج"
                    onChange={handleChange}
                    value={formData.email}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 p-3 rounded-xl text-sm text-left outline-none transition"
                    required
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <h3 className="text-lg font-black text-amber-700 dark:text-amber-400 border-b border-slate-200 dark:border-slate-800 pb-2.5">البيانات الصحية</h3>
              <div className="space-y-4">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                  أمراض تعاني منها: <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {['الضغط', 'السكري', 'أمراض القلب', 'تكسر الدم', 'فقر الدم', 'صعوبة في الحركة', 'لا شيء مما ذكر'].map(cond => (
                    <label
                      key={cond}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        formData.healthConditions?.includes(cond)
                          ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-400 dark:border-amber-500/50 text-amber-900 dark:text-amber-300'
                          : 'bg-slate-50 dark:bg-[#070C18] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-amber-400 dark:hover:border-amber-500/30'
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="healthConditions"
                        value={cond}
                        checked={formData.healthConditions?.includes(cond)}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData((prev: any) => ({
                            ...prev,
                            healthConditions: e.target.checked
                              ? [...(prev.healthConditions || []), val]
                              : (prev.healthConditions || []).filter((c: string) => c !== val)
                          }));
                        }}
                        className="w-4 h-4 text-amber-500 accent-amber-500 rounded bg-white dark:bg-[#090F1E] border-slate-300 dark:border-slate-700"
                      /> 
                      <span className="text-xs font-bold">{cond}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">هل تشكو من أمراض أخرى؟ (يرجى ذكرها)</label>
                <input
                  name="otherHealthCondition"
                  placeholder="اكتب الأمراض الأخرى إن وجدت..."
                  onChange={handleChange}
                  value={formData.otherHealthCondition}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 p-3 rounded-xl text-sm outline-none transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-[#070C18] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    هل تشكو من آلام بالظهر أو صعوبة في الحركة؟ <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-900 dark:text-white">
                      <input type="radio" name="hasBackPain" checked={formData.hasBackPain === true} onChange={() => setFormData((p:any)=>({...p, hasBackPain: true}))} className="text-amber-500 accent-amber-500" />
                      <span>نعم</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-900 dark:text-white">
                      <input type="radio" name="hasBackPain" checked={formData.hasBackPain === false} onChange={() => setFormData((p:any)=>({...p, hasBackPain: false}))} className="text-amber-500 accent-amber-500" />
                      <span>لا</span>
                    </label>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-[#070C18] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    هل تحتاج وسيلة مساعدة للحركة (كرسي متحرك أو غير ذلك)؟ <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-900 dark:text-white">
                      <input type="radio" name="needsAssistance" checked={formData.needsAssistance === true} onChange={() => setFormData((p:any)=>({...p, needsAssistance: true}))} className="text-amber-500 accent-amber-500" />
                      <span>نعم</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-900 dark:text-white">
                      <input type="radio" name="needsAssistance" checked={formData.needsAssistance === false} onChange={() => setFormData((p:any)=>({...p, needsAssistance: false}))} className="text-amber-500 accent-amber-500" />
                      <span>لا</span>
                    </label>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-[#070C18] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    للنساء فقط: هل يوجد حمل؟ <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-900 dark:text-white">
                      <input type="radio" name="isPregnant" checked={formData.isPregnant === true} onChange={() => setFormData((p:any)=>({...p, isPregnant: true}))} className="text-amber-500 accent-amber-500" />
                      <span>نعم</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-900 dark:text-white">
                      <input type="radio" name="isPregnant" checked={formData.isPregnant === false} onChange={() => setFormData((p:any)=>({...p, isPregnant: false}))} className="text-amber-500 accent-amber-500" />
                      <span>لا</span>
                    </label>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-[#070C18] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    هل لديك صعوبة في نطق بعض الحروف؟ <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-900 dark:text-white">
                      <input type="radio" name="hasSpeechDifficulty" checked={formData.hasSpeechDifficulty === true} onChange={() => setFormData((p:any)=>({...p, hasSpeechDifficulty: true}))} className="text-amber-500 accent-amber-500" />
                      <span>نعم</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-900 dark:text-white">
                      <input type="radio" name="hasSpeechDifficulty" checked={formData.hasSpeechDifficulty === false} onChange={() => setFormData((p:any)=>({...p, hasSpeechDifficulty: false}))} className="text-amber-500 accent-amber-500" />
                      <span>لا</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <h3 className="text-lg font-black text-amber-700 dark:text-amber-400 border-b border-slate-200 dark:border-slate-800 pb-2.5">بيانات الرحلة والمحرم والمرافقين</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    وسيلة المواصلات في الذهاب والعودة <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <select
                    name="transport"
                    value={formData.transport}
                    onChange={handleChange}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold p-3 rounded-xl text-sm focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                  >
                    <option value="باص" className="bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white">باص</option>
                    <option value="طائرة" className="bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white">طائرة (مع رحلات القافلة)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    نوع الحجة <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <select
                    name="hajjType"
                    value={formData.hajjType}
                    onChange={handleChange}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold p-3 rounded-xl text-sm focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                  >
                    <option value="حجة الإسلام الواجبة (أول مرة)" className="bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white">حجة الإسلام الواجبة (أول مرة)</option>
                    <option value="مستحب" className="bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white">مستحب</option>
                    <option value="احتياط" className="bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white">احتياط</option>
                    <option value="نيابة" className="bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white">نيابة</option>
                    <option value="امتثالاً للأمر الواقع" className="bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white">امتثالاً للأمر الواقع</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    سنة آخر حجة (بالتقويم الهجري)
                  </label>
                  <select
                    name="lastHajjYear"
                    onChange={handleChange}
                    value={formData.lastHajjYear}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold p-3 rounded-xl text-sm focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                  >
                    <option value="" className="bg-white dark:bg-[#0B1221] text-slate-500 dark:text-slate-400">
                      — اختر سنة آخر حجة (إن وجدت) —
                    </option>
                    <option value="لا أتذكر" className="bg-white dark:bg-[#0B1221] text-amber-700 dark:text-amber-300 font-black">
                      لا أتذكر
                    </option>
                    {hijriLastHajjYears.map((yr) => (
                      <option key={yr} value={yr} className="bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white">
                        {yr} هـ
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    مرجع التقليد الحالي <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <select
                    name="currentMarji"
                    value={formData.currentMarji}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (error) setError('');
                      setFormData((p: any) => ({ ...p, currentMarji: val }));
                      if (val !== 'مرجع آخر' && !val.includes('مرجع آخر')) {
                        setCustomMarjiText('');
                      }
                    }}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold p-3 rounded-xl text-sm focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                  >
                    {marjiOptions.map((m) => (
                      <option key={m} value={m} className="bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white">
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    مرجع التقليد السابق (إن وجد)
                  </label>
                  <input
                    name="previousMarji"
                    placeholder="مرجع سابق"
                    onChange={handleChange}
                    value={formData.previousMarji}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 p-3 rounded-xl text-sm outline-none transition"
                  />
                </div>
              </div>

              {(formData.currentMarji === 'مرجع آخر' || (formData.currentMarji || '').includes('مرجع آخر')) && (
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/40 rounded-2xl p-4 space-y-2 animate-fadeIn">
                  <label className="block text-xs font-black text-amber-800 dark:text-amber-300">
                    اكتب اسم مرجع التقليد الآخر المطلوب <span className="text-amber-600 dark:text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={customMarjiText}
                    onChange={(e) => {
                      if (error) setError('');
                      setCustomMarjiText(e.target.value);
                    }}
                    placeholder="أدخل اسم المرجع الديني بالكامل..."
                    className="w-full border border-amber-300 dark:border-amber-500/40 bg-white dark:bg-[#070C18] text-slate-900 dark:text-white font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 p-3 rounded-xl text-sm outline-none transition"
                    required
                  />
                </div>
              )}

              {/* Optional Madinah Private Room Request */}
              <div className="bg-slate-50 dark:bg-[#070C18] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center shrink-0">
                      <Hotel className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-sm font-black text-slate-900 dark:text-white block">
                        طلب غرفة خاصة في المدينة المنورة (اختياري)
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        حدد ما إذا كنت ترغب في طلب غرفة خاصة بالمدينة المنورة ليتم ربط الطلب مباشرة بإدارة السكن
                      </span>
                    </div>
                  </div>

                  <div className="inline-flex rounded-xl p-1 bg-white dark:bg-[#0B1221] border border-slate-200 dark:border-slate-800 text-xs font-bold shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((p: any) => ({
                          ...p,
                          madinahPrivateRoomRequested: false,
                          madinahPrivateRoomNote: '',
                        }))
                      }
                      className={`px-4 py-1.5 rounded-lg transition cursor-pointer ${
                        !formData.madinahPrivateRoomRequested
                          ? 'bg-slate-800 dark:bg-slate-700 text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      لا (سكن مشترك)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((p: any) => ({
                          ...p,
                          madinahPrivateRoomRequested: true,
                        }))
                      }
                      className={`px-4 py-1.5 rounded-lg transition cursor-pointer ${
                        formData.madinahPrivateRoomRequested
                          ? 'bg-amber-500 text-slate-950 font-black'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      نعم، أطلب غرفة خاصة
                    </button>
                  </div>
                </div>

                {formData.madinahPrivateRoomRequested && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 animate-fadeIn">
                    <input
                      type="text"
                      value={formData.madinahPrivateRoomNote || ''}
                      onChange={(e) =>
                        setFormData((p: any) => ({ ...p, madinahPrivateRoomNote: e.target.value }))
                      }
                      placeholder="ملاحظة اختيارية حول طلب الغرفة الخاصة في المدينة المنورة (مثال: غرفة لشخصين، دور قريب...)"
                      className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090F1E] text-slate-900 dark:text-white font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 p-3 rounded-xl text-xs outline-none transition"
                    />
                  </div>
                )}
              </div>

              {/* Dynamic Companions Section (Up to 10 Companions with Name + National ID + Relation) */}
              <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    name="hasMahram"
                    checked={Boolean(formData.hasMahram)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      if (error) setError('');
                      setFormData((p: any) => ({
                        ...p,
                        hasMahram: checked,
                        mahramDetails: checked
                          ? (p.mahramDetails && p.mahramDetails.length > 0
                              ? p.mahramDetails
                              : [{ name: '', nationalId: '', relation: '' }])
                          : [],
                      }));
                    }}
                    className="w-4 h-4 text-amber-500 accent-amber-500 rounded bg-white dark:bg-[#070C18] border-slate-300 dark:border-slate-700"
                  />
                  <span className="text-sm font-bold text-amber-800 dark:text-amber-300">
                    هل يوجد محرم أو مرافقون في الحملة؟ (نعم، وسأسجل بياناتهم)
                  </span>
                </label>

                {formData.hasMahram && (
                  <div className="space-y-4 bg-slate-50 dark:bg-[#070C18] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-black text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                        <Users className="w-4 h-4" />
                        <span>بيانات المحرم والمرافقين (يمكن إضافة حتى 10 مرافقين)</span>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px] font-black font-mono">
                        {(formData.mahramDetails || []).length} / 10
                      </span>
                    </div>

                    <div className="space-y-3">
                      {((formData.mahramDetails || []) as { name: string; nationalId?: string; relation: string }[]).map((comp, idx) => (
                        <div
                          key={idx}
                          className="bg-white dark:bg-[#090F1E] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                              المرافق أو المحرم رقم ({idx + 1})
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (error) setError('');
                                const nextList = (formData.mahramDetails || []).filter((_: any, i: number) => i !== idx);
                                setFormData((p: any) => ({
                                  ...p,
                                  hasMahram: nextList.length > 0,
                                  mahramDetails: nextList,
                                }));
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-500/15 hover:bg-red-100 dark:hover:bg-red-500/25 text-red-600 dark:text-red-400 text-[11px] font-bold transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                الاسم الكامل للمرافق <span className="text-amber-600 dark:text-amber-400">*</span>
                              </label>
                              <input
                                type="text"
                                placeholder="الاسم الكامل للمرافق"
                                value={comp.name || ''}
                                onChange={(e) => {
                                  if (error) setError('');
                                  const details = [...(formData.mahramDetails || [])];
                                  details[idx] = { ...(details[idx] || {}), name: e.target.value };
                                  setFormData((p: any) => ({ ...p, mahramDetails: details }));
                                }}
                                className="w-full border border-slate-300 dark:border-slate-700 p-2.5 rounded-xl bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 text-xs outline-none transition"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                رقم الهوية / البطاقة للمرافق <span className="text-amber-600 dark:text-amber-400">*</span>
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={10}
                                dir="ltr"
                                placeholder="10 أرقام"
                                value={comp.nationalId || ''}
                                onChange={(e) => {
                                  if (error) setError('');
                                  const clean = normalizeDigits(e.target.value).slice(0, 10);
                                  const details = [...(formData.mahramDetails || [])];
                                  details[idx] = { ...(details[idx] || {}), nationalId: clean };
                                  setFormData((p: any) => ({ ...p, mahramDetails: details }));
                                }}
                                className="w-full border border-slate-300 dark:border-slate-700 p-2.5 rounded-xl bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-mono font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 text-xs text-left outline-none transition"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                صلة القرابة <span className="text-amber-600 dark:text-amber-400">*</span>
                              </label>
                              <input
                                type="text"
                                placeholder="مثال: زوج، زوجة، ابن، أخت..."
                                value={comp.relation || ''}
                                onChange={(e) => {
                                  if (error) setError('');
                                  const details = [...(formData.mahramDetails || [])];
                                  details[idx] = { ...(details[idx] || {}), relation: e.target.value };
                                  setFormData((p: any) => ({ ...p, mahramDetails: details }));
                                }}
                                className="w-full border border-slate-300 dark:border-slate-700 p-2.5 rounded-xl bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 text-xs outline-none transition"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {(formData.mahramDetails || []).length < 10 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (error) setError('');
                          setFormData((p: any) => ({
                            ...p,
                            mahramDetails: [
                              ...(p.mahramDetails || []),
                              { name: '', nationalId: '', relation: '' },
                            ],
                          }));
                        }}
                        className="w-full py-3 rounded-xl border-2 border-dashed border-amber-400 dark:border-amber-500/40 hover:border-amber-500 dark:hover:border-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100/70 dark:hover:bg-amber-500/15 text-amber-800 dark:text-amber-300 font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>إضافة مرافق آخر ({(formData.mahramDetails || []).length} / 10)</span>
                      </button>
                    ) : (
                      <p className="text-center text-[11px] font-bold text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl py-2">
                        تم الوصول إلى الحد الأقصى المسموح به لإضافة المرافقين (10 مرافقين).
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6 animate-fadeIn">
              <h3 className="text-lg font-black text-amber-700 dark:text-amber-400 border-b border-slate-200 dark:border-slate-800 pb-2.5">البيانات البنكية والتعهد النهائي</h3>

              <div className="bg-amber-50/70 dark:bg-[#070C18] border border-amber-200 dark:border-amber-500/25 rounded-2xl p-4 flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <Building2 className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-amber-900 dark:text-amber-300 block mb-1">اختيار البنك المعتمد وتسجيل الحساب:</strong>
                  <ul className="space-y-1.5 list-disc list-inside text-slate-700 dark:text-slate-300 leading-relaxed">
                    <li>رقم الحساب البنكي المعتمد لرد الفائض أو الرجيع للحاج من قبل وزارة الحج.</li>
                    <li>يمكن تسجيل حساب بنكي باسم أحد الأقارب أو المعارف في حال عدم وجود حساب نشط باسم الحاج.</li>
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    اسم صاحب الحساب البنكي <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <input
                    name="bankAccountName"
                    placeholder="الاسم كما في البنك"
                    onChange={handleChange}
                    value={formData.bankAccountName}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 p-3 rounded-xl text-sm outline-none transition"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    البنك المعتمد <span className="text-amber-600 dark:text-amber-400 font-black">*</span>
                  </label>
                  <select
                    name="bankName"
                    value={formData.bankName}
                    onChange={handleChange}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold p-3 rounded-xl text-sm focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 outline-none transition"
                    required
                  >
                    {approvedBanksList.length > 0 ? (
                      approvedBanksList.map((bank) => (
                        <option key={bank.id} value={bank.name} className="bg-white dark:bg-[#0B1221] text-slate-900 dark:text-white">
                          {bank.name}
                        </option>
                      ))
                    ) : (
                      <option value="" className="bg-white dark:bg-[#0B1221] text-slate-500 dark:text-slate-400">
                        لا توجد بنوك مفعلة حالياً
                      </option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>رقم الآيبان (IBAN) <span className="text-amber-600 dark:text-amber-400 font-black">*</span></span>
                </label>
                <input
                  name="iban"
                  placeholder="SA00 0000 0000 0000 0000 0000"
                  onChange={handleChange}
                  value={formData.iban}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070C18] text-slate-900 dark:text-white font-bold font-mono placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25 p-3 rounded-xl text-sm outline-none transition"
                  dir="ltr"
                  required
                />
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 block">
                  يجب أن يبدأ بـ SA ويتكون من 24 خانة (مثال: SA0335000000012345678901)
                </span>
              </div>

              <div className="space-y-4 pt-2">
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 p-4 rounded-2xl flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="pledgeAccepted"
                    checked={formData.pledgeAccepted === true}
                    onChange={(e) => setFormData((p:any)=>({...p, pledgeAccepted: e.target.checked}))}
                    className="w-5 h-5 text-amber-500 accent-amber-500 rounded mt-0.5 bg-white dark:bg-[#070C18] border-slate-300 dark:border-slate-700"
                  />
                  <label htmlFor="pledgeAccepted" className="text-xs font-bold text-amber-900 dark:text-amber-200 cursor-pointer leading-relaxed">
                    أتعهد بصحة جميع المعلومات والبيانات المسجلة رسمياً في هذه الاستمارة، وأتحمل كامل المسؤولية عن دقتها. *
                  </label>
                </div>
              </div>

              <div className="text-center text-xs font-black text-amber-700 dark:text-amber-400 pt-2 tracking-wide">
                ✦ شكراً لاختيارك قافلة القائم للحج والعمرة ✦
              </div>

              <button 
                type="submit" 
                disabled={!formData.pledgeAccepted}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black p-4 rounded-xl shadow-xl transition text-base disabled:opacity-40 cursor-pointer"
              >
                إرسال الاستمارة النهائية 🚀
              </button>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-6 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => {
                setError('');
                setStep(step - 1);
              }}
              className="px-6 py-2.5 bg-slate-100 dark:bg-[#070C18] hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl disabled:opacity-40 text-xs transition cursor-pointer"
            >
              السابق
            </button>
            {step < 5 ? (
              <button 
                type="button" 
                disabled={step === 1 && formData.termsAccepted !== 'نعم'} 
                onClick={handleNextStep} 
                className="px-8 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black rounded-xl disabled:opacity-40 text-xs shadow-lg transition cursor-pointer"
              >
                {step === 1 ? 'الموافقة والمتابعة: تعبئة البيانات' : 'التالي'}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
};
