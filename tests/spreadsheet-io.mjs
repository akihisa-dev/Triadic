import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { verifyPreviousWorkbookBoundary, verifyPreviousWorkbookProcessing } from "./previous-workbook-boundary.mjs";
import { verifyPreviousWorkbookExport } from "./previous-workbook-export.mjs";
import { verifyReportWorkbooks } from "./report-workbook.mjs";
import { verifyPreviousImportAccount } from "./previous-import-account.mjs";

async function roundtrip(wb) {
  const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(await wb.xlsx.writeBuffer()); return loaded;
}
export async function verifySpreadsheetIO(api) {
  await verifyPreviousImportAccount(api);
  const bytes = await api.createSamplePlan(2026), plan = await api.readPlanContents(bytes);
  const patchesForNames = [{ industryId: 1, departmentId: 2, accountId: 3, month: 4, before: '0', after: '0.001' },
    { industryId: 2, departmentId: 1, accountId: 1, month: 5, before: '1', after: '-2' }];
  const named = { industries: [{ id: 2, industryName: '同名' }, { id: 1, industryName: '業種A' }],
    departments: [{ id: 2, departmentName: '部署B' }, { id: 1, departmentName: '同名' }],
    accounts: [{ id: 3, accountName: '科目C' }, { id: 1, accountName: '同名' }] };
  const labels = api.previousPatchPresentation(named, patchesForNames);
  assert.deepEqual(labels.map(r => [r.industryName, r.departmentName, r.accountName]), [['業種A','部署B','科目C'],['同名','同名','同名']]);
  assert.equal(labels[0].patch, patchesForNames[0], '確認用の名前取得で元の変更値を複製・変更しない');
  assert.deepEqual(api.previousPatchPresentation(named, []), []);
  assert.equal(api.previousPatchPresentation({ ...named, accounts: [{ id: 3, accountName: '改名' }] }, patchesForNames)[0].accountName, '改名');
  assert.equal(api.previousPatchPresentation(named, [{ ...patchesForNames[0], accountId: 99 }])[0].accountName, undefined);
  let reads = 0;
  const master = { industries: [{ get id() { reads++; return 1; }, industryName: '業種' }],
    departments: Array.from({ length: 17 }, (_, i) => ({ get id() { reads++; return i + 1; }, departmentName: `部署${i}` })),
    accounts: Array.from({ length: 330 }, (_, i) => ({ get id() { reads++; return i + 1; }, accountName: `科目${i}` })) };
  const many = Array.from({ length: 67320 }, (_, i) => ({ industryId: 1, departmentId: Math.floor(i / 3960) + 1,
    accountId: Math.floor(i / 12) % 330 + 1, month: i % 12 + 1, before: '0', after: '1' }));
  const shown = api.previousPatchPresentation(master, many);
  assert.equal(reads, 348, '67320件の変更でもマスタIDは一度だけ走査');
  assert.equal(shown.length, many.length);
  assert.equal(shown.at(-1).accountName, '科目329');
  assert.equal(shown.at(-1).departmentName, '部署16');
  const classification = { industries: [{ id: 1 }, { id: 2 }], departments: [{ id: 1, industryIds: [1, 2] }, { id: 2, industryIds: [2] }] };
  const selected = { industries: [1, 2], departments: [1, 2], pairs: [{ industryId: 1, departmentId: 1 }, { industryId: 2, departmentId: 1 }, { industryId: 2, departmentId: 2 }] };
  const canceled = { ...classification, departments: [{ id: 1, industryIds: [1] }] };
  const corrected = api.normalizeExportClassificationSelection(canceled, selected);
  assert.deepEqual(corrected, { industries: [1, 2], departments: [1], pairs: [{ industryId: 1, departmentId: 1 }] }, '所属・部署の取消で有効な出力条件だけを保持');
  assert.deepEqual(api.normalizeExportClassificationSelection(classification, corrected), corrected, 'やり直しで無効化した選択を復活させない');
  assert.deepEqual(api.normalizeExportClassificationSelection({ industries: [{ id: 1 }], departments: classification.departments }, selected),
    { industries: [1], departments: [1, 2], pairs: [{ industryId: 1, departmentId: 1 }] }, '業種の取消で絞り込みと組み合わせを補正');
  assert.deepEqual(api.normalizeExportClassificationSelection({ industries: classification.industries.map(i => ({ ...i, industryName: '改名' })), departments: classification.departments }, selected), selected, '改名で出力選択を失わない');
  const pairsForIndex = plan.industries.slice(0, 2).flatMap(i => plan.departments.map(d => ({ industryId: i.id, departmentId: d.id })));
  const sparse = { ...plan, previousAmounts: pairsForIndex.flatMap((pair, i) => plan.accounts.slice(0, 2).map((a, n) => ({ ...pair, previousKind: 1, accountId: a.id, month: 4, amount: String(i * 10 + n) + ".001", id: i * 2 + n, revision: 0 }))) };
  sparse.previousAmounts.find = () => { throw new Error("前年金額の繰り返し全件検索は禁止"); };
  const indexed = api.createPreviousWorkbook(sparse, pairsForIndex);
  indexed.worksheets.filter(ws => ws.state === "visible").forEach((ws, i) => {
    assert.equal(ws.getCell("C4").value, i * 10 + 0.001);
    assert.equal(ws.getCell("D4").value, 0, "欠損月は0");
  });
  // Import must index masters once; metadata rows must not rescan their arrays.
  for (const masters of [sparse.accounts, sparse.industries, sparse.departments]) {
    masters.find = masters.some = () => { throw new Error("マスタの繰り返し全件検索は禁止"); };
  }
  assert.deepEqual(api.readPreviousWorkbook(indexed, sparse), []);
  indexed.worksheets[0].getCell("C4").value = null;
  indexed.worksheets[0].getCell("C5").value = 0;
  const indexedPatches = api.readPreviousWorkbook(indexed, sparse);
  assert.equal(indexedPatches.length, 1); assert.equal(indexedPatches[0].before, "1.001"); assert.equal(indexedPatches[0].after, "0");
  for (const masters of [sparse.accounts, sparse.industries, sparse.departments]) {
    delete masters.find; delete masters.some;
  }
  for (const field of ["accounts", "industries", "departments"]) {
    assert.throws(() => api.readPreviousWorkbook(indexed, { ...sparse, [field]: sparse[field].slice(1) }));
  }
  assert.throws(() => api.readPreviousWorkbook(indexed, { ...sparse, departments: sparse.departments.map(d => ({ ...d, industryIds: [] })) }), /業種設定/);
  const duplicate = api.createPreviousWorkbook(sparse, pairsForIndex);
  const metadata = duplicate.getWorksheet("_triadic");
  for (let column = 4; column <= 20; column++) metadata.getCell(4, column).value = metadata.getCell(3, column).value;
  duplicate.worksheets[0].getCell("A5").value = duplicate.worksheets[0].getCell("A4").value;
  duplicate.worksheets[0].getCell("B5").value = duplicate.worksheets[0].getCell("B4").value;
  assert.throws(() => api.readPreviousWorkbook(duplicate, sparse), /重複/);
  await verifyPreviousWorkbookBoundary(api, plan);
  await verifyPreviousWorkbookProcessing();
  await verifyPreviousWorkbookExport(api);
  await verifyReportWorkbooks(api, plan);
  const pairs = [{ industryId: plan.industries[0].id, departmentId: plan.departments[0].id }, { industryId: plan.industries[1].id, departmentId: plan.departments[1].id }];
  const branded = await roundtrip(api.createPreviousWorkbook(plan, pairs));
  assert.equal(branded.creator, "Triadic");
  const brandedMetadata = branded.getWorksheet("_triadic");
  assert.equal(brandedMetadata.getCell("A1").value, "Triadic previous v3");
  assert.deepEqual(await api.parsePreviousWorkbook(await api.serializeWorkbook(branded), plan), []);
  for (const previousSheetName of ["_triadic", "_triadichrome"]) {
    brandedMetadata.name = previousSheetName;
    brandedMetadata.getCell("A1").value = "Triadichrome previous v3";
    const previousTemplate = await api.serializeWorkbook(branded);
    const originalPlan = structuredClone(plan);
    await assert.rejects(api.parsePreviousWorkbook(previousTemplate, plan), /最新の前年入力フォーマット/);
    assert.deepEqual(plan, originalPlan, "旧識別子のExcelを拒否してもデータを変更しない");
  }
  // #15: real XLSX round trips must preserve every yen, including Excel's 15-digit boundary.
  const boundaryAmounts = ["9007199254740.991", "-9007199254740.991", "9007199254740.99", "-9007199254740.99", "1000000000000.001", "-1000000000000.001", "999999999999.999", "123.456", "-123.456", "0", "9007199254740", "0.001"];
  const precise = { ...plan, previousAmounts: boundaryAmounts.map((amount, index) => ({ ...pairs[0], previousKind: 1, accountId: plan.accounts[0].id, month: [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3][index], amount })) };
  const preciseBefore = structuredClone(precise);
  const output = await api.serializeWorkbook(api.createPreviousWorkbook(precise, [pairs[0]]));
  const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(output);
  const amountsSheet = loaded.worksheets[0];
  boundaryAmounts.forEach((amount, index) => {
    const cell = amountsSheet.getCell(4, index + 3);
    assert.equal(api.amountToYen(String(cell.value)), api.amountToYen(amount));
    if ([0, 1, 4, 5].includes(index)) {
      assert.equal(typeof cell.value, "string"); assert.equal(cell.numFmt, "@");
    }
  });
  assert.equal(typeof amountsSheet.getCell("J4").value, "number", "通常額は数値として出力");
  assert.deepEqual(await api.parsePreviousWorkbook(output, precise), [], "無編集の再取り込みは変更なし");
  amountsSheet.getCell("C4").value = "9007199254740.990";
  amountsSheet.getCell("D4").value = "-9007199254740.990";
  amountsSheet.getCell("J4").value = 123.457;
  const edited = await api.parsePreviousWorkbook(await api.serializeWorkbook(loaded), precise);
  assert.deepEqual(edited.map(p => [p.month, p.after]), [[4, "9007199254740.99"], [5, "-9007199254740.99"], [11, "123.457"]]);
  amountsSheet.getCell("C4").value = "9007199254740.992";
  await assert.rejects(api.parsePreviousWorkbook(await api.serializeWorkbook(loaded), precise), /千円単位/);
  assert.deepEqual(precise, preciseBefore, "出力・読込・失敗で元のデータを変更しない");
  // #13: sanitize the output name after truncation without modifying masters.
  for (const departmentName of ["検証", "検証'", "部".repeat(26) + "'続き", "O'Brien", "検証/部署"]) {
    const input = { ...plan, industries: plan.industries.map((item, index) => index === 0 ? { ...item, industryName: "業" } : item),
      departments: plan.departments.map((item, index) => index === 0 ? { ...item, departmentName } : item) };
    const original = structuredClone(input);
    const output = await api.serializeWorkbook(api.createPreviousWorkbook(input, pairs));
    const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(output);
    const ws = loaded.worksheets[0];
    assert.ok(ws.name.length <= 31);
    assert.doesNotMatch(ws.name, /^'|'$/);
    if (departmentName === "検証") assert.equal(ws.name, "1_業_検証");
    assert.equal(loaded.getWorksheet("_triadic").getCell("A3").value, ws.name);
    assert.deepEqual(await api.parsePreviousWorkbook(output, input), []);
    ws.getCell("C4").value = 123.456;
    const imported = await api.parsePreviousWorkbook(await api.serializeWorkbook(loaded), input);
    assert.equal(imported.length, 1);
    assert.equal(imported[0].departmentId, pairs[0].departmentId);
    assert.equal(imported[0].after, "123.456");
    assert.deepEqual(input, original, "出力用シート名だけを整え、マスタ名を変更しない");
  }
  const template = await roundtrip(api.createPreviousWorkbook(plan, pairs));
  assert.equal(template.worksheets.length, 3);
  assert.equal(template.getWorksheet("_triadic").state, "veryHidden");
  assert.deepEqual(api.readPreviousWorkbook(template, plan), []);
  const first = template.worksheets[0];
  const originalAmount = first.getCell("C4").value;
  first.getCell("C4").value = null; first.getCell("D4").value = 0; first.getCell("E4").value = -123.456;
  const patches = api.readPreviousWorkbook(template, plan);
  assert.equal(patches.length, 2); assert.ok(!patches.some(p => p.month === 4));
  assert.ok(patches.some(p => p.month === 5 && p.after === "0"));
  assert.ok(patches.some(p => p.month === 6 && p.after === "-123.456"));
  assert.deepEqual(await api.parsePreviousWorkbook(await api.serializeWorkbook(template), plan), patches);
  const updated = await api.changePlanSettings(bytes, { type: "previous-import", patches });
  const saved = await api.readPlanContents(updated);
  assert.equal(saved.previousAmounts.find(p => p.industryId === pairs[0].industryId && p.departmentId === pairs[0].departmentId && p.accountId === plan.accounts[0].id && p.month === 4).amount, String(originalAmount));
  assert.equal(saved.previousAmounts.find(p => p.industryId === pairs[0].industryId && p.departmentId === pairs[0].departmentId && p.accountId === plan.accounts[0].id && p.month === 6).amount, "-123.456");
  await assert.rejects(api.changePlanSettings(bytes, { type: "previous-import", patches: [...patches, { ...patches[0], accountId: -1 }] }), /マスタ/);
  assert.deepEqual(await api.readPlanContents(bytes), plan, "一部の失敗で元のデータを書き換えない");
  await assert.rejects(api.changePlanSettings(updated, { type: "previous-import", patches }), /変更/);
  for (const bad of [0.0001, "abc", { formula: "1+1", result: 2 }, { error: "#VALUE!" }]) {
    first.getCell("E4").value = bad; assert.throws(() => api.readPreviousWorkbook(template, plan));
  }
  first.getCell("E4").value = -123.456;
  assert.throws(() => api.readPreviousWorkbook(template, { ...plan, fiscalYear: 2027 }), /年度/);
  first.getCell("A4").value = "changed"; assert.throws(() => api.readPreviousWorkbook(template, plan), /科目/);
  assert.throws(() => api.createPreviousWorkbook(plan, [pairs[0], pairs[0]]));
  await assert.rejects(api.parsePreviousWorkbook(new Uint8Array([1, 2, 3]), plan), /読み込めません/);
  // #22: even same-ID/same-name recreation is distinct; rename remains the same classification.
  const fresh = await api.createTriadicDatabase(2026);
  const initial = await api.readPlanContents(fresh);
  const pair = { industryId: 9, departmentId: 2 };
  const oldBook = await roundtrip(api.createPreviousWorkbook(initial, [pair]));
  oldBook.worksheets[0].getCell('C4').value = 1.125;
  const oldBytes = await api.serializeWorkbook(oldBook);
  const confirmed = await api.parsePreviousWorkbook(oldBytes, initial);
  for (const kind of ['department', 'industry']) for (const sameName of [false, true]) {
    const original = kind === 'department' ? initial.departments.find(x => x.id === 2) : initial.industries.find(x => x.id === 9);
    const change = kind === 'department' ? api.changeDepartmentMaster : api.changeIndustryMaster;
    let replaced = fresh;
    if (kind === 'industry') for (const d of initial.departments) replaced = await api.changeDepartmentMaster(replaced, { type: 'update', id: d.id, departmentName: d.departmentName, industryIds: d.industryIds.filter(id => id !== original.id) });
    replaced = await change(replaced, { type: 'delete', id: original.id });
    replaced = await change(replaced, kind === 'department' ? { type: 'add', departmentName: sameName ? original.departmentName : '新部署', industryIds: [9] } :
      { type: 'add', industryCode: original.industryCode, industryName: sameName ? original.industryName : '新業種' });
    if (kind === 'industry') replaced = await api.changeDepartmentMaster(replaced, { type: 'update', id: 2, departmentName: initial.departments.find(d => d.id === 2).departmentName, industryIds: [9] });
    const current = await api.readPlanContents(replaced);
    const recreated = (kind === 'department' ? current.departments : current.industries).find(x => x.id === original.id);
    assert.ok(recreated, 'SQLiteによる番号再利用を実データで再現');
    assert.notEqual(recreated.identity, original.identity);
    await assert.rejects(api.parsePreviousWorkbook(oldBytes, current), /作り直/);
    await assert.rejects(api.changePlanSettings(replaced, { type: 'previous-import', patches: confirmed }), /作り直/);
    assert.deepEqual(await api.readPlanContents(replaced), current, '拒否時に金額を更新しない');
    const newBook = api.createPreviousWorkbook(current, [pair]); newBook.worksheets[0].getCell('C4').value = -0.001;
    const accepted = await api.parsePreviousWorkbook(await api.serializeWorkbook(newBook), current);
    assert.equal(accepted[0].after, '-0.001');
    await api.changePlanSettings(replaced, { type: 'previous-import', patches: accepted });
    const snapshot = await api.createBusinessSnapshot(replaced);
    const renamedNew = await change(replaced, kind === 'department' ? { type: 'update', id: original.id, departmentName: '改名後' } :
      { type: 'update', id: original.id, industryCode: original.industryCode, industryName: '改名後' });
    const restored = await api.applyOperationSnapshot(renamedNew, snapshot);
    assert.deepEqual(await api.readPlanContents(restored), current, '取消で作成識別子も元の分類へ戻る');
  }
  let renamed = await api.changeDepartmentMaster(fresh, { type: 'update', id: 2, departmentName: '改名部署' });
  renamed = await api.changeIndustryMaster(renamed, { type: 'update', id: 9, industryCode: '99', industryName: '改名業種' });
  const renamedPlan = await api.readPlanContents(renamed);
  assert.deepEqual(await api.parsePreviousWorkbook(oldBytes, renamedPlan), confirmed, '改名は同じ分類として取り込める');
  await api.changePlanSettings(renamed, { type: 'previous-import', patches: confirmed });
  oldBook.getWorksheet('_triadic').getCell('A1').value = 'Triadic previous v1';
  await assert.rejects(api.parsePreviousWorkbook(await api.serializeWorkbook(oldBook), initial), /出力し直し/);
  console.log("spreadsheet io ok: all selections, formulas, styles, precision, import and atomic failure");
}
