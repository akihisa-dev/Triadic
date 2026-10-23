import type { Account } from '../../../Triadichrome-extension/src/core/domain/accountMaster';
import type { Initiative } from '../../../Triadichrome-extension/src/core/domain/plan';
import { initiativesForKind } from '../../../Triadichrome-extension/src/core/tables/initiatives';
import { initiativeTotals } from '../../../Triadichrome-extension/src/core/tables/initiativeTotals';
import type { InitiativeListRow } from '../../../Triadichrome-extension/src/core/tables/initiativeListView';
export function checkCalculationBoundary(saved: Initiative[], accounts: Account[], rows: InitiativeListRow[]) {
  // @ts-expect-error Saved inputs do not contain calculated monetary values.
  initiativeTotals(saved);
  // @ts-expect-error Sales alone do not satisfy a sum of all metrics.
  initiativeTotals(initiativesForKind(saved, accounts, 1, ['sales']));
  // @ts-expect-error Failed calculations must be excluded explicitly.
  initiativeTotals(rows);
  initiativeTotals(initiativesForKind(saved, accounts, 1));
  initiativeTotals(rows.filter(row => row.calculation === 'ready'));
}
