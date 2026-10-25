import type { Initiative, PlanContents } from "./plan";

type SearchableInitiative = Pick<Initiative, "name" | "note"> & Partial<Pick<Initiative, "expansionId" | "expansionCategoryId" | "departmentId" | "industryId" | "periodTypeId">>;
export type InitiativeSearchMasters = Pick<PlanContents, "expansions" | "expansionCategories" | "departments" | "industries" | "periodTypes">;
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ja");

/** Resolve only the initiative's selected classifications; keep registration order. */
export function createInitiativeSearch<T extends SearchableInitiative>(initiatives: readonly T[], masters: InitiativeSearchMasters) {
  const definitions = [
    { field: "expansionId", label: "展開", names: new Map(masters.expansions.map(item => [item.id, item.expansionName])) },
    { field: "expansionCategoryId", label: "展開区分", names: new Map(masters.expansionCategories.map(item => [item.id, item.categoryName])) },
    { field: "departmentId", label: "部署", names: new Map(masters.departments.map(item => [item.id, item.departmentName])) },
    { field: "industryId", label: "業種", names: new Map(masters.industries.map(item => [item.id, item.industryName])) },
    { field: "periodTypeId", label: "期間", names: new Map(masters.periodTypes.map(item => [item.id, item.periodName])) },
  ] as const;
  const indexed = initiatives.map(initiative => {
    const classifications = definitions.flatMap(({ field, label, names }) => {
      const id = initiative[field], name = id == null ? undefined : names.get(id);
      return name === undefined ? [] : [{ label, name, text: normalize(name) }];
    });
    return { initiative, classifications, text: normalize([initiative.name, initiative.note, ...classifications.map(item => item.name)].join("\n")) };
  });
  return (query: string) => {
    const words = normalize(query).trim().split(/\s+/u).filter(Boolean);
    return indexed.filter(({ text }) => words.every(word => text.includes(word))).map(({ initiative, classifications }) => ({
      initiative,
      matchedClassifications: classifications.filter(item => words.some(word => item.text.includes(word))).map(({ label, name }) => ({ label, name })),
    }));
  };
}
