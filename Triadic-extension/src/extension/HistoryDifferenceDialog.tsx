import { defaultBudgetPrevious, type KindId } from "../core/domain/kinds";
import { useTableCellFilter } from "./TableCellFilter";
import { TableViewHeader, TableViewEmpty, useTableView } from "./TableViewHeader";
import { emptyTableView, type TableColumn } from "../core/tables/columnView";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HistoryDifference, HistoryIncomeImpact } from "../core/domain/historyDifference";
import { HistoryIncomeImpactTable } from "./HistoryIncomeImpact";
import "./HistoryDifferenceDialog.css";

export function HistoryDifferenceDialog({ date, differences, impact, onClose, returnFocus = null }: { date: string; differences: HistoryDifference[]; impact: HistoryIncomeImpact[]; onClose: () => void; returnFocus?: HTMLElement | null }) {
  const dialog = useRef<HTMLDialogElement>(null), title = useId();
  const composing = useRef(false);
  const [section, setSection] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(0);
  const [mode, setMode] = useState("income");
  const [previous, setPrevious] = useState(defaultBudgetPrevious);
  const [selected, setSelected] = useState<KindId[]>([1]), [incomePeriod, setIncomePeriod] = useState("year");
  const sections = useMemo(() => [...new Set(differences.map(item => item.section))], [differences]);
  const searched = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("ja");
    return differences.filter(item => (!section || item.section === section) && (!text || [item.subject, item.field, item.before, item.after].some(value => value.toLocaleLowerCase("ja").includes(text))));
  }, [differences, section, query]);
  const columns: TableColumn<HistoryDifference>[] = [
    { id: "section", label: "対象", type: "choice", value: row => row.section },
    { id: "subject", label: "項目", value: row => row.subject },
    { id: "change", label: "変更", type: "choice", value: row => row.change },
    { id: "field", label: "変更箇所", type: "choice", value: row => row.field },
    { id: "before", label: "履歴の値", value: row => row.before },
    { id: "after", label: "現在の値", value: row => row.after },
  ];
  const [viewState, setViewState] = useState(emptyTableView);
  const tableView = useTableView(searched, columns, { state: viewState, change: state => { setViewState(state); setPage(0); } });
  const cellFilter = useTableCellFilter(tableView, mode !== "fields");
  const filtered = tableView.rows;
  const pages = Math.max(1, Math.ceil(filtered.length / 50)), currentPage = Math.min(page, pages - 1);
  useLayoutEffect(() => {
    const element = dialog.current!; element.showModal();
    return () => { element.close(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); };
  }, [returnFocus]);
  return createPortal(<dialog ref={dialog} className="confirmation-dialog history-difference-dialog" aria-labelledby={title}
    onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
    onCancel={event => { event.preventDefault(); if (!composing.current) onClose(); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation();
      if (!composing.current && !event.nativeEvent.isComposing && event.keyCode !== 229) onClose(); } }}>
    <div className="history-difference-heading"><div><h2 id={title}>履歴と現在の差分</h2><p>{date} → 現在の保存済みデータ</p></div>
      <button autoFocus type="button" className="secondary-button" onClick={onClose}>閉じる</button></div>
    <div className="history-comparison-modes" role="group" aria-label="比較する内容">
      <button type="button" className="secondary-button" aria-pressed={mode === "income"} onClick={() => setMode("income")}>収支への影響</button>
      <button type="button" className="secondary-button" aria-pressed={mode === "fields"} onClick={() => setMode("fields")}>変更項目</button>
    </div>
    {mode === "income" ? <><HistoryIncomeImpactTable impact={impact} previous={previous} selected={selected} onSelection={(selected, previous) => { setSelected(selected); setPrevious(previous); }} period={incomePeriod} onPeriodChange={setIncomePeriod} />{differences.length === 0 && <p>変更項目の差分はありません。</p>}</> : <>
    <div className="history-difference-controls">
      <label>対象<select value={section} onChange={event => { setSection(event.target.value); setPage(0); }}><option value="">すべて</option>{sections.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>検索<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
      <output aria-label="差分件数">{filtered.length}件 / 全{differences.length}件</output>
      <span>金額単位：千円</span>
    </div>
    {differences.length === 0 ? <p>差分はありません。</p> : <div className="history-difference-scroll">
      <table aria-label="履歴と現在の変更箇所"><thead><tr>{columns.map(column => <TableViewHeader key={column.id} view={tableView} column={column.id} />)}</tr></thead>
        <tbody>{filtered.slice(currentPage * 50, (currentPage + 1) * 50).map((item, index) => <tr key={currentPage * 50 + index}>
          <td {...cellFilter.props("section", item.section)}>{item.section}</td><th {...cellFilter.props("subject", item.subject)} scope="row">{item.subject}</th><td {...cellFilter.props("change", item.change)}>{item.change}</td><td {...cellFilter.props("field", item.field)}>{item.field}</td><td>{item.before}</td><td>{item.after}</td>
        </tr>)}</tbody>{!filtered.length && <TableViewEmpty columns={6} />}</table>
    </div>}
    {filtered.length > 50 && <nav className="history-difference-pages" aria-label="差分のページ">
      <button type="button" className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>前へ</button>
      <output>{currentPage + 1} / {pages}</output>
      <button type="button" className="secondary-button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>次へ</button>
    </nav>}</>}
  {cellFilter.menu}
  </dialog>, document.body);
}
