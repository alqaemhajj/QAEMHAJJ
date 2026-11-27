import React, { useMemo } from 'react';
import {
  DynamicColumnDef,
  DynamicColumnSelectorPanel,
  PilgrimColumnContext,
  PilgrimRosterType,
  buildPilgrimRosterColumns,
  usePersistedColumns,
} from './DynamicColumnSelector';
import { PilgrimExportButtons } from './OfficialReportPrintModal';
import { AlQaemExcelSummaryItem, exportAlQaemExcelReport } from '../../utils/alqaemExcelEngine';
import { Pilgrim } from '../../types';

export interface OfficialPrintModalPayload {
  title: string;
  subtitle?: string;
  category?: string;
  filterSummary?: string;
  filename: string;
  columns: string[];
  data: (string | number)[][];
  summaryCards?: AlQaemExcelSummaryItem[];
  signatureRightLabel?: string;
  onExportExcel?: () => void;
}

interface DynamicPilgrimRosterSectionProps {
  rosterType: PilgrimRosterType;
  storageKey?: string;
  pilgrims: Pilgrim[];
  columnContext: PilgrimColumnContext;
  /** Optional accent color class for the # sequence column */
  accentColorClass?: string;
  /** Header title & optional badges rendered inside the table card header */
  tableHeaderContent?: React.ReactNode;
  /** Optional custom cell renderer for specialized badges/inline editors */
  renderCustomCell?: (
    pilgrim: Pilgrim,
    colKey: string,
    index: number
  ) => React.ReactNode | undefined;
  /** Optional trailing Actions column on screen (excluded from PDF & Excel) */
  actionsHeader?: string;
  renderActions?: (pilgrim: Pilgrim, index: number) => React.ReactNode;
  /** Optional table footer (e.g. Financial Grand Total row) */
  renderTableFooter?: (totalVisibleColsCount: number) => React.ReactNode;
  /** Empty state message */
  emptyStateContent?: React.ReactNode;
  /** Report metadata for synced PDF Preview & Excel Export */
  reportMeta: {
    title: string;
    subtitle: string;
    category: string;
    filename: string;
    filterSummary?: string;
    signatureRightLabel?: string;
    generatedBy: string;
    summaryCards?: AlQaemExcelSummaryItem[];
    /** Optional extra summary row appended to PDF & Excel (e.g. Financial Grand Total) */
    buildSummaryRow?: (activeColumns: DynamicColumnDef<Pilgrim>[]) => (string | number)[] | null;
  };
  onOpenOfficialPrintModal: (payload: OfficialPrintModalPayload) => void;
  /** Optional extra toolbar content rendered next to the export buttons */
  toolbarLeftContent?: React.ReactNode;
}

