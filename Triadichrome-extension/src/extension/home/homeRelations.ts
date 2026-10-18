export const nodes = [
  { page: "aggregation-master", name: "集計マスタ", icon: "master", x: 900, y: -210, master: true },
  { page: "amount-item-master", name: "金額項目マスタ", icon: "master", x: 320, y: 0, master: true },
  { page: "account-type-master", name: "科目属性マスタ", icon: "master", x: 320, y: -126, master: true },
  { page: "account-master", name: "勘定科目マスタ", icon: "master", x: 640, y: -42, master: true },
  { page: "industry-master", name: "業種マスタ", icon: "master", x: 0, y: 42, master: true },
  { page: "department-master", name: "部署マスタ", icon: "master", x: 0, y: 210, master: true },
  { page: "period-master", name: "期間マスタ", icon: "master", x: 320, y: 504, master: true },
  { page: "expansion-category-master", name: "展開区分マスタ", icon: "master", x: 640, y: 546, master: true },
  { page: "expansion-master", name: "展開マスタ", icon: "master", x: 1020, y: 448, master: true },
  { page: "kind-master", name: "種別マスタ", icon: "master", x: 0, y: 378, master: true },
  { page: "previous-input", name: "前年入力", icon: "previous", x: 1200, y: -70, master: false },
  { page: "initiative-list", name: "施策一覧", icon: "list", x: 640, y: 252, master: false },
  { page: "cost-table", name: "総原価表", icon: "cost", x: 1020, y: 56, master: false },
  { page: "expansion-table", name: "展開表", icon: "expansion", x: 1120, y: 252, master: false },
] as const;

export type HomeDestination = typeof nodes[number]["page"];
export const relationKinds = [
  ["reference", "選択・参照"], ["structure", "構成・所属"],
  ["amount", "金額・計算"], ["view", "同じ内容の別表示"],
] as const;
type RelationKind = typeof relationKinds[number][0];
export const edges: { from: HomeDestination; to: HomeDestination; label: string; kind: RelationKind; at: { x: number; y: number } }[] = [
  { from: "account-type-master", to: "amount-item-master", label: "金額項目の構成", kind: "structure", at: { x: 320, y: -63 } },
  { from: "amount-item-master", to: "initiative-list", label: "売上・費用・利益を計算", kind: "amount", at: { x: 480, y: 126 } },
  { from: "account-type-master", to: "account-master", label: "科目属性を選択", kind: "reference", at: { x: 550, y: -105 } },
  { from: "previous-input", to: "cost-table", label: "前年の実額", kind: "amount", at: { x: 1200, y: 0 } },
  { from: "kind-master", to: "initiative-list", label: "種別ごとに入力", kind: "reference", at: { x: 300, y: 315 } },
  { from: "aggregation-master", to: "cost-table", label: "表示順・集計・加減", kind: "structure", at: { x: 1060, y: -140 } },
  { from: "account-master", to: "initiative-list", label: "科目を選択", kind: "reference", at: { x: 640, y: 105 } },
  { from: "industry-master", to: "department-master", label: "所属業種を設定", kind: "structure", at: { x: 0, y: 126 } },
  { from: "industry-master", to: "initiative-list", label: "部署の所属から業種を選択", kind: "reference", at: { x: 240, y: 126 } },
  { from: "department-master", to: "initiative-list", label: "部署名を選択", kind: "reference", at: { x: 300, y: 231 } },
  { from: "period-master", to: "initiative-list", label: "期間名を選択", kind: "reference", at: { x: 480, y: 392 } },
  { from: "expansion-category-master", to: "expansion-master", label: "展開区分を割り当て", kind: "structure", at: { x: 850, y: 532 } },
  { from: "expansion-category-master", to: "initiative-list", label: "展開の割当から区分を選択", kind: "reference", at: { x: 640, y: 434 } },
  { from: "expansion-master", to: "initiative-list", label: "展開名を選択", kind: "reference", at: { x: 850, y: 350 } },
  { from: "initiative-list", to: "cost-table", label: "同じ内容を科目別に確認", kind: "view", at: { x: 850, y: 154 } },
  { from: "initiative-list", to: "expansion-table", label: "同じ内容を展開別に確認", kind: "view", at: { x: 880, y: 252 } },
  { from: "expansion-master", to: "expansion-table", label: "グループ分け", kind: "structure", at: { x: 1100, y: 378 } },
];

// Relation descriptions are graph nodes, joined to both destinations.
export const subNodes = edges.map((edge, index) => {
  const from = nodes.find(node => node.page === edge.from)!, to = nodes.find(node => node.page === edge.to)!;
  return { page: `relation-${index}`, name: edge.label, x: edge.at?.x ?? (from.x + to.x) / 2,
    y: edge.at?.y ?? (from.y + to.y) / 2, width: Math.max(112, edge.label.length * 12 + 24), height: 32, sub: true };
});
export const graphNodes = [...nodes.map(node => ({ ...node, width: 200, height: 56 })), ...subNodes];
export const graphEdges = edges.flatMap((edge, index) => [{ from: edge.from, to: subNodes[index]!.page, double: edge.kind === "view" }, { from: subNodes[index]!.page, to: edge.to, double: edge.kind === "view" }]);
