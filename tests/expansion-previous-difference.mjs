import assert from 'node:assert/strict';
export async function verifyExpansionPreviousDifference(api) {
  for (const split of [false, true]) {
    const bytes = await api.createExpansionPreviousPlan(split), plan = await api.readPlanContents(bytes), before = structuredClone(plan);
    for (const display of [1, 2]) for (const selected of [[1], [2], [1, 2], [2, 1]]) {
      const context = { ...plan, budgetPrevious: { 1: 1, 2: 2, display } }, view = api.createExpansionTableView(context)(selected);
      const expected = selected.map(kind => kind === 1 ? 3e15 : -3e15);
      if (selected.length === 2) expected.push(-6e15);
      for (const period of api.tablePeriods) for (const metric of ['sales', 'profit']) {
        const active = period.months.includes(4);
        assert.deepEqual(view.table.total.map(months => api.expansionPeriodAmount(months, period, metric)), expected.map(value => active ? value : 0));
      }
      const previous = api.displayedExpansionPrevious(context, selected).values;
      assert.deepEqual(previous.map(months => months[4].sales), [...selected.map(() => display === 1 ? 5e15 : -5e15), ...(selected.length === 2 ? [0] : [])]);
      assert.match(api.renderExpansionTable(context, selected), /前年差の境界1/);
      const columns = [{ id: 'name', label: '施策名', value: row => row.name }];
      const filtered = api.selectExpansionView(view, context, columns, { sort: null, filters: { name: { type: 'text', text: '前年差の境界1', exact: true } } });
      assert.equal(filtered.calculationError, '');
      assert.deepEqual(filtered.table.total.map(months => months[4].sales), [...selected.map(kind => (kind === 1 ? 1 : -1) * (split ? 4e15 : 3e15)), ...(selected.length === 2 ? [split ? -8e15 : -6e15] : [])]);
      if (selected.length === 2) {
        const empty = api.selectExpansionView(view, context, columns, { sort: null, filters: { name: { type: 'text', text: '一致しない' } } });
        assert.match(empty.calculationError, /範囲/, '実際に表示する絞り込み後の予算差10e15円は拒否');
      }
    }
    assert.deepEqual(plan, before); await api.validateTriadicDatabase(bytes);
    const overflow = { ...plan, budgetPrevious: { 1: 1, 2: 2 }, initiatives: plan.initiatives.map(item => ({ ...item, rows: item.rows.map(row => ({ ...row, amounts: { 4: '5000000000000' } })) })) };
    assert.throws(() => api.createExpansionTableView(overflow)([1]), /範囲/);
    assert.throws(() => api.buildKindExpansionTable({ ...plan, budgetPrevious: { 1: 1, 2: 2 } }, [1, 2], 'registered'), /範囲/, 'Excelが表示する基準前年間の差の検査は維持');
  }
  console.log('PASS: 展開表の非表示の基準前年間の差を除外、単独/両予算/逆順・表示用前年・絞り込み予算と真の差額超過・元データを維持');
}
