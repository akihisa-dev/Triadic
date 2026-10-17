import assert from "node:assert/strict";

export async function verifyDuplicateInitiative(api) {
  let bytes = await api.createCurrentEmptyTestPlan(2026);
  bytes = (await api.changeAccountMaster(bytes, { type: "add", accountCode: "100", accountName: "売上", accountType: "sales" })).bytes;
  let contents = await api.readPlanContents(bytes);
  const input = { name: "元の施策", note: "<>& 備考", fiscalYear: "2026", expansionId: contents.expansions[0].id,
    expansionCategoryId: contents.expansions[0].categoryIds[0],
    departmentId: contents.departments[0].id, industryId: contents.departments[0].industryIds[0], periodTypeId: contents.periodTypes[0].id,
    rows: [
      { id: crypto.randomUUID(), accountId: contents.accounts[0].id, amounts: { 4: "0.001", 5: "-2.345", 6: "9" }, overrides: { 2: { 4: "0", 6: "9" } } },
      { id: crypto.randomUUID(), accountId: contents.accounts[0].id, amounts: { 4: "8" } },
    ] };
  bytes = await api.registerInitiative(bytes, input);
  contents = await api.readPlanContents(bytes);
  const source = contents.initiatives[0], original = structuredClone(source);
  const draft = api.duplicateInitiativeDraft(source, [...contents.initiatives, { name: "元の施策（コピー）" }]);
  assert.equal(draft.name, "元の施策（コピー2）");
  for (const key of ["note", "expansionId", "expansionCategoryId", "departmentId", "industryId", "periodTypeId"]) assert.equal(draft[key], source[key]);
  assert.equal(draft.fiscalYear, "2026");
  assert.equal(draft.rows.length, 2);
  for (let index = 0; index < draft.rows.length; index++) {
    const row = draft.rows[index], saved = source.rows[index];
    assert.notEqual(row.id, saved.id);
    assert.equal(row.revision, undefined);
    assert.equal(row.amountRevisions, undefined);
    assert.equal(row.overrideRevisions, undefined);
    assert.deepEqual(row.amounts, saved.amounts);
    assert.deepEqual(row.overrides ?? {}, saved.overrides ?? {});
  }
  assert.equal(api.resolvedAmount(draft.rows[0], 2, 4), "0");
  assert.equal(api.resolvedAmount(draft.rows[0], 2, 5), "-2.345");
  assert.equal(draft.rows[0].overrides[2][6], "9", "同額の手修正を保持");
  draft.rows[0].amounts[4] = "123"; draft.rows[0].overrides[2][6] = "456";
  assert.deepEqual(source, original, "複製後の編集で元の施策を変更しない");
  draft.rows[0].amounts[4] = "0.001"; draft.rows[0].overrides[2][6] = "9";
  const registered = await api.readPlanContents(await api.registerInitiative(bytes, draft));
  assert.equal(registered.initiatives.length, 2);
  assert.deepEqual(registered.initiatives[0], source);
  assert.notEqual(registered.initiatives[1].id, source.id);
  assert.equal(registered.initiatives[1].rows[0].overrides[2][4], "0");
  assert.equal(registered.initiatives[1].rows[0].amounts[4], "0.001");
  await assert.rejects(api.registerInitiative(bytes, { ...draft, name: source.name }), /同じ施策名/);
  const empty = api.duplicateInitiativeDraft({ ...source, rows: [] }, []);
  assert.equal(empty.rows.length, 1); assert.equal(empty.rows[0].accountId, null);
  assert.equal(api.hasInitiativeDraftInput(empty), true);
  console.log("施策複製: 独立した識別子・同一科目複数行・分類・1円・引継ぎ・手修正0/同額・名前重複・登録・元データ保護を確認しました。");
}
