import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
export async function verifyWorkbookExportBytes(api, contents) {
  const options = { tables: ['cost-table','initiative-list','expansion-table'], selections: { 'cost-table':[1,2], 'initiative-list':[2], 'expansion-table':[1,2] }, previousSelections: { 'cost-table':2, 'expansion-table':1 }, costFilter: { industries:null, departments:null } };
  const pair = { industryId: contents.industries[0].id, departmentId: contents.departments[0].id };
  for (const request of [{ type:'report', contents, options }, ...[1,2].map(previousKind => ({ type:'previous', contents, previousKind, pairs:[pair] }))]) {
    const expected = request.type === 'report' ? await api.serializeWorkbook(api.createReportWorkbook(contents, options)) : await api.createPreviousWorkbookBytes(contents, [pair], request.previousKind);
    const actual = await api.exportWorkbookBytes(request);
    const left = new ExcelJS.Workbook(), right = new ExcelJS.Workbook();
    await left.xlsx.load(Buffer.from(expected)); await right.xlsx.load(Buffer.from(actual));
    assert.deepEqual(right.worksheets.map(sheet => sheet.model), left.worksheets.map(sheet => sheet.model));
  }
  console.log('PASS: 出力Workerと従来処理の三表・前年見込・実績のシート構成・値・数式・書式一致');
}
