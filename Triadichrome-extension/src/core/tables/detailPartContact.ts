import { PART_STEP, partsOverlap, settlePart, type DetailPart } from './detailParts';

/** Resolve only the moving part; all other positions and contents stay untouched. */
export function freePart(original: readonly DetailPart[], requested: DetailPart): DetailPart {
  const active = settlePart(requested);
  const others = original.filter(part => part.id !== active.id);
  const free = (part: DetailPart) => others.every(other => !partsOverlap(part, other));
  if (free(active)) return active;
  const xs = new Set([active.x, 0]), ys = new Set([active.y, 0]);
  for (const other of others) {
    xs.add(Math.ceil((other.x + other.width) / PART_STEP) * PART_STEP);
    ys.add(Math.ceil((other.y + other.height) / PART_STEP) * PART_STEP);
    if (other.x >= active.width) xs.add(Math.floor((other.x - active.width) / PART_STEP) * PART_STEP);
    if (other.y >= active.height) ys.add(Math.floor((other.y - active.height) / PART_STEP) * PART_STEP);
  }
  const candidates = [...xs].map(x => ({ ...active, x })).concat([...ys].map(y => ({ ...active, y })));
  candidates.sort((a, b) => (a.x-active.x)**2 + (a.y-active.y)**2 - (b.x-active.x)**2 - (b.y-active.y)**2);
  return candidates.find(free)!; // Beyond the outermost edge is always free.
}

/** Sweep from the last unobstructed position so even a fast pointer cannot tunnel through a part. */
export function contactPosition(original: readonly DetailPart[], from: DetailPart, target: DetailPart): DetailPart {
  const dx = target.x - from.x, dy = target.y - from.y;
  let fraction = 1;
  for (const other of original) {
    if (other.id === target.id) continue;
    const interval = (start: number, delta: number, low: number, high: number): [number, number] => {
      if (!delta) return start > low && start < high ? [-Infinity, Infinity] : [Infinity, -Infinity];
      const a = (low - start) / delta, b = (high - start) / delta;
      return [Math.min(a, b), Math.max(a, b)];
    };
    const [x0,x1] = interval(from.x, dx, other.x - from.width, other.x + other.width);
    const [y0,y1] = interval(from.y, dy, other.y - from.height, other.y + other.height);
    const enter = Math.max(x0,y0), leave = Math.min(x1,y1);
    if (enter >= 0 && enter < fraction && leave > enter) fraction = enter;
  }
  return { ...target, x: from.x + dx * fraction, y: from.y + dy * fraction };
}

export function elasticPosition(safe: DetailPart, target: DetailPart): DetailPart {
  const dx = target.x-safe.x, dy = target.y-safe.y, distance = Math.hypot(dx,dy);
  const ratio = distance ? 16 * (1-Math.exp(-distance/45)) / distance : 0;
  return { ...safe, x: safe.x + dx*ratio, y: safe.y + dy*ratio };
}

/** A local indentation on the contacted edge, used for display only. */
export function contactClip(part: DetailPart, active: DetailPart): string | undefined {
  if (part.id === active.id || !partsOverlap(part, active)) return;
  const left = active.x+active.width-part.x, right = part.x+part.width-active.x;
  const top = active.y+active.height-part.y, bottom = part.y+part.height-active.y;
  const edge = Math.min(left,right,top,bottom);
  const depth = Math.min(edge,16);
  const x = Math.max(20, Math.min(part.width-20, active.x+active.width/2-part.x));
  const y = Math.max(20, Math.min(part.height-20, active.y+active.height/2-part.y));
  const w = part.width, h = part.height;
  const points = edge === left ? `0 0, ${w} 0, ${w} ${h}, 0 ${h}, 0 ${y+20}, ${depth*.7} ${y+10}, ${depth} ${y}, ${depth*.7} ${y-10}, 0 ${y-20}`
    : edge === right ? `0 0, ${w} 0, ${w} ${y-20}, ${w-depth*.7} ${y-10}, ${w-depth} ${y}, ${w-depth*.7} ${y+10}, ${w} ${y+20}, ${w} ${h}, 0 ${h}`
    : edge === top ? `0 0, ${x-20} 0, ${x-10} ${depth*.7}, ${x} ${depth}, ${x+10} ${depth*.7}, ${x+20} 0, ${w} 0, ${w} ${h}, 0 ${h}`
    : `0 0, ${w} 0, ${w} ${h}, ${x+20} ${h}, ${x+10} ${h-depth*.7}, ${x} ${h-depth}, ${x-10} ${h-depth*.7}, ${x-20} ${h}, 0 ${h}`;
  return `polygon(${points.split(', ').map(point => point.split(' ').map(value => `${value}px`).join(' ')).join(', ')})`;
}
