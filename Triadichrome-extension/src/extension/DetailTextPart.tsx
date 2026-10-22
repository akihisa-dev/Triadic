import { useLayoutEffect, useRef } from "react";

export function DetailTextPart({ text, disabled, index, editing, onEditingChange, onChange, heading = false }: {
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
  return editing && !disabled ? <textarea ref={input} className={`detail-part-text detail-part-text-input${heading ? " detail-part-heading" : ""}`}
    aria-label={`パーツ ${index + 1}の${label}`} value={text} placeholder={placeholder}
    onChange={event => onChange(event.target.value)} onBlur={() => onEditingChange(false)}
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape" && !event.nativeEvent.isComposing) {
        event.preventDefault(); onEditingChange(false);
        requestAnimationFrame(() => view.current?.focus({ preventScroll: true }));
      }
    }} /> : <div ref={view} className={`detail-part-text${text ? "" : " is-empty"}`}
      role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-label={`パーツ ${index + 1}の${heading ? "見出し" : "テキスト"}を編集`}
      onDoubleClick={event => { event.stopPropagation(); begin(); }}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); begin(); }
      }}>{heading ? <h2 className="detail-part-heading">{text || placeholder}</h2> : text || placeholder}</div>;
}
