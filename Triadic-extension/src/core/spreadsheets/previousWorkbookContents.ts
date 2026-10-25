import type { PlanContents } from "../domain/plan";

/** Only data used to validate and compare a previous-year workbook crosses the worker boundary. */
export type PreviousWorkbookContents = Pick<PlanContents, "fiscalYear" | "accounts" | "industries" | "departments" | "previousAmounts">;
export function previousWorkbookContents(contents: PreviousWorkbookContents): PreviousWorkbookContents {
  const { fiscalYear, accounts, industries, departments, previousAmounts } = contents;
  return { fiscalYear, accounts, industries, departments, previousAmounts };
}
