import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer,
  X,
  Download,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  SlidersHorizontal,
  Users,
  UserCheck,
  Layers,
  Check,
  Square,
  RotateCcw,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type ExcelJS from 'exceljs';
import { ReligiousGuide } from '../../types/religiousGuidance';
import {
  MutawwifPilgrimItem,
  MutawwifRealStats,
  getPilgrimDisplayName,
  getPilgrimEffectiveMarji,
  getPilgrimHealthSummary,
  isPilgrimNeedsMobilityCare,
} from '../../lib/religiousGuidanceDb';
import {
  ALQAEM_EXCEL_BRAND,
  exportAlQaemExcelReport,
} from '../../utils/alqaemExcelEngine';
import {
  loadPersistedColumnSelection,
  savePersistedColumnSelection,
  getAutoOrientationForColumnCount,
} from '../common/DynamicColumnSelector';

export type MutawwifReportMode = 'general' | 'single' | 'all_separate';

export type MutawwifColumnKey =
  | 'fullName'
  | 'mobile'
  | 'marji'
  | 'nationalId'
  | 'gender'
  | 'nationality'
  | 'birthDate'
  | 'packageTransport'
  | 'healthMobility'
  | 'paymentStatus'
  | 'mutawwifName'
  | 'notesSignature';

export interface MutawwifColumnOption {
  key: MutawwifColumnKey;
  label: string;
  shortHeader: string;
  defaultEnabled: boolean;
  isTextProtected?: boolean;
}

export const MUTAWWIF_COLUMN_OPTIONS: MutawwifColumnOption[] = [
  {
    key: 'fullName',
    label: 'الاسم الكامل للحاج',
    shortHeader: 'الاسم الكامل للحاج',
    defaultEnabled: true,
  },
  {
    key: 'mobile',
    label: 'رقم الجوال / الواتساب',
    shortHeader: 'رقم الجوال / الواتساب',
    defaultEnabled: true,
    isTextProtected: true,
  },
  {
    key: 'marji',
    label: 'اسم مرجع التقليد',
    shortHeader: 'مرجع التقليد',
    defaultEnabled: true,
  },
  {
    key: 'nationalId',
    label: 'رقم الهوية الوطنية',
    shortHeader: 'رقم الهوية الوطنية',
    defaultEnabled: false,
    isTextProtected: true,
  },
  {
    key: 'gender',
    label: 'الجنس (ذكر / أنثى)',
    shortHeader: 'الجنس',
    defaultEnabled: false,
  },
  {
    key: 'nationality',
    label: 'الجنسية',
    shortHeader: 'الجنسية',
    defaultEnabled: false,
  },
  {
    key: 'birthDate',
    label: 'تاريخ الميلاد',
    shortHeader: 'تاريخ الميلاد',
    defaultEnabled: false,
    isTextProtected: true,
  },
  {
    key: 'packageTransport',
    label: 'الباقة / وسيلة المواصلات',
    shortHeader: 'الباقة / المواصلات',
    defaultEnabled: false,
  },
  {
    key: 'healthMobility',
    label: 'الحالة الصحية / القدرة الحركية (كرسي متحرك)',
    shortHeader: 'الحالة الصحية / الحركة',
    defaultEnabled: false,
  },
  {
    key: 'paymentStatus',
    label: 'حالة السداد',
    shortHeader: 'حالة السداد',
    defaultEnabled: false,
  },
  {
    key: 'mutawwifName',
    label: 'اسم المطوّف المكلّف',
    shortHeader: 'المطوّف المكلّف',
    defaultEnabled: false,
  },
  {
    key: 'notesSignature',
    label: 'ملاحظات / خانة توقيع أو تحضير يدوي',
    shortHeader: 'ملاحظات / تحضير',
    defaultEnabled: false,
  },
];

interface MutawwifReportStudioModalProps {
  initialMode?: MutawwifReportMode;
  initialMutawwifId?: string;
  mutawwifs: ReligiousGuide[];
  statsByMutawwifId: Record<string, MutawwifRealStats>;
  allItems: MutawwifPilgrimItem[];
  generatedBy: string;
  seasonLabel?: string;
  onClose: () => void;
}

