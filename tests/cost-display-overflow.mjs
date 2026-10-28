import assert from 'node:assert/strict';

export async function verifyCostDisplayOverflow(api) {
  for (const scenario of ['annual', 'baseline']) {
    const bytes = await api.createCostDisplayOverflowPlan(scenario), contents = await api.readPlanContents(bytes), original = structuredClone(contents);
    const account = contents.accounts.find(row => row.accountType === 'sales');
    for (const kinds of [[1], [2], [1, 2], [2, 1]]) {
      const table = api.buildDisplayedCostComparison({ ...contents, budgetPrevious: { 1: 1, 2: 1, display: 2 } }, kinds);
      const row = table.rows.find(row => row.kind === 'account' && row.id === account.id);
      assert.deepEqual(row.values.map(value => value.annual), [...Array(kinds.length + 1).fill(scenario === 'annual' ? 6000000000000000 : 0), ...Array(kinds.length === 2 ? 2 : 1).fill(0)]);
      for (const period of api.tablePeriods.filter(period => scenario === 'baseline' || period.months.length === 1)) {
        for (const [column, definition] of table.columns.entries()) {
          const breakdown = api.buildCostBreakdown({ ...contents, budgetPrevious: { 1: 1, 2: 1, display: 2 } }, { kind: 'account', id: account.id, period, column: definition.source, displayPrevious: 2 }, definition.selected);
          assert.equal(breakdown.total, row.values[column][period.id]);
        }
      }
      for (const department of contents.departments) {
        const filtered = api.filterPlan({ ...contents, budgetPrevious: { 1: 1, 2: 1, display: 2 } }, { industries: null, departments: [department.id] });
        assert.doesNotThrow(() => api.buildDisplayedCostComparison(filtered, kinds));
      }
    }
    if (scenario === 'annual') {
      assert.throws(() => api.buildDisplayedCostComparison({ ...contents, budgetPrevious: { 1: 1, 2: 1, display: 1 } }, [1]), /範囲/, '実際に表示する年間差12e15円は拒否');
      assert.throws(() => api.buildDisplayedCostComparison({ ...contents, budgetPrevious: { 1: 2, 2: 2, display: 2 } }, [1]), /範囲/, '実際に表示する年間予算18e15円は拒否');
    } else {
      assert.throws(() => api.buildDisplayedCostComparison({ ...contents, budgetPrevious: { 1: 1, 2: 1, display: 1 } }, [1]), /範囲/, '実際に表示する前年科目10e15円は拒否');
      assert.throws(() => api.buildDisplayedCostComparison({ ...contents, initiatives: [], budgetPrevious: { 1: 1, 2: 1, display: 2 } }, [1]), /範囲/, '実際に表示する予算科目10e15円は拒否');
    }
    assert.deepEqual(contents, original);
    await api.validateTriadicDatabase(bytes);
  }
  const sample = await api.readPlanContents(await api.createSamplePlan(2026));
  for (const kinds of [[1], [2], [1, 2]]) for (const display of [1, 2]) {
    const context = { ...sample, budgetPrevious: { 1: 1, 2: 2, display } };
    const actual = api.buildDisplayedCostComparison(context, kinds);
    const prior = api.buildPeriodCostComparison({ ...context, initiatives: [], budgetPrevious: { 1: display, 2: display } }, [1]);
    const budgets = kinds.map(kind => api.buildPeriodCostComparison(context, [kind]));
    for (const [index, row] of actual.rows.entries()) for (const period of api.tablePeriods) {
      const previous = prior.rows[index].values[0][period.id];
      const values = budgets.map(table => table.rows[index].values[1][period.id]);
      const difference = before => values.at(-1) === undefined || before === undefined ? undefined : row.kind === 'ratio' ? values.at(-1) - before : api.addYen(values.at(-1), -before);
      assert.deepEqual(row.values.map(value => value[period.id]), [previous, ...values, difference(previous), ...(kinds.length === 2 ? [difference(values[0])] : [])], '通常金額の全科目・集計・利益率・期間・独立した前年と基準を維持');
    }
  }
  console.log('PASS: 表示に不要な年間前年差と基準前年・施策小計の超過を除外、全予算選択・内訳・部署絞り込み・実表示の超過と保存データ保持');
}
