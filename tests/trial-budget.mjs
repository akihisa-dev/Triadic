import assert from "node:assert/strict";
export async function verifyTrialBudget(api) {
  const plan = await api.readPlanContents(await api.createSamplePlan(2026), false);
  const original = structuredClone(plan);
  let trial = api.createTrialBudget(plan);
  const source = trial.contents.initiatives.find(item => item.name === "季節キャンペーン");
  const draft = { ...source, fiscalYear: "2026", rows: source.rows.map((row, i) => i ? row : { ...row, amounts: { ...row.amounts, 6: "50.001" }, overrides: { 2: { 6: "0", 7: "75" } } }) };
  trial = api.updateTrialInitiative(trial, source.id, api.shiftInitiativeMonths(draft, 2));
  const moved = trial.contents.initiatives.find(item => item.id === source.id);
  assert.equal(moved.rows[0].amounts[8], "50.001");
  assert.equal(moved.rows[0].overrides[2][8], "0");
  assert.equal(moved.rows[0].overrides[2][9], "75");
  assert.equal(moved.rows[0].overrides[2][2], undefined);
  assert.equal(moved.startYearMonths[1], "2026-07"); // Advertising starts before revenue.
  assert.deepEqual(plan, original, "編集・実施月移動で元の全予算・表示設定を変えない");
  const included = trial;
  trial = api.toggleTrialInitiative(trial, source.id);
  const reports = api.trialReportContents(trial);
  const removed = { ...trial.contents, initiatives: trial.contents.initiatives.filter(item => item.id !== source.id) };
  for (const kind of [1, 2]) {
    assert.deepEqual(api.buildKindCostTable(reports, [kind]), api.buildKindCostTable(removed, [kind]), "総原価表は不採用を除いて前年に加算");
    const projection = api.initiativesForKind(reports.initiatives, reports.accounts, kind);
    const total = api.totalInitiatives(projection);
    assert.deepEqual(total, api.totalInitiatives(api.initiativesForKind(removed.initiatives, removed.accounts, kind)), "一覧の合計も除外");
    assert.deepEqual(api.buildKindExpansionTable(reports, [kind], "registered").changes[0], total, "展開表も一覧と等価");
  }
  assert.equal(reports.initiatives.length, plan.initiatives.length, "不採用の施策を再採用できるよう残す");
  assert.deepEqual(trial.contents.initiatives.find(item => item.id === source.id), moved, "不採用でも試算入力を保持");
  trial = api.toggleTrialInitiative(trial, source.id);
  assert.deepEqual(trial, included, "再採用で編集後の試算を復帰");
  assert.throws(() => api.updateTrialInitiative(trial, source.id, { ...draft, rows: [{ ...draft.rows[0], amounts: { 4: "0.0001" } }] }));
  assert.throws(() => api.updateTrialInitiative(trial, source.id, { ...draft, fiscalYear: "2027" }));
  assert.deepEqual(plan, original, "失敗も元予算に影響しない");
  assert.deepEqual(api.createTrialBudget(plan), { contents: original, excluded: [] }, "再開始で元予算から独立した試算を作る");
  console.log("試算: 原本保護・採否・再採用・1円精度・月移動・手修正0・同額手修正・三表等価・不正入力を確認しました。");
}
