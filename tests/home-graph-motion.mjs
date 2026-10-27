import assert from "node:assert/strict";

export function verifyHomeMotion({ HomeMotion, motionLine, layoutHomeRelations, homeDestinations, homeRelations, tablePages, homeRelationLine, homeRelationDistances, homeRelationCurve, curvePoint, relationLabelWidth, segmentHitsRelationBox }) {
  const nodes = [{ page: "a", x: 250, y: 300 }, { page: "b", x: 550, y: 300 }];
  const run = rate => {
    const motion = new HomeMotion(nodes);
    motion.hold("a"); motion.move(100, 200); motion.release();
    for (let i = 0; i < rate * 5; i++) motion.advance(1 / rate);
    return motion;
  };
  const slow = run(30), fast = run(120);
  for (const key of ["a", "b"]) {
    assert.ok(Math.abs(slow.bodies.get(key).x - fast.bodies.get(key).x) < .1, "表示更新頻度で配置が変わらない");
  }
  const motion = new HomeMotion(nodes);
  assert.equal(motion.active, false, "保持した配置は再配置しない");
  motion.hold("a"); motion.release(); motion.advance(.05);
  assert.equal(motion.bodies.get("a").x, 350, "クリックだけでは配置を動かさない");
  motion.hold("a"); motion.move(100, 200);
  motion.advance(.05);
  assert.equal(motion.bodies.get("a").x, 100, "ドラッグ位置を固定する");
  assert.equal(motion.bodies.get("a").y, 200);
  motion.release();
  for (let i = 0; i < 60; i++) motion.advance(1 / 60);
  assert.notEqual(motion.bodies.get("a").x, 100, "離した項目はカーソルに依存せず動く");
  assert.equal(motion.bodies.get("b").x, 650, "他の項目の定位置を動かさない");
  for (let i = 0; i < 180; i++) motion.advance(1 / 60);
  assert.equal(motion.active, false, "元の配置で停止する");
  assert.deepEqual(motion.positions(), { a: { x: 350, y: 312 }, b: { x: 650, y: 312 } }, "全項目が正確に元へ戻る");
  for (const reduced of [false, true]) {
    const returning = new HomeMotion(nodes);
    returning.hold("b"); returning.move(900, 100); returning.release();
    let last = 900;
    for (let i = 0; i < 180; i++) {
      returning.advance(1 / 60, reduced);
      const x = returning.bodies.get("b").x;
      assert.ok(x <= last && x >= 650, "元の位置を越えず滑らかに戻る");
      last = x;
    }
    assert.deepEqual(returning.positions().b, { x: 650, y: 312 });
    returning.hold("b"); returning.move(800, 50); returning.release(); returning.advance(.05);
    returning.hold("b"); returning.move(600, 200); returning.release();
    for (let i = 0; i < 180; i++) returning.advance(1 / 60, reduced);
    assert.deepEqual(returning.positions().b, { x: 650, y: 312 }, "戻る途中で再ドラッグしても定位置を保持する");
  }
  const a = { x: 0, y: 0, width: 120, height: 32, sub: true };
  const b = { ...a, x: 10 };
  const values = motionLine(a, b).match(/-?\d+(?:\.\d+)?/g).map(Number);
  assert.ok(values[0] <= values[2], "近接した線を反転させない");
  assert.ok(!motionLine(a, a).includes("NaN"));
  const double = motionLine({ ...a, x: 0 }, { ...a, x: 400 }, true);
  assert.equal((double.match(/M/g) ?? []).length, 2, "同じ内容の別表示は平行な二重線で表す");
  assert.equal((motionLine(a, b, true).match(/M/g) ?? []).length, 1, "近接時の二重線も反転させない");
  const card = { x: 0, y: 0, width: 200, height: 56, sub: false };
  const coordinates = body => motionLine(card, body).match(/-?\d+(?:\.\d+)?/g).map(Number);
  assert.deepEqual(coordinates({ ...card, x: 400 }), [100, 0, 300, 0], "横の接続線はカードの左右端で止まる");
  assert.deepEqual(coordinates({ ...card, y: 200 }), [0, 28, 0, 172], "縦の接続線はカードの上下端で止まる");
  const diagonal = motionLine(card, { ...card, x: 400, y: 200 }, true).match(/-?\d+(?:\.\d+)?/g).map(Number);
  for (let index = 0; index < diagonal.length; index += 4) {
    assert.ok(Math.abs(diagonal[index + 1]) >= 28 - .001, "斜めの二重線も開始カードの外端で止まる");
    assert.ok(Math.abs(diagonal[index + 3] - 200) >= 28 - .001, "斜めの二重線も終了カードへ入り込まない");
  }

  const chain = ["a", "b", "c", "d", "e", "f"].map((from, i) => ({ from, to: "bcdefg"[i] }));
  chain.push({ from: "g", to: "b" }, { from: "x", to: "y" });
  assert.equal(homeRelationDistances(chain, "a").get("e"), 4, "循環があっても一階層で打ち切らず辿る");
  assert.equal(homeRelationDistances(chain, "a").has("x"), false, "無関係な枝への線は作らない");
  assert.equal(homeRelationDistances(chain, null).size, 0);
  const initial = layoutHomeRelations(homeDestinations, homeRelations, null);
  const ids = homeDestinations.map(node => node.page);
  for (const selected of [null, ...ids]) {
    const result = layoutHomeRelations(homeDestinations, homeRelations, selected);
    for (const id of [...ids, "brand", ...homeRelations.map((_, i) => `relation-${i}`)])
      assert.ok(Number.isFinite(result[id].x) && Number.isFinite(result[id].y), `${selected}: 全項目・説明の位置が揃う`);
    const sides = tablePages.map((page, i) => Math.hypot(result[page].x - result[tablePages[(i + 1) % 3]].x, result[page].y - result[tablePages[(i + 1) % 3]].y));
    assert.ok(Math.max(...sides) - Math.min(...sides) < .01, "どの表からも対等な三角形を保つ");
    if (tablePages.includes(selected)) assert.ok(tablePages.every(page => result[page].y >= result[selected].y), "選んだ表を上の頂点へ配置");
    if (selected) {
      assert.equal(homeRelationDistances(homeRelations, selected).size, ids.length, "どの入口からも全階層を辿れる");
      const curves = homeRelations.map(edge => Array.from({ length: 101 }, (_, i) => curvePoint(homeRelationCurve(result[edge.from], result[edge.to], edge.from, edge.to), i / 100)));
      const side = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      const crosses = (a, b, c, d) => side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
      curves.forEach((line, index) => curves.slice(index + 1).forEach(other => {
        assert.equal(line.slice(1).some((b, i) => other.slice(1).some((d, j) => crosses(line[i], b, other[j], d))), false, `${selected}: 関係線同士が交差しない`);
      }));
      const boxes = homeRelations.map((edge, i) => {
        const p = result[`relation-${i}`], width = relationLabelWidth(edge);
        return { left: p.x - width / 2, right: p.x + width / 2, top: p.y - 14, bottom: p.y + 14 };
      });
      const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      boxes.forEach((box, index) => {
        boxes.slice(index + 1).forEach(other => assert.equal(intersects(box, other), false, "説明同士が重ならない"));
        homeRelations.forEach((edge, other) => {
          if (index === other) return;
          const curve = homeRelationCurve(result[edge.from], result[edge.to], edge.from, edge.to);
          for (let step = 0; step < 100; step++) assert.equal(segmentHitsRelationBox(curvePoint(curve, step / 100), curvePoint(curve, (step + 1) / 100), box), false, `${selected}: 別の線が説明へ入り込まない`);
        });
      });
    }
    for (const edge of homeRelations) {
      const path = homeRelationLine(result[edge.from], result[edge.to], edge.from, edge.to, edge.kind === "view");
      assert.ok(!/NaN|Infinity/.test(path), "すべての配置の線が有効");
    }
  }
  const focused = layoutHomeRelations(homeDestinations, homeRelations, "cost-table");
  assert.notDeepEqual(focused["account-type-master"], initial["account-type-master"], "直接関係のない項目も場所を空ける");
  const changing = new HomeMotion(ids.map(page => ({ page, x: initial[page].x - 100, y: initial[page].y - 12 })));
  changing.retarget(focused);
  assert.deepEqual(changing.positions()["cost-table"], initial["cost-table"], "選択した瞬間に位置を飛ばさない");
  for (let i = 0; i < 300; i++) changing.advance(1 / 60);
  for (const page of ids) assert.deepEqual(changing.positions()[page], focused[page], "全項目が選択後の定位置に収束する");
  changing.retarget(initial);
  for (let i = 0; i < 300; i++) changing.advance(1 / 60, true);
  for (const page of ids) assert.deepEqual(changing.positions()[page], initial[page], "解除で初期配置へ正確に戻る");

  console.log("PASS: home graph pointer response, settling, anchor return, refresh rate and line endpoints");
}
