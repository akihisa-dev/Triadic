import assert from 'node:assert/strict';
import { verifyReferenceRecovery } from './account-reference-rebase.mjs';
export async function verifyClassificationIndirectRebase(api) {
  for(const classification of ['department','industry']) {
   const initial = await api.createTriadicDatabase(2026);
   const contents = await api.readPlanContents(initial);
   const accountId = contents.accounts[0].id;
   const draft = {name:'共通施策',note:'',fiscalYear:'2026',expansionId:1,industryId:classification === 'industry' ? 9 : 1,departmentId:2,rows:[{id:'shared-row',accountId:accountId,amounts:{4:'1'}}]};
   const registered = await api.registerInitiative(initial,draft);
   const historic = await api.recordDataHistory(await api.trackHistoryChange(initial,registered,'2026-10-18T01:00:00.000Z'),'2026-10-18T01:00:01.000Z',true);
   const targetId = (await api.readDataHistory(historic)).entries[0].id;
   const initiativeId = (await api.readPlanContents(historic)).initiatives[0].id;
   const apply = async (bytes, command) => api.trackHistoryChange(bytes,await api.applyPlanCommand(bytes,command,2026),'2026-10-18T01:01:00.000Z');
   let base = await apply(historic,{type:'initiative.update',id:initiativeId,draft:{...draft,[classification === 'department' ? 'departmentId' : 'industryId']:1}});
   if(classification === 'department') {
    base = await apply(base,{type:'department',change:{type:'delete',id:2}});
    base = await apply(base,{type:'department',change:{type:'add',departmentName:'新しい部署B',industryIds:contents.departments[1].industryIds}});
   } else {
    for(const department of contents.departments) {
     base = await apply(base,{type:'department',change:{type:'update',id:department.id,departmentName:department.departmentName,industryIds:department.industryIds.filter(id=>id!==9)}});
    }
    base = await apply(base,{type:'industry',change:{type:'delete',id:9}});
    base = await apply(base,{type:'industry',change:{type:'add',industryCode:'99',industryName:'新しい業種B'}});
    for(const department of contents.departments) {
     base = await apply(base,{type:'department',change:{type:'update',id:department.id,departmentName:department.departmentName,industryIds:department.industryIds}});
    }
   }
   base = await apply(base,{type:'initiative.update',id:initiativeId,draft});
   const external = await api.restoreDataHistory(base,targetId,'2026-10-18T01:02:00.000Z');
   const collection = classification === 'department' ? 'departments' : 'industries';
   const classificationId = classification === 'department' ? 2 : 9;
   const before = await api.readPlanContents(base), restored = await api.readPlanContents(external);
   const baseIdentity = before[collection].find(x=>x.id===classificationId).identity;
   const externalIdentity = restored[collection].find(x=>x.id===classificationId).identity;
   assert.notEqual(baseIdentity,externalIdentity);
   const update = {type:'initiative.update',id:initiativeId,draft:{...draft,rows:[{...draft.rows[0],amounts:{4:'99'}}]}};
   const changed = await api.applyPlanCommand(base,update,2026);
   const direct = await api.applyPlanCommand(base,{type:'initiative.update',id:initiativeId,draft:{...draft,note:'ヘッダーも変更'}},2026);
   assert.equal(await api.rebasePlan(base,direct,external),null,'直接参照行の変更は既存ガードが拒否する');
   const unrelated = await api.saveKindSelection(base,'initiative-list',[1]);
   assert.ok(await api.rebasePlan(base,unrelated,external),'無関係な表示設定変更は統合可能');
   for(const [,ours,theirs] of [['amount-then-restore',changed,external],['restore-then-amount',external,changed]]) {
    const merged = await api.rebasePlan(base,ours,theirs);
    assert.equal(merged,null,'間接参照先の別個体を両方向で拒否');

   }
   const item=before.initiatives[0];
   for(const rows of [
     [{...item.rows[0],overrides:{2:{4:'0'}}}],
     [{...item.rows[0],overrides:{2:{4:'1'}}}],
     [...item.rows,{id:'added-row',accountId,amounts:{5:'2'}}],
   ]) {
     const edited=await api.updateInitiative(base,initiativeId,2026,{...draft,rows});
     for(const [a,b] of [[edited,external],[external,edited]]) assert.equal((await api.rebasePlan(base,a,b))===null,true);
   }
   const zero=await api.updateInitiative(base,initiativeId,2026,{...draft,rows:[{...item.rows[0],amounts:{4:'0'}}]});
   const zeroExternal=await api.restoreDataHistory(zero,targetId,'2026-10-18T01:03:00.000Z');
   const removed=await api.updateInitiative(zero,initiativeId,2026,{...draft,rows:[]});
   for(const [a,b] of [[removed,zeroExternal],[zeroExternal,removed]]) assert.equal((await api.rebasePlan(zero,a,b))===null,true,'0行削除も別個体を拒否');
   const overridden=await api.updateInitiative(base,initiativeId,2026,{...draft,rows:[{...item.rows[0],overrides:{2:{4:'1'}}}]});
   const inherited=await api.updateInitiative(overridden,initiativeId,2026,{...draft,rows:item.rows});
   const externalOverridden=await api.updateInitiative(external,initiativeId,2026,{...draft,rows:[{...item.rows[0],overrides:{2:{4:'1'}}}]});
   for(const [a,b] of [[inherited,externalOverridden],[externalOverridden,inherited]]) assert.equal((await api.rebasePlan(overridden,a,b))===null,true,'引き継ぎ復帰も別個体へ移さない');
   const master=before[collection].find(x=>x.id===classificationId);
   const renamed=await api.applyPlanCommand(base,classification==='department'
     ? {type:'department',change:{type:'update',id:master.id,departmentName:'同じ部署の改名',industryIds:master.industryIds}}
     : {type:'industry',change:{type:'update',id:master.id,industryCode:master.industryCode,industryName:'同じ業種の改名'}},2026);
   for(const [a,b] of [[changed,renamed],[renamed,changed]]) assert.ok(await api.rebasePlan(base,a,b),'同じ個体の改名と月額変更は統合');
   await verifyReferenceRecovery(api,base,external,update);
  }
  console.log('PASS: 月額・手修正0/同額・引継復帰・行追加削除から分類の別個体を両方向拒否、同一個体改名と回復保護');
}
