import assert from 'node:assert/strict';
export async function verifyClassificationRebase(api) {
  const base=await api.createTriadicDatabase(2026),contents=await api.readPlanContents(base);
  const department=contents.departments.at(-1),industry=contents.industries.at(-1),account=contents.accounts[0].id;
  const draft={name:'旧分類を参照する施策',note:'',fiscalYear:'2026',expansionId:1,industryId:1,departmentId:department.id,rows:[{id:'classification-row',accountId:account,amounts:{4:'0.001'}}]};
  const initiative=await api.registerInitiative(base,draft);
  const previous=await api.savePreviousAmounts(base,{industryId:1,departmentId:department.id,rows:[{accountId:account,amounts:{4:'-0.001'}}]});
  const deleted=await api.changeDepartmentMaster(base,{type:'delete',id:department.id});
  const recreated=await api.changeDepartmentMaster(deleted,{type:'add',departmentName:'作り直した部署',industryIds:department.industryIds});
  const replacement=(await api.readPlanContents(recreated)).departments.at(-1);
  assert.equal(replacement.id,department.id);assert.notEqual(replacement.identity,department.identity);
  for(const local of [initiative,previous])for(const [a,b] of [[local,recreated],[recreated,local]]) {
    const unchanged=[base.slice(),a.slice(),b.slice()];
    assert.equal((await api.rebasePlan(base,a,b))===null,true,'部署の同番号・別個体を拒否');
    assert.deepEqual([base,a,b],unchanged);
  }
  const renamed=await api.changeDepartmentMaster(base,{type:'update',id:department.id,departmentName:'同じ部署の改名',industryIds:department.industryIds});
  for(const local of [initiative,previous])for(const [a,b] of [[local,renamed],[renamed,local]]) {
    const merged=await api.rebasePlan(base,a,b);assert.ok(merged?.operation);
    const actual=await api.readPlanContents(merged.bytes);
    assert.equal(actual.departments.find(d=>d.id===department.id).identity,department.identity);
    assert.equal(actual.departments.find(d=>d.id===department.id).departmentName,'同じ部署の改名');
    await api.validateTriadicDatabase(await api.applyOperationSnapshot(merged.bytes,merged.operation.before));
    await api.validateTriadicDatabase(await api.applyOperationSnapshot(merged.bytes,merged.operation.after));
  }
  const extra=await api.changeDepartmentMaster(base,{type:'add',departmentName:'無関係な追加部署',industryIds:[1]});
  assert.ok(await api.rebasePlan(base,initiative,extra));
  for(const [change,id,addition,reference] of [
    [api.changeExpansionMaster,contents.expansions.at(-1).id,{expansionCode:'99',expansionName:'作り直した展開'},'expansionId'],
    [api.changePeriodMaster,contents.periodTypes.at(-1).id,{periodName:'作り直した期間'},'periodTypeId'],
  ]) {
    const original=await api.registerInitiative(base,{...draft,[reference]:id});
    const removed=await change(base,{type:'delete',id});
    const replacement=await change(removed,{type:'add',...addition});
    for(const [a,b] of [[original,replacement],[replacement,original]])assert.equal(await api.rebasePlan(base,a,b),null,'識別子のない再利用マスタも安全に拒否');
  }
  assert.equal(await api.rebasePlan(base,initiative,deleted),null,'削除された部署への参照を拒否');
  const groupBase=await api.changeAggregationMaster(base,{type:'add',name:'未使用集計'});
  const groupId=(await api.readPlanContents(groupBase)).aggregations.at(-1).id;
  const groupLocal=await api.changeAggregationMaster(groupBase,{type:'move',member:{kind:'account',id:account},parentId:groupId,sign:1});
  const groupDeleted=await api.changeAggregationMaster(groupBase,{type:'delete',id:groupId});
  const groupRecreated=await api.changeAggregationMaster(groupDeleted,{type:'add',name:'作り直した集計'});
  for(const [a,b] of [[groupLocal,groupRecreated],[groupRecreated,groupLocal]])assert.equal(await api.rebasePlan(groupBase,a,b),null,'集計の再利用番号へ旧所属を移さない');
  let replacedIndustry=base;
  for(const d of contents.departments)if(d.industryIds.includes(industry.id))replacedIndustry=await api.changeDepartmentMaster(replacedIndustry,{type:'update',id:d.id,departmentName:d.departmentName,industryIds:d.industryIds.filter(id=>id!==industry.id)});
  replacedIndustry=await api.changeIndustryMaster(replacedIndustry,{type:'delete',id:industry.id});
  replacedIndustry=await api.changeIndustryMaster(replacedIndustry,{type:'add',industryCode:'99',industryName:'作り直した業種'});
  replacedIndustry=await api.changeDepartmentMaster(replacedIndustry,{type:'update',id:department.id,departmentName:department.departmentName,industryIds:department.industryIds});
  assert.equal((await api.readPlanContents(replacedIndustry)).industries.at(-1).id,industry.id);
  const oldIndustryInitiative=await api.registerInitiative(base,{...draft,industryId:industry.id});
  const oldIndustryPrevious=await api.savePreviousAmounts(base,{industryId:industry.id,departmentId:department.id,rows:[{accountId:account,amounts:{4:'1'}}]});
  for(const local of [oldIndustryInitiative,oldIndustryPrevious])for(const [a,b] of [[local,replacedIndustry],[replacedIndustry,local]])assert.equal((await api.rebasePlan(base,a,b))===null,true,'業種の同番号・別個体を拒否');
  let stored=recreated,writes=0,aborts=0;
  const handle={name:'分類競合.triadic',async getFile(){return new File([stored],this.name);},async createWritable(){return {async write(){writes++;},async close(){},async abort(){aborts++;}};}};
  const session=new api.PlanSession();await session.open({...contents,bytes:base,name:handle.name,handle});
  const stop=api.registerFileConflictRecovery(async()=>null);
  try {await assert.rejects(session.dispatch({type:'initiative.register',draft},async()=>handle),/入力は.*保持/);}finally{stop();}
  assert.equal(writes,0);assert.equal(aborts,1);assert.deepEqual(stored,recreated);assert.equal(session.getSnapshot().contents.initiatives.length,0);
  console.log('PASS: 部署・業種の同番号再作成と施策・前年参照の両方向拒否、改名・独立追加許可、元ファイルと保存境界保護、取消');
}
