import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HistoryDifference, HistoryIncomeImpact } from "../core/domain/historyDifference";
import { HistoryIncomeImpactTable } from "./HistoryIncomeImpact";
import "./HistoryDifferenceDialog.css";

export function HistoryDifferenceDialog({ date, differences, impact, onClose, returnFocus = null }: { date: string; differences: HistoryDifference[]; impact: HistoryIncomeImpact[]; onClose: () => void; returnFocus?: HTMLElement | null }) {
  const dialog = useRef<HTMLDialogElement>(null), title = useId();
  const [section, setSection] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(0);
  const [mode, setMode] = useState("income");
  const [incomeKind, setIncomeKind] = useState(1), [incomePeriod, setIncomePeriod] = useState("year");
  const sections = useMemo(() => [...new Set(differences.map(item => item.section))], [differences]);
  const filtered = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("ja");
    return differences.filter(item => (!section || item.section === section) && (!text || [item.subject, item.field, item.before, item.after].some(value => value.toLocaleLowerCase("ja").includes(text))));
  }, [differences, section, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / 50)), currentPage = Math.min(page, pages - 1);
  useLayoutEffect(() => {
    const element = dialog.current!; element.showModal();
    return () => { element.close(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); };
  }, [returnFocus]);
  return createPortal(<dialog ref={dialog} className="confirmation-dialog history-difference-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="history-difference-heading"><div><h2 id={title}>履歴と現在の差分</h2><p>{date} → 現在の保存済みデータ</p></div>
      <button autoFocus type="button" className="secondary-button" onClick={onClose}>閉じる</button></div>
    <div className="history-comparison-modes" role="group" aria-label="比較する内容">
      <button type="button" className="secondary-button" aria-pressed={mode === "income"} onClick={() => setMode("income")}>収支への影響</button>
      <button type="button" className="secondary-button" aria-pressed={mode === "fields"} onClick={() => setMode("fields")}>変更項目</button>
    </div>
    {mode === "income" ? <><HistoryIncomeImpactTable impact={impact} kind={incomeKind} period={incomePeriod} onKindChange={setIncomeKind} onPeriodChange={setIncomePeriod} />{differences.length === 0 && <p>変更項目の差分はありません。</p>}</> : <>
    <div className="history-difference-controls">
      <label>対象<select value={section} onChange={event => { setSection(event.target.value); setPage(0); }}><option value="">すべて</option>{sections.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>検索<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
      <output aria-label="差分件数">{filtered.length}件 / 全{differences.length}件</output>
      <span>金額単位：千円</span>
    </div>
    {differences.length === 0 ? <p>差分はありません。</p> : filtered.length === 0 ? <p>条件に一致する差分はありません。</p> : <div className="history-difference-scroll">
      <table aria-label="履歴と現在の変更箇所"><thead><tr>{["対象", "項目", "変更", "変更箇所", "履歴の値", "現在の値"].map(name => <th scope="col" key={name}>{name}</th>)}</tr></thead>
        <tbody>{filtered.slice(currentPage * 50, (currentPage + 1) * 50).map((item, index) => <tr key={currentPage * 50 + index}>
          <td>{item.section}</td><th scope="row">{item.subject}</th><td>{item.change}</td><td>{item.field}</td><td>{item.before}</td><td>{item.after}</td>
        </tr>)}</tbody></table>
    </div>}
    {filtered.length > 50 && <nav className="history-difference-pages" aria-label="差分のページ">
      <button type="button" className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>前へ</button>
      <output>{currentPage + 1} / {pages}</output>
      <button type="button" className="secondary-button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>次へ</button>
    </nav>}</>}
  </dialog>, document.body);
}
