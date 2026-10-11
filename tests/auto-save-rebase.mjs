import assert from 'node:assert/strict';
export async function verifyAutoSaveRebase(api) {
  const empty=await api.createTriadicDatabase(2026),account=(await api.readPlanContents(empty)).accounts[0].id;
  const bytes=await api.registerInitiative(empty,{name:'外部更新後の編集',note:'',fiscalYear:'2026',expansionId:1,industryId:1,departmentId:1,rows:[{id:'draft-row',accountId:account,amounts:{4:'120',5:'125',6:'130'}}]});
  const initial=(await api.readPlanContents(bytes)).initiatives[0];
  const draftOf=initiative=>({...initiative,fiscalYear:'2026'});
  const external=await api.updateInitiative(bytes,initial.id,2026,{...draftOf(initial),rows:initial.rows.map(row=>({...row,amounts:{...row.amounts,5:'777'}}))});
  for(const editDuringSave of [false,true]) {
    let stored=external,release,started;
    const gate=new Promise(resolve=>{release=resolve;}),begun=new Promise(resolve=>{started=resolve;});
    let hold=editDuringSave;
    const handle={name:'入力同期.triadic',async getFile(){return new File([stored],this.name);},async createWritable(){let pending;return {async write(value){pending=new Uint8Array(value).slice();},async close(){if(hold){started();await gate;}stored=pending;},async abort(){}};}};
    const session=new api.PlanSession();await session.open({...await api.readPlanContents(bytes),bytes,name:handle.name,handle});
    const controller=new api.AutoSave(async draft=>{
      const saved=await session.dispatch({type:'initiative.update',id:initial.id,draft},async()=>handle);
      if(controller.syncSaved)controller.syncSaved(draftOf(saved.initiatives[0]));
    },100000);
    controller.begin(draftOf(initial));
    const edit=(month,value)=>{const draft=controller.getSnapshot().draft;controller.change({...draft,rows:draft.rows.map(row=>({...row,amounts:{...row.amounts,[month]:value}}))});};
    edit(4,'121');const first=controller.flush();
    if(editDuringSave){await begun;edit(6,'131');hold=false;release();}
    await first;
    assert.equal(controller.getSnapshot().draft.rows[0].amounts[5],'777','統合済みの値を編集欄へ反映');
    if(!editDuringSave)edit(6,'131');
    assert.equal(controller.getSnapshot().draft.rows[0].amounts[6],'131','保存中の追加入力を保持');
    await controller.flush();controller.cancelTimer();
    const actual=(await api.readPlanContents(stored)).initiatives[0].rows[0].amounts;
    assert.equal(actual[4],'121');assert.equal(actual[5],'777');assert.equal(actual[6],'131');
    await session.travelOperation(-1,async()=>handle);
    assert.equal(session.getSnapshot().contents.initiatives[0].rows[0].amounts[5],'777');
    await session.travelOperation(1,async()=>handle);
    assert.equal(session.getSnapshot().contents.initiatives[0].rows[0].amounts[6],'131');
  }
  const late=new api.AutoSave(async()=>{},100000);
  const original={rows:[{id:'a',amounts:{4:'1',5:'2',6:'3'},overrides:{2:{4:'0'}}}],note:'前'};
  late.begin(original);late.change({...original,note:'今回'});await late.flush();
  late.change({...late.getSnapshot().draft,rows:[{...original.rows[0],amounts:{4:'1',5:'2',6:'4'},overrides:{2:{}}}]});
  late.syncSaved({rows:[{...original.rows[0],amounts:{4:'1',5:'777',6:'3'}},{id:'external-row',amounts:{4:'9'}}],note:'今回'});
  const current=late.getSnapshot().draft;
  assert.equal(current.rows[0].amounts[5],'777');assert.equal(current.rows[0].amounts[6],'4');assert.equal(current.rows.length,2);
  assert.equal(current.rows[0].overrides?.[2]?.[4],undefined,'保存中に解除した明示手修正を復活しない');
  late.discard();assert.equal(late.getSnapshot().draft.rows[0].amounts[6],'3');late.end();
  console.log('PASS: 外部統合後の編集値・保存基準同期、保存中と保存後の次編集、外部月額保持、取消やり直し');
}
