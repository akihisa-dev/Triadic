import { GlidingKindSlot } from "./GlidingKindSlot";
import { previousKindName, type PreviousKind } from "../core/domain/kinds";
import "./KindSelectionSlots.css";

export function PreviousKindSelection({ id, value, disabled, onChange, label = "基準前年" }: {
  id: string; value: PreviousKind; disabled: boolean; onChange: (kind: PreviousKind) => void; label?: string;
}) {
  return <GlidingKindSlot id={id} label={label} value={value} allowEmpty={false} disabled={disabled}
    options={([1, 2] as const).map(id => ({ id, name: previousKindName(id) }))}
    onChange={next => { if (next === 1 || next === 2) onChange(next); }} />;
}
