import { useLayoutEffect, useRef, type RefObject } from "react";
import { HomeMotion, motionLine, type MotionNode, type MotionEdge } from "../core/graph/homeMotion";
import type { RelationView } from "./useRelationCamera";

type Pull = { page: string; pointerId: number; x: number; y: number; startX: number; startY: number; started: boolean };

export function useHomeGraphMotion(nodes: readonly MotionNode[], edges: readonly MotionEdge[], view: RefObject<RelationView | null>, onLayout?: () => void, route?: (edge: MotionEdge, positions: Record<string, { x: number; y: number }>) => string) {
  const groups = useRef(new Map<string, SVGGElement>());
  const paths = useRef(new Map<number, SVGPathElement>());
  const pull = useRef<Pull | null>(null);
  const simulation = useRef<HomeMotion | null>(null);
  const wake = useRef(() => {});
  const paint = useRef(() => {});
  const layout = useRef(onLayout);
  layout.current = onLayout;
  const routeRef = useRef(route); routeRef.current = route;

  useLayoutEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    // Always reopen at the layout anchors, including when a return was interrupted.
    const motion = new HomeMotion(nodes);
    simulation.current = motion;
    for (const node of nodes) {
      const card = groups.current.get(node.page)?.querySelector<HTMLElement>(".home-relation-node");
      if (card) motion.bodies.get(node.page)!.width = card.offsetWidth;
    }
    paint.current = () => {
      for (const node of nodes) {
        const body = motion.bodies.get(node.page)!;
        groups.current.get(node.page)?.setAttribute("transform", `translate(${body.x - node.x - 100} ${body.y - node.y - 12})`);
      }
      const positions = motion.positions();
      edges.forEach((edge, index) => paths.current.get(index)?.setAttribute("d", routeRef.current?.(edge, positions) ?? motionLine(motion.bodies.get(edge.from)!, motion.bodies.get(edge.to)!, edge.double)));
      if (view.current) view.current.positions = positions;
      layout.current?.();
    };
    let frame = 0, previous = 0;
    const animate = (time: number) => {
      motion.advance((time - previous) / 1000, preference.matches);
      previous = time;
      paint.current();
      frame = motion.active ? requestAnimationFrame(animate) : 0;
    };
    wake.current = () => { if (!frame) { previous = performance.now(); frame = requestAnimationFrame(animate); } };
    paint.current();
    wake.current();
    return () => { cancelAnimationFrame(frame); simulation.current = null; wake.current = paint.current = () => {}; };
  }, [nodes, edges, view]);

  return {
    groups, paths, pull,
    retarget(positions: Record<string, { x: number; y: number }>) { simulation.current?.retarget(positions); wake.current(); },
    begin(page: string, pointerId: number, x: number, y: number) {
      const body = simulation.current?.bodies.get(page);
      if (!body) return;
      if (view.current) view.current.fitted = false;
      // A press is still a possible click: don't interrupt a moving node until dragging starts.
      pull.current = { page, pointerId, x, y, startX: body.x, startY: body.y, started: false };
    },
    move(x: number, y: number, scale: number) {
      const current = pull.current;
      if (!current) return;
      if (!current.started) {
        const body = simulation.current?.bodies.get(current.page);
        if (!body) return;
        current.startX = body.x; current.startY = body.y;
        simulation.current!.hold(current.page);
        current.started = true;
      }
      simulation.current?.move(current.startX + (x - current.x) / scale, current.startY + (y - current.y) / scale);
      if (view.current) view.current.fitted = false;
      // Position and both line endpoints share the pointer update, without a React/frame delay.
      paint.current();
      wake.current();
    },
    release() { if (pull.current?.started) simulation.current?.release(); pull.current = null; wake.current(); },
  };
}
