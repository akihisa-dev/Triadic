import { createTriadicDatabase, openTriadicDatabase, exportTriadicDatabase } from "../../Triadic-extension/src/core/storage/triadicDatabase";
import { editDatabase } from "../../Triadic-extension/src/core/storage/transaction";
import { BUSINESS_TABLES } from "../../Triadic-extension/src/core/storage/triadicSchema";
import type { Database } from "../../Triadic-extension/src/core/storage/sqliteRuntime";
import { applyDepartmentChange } from "../../Triadic-extension/src/core/storage/departmentMaster";
import { applyPreviousAmounts } from "../../Triadic-extension/src/core/storage/settings";
import { applyInitiativeRegistration, updateInitiative } from "../../Triadic-extension/src/core/storage/initiatives";
import { readPlanContents } from "../../Triadic-extension/src/core/storage/readPlan";
import { trackHistoryChange, recordDataHistory } from "../../Triadic-extension/src/core/storage/dataHistory";
import { initiativeMonths } from "../../Triadic-extension/src/core/domain/calendar";
import { yenToAmount } from "../../Triadic-extension/src/core/domain/amounts";
import { businessScenarios, companyRegions, companyBusinesses, previousAnnualSales, workloadWeights, months } from "./sample-portfolio";

// The delivered sample has a fixed year; ordinary new files still use the app calendar.
export const BUSINESS_SAMPLE_FISCAL_YEAR = 2027;

// Ratio to annual business sales; the second field selects volume-linked versus fixed cost allocation.
// These are fictional planning assumptions, not claimed industry statistics.
const costProfiles: [string, number, "volume" | "fixed" | "bonus"][][] = [
  [["下払運賃", .315, "volume"], ["燃料油脂費", .09, "volume"], ["通行乗船料", .05, "volume"], ["給料手当", .29, "fixed"],
    ["法定福利費", .045, "fixed"], ["賞与", .04, "bonus"], ["固定資産減価償却費", .03, "fixed"], ["賃借料", .02, "fixed"],
    ["修繕費", .02, "fixed"], ["保険料", .01, "fixed"], ["タイヤチューブ費", .005, "volume"], ["ＥＤＰ処理料", .007, "fixed"], ["租税公課", .008, "fixed"]],
  [["下払運賃", .65, "volume"], ["給料手当", .12, "fixed"], ["法定福利費", .02, "fixed"], ["賞与", .015, "bonus"],
    ["燃料油脂費", .04, "volume"], ["通行乗船料", .02, "volume"], ["固定資産減価償却費", .015, "fixed"], ["賃借料", .01, "fixed"],
    ["修繕費", .005, "fixed"], ["保険料", .005, "fixed"], ["ＥＤＰ処理料", .005, "fixed"], ["租税公課", .015, "fixed"]],
  [["給料手当", .23, "fixed"], ["法定福利費", .035, "fixed"], ["賞与", .03, "bonus"], ["臨時傭員費", .22, "volume"],
    ["下払作業賃", .07, "volume"], ["賃借料", .23, "fixed"], ["固定資産減価償却費", .03, "fixed"], ["動力光熱費", .03, "volume"],
    ["修繕費", .01, "fixed"], ["ＥＤＰ処理料", .01, "fixed"], ["保険料", .005, "fixed"], ["消耗品費", .01, "volume"]],
];
// Allocate an annual yen amount without losing residual yen, including the year-end month.
function allocate(annualThousands: number, weights: number[]): number[] {
  const total = Math.round(annualThousands * 1000), denominator = weights.reduce((a, b) => a + b, 0);
  let allocated = 0;
  return weights.map((weight, i) => {
    const value = i === 11 ? total - allocated : Math.round(total * weight / denominator);
    allocated += value;
    return value;
  });
}

// Only department definitions/memberships and budget data may change in this generator.
// This guard belongs to sample authoring, not the product's user-editing operations.
const sampleDataTables = new Set<string>(["triadic_metadata", "document_info", "departments", "department_industries", "initiatives", "initiative_rows", "initiative_amounts", "previous_amounts", "kind_selections"]);
function protectedSampleMasters(database: Database): string {
  return JSON.stringify(BUSINESS_TABLES.filter(table => !sampleDataTables.has(table)).map(table => [table,
    (database.exec(`SELECT * FROM ${table}`)[0]?.values ?? []).map(row => JSON.stringify(row)).sort(),
  ]));
}

