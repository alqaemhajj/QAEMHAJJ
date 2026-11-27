import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer,
  X,
  FileSpreadsheet,
  Download,
  SlidersHorizontal,
  Check,
  Square,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { exportAlQaemExcelReport, AlQaemExcelSummaryItem } from '../../utils/alqaemExcelEngine';

export interface OfficialReportPrintModalProps {
  title: string;
  subtitle?: string;
  category?: string;
  generatedBy: string;
  filterSummary?: string;
  columns: string[];
  data: (string | number)[][];
  summaryCards?: AlQaemExcelSummaryItem[];
  excelFilename?: string;
  onExportExcel?: () => void;
  showExcelButton?: boolean;
  orientation?: 'auto' | 'portrait' | 'landscape';
  signatureRightLabel?: string;
  signatureLeftLabel?: string;
  seasonLabel?: string;
  onClose: () => void;
}

const isLtrTechnicalValue = (val: string | number, colHeader: string): boolean => {
  const s = String(val ?? '').trim();
  if (!s) return false;
  const h = colHeader.trim();
  if (
    h.includes('هوية') ||
    h.includes('الهوية') ||
    h.includes('جوال') ||
    h.includes('الجوال') ||
    h.includes('الهاتف') ||
    h.includes('واتساب') ||
    h.includes('آيبان') ||
    h.includes('ايبان') ||
    h.toLowerCase().includes('iban') ||
    h.includes('PNR') ||
    h.includes('تذكرة') ||
    h.includes('العضوية')
  ) {
    return /^[A-Za-z0-9+\-_./\s]+$/.test(s);
  }
  return /^(05\d{8}|SA\d{10,}|QAEM-[\w-]+|\d{10})$/i.test(s);
};

const isSequenceColumn = (header: string): boolean => {
  const clean = (header || '').trim();
  return clean === '#' || clean === 'م' || clean === '# (م)';
};