function getColumnCellValue(item: MutawwifPilgrimItem, key: MutawwifColumnKey): string {
  const p = item.pilgrim;
  switch (key) {
    case 'fullName':
      return getPilgrimDisplayName(p);
    case 'mobile': {
      const m = (p.mobile || '').trim();
      const w = (p.whatsapp || '').trim();
      if (m && w && m !== w) return `${m} / واتساب: ${w}`;
      return m || w || '—';
    }
    case 'marji':
      return getPilgrimEffectiveMarji(p);
    case 'nationalId':
      return (p.nationalId || '').trim() || '—';
    case 'gender':
      return p.gender || '—';
    case 'nationality':
      return (p.nationality || '').trim() || 'سعودي';
    case 'birthDate':
      return (p.birthDate || '').trim() || '—';
    case 'packageTransport': {
      const pkg = (p.selectedPackage || p.packageType || '').trim();
      const tr = (p.transport || '').trim();
      const bus = (p.busNumber || '').trim();
      const parts = [pkg, tr, bus ? `باص ${bus}` : ''].filter(Boolean);
      return parts.length > 0 ? parts.join(' · ') : '—';
    }
    case 'healthMobility':
      return getPilgrimHealthSummary(p);
    case 'paymentStatus': {
      const paidNum = Number(String(p.paidAmount || '').replace(/[^0-9.]/g, '')) || 0;
      if (p.paymentReceived || p.status === 'مكتمل الدفع' || p.status === 'مكتمل') {
        return paidNum > 0 ? `مسدّد (${paidNum.toLocaleString()} ر.س)` : 'مكتمل الدفع';
      }
      if (paidNum > 0) return `دفعة جزئية (${paidNum.toLocaleString()} ر.س)`;
      return 'بانتظار السداد';
    }
    case 'mutawwifName':
      return item.assignedMutawwifName || 'غير موزع بعد';
    case 'notesSignature':
      return item.progress.mutawwifNotes || '';
    default:
      return '—';
  }
}

