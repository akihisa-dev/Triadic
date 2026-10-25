import type { Initiative, InitiativeEntryDraft } from "./plan";

/** Saved editing baseline only; callers add display rows or create new identities explicitly. */
export const initiativeDraft = (item: Initiative): InitiativeEntryDraft => ({
  name: item.name, note: item.note,
  fiscalYear: item.fiscalYear === null ? "" : String(item.fiscalYear), expansionId: item.expansionId,
  expansionCategoryId: item.expansionCategoryId ?? null, departmentId: item.departmentId ?? null,
  industryId: item.industryId ?? null, periodTypeId: item.periodTypeId ?? null, rows: item.rows,
});
