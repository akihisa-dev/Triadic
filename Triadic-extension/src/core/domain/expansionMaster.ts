export type Expansion = { id: number; expansionCode: string; expansionName: string; categoryIds?: number[] };
export type ExpansionChange =
  | { type: "add"; expansionCode: string; expansionName: string; categoryIds?: number[] }
  | { type: "update"; id: number; expansionCode: string; expansionName: string; categoryIds?: number[] }
  | { type: "delete"; id: number; deletionKey?: string };

export const expansionDeletionKey = (item: Expansion) => JSON.stringify([
  item.id, item.expansionCode, item.expansionName, [...(item.categoryIds ?? [])].sort((a, b) => a - b),
]);

export function validateExpansionChange(items: Expansion[], change: ExpansionChange): void {
  if (change.type !== "add" && !items.some(item => item.id === change.id)) throw new Error("展開が見つかりません。");
  if (change.type === "delete") {
    if (change.deletionKey !== undefined && change.deletionKey !== expansionDeletionKey(items.find(item => item.id === change.id)!)) {
      throw new Error("削除対象の展開が変更されています。対象を選び直してください。");
    }
    return;
  }
  const code = change.expansionCode.trim();
  const name = change.expansionName.trim();
  if (!/^[0-9]+$/.test(code)) throw new Error("展開コードは半角数字で入力してください。");
  if (!name) throw new Error("展開名を入力してください。");
  const others = items.filter(item => change.type === "add" || item.id !== change.id);
  if (others.some(item => item.expansionCode === code)) throw new Error("同じ展開コードが登録されています。");
  if (others.some(item => item.expansionName === name)) throw new Error("同じ展開名が登録されています。");
}
