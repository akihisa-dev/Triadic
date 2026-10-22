import { useLayoutEffect, useRef } from "react";
import type { Initiative } from "../core/domain/plan";

export function DetailInitiativePart({ identity, initiatives, disabled, navigationBlocked, index, editing, onEditingChange, onChange, onOpen }: {
  identity: string | null; initiatives: readonly Initiative[]; disabled: boolean; navigationBlocked: boolean; index: number; editing: boolean;
  onEditingChange: (editing: boolean) => void; onChange: (identity: string | null) => void; onOpen: (initiative: Initiative) => void;
}) {
  const select = useRef<HTMLSelectElement>(null);
  const change = useRef<HTMLButtonElement>(null);
  const initiative = identity === null ? undefined : initiatives.find(item => item.identity === identity);
  const choosing = !disabled && (editing || identity === null);
  useLayoutEffect(() => { if (editing) select.current?.focus({ preventScroll: true }); }, [editing]);
  return <div className="detail-initiative-part" onDoubleClick={event => event.stopPropagation()}>
    {choosing ? <select ref={select} aria-label={`パーツ ${index + 1}の参照施策`} value={identity ?? ""}
      onPointerDown={event => event.stopPropagation()} onBlur={() => onEditingChange(false)}
      onChange={event => { onChange(event.target.value || null); onEditingChange(false); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          onEditingChange(false); requestAnimationFrame(() => change.current?.focus({ preventScroll: true }));
        }
      }}>
      <option value="">施策を選択</option>
      {identity && !initiative && <option value={identity} disabled>参照先がありません</option>}
      {initiatives.filter(item => item.identity).map(item => <option key={item.identity} value={item.identity}>{item.name}</option>)}
    </select> : <>
      {initiative ? <button type="button" className="detail-initiative-link" disabled={navigationBlocked}
        onPointerDown={event => event.stopPropagation()} onClick={() => onOpen(initiative)}>{initiative.name}</button>
        : <span className="detail-initiative-missing">{identity === null ? "施策未選択" : "参照先がありません"}</span>}
      {!disabled && <button ref={change} type="button" className="detail-initiative-change" aria-label={`パーツ ${index + 1}の参照施策を変更`}
        onPointerDown={event => event.stopPropagation()} onClick={() => onEditingChange(true)}>変更</button>}
    </>}
  </div>;
}
