import type { PlanCommand } from "./planCommands";
import type { Initiative, InitiativeEntryDraft, PlanContents } from "./plan";
import { reconcileSavedDraft } from "../reconcileSavedDraft";
import { createPreviousInput } from "./previousAmounts";

const initiativeDraft = (item: Initiative): InitiativeEntryDraft => ({ name: item.name, note: item.note,
  fiscalYear: item.fiscalYear === null ? "" : String(item.fiscalYear), expansionId: item.expansionId,
  expansionCategoryId: item.expansionCategoryId ?? null, departmentId: item.departmentId ?? null,
  industryId: item.industryId ?? null, periodTypeId: item.periodTypeId ?? null, rows: item.rows });

/** A focus change can arrive ahead of the previous window's save publication. Apply only this window's edits. */
export function reconcileWindowCommand(command: PlanCommand, base: PlanContents, current: PlanContents): PlanCommand {
  if (command.type === "detail") return command;
  if (command.type === "initiative.update") {
    const before = base.initiatives.find(item => item.id === command.id);
    const saved = current.initiatives.find(item => item.id === command.id);
    if (!before || !saved || !before.identity || before.identity !== saved.identity) throw new Error("対象の施策が変更されています。入力は保持しています。");
    return { ...command, draft: reconcileSavedDraft(initiativeDraft(before), command.draft, initiativeDraft(saved)) };
  }
  if (command.type === "settings" && command.change.type === "previous") {
    const input = command.change.input;
    for (const key of ["industries", "departments"] as const) {
      const id = key === "industries" ? input.industryId : input.departmentId;
      const before = base[key].find(item => item.id === id), after = current[key].find(item => item.id === id);
      if (!before || !after || before.identity !== after.identity) throw new Error("前年入力の分類が変更されています。入力は保持しています。");
    }
    return { type: "settings", change: { type: "previous", input: reconcileSavedDraft(createPreviousInput(base, input.industryId, input.departmentId, input.previousKind), input, createPreviousInput(current, input.industryId, input.departmentId, input.previousKind)) } };
  }
  if (command.type !== "initiative.register" && command.type !== "settings" && command.change.type === "update") {
    const collections = { account: "accounts", aggregation: "aggregations", expansion: "expansions", "expansion-category": "expansionCategories", department: "departments", industry: "industries", period: "periodTypes" } as const;
    const change = command.change;
    const rows = collections[command.type];
    const before = base[rows].find(item => item.id === change.id), after = current[rows].find(item => item.id === change.id);
    if (!before || !after || ("identity" in before && "identity" in after && before.identity !== after.identity)) throw new Error("編集対象が変更されています。入力は保持しています。");
    const keys = Object.keys(change).filter(key => key !== "type" && key !== "id");
    const pick = (source: object) => Object.fromEntries(keys.map(key => [key, Reflect.get(source, key)]));
    return { ...command, change: { ...change, ...reconcileSavedDraft(pick(before), pick(change), pick(after)) } } as PlanCommand;
  }
  return command;
}
