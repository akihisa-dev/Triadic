import assert from "node:assert/strict";

export async function verifyDashboard(api) {
  const sample = await api.readPlanContents(await api.createSamplePlan(2026));
  const sales = sample.accounts.find(item => item.accountType === "sales");
  const expense = sample.accounts.find(item => item.accountType === "expense");
  const source = sample.initiatives[0];
  const row = (accountId, amount, confirmed) => ({ ...source.rows[0], accountId, amounts: { 4: amount }, overrides: confirmed === undefined ? {} : { 2: { 4: confirmed } } });
  const initiative = (id, name, departmentId, rows) => ({ ...source, id, name, departmentId, fiscalYear: sample.fiscalYear, rows });
  const department = sample.departments[0].id;
  const plan = { ...sample, previousKind: 1, previousAmounts: [
    { ...sample.previousAmounts[0], previousKind: 1, departmentId: department, accountId: sales.id, month: 4, amount: "1000" },
    { ...sample.previousAmounts[0], previousKind: 1, departmentId: department, accountId: expense.id, month: 4, amount: "800" },
    { ...sample.previousAmounts[0], previousKind: 2, departmentId: department, accountId: sales.id, month: 4, amount: "900" },
  ], initiatives: [
    initiative(1, "増収", department, [row(sales.id, "100", "0")]),
    initiative(2, "減収", department, [row(sales.id, "-40", "-60")]),
    initiative(3, "費用削減", null, [row(expense.id, "-30")]),
    initiative(4, "費用増", department, [row(expense.id, "50")]),
    initiative(5, "円精度", department, [row(sales.id, "0.001")]),
    { ...initiative(6, "年度外", department, [row(sales.id, "999")]), fiscalYear: sample.fiscalYear - 1 },
  ] };
  const before = structuredClone(plan);
  const dashboard = api.buildDashboard(plan, [1, 2]);
  assert.deepEqual(api.dashboardAmounts(dashboard.previous), { sales: 1000000, profit: 200000, margin: 20 });
  assert.deepEqual(api.dashboardAmounts(dashboard.budgets[0].months), { sales: 1060001, profit: 240001, margin: 240001 / 1060001 * 100 });
  assert.equal(api.dashboardAmounts(dashboard.budgets[1].months).sales, 940001, "確定手修正0を引き継ぎ値に戻さない");
  assert.equal(api.dashboardAmounts(dashboard.departments.find(item => item.id === null).budgets[0].months).profit, 30000, "未所属を全体から落とさない");
  for (const metric of ["sales", "profit"]) for (let i = 0; i < 2; i++) assert.equal(dashboard.departments.reduce((sum, item) => sum + api.dashboardAmounts(item.budgets[i].months)[metric], 0), api.dashboardAmounts(dashboard.budgets[i].months)[metric], "部署と未所属の合計は全体に一致");
  const ranks = (kind, period, metric, direction) => api.rankDashboardInitiatives(dashboard, kind, period, metric, direction);
  assert.deepEqual(ranks(1, "annual", "sales", "increase").map(item => [item.initiative.name, item.amount]), [["増収", 100000], ["円精度", 1]]);
  assert.deepEqual(ranks(1, 4, "profit", "decrease").map(item => item.initiative.name), ["費用増", "減収"]);
  assert.deepEqual(ranks(2, "annual", "sales", "increase").map(item => item.initiative.name), ["円精度"]);
  assert.equal(ranks(1, 5, "sales", "increase").length, 0, "その月に影響のない施策は除く");
  assert.deepEqual(ranks(1, "annual", "sales", "increase")[0].values, [{ kind: 1, amount: 100000 }, { kind: 2, amount: 0 }]);
  assert.equal(api.dashboardAmounts(api.buildDashboard({ ...plan, previousKind: 2 }, [1]).budgets[0].months).sales, 960001);
  assert.equal(api.dashboardAmounts({}).margin, undefined);
  assert.deepEqual(api.dashboardChange(0, 0), { amount: 0, rate: undefined });
  assert.deepEqual(api.dashboardChange(0, -100), { amount: 100, rate: undefined });
  assert.deepEqual(api.dashboardChange(120, 100), { amount: 20, rate: (120 / 100 - 1) * 100 });
  assert.throws(() => api.dashboardAmounts({ 4: { sales: Number.MAX_SAFE_INTEGER, profit: 0 }, 5: { sales: 1, profit: 0 } }), /範囲/);
  assert.deepEqual(plan, before, "閲覧・比較・順位で入力を書き換えない");
  for (const previousKind of [1, 2]) for (const selected of [[1], [2], [1, 2], [2, 1]]) {
    const context = { ...sample, previousKind };
    const actual = api.buildDashboard(context, selected);
    const expansion = api.buildKindExpansionTable(context, selected, "registered");
    assert.deepEqual(actual.previous, expansion.previous[0]);
    actual.budgets.forEach((entry, index) => assert.deepEqual(entry.months, expansion.total[index], "展開表の収支と月別に一致"));
  }
}
