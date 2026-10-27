import assert from 'node:assert/strict';
export async function verifyNamedMasterRebase(api) {
  for(const during of [false,true]) {
    let base=await api.createTriadicDatabase(2026);
    const change=api.changeDepartmentMaster;
    const input=(name,ids)=>({departmentName:name,industryIds:ids});
    base=await change(base,{type:'add',...input('同期対象',[1])});
    const read=async bytes=>{const plan=await api.readPlanContents(bytes);const item=plan.departments.at(-1);return {type:'update',id:item.id,name:item.departmentName,code:'',relationIds:item.industryIds};};
    const original=await read(base);
    let stored=await change(base,{type:'update',id:original.id,...input('同期対象',[1,2])}), release, started;
    const gate=new Promise(r=>{release=r}),begun=new Promise(r=>{started=r});let hold=during;
    const handle={name:'所属同期.triadic',async getFile(){return new File([stored],this.name)},async createWritable(){let pending;return {async write(value){pending=new Uint8Array(value).slice()},async close(){if(hold){started();await gate}stored=pending},async abort(){}}}};
    const session=new api.PlanSession();await session.open({...await api.readPlanContents(base),bytes:base,name:handle.name,handle});
    const controller=new api.AutoSave(async draft=>{
      await session.dispatch({type:'department',change:{type:'update',id:draft.id,...input(draft.name,draft.relationIds)}},async()=>handle);
      controller.syncSaved(await read(stored));
    },100000);
    controller.begin(original);controller.change({...original,name:'同期対象改',relationIds:[1]});
    const saving=controller.flush();
    if(during){await begun;controller.change({...controller.getSnapshot().draft,name:'追加編集',relationIds:[...controller.getSnapshot().draft.relationIds,4]});hold=false;release()}
    await saving;
    const expected=[1,2];if(during)expected.push(4);
    assert.deepEqual([...controller.getSnapshot().draft.relationIds].sort(),expected);
    controller.change({...controller.getSnapshot().draft,name:'次の改名'});await controller.flush();controller.cancelTimer();
    assert.deepEqual([...((await read(stored)).relationIds)].sort(),expected,'続けて改名しても外部所属を削除しない');
    controller.discard();assert.deepEqual([...controller.getSnapshot().draft.relationIds].sort(),expected);controller.end();controller.begin(await read(stored));
    assert.deepEqual([...controller.getSnapshot().draft.relationIds].sort(),expected,'完了・再編集後も所属を保持');controller.end();
    await session.travelOperation(-1,async()=>handle);assert.ok((await read(stored)).relationIds.includes(2));
    await session.travelOperation(1,async()=>handle);assert.deepEqual([...(await read(stored)).relationIds].sort(),expected);
  }
  let finish;
  const controller=new api.AutoSave(async()=>{await new Promise(resolve=>{finish=resolve});controller.syncSaved({relationIds:[1,3,4]})},100000);
  controller.begin({relationIds:[1,2]});controller.change({relationIds:[1,2,4]});const pending=controller.flush();
  controller.change({relationIds:[2,4,5]});finish();await pending;
  assert.deepEqual(controller.getSnapshot().draft.relationIds,[3,4,5],'外部削除と追加・保存中の解除と追加をそれぞれ保持');controller.cancelTimer();
  let completeSingle;
  const single = new api.AutoSave(async () => {
    await new Promise(resolve => { completeSingle = resolve; });
    single.syncSaved({ name: '区分', relationId: 2 });
  }, 100000);
  single.begin({ name: '区分', relationId: 1 });
  single.change({ name: '区分', relationId: 2 });
  const singleSave = single.flush();
  single.change({ name: '区分', relationId: 3 });
  completeSingle(); await singleSave;
  assert.equal(single.getSnapshot().draft.relationId, 3, '単一所属は保存中の次の選択を保持し、複数所属へ統合しない');
  single.cancelTimer();
  console.log('PASS: 部署の統合所属同期、保存中の名前・所属変更、次回改名、取消・再編集・操作履歴、外部所属削除');
}
