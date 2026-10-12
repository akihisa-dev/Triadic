import type { PlanContents } from "../domain/plan";
import type { PreviousPatch } from "../domain/kinds";

export function previousPatchPresentation(contents: Pick<PlanContents, "industries" | "departments" | "accounts">, patches: readonly PreviousPatch[]) {
  const industries = new Map(contents.industries.map(item => [item.id, item.industryName]));
  const departments = new Map(contents.departments.map(item => [item.id, item.departmentName]));
  const accounts = new Map(contents.accounts.map(item => [item.id, item.accountName]));
  return patches.map(patch => ({ patch, industryName: industries.get(patch.industryId),
    departmentName: departments.get(patch.departmentId), accountName: accounts.get(patch.accountId) }));
}
