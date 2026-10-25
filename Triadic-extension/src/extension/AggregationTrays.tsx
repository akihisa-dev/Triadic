import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import type { AggregationRange } from "../core/tables/aggregationLayout";
import type { MasterDropSlot } from "./AggregationDropSlot";

type Props = {
  ranges: AggregationRange[];
  slots: MasterDropSlot[];
  table: RefObject<HTMLTableElement | null>;
  surface: RefObject<HTMLDivElement | null>;
  viewport: RefObject<HTMLDivElement | null>;
  highlighted: number | null;
  destination: number | null;
  dragged: boolean;
  disabled: boolean;
  forbidden: Set<number>;
  onChoose: (id: number) => void;
};

/** Observe row sizes once. Gap animation changes paths directly without rendering the table again. */
export function AggregationTrays({ ranges, slots, table, surface, viewport, highlighted, destination, dragged, disabled, forbidden, onChoose }: Props) {
  const trays = useMemo(() => ranges.flatMap(range => range.segments.map((segment, index) => ({ ...segment, key: `${range.id}:${index}`, id: range.id, name: range.name, x: range.lane * 28 + .5 }))), [ranges]);
  const fills = useRef<SVGSVGElement>(null), outlines = useRef<SVGSVGElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const labels = useRef(new Map<string, HTMLSpanElement>());
  useLayoutEffect(() => {
    const initialize = () => {
      const grid = table.current!, element = surface.current!, scroller = viewport.current!;
      const sequence = [...grid.tBodies[0]!.rows];
      const heights = new Map<Element, number>(sequence.map(row => [row, row.getBoundingClientRect().height]));
      const nodes = trays.map(tray => ({ tray, button: buttons.current.get(tray.key)!, label: labels.current.get(tray.key)!, textHeight: labels.current.get(tray.key)!.offsetHeight, top: 0, height: 0 }));
      const fillPaths = [...fills.current!.children], outlinePaths = [...outlines.current!.children];
      let width = grid.getBoundingClientRect().width, header = grid.tHead!.getBoundingClientRect().height;
      let right = 0, frame = 0;
      const measureRight = () => {
        const first = sequence.find(row => row.dataset.row);
        right = first ? first.cells[3]!.getBoundingClientRect().left - element.getBoundingClientRect().left : width;
      };
      const positionLabels = (visibleStart = scroller.scrollTop + header, visibleEnd = scroller.scrollTop + scroller.clientHeight) => {
        for (const { label, textHeight, top, height } of nodes) {
          const visibleTop = Math.max(visibleStart, top), visibleBottom = Math.min(visibleEnd, top + height);
          const y = Math.max(0, Math.min(height - textHeight, (visibleTop + visibleBottom - textHeight) / 2 - top));
          label.style.transform = `translate3d(0,${Math.round(y)}px,0)`;
          label.style.visibility = textHeight <= height && visibleBottom > visibleTop ? "visible" : "hidden";
        }
      };
      const draw = () => {
        const visibleStart = scroller.scrollTop + header, visibleEnd = scroller.scrollTop + scroller.clientHeight;
        const bounds: { top: number; bottom: number }[] = [];
        let y = header;
        for (const row of sequence) {
          const height = heights.get(row)!;
          if (row.dataset.row) bounds.push({ top: y, bottom: y + height });
          y += height;
        }
        for (const svg of [fills.current!, outlines.current!]) { svg.setAttribute("width", String(width)); svg.setAttribute("height", String(y)); }
        for (const [index, node] of nodes.entries()) {
          const { tray, button } = node;
          const top = bounds[tray.start]!.top, bottom = bounds[tray.end]!.bottom, spine = tray.x + 24;
          const target = tray.groupIndex === null ? null : bounds[tray.groupIndex]!;
          const path = target
            ? `M${tray.x} ${top - .5}H${spine}V${target.top - .5}H${right - .5}V${target.bottom - .5}H${spine}V${bottom - .5}H${tray.x}Z`
            : `M${tray.x} ${top - .5}H${spine}V${bottom - .5}H${tray.x}Z`;
          fillPaths[index]!.setAttribute("d", path); outlinePaths[index]!.setAttribute("d", path);
          node.top = top; node.height = bottom - top;
          button.style.top = `${top}px`; button.style.height = `${node.height}px`;
        }
        positionLabels(visibleStart, visibleEnd);
      };
      measureRight(); draw();
      const observer = new ResizeObserver(entries => {
        let resizeWidth = false;
        for (const entry of entries) {
          const height = entry.borderBoxSize[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
          if (entry.target === grid) {
            const nextWidth = entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width;
            if (width !== nextWidth) { width = nextWidth; resizeWidth = true; }
          } else if (entry.target === grid.tHead) header = height;
          else heights.set(entry.target, height);
        }
        if (resizeWidth) measureRight();
        draw();
      });
      observer.observe(grid); observer.observe(grid.tHead!);
      for (const row of sequence) observer.observe(row);
      const scroll = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; positionLabels(); }); };
      scroller.addEventListener("scroll", scroll, { passive: true });
      const viewportObserver = new ResizeObserver(scroll);
      viewportObserver.observe(scroller);
      return () => { observer.disconnect(); viewportObserver.disconnect(); cancelAnimationFrame(frame); scroller.removeEventListener("scroll", scroll); };
    };
    let dispose: (() => void) | undefined, active = true;
    // Parent DOM refs attach after the child's initial layout effect.
    if (table.current && surface.current && viewport.current) dispose = initialize();
    else queueMicrotask(() => { if (active) dispose = initialize(); });
    return () => { active = false; dispose?.(); };
  }, [trays, slots, table, surface, viewport]);
  return <>
    <svg ref={fills} className="aggregation-trays aggregation-tray-fills" aria-hidden="true">{trays.map(tray => <path key={tray.key} data-group-id={tray.id} className={highlighted === tray.id ? "is-highlighted" : undefined} />)}</svg>
    <svg ref={outlines} className="aggregation-trays aggregation-tray-outlines" aria-hidden="true">{trays.map(tray => <path key={tray.key} data-group-id={tray.id} className={highlighted === tray.id ? "is-highlighted" : undefined} />)}</svg>
    {trays.map(tray => <button key={tray.key} ref={node => { if (node) buttons.current.set(tray.key, node); else buttons.current.delete(tray.key); }} data-group-id={tray.id} type="button" className={`aggregation-vertical-name${destination === tray.id ? " is-drop-target" : ""}`} style={{ left: tray.x }} aria-label={`${tray.name}の範囲${dragged ? "へ移動" : ""}`} aria-pressed={highlighted === tray.id}
      disabled={disabled || dragged && forbidden.has(tray.id)} onClick={() => onChoose(tray.id)}><span className="aggregation-label-text" ref={node => { if (node) labels.current.set(tray.key, node); else labels.current.delete(tray.key); }}>{tray.name}</span></button>)}
  </>;
}
