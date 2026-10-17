import type { InitiativeEntryDraft, PlanContents } from "./plan";
import { validateInitiative } from "./initiativeRules";
import { deriveStartYearMonth } from "./initiativeStartMonth";

export type TrialBudget = { contents: PlanContents; excluded: number[] };
/** Trial values never own a file handle or a storage command. */
export function createTrialBudget(contents: PlanContents): TrialBudget {
  const copy = structuredClone(contents);
  delete copy.details;
  return { contents: copy, excluded: [] };
}
export function updateTrialInitiative(trial: TrialBudget, id: number, draft: InitiativeEntryDraft): TrialBudget {
  const plan = trial.contents;
  const original = plan.initiatives.find(item => item.id === id);
  if (!original) throw new Error("施策が見つかりません。");
  validateInitiative(draft, plan.accounts, plan.initiatives.filter(item => item.id !== id), plan.expansions, plan.departments, plan.periodTypes, plan.industries, true);
  if (Number(draft.fiscalYear) !== plan.fiscalYear) throw new Error("基準年度と同じ年度を指定してください。");
  const rows = structuredClone(draft.rows.filter(row => row.accountId !== null));
  const rule = plan.periodTypes.find(item => item.id === draft.periodTypeId)?.startMonthRule ?? null;
  const initiative = { ...original, ...structuredClone(draft), name: draft.name.trim(), fiscalYear: plan.fiscalYear, rows, months: {},
    startYearMonths: { 1: deriveStartYearMonth(plan.fiscalYear, rule, rows, 1), 2: deriveStartYearMonth(plan.fiscalYear, rule, rows, 2) } };
  if (JSON.stringify(initiative) === JSON.stringify(original)) return trial;
  return { ...trial, contents: { ...plan, initiatives: plan.initiatives.map(item => item.id === id ? initiative : item) } };
}
export function toggleTrialInitiative(trial: TrialBudget, id: number): TrialBudget {
  if (!trial.contents.initiatives.some(item => item.id === id)) throw new Error("施策が見つかりません。");
  return { ...trial, excluded: trial.excluded.includes(id) ? trial.excluded.filter(value => value !== id) : [...trial.excluded, id] };
}
/** Keep excluded initiatives reachable in the list, but remove all their contributions in every table. */
export function trialReportContents(trial: TrialBudget): PlanContents {
  const excluded = new Set(trial.excluded);
  return { ...trial.contents, initiatives: trial.contents.initiatives.map(item => excluded.has(item.id)
    ? { ...item, rows: [], months: {}, startYearMonths: { 1: null, 2: null } } : item) };
}
