import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { allocateAnnualAmount, applyAnnualAllocation } from "../core/tables/annualAllocation";
import { amountToYen, sumYen, yenToAmount } from "../core/domain/amounts";
import { initiativeMonths } from "../core/domain/calendar";
import { hasInvalidAmountInput, resolvedAmount, type KindId, type MonthAmounts } from "../core/domain/kinds";
import type { InitiativeEntryDraft } from "../core/domain/plan";
import type { Account } from "../core/domain/accountMaster";
import "./AnnualAllocation.css";

type Props = { draft: InitiativeEntryDraft; kind: KindId; accounts: Account[]; disabled: boolean; onChange: (draft: InitiativeEntryDraft) => void };
export function AnnualAllocation(props: Props) {
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null);
  const blocked = props.disabled || Boolean(props.draft.invalidNumbers) || props.draft.rows.some(hasInvalidAmountInput);
  const eligible = props.draft.rows.some(row => props.accounts.some(account => account.id === row.accountId));
  return <>
    <button ref={trigger} type="button" className="secondary-button" disabled={blocked || !eligible} onClick={() => setOpen(true)}>年間金額を配分</button>
    {open && <AllocationDialog {...props} disabled={blocked} returnFocus={trigger.current} onClose={() => setOpen(false)} />}
  </>;
}

function AllocationDialog({ draft, kind, accounts, disabled, onChange, onClose, returnFocus }: Props & { onClose: () => void; returnFocus: HTMLElement | null }) {
  const title = useId(), dialog = useRef<HTMLDialogElement>(null), totalInput = useRef<HTMLInputElement>(null), source = useRef(draft);
  const names = useMemo(() => new Map(accounts.map(account => [account.id, account.accountName])), [accounts]);
  const [rowIndex, setRowIndex] = useState(() => draft.rows.findIndex(row => names.has(row.accountId!)));
  const [total, setTotal] = useState(""), [mode, setMode] = useState("equal");
  const [months, setMonths] = useState<number[]>([...initiativeMonths]);
  const [ratios, setRatios] = useState<MonthAmounts>(() => Object.fromEntries(initiativeMonths.map(month => [month, "1"])));
  const [failure, setFailure] = useState("");
  const stale = source.current !== draft, row = draft.rows[rowIndex];
  const weights = useMemo(() => Object.fromEntries(months.map(month => [month, mode === "equal" ? "1" : ratios[month] ?? ""])), [months, mode, ratios]);
  const preview = useMemo(() => {
    try { return { amounts: allocateAnnualAmount(total, weights), error: "" }; }
    catch (reason) { return { amounts: null, error: reason instanceof Error ? reason.message : "配分できませんでした。" }; }
  }, [total, weights]);
  const beforeTotal = (() => { try { return row ? yenToAmount(sumYen(initiativeMonths.map(month => amountToYen(resolvedAmount(row, kind, month))))) : ""; } catch { return "範囲超過"; } })();
  useLayoutEffect(() => {
    const element = dialog.current!; element.showModal(); totalInput.current?.focus();
    return () => { element.close(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); };
  }, [returnFocus]);
  return createPortal(<dialog ref={dialog} className="confirmation-dialog annual-allocation-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="annual-allocation-heading"><h2 id={title}>年間金額を月別に配分</h2><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button></div>
    <div className="annual-allocation-fields">
      <label>配分する科目行<select value={rowIndex} onChange={event => setRowIndex(Number(event.target.value))}>{draft.rows.map((item, index) => names.has(item.accountId!) && <option key={item.id ?? index} value={index}>{index + 1}行目：{names.get(item.accountId!)}</option>)}</select></label>
      <label>年間金額<input ref={totalInput} type="number" step="0.001" value={total} onChange={event => setTotal(event.target.value)} /></label>
      <label>配分方法<select value={mode} onChange={event => setMode(event.target.value)}><option value="equal">均等配分</option><option value="ratio">比率配分</option></select></label>
    </div>
    <p>{kind === 1 ? "一次予算" : "確定予算"}の選んだ科目行を置き換えます。対象外の月は0になります。{kind === 2 ? "12か月とも手修正になります。" : ""}</p>
    <div className="annual-allocation-scroll"><table aria-label="月別配分の確認"><thead><tr><th scope="col">対象月</th>{mode === "ratio" && <th scope="col">比率</th>}<th scope="col">変更前</th><th scope="col">配分後</th></tr></thead>
      <tbody>{initiativeMonths.map(month => <tr key={month}><th scope="row"><label><input type="checkbox" checked={months.includes(month)} onChange={event => setMonths(current => event.target.checked ? [...current, month] : current.filter(value => value !== month))} />{month}月</label></th>
        {mode === "ratio" && <td><input type="number" min="0" step="0.001" aria-label={`${month}月の比率`} disabled={!months.includes(month)} value={ratios[month] ?? ""} onChange={event => setRatios(current => ({ ...current, [month]: event.target.value }))} /></td>}
        <td>{row ? resolvedAmount(row, kind, month) : ""}</td><td>{preview.amounts?.[month] ?? "—"}</td></tr>)}</tbody>
      <tfoot><tr><th scope="row" colSpan={mode === "ratio" ? 2 : 1}>年間合計</th><td>{beforeTotal}</td><td>{preview.amounts ? yenToAmount(amountToYen(total)) : "—"}</td></tr></tfoot>
    </table></div>
    {(stale || failure || (total !== "" && preview.error)) && <p role="alert">{stale ? "入力内容が更新されています。閉じてから配分をやり直してください。" : failure || preview.error}</p>}
    <button type="button" className="primary-button" disabled={disabled || stale || !preview.amounts || !row || !names.has(row.accountId!)} onClick={() => {
      if (disabled || stale) return;
      try { onChange(applyAnnualAllocation(draft, kind, rowIndex, total, weights)); onClose(); }
      catch (reason) { setFailure(reason instanceof Error ? reason.message : "配分できませんでした。"); }
    }}>配分を反映</button>
  </dialog>, document.body);
}
