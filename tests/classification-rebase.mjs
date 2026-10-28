import assert from 'node:assert/strict';
export async function verifyClassificationRebase(api) {
  const base=await api.createTriadicDatabase(2026),contents=await api.readPlanContents(base);
  const department=contents.departments.at(-1),industry=contents.industries.at(-1),account=contents.accounts[0].id;
  const draft={name:'旧分類を参照する施策',note:'',fiscalYear:'2026',expansionId:1,industryId:1,departmentId:department.id,rows:[{id:'classification-row',accountId:account,amounts:{4:'0.001'}}]};
  const initiative=await api.registerInitiative(base,draft);
  const previous=await api.savePreviousAmounts(base,{ previousKind: 1,industryId:1,departmentId:department.id,rows:[{accountId:account,amounts:{4:'-0.001'}}]});
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
  const oldIndustryPrevious=await api.savePreviousAmounts(base,{ previousKind: 1,industryId:industry.id,departmentId:department.id,rows:[{accountId:account,amounts:{4:'1'}}]});
  for(const local of [oldIndustryInitiative,oldIndustryPrevious])for(const [a,b] of [[local,replacedIndustry],[replacedIndustry,local]])assert.equal((await api.rebasePlan(base,a,b))===null,true,'業種の同番号・別個体を拒否');
  let stored=recreated,writes=0,aborts=0;
  const handle={name:'分類競合.triadic',async getFile(){return new File([stored],this.name);},async createWritable(){return {async write(){writes++;},async close(){},async abort(){aborts++;}};}};
  const session=new api.PlanSession();await session.open({...contents,bytes:base,name:handle.name,handle});
  const stop=api.registerFileConflictRecovery(async()=>null);
  try {await assert.rejects(session.dispatch({type:'initiative.register',draft},async()=>handle),/入力は.*保持/);}finally{stop();}
  assert.equal(writes,0);assert.equal(aborts,1);assert.deepEqual(stored,recreated);assert.equal(session.getSnapshot().contents.initiatives.length,0);
  console.log('PASS: 部署・業種の同番号再作成と施策・前年参照の両方向拒否、改名・独立追加許可、元ファイルと保存境界保護、取消');
  const originalCategory=await api.changeExpansionCategoryMaster(base,{type:'add',categoryName:'旧区分',expansionId:2});
  const oldCategoryContents=await api.readPlanContents(originalCategory);
  const categoryId=oldCategoryContents.expansionCategories.at(-1).id;
  const expansion=oldCategoryContents.expansions.find(item=>item.id===1);
  const assignCategory=async source=>api.changeExpansionCategoryMaster(source,{type:'update',id:categoryId,categoryName:(await api.readPlanContents(source)).expansionCategories.find(item=>item.id===categoryId).categoryName,expansionId:1});
  const assignedCategory=await assignCategory(originalCategory);
  const referencedCategory=await api.registerInitiative(assignedCategory,{...draft,departmentId:1,name:'旧区分への参照',expansionCategoryId:categoryId});
  const beforeAddition=await api.createBusinessSnapshot(base);
  const restoredCategory=await api.applyOperationSnapshot(originalCategory,beforeAddition);
  const replacementCategory=await api.changeExpansionCategoryMaster(restoredCategory,{type:'add',categoryName:'別区分',expansionId:2});
  assert.equal((await api.readPlanContents(replacementCategory)).expansionCategories.at(-1).id,categoryId,'操作取消で採番状態も復元される');
  for(const local of [assignedCategory,referencedCategory])for(const [a,b] of [[local,replacementCategory],[replacementCategory,local]]) {
    const before=[originalCategory.slice(),a.slice(),b.slice()];
    assert.equal(await api.rebasePlan(originalCategory,a,b),null,'復元後の同番号・別区分へ旧参照を移さない');
    assert.deepEqual([originalCategory,a,b],before);
  }
  const history=await api.recordDataHistory(await api.trackHistoryChange(base,originalCategory), new Date().toISOString(), true);
  const olderId=(await api.readDataHistory(history)).entries.at(-1).id;
  const restoredHistory=await api.restoreDataHistory(history,olderId);
  const fromHistory=await api.changeExpansionCategoryMaster(restoredHistory,{type:'add',categoryName:'履歴復元後の区分',expansionId:2});
  assert.equal((await api.readPlanContents(fromHistory)).expansionCategories.at(-1).id,categoryId);
  for(const local of [assignedCategory,referencedCategory])for(const [a,b] of [[local,fromHistory],[fromHistory,local]]) assert.equal(await api.rebasePlan(originalCategory,a,b),null,'時点履歴の復元後も旧参照を拒否');
  const removedCategory=await api.changeExpansionCategoryMaster(originalCategory,{type:'delete',id:categoryId});
  const normallyAdded=await api.changeExpansionCategoryMaster(removedCategory,{type:'add',categoryName:'通常削除の対照',expansionId:2});
  assert.ok((await api.readPlanContents(normallyAdded)).expansionCategories.at(-1).id>categoryId,'通常削除では番号を再利用しない');
  const renamedCategory=await api.changeExpansionCategoryMaster(originalCategory,{type:'update',id:categoryId,categoryName:'旧区分の改名',expansionId:2});
  assert.equal((await api.readPlanContents(await assignCategory(renamedCategory))).expansionCategories.at(-1).categoryName,'旧区分の改名','通常の改名後も割当可');
  for(const [a,b] of [[assignedCategory,renamedCategory],[renamedCategory,assignedCategory]]) assert.equal(await api.rebasePlan(originalCategory,a,b),null,'区分改名と新たな参照の同時変更も安全側で拒否');
  const unrelatedCategory=await api.changeExpansionCategoryMaster(originalCategory,{type:'add',categoryName:'無関係な区分',expansionId:2});
  assert.ok(await api.rebasePlan(originalCategory,assignedCategory,unrelatedCategory),'無関係な区分追加と割当は統合');
  const renamedExisting=await api.changeExpansionCategoryMaster(referencedCategory,{type:'update',id:categoryId,categoryName:'参照を保った改名',expansionId:1});
  const independentKind=await api.saveKindSelection(referencedCategory,'initiative-list',[1]);
  for(const [a,b] of [[renamedExisting,independentKind],[independentKind,renamedExisting]]) {
    const merged=await api.rebasePlan(referencedCategory,a,b);assert.ok(merged);
    const actual=await api.readPlanContents(merged.bytes);
    assert.equal(actual.expansionCategories.at(-1).categoryName,'参照を保った改名');
    assert.equal(actual.initiatives.at(-1).expansionCategoryId,categoryId,'通常改名と独立編集は既存の参照を維持');
  }
  for(const mode of ['cancel','failure','save-as']) {
    let externalStored=replacementCategory.slice(),savedElsewhere=null,originalWrites=0;
    const sourceHandle={name:'区分外部競合.triadic',async isSameEntry(other){return other===this;},async getFile(){return new File([externalStored],this.name);},async createWritable(){let pending;return {async write(value){originalWrites++;pending=new Uint8Array(value).slice();},async close(){if(pending)externalStored=pending;},async abort(){}};}};
    const destination={name:'区分入力を保持.triadic',async getFile(){return new File([savedElsewhere??new Uint8Array()],this.name);},async createWritable(){let pending;return {async write(value){pending=new Uint8Array(value).slice();},async close(){if(mode==='failure')throw new Error('別ファイル保存失敗');savedElsewhere=pending;},async abort(){}};}};
    const categorySession=new api.PlanSession();await categorySession.open({...oldCategoryContents,bytes:originalCategory,name:sourceHandle.name,handle:sourceHandle});
    const command={type:'expansion-category',change:{type:'update',id:categoryId,categoryName:'旧区分',expansionId:1}};
    const commandBefore=structuredClone(command);
    const unregister=api.registerFileConflictRecovery(async()=>api.captureRecoveryDestination(mode==='cancel'?null:destination));
    try {
      if(mode==='save-as') {
        const saved=await categorySession.dispatch(command,async()=>sourceHandle);
        assert.equal(saved.expansionCategories.at(-1).categoryName,'旧区分','選んだ区分を別ファイルへ保存');
        assert.ok(saved.expansions.find(item=>item.id===expansion.id).categoryIds.includes(categoryId));
        assert.equal(categorySession.getHandle(),destination);
        await api.validateTriadicDatabase(savedElsewhere);
      } else {
        await assert.rejects(categorySession.dispatch(command,async()=>sourceHandle),mode==='cancel'?/入力は.*保持/:/保存失敗/);
        assert.deepEqual(command,commandBefore,'取消・保存失敗で入力操作を変更しない');
        assert.equal(savedElsewhere,null);
        assert.deepEqual(categorySession.getSnapshot().contents.expansions,oldCategoryContents.expansions);
      }
    } finally {unregister();}
    assert.equal(originalWrites,0);assert.deepEqual(externalStored,replacementCategory,'外部の別区分と保存データを保護');
  }

}
