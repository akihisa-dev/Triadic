import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createInitiativeSearch, type InitiativeSearchMasters } from "../core/domain/initiativeSearch";
import type { Initiative } from "../core/domain/plan";
import "./InitiativeSearch.css";

type Props = { initiatives: Initiative[]; masters: InitiativeSearchMasters; disabled: boolean; onOpen: (initiative: Initiative) => void };
export function InitiativeSearch({ initiatives, masters, disabled, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={trigger} type="button" className="secondary-button initiative-search-trigger" disabled={disabled} onClick={() => setOpen(true)}>施策を検索</button>
    {open && <InitiativeSearchDialog query={query} onQueryChange={setQuery} initiatives={initiatives} masters={masters} disabled={disabled} returnFocus={trigger.current}
      onClose={() => setOpen(false)} onOpen={item => { if (!disabled) { onOpen(item); setOpen(false); } }} />}
  </>;
}

function InitiativeSearchDialog({ initiatives, masters, disabled, onOpen, onClose, returnFocus, query, onQueryChange }: Props & { onClose: () => void; returnFocus: HTMLElement | null; query: string; onQueryChange: (query: string) => void }) {
  const title = useId(), dialog = useRef<HTMLDialogElement>(null), queryInput = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(0);
  const { expansions, expansionCategories, departments, industries, periodTypes } = masters;
  const search = useMemo(() => createInitiativeSearch(initiatives, { expansions, expansionCategories, departments, industries, periodTypes }),
    [initiatives, expansions, expansionCategories, departments, industries, periodTypes]);
  const results = useMemo(() => search(query), [search, query]);
  const pages = Math.max(1, Math.ceil(results.length / 50)), currentPage = Math.min(page, pages - 1);
  useLayoutEffect(() => {
    const element = dialog.current!; element.showModal(); queryInput.current?.focus();
    return () => { element.close(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); };
  }, [returnFocus]);
  return createPortal(<dialog ref={dialog} className="confirmation-dialog initiative-search-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="initiative-search-heading"><h2 id={title}>施策を検索</h2><button type="button" className="secondary-button" onClick={onClose}>閉じる</button></div>
    <label className="initiative-search-query">施策名・備考・分類<input ref={queryInput} type="search" value={query} onChange={event => { onQueryChange(event.target.value); setPage(0); }}
      onKeyDown={event => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) {
          event.preventDefault(); const first = results[currentPage * 50]; if (!disabled && first) onOpen(first.initiative);
        }
      }} /></label>
    <output className="initiative-search-count" aria-live="polite" aria-label="検索結果件数">{results.length}件 / 全{initiatives.length}件</output>
    {initiatives.length === 0 ? <p>登録された施策はありません。</p> : results.length === 0 ? <p>条件に一致する施策はありません。</p> :
      <ul className="initiative-search-results" aria-label="検索結果">{results.slice(currentPage * 50, (currentPage + 1) * 50).map(({ initiative: item, matchedClassifications }) => <li key={item.id}>
        <button type="button" className="text-button" disabled={disabled} onClick={() => onOpen(item)}>{item.name}</button>
        {item.note && <p>{item.note}</p>}
        {matchedClassifications.length > 0 && <p>{matchedClassifications.map(({ label, name }) => `${label}：${name}`).join("　")}</p>}
      </li>)}</ul>}
    {results.length > 50 && <nav className="initiative-search-pages" aria-label="検索結果のページ">
      <button type="button" className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>前へ</button>
      <output>{currentPage + 1} / {pages}</output>
      <button type="button" className="secondary-button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>次へ</button>
    </nav>}
  </dialog>, document.body);
}
