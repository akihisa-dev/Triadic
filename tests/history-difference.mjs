import assert from "node:assert/strict";

export async function verifyHistoryDifference(api) {
  const compare = async (bytes, id) => (await api.compareSavedHistory(bytes, id)).differences;
  const initial = await api.createTriadicDatabase(2026);
  const plan = await api.readPlanContents(initial);
  const account = plan.accounts.find(item => item.accountType === "sales");
  const base = await api.registerInitiative(initial, { ...api.createInitiativeDraft("2026"), name: "比較する施策", note: "元の備考",
    expansionId: 1, departmentId: 1, industryId: 1, periodTypeId: 2,
    rows: [{ id: "comparison-row", accountId: account.id, amounts: { 4: "0.001", 5: "1" } }] });
  const change = async (bytes, edit) => {
    const db = await api.openTriadicDatabase(bytes);
    try { edit(db); return await api.exportTriadicDatabase(db); } finally { db.close(); }
  };
  const history = async after => {
    const bytes = await api.trackHistoryChange(base, after, "2026-05-01T00:00:00.000Z");
    const id = (await api.readDataHistory(bytes)).entries[0].id;
    return { bytes, id };
  };
  const noBusinessChange = await change(base, db => {
    db.run("UPDATE initiatives SET revision=revision+1"); db.run("UPDATE initiative_rows SET revision=revision+1");
    db.run("UPDATE initiative_amounts SET revision=revision+1"); db.run("UPDATE document_info SET updated_at='2026-05-01T00:00:00.000Z'");
  });
  let current = await history(noBusinessChange);
  assert.deepEqual(await compare(current.bytes, current.id), [], "更新日時と改訂番号だけでは差分にしない");
  const after = await change(base, db => {
    db.run("UPDATE initiatives SET name='変更後',note='<img src=x> & sales',department_id=2");
    db.run("UPDATE departments SET name='sales' WHERE id=2");
    db.run("UPDATE accounts SET display_name='確認用表示名' WHERE id=?", [account.id]);
    db.run("UPDATE initiative_amounts SET amount_yen=2 WHERE row_id='comparison-row' AND kind_id=1 AND month=4");
    db.run("INSERT INTO initiative_amounts(row_id,kind_id,month,amount_yen) VALUES ('comparison-row',2,4,0),('comparison-row',2,5,1000)");
    db.run("INSERT INTO previous_amounts(account_id,industry_id,department_id,month,amount_yen) VALUES (?,1,1,4,1)", [account.id]);
    db.run("INSERT INTO previous_amounts(account_id,industry_id,department_id,month,amount_yen) VALUES (?,1,1,5,0)", [account.id]);
    db.run("UPDATE aggregation_members SET sign=-sign WHERE account_id=?", [account.id]);
    db.run("UPDATE master_order SET position=position+1000 WHERE position<2");
    db.run("UPDATE master_order SET position=CASE position WHEN 1000 THEN 1 ELSE 0 END WHERE position>=1000");
    db.run("UPDATE kind_selections SET first_kind=2 WHERE screen='cost-table'");
  });
  current = await history(after);
  const original = current.bytes.slice();
  const differences = await compare(current.bytes, current.id);
  const has = (section, field, before, after) => assert.ok(differences.some(item => item.section === section && item.field === field && item.before === before && item.after === after), JSON.stringify({ section, field, before, after }));
  has("施策", "名称", "比較する施策", "変更後");
  has("施策", "備考", "元の備考", "<img src=x> & sales");
  has("施策", "部署", "部署A", "sales");
  has("部署マスタ", "名称", "部署B", "sales");
  has("施策の月別金額", "一次予算・4月", "0.001", "0.002");
  has("施策の月別金額", "確定予算・4月", "0.001（引き継ぎ）", "0（手修正）");
  has("施策の月別金額", "確定予算・5月", "1（引き継ぎ）", "1（手修正）");
  has("前年見込", "4月", "0", "0.001");
  assert.equal(differences.filter(item => item.section === "前年見込").length, 1, "未入力と保存済み0は同じ値");
  assert.ok(differences.some(item => item.section === "集計の所属" && item.field === "集計の加減"));
  assert.equal(differences.filter(item => item.section === "科目・集計の表示順").length, 2);
  has("表示設定", "比較対象1", "一次予算", "確定予算");
  assert.deepEqual(current.bytes, original, "比較はファイルの元bytesを書き換えない");
  const recreated = await change(base, db => db.run("UPDATE initiatives SET identity=?", ["f".repeat(32)]));
  const replacement = await history(recreated);
  const replacements = await compare(replacement.bytes, replacement.id);
  assert.deepEqual(replacements.filter(item => item.section === "施策").map(item => item.change), ["削除", "追加"], "同じ番号・名称の再作成を改名と混同しない");
  const removed = await change(base, db => { db.run("DELETE FROM initiative_amounts"); db.run("DELETE FROM initiative_rows"); db.run("DELETE FROM initiatives"); });
  const deletion = await history(removed);
  assert.ok((await compare(deletion.bytes, deletion.id)).some(item => item.section === "施策" && item.change === "削除"));
  await assert.rejects(api.compareSavedHistory(current.bytes, 999999), /見つかりません/);
  await assert.rejects(api.compareSavedHistory(current.bytes, 0), /識別子/);
  await assert.rejects(api.compareSavedHistory(new Uint8Array([1, 2, 3]), 1));
  const otherYear = await api.createBusinessSnapshot(await api.createTriadicDatabase(2025));
  const mismatched = await change(current.bytes, db => db.run("UPDATE data_history SET snapshot=? WHERE id=?", [otherYear, current.id]));
  await api.validateTriadicDatabase(mismatched); // Per-snapshot business validation remains deferred until selection.
  const mismatchedCopy = mismatched.slice();
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(api.compareSavedHistory(mismatched, current.id), /履歴の基準年度が一致しません/);
    await assert.rejects(api.readHistorySnapshot(mismatched, current.id), /履歴の基準年度が一致しません/);
  }
  const mismatchSession = new api.PlanSession();
  const noFile = async () => { throw new Error("比較時は実ファイル・許可・保存先を求めない"); };
  await mismatchSession.open({bytes:mismatched, name:"異年度.triadic", handle:{name:"異年度.triadic",getFile:noFile,createWritable:noFile,queryPermission:noFile}});
  const mismatchBefore = mismatchSession.getSnapshot();
  for (let attempt=0;attempt<2;attempt++) {
    await assert.rejects(mismatchSession.compareHistory(current.id), /履歴の基準年度が一致しません/);
    assert.equal(mismatchSession.getSnapshot().contents,mismatchBefore.contents);
    assert.equal(mismatchSession.getSnapshot().history,mismatchBefore.history);
    assert.equal(mismatchSession.getSnapshot().operationRevision,mismatchBefore.operationRevision);
    assert.equal(mismatchSession.getSnapshot().canUndo,mismatchBefore.canUndo);
    assert.equal(mismatchSession.getSnapshot().busy,false);
  }
  assert.deepEqual(mismatched,mismatchedCopy,"異年度比較の拒否と再試行で保存内容を変えない");
  const session = new api.PlanSession();
  const handle = { name: "比較.triadic", getFile: async () => { throw new Error("実ファイルを読まない"); }, createWritable: async () => { throw new Error("比較で書かない"); } };
  await session.open({ name: handle.name, handle, bytes: current.bytes });
  let savedNotifications = 0; session.subscribeFileSave(async () => { savedNotifications++; });
  const before = session.getSnapshot();
  assert.deepEqual((await session.compareHistory(current.id)).differences, differences);
  await assert.rejects(session.compareHistory(999999), /見つかりません/);
  assert.equal(session.getSnapshot().contents, before.contents);
  assert.equal(session.getSnapshot().history, before.history);
  assert.equal(session.getSnapshot().operationRevision, before.operationRevision);
  assert.equal(session.getSnapshot().busy, false);
  assert.equal(savedNotifications, 0);
  console.log("履歴差分: 名称・備考・分類・マスタ・所属符号・表示順・前年・1円・継承/手修正0/同額手修正・削除追加・再作成・無変更・失敗と参照専用を確認しました。");
}
