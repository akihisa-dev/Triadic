import assert from 'node:assert/strict';
export function verifyPreviousGridTable(api, seed) {
  const months = [4,5,6,7,8,9,10,11,12,1,2,3];
  const expected = (contents, draft) => api.buildCostTable(contents.accounts, contents.aggregations, [], contents.fiscalYear,
    new Map(draft.rows.map(row => [row.accountId, Object.fromEntries(months.map(month => [month, api.isValidAmount(row.amounts[month] || '0') ? api.amountToYen(row.amounts[month] || '0') : 0]))])));
  const draftFor = contents => ({ previousKind: 1, industryId: 1, departmentId: 1,
    rows: contents.accounts.map(account => ({ accountId: account.id, amounts: Object.fromEntries(months.map(month => [month, '1'])) })) });
  let draft = draftFor(seed);
  const calculate = api.previousGridCalculator(seed);
  let before = calculate(draft);
  assert.deepEqual(before.rows, expected(seed, draft));
  for (const text of ['1.001','-0.001','999999999999.999','文字','', '2']) {
    const row = { ...draft.rows[0], amounts: { ...draft.rows[0].amounts, 4: text } };
    draft = { ...draft, rows: [row, ...draft.rows.slice(1)] };
    const after = calculate(draft);
    if (!after.calculationFailed || !api.isValidAmount(text || '0')) assert.deepEqual(after.rows, expected(seed, draft));
    if (text === '文字') assert.equal(after.calculationFailed, true);
    if (!after.calculationFailed && !before.calculationFailed) {
      const id = draft.rows[1].accountId;
      assert.equal(after.rows.find(item => item.kind === 'account' && item.id === id), before.rows.find(item => item.kind === 'account' && item.id === id), '別科目の行参照を保持');
    }
    before = after;
  }
  assert.equal(calculate(draft), before, '入力配列が同じ間は計算結果を再利用');
  for (const count of [300,600,900]) {
    const contents = { ...seed, accounts: [...seed.accounts, ...Array.from({ length: count - seed.accounts.length }, (_, index) => ({ ...seed.accounts[0], id: 10000 + index, accountCode: String(10000 + index), accountName: `負荷科目${index}` }))] };
    let input = draftFor(contents), incremental = api.previousGridCalculator(contents);
    incremental(input);
    const start = performance.now();
    for (let index = 0; index < 30; index++) {
      input = { ...input, rows: [{ ...input.rows[0], amounts: { ...input.rows[0].amounts, 4: String(index) } }, ...input.rows.slice(1)] };
      assert.deepEqual(incremental(input).rows, expected(contents, input));
    }
    console.log(`前年入力${count}科目: 30編集の増分・従来計算の一致確認${(performance.now() - start).toFixed(1)}ms`);
  }
  const account = seed.accounts[0];
  const chain = Array.from({ length: 10000 }, (_, index) => ({ id: 10000 + index, name: `深い集計${index}`, required: null, members: [{ kind: index ? 'group' : 'account', id: index ? 9999 + index : account.id, sign: 1 }] }));
  const deep = { ...seed, accounts: [account], aggregations: [...chain, ...seed.aggregations.filter(group => group.required).map(group => ({ ...group, members: group.required === 'sales' ? [{ kind: 'group', id: chain.at(-1).id, sign: 1 }] : [] }))] };
  api.validateAggregations(deep.aggregations, new Set([account.id]));
  const incremental = api.previousGridCalculator(deep);
  const first = draftFor(deep);
  assert.equal(incremental(first).calculationFailed, false);
  const edited = { ...first, rows: [{ ...first.rows[0], amounts: { ...first.rows[0].amounts, 4: '2' } }] };
  const changed = incremental(edited);
  assert.equal(changed.calculationFailed, false, '合法な深い集計も小額の増分編集が成功');
  assert.deepEqual(changed.rows, expected(deep, edited), '10000階層も全量と増分が一致');
  const recovery = api.previousGridCalculator(seed);
  const overflowing = draftFor(seed);
  overflowing.rows = overflowing.rows.map(row => ({ ...row, amounts: Object.fromEntries(months.map(month => [month, '9007199254740.991'])) }));
  assert.equal(recovery(overflowing).calculationFailed, true, '集計の整数上限超過を通知');
  const cleared = { ...overflowing, rows: overflowing.rows.map(row => ({ ...row, amounts: Object.fromEntries(months.map(month => [month, '0'])) })) };
  assert.equal(recovery(cleared).calculationFailed, false, '超過解消後に再計算');
  assert.deepEqual(recovery(cleared).rows, expected(seed, cleared));
  console.log('PASS: 前年の増分集計、正負・1円・不正入力・回復、影響のない行の参照保持、300/600/900科目');
}
