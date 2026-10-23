import assert from 'node:assert/strict';
import { connectWindowSession } from './window-transport.mjs';

export async function verifyWindowMasterOrder(api) {
  let stored=await api.createTriadicDatabase(2026), writes=0;
  const handle={name:'表示順.triadic',isSameEntry:async other=>other===handle,queryPermission:async()=> 'granted',
    getFile:async()=>new File([stored],'表示順.triadic'),
    createWritable:async()=>{let next;return {write:async value=>{next=new Uint8Array(value).slice();},close:async()=>{stored=next;writes++;},abort:async()=>{}};}};
  const hub=new api.WindowSessionHub(), left=connectWindowSession(api,hub),right=connectWindowSession(api,hub);
  const a=left.session,b=right.session;
  const order=contents=>api.orderedMasterRows(contents.accounts,contents.aggregations);
  try {
    await a.open({name:handle.name,handle,bytes:stored});await b.open({name:handle.name,handle,bytes:stored});
    const initial=a.getSnapshot().contents, original=order(initial), reversed=[...original].reverse(), account=initial.accounts[0];
    let release;a.activation=new Promise(resolve=>{release=resolve;});
    const edit=a.dispatch({type:'account',change:{type:'update',id:account.id,accountCode:account.accountCode,
      accountName:'改名後',accountType:account.accountType,displayName:account.displayName,presentationOrder:original}});
    await b.dispatch({type:'aggregation',change:{type:'reorder',order:reversed}});release();await edit;
    let latest=await api.readPlanContents(stored);
    assert.deepEqual(order(latest),reversed,'名称だけの保存で他画面の並べ替えを戻さない');
    assert.equal(latest.accounts.find(item=>item.id===account.id).accountName,'改名後');
    const before=stored.slice(), count=writes;
    let finish;a.activation=new Promise(resolve=>{finish=resolve;});
    const stale=a.dispatch({type:'aggregation',change:{type:'reorder',order:original}});
    await b.dispatch({type:'aggregation',change:{type:'reorder',order:[...reversed.slice(1),reversed[0]]}});
    const newest=order(b.getSnapshot().contents);finish();
    await assert.rejects(stale,/表示順が別の画面で変更/);
    latest=await api.readPlanContents(stored);
    assert.deepEqual(order(latest),newest,'競合した明示的な並べ替えだけを拒否');
    assert.equal(writes,count+1);assert.notDeepEqual(stored,before);
    await a.dispatch({type:'account',change:{type:'update',id:account.id,accountCode:account.accountCode,
      accountName:'もう一度改名',accountType:account.accountType,displayName:account.displayName,presentationOrder:reversed}});
    assert.deepEqual(order(await api.readPlanContents(stored)),newest,'古い表示順を付けた再編集も最新順を維持');
  } finally {left.dispose();right.dispose();}
  console.log('PASS: 属性編集は他画面の表示順を戻さず、明示的な同時並べ替えは拒否する');
}
