/** Diagram coordinates are independent of viewport scale and user data. */
export type RelationPoint = { x: number; y: number };
type Destination = { page: string };
type Relation = { from: string; to: string; kind: string; label: string };
export const tablePages = ["initiative-list", "cost-table", "expansion-table"] as const;
export const isTablePage = (page: string) => (tablePages as readonly string[]).includes(page);
export const relationLabelWidth = (edge: Relation) => Math.max(112, edge.label.length * 13 + 12);

/** Walk the complete undirected relationship graph, including cycles, without a depth limit. */
export function homeRelationDistances(relations: readonly Relation[], selected: string | null) {
  const distances = new Map<string, number>();
  if (!selected) return distances;
  const adjacent = new Map<string, string[]>();
  for (const { from, to } of relations) {
    adjacent.set(from, [...(adjacent.get(from) ?? []), to]);
    adjacent.set(to, [...(adjacent.get(to) ?? []), from]);
  }
  const pending = [selected]; distances.set(selected, 0);
  for (let i = 0; i < pending.length; i++) {
    const current = pending[i]!;
    for (const next of adjacent.get(current) ?? []) if (!distances.has(next)) {
      distances.set(next, distances.get(current)! + 1); pending.push(next);
    }
  }
  return distances;
}

function ring(count: number, cy: number) {
  const samples: { point: RelationPoint; length: number }[] = [];
  let length = 0, previous: RelationPoint | undefined;
  for (let i = 0; i <= 1800; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 900;
    const point = { x: 400 + 314 * Math.cos(angle), y: cy + 350 * Math.sin(angle) };
    if (previous) length += Math.hypot(point.x - previous.x, point.y - previous.y);
    samples.push({ point, length }); previous = point;
  }
  let index = 0;
  return Array.from({ length: count }, (_, i) => {
    while (index < samples.length - 1 && samples[index]!.length < length * i / count) index++;
    return samples[index]!.point;
  });
}

type Curve = { start: RelationPoint; first: RelationPoint; second: RelationPoint; end: RelationPoint };
export function homeRelationCurve(from: RelationPoint, to: RelationPoint, fromPage: string, toPage: string): Curve {
  const a = { x: from.x, y: from.y - (isTablePage(fromPage) ? 0 : 17) };
  const b = { x: to.x, y: to.y - (isTablePage(toPage) ? 0 : 17) };
  const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
  if (distance < 1) return { start: a, first: a, second: a, end: a };
  const firstInset = isTablePage(fromPage) ? 64 : 24, lastInset = isTablePage(toPage) ? 64 : 24;
  const fit = Math.min(1, distance / (firstInset + lastInset));
  const start = { x: a.x + dx / distance * firstInset * fit, y: a.y + dy / distance * firstInset * fit };
  const end = { x: b.x - dx / distance * lastInset * fit, y: b.y - dy / distance * lastInset * fit };
  let bend = Math.min(18, distance * .025);
  if (isTablePage(fromPage) && isTablePage(toPage)) bend = 0;
  if (fromPage === "account-type-master") bend = toPage === "amount-item-master" ? 85 : -160;
  if (fromPage === "industry-master" && toPage === "department-master") bend = -115;
  if (fromPage === "expansion-category-master" && toPage === "expansion-master") bend = -110;
  if (fromPage === "expansion-master" && toPage === "expansion-table") bend = -190;
  const nx = -dy / distance * bend, ny = dx / distance * bend;
  return { start, end, first: { x: start.x + (end.x - start.x) / 3 + nx, y: start.y + (end.y - start.y) / 3 + ny },
    second: { x: end.x - (end.x - start.x) / 3 + nx, y: end.y - (end.y - start.y) / 3 + ny } };
}

export function curvePoint(curve: Curve, t: number) {
  const u = 1 - t;
  return { x: u ** 3 * curve.start.x + 3 * u ** 2 * t * curve.first.x + 3 * u * t ** 2 * curve.second.x + t ** 3 * curve.end.x,
    y: u ** 3 * curve.start.y + 3 * u ** 2 * t * curve.first.y + 3 * u * t ** 2 * curve.second.y + t ** 3 * curve.end.y };
}

type Box = { left: number; top: number; right: number; bottom: number };
function overlaps(a: Box, b: Box, gap = 8) {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}
export function segmentHitsRelationBox(a: RelationPoint, b: RelationPoint, box: Box) {
  let low = 0, high = 1;
  for (const [axis, min, max] of [["x", box.left, box.right], ["y", box.top, box.bottom]] as const) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < .0001) { if (a[axis] < min || a[axis] > max) return false; }
    else {
      const first = (min - a[axis]) / delta, last = (max - a[axis]) / delta;
      low = Math.max(low, Math.min(first, last)); high = Math.min(high, Math.max(first, last));
      if (low > high) return false;
    }
  }
  return true;
}

