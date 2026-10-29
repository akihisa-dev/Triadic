import assert from 'node:assert/strict';
export async function verifyExpansionBaselineTotal(api) {
  for (const split of [false, true]) for (const negative of [false, true]) {
    const bytes = await api.createExpansionBaselineTotalPlan(split, negative), contents = await api.readPlanContents(bytes), before = structuredClone(contents);
    const sign = negative ? -1 : 1;
    for (const selected of [[1], [2], [1, 2], [2, 1]]) {
      const context = { ...contents, budgetPrevious: { 1: 1, 2: 1, display: 2 } }, view = api.createExpansionTableView(context)(selected);
      for (const period of api.tablePeriods) for (const metric of ['sales', 'profit']) {
        const expected = period.months.includes(4) ? sign * 8e15 : 0;
        assert.deepEqual(view.table.total.map(months => api.expansionPeriodAmount(months, period, metric)), [...selected.map(() => expected), ...(selected.length === 2 ? [0] : [])]);
      }
      assert.match(api.renderExpansionTable(context, selected), /基準合計の境界1/);
      const columns = [{ id: 'name', label: '施策名', value: row => row.name }];
      const filter = text => api.selectExpansionView(view, context, columns, { sort: null, filters: { name: { type: 'text', text, exact: true } } });
      const visible = filter('基準合計の境界1');
      assert.equal(visible.calculationError, '');
      assert.deepEqual(visible.table.total.map(months => months[4].sales), [...selected.map(() => sign * (split ? 9e15 : 8e15)), ...(selected.length === 2 ? [0] : [])]);
      assert.match(filter('一致しない').calculationError, /範囲/, '実際の絞り込み後予算10e15円は拒否');
      assert.throws(() => api.buildKindExpansionTable(context, selected, 'registered'), /範囲/, 'Excelの基準前年行の超過は引き続き拒否');
      const noChanges = { ...context, initiatives: [] };
      assert.throws(() => api.createExpansionTableView(noChanges)(selected), /範囲/);
      const displayedOverflow = { ...context, budgetPrevious: { ...context.budgetPrevious, display: 1 } };
      assert.throws(() => api.displayedExpansionPrevious(displayedOverflow, selected), /範囲/, '本当に表示する前年の超過は拒否');
    }
    const exact = { ...contents, budgetPrevious: { 1: 1, 2: 1, display: 2 }, initiatives: contents.initiatives.map(item => ({ ...item, rows: item.rows.map(row => ({ ...row, amounts: { 4: negative ? '1999999999999.999' : '-1999999999999.999' } })) })) };
    if (!split) assert.equal(api.createExpansionTableView(exact)([1]).table.total[0][4].sales, sign * (8e15 + 1), '円整数の1円精度を保つ');
    assert.deepEqual(contents, before); await api.validateTriadicDatabase(bytes);
  }
  console.log('PASS: 非表示の基準前年合計超過、正負・単独/両予算/逆順・全期間・絞り込み・真の表示超過・Excel拒否・1円精度・保存内容維持');
}
