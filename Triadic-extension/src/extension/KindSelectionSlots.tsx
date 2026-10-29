import type { KindId } from "../core/domain/kinds";
import { INITIAL_KINDS } from "../core/domain/kinds";
import { GlidingKindSlot } from "./GlidingKindSlot";
import "./KindSelectionSlots.css";

export function KindSelectionSlots({ screen, selected, disabled, phase = null, onChange }: {
  phase?: KindId | null; screen: "initiative-list"; selected: KindId[]; disabled: boolean; onChange: (selected: KindId[]) => void;
}) {
  if (phase !== null) return <span>{phase === 1 ? "一次予算" : "確定予算"}</span>;
  const options = INITIAL_KINDS.map(kind => ({ id: kind.id, name: kind.kindName }));
  return <div className="kind-selection-slots" role="group" aria-label="表示種別">
    <GlidingKindSlot id={`${screen}-first-kind`} label="種別"
      value={selected[0]} options={options.filter(item => item.id !== selected[1])} allowEmpty={false} disabled={disabled}
      onChange={value => { if (value !== null && value !== selected[0]) onChange([value as KindId, ...selected.slice(1)]); }} />

  </div>;
}
