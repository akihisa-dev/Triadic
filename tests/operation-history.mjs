import assert from 'node:assert/strict';
export async function verifyOperationHistoryTransfer(api) {
  const initial=await api.createTriadicDatabase(2026);
  const snapshot=await api.createBusinessSnapshot(initial);
  const SQL=await api.initializeSqlite();
  const state=async bytes=>{const db=await api.openTriadicDatabase(bytes);try{return db.exec('SELECT * FROM data_history_state')[0].values;}finally{db.close();}};
  const payloads=async bytes=>{const db=await api.openTriadicDatabase(bytes);try{return db.exec('SELECT id, recorded_at, snapshot FROM data_history ORDER BY id')[0]?.values??[];}finally{db.close();}};
  for(const count of [3,10,40]){
    const db=await api.openTriadicDatabase(initial);
    for(let id=1;id<=count;id++) db.run('INSERT INTO data_history VALUES (?, ?, ?)',[id,`2026-01-01T00:00:${String(id).padStart(2,'0')}.000Z`,snapshot]);
    db.run("UPDATE data_history_state SET next_id=?, dirty_since='2026-01-01T00:01:00.000Z'",[count+5]);
    db.run('DELETE FROM data_history WHERE id=2');
    let stored=await api.exportTriadicDatabase(db);db.close();
    const expected=await payloads(stored);
    const session=new api.PlanSession();
    let failure=false,permission='granted';
    const handle={name:'履歴転記.triadic',async getFile(){return new File([stored],this.name)},async queryPermission(){return permission},async createWritable(){let pending;return {async write(value){pending=new Uint8Array(value)},async close(){if(failure)throw new Error('保存失敗');stored=pending},async abort(){}}}};
    const forbidden=async()=>{throw new Error('保存先を求めない')};
    await session.open({bytes:stored,name:handle.name,handle});
    await session.dispatch({type:'settings',change:{type:'selection',screen:'cost-table',selected:[1,2]}},forbidden);
    const expectedState=await state(stored);
    const copied=await api.applyOperationSnapshot(stored,snapshot);
    assert.deepEqual(await state(copied),expectedState,"転記自体はsaved_atを含む管理状態を全保持");
    assert.deepEqual(await payloads(copied),expected);
    const originalExec=SQL.Database.prototype.exec;
    let calls=0,maxRows=0,maxBytes=0;
    SQL.Database.prototype.exec=function(sql,params){
      const result=originalExec.call(this,sql,params);
      if(/^SELECT id, recorded_at, snapshot FROM data_history/.test(sql)){
        const rows=result[0]?.values??[];calls++;maxRows=Math.max(maxRows,rows.length);maxBytes=Math.max(maxBytes,rows.reduce((sum,r)=>sum+r[2].byteLength,0));
      }
      return result;
    };
    try{
      for(const direction of [-1,1]){
        await session.travelOperation(direction,forbidden);
        assert.deepEqual(session.getSnapshot().contents.kindSelections['cost-table'],direction===-1?[1]:[1,2]);
      }
    }finally{SQL.Database.prototype.exec=originalExec;}
    assert.ok(calls>=2*count);assert.equal(maxRows,1);assert.equal(maxBytes,snapshot.byteLength,'履歴件数に依存せず一度に1件のBLOBだけを取得');
    assert.deepEqual(await payloads(stored),expected,'削除済みの履歴を戻さず、全ID・日時・BLOBを維持');assert.deepEqual((await state(stored)).map(row=>row.slice(0,4)),expectedState.map(row=>row.slice(0,4)),"通常保存のsaved_at更新以外の管理状態を維持");
    for(const mode of ['failure','permission','external']){
      const before=session.getSnapshot(),saved=stored.slice();
      failure=mode==='failure';permission=mode==='permission'?'denied':'granted';
      if(mode==='external') stored=await api.saveKindSelection(stored,'initiative-list',[1]);
      const external=stored.slice();
      await assert.rejects(session.travelOperation(-1,forbidden));
      assert.equal(session.getSnapshot().contents,before.contents);assert.equal(session.getSnapshot().canUndo,before.canUndo);assert.equal(session.getSnapshot().canRedo,before.canRedo);assert.deepEqual(stored,external);
      stored=saved;failure=false;permission='granted';
    }
    await session.travelOperation(-1,forbidden);await session.travelOperation(1,forbidden);
  }
  const tracked=await api.trackHistoryChange(initial,await api.saveKindSelection(initial,'cost-table',[1,2]));
  const history=await api.recordDataHistory(tracked,new Date().toISOString(),true);
  const selected=(await api.readDataHistory(history)).entries[0].id;
  for(const restore of [() => api.restoreDataHistory(history,selected), () => api.applyOperationSnapshot(history,snapshot)]) {
    const before=history.slice(), touched=new Set(), closed=new Set();
    const originalRun=SQL.Database.prototype.run, originalExec=SQL.Database.prototype.exec, originalClose=SQL.Database.prototype.close;
    let inserted=0;
    SQL.Database.prototype.exec=function(...args){touched.add(this);return originalExec.apply(this,args)};
    SQL.Database.prototype.run=function(sql,...args){
      touched.add(this);
      if(sql==='INSERT INTO data_history VALUES (?, ?, ?)' && ++inserted===2) throw new Error('履歴転記の途中失敗');
      return originalRun.call(this,sql,...args);
    };
    SQL.Database.prototype.close=function(){closed.add(this);return originalClose.call(this)};
    try {await assert.rejects(restore(),/履歴転記の途中失敗/)}
    finally {SQL.Database.prototype.run=originalRun;SQL.Database.prototype.exec=originalExec;SQL.Database.prototype.close=originalClose}
    assert.equal(inserted,2);
    assert.ok([...touched].every(db=>closed.has(db)),'途中失敗でも全作業接続を解放');
    assert.deepEqual(history,before,'復元元の履歴と業務内容を保持');
    await api.validateTriadicDatabase(await restore());
  }
  console.log('PASS: 取消・やり直しの履歴転記3/10/40件、取得1行・1BLOB上限、ID・日時・BLOB・状態・削除維持、失敗・拒否・外部変更と再試行');
}
