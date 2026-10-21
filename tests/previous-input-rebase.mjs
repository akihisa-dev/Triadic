import assert from 'node:assert/strict';
export async function verifyPreviousInputRebase(api) {
  const empty=await api.createTriadicDatabase(2026),contents=await api.readPlanContents(empty),account=contents.accounts[0].id,second=contents.accounts[1].id;
  const full=bytes=>api.readPlanContents(bytes).then(c=>api.createPreviousInput(c,1,1));
  const change=(input,id,month,value)=>({...input,rows:input.rows.map(row=>row.accountId===id?{...row,amounts:{...row.amounts,[month]:value}}:row)});
  const input=await full(empty);
  const left=await api.savePreviousAmounts(empty,change(input,account,4,'0.001'));
  const right=await api.savePreviousAmounts(empty,change(input,account,5,'-0.001'));
  assert.equal((await api.readPlanContents(left)).previousAmounts.length,1,'未入力の0を全セルに作らない');
  for(const [a,b] of [[left,right],[right,left]]) {
    const merged=await api.rebasePlan(empty,a,b);assert.ok(merged?.operation,'全科目12か月の入力でも異なる月を統合');
    const amounts=(await api.readPlanContents(merged.bytes)).previousAmounts;
    assert.equal(amounts.find(v=>v.accountId===account&&v.month===4).amount,'0.001');
    assert.equal(amounts.find(v=>v.accountId===account&&v.month===5).amount,'-0.001');
    for(const snapshot of [merged.operation.before,merged.operation.after])await api.validateTriadicDatabase(await api.applyOperationSnapshot(merged.bytes,snapshot));
  }
  const sameInput=await full(left),same=await api.savePreviousAmounts(left,sameInput);assert.deepEqual((await api.readPlanContents(same)).previousAmounts,(await api.readPlanContents(left)).previousAmounts,'同額の再保存はセルを更新しない');
  const zero=await api.savePreviousAmounts(left,change(sameInput,account,4,'0'));
  assert.equal((await api.readPlanContents(zero)).previousAmounts[0].amount,'0');
  const zeros=await full(zero),next=await api.savePreviousAmounts(zero,change(zeros,account,5,'12'));
  const zeroBefore=(await api.readPlanContents(zero)).previousAmounts[0];
  assert.deepEqual((await api.readPlanContents(next)).previousAmounts.find(v=>v.month===4),zeroBefore,'保存済み0のIDとrevisionを保持');
  const other=await api.savePreviousAmounts(empty,change(input,second,4,'2'));
  assert.ok(await api.rebasePlan(empty,left,other),'別科目も統合');
  const conflict=await api.savePreviousAmounts(empty,change(input,account,4,'3'));
  assert.equal(await api.rebasePlan(empty,left,conflict),null,'同じセルの相反変更は拒否');
  const restored=await api.savePreviousAmounts(zero,change(zeros,account,4,'0.001'));
  const independent=await api.savePreviousAmounts(left,change(sameInput,account,5,'4'));
  assert.ok(await api.rebasePlan(left,restored,independent),'元の額へ戻したrevisionだけの差は競合にしない');
  for(const month of [0,13,4.5])await assert.rejects(api.savePreviousAmounts(empty,{ previousKind: 1,...input,rows:[{accountId:account,amounts:{[month]:'0'}}]}));
  let stored=right;
  const handle={name:'前年入力.triadic',async getFile(){return new File([stored],this.name);},async createWritable(){let value;return {async write(bytes){value=new Uint8Array(bytes).slice();},async close(){stored=value;},async abort(){}};}};
  const session=new api.PlanSession();await session.open({...contents,bytes:empty,name:handle.name,handle});
  const controller=new api.AutoSave(async draft=>{const saved=await session.dispatch({type:'settings',change:{type:'previous',input:draft}},async()=>handle);controller.syncSaved(api.createPreviousInput(saved,1,1));},100000);
  controller.begin(input);controller.change(change(input,account,4,'0.001'));await controller.flush();
  assert.equal(controller.getSnapshot().draft.rows[0].amounts[5],'-0.001','統合した外部セルを下書きに反映');
  controller.change(change(controller.getSnapshot().draft,account,6,'0.002'));await controller.flush();controller.end();
  const actual=(await api.readPlanContents(stored)).previousAmounts;
  assert.equal(actual.find(v=>v.month===5).amount,'-0.001');assert.equal(actual.find(v=>v.month===6).amount,'0.002');
  await session.travelOperation(-1,async()=>handle);assert.equal(session.getSnapshot().contents.previousAmounts.find(v=>v.month===5).amount,'-0.001');
  await session.travelOperation(1,async()=>handle);assert.equal(session.getSnapshot().contents.previousAmounts.find(v=>v.month===6).amount,'0.002');
  console.log('PASS: 前年全セル下書きの独立編集統合、同額・未入力0の無更新、既存0保持、同セル競合、revision差、実保存と後続入力・取消');
}
