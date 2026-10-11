import assert from 'node:assert/strict';
export async function verifyRowAccountRebase(api) {
  const empty = await api.createTriadicDatabase(2026), accounts = (await api.readPlanContents(empty)).accounts;
  const base = await api.registerInitiative(empty,{name:'科目と金額の統合',note:'',fiscalYear:'2026',expansionId:1,industryId:1,departmentId:1,rows:[{id:'same-row',accountId:accounts[0].id,amounts:{}}]});
  const initiative = (await api.readPlanContents(base)).initiatives[0];
  const update = row => api.updateInitiative(base,initiative.id,2026,{...initiative,fiscalYear:'2026',rows:[{...initiative.rows[0],...row}]});
  const account = await update({accountId:accounts[1].id});
  for (const amount of [{amounts:{4:'100.001'}},{overrides:{2:{4:'0'}}},{overrides:{2:{4:'-0.001'}}}]) {
    const amounts = await update(amount);
    for (const [local,external] of [[account,amounts],[amounts,account]]) {
      const originals = [base.slice(),local.slice(),external.slice()];
      assert.equal((await api.rebasePlan(base,local,external)) === null,true,'同一行の科目変更と他方の月額・明示手修正を拒否');
      assert.deepEqual([base,local,external],originals);
    }
  }
  const a = await update({amounts:{4:'0.001'}}), b = await update({amounts:{5:'-0.002'}});
  for (const [local,external] of [[a,b],[b,a]]) {
    const merged = await api.rebasePlan(base,local,external); assert.ok(merged?.operation);
    const row = (await api.readPlanContents(merged.bytes)).initiatives[0].rows[0];
    assert.equal(row.accountId,accounts[0].id); assert.equal(row.amounts[4],'0.001'); assert.equal(row.amounts[5],'-0.002');
    assert.deepEqual((await api.readPlanContents(await api.applyOperationSnapshot(merged.bytes,merged.operation.before))).initiatives,(await api.readPlanContents(external)).initiatives);
    await api.validateTriadicDatabase(await api.applyOperationSnapshot(merged.bytes,merged.operation.after));
  }
  assert.ok(await api.rebasePlan(base,account,base),'科目変更だけは成功');
  const otherAccount=await update({accountId:accounts[2].id});
  assert.equal(await api.rebasePlan(base,account,otherAccount),null);
  const deleted=await api.updateInitiative(base,initiative.id,2026,{...initiative,fiscalYear:'2026',rows:[]});
  assert.equal(await api.rebasePlan(base,a,deleted),null);
  assert.equal((await api.rebasePlan(base,deleted,deleted)).operation,null,'同じ削除の重複は変更なし');
  let writes=0,aborts=0,recoveries=0;
  const handle={name:'科目競合.triadic',async getFile(){return new File([a],this.name);},async createWritable(){return {async write(){writes++;},async close(){throw Error('拒否後に確定しない');},async abort(){aborts++;}};}};
  const stop=api.registerFileConflictRecovery(async()=>{recoveries++;return null;});
  try {await assert.rejects(api.writePlanChange({...await api.readPlanContents(base),bytes:base,name:handle.name,handle},handle,account,{allowRebase:true}),/入力は.*保持/);}
  finally {stop();}
  assert.equal(writes,0);assert.equal(aborts,1);assert.equal(recoveries,1);
  console.log('PASS: 同一行の科目と金額・明示手修正の両保存順競合拒否、別月統合、単独科目変更、削除、元データと取消保持');
}
