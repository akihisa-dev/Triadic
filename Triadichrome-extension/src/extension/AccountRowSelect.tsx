import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Account } from "../core/domain/accountMaster";
import "./AccountRowSelect.css";

/** Search text stays local; only an explicit choice changes the account. */
export function AccountRowSelect({ accounts, account, value, label, disabled, active, onActivate, onDeactivate, onChange }: {
  accounts: Account[]; account: Account | undefined; value: number | null; label: string;
  disabled: boolean; active: boolean; onActivate: () => void; onDeactivate: () => void; onChange: (value: number | null) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const [query, setQuery] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);
  const open = active && !disabled && position !== null;
  const choices = useMemo(() => {
    if (!active || disabled) return [];
    const text = (query ?? "").normalize("NFKC").toLowerCase().trim();
    return text ? accounts.filter(item => item.accountName.normalize("NFKC").toLowerCase().includes(text)) : [null, ...accounts];
  }, [accounts, query, active, disabled]);
  const current = Math.min(cursor, Math.max(0, choices.length - 1));
  const close = () => { setQuery(null); setPosition(null); onDeactivate(); };
  const place = () => {
    const rect = input.current!.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 16);
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width,
      ...(below >= 160 || below >= above ? { top: rect.bottom, maxHeight: Math.min(280, below) }
        : { bottom: window.innerHeight - rect.top, maxHeight: Math.min(280, above) }) });
  };
  const show = () => {
    if (disabled || open) return;
    place();
    setQuery(null);
    setCursor(Math.max(0, accounts.findIndex(item => item.id === value) + 1));
    onActivate();
  };
  const choose = (index: number) => {
    if (!open || disabled || index < 0 || index >= choices.length) return;
    const item = choices[index];
    if (item && !accounts.some(account => account.id === item.id)) return;
    close();
    if ((item?.id ?? null) !== value) onChange(item?.id ?? null);
  };
  useEffect(() => { if (active && disabled) close(); }, [active, disabled]);
  useEffect(() => {
    if (!open) return;
    const reposition = (event: Event) => { if (!list.current?.contains(event.target as Node)) place(); };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => { window.removeEventListener("scroll", reposition, true); window.removeEventListener("resize", reposition); };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) {
      if (document.activeElement === input.current) input.current?.select();
      return;
    }
    if (query === null) input.current?.select();
    const element = list.current?.querySelector<HTMLElement>(`[data-choice-index="${current}"]`);
    const container = list.current;
    if (!element || !container) return;
    const top = element.offsetTop, bottom = top + element.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight;
  }, [open, current, choices]);
  return <>
    <input ref={input} className="account-row-select" type="text" role="combobox" aria-label={label}
      aria-autocomplete="list" aria-expanded={open} aria-controls={open ? id : undefined}
      aria-activedescendant={open && choices.length ? `${id}-${current}` : undefined}
      autoComplete="off" spellCheck={false} disabled={disabled} placeholder="科目を選択"
      size={Math.max(12, (account?.accountName.length ?? 0) * 2 + 2)}
      value={open && query !== null ? query : account?.accountName ?? ""}
      onFocus={event => { show(); event.currentTarget.select(); }}
      onMouseDown={event => {
        if (query !== null) return;
        event.preventDefault();
        event.currentTarget.focus();
        show();
        event.currentTarget.select();
      }}
      onClick={event => { show(); if (query === null) event.currentTarget.select(); }}
      onBlur={() => { composing.current = false; close(); }}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
      onChange={event => { show(); setQuery(event.target.value); setCursor(0); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
        if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); }
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (!open) show();
          else setCursor(Math.max(0, Math.min(choices.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
        } else if (event.key === "Enter" && open) { event.preventDefault(); event.stopPropagation(); choose(current); }
      }} />
    {open && createPortal(<div ref={list} id={id} className="account-row-options" role="listbox" aria-label={label}
      style={position!} onMouseDown={event => event.preventDefault()}>
      {choices.length ? choices.map((item, index) => <div key={item?.id ?? "none"} id={`${id}-${index}`}
        role="option" aria-selected={(item?.id ?? null) === value} data-choice-index={index} data-account-id={item?.id ?? ""}
        className={index === current ? "account-row-option account-row-option-active" : "account-row-option"}
        onPointerMove={() => setCursor(index)} onClick={() => choose(index)}>{item?.accountName ?? "科目を選択"}</div>)
        : <div className="account-row-empty" role="status">該当する科目がありません</div>}
    </div>, document.body)}
  </>;
}
