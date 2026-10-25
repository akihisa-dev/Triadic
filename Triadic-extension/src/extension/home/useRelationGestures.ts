import { useLayoutEffect, useRef, useState, type RefObject, type PointerEvent, type HTMLAttributes } from "react";
import { graphNodes, graphEdges } from "./homeRelations";
import { useHomeGraphMotion } from "../useHomeGraphMotion";
import { useRelationCamera, type RelationView } from "../useRelationCamera";
export const MIN_SCALE = .05;
export const MAX_SCALE = 2.5;

export function useRelationGestures(view: RefObject<RelationView | null>, disabled: boolean) {
  const graph = useHomeGraphMotion(graphNodes, graphEdges, view, () => { if (view.current?.fitted && !cameraTarget.current) fit(); });
  const viewport = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlighted, setActive] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const active = grabbed ?? focused ?? highlighted ?? selected;
  const { camera, target: cameraTarget, update, smooth, cancel: cancelZoom } = useRelationCamera(view);
  const [dragging, setDragging] = useState(false);
  const points = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ camera: RelationView; x: number; y: number; distance: number } | null>(null);
  const moved = useRef(false);
  const fit = (animated = false) => {
    const node = viewport.current;
    if (!node || !node.clientWidth || !node.clientHeight) return;
    const positions = graphNodes.map(item => ({ ...(view.current?.positions?.[item.page] ?? { x: item.x + 100, y: item.y + 12 }), halfWidth: item.width / 2 + 6, halfHeight: item.height / 2 + 6 }));
    const left = Math.min(...positions.map(point => point.x - point.halfWidth)), right = Math.max(...positions.map(point => point.x + point.halfWidth));
    const top = Math.min(...positions.map(point => point.y - point.halfHeight)), bottom = Math.max(...positions.map(point => point.y + point.halfHeight));
    const scale = Math.max(MIN_SCALE, Math.min(1, (node.clientWidth - 80) / (right - left), (node.clientHeight - 80) / (bottom - top)));
    (animated ? smooth : update)({ x: node.clientWidth / 2 - (left + right) / 2 * scale, y: node.clientHeight / 2 - (top + bottom) / 2 * scale, scale, fitted: true });
  };
  const zoom = (factor: number, x: number, y: number) => {
    const current = cameraTarget.current ?? view.current ?? camera;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, current.scale * factor));
    smooth({ x: x - (x - current.x) * scale / current.scale, y: y - (y - current.y) * scale / current.scale, scale });
  };
  const zoomCenter = (factor: number) => {
    const node = viewport.current;
    if (node) zoom(factor, node.clientWidth / 2, node.clientHeight / 2);
  };
  const focusNode = (node: typeof graphNodes[number]) => {
    setActive(null);
    setFocused(node.page);
    if (points.current.size) return;
    const current = view.current ?? camera, box = viewport.current;
    if (!box) return;
    const position = current.positions?.[node.page] ?? { x: node.x + 100, y: node.y + 12 };
    // Include the focus outline, and shrink only when the focused item cannot fit.
    const width = node.width + 12, height = node.height + 12;
    const scale = Math.min(current.scale, (box.clientWidth - 16) / width, (box.clientHeight - 16) / height);
    const x = current.x + (position.x - width / 2) * scale, y = current.y + (position.y - height / 2) * scale;
    if (scale !== current.scale || x < 8 || y < 8 || x + width * scale > box.clientWidth - 8 || y + height * scale > box.clientHeight - 8)
      update({ ...current, x: box.clientWidth / 2 - position.x * scale, y: box.clientHeight / 2 - position.y * scale, scale, fitted: false });
  };
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    if (!view.current) fit();
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1);
      zoom(Math.exp(-Math.max(-100, Math.min(100, delta)) * .006), event.clientX - rect.left, event.clientY - rect.top);
    };
    node.addEventListener("wheel", wheel, { passive: false });
    const resize = new ResizeObserver(() => { if (view.current?.fitted && !cameraTarget.current) fit(); });
    resize.observe(node);
    return () => { node.removeEventListener("wheel", wheel); resize.disconnect(); };
  }, [view]);
  const position = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const startGesture = () => {
    const values = [...points.current.values()];
    const a = values[0];
    if (!a) { gesture.current = null; return; }
    const b = values[1] ?? a;
    gesture.current = { camera: view.current ?? camera, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: values.length > 1 ? Math.hypot(a.x - b.x, a.y - b.y) : 0 };
  };
  const endPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (graph.pull.current?.pointerId === event.pointerId) { graph.release(); setGrabbed(null); }
    points.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    startGesture();
    if (!points.current.size) setDragging(false);
  };

  const handlers: HTMLAttributes<HTMLDivElement> = { onPointerDown: event => {
        if (event.button !== 0) return;
        cancelZoom();
        if (!points.current.size) moved.current = false;
        const point = position(event);
        if (!points.current.size && !disabled) {
          const target = event.target instanceof Element ? event.target.closest<HTMLElement>(".home-relation-node, .home-relation-subnode") : null;
          if (target?.dataset.page) {
            graph.begin(target.dataset.page, event.pointerId, point.x, point.y);
            setGrabbed(target.dataset.page);
          }
        } else if (points.current.size) { graph.release(); setGrabbed(null); moved.current = true; }
        points.current.set(event.pointerId, point);
        startGesture();
      },
onPointerMove: event => {
        setFocused(null);
        if (!points.current.has(event.pointerId) || !gesture.current) return;
        points.current.set(event.pointerId, position(event));
        const values = [...points.current.values()], a = values[0];
        if (!a) return;
        const b = values[1] ?? a;
        const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
        const start = gesture.current;
        if (!moved.current && values.length === 1 && Math.hypot(x - start.x, y - start.y) < 5) return;
        moved.current = true;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        if (graph.pull.current && values.length === 1) {
          graph.move(x, y, (view.current ?? camera).scale);
          return;
        }
        const scale = start.distance ? Math.max(MIN_SCALE, Math.min(MAX_SCALE, start.camera.scale * Math.hypot(a.x - b.x, a.y - b.y) / start.distance)) : start.camera.scale;
        (values.length > 1 ? smooth : update)({ x: x - (start.x - start.camera.x) * scale / start.camera.scale, y: y - (start.y - start.camera.y) * scale / start.camera.scale, scale });
      },
onPointerUp: endPointer,
onPointerCancel: endPointer,
onLostPointerCapture: event => { if (points.current.has(event.pointerId)) endPointer(event); },
onPointerLeave: event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) endPointer(event); },
onClick: event => {
        if (event.target instanceof Element && !event.target.closest(".home-relation-node, .home-relation-subnode")) {
          setSelected(null); setActive(null); setFocused(null);
          viewport.current?.focus({ preventScroll: true });
        }
      },
onClickCapture: event => { if (moved.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); } },
onKeyDown: event => {
        if (event.key === "Escape") { event.preventDefault(); setSelected(null); setActive(null); setFocused(null); viewport.current?.focus({ preventScroll: true }); return; }
        if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
        if (event.target !== event.currentTarget && !(event.target instanceof Element && event.target.closest(".home-relation-subnode"))) return;
        const current = view.current ?? camera;
        const steps: Record<string, [number, number]> = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] };
        const step = steps[event.key];
        if (step) { event.preventDefault(); const [x, y] = step; update({ ...current, x: current.x + x, y: current.y + y, fitted: false }); }
        else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomCenter(1.25); }
        else if (event.key === "-") { event.preventDefault(); zoomCenter(.8); }
        else if (event.key === "Home" || event.key === "0") { event.preventDefault(); fit(true); }
      } };
  return { viewport, selected, setSelected, setActive, setFocused, active, camera, dragging, graph, focusNode, fit, zoomCenter, handlers };
}
