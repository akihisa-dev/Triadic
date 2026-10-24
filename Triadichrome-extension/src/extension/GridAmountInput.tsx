import type { ComponentPropsWithRef } from "react";
import "./GridAmountInput.css";

/** Keep the real edit value and native selection intact; grouping is display-only. */
export function GridAmountInput({ editing, value, ...props }: Omit<ComponentPropsWithRef<"input">, "value"> & { editing: boolean; value: string }) {
  const match = /^([+-]?)(\d+)(\.\d{0,3})?$/.exec(value);
  const display = match ? match[1]! + match[2]!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (match[3] ?? "") : value;
  return <span className="grid-amount-input">
    <input {...props} value={value} className={editing ? undefined : "grid-amount-idle"} />
    {!editing && <span className="grid-amount-display" aria-hidden="true">{display}</span>}
  </span>;
}