function placeDescriptions(positions: Record<string, RelationPoint>, destinations: readonly Destination[], relations: readonly Relation[]) {
  const obstacles: Box[] = destinations.map(({ page }) => {
    const p = positions[page]!;
    return isTablePage(page) ? { left: p.x - 76, right: p.x + 76, top: p.y - 76, bottom: p.y + 76 }
      : { left: p.x - 94, right: p.x + 94, top: p.y - 58, bottom: p.y + 58 };
  });
  obstacles.push({ left: positions.brand!.x - 90, right: positions.brand!.x + 90, top: positions.brand!.y - 44, bottom: positions.brand!.y + 44 });
  const curves = relations.map(edge => homeRelationCurve(positions[edge.from]!, positions[edge.to]!, edge.from, edge.to));
  const samples = curves.map(curve => Array.from({ length: 101 }, (_, i) => curvePoint(curve, i / 100)));
  const placed: Box[] = [];
  const order = relations.map((edge, index) => ({ index, length: Math.hypot(positions[edge.to]!.x - positions[edge.from]!.x, positions[edge.to]!.y - positions[edge.from]!.y) }))
    .sort((a, b) => a.length - b.length);
  for (const { index } of order) {
    const curve = curves[index]!, width = relationLabelWidth(relations[index]!);
    let best: RelationPoint | undefined, bestScore = Infinity;
    for (const t of [.5, .35, .65, .22, .78, .12, .88, .42, .58]) for (const offset of [0, -24, 24, -48, 48, -72, 72, -96, 96]) {
      const point = curvePoint(curve, t), before = curvePoint(curve, Math.max(0, t - .01)), after = curvePoint(curve, Math.min(1, t + .01));
      const distance = Math.hypot(after.x - before.x, after.y - before.y) || 1;
      const p = { x: point.x - (after.y - before.y) / distance * offset, y: point.y + (after.x - before.x) / distance * offset };
      const box = { left: p.x - width / 2, right: p.x + width / 2, top: p.y - 14, bottom: p.y + 14 };
      if (obstacles.some(other => overlaps(box, other)) || placed.some(other => overlaps(box, other))) continue;
      if (samples.some((line, other) => other !== index && line.slice(1).some((end, i) => segmentHitsRelationBox(line[i]!, end, box)))) continue;
      const score = Math.abs(offset) * 4 + Math.abs(t - .5) * 100;
      if (score < bestScore) { best = p; bestScore = score; }
    }
    if (!best) throw new Error(`関係の説明を重ねずに配置できません: ${relations[index]!.label}`);
    positions[`relation-${index}`] = best;
    placed.push({ left: best.x - width / 2, right: best.x + width / 2, top: best.y - 14, bottom: best.y + 14 });
  }
}

export function layoutHomeRelations(destinations: readonly Destination[], relations: readonly Relation[], selected: string | null) {
  const positions: Record<string, RelationPoint> = {};
  if (!selected || !destinations.some(node => node.page === selected)) {
    const base = 315 + 125 * Math.sqrt(3);
    positions["initiative-list"] = { x: 400, y: 315 }; positions["cost-table"] = { x: 275, y: base }; positions["expansion-table"] = { x: 525, y: base };
    const masters = destinations.filter(node => !isTablePage(node.page)), points = ring(masters.length, (315 + base * 2) / 3);
    masters.forEach((node, i) => { positions[node.page] = points[i]!; });
    positions.brand = { x: 400, y: (315 + base * 2) / 3 };
    relations.forEach((edge, i) => { positions[`relation-${i}`] = { x: (positions[edge.from]!.x + positions[edge.to]!.x) / 2, y: (positions[edge.from]!.y + positions[edge.to]!.y) / 2 }; });
    return positions;
  }
  const base: Record<string, RelationPoint> = {
    "account-type-master": { x: 120, y: 190 }, "amount-item-master": { x: 160, y: 450 }, "account-master": { x: 320, y: 300 },
    "industry-master": { x: 510, y: 200 }, "department-master": { x: 730, y: 170 }, "kind-master": { x: 1070, y: 170 },
    "period-master": { x: 1290, y: 200 }, "expansion-category-master": { x: 1480, y: 300 }, "expansion-master": { x: 1640, y: 450 },
    "aggregation-master": { x: 180, y: 750 }, "previous-input": { x: 400, y: 1000 },
    "initiative-list": { x: 900, y: 500 }, "cost-table": { x: 700, y: 500 + 200 * Math.sqrt(3) }, "expansion-table": { x: 1100, y: 500 + 200 * Math.sqrt(3) },
  };
  const center = { x: 900, y: 500 + 400 * Math.sqrt(3) / 3 };
  const angle = selected === "cost-table" || selected === "aggregation-master" || selected === "previous-input" ? Math.PI * 2 / 3
    : selected === "expansion-table" || selected === "expansion-master" || selected === "expansion-category-master" ? -Math.PI * 2 / 3 : 0;
  for (const { page } of destinations) {
    const p = base[page];
    if (!p) throw new Error(`関連図の配置が未定義です: ${page}`);
    positions[page] = { x: center.x + (p.x - center.x) * Math.cos(angle) - (p.y - center.y) * Math.sin(angle),
      y: center.y + (p.x - center.x) * Math.sin(angle) + (p.y - center.y) * Math.cos(angle) };
  }
  positions.brand = center;
  placeDescriptions(positions, destinations, relations);
  return positions;
}

export function relationDescription(edge: Relation, selected: string | null) {
  if (edge.kind !== "view" || (edge.from !== selected && edge.to !== selected)) return edge.label;
  const other = edge.from === selected ? edge.to : edge.from;
  return other === "initiative-list" ? "同じ内容を施策別に確認" : other === "cost-table" ? "同じ内容を科目別に確認" : "同じ内容を展開別に確認";
}

export function homeRelationLine(from: RelationPoint, to: RelationPoint, fromPage: string, toPage: string, double = false) {
  const { start, first, second, end } = homeRelationCurve(from, to, fromPage, toPage);
  if (!double) return `M${start.x} ${start.y} C${first.x} ${first.y} ${second.x} ${second.y} ${end.x} ${end.y}`;
  const dx = end.x - start.x, dy = end.y - start.y, distance = Math.hypot(dx, dy) || 1;
  const line = (offset: number) => `M${start.x - dy / distance * offset} ${start.y + dx / distance * offset} L${end.x - dy / distance * offset} ${end.y + dx / distance * offset}`;
  return `${line(-2)} ${line(2)}`;
}