export const MutawwifReportStudioModal: React.FC<MutawwifReportStudioModalProps> = ({
  initialMode = 'general',
  initialMutawwifId = '',
  mutawwifs,
  statsByMutawwifId,
  allItems,
  generatedBy,
  seasonLabel = 'موسم حج وعمرة 1448هـ',
  onClose,
}) => {
  const [reportMode, setReportMode] = useState<MutawwifReportMode>(initialMode);
  const [selectedMutawwifId, setSelectedMutawwifId] = useState<string>(
    initialMutawwifId || mutawwifs[0]?.id || ''
  );
  const [generalFilter, setGeneralFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [selectedColumns, setSelectedColumns] = useState<Record<MutawwifColumnKey, boolean>>(() => {
    const optionsWithModeDefault = MUTAWWIF_COLUMN_OPTIONS.map((c) => ({
      key: c.key,
      defaultEnabled: c.defaultEnabled || (initialMode === 'general' && c.key === 'mutawwifName'),
    }));
    return loadPersistedColumnSelection(
      'mutawwifRoster',
      optionsWithModeDefault
    ) as Record<MutawwifColumnKey, boolean>;
  });

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    document.body.classList.add('qaem-printing-report');
    return () => {
      document.body.classList.remove('qaem-printing-report');
    };
  }, []);

  const updateSelectedColumns = (
    updater: (prev: Record<MutawwifColumnKey, boolean>) => Record<MutawwifColumnKey, boolean>
  ) => {
    setSelectedColumns((prev) => {
      const next = updater(prev);
      savePersistedColumnSelection('mutawwifRoster', next);
      return next;
    });
  };

  // Automatically enable mutawwifName when switching to General Comprehensive mode
  const handleChangeMode = (nextMode: MutawwifReportMode) => {
    setReportMode(nextMode);
    setNotice(null);
    if (nextMode === 'general') {
      updateSelectedColumns((prev) => ({ ...prev, mutawwifName: true }));
    } else if (nextMode === 'single' && !selectedMutawwifId && mutawwifs[0]) {
      setSelectedMutawwifId(mutawwifs[0].id);
    }
  };

  const activeColumns = useMemo(() => {
    return MUTAWWIF_COLUMN_OPTIONS.filter((col) => selectedColumns[col.key]);
  }, [selectedColumns]);

  const pdfOrientation = getAutoOrientationForColumnCount(activeColumns.length);

  const nowDate = useMemo(
    () =>
      new Date().toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    []
  );

  const nowTime = useMemo(
    () =>
      new Date().toLocaleTimeString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    []
  );

  const generalFilteredItems = useMemo(() => {
    if (generalFilter === 'assigned') {
      return allItems.filter((i) => Boolean(i.assignedMutawwifId));
    }
    if (generalFilter === 'unassigned') {
      return allItems.filter((i) => !i.assignedMutawwifId);
    }
    return allItems;
  }, [allItems, generalFilter]);

  const selectedMutawwifStats = useMemo(() => {
    if (!selectedMutawwifId) return null;
    return statsByMutawwifId[selectedMutawwifId] || null;
  }, [selectedMutawwifId, statsByMutawwifId]);

  const separateMutawwifPages = useMemo(() => {
    return mutawwifs
      .map((m) => statsByMutawwifId[m.id])
      .filter((st): st is MutawwifRealStats => Boolean(st));
  }, [mutawwifs, statsByMutawwifId]);

  const toggleColumn = (key: MutawwifColumnKey) => {
    updateSelectedColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectAllColumns = () => {
    updateSelectedColumns(() => {
      const next = {} as Record<MutawwifColumnKey, boolean>;
      MUTAWWIF_COLUMN_OPTIONS.forEach((c) => {
        next[c.key] = true;
      });
      return next;
    });
  };

  const handleDeselectAllColumns = () => {
    updateSelectedColumns(() => {
      const next = {} as Record<MutawwifColumnKey, boolean>;
      MUTAWWIF_COLUMN_OPTIONS.forEach((c) => {
        next[c.key] = false;
      });
      return next;
    });
  };

  const handleResetDefaultColumns = () => {
    updateSelectedColumns(() => {
      const next = {} as Record<MutawwifColumnKey, boolean>;
      MUTAWWIF_COLUMN_OPTIONS.forEach((c) => {
        next[c.key] = c.defaultEnabled || (reportMode === 'general' && c.key === 'mutawwifName');
      });
      return next;
    });
  };

  const handlePrint = () => {
    if (activeColumns.length === 0) return;
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (isGeneratingPdf || activeColumns.length === 0) return;
    const elements = pageRefs.current.filter((el): el is HTMLDivElement => Boolean(el));
    if (elements.length === 0) return;

    setIsGeneratingPdf(true);
    setNotice(null);

    try {
      const pdf = new jsPDF({
        orientation: pdfOrientation,
        unit: 'mm',
        format: 'a4',
      });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginMm = 8;
      const printableW = pageW - marginMm * 2;
      const printableH = pageH - marginMm * 2;

      let hasAddedAnyPage = false;

      for (const el of elements) {
        const dataUrl = await toPng(el, {
          quality: 1,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          cacheBust: true,
        });

        const img = new Image();
        img.src = dataUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        const scaledH = (img.height * printableW) / img.width;

        if (scaledH <= printableH) {
          if (hasAddedAnyPage) pdf.addPage();
          pdf.addImage(dataUrl, 'PNG', marginMm, marginMm, printableW, scaledH);
          hasAddedAnyPage = true;
        } else {
          let heightLeft = scaledH;
          let sliceIndex = 0;
          while (heightLeft > 0) {
            if (hasAddedAnyPage) pdf.addPage();
            pdf.addImage(
              dataUrl,
              'PNG',
              marginMm,
              marginMm - sliceIndex * printableH,
              printableW,
              scaledH
            );
            hasAddedAnyPage = true;
            heightLeft -= printableH;
            sliceIndex += 1;
          }
        }
      }

      const dateStamp = new Date().toISOString().split('T')[0];
      const fileName =
        reportMode === 'general'
          ? `كشف_توزيع_الحجاج_على_المطوفين_الشامل_${dateStamp}.pdf`
          : reportMode === 'single' && selectedMutawwifStats
          ? `كشف_حجاج_المطوف_${selectedMutawwifStats.mutawwif.name.replace(/\s+/g, '_')}_${dateStamp}.pdf`
          : `كشوفات_جميع_المطوفين_مستقلة_${dateStamp}.pdf`;

      pdf.save(fileName);
      setNotice('تم تصدير وتحميل ملف PDF الرسمي بنجاح.');
    } catch (err) {
      console.error('Mutawwif PDF generation error:', err);
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    if (isGeneratingExcel || activeColumns.length === 0) return;
    setIsGeneratingExcel(true);
    setNotice(null);

    const dateStamp = new Date().toISOString().split('T')[0];
    const headers = ['م', ...activeColumns.map((c) => c.shortHeader)];

    try {
      if (reportMode === 'general') {
        const rows = generalFilteredItems.map((item, idx) => [
          idx + 1,
          ...activeColumns.map((c) => getColumnCellValue(item, c.key)),
        ]);

        const assignedCnt = generalFilteredItems.filter((i) => Boolean(i.assignedMutawwifId)).length;
        const unassignedCnt = generalFilteredItems.length - assignedCnt;

        await exportAlQaemExcelReport({
          reportTitle: 'الكشف العام الشامل لتوزيع الحجاج على المطوّفين',
          subtitle: `منظومة الإرشاد الديني — إدارة المطوّفين وتوزيع الحجاج (${seasonLabel})`,
          category: 'منظومة الإرشاد الديني والتوعية',
          filename: `كشف_توزيع_المطوفين_الشامل_${dateStamp}`,
          columns: headers,
          rows,
          generatedBy,
          summaryCards: [
            { label: 'إجمالي الحجاج بالكشف', value: generalFilteredItems.length },
            { label: 'عدد المطوّفين المفعّلين', value: mutawwifs.length },
            { label: 'الحجاج الموزعون', value: assignedCnt },
            { label: 'غير موزعين بعد', value: unassignedCnt },
          ],
        });
        setNotice('تم تحميل الكشف العام بصيغة Excel (.xlsx) بنجاح.');
      } else if (reportMode === 'single' && selectedMutawwifStats) {
        const m = selectedMutawwifStats.mutawwif;
        const rows = selectedMutawwifStats.assignedItems.map((item, idx) => [
          idx + 1,
          ...activeColumns.map((c) => getColumnCellValue(item, c.key)),
        ]);

        await exportAlQaemExcelReport({
          reportTitle: `كشف حجاج المطوّف: ${m.name}`,
          subtitle: `الجوال: ${m.phone || '—'} • التخصص: ${m.specialization || 'مطوّف ميداني'} • إجمالي الحجاج: ${selectedMutawwifStats.totalAssigned} حاج`,
          category: 'منظومة الإرشاد الديني والتوعية',
          filename: `كشف_حجاج_المطوف_${m.name.replace(/\s+/g, '_')}_${dateStamp}`,
          columns: headers,
          rows,
          generatedBy,
          summaryCards: [
            { label: 'اسم المطوّف المكلّف', value: m.name },
            { label: 'جوال المطوّف', value: m.phone || '—' },
            { label: 'إجمالي حجاج المجموعة', value: selectedMutawwifStats.totalAssigned },
            { label: 'حالات الكرسي/المساعدة', value: selectedMutawwifStats.wheelchairOrAssistCount },
          ],
        });
        setNotice(`تم تحميل كشف المطوّف (${m.name}) بصيغة Excel (.xlsx) بنجاح.`);
      } else if (reportMode === 'all_separate') {
        // Multi-sheet RTL Branded Excel Workbook: Summary sheet + 1 dedicated sheet per Mutawwif
        const ExcelJSMod = await import('exceljs');
        const ExcelJSRuntime = (ExcelJSMod as any).default || ExcelJSMod;
        const workbook: ExcelJS.Workbook = new ExcelJSRuntime.Workbook();
        workbook.creator = ALQAEM_EXCEL_BRAND.systemName;
        workbook.created = new Date();
        const colors = ALQAEM_EXCEL_BRAND.colors;

        // 1) Overview Summary Sheet
        const summarySheet = workbook.addWorksheet('ملخص المطوّفين', {
          views: [{ rightToLeft: true }],
        });
        summarySheet.addRow([ALQAEM_EXCEL_BRAND.systemName]);
        summarySheet.mergeCells('A1:F1');
        summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.navy } };
        summarySheet.getCell('A1').font = { name: 'Cairo', size: 15, bold: true, color: { argb: colors.gold } };
        summarySheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
        summarySheet.getRow(1).height = 34;

        summarySheet.addRow([
          `ملخص توزيع الحجاج على جميع المطوّفين — ${seasonLabel} | المستخرج: ${generatedBy} | التاريخ: ${nowDate}`,
        ]);
        summarySheet.mergeCells('A2:F2');
        summarySheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.secondaryNavy } };
        summarySheet.getCell('A2').font = { name: 'Cairo', size: 10, bold: true, color: { argb: colors.lightText } };
        summarySheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };
        summarySheet.getRow(2).height = 24;

        const sumHeaderRow = summarySheet.addRow([
          'م',
          'اسم المطوّف المكلّف',
          'رقم الجوال',
          'إجمالي الحجاج',
          'ذكور / إناث',
          'حالات الكرسي / المساعدة',
        ]);
        sumHeaderRow.height = 28;
        sumHeaderRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.navy } };
          cell.font = { name: 'Cairo', size: 11, bold: true, color: { argb: colors.gold } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        separateMutawwifPages.forEach((st, idx) => {
          const r = summarySheet.addRow([
            idx + 1,
            st.mutawwif.name,
            st.mutawwif.phone || '—',
            st.totalAssigned,
            `${st.maleCount} ذكر / ${st.femaleCount} أنثى`,
            st.wheelchairOrAssistCount,
          ]);
          r.height = 24;
          r.getCell(3).numFmt = '@';
          r.eachCell((cell) => {
            cell.font = { name: 'Cairo', size: 10, color: { argb: colors.dataTextNavy } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          });
        });

        summarySheet.columns = [
          { width: 8 },
          { width: 34 },
          { width: 18 },
          { width: 16 },
          { width: 22 },
          { width: 24 },
        ];

        // 2) One dedicated RTL worksheet per Mutawwif
        const usedSheetNames = new Set<string>(['ملخص المطوّفين']);
        separateMutawwifPages.forEach((st, mIdx) => {
          const rawName = (st.mutawwif.name || `مطوف_${mIdx + 1}`)
            .replace(/[\\/?*[\]:]/g, ' ')
            .trim()
            .slice(0, 28);
          let sheetName = rawName || `مطوف_${mIdx + 1}`;
          let suffix = 2;
          while (usedSheetNames.has(sheetName)) {
            sheetName = `${rawName.slice(0, 24)}_${suffix}`;
            suffix++;
          }
          usedSheetNames.add(sheetName);

          const ws = workbook.addWorksheet(sheetName, {
            views: [{ rightToLeft: true }],
          });

          const colSpanLetter = String.fromCharCode(64 + Math.max(headers.length, 3));

          ws.addRow([`قافلة القائم للحج والعمرة — كشف حجاج المطوّف: ${st.mutawwif.name}`]);
          ws.mergeCells(`A1:${colSpanLetter}1`);
          ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.navy } };
          ws.getCell('A1').font = { name: 'Cairo', size: 13, bold: true, color: { argb: colors.gold } };
          ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
          ws.getRow(1).height = 32;

          ws.addRow([
            `رقم جوال المطوّف: ${st.mutawwif.phone || '—'}  |  إجمالي الحجاج: ${st.totalAssigned} حاج  |  المستخرج: ${generatedBy}  |  ${nowDate}`,
          ]);
          ws.mergeCells(`A2:${colSpanLetter}2`);
          ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.secondaryNavy } };
          ws.getCell('A2').font = { name: 'Cairo', size: 10, bold: true, color: { argb: colors.lightText } };
          ws.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };
          ws.getRow(2).height = 24;

          const hRow = ws.addRow(headers);
          hRow.height = 28;
          hRow.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.navy } };
            cell.font = { name: 'Cairo', size: 11, bold: true, color: { argb: colors.white } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.border = {
              top: { style: 'thin', color: { argb: colors.mutedGold } },
              bottom: { style: 'medium', color: { argb: colors.gold } },
              left: { style: 'thin', color: { argb: colors.borderNavy } },
              right: { style: 'thin', color: { argb: colors.borderNavy } },
            };
          });

          st.assignedItems.forEach((item, idx) => {
            const vals = [idx + 1, ...activeColumns.map((c) => getColumnCellValue(item, c.key))];
            const dataRow = ws.addRow(vals);
            dataRow.height = 24;
            const bg = idx % 2 === 0 ? colors.rowWhite : colors.rowLightAlt;
            vals.forEach((v, colIdx) => {
              const cell = dataRow.getCell(colIdx + 1);
              const colDef = colIdx > 0 ? activeColumns[colIdx - 1] : null;
              const strVal = String(v ?? '');
              if (colDef?.isTextProtected || /^0\d+$/.test(strVal) || /^\d{10,}$/.test(strVal)) {
                cell.value = strVal;
                cell.numFmt = '@';
              }
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
              cell.font = { name: 'Cairo', size: 10, color: { argb: colors.dataTextNavy } };
              cell.alignment = {
                vertical: 'middle',
                horizontal: colIdx === 0 ? 'center' : 'right',
                wrapText: true,
              };
              cell.border = {
                top: { style: 'thin', color: { argb: colors.dataBorderLight } },
                bottom: { style: 'thin', color: { argb: colors.dataBorderLight } },
                left: { style: 'thin', color: { argb: colors.dataBorderLight } },
                right: { style: 'thin', color: { argb: colors.dataBorderLight } },
              };
            });
          });

          ws.columns = headers.map((h, i) => ({
            width: i === 0 ? 7 : h.includes('الاسم') ? 30 : h.includes('الصحية') || h.includes('الباقة') ? 26 : 20,
          }));
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `كشوفات_جميع_المطوفين_${dateStamp}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setNotice(
          `تم تحميل مصنف Excel (.xlsx) متعدد الأوراق بنجاح (${separateMutawwifPages.length} ورقة مستقلة للمطوّفين + ورقة الملخص).`
        );
      }
    } catch (err) {
      console.error('Excel export error:', err);
      setNotice('تعذر إنشاء ملف Excel، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsGeneratingExcel(false);
    }
  };

  // Reusable official A4 report page renderer (Al-Qaem triple header + data table + signature footer)
  const renderOfficialPage = (params: {
    pageIndex: number;
    reportTitle: string;
    reportSubtitle: string;
    items: MutawwifPilgrimItem[];
    mutawwifHeader?: MutawwifRealStats;
    summaryCards?: { label: string; value: string | number }[];
    isPageBreakBefore?: boolean;
  }) => {
    const {
      pageIndex,
      reportTitle,
      reportSubtitle,
      items,
      mutawwifHeader,
      summaryCards,
      isPageBreakBefore,
    } = params;

    return (
      <div
        key={`report-page-${pageIndex}`}
        ref={(el) => {
          pageRefs.current[pageIndex] = el;
        }}
        style={isPageBreakBefore ? { breakBefore: 'page', pageBreakBefore: 'always' } : undefined}
        className={`bg-white text-slate-950 rounded-2xl p-6 sm:p-8 shadow-lg border border-slate-200 max-w-5xl mx-auto print:shadow-none print:border-0 print:rounded-none print:p-4 ${
          isPageBreakBefore ? 'mt-8 print:mt-0' : ''
        }`}
        dir="rtl"
      >
        {/* 1. Al-Qaem Official Triple Header */}
        <div className="border-b-2 border-amber-600 pb-4 mb-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-right space-y-1">
            <span className="text-[11px] font-bold text-amber-800 block">
              المملكة العربية السعودية • وزارة الحج والعمرة
            </span>
            <h1 className="text-lg sm:text-xl font-black text-slate-900">
              قافلة القائم للحج والعمرة والزيارة
            </h1>
            <p className="text-xs font-bold text-amber-700">
              منظومة الإرشاد والتوعية الدينية — وحدة إدارة المطوّفين وتوزيع الحجاج
            </p>
          </div>

          <div className="text-center shrink-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white border-2 border-amber-500/50 shadow-sm flex items-center justify-center p-1.5 mx-auto">
              <img
                src="/assets/aistudio/media_1794134676879_98f1e0ea.png"
                alt="شعار قافلة القائم"
                className="w-full h-full object-contain"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (!img.src.includes('Screenshot_20261107_174409')) {
                    img.src =
                      '/assets/aistudio/Screenshot_20261107_174409_com_instagram_android_InstagramMainActivity_441b738d.png';
                  }
                }}
              />
            </div>
            <span className="text-[10px] font-black text-amber-800 block mt-1">
              نظام القائم للحج والعمرة
            </span>
          </div>

          <div className="text-right text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 min-w-[190px]">
            <p>
              تاريخ الاستخراج: <strong className="font-mono text-slate-950">{nowDate}</strong>
            </p>
            <p>
              وقت الاستخراج: <strong className="font-mono text-slate-950">{nowTime}</strong>
            </p>
            <p>
              الموسم: <strong className="text-amber-800">{seasonLabel}</strong>
            </p>
            <p>
              المستخرج: <strong className="text-slate-950">{generatedBy}</strong>
            </p>
          </div>
        </div>

        {/* 2. Title Banner */}
        <div className="text-center my-4">
          <div className="inline-block bg-amber-50 border-2 border-amber-300 rounded-2xl px-6 sm:px-8 py-2.5">
            <h2 className="text-base sm:text-lg font-black text-slate-950">{reportTitle}</h2>
            <p className="text-xs font-bold text-amber-800 mt-0.5">{reportSubtitle}</p>
          </div>
        </div>

        {/* 3. Mutawwif Info Box (For Single / All-Separate Mutawwif Rosters) */}
        {mutawwifHeader && (
          <div className="bg-slate-50 border border-slate-300 rounded-2xl p-4 my-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-[11px] font-bold text-amber-800 block">
                المطوّف المكلّف بالمجموعة:
              </span>
              <h3 className="text-base sm:text-lg font-black text-slate-950">
                {mutawwifHeader.mutawwif.name}
              </h3>
              <p className="text-xs font-bold text-slate-600">
                {mutawwifHeader.mutawwif.specialization || 'مرشد ديني ومطوّف ميداني'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-center">
                <span className="text-[10px] text-slate-500 font-bold block">جوال المطوّف</span>
                <strong className="font-mono text-slate-950 font-black" dir="ltr">
                  {mutawwifHeader.mutawwif.phone || '—'}
                </strong>
              </div>
              <div className="bg-amber-50 border border-amber-300 rounded-xl px-3.5 py-2 text-center">
                <span className="text-[10px] text-amber-800 font-bold block">إجمالي الحجاج معه</span>
                <strong className="font-mono text-amber-900 font-black text-sm">
                  {mutawwifHeader.totalAssigned} حاج
                </strong>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-center">
                <span className="text-[10px] text-slate-500 font-bold block">ذكور / إناث</span>
                <strong className="font-mono text-slate-900 font-bold">
                  {mutawwifHeader.maleCount} / {mutawwifHeader.femaleCount}
                </strong>
              </div>
              {mutawwifHeader.wheelchairOrAssistCount > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-center">
                  <span className="text-[10px] text-rose-700 font-bold block">مساعدة / كرسي</span>
                  <strong className="font-mono text-rose-900 font-black">
                    {mutawwifHeader.wheelchairOrAssistCount}
                  </strong>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Optional Summary Cards (For General Comprehensive Roster) */}
        {summaryCards && summaryCards.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-4">
            {summaryCards.map((card, i) => (
              <div
                key={i}
                className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center"
              >
                <span className="text-[10px] font-bold text-slate-600 block">{card.label}</span>
                <strong className="text-sm font-black text-slate-950 font-mono mt-0.5 block">
                  {card.value}
                </strong>
              </div>
            ))}
          </div>
        )}

        {/* 4. Dynamic Columns Table */}
        <div className="qaem-print-table-wrap overflow-x-auto border border-slate-300 rounded-xl mt-4">
          <table
            className={`w-full text-right border-collapse ${
              activeColumns.length <= 5
                ? 'text-[13px]'
                : activeColumns.length === 6
                ? 'text-xs'
                : 'text-[11px]'
            }`}
          >
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="py-2.5 px-2.5 text-center font-black border border-slate-700 w-10">
                  م
                </th>
                {activeColumns.map((col) => (
                  <th
                    key={col.key}
                    className="py-2.5 px-2.5 font-black border border-slate-700 whitespace-nowrap"
                  >
                    {col.shortHeader}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeColumns.length + 1}
                    className="py-8 text-center text-slate-500 font-bold"
                  >
                    لا يوجد حجاج ضمن هذا الكشف حالياً.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr
                    key={item.pilgrimKey}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/90'}
                  >
                    <td className="py-2 px-2 text-center font-mono font-bold text-slate-700 border border-slate-300">
                      {idx + 1}
                    </td>
                    {activeColumns.map((col) => {
                      const val = getColumnCellValue(item, col.key);
                      const isMobilityAlert =
                        col.key === 'healthMobility' && isPilgrimNeedsMobilityCare(item.pilgrim);
                      const isUnassigned =
                        col.key === 'mutawwifName' && !item.assignedMutawwifId;
                      return (
                        <td
                          key={col.key}
                          className={`py-2 px-2.5 border border-slate-300 align-middle ${
                            col.key === 'fullName'
                              ? 'font-bold text-slate-950'
                              : col.isTextProtected
                              ? 'font-mono text-slate-900'
                              : isMobilityAlert
                              ? 'text-rose-700 font-bold'
                              : isUnassigned
                              ? 'text-orange-700 font-bold'
                              : col.key === 'notesSignature'
                              ? 'min-w-[110px]'
                              : 'text-slate-800'
                          }`}
                          dir={col.key === 'nationalId' ? 'ltr' : 'rtl'}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 5. Official Signatures Footer */}
        <div className="qaem-avoid-break mt-6 pt-4 border-t border-slate-300 grid grid-cols-2 sm:grid-cols-3 gap-4 text-center text-xs text-slate-700">
          <div className="space-y-4">
            <p className="font-black text-slate-900">
              {mutawwifHeader ? 'توقيع المطوّف المكلّف' : 'إعداد ومسؤول التوزيع'}
            </p>
            <p className="text-[11px] text-slate-500">
              {mutawwifHeader ? mutawwifHeader.mutawwif.name : generatedBy}
            </p>
            <div className="border-b border-dashed border-slate-400 w-36 mx-auto pt-2" />
          </div>
          <div className="space-y-4">
            <p className="font-black text-slate-900">مشرف الإرشاد والتوعية الدينية</p>
            <p className="text-[11px] text-slate-500">اعتماد التوزيع الميداني</p>
            <div className="border-b border-dashed border-slate-400 w-36 mx-auto pt-2" />
          </div>
          <div className="space-y-4 col-span-2 sm:col-span-1">
            <p className="font-black text-slate-900">ختم واعتماد إدارة القافلة</p>
            <p className="text-[11px] text-slate-500">قافلة القائم للحج والعمرة والزيارة</p>
            <div className="border-b border-dashed border-slate-400 w-36 mx-auto pt-2" />
          </div>
        </div>
      </div>
    );
  };

  // Reset pageRefs length before rendering
  pageRefs.current = [];

  return createPortal(
    <div
      className="qaem-print-portal fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn"
      dir="rtl"
    >
      <div className="qaem-print-shell bg-[#0B1221] border border-amber-500/40 rounded-3xl w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Top Action Bar (Screen Only) */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-800 bg-[#0F172A] shrink-0 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-400 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white">
                استوديو كشوفات المطوّفين المخصصة (PDF الرسمي A4 & Excel)
              </h3>
              <p className="text-[11px] text-slate-400">
                اختر نوع الكشف والحقول المطلوبة ثم قم بالطباعة أو التحميل المباشر بهوية قافلة القائم
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isGeneratingExcel || activeColumns.length === 0}
              className="px-3.5 py-2 rounded-xl bg-[#12192C] hover:bg-slate-800 disabled:opacity-50 text-[#F4C84A] border border-[#C5A45D] text-xs font-black shadow-md flex items-center gap-2 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#20B995]" />
              <span>{isGeneratingExcel ? 'جاري التجهيز...' : 'تصدير Excel (.xlsx)'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf || activeColumns.length === 0}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black shadow-md flex items-center gap-2 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isGeneratingPdf ? 'جاري تجهيز PDF...' : 'تحميل PDF مباشر'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={activeColumns.length === 0}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black shadow-md flex items-center gap-2 transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة رسمية (A4)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Report Configuration Bar: Mode Selector + Dynamic Column Selector (Screen Only) */}
        <div className="p-4 bg-[#0B1221] border-b border-slate-800 space-y-3.5 shrink-0 print:hidden">
          {/* Row 1: Report Type Tabs */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleChangeMode('general')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black border transition flex items-center gap-1.5 cursor-pointer ${
                  reportMode === 'general'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : 'bg-[#10192D] text-slate-300 border-slate-700 hover:border-amber-500/40'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>أ) الكشف العام الشامل (جميع الحجاج)</span>
              </button>

              <button
                type="button"
                onClick={() => handleChangeMode('single')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black border transition flex items-center gap-1.5 cursor-pointer ${
                  reportMode === 'single'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : 'bg-[#10192D] text-slate-300 border-slate-700 hover:border-amber-500/40'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                <span>ب) كشف خاص بمطوّف محدد</span>
              </button>

              <button
                type="button"
                onClick={() => handleChangeMode('all_separate')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black border transition flex items-center gap-1.5 cursor-pointer ${
                  reportMode === 'all_separate'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : 'bg-[#10192D] text-slate-300 border-slate-700 hover:border-amber-500/40'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>كشوفات جميع المطوّفين (صفحة لكل مطوّف)</span>
              </button>
            </div>

            {/* Contextual Selector depending on Mode */}
            {reportMode === 'single' && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-300 whitespace-nowrap">
                  اختر المطوّف:
                </label>
                <select
                  value={selectedMutawwifId}
                  onChange={(e) => setSelectedMutawwifId(e.target.value)}
                  className="bg-[#10192D] border border-amber-500/40 rounded-xl px-3 py-2 text-xs font-bold text-white min-w-[220px] focus:outline-none focus:border-amber-400"
                >
                  {mutawwifs.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({statsByMutawwifId[m.id]?.totalAssigned ?? 0} حاج)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {reportMode === 'general' && (
              <div className="flex items-center gap-1.5 bg-[#10192D] border border-slate-700 rounded-xl p-1 text-[11px]">
                {[
                  { id: 'all', label: `الكل (${allItems.length})` },
                  {
                    id: 'assigned',
                    label: `الموزعون (${allItems.filter((i) => i.assignedMutawwifId).length})`,
                  },
                  {
                    id: 'unassigned',
                    label: `غير موزعين (${allItems.filter((i) => !i.assignedMutawwifId).length})`,
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setGeneralFilter(opt.id as 'all' | 'assigned' | 'unassigned')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                      generalFilter === opt.id
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Row 2: Dynamic Column Selector Checkboxes */}
          <div className="bg-[#10192D] border border-slate-800 rounded-2xl p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs font-black text-amber-400">
                <SlidersHorizontal className="w-4 h-4" />
                <span>تخصيص أعمدة وحقول الكشف (ينعكس فوراً على المعاينة و PDF و Excel):</span>
                <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-mono text-[11px]">
                  {activeColumns.length} / {MUTAWWIF_COLUMN_OPTIONS.length} أعمدة
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-bold">
                  {pdfOrientation === 'landscape' ? 'تلقائي A4 أفقي (Landscape)' : 'تلقائي A4 عمودي (Portrait)'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllColumns}
                  className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>تحديد الكل</span>
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAllColumns}
                  className="text-[11px] font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                >
                  <Square className="w-3 h-3" />
                  <span>إلغاء تحديد الكل</span>
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={handleResetDefaultColumns}
                  className="text-[11px] font-bold text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>استعادة الأعمدة الافتراضية</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {MUTAWWIF_COLUMN_OPTIONS.map((col) => {
                const isChecked = selectedColumns[col.key];
                return (
                  <label
                    key={col.key}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                      isChecked
                        ? 'bg-amber-500/15 border-amber-500/50 text-white'
                        : 'bg-[#0B1221] border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleColumn(col.key)}
                      className="w-4 h-4 accent-amber-500 rounded cursor-pointer shrink-0"
                    />
                    <span className="truncate">{col.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {notice && (
          <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-4 py-2 text-xs font-bold text-emerald-300 flex items-center gap-2 shrink-0 print:hidden">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* Live Printable A4 Preview Area */}
        <div className="qaem-print-scroll p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-200 print:bg-white print:p-0">
          {reportMode === 'general' &&
            renderOfficialPage({
              pageIndex: 0,
              reportTitle: 'الكشف العام الشامل لتوزيع الحجاج على المطوّفين',
              reportSubtitle:
                'كشف رسمي موحّد يوضح جميع حجاج القافلة والمطوّف المكلّف بكل حاج وفق الحقول المختارة',
              items: generalFilteredItems,
              summaryCards: [
                { label: 'إجمالي الحجاج بالكشف', value: generalFilteredItems.length },
                { label: 'عدد المطوّفين المفعّلين', value: mutawwifs.length },
                {
                  label: 'الحجاج الموزعون',
                  value: generalFilteredItems.filter((i) => Boolean(i.assignedMutawwifId)).length,
                },
                {
                  label: 'بانتظار التوزيع',
                  value: generalFilteredItems.filter((i) => !i.assignedMutawwifId).length,
                },
              ],
            })}

          {reportMode === 'single' &&
            (selectedMutawwifStats ? (
              renderOfficialPage({
                pageIndex: 0,
                reportTitle: `كشف مجموعة المطوّف: ${selectedMutawwifStats.mutawwif.name}`,
                reportSubtitle: 'كشف الحجاج الموزعين على المطوّف لأداء مناسك الطواف والسعي',
                items: selectedMutawwifStats.assignedItems,
                mutawwifHeader: selectedMutawwifStats,
              })
            ) : (
              <div className="bg-white rounded-2xl p-10 text-center text-slate-600 font-bold max-w-3xl mx-auto">
                يرجى تفعيل مطوّف واحد على الأقل من وحدة «إدارة المرشدين الدينيين» لاستخراج الكشف الخاص به.
              </div>
            ))}

          {reportMode === 'all_separate' &&
            (separateMutawwifPages.length > 0 ? (
              separateMutawwifPages.map((st, idx) =>
                renderOfficialPage({
                  pageIndex: idx,
                  reportTitle: `كشف مجموعة المطوّف: ${st.mutawwif.name}`,
                  reportSubtitle: `صفحة مستقلة للمطوّف (${idx + 1} من ${separateMutawwifPages.length}) — كشف التطويف المعتمد`,
                  items: st.assignedItems,
                  mutawwifHeader: st,
                  isPageBreakBefore: idx > 0,
                })
              )
            ) : (
              <div className="bg-white rounded-2xl p-10 text-center text-slate-600 font-bold max-w-3xl mx-auto">
                لا يوجد مطوّفون مفعّلون حالياً في النظام.
              </div>
            ))}
        </div>
      </div>
    </div>,
    document.body
  );
};
