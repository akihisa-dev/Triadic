import assert from 'node:assert/strict';
export async function verifyAccountAddRebase(api){
  let base=await api.createTriadicDatabase(2026);
  const original=(await api.readPlanContents(base)).accounts[0];
  base=await api.registerInitiative(base,{name:'新科目の参照確認',fiscalYear:'2026',note:'',expansionId:1,industryId:1,departmentId:1,rows:[{id:'existing-row',accountId:original.id,amounts:{4:'1'}}]});
  const initial=await api.readPlanContents(base),initiative=initial.initiatives[0];
  const add=async(code,name,type='sales')=>{
    const result=await api.changeAccountMaster(base,{type:'add',accountCode:code,accountName:name,accountType:type});
    return {bytes:result.bytes,account:result.accounts.find(a=>a.accountCode===code)};
  };
  const left=await add('901','追加科目A'),right=await add('902','追加科目B','cost');assert.equal(left.account.id,right.account.id,'分岐コピーで新IDが衝突');
  const enrich=async(item,row,amount)=>{
    let bytes=await api.updateInitiative(item.bytes,initiative.id,2026,{...initiative,fiscalYear:'2026',rows:[...initiative.rows,{id:row,accountId:item.account.id,amounts:{4:amount}}]});
    bytes=await api.changeAggregationMaster(bytes,{type:'move',member:{kind:'account',id:item.account.id},parentId:initial.aggregations[0].id,sign:1});
    return api.savePreviousAmounts(bytes,{ previousKind: 1,industryId:1,departmentId:1,rows:[{accountId:item.account.id,amounts:{5:amount}}]});
  };
  const l=await enrich(left,'new-row-a','0.001'),r=await enrich(right,'new-row-b','-0.001');
  for(const [a,b] of [[left.bytes,right.bytes],[right.bytes,left.bytes],[l,r],[r,l]]){
    const before=[base.slice(),a.slice(),b.slice()],merged=await api.rebasePlan(base,a,b);assert.ok(merged?.operation,'異なる科目を同じIDだけで拒否しない');
    assert.deepEqual([base,a,b],before);
    const actual=await api.readPlanContents(merged.bytes),one=actual.accounts.find(v=>v.accountCode==='901'),two=actual.accounts.find(v=>v.accountCode==='902');
    assert.ok(one&&two);assert.notEqual(one.id,two.id);assert.equal(one.accountType,'sales');assert.equal(two.accountType,'cost');
    assert.deepEqual(actual.accounts.slice(-2).map(v=>v.accountCode),(await api.readPlanContents(b)).accounts.at(-1).accountCode==='901'?['901','902']:['902','901'],'先行保存の順序に今回の追加を続ける');
    assert.equal(new Set(actual.accounts.map(v=>v.masterOrder)).size,actual.accounts.length);
    if(a===l||a===r){
      assert.equal(actual.initiatives[0].rows.find(v=>v.id==='new-row-a').accountId,one.id);
      assert.equal(actual.initiatives[0].rows.find(v=>v.id==='new-row-b').accountId,two.id);
      assert.equal(actual.previousAmounts.find(v=>v.accountId===one.id).amount,'0.001');
      assert.equal(actual.previousAmounts.find(v=>v.accountId===two.id).amount,'-0.001');
      const members=actual.aggregations[0].members;assert.ok(members.some(v=>v.kind==='account'&&v.id===one.id));assert.ok(members.some(v=>v.kind==='account'&&v.id===two.id));
    }
    const undone=await api.readPlanContents(await api.applyOperationSnapshot(merged.bytes,merged.operation.before));
    const committed=await api.readPlanContents(b);assert.deepEqual(undone.accounts,committed.accounts,'先に保存した科目を取消で消さない');
    const redone=await api.readPlanContents(await api.applyOperationSnapshot(merged.bytes,merged.operation.after));assert.deepEqual(redone.accounts,actual.accounts);
  }
  const sameCode=await add('901','別の名前'),sameName=await add('903','追加科目A');
  assert.equal(await api.rebasePlan(base,left.bytes,sameCode.bytes),null);assert.equal(await api.rebasePlan(base,left.bytes,sameName.bytes),null);
  assert.equal(await api.rebasePlan(base,left.bytes,(await add('901','追加科目A')).bytes),null,'同じ新規コードも重複追加として拒否');
  const reordered=await api.changeAccountMaster(left.bytes,{type:'reorder',ids:[...initial.accounts.map(v=>v.id).reverse(),left.account.id]});
  for(const [a,b] of [[reordered.bytes,right.bytes],[right.bytes,reordered.bytes]]){
    const result=await api.rebasePlan(base,a,b);assert.ok(result);
    assert.deepEqual((await api.readPlanContents(result.bytes)).accounts.slice(0,initial.accounts.length).map(v=>v.id),initial.accounts.map(v=>v.id).reverse(),'片側の並べ替えと追加を統合');
  }
  for(const addOther of [
    name=>api.registerInitiative(base,{name,fiscalYear:'2026',note:'',expansionId:1,industryId:1,departmentId:1,rows:[{id:name,accountId:original.id,amounts:{4:'1'}}]}),
    name=>api.changeExpansionCategoryMaster(base,{type:'add',categoryName:name}),
    name=>api.changeAggregationMaster(base,{type:'add',name}),
  ]){
    const a=await addOther('独立追加A'),b=await addOther('独立追加B');
    assert.equal(await api.rebasePlan(base,a,b),null,'科目以外の新規マスタID衝突は誤対応を作らず拒否');
  }
  const change=name=>api.changeAccountMaster(base,{type:'update',id:original.id,accountCode:original.accountCode,accountName:name,accountType:original.accountType}).then(v=>v.bytes);
  assert.equal(await api.rebasePlan(base,await change('既存変更A'),await change('既存変更B')),null);
  let stored=r;
  const handle={name:'科目追加.triadic',async getFile(){return new File([stored],this.name);},async createWritable(){let value;return {async write(bytes){value=new Uint8Array(bytes).slice();},async close(){stored=value;},async abort(){}};}};
  const session=new api.PlanSession();await session.open({...initial,bytes:base,name:handle.name,handle});
  await session.dispatch({type:'account',change:{type:'add',accountCode:'901',accountName:'追加科目A',accountType:'sales'}},async()=>handle);
  assert.equal(session.getSnapshot().contents.accounts.filter(v=>['901','902'].includes(v.accountCode)).length,2);
  await session.travelOperation(-1,async()=>handle);assert.ok(session.getSnapshot().contents.accounts.some(v=>v.accountCode==='902'));
  await session.travelOperation(1,async()=>handle);assert.ok(session.getSnapshot().contents.accounts.some(v=>v.accountCode==='901'));
  console.log('PASS: 独立した新科目のID衝突再現、両方向統合と科目・順序・施策・集計・前年参照の保持、重複と既存競合拒否、保存・取消');
}
