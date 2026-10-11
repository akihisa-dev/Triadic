import assert from "node:assert/strict";
export async function verifyCostMonthlyAddition(api) {
  const contents = await api.readPlanContents(await api.createTriadicDatabase(2026));
  const account = contents.accounts.find(row => row.accountType === "sales");
  const rows = Array.from({ length: 1000 }, (_, index) => ({ accountId: account.id,
    amounts: Object.fromEntries(api.initiativeMonths.map(month => [month, index % 2 ? "-0.001" : "0.003"])) }));
  const initiatives = [{ fiscalYear: 2026, rows }, { fiscalYear: 2025, rows },
    { fiscalYear: 2026, rows: [{ accountId: null, amounts: { 4: "不正" } }, { accountId: 999999, amounts: { 4: "不正" } }] }];
  const before = structuredClone(initiatives);
  const result = api.buildCostTable(contents.accounts, contents.aggregations, initiatives, 2026);
  const found = result.find(row => row.kind === "account" && row.id === account.id);
  for (const month of api.initiativeMonths) assert.equal(found.changes[month], 1000, "1円精度の全月加算と年度・科目の限定");
  assert.deepEqual(initiatives, before, "計算で入力を変更しない");
  const maximum = "9007199254740.991";
  const calculate = amounts => api.buildCostTable(contents.accounts, contents.aggregations,
    [{ fiscalYear: 2026, rows: amounts.map(amount => ({ accountId: account.id, amounts: { 4: amount } })) }], 2026);
  assert.equal(calculate([maximum, maximum, "-"+maximum]).find(row => row.kind === "account" && row.id === account.id).changes[4], Number.MAX_SAFE_INTEGER);
  assert.throws(() => calculate([maximum, "0.001"]), /範囲/);
  for (const value of ["不正", "1.0001", "1e3"]) assert.throws(() => calculate([value]), /金額|数値/);
  console.log("PASS: 月別の直接加算、全12月・1000行・1円精度・相殺・最終超過・不正値・年度と科目限定・入力保持");
}
