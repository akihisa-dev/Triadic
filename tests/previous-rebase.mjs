import assert from 'node:assert/strict';
export async function verifyPreviousRebase(api) {
  const empty = await api.createTriadicDatabase(2026);
  const contents = await api.readPlanContents(empty);
  const accountId = contents.accounts[0].id;
  const cell = (month, value, rest={}) => ({previousKind:1,industryId:1,departmentId:1,rows:[{accountId,amounts:{[month]:value}}],...rest});
  const rows = async bytes => {
    const db=await api.openTriadicDatabase(bytes);
    try { return db.exec('SELECT * FROM previous_amounts ORDER BY account_id,industry_id,department_id,month')[0]?.values ?? []; }
    finally {db.close();}
  };
  const business = async bytes => (await rows(bytes)).map(row=>row.slice(1));
  for(const base of [empty,await api.savePreviousAmounts(empty,cell(6,'-0.001'))]) {
    for(const [leftInput,rightInput] of [
      [cell(4,'1.001'),cell(5,'-2.001')],
      [cell(4,'9007199254740.991'),cell(4,'-9007199254740.991',{rows:[{accountId:contents.accounts[1].id,amounts:{4:'-9007199254740.991'}}]})],
      [cell(4,'1.001'),cell(4,'2.001',{industryId:2})],
      [cell(4,'1.001'),cell(4,'2.001',{departmentId:2})],
    ]) {
      const left=await api.savePreviousAmounts(base,leftInput),right=await api.savePreviousAmounts(base,rightInput);
      for(const [local,external] of [[left,right],[right,left]]) {
        const original=[base,local,external].map(b=>b.slice());
        const merged=await api.rebasePlan(base,local,external);assert.ok(merged?.operation);
        const actual=await rows(merged.bytes);
        assert.equal(new Set(actual.map(row=>row[0])).size,actual.length);
        assert.deepEqual(new Set(actual.map(row=>JSON.stringify(row.slice(1)))),new Set([...(await business(local)),...(await business(external))].map(row=>JSON.stringify(row))));
        const undone=await api.applyOperationSnapshot(merged.bytes,merged.operation.before);
        assert.deepEqual(await business(undone),await business(external),'外部側を残して今回だけ取消');
        assert.deepEqual(await business(await api.applyOperationSnapshot(undone,merged.operation.after)),await business(merged.bytes));
        const recorded=await api.recordDataHistory(merged.bytes,new Date().toISOString(),true);
        const history=await api.readDataHistory(recorded);
        assert.ok(history.entries.length>=2);
        const restored=await api.restoreDataHistory(recorded,history.entries[0].id);
        assert.deepEqual(await business(restored),await business(merged.bytes));
        [base,local,external].forEach((b,i)=>assert.deepEqual(b,original[i]));
      }
    }
  }
  const left=await api.savePreviousAmounts(empty,cell(4,'1.001'));
  const right=await api.savePreviousAmounts(empty,cell(5,'-2.001'));
  assert.equal(await api.rebasePlan(empty,left,await api.savePreviousAmounts(empty,cell(4,'2.001'))),null);
  assert.equal((await api.rebasePlan(empty,left,left)).operation,null);
  const unassigned=await api.changeAggregationMaster(empty,{type:'move',member:{kind:'account',id:accountId},parentId:null,sign:1});
  const removed=await api.changeAccountMaster(unassigned,{type:'delete',id:accountId});
  assert.equal(await api.rebasePlan(empty,left,removed),null,'マスタ削除との参照不整合を拒否');
  const moved=await api.changeDepartmentMaster(empty,{type:'update',...contents.departments[0],industryIds:[2]});
  assert.equal(await api.rebasePlan(empty,left,moved),null,'所属解除の外部変更を拒否');
  let stored=right,fail=false,writes=0;
  const handle={name:'前年統合.triadic',async getFile(){return new File([stored],this.name);},async createWritable(){let pending;return {async write(b){writes++;pending=new Uint8Array(b).slice();},async close(){if(fail)throw Error('確定失敗');stored=pending;},async abort(){}};}};
  const session=new api.PlanSession();
  await session.open({...contents,bytes:empty,name:handle.name,handle});
  fail=true;
  await assert.rejects(session.dispatch({type:'settings',change:{type:'previous',input:cell(4,'1.001')}},async()=>{throw Error('保存先を聞かない');}),/確定失敗/);
  assert.deepEqual(stored,right);assert.deepEqual(session.getSnapshot().contents,contents);
  fail=false;
  await session.dispatch({type:'settings',change:{type:'previous',input:cell(4,'1.001')}},async()=>{throw Error('保存先を聞かない');});
  assert.equal((await rows(stored)).length,2);assert.ok(writes>=2);
  await session.travelOperation(-1,async()=>handle);
  assert.deepEqual(await business(stored),await business(right));
  await session.travelOperation(1,async()=>handle);assert.equal((await rows(stored)).length,2);
  const largeDb = await api.openTriadicDatabase(empty);
  let bulkBase, bulkLocal, bulkExternal;
  try {
    largeDb.exec(`WITH RECURSIVE m(month) AS (VALUES(1) UNION ALL SELECT month+1 FROM m WHERE month<12), k(kind) AS (VALUES(1),(2))
      INSERT INTO previous_amounts(previous_kind,account_id,industry_id,department_id,month,amount_yen)
      SELECT k.kind,accounts.id,1,1,m.month,1000 FROM accounts CROSS JOIN m CROSS JOIN k;`);
    bulkBase = api.exportTriadicDatabase(largeDb);
    largeDb.run("UPDATE previous_amounts SET amount_yen=1001 WHERE id=(SELECT MIN(id) FROM previous_amounts)");
    bulkLocal = api.exportTriadicDatabase(largeDb);
    largeDb.run("UPDATE previous_amounts SET amount_yen=1000 WHERE id=(SELECT MIN(id) FROM previous_amounts)");
    largeDb.run("UPDATE previous_amounts SET amount_yen=1002 WHERE id=(SELECT MAX(id) FROM previous_amounts)");
    bulkExternal = api.exportTriadicDatabase(largeDb);
  } finally { largeDb.close(); }
  const sqlite = await api.initializeSqlite(), run = sqlite.Database.prototype.run, exec = sqlite.Database.prototype.exec;
  let inserted = 0, deleted = 0, unchangedReads = 0;
  sqlite.Database.prototype.run = function(sql, params) {
    if (sql.startsWith("INSERT INTO previous_amounts VALUES")) inserted++;
    if (sql.startsWith("DELETE FROM previous_amounts")) deleted++;
    return run.call(this, sql, params);
  };
  sqlite.Database.prototype.exec = function(sql, params) {
    if (sql === "SELECT * FROM initiative_amounts") unchangedReads++;
    return exec.call(this, sql, params);
  };
  let bulkMerged;
  try { bulkMerged = await api.rebasePlan(bulkBase, bulkLocal, bulkExternal); }
  finally { sqlite.Database.prototype.run = run; sqlite.Database.prototype.exec = exec; }
  assert.ok(bulkMerged?.operation);
  assert.equal(inserted, 1, "独立した1セルだけを書き込み、前年全行を再投入しない");
  assert.equal(deleted, 1, "変更する行だけを置換する");
  assert.equal(unchangedReads, 0, "未変更の金額表の全行をJSへ読み出さない");
  const bulkContents = await api.readPlanContents(bulkMerged.bytes);
  assert.equal(bulkContents.previousAmounts.filter(row => row.amount === "1.001").length, 1);
  assert.equal(bulkContents.previousAmounts.filter(row => row.amount === "1.002").length, 1);
  const bulkUndo = await api.applyOperationSnapshot(bulkMerged.bytes, bulkMerged.operation.before);
  assert.deepEqual((await api.readPlanContents(bulkUndo)).previousAmounts, (await api.readPlanContents(bulkExternal)).previousAmounts);
  console.log('PASS: 前年金額の独立追加・業務キー・ID一意性・精度・重複と相反変更・参照検証・実保存境界の失敗再試行・取消履歴');
}
