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

export type PartContact = { side: "left" | "right" | "top" | "bottom"; center: number; radius: number; depth: number };

/** Describe the actual shared edge, not the centre of the moving rectangle. */
export function partContact(part: DetailPart, active: DetailPart): PartContact | undefined {
  if (part.id === active.id || !partsOverlap(part, active)) return;
  const depths = [active.x + active.width - part.x, part.x + part.width - active.x,
    active.y + active.height - part.y, part.y + part.height - active.y];
  // Ignore floating-point residue at an exactly touching edge.
  if (Math.min(...depths) <= .01) return;
  const index = depths.indexOf(Math.min(...depths));
  const vertical = index < 2;
  const start = Math.max(vertical ? part.y : part.x, vertical ? active.y : active.x);
  const end = Math.min(vertical ? part.y + part.height : part.x + part.width,
    vertical ? active.y + active.height : active.x + active.width);
  return { side: (["left", "right", "top", "bottom"] as const)[index]!,
    center: (start + end) / 2 - (vertical ? part.y : part.x),
    radius: Math.max(1, (end - start) / 2 - 8), depth: Math.min(16, depths[index]!) };
}

/** Smooth displacement map: the border, background, text and cells bend together. */
export function contactMap(width: number, height: number, contact: PartContact & { inset?: number }): string {
  const vertical = contact.side === "left" || contact.side === "right";
  const inset = contact.inset ?? 0;
  const x = vertical ? contact.side === "left" ? inset : width - inset : contact.center;
  const y = vertical ? contact.center : contact.side === "top" ? inset : height - inset;
  const color = contact.side === "left" ? "0,128,128" : contact.side === "right" ? "255,128,128"
    : contact.side === "top" ? "128,0,128" : "128,255,128";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width + 48}" height="${height + 48}" viewBox="-24 -24 ${width + 48} ${height + 48}"><defs><radialGradient id="bend"><stop stop-color="rgb(${color})"/><stop offset=".45" stop-color="rgb(${color})" stop-opacity=".7"/><stop offset="1" stop-color="rgb(${color})" stop-opacity="0"/></radialGradient></defs><path fill="rgb(128,128,128)" d="M-24 -24H${width + 24}V${height + 24}H-24Z"/><ellipse cx="${x}" cy="${y}" rx="${vertical ? 80 : contact.radius}" ry="${vertical ? contact.radius : 80}" fill="url(#bend)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
