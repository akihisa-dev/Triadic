import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withNodeBundle } from '../scripts/node-bundle.mjs';

test('パーツは連鎖した衝突でも重ならず、位置の格子合わせをせずに全件を保持する', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailParts.ts', async ({ arrangeParts, partsOverlap, settlePart }) => {
    const originals = Array.from({ length: 100 }, (_, i) => ({ id: String(i), x: (i % 10) * 164 + .5, y: Math.floor(i / 10) * 100 + .25, width: 160, height: 96 }));
    const before = JSON.stringify(originals);
    for (const active of [{ ...originals[0], width: 800, height: 480 }, { ...originals[99], x: 7.3, y: 9.7 }, { id: 'new', x: 90.1, y: 50.2, width: 160, height: 96 }]) {
      const result = arrangeParts(originals, active);
      assert.deepEqual(result.find(p => p.id === active.id), active, '操作しているパーツはポインター位置を保つ');
      assert.equal(new Set(result.map(p => p.id)).size, originals.length + (active.id === 'new' ? 1 : 0));
      for (let i = 0; i < result.length; i++) {
        assert.ok(result[i].x >= 0 && result[i].y >= 0);
        for (let j = i + 1; j < result.length; j++) assert.ok(!partsOverlap(result[i], result[j]), `${result[i].id} と ${result[j].id} は4px以上離れる`);
      }
      const settled = settlePart(active);
      assert.equal(settled.x, active.x, '移動位置は格子に丸めない');
      assert.equal(settled.y, active.y);
    }
    assert.equal(JSON.stringify(originals), before, 'ドラッグをキャンセルできるよう元の配置を変更しない');
  });
});

test('四辺の伸縮は最小64pxと反対側の端を保ち、確定時の寸法だけ16px刻みに揃える', async () => {
  await withNodeBundle('Triadichrome-extension/src/core/tables/detailParts.ts', async ({ resizePart, settlePart }) => {
    const part = { id: 'a', x: 17.5, y: 29.25, width: 160, height: 96 };
    const left = settlePart(resizePart(part, 'left', -13.4, 0), 'left');
    assert.equal(left.x + left.width, part.x + part.width);
    assert.equal(left.width % 16, 0);
    const top = settlePart(resizePart(part, 'top', 0, -17.3), 'top');
    assert.equal(top.y + top.height, part.y + part.height);
    assert.equal(top.height % 16, 0);
    for (const [edge, dx, dy] of [['left', 1000, 0], ['right', -1000, 0], ['top', 0, 1000], ['bottom', 0, -1000]]) {
      const result = settlePart(resizePart(part, edge, dx, dy), edge);
      assert.ok(result.width >= 64 && result.height >= 64);
      assert.ok(result.x >= 0 && result.y >= 0);
    }
    const live = resizePart(part, 'right', 7.5, 0);
    assert.equal(live.width, 167.5, '操作中は丸めず連続的に追従する');
    assert.equal(settlePart(live, 'right').width, 160);
  });
});
