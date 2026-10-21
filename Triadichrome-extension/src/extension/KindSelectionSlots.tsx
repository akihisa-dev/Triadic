import { PreviousKindSelection } from "./PreviousKindSelection";
import type { PreviousKind, KindId, KindScreen } from "../core/domain/kinds";
import { INITIAL_KINDS } from "../core/domain/kinds";
import { GlidingKindSlot } from "./GlidingKindSlot";
import "./KindSelectionSlots.css";

export function KindSelectionSlots({ screen, selected, disabled, onChange, previousKind, onPreviousChange }: {
  previousKind?: PreviousKind; onPreviousChange?: (kind: PreviousKind) => void;
  screen: KindScreen; selected: KindId[]; disabled: boolean; onChange: (selected: KindId[]) => void;
}) {
  const options = INITIAL_KINDS.map(kind => ({ id: kind.id, name: kind.kindName }));
  return <div className="kind-selection-slots" role="group" aria-label={screen === "initiative-list" ? "表示種別" : "比較対象"}>
    {previousKind !== undefined && onPreviousChange && screen !== "initiative-list" && <PreviousKindSelection id={`${screen}-previous-kind`} value={previousKind} disabled={disabled} onChange={onPreviousChange} />}
    <GlidingKindSlot id={`${screen}-first-kind`} label={screen === "initiative-list" ? "種別" : "比較対象1"}
      value={selected[0]} options={options.filter(item => item.id !== selected[1])} allowEmpty={false} disabled={disabled}
      onChange={value => { if (value !== null && value !== selected[0]) onChange([value as KindId, ...selected.slice(1)]); }} />
    {screen !== "initiative-list" && <GlidingKindSlot id={`${screen}-second-kind`} label="比較対象2"
      value={selected[1]} options={options.filter(item => item.id !== selected[0])} disabled={disabled}
      onChange={value => { if ((value ?? undefined) !== selected[1]) onChange([selected[0]!, ...(value === null ? [] : [value as KindId])]); }} />}
  </div>;
}
