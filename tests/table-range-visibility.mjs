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
      const fixedColumn = node({ right: left }, { position: 'sticky', left: '0px' });
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
        left: position.left - (region.scrollLeft - 600), right: position.left + position.width - (region.scrollLeft - 600),
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
  } finally {
    if (originalStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = originalStyle;
  }
  console.log('PASS: 三表の固定見出し・可変固定範囲・通常幅/狭幅の左固定列・下端合計を除いた選択表示');
}
