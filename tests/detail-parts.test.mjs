import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withNodeBundle } from '../scripts/node-bundle.mjs';

test('衝突を解消した全パーツが確定時に24px間隔へ揃い、件数と元配置を保持する', async () => {
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
          if (settled) for (const value of [part.x, part.y, part.width, part.height]) assert.equal(value % 24, 0);
          for (let j = i + 1; j < result.length; j++) assert.ok(!partsOverlap(part, result[j]), `${part.id} と ${result[j].id} は内部が重ならない`);
        }
      }
    }
    assert.equal(JSON.stringify(originals), before, '取消用の元配置を変更しない');
  });
});

test('左右・上下・角の接触はそのまま配置でき、内部が重なる場合だけ押し出す', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailParts.ts', async ({ arrangeParts, partsOverlap }) => {
    const active = { id: 'active', kind: 'text', text: '保持', x: 240, y: 240, width: 168, height: 96 };
    for (const [x, y] of [[72, 240], [408, 240], [240, 144], [240, 336], [72, 144], [408, 336], [72, 336], [408, 144]]) {
      const neighbour = { ...active, id: 'neighbour', x, y };
      assert.equal(partsOverlap(active, neighbour), false, '辺または角の接触は重なりにしない');
      for (const settled of [false, true]) assert.deepEqual(arrangeParts([active, neighbour], active, settled), [active, neighbour]);
    }
    const overlapping = { ...active, id: 'neighbour', x: 407 };
    assert.equal(partsOverlap(active, overlapping), true, '1pxの内部重なりを検出する');
    const result = arrangeParts([active, overlapping], active, true);
    assert.equal(result[1].x, active.x + active.width, '押し出し先にも余計な隙間を設けない');
    assert.equal(partsOverlap(result[0], result[1]), false);
  });
});

test('移動中は近い位置へ軽く吸着し、境界を跨いでも連続して追従する', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailParts.ts', async ({ magnetPosition, snapPosition }) => {
    assert.ok(magnetPosition(45) > 45 && magnetPosition(45) < 48, '近づいた位置へ引き寄せるが移動中は完全固定しない');
    assert.ok(magnetPosition(51) < 51 && magnetPosition(51) > 48);
    assert.equal(magnetPosition(48), 48);
    assert.equal(magnetPosition(-10), 0);
    assert.equal(snapPosition(45), 48);
    assert.equal(snapPosition(51), 48);
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
    let target = 48;
    for (const value of [59, 61, 59.5, 60.5, 64]) {
      target = stableSnapPosition(value, target);
      assert.equal(target, 48);
    }
    target = stableSnapPosition(65, target);
    assert.equal(target, 72);
    for (const value of [61, 59, 60.5, 56]) {
      target = stableSnapPosition(value, target);
      assert.equal(target, 72);
    }
    assert.equal(stableSnapPosition(55, target), 48);
    assert.equal(stableSnapPosition(155, 48), 144, '速い移動は複数マス先へ進める');
    assert.equal(stableSnapPosition(-10, 24), 0);
    assert.equal(stableSnapPosition(13), 24, 'プールからの初回進入は最寄りへ置く');
  });
});

test('右下の斜め伸縮は左上を固定し、最小72pxと幅・高さの24px刻みを守る', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailParts.ts', async ({ resizePart, settlePart }) => {
    const part = { id: 'a', x: 48, y: 72, width: 168, height: 96 };
    const live = resizePart(part, 23.5, 39.5);
    assert.equal(live.width, 191.5); assert.equal(live.height, 135.5);
    const settled = settlePart(live);
    assert.equal(settled.x, part.x); assert.equal(settled.y, part.y);
    assert.equal(settled.width, 192); assert.equal(settled.height, 144);
    const minimum = settlePart(resizePart(part, -1000, -1000));
    assert.equal(minimum.width, 72); assert.equal(minimum.height, 72);
    assert.equal(minimum.x, part.x); assert.equal(minimum.y, part.y);
  });
});

test('両方向の表は12か月分の最小寸法を保ち、拡大後も内容と左上を保持する', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailParts.ts', async ({ TABLE_PART_MIN, resizePart, settlePart }) => {
    for (const kind of ['table-horizontal', 'table-vertical']) {
      const part = { id: kind, kind, x: 48, y: 72, ...TABLE_PART_MIN[kind], cells: [['保持']] };
      const expanded = settlePart(resizePart(part, 24, 24));
      assert.equal(expanded.width, part.width + 24); assert.equal(expanded.height, part.height + 24);
      assert.deepEqual(settlePart(resizePart(expanded, -10000, -10000)), part);
      assert.deepEqual(settlePart({ ...part, width: 1, height: 1 }), part);
    }
  });
});

