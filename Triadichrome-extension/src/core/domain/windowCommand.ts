import type { PlanCommand } from "./planCommands";
import type { Initiative, InitiativeEntryDraft, PlanContents } from "./plan";
import { reconcileSavedDraft } from "../reconcileSavedDraft";
import { createPreviousInput } from "./previousAmounts";

const collections = { account: "accounts", aggregation: "aggregations", expansion: "expansions", "expansion-category": "expansionCategories", department: "departments", industry: "industries", period: "periodTypes" } as const;
export type WindowCommandBase = Partial<Pick<PlanContents, typeof collections[keyof typeof collections] | "initiatives" | "previousAmounts">>;

/** Capture the same reconciliation baseline without copying unrelated plans or documents. */
export function windowCommandBase(command: PlanCommand, contents: PlanContents): WindowCommandBase {
  if (command.type === "detail") return {};
  if (command.type === "initiative.update") return { initiatives: contents.initiatives.filter(item => item.id === command.id) };
  if (command.type === "settings" && command.change.type === "previous") {
    const { industryId, departmentId, previousKind } = command.change.input;
    return { industries: contents.industries.filter(item => item.id === industryId), departments: contents.departments.filter(item => item.id === departmentId),
      accounts: contents.accounts, previousAmounts: contents.previousAmounts.filter(item => item.industryId === industryId && item.departmentId === departmentId && item.previousKind === previousKind) };
  }
  if (command.type !== "initiative.register" && command.type !== "settings" && command.change.type === "update") {
    const key = collections[command.type], id = command.change.id;
    return { [key]: contents[key].filter(item => item.id === id) };
  }
  return {};
}

const initiativeDraft = (item: Initiative): InitiativeEntryDraft => ({ name: item.name, note: item.note,
  fiscalYear: item.fiscalYear === null ? "" : String(item.fiscalYear), expansionId: item.expansionId,
  expansionCategoryId: item.expansionCategoryId ?? null, departmentId: item.departmentId ?? null,
  industryId: item.industryId ?? null, periodTypeId: item.periodTypeId ?? null, rows: item.rows });

/** A focus change can arrive ahead of the previous window's save publication. Apply only this window's edits. */
export function reconcileWindowCommand(command: PlanCommand, base: WindowCommandBase, current: PlanContents): PlanCommand {
  if (command.type === "detail") return command;
  if (command.type === "initiative.update") {
    const before = base.initiatives?.find(item => item.id === command.id);
    const saved = current.initiatives.find(item => item.id === command.id);
    if (!before || !saved || !before.identity || before.identity !== saved.identity) throw new Error("対象の施策が変更されています。入力は保持しています。");
    return { ...command, draft: reconcileSavedDraft(initiativeDraft(before), command.draft, initiativeDraft(saved)) };
  }
  if (command.type === "settings" && command.change.type === "previous") {
    const input = command.change.input;
    for (const key of ["industries", "departments"] as const) {
      const id = key === "industries" ? input.industryId : input.departmentId;
      const before = base[key]?.find(item => item.id === id), after = current[key].find(item => item.id === id);
      if (!before || !after || before.identity !== after.identity) throw new Error("前年入力の分類が変更されています。入力は保持しています。");
    }
    return { type: "settings", change: { type: "previous", input: reconcileSavedDraft(createPreviousInput({ accounts: base.accounts ?? [], previousAmounts: base.previousAmounts ?? [] }, input.industryId, input.departmentId, input.previousKind), input, createPreviousInput(current, input.industryId, input.departmentId, input.previousKind)) } };
  }
  if (command.type !== "initiative.register" && command.type !== "settings" && command.change.type === "update") {
    const change = command.change;
    const rows = collections[command.type];
    const before = base[rows]?.find(item => item.id === change.id), after = current[rows].find(item => item.id === change.id);
    if (!before || !after || ("identity" in before && "identity" in after && before.identity !== after.identity)) throw new Error("編集対象が変更されています。入力は保持しています。");
    const keys = Object.keys(change).filter(key => key !== "type" && key !== "id");
    const pick = (source: object) => Object.fromEntries(keys.map(key => [key, Reflect.get(source, key)]));
    return { ...command, change: { ...change, ...reconcileSavedDraft(pick(before), pick(change), pick(after)) } } as PlanCommand;
  }
  return command;
}
