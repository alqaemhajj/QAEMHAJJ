import React from 'react';
import { OfficialReportPrintModal } from '../common/OfficialReportPrintModal';

interface GiftPrintModalProps {
  title: string;
  subtitle?: string;
  generatedBy: string;
  filterSummary?: string;
  columns: string[];
  data: (string | number)[][];
  summaryCards?: { label: string; value: string | number }[];
  signatureRightLabel?: string;
  excelFilename?: string;
  onExportExcel?: () => void;
  onClose: () => void;
}

export const GiftPrintModal: React.FC<GiftPrintModalProps> = ({
  title,
  subtitle,
  generatedBy,
  filterSummary,
  columns,
  data,
  summaryCards = [],
  signatureRightLabel = 'مسؤول وحدة توزيع الهدايا',
  excelFilename,
  onExportExcel,
  onClose,
}) => {
  return (
    <OfficialReportPrintModal
      title={title}
      subtitle={subtitle}
      generatedBy={generatedBy}
      filterSummary={filterSummary}
      columns={columns}
      data={data}
      summaryCards={summaryCards}
      signatureRightLabel={signatureRightLabel}
      excelFilename={excelFilename}
      onExportExcel={onExportExcel}
      onClose={onClose}
    />
  );
};
