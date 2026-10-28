import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

export function verifyTableRangeSelection({ moveTableRangeSelection: move, describeTableRange: describe, useTableRangeCopy }) {
  const cell = (row, column) => ({ row, column });
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    const first = move(null, key, true, 400, 36);
    assert.deepEqual(first, { anchor: cell(0, 0), end: cell(0, 0) });
    let range = move(first, 'ArrowRight', true, 400, 36);
    for (let row = 0; row < 250; row++) range = move(range, 'ArrowDown', true, 400, 36);
    assert.deepEqual(range, { anchor: cell(0, 0), end: cell(250, 1) }, '仮想表示の境界に選択を制限しない');
    const label = describe(range, (_row, column) => `同名施策 ${column ? '4月 利益' : '4月 売上'} 0千円`);
    assert.match(label, /現在 251行目・2列目 同名施策 4月 利益 0千円/);
    assert.match(label, /251行×2列、502セル/);
    assert.match(label, /範囲 1行目・1列目 同名施策/);
    assert.deepEqual(move(range, 'ArrowUp', false, 400, 36), { anchor: cell(249, 1), end: cell(249, 1) });
    assert.deepEqual(move(first, 'ArrowLeft', false, 400, 36), first);
  }
  const reversed = { anchor: cell(3, 2), end: cell(1, 0) };
  assert.match(describe(reversed, (row, column) => `${row}/${column}`), /現在 2行目・1列目.*3行×3列、9セル。範囲 2行目・1列目.*4行目・3列目/);
  assert.equal(describe(null, () => { throw Error('解除後に旧セルを読まない'); }), '選択なし。');
  assert.deepEqual(move(null, 'ArrowDown', false, 1, 1), { anchor: cell(0, 0), end: cell(0, 0) }, '解除・条件変更後も先頭から再開始できる');
  assert.equal(move(null, 'ArrowDown', false, 0, 36), null);
  assert.equal(move(null, 'Tab', false, 400, 36), null);
  assert.equal(move(null, 'Enter', false, 400, 36), null);
  // Exercise the actual keyboard/clipboard handlers without claiming browser layout or effects.
  const originalElement = globalThis.Element;
  class ElementFixture { closest() { return null; } }
  globalThis.Element = ElementFixture;
  try {
    const region = Object.assign(new ElementFixture(), { scrollTop: 900, querySelectorAll: () => [], querySelector: () => null });
    let copy;
    const markup = renderToStaticMarkup(createElement(function Harness() {
      copy = useTableRangeCopy({ current: region }, { rowCount: 400, columnCount: 36, resetKey: 'rows',
        textAt: (row, column) => column === 0 ? '0' : `${row}/${column}`,
        describeAt: (row, column) => `同名施策 4月 売上 ${row}/${column}` });
      return createElement('div', copy.props, copy.status);
    }));
    assert.match(markup, /aria-describedby=/);
    assert.match(markup, /role="status" aria-live="polite" aria-atomic="true"/);
    assert.match(markup, /矢印キーで先頭の金額/);
    const key = (name, shiftKey = false, target = region) => {
      let prevented = false;
      copy.props.onKeyDown({ target, currentTarget: region, key: name, shiftKey, nativeEvent: {}, preventDefault() { prevented = true; } });
      return prevented;
    };
    const clipboard = () => {
      let text = null;
      copy.props.onCopy({ target: region, preventDefault() {}, clipboardData: { setData(type, value) { assert.equal(type, 'text/plain'); text = value; } } });
      return text;
    };
    assert.equal(clipboard(), null);
    assert.equal(key('ArrowDown'), true);
    assert.equal(region.scrollTop, 0);
    assert.equal(clipboard(), '0');
    key('ArrowRight', true);
    for (let row = 0; row < 250; row++) key('ArrowDown', true);
    const copied = clipboard().split('\n');
    assert.equal(copied.length, 251);
    assert.equal(copied[0], '0\t0/1');
    assert.equal(copied.at(-1), '0\t250/1');
    const before = clipboard();
    assert.equal(key('ArrowRight', false, new ElementFixture()), false, '見出しの操作を奪わない');
    assert.equal(key('Enter'), false, '内訳の通常Enterを奪わない');
    assert.equal(key('Tab'), false);
    assert.equal(clipboard(), before);
    key('Escape'); assert.equal(clipboard(), null);
    key('ArrowRight'); assert.equal(clipboard(), '0');
  } finally {
    if (originalElement === undefined) delete globalThis.Element;
    else globalThis.Element = originalElement;
  }
  console.log('PASS: 金額のキーボード開始・移動・解除後の再開始、画面外の範囲と同名行・0の選択説明');
}