test('月別表は共通の12か月と3項目で始まり、項目だけを増減する', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailTable.ts', async ({ detailTableMonths, emptyDetailTable, setTableCell, changeTableItem }) => {
    assert.deepEqual(detailTableMonths.map(month => month.label), ['4月','5月','6月','7月','8月','9月','10月','11月','12月','1月','2月','3月']);
    const cells = emptyDetailTable();
    assert.equal(cells.length, 3); assert.ok(cells.every(row => row.length === 13 && row.every(cell => cell === '')));
    const filled = setTableCell(setTableCell(cells, 1, 0, '人数'), 1, 1, '001');
    assert.equal(cells[1][1], '');
    const added = changeTableItem(filled, 0, false);
    assert.equal(added.length, 4); assert.equal(added[2][0], '人数');
    assert.deepEqual(changeTableItem(added, 1, true), filled);
    assert.equal(changeTableItem([filled[1]], 0, true).length, 1);
  });
});

test('月別表の貼り付けは両方向で項目だけを拡張し、12か月超過は全体を拒否する', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailTable.ts', async ({ emptyDetailTable, parseTableClipboard, pasteTableCells }) => {
    const cells = emptyDetailTable(); cells[0][0] = '保持';
    const before = JSON.stringify(cells);
    assert.deepEqual(parseTableClipboard('項目\t"複数\n行"\r\n"a""b"\t001\r\n'), [['項目', '複数\n行'], ['a"b', '001']]);
    for (const horizontal of [true, false]) {
      const pasted = horizontal ? [['a', '001'], ['b', '=1+1']] : [['a', 'b'], ['001', '=1+1']];
      const result = pasteTableCells(cells, 2, 1, pasted, horizontal);
      assert.equal(result.length, 4); assert.ok(result.every(row => row.length === 13));
      assert.equal(result[2][1], 'a'); assert.equal(result[2][2], '001'); assert.equal(result[3][2], '=1+1');
      const tooMany = horizontal ? [Array(13).fill('超過')] : Array.from({ length: 13 }, () => ['超過']);
      assert.equal(pasteTableCells(cells, 0, 1, tooMany, horizontal), null);
      const names = horizontal ? [['名前', '値']] : [['名前'], ['値']];
      assert.equal(pasteTableCells(cells, 0, 0, names, horizontal)[0][0], '名前');
    }
    assert.equal(JSON.stringify(cells), before);
  });
});

test('テーブルのセルは移動・伸縮・衝突解消でも保持する', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailParts.ts', async ({ arrangeParts, resizePart }) => {
    const table = { id: 'table', kind: 'table-horizontal', cells: [['項目', '001'], ['説明\n改行', '=1+1']], x: 0, y: 0, width: 320, height: 192 };
    const text = { id: 'text', kind: 'text', text: '説明', x: 0, y: 0, width: 160, height: 96 };
    const result = arrangeParts([table, text], resizePart(table, 21, 21), true);
    assert.deepEqual(result.find(part => part.id === 'table').cells, table.cells);
    assert.equal(result.find(part => part.id === 'text').text, '説明');
  });
});

test('引数上限を超える20万行の貼り付けでも内容を保持し、月範囲外なら元の表を変更しない', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailTable.ts', async ({ emptyDetailTable, pasteTableCells }) => {
    const cells = emptyDetailTable(); cells[0][0] = '元の項目';
    const source = Array.from({ length: 200000 }, (_, i) => [`項目${i}`, String(i)]);
    const before = JSON.stringify(cells);
    const result = pasteTableCells(cells, 1, 0, source, true);
    assert.equal(result.length, 200001);
    assert.equal(result[0][0], '元の項目');
    for (let i = 0; i < source.length; i++) assert.deepEqual(result[i + 1].slice(0, 2), source[i]);
    assert.equal(pasteTableCells(cells, 0, 12, source, true), null);
    assert.equal(pasteTableCells(cells, 0, 0, source, false), null);
    assert.equal(JSON.stringify(cells), before);
  });
});