export async function createBusinessSample(fiscalYear: number): Promise<Uint8Array> {
  const initial = await editDatabase(await createTriadicDatabase(fiscalYear), database => {
    // Seed opaque creation identities once for reproducible new files, before authoring begins.
    // Codes, names, IDs, memberships, attributes and presentation remain the defaults.
    for (const [id] of database.exec("SELECT id FROM industries")[0]?.values ?? []) {
      database.run("UPDATE industries SET identity = ? WHERE id = ?", ["1" + Number(id).toString(16).padStart(31, "0"), Number(id)]);
    }
    return protectedSampleMasters(database);
  });
  let bytes = initial.bytes;
  const expectedMasters = initial.result;
  const defaults = await readPlanContents(bytes);
  const accounts = new Map(defaults.accounts.map(account => [account.accountName, account.id]));
  // Business descriptions are not replacement industry names. Select the existing default codes.
  const industryCodes: Record<string, string> = { "ルート配送": "1", "チャーター配送": "2", "アパレル倉庫": "3", "非衣料品倉庫": "4", "本社管理": "8", "営業外": "9" };
  const industryId = (business: string) => {
    const industry = defaults.industries.find(item => item.industryCode === industryCodes[business]);
    if (!industry) throw new Error(`サンプルで参照するデフォルト業種がありません: ${business}`);
    return industry.id;
  };
  bytes = (await editDatabase(bytes, database => {
    // Departments are the only user-authorized exception to default master preservation.
    for (const department of defaults.departments) applyDepartmentChange(database, { type: "delete", id: department.id });
    companyRegions.forEach((departmentName, i) => applyDepartmentChange(database, { type: "add", departmentName,
      industryIds: i === 7 ? [industryId("本社管理"), industryId("営業外")]
        : [industryId("ルート配送"), industryId("チャーター配送"), industryId("アパレル倉庫"), ...([0, 3].includes(i) ? [industryId("非衣料品倉庫")] : [])] }));
    for (let business = 0; business < 3; business++) for (let region = 0; region < 7; region++) {
      const annual = previousAnnualSales[business]![region]!;
      const weights = workloadWeights[business]!;
      const source = new Map<string, number[]>([["売上高", allocate(annual, weights)]]);
      for (const [account, ratio, pattern] of costProfiles[business]!) {
        // Snow-season fuel costs in Sapporo differ from the service volume seasonality.
        const costWeights = account === "燃料油脂費" && region === 5
          ? [90, 85, 80, 80, 85, 90, 100, 110, 120, 130, 130, 110]
          : pattern === "volume" ? weights : pattern === "bonus" ? months(i => i === 2 || i === 8 ? 1 : 0) : Array(12).fill(1);
        source.set(account, allocate(annual * ratio, costWeights));
      }
      // Year-one projects are part of the previous-year ledger from their real launch month.
      // Year-two carryover initiatives fill only the months that lacked the year-one effects.
      const change = (name: string, start: number, thousands: number) => {
        const values = source.get(name)!;
        for (let i = start; i < 12; i++) values[i]! += Math.round(thousands * 1000);
      };
      if (business === 2 && region === 0) {
        change("臨時傭員費", 6, -2000); change("給料手当", 6, -1000);
        change("固定資産減価償却費", 6, 800); change("修繕費", 6, 300);
      }
      if (business === 0 && region === 0) {
        change("下払運賃", 7, -1200); change("燃料油脂費", 7, -600);
        change("給料手当", 7, -400); change("ＥＤＰ処理料", 7, 250);
      }
      for (const previousKind of [1, 2] as const) applyPreviousAmounts(database, {
        previousKind, industryId: industryId(companyBusinesses[business]!), departmentId: region + 1,
        rows: [...source].map(([name, values]) => ({ accountId: accounts.get(name)!, amounts: Object.fromEntries(initiativeMonths.map((month, i) => {
          let value = values[i]!;
          // Forecast January–March contained unconfirmed orders; actuals retain the balanced annual ledger.
          if (previousKind === 1 && business === 2 && region === 0 && i >= 9 && name === "売上高") value += 1_500_000;
          if (previousKind === 1 && business === 2 && region === 0 && i >= 9 && name === "臨時傭員費") value += 300_000;
          if (previousKind === 1 && business === 1 && region === 2 && month === 3 && name === "売上高") value -= 1_000_000;
          if (previousKind === 1 && business === 1 && region === 2 && month === 3 && name === "下払運賃") value -= 720_000;
          return [month, yenToAmount(value)];
        })) })),
      });
    }
    const hq: [string, number[]][] = [
      ["給料手当", months(() => 13000)], ["法定福利費", months(() => 2000)], ["賞与", months(i => i === 2 || i === 8 ? 12000 : 0)],
      ["役員報酬", months(() => 3000)], ["ＥＤＰ処理料", months(() => 5000)], ["外注費", months(() => 3000)], ["賃借料", months(() => 1000)],
      ["研修教育費", months(() => 500)], ["旅費", months(() => 500)], ["固定資産減価償却費", months(() => 1000)],
      ["営業外収益", months(() => 500)], ["営業外費用", months(() => 1000)],
    ];
    for (const previousKind of [1, 2] as const) for (const nonOperating of [false, true]) applyPreviousAmounts(database, {
      previousKind, industryId: industryId(nonOperating ? "営業外" : "本社管理"), departmentId: 8,
      rows: hq.filter(([name]) => name.startsWith("営業外") === nonOperating).map(([name, amounts]) => ({ accountId: accounts.get(name)!, amounts: Object.fromEntries(initiativeMonths.map((month, i) => [month, yenToAmount(amounts[i]! * 1000)])) })) });
    const scenarios = businessScenarios(accounts);
    for (const scenario of scenarios) applyInitiativeRegistration(database, {
      name: scenario.name, note: scenario.note, fiscalYear: String(fiscalYear),
      departmentId: companyRegions.indexOf(scenario.region) + 1, industryId: industryId(scenario.key === "funding" ? "営業外" : scenario.business),
      expansionId: defaults.expansions.find(item => item.expansionName === scenario.expansion)!.id,
      expansionCategoryId: scenario.category ? defaults.expansionCategories.find(item => item.categoryName === scenario.category)!.id : null,
      periodTypeId: scenario.carryover ? 1 : 2, rows: scenario.rows,
    });
  })).bytes;
  const created = `${fiscalYear - 1}-12-10T00:00:00.000Z`;
  const stable = async (input: Uint8Array, at: string) => {
    const database = await openTriadicDatabase(input);
    try {
      database.run("UPDATE document_info SET created_at = ?, updated_at = ?", [created, at]);
      database.run("UPDATE data_history_state SET saved_at = ?", [at]);
      for (const [table, prefix] of [["departments", "2"], ["initiatives", "3"]]) {
        for (const [id] of database.exec(`SELECT id FROM ${table}`)[0]?.values ?? []) database.run(`UPDATE ${table} SET identity = ? WHERE id = ?`, [prefix + Number(id).toString(16).padStart(31, "0"), Number(id)]);
      }
      if (protectedSampleMasters(database) !== expectedMasters) throw new Error("サンプル生成で部署以外のデフォルトマスタが変更されました。");
      return exportTriadicDatabase(database);
    } finally { database.close(); }
  };
  const original = (await readPlanContents(bytes)).initiatives[0]!;
  const stages = [
    ["01-20", "2600", "1月20日時点。東京の対象運賃月1億円に2.6%の是正を提示。4月以降の条件は交渉中。他の計画は現行案を保持。"],
    ["02-20", "2800", "2月20日時点。東京の対象運賃月1億円に2.8%の是正で再協議。4月以降の合意前の予算案。他の計画は現行案を保持。"],
    ["03-20", "3000", original.note],
  ];
  for (const [index, stage] of stages.entries()) {
    const [date, amount, note] = stage as [string, string, string];
    const at = `${fiscalYear}-${date}T00:00:00.000Z`;
    const draft = { ...original, note, fiscalYear: String(fiscalYear), rows: original.rows.map(row => ({ ...row,
      amounts: Object.fromEntries(initiativeMonths.map(month => [month, amount])), overrides: { 2: { 4: amount } } })) };
    const updated = await stable(await updateInitiative(bytes, original.id, fiscalYear, draft), at);
    bytes = await trackHistoryChange(index === 0 ? updated : bytes, updated, at);
    if (index > 0) bytes = await recordDataHistory(bytes, at, true);
  }
  return bytes;
}
