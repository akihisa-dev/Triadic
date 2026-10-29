import assert from "node:assert/strict";
import { verifyDashboardDepartmentComparison } from './dashboard-department-comparison.mjs';
import { verifyDashboardHiddenExpense } from './dashboard-hidden-expense.mjs';

export async function verifyDashboard(api) {
  verifyDashboardDepartmentComparison(api);
  await verifyDashboardHiddenExpense(api);
  const sample = await api.readPlanContents(await api.createSamplePlan(2026));
  const sales = sample.accounts.find(item => item.accountType === "sales");
  for (const sign of [1, -1]) {
    const empty = await api.createTriadicDatabase(2026), initial = await api.readPlanContents(empty);
    const bytes = await api.registerInitiative(empty, { ...api.createInitiativeDraft('2026'), name: '目盛余白の境界',
      departmentId: initial.departments[0].id, industryId: initial.departments[0].industryIds[0], expansionId: initial.expansions[0].id,
      rows: [{ accountId: sales.id, amounts: { 4: String(sign * 8500000000000) } }] });
    await api.validateTriadicDatabase(bytes);
    const contents = await api.readPlanContents(bytes);
    for (const selected of [[1], [2], [1, 2]]) {
      assert.equal(api.dashboardAmounts(api.buildDashboard(contents, selected).budgets[0].months).sales, sign * 8500000000000000);
      const html = api.renderDashboard(contents, selected);
      assert.match(html, /8,500,000,000,000/);
      assert.match(html, /9,180,000,000,000/, '実額の上限を超える概算の軸余白も千円で表示');
    }
  }
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
  const many = { ...plan, initiatives: Array.from({ length: 7 }, (_, index) =>
    initiative(index + 1, `全件確認${index + 1}`, department, [row(sales.id, String(7 - index))])) };
  for (const selected of [[1], [1, 2]]) {
    const html = api.renderDashboard(many, selected);
    assert.doesNotMatch(html, /dashboard-series-label/, '各行に予算名・基準前年を繰り返さない');
    assert.match(html, /class="dashboard-legend"/, '凡例で比較条件を確認できる');
    assert.match(html, /aria-label="一次予算 · 前年見込基準/, '読み上げ用の予算識別を維持する');
    const salesRanking = html.split('aria-label="売上を増やす施策"')[1].split('</section>')[0];
    assert.equal((salesRanking.match(/class="dashboard-rank"/g) ?? []).length, 7, '6件目以降も初期表示から確認できる');
    for (let index = 1; index <= 7; index++) assert.ok(salesRanking.includes(`全件確認${index}`));
    assert.doesNotMatch(html, /全7件を表示|上位5件に戻す/);
  }
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
  const breakdown = api.buildDashboardBreakdowns(plan, [1, 2]);
  const amount = (group, kind, metric) => api.analysisAnnual(group.budgets.find(item => item.kind === kind).months)[metric];
  for (const kind of [1, 2]) {
    const total = api.dashboardAmounts(dashboard.budgets.find(item => item.kind === kind).months);
    for (const metric of ["sales", "profit"]) {
      for (const dimension of ["industries", "departments"]) assert.equal(breakdown[dimension].reduce((sum, group) => sum + amount(group, kind, metric), 0), total[metric], `${dimension}と全体の一致`);
      const changes = total[metric] - api.dashboardAmounts(dashboard.previous)[metric];
      for (const dimension of ["expansions", "periods"]) assert.equal(breakdown[dimension].reduce((sum, group) => sum + amount(group, kind, metric), 0), changes, `${dimension}は施策増減だけ`);
      assert.equal([...breakdown.cells.values()].reduce((sum, group) => sum + amount(group, kind, metric), 0), total[metric], "部署×業種と全体の一致");
      for (const expansion of breakdown.expansions) assert.equal((breakdown.categoriesByExpansion.get(expansion.id) ?? []).reduce((sum, group) => sum + amount(group, kind, metric), 0), amount(expansion, kind, metric), "展開区分は対象展開の増減だけ");
    }
    assert.equal(breakdown.accounts.reduce((sum, group) => sum + amount(group, kind, "expense"), 0), 820000, "費用属性の科目だけに前年と施策増減を加算");
  }
  assert.equal(breakdown.industries.find(item => item.id === source.industryId).name, sample.industries.find(item => item.id === source.industryId).industryName);
  const unassigned = { ...plan, initiatives: plan.initiatives.map(item => ({ ...item, expansionId: null, expansionCategoryId: null, industryId: null, periodTypeId: null })) };
  const unknown = api.buildDashboardBreakdowns(unassigned, [1]);
  for (const dimension of ["expansions", "periods"]) assert.equal(amount(unknown[dimension].find(item => item.id === null), 1, "profit"), 40001, "未所属の増減を失わない");
  assert.equal(amount(unknown.categoriesByExpansion.get(null).find(item => item.id === null), 1, "profit"), 40001);
  for (const [width, height] of [[640, 450], [1250, 450]]) {
    const amounts = [3155186, 2383260, 1580100, 1345900, 500000, 400000, 300000, 1979206];
    const tiles = api.treemapTiles(amounts, width, height);
    const total = amounts.reduce((sum, value) => sum + value, 0);
    assert.equal(tiles.length, amounts.length);
    for (const tile of tiles) {
      assert.ok(Math.abs(tile.width * tile.height / (width * height) - amounts[tile.index] / total) < 1e-10, "面積は金額の構成比と一致");
      assert.ok(tile.x >= 0 && tile.y >= 0 && tile.x + tile.width <= width + 1e-7 && tile.y + tile.height <= height + 1e-7, "全項目が図の内側に収まる");
    }
  }
  assert.equal(api.compositionMode([0, 0]), "empty");
  assert.equal(api.compositionMode([100, -1]), "signed", "負数を面積に変換しない");
  assert.equal(api.compositionMode([0, 1]), "area");
  assert.deepEqual(api.waterfallSteps(200000, [-50000, 100000, -10000]), [{ from: 200000, to: 150000, change: -50000 }, { from: 150000, to: 250000, change: 100000 }, { from: 250000, to: 240000, change: -10000 }]);
  assert.throws(() => api.waterfallSteps(Number.MAX_SAFE_INTEGER, [1]), /範囲/);
  const noData = api.buildDashboardBreakdowns({ ...sample, previousAmounts: [], initiatives: [] }, [1]);
  assert.ok(noData.industries.every(group => amount(group, 1, "sales") === 0));
  assert.deepEqual(plan, before, "閲覧・比較・順位で入力を書き換えない");
  for (const previousKind of [1, 2]) for (const selected of [[1], [2], [1, 2], [2, 1]]) {
    const context = { ...sample, previousKind };
    const actual = api.buildDashboard(context, selected);
    const expansion = api.buildKindExpansionTable(context, selected, "registered");
    assert.deepEqual(actual.previous, expansion.previous[0]);
    const grouped = api.buildDashboardBreakdowns(context, selected);
    for (const kind of selected) for (const metric of ["sales", "profit"]) {
      const total = api.dashboardAmounts(actual.budgets.find(item => item.kind === kind).months)[metric];
      assert.equal(grouped.industries.reduce((sum, group) => sum + amount(group, kind, metric), 0), total);
    }
    actual.budgets.forEach((entry, index) => assert.deepEqual(entry.months, expansion.total[index], "展開表の収支と月別に一致"));
  }
}
