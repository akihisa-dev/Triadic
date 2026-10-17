import assert from "node:assert/strict";
export function verifyBudgetHints(api) {
  const account = { id: 1, accountType: null };
  const row = { accountId: 1, amounts: { 4: "100", 5: "0.001", 6: "-2" }, overrides: { 2: { 4: "0", 5: "0.002", 6: "-2" } } };
  const before = structuredClone(row);
  assert.equal(api.isManualBudgetAmount(row, 1, 4), false);
  assert.equal(api.isManualBudgetAmount(row, 2, 7), false);
  assert.equal(api.isManualBudgetAmount(row, 2, 4), true);
  assert.equal(api.isManualBudgetAmount(row, 2, 5), true);
  assert.equal(api.isManualBudgetAmount(row, 2, 6), true);
  assert.equal(api.isManualBudgetAmount({ amounts: {}, overrides: { 2: { 4: "0" } } }, 2, 4), true);
  assert.equal(api.isManualBudgetAmount({ amounts: { 4: "-9007199254740.991" }, overrides: { 2: { 4: "9007199254740.991" } } }, 2, 4), true);
  assert.equal(api.hasUnclassifiedAmount(row, 1, account), true);
  assert.equal(api.hasUnclassifiedAmount({ amounts: { 4: "-0.001" } }, 1, account), true);
  assert.equal(api.hasUnclassifiedAmount({ amounts: { 4: "1", 5: "-1" } }, 1, account), true, "年間相殺でも未集計の月を見落とさない");
  const zero = { amounts: { 4: "1" }, overrides: { 2: { 4: "0" } } };
  assert.equal(api.hasUnclassifiedAmount(zero, 2, account), false, "選択種別の0は警告しない");
  for (const amounts of [{}, { 4: "" }, { 4: "-0" }, { 4: "bad" }]) assert.equal(api.hasUnclassifiedAmount({ amounts }, 1, account), false);
  assert.equal(api.hasUnclassifiedAmount(row, 1, undefined), false);
  assert.equal(api.hasUnclassifiedAmount(row, 1, { ...account, accountType: "expense" }), false, "属性修正で解除");
  for (const invalidRow of [
    { ...row, overrides: { 2: { 4: "bad" } } },
    { ...row, amounts: { 4: "0.0001" } },
    { ...row, invalidAmounts: { 2: { 4: { original: "0", inherited: false } } } },
  ]) assert.equal(api.isManualBudgetAmount(invalidRow, 2, 4), false, "不正入力に手修正の補助表示を出さない");
  assert.deepEqual(row, before, "表示の判定は入力・手修正を変更しない");
  console.log("budget hints: manual markers, attributes and input protection passed");
}
