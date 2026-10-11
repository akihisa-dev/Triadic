import assert from "node:assert/strict";

export async function verifyCommandComparison(api) {
  const base = await api.createSamplePlan(2026);
  const contents = await api.readPlanContents(base);
  const initiative = contents.initiatives[0];
  const draft = { ...initiative, fiscalYear: "2026" };
  const update = value => ({ type: "initiative.update", id: initiative.id, draft: value });
  const account = contents.accounts[0];
  const cases = [
    update(draft), update({ ...draft, name: ` ${draft.name} ` }), update({ ...draft, note: "比較の備考" }),
    update({ ...draft, rows: draft.rows.map((row,i) => i ? row : { ...row, amounts: { ...row.amounts, 4: "0.001" } }) }),
    update({ ...draft, rows: draft.rows.map((row,i) => i ? row : { ...row, overrides: { 2: { ...row.overrides?.[2], 5: "0" } } }) }),
    update({ ...draft, rows: draft.rows.map((row,i) => i ? row : { ...row, overrides: { 2: { ...row.overrides?.[2], 5: row.amounts[5] || "0" } } }) }),
    update({ ...draft, rows: draft.rows.map(row => ({ ...row, overrides: {} })) }),
    { type: "account", change: { type: "update", ...account } },
    { type: "account", change: { type: "update", ...account, accountName: "比較の科目" } },
    { type: "account", change: { type: "reorder", ids: contents.accounts.map(row => row.id) } },
    { type: "account", change: { type: "reorder", ids: contents.accounts.map(row => row.id).reverse() } },
    { type: "department", change: { type: "update", ...contents.departments[0] } },
    { type: "department", change: { type: "update", ...contents.departments[0], departmentName: "比較の部署" } },
    { type: "expansion", change: { type: "update", ...contents.expansions[0], expansionName: "比較の展開" } },
    { type: "industry", change: { type: "update", ...contents.industries[0], industryName: "比較の業種" } },
    { type: "period", change: { type: "update", ...contents.periodTypes[0], periodName: "比較の期間" } },
    { type: "settings", change: { type: "previous", input: { industryId: 1, departmentId: 1, rows: [{ accountId: account.id, amounts: { 4: "0.001" } }] } } },
  ];
  const meaningful = value => JSON.stringify(value, (key,value) => ["details","revision","initiativeRevision","rowRevision","amountRevisions","overrideRevisions"].includes(key) ? undefined : value);
  for (const command of cases) {
    const legacy = await api.applyPlanCommand(base, command, 2026);
    const changed = meaningful(contents) !== meaningful(await api.readPlanContents(legacy));
    const prepared = await api.processingTasks.prepareOrdinarySave(base, command, 2026);
    assert.equal(prepared.operation !== null, changed, `${command.type}: 従来の意味上の比較と一致`);
    if (!changed) assert.equal(prepared.bytes, base, "同値は更新日時・改訂番号を含め元bytesそのものを返す");
    else {
      assert.equal(meaningful(await api.readPlanContents(prepared.bytes)), meaningful(await api.readPlanContents(legacy)));
      assert.deepEqual(await api.readSnapshotContents(prepared.operation.before), contents);
      assert.deepEqual(await api.readSnapshotContents(prepared.operation.after), await api.readPlanContents(prepared.bytes));
    }
  }
  const invalid = update({ ...draft, rows: [{ ...draft.rows[0], amounts: { 4: "不正" } }] });
  await assert.rejects(api.processingTasks.prepareOrdinarySave(base, invalid, 2026), /数値|金額/);
  assert.deepEqual(await api.readPlanContents(base), contents, "失敗後も元の全業務内容を保持");
  const read = api.processingTasks.readPlanContents;
  api.processingTasks.readPlanContents = async () => { throw new Error("変更判定のための全体復元は禁止"); };
  try {
    for (const command of [update(draft), update({ ...draft, note: "全体復元なし" })]) {
      await api.preparePlanCommand({ ...contents, bytes: base, name: "比較.triadic", handle: null }, command);
    }
  } finally { api.processingTasks.readPlanContents = read; }
  console.log("PASS: 対象行比較と従来の全体比較の一致、同値・正規化・明示0・同額手修正・継承復帰・順序・分類・円精度・失敗保護");
}
