import { useAdaptiveTableHeader } from "./useAdaptiveTableHeader";
import { normalizeGridAmount } from "../core/tables/grid";
import { gridCellEvents, nextGridCell } from "./gridCellEvents";
import { useGridInteraction } from "./useGridInteraction";
import { useMemo, useState } from "react";
import { previousByAccount } from "../core/tables/planTables";
import { buildCostTable } from "../core/tables/costTable";
import { formatYen, formatRate, isValidAmount, amountToYen, yenToAmount } from "../core/domain/amounts";
import { initiativeMonths } from "../core/domain/calendar";
import { type PlanContents } from "../core/domain/plan";
import type { PreviousInput } from "../core/domain/kinds";
import { fillPreviousGrid, pastePreviousGrid } from "../core/tables/previousGrid";
import { previousPeriods, previousPeriodAmount } from "../core/tables/previousPeriods";
import { periodCellClass } from "./periodCellStyle";
import { StatusNotice } from "./StatusNotice";
import { previousSelectionTotal } from "../core/tables/selectionTotal";
import { GridSelectionTotal } from "./GridSelectionTotal";

export function PreviousAmountGrid({ contents, draft, onChange }: {
  contents: PlanContents; draft: PreviousInput | undefined; onChange: (draft: PreviousInput) => void;
}) {
  const { rows, calculationFailed } = useMemo(() => {
    const invalid = draft?.rows.some(row => Object.values(row.amounts).some(value => value !== undefined && value !== "" && !isValidAmount(value))) ?? false;
    try {
      const previous = draft ? new Map(draft.rows.map(row => [row.accountId, Object.fromEntries(initiativeMonths.map(month => [month,
        isValidAmount(row.amounts[month] ?? "0") ? amountToYen(row.amounts[month] ?? "0") : 0]))])) : previousByAccount(contents);
      return { rows: buildCostTable(contents.accounts, contents.aggregations, [], contents.fiscalYear, previous), calculationFailed: invalid };
    } catch {
      return { rows: buildCostTable(contents.accounts, contents.aggregations, [], contents.fiscalYear), calculationFailed: true };
    }
  }, [contents, draft]);
  // A coordinate selection belongs to this exact displayed row structure.
  // Remount interaction state before painting reordered/inserted/deleted rows.
  const structure = rows.map(row => `${row.kind}:${row.id}`).join("|");
  return <PreviousAmountGridBody key={structure} contents={contents} draft={draft} onChange={onChange} rows={rows} calculationFailed={calculationFailed} />;
}

