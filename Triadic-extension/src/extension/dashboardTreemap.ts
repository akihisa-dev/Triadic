import { formatYen } from "../core/domain/amounts";
import { treemapTiles } from "../core/tables/dashboardBreakdowns";

/** Keep area ratios intact; labels that cannot fit move outside, without duplicates. */
export function expenseTreemap(values: { name: string; value: number }[], width: number) {
  const label = (index: number, available: number) => {
    const item = values[index]!;
    const letters = Array.from(item.name);
    const columns = Math.max(1, Math.floor(available / 14));
    const lines = Array.from({ length: Math.max(1, Math.ceil(letters.length / columns)) }, (_, i) => letters.slice(i * columns, (i + 1) * columns).join(""));
    return { lines, height: lines.length * 20 + 58, amount: formatYen(item.value) };
  };
  const fits = (tile: ReturnType<typeof treemapTiles>[number]) => {
    const content = label(tile.index, tile.width - 20);
    return tile.width >= Math.max(76, content.amount.length * 11 + 20) && tile.height >= content.height + 20;
  };
  let tiles = treemapTiles(values.map(item => item.value), width - 8, 450);
  if (tiles.some(tile => !fits(tile))) tiles = treemapTiles(values.map(item => item.value), width - 248, 450);
  const outside = tiles.filter(tile => !fits(tile)).sort((a, b) => a.y + a.height / 2 - b.y - b.height / 2);
  const totalHeight = outside.reduce((sum, tile) => sum + label(tile.index, 220).height + 12, 0);
  let top = Math.max(0, Math.min(outside[0] ? outside[0].y : 0, 450 - totalHeight));
  const external = new Map(outside.map(tile => {
    const content = label(tile.index, 220);
    const placed = { ...content, x: width - 220, y: top, width: 220, outside: true };
    top += content.height + 12;
    return [tile.index, placed];
  }));
  return {
    height: Math.max(460, top),
    tiles: tiles.map(tile => ({ ...tile, label: external.get(tile.index) ?? {
      ...label(tile.index, tile.width - 20), x: tile.x + 10, y: tile.y + 10, width: tile.width - 20, outside: false,
    } })),
  };
}
