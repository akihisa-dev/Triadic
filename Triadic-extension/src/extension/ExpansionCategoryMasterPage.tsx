import type { Expansion } from "../core/domain/expansionMaster";
import type { ExpansionCategory, ExpansionCategoryChange } from "../core/domain/expansionCategoryMaster";
import type { AutoSaveProps } from "./useAutoSave";
import { NamedMasterPage } from "./NamedMasterPage";
type Props = AutoSaveProps & { expansions: Expansion[]; expansionCategories: ExpansionCategory[]; usedIds: Set<number>; isSaving: boolean; onChange: (change: ExpansionCategoryChange) => Promise<void>; onBack: () => void };
export function ExpansionCategoryMasterPage({ expansions, expansionCategories, onChange, ...props }: Props) {
  return <NamedMasterPage {...props} subject="展開区分" slug="expansion-category" relationLabel="展開名" relationMode="single" relationOptions={expansions.map(item => ({ id: item.id, name: item.expansionName }))}
    rows={expansionCategories.map(item => ({ id: item.id, name: item.categoryName, code: "", relationId: item.expansionId }))}
    onChange={change => change.type === "delete" ? onChange(change) : onChange({
      type: change.type, ...(change.type === "update" ? { id: change.id } : {}), categoryName: change.name, expansionId: change.relationId,
    } as ExpansionCategoryChange)} />;
}
