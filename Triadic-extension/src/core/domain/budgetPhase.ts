import type { PlanContents, Initiative, InitiativeEntryDraft } from "./plan";
import { resolvedAmount, type BudgetPrevious, type KindId } from "./kinds";
import { initiativeMonths } from "./calendar";

/** A view of shared data; never rewrites amounts or master definitions. */
export const phasePrevious = (phase: KindId): BudgetPrevious => ({ 1: 1, 2: 2, display: phase });
export const phaseKinds = (phase: KindId): KindId[] => phase === 1 ? [1] : [1, 2];
export const visibleInPhase = (initiative: Initiative, phase: KindId) => phase === 2 || initiative.createdKind !== 2;
export function contentsForPhase(contents: PlanContents, phase: KindId): PlanContents {
  return { ...contents, previousKind: phase, budgetPrevious: phasePrevious(phase),
    kindSelections: { "initiative-list": [phase], "cost-table": phaseKinds(phase), "expansion-table": phaseKinds(phase) },
    previousSelections: { "cost-table": phasePrevious(phase), "expansion-table": phasePrevious(phase) },
    initiatives: contents.initiatives.filter(initiative => visibleInPhase(initiative, phase)) };
}

/** Registration in final keeps a zero primary and explicit final values, including copied drafts. */
export function draftForPhase(draft: InitiativeEntryDraft, phase: KindId): InitiativeEntryDraft {
  return { ...draft, createdKind: phase, rows: phase === 1 ? draft.rows : draft.rows.map(row => ({ ...row,
    amounts: {}, overrides: { 2: Object.fromEntries(initiativeMonths.map(month => [month, resolvedAmount(row, 2, month)])) } })) };
}
