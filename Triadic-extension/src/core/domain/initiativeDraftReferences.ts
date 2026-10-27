import type { InitiativeEntryDraft, PlanContents } from "./plan";

type ReferenceCollection = "accounts" | "expansions" | "expansionCategories" | "periodTypes";
export type LocalDraftReference = { collection: ReferenceCollection; id: number; expected: object };
export type InitiativeDraftReferences = Pick<PlanContents, ReferenceCollection | "departments" | "industries">;

/** Identity-less masters are compared by their business fields, never usage/order. */
function signature(collection: ReferenceCollection, item: object) {
  const value = item as Record<string, unknown>;
  const fields = collection === "accounts" ? ["accountCode", "accountName", "accountType"]
    : collection === "expansions" ? ["expansionCode", "expansionName"]
    : collection === "expansionCategories" ? ["categoryName", "expansionId"] : ["periodName", "startMonthRule"];
  return JSON.stringify(fields.map(field => typeof value[field] === "string" ? value[field].trim() : value[field] ?? null));
}

/** Reconcile only published current data, never a history preview or failed save. */
export function reconcileInitiativeDraftReferences(draft: InitiativeEntryDraft, before: InitiativeDraftReferences, after: InitiativeDraftReferences, local?: LocalDraftReference | null): InitiativeEntryDraft {
  const oldAccounts = new Map(before.accounts.map(account => [account.id, account]));
  const nextAccounts = new Map(after.accounts.map(account => [account.id, account]));
  const accountChecks = new Map<number, boolean>();
  const sameIdentity = (collection: "departments" | "industries", id: number | null | undefined) => {
    if (id == null) return true;
    const old = before[collection].find(item => item.id === id), next = after[collection].find(item => item.id === id);
    return !!old?.identity && old.identity === next?.identity;
  };
  const sameReference = (collection: ReferenceCollection, id: number | null | undefined) => {
    if (id == null) return true;
    if (collection === "accounts" && accountChecks.has(id)) return accountChecks.get(id)!;
    const old = collection === "accounts" ? oldAccounts.get(id) : before[collection].find(item => item.id === id);
    const next = collection === "accounts" ? nextAccounts.get(id) : after[collection].find(item => item.id === id);
    const expected = local?.collection === collection && local.id === id ? local.expected : old;
    const same = !!old && !!next && signature(collection, expected!) === signature(collection, next);
    if (collection === "accounts") accountChecks.set(id, same);
    return same;
  };
  const departmentId = sameIdentity("departments", draft.departmentId) ? draft.departmentId ?? null : null;
  const industryId = departmentId != null && sameIdentity("industries", draft.industryId)
    && after.departments.find(item => item.id === departmentId)?.industryIds.includes(draft.industryId!) ? draft.industryId ?? null : null;
  const expansionId = sameReference("expansions", draft.expansionId) ? draft.expansionId : null;
  const expansionCategoryId = expansionId != null && sameReference("expansionCategories", draft.expansionCategoryId)
    && after.expansions.find(item => item.id === expansionId)?.categoryIds?.includes(draft.expansionCategoryId!) ? draft.expansionCategoryId ?? null : null;
  const periodTypeId = sameReference("periodTypes", draft.periodTypeId) ? draft.periodTypeId ?? null : null;
  const rows = draft.rows.map(row => sameReference("accounts", row.accountId) ? row : { ...row, accountId: null });
  if ((departmentId ?? null) === (draft.departmentId ?? null) && (industryId ?? null) === (draft.industryId ?? null)
    && expansionId === draft.expansionId && (expansionCategoryId ?? null) === (draft.expansionCategoryId ?? null)
    && (periodTypeId ?? null) === (draft.periodTypeId ?? null) && rows.every((row, index) => row === draft.rows[index])) return draft;
  return { ...draft, departmentId, industryId, expansionId, expansionCategoryId, periodTypeId, rows };
}

/** Keep protected input independent of the replaced initiative and recheck its master references. */
export function recoverInitiativeDraft(draft: InitiativeEntryDraft, before: InitiativeDraftReferences, after: InitiativeDraftReferences): InitiativeEntryDraft {
  const checked = reconcileInitiativeDraftReferences(draft, before, after);
  return { ...structuredClone(checked), rows: checked.rows.map(row => {
    const { id: _id, revision: _revision, amountRevisions: _amountRevisions, overrideRevisions: _overrideRevisions, ...input } = row;
    return { ...structuredClone(input), id: crypto.randomUUID() };
  }) };
}