export const OfficialReportPrintModal: React.FC<OfficialReportPrintModalProps> = ({
  title,
  subtitle,
  category = 'كشوف وسجلات الحجاج المعتمدة',
  generatedBy,
  filterSummary,
  columns,
  data,
  summaryCards = [],
  excelFilename,
  onExportExcel,
  showExcelButton = true,
  orientation = 'auto',
  signatureRightLabel = 'المشرف المسؤول',
  signatureLeftLabel = 'اعتماد المشرف العام',
  seasonLabel = 'موسم 1448هـ',
  onClose,
}) => {
  // Fine-grained in-modal column visibility toggle (initialized with all passed columns enabled)
  const [visibleIndices, setVisibleIndices] = useState<number[]>(() =>
    columns.map((_, idx) => idx)
  );
  const [showColumnToggles, setShowColumnToggles] = useState(false);

  useEffect(() => {
    setVisibleIndices(columns.map((_, idx) => idx));
  }, [columns]);

  const effectiveIndices = useMemo(() => {
    const valid = visibleIndices.filter((idx) => idx >= 0 && idx < columns.length);
    return valid;
  }, [visibleIndices, columns.length]);

  const effectiveColumns = useMemo(
    () => effectiveIndices.map((idx) => columns[idx]),
    [effectiveIndices, columns]
  );

  const effectiveData = useMemo(
    () => data.map((row) => effectiveIndices.map((idx) => row[idx] ?? '—')),
    [data, effectiveIndices]
  );

  const dataColumnCount = useMemo(
    () => effectiveColumns.filter((c) => !isSequenceColumn(c)).length,
    [effectiveColumns]
  );

  const recommendedOrientation: 'portrait' | 'landscape' =
    dataColumnCount > 6 ? 'landscape' : 'portrait';
  const useLargeReadableFont = dataColumnCount <= 5;

  const [manualOrientation, setManualOrientation] = useState<'portrait' | 'landscape' | null>(
    orientation === 'auto' ? null : orientation
  );
  const pageOrientation: 'portrait' | 'landscape' = manualOrientation ?? recommendedOrientation;

  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  useEffect(() => {
    document.body.classList.add('qaem-printing-report');
    return () => {
      document.body.classList.remove('qaem-printing-report');
    };
  }, []);

  const toggleIndex = (idx: number) => {
    setVisibleIndices((prev) => {
      if (prev.includes(idx)) {
        return prev.filter((i) => i !== idx);
      }
      return [...prev, idx].sort((a, b) => a - b);
    });
  };

  const selectAllCols = () => setVisibleIndices(columns.map((_, idx) => idx));
  const deselectAllCols = () => {
    const seqIdx = columns.findIndex((c) => isSequenceColumn(c));
    setVisibleIndices(seqIdx >= 0 ? [seqIdx] : []);
  };
  const resetCols = () => {
    setVisibleIndices(columns.map((_, idx) => idx));
    setManualOrientation(orientation === 'auto' ? null : orientation);
  };

  const handlePrint = () => {
    try {
      window.print();
    } catch {
      triggerPopupPrint();
    }
  };

  const triggerPopupPrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      handleDirectPdfDownload();
      return;
    }
    const contentElement = document.getElementById('qaemOfficialPrintDocument');
    const contentHtml = contentElement ? contentElement.innerHTML : '';
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${title} - قافلة القائم</title>
        <style>
          body { font-family: 'Cairo', system-ui, -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif; background: #fff; color: #0f172a; margin: 0; padding: 15mm; direction: rtl; text-align: right; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: ${useLargeReadableFont ? '10px' : '7px'}; font-size: ${useLargeReadableFont ? '11.5pt' : '9.5pt'}; }
          th { background: #f1f5f9; font-weight: bold; text-align: center; }
          .qaem-avoid-break { break-inside: avoid; page-break-inside: avoid; }
          @page { size: A4 ${pageOrientation}; margin: 10mm; }
        </style>
      </head>
      <body>
        <div style="max-width: ${pageOrientation === 'landscape' ? '1120px' : '794px'}; margin: 0 auto;">
          ${contentHtml}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.focus();
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDirectPdfDownload = async () => {
    const sourceElement = document.getElementById('qaemOfficialPrintDocument');
    if (!sourceElement || effectiveColumns.length === 0) return;
    setIsDownloadingPdf(true);

    const containerWidth = pageOrientation === 'landscape' ? 1120 : 794;
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'fixed';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0';
    tempContainer.style.width = `${containerWidth}px`;
    tempContainer.style.height = 'auto';
    tempContainer.style.overflow = 'visible';
    tempContainer.style.zIndex = '-9999';
    tempContainer.style.backgroundColor = '#ffffff';
    tempContainer.style.direction = 'rtl';
    tempContainer.style.fontFamily = "'Cairo', sans-serif";

    const clonedNode = sourceElement.cloneNode(true) as HTMLElement;
    clonedNode.style.width = `${containerWidth}px`;
    clonedNode.style.minWidth = `${containerWidth}px`;
    clonedNode.style.maxWidth = 'none';
    clonedNode.style.height = 'auto';
    clonedNode.style.overflow = 'visible';
    clonedNode.style.padding = '24px';
    clonedNode.style.background = '#ffffff';

    tempContainer.appendChild(clonedNode);
    document.body.appendChild(tempContainer);

    try {
      const canvas = await html2canvas(clonedNode, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: containerWidth,
        scrollX: 0,
        scrollY: 0,
        onclone: (doc) => {
          const styles = doc.querySelectorAll('style, link[rel="stylesheet"]');
          styles.forEach((s) => s.remove());

          const allEls = doc.querySelectorAll('*');
          allEls.forEach((el) => {
            const htmlEl = el as HTMLElement;
            if (htmlEl.style) {
              const bg = htmlEl.style.backgroundColor;
              if (bg && (bg.includes('oklch') || bg.includes('var('))) {
                htmlEl.style.backgroundColor = '#ffffff';
              }
              const col = htmlEl.style.color;
              if (col && (col.includes('oklch') || col.includes('var('))) {
                htmlEl.style.color = '#0f172a';
              }
            }
          });
        },
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: pageOrientation,
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const cleanName = (excelFilename || title)
        .replace(/[^\u0600-\u06FFa-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '');
      pdf.save(`${cleanName || 'تقرير_قافلة_القائم'}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
      window.print();
    } finally {
      if (tempContainer.parentNode) {
        tempContainer.parentNode.removeChild(tempContainer);
      }
      setIsDownloadingPdf(false);
    }
  };

  const handleExcelExport = () => {
    const isCustomizedSubset = effectiveIndices.length !== columns.length;
    if (onExportExcel && !isCustomizedSubset) {
      onExportExcel();
      return;
    }
    const cleanBase = (excelFilename || title)
      .replace(/[^\u0600-\u06FFa-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    void exportAlQaemExcelReport({
      reportTitle: title,
      subtitle: subtitle || `قافلة القائم للحج والعمرة والزيارة — ${seasonLabel}`,
      category,
      filename: cleanBase || 'تقرير_قافلة_القائم',
      columns: effectiveColumns,
      rows: effectiveData,
      generatedBy,
      summaryCards: summaryCards.length > 0 ? summaryCards : undefined,
    });
  };

  const rowsPerPageEstimate = pageOrientation === 'landscape' ? 18 : 24;
  const estimatedPages = Math.max(
    1,
    Math.ceil(Math.max(1, effectiveData.length) / rowsPerPageEstimate)
  );
  const nowDate = new Date().toLocaleDateString('ar-SA');
  const nowTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

  const dynamicPageCss = `
    @page {
      size: A4 ${pageOrientation};
      margin: 10mm 10mm 14mm 10mm;
      @bottom-left {
        content: "صفحة " counter(page) " من " counter(pages);
        font-family: inherit;
        font-size: 9pt;
        font-weight: 700;
        color: #475569;
      }
      @bottom-right {
        content: "إجمالي السجلات بالكشف: ${effectiveData.length}";
        font-family: inherit;
        font-size: 9pt;
        font-weight: 700;
        color: #475569;
      }
    }
  `;

  const modalContent = (
    <div
      className="qaem-print-portal fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn"
      dir="rtl"
    >
      <style>{dynamicPageCss}</style>

      <div
        className={`qaem-print-shell bg-[#0B1221] border border-amber-500/30 rounded-3xl w-full ${
          pageOrientation === 'landscape' ? 'max-w-6xl' : 'max-w-4xl'
        } max-h-[95vh] flex flex-col shadow-2xl overflow-hidden my-auto`}
      >
        {/* Top Screen Bar (Hidden on print) */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-800 bg-[#0F172A] shrink-0 print:hidden">
          <div className="flex items-center gap-2.5">
            <Printer className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <h3 className="text-sm font-black text-white">معاينة التقرير والطباعة الرسمية</h3>
              <p className="text-[11px] text-slate-400">
                إجمالي السجلات: {effectiveData.length} • الأعمدة: {dataColumnCount} • التخطيط:{' '}
                {pageOrientation === 'landscape'
                  ? 'A4 أفقي (Landscape)'
                  : 'A4 عمودي (Portrait — خط كبير واضح)'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {columns.length > 2 && (
              <button
                type="button"
                onClick={() => setShowColumnToggles((prev) => !prev)}
                className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  showColumnToggles
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                <span>تخصيص الأعمدة ({dataColumnCount})</span>
                {showColumnToggles ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                setManualOrientation((prev) =>
                  (prev ?? recommendedOrientation) === 'portrait' ? 'landscape' : 'portrait'
                )
              }
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition cursor-pointer"
              title="تبديل اتجاه الورقة عند الطباعة بين عمودي وأفقي"
            >
              {pageOrientation === 'landscape' ? 'اتجاه: أفقي' : 'اتجاه: عمودي'}
            </button>

            {showExcelButton && (
              <button
                type="button"
                onClick={handleExcelExport}
                disabled={effectiveColumns.length === 0}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black shadow-md flex items-center gap-1.5 transition cursor-pointer active:scale-95"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير Excel</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDirectPdfDownload}
              disabled={isDownloadingPdf || effectiveColumns.length === 0}
              className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-black shadow-md flex items-center gap-1.5 transition cursor-pointer active:scale-95"
              title="تحميل التقرير مباشرة كملف PDF"
            >
              <Download className="w-4 h-4" />
              <span>{isDownloadingPdf ? 'جارِ الحفظ...' : 'تحميل PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={effectiveColumns.length === 0}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black shadow-md flex items-center gap-2 transition cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة التقرير</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              aria-label="إغلاق المعاينة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Optional In-Modal Column Selector Bar (Screen Only) */}
        {showColumnToggles && (
          <div className="p-3.5 bg-[#0B1221] border-b border-slate-800 space-y-2.5 shrink-0 print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black text-amber-400">
                اختر الأعمدة المطلوب طباعتها أو تصديرها في هذا التقرير:
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllCols}
                  className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>تحديد الكل</span>
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={deselectAllCols}
                  className="text-[11px] font-bold text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  <Square className="w-3 h-3" />
                  <span>إلغاء الكل</span>
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={resetCols}
                  className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>الافتراضي</span>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {columns.map((col, idx) => {
                const checked = effectiveIndices.includes(idx);
                return (
                  <label
                    key={`${col}-${idx}`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer transition ${
                      checked
                        ? 'bg-amber-500/15 border-amber-500/50 text-white'
                        : 'bg-[#10192D] border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleIndex(idx)}
                      className="w-3.5 h-3.5 accent-amber-500 rounded cursor-pointer"
                    />
                    <span>{col}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Printable Document Area with Mobile Horizontal Scroll & A4 Fixed Width */}
        <div
          className="qaem-print-scroll p-4 sm:p-8 overflow-y-auto overflow-x-auto flex-1 bg-white text-slate-950 print:p-0 print:overflow-visible print:m-0"
          id="qaemOfficialPrintArea"
        >
          <div
            className={`${
              pageOrientation === 'landscape' ? 'min-w-[1120px] w-[1120px]' : 'min-w-[794px] w-[794px]'
            } mx-auto bg-white print:min-w-0 print:w-full`}
            id="qaemOfficialPrintDocument"
          >
            {/* Official Letterhead Header */}
            <div className="border-b-2 border-amber-600 pb-4 mb-5 flex items-center justify-between gap-4 qaem-avoid-break">
              <div className="text-right">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  قافلة القائم للحج والعمرة والزيارة
                </h1>
                <p className="text-xs text-slate-700 font-bold mt-0.5">
                  بوابة أمور الحاج ونظام الإدارة والتشغيل المعتمد — {seasonLabel}
                </p>
                <p className="text-[11px] text-slate-500">
                  الأحساء - المملكة العربية السعودية • ترخيص رسمي معتمد
                </p>
              </div>

              <div className="text-center shrink-0">
                <div className="w-18 h-18 rounded-2xl bg-white border-2 border-amber-500/40 shadow-sm flex items-center justify-center p-1.5 mx-auto">
                  <img
                    src="/assets/aistudio/media_1794134676879_98f1e0ea.png"
                    alt="شعار قافلة القائم"
                    className="w-14 h-14 object-contain"
                  />
                </div>
                <span className="text-[10px] font-black text-amber-700 mt-1 block tracking-wider">
                  قافلة القائم
                </span>
              </div>

              <div className="text-left text-xs text-slate-700 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200 min-w-[190px]">
                <p>
                  تاريخ الاستخراج: <span className="font-mono font-bold text-slate-800">{nowDate}</span>
                </p>
                <p>
                  الوقت: <span className="font-mono text-slate-800">{nowTime}</span>
                </p>
                <p>
                  المشرف المستخرج: <span className="font-bold text-slate-900">{generatedBy}</span>
                </p>
              </div>
            </div>

            {/* Centered List Title Pill */}
            <div className="text-center my-4 space-y-1.5 qaem-avoid-break">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 bg-amber-50 inline-block px-7 py-2 rounded-2xl border border-amber-300">
                {title}
              </h2>
              {subtitle && <p className="text-xs text-slate-600 font-medium">{subtitle}</p>}
              {filterSummary && (
                <p className="text-[11px] text-slate-600 font-bold">
                  نطاق التصفية المطبق: <span className="text-slate-900">{filterSummary}</span>
                </p>
              )}
            </div>

            {/* Summary Mini Cards */}
            {summaryCards.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4 qaem-avoid-break">
                {summaryCards.map((card, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center"
                  >
                    <span className="text-[10px] text-slate-500 font-bold block">{card.label}</span>
                    <strong className="text-sm font-black text-slate-900 font-mono mt-0.5 block">
                      {card.value}
                    </strong>
                  </div>
                ))}
              </div>
            )}

            {/* Data Table (Auto-sized typography: larger crisp font when <= 5 data columns!) */}
            <div className="qaem-print-table-wrap mt-4 overflow-x-auto border border-slate-300 rounded-xl">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-700 text-white font-bold">
                    {effectiveColumns.map((col, idx) => (
                      <th
                        key={idx}
                        className={`${
                          useLargeReadableFont ? 'p-2.5 text-xs' : 'p-2 text-[11px]'
                        } border-l border-slate-700 last:border-l-0 text-center whitespace-nowrap font-black`}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {effectiveColumns.length === 0 ? (
                    <tr>
                      <td className="p-6 text-center text-slate-500 font-bold">
                        يرجى اختيار عمود واحد على الأقل من زر «تخصيص الأعمدة» أعلاه.
                      </td>
                    </tr>
                  ) : effectiveData.length === 0 ? (
                    <tr>
                      <td
                        colSpan={effectiveColumns.length}
                        className="p-6 text-center text-slate-500"
                      >
                        لا توجد بيانات مسجلة مطابقة لمعايير هذا التقرير.
                      </td>
                    </tr>
                  ) : (
                    effectiveData.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={rIdx % 2 === 1 ? 'bg-slate-50/75' : 'bg-white'}
                      >
                        {row.map((cell, cIdx) => {
                          const colHeader = effectiveColumns[cIdx] || '';
                          const ltr = isLtrTechnicalValue(cell, colHeader);
                          const isSeq = isSequenceColumn(colHeader);
                          const isSignatureCol =
                            colHeader.includes('توقيع') || colHeader.includes('تحضير');
                          return (
                            <td
                              key={cIdx}
                              dir={ltr ? 'ltr' : 'rtl'}
                              className={`${
                                useLargeReadableFont ? 'p-2.5 text-xs' : 'p-2 text-[11px]'
                              } border-l border-slate-200 last:border-l-0 leading-snug ${
                                isSeq
                                  ? 'text-center font-mono font-bold text-slate-700 w-10 bg-slate-50/60'
                                  : cIdx === 1 || colHeader.includes('اسم الحاج') || colHeader.includes('الاسم الكامل')
                                  ? 'text-right font-bold text-slate-900'
                                  : isSignatureCol
                                  ? 'min-w-[115px] text-center'
                                  : 'text-center text-slate-800'
                              } ${ltr ? 'font-mono whitespace-nowrap' : ''}`}
                            >
                              {isSignatureCol && !String(cell ?? '').trim() ? (
                                <div className="h-4 border-b border-dashed border-slate-300 w-full" />
                              ) : (
                                cell
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
                {effectiveColumns.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-300 text-[10px] text-slate-600 font-bold">
                      <td colSpan={effectiveColumns.length} className="px-3 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span>إجمالي السجلات بالكشف: {effectiveData.length}</span>
                          <span>
                            قافلة القائم للحج والعمرة والزيارة — وثيقة رسمية معتمدة ({seasonLabel})
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Official Signature Footer */}
            <div className="mt-8 pt-6 border-t border-slate-300 flex items-center justify-between text-xs text-slate-700 qaem-avoid-break">
              <div className="text-center">
                <span className="block font-bold">{signatureRightLabel}</span>
                <span className="block text-[11px] text-slate-500 mt-6">
                  ............................................
                </span>
              </div>
              <div className="text-center">
                <span className="block font-bold">ختم إدارة القافلة المعتمد</span>
                <div className="w-20 h-20 rounded-full border-2 border-dashed border-amber-600/40 flex items-center justify-center text-[10px] text-amber-700 font-bold mx-auto mt-2">
                  ختم الإدارة
                </div>
              </div>
              <div className="text-center">
                <span className="block font-bold">{signatureLeftLabel}</span>
                <span className="block text-[11px] text-slate-500 mt-6">
                  ............................................
                </span>
              </div>
            </div>

            <div className="mt-4 pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
              <span>إجمالي عدد السجلات بالكشف: {effectiveData.length}</span>
              <span>تقدير صفحات التقرير: 1 من {estimatedPages} (يُحدث الترقيم تلقائياً عند الطباعة)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

interface PilgrimExportButtonsProps {
  onExportExcel: () => void;
  onPrintPdf: () => void;
  count?: number;
  excelLabel?: string;
  printLabel?: string;
  disabled?: boolean;
  compact?: boolean;
}

export const PilgrimExportButtons: React.FC<PilgrimExportButtonsProps> = ({
  onExportExcel,
  onPrintPdf,
  count,
  excelLabel = 'تصدير Excel (.xlsx)',
  printLabel = 'طباعة / حفظ PDF',
  disabled = false,
  compact = false,
}) => {
  const countSuffix = typeof count === 'number' ? ` (${count})` : '';
  const sizeClasses = compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-xs';

  return (
    <div className="flex flex-wrap items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={onPrintPdf}
        disabled={disabled}
        className={`${sizeClasses} rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black flex items-center justify-center gap-1.5 shadow transition cursor-pointer active:scale-95 whitespace-nowrap`}
        title="معاينة التقرير الرسمي والطباعة أو الحفظ بصيغة PDF"
      >
        <Printer className="w-4 h-4" />
        <span>
          {printLabel}
          {countSuffix}
        </span>
      </button>

      <button
        type="button"
        onClick={onExportExcel}
        disabled={disabled}
        className={`${sizeClasses} rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-1.5 shadow transition cursor-pointer active:scale-95 whitespace-nowrap`}
        title="تصدير الجدول المعروض حالياً إلى ملف Excel (.xlsx)"
      >
        <FileSpreadsheet className="w-4 h-4" />
        <span>
          {excelLabel}
          {countSuffix}
        </span>
      </button>
    </div>
  );
};
