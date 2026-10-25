import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";

// Independent yen arithmetic: never use the production amount/effect/total helpers for expectations.
const yen = text => { const [whole, fraction = ""] = String(text).replace(/^-/, "").split("."); return (String(text).startsWith("-") ? -1 : 1) * (Number(whole) * 1000 + Number(fraction.padEnd(3, "0"))); };
const sourceValue = (row, kind, month) => yen(kind === 2 && Object.hasOwn(row.overrides?.[2] ?? {}, month) ? row.overrides[2][month] : row.amounts[month] ?? "0");
const key = item => item.rows[0].id.split(":")[1];

export async function verifyReferenceSample(api, bytes, plan, { excel = false } = {}) {
  const before = bytes.slice();
  const accounts = new Map(plan.accounts.map(item => [item.id, item]));
  const accountId = name => plan.accounts.find(item => item.accountName === name).id;
  const item = id => { const value = plan.initiatives.find(value => key(value) === id); assert.ok(value, id); return value; };
  const rows = (id, name) => item(id).rows.filter(row => row.accountId === accountId(name));
  const amount = (id, name, month, kind = 2) => rows(id, name).reduce((sum, row) => sum + sourceValue(row, kind, month), 0);
  const empty = () => ({ sales: 0, expense: 0, profit: 0 });
  const effect = (total, id, value) => {
    const type = accounts.get(id).accountType;
    if (type === "sales") { total.sales += value; total.profit += value; }
    if (type === "cost") { total.sales -= value; total.profit -= value; }
    if (type === "expense") { total.expense += value; total.profit -= value; }
    if (type === "profit") total.profit += value;
  };
  const monthly = (initiative, kind, month) => { const total = empty(); for (const row of initiative.rows) effect(total, row.accountId, sourceValue(row, kind, month)); return total; };
  const businessData = data => {
    assert.equal(data.accounts.length, 57);
    assert.equal(data.aggregations.length, 15);
    assert.deepEqual(data.departments.map(x => x.departmentName), ["東京圏", "大阪圏", "名古屋圏", "福岡圏", "仙台圏", "札幌圏", "中四国圏", "本社"]);
    assert.deepEqual(data.industries.map(x => x.industryName), ["ルート配送", "チャーター配送", "アパレル倉庫", "非衣料品倉庫", "本社管理"]);
    assert.equal(new Set(data.initiatives.map(x => x.name)).size, data.initiatives.length);
    assert.ok(data.initiatives.every(x => !/確認用|テスト|ゼロ固定|入力準備|車両整備・|作業手順の改善・/.test(x.name)));
    for (const value of data.initiatives) {
      assert.equal(value.fiscalYear, data.fiscalYear);
      assert.ok(data.departments.find(d => d.id === value.departmentId).industryIds.includes(value.industryId));
      for (const kind of [1, 2]) assert.ok(api.initiativeMonths.some(m => Object.values(monthly(value, kind, m)).some(v => v !== 0)), value.name);
    }
  };
  businessData(plan);
  const design = await readFile(new URL("../docs/sample-budget-design.md", import.meta.url), "utf8");
  const documentedKeys = [...design.matchAll(/^\| ([a-z]+(?:-[a-z]+)*) \|/gm)].map(match => match[1]);
  assert.deepEqual(new Set(documentedKeys), new Set(plan.initiatives.map(key)), "設計書の個別施策と実データを対応させる。件数・サイズは目標にしない");
  assert.ok(!plan.initiatives.some(x => /関東第二倉庫|関西.*倉庫/.test(x.name)), "4〜5年目の開設を今期に詰め込まない");
  const priorSales = (industry, department) => plan.previousAmounts.filter(x => x.previousKind === 2 && x.accountId === accountId("売上高") && (!industry || x.industryId === industry) && (!department || x.departmentId === department)).reduce((sum, x) => sum + yen(x.amount), 0);
  assert.equal(priorSales(), 12_000_000_000);
  assert.deepEqual([1, 2, 3, 4, 5].map(i => priorSales(i)), [4_800_000_000, 1_200_000_000, 6_000_000_000, 0, 0]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(d => priorSales(null, d)), [5_040_000_000, 2_856_000_000, 1_908_000_000, 840_000_000, 432_000_000, 312_000_000, 612_000_000, 0]);
  const previous = (industry, department, name, month, kind = 2) => yen(plan.previousAmounts.find(x => x.previousKind === kind && x.industryId === industry && x.departmentId === department && x.accountId === accountId(name) && x.month === month)?.amount ?? "0");
  assert.equal(previous(3, 1, "売上高", 1, 1) - previous(3, 1, "売上高", 1), 1_500_000);
  assert.equal(previous(2, 3, "売上高", 3) - previous(2, 3, "売上高", 3, 1), 1_000_000);
  assert.ok(previous(1, 1, "売上高", 8) < previous(1, 1, "売上高", 3), "夏季と春商戦の違い");
  assert.equal(previous(1, 1, "賃借料", 8), previous(1, 1, "賃借料", 3), "家賃を売上波形へ連動させない");
  assert.equal(previous(1, 1, "賞与", 4), 0);
  assert.ok(previous(1, 1, "賞与", 6) > 0);

  // Contract-level oracles, including launch costs retained during a revenue delay.
  assert.equal(amount("tokyo-rates", "売上高", 4), 100_000_000 * .03);
  assert.equal(amount("key-customer-volume", "売上高", 4), -2_400_000 - 72_000);
  assert.equal(amount("osaka-rates", "売上高", 7, 1), 65_000_000 * .025);
  assert.equal(amount("osaka-rates", "売上高", 7), 0);
  assert.equal(amount("osaka-rates", "売上高", 8), 1_820_000);
  assert.equal(amount("nagoya-charter", "売上高", 5), 60 * 100_000);
  assert.equal(amount("nagoya-charter", "下払運賃", 5), 60 * 100_000 * .72);
  for (const month of [4, 5, 6]) assert.equal(amount("nagoya-center", "売上高", month), 0);
  assert.equal(amount("nagoya-center", "給料手当", 5), 5 * 400_000);
  assert.equal(amount("nagoya-center", "売上高", 7), 15_000_000);
  for (const month of [4, 5, 6, 7, 8, 9, 10]) assert.equal(amount("kanto-warehouse", "売上高", month), 0);
  assert.equal(amount("kanto-warehouse", "賃借料", 9), 3000 * 3000);
  assert.equal(amount("kanto-warehouse", "給料手当", 10), 12 * 350_000);
  assert.equal(amount("kanto-warehouse", "売上高", 10, 1), 24_000_000);
  assert.equal(amount("kanto-warehouse", "臨時傭員費", 10), 0);
  assert.equal(amount("kanto-warehouse", "固定資産減価償却費", 10), 0);
  assert.equal(amount("kanto-warehouse", "固定資産減価償却費", 11), 120_000_000 / 60);
  assert.equal(amount("kanto-warehouse", "研修教育費", 9), 0);
  assert.equal(amount("kanto-warehouse", "研修教育費", 10), 1_200_000);
  assert.ok(item("tokyo-relocation").rows.every(r => r.accountId === accountId("外注費")), "来期の営業金額を先取りしない");
  assert.equal(amount("tokyo-relocation", "外注費", 1), 2_000_000);
  assert.equal(item("tokyo-automation-carryover").startYearMonths[1], `${plan.fiscalYear - 1}-10`);
  assert.equal(item("routing-carryover").startYearMonths[1], `${plan.fiscalYear - 1}-11`);
  for (const month of [10, 11, 12, 1, 2, 3]) for (const row of item("tokyo-automation-carryover").rows) assert.equal(sourceValue(row, 2, month), 0);
  assert.equal(previous(3, 1, "給料手当", 4) + amount("tokyo-automation-carryover", "給料手当", 4), previous(3, 1, "給料手当", 10), "前年未稼働月の差分だけで通年化");
  assert.equal(previous(1, 1, "給料手当", 4) + amount("routing-carryover", "給料手当", 4), previous(1, 1, "給料手当", 11));
  assert.equal(amount("ai-invoices", "外注費", 9), 0);
  assert.equal(amount("ai-invoices", "外注費", 10), -2_500_000);
  assert.equal(rows("ai-invoices", "給料手当").length, 0, "作業時間削減を社員給与削減と混同しない");
  assert.equal(amount("osaka-sorter", "臨時傭員費", 10), 0);
  assert.equal(amount("osaka-sorter", "臨時傭員費", 11), -600_000);
  assert.equal(amount("osaka-sorter", "臨時傭員費", 12), -1_200_000);
  assert.equal(amount("tokyo-packaging", "消耗品費", 3), -650_125);
  for (const kind of [1, 2]) for (const month of api.initiativeMonths) for (const name of ["売上高", "下払運賃"]) assert.equal(amount("osaka-transfer", name, month, kind) + amount("nagoya-transfer", name, month, kind), 0);
  const newKeys = ["nagoya-charter", "fukuoka-cosmetics", "sendai-supplies", "chugoku-household", "sapporo-winter", "nagoya-center", "kanto-warehouse"];
  assert.equal(newKeys.reduce((sum, id) => sum + api.initiativeMonths.reduce((n, m) => n + amount(id, "売上高", m), 0), 0), 600_800_000);

  // Independent monthly/period/annual checks for both previous bases and both budget kinds.
  for (const kind of [1, 2]) for (const projected of api.initiativesForKind(plan.initiatives, plan.accounts, kind)) for (const month of api.initiativeMonths) assert.deepEqual(projected.months[month], monthly(plan.initiatives.find(x => x.id === projected.id), kind, month));
  for (const previousKind of [1, 2]) {
    const input = { ...plan, previousKind };
    const expansion = api.buildKindExpansionTable(input, [1, 2], "registered");
    const costs = api.buildKindCostTable(input, [1, 2]);
    const sales = costs.find(r => r.kind === "group" && r.id === plan.aggregations.find(g => g.required === "sales").id);
    const profit = costs.find(r => r.kind === "group" && r.id === plan.aggregations.find(g => g.required === "ordinary").id);
    const prior = month => { const total = empty(); for (const r of plan.previousAmounts.filter(r => r.previousKind === previousKind && r.month === month)) effect(total, r.accountId, yen(r.amount)); return total; };
    const priorAnnual = api.initiativeMonths.reduce((sum, m) => sum + prior(m).profit, 0);
    for (const [index, kind] of [1, 2].entries()) {
      const expected = {};
      for (const month of api.initiativeMonths) {
        const total = prior(month);
        for (const initiative of plan.initiatives) for (const [field, value] of Object.entries(monthly(initiative, kind, month))) total[field] += value;
        expected[month] = total;
        assert.deepEqual(expansion.total[index][month], { sales: total.sales, profit: total.profit });
        assert.equal(sales.values[index + 1][month], total.sales);
        assert.equal(profit.values[index + 1][month], total.profit);
      }
      for (const period of api.previousPeriods) {
        assert.equal(api.previousPeriodAmount(sales, period, sales, profit), period.months.reduce((sum, m) => sum + prior(m).sales, 0));
        for (const field of ["sales", "profit"]) assert.equal(api.expansionPeriodAmount(expansion.total[index], period, field), period.months.reduce((sum, m) => sum + expected[m][field], 0));
      }
      const annualSales = api.initiativeMonths.reduce((sum, m) => sum + expected[m].sales, 0);
      const ordinary = api.initiativeMonths.reduce((sum, m) => sum + expected[m].profit, 0);
      assert.ok(ordinary >= priorAnnual, "先行費用を含め年間の利益水準を維持");
      if (previousKind === 2) {
        assert.equal(annualSales, kind === 1 ? 12_698_561_000 : 12_664_496_000);
        assert.equal(ordinary, kind === 1 ? 830_376_225 : 804_991_225);
        assert.ok(design.includes(annualSales.toLocaleString("en-US")) && design.includes(ordinary.toLocaleString("en-US")), "設計書の全社期待値と一致");
      }
    }
  }
  const db = await api.openTriadicDatabase(bytes);
  try { assert.equal(db.exec("PRAGMA integrity_check")[0].values[0][0], "ok"); assert.deepEqual(db.exec("PRAGMA foreign_key_check"), []); } finally { db.close(); }
  const history = await api.readDataHistory(bytes);
  assert.equal(history.entries.length, 3);
  assert.equal(history.dirtySince, null);
  const snapshots = [];
  for (const entry of history.entries) {
    const snapshot = await api.readSnapshotContents(await api.readHistorySnapshot(bytes, entry.id));
    businessData(snapshot);
    assert.deepEqual(snapshot.initiatives.slice(1), plan.initiatives.slice(1));
    assert.deepEqual(snapshot.previousAmounts, plan.previousAmounts);
    snapshots.push([entry.recordedAt, snapshot.initiatives[0].rows[0].amounts[4]]);
  }
  assert.deepEqual(snapshots, [[`${plan.fiscalYear}-03-20T00:00:00.000Z`, "3000"], [`${plan.fiscalYear}-02-20T00:00:00.000Z`, "2800"], [`${plan.fiscalYear}-01-20T00:00:00.000Z`, "2600"]]);
  for (const [id, month, expected] of [["tokyo-rates", 4, "3000"], ["kanto-warehouse", 10, "0"]]) {
    const original = item(id), draft = { ...original, fiscalYear: String(plan.fiscalYear), rows: structuredClone(original.rows) };
    draft.rows[0].amounts[month] = "3100";
    const edited = await api.updateInitiative(bytes, original.id, plan.fiscalYear, draft);
    const reloaded = (await api.readPlanContents(edited)).initiatives.find(x => x.id === original.id);
    assert.equal(reloaded.rows[0].overrides[2][month], expected, "同額・明示0の確定値は一次更新と再読込の後も維持");
    delete reloaded.rows[0].overrides[2][month];
    const cleared = await api.updateInitiative(edited, original.id, plan.fiscalYear, { ...reloaded, fiscalYear: String(plan.fiscalYear) });
    const restored = (await api.readPlanContents(cleared)).initiatives.find(x => x.id === original.id);
    assert.equal(api.initiativesForKind([restored], plan.accounts, 2)[0].rows[0].amounts[month], "3100");
  }
  if (excel) {
    const workbook = await api.serializeWorkbook(api.createReportWorkbook(plan, { tables: ["cost-table", "expansion-table", "initiative-list"], selections: { "cost-table": [1, 2], "expansion-table": [1, 2], "initiative-list": [1] }, costFilter: { industries: null, departments: null } }));
    const reopened = new ExcelJS.Workbook(); await reopened.xlsx.load(workbook);
    for (const name of ["総原価表", "展開表", "施策一覧", "計算元"]) assert.ok(reopened.getWorksheet(name));
    assert.ok(reopened.getWorksheet("計算元").rowCount > plan.initiatives.length);
  }
  assert.deepEqual(bytes, before, "検証で主ファイルを変更しない");
  console.log(`PASS: 三面運輸の前年120億円、地域/事業配分、開設と延期、通年化、利益維持、総原価表・展開表・施策一覧/期間計、3履歴、設計書との対応 (${plan.initiatives.length}施策・${bytes.length} bytes)`);
}
