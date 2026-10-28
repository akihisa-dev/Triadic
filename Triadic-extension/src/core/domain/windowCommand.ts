import type { PlanCommand } from "./planCommands";
import type { PlanContents, InitiativeEntryDraft } from "./plan";
import { initiativeDraft } from "./initiativeDraft";
import { reconcileSavedDraft } from "../reconcileSavedDraft";
import { createPreviousInput } from "./previousAmounts";
import { expansionCategoryDeletionKey } from "./expansionCategoryMaster";
import { expansionDeletionKey } from "./expansionMaster";
import { periodDeletionKey } from "./periodMaster";
import { aggregationDeletionKey } from "./aggregationMaster";
import { orderedMasterRows } from "./masterRows";
import { reconcileInitiativeDraftReferences } from "./initiativeDraftReferences";

const collections = { account: "accounts", aggregation: "aggregations", expansion: "expansions", "expansion-category": "expansionCategories", department: "departments", industry: "industries", period: "periodTypes" } as const;
export type WindowCommandBase = Partial<Pick<PlanContents, typeof collections[keyof typeof collections] | "initiatives" | "previousAmounts">>;

/** Only references selected by this edit need their original master baseline. */
function selectedUpdateReferences(draft: InitiativeEntryDraft, original: InitiativeEntryDraft): InitiativeEntryDraft {
  const classificationChanged = draft.departmentId !== original.departmentId || draft.industryId !== original.industryId;
  const expansionChanged = draft.expansionId !== original.expansionId || draft.expansionCategoryId !== original.expansionCategoryId;
  const originalAccounts = new Map(original.rows.map(row => [row.id, row.accountId]));
  return { ...draft,
    departmentId: classificationChanged ? draft.departmentId ?? null : null,
    industryId: classificationChanged ? draft.industryId ?? null : null,
    expansionId: expansionChanged ? draft.expansionId : null,
    expansionCategoryId: expansionChanged ? draft.expansionCategoryId ?? null : null,
    periodTypeId: draft.periodTypeId !== original.periodTypeId ? draft.periodTypeId ?? null : null,
    rows: draft.rows.filter(row => originalAccounts.get(row.id) !== row.accountId),
  };
}

/** Capture the same reconciliation baseline without copying unrelated plans. */
export function windowCommandBase(command: PlanCommand, contents: PlanContents): WindowCommandBase {
  if (command.type === "initiative.register") return {
    accounts: contents.accounts, expansions: contents.expansions, expansionCategories: contents.expansionCategories,
    periodTypes: contents.periodTypes, departments: contents.departments, industries: contents.industries,
  };
  if (command.type === "initiative.update") {
    const before = contents.initiatives.find(item => item.id === command.id);
    if (!before) return { initiatives: [] };
    const selected = selectedUpdateReferences(command.draft, initiativeDraft(before));
    const byId = <T extends { id: number }>(rows: T[], id: number | null | undefined) => id == null ? [] : rows.filter(item => item.id === id);
    const accounts = new Set(selected.rows.flatMap(row => row.accountId == null ? [] : [row.accountId]));
    return { initiatives: [before], accounts: accounts.size ? contents.accounts.filter(item => accounts.has(item.id)) : [],
      departments: byId(contents.departments, selected.departmentId), industries: byId(contents.industries, selected.industryId),
      expansions: byId(contents.expansions, selected.expansionId), expansionCategories: byId(contents.expansionCategories, selected.expansionCategoryId),
      periodTypes: byId(contents.periodTypes, selected.periodTypeId) };
  }
  if (command.type === "account" || command.type === "aggregation") return { accounts: contents.accounts, aggregations: contents.aggregations };
  if (command.type === "settings" && command.change.type === "previous") {
    const { industryId, departmentId, previousKind } = command.change.input;
    return { industries: contents.industries.filter(item => item.id === industryId), departments: contents.departments.filter(item => item.id === departmentId),
      accounts: contents.accounts, previousAmounts: contents.previousAmounts.filter(item => item.industryId === industryId && item.departmentId === departmentId && item.previousKind === previousKind) };
  }
  if (command.type !== "settings" && (command.change.type === "update"
    || ((command.type === "period" || command.type === "expansion" || command.type === "expansion-category" || command.type === "department" || command.type === "industry") && command.change.type === "delete"))) {
    const key = collections[command.type], id = command.change.id;
    return { [key]: contents[key].filter(item => item.id === id) };
  }
  return {};
}

