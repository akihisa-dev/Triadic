/** Screen-only geometry: gentle attraction during movement, aligned placement on release. */
export type DetailPart = { id: string; x: number; y: number; width: number; height: number } &
  ({ kind: "text"; text: string } | { kind: "table-horizontal" | "table-vertical"; cells: string[][] });
export const PART_STEP = 24;
export const PART_MIN = 72;
export const PART_GAP = 0;
export const PART_INITIAL = { width: 168, height: 96 };
// Space for twelve month headers and the initial items, including editing controls.
export const TABLE_PART_MIN = {
  "table-horizontal": { width: 1200, height: 192 },
  "table-vertical": { width: 336, height: 456 },
};

function minimumSize(part: DetailPart) {
  return part.kind === "table-horizontal" || part.kind === "table-vertical"
    ? TABLE_PART_MIN[part.kind] : { width: PART_MIN, height: PART_MIN };
}

export function partsOverlap(a: DetailPart, b: DetailPart) {
  return a.x < b.x + b.width + PART_GAP && a.x + a.width + PART_GAP > b.x
    && a.y < b.y + b.height + PART_GAP && a.y + a.height + PART_GAP > b.y;
}

export function snapPosition(value: number) {
  return Math.max(0, Math.round(value / PART_STEP) * PART_STEP);
}

/** Keep the current landing position until crossing its midpoint by another 4px. */
export function stableSnapPosition(value: number, previous?: number) {
  return previous !== undefined && Math.abs(Math.max(0, value) - previous) <= PART_STEP / 2 + 4
    ? previous : snapPosition(value);
}

/** Gentle attraction near a dot, with continuous motion between capture zones. */
export function magnetPosition(value: number) {
  const position = Math.max(0, value);
  const distance = position - snapPosition(position);
  const attraction = Math.max(0, 1 - Math.abs(distance) / 6);
  return position - distance * attraction ** 2;
}

export function resizePart(part: DetailPart, dx: number, dy: number): DetailPart {
  const minimum = minimumSize(part);
  return { ...part, width: Math.max(minimum.width, part.width + dx), height: Math.max(minimum.height, part.height + dy) };
}

export function settlePart(part: DetailPart): DetailPart {
  const minimum = minimumSize(part);
  return { ...part, x: snapPosition(part.x), y: snapPosition(part.y),
    width: Math.max(minimum.width, snapPosition(part.width)), height: Math.max(minimum.height, snapPosition(part.height)) };
}

// Bucket only nearby rectangles for exact overlap checks. Very large rectangles
// use the fallback list so their dimensions cannot create unbounded bucket work.
class PartSpace {
  private buckets = new Map<string, DetailPart[]>();
  private large: DetailPart[] = [];
  private all: DetailPart[] = [];
  constructor(private metrics?: { overlapChecks: number }) {}
  private keys(part: DetailPart): string[] | null {
    const x0 = Math.floor(part.x / 256), y0 = Math.floor(part.y / 256);
    const x1 = Math.floor((part.x + part.width + PART_GAP) / 256), y1 = Math.floor((part.y + part.height + PART_GAP) / 256);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) return null;
    const keys: string[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.push(`${x}:${y}`);
    return keys;
  }
  add(part: DetailPart) {
    this.all.push(part);
    const keys = this.keys(part);
    if (!keys) { this.large.push(part); return; }
    for (const key of keys) {
      let bucket = this.buckets.get(key);
      if (!bucket) { bucket = []; this.buckets.set(key, bucket); }
      bucket.push(part);
    }
  }
  overlaps(part: DetailPart) {
    const keys = this.keys(part);
    const seen = new Set<DetailPart>();
    const collides = (others: DetailPart[]) => {
      for (const other of others) {
        if (seen.has(other)) continue;
        seen.add(other);
        if (this.metrics) this.metrics.overlapChecks++;
        if (partsOverlap(part, other)) return true;
      }
      return false;
    };
    if (!keys) return collides(this.all);
    if (collides(this.large)) return true;
    for (const key of keys) if (collides(this.buckets.get(key) ?? [])) return true;
    return false;
  }
}

/** The active rectangle stays under the pointer; neighbours choose the nearest free edge. */
export function arrangeParts(original: readonly DetailPart[], active: DetailPart, settled = false, metrics?: { overlapChecks: number }): DetailPart[] {
  if (settled) { original = original.map(settlePart); active = settlePart(active); }
  const forward = (value: number) => Math.ceil(value / PART_STEP) * PART_STEP;
  const backward = (value: number) => Math.floor(value / PART_STEP) * PART_STEP;
  const placed: DetailPart[] = [active], space = new PartSpace(metrics);
  space.add(active);
  for (const part of original) {
    if (part.id === active.id) continue;
    let candidate = part;
    if (space.overlaps(part)) {
      const candidates: DetailPart[] = [], xs = new Set<number>(), ys = new Set<number>();
      for (const other of placed) {
        for (const x of [forward(other.x + other.width + PART_GAP), backward(other.x - part.width - PART_GAP)]) {
          if (x >= 0 && !xs.has(x)) { xs.add(x); candidates.push({ ...part, x }); }
        }
        for (const y of [forward(other.y + other.height + PART_GAP), backward(other.y - part.height - PART_GAP)]) {
          if (y >= 0 && !ys.has(y)) { ys.add(y); candidates.push({ ...part, y }); }
        }
      }
      candidates.sort((a, b) => (a.x - part.x) ** 2 + (a.y - part.y) ** 2 - ((b.x - part.x) ** 2 + (b.y - part.y) ** 2));
      // The first free candidate in stable distance order is the old winner.
      candidate = candidates.find(item => !space.overlaps(item))!;
    }
    placed.push(candidate); space.add(candidate);
  }
  const byId = new Map(placed.map(part => [part.id, part]));
  const result = original.map(part => byId.get(part.id)!);
  if (!original.some(part => part.id === active.id)) result.push(active);
  return result;
}