export const DynamicPilgrimRosterSection: React.FC<DynamicPilgrimRosterSectionProps> = ({
  rosterType,
  storageKey,
  pilgrims,
  columnContext,
  accentColorClass = 'text-amber-500 bg-amber-500/5',
  tableHeaderContent,
  renderCustomCell,
  actionsHeader = 'إجراءات',
  renderActions,
  renderTableFooter,
  emptyStateContent,
  reportMeta,
  onOpenOfficialPrintModal,
  toolbarLeftContent,
}) => {
  const effectiveStorageKey = storageKey || rosterType;

  const allColumns = useMemo(
    () => buildPilgrimRosterColumns(rosterType, columnContext),
    [rosterType, columnContext]
  );

  const {
    selectedMap,
    activeColumns,
    toggleColumn,
    selectAll,
    deselectAll,
    resetDefaults,
  } = usePersistedColumns(effectiveStorageKey, allColumns);

  const buildExportMatrix = () => {
    const headers = ['#', ...activeColumns.map((c) => c.label)];
    const rows: (string | number)[][] = pilgrims.map((p, idx) => [
      idx + 1,
      ...activeColumns.map((col) => col.getValue(p, idx)),
    ]);

    if (reportMeta.buildSummaryRow) {
      const summaryRow = reportMeta.buildSummaryRow(activeColumns);
      if (summaryRow) {
        rows.push(summaryRow);
      }
    }

    return { headers, rows };
  };

  const handleExportExcel = () => {
    if (activeColumns.length === 0) return;
    const { headers, rows } = buildExportMatrix();
    const dateStamp = new Date().toISOString().split('T')[0];

    void exportAlQaemExcelReport({
      reportTitle: reportMeta.title,
      subtitle: reportMeta.filterSummary
        ? `${reportMeta.subtitle} — (${reportMeta.filterSummary})`
        : reportMeta.subtitle,
      category: reportMeta.category,
      filename: `${reportMeta.filename}_${dateStamp}`,
      columns: headers,
      rows,
      generatedBy: reportMeta.generatedBy,
      summaryCards: reportMeta.summaryCards,
    });
  };

  const handlePrintPdf = () => {
    if (activeColumns.length === 0) return;
    const { headers, rows } = buildExportMatrix();
    onOpenOfficialPrintModal({
      title: reportMeta.title,
      subtitle: reportMeta.subtitle,
      category: reportMeta.category,
      filterSummary: reportMeta.filterSummary,
      filename: reportMeta.filename,
      columns: headers,
      data: rows,
      summaryCards: reportMeta.summaryCards,
      signatureRightLabel: reportMeta.signatureRightLabel,
      onExportExcel: handleExportExcel,
    });
  };

  const hasActionsCol = Boolean(renderActions);
  const totalRenderedCols = 1 + activeColumns.length + (hasActionsCol ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Unified Dynamic Column Selector + Synced Export Buttons */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-[200px]">{toolbarLeftContent}</div>
          <PilgrimExportButtons
            onPrintPdf={handlePrintPdf}
            onExportExcel={handleExportExcel}
            count={pilgrims.length}
            disabled={activeColumns.length === 0}
          />
        </div>

        <DynamicColumnSelectorPanel
          columns={allColumns}
          selectedMap={selectedMap}
          onToggle={toggleColumn}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          onResetDefaults={resetDefaults}
        />
      </div>

      {/* Live Dynamic Screen Table */}
      {activeColumns.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
          {tableHeaderContent && (
            <div className="bg-slate-50 dark:bg-slate-950 p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
              {tableHeaderContent}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-950 text-xs uppercase text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-4 text-center font-black w-12"># (م)</th>
                  {activeColumns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-5 py-4 font-bold whitespace-nowrap ${
                        col.group === 'specific'
                          ? 'text-slate-900 dark:text-amber-300'
                          : ''
                      }`}
                    >
                      {col.shortHeader || col.label}
                    </th>
                  ))}
                  {hasActionsCol && (
                    <th className="px-5 py-4 text-center font-bold whitespace-nowrap">
                      {actionsHeader}
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {pilgrims.map((pilgrim, index) => (
                  <tr
                    key={pilgrim.id || `${pilgrim.nationalId}_${index}`}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
                  >
                    <td
                      className={`px-4 py-3.5 text-center font-mono font-black text-xs ${accentColorClass}`}
                    >
                      {index + 1}
                    </td>

                    {activeColumns.map((col) => {
                      const customNode = renderCustomCell?.(pilgrim, col.key, index);
                      if (customNode !== undefined) {
                        return (
                          <td key={col.key} className="px-5 py-3.5 align-middle">
                            {customNode}
                          </td>
                        );
                      }

                      if (col.key === 'signatureNotes') {
                        return (
                          <td key={col.key} className="px-5 py-3.5 align-middle">
                            <div className="min-w-[110px] h-5 border-b border-dashed border-slate-300 dark:border-slate-700" />
                          </td>
                        );
                      }

                      const rawVal = col.getValue(pilgrim, index);
                      return (
                        <td
                          key={col.key}
                          dir={col.isLtr ? 'ltr' : 'rtl'}
                          className={`px-5 py-3.5 align-middle text-xs ${
                            col.key === 'fullName'
                              ? 'font-bold text-slate-900 dark:text-white whitespace-nowrap text-sm'
                              : col.isTextProtected || col.isLtr
                              ? 'font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {rawVal}
                        </td>
                      );
                    })}

                    {hasActionsCol && (
                      <td className="px-5 py-3.5 align-middle text-center">
                        {renderActions?.(pilgrim, index)}
                      </td>
                    )}
                  </tr>
                ))}

                {pilgrims.length === 0 && (
                  <tr>
                    <td
                      colSpan={totalRenderedCols}
                      className="px-6 py-12 text-center text-slate-400 italic"
                    >
                      {emptyStateContent || 'لا توجد سجلات مطابقة لمعايير التصفية الحالية'}
                    </td>
                  </tr>
                )}
              </tbody>

              {renderTableFooter && renderTableFooter(totalRenderedCols)}
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

interface InlineQuickTextCellProps {
  value: string;
  placeholder?: string;
  accentClass?: string;
  dir?: 'rtl' | 'ltr';
  onSave: (nextValue: string) => void;
}

export const InlineQuickTextCell: React.FC<InlineQuickTextCellProps> = ({
  value,
  placeholder,
  accentClass = 'border-slate-300 dark:border-slate-700 focus:border-amber-500',
  dir = 'rtl',
  onSave,
}) => {
  const [draft, setDraft] = React.useState(value);
  const [savedFlash, setSavedFlash] = React.useState(false);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  const isDirty = draft.trim() !== value.trim();

  const commit = () => {
    if (!isDirty) return;
    onSave(draft.trim());
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  return (
    <div className="flex items-center gap-1.5 min-w-[155px]">
      <input
        type="text"
        dir={dir}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        onBlur={() => {
          if (isDirty) commit();
        }}
        placeholder={placeholder}
        className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none transition placeholder:font-normal placeholder:text-slate-400 ${accentClass}`}
      />
      {isDirty && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            commit();
          }}
          className="px-2 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black shrink-0 cursor-pointer"
        >
          حفظ
        </button>
      )}
      {savedFlash && !isDirty && (
        <span className="text-[10px] font-black text-emerald-500 shrink-0">✓</span>
      )}
    </div>
  );
};

