import assert from 'node:assert/strict';

const kindName = kind => kind === 1 ? '一次予算' : '確定予算';
const priorName = kind => kind === 1 ? '前年見込' : '前年実績';
const label = (kind, previous) => `${kindName(kind)}${priorName(previous[kind])}基準`;

/** Map shared screen cells to the explicit export contract, never to XLSX's own contents.
 * Cost exports have three columns; expansion exports retain each budget's baseline row.
 * All other values, row order, spans and period labels must match the real screen.
 */
export function reportContractCells(cells, name, selected, previous, expansionPrevious) {
  if (name === '施策一覧') return cells;
  if (name === '総原価表') {
    const kinds = [...selected].sort(), sourceWidth = kinds.length === 2 ? 5 : 3;
    const keep = kinds.length === 2 ? [1, 2, 4] : [0, 1, 2];
    const labels = kinds.length === 2 ? [...kinds.map(kind => label(kind, previous)), '差額確定予算 − 一次予算']
      : [priorName(previous[kinds[0]]), label(kinds[0], previous), '前年差'];
    return cells.flatMap(cell => {
      if (cell.col === 1) return [cell];
      const period = Math.floor((cell.col - 2) / sourceWidth), source = (cell.col - 2) % sourceWidth;
      if (cell.row === 1) {
        assert.equal(cell.colspan, sourceWidth, '画面の各期間は選択予算に対応する列数を持つ');
        return [{ ...cell, col: 2 + period * 3, colspan: 3 }];
      }
      const column = keep.indexOf(source);
      if (column === -1) return [];
      return [{ ...cell, col: 2 + period * 3 + column, text: cell.row === 2 ? labels[column] : cell.text }];
    });
  }
  assert.equal(name, '展開表');
  const kinds = [...selected].sort();
  const labels = [...kinds.map(kind => label(kind, previous)), ...(selected.length === 2 ? ['差額確定予算 − 一次予算'] : [])];
  const width = labels.length * 2;
  if (expansionPrevious) assert.equal(expansionPrevious.length, 19 * width);
  return cells.map(cell => {
    if (cell.row === 2 && cell.col >= 5) return { ...cell, text: labels[Math.floor(((cell.col - 5) % width) / 2)] };
    if (cell.row === 4) {
      if (cell.col === 1) return { ...cell, text: selected.length === 2 ? '前年' : priorName(previous[kinds[0]]) };
      if (expansionPrevious) return { ...cell, text: expansionPrevious[cell.col - 5] };
    }
    return cell;
  }).sort((a, b) => a.row - b.row || a.col - b.col);
}
