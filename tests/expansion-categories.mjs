import assert from "node:assert/strict";
export async function verifyExpansionCategories(api) {
  const original = await api.createTriadicDatabase(2026);
  const names = ["下払いUP", "ベースアップ", "設備投資", "燃料費UP", "電気料金UP", "その他"];
  const initial = await api.readPlanContents(original);
  assert.deepEqual(initial.expansionCategories.map(item => item.categoryName), names);
  assert.ok(initial.expansionCategories.every(item => item.expansionId === 1));
  assert.deepEqual(initial.expansions.find(item => item.id === 1).categoryIds, [1, 2, 3, 4, 5, 6]);
  assert.ok(initial.expansions.filter(item => item.id !== 1).every(item => item.categoryIds.length === 0));
  await assert.rejects(api.changeExpansionCategoryMaster(original, { type: "add", categoryName: "下払いUP", expansionId: 2 }), /同じ/);
  await assert.rejects(api.changeExpansionCategoryMaster(original, { type: "add", categoryName: " ", expansionId: 1 }), /展開区分名/);
  for (const expansionId of [undefined, null, 999, 1.5]) await assert.rejects(api.changeExpansionCategoryMaster(original, { type: "add", categoryName: "所属なし", expansionId }), /展開名/);
  await assert.rejects(api.changeExpansionMaster(original, { type: "delete", id: 1 }), /展開区分が所属/);
  let bytes = await api.changeExpansionCategoryMaster(original, { type: "update", id: 3, categoryName: "設備投資", expansionId: 2 });
  let plan = await api.readPlanContents(bytes);
  assert.deepEqual(plan.expansions.find(item => item.id === 1).categoryIds, [1, 2, 4, 5, 6]);
  assert.deepEqual(plan.expansions.find(item => item.id === 2).categoryIds, [3]);
  const draft = { name: "区分選択", note: "", expansionId: 1, expansionCategoryId: 1, industryId: 1, departmentId: 1, fiscalYear: "2026", rows: [{ accountId: plan.accounts[0].id, amounts: { 4: "123.456" } }] };
  await assert.rejects(api.registerInitiative(bytes, { ...draft, expansionId: 2 }), /展開区分/);
  bytes = await api.registerInitiative(bytes, draft);
  bytes = await api.registerInitiative(bytes, { ...draft, name: "任意未選択", expansionCategoryId: null });
  const saved = await api.readPlanContents(bytes);
  assert.equal(saved.initiatives[0].expansionCategoryId, 1);
  assert.equal(saved.initiatives[1].expansionCategoryId, null);
  const projected = api.initiativesForKind(saved.initiatives, saved.accounts, 1);
  assert.deepEqual(projected[0].months, projected[1].months, "区分で金額計算は変わらない");
  await assert.rejects(api.changeExpansionCategoryMaster(bytes, { type: "update", id: 1, categoryName: "移動失敗", expansionId: 2 }), /使用中/);
  await assert.rejects(api.changeExpansionCategoryMaster(bytes, { type: "delete", id: 1 }), /使用中/);
  const snapshot = await api.createBusinessSnapshot(bytes);
  bytes = await api.changeExpansionCategoryMaster(bytes, { type: "update", id: 1, categoryName: "改名後", expansionId: 1 });
  assert.equal((await api.readPlanContents(bytes)).expansionCategories[0].categoryName, "改名後");
  bytes = await api.applyOperationSnapshot(bytes, snapshot);
  assert.deepEqual(await api.readPlanContents(bytes), saved, "区分と所属と選択を一緒に復元");
  bytes = await api.changeExpansionCategoryMaster(bytes, { type: "delete", id: 3 });
  plan = await api.readPlanContents(bytes);
  assert.deepEqual(plan.expansions.find(item => item.id === 2).categoryIds, []);
  await api.validateTriadicDatabase(bytes);
  const db = await api.openTriadicDatabase(bytes);
  try {
    assert.throws(() => db.run("UPDATE initiatives SET expansion_id = 2 WHERE id = ?", [saved.initiatives[0].id]), /FOREIGN KEY/);
    assert.throws(() => db.run("INSERT INTO expansion_category_assignments VALUES (2, 1)"), /UNIQUE/, "データベースでも重複所属を禁止");
    db.run("INSERT INTO expansion_categories(name) VALUES ('所属のない不正区分')");
    await assert.rejects(api.validateTriadicDatabase(db.export()), /形式/, "所属なしを読込時にも拒否");
  } finally { db.close(); }
  assert.deepEqual((await api.readPlanContents(original)).expansionCategories, initial.expansionCategories, "失敗や変更で元bytesを変更しない");
  let empty = original;
  for (const category of initial.expansionCategories) empty = await api.changeExpansionCategoryMaster(empty, { type: "delete", id: category.id });
  assert.deepEqual((await api.readPlanContents(empty)).expansionCategories, [], "全件削除後の再読込で初期区分を復活させない");
  empty = await api.changeExpansionCategoryMaster(empty, { type: "add", categoryName: "追加区分", expansionId: 2 });
  assert.equal((await api.readPlanContents(empty)).expansionCategories[0].expansionId, 2);
  // A membership-only update must save, undo and redo even when the name is unchanged.
  let stored = original;
  const handle = { name: "区分所属.triadic", async getFile() { return new File([stored], this.name); }, async createWritable() { let pending; return { async write(value) { pending = new Uint8Array(value); }, async close() { stored = pending; }, async abort() {} }; } };
  const session = new api.PlanSession(); await session.open({ ...initial, bytes: original, name: handle.name, handle });
  await session.dispatch({ type: "expansion-category", change: { type: "update", id: 3, categoryName: "設備投資", expansionId: 2 } }, async () => handle);
  assert.equal((await api.readPlanContents(stored)).expansionCategories.find(item => item.id === 3).expansionId, 2);
  await session.travelOperation(-1, async () => handle);
  assert.equal((await api.readPlanContents(stored)).expansionCategories.find(item => item.id === 3).expansionId, 1);
  await session.travelOperation(1, async () => handle);
  assert.equal((await api.readPlanContents(stored)).expansionCategories.find(item => item.id === 3).expansionId, 2);
  const stale = { type: "expansion-category", change: { type: "update", id: 3, categoryName: "改名", expansionId: 1 } };
  const reconciled = api.reconcileWindowCommand(stale, api.windowCommandBase(stale, initial), await api.readPlanContents(stored));
  assert.equal(reconciled.change.expansionId, 2, "別画面の所属変更を古い改名入力で戻さない");
  // Opposite moves of the same unused category cannot create two memberships.
  const move = expansionId => api.changeExpansionCategoryMaster(original, { type: "update", id: 3, categoryName: "設備投資", expansionId });
  assert.equal(await api.rebasePlan(original, await move(2), await move(3)), null);
  console.log("PASS: 展開区分の登録時の必須単一所属、移動、他展開選択拒否、使用中保護、削除、改名、復元、共有保存と取消");
}
