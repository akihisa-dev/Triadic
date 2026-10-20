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
