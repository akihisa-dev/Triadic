import { useLayoutEffect, useRef } from "react";

export function DetailTextPart({ text, disabled, index, editing, onEditingChange, onChange }: {
  text: string; disabled: boolean; index: number; editing: boolean;
  onEditingChange: (editing: boolean) => void; onChange: (text: string) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const view = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (editing) input.current?.focus({ preventScroll: true });
  }, [editing]);
  const begin = () => { if (!disabled) onEditingChange(true); };
  return editing && !disabled ? <textarea ref={input} className="detail-part-text detail-part-text-input"
    aria-label={`パーツ ${index + 1}の説明文`} value={text} placeholder="ダブルクリックで入力"
    onChange={event => onChange(event.target.value)} onBlur={() => onEditingChange(false)}
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape" && !event.nativeEvent.isComposing) {
        event.preventDefault(); onEditingChange(false);
        requestAnimationFrame(() => view.current?.focus({ preventScroll: true }));
      }
    }} /> : <div ref={view} className={`detail-part-text${text ? "" : " is-empty"}`}
      role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-label={`パーツ ${index + 1}のテキストを編集`}
      onDoubleClick={event => { event.stopPropagation(); begin(); }}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); begin(); }
      }}>{text || "ダブルクリックで入力"}</div>;
}
