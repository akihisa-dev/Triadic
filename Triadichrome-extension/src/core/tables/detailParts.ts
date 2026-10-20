/** Screen-only geometry: gentle attraction during movement, aligned placement on release. */
export type DetailPart = { id: string; x: number; y: number; width: number; height: number; text: string };
export const PART_STEP = 16;
export const PART_MIN = 64;
export const PART_GAP = 4;
export const PART_INITIAL = { width: 160, height: 96 };

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
  return { ...part, width: Math.max(PART_MIN, part.width + dx), height: Math.max(PART_MIN, part.height + dy) };
}

export function settlePart(part: DetailPart): DetailPart {
  return { ...part, x: snapPosition(part.x), y: snapPosition(part.y),
    width: Math.max(PART_MIN, snapPosition(part.width)), height: Math.max(PART_MIN, snapPosition(part.height)) };
}

/** The active rectangle stays under the pointer; neighbours choose the nearest free edge. */
export function arrangeParts(original: readonly DetailPart[], active: DetailPart, settled = false): DetailPart[] {
  if (settled) { original = original.map(settlePart); active = settlePart(active); }
  const forward = (value: number) => Math.ceil(value / PART_STEP) * PART_STEP;
  const backward = (value: number) => Math.floor(value / PART_STEP) * PART_STEP;
  const placed: DetailPart[] = [active];
  for (const part of original) {
    if (part.id === active.id) continue;
    let candidate = part;
    if (placed.some(other => partsOverlap(part, other))) {
      const candidates = placed.flatMap(other => [
        { ...part, x: forward(other.x + other.width + PART_GAP) },
        { ...part, x: backward(other.x - part.width - PART_GAP) },
        { ...part, y: forward(other.y + other.height + PART_GAP) },
        { ...part, y: backward(other.y - part.height - PART_GAP) },
      ]).filter(item => item.x >= 0 && item.y >= 0 && !placed.some(other => partsOverlap(item, other)));
      candidates.sort((a, b) => (a.x - part.x) ** 2 + (a.y - part.y) ** 2 - ((b.x - part.x) ** 2 + (b.y - part.y) ** 2));
      // A candidate beyond the furthest right edge always exists; no iterative push limit.
      candidate = candidates[0]!;
    }
    placed.push(candidate);
  }
  const byId = new Map(placed.map(part => [part.id, part]));
  const result = original.map(part => byId.get(part.id)!);
  if (!original.some(part => part.id === active.id)) result.push(active);
  return result;
}