test('少数・高密度・大量パーツを旧配置規則と照合し、移動中の衝突探索を削減する', async () => {
  const { referenceArrangement } = await import('./detail-parts-reference.mjs');
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailParts.ts', async ({ arrangeParts, partsOverlap, settlePart }) => {
    const cases = [
      ['少数', 10, 160, 96, 164, 100],
      ['高密度', 150, 160, 96, 32, 32],
      ['大量', 1000, 160, 96, 164, 100],
      ['異なる寸法', 75, 1200, 448, 128, 96],
    ];
    for (const [name, count, width, height, dx, dy] of cases) {
      const source = Array.from({ length: count }, (_, i) => ({ id: String(i), kind: 'text', text: `保持${i}`, x: (i % 20) * dx, y: Math.floor(i / 20) * dy, width, height }));
      const before = JSON.stringify(source);
      let oldChecks = 0, oldMs = 0, newMs = 0;
      const metrics = { overlapChecks: 0 };
      for (const settled of [false, true]) for (const offset of [0, 45, 160]) {
        const active = { ...source[0], x: offset, width: width + 32 };
        let start = performance.now();
        const previous = referenceArrangement(source, active, settled, { settlePart, partsOverlap: (a, b) => { oldChecks++; return partsOverlap(a, b); } });
        oldMs += performance.now() - start;
        start = performance.now();
        const current = arrangeParts(source, active, settled, metrics);
        newMs += performance.now() - start;
        assert.deepEqual(current, previous, `${name}: 配置順・近い位置・同距離の選択・内容を維持`);
      }
      assert.equal(JSON.stringify(source), before, '取消の元配置を変更しない');
      assert.ok(metrics.overlapChecks < oldChecks, `${name}: 衝突検査 ${oldChecks} → ${metrics.overlapChecks}`);
      console.log(`${name} ${count}パーツ・6回: 衝突検査 ${oldChecks} → ${metrics.overlapChecks}、旧 ${oldMs.toFixed(1)}ms、新 ${newMs.toFixed(1)}ms（端末内の合成計測）`);
    }
    let randomState = 42;
    const random = max => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState % max; };
    for (let run = 0; run < 40; run++) {
      const source = Array.from({ length: 5 + random(25) }, (_, i) => ({ id: String(i), kind: 'text', text: `保持${i}`, x: random(1024) + .5, y: random(768) + .25, width: 64 + random(480), height: 64 + random(320) }));
      const active = { ...source[random(source.length)], x: random(1280), y: random(960) };
      for (const settled of [false, true]) assert.deepEqual(arrangeParts(source, active, settled), referenceArrangement(source, active, settled, { partsOverlap, settlePart }), '格子境界・異なる寸法・同距離を含む配置を維持');
    }
    const huge = [{ id: 'huge', kind: 'text', text: '大きい矩形', x: 0, y: 0, width: 10000000, height: 10000000 }];
    const active = { id: 'new', kind: 'text', text: '保持', x: 0, y: 0, width: 160, height: 96 };
    assert.deepEqual(arrangeParts(huge, active), referenceArrangement(huge, active, false, { partsOverlap, settlePart }), '巨大な矩形でも区画数を増やさず同じ配置にする');
  });
});

test('2000項目の1セル更新と両方向の貼り付けで、変更した項目だけを作り直す', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailTable.ts', async ({ setTableCell, pasteTableCells }) => {
    const cells = Array.from({ length: 2000 }, (_, i) => Array.from({ length: 13 }, (_, c) => `${i}:${c}`));
    const before = JSON.stringify(cells);
    const changed = setTableCell(cells, 1000, 4, '変更');
    assert.equal(changed[1000][4], '変更'); assert.notEqual(changed[1000], cells[1000]);
    assert.ok(changed.every((row, i) => i === 1000 || row === cells[i]), '他の項目は再描画を必要としない');
    assert.equal(setTableCell(changed, 1000, 4, '変更'), changed, '同じ値では作り直さない');
    for (const horizontal of [true, false]) {
      const pasted = horizontal ? [['A', '001'], ['B', '002']] : [['A', 'B'], ['001', '002']];
      const result = pasteTableCells(cells, 1000, 1, pasted, horizontal);
      assert.deepEqual(result[1000].slice(1, 3), ['A', '001']);
      assert.deepEqual(result[1001].slice(1, 3), ['B', '002']);
      assert.ok(result.every((row, i) => i === 1000 || i === 1001 || row === cells[i]));
      assert.equal(pasteTableCells(result, 1000, 1, pasted, horizontal), result);
    }
    assert.equal(JSON.stringify(cells), before);
  });
});

test('移動は四方向で8pxまで周囲を保ち、8px超で押し退け、浅い解放は操作側だけを調整する', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailParts.ts', async ({ arrangeParts, settleMovingParts, partsOverlap, PART_PUSH_DEPTH }) => {
    const fixed = { id: 'fixed', kind: 'text', text: '保持', x: 240, y: 240, width: 96, height: 96 };
    for (const [x,y,dx,dy] of [[144,240,1,0],[336,240,-1,0],[240,144,0,1],[240,336,0,-1],[144,144,1,1]]) {
      const origin = {...fixed,id:'active',x,y}, base=[fixed,origin], saved=JSON.stringify(base);
      for (const depth of [0,1,4,8,8.01,12,24]) {
        const active={...origin,x:x+depth*dx,y:y+depth*dy};
        const preview=arrangeParts(base,active,false,undefined,PART_PUSH_DEPTH);
        if(depth<=8) assert.deepEqual(preview[0],fixed);
        else { assert.notDeepEqual(preview[0],fixed); assert.ok(!partsOverlap(preview[0],preview[1])); }
        // Even a landing preview rounded into the neighbour must leave that neighbour alone.
        const landing=settleMovingParts(preview,{...origin,x:x+24*dx,y:y+24*dy});
        assert.deepEqual(landing[0],preview[0]);
        assert.ok(!partsOverlap(landing[0],landing[1]));
        for(const p of landing) for(const k of ['x','y','width','height']) assert.equal(p[k]%24,0);
      }
      assert.equal(JSON.stringify(base),saved,'取消用の元配置を保持');
    }
  });
});
