import assert from 'node:assert/strict';

export async function verifyColumnView(api) {
  verifyInitiativeColumns(api);
  const rows = [
    { id: 1, name: 'Ａ施策', group: ['部署A', '部署B'], amount: 1001 },
    { id: 2, name: 'B施策', group: ['部署B'], amount: -1001 },
    { id: 3, name: 'A施策2', group: [], amount: null },
    { id: 4, name: '同額', group: ['部署B'], amount: 1001 },
    { id: 5, name: '零', group: [], amount: 0 },
  ];
  const original = structuredClone(rows);
  assert.equal(api.matchesTableFilter('A施策2', { type: 'text', text: 'A施策', exact: true }), false);
  assert.equal(api.matchesTableFilter('Ａ施策', { type: 'text', text: 'Ａ施策', exact: true }), true);
  assert.equal(api.matchesTableFilter('A施策', { type: 'text', text: 'Ａ施策', exact: true }), false);
  assert.equal(api.matchesTableFilter(null, { type: 'text', text: '', exact: true }), true);
  assert.equal(api.matchesTableFilter(['部署A', '部署B'], { type: 'text', text: '部署A・部署B', exact: true }), true);
  assert.equal(api.matchesTableFilter(['部署B'], { type: 'text', text: '部署A・部署B', exact: true }), false);
  const columns = [
    { id: 'name', label: '名称', value: row => row.name },
    { id: 'group', label: '所属', type: 'choice', value: row => row.group },
    { id: 'amount', label: '金額', type: 'number', value: row => row.amount },
  ];
  const selected = state => api.selectTableRows(rows, columns, { sort: null, filters: {}, ...state }).map(row => row.id);
  assert.deepEqual(selected({ filters: { name: { type: 'text', text: 'a 施策' } } }), [1, 3]);
  assert.deepEqual(selected({ filters: { group: { type: 'choice', values: ['部署A'] } } }), [1]);
  assert.deepEqual(selected({ filters: { group: { type: 'choice', values: [''] } } }), [3, 5]);
  assert.deepEqual(selected({ filters: { group: { type: 'choice', values: [] } } }), []);
  assert.deepEqual(selected({ filters: { group: { type: 'choice', values: ['部署B'] }, amount: { type: 'number', operator: 'negative' } } }), [2]);
  assert.deepEqual(selected({ sort: { column: 'amount', direction: 'descending' } }), [1, 4, 5, 2, 3]);
  assert.deepEqual(selected({ sort: { column: 'amount', direction: 'ascending' } }), [2, 5, 1, 4, 3]);
  assert.deepEqual(selected({ filters: { amount: { type: 'number', operator: 'range', min: 1001, max: 1001 } } }), [1, 4]);
  assert.deepEqual(selected({ filters: { amount: { type: 'number', operator: 'zero' } } }), [5]);
  assert.deepEqual(selected({ filters: { amount: { type: 'number', operator: 'blank' } } }), [3]);
  assert.deepEqual(selected({ filters: { obsolete: { type: 'text', text: 'unknown' } } }), [1, 2, 3, 4, 5]);
  assert.deepEqual(selected({ sort: { column: 'amount', direction: 'descending' }, filters: { group: { type: 'choice', values: ['部署B'] }, name: { type: 'text', text: '同額', exact: true } } }), [4]);
  assert.deepEqual(rows, original, '並べ替え・絞り込みで元の行と順序を変更しない');

  const dates = Array.from({ length: 10000 }, (_, index) => `日時${index}`);
  let reads = 0;
  const values = new Proxy(dates.slice(1), { get(target, key, receiver) {
    if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
    return Reflect.get(target, key, receiver);
  } });
  const dated = dates.map((date, id) => ({ id, date }));
  const filteredDates = api.selectTableRows(dated, [{ id: 'date', label: '記録日時', type: 'choice', value: row => row.date }], { sort: null, filters: { date: { type: 'choice', values } } });
  assert.deepEqual(filteredDates.map(row => row.id), dated.slice(1).map(row => row.id));
  assert.equal(reads, 9999, '日時候補の集合を一度作り、各履歴で選択配列を再走査しない');
  assert.deepEqual(dates[0], '日時0');
  const contents = await api.readPlanContents(await api.createSamplePlan(2026));
  const baseline = api.createExpansionTableView(contents)([2, 1]);
  const definitions = [{ id: 'name', label: '施策名', value: row => row.name },
    { id: 'amount', label: '4月利益', type: 'number', value: row => row.values[0][4].profit }];
  const state = { sort: { column: 'name', direction: 'descending' }, filters: { amount: { type: 'number', operator: 'positive' } } };
  const filtered = api.selectExpansionView(baseline, contents, definitions, state);
  const expectedIds = baseline.table.groups.flatMap(group => api.selectTableRows(group.initiatives, definitions, state)).map(row => row.id).sort((a,b)=>a-b);
  assert.deepEqual(filtered.flat.filter(row => row.item).map(row => row.item.id).sort((a,b)=>a-b), expectedIds);
  for (const { group, periods } of filtered.groups) {
    assert.equal(filtered.flat.filter(row => row.group === group).length, group.initiatives.length + 1);
    assert.equal(filtered.flat.find(row => row.group === group).groupCount, group.initiatives.length + 1);
    for (const period of periods) for (const category of period.categories) {
      assert.deepEqual(category.initiatives.map(row => row.name), category.initiatives.map(row => row.name).sort((a,b)=>b.localeCompare(a,'ja',{numeric:true})));
    }
    group.values.forEach((value, index) => assert.deepEqual(value, api.totalInitiatives(group.initiatives.map(row => ({ months: row.values[index] })))));
  }
  assert.deepEqual(filtered.table.previous, baseline.table.previous, '前年全体の値を絞り込まない');
  assert.equal(api.selectExpansionView(baseline, contents, definitions, api.emptyTableView()), baseline);
  const empty = api.selectExpansionView(baseline, contents, definitions, { sort: null, filters: { name: { type: 'text', text: '存在しない名称' } } });
  assert.equal(empty.flat.length, 0);
  assert.equal(empty.table.changes[0][4].sales, 0);

  const salesId = contents.accounts.find(row => row.accountType === 'sales').id;
  const huge = { ...contents, previousAmounts: [], initiatives: [1,2,3].map(id => ({ ...contents.initiatives[0], id, name: id === 3 ? '相殺' : `正${id}`, rows: [{ accountId: salesId, amounts: { 4: id === 3 ? '-5000000000000' : '5000000000000' } }] })) };
  const safe = api.createExpansionTableView(huge)([1]);
  const overflow = api.selectExpansionView(safe, huge, definitions, { sort: null, filters: { name: { type: 'text', text: '正' } } });
  assert.match(overflow.calculationError, /範囲/);
  assert.equal(overflow.flat.filter(row => row.item).length, 2, '絞り込み後の集計超過でも行と解除用の見出しを保持する');
  assert.equal(overflow.table.changes[0][4].sales, null);
  assert.equal(api.selectExpansionView(safe, huge, definitions, api.emptyTableView()), safe);
  console.log('PASS: 列の複合条件・円精度・空欄・安定順序・元データ保護、展開表の分類・結合長・小計・相殺後の集計超過からの復帰');
}

