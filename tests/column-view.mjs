import assert from 'node:assert/strict';

export async function verifyColumnView(api) {
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
