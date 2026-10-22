import { useLayoutEffect, useRef } from "react";

export function DetailTextPart({ text, disabled, index, editing, onEditingChange, onChange, heading = false, onHeadingChange }: {
  onHeadingChange?: (heading: boolean) => void;
  text: string; disabled: boolean; index: number; editing: boolean; heading?: boolean;
  onEditingChange: (editing: boolean) => void; onChange: (text: string) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const view = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (editing) input.current?.focus({ preventScroll: true });
  }, [editing]);
  const begin = () => { if (!disabled) onEditingChange(true); };
  const label = heading ? "見出し" : "説明文";
  const placeholder = heading ? "見出し" : "ダブルクリックで入力";
  return editing && !disabled ? <div className="detail-text-editor" onPointerDown={event => event.stopPropagation()}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onEditingChange(false); }}>
    {onHeadingChange && <label>文章の種類<select aria-label="文章の種類" value={heading ? "heading" : "text"} onChange={e => onHeadingChange(e.target.value === "heading")}><option value="text">本文</option><option value="heading">見出し</option></select></label>}
    <textarea ref={input} className={`detail-part-text detail-part-text-input${heading ? " detail-part-heading" : ""}`}
    aria-label={`パーツ ${index + 1}の${label}`} value={text} placeholder={placeholder}
    onChange={event => onChange(event.target.value)}
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape" && !event.nativeEvent.isComposing) {
        event.preventDefault(); onEditingChange(false);
        requestAnimationFrame(() => view.current?.focus({ preventScroll: true }));
      }
    }} /></div> : <div ref={view} className={`detail-part-text${text ? "" : " is-empty"}`}
      role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-label={`パーツ ${index + 1}の${heading ? "見出し" : "テキスト"}を編集`}
      onDoubleClick={event => { event.stopPropagation(); begin(); }}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); begin(); }
      }}>{heading ? <h2 className="detail-part-heading">{text || placeholder}</h2> : text || placeholder}</div>;
}
