import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";

export async function verifyPreviousWorkbookExport(api) {
  const plan = await api.readPlanContents(await api.createPreviousExportPlan());
  for (const name of ["科目_x0041_", "科目_x005F_", "通常の日本語", "A_x0041__x005F_あ_x3042_", "_x00af_"]) {
    const named = { ...plan,
      accounts: plan.accounts.map((a, i) => i === 0 ? { ...a, accountName: name, displayName: name } : a),
      industries: plan.industries.map(i => ({ ...i, industryName: name })),
      departments: plan.departments.map(d => ({ ...d, departmentName: name })),
      initiatives: plan.initiatives.map(i => ({ ...i, name })) };
    const pair = [{ industryId: named.industries[0].id, departmentId: named.departments[0].id }];
    const original = api.createPreviousWorkbook(named, pair);
    const namedBytes = await api.createPreviousWorkbookBytes(named, pair);
    assert.deepEqual(await api.parsePreviousWorkbook(namedBytes, named), [], `名称を保持して再取込: ${name}`);
    const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(namedBytes);
    assert.deepEqual(loaded.worksheets.map(ws => ws.name), original.worksheets.map(ws => ws.name), "シート参照を保持");
    assert.equal(loaded.worksheets[0].getCell("B4").value, name);
    await assert.rejects(api.parsePreviousWorkbook(namedBytes, { ...named, accounts: named.accounts.map((a, i) => i === 0 ? { ...a, accountName: "変更後" } : a) }), /マスタが変更/);
    const report = api.createReportWorkbook(named, { tables: ["cost-table", "expansion-table", "initiative-list"],
      selections: { "cost-table": [2, 1], "expansion-table": [2, 1], "initiative-list": [2] }, costFilter: { industries: null, departments: null } });
    const reopened = new ExcelJS.Workbook(); await reopened.xlsx.load(await api.serializeWorkbook(report));
    report.eachSheet(ws => ws.eachRow(row => row.eachCell(cell => {
      if (typeof cell.value === "string" || cell.formula) assert.deepEqual(reopened.getWorksheet(ws.name).getCell(cell.address).value, cell.value, `三表の文字列・数式: ${ws.name}!${cell.address}`);
    })));
  }
  for (const name of ["営業\t部署", "営業\n部署", "営業\r部署", "日本語", "'部署'", "部署/業種:*?[]\\", "長".repeat(40), "_x0041_\t_x005F_",
    "&lt;", "&amp;", "&quot;", "&apos;", "&gt;", "A&B", "&#65;", "&amp;lt;", "&lt;&gt;_x0041_"]) {
    for (const field of ["industries", "departments"]) {
      const named = { ...plan, [field]: plan[field].map(row => ({ ...row, [field === "industries" ? "industryName" : "departmentName"]: name })) };
      const beforeNames = structuredClone(named);
      const pairs = [{ industryId: named.industries[0].id, departmentId: named.departments[0].id }];
      const bytes = await api.createPreviousWorkbookBytes(named, pairs);
      assert.deepEqual(await api.parsePreviousWorkbook(bytes, named), [], `分類名のXLSX往復: ${field} ${name}`);
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes);
      const ws = wb.worksheets[0];
      assert.equal(ws.name, wb.getWorksheet("_triadichrome").getCell("A3").value);
      assert.equal(ws.name, api.createPreviousWorkbook(named, pairs).worksheets[0].name, "読込でシート名が変わらない");
      // XML normalizes CR/CRLF to LF in cell text; literal entity strings stay literal.
      assert.equal(ws.getCell("A2").value, `${named.fiscalYear}年度 · ${named.industries[0].industryName} · ${named.departments[0].departmentName} · 単位：千円`.replace(/\r\n?/g, "\n"), "シート内の分類名は元の文字列を保持");
      assert.doesNotMatch(ws.name, /&(lt|amp|quot|apos|gt);/);
      if (["&lt;", "&amp;", "&quot;", "&apos;", "&gt;"].includes(name)) assert.equal(ws.name,
        `1_${field === "industries" ? "_" : named.industries[0].industryName}_${field === "departments" ? "_" : named.departments[0].departmentName}`);
      if (["A&B", "&#65;"].includes(name)) assert.ok(ws.name.includes(name), "通常の&と数値実体参照はシート名でも保持");
      assert.ok(ws.name.length <= 31); assert.doesNotMatch(ws.name, /[\t\r\n]/);
      ws.getCell("D4").value = 0.001;
      const patches = await api.parsePreviousWorkbook(await api.serializeWorkbook(wb), named);
      assert.equal(patches.length, 1); assert.equal(patches[0].month, 5); assert.equal(patches[0].after, "0.001");
      assert.equal(patches[0].industryId, pairs[0].industryId); assert.equal(patches[0].departmentId, pairs[0].departmentId);
      assert.deepEqual(named, beforeNames, "出力用のシート名だけを整え、分類名と前年額を変更しない");
    }
  }
  const pairs = plan.industries.flatMap(i => plan.departments.map(d => ({ industryId: i.id, departmentId: d.id })));
  assert.equal(plan.accounts.length, 330); assert.equal(pairs.length, 18);
  const before = structuredClone(plan);
  const prototype = Object.getPrototypeOf(new ExcelJS.Workbook().xlsx), write = prototype.writeBuffer;
  let writes = 0;
  prototype.writeBuffer = function (...args) { writes++; return write.apply(this, args); };
  try {
    await assert.rejects(api.createPreviousWorkbookBytes(plan, pairs), /上限.*組み合わせを減らし.*別ファイル/);
    assert.equal(writes, 0, "上限超過はExcelJSの出力処理より前に拒否");
  } finally { prototype.writeBuffer = write; }
  assert.throws(() => api.createPreviousWorkbook({ ...plan, accounts: plan.accounts.slice(0, 326) }, pairs), /取り込み上限/);
  const below = { ...plan, accounts: plan.accounts.slice(0, 325) };
  const boundary = await api.createPreviousWorkbookBytes(below, pairs);
  const zip = await JSZip.loadAsync(boundary);
  let cells = 0;
  for (const entry of Object.values(zip.files).filter(f => /^xl\/worksheets\/[^/]+\.xml$/.test(f.name))) cells += ((await entry.async("string")).match(/<c\b/g) ?? []).length;
  assert.equal(cells, 199642, "見出しと書式付き空欄を含む実際のセル数");
  assert.deepEqual(await api.parsePreviousWorkbook(boundary, below), [], "上限直前の出力を無編集で読み戻せる");
  const output = await api.createPreviousWorkbookBytes(plan, pairs.slice(0, 17));
  assert.deepEqual(await api.parsePreviousWorkbook(output, plan), [], "選択を減らした330科目の出力を読み戻せる");
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(output);
  const ws = wb.worksheets[0];
  assert.equal(ws.getCell("C4").value, 123.456); assert.equal(ws.getCell("D4").value, 0);
  ws.getCell("C4").value = null;
  assert.deepEqual(await api.parsePreviousWorkbook(await api.serializeWorkbook(wb), plan), [], "空欄は既存額を保持");
  ws.getCell("C4").value = 0; ws.getCell("D4").value = -0.001;
  const patches = await api.parsePreviousWorkbook(await api.serializeWorkbook(wb), plan);
  assert.deepEqual(patches.map(p => [p.month, p.before, p.after]), [[4, "123.456", "0"], [5, "0", "-0.001"]]);
  assert.equal(patches[0].industryIdentity, plan.industries[0].identity);
  const legacy = { ...plan, industries: plan.industries.map(({ identity, ...i }) => i), departments: plan.departments.map(({ identity, ...d }) => d) };
  await assert.rejects(api.createPreviousWorkbookBytes(legacy, pairs.slice(0, 1)), /作成識別子/);
  const oldWorkbook = new ExcelJS.Workbook(); await oldWorkbook.xlsx.load(output);
  const oldMeta = oldWorkbook.getWorksheet("_triadichrome");
  for (let row = 3; row <= oldMeta.rowCount; row++) { oldMeta.getCell(row,19).value = "legacy"; oldMeta.getCell(row,20).value = "legacy"; }
  const oldBytes = await api.serializeWorkbook(oldWorkbook); const oldBefore = oldBytes.slice();
  await assert.rejects(api.parsePreviousWorkbook(oldBytes,plan), /作り直|識別子/);
  assert.deepEqual(oldBytes,oldBefore);
  assert.throws(() => api.createPreviousWorkbook({ ...plan, accounts: [] }, pairs.slice(0, 1)), /勘定科目を登録/);
  const manyPairs = Array.from({ length: 2033 }, (_, index) => ({ industryId: index + 1, departmentId: 1 }));
  assert.throws(() => api.createPreviousWorkbook({ ...plan, accounts: plan.accounts.slice(0, 1) }, manyPairs), /取り込み上限/, "ZIP項目数も生成前に制限");
  const longName = { ...plan, accounts: [{ ...plan.accounts[0], accountName: "a".repeat(9 * 1024 * 1024) }] };
  await assert.rejects(api.createPreviousWorkbookBytes(longName, pairs.slice(0, 1)), /取り込み上限.*別ファイル/, "実際の展開後サイズもダウンロード前に制限");
  assert.deepEqual(plan, before, "出力・拒否・再取り込みで計画を変更しない");
  console.log("previous workbook export ok: 330 accounts, 18 pairs, boundary, split, empty/zero, identities and expanded size");
}
