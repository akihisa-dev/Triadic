import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { scopedTestApi, testScope } from "../scripts/test-scope.mjs";

test("通常検証ではExcel生成・往復を開始せず、通常の計算は確認できる", () => {
  let workbooks = 0;
  const api = { createReportWorkbook() { workbooks++; }, parsePreviousWorkbook() { workbooks++; },
    serializeWorkbook() { workbooks++; }, calculate() { return 123; } };
  const regular = scopedTestApi(api, testScope([]));
  assert.equal(regular.calculate(), 123);
  for (const name of ["createReportWorkbook", "parsePreviousWorkbook", "serializeWorkbook"]) {
    assert.throws(() => regular[name](), /通常検証ではExcelテストを実行しません/);
  }
  assert.equal(workbooks, 0);
  scopedTestApi(api, testScope(["--excel"])).createReportWorkbook();
  assert.equal(workbooks, 1);
  assert.throws(() => testScope(["--all"]), /引数/);
  assert.throws(() => testScope(["--excel", "--excel"]), /引数/);
});

test("通常・push・releaseの検証からExcel実行を分離する", async () => {
  const { scripts } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  for (const name of ["test", "verify", "verify:full", "verify:release"]) {
    assert.doesNotMatch(scripts[name], /--excel|test:excel|report-parity\.mjs/);
  }
  assert.match(scripts["test:excel"], /test-files\.mjs --excel/);
  assert.match(scripts["test:excel"], /report-parity\.mjs/);
  const prePush = await readFile(new URL("../.githooks/pre-push", import.meta.url), "utf8");
  assert.doesNotMatch(prePush, /--excel|test:excel|report-parity/);
  const config = await readFile(new URL("../playwright.config.ts", import.meta.url), "utf8");
  const ignored = config.match(/testIgnore:\s*\[([^\]]*)\]/)?.[1];
  assert.ok(ignored);
  for (const file of ['spreadsheet-io.spec.ts', 'report-parity.spec.ts', 'workbook-export.spec.ts']) assert.ok(ignored.includes(`"**/${file}"`));
  assert.match(scripts["test:ui:excel"], /--config playwright\.excel\.config\.ts/);
});
