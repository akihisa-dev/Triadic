import assert from "node:assert/strict";

export async function verifyExpansionData(api) {
  const { createTriadicDatabase, readPlanContents, changeExpansionMaster, saveExpansionMaster, openTriadicDatabase, changeAccountMaster, validateTriadicDatabase } = api;
  const bytes = await createTriadicDatabase();
  const initial = (await readPlanContents(bytes)).expansions;
  assert.deepEqual(initial.map(item => [item.expansionCode, item.expansionName]), [
    ["1", "コスト"], ["2", "料金改定"], ["3", "荷主撤退"], ["4", "物量増減"], ["5", "売上拡販"], ["6", "拠点集約"], ["7", "生産性向上"], ["8", "効率化"],
  ]);
  let changed = await changeExpansionMaster(bytes, { type: "add", expansionCode: "010", expansionName: "追加確認" });
  assert.equal((await readPlanContents(changed)).expansions.at(-1).expansionCode, "010");
  for (const code of ["", "１", "-1", "1.2", "a"]) await assert.rejects(changeExpansionMaster(bytes, { type: "add", expansionCode: code, expansionName: "無効" }), /半角数字/);
  await assert.rejects(changeExpansionMaster(bytes, { type: "add", expansionCode: "10", expansionName: " " }), /展開名/);
  await assert.rejects(changeExpansionMaster(bytes, { type: "add", expansionCode: "1", expansionName: "追加" }), /同じ展開コード/);
  await assert.rejects(changeExpansionMaster(bytes, { type: "add", expansionCode: "10", expansionName: "コスト" }), /同じ展開名/);
  changed = await changeExpansionMaster(changed, { type: "update", id: 1, expansionCode: "01", expansionName: "コスト改定" });
  assert.equal((await readPlanContents(changed)).expansions.find(item => item.id === 1).expansionName, "コスト改定");
  changed = await changeExpansionMaster(changed, { type: "delete", id: 2 });
  assert.ok(!(await readPlanContents(changed)).expansions.some(item => item.id === 2));
  await assert.rejects(changeExpansionMaster(changed, { type: "delete", id: 999 }), /見つかりません/);
  assert.deepEqual((await readPlanContents(bytes)).expansions, initial);
  await validateTriadicDatabase(changed);

  const target = initial.at(-1), deletion = { type: "delete", id: target.id, deletionKey: api.expansionDeletionKey(target) };
  const removed = await changeExpansionMaster(bytes, deletion);
  const recreated = await changeExpansionMaster(removed, { type: "add", expansionCode: "99", expansionName: "別の展開" });
  assert.equal((await readPlanContents(recreated)).expansions.at(-1).id, target.id);
  for (const replacement of [
    recreated,
    await changeExpansionMaster(bytes, { type: "update", id: target.id, expansionCode: target.expansionCode, expansionName: "改名した展開" }),
    await changeExpansionMaster(bytes, { type: "update", id: target.id, expansionCode: "99", expansionName: target.expansionName }),
    await changeExpansionMaster(bytes, { type: "update", id: target.id, expansionCode: target.expansionCode, expansionName: target.expansionName, categoryIds: [1] }),
  ]) {
    await assert.rejects(changeExpansionMaster(replacement, deletion), /削除対象の展開が変更/);
    const current = await readPlanContents(replacement), old = await readPlanContents(bytes);
    const command = api.reconcileWindowCommand({ type: "expansion", change: deletion }, api.windowCommandBase({ type: "expansion", change: deletion }, old), current);
    await assert.rejects(changeExpansionMaster(replacement, command.change), /削除対象の展開が変更/);
  }
  await assert.rejects(changeExpansionMaster(removed, deletion), /見つかりません/);
  const unrelated = (await changeAccountMaster(bytes, { type: "add", accountCode: "999", accountName: "独立変更", accountType: "expense" })).bytes;
  assert.ok(!(await readPlanContents(await changeExpansionMaster(unrelated, deletion))).expansions.some(item => item.id === target.id));
  assert.equal(api.expansionDeletionKey({ ...target, categoryIds: [2, 1] }), api.expansionDeletionKey({ ...target, categoryIds: [1, 2] }), "所属順だけでは対象変更にしない");

  let empty = bytes;
  for (const item of initial) empty = await changeExpansionMaster(empty, { type: "delete", id: item.id });
  assert.deepEqual((await readPlanContents(empty)).expansions, [], "全件削除しても初期データを復活させない");
  const otherChange = await changeAccountMaster(empty, { type: "add", accountCode: "001", accountName: "別マスタ更新", accountType: "expense" });
  assert.deepEqual((await readPlanContents(otherChange.bytes)).expansions, []);
  const malformed = await openTriadicDatabase(bytes);
  malformed.exec("DROP TABLE expansions");
  const malformedBytes = malformed.export(); malformed.close();
  await assert.rejects(validateTriadicDatabase(malformedBytes));

  let stored = bytes;
  let writes = 0;
  const handle = { name: "expansion.triadic", async getFile() { return new File([stored], this.name); }, async createWritable() {
    let pending;
    return { async write(value) { pending = value; writes++; }, async close() { stored = new Uint8Array(pending); }, async abort() {} };
  } };
  const plan = { ...await readPlanContents(bytes), bytes, handle, name: handle.name };
  const noPicker = () => { throw new Error("不要な保存先選択"); };
  const add = { type: "add", expansionCode: "10", expansionName: "保存確認" };
  const saved = await saveExpansionMaster(plan, add, noPicker);
  assert.deepEqual((await readPlanContents(stored)).expansions, saved.expansions);
  await assert.rejects(saveExpansionMaster(plan, { ...add, expansionCode: "11" }, noPicker), /保存先のファイルが更新/);
  assert.equal(writes, 1);
  const before = stored.slice();
  const fail = { ...handle, async createWritable() { return { async write() { throw new Error("保存失敗"); }, async close() {}, async abort() {} }; } };
  await assert.rejects(saveExpansionMaster({ ...saved, handle: fail }, { type: "delete", id: 1 }, noPicker), /保存失敗/);
  assert.deepEqual(stored, before);
  await assert.rejects(saveExpansionMaster({ ...plan, handle: undefined }, add, async () => { throw new DOMException("キャンセル", "AbortError"); }), { name: "AbortError" });
  assert.deepEqual((await readPlanContents(bytes)).expansions, initial);
  console.log("PASS: expansion defaults, CRUD, validation, persistence and failed/cancelled/conflicting saves");
}
