import assert from 'node:assert/strict';
import { connectWindowSession } from './window-transport.mjs';
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
  const originalDraft={rows:[{id:'same-row',accountId:1,amounts:{4:'10'},overrides:{2:{4:'0'}}}]};
  const changedAccount={rows:[{...originalDraft.rows[0],accountId:2}]};
  for (const money of [
    {amounts:{4:'11'}}, {amounts:{4:'0'}}, {overrides:{2:{4:'1'}}}, {overrides:{2:{}}},
  ]) {
    const changedAmount={rows:[{...originalDraft.rows[0],...money}]};
    for (const [local,saved] of [[changedAccount,changedAmount],[changedAmount,changedAccount]]) {
      assert.throws(()=>api.reconcileSavedDraft(originalDraft,local,saved),/科目と金額/);
      const controller=new api.AutoSave(async()=>{},100000);
      controller.begin(originalDraft);controller.change(local);controller.syncSaved(saved);
      assert.equal(controller.hasSourceChange(),true,'異なる科目への金額統合を止める');
      assert.deepEqual(controller.getSnapshot().draft,local,'未保存の入力を保持する');
      controller.discard();assert.deepEqual(controller.getSnapshot().draft,saved);
    }
  }
  const separateMonth={rows:[{...originalDraft.rows[0],amounts:{4:'10',5:'20'}}]};
  assert.equal(api.reconcileSavedDraft(originalDraft,separateMonth,{rows:[{...originalDraft.rows[0],amounts:{4:'10',6:'30'}}]}).rows[0].amounts[6],'30');
  for (const accountFirst of [false,true]) {
    let stored=base;
    const sharedHandle={name:'同時編集.triadic',isSameEntry:async other=>other===sharedHandle,queryPermission:async()=> 'granted',
      getFile:async()=>new File([stored],'同時編集.triadic'),
      createWritable:async()=>{let next;return {write:async value=>{next=new Uint8Array(value).slice();},close:async()=>{stored=next;},abort:async()=>{}};}};
    const hub=new api.WindowSessionHub(), first=connectWindowSession(api,hub), second=connectWindowSession(api,hub);
    try {
      await first.session.open({name:sharedHandle.name,handle:sharedHandle,bytes:base});
      await second.session.open({name:sharedHandle.name,handle:sharedHandle,bytes:base});
      const source=first.session.getSnapshot().contents.initiatives[0];
      const command=(patch)=>({type:'initiative.update',id:source.id,draft:{...source,fiscalYear:'2026',rows:[{...source.rows[0],...patch}]}});
      const firstPatch=accountFirst?{accountId:accounts[1].id}:{amounts:{4:'100.001'}};
      const secondPatch=accountFirst?{amounts:{4:'100.001'}}:{accountId:accounts[1].id};
      let release;first.session.activation=new Promise(resolve=>{release=resolve;});
      const delayed=first.session.dispatch(command(firstPatch));
      await second.session.dispatch(command(secondPatch));release();
      await assert.rejects(delayed,/科目と金額/);
      const row=(await api.readPlanContents(stored)).initiatives[0].rows[0];
      assert.equal(row.accountId,accountFirst?accounts[0].id:accounts[1].id);
      assert.equal(row.amounts[4],accountFirst?'100.001':'0');
    } finally {first.dispose();second.dispose();}
  }
  console.log('PASS: 同一行の科目と金額・明示手修正の両保存順競合拒否、別月統合、単独科目変更、削除、元データと取消保持');
}
