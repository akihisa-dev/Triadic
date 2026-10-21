import assert from 'node:assert/strict';
export async function verifyAccountReferenceRebase(api) {
  const initial = await api.createTriadicDatabase(2026);
  const added = await api.changeAccountMaster(initial, {type:'add',accountCode:'901',accountName:'旧科目A',accountType:'sales'});
  const base = added.bytes, account = added.accounts.find(a=>a.accountCode==='901'), contents = await api.readPlanContents(base);
  const draft = {name:'旧科目への入力',note:'',fiscalYear:'2026',expansionId:1,industryId:1,departmentId:1,rows:[{id:'old-account-reference',accountId:account.id,amounts:{4:'1.001'}}]};
  const locals = [await api.registerInitiative(base,draft), await api.savePreviousAmounts(base,{ previousKind: 1,industryId:1,departmentId:1,rows:[{accountId:account.id,amounts:{4:'1.001'}}]}), await api.changeAggregationMaster(base,{type:'move',member:{kind:'account',id:account.id},parentId:contents.aggregations[0].id,sign:1})];
  const undo = await api.applyOperationSnapshot(base,await api.createBusinessSnapshot(initial));
  const history = await api.recordDataHistory(await api.trackHistoryChange(initial,base),new Date().toISOString(),true);
  const restored = await api.restoreDataHistory(history,(await api.readDataHistory(history)).entries.at(-1).id);
  for(const source of [undo,restored]) {
    const replacement = await api.changeAccountMaster(source,{type:'add',accountCode:'902',accountName:'別科目B',accountType:'expense'});
    assert.equal(replacement.accounts.find(a=>a.accountCode==='902').id,account.id);
    for(const local of locals)for(const [a,b] of [[local,replacement.bytes],[replacement.bytes,local]]) {
      const before=[base.slice(),a.slice(),b.slice()];
      assert.equal(await api.rebasePlan(base,a,b),null,'復元後の別科目への3経路の参照を両保存順で拒否');
      assert.deepEqual([base,a,b],before);
    }
  }
  const renamed = (await api.changeAccountMaster(base,{type:'update',id:account.id,accountCode:'903',accountName:'通常改名',accountType:'sales'})).bytes;
  for(const local of locals) for(const [a,b] of [[local,renamed],[renamed,local]]) assert.equal(await api.rebasePlan(base,a,b),null,'同一性を判別できない改名と参照変更の重なりも拒否');
  const independent = await api.saveKindSelection(base,'initiative-list',[1]);
  assert.ok(await api.rebasePlan(base,renamed,independent),'科目改名と無関係な編集は許可');
  const extra=(await api.changeAccountMaster(base,{type:'add',accountCode:'904',accountName:'無関係な科目',accountType:'expense'})).bytes;
  for(const local of locals)assert.ok(await api.rebasePlan(base,local,extra),'無関係な科目追加を許可');
  const deleted=(await api.changeAccountMaster(base,{type:'delete',id:account.id})).bytes;
  for(const local of locals)assert.equal(await api.rebasePlan(base,local,deleted),null);
  const referenced=locals[0], item=(await api.readPlanContents(referenced)).initiatives[0];
  const changed=await api.updateInitiative(referenced,item.id,2026,{...item,fiscalYear:'2026',rows:item.rows.map(row=>({...row,amounts:{...row.amounts,4:'2'}}))});
  const changedMaster=(await api.changeAccountMaster(referenced,{type:'update',id:account.id,accountCode:'901',accountName:'旧科目A',accountType:'expense'})).bytes;
  for(const [a,b] of [[changed,changedMaster],[changedMaster,changed]]) assert.equal(await api.rebasePlan(referenced,a,b),null,'科目IDが同じ既存月額変更も照合');
  const replaced=(await api.changeAccountMaster(undo,{type:'add',accountCode:'902',accountName:'別科目B',accountType:'expense'})).bytes;
  await verifyReferenceRecovery(api,base,replaced,{type:'initiative.register',draft});
  console.log('PASS: 科目番号再利用の取消・履歴復元、3参照と既存月額、両保存順、独立追加・改名、元データ保持');
}

export async function verifyReferenceRecovery(api, base, external, command) {
  for(const mode of ['cancel','failure','save-as']) {
    let stored=external.slice(), destinationBytes=null, writes=0;
    const original={name:'外部変更.triadic',async isSameEntry(other){return other===this},async getFile(){return new File([stored],this.name)},async createWritable(){let pending;return {async write(value){writes++;pending=new Uint8Array(value)},async close(){stored=pending},async abort(){}}}};
    const destination={name:'保持した入力.triadic',async getFile(){return new File([destinationBytes??new Uint8Array()],this.name)},async createWritable(){let pending;return {async write(value){pending=new Uint8Array(value)},async close(){if(fail)throw new Error('確認用の保存失敗');destinationBytes=pending},async abort(){}}}};
    const session=new api.PlanSession();const contents=await api.readPlanContents(base);await session.open({...contents,bytes:base,name:original.name,handle:original});
    const originalSnapshot=session.getSnapshot();
    let fail=mode==='failure';
    const before=structuredClone(command),unregister=api.registerFileConflictRecovery(async()=>mode==='cancel'?null:destination);
    try {
      if(mode==='save-as') {await session.dispatch(command,async()=>original);assert.equal(session.getHandle(),destination);await api.validateTriadicDatabase(destinationBytes)}
      else {await assert.rejects(session.dispatch(command,async()=>original),mode==='cancel'?/入力は.*保持/:/保存失敗/);assert.deepEqual(session.getSnapshot().contents.initiatives,contents.initiatives);assert.equal(destinationBytes,null)}
      assert.deepEqual(command,before);assert.equal(writes,0);assert.deepEqual(stored,external);
    } finally {unregister()}
    if(mode!=='save-as') {
      assert.deepEqual(session.getSnapshot(),originalSnapshot,'失敗で計画・履歴・操作取消を保持');
      fail=false;
      const stop=api.registerFileConflictRecovery(async()=>destination);
      try {
        await session.dispatch(command,async()=>original);
        assert.equal(session.getHandle(),destination,'同じ入力の再試行で別ファイルへ保存');
        await api.validateTriadicDatabase(destinationBytes);
        assert.deepEqual(stored,external);
        assert.equal(writes,0);
      } finally {stop()}
    }
  }
}
