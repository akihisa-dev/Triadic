import type { Account } from "../domain/accountMaster";
import type { KindId } from "../domain/kinds";
import type { Initiative } from "../domain/plan";
import { initiativesForKind } from "./initiatives";
import { initiativeTotals, type CalculatedInitiative } from "./initiativeTotals";

export type InitiativeListRow = (CalculatedInitiative & { calculation: "ready" })
  | (Initiative & { calculation: "failed"; error: string });
export type InitiativeListView = {
  source: InitiativeListRow[];
  errors: ReadonlyMap<number, string>;
  totals: CalculatedInitiative["months"] | null;
  totalError: string | null;
};

/** One cache per immutable set of calculation inputs, at most the two budget kinds.
 * Recreate it after edits, history restoration or changes to account attributes/year.
 */
export function createInitiativeListView(initiatives: Initiative[], accounts: Account[], fiscalYear: string) {
  const current = initiatives.filter(item => (item.fiscalYear === null ? "" : String(item.fiscalYear)) === fiscalYear);
  const views = new Map<KindId, InitiativeListView>();
  return (kind: KindId): InitiativeListView => {
    const cached = views.get(kind);
    if (cached) return cached;
    const errors = new Map<number, string>();
    let source: InitiativeListRow[];
    try { source = initiativesForKind(current, accounts, kind).map(item => ({ ...item, calculation: "ready" })); }
    catch {
      // Preserve normal rows and the edit link for each failed initiative.
      source = current.map(item => {
        try { return { ...initiativesForKind([item], accounts, kind)[0]!, calculation: "ready" }; }
        catch (failure) {
          const error = failure instanceof Error ? failure.message : "金額を表示できませんでした。";
          errors.set(item.id, error);
          return { ...item, calculation: "failed", error };
        }
      });
    }
    let totals: CalculatedInitiative["months"] | null = null;
    let totalError: string | null = null;
    if (!errors.size) {
      try { totals = initiativeTotals(source.filter(item => item.calculation === "ready")); }
      catch (failure) { totalError = failure instanceof Error ? failure.message : "合計を表示できませんでした。"; }
    }
    const view = { source, errors, totals, totalError };
    views.set(kind, view);
    return view;
  };
}
