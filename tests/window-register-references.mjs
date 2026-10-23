import assert from 'node:assert/strict';
import { connectWindowSession } from './window-transport.mjs';

export async function verifyWindowRegisterReferences(api) {
  for (const replaced of [false,true]) {
    let stored=await api.createTriadicDatabase(2026), writes=0;
    const handle={name:'参照待ち.triadic',isSameEntry:async other=>other===handle,queryPermission:async()=> 'granted',
      getFile:async()=>new File([stored],'参照待ち.triadic'),
      createWritable:async()=>{let next;return {write:async value=>{next=new Uint8Array(value).slice();},close:async()=>{stored=next;writes++;},abort:async()=>{}};}};
    const hub=new api.WindowSessionHub(), left=connectWindowSession(api,hub),right=connectWindowSession(api,hub);
    const a=left.session,b=right.session;
    try {
      await a.open({name:handle.name,handle,bytes:stored});await b.open({name:handle.name,handle,bytes:stored});
      const initial=a.getSnapshot().contents, department=initial.departments.find(item=>item.id===2);
      const draft={...api.createInitiativeDraft('2026'),name:'確認待ちの施策',expansionId:1,industryId:department.industryIds[0],departmentId:department.id,
        rows:[{id:'pending-row',accountId:initial.accounts[0].id,amounts:{4:'123.456'}}]};
      let release;a.activation=new Promise(resolve=>{release=resolve;});
      const pending=a.dispatch({type:'initiative.register',draft});
      if (replaced) {
        await b.dispatch({type:'department',change:{type:'delete',id:department.id}});
        await b.dispatch({type:'department',change:{type:'add',departmentName:'再作成した別部署',industryIds:department.industryIds}});
        assert.notEqual(a.getSnapshot().contents.departments.find(item=>item.id===department.id).identity,department.identity);
      } else {
        await b.dispatch({type:'department',change:{type:'update',id:department.id,departmentName:'同じ部署の改名',industryIds:department.industryIds}});
      }
      const before=stored.slice(), count=writes;release();
      if (replaced) {
        await assert.rejects(pending,/選択先が別のデータ/);
        assert.equal(writes,count);assert.deepEqual(stored,before,'不一致時は登録せず元ファイルを保護');
        assert.equal((await api.readPlanContents(stored)).initiatives.length,0);
        assert.equal(draft.rows[0].amounts[4],'123.456','送信した入力を変更しない');
      } else {
        await pending;
        const saved=(await api.readPlanContents(stored)).initiatives[0];
        assert.equal(saved.departmentId,department.id);assert.equal(saved.rows[0].amounts[4],'123.456');
      }
    } finally {left.dispose();right.dispose();}
  }
  console.log('PASS: 登録待ちの部署再作成を拒否し、同一識別子の改名は登録を許す');
}
