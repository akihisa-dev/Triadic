import assert from "node:assert/strict";

export async function verifyCostBreakdown(api) {
  const contents = await api.readPlanContents(await api.createSamplePlan(2026));
  const original = JSON.stringify(contents);
  for (const filter of [{ industries: null, departments: null }, { industries: [1], departments: [1] }, { industries: [999], departments: null }]) {
    const filtered = api.filterPlan(contents, filter);
    for (const selected of [[1], [2], [2, 1]]) {
      const table = api.buildPeriodCostComparison(filtered, selected);
      for (const row of table.rows.filter(row => row.kind !== "ratio" && row.configured)) {
        for (const period of api.tablePeriods) row.values.forEach((values, column) => {
          const detail = api.buildCostBreakdown(filtered, { kind: row.kind, id: row.id, period, column }, selected);
          assert.equal(detail.total, values[period.id] ?? 0, `${row.name}/${period.id}/${table.labels[column]}`);
        });
      }
    }
  }
  assert.equal(JSON.stringify(contents), original, "内訳の閲覧は元の計画を変更しない");
  const sales = contents.accounts.find(item => item.accountName === "売上高");
  const period = api.tablePeriods.find(item => item.id === "4");
  const target = { kind: "account", id: sales.id, period, column: 2 };
  const synthetic = structuredClone(contents);
  synthetic.previousAmounts = [];
  synthetic.initiatives = [{ ...contents.initiatives[0], rows: [
    { accountId: sales.id, amounts: { 4: "0.001", 5: "-0.001" }, overrides: { 2: { 4: "0" } } },
    { accountId: sales.id, amounts: { 4: "-0.001" } },
  ] }];
  const confirmed = api.buildCostBreakdown(synthetic, target, [1, 2]);
  assert.equal(confirmed.total, -1, "手修正0を引き継ぎと区別する");
  assert.equal(confirmed.lines.length, 1);
  const primary = api.buildCostBreakdown(synthetic, { ...target, column: 1 }, [1, 2]);
  assert.equal(primary.total, 0);
  assert.deepEqual(primary.lines.map(line => line.amount), [1, -1], "同一科目の複数行を相殺せず表示する");
  const annual = api.buildCostBreakdown(synthetic, { ...target, column: 1, period: api.tablePeriods.find(item => item.id === "annual") }, [1]);
  assert.equal(annual.lines[0].amount, 0, "期間内に非0があれば相殺0も残す");
  const unconfigured = contents.aggregations.find(item => !item.members.length);
  assert.throws(() => api.buildCostBreakdown(contents, { ...target, kind: "group", id: unconfigured.id }, [1, 2]), /未設定/);
  synthetic.initiatives[0].rows = [
    { accountId: sales.id, amounts: { 4: "9007199254740.991" } },
    { accountId: sales.id, amounts: { 4: "0.001" } },
  ];
  assert.throws(() => api.buildCostBreakdown(synthetic, { ...target, column: 1 }, [1]), /範囲/);
  let rowReads = 0;
  const unrelated = contents.accounts.find(item => item.id !== sales.id);
  const many = { ...contents, previousAmounts: [], initiatives: Array.from({ length: 5000 }, (_, index) => {
    const rows = [{ accountId: index === 0 ? sales.id : unrelated.id, amounts: { 4: '1', 5: '-1' } }];
    return { ...contents.initiatives[0], id: 100000 + index, get rows() { rowReads++; return rows; } };
  }) };
  const candidates = api.indexCostBreakdown(many);
  const first = api.buildCostBreakdown(many, { ...target, column: 1 }, [1], candidates);
  assert.equal(first.lines.length, 1); assert.equal(rowReads, 5000);
  rowReads = 0;
  const repeated = api.buildCostBreakdown(many, { ...target, column: 1, period: api.tablePeriods.find(item => item.id === 'annual') }, [1], candidates);
  assert.equal(repeated.lines.length, 1); assert.equal(repeated.lines[0].amount, 0);
  assert.equal(rowReads, 0, '期間変更と再表示は無関係な施策行を再走査しない');
  assert.deepEqual(repeated, api.buildCostBreakdown(many, { ...target, column: 1, period: api.tablePeriods.find(item => item.id === 'annual') }, [1]));
  console.log("総原価表の内訳: 全金額列・期間・分類・集計符号・1円精度・手修正0・相殺・範囲超過を確認しました。");
}
