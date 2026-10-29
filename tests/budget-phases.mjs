import assert from 'node:assert/strict';

export async function verifyBudgetPhases(api) {
  const original = await api.createTriadicDatabase(2026);
  const contents = await api.readPlanContents(original);
  const base = { ...api.createInitiativeDraft('2026'), name: '一次から作成', expansionId: contents.expansions[0].id,
    industryId: contents.industries[0].id, departmentId: contents.departments[0].id,
    rows: [{ accountId: contents.accounts.find(account => account.accountType === 'sales').id, amounts: { 4: '100', 5: '50' }, overrides: { 2: { 5: '0' } } }] };
  let bytes = await api.registerInitiative(original, api.draftForPhase(base, 1));
  bytes = await api.registerInitiative(bytes, api.draftForPhase({ ...base, name: '確定から作成' }, 2));
  const both = await api.readPlanContents(bytes);
  const primary = api.contentsForPhase(both, 1), final = api.contentsForPhase(both, 2);
  assert.deepEqual(primary.initiatives.map(i => i.name), ['一次から作成']);
  assert.deepEqual(final.initiatives.map(i => i.name), ['一次から作成', '確定から作成']);
  assert.deepEqual(final.budgetPrevious, { 1: 1, 2: 2, display: 2 });
  assert.deepEqual(primary.budgetPrevious, { 1: 1, 2: 2, display: 1 });
  assert.deepEqual(primary.kindSelections['cost-table'], [1]);
  assert.deepEqual(final.kindSelections['cost-table'], [1, 2]);
  for (const name of ['accounts', 'expansions', 'expansionCategories', 'industries', 'departments', 'periodTypes', 'aggregations', 'kinds']) {
    assert.equal(primary[name], both[name]); assert.equal(final[name], both[name]);
    assert.deepEqual(both[name], contents[name]);
  }
  assert.equal(api.resolvedAmount(final.initiatives[1].rows[0], 1, 4), '0');
  assert.equal(api.resolvedAmount(final.initiatives[1].rows[0], 2, 4), '100');
  assert.equal(api.resolvedAmount(final.initiatives[1].rows[0], 2, 5), '0');
  const accountId = base.rows[0].accountId;
  const comparison = { ...both, previousAmounts: [1, 2].map(previousKind => ({ id: previousKind, revision: 0,
    previousKind, accountId, industryId: base.industryId, departmentId: base.departmentId, month: 4,
    amount: previousKind === 1 ? '10' : '20' })) };
  const primaryView = api.contentsForPhase(comparison, 1), finalView = api.contentsForPhase(comparison, 2);
  const rowFor = (view, kinds) => api.buildCostComparison(view, kinds).rows.find(row => row.kind === 'account' && row.id === accountId);
  assert.equal(rowFor(primaryView, [1]).values[1][4], 110000);
  assert.deepEqual(rowFor(finalView, [1, 2]).values.slice(0, 2).map(values => values[4]), [110000, 220000]);
  assert.deepEqual(api.buildKindExpansionTable(finalView, [1, 2], 'registered').total.slice(0, 2).map(values => values[4].sales), [110000, 220000]);
  assert.deepEqual(api.buildDashboard(finalView, [1, 2]).budgets.map(entry => api.dashboardAmounts(entry.months).sales), [160000, 220000]);
  const item = both.initiatives[0];
  const draft = api.initiativeDraft(item);
  bytes = await api.updateInitiative(bytes, item.id, item.fiscalYear, { ...draft,
    rows: draft.rows.map(row => ({ ...row, amounts: { ...row.amounts, 4: '120', 5: '70' } })) });
  const reloaded = await api.readPlanContents(bytes);
  assert.equal(api.resolvedAmount(reloaded.initiatives[0].rows[0], 2, 4), '120');
  assert.equal(api.resolvedAmount(reloaded.initiatives[0].rows[0], 2, 5), '0');
  assert.deepEqual(api.contentsForPhase(reloaded, 1).initiatives.map(i => i.name), ['一次から作成']);
  assert.equal(reloaded.initiatives[1].createdKind, 2);
  // The origin cannot be changed through updates or malformed saved data.
  const db = await api.openTriadicDatabase(bytes);
  try {
    assert.throws(() => db.run('UPDATE initiatives SET created_kind=1 WHERE id=?', [reloaded.initiatives[1].id]), /作成フェーズ/);
    assert.throws(() => db.run('UPDATE initiatives SET created_kind=9 WHERE id=?', [reloaded.initiatives[0].id]), /作成フェーズ/);
  } finally { db.close(); }
  assert.deepEqual(await api.readPlanContents(original), contents);
  console.log('PASS: フェーズ別表示・基準前年、確定作成と明示0の再読込、未修正月の追従、共通マスタ不変、不正な作成フェーズ拒否');
}