function verifyInitiativeColumns(api) {
  const source = [
    { id: 1, name: "施策10", expansionId: 2, periodTypeId: 1, startYearMonths: { 1: "2027-01", 2: "2026-08" } },
    { id: 2, name: "施策2", expansionId: 1, periodTypeId: 2, startYearMonths: { 1: "2026-12", 2: "2026-09" } },
    { id: 3, name: "施策2", expansionId: 1, periodTypeId: 2, startYearMonths: { 1: "2026-12", 2: "2026-07" } },
    { id: 4, name: "", expansionId: null, periodTypeId: null, startYearMonths: { 1: null, 2: null } },
  ];
  const snapshot = structuredClone(source);
  const expansions = new Map([[1, "あ行"], [2, "か行"]]);
  const periods = new Map([[1, "か行"], [2, "あ行"]]);
  const sorted = (column, direction, kind = 1) => api.selectTableRows(source, api.initiativeListColumns(expansions, periods, kind), { sort: { column, direction }, filters: {} }).map(item => item.id);
  for (const column of ["expansion", "period", "name", "start"]) {
    assert.deepEqual(sorted(column, "ascending"), [2, 3, 1, 4], `${column}: 同値は登録順・空欄は末尾`);
    assert.deepEqual(sorted(column, "descending"), [1, 2, 3, 4], `${column}: 降順でも同値と空欄の位置を維持`);
  }
  assert.deepEqual(sorted("start", "ascending", 2), [3, 1, 2, 4], "表示種別の年月を使用");
  assert.deepEqual(sorted("start", "descending", 2), [2, 1, 3, 4]);
  assert.deepEqual(api.selectTableRows(source, api.initiativeListColumns(expansions, periods, 1), api.emptyTableView()), source, "初期表示は登録順");
  assert.deepEqual(source, snapshot, "保存データを変更しない");
  assert.deepEqual(api.selectTableRows([], api.initiativeListColumns(expansions, periods, 1), { sort: { column: "name", direction: "ascending" }, filters: {} }), []);
  const signed=[null,-1,0,2,-1].map((periodTypeId,id)=>({id,periodTypeId,expansionId:periodTypeId,name:String(id),startYearMonths:{1:null,2:null}}));
  const signedNames=new Map([[-1,'あ'],[0,'か'],[2,'さ']]);
  for(const column of ['period','expansion']) for(const kind of [1,2]) {
    assert.deepEqual(api.selectTableRows(signed,api.initiativeListColumns(signedNames,signedNames,kind),{sort:{column,direction:'ascending'},filters:{}}).map(item=>item.id),[1,4,2,3,0]);
    assert.deepEqual(api.selectTableRows(signed,api.initiativeListColumns(signedNames,signedNames,kind),{sort:{column,direction:'descending'},filters:{}}).map(item=>item.id),[3,2,1,4,0],'未選択を実ID -1 と区別し、同値順を保持');
  }


  const amounts = [2, 1, -10000, null, 1].map((sales, id) => ({ id, calculation: 'ready', months: { 4: { sales } } }));
  const amountColumns = api.initiativeListColumns(expansions, periods, 1);
  const sortedAmounts = direction => api.selectTableRows(amounts, amountColumns, { sort: { column: '4:sales', direction }, filters: {} }).map(row => row.id);
  assert.deepEqual(sortedAmounts('ascending'), [2, 1, 4, 0, 3], '実画面の金額列で負数・1円差・同値・未設定を比較');
  assert.deepEqual(sortedAmounts('descending'), [0, 1, 4, 2, 3]);
  assert.deepEqual(amounts.map(row => row.months[4].sales), [2, 1, -10000, null, 1]);
}