function PreviousAmountGridBody({ contents, draft, onChange, rows, calculationFailed }: {
  contents: PlanContents; draft: PreviousInput | undefined; onChange: (draft: PreviousInput) => void;
  rows: ReturnType<typeof buildCostTable>; calculationFailed: boolean;
}) {
  const grid = useGridInteraction();
  const { selection, setEditing, table, original, bounds, extendSelection } = grid;
  const freezeHeader = useAdaptiveTableHeader(table);
  const [error, setError] = useState("");
  const [cellErrors, setCellErrors] = useState<Record<string, { accountId: number; month: number; message: string }>>({});
  const clearCellError = (accountId: number, month: number) => setCellErrors(current => {
    const next = { ...current }; delete next[`${accountId}:${month}`]; return next;
  });
  const inputsByAccount = useMemo(() => new Map(draft?.rows.map(row => [row.accountId, row])), [draft?.rows]);
  const cellError = Object.values(cellErrors).find(item => !isValidAmount(inputsByAccount.get(item.accountId)?.amounts[item.month] || "0"))?.message;
  const salesGroupId = contents.aggregations.find(group => group.required === "sales")?.id;
  const periodAmounts = useMemo(() => {
    const sales = rows.find(row => row.kind === "group" && row.id === salesGroupId);
    const profit = rows.find(row => row.kind === "group" && row.id === contents.aggregations.find(group => group.required === "ordinary")?.id);
    let failed = false;
    const values = rows.map(row => previousPeriods.map(period => {
      try { return previousPeriodAmount(row, period, sales, profit); }
      catch { failed = true; return undefined; }
    }));
    return { values, failed };
  }, [rows, salesGroupId, contents.aggregations]);
  const salesIndex = rows.findIndex(row => row.kind === "group" && row.id === salesGroupId);
  const rowIds = useMemo(() => rows.map(row => row.kind === "account" ? row.id : null), [rows]);
  const selectedTotal = useMemo(() => previousSelectionTotal(draft, rowIds, selection), [draft, rowIds, selection]);
  const apply = (operation: () => PreviousInput) => {
    try { onChange(operation()); setError(""); setEditing(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "入力できませんでした。"); }
  };
  const changeCell = (accountId: number, month: number, value: string) => draft && onChange({ ...draft,
    rows: draft.rows.map(row => row.accountId === accountId ? { ...row, amounts: { ...row.amounts, [month]: value } } : row) });
  const renderRow = (row: (typeof rows)[number], rowIndex: number) => <tr key={`${row.kind}:${row.id}`} className={`cost-data-row${row.kind !== "account" ? ` cost-subtotal${row.required ? " cost-required" : ""}` : ""}${row.kind === "group" && row.id === salesGroupId ? " cost-sales-anchor" : ""}`}>
          <th scope="row" className="initiative-list-name">{row.name}</th>
          {initiativeMonths.map((month, column) => {
            const cell = { row: rowIndex, column };
            const selected = bounds && rowIndex >= bounds.top && rowIndex <= bounds.bottom && column >= bounds.left && column <= bounds.right;
            const value = inputsByAccount.get(row.id)?.amounts[month] ?? "0";
            const events = row.kind === "account" && draft ? gridCellEvents(grid, cell, value, {
              captureOriginal: () => { original.current = value; },
              change: value => changeCell(row.id, month, value),
              cancel: editing => {
                if (editing) {
                  changeCell(row.id, month, original.current);
                  if (isValidAmount(original.current || "0")) clearCellError(row.id, month);
                }
              },
              commit: () => {
                try { changeCell(row.id, month, normalizeGridAmount(value)); clearCellError(row.id, month); return true; }
                catch (failure) { setCellErrors(current => ({ ...current, [`${row.id}:${month}`]: { accountId: row.id, month, message: (failure as Error).message } })); return false; }
              },
              fill: (selection, text) => apply(() => fillPreviousGrid(draft, rowIds, selection, text)),
              paste: (start, text, selection) => apply(() => pastePreviousGrid(draft, rowIds, start, text, selection)),
              copy: bounds => rows.slice(bounds.top, bounds.bottom + 1).map(item => initiativeMonths.slice(bounds.left, bounds.right + 1).map(m =>
                item.kind === "account" ? inputsByAccount.get(item.id)?.amounts[m] || "0" : calculationFailed ? "" : item.kind === "ratio" ? formatRate(item.previous[m]) : item.previous[m] === undefined ? "" : yenToAmount(item.previous[m]!)
              ).join("\t")).join("\n"),
              next: (from, key, shift) => {
                const vertical = key === "ArrowUp" || ((key === "Enter" || key === "Tab") && shift) ? -1 : 1;
                return nextGridCell(from, key, shift, rows.length, target => rowIds[target.row] !== null,
                  target => ({ ...target, row: target.row + vertical }));
              },
            }) : null;
            return <td key={month} className={`${row.kind === "account" && draft ? "previous-input-cell" : ""}${selected ? " previous-cell-selected" : ""}`}
              onPointerEnter={event => extendSelection(cell, event.buttons)}>
              {row.kind !== "account" || !draft ? (calculationFailed ? "" : row.kind === "ratio" ? formatRate(row.previous[month]) : formatYen(row.previous[month])) :
                <input type="text" inputMode="decimal" data-row={rowIndex} data-column={column}
                  aria-label={`${row.name} ${month}月の前年金額`} aria-invalid={value !== undefined && value !== "" && !isValidAmount(value)} value={value}
                  onPointerDown={events!.onPointerDown}
                  {...events!.input} />}
            </td>;
          })}
          {previousPeriods.map((period, index) => <td key={period.id} className={periodCellClass(period, true)}>
            {calculationFailed ? "" : row.kind === "ratio" ? formatRate(periodAmounts.values[rowIndex]?.[index]) : formatYen(periodAmounts.values[rowIndex]?.[index])}
          </td>)}
        </tr>;
  return <>
    <StatusNotice message={error || cellError || (calculationFailed || periodAmounts.failed ? "金額の合計が正確に計算できる範囲を超えています。分類を絞るか金額を修正してください。" : "")} error onDismiss={() => { setError(""); setCellErrors({}); }} />
    <GridSelectionTotal total={selectedTotal} accountsOnly />
    <div className="previous-grid-container" role="region" aria-label="前年の月別金額" tabIndex={0}>
      <table ref={table} className={`initiative-list-table cost-table previous-grid${freezeHeader ? "" : " cost-header-scroll"}`} aria-label="前年入力の月別金額">
        <thead>
          <tr data-column-header><th scope="col" className="initiative-list-name">科目・集計</th>{initiativeMonths.map(month => <th scope="col" key={month}>{month}月</th>)}{previousPeriods.map(period => <th scope="col" key={period.id} className={periodCellClass(period, true)}>{period.label}</th>)}</tr>
          {rows.slice(0, salesIndex + 1).map(renderRow)}
        </thead>
        <tbody>{rows.slice(salesIndex + 1).map((row, index) => renderRow(row, salesIndex + 1 + index))}</tbody>
      </table>
    </div>
  </>;
}
