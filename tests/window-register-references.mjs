import assert from 'node:assert/strict';
import { connectWindowSession } from './window-transport.mjs';

export async function verifyWindowRegisterReferences(api) {
  for (const update of [false, true]) for (const replaced of [false,true]) {
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
      let existing;
      if (update) {
        await a.dispatch({ type: 'initiative.register', draft: { ...draft, departmentId: 1, industryId: initial.departments[0].industryIds[0] } });
        existing = a.getSnapshot().contents.initiatives[0];
      }
      const requested = update ? { ...api.initiativeDraft(existing), departmentId: draft.departmentId, industryId: draft.industryId } : draft;
      if (update) {
        const baseline = api.windowCommandBase({type:'initiative.update',id:existing.id,draft:requested},a.getSnapshot().contents);
        assert.deepEqual(baseline.departments.map(item=>item.id),[department.id]);
        assert.equal(baseline.accounts.length,0,'未変更の科目マスタを送らない');
        assert.equal(baseline.expansions.length,0);
        const unchanged = api.windowCommandBase({type:'initiative.update',id:existing.id,draft:api.initiativeDraft(existing)},a.getSnapshot().contents);
        for(const key of ['accounts','expansions','expansionCategories','periodTypes','departments','industries']) assert.deepEqual(unchanged[key],[],'通常編集は対象施策だけを基準にする');
      }
      let release;a.activation=new Promise(resolve=>{release=resolve;});
      const pending=a.dispatch(update ? {type:'initiative.update',id:existing.id,draft:requested} : {type:'initiative.register',draft:requested});
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
        assert.equal((await api.readPlanContents(stored)).initiatives.length,update ? 1 : 0);
        if (update) assert.equal((await api.readPlanContents(stored)).initiatives[0].departmentId, existing.departmentId);
        assert.equal(requested.rows[0].amounts[4],'123.456','送信した入力を変更しない');
        if (update) {
          const current=a.getSnapshot().contents;
          const recovered=api.reconcileInitiativeDraftReferences(requested,initial,current);
          assert.equal(recovered.departmentId,null);
          assert.equal(recovered.rows[0].amounts[4],'123.456');
          await a.dispatch({type:'initiative.update',id:existing.id,draft:{...recovered,departmentId:department.id,industryId:department.industryIds[0]}});
          assert.equal((await api.readPlanContents(stored)).initiatives[0].departmentId,department.id,'再選択した場合だけ新しい部署へ保存');
        }
      } else {
        await pending;
        const saved=(await api.readPlanContents(stored)).initiatives[0];
        assert.equal(saved.departmentId,department.id);assert.equal(saved.rows[0].amounts[4],'123.456');
      }
    } finally {left.dispose();right.dispose();}
  }
  console.log('PASS: 登録待ちの部署再作成を拒否し、同一識別子の改名は登録を許す');
}
