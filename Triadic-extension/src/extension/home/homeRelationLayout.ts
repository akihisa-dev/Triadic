/** Positions are diagram coordinates, independent of viewport scale and user data. */
export type RelationPoint = { x: number; y: number };
type Destination = { page: string };
type Relation = { from: string; to: string; kind: string; label: string };
export const tablePages = ["initiative-list", "cost-table", "expansion-table"] as const;
export const isTablePage = (page: string) => (tablePages as readonly string[]).includes(page);
const W = 800;

function ring(count: number, cy: number) {
  const samples: { point: RelationPoint; length: number }[] = [];
  let length = 0, previous: RelationPoint | undefined;
  for (let i = 0; i <= 1800; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 900;
    const point = { x: W / 2 + 314 * Math.cos(angle), y: cy + 350 * Math.sin(angle) };
    if (previous) length += Math.hypot(point.x - previous.x, point.y - previous.y);
    samples.push({ point, length }); previous = point;
  }
  let index = 0;
  return Array.from({ length: count }, (_, i) => {
    while (index < samples.length - 1 && samples[index]!.length < length * i / count) index++;
    return samples[index]!.point;
  });
}

function upperArc(count: number) {
  const samples: { point: RelationPoint; length: number }[] = [];
  let length = 0, previous: RelationPoint | undefined;
  for (let i = 0; i <= 900; i++) {
    const angle = -Math.PI + i * Math.PI / 900;
    const point = { x: 400 + 314 * Math.cos(angle), y: 455 + 350 * Math.sin(angle) };
    if (previous) length += Math.hypot(point.x - previous.x, point.y - previous.y);
    samples.push({ point, length }); previous = point;
  }
  let index = 0;
  return Array.from({ length: count }, (_, i) => {
    while (index < samples.length - 1 && samples[index]!.length < length * i / Math.max(1, count - 1)) index++;
    return samples[index]!.point;
  });
}

export function layoutHomeRelations(destinations: readonly Destination[], relations: readonly Relation[], selected: string | null) {
  const positions: Record<string, RelationPoint> = {};
  const masters = destinations.map(node => node.page).filter(page => !isTablePage(page));
  const setTriangle = (top: string, y: number) => {
    const rest = tablePages.filter(page => page !== top);
    positions[top] = { x: 400, y };
    positions[rest[0]!] = { x: 275, y: y + 125 * Math.sqrt(3) };
    positions[rest[1]!] = { x: 525, y: y + 125 * Math.sqrt(3) };
  };
  if (!selected || !destinations.some(node => node.page === selected)) {
    setTriangle("initiative-list", 315);
    const points = ring(masters.length, 315 + 250 * Math.sqrt(3) / 3);
    masters.forEach((page, index) => { positions[page] = points[index]!; });
  } else {
    const linked = new Set(relations.filter(edge => edge.from === selected || edge.to === selected).flatMap(edge => [edge.from, edge.to]).filter(page => page !== selected));
    const top = isTablePage(selected) ? selected : ["aggregation-master", "previous-input"].includes(selected) ? "cost-table" : selected === "expansion-master" ? "expansion-table" : "initiative-list";
    setTriangle(top, 455);
    const related = masters.filter(page => linked.has(page));
    if (isTablePage(selected)) {
      const arc = upperArc(related.length);
      related.forEach((page, index) => {
        positions[page] = related.length > 3 ? arc[index]!
          : { x: related.length === 1 ? 400 : 232 + index * 336, y: 245 };
      });
    } else {
      positions[selected] = { x: 400, y: 255 };
      related.forEach((page, index) => { positions[page] = { x: related.length === 1 ? 216 : 216 + index * 368, y: 125 }; });
      const tables = tablePages.filter(page => linked.has(page));
      if (tables.length === 2) {
        positions[tables[0]!] = { x: 275, y: 455 }; positions[tables[1]!] = { x: 525, y: 455 };
        positions[tablePages.find(page => !tables.includes(page))!] = { x: 400, y: 455 + 125 * Math.sqrt(3) };
      }
    }
    const remaining = masters.filter(page => !positions[page]);
    const slots = remaining.length === 3 ? [{ x: 176, y: 925 }, { x: 400, y: 925 }, { x: 624, y: 925 }]
      : [{ x: 86, y: 85 }, { x: 400, y: 85 }, { x: 714, y: 85 }, { x: 714, y: 385 }, { x: 714, y: 605 }, { x: 86, y: 605 }, { x: 86, y: 385 }, { x: 176, y: 925 }, { x: 400, y: 925 }, { x: 624, y: 925 }];
    if (remaining.length === 9) slots.splice(8, 1);
    if (remaining.length === 8) { slots.splice(8, 1); slots.splice(1, 1); }
    remaining.forEach((page, index) => { positions[page] = slots[index]!; });
  }
  positions.brand = { x: tablePages.reduce((sum, page) => sum + positions[page]!.x, 0) / 3, y: tablePages.reduce((sum, page) => sum + positions[page]!.y, 0) / 3 };
  relations.forEach((edge, index) => {
    const other = edge.from === selected ? edge.to : edge.from;
    const point = positions[other]!;
    positions[`relation-${index}`] = isTablePage(other) && point.y < positions.brand!.y
      ? { x: point.x + (point.x <= positions.brand!.x ? -150 : 150), y: point.y + 80 }
      : { x: point.x, y: point.y + (isTablePage(other) ? 95 : 60) };
  });
  return positions;
}

export function relationDescription(edge: Relation, selected: string | null) {
  const other = edge.from === selected ? edge.to : edge.from;
  if (edge.kind !== "view") return edge.label;
  return other === "initiative-list" ? "同じ内容を施策別に確認" : other === "cost-table" ? "同じ内容を科目別に確認" : "同じ内容を展開別に確認";
}

export function homeRelationLine(from: RelationPoint, to: RelationPoint, fromPage: string, toPage: string, double = false) {
  const a = { x: from.x, y: from.y - (isTablePage(fromPage) ? 0 : 17) };
  const b = { x: to.x, y: to.y - (isTablePage(toPage) ? 0 : 17) };
  const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
  if (distance < 1) return `M${a.x} ${a.y} L${a.x} ${a.y}`;
  const first = isTablePage(fromPage) ? 64 : 24, last = isTablePage(toPage) ? 64 : 24;
  const fit = Math.min(1, distance / (first + last));
  const start = { x: a.x + dx / distance * first * fit, y: a.y + dy / distance * first * fit };
  const end = { x: b.x - dx / distance * last * fit, y: b.y - dy / distance * last * fit };
  const line = (offset: number) => `M${start.x - dy / distance * offset} ${start.y + dx / distance * offset} L${end.x - dy / distance * offset} ${end.y + dx / distance * offset}`;
  if (double) return `${line(-2)} ${line(2)}`;
  const bend = Math.min(35, distance * .08), nx = -dy / distance * bend, ny = dx / distance * bend;
  return `M${start.x} ${start.y} C${start.x + dx * .32 + nx} ${start.y + dy * .32 + ny} ${end.x - dx * .32 + nx} ${end.y - dy * .32 + ny} ${end.x} ${end.y}`;
}
