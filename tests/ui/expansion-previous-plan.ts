import { createTriadicDatabase, validateTriadicDatabase } from '../../Triadic-extension/src/core/storage/triadicDatabase';
import { readPlanContents } from '../../Triadic-extension/src/core/storage/readPlan';
import { savePreviousAmounts, changePlanSettings } from '../../Triadic-extension/src/core/storage/settings';
import { registerInitiative } from '../../Triadic-extension/src/core/storage/initiatives';
import { createInitiativeDraft } from '../../Triadic-extension/src/core/domain/initiativeRules';
export async function createExpansionPreviousPlan(split = false) {
  let bytes = await createTriadicDatabase(2026);
  const plan = await readPlanContents(bytes), accountId = plan.accounts.find(row => row.accountType === 'sales')!.id;
  const pair = { departmentId: plan.departments[0]!.id, industryId: plan.departments[0]!.industryIds[0]! };
  for (const previousKind of [1, 2] as const) bytes = await savePreviousAmounts(bytes, { ...pair, previousKind, rows: [{ accountId, amounts: { 4: previousKind === 1 ? '5000000000000' : '-5000000000000' } }] });
  for (let index = 0; index < (split ? 2 : 1); index++) bytes = await registerInitiative(bytes, { ...createInitiativeDraft('2026'), ...pair, name: `前年差の境界${index + 1}`, expansionId: plan.expansions[0]!.id,
    rows: [{ accountId, amounts: { 4: split ? '-1000000000000' : '-2000000000000' }, overrides: { 2: { 4: split ? '1000000000000' : '2000000000000' } } }] });
  bytes = await changePlanSettings(bytes, { type: 'comparison', screen: 'expansion-table', selected: [1, 2], previous: { 1: 1, 2: 2, display: 1 } });
  await validateTriadicDatabase(bytes); return bytes;
}
