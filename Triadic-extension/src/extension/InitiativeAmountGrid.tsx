import { GridAmountInput } from "./GridAmountInput";
import { hasUnclassifiedAmount } from "../core/domain/budgetHints";
import { AccountRowSelect } from "./AccountRowSelect";
import { gridCellEvents, nextGridCell } from "./gridCellEvents";
import { useGridInteraction } from "./useGridInteraction";
import { useHistoryReadOnly } from "./HistoryReadOnly";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolvedAmount, type KindId } from "../core/domain/kinds";
import { formatYen, isValidAmount } from "../core/domain/amounts";
import { initiativeMonths as months } from "../core/domain/calendar";
import { type InitiativeEntryDraft } from "../core/domain/plan";
import { type Account } from "../core/domain/accountMaster";
import { canEditInitiativeCell, cancelInitiativeCell, changeInitiativeCell, fillInitiativeGrid, pasteInitiativeGrid, moveInitiativeGrid, initiativeAmountTotals } from "../core/tables/initiativeGrid";
import { gridBounds, normalizeGridAmount, type GridCell, type GridSelection } from "../core/tables/grid";
import { StatusNotice } from "./StatusNotice";
import { initiativeSelectionTotal } from "../core/tables/selectionTotal";
import { GridSelectionTotal } from "./GridSelectionTotal";
import "./InitiativeAmountGrid.css";

