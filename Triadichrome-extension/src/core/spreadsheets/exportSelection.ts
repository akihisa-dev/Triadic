import type { PlanContents } from "../domain/plan";
import type { PreviousPair } from "./workbook";

export type ExportClassificationSelection = { industries: number[]; departments: number[]; pairs: PreviousPair[] };

/** Keep surviving choices, dropping masters and memberships removed by undo or restore. */
export function normalizeExportClassificationSelection(
  contents: Pick<PlanContents, "industries" | "departments">,
  selection: ExportClassificationSelection,
): ExportClassificationSelection {
  const industries = new Set(contents.industries.map(item => item.id));
  const departments = new Map(contents.departments.map(item => [item.id, new Set(item.industryIds)]));
  return {
    industries: selection.industries.filter(id => industries.has(id)),
    departments: selection.departments.filter(id => departments.has(id)),
    pairs: selection.pairs.filter(pair => industries.has(pair.industryId) && departments.get(pair.departmentId)?.has(pair.industryId)),
  };
}
