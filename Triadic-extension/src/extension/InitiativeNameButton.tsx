import { useId, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { createPortal } from "react-dom";
import "./InitiativeNameButton.css";

export function InitiativeNameButton({ name, note, children, onFocus, onBlur, ...props }: ComponentPropsWithoutRef<"button"> & { name: string; note: string }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null), tooltip = useRef<HTMLDivElement>(null);
  const hovering = useRef(false), hoveringTooltip = useRef(false);
  const [open, setOpen] = useState(false);
  const show = () => {
    const node = button.current;
    if (node && (node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight)) setOpen(true);
  };
  const leave = () => { if (!hovering.current && !hoveringTooltip.current && document.activeElement !== button.current) setOpen(false); };
  useLayoutEffect(() => {
    if (!open) return;
    const node = tooltip.current!, anchor = button.current!;
    node.showPopover();
    const box = anchor.getBoundingClientRect(), size = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - size.width - 8))}px`;
    const below = box.bottom + 6;
    node.style.top = `${below + size.height <= window.innerHeight - 8 ? below : Math.max(8, box.top - size.height - 6)}px`;
    const dismiss = () => { hoveringTooltip.current = false; setOpen(false); };
    const scroll = (event: Event) => { if (!(event.target instanceof Node && node.contains(event.target))) dismiss(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); } };
    window.addEventListener("scroll", scroll, true); window.addEventListener("resize", dismiss);
    document.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", dismiss);
      document.removeEventListener("keydown", escape, true);
      if (node.isConnected && node.matches(":popover-open")) node.hidePopover();
    };
  }, [open, name, note]);
  return <>
    <button {...props} ref={button} title={open ? undefined : note || name} aria-describedby={open ? id : undefined}
      onFocus={event => { onFocus?.(event); show(); }}
      onBlur={event => { onBlur?.(event); if (!hovering.current && !hoveringTooltip.current) setOpen(false); }}
      onPointerEnter={() => { hovering.current = true; show(); }}
      onPointerLeave={event => {
        hovering.current = false;
        if (event.relatedTarget instanceof Node && tooltip.current?.contains(event.relatedTarget)) return;
        leave();
      }}>{children}</button>
    {open && createPortal(<div id={id} ref={tooltip} role="tooltip" popover="manual" className="initiative-name-tooltip"
      onPointerEnter={() => { hoveringTooltip.current = true; }}
      onPointerLeave={event => {
        hoveringTooltip.current = false;
        if (event.relatedTarget instanceof Node && button.current?.contains(event.relatedTarget)) return;
        leave();
      }}><div>{name}</div>{note && <p>{note}</p>}</div>, document.body)}
  </>;
}
