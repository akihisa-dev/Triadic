import assert from "node:assert/strict";
export function verifyBudgetHints(api) {
  const account = { id: 1, accountType: null };
  const row = { accountId: 1, amounts: { 4: "100", 5: "0.001", 6: "-2" }, overrides: { 2: { 4: "0", 5: "0.002", 6: "-2" } } };
  const before = structuredClone(row);
  assert.equal(api.budgetAmountHint(row, 1, 4), undefined);
  assert.equal(api.budgetAmountHint(row, 2, 7), undefined);
  assert.equal(api.budgetAmountHint(row, 2, 4), "一次 100 → 確定 0（−100）");
  assert.equal(api.budgetAmountHint(row, 2, 5), "一次 0.001 → 確定 0.002（+0.001）");
  assert.equal(api.budgetAmountHint(row, 2, 6), "一次 -2・同額で手修正");
  assert.equal(api.budgetAmountHint({ amounts: {}, overrides: { 2: { 4: "0" } } }, 2, 4), "一次 0・同額で手修正");
  assert.equal(api.budgetAmountHint({ amounts: { 4: "-9007199254740.991" }, overrides: { 2: { 4: "9007199254740.991" } } }, 2, 4), "一次 -9007199254740.991 → 確定 9007199254740.991（+18014398509481.982）");
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
  ]) assert.equal(api.budgetAmountHint(invalidRow, 2, 4), undefined, "入力エラーを情報表示で隠さない");
  assert.deepEqual(row, before, "表示の判定は入力・手修正を変更しない");
  console.log("budget hints: exact changes, overrides, attributes and input protection passed");
}
