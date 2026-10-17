import assert from "node:assert/strict";

export async function verifyAnnualAllocation(api) {
  const { allocateAnnualAmount: allocate, applyAnnualAllocation: apply, amountToYen, sumYen, initiativeMonths: months } = api;
  const equal = Object.fromEntries(months.map(month => [month, "1"]));
  const sum = result => sumYen(months.map(month => amountToYen(result[month])));
  assert.equal(sum(allocate("1", equal)), 1000);
  assert.deepEqual(months.map(month => allocate("1", equal)[month]), ["0.084", "0.084", "0.084", "0.084", "0.083", "0.083", "0.083", "0.083", "0.083", "0.083", "0.083", "0.083"]);
  assert.deepEqual(allocate("-1", equal), Object.fromEntries(Object.entries(allocate("1", equal)).map(([key, value]) => [key, `-${value}`])));
  const weighted = allocate("0.005", { 4: "1", 5: "3", 6: "0" });
  assert.equal(weighted[4], "0.001"); assert.equal(weighted[5], "0.004"); assert.equal(weighted[6], "0");
  assert.equal(allocate("0.001", { 1: "1", 4: "1" })[4], "0.001", "同率端数は年度順");
  assert.equal(allocate("9", { 3: "0.001" })[3], "9");
  for (const total of ["0", "-0.001", "0.001", "9007199254740.991", "-9007199254740.991"]) {
    assert.equal(sum(allocate(total, equal)), amountToYen(total));
    assert.equal(sum(allocate(total, { 4: "9007199254740.991", 3: "0.001" })), amountToYen(total));
  }
  for (const weights of [{}, { 4: "0" }, { 4: "-1" }, { 4: "" }, { 13: "1" }, { "04": "1" }, { 4: "1.0001" }, { 4: "1e2" }]) assert.throws(() => allocate("1", weights));
  for (const total of ["", "1.0001", "1e3", "9007199254740.992"]) assert.throws(() => allocate(total, equal));
  const draft = { ...api.createInitiativeDraft("2026"), rows: [
    { id: "first", accountId: 1, amounts: { 4: "120", 5: "8" }, overrides: { 2: { 4: "0", 5: "8" } } },
    { id: "second", accountId: 1, amounts: { 4: "99" } },
  ] }, original = structuredClone(draft);
  const primary = apply(draft, 1, 0, "1", { 4: "1", 5: "1", 6: "1" });
  assert.equal(primary.rows[0].amounts[4], "0.334");
  assert.equal(primary.rows[0].amounts[7], "0");
  assert.deepEqual(primary.rows[0].overrides, draft.rows[0].overrides);
  assert.equal(primary.rows[1], draft.rows[1]);
  const confirmed = apply(draft, 2, 0, "0", equal);
  assert.equal(Object.keys(confirmed.rows[0].overrides[2]).length, 12);
  assert.ok(Object.values(confirmed.rows[0].overrides[2]).every(value => value === "0"));
  assert.deepEqual(confirmed.rows[0].amounts, draft.rows[0].amounts);
  assert.equal(confirmed.rows[1], draft.rows[1]);
  assert.deepEqual(draft, original);
  for (const row of [-1, 2, 0.5]) assert.throws(() => apply(draft, 1, row, "1", equal));
  assert.throws(() => apply(draft, 3, 0, "1", equal));
  assert.throws(() => apply({ ...draft, invalidNumbers: true }, 1, 0, "1", equal));
  assert.throws(() => apply({ ...draft, rows: [{ ...draft.rows[0], accountId: null }] }, 1, 0, "1", equal));
  assert.throws(() => apply({ ...draft, rows: [{ ...draft.rows[0], invalidAmounts: { 2: { 4: { original: "0", inherited: true } } } }] }, 1, 0, "1", equal));
  console.log("年間配分: 均等・比率・対象外0・年度順端数・正負と1円・最大額・不正値・全月一括・種別/他行/入力の保護を確認しました。");
}
