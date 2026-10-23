export type Department = { id: number; identity?: string; departmentName: string; industryIds: number[] };
export type DepartmentChange =
  | { type: "add"; departmentName: string; industryIds: number[] }
  | { type: "update"; id: number; departmentName: string; industryIds?: number[] }
  | { type: "delete"; id: number; deletionKey?: string };

export function validateDepartmentChange(items: Department[], change: DepartmentChange): void {
  if (change.type !== "add" && !items.some(item => item.id === change.id)) throw new Error("部署が見つかりません。");
  if (change.type === "delete") {
    if (change.deletionKey !== undefined && items.find(item => item.id === change.id)?.identity !== change.deletionKey) throw new Error("削除対象の部署が変更されています。対象を選び直してください。");
    return;
  }
  const name = change.departmentName.trim();
  if (!name) throw new Error("部署名を入力してください。");
  const others = items.filter(item => change.type === "add" || item.id !== change.id);
  if (others.some(item => item.departmentName === name)) throw new Error("同じ部署名が登録されています。");
}
