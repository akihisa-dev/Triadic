import { listExpansionCategories } from "./expansionCategoryMaster";
import type { Database } from "./sqliteRuntime";
import { openTriadicDatabase, openBusinessSnapshot } from "./triadicDatabase";
import { deriveStartYearMonth } from "../domain/initiativeStartMonth";
import { yenToAmount } from "../domain/amounts";
import { INITIAL_KINDS, type KindOverrides } from "../domain/kinds";
import type { Initiative, InitiativeRow, PlanContents } from "../domain/plan";
import { readPlanSettings } from "./settings";
import { listAccounts } from "./accountMaster";
import { listAggregations } from "./aggregations";
import { listExpansions } from "./expansionMaster";
import { listIndustries } from "./industryMaster";
import { listDepartments } from "./departmentMaster";
import { listPeriodTypes } from "./periodMaster";
export function listInitiatives(db: Database, fiscalYear: number, initiativeId?: number): Initiative[] {
  const params = initiativeId === undefined ? undefined : [initiativeId];
  const owned = initiativeId === undefined ? "" : " WHERE initiative_id = ?";
  const amounts = initiativeId === undefined ? "" : " WHERE row_id IN (SELECT id FROM initiative_rows WHERE initiative_id = ?)";
  const rowsByOwner = new Map<number, InitiativeRow[]>();
  const rowsById = new Map<string, InitiativeRow>();
  for (const [id, owner, account, order, revision] of db.exec(`SELECT id, initiative_id, account_id, sort_order, revision FROM initiative_rows${owned} ORDER BY sort_order, id`, params)[0]?.values ?? []) {
    void order;
    const row: InitiativeRow = { id: String(id), accountId: Number(account), revision: Number(revision), amounts: {}, overrides: {}, amountRevisions: {}, overrideRevisions: {} };
    const ownerId = Number(owner);
    const rows = rowsByOwner.get(ownerId) ?? [];
    rows.push(row); rowsByOwner.set(ownerId, rows); rowsById.set(String(id), row);
  }
  for (const [id, kind, month, amount, revision] of db.exec(`SELECT row_id, kind_id, month, amount_yen, revision FROM initiative_amounts${amounts}`, params)[0]?.values ?? []) {
    const row = rowsById.get(String(id))!;
    if (kind === 1) {
      row.amounts[Number(month) as keyof typeof row.amounts] = yenToAmount(Number(amount)); row.amountRevisions![Number(month)] = Number(revision);
    } else {
      const overrides = row.overrides as KindOverrides;
      (overrides[2] ??= {})[Number(month)] = yenToAmount(Number(amount)); row.overrideRevisions![Number(month)] = Number(revision);
    }
  }
  const rules = new Map(listPeriodTypes(db).map(period => [period.id, period.startMonthRule]));
  return (db.exec(`SELECT id, name, note, expansion_id, expansion_category_id, department_id, period_type_id, industry_id, revision, identity FROM initiatives${initiativeId === undefined ? "" : " WHERE id = ?"} ORDER BY sort_order, id`, params)[0]?.values ?? [])
    .map(([id, name, note, expansion, category, department, period, industry, revision, identity]) => {
      const rows = rowsByOwner.get(Number(id)) ?? [];
      const rule = period === null ? null : rules.get(Number(period)) ?? null;
      return { id: Number(id), identity: String(identity), name: String(name), note: String(note), expansionId: Number(expansion), expansionCategoryId: category === null ? null : Number(category), departmentId: Number(department), periodTypeId: period === null ? null : Number(period), industryId: Number(industry), fiscalYear, revision: Number(revision),
        startYearMonths: { 1: deriveStartYearMonth(fiscalYear, rule, rows, 1), 2: deriveStartYearMonth(fiscalYear, rule, rows, 2) }, rows };
    });
}
export function readContents(db: Database): PlanContents {
  const settings = readPlanSettings(db);
  const accounts = listAccounts(db);
  const contents: PlanContents = { ...settings, accounts, initiatives: listInitiatives(db, settings.fiscalYear),
    aggregations: listAggregations(db), expansions: listExpansions(db), expansionCategories: listExpansionCategories(db), industries: listIndustries(db), departments: listDepartments(db), periodTypes: listPeriodTypes(db), kinds: INITIAL_KINDS.map(kind => ({ ...kind })) };
  return contents;
}
async function read(bytes: Uint8Array, open: typeof openTriadicDatabase): Promise<PlanContents> {
  const db = await open(bytes);
  try { return readContents(db); } finally { db.close(); }
}
export const readPlanContents = (bytes: Uint8Array) => read(bytes, openTriadicDatabase);
export const readSnapshotContents = (bytes: Uint8Array) => read(bytes, openBusinessSnapshot);
