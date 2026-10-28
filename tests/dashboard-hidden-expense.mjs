import assert from 'node:assert/strict';

export async function verifyDashboardHiddenExpense(api) {
  for (const period of ['month', 'annual']) {
    let bytes = await api.createTriadicDatabase(2026);
    const initial = await api.readPlanContents(bytes), expense = initial.accounts.filter(row => row.accountType === 'expense').slice(0, 2), profit = initial.accounts.find(row => row.accountType === 'profit');
    const pairs = [...new Map(initial.departments.flatMap(department => department.industryIds.map(industryId => [industryId, { departmentId: department.id, industryId }]))).values()].slice(0, 2);
    assert.equal(pairs.length, 2);
    for (const [index, sign] of [1, -1].entries()) {
      const amounts = Object.fromEntries((period === 'month' ? [4] : api.initiativeMonths).map(month => [month, String(sign * (period === 'month' ? 5000000000000 : 500000000000))]));
      bytes = await api.registerInitiative(bytes, { ...api.createInitiativeDraft('2026'), name: `非表示費用${index}`, ...pairs[index], expansionId: initial.expansions[0].id,
        rows: [...expense.map(account => ({ accountId: account.id, amounts })), { accountId: profit.id, amounts }, { accountId: profit.id, amounts }] });
    }
    await api.validateTriadicDatabase(bytes);
    const contents = await api.readPlanContents(bytes), before = structuredClone(contents);
    for (const selected of [[1], [2], [1, 2], [2, 1]]) for (const previousKind of [1, 2]) {
      const context = { ...contents, budgetPrevious: { 1: previousKind, 2: previousKind === 1 ? 2 : 1 } };
      const groups = api.buildDashboardBreakdowns(context, selected);
      for (const dimension of ['industries', 'departments', 'expansions', 'periods']) for (const group of groups[dimension]) for (const budget of group.budgets) {
        assert.deepEqual(api.analysisAnnual(budget.months), { sales: 0, profit: 0 }, '分類別の非表示費用を範囲検査しない');
      }
      for (const group of groups.cells.values()) for (const budget of group.budgets) assert.deepEqual(api.analysisAnnual(budget.months), { sales: 0, profit: 0 });
      for (const account of groups.accounts) for (const budget of account.budgets) assert.equal(api.analysisAnnual(budget.months).expense, 0, '表示する科目別費用は正負を正確に相殺');
      assert.match(api.renderDashboard(context, selected), /ダッシュボード/);
    }
    const visibleOverflow = { ...contents, initiatives: [{ ...contents.initiatives[0], rows: contents.initiatives[0].rows.slice(0, 2) }] };
    assert.throws(() => {
      const groups = api.buildDashboardBreakdowns(visibleOverflow, [1]);
      for (const group of groups.industries) api.analysisAnnual(group.budgets[0].months);
    }, /範囲/, '実際に表示する利益の月/年間超過は拒否');
    assert.deepEqual(contents, before);
  }
  console.log('PASS: 分類別の非表示費用の月/年間超過を除外、正負相殺・両予算と各基準、表示費用と利益の範囲検査・元データを維持');
}
