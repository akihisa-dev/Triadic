import { GridAmountInput } from "./GridAmountInput";
import { useAdaptiveTableHeader } from "./useAdaptiveTableHeader";
import { normalizeGridAmount } from "../core/tables/grid";
import { gridCellEvents, nextGridCell } from "./gridCellEvents";
import { useGridInteraction } from "./useGridInteraction";
import { useMemo, useRef, useState, type ReactElement } from "react";
import { previousGridCalculator } from "../core/tables/previousGridTable";
import { previousByAccount } from "../core/tables/planTables";
import { buildCostTable } from "../core/tables/costTable";
import { formatYen, formatRate, isValidAmount, yenToAmount } from "../core/domain/amounts";
import { initiativeMonths } from "../core/domain/calendar";
import { type PlanContents } from "../core/domain/plan";
import type { PreviousInput } from "../core/domain/kinds";
import { fillPreviousGrid, pastePreviousGrid } from "../core/tables/previousGrid";
import { previousPeriods, previousPeriodAmount } from "../core/tables/previousPeriods";
import { periodCellClass } from "./periodCellStyle";
import { StatusNotice } from "./StatusNotice";
import { previousSelectionTotal } from "../core/tables/selectionTotal";
import { GridSelectionTotal } from "./GridSelectionTotal";

export function PreviousAmountGrid({ contents, draft, onChange, readOnly = false }: {
  contents: PlanContents; draft: PreviousInput | undefined; onChange: (draft: PreviousInput) => void; readOnly?: boolean;
}) {
  const calculate = useMemo(() => previousGridCalculator(contents), [contents.accounts, contents.aggregations, contents.fiscalYear]);
  const { rows, calculationFailed } = useMemo(() => {
    if (draft) return calculate(draft);
    try {
      return { rows: buildCostTable(contents.accounts, contents.aggregations, [], contents.fiscalYear, previousByAccount(contents)), calculationFailed: false };
    } catch {
      return { rows: buildCostTable(contents.accounts, contents.aggregations, [], contents.fiscalYear), calculationFailed: true };
    }
  }, [contents, draft, calculate]);
  // A coordinate selection belongs to this exact displayed row structure.
  // Remount interaction state before painting reordered/inserted/deleted rows.
  const structure = rows.map(row => `${row.kind}:${row.id}`).join("|");
  return <PreviousAmountGridBody key={structure} contents={contents} draft={draft} onChange={onChange} readOnly={readOnly} rows={rows} calculationFailed={calculationFailed} />;
}

