import { createTriadicDatabase, validateTriadicDatabase } from '../../Triadic-extension/src/core/storage/triadicDatabase';
import { readPlanContents } from '../../Triadic-extension/src/core/storage/readPlan';
import { registerInitiative } from '../../Triadic-extension/src/core/storage/initiatives';
import { changePlanSettings, savePreviousAmounts } from '../../Triadic-extension/src/core/storage/settings';
import { createInitiativeDraft } from '../../Triadic-extension/src/core/domain/initiativeRules';
import { initiativeMonths } from '../../Triadic-extension/src/core/domain/calendar';

/** Accepted SQLite data with unchanged default masters; no real file is written. */
export async function createCostDisplayOverflowPlan(scenario: 'annual' | 'baseline') {
  let bytes = await createTriadicDatabase(2026);
  const initial = await readPlanContents(bytes), accountId = initial.accounts.find(row => row.accountType === 'sales')!.id;
  for (const department of initial.departments.slice(0, scenario === 'annual' ? 1 : 2)) {
    const pair = { departmentId: department.id, industryId: department.industryIds[0]! };
    const amounts = (amount: string) => Object.fromEntries((scenario === 'annual' ? initiativeMonths : [4]).map(month => [month, amount]));
    bytes = await savePreviousAmounts(bytes, { ...pair, previousKind: 1, rows: [{ accountId, amounts: amounts(scenario === 'annual' ? '-500000000000' : '5000000000000') }] });
    if (scenario === 'annual') bytes = await savePreviousAmounts(bytes, { ...pair, previousKind: 2, rows: [{ accountId, amounts: amounts('500000000000') }] });
    bytes = await registerInitiative(bytes, { ...createInitiativeDraft('2026'), ...pair, expansionId: initial.expansions[0]!.id, name: `非表示の超過${department.id}`,
      rows: [{ accountId, amounts: amounts(scenario === 'annual' ? '1000000000000' : '-5000000000000') }] });
  }
  bytes = await changePlanSettings(bytes, { type: 'comparison', screen: 'cost-table', selected: [1, 2], previous: { 1: 1, 2: 1, display: 2 } });
  await validateTriadicDatabase(bytes);
  return bytes;
}
