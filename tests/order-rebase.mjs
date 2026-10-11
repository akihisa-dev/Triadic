import assert from 'node:assert/strict';
export async function verifyOrderRebase(api) {
  const initial=await api.createTriadicDatabase(2026),contents=await api.readPlanContents(initial);
  const accounts=contents.accounts.slice(0,5);
  const row=(id,index,value='0')=>({id,accountId:accounts[index].id,amounts:{4:value}});
  const base=await api.registerInitiative(initial,{name:'順序確認',note:'',fiscalYear:'2026',expansionId:1,industryId:1,departmentId:1,rows:[row('r0',0),row('r1',1),row('r2',2)]});
  const initiative=(await api.readPlanContents(base)).initiatives[0];
  const update=items=>api.updateInitiative(base,initiative.id,2026,{...initiative,fiscalYear:'2026',rows:items});
  const left=await update([...initiative.rows,row('z-first',3,'1.001')]);
  const right=await update([...initiative.rows,row('a-second',4,'-2.001')]);
  const ids=async bytes=>(await api.readPlanContents(bytes)).initiatives[0].rows.map(r=>r.id);
  const positions=async(bytes,table,parent,position)=>{
    const db=await api.openTriadicDatabase(bytes);
    try { assert.equal(db.exec(`SELECT ${parent},${position} FROM ${table} GROUP BY ${parent},${position} HAVING COUNT(*)>1`).length,0);return db.exec(`SELECT ${position} FROM ${table} ORDER BY ${position}`)[0]?.values.flat()??[]; }
    finally {db.close();}
  };
  for(const [local,external,expected] of [[right,left,['r0','r1','r2','z-first','a-second']],[left,right,['r0','r1','r2','a-second','z-first']]]) {
    const merged=await api.rebasePlan(base,local,external);assert.ok(merged?.operation);
    assert.deepEqual(await ids(merged.bytes),expected,'先行順・既存順と今回側の追加順');
    assert.deepEqual(await positions(merged.bytes,'initiative_rows','initiative_id','sort_order'),[0,1,2,3,4]);
    const plan=await api.readPlanContents(merged.bytes);
    assert.equal(plan.initiatives[0].rows.find(r=>r.id==='z-first').amounts[4],'1.001');
    assert.equal(plan.initiatives[0].rows.find(r=>r.id==='a-second').amounts[4],'-2.001');
    const undone=await api.applyOperationSnapshot(merged.bytes,merged.operation.before);
    assert.deepEqual(await ids(undone),await ids(external));
    assert.deepEqual(await ids(await api.applyOperationSnapshot(undone,merged.operation.after)),expected);
    const recorded=await api.recordDataHistory(merged.bytes,new Date().toISOString(),true),history=await api.readDataHistory(recorded);
    assert.deepEqual(await ids(await api.restoreDataHistory(recorded,history.entries[0].id)),expected);
  }
  const reversed=await update([...initiative.rows].reverse());
  for(const [local,external] of [[reversed,left],[left,reversed]]) {
    assert.deepEqual(await ids((await api.rebasePlan(base,local,external)).bytes),['r2','r1','r0','z-first']);
  }
  const otherOrder=await update([initiative.rows[1],initiative.rows[0],initiative.rows[2]]);
  assert.equal(await api.rebasePlan(base,reversed,otherOrder),null,'相反する並べ替えを拒否');
  const change=await update(initiative.rows.map((r,i)=>i===0?{...r,amounts:{4:'1'}}:r));
  const deleted=await update(initiative.rows.slice(1));
  assert.equal(await api.rebasePlan(base,change,deleted),null,'同じ行の変更と削除を拒否');
  const db=await api.openTriadicDatabase(initial);let membershipBase;
  try {db.run('DELETE FROM aggregation_members');db.run('INSERT INTO aggregation_members(parent_id,account_id,sign,position) VALUES (1,?,1,7)',[accounts[0].id]);membershipBase=api.exportTriadicDatabase(db);}finally{db.close();}
  const move=(kind,id,sign=1)=>({type:'move',member:{kind,id},parentId:1,sign});
  for(const [a,b] of [[move('account',accounts[1].id),move('account',accounts[2].id,-1)],[move('account',accounts[1].id),move('group',2,-1)]]) {
    const aBytes=await api.changeAggregationMaster(membershipBase,a),bBytes=await api.changeAggregationMaster(membershipBase,b);
    for(const [local,external,first,second] of [[bBytes,aBytes,a,b],[aBytes,bBytes,b,a]]) {
      const merged=await api.rebasePlan(membershipBase,local,external);assert.ok(merged?.operation);
      assert.deepEqual(await positions(merged.bytes,'aggregation_members','parent_id','position'),[7,8,9],'合法な欠番を保持');
      const groups=(await api.readPlanContents(merged.bytes)).aggregations;
      assert.deepEqual(groups.find(g=>g.id===1).members,[{kind:'account',id:accounts[0].id,sign:1},{...first.member,sign:first.sign},{...second.member,sign:second.sign}]);
      assert.deepEqual((await api.readPlanContents(await api.applyOperationSnapshot(merged.bytes,merged.operation.before))).aggregations,(await api.readPlanContents(external)).aggregations);
    }
  }
  const near=await api.openTriadicDatabase(membershipBase);let maximum;
  try {near.run('UPDATE aggregation_members SET position = ?',[Number.MAX_SAFE_INTEGER-1]);maximum=api.exportTriadicDatabase(near);}finally{near.close();}
  const upperA=await api.changeAggregationMaster(maximum,move('account',accounts[1].id));
  const upperB=await api.changeAggregationMaster(maximum,move('account',accounts[2].id));
  assert.equal(await api.rebasePlan(maximum,upperB,upperA),null,'末尾位置の整数上限で安全に拒否');
  let stored=left,fail=true;
  const handle={name:'行順統合.triadic',async getFile(){return new File([stored],this.name);},async createWritable(){let pending;return {async write(b){pending=new Uint8Array(b);},async close(){if(fail)throw Error('書込確定失敗');stored=pending;},async abort(){}};}};
  const plan={...await api.readPlanContents(base),bytes:base,name:handle.name,handle};
  await assert.rejects(api.writePlanChange(plan,handle,right,{allowRebase:true}),/書込確定失敗/);assert.deepEqual(stored,left);
  fail=false;const saved=await api.writePlanChange(plan,handle,right,{allowRebase:true});assert.ok(saved.rebasedOperation);
  assert.deepEqual(await ids(stored),['r0','r1','r2','z-first','a-second']);
  console.log('PASS: 同時追加の両保存順・UUIDと月額保持・既存順・単独並べ替え統合・相反順と削除拒否・科目子集計所属・欠番と整数上限・保存失敗再試行・取消復元');
}
