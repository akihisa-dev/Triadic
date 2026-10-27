import assert from 'node:assert/strict';

export async function verifyPreviousBaselines(api, { excel = false } = {}) {
  let bytes = await api.createTriadicDatabase(2026);
  const initial = await api.readPlanContents(bytes);
  const accountId = initial.accounts.find(item => item.accountType === 'sales').id;
  const pair = { industryId: initial.industries[0].id, departmentId: initial.departments[0].id };
  const input = (previousKind, value) => ({ ...pair, previousKind, rows: [{ accountId, amounts: { 4: value } }] });
  bytes = await api.savePreviousAmounts(bytes, input(1, '100'));
  bytes = await api.savePreviousAmounts(bytes, input(2, '110'));
  bytes = await api.registerInitiative(bytes, { ...api.createInitiativeDraft('2026'), ...pair,
    expansionId: initial.expansions[0].id, name: '基準前年の確認', note: '',
    rows: [{ accountId, amounts: { 4: '20' }, overrides: { 2: { 4: '15' } } }] });
  const contents = await api.readPlanContents(bytes);
  if (excel) {
    const { verifyWorkbookExportProcessing } = await import('./workbook-export-processing.mjs');
    await verifyWorkbookExportProcessing(api);
    const { verifyWorkbookExportBytes } = await import('./workbook-export-bytes.mjs');
    await verifyWorkbookExportBytes(api, contents);
    // Inspect the actual posted payload; parsing tests below exercise the same narrowed contract.
    const savedWorker = globalThis.Worker;
    let posted, terminated;
    globalThis.Worker = class {
      postMessage(message) { posted = structuredClone(message); queueMicrotask(() => this.onmessage({ data: { patches: [] } })); }
      terminate() { terminated = true; }
    };
    try {
      const payloadSizes = [];
      for (const count of [0, 100, 5000]) {
        const plan = { ...initial, initiatives: Array.from({ length: count }, (_, id) => ({ id, name: `施策${id}`, rows: Array.from({ length: 12 }, (_, month) => ({ month, amount: '100' })) })) };
        terminated = false;
        const start = performance.now();
        assert.deepEqual(await api.processPreviousWorkbook(new Uint8Array([1, 2, 3]), plan), []);
        const elapsedMs = performance.now() - start;
        assert.deepEqual(Object.keys(posted.contents).sort(), ['accounts', 'departments', 'fiscalYear', 'industries', 'previousAmounts']);
        assert.deepEqual(posted.contents.previousAmounts, initial.previousAmounts);
        assert.equal(plan.initiatives.length, count);
        assert.ok(terminated);
        const payloadBytes = Buffer.byteLength(JSON.stringify(posted));
        payloadSizes.push(payloadBytes);
        console.log(`前年Excel転送: 施策${count}件、全体${Buffer.byteLength(JSON.stringify(plan))} bytes → ${payloadBytes} bytes、複製と返信${elapsedMs.toFixed(2)}ms`);
      }
      assert.equal(new Set(payloadSizes).size, 1, '施策数にかかわらず同じ最小データを転送');
    } finally { if (savedWorker === undefined) delete globalThis.Worker; else globalThis.Worker = savedWorker; }
    const wb = api.createPreviousWorkbook(contents, [pair], 2);
    const ws = wb.worksheets.find(sheet => sheet.name !== '_triadic');
    assert.equal(ws.getCell('A1').value, '前年実績');
    ws.getCell(4 + contents.accounts.findIndex(item => item.id === accountId), 3).value = 111;
    const patches = api.readPreviousWorkbook(wb, contents);
    assert.equal(patches.length, 1); assert.equal(patches[0].previousKind, 2);
    const encoded = await api.serializeWorkbook(wb);
    const imported = await api.parsePreviousWorkbook(encoded, contents);
    assert.deepEqual(imported, patches, '編集した前年実績をXLSXの検査・再読込から抽出');
    const savedBytes = await api.changePlanSettings(bytes, { type: 'previous-import', patches: imported });
    const updated = await api.readPlanContents(savedBytes);
    assert.deepEqual(updated.previousAmounts.filter(item => item.previousKind === 1), contents.previousAmounts.filter(item => item.previousKind === 1), '前年見込の全金額を保持');
    await assert.rejects(api.parsePreviousWorkbook(encoded, updated), /出力後に前年金額/, '旧出力の再取込は既存の競合規則で拒否');
    assert.deepEqual(await api.parsePreviousWorkbook(await api.createPreviousWorkbookBytes(updated, [pair], 2), updated), [], '保存後の再出力には差分がない');
    assert.equal(api.createPreviousInput(updated, pair.industryId, pair.departmentId, 1).rows.find(item => item.accountId === accountId).amounts[4], '100');
    assert.equal(api.createPreviousInput(updated, pair.industryId, pair.departmentId, 2).rows.find(item => item.accountId === accountId).amounts[4], '111');
    wb.getWorksheet('_triadic').getCell('A1').value = 'Triadic previous v2';
    assert.throws(() => api.readPreviousWorkbook(wb, contents), /出力し直/);
    const report = api.createReportWorkbook(contents, { tables: ['cost-table', 'expansion-table'],
      selections: { 'cost-table': [1, 2], 'expansion-table': [1, 2], 'initiative-list': [1] },
      previousSelections: { 'cost-table': {1:2,2:1}, 'expansion-table': {1:1,2:2} }, costFilter: { industries: null, departments: null } });
    assert.equal(report.getWorksheet('総原価表').getCell('B4').value, '一次予算\n前年実績基準');
    assert.equal(report.getWorksheet('展開表').getCell('A6').value, '前年');
    const source = report.getWorksheet('計算元');
    const priorIds = new Set(); source.eachRow((row, index) => { if (index > 1 && row.getCell(1).value === '前年') priorIds.add(row.getCell(23).value); });
    assert.deepEqual(priorIds, new Set([-1, -2]));
    const rowNumber = 5 + api.buildPeriodCostComparison({ ...contents, previousKind: 2 }, [1, 2]).rows.findIndex(row => row.kind === 'account' && row.id === accountId);
    assert.equal(report.getWorksheet('総原価表').getCell(rowNumber, 2).value.result, 130);
    let targetsActual = false;
    report.getWorksheet('総原価表').eachRow(row => row.eachCell(cell => { if (cell.formula?.includes('SUMIFS') && cell.formula.includes(',-2,')) targetsActual = true; }));
    assert.ok(targetsActual, '正確な再計算用の数式も前年実績を参照');
    const roundtrip = await api.parsePreviousWorkbook(await api.createPreviousWorkbookBytes(contents, [pair], 2), contents);
    assert.deepEqual(roundtrip, []);
    console.log('PASS: 前年実績Excel往復・用途の固定・旧フォーマット拒否・表別基準前年と両計算元');
    return;
  }
  const original = structuredClone(contents);
  for (const [previousKind, expected] of [[1, [120000, 115000, -5000]], [2, [130000, 125000, -5000]]]) {
    const context = { ...contents, previousKind };
    const table = api.buildCostComparison(context, [1, 2]);
    assert.equal(table.labels[0], `一次予算\n${previousKind === 1 ? '前年見込' : '前年実績'}基準`);
    const row = table.rows.find(item => item.kind === 'account' && item.id === accountId);
    assert.deepEqual(row.values.map(value => value[4]), expected);
    const expansion = api.buildKindExpansionTable(context, [1, 2], 'registered');
    assert.equal(expansion.total[0][4].sales, expected[0]);
    assert.equal(expansion.total[1][4].sales, expected[1]);
    for (let column = 0; column < 3; column++) assert.equal(api.buildCostBreakdown(context,
      { kind: 'account', id: accountId, column, period: { id: '4', label: '4月', months: [4] } }, [1, 2]).total, expected[column]);
  }
  for (const primary of [1,2]) for (const final of [1,2]) {
    const previous = {1:primary,2:final}, context = {...contents,budgetPrevious:previous};
    const expected = [(primary === 1 ? 100000 : 110000)+20000, (final === 1 ? 100000 : 110000)+15000];
    const table = api.buildPeriodCostComparison(context,[1,2]);
    const row = table.rows.find(row=>row.kind==='account'&&row.id===accountId);
    assert.deepEqual(row.values.map(value=>value.annual), [...expected,expected[1]-expected[0]]);
    for(let column=0;column<3;column++) assert.equal(api.buildCostBreakdown(context,{kind:'account',id:accountId,column,period:api.tablePeriods.at(-1)},[1,2]).total,row.values[column].annual);
    const dashboard=api.buildDashboard(context,[1,2]);
    assert.deepEqual(dashboard.budgets.map(entry=>api.dashboardAmounts(entry.months).sales),expected);
    assert.deepEqual(dashboard.budgets.map(entry=>api.dashboardAmounts(entry.previous).sales),[primary===1?100000:110000, final===1?100000:110000]);
    const groups=api.buildDashboardBreakdowns(context,[1,2]);
    assert.deepEqual(groups.industries.find(item=>item.id===pair.industryId).budgets.map(entry=>api.analysisAnnual(entry.months).sales),expected);
    const expanded=api.buildKindExpansionTable(context,[1,2],'registered');
    assert.deepEqual(expanded.total.map(value=>value[4].sales),[...expected,expected[1]-expected[0]]);
    const saved=await api.readPlanContents(await api.changePlanSettings(bytes,{type:'comparison',screen:'cost-table',selected:[1,2],previous}));
    assert.deepEqual(saved.previousSelections['cost-table'],previous);
    for(const selected of [[1],[2],[1,2]]) for(const kind of [1,2]) for(const baseline of [1,2]) {
      const next=api.toggleComparison(selected,previous,kind,baseline);
      assert.ok(next.selected.length>=1&&next.selected.length<=2);
      assert.equal(new Set(next.selected).size,next.selected.length);
      assert.equal(next.previous[kind===1?2:1],previous[kind===1?2:1]);
      if(previous[kind]!==baseline||!selected.includes(kind)) {assert.ok(next.selected.includes(kind));assert.equal(next.previous[kind],baseline);}
      else if(selected.length===1) assert.deepEqual(next.selected,selected);
      else assert.ok(!next.selected.includes(kind));
    }
  }
  assert.deepEqual(contents, original, '基準切替は入力値を書き換えない');
  const selected = await api.changePlanSettings(bytes, { type: 'comparison', screen: 'cost-table', selected: [1,2], previous: {1:2,2:1} });
  assert.deepEqual((await api.readPlanContents(selected)).previousSelections, { 'cost-table': {1:2,2:1}, 'expansion-table': {1:1,2:1} });
  const left = await api.savePreviousAmounts(bytes, input(1, '101'));
  const right = await api.savePreviousAmounts(bytes, input(2, '112'));
  for (const [local, external] of [[left, right], [right, left]]) {
    const merged = await api.rebasePlan(bytes, local, external); assert.ok(merged?.operation);
    const saved = await api.readPlanContents(merged.bytes);
    assert.deepEqual(saved.previousAmounts.map(item => item.amount).sort(), ['101', '112']);
    const undone = await api.applyOperationSnapshot(merged.bytes, merged.operation.before);
    assert.deepEqual((await api.readPlanContents(undone)).previousAmounts, (await api.readPlanContents(external)).previousAmounts);
  }
  assert.equal(await api.rebasePlan(bytes, left, await api.savePreviousAmounts(bytes, input(1, '102'))), null);
  await assert.rejects(api.savePreviousAmounts(bytes, input(3, '1')), /種類/);
  const copied = { ...api.createPreviousInput(contents, pair.industryId, pair.departmentId, 1), previousKind: 2 };
  const copy = await api.readPlanContents(await api.savePreviousAmounts(bytes, copied));
  assert.equal(api.createPreviousInput(copy, pair.industryId, pair.departmentId, 2).rows.find(item => item.accountId === accountId).amounts[4], '100');
  assert.equal(api.createPreviousInput(contents, pair.industryId, pair.departmentId, 2).rows.find(item => item.accountId === accountId).amounts[4], '110');
  const impact = api.compareHistoryIncome(contents, await api.readPlanContents(right));
  assert.equal(impact.find(item => item.previousKind === 1 && item.kind === 1 && item.metric === 'sales' && item.period === 4).difference.yen, 0);
  assert.equal(impact.find(item => item.previousKind === 2 && item.kind === 1 && item.metric === 'sales' && item.period === 4).difference.yen, 2000);
  const recorded = await api.trackHistoryChange(bytes, right, '2026-05-01T00:00:00.000Z');
  const history = await api.readDataHistory(recorded);
  const differences = (await api.compareSavedHistory(recorded, history.entries.at(-1).id)).differences;
  assert.ok(differences.some(item => item.section === '前年実績' && item.field === '4月' && item.before === '110' && item.after === '112'));
  const db = await api.openTriadicDatabase(bytes); let old;
  try { db.run(`PRAGMA user_version = ${api.TRIADIC_FORMAT_VERSION - 1}`); old = db.export(); } finally { db.close(); }
  const untouched = old.slice(); await assert.rejects(api.openTriadicDatabase(old), /保存形式/); assert.deepEqual(old, untouched);
  console.log('PASS: 基準前年の独立保存・予算別基準の総原価表・展開表・施策一覧/内訳一致・選択再読込・コピー独立性・同時編集/競合/取消・履歴収支・旧形式非破壊拒否');
}
