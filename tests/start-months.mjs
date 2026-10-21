import { readDerivedPlan } from "./derived-plan.mjs";
import assert from "node:assert/strict";

export async function verifyStartMonths(api) {
  await verifyUnselectedPeriod(api);
  const derive = (rule, amounts, kind = 1, overrides) => api.deriveStartYearMonth(2026, rule, [{ amounts, overrides }], kind);
  assert.equal(derive("new", { 4: "0.001" }), "2026-04");
  assert.equal(derive("new", { 1: "-1" }), "2027-01");
  assert.equal(derive("new", { 7: "10", 12: "20" }), "2026-07");
  assert.equal(derive("new", {}), null);
  assert.equal(derive(null, { 4: "10" }), null);
  const gap = Object.fromEntries([4, 5, 6, 7, 8, 9].map(month => [month, "-0.001"]));
  assert.equal(derive("period_gap", gap), "2025-10");
  assert.equal(derive("period_gap", { ...gap, 10: "1", 11: "1", 12: "1" }), "2026-01");
  assert.equal(derive("period_gap", { 4: "1" }), "2025-05");
  assert.equal(derive("period_gap", {}), null);
  assert.equal(derive("period_gap", { 5: "1" }), null);
  assert.equal(derive("period_gap", { 4: "1", 6: "1" }), "2025-07", "途中の0の月も継続として扱う");
  assert.equal(derive("period_gap", { ...gap, 6: "0" }), "2025-10", "途中の欠落で境目を前へ動かさない");
  assert.equal(derive("period_gap", Object.fromEntries(api.initiativeMonths.map(month => [month, "1"]))), null, "全12か月の期間差には境目がない");
  assert.equal(api.deriveStartYearMonth(1, "period_gap", [{ amounts: { 4: "1" } }], 1), null, "暦年0を保存しない");
  assert.equal(api.deriveStartYearMonth(2026, "new", [{ amounts: { 7: "1" } }, { amounts: { 7: "-1" } }], 1), "2026-07", "相殺前の各行で判定する");
  assert.equal(derive("new", { 7: "1", 8: "1" }, 2, { 2: { 7: "0" } }), "2026-08");

  let bytes = await api.createTriadicDatabase(2026);
  const initial = await readDerivedPlan(api, bytes);
  const accountId = initial.accounts[0].id;
  const draft = { ...api.createInitiativeDraft("2026"), name: "開始年月確認", expansionId: initial.expansions[0].id,
    industryId: initial.industries[0].id, departmentId: initial.departments[0].id,
    periodTypeId: initial.periodTypes.find(item => item.periodName === "新規").id,
    rows: [{ accountId, amounts: { 7: "1", 8: "1" }, overrides: { 2: { 7: "0" } } }] };
  bytes = await api.registerInitiative(bytes, draft);
  let contents = await readDerivedPlan(api, bytes);
  const item = contents.initiatives[0];
  assert.deepEqual(item.startYearMonths, { 1: "2026-07", 2: "2026-08" });
  assert.ok(contents.details.filter(detail => detail.kindId === 1).every(detail => detail.startYearMonth === "2026-07"));
  assert.ok(contents.details.filter(detail => detail.kindId === 2).every(detail => detail.startYearMonth === "2026-08"));
  const db = await api.openTriadicDatabase(bytes);
  try {
    const columns = db.exec("PRAGMA table_info(initiatives)")[0].values.map(row => row[1]);
    assert.ok(!columns.includes("primary_start_year_month") && !columns.includes("confirmed_start_year_month"), "派生値の保存列を持たない");
    const revision = db.exec("SELECT revision FROM initiatives")[0].values[0][0];
    assert.deepEqual((await readDerivedPlan(api, bytes)).initiatives[0].startYearMonths, item.startYearMonths);
    assert.equal(db.exec("SELECT revision FROM initiatives")[0].values[0][0], revision, "読み込み時の導出は保存値を更新しない");
  } finally { db.close(); }
  const snapshot = await api.createBusinessSnapshot(bytes);
  assert.deepEqual((await api.readSnapshotContents(snapshot)).initiatives[0].startYearMonths, item.startYearMonths);

  const update = async (source, transform) => {
    const current=(await api.readPlanContents(source)).initiatives[0];
    return api.applyPlanCommand(source,{type:'initiative.update',id:current.id,draft:{...transform(current),fiscalYear:'2026'}},2026);
  };
  // Current initiative edits refresh both derived budget start dates.
  const amountBase=bytes;
  bytes = await update(bytes,current=>({...current,rows:current.rows.map(row=>({...row,amounts:{...row.amounts,4:"2"}}))}));
  contents = await readDerivedPlan(api, bytes);
  assert.deepEqual(contents.initiatives[0].startYearMonths, { 1: "2026-04", 2: "2026-04" }, "一次の追加月は未修正の確定にも反映");
  assert.equal(contents.initiatives[0].revision, item.revision+1, "現行の施策更新は一回だけ更新番号を進める");
  const overlapping=await update(amountBase,current=>({...current,rows:current.rows.map(row=>({...row,amounts:{...row.amounts,4:'3'}}))}));
  assert.equal(await api.rebasePlan(amountBase,bytes,overlapping),null,'同じ月への外部変更を拒否');
  bytes = await update(bytes,current=>({...current,rows:current.rows.map(row=>({...row,overrides:{2:{...row.overrides[2],4:"0"}}}))}));
  contents = await readDerivedPlan(api, bytes);
  assert.deepEqual(contents.initiatives[0].startYearMonths, { 1: "2026-04", 2: "2026-08" }, "確定の手修正0は一次の開始月を消さない");
  const restored = await api.applyOperationSnapshot(bytes, snapshot);
  assert.deepEqual((await readDerivedPlan(api, restored)).initiatives[0].startYearMonths, item.startYearMonths, "取り消しは2種の年月も復元");
  const cancellationDraft = { ...draft, name: "相殺する活動月", rows: [
    { accountId, amounts: { 7: "1" } }, { accountId, amounts: { 7: "-1" } },
  ] };
  const cancellation = await api.registerInitiative(restored, cancellationDraft);
  const cancelling = (await readDerivedPlan(api, cancellation)).initiatives.find(value => value.name === cancellationDraft.name);
  assert.deepEqual(cancelling.startYearMonths, { 1: "2026-07", 2: "2026-07" }, "保存・再読込でも相殺前の行で導出する");
  const zeroed = await api.updateInitiative(cancellation, cancelling.id, 2026, { ...cancellationDraft,
    rows: cancelling.rows.map(row => ({ ...row, amounts: {}, overrides: {} })),
  });
  assert.deepEqual((await readDerivedPlan(api, zeroed)).initiatives.find(value => value.id === cancelling.id).startYearMonths, { 1: null, 2: null }, "全行0化後には未確定になる");

  // Renaming a period never changes the original rule, and reused numeric IDs are not rules.
  bytes = await api.changePeriodMaster(bytes, { type: "update", id: draft.periodTypeId, periodName: "新規改名" });
  assert.deepEqual((await readDerivedPlan(api, bytes)).initiatives[0].startYearMonths, { 1: "2026-04", 2: "2026-08" });
  const gapId = initial.periodTypes.find(item => item.periodName === "期間差").id;
  bytes = await update(bytes,current=>({...current,periodTypeId:gapId}));
  assert.deepEqual((await readDerivedPlan(api, bytes)).initiatives[0].startYearMonths, { 1: "2025-09", 2: null }, "一次の途中の0も継続として扱う");
  contents = await readDerivedPlan(api, bytes);
  const current = contents.initiatives[0];
  bytes = await api.updateInitiative(bytes, current.id, 2026, { ...draft, periodTypeId: gapId,
    rows: [{ ...current.rows[0], amounts: gap, overrides: { 2: { 10: "1" } } }] });
  contents = await readDerivedPlan(api, bytes);
  assert.deepEqual(contents.initiatives[0].startYearMonths, { 1: "2025-10", 2: "2025-11" });
  assert.ok(contents.details.filter(detail => detail.kindId === 2).every(detail => detail.startYearMonth === "2025-11"));

  const other = await api.changePeriodMaster(bytes, { type: "add", periodName: "独自分類" });
  const otherContents = await readDerivedPlan(api, other);
  bytes = await update(other,current=>({...current,periodTypeId:otherContents.periodTypes.at(-1).id}));
  assert.deepEqual((await readDerivedPlan(api, bytes)).initiatives[0].startYearMonths, { 1: null, 2: null });
  bytes = await update(bytes,current=>({...current,periodTypeId:null}));
  assert.deepEqual((await readDerivedPlan(api, bytes)).initiatives[0].startYearMonths, { 1: null, 2: null });
  for (const period of (await readDerivedPlan(api, bytes)).periodTypes) bytes = await api.changePeriodMaster(bytes, { type: "delete", id: period.id });
  bytes = await api.changePeriodMaster(bytes, { type: "add", periodName: "別の期間" });
  contents = await readDerivedPlan(api, bytes);
  assert.equal(contents.periodTypes[0].id, 1);
  bytes = await update(bytes,current=>({...current,periodTypeId:1}));
  assert.deepEqual((await readDerivedPlan(api, bytes)).initiatives[0].startYearMonths, { 1: null, 2: null }, "再利用IDを期間差と誤認しない");

  const previous = await api.savePreviousAmounts(restored, { previousKind: 1, industryId: draft.industryId, departmentId: draft.departmentId, rows: [{ accountId, amounts: { 4: "1" } }] });
  assert.ok((await readDerivedPlan(api, previous)).details.filter(detail => detail.kindId === 0).every(detail => detail.startYearMonth === null));
  const plan = { ...await readDerivedPlan(api, restored), bytes: restored, name: "開始年月.triadic", handle: {
    name: "開始年月.triadic", async getFile() { return new File([restored], this.name); }, async createWritable() {
      return { async write() { throw new Error("保存失敗"); }, async close() {}, async abort() {} };
    },
  } };
  const session=new api.PlanSession();await session.open(plan);const saved=session.getSnapshot();
  await assert.rejects(session.dispatch({type:'initiative.update',id:item.id,draft:{...draft,rows:item.rows.map(row=>({...row,amounts:{...row.amounts,4:'3'}}))}},async()=>plan.handle),/保存失敗/);
  assert.deepEqual(session.getSnapshot(),saved);
  assert.deepEqual(plan.initiatives[0].startYearMonths, item.startYearMonths, "保存失敗で元の開始年月を維持");
  console.log("PASS: 開始年月の読込時導出、期間差、手修正0、相殺、未確定、明細更新、改名、復元、保存失敗");
}

