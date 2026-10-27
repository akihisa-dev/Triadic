import { pageMetadata } from "../pageMetadata";
import { isTablePage, layoutHomeRelations, relationLabelWidth } from "./homeRelationLayout";

export const nodes = ([
  { page: "aggregation-master", x: 900, y: -210 },
  { page: "amount-item-master", x: 320, y: 0 },
  { page: "account-type-master", x: 320, y: -126 },
  { page: "account-master", x: 640, y: -42 },
  { page: "industry-master", x: 0, y: 42 },
  { page: "department-master", x: 0, y: 210 },
  { page: "period-master", x: 320, y: 504 },
  { page: "expansion-category-master", x: 640, y: 546 },
  { page: "expansion-master", x: 1020, y: 448 },
  { page: "kind-master", x: 0, y: 378 },
  { page: "previous-input", x: 1200, y: -70 },
  { page: "initiative-list", x: 640, y: 252 },
  { page: "cost-table", x: 1020, y: 56 },
  { page: "expansion-table", x: 1120, y: 252 },
] as const).map(node => ({ ...node, ...pageMetadata[node.page] }));

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

edges.push({ from: "cost-table", to: "expansion-table", label: "同じ内容を別の切り口で確認", kind: "view", at: { x: 0, y: 0 } });
const initial = layoutHomeRelations(nodes, edges, null);
export const subNodes = edges.map((edge, index) => ({ page: `relation-${index}`, name: edge.label,
  x: initial[`relation-${index}`]!.x - 100, y: initial[`relation-${index}`]!.y - 12,
  width: relationLabelWidth(edge), height: 28, sub: true }));
export const graphNodes = [
  ...nodes.map(node => ({ ...node, x: initial[node.page]!.x - 100, y: initial[node.page]!.y - 12, width: isTablePage(node.page) ? 128 : 180, height: isTablePage(node.page) ? 128 : 110 })),
  ...subNodes, { page: "brand", x: initial.brand!.x - 100, y: initial.brand!.y - 12, width: 170, height: 80, sub: true },
];
export const graphEdges = edges.map(edge => ({ from: edge.from, to: edge.to, double: edge.kind === "view" }));
