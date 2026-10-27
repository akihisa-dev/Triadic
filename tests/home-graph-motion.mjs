import assert from "node:assert/strict";

export function verifyHomeMotion({ HomeMotion, motionLine, layoutHomeRelations, homeDestinations, homeRelations, tablePages, homeRelationLine }) {
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
  for (const rate of [60, 120, 144, 240]) {
    const continuous = new HomeMotion(nodes);
    continuous.retarget({ a: { x: 850, y: 600 } });
    let previous = continuous.positions().a.x;
    for (let frame = 0; frame < rate / 2; frame++) {
      continuous.advance(1 / rate);
      const current = continuous.positions().a.x;
      assert.ok(current > previous, `${rate}Hz: 移動中は毎フレーム位置を更新し、同じ位置を繰り返さない`);
      previous = current;
    }
    const elapsed = Math.ceil(rate / 2) / rate;
    assert.ok(Math.abs(previous - (850 - 500 * (1 + 10 * elapsed) * Math.exp(-10 * elapsed))) < 1e-9, "更新頻度によらず同じ時間で同じ場所へ進む");
  }
  const interrupted = new HomeMotion(nodes);
  interrupted.retarget({ a: { x: 850, y: 600 } });
  interrupted.advance(.04);
  const moving = { ...interrupted.bodies.get("a") };
  interrupted.retarget({ a: { x: moving.x, y: moving.y } });
  assert.equal(interrupted.bodies.get("a").vx, moving.vx, "選び直しても速度をリセットしない");
  assert.deepEqual(interrupted.positions().a, { x: moving.x, y: moving.y }, "選び直した瞬間に位置を飛ばさない");
  assert.equal(interrupted.active, true, "新しい定位置と現在位置が同じでも、移動の勢いが残っていれば続行する");
  interrupted.advance(.0001);
  assert.ok(Math.abs((interrupted.positions().a.x - moving.x) / .0001 - moving.vx) < 2, "切り替え前後の速度を連続させる");
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

  const initial = layoutHomeRelations(homeDestinations, homeRelations, null);
  const ids = homeDestinations.map(node => node.page);
  for (const selected of [null, ...ids]) {
    const result = layoutHomeRelations(homeDestinations, homeRelations, selected);
    for (const id of [...ids, "brand", ...homeRelations.map((_, i) => `relation-${i}`)])
      assert.ok(Number.isFinite(result[id].x) && Number.isFinite(result[id].y), `${selected}: 全項目・説明の位置が揃う`);
    const sides = tablePages.map((page, i) => Math.hypot(result[page].x - result[tablePages[(i + 1) % 3]].x, result[page].y - result[tablePages[(i + 1) % 3]].y));
    assert.ok(Math.max(...sides) - Math.min(...sides) < .01, "どの表からも対等な三角形を保つ");
    if (tablePages.includes(selected)) assert.ok(tablePages.every(page => result[page].y >= result[selected].y), "選んだ表を上の頂点へ配置");
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
