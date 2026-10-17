import assert from "node:assert/strict";

export async function verifyHistoryIncomeImpact(api) {
  const template = await api.readPlanContents(await api.createTriadicDatabase(2026), false);
  const base = { ...template, accounts: ["sales", "cost", "expense", "profit"].map((accountType, index) => ({ id: index + 1, accountType })),
    previousAmounts: ["100", "20", "10", "5"].map((amount, index) => ({ month: 4, accountId: index + 1, amount })),
    initiatives: [{ fiscalYear: 2026, rows: [
      { accountId: 1, amounts: { 4: "10" }, overrides: { 2: { 4: "0" } } },
      { accountId: 2, amounts: { 4: "2" } },
      { accountId: 3, amounts: { 4: "3" }, overrides: { 2: { 4: "0" } } },
      { accountId: 4, amounts: { 4: "1" } },
    ] }] };
  const original = structuredClone(base), after = structuredClone(base);
  after.previousAmounts[0].amount = "101";
  after.initiatives[0].rows[0].amounts[4] = "11.001";
  after.initiatives[0].rows[0].amounts[3] = "0.001";
  after.initiatives[0].rows[2].amounts[4] = "2";
  const impact = api.compareHistoryIncome(base, after);
  const cell = (kind, period, metric) => impact.find(item => item.kind === kind && item.period === period && item.metric === metric);
  assert.equal(impact.length, 78);
  assert.deepEqual(cell(1, 4, "sales"), { kind: 1, period: 4, metric: "sales", before: { yen: 88000 }, after: { yen: 90001 }, difference: { yen: 2001 } });
  assert.equal(cell(1, 4, "expense").difference.yen, -1000);
  assert.equal(cell(1, 4, "profit").before.yen, 81000);
  assert.equal(cell(1, 4, "profit").difference.yen, 3001);
  assert.equal(cell(1, "year", "profit").difference.yen, 3002, "丸めない月額で年間を計算");
  assert.equal(cell(2, 4, "sales").before.yen, 78000);
  assert.equal(cell(2, 4, "expense").before.yen, 10000);
  assert.equal(cell(2, 4, "profit").difference.yen, 1000, "手修正0を維持");
  assert.equal(cell(2, 3, "profit").difference.yen, 1, "未修正月は一次予算を引き継ぐ");
  assert.equal(cell(2, "year", "profit").difference.yen, 1001);
  assert.deepEqual(base, original);
  const reclassified = structuredClone(base); reclassified.accounts[1].accountType = "expense";
  const changed = api.compareHistoryIncome(base, reclassified);
  assert.equal(changed.find(item => item.kind === 1 && item.period === 4 && item.metric === "sales").difference.yen, 22000);
  assert.equal(changed.find(item => item.kind === 1 && item.period === 4 && item.metric === "expense").difference.yen, 22000);
  assert.equal(changed.find(item => item.kind === 1 && item.period === 4 && item.metric === "profit").difference.yen, 0);
  assert.ok(api.compareHistoryIncome(base, { ...base, aggregations: [], kindSelections: {}, departments: [] }).every(item => item.difference.yen === 0), "所属・表示設定・科目集計の構成で金額項目の規則を変えない");
  const empty = { ...base, previousAmounts: [], initiatives: [] };
  assert.ok(api.compareHistoryIncome(empty, empty).every(item => item.before.yen === 0 && item.after.yen === 0 && item.difference.yen === 0));
  const maximum = "9007199254740.991", negative = `-${maximum}`;
  const plan = rows => ({ ...empty, initiatives: [{ fiscalYear: 2026, rows: rows.map(amounts => ({ accountId: 1, amounts })) }] });
  const cancelled = api.compareHistoryIncome(empty, plan([{ 4: maximum }, { 4: maximum }, { 4: negative }]));
  assert.equal(cancelled.find(item => item.kind === 1 && item.period === 4 && item.metric === "sales").after.yen, Number.MAX_SAFE_INTEGER);
  const range = api.compareHistoryIncome(plan([{ 4: negative }]), plan([{ 4: maximum, 5: maximum }]));
  const april = range.find(item => item.kind === 1 && item.period === 4 && item.metric === "sales");
  assert.equal(april.before.yen, -Number.MAX_SAFE_INTEGER); assert.equal(april.after.yen, Number.MAX_SAFE_INTEGER);
  assert.equal(april.difference.error, "範囲超過");
  assert.equal(range.find(item => item.kind === 1 && item.period === "year" && item.metric === "sales").after.error, "範囲超過");
  assert.equal(range.find(item => item.kind === 1 && item.period === 4 && item.metric === "expense").difference.yen, 0);
  assert.ok(api.compareHistoryIncome(plan([{ 4: maximum }, { 4: maximum }]), plan([{ 4: maximum }, { 4: maximum }])).every(item => item.difference.yen === 0), "表示上限超過でも差額自体は正確に求める");
  console.log("履歴収支: 前年＋施策・全属性符号・一次/確定・手修正0/継承・1円・年間・分類/表示独立・相殺とセル別上限・無変更を確認しました。");
}
