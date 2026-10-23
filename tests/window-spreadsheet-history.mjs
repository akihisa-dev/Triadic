import assert from 'node:assert/strict';
import { connectWindowSession } from './window-transport.mjs';

export async function verifyWindowSpreadsheetHistory(api) {
  const bytes=await api.createTriadicDatabase(2026);
  let stored=bytes;
  const handle={name:'確認待ち.triadic',isSameEntry:async other=>other===handle,queryPermission:async()=> 'granted',
    getFile:async()=>new File([stored],'確認待ち.triadic'),
    createWritable:async()=>{let next;return {write:async value=>{next=new Uint8Array(value).slice();},close:async()=>{stored=next;},abort:async()=>{}};}};
  const hub=new api.WindowSessionHub(), io=new api.SpreadsheetOperation(()=>{});
  let accept=false,closed=false;
  const a=connectWindowSession(api,hub,{controls:{confirmDiscard:async()=>accept}});
  const b=connectWindowSession(api,hub,{controls:{
    processing:()=>['reading','saving','exporting'].includes(io.getSnapshot().phase),
    draft:()=>io.getSnapshot().phase==='preview',
    discard:()=>io.cancelPreview(),
  }});
  b.session.closeWindow=()=>{closed=true;};
  try {
    await a.session.open({name:handle.name,handle,bytes});await b.session.open({name:handle.name,handle,bytes});
    const reading=io.beginReading();
    await assert.rejects(a.session.enterHistory(),/入出力の処理中/);
    assert.equal(io.getSnapshot(),reading);assert.equal(closed,false);
    const patches=[{previousKind:1,industryId:1,departmentId:1,accountId:1,month:4,before:'0',after:'1'}];
    io.complete(reading,patches);
    await assert.rejects(a.session.enterHistory(),/キャンセル/);
    assert.equal(io.getSnapshot().phase,'preview');assert.equal(io.getSnapshot().patches,patches);
    assert.equal(closed,false,'確認のキャンセルで他のウィンドウを閉じない');
    accept=true;
    await a.session.enterHistory();
    await Promise.resolve();
    assert.equal(io.getSnapshot().phase,'idle','履歴の確定後だけ確認内容を破棄');
    assert.equal(closed,true);
  } finally {a.dispose();b.dispose();}
  console.log('PASS: Excel処理中は共有履歴を停止し、確認待ちは破棄確認の取消・確定に従う');
}
