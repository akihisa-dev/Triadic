export type MotionNode = { page: string; x: number; y: number; width?: number; height?: number; sub?: boolean };
export type MotionEdge = { from: string; to: string; double?: boolean };
type Body = { x: number; y: number; vx: number; vy: number; width: number; height: number; sub: boolean };

/** Dragging returns to the current layout; selection can move all layout anchors. */
export class HomeMotion {
  readonly bodies: Map<string, Body>;
  private readonly anchors: Map<string, { x: number; y: number }>;
  held: string | null = null;
  constructor(nodes: readonly MotionNode[]) {
    this.anchors = new Map(nodes.map(node => [node.page, { x: node.x + 100, y: node.y + 12 }]));
    this.bodies = new Map(nodes.map(node => [node.page, {
      ...this.anchors.get(node.page)!, vx: 0, vy: 0,
      width: node.width ?? 140, height: node.height ?? 72, sub: !!node.sub,
    }]));
  }
  get active() { return this.held !== null || [...this.bodies].some(([page, body]) => {
    const anchor = this.anchors.get(page)!;
    return body.x !== anchor.x || body.y !== anchor.y || body.vx !== 0 || body.vy !== 0;
  }); }
  retarget(positions: Record<string, { x: number; y: number }>) {
    for (const [page, point] of Object.entries(positions)) {
      if (this.bodies.has(page)) this.anchors.set(page, { ...point });
    }
  }
  hold(page: string) {
    this.held = page;
    const body = this.bodies.get(page)!;
    body.vx = body.vy = 0;
  }
  move(x: number, y: number) {
    if (!this.held) return;
    const body = this.bodies.get(this.held)!;
    body.x = x; body.y = y;
  }
  release() { this.held = null; }
  advance(seconds: number, reduced = false) {
    const dt = Math.min(.05, Math.max(0, seconds));
    if (dt > 0) this.step(dt, reduced);
  }
  private step(dt: number, reduced: boolean) {
    for (const [page, body] of this.bodies) {
      if (page === this.held) continue;
      const anchor = this.anchors.get(page)!;
      // Exact solution at the actual frame time; no fixed-step pauses on fast displays.
      // Retargeting preserves both position and velocity, with a gentle, non-bouncing stop.
      const speed = reduced ? 45 : 10;
      for (const [axis, velocity] of [["x", "vx"], ["y", "vy"]] as const) {
        const offset = body[axis] - anchor[axis];
        const impulse = body[velocity] + speed * offset;
        const decay = Math.exp(-speed * dt);
        body[axis] = anchor[axis] + (offset + impulse * dt) * decay;
        body[velocity] = (body[velocity] - speed * impulse * dt) * decay;
        if (Math.abs(body[axis] - anchor[axis]) < .02 && Math.abs(body[velocity]) < .1) {
          body[axis] = anchor[axis]; body[velocity] = 0;
        }
      }
    }
  }
  positions() { return Object.fromEntries([...this.bodies].map(([page, body]) => [page, { x: body.x, y: body.y }])); }
}

/** Clip both ends together so close nodes never produce a reversed line. */
export function motionLine(a: Body, b: Body, double = false) {
  const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
  if (distance < .001) return `M${a.x} ${a.y} L${a.x} ${a.y}`;
  const ux = dx / distance, uy = dy / distance;
  const inset = (body: Body) => Math.min(body.width / 2 / Math.max(.001, Math.abs(ux)), body.height / 2 / Math.max(.001, Math.abs(uy)));
  const start = inset(a), end = inset(b);
  const line = (offset: number) => {
    const nx = -uy * offset, ny = ux * offset;
    const clip = (body: Body, direction: number) => Math.min(
      (body.width / 2 - direction * Math.sign(ux) * nx) / Math.max(.001, Math.abs(ux)),
      (body.height / 2 - direction * Math.sign(uy) * ny) / Math.max(.001, Math.abs(uy)));
    const first = clip(a, 1), last = clip(b, -1), fit = Math.min(1, distance / (first + last));
    return `M${a.x + ux * first * fit + nx} ${a.y + uy * first * fit + ny} L${b.x - ux * last * fit + nx} ${b.y - uy * last * fit + ny}`;
  };
  return double && distance > start + end + 4 ? `${line(-2)} ${line(2)}` : line(0);
}
