import { verifyReferenceRecovery } from './account-reference-rebase.mjs';
import assert from 'node:assert/strict';
export async function verifyInitiativeOwnerRebase(api) {
  const initial=await api.createTriadicDatabase(2026), account=(await api.readPlanContents(initial)).accounts[0].id;
  const draft={name:'旧施策A',note:'',fiscalYear:'2026',expansionId:1,industryId:1,departmentId:1,rows:[{id:'old-row',accountId:account,amounts:{4:'0'}}]};
  const base=await api.registerInitiative(initial,draft),item=(await api.readPlanContents(base)).initiatives[0];
  const local=await api.updateInitiative(base,item.id,2026,{...draft,rows:[...item.rows,{id:'local-row',accountId:account,amounts:{4:'1.001'}}]});
  const amount=await api.updateInitiative(base,item.id,2026,{...draft,rows:[{...item.rows[0],amounts:{4:'1.001'}}]});
  const undo=await api.applyOperationSnapshot(base,await api.createBusinessSnapshot(initial));
  const history=await api.recordDataHistory(await api.trackHistoryChange(initial,base),new Date().toISOString(),true);
  const restored=await api.restoreDataHistory(history,(await api.readDataHistory(history)).entries.at(-1).id);
  for(const source of [undo,restored])for(const name of ['別施策B','旧施策A'])for(const withRow of [false,true]) {
    let replacement=await api.registerInitiative(source,{...draft,name,rows:[{id:'external-row',accountId:account,amounts:{4:withRow?'2':'0'}}]});
    if(!withRow) replacement=await api.updateInitiative(replacement,item.id,2026,{...draft,name,rows:[]});
    assert.equal((await api.readPlanContents(replacement)).initiatives[0].id,item.id);
    for(const edited of [local,amount])for(const [a,b] of [[edited,replacement],[replacement,edited]]) {
      const before=[base.slice(),a.slice(),b.slice()];
      assert.equal(await api.rebasePlan(base,a,b),null,'同名も含む別施策へ旧行・金額を移さない');
      assert.deepEqual([base,a,b],before);
    }
  }
  const extra=await api.updateInitiative(base,item.id,2026,{...draft,rows:[...item.rows,{id:'independent-row',accountId:account,amounts:{5:'2'}}]});
  for(const [a,b] of [[local,extra],[extra,local]]) {
    const merged=await api.rebasePlan(base,a,b);assert.ok(merged?.operation,'同じ施策の独立行追加を維持');
    const actual=(await api.readPlanContents(merged.bytes)).initiatives[0];
    assert.equal(actual.rows.length,3);
    assert.equal(actual.rows.find(r=>r.id==='local-row').amounts[4],'1.001');
    await api.validateTriadicDatabase(await api.applyOperationSnapshot(merged.bytes,merged.operation.before));
    await api.validateTriadicDatabase(await api.applyOperationSnapshot(merged.bytes,merged.operation.after));
  }
  const renamed=await api.updateInitiative(base,item.id,2026,{...draft,name:'同じ施策の改名'});
  assert.ok(await api.rebasePlan(base,renamed,await api.saveKindSelection(base,'initiative-list',[1])),'通常改名と無関係な選択変更を許可');
  for(const [a,b] of [[local,renamed],[renamed,local]])assert.equal(await api.rebasePlan(base,a,b),null,'施策ヘッダー変更と行編集の重なりは同一性不明として拒否');
  const replaced=await api.registerInitiative(undo,{...draft,name:'別施策B',rows:[{id:'external-row',accountId:account,amounts:{4:'2'}}]});
  await verifyReferenceRecovery(api,base,replaced,{type:'initiative.update',id:item.id,draft:{...draft,rows:[...item.rows,{id:'local-row',accountId:account,amounts:{4:'1.001'}}]}});
  console.log('PASS: 施策番号再利用の取消・履歴復元、同名/別名、行あり/なし、両保存順と既存月額、独立行追加・取消やり直し');
}
