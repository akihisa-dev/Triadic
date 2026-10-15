import assert from "node:assert/strict";

export function verifyHomeMotion({ HomeMotion, motionLine }) {
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

  console.log("PASS: home graph pointer response, settling, anchor return, refresh rate and line endpoints");
}