/** A focus change can arrive ahead of the previous window's save publication. Apply only this window's edits. */
export function reconcileWindowCommand(command: PlanCommand, base: WindowCommandBase, current: PlanContents): PlanCommand {
  if (command.type === "initiative.register") {
    const before = {
      accounts: base.accounts ?? [], expansions: base.expansions ?? [], expansionCategories: base.expansionCategories ?? [],
      periodTypes: base.periodTypes ?? [], departments: base.departments ?? [], industries: base.industries ?? [],
    };
    if (reconcileInitiativeDraftReferences(command.draft, before, current) !== command.draft) {
      throw new Error("施策の選択先が別のデータに変更されています。入力を保持しました。分類と科目を選び直してください。");
    }
    return command;
  }
  if (command.type === "account" || command.type === "aggregation") {
    const originalOrder = orderedMasterRows(base.accounts ?? [], base.aggregations ?? []);
    const latestOrder = orderedMasterRows(current.accounts, current.aggregations);
    const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
    const requestedOrder = command.change.type === "reorder"
      ? command.type === "aggregation" ? command.change.order : command.change.presentationOrder
      : command.change.presentationOrder;
    const orderOperation = command.change.type === "reorder" || (command.type === "aggregation" && command.change.type === "move");
    const changesOrder = orderOperation && (command.change.type === "reorder" || (requestedOrder !== undefined && !same(requestedOrder, originalOrder)));
    if (changesOrder && !same(originalOrder, latestOrder)) throw new Error("表示順が別の画面で変更されています。最新の順序を確認してから操作してください。");
    if (!orderOperation && command.change.presentationOrder !== undefined) {
      const { presentationOrder: _stale, ...change } = command.change;
      command = { ...command, change } as PlanCommand;
    }
  }
  if (command.type === "expansion" && command.change.type === "delete") {
    const id = command.change.id;
    const before = base.expansions?.find(item => item.id === id);
    if (!before) throw new Error("削除対象の展開が変更されています。対象を選び直してください。");
    return { ...command, change: { ...command.change, deletionKey: command.change.deletionKey ?? expansionDeletionKey(before) } };
  }
  if (command.type === "expansion-category" && command.change.type === "delete") {
    const id = command.change.id;
    const before = base.expansionCategories?.find(item => item.id === id);
    if (!before) throw new Error("削除対象の展開区分が変更されています。対象を選び直してください。");
    return { ...command, change: { ...command.change, deletionKey: command.change.deletionKey ?? expansionCategoryDeletionKey(before) } };
  }
  if (command.type === "period" && command.change.type === "delete") {
    const id = command.change.id;
    const before = base.periodTypes?.find(item => item.id === id);
    if (!before) throw new Error("削除対象の期間が変更されています。対象を選び直してください。");
    return { ...command, change: { ...command.change, deletionKey: command.change.deletionKey ?? periodDeletionKey(before) } };
  }
  if ((command.type === "department" || command.type === "industry") && command.change.type === "delete") {
    const key = collections[command.type], id = command.change.id;
    const before = base[key]?.find(item => item.id === id);
    if (!before?.identity) throw new Error("削除対象が変更されています。対象を選び直してください。");
    return { ...command, change: { ...command.change, deletionKey: command.change.deletionKey ?? before.identity } };
  }
  if (command.type === "aggregation" && command.change.type === "delete") {
    const id = command.change.id;
    const before = base.aggregations?.find(item => item.id === id);
    if (!before) throw new Error("削除対象の集計が変更されています。対象を選び直してください。");
    return { ...command, change: { ...command.change, deletionKey: command.change.deletionKey ?? aggregationDeletionKey(before) } };
  }
  if (command.type === "initiative.update") {
    const before = base.initiatives?.find(item => item.id === command.id);
    const saved = current.initiatives.find(item => item.id === command.id);
    if (!before || !saved || !before.identity || before.identity !== saved.identity) throw new Error("対象の施策が変更されています。入力は保持しています。");
    const original = initiativeDraft(before), draft = command.draft;
    // Unchanged references can merge with ordinary master updates.
    const selected = selectedUpdateReferences(draft, original);
    const references = {
      accounts: base.accounts ?? [], expansions: base.expansions ?? [], expansionCategories: base.expansionCategories ?? [],
      periodTypes: base.periodTypes ?? [], departments: base.departments ?? [], industries: base.industries ?? [],
    };
    if (reconcileInitiativeDraftReferences(selected, references, current) !== selected) {
      throw new Error("施策の選択先が別のデータに変更されています。入力を保持しました。分類と科目を選び直してください。");
    }
    return { ...command, draft: reconcileSavedDraft(original, draft, initiativeDraft(saved)) };
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
