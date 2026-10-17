type SearchableInitiative = { name: string; note: string };
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ja");

/** Index only saved names/notes; result order stays the plan's registration order. */
export function createInitiativeSearch<T extends SearchableInitiative>(initiatives: readonly T[]) {
  const indexed = initiatives.map(item => ({ item, text: normalize(`${item.name}\n${item.note}`) }));
  return (query: string): T[] => {
    const words = normalize(query).trim().split(/\s+/u).filter(Boolean);
    return indexed.filter(({ text }) => words.every(word => text.includes(word))).map(({ item }) => item);
  };
}
