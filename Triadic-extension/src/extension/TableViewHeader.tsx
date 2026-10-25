import { useId, useLayoutEffect, useMemo, useRef, useState, type ThHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { emptyTableView, selectTableRows, tableChoices, type TableColumn, type TableFilter, type TableViewState } from "../core/tables/columnView";
import "./TableViewHeader.css";
import { amountToYen } from "../core/domain/amounts";

export function useTableView<T>(source: readonly T[], columns: readonly TableColumn<T>[], controlled?: { state: TableViewState; change: (state: TableViewState) => void }) {
  const [local, setLocal] = useState(emptyTableView);
  const state = controlled?.state ?? local;
  const change = controlled?.change ?? setLocal;
  const rows = useMemo(() => selectTableRows(source, columns, state), [source, columns, state]);
  const filtered = columns.some(column => state.filters[column.id]);
  return { rows, filtered, state, change, source, columns };
}
type View<T> = ReturnType<typeof useTableView<T>>;
/** Keep an autosaving editor mounted until the user finishes editing. */
export function useEditingTableRows<T>(visible: T[], source: readonly T[], editing: string | null, key: (row: T) => string) {
  const frozen = useRef<{ editing: string; keys: string[] } | null>(null);
  if (!editing) frozen.current = null;
  else if (frozen.current?.editing !== editing) frozen.current = { editing, keys: visible.map(key) };
  const byKey = new Map(source.map(row => [key(row), row]));
  return frozen.current ? frozen.current.keys.flatMap(id => byKey.has(id) ? [byKey.get(id)!] : []) : visible;
}
export function TableViewHeader<T>({ view, column: id, disabled = false, ...props }: Omit<ThHTMLAttributes<HTMLTableCellElement>, "children"> & { view: View<T>; column: string; disabled?: boolean }) {
  const column = view.columns.find(item => item.id === id)!;
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const active = view.state.sort?.column === id, filter = view.state.filters[id];
  const name = column.name ?? column.label;
  return <th {...props} data-table-view-column={id} scope="col" aria-label={name} aria-sort={active ? view.state.sort!.direction : undefined}>
    <div className="table-view-heading">
      {column.sortable === false ? <span className="table-view-label">{column.label}</span> : <button type="button" className="table-view-sort" disabled={disabled}
        aria-label={column.name ? `${name}で並べ替え` : undefined} onClick={() => view.change({ ...view.state, sort: { column: id, direction: active && view.state.sort!.direction === "ascending" ? "descending" : "ascending" } })}>
        {column.label}<span aria-hidden="true" className="table-view-direction">{active ? view.state.sort!.direction === "ascending" ? "▲" : "▼" : ""}</span>
      </button>}
      <button ref={trigger} type="button" className={`table-view-filter${filter ? " is-filtered" : ""}`} aria-label={`${name}を絞り込む${filter ? "（適用中）" : ""}`}
        aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)}>
        <TableFilterIcon />
      </button>
    </div>
    {open && !disabled && <TableFilterPanel column={column} source={view.source} filter={filter} sorted={active} trigger={trigger.current!}
      onClose={() => setOpen(false)} onApply={filter => { const filters = { ...view.state.filters }; if (filter) filters[id] = filter; else delete filters[id]; view.change({ ...view.state, filters }); }}
      onOriginalOrder={() => view.change({ ...view.state, sort: null })} />}
  </th>;
}
export function TableFilterIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12M4 8h8M6 12h4" /></svg>; }
function TableFilterPanel<T>({ column, source, filter, sorted, trigger, onClose, onApply, onOriginalOrder }: {
  column: TableColumn<T>; source: readonly T[]; filter: TableFilter | undefined; sorted: boolean; trigger: HTMLButtonElement;
  onClose: () => void; onApply: (filter?: TableFilter) => void; onOriginalOrder: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null), heading = useId();
  const [query, setQuery] = useState(filter?.type === "text" ? filter.text : "");
  const [values, setValues] = useState<string[] | null>(filter?.type === "choice" ? filter.values : null);
  const [operator, setOperator] = useState(filter?.type === "number" ? filter.operator : "all");
  const scale = column.scale ?? 1;
  const [min, setMin] = useState(filter?.type === "number" && filter.min !== undefined ? String(filter.min / scale) : "");
  const [max, setMax] = useState(filter?.type === "number" && filter.max !== undefined ? String(filter.max / scale) : "");
  const [error, setError] = useState("");
  const choices = useMemo(() => column.type !== "choice" ? [] : [...new Set([...source.flatMap(row => tableChoices(column.value(row))), ...(filter?.type === "choice" ? filter.values : [])])].sort((a, b) => a.localeCompare(b, "ja", { numeric: true })), [source, column]);
  const close = () => { onClose(); if (trigger.isConnected) trigger.focus({ preventScroll: true }); };
  useLayoutEffect(() => {
    const element = panel.current!;
    element.showPopover();
    const position = () => {
      const rect = trigger.getBoundingClientRect();
      const width = element.offsetWidth, height = element.offsetHeight;
      element.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8))}px`;
    };
    position();
    element.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    const outside = (event: Event) => { if (!element.contains(event.target as Node) && !trigger.contains(event.target as Node)) onClose(); };
    const scroll = (event: Event) => {
      if (element.contains(event.target as Node)) return;
      const rect = trigger.getBoundingClientRect();
      // Programmatic focus/scroll restoration can finish after opening.
      // Follow the header; an explicit scroll gesture closes the editor.
      if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) onClose();
      else position();
    };
    const gesture = (event: Event) => { if (!element.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", outside, true); document.addEventListener("scroll", scroll, true); window.addEventListener("resize", onClose);
    document.addEventListener("wheel", gesture, { capture: true, passive: true }); document.addEventListener("touchmove", gesture, { capture: true, passive: true });
    const observer = new ResizeObserver(position); observer.observe(element);
    return () => { observer.disconnect(); document.removeEventListener("pointerdown", outside, true); document.removeEventListener("scroll", scroll, true); document.removeEventListener("wheel", gesture, true); document.removeEventListener("touchmove", gesture, true); window.removeEventListener("resize", onClose); };
  }, []);
  const exact = filter?.type === "text" && filter.exact;
  const apply = () => {
    if (exact) { onApply({ type: "text", text: query, exact: true }); close(); return; }
    if (column.type === "number") {
      if (operator === "all") onApply();
      else if (operator === "range") {
        const parse = (value: string) => !value.trim() ? undefined : scale === 1000 ? amountToYen(value.trim()) : Number(value) * scale;
        let low: number | undefined, high: number | undefined;
        try { low = parse(min); high = parse(max); } catch (failure) { setError((failure as Error).message); return; }
        if ((low !== undefined && !Number.isFinite(low)) || (high !== undefined && !Number.isFinite(high)) || (low !== undefined && high !== undefined && low > high)) { setError("数値の範囲を確認してください。"); return; }
        onApply(low === undefined && high === undefined ? undefined : { type: "number", operator: "range", ...(low === undefined ? {} : { min: low }), ...(high === undefined ? {} : { max: high }) });
      } else onApply({ type: "number", operator: operator as Extract<TableFilter, { type: "number" }>["operator"] });
    } else if (column.type === "choice") onApply(values === null ? undefined : { type: "choice", values });
    else onApply(query.trim() ? { type: "text", text: query.trim() } : undefined);
    close();
  };
  const all = values === null || choices.every(value => values.includes(value));
  return createPortal(<div ref={panel} popover="manual" className="table-filter-panel" role="dialog" aria-labelledby={heading}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Enter" && !event.nativeEvent.isComposing && event.target instanceof HTMLInputElement) { event.preventDefault(); apply(); }
      if (event.key === "Tab") {
        const controls = [...panel.current!.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled)")];
        const at = controls.indexOf(document.activeElement as HTMLElement), next = event.shiftKey ? at - 1 : at + 1;
        if (next < 0 || next >= controls.length) { event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0]?.focus(); }
      }
    }}>
    <div id={heading} className="table-filter-title">{column.name ?? column.label}{exact ? "（完全一致）" : ""}</div>
    {exact ? <input type="search" aria-label="一致する値" value={query} onChange={event => setQuery(event.target.value)} /> : column.type === "number" ? <>
      <div className="table-filter-options">{([["all", "すべて"], ["negative", "0より小さい"], ["positive", "0より大きい"], ["zero", "0"], ["nonzero", "0以外"], ["blank", "未設定・計算不可"], ["range", "範囲を指定"]] as const).map(([value, label]) => <label key={value}><input type="radio" name={heading} value={value} checked={operator === value} onChange={() => setOperator(value)} />{label}</label>)}</div>
      {operator === "range" && <div className="table-filter-range"><label>以上<input aria-label="以上" inputMode="decimal" value={min} onChange={event => setMin(event.target.value)} /></label><label>以下<input aria-label="以下" inputMode="decimal" value={max} onChange={event => setMax(event.target.value)} /></label></div>}
    </> : column.type === "choice" ? <>
      {choices.length > 8 && <input type="search" aria-label="候補を検索" placeholder="候補を検索" value={query} onChange={event => setQuery(event.target.value)} />}
      <label className="table-filter-all"><input type="checkbox" checked={all} ref={input => { if (input) input.indeterminate = !all && !!values?.length; }} onChange={event => setValues(event.target.checked ? null : [])} />すべて選択</label>
      <div className="table-filter-options">{choices.filter(value => value.normalize("NFKC").toLowerCase().includes(query.normalize("NFKC").toLowerCase())).map(value => <label key={value}><input type="checkbox" checked={values === null || values.includes(value)} onChange={event => setValues(event.target.checked ? [...(values ?? choices), value] : (values ?? choices).filter(item => item !== value))} />{value || "未設定・空欄"}</label>)}</div>
    </> : <input type="search" aria-label="含む文字" placeholder="含む文字" value={query} onChange={event => setQuery(event.target.value)} />}
    {error && <p role="alert">{error}</p>}
    <div className="table-filter-actions"><button type="button" className="text-button" onClick={() => { onApply(); close(); }}>解除</button><button type="button" className="primary-button" onClick={apply}>適用</button></div>
    {sorted && <button type="button" className="text-button table-filter-original" onClick={() => { onOriginalOrder(); close(); }}>元の並び順に戻す</button>}
  </div>, trigger.closest("dialog") ?? document.body);
}

export function TableViewEmpty({ columns }: { columns: number }) { return <tbody><tr><td colSpan={columns} className="table-view-empty" role="status">条件に合う行がありません。</td></tr></tbody>; }
