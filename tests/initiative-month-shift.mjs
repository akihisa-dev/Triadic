import assert from "node:assert/strict";
export async function verifyInitiativeMonthShift(api) {
  const { shiftInitiativeMonths: shift, initiativeMonths: months, resolvedAmount, amountToYen } = api;
  const draft = { ...api.createInitiativeDraft("2026"), name: "延期する施策", note: "備考を維持", rows: [
    { id: "a", accountId: 1, revision: 3, amountRevisions: { 4: 2 }, amounts: { 4: "0.001", 5: "-2.345", 12: "9" }, overrides: { 2: { 4: "0", 12: "9" } } },
    { id: "b", accountId: 1, amounts: { 6: "9007199254740.991", 7: "-9007199254740.991" } },
    { id: "empty", accountId: null, amounts: {} },
  ] }, original = structuredClone(draft);
  const moved = shift(draft, 2);
  assert.equal(moved.rows[0].amounts[6], "0.001");
  assert.equal(moved.rows[0].amounts[7], "-2.345");
  assert.equal(moved.rows[0].amounts[2], "9", "12月から翌2月へ移動");
  assert.deepEqual(moved.rows[0].overrides[2], { 6: "0", 2: "9" });
  assert.equal(moved.rows[0].overrides[2][7], undefined, "引き継ぎを手修正にしない");
  assert.equal(resolvedAmount(moved.rows[0], 2, 7), "-2.345");
  for (const month of [4, 5]) { assert.equal(moved.rows[0].amounts[month], "0"); assert.equal(moved.rows[0].overrides[2][month], undefined); }
  for (let row = 0; row < draft.rows.length; row++) for (const kind of [1, 2]) {
    const sum = source => months.reduce((total, month) => total + BigInt(amountToYen(resolvedAmount(source, kind, month))), 0n);
    assert.equal(sum(moved.rows[row]), sum(draft.rows[row]), "行・種別ごとの正確な年間合計を維持");
  }
  assert.equal(moved.rows[0].id, "a"); assert.equal(moved.rows[0].revision, 3);
  assert.deepEqual(moved.rows[0].amountRevisions, { 4: 2 }, "保存の競合検査基準は元の月に保持");
  assert.equal(moved.name, draft.name); assert.equal(moved.note, draft.note);
  const returned = shift(moved, -2);
  for (let row = 0; row < draft.rows.length; row++) for (const month of months) for (const kind of [1, 2]) assert.equal(resolvedAmount(returned.rows[row], kind, month), resolvedAmount(draft.rows[row], kind, month));
  assert.deepEqual(returned.rows[0].overrides, draft.rows[0].overrides);
  assert.deepEqual(draft, original);
  for (const offset of [0, 12, -12, 1.5, NaN, Infinity]) assert.throws(() => shift(draft, offset));
  for (const row of [
    { accountId: 1, amounts: { 3: "-0.001" } },
    { accountId: 1, amounts: {}, overrides: { 2: { 3: "0" } } },
  ]) assert.throws(() => shift({ ...draft, rows: [row] }, 1), /年度外/);
  assert.throws(() => shift(draft, -1), /年度外/);
  assert.throws(() => shift({ ...draft, invalidNumbers: true }, 1));
  assert.throws(() => shift({ ...draft, rows: [{ ...draft.rows[0], amounts: { 4: "0.0001" } }] }, 1));
  assert.throws(() => shift({ ...draft, rows: [{ ...draft.rows[0], invalidAmounts: { 2: { 4: { original: "0", inherited: true } } } }] }, 1));
  assert.equal(shift({ ...draft, rows: [{ accountId: 1, amounts: { 4: "1" } }] }, 11).rows[0].amounts[3], "1");
  assert.equal(shift({ ...draft, rows: [{ accountId: 1, amounts: { 3: "1" } }] }, -11).rows[0].amounts[4], "1");
  // Round-trip through real storage: removed override cells must inherit after saving.
  let bytes = await api.createCurrentEmptyTestPlan(2026);
  bytes = (await api.changeAccountMaster(bytes, { type: "add", accountCode: "100", accountName: "売上", accountType: "sales" })).bytes;
  const contents = await api.readPlanContents(bytes);
  const input = { ...draft, expansionId: contents.expansions[0].id, expansionCategoryId: contents.expansions[0].categoryIds[0], departmentId: contents.departments[0].id, industryId: contents.departments[0].industryIds[0], periodTypeId: contents.periodTypes[0].id,
    rows: [{ accountId: contents.accounts[0].id, amounts: draft.rows[0].amounts, overrides: draft.rows[0].overrides }] };
  bytes = await api.registerInitiative(bytes, input);
  const saved = (await api.readPlanContents(bytes)).initiatives[0];
  const shifted = shift({ ...input, rows: saved.rows }, 2);
  bytes = await api.updateInitiative(bytes, saved.id, saved.fiscalYear, shifted);
  const loaded = (await api.readPlanContents(bytes)).initiatives[0];
  assert.deepEqual(loaded.rows[0].overrides[2], { 6: "0", 2: "9" });
  assert.equal(resolvedAmount(loaded.rows[0], 2, 4), "0");
  assert.equal(resolvedAmount(loaded.rows[0], 2, 7), "-2.345");
  console.log("実施月移動: 全行・両種別・1円・正負・年間合計・年度境界・手修正0/同額・引き継ぎ・入力保護・実SQLite保存を確認しました。");
}