function PreviousAmountGridBody({ contents, draft, onChange, rows, calculationFailed, readOnly }: {
  contents: PlanContents; draft: PreviousInput | undefined; onChange: (draft: PreviousInput) => void; readOnly?: boolean;
  rows: ReturnType<typeof buildCostTable>; calculationFailed: boolean;
}) {
  const grid = useGridInteraction();
  const { selection, setEditing, table, original, bounds, extendSelection } = grid;
  const freezeHeader = useAdaptiveTableHeader(table);
  const [error, setError] = useState("");
  const expressionOriginals = useRef(new Map<string, string>());
  const [cellErrors, setCellErrors] = useState<Record<string, { accountId: number; month: number; message: string }>>({});
  const clearCellError = (accountId: number, month: number) => setCellErrors(current => {
    const next = { ...current }; delete next[`${accountId}:${month}`]; return next;
  });
  const inputsByAccount = useMemo(() => new Map(draft?.rows.map(row => [row.accountId, row])), [draft?.rows]);
  for (const key of expressionOriginals.current.keys()) {
    const [accountId, month] = key.split(":").map(Number);
    if (!inputsByAccount.get(accountId!)?.amounts[month!]?.trim().startsWith("=")) expressionOriginals.current.delete(key);
  }
  const cellError = Object.values(cellErrors).find(item => !isValidAmount(inputsByAccount.get(item.accountId)?.amounts[item.month] || "0"))?.message;
  const salesGroupId = contents.aggregations.find(group => group.required === "sales")?.id;
  const ordinaryGroupId = contents.aggregations.find(group => group.required === "ordinary")?.id;
  type CostRow = (typeof rows)[number];
  const periodCache = useRef(new WeakMap<CostRow, { sales: CostRow | undefined; profit: CostRow | undefined; values: (number | undefined)[]; failed: boolean }>());
  const periodAmounts = useMemo(() => {
    const sales = rows.find(row => row.kind === "group" && row.id === salesGroupId);
    const profit = rows.find(row => row.kind === "group" && row.id === ordinaryGroupId);
    let failed = false;
    const values = rows.map(row => {
      const cached = periodCache.current.get(row);
      if (cached && (row.kind !== "ratio" || cached.sales === sales && cached.profit === profit)) {
        failed ||= cached.failed; return cached.values;
      }
      let rowFailed = false;
      const values = previousPeriods.map(period => {
        try { return previousPeriodAmount(row, period, sales, profit); }
        catch { rowFailed = true; return undefined; }
      });
      periodCache.current.set(row, { sales, profit, values, failed: rowFailed });
      failed ||= rowFailed; return values;
    });
    return { values, failed };
  }, [rows, salesGroupId, ordinaryGroupId]);
  const salesIndex = rows.findIndex(row => row.kind === "group" && row.id === salesGroupId);
  const rowIds = useMemo(() => rows.map(row => row.kind === "account" ? row.id : null), [rows]);
  const selectedTotal = useMemo(() => previousSelectionTotal(draft, rowIds, selection), [draft, rowIds, selection]);
  const selectionDescription = bounds && selectedTotal ? (() => {
    const selected = rows.slice(bounds.top, bounds.bottom + 1).map((row, offset) => ({ row, index: bounds.top + offset })).filter(item => item.row.kind === "account");
    if (!selected.length) return "";
    const first = selected[0]!, last = selected.at(-1)!;
    return `${first.index + 1}行目 ${first.row.name} ${initiativeMonths[bounds.left]}月から${last.index + 1}行目 ${last.row.name} ${initiativeMonths[bounds.right]}月まで、${selected.length * (bounds.right - bounds.left + 1)}セルを選択`;
  })() : "";
  // Cached row elements keep handlers, so cross-row operations read current input/selection.
  const latest = useRef({ grid, draft, onChange, readOnly, rows, rowIds, inputsByAccount, calculationFailed });
  latest.current = { grid, draft, onChange, readOnly, rows, rowIds, inputsByAccount, calculationFailed };
  const accountOrder = draft?.rows.map(row => row.accountId).join("|");
  const inputIndices = useMemo(() => new Map(draft?.rows.map((row, index) => [row.accountId, index])), [accountOrder]);
  const latestIndices = useRef(inputIndices); latestIndices.current = inputIndices;
  const apply = (operation: () => PreviousInput) => {
    if (latest.current.readOnly) return;
    try { latest.current.onChange(operation()); setError(""); setEditing(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "入力できませんでした。"); }
  };
  const changeCell = (accountId: number, month: number, value: string) => {
    if (latest.current.readOnly) return;
    const { draft, onChange } = latest.current;
    const index = latestIndices.current.get(accountId);
    if (!draft || index === undefined) return;
    const key = `${accountId}:${month}`;
    if (value.trim().startsWith("=")) {
      if (!expressionOriginals.current.has(key)) expressionOriginals.current.set(key, original.current);
    } else expressionOriginals.current.delete(key);
    const rows = draft.rows.slice(), row = rows[index]!;
    rows[index] = { ...row, amounts: { ...row.amounts, [month]: value } };
    onChange({ ...draft, rows });
  };
  // Reuse exact elements: React can skip unchanged rows without rebuilding their inputs.
  const rowCache = useRef(new Map<string, { row: CostRow; input: PreviousInput["rows"][number] | undefined; periods: (number | undefined)[] | undefined; selected: string; failed: boolean; editable: boolean; readOnly: boolean | undefined; activeEdit: number | null; element: ReactElement }>());
  const renderRow = (row: CostRow, rowIndex: number) => {
    const key = `${row.kind}:${row.id}`, input = row.kind === "account" ? inputsByAccount.get(row.id) : undefined;
    const selected = bounds && rowIndex >= bounds.top && rowIndex <= bounds.bottom ? `${bounds.left}:${bounds.right}` : "";
    const activeEdit = grid.editing && selection?.end.row === rowIndex ? selection.end.column : null;
    const periods = periodAmounts.values[rowIndex], cached = rowCache.current.get(key);
    if (cached && cached.row === row && cached.input === input && cached.periods === periods && cached.selected === selected
      && cached.failed === calculationFailed && cached.readOnly === readOnly && cached.editable === !!draft && cached.activeEdit === activeEdit) return cached.element;
    const element = <tr key={`${row.kind}:${row.id}`} className={`cost-data-row${row.kind !== "account" ? ` cost-subtotal${row.required ? " cost-required" : ""}` : ""}${row.kind === "group" && row.id === salesGroupId ? " cost-sales-anchor" : ""}`}>
          <th scope="row" className="initiative-list-name">{row.name}</th>
          {initiativeMonths.map((month, column) => {
            const cell = { row: rowIndex, column };
            const selected = bounds && rowIndex >= bounds.top && rowIndex <= bounds.bottom && column >= bounds.left && column <= bounds.right;
            const value = inputsByAccount.get(row.id)?.amounts[month] ?? "0";
            const events = row.kind === "account" && draft ? gridCellEvents(() => latest.current.grid, cell, value, {
              captureOriginal: () => { original.current = expressionOriginals.current.get(`${row.id}:${month}`) ?? value; },
              change: value => changeCell(row.id, month, value),
              cancel: editing => {
                if (editing || expressionOriginals.current.has(`${row.id}:${month}`)) {
                  changeCell(row.id, month, original.current);
                  if (isValidAmount(original.current || "0")) clearCellError(row.id, month);
                }
              },
              commit: () => {
                try { changeCell(row.id, month, normalizeGridAmount(value)); clearCellError(row.id, month); return true; }
                catch (failure) { setCellErrors(current => ({ ...current, [`${row.id}:${month}`]: { accountId: row.id, month, message: (failure as Error).message } })); return false; }
              },
              fill: (selection, text) => apply(() => fillPreviousGrid(latest.current.draft!, latest.current.rowIds, selection, text)),
              paste: (start, text, selection) => apply(() => pastePreviousGrid(latest.current.draft!, latest.current.rowIds, start, text, selection)),
              copy: bounds => { const { rows, inputsByAccount, calculationFailed } = latest.current; return rows.slice(bounds.top, bounds.bottom + 1).map(item => initiativeMonths.slice(bounds.left, bounds.right + 1).map(m =>
                item.kind === "account" ? inputsByAccount.get(item.id)?.amounts[m] || "0" : calculationFailed ? "" : item.kind === "ratio" ? formatRate(item.previous[m]) : item.previous[m] === undefined ? "" : yenToAmount(item.previous[m]!)
              ).join("\t")).join("\n"); },
              next: (from, key, shift) => {
                const { rows, rowIds } = latest.current;
                const vertical = key === "ArrowUp" || ((key === "Enter" || key === "Tab") && shift) ? -1 : 1;
                return nextGridCell(from, key, shift, rows.length, target => rowIds[target.row] !== null,
                  target => ({ ...target, row: target.row + vertical }));
              },
            }) : null;
            return <td key={month} className={`${row.kind === "account" && draft ? "previous-input-cell" : ""}${selected ? " previous-cell-selected" : ""}`}
              onPointerEnter={event => extendSelection(cell, event.buttons)}>
              {row.kind !== "account" || !draft ? (calculationFailed ? "" : row.kind === "ratio" ? formatRate(row.previous[month]) : formatYen(row.previous[month])) :
                <GridAmountInput readOnly={readOnly} editing={activeEdit === column} type="text" inputMode="text" data-row={rowIndex} data-column={column}
                  aria-label={`${row.name} ${month}月の前年金額`} aria-invalid={value !== undefined && value !== "" && !isValidAmount(value)} value={value}
                  onPointerDown={events!.onPointerDown}
                  {...events!.input} />}
            </td>;
          })}
          {previousPeriods.map((period, index) => <td key={period.id} className={periodCellClass(period, true)}>
            {calculationFailed ? "" : row.kind === "ratio" ? formatRate(periodAmounts.values[rowIndex]?.[index]) : formatYen(periodAmounts.values[rowIndex]?.[index])}
          </td>)}
        </tr>;
    rowCache.current.set(key, { row, input, periods, selected, failed: calculationFailed, editable: !!draft, readOnly, activeEdit, element });
    return element;
  };
  return <>
    <StatusNotice message={error || cellError || (calculationFailed || periodAmounts.failed ? "金額の合計が正確に計算できる範囲を超えています。分類を絞るか金額を修正してください。" : "")} error onDismiss={() => { setError(""); setCellErrors({}); }} />
    <GridSelectionTotal total={selectedTotal} accountsOnly selectionDescription={selectionDescription} />
    <div className="previous-grid-container" role="region" aria-label="前年の月別金額" tabIndex={0}>
      <table ref={table} className={`initiative-list-table cost-table previous-grid${freezeHeader ? "" : " cost-header-scroll"}`} aria-label="前年入力の月別金額">
        <thead>
          <tr data-column-header><th scope="col" className="initiative-list-name">科目・集計</th>{initiativeMonths.map((month, column) => <th scope="col" key={month} className={bounds && column >= bounds.left && column <= bounds.right ? "grid-month-selected" : undefined}>{month}月</th>)}{previousPeriods.map(period => <th scope="col" key={period.id} className={periodCellClass(period, true)}>{period.label}</th>)}</tr>
          {rows.slice(0, salesIndex + 1).map(renderRow)}
        </thead>
        <tbody>{rows.slice(salesIndex + 1).map((row, index) => renderRow(row, salesIndex + 1 + index))}</tbody>
      </table>
    </div>
  </>;
}
