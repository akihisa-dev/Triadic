import assert from 'node:assert/strict';

export async function verifyInitiativeListRendering(api) {
  for (const kind of [1, 2]) {
    const overflow = await api.readPlanContents(await api.createInitiativeOverflowPlan(kind));
    const rendered = api.renderInitiativeList(overflow, kind);
    assert.match(rendered, /範囲を超えています/);
    assert.match(rendered, /<button[^>]*>上限確認A<\/button>/, '両種別で超過施策の編集導線を残す');
    assert.match(rendered, /通常確認<\/button>/, '正常行も引き続き表示する');
    const safeKind = kind === 1 ? 2 : 1;
    assert.doesNotMatch(api.renderInitiativeList(overflow, safeKind), /role="alert"/);
  }
  let bytes = await api.createTriadicDatabase(2026);
  const accounts = (await api.readPlanContents(bytes)).accounts;
  const accountId = accounts.find(account => account.accountType === 'sales').id;
  const draft = { ...api.createInitiativeDraft('2026'), name: '施策内上限確認', expansionId: 1, industryId: 1, departmentId: 1,
    rows: [1, 2].map(() => ({ accountId, amounts: { 4: '0' }, overrides: { 2: { 4: '5000000000000' } } })) };
  bytes = await api.registerInitiative(bytes, draft);
  bytes = await api.registerInitiative(bytes, { ...draft, name: '通常確認', rows: [{ accountId, amounts: { 4: '1' }, overrides: { 2: { 4: '2' } } }] });
  const contents = await api.readPlanContents(bytes);
  const before = structuredClone(contents);
  const unclassified = { ...contents, accounts: contents.accounts.map(account => account.id === accountId ? { ...account, accountType: null } : account) };
  assert.match(api.renderInitiativeList(unclassified, 2), /initiative-attribute-hint/, '未集計の金額を持つ施策へ表示する');
  assert.doesNotMatch(api.renderInitiativeList(contents, 2), /initiative-attribute-hint/, '属性修正後に解除する');
  const zeroPlan = { ...unclassified, initiatives: unclassified.initiatives.map(item => ({ ...item, rows: item.rows.map(row => ({ ...row, amounts: {}, overrides: {} })) })) };
  assert.doesNotMatch(api.renderInitiativeList(zeroPlan, 2), /initiative-attribute-hint/, '0だけの施策には表示しない');

  const viewForKind = api.createInitiativeListView(contents.initiatives, accounts, '2026');
  const primaryView = viewForKind(1);
  const confirmedView = viewForKind(2);
  assert.equal(viewForKind(1), primaryView, '種別を戻すと同じ検証済みの計算結果と合計を再利用');
  assert.equal(viewForKind(2), confirmedView);
  assert.equal(primaryView.errors.size, 0);
  assert.deepEqual(primaryView.totals, api.initiativeTotals(api.initiativesForKind(contents.initiatives, accounts, 1)));
  assert.equal(confirmedView.source[0].calculation, 'failed');
  assert.equal('months' in confirmedView.source[0], false);
  assert.equal(confirmedView.source[1].calculation, 'ready');
  assert.equal(confirmedView.errors.size, 1, '上限超過した施策を種別ごとに隔離する');
  assert.equal(confirmedView.totals, null, '一部の施策を除外した不完全な合計を出さない');
  assert.equal(confirmedView.source[1].months[4].sales, 2000);
  const changedAccounts = accounts.map(account => account.id === accountId ? { ...account, accountType: 'expense' } : account);
  const changedView = api.createInitiativeListView(contents.initiatives, changedAccounts, '2026')(1);
  assert.equal(changedView.source[1].months[4].sales, 0, '科目属性の変更後は新しい計算元から求める');
  assert.equal(changedView.source[1].months[4].expense, 1000);
  const otherYear = api.createInitiativeListView(contents.initiatives, accounts, '2025')(1);
  assert.equal(otherYear.source.length, 0);
  assert.deepEqual(otherYear.totals, api.initiativeTotals([]), '年度が変わると前の年度の結果を使わない');

  assert.throws(() => api.initiativesForKind(contents.initiatives, accounts, 2), /範囲を超え/);
  const confirmed = api.renderInitiativeList(contents, 2);
  assert.match(confirmed, /role="alert"[^>]*>金額の合計が正確に計算できる範囲を超えています/);
  assert.match(confirmed, /<button[^>]*>施策内上限確認<\/button>/, '超過した施策の編集導線を残す');
  assert.match(confirmed, /通常確認<\/button>[\s\S]*?<td>2<\/td>/, '正常な施策は選択種別の金額を表示');
  assert.match(confirmed, /計算できない施策があるため、合計を表示できません/);
  assert.doesNotMatch(api.renderInitiativeList(contents, 1), /role="alert"/);
  assert.deepEqual(contents, before, '表示失敗で保存データを変更しない');
  const correction = { ...draft, rows: structuredClone(contents.initiatives[0].rows) };
  correction.rows[0].overrides[2][4] = '1';
  const corrected = await api.updateInitiative(bytes, contents.initiatives[0].id, 2026, correction);
  const correctedContents = await api.readPlanContents(corrected);
  assert.doesNotMatch(api.renderInitiativeList(correctedContents, 2), /role="alert"/);
  const correctedView = api.createInitiativeListView(correctedContents.initiatives, accounts, '2026')(2);
  assert.equal(correctedView.errors.size, 0, '金額修正後はエラー結果を再利用しない');
  assert.equal(correctedView.source[0].months[4].sales, 5000000000001000);
  assert.deepEqual(correctedView.totals, api.initiativeTotals(correctedView.source));
  const huge = { ...correctedContents.initiatives[1], rows: [{ accountId, amounts: { 4: '5000000000000' } }] };
  const overflowTotal = api.createInitiativeListView([huge, { ...huge, id: -1 }], accounts, '2026')(1);
  assert.equal(overflowTotal.errors.size, 0);
  assert.equal(overflowTotal.totals, null, '施策ごとには正常でも全件合計の上限超過を拒否');
  assert.match(overflowTotal.totalError, /範囲を超え/);

  assert.equal(api.initiativesForKind(correctedContents.initiatives, accounts, 2)[0].months[4].sales, 5000000000001000);
  console.log('PASS: 確定予算の施策内超過、編集導線、正常行と種別切替、元データ保持、修正保存後の再表示');
  const signedDb=await api.openTriadicDatabase(corrected);
  let signedBytes;
  try {
    signedDb.run('INSERT INTO period_types(id,name) VALUES(-1,?),(0,?)',['負ID期間','ゼロID期間']);
    signedDb.run('UPDATE initiatives SET period_type_id=-1 WHERE id=?',[correctedContents.initiatives[0].id]);
    signedDb.run('UPDATE initiatives SET period_type_id=0 WHERE id=?',[correctedContents.initiatives[1].id]);
    signedBytes=api.exportTriadicDatabase(signedDb);
  } finally {signedDb.close();}
  signedBytes=await api.registerInitiative(signedBytes,{...draft,name:'期間未選択確認',periodTypeId:null,rows:[{accountId,amounts:{4:'0'}}]});
  const signedContents=await api.readPlanContents(signedBytes);
  assert.deepEqual(signedContents.initiatives.map(item=>item.periodTypeId),[-1,0,null],'実SQLiteの読込は負IDと0と未選択を保持');
  for(const kind of [1,2]) {
    const rendered=api.renderInitiativeList(signedContents,kind);
    assert.match(rendered,/initiative-list-period">負ID期間<\/td>/);
    assert.match(rendered,/initiative-list-period">ゼロID期間<\/td>/);
    assert.match(rendered,/initiative-list-period"><\/td>[\s\S]*?期間未選択確認<\/button>/);
    const virtual={...signedContents,initiatives:Array.from({length:210},(_,index)=>({...signedContents.initiatives[index%3],id:1000+index,name:`表示${index}`}))};
    const virtualHtml=api.renderInitiativeList(virtual,kind);
    assert.match(virtualHtml,/initiative-list-period">負ID期間<\/td>/);
    assert.match(virtualHtml,/initiative-list-period"><\/td>[\s\S]*?表示2<\/button>/,'仮想表示も未選択を空欄にする');
  }

}
