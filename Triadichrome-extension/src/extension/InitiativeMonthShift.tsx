import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { shiftInitiativeMonths } from "../core/tables/initiativeMonthShift";
import { initiativeMonths } from "../core/domain/calendar";
import { hasInvalidAmountInput, resolvedAmount } from "../core/domain/kinds";
import type { InitiativeEntryDraft } from "../core/domain/plan";
import type { Account } from "../core/domain/accountMaster";
import "./AnnualAllocation.css";
import "./InitiativeMonthShift.css";

type Props = { draft: InitiativeEntryDraft; accounts: Account[]; disabled: boolean; onChange: (draft: InitiativeEntryDraft) => void };
export function InitiativeMonthShift(props: Props) {
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null);
  const blocked = props.disabled || Boolean(props.draft.invalidNumbers) || props.draft.rows.some(hasInvalidAmountInput);
  return <>
    <button ref={trigger} type="button" className="secondary-button" disabled={blocked || !props.draft.rows.length} onClick={() => setOpen(true)}>実施月をまとめて移動</button>
    {open && <ShiftDialog {...props} disabled={blocked} returnFocus={trigger.current} onClose={() => setOpen(false)} />}
  </>;
}
function ShiftDialog({ draft, accounts, disabled, onChange, onClose, returnFocus }: Props & { onClose: () => void; returnFocus: HTMLElement | null }) {
  const title = useId(), dialog = useRef<HTMLDialogElement>(null), first = useRef<HTMLSelectElement>(null), source = useRef(draft);
  const [direction, setDirection] = useState(1), [months, setMonths] = useState(1), [rowIndex, setRowIndex] = useState(0);
  const names = useMemo(() => new Map(accounts.map(account => [account.id, account.accountName])), [accounts]);
  const stale = source.current !== draft;
  const preview = useMemo(() => {
    try { return { draft: shiftInitiativeMonths(draft, direction * months), error: "" }; }
    catch (reason) { return { draft: null, error: reason instanceof Error ? reason.message : "移動できませんでした。" }; }
  }, [draft, direction, months]);
  useLayoutEffect(() => {
    const element = dialog.current!; element.showModal(); first.current?.focus();
    return () => { element.close(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); };
  }, [returnFocus]);
  const before = draft.rows[rowIndex], after = preview.draft?.rows[rowIndex];
  return createPortal(<dialog ref={dialog} className="confirmation-dialog annual-allocation-dialog month-shift-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="annual-allocation-heading"><h2 id={title}>施策の実施月をまとめて移動</h2><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button></div>
    <div className="annual-allocation-fields">
      <label>移動方向<select ref={first} value={direction} onChange={event => setDirection(Number(event.target.value))}><option value={1}>後ろへ（延期）</option><option value={-1}>前へ（前倒し）</option></select></label>
      <label>移動月数<select value={months} onChange={event => setMonths(Number(event.target.value))}>{Array.from({ length: 11 }, (_, index) => <option key={index} value={index + 1}>{index + 1}か月</option>)}</select></label>
      <label>確認する科目行<select value={rowIndex} onChange={event => setRowIndex(Number(event.target.value))}>{draft.rows.map((row, index) => <option key={row.id ?? index} value={index}>{index + 1}行目：{names.get(row.accountId!) ?? "科目未選択"}</option>)}</select></label>
    </div>
    <p>全科目行の一次予算・確定予算を移動します。手修正と引き継ぎを保ち、空く月は一次予算0・確定予算は引き継ぎになります。</p>
    <div className="annual-allocation-scroll"><table aria-label="実施月の移動確認"><thead><tr><th scope="col">月</th><th scope="col">一次・変更前</th><th scope="col">一次・移動後</th><th scope="col">確定・変更前</th><th scope="col">確定・移動後</th></tr></thead>
      <tbody>{initiativeMonths.map(month => <tr key={month}><th scope="row">{month}月</th>
        <td>{before && resolvedAmount(before, 1, month)}</td><td>{after ? resolvedAmount(after, 1, month) : "—"}</td>
        <td>{before && <>{resolvedAmount(before, 2, month)}<small>{before.overrides?.[2]?.[month] === undefined ? "引き継ぎ" : "手修正"}</small></>}</td>
        <td>{after ? <>{resolvedAmount(after, 2, month)}<small>{after.overrides?.[2]?.[month] === undefined ? "引き継ぎ" : "手修正"}</small></> : "—"}</td>
      </tr>)}</tbody></table></div>
    {(stale || preview.error) && <p role="alert">{stale ? "入力内容が更新されています。閉じてから移動をやり直してください。" : preview.error}</p>}
    <button type="button" className="primary-button" disabled={disabled || stale || !preview.draft} onClick={() => {
      if (disabled || stale || !preview.draft) return;
      onChange(preview.draft); onClose();
    }}>全科目行に移動を反映</button>
  </dialog>, document.body);
}
