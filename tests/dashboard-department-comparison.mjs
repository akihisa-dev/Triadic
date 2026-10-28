import assert from 'node:assert/strict';

export function verifyDashboardDepartmentComparison(api) {
  for (const count of [0, 1, 10, 100]) for (const kinds of [[1], [1, 2]]) for (const period of ['annual', 4]) {
    let reads = 0;
    const departments = Array.from({ length: count }, (_, index) => ({ id: index === 0 ? null : index, name: index === 0 ? '未所属' : `部署${index}`, budgets: kinds.map(kind => {
      const months = { 4: { sales: index % 3 === 0 ? 0 : -100 * kind, profit: 20 * index * kind }, 5: { sales: 200 * kind, profit: -30 * index * kind } };
      const previous = { 4: { sales: 100, profit: -10 }, 5: { sales: -50, profit: 20 } };
      return { kind, get previous() { reads++; return previous; }, get months() { reads++; return months; } };
    }) }));
    const result = api.dashboardDepartmentComparison(departments, period);
    assert.equal(reads, count * kinds.length * 2, '部署数と予算数に比例して各期間値を一度読む');
    const expected = departments.map(row => ({ ...row, budgets: row.budgets.map(entry => ({ kind: entry.kind, previous: api.dashboardAmounts(entry.previous, period), amounts: api.dashboardAmounts(entry.months, period) })) }));
    assert.deepEqual(result.rows, expected, '負数・売上0・未所属・年間と月別・各予算の値を維持');
    for (const metric of ['sales', 'profit', 'margin']) assert.equal(result.maximum[metric], Math.max(1, ...expected.flatMap(row => row.budgets.map(entry => Math.abs(entry.amounts[metric] ?? 0)))));
  }
  console.log('PASS: 部署比較の期間値と最大値を共有し、空・未所属・負数・売上0・年間/月別・予算選択で計算量を部署数に比例させる');
}
