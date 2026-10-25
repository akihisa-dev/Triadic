import assert from 'node:assert/strict';
export async function verifyUnicodeNames(api){
  const empty=await api.createTriadicDatabase(2026),contents=await api.readPlanContents(empty);
  const base=await api.registerInitiative(empty,{name:'通常の施策名',fiscalYear:'2026',note:'',expansionId:1,industryId:1,departmentId:1,rows:[{id:'unicode-row',accountId:contents.accounts[0].id,amounts:{4:'0.001'}}]});
  const fields=[...['accounts','expansions','industries','departments','period_types','expansion_categories','initiatives','aggregation_groups'].map(table=>[table,'name']),['accounts','display_name'],['aggregation_groups','display_name']];
  const whites=['\u3000','\u00a0','\t','\n','\r','\t\n\r\u3000\u00a0 ','\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\ufeff'];
  const snapshot=await api.createBusinessSnapshot(base);
  for(const [bytes,open,exporter] of [[base,api.openTriadicDatabase,api.exportTriadicDatabase],[snapshot,api.openBusinessSnapshot,api.exportBusinessSnapshot]])for(const [table,column] of fields)for(const whitespace of whites){
    const db=await open(bytes);let invalid;
    try{db.run(`UPDATE ${table} SET ${column} = ? WHERE id = (SELECT MIN(id) FROM ${table})`,[whitespace]);invalid=db.export();assert.throws(()=>exporter(db),`${table}.${column}の空白のみを出力しない`);}finally{db.close();}
    const unchanged=invalid.slice();await assert.rejects(open(invalid),`${table}.${column}の空白のみを読まない`);assert.deepEqual(invalid,unchanged);
    if(bytes===snapshot)await assert.rejects(api.applyOperationSnapshot(base,invalid),'不正な名称の取消スナップショットを適用しない');
  }
  for(const whitespace of ['', ' ']){
    const db=await api.openTriadicDatabase(base);let invalid;
    try{db.exec('PRAGMA ignore_check_constraints = ON');db.run('UPDATE departments SET name = ? WHERE id = 1',[whitespace]);invalid=db.export();db.exec('PRAGMA ignore_check_constraints = OFF');assert.throws(()=>api.exportTriadicDatabase(db));}finally{db.close();}
    await assert.rejects(api.validateTriadicDatabase(invalid));
  }
  const normal=await api.openTriadicDatabase(base);
  try{
    normal.run('UPDATE accounts SET name = ?, display_name = NULL WHERE id = ?',['\u3000有効 な科目\u00a0',contents.accounts[0].id]);
    normal.run('UPDATE aggregation_groups SET display_name = NULL WHERE id = ?',[contents.aggregations[0].id]);
    const saved=api.exportTriadicDatabase(normal),read=await api.readPlanContents(saved);
    assert.equal(read.accounts[0].accountName,'\u3000有効 な科目\u00a0','有効な保存名を書き換えない');await api.validateTriadicDatabase(saved);
  }finally{normal.close();}
  console.log('PASS: 全名称・任意表示名のUnicode空白拒否、通常ファイル・履歴スナップショットの読込/出力/取消、有効名とNULLの保持、元bytes不変');
}
