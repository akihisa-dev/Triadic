import { useLayoutEffect, useRef, type ReactNode } from "react";

export type MasterDrop = { key: string; into: boolean };
export type MasterDropSlot = MasterDrop & { closing: boolean };

/** Reverse an in-flight opening from its current height instead of restarting it. */
export function AggregationDropSlot({ slot, name, onClosed, children, height: openHeight = 36 }: { slot: MasterDropSlot; name: string; onClosed: (key: string) => void; children: ReactNode; height?: number }) {
  const row = useRef<HTMLTableRowElement>(null), animations = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    const nodes = [...row.current!.querySelectorAll<HTMLElement>(".aggregation-slot-content,.aggregation-slot-grip>span")];
    const heights = nodes.map(node => node.getBoundingClientRect().height);
    animations.current.forEach(animation => animation.cancel());
    const height = slot.closing ? 0 : openHeight;
    const reduced = row.current!.ownerDocument.defaultView!.matchMedia("(prefers-reduced-motion: reduce)").matches;
    animations.current = nodes.map((node, index) => {
      node.style.height = `${height}px`;
      return node.animate([{ height: `${heights[index]}px` }, { height: `${height}px` }], { duration: reduced ? 0 : 180, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
    let obsolete = false;
    void Promise.all(animations.current.map(animation => animation.finished.catch(() => {}))).then(() => { if (!obsolete && slot.closing) onClosed(slot.key); });
    return () => { obsolete = true; };
  }, [slot.closing, openHeight]);
  useLayoutEffect(() => () => animations.current.forEach(animation => animation.cancel()), []);
  return <tr ref={row} className={`aggregation-drop-slot${slot.closing ? " is-closing" : ""}`} data-drop-target={slot.key} data-drop-into={slot.into} aria-hidden={slot.closing || undefined} aria-label={`${name}の移動先`}>
    <td className="aggregation-gutter" /><td className="aggregation-slot-grip" aria-hidden="true"><span>⠿</span></td>
    <td colSpan={2}><div className="aggregation-slot-content">{children}</div></td>
  </tr>;
}
