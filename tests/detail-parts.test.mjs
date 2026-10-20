import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withNodeBundle } from '../scripts/node-bundle.mjs';

test('衝突を解消した全パーツが確定時に16px間隔へ揃い、件数と元配置を保持する', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailParts.ts', async ({ arrangeParts, partsOverlap, settlePart }) => {
    const originals = Array.from({ length: 100 }, (_, i) => ({ id: String(i), text: `説明文 ${i}\n根拠を記載`, x: (i % 10) * 164 + .5, y: Math.floor(i / 10) * 100 + .25, width: 160, height: 96 }));
    const before = JSON.stringify(originals);
    for (const active of [{ ...originals[0], width: 800, height: 480 }, { ...originals[99], x: 7.3, y: 9.7 }, { id: 'new', x: 90.1, y: 50.2, width: 160, height: 96 }]) {
      for (const settled of [false, true]) {
        const result = arrangeParts(originals, active, settled);
        assert.deepEqual(result.find(p => p.id === active.id), settled ? settlePart(active) : active);
        assert.equal(new Set(result.map(p => p.id)).size, originals.length + (active.id === 'new' ? 1 : 0));
        for (let i = 0; i < result.length; i++) {
          const part = result[i];
          assert.equal(part.text, part.id === active.id ? active.text : originals.find(item => item.id === part.id).text, '移動・伸縮・押し出しで文章を失わない');
          assert.ok(part.x >= 0 && part.y >= 0);
          if (settled) for (const value of [part.x, part.y, part.width, part.height]) assert.equal(value % 16, 0);
          for (let j = i + 1; j < result.length; j++) assert.ok(!partsOverlap(part, result[j]), `${part.id} と ${result[j].id} は4px以上離れる`);
        }
      }
    }
    assert.equal(JSON.stringify(originals), before, '取消用の元配置を変更しない');
  });
});

test('移動中は近い位置へ軽く吸着し、境界を跨いでも連続して追従する', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailParts.ts', async ({ magnetPosition, snapPosition }) => {
    assert.ok(magnetPosition(29) > 29 && magnetPosition(29) < 32, '近づいた位置へ引き寄せるが移動中は完全固定しない');
    assert.ok(magnetPosition(35) < 35 && magnetPosition(35) > 32);
    assert.equal(magnetPosition(32), 32);
    assert.equal(magnetPosition(-10), 0);
    assert.equal(snapPosition(29), 32);
    assert.equal(snapPosition(35), 32);
    let previous = magnetPosition(0);
    for (let i = 1; i <= 640; i++) {
      const current = magnetPosition(i / 10);
      assert.ok(current >= previous && current - previous < .2, '一定方向のドラッグで逆戻りや位置の飛びを作らない');
      previous = current;
    }
  });
});

test('移動先は境界付近の揺れで往復せず、十分に進めると切り替わる', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailParts.ts', async ({ stableSnapPosition }) => {
    let target = 32;
    for (const value of [39, 41, 39.5, 40.5, 44]) {
      target = stableSnapPosition(value, target);
      assert.equal(target, 32);
    }
    target = stableSnapPosition(45, target);
    assert.equal(target, 48);
    for (const value of [41, 39, 40.5, 36]) {
      target = stableSnapPosition(value, target);
      assert.equal(target, 48);
    }
    assert.equal(stableSnapPosition(35, target), 32);
    assert.equal(stableSnapPosition(110, 32), 112, '速い移動は複数マス先へ進める');
    assert.equal(stableSnapPosition(-10, 16), 0);
    assert.equal(stableSnapPosition(9), 16, 'プールからの初回進入は最寄りへ置く');
  });
});

test('右下の斜め伸縮は左上を固定し、最小64pxと幅・高さの16px刻みを守る', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailParts.ts', async ({ resizePart, settlePart }) => {
    const part = { id: 'a', x: 32, y: 48, width: 160, height: 96 };
    const live = resizePart(part, 23.5, 39.5);
    assert.equal(live.width, 183.5); assert.equal(live.height, 135.5);
    const settled = settlePart(live);
    assert.equal(settled.x, part.x); assert.equal(settled.y, part.y);
    assert.equal(settled.width, 176); assert.equal(settled.height, 128);
    const minimum = settlePart(resizePart(part, -1000, -1000));
    assert.equal(minimum.width, 64); assert.equal(minimum.height, 64);
    assert.equal(minimum.x, part.x); assert.equal(minimum.y, part.y);
  });
});

test('テーブルの行列操作と貼り付けは元データを保ち、矩形と最低1行1列を維持する', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailTable.ts', async ({ emptyDetailTable, setTableCell, changeTableAxis, parseTableClipboard, pasteTableCells }) => {
    const cells = emptyDetailTable();
    assert.equal(cells.length, 3); assert.ok(cells.every(row => row.length === 3 && row.every(cell => cell === '')));
    const filled = setTableCell(cells, 1, 1, '説明\n改行');
    assert.equal(cells[1][1], ''); assert.equal(filled[1][1], '説明\n改行');
    const addedRow = changeTableAxis(filled, 'row', 0, false);
    assert.equal(addedRow[2][1], '説明\n改行'); assert.equal(addedRow.length, 4);
    const addedColumn = changeTableAxis(addedRow, 'column', 0, false);
    assert.equal(addedColumn[2][2], '説明\n改行');
    assert.deepEqual(changeTableAxis(changeTableAxis(addedColumn, 'column', 1, true), 'row', 1, true), filled);
    assert.deepEqual(changeTableAxis([['保持']], 'row', 0, true), [['保持']]);
    assert.deepEqual(changeTableAxis([['保持']], 'column', 0, true), [['保持']]);
    const parsed = parseTableClipboard('項目\t"複数\n行"\r\n"a""b"\t001\r\n');
    assert.deepEqual(parsed, [['項目', '複数\n行'], ['a"b', '001']]);
    assert.deepEqual(parseTableClipboard('a\t\n\t\n'), [['a', ''], ['', '']]);
    const pasted = pasteTableCells(filled, 2, 2, parsed);
    assert.equal(pasted.length, 4); assert.ok(pasted.every(row => row.length === 4));
    assert.equal(pasted[1][1], '説明\n改行'); assert.equal(pasted[2][3], '複数\n行');
    assert.equal(pasted[3][3], '001'); assert.equal(filled.length, 3);
  });
});

test('テーブルのセルは移動・伸縮・衝突解消でも保持する', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailParts.ts', async ({ arrangeParts, resizePart }) => {
    const table = { id: 'table', kind: 'table', cells: [['項目', '001'], ['説明\n改行', '=1+1']], x: 0, y: 0, width: 320, height: 192 };
    const text = { id: 'text', kind: 'text', text: '説明', x: 0, y: 0, width: 160, height: 96 };
    const result = arrangeParts([table, text], resizePart(table, 21, 21), true);
    assert.deepEqual(result.find(part => part.id === 'table').cells, table.cells);
    assert.equal(result.find(part => part.id === 'text').text, '説明');
  });
});
