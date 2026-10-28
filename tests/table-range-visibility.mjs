import assert from 'node:assert/strict';

export function verifyTableRangeVisibility({ revealTableRangeCell }) {
  const originalStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = element => element.style;
  try {
    // Actual layout is checked separately in the browser test; these are measured-rectangle fixtures.
    for (const width of [1200, 600]) for (const layout of ['initiative', 'expansion', 'cost', 'cost-columns']) {
      const frozenTop = layout === 'initiative' ? 56 : layout === 'expansion' ? 168 : layout === 'cost' ? 224 : 48;
      const frozenLeft = layout.startsWith('cost') ? 176 : width <= 650 ? 144 : layout === 'initiative' ? 532 : 520;
      const footerHeight = layout === 'initiative' ? 28 : 0;
      const region = { scrollTop: 980, scrollLeft: 600, clientTop: 1, clientLeft: 1, clientHeight: 500, clientWidth: width,
        contains: () => true, getBoundingClientRect: () => ({ top: 219, left: 19 }) };
      const node = (rect, style = {}, contains = () => false) => ({ style: { position: 'static', top: 'auto', bottom: 'auto', left: 'auto', ...style },
        getBoundingClientRect: () => rect, contains });
      const top = 220 + frozenTop, bottom = 720 - footerHeight, left = 20 + frozenLeft, right = 20 + width;
      const fixedColumn = node({ right: left, width: frozenLeft }, { position: 'sticky', left: '0px' });
      const staticColumn = node({ right: 8000 }); // Non-fixed columns must not reduce the narrow viewport.
      const headerRows = [node({ bottom: 244 }, layout === 'cost-columns' ? { position: 'sticky', top: '0px' } : {}),
        node({ bottom: 268 }, layout === 'cost-columns' ? { position: 'sticky', top: '24px' } : {})];
      headerRows[0].cells = [fixedColumn, staticColumn];
      const head = { ...node({ bottom: layout === 'cost-columns' ? 1000 : top }, layout === 'cost-columns' ? {} : { position: 'sticky', top: '0px' }), rows: headerRows };
      const foot = footerHeight ? node({ top: bottom }, { position: 'sticky', bottom: '0px' }) : null;
      const table = { tHead: head, tFoot: foot };
      let position = { top: 220, left: 20, height: 28, width: 96 };
      const cell = { closest: () => table, getBoundingClientRect: () => ({
        top: position.top - (region.scrollTop - 980), bottom: position.top + position.height - (region.scrollTop - 980),
        left: position.left - (region.scrollLeft - 600), right: position.left + position.width - (region.scrollLeft - 600), width: position.width,
      }) };
      revealTableRangeCell(region, cell);
      assert.equal(cell.getBoundingClientRect().top, top, `${layout}/${width}: 上方向で固定見出しの直下へ戻す`);
      assert.equal(cell.getBoundingClientRect().left, left, `${layout}/${width}: 左固定列の右へ戻す`);
      const settled = [region.scrollTop, region.scrollLeft];
      revealTableRangeCell(region, cell);
      assert.deepEqual([region.scrollTop, region.scrollLeft], settled, '既に見える選択では動かさない');

      region.scrollTop = 980; region.scrollLeft = 600;
      position = { top: 710, left: right - 10, height: 28, width: 96 };
      revealTableRangeCell(region, cell);
      assert.equal(cell.getBoundingClientRect().bottom, bottom, '下端合計とスクロールバーを除いた内側へ表示');
      assert.equal(cell.getBoundingClientRect().right, right, '右端からはみ出す分だけ移動');

      if (foot) {
        region.scrollTop = 980; position = { top: bottom, left, height: 28, width: 96 };
        foot.contains = target => target === cell;
        revealTableRangeCell(region, cell);
        assert.equal(region.scrollTop, 980, '固定合計自身の選択で縦位置を動かさない');
      }
    }
    for (const width of [240, 279, 320, 375]) {
      const region = { clientTop: 0, clientLeft: 0, clientWidth: width, clientHeight: 500, scrollTop: 0, scrollLeft: 0,
        contains: () => true, getBoundingClientRect: () => ({ top: 0, left: 0 }) };
      const header = { style: { position: 'sticky', left: '0px' }, getBoundingClientRect: () => ({ right: 380 - region.scrollLeft, width: 144 }) };
      const table = { tHead: { contains: () => false, style: { position: 'static' }, rows: [{ contains: () => false, cells: [header], style: { position: 'static' } }] } };
      const cell = { closest: () => table, getBoundingClientRect: () => ({ top: 200, bottom: 228, left: 380 - region.scrollLeft, right: 476 - region.scrollLeft, width: 96 }) };
      revealTableRangeCell(region, cell);
      assert.equal(cell.getBoundingClientRect().right, width, '貼り付く前の名称列の自然位置を遮蔽幅に使わない');
      header.getBoundingClientRect = () => ({ right: 176, width: 176 });
      const amount = { closest: () => table, getBoundingClientRect: () => ({ top: 200, bottom: 224, left: 176 - region.scrollLeft, right: 296 - region.scrollLeft, width: 120 }) };
      revealTableRangeCell(region, amount);
      assert.ok(amount.getBoundingClientRect().right <= width, 'セル全幅が収まらない場合も右寄せ金額の末尾へ到達する');
    }
  } finally {
    if (originalStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = originalStyle;
  }
  console.log('PASS: 三表の固定見出し・可変固定範囲・通常幅/狭幅の左固定列・下端合計を除いた選択表示');
}
