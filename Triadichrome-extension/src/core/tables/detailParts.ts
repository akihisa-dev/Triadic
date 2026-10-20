/** Screen-only geometry. Positions are free; only dimensions use a size increment. */
export type DetailPart = { id: string; x: number; y: number; width: number; height: number };
export type PartEdge = "top" | "right" | "bottom" | "left";
export const PART_STEP = 16;
export const PART_MIN = 64;
export const PART_GAP = 4;
export const PART_INITIAL = { width: 160, height: 96 };

export function partsOverlap(a: DetailPart, b: DetailPart) {
  return a.x < b.x + b.width + PART_GAP && a.x + a.width + PART_GAP > b.x
    && a.y < b.y + b.height + PART_GAP && a.y + a.height + PART_GAP > b.y;
}

export function resizePart(part: DetailPart, edge: PartEdge, dx: number, dy: number): DetailPart {
  if (edge === "right") return { ...part, width: Math.max(PART_MIN, part.width + dx) };
  if (edge === "bottom") return { ...part, height: Math.max(PART_MIN, part.height + dy) };
  if (edge === "left") {
    const x = Math.max(0, Math.min(part.x + dx, part.x + part.width - PART_MIN));
    return { ...part, x, width: part.x + part.width - x };
  }
  const y = Math.max(0, Math.min(part.y + dy, part.y + part.height - PART_MIN));
  return { ...part, y, height: part.y + part.height - y };
}

export function settlePart(part: DetailPart, edge?: PartEdge): DetailPart {
  const dimension = (value: number) => Math.max(PART_MIN, Math.round(value / PART_STEP) * PART_STEP);
  let width = dimension(part.width), height = dimension(part.height);
  // Keep the opposite edge stationary when resizing from the top/left boundaries.
  if (edge === "left") width = Math.min(width, Math.floor((part.x + part.width) / PART_STEP) * PART_STEP);
  if (edge === "top") height = Math.min(height, Math.floor((part.y + part.height) / PART_STEP) * PART_STEP);
  return { ...part, width, height,
    x: edge === "left" ? part.x + part.width - width : part.x,
    y: edge === "top" ? part.y + part.height - height : part.y };
}

/** The active rectangle stays under the pointer; neighbours choose the nearest free edge. */
export function arrangeParts(original: readonly DetailPart[], active: DetailPart): DetailPart[] {
  const placed: DetailPart[] = [active];
  for (const part of original) {
    if (part.id === active.id) continue;
    let candidate = part;
    if (placed.some(other => partsOverlap(part, other))) {
      const candidates = placed.flatMap(other => [
        { ...part, x: other.x + other.width + PART_GAP },
        { ...part, x: other.x - part.width - PART_GAP },
        { ...part, y: other.y + other.height + PART_GAP },
        { ...part, y: other.y - part.height - PART_GAP },
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
