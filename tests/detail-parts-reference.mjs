// Exhaustive reference implementation for the current placement rules.
const PART_STEP = 24, PART_GAP = 0;
export function referenceArrangement(original, active, settled, { partsOverlap, settlePart }) {
  if (settled) { original = original.map(settlePart); active = settlePart(active); }
  const forward = (value) => Math.ceil(value / PART_STEP) * PART_STEP;
  const backward = (value) => Math.floor(value / PART_STEP) * PART_STEP;
  const placed = [active];
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
      candidate = candidates[0];
    }
    placed.push(candidate);
  }
  const byId = new Map(placed.map(part => [part.id, part]));
  const result = original.map(part => byId.get(part.id));
  if (!original.some(part => part.id === active.id)) result.push(active);
  return result;
}