async function verifyUnselectedPeriod(api) {
  const original = await api.createTriadicDatabase(2026);
  const initial = await readDerivedPlan(api, original);
  let bytes = await api.registerInitiative(original, { ...api.createInitiativeDraft("2026"), name: "NULLとID0の区別",
    expansionId: initial.expansions[0].id, industryId: initial.industries[0].id, departmentId: initial.departments[0].id,
    periodTypeId: null, rows: [{ accountId: initial.accounts[0].id, amounts: { 4: "100", 5: "100" }, overrides: { 2: { 4: "0" } } }] });
  const db = await api.openTriadicDatabase(bytes);
  try {
    db.run("INSERT INTO period_types (id, name, start_month_rule) VALUES (0, 'ID0合成分類', 'new')");
    for (const rule of ["new", "period_gap"]) {
      db.run("UPDATE period_types SET start_month_rule = ? WHERE id = 0", [rule]);
      for (const [periodId, expected] of [
        [null, { 1: null, 2: null }],
        [0, rule === "new" ? { 1: "2026-04", 2: "2026-05" } : { 1: "2025-06", 2: null }],
        [initial.periodTypes.find(item => item.periodName === "新規").id, { 1: "2026-04", 2: "2026-05" }],
      ]) {
        db.run("UPDATE initiatives SET period_type_id = ?", [periodId]);
        bytes = api.exportTriadicDatabase(db);
        const before = bytes.slice();
        const contents = await readDerivedPlan(api, bytes);
        assert.equal(contents.initiatives[0].periodTypeId, periodId);
        assert.deepEqual(contents.initiatives[0].startYearMonths, expected, `${rule}: 未選択をID 0に変換しない`);
        for (const kind of [1, 2]) assert.ok(contents.details.filter(item => item.kindId === kind).every(item => item.startYearMonth === expected[kind]));
        const snapshot = await api.createBusinessSnapshot(bytes);
        assert.deepEqual((await api.readSnapshotContents(snapshot)).initiatives[0].startYearMonths, expected);
        assert.deepEqual(bytes, before, "読込・履歴読込で元bytesを変更しない");
      }
    }
  } finally { db.close(); }
}
