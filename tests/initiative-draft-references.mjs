import assert from 'node:assert/strict';

export async function verifyInitiativeDraftReferences(api) {
  const bytes = await api.createTriadicDatabase(2026);
  const before = await api.readPlanContents(bytes);
  const department = before.departments.at(-1), industry = before.industries.at(-1);
  const draft = { ...api.createInitiativeDraft('2026'), name: '保持中の施策', note: '入力を保持', departmentId: department.id,
    industryId: industry.id, expansionId: before.expansions[0].id, expansionCategoryId: before.expansionCategories[0].id,
    periodTypeId: before.periodTypes[0].id,
    rows: [{ id: 'draft-row', accountId: before.accounts[0].id, amounts: { 4: '123.456' }, overrides: { 2: { 4: '0' } }, invalidAmounts: { 1: { 5: { value: '不正', previous: '0' } } } }] };
  let replacedBytes = await api.changeDepartmentMaster(bytes, { type: 'delete', id: department.id });
  replacedBytes = await api.changeDepartmentMaster(replacedBytes, { type: 'add', departmentName: '再作成した部署', industryIds: department.industryIds });
  const replaced = await api.readPlanContents(replacedBytes);
  assert.equal(replaced.departments.at(-1).id, department.id);
  assert.notEqual(replaced.departments.at(-1).identity, department.identity);
  const reset = api.reconcileInitiativeDraftReferences(draft, before, replaced);
  assert.equal(reset.departmentId, null);
  assert.equal(reset.industryId, null);
  assert.equal(reset.name, draft.name);
  assert.equal(reset.note, draft.note);
  assert.equal(reset.rows[0], draft.rows[0], '金額・手修正・不正入力の一時値をそのまま保持');
  const renamed = { ...before, departments: before.departments.map(d => d.id === department.id ? { ...d, departmentName: '同じ部署の改名' } : d),
    industries: before.industries.map(i => i.id === industry.id ? { ...i, industryName: '同じ業種の改名' } : i) };
  assert.equal(api.reconcileInitiativeDraftReferences(draft, before, renamed), draft);
  const other = { ...before, departments: [...before.departments, { id: 500, identity: 'new', departmentName: '無関係', industryIds: [industry.id] }] };
  assert.equal(api.reconcileInitiativeDraftReferences(draft, before, other), draft);
  const industryReset = api.reconcileInitiativeDraftReferences(draft, before, { ...before, industries: before.industries.map(i => i.id === industry.id ? { ...i, identity: 'replacement' } : i) });
  assert.equal(industryReset.departmentId, department.id);
  assert.equal(industryReset.industryId, null);
  const membershipReset = api.reconcileInitiativeDraftReferences(draft, before, { ...before, departments: before.departments.map(d => d.id === department.id ? { ...d, industryIds: [1] } : d) });
  assert.equal(membershipReset.industryId, null);
  for (const [collection, field, name] of [['accounts','accountId','accountName'], ['expansions','expansionId','expansionName'], ['expansionCategories','expansionCategoryId','categoryName'], ['periodTypes','periodTypeId','periodName']]) {
    const id = field === 'accountId' ? draft.rows[0].accountId : draft[field];
    const expected = { ...before[collection].find(item => item.id === id), [name]: '変更後の名称' };
    const after = { ...before, [collection]: before[collection].map(item => item.id === id ? expected : item) };
    const reconciled = api.reconcileInitiativeDraftReferences(draft, before, after);
    assert.equal(field === 'accountId' ? reconciled.rows[0].accountId : reconciled[field], null);
    assert.equal(api.reconcileInitiativeDraftReferences(draft, before, after, { collection, id, expected }), draft, '同じ画面で保存した改名は保持');
  }
  assert.equal(api.reconcileInitiativeDraftReferences(reset, replaced, before).departmentId, null, '再試行・取消で旧選択を復活させない');
  for (const count of [100, 500, 1000]) {
    let idReads = 0;
    const accounts = Array.from({ length: count }, (_, index) => ({ ...before.accounts[0],
      get id() { idReads++; return index + 1; }, accountCode: String(index).padStart(3, '0') }));
    const repeated = { ...draft, rows: Array.from({ length: 1000 }, (_, index) => ({ ...draft.rows[0], id: `row-${index}`, accountId: count })) };
    const indexedPlan = { ...before, accounts };
    assert.equal(api.reconcileInitiativeDraftReferences(repeated, indexedPlan, indexedPlan), repeated);
    assert.ok(idReads <= 2 * count, `科目IDの照合は行数ではなく科目数に比例: ${count}科目、${idReads}回`);
  }
  const repeated = { ...draft, rows: [draft.rows[0], { ...draft.rows[0], id: 'repeat' }, { ...draft.rows[0], id: 'empty', accountId: null }] };
  for (const accounts of [[], before.accounts.map(a => ({ ...a, accountType: a.accountType === 'expense' ? 'sales' : 'expense' }))]) {
    const reconciled = api.reconcileInitiativeDraftReferences(repeated, before, { ...before, accounts });
    assert.deepEqual(reconciled.rows.map(row => row.accountId), [null, null, null]);
    assert.equal(reconciled.rows[0].amounts, draft.rows[0].amounts);
    assert.equal(reconciled.rows[0].overrides, draft.rows[0].overrides);
    assert.equal(reconciled.rows[0].invalidAmounts, draft.rows[0].invalidAmounts);
    assert.equal(reconciled.rows[2], repeated.rows[2]);
  }
  console.log('PASS: 未登録施策の部署再作成・業種同一性・所属・各マスタの保護、改名と無関係変更、金額と一時値保持');
}