export function InitiativeAmountGrid({ draft, kind, accounts, isSaving, rowOperationsDisabled = false, onDraftChange }: {
  draft: InitiativeEntryDraft; kind: KindId; accounts: Account[];
  rowOperationsDisabled?: boolean;
  isSaving: boolean; onDraftChange: (draft: InitiativeEntryDraft) => void;
}) {
  const readOnly = useHistoryReadOnly();
  const grid = useGridInteraction();
  const { selection, setSelection, setEditing, table, original, bounds, extendSelection } = grid;
  const [error, setError] = useState("");
  const [activeAccount, setActiveAccount] = useState<string | null>(null);
  const originalInherited = useRef(false);
  const accountsById = useMemo(() => new Map(accounts.map(account => [account.id, account])), [accounts]);
  const { rows, invalidNumbers } = draft;
  const hints = useMemo(() => rows.map(row => ({
    unclassified: hasUnclassifiedAmount(row, kind, accountsById.get(row.accountId!)),
  })), [rows, kind, accountsById]);
  const totals = useMemo(() => initiativeAmountTotals({ rows, invalidNumbers: Boolean(invalidNumbers) }, kind, accounts), [rows, invalidNumbers, kind, accounts]);
  const selectedTotal = useMemo(() => initiativeSelectionTotal(draft, kind, selection), [draft, kind, selection]);
  const selectionDescription = bounds && selectedTotal ? (() => {
    const first = draft.rows[bounds.top], last = draft.rows[bounds.bottom];
    if (!first || !last) return "";
    const name = (row: typeof first) => accountsById.get(row.accountId!)?.accountName ?? "科目未選択";
    const count = draft.rows.slice(bounds.top, bounds.bottom + 1).filter(row => row.accountId !== null).length * (bounds.right - bounds.left + 1);
    return `${bounds.top + 1}行目 ${name(first)} ${months[bounds.left]}月から${bounds.bottom + 1}行目 ${name(last)} ${months[bounds.right]}月まで、${count}セルを選択`;
  })() : "";
  useEffect(() => { setSelection(null); setEditing(false); grid.setCut(null); }, [draft.rows.map(row => `${row.id}:${row.accountId}`).join("|")]);
  const valueAt = (cell: GridCell, source = draft) => {
    const row = source.rows[cell.row]!;
    const month = months[cell.column]!;
    return kind === 1 ? row.amounts[month] ?? "0" : row.overrides?.[kind]?.[month] ?? resolvedAmount(row, kind, month);
  };
  const apply = (operation: () => InitiativeEntryDraft) => {
    if (readOnly || isSaving) return false;
    try {
      onDraftChange(operation()); setError(""); setEditing(false); return true;
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : "入力できませんでした。"); return false; }
  };
  const cutStamp = (selection: GridSelection) => {
    const bounds = gridBounds(selection);
    return JSON.stringify([draft.rows.map(row => [row.id, row.accountId]), draft.rows.slice(bounds.top, bounds.bottom + 1).map(row =>
      months.slice(bounds.left, bounds.right + 1).map(month => [row.amounts[month], row.overrides?.[kind]?.[month], row.invalidAmounts?.[kind]?.[month]]))]);
  };
  const changeCell = (cell: GridCell, value: string, badInput = false) => {
    if (isSaving || !canEditInitiativeCell(draft, kind, cell)) return;
    onDraftChange(changeInitiativeCell(draft, kind, cell, value, badInput || value !== "" && !isValidAmount(value) ? { original: original.current, inherited: originalInherited.current } : undefined));
  };
  return <>
    <StatusNotice message={error || totals.error || selectedTotal?.error || ""} error {...(error ? { onDismiss: () => setError("") } : {})} />
    <GridSelectionTotal total={selectedTotal} compact selectionDescription={selectionDescription} />
    <div className="initiative-grid-scroll">
        <table ref={table} className="initiative-amount-table" aria-label="月別計画金額">
          <thead>
            <tr>
              <th scope="col">勘定科目</th>
              {months.map((month, column) => <th key={month} scope="col" className={bounds && column >= bounds.left && column <= bounds.right ? "grid-month-selected" : undefined}>{month}月</th>)}
            </tr>
          </thead>
          <tbody>
            {draft.rows.map((row, index) => {
              const rowKey = row.id ?? `draft:${index}`;
              const accountName = accountsById.get(row.accountId!)?.accountName ?? `${index + 1}行目`;
              const unclassified = hints[index]!.unclassified;
              return <tr key={row.id ?? index}>
                <th scope="row">
                  <div className="initiative-account-cell">
                  <AccountRowSelect label={`${index + 1}行目の勘定科目`} value={row.accountId} accounts={accounts} account={accountsById.get(row.accountId!)}
                    disabled={readOnly || isSaving || rowOperationsDisabled || accounts.length === 0}
                    active={activeAccount === rowKey} onActivate={() => setActiveAccount(rowKey)}
                    onDeactivate={() => setActiveAccount(current => current === rowKey ? null : current)}
                    onChange={accountId => onDraftChange({ ...draft, rows: draft.rows.map((current, currentIndex) => currentIndex === index
                      ? { ...current, accountId } : current) })} />
                  <button type="button" className="text-button" aria-label={`${index + 1}行目を削除`} disabled={readOnly || isSaving || rowOperationsDisabled} onClick={() => onDraftChange({ ...draft, rows: draft.rows.filter((_, position) => position !== index) })}>削除</button>
                  </div>
                  {unclassified && <span className="budget-attribute-hint" title="科目属性がなく、売上・費用・利益に含まれていません。勘定科目マスタで設定できます。">属性未設定</span>}
                </th>
                {months.map((month, column) => {
                  const cell = { row: index, column };
                  const value = valueAt(cell);
                  const invalidInput = row.invalidAmounts?.[kind]?.[month];
                  const captureOriginal = () => {
                    original.current = invalidInput?.original ?? value;
                    originalInherited.current = invalidInput?.inherited ?? (kind === 2 && row.overrides?.[2]?.[month] === undefined);
                  };
                  const acceptInput = (input: HTMLInputElement) => {
                    if (input.validity.badInput) { setError("金額に有効な数値を入力してください。"); return false; }
                    return true;
                  };
                  const events = gridCellEvents(grid, cell, value, {
                    captureOriginal, blocked: readOnly || isSaving, onTyping: input => input.select(),
                    change: (value, badInput) => changeCell(cell, value, badInput),
                    cancel: editing => {
                      if (editing || invalidInput) onDraftChange(cancelInitiativeCell(draft, kind, cell, { original: original.current, inherited: originalInherited.current }));
                      setError("");
                    },
                    commit: input => {
                      if (!acceptInput(input)) return false;
                      try { changeCell(cell, normalizeGridAmount(value)); setError(""); return true; }
                      catch (failure) { setError((failure as Error).message); return false; }
                    },
                    fill: (selection, text, input) => {
                      if (input && !acceptInput(input)) return;
                      apply(() => fillInitiativeGrid(draft, kind, selection, text));
                    },
                    paste: (start, text, selection) => apply(() => pasteInitiativeGrid(draft, kind, start, text, selection)),
                    cutStamp: selection => {
                      try { const bounds = gridBounds(selection); moveInitiativeGrid(draft, kind, selection, { row: bounds.top, column: bounds.left }); return cutStamp(selection); }
                      catch (failure) { setError((failure as Error).message); return null; }
                    },
                    move: (source, start, stamp) => apply(() => {
                      if (stamp !== cutStamp(source)) throw new Error("切り取り後に入力内容が変わりました。範囲を選び直してください。");
                      return moveInitiativeGrid(draft, kind, source, start);
                    }),
                    copy: bounds => draft.rows.slice(bounds.top, bounds.bottom + 1).map((_, offset) =>
                      months.slice(bounds.left, bounds.right + 1).map((_, columnOffset) => valueAt({ row: bounds.top + offset, column: bounds.left + columnOffset }) || "0").join("\t")
                    ).join("\n"),
                    next: (from, key, shift) => nextGridCell(from, key, shift, draft.rows.length, target => canEditInitiativeCell(draft, kind, target)),
                  });
                  const selected = bounds && index >= bounds.top && index <= bounds.bottom && column >= bounds.left && column <= bounds.right;
                  return <td key={month} className={selected ? "initiative-cell-selected" : ""}
                    onPointerEnter={event => extendSelection(cell, event.buttons)}
                    onPointerDown={events.onPointerDown}>
                    <GridAmountInput editing={grid.editing && grid.focusedCell?.row === index && grid.focusedCell.column === column} type="text" role="spinbutton" aria-valuenow={isValidAmount(value) ? Number(value) : undefined} inputMode="text" data-row={index} data-column={column}
                      ref={input => { if (input) input.setCustomValidity(invalidInput ? "金額に有効な数値を入力してください。"
                        : input.value === "" || isValidAmount(input.value) ? "" : "金額は千円単位・小数点以下3桁までで入力してください。"); }}
                      aria-label={`${accountName} ${month}月の金額`}
                      aria-description={`${index + 1}行目`}
                      aria-invalid={Boolean(invalidInput) || value !== "" && !isValidAmount(value)}
                      disabled={readOnly || isSaving || !canEditInitiativeCell(draft, kind, cell)} value={value}
                      {...events.input}
                    />
                  </td>
                })}
              </tr>;
            })}
          </tbody>
          {totals.rows.length > 0 && <tfoot>{totals.rows.map(row => <tr key={row.id}>
            <th scope="row">{row.name}合計</th>
            {months.map(month => <td key={month}>{formatYen(row.amounts[month])}</td>)}
          </tr>)}</tfoot>}
        </table>
    </div>
  </>;
}
