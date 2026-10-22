import { detailBindings } from "./detailBindings";
import { listDetailDocuments } from "./detailDocuments";
import { detailValueChoices } from "../domain/detailValues";
import type { DetailPart } from "../tables/detailParts";
import type { HistoryDifference, HistoryComparison } from "../domain/historyDifference";
import { compareHistoryIncome } from "../tables/historyIncomeImpact";
import { readContents } from "./readPlan";
import { yenToAmount } from "../domain/amounts";
import { initiativeMonths } from "../domain/calendar";
import { BUSINESS_TABLES } from "./triadicSchema";
import { openTriadicDatabase, openBusinessSnapshot } from "./triadicDatabase";
import type { Database } from "./sqliteRuntime";

type Scalar = string | number | null;
type Row = Record<string, Scalar>;
type Value = { raw: string; text: string };
type Item = { section: string; subject: string; fields: Record<string, Value> };
const labels: Record<string, string> = {
  fiscal_year: "基準年度", name: "名称", note: "備考", code: "コード", attribute: "科目属性", display_name: "表示名",
  expansion_id: "展開", expansion_category_id: "展開区分", department_id: "部署", industry_id: "業種", period_type_id: "期間",
  previous_kind: "基準前年", account_id: "勘定科目", parent_id: "所属先の集計", sign: "集計の加減", position: "表示順", sort_order: "表示順",

  required_key: "必須集計", start_month_rule: "開始年月の規則", first_kind: "比較対象1", second_kind: "比較対象2",
};
const sections: Record<string, string> = { document_info: "基本情報", accounts: "勘定科目マスタ", expansions: "展開マスタ",
  expansion_categories: "展開区分マスタ", industries: "業種マスタ", departments: "部署マスタ", period_types: "期間マスタ",
  aggregation_groups: "集計マスタ", detail_documents: "明細", initiatives: "施策", initiative_rows: "施策の科目行", kind_selections: "表示設定" };
const references: Record<string, string> = { expansion_id: "expansions", expansion_category_id: "expansion_categories", department_id: "departments",
  industry_id: "industries", period_type_id: "period_types", account_id: "accounts", parent_id: "aggregation_groups" };
const words: Record<string, string> = { sales: "売上", cost: "売上原価", expense: "費用", profit: "利益", expenses: "費用集計",
  operating: "営業利益", ordinary: "経常利益", new: "新規", period_gap: "期間差", "initiative-list": "施策一覧", "cost-table": "総原価表", "expansion-table": "展開表" };

/** Normalize business values only: timestamps, allocation counters and revisions are not user edits. */
function* amountRows(db: Database, table: "previous_amounts" | "initiative_amounts"): Generator<Row> {
  let cursor: number | undefined;
  for (;;) {
    const batch = db.exec(`SELECT rowid AS history_cursor, * FROM ${table}${cursor === undefined ? "" : " WHERE rowid > ?"} ORDER BY rowid LIMIT 1000`, cursor === undefined ? undefined : [cursor])[0];
    if (!batch) return;
    for (const values of batch.values) {
      cursor = Number(values[0]);
      yield Object.fromEntries(batch.columns.slice(1).map((name, i) => [name, values[i + 1] as Scalar]));
    }
  }
}
function* items(db: Database): Generator<[string, Item]> {
  const tables = new Map<string, Row[]>();
  for (const table of BUSINESS_TABLES) {
    if (["triadic_metadata", "previous_amounts", "initiative_amounts"].includes(table)) continue;
    const result = db.exec(`SELECT * FROM ${table}`)[0];
    tables.set(table, result?.values.map(values => Object.fromEntries(result.columns.map((name, i) => [name, values[i] as Scalar]))) ?? []);
  }
  const indexes = new Map([...tables].map(([table, rows]) => [table, new Map(rows.map(row => [row.id, row]))]));
  const rowFor = (table: string, id: Scalar) => indexes.get(table)?.get(id);
  const identity = (table: string, id: Scalar) => String(rowFor(table, id)?.identity ?? id);
  const name = (table: string, id: Scalar) => String(rowFor(table, id)?.name ?? "未選択");
  const value = (raw: unknown, text: string): Value => ({ raw: JSON.stringify(raw), text });
  const put = (key: unknown[], section: string, subject: string, fields: Record<string, Value>): [string, Item] => [JSON.stringify(key), { section, subject, fields }];
  const fieldValue = (field: string, raw: Scalar): Value => {
    if (raw === null) return value(null, "未設定");
    const table = references[field];
    if (table) return value(identity(table, raw), name(table, raw));
    if (field === "previous_kind") return value(raw, raw === 1 ? "前年見込" : "前年実績");
    if (field === "first_kind" || field === "second_kind") return value(raw, raw === 1 ? "一次予算" : "確定予算");
    if (field === "position" || field === "sort_order") return value(raw, String(Number(raw) + 1));
    if (field === "sign") return value(raw, raw === 1 ? "＋" : "−");
    return value(raw, ["attribute", "required_key", "start_month_rule"].includes(field) ? words[String(raw)] ?? String(raw) : String(raw));
  };
  for (const [table, section] of Object.entries(sections)) for (const row of tables.get(table)!) {
    const fields: Record<string, Value> = {};
    for (const [field, raw] of Object.entries(row)) {
      if (["id", "identity", "revision", "created_at", "updated_at", "initiative_id", "screen", "parts_json"].includes(field)) continue;
      fields[labels[field] ?? field] = fieldValue(field, raw);
    }
    const owner = table === "initiative_rows" ? rowFor("initiatives", row.initiative_id!) : undefined;
    const subject = table === "initiative_rows" ? `${owner?.name} / ${name("accounts", row.account_id!)} / ${Number(row.sort_order) + 1}行目`
      : table === "kind_selections" ? words[String(row.screen)]! : table === "document_info" ? "計画" : String(row.name);
    yield put([table, owner?.identity ?? "", row.identity ?? row.id ?? row.screen], section, subject, fields);
  }
  const initiativeNames = new Map(tables.get("initiatives")!.map(row => [row.identity, String(row.name)]));
  for (const row of tables.get("detail_documents")!) {
    const parts = JSON.parse(String(row.parts_json)) as DetailPart[];
    const choices = detailValueChoices(parts);
    const referenceName = (ref: unknown) => choices.find(c => JSON.stringify(c.ref) === JSON.stringify(ref))?.label ?? "未選択・参照先なし";
    for (const part of parts) {
      const fields: Record<string, Value> = {
        位置とサイズ: value([part.x, part.y, part.width, part.height], `${part.x}, ${part.y} / ${part.width}×${part.height}`),
      };
      if (part.kind === "text") fields.文章 = value(part.text, part.text);
      else if (part.kind === "heading") fields.見出し = value(part.text, part.text);
      else if (part.kind === "assumption") {
        fields.項目名 = value(part.label, part.label);
        fields.値 = value(part.value, part.value);
        fields.単位 = value(part.unit, part.unit);
      } else if (part.kind === "initiative-reference") {
        if (part.binding) {
          const b = part.binding, target = tables.get("initiative_rows")!.find(r => r.id === b.rowId);
          fields.反映設定 = value(b, `${referenceName(b.source)} → ${target ? name("accounts", target.account_id!) : "科目行未選択"} / ${b.kindId === 1 ? "一次予算" : "確定予算"} / ${b.months.map(m => `${m}月`).join("・") || "月未選択"} / ${b.unit === "yen" ? "円" : "千円"}`);
        }
        fields.参照施策 = value(part.initiativeIdentity, part.initiativeIdentity === null ? "未選択" : initiativeNames.get(part.initiativeIdentity) ?? "参照先がありません");
      }
      else if (part.kind === "image") fields.画像 = value([part.name, part.src], part.name || "未選択");
      else if (part.kind === "calculation") fields.計算 = value([part.label, part.operation, part.operands, part.unit], `${part.label} / ${{ add: "加算", subtract: "減算", multiply: "乗算", divide: "除算", sum: "合計" }[part.operation]} / ${part.operands.map(referenceName).join("、")} / ${part.unit}`);
      else if (part.kind === "breakdown") fields.内訳 = value([part.label, part.items], `${part.label} / ${part.items.map(i => `${i.label}: ${i.quantity} × ${i.price}`).join(" / ")}`);
      else fields.表の内容 = value([part.rowIds, part.unit, part.cells], part.cells.map(cells => cells.join(" / ")).join("\n"));
      yield put(["detail_parts", row.id, part.id], "明細パーツ", String(row.name), fields);
    }
  }
  for (const row of tables.get("department_industries")!) yield put(["department_industries", identity("departments", row.department_id!), identity("industries", row.industry_id!)],
    "部署の所属業種", name("departments", row.department_id!), { 所属業種: value(identity("industries", row.industry_id!), name("industries", row.industry_id!)) });
  for (const row of tables.get("expansion_category_assignments")!) yield put(["expansion_category_assignments", row.expansion_id, row.category_id],
    "展開の区分割当", name("expansions", row.expansion_id!), { 展開区分: value(row.category_id, name("expansion_categories", row.category_id!)) });
  for (const row of tables.get("aggregation_members")!) {
    const table = row.account_id === null ? "aggregation_groups" : "accounts", id = row.account_id ?? row.group_id!;
    yield put(["aggregation_members", table, id], "集計の所属", name(table, id), {
      所属先の集計: fieldValue("parent_id", row.parent_id!), 集計の加減: fieldValue("sign", row.sign!), 表示順: fieldValue("position", row.position!),
    });
  }
  for (const row of tables.get("master_order")!) {
    const table = row.account_id === null ? "aggregation_groups" : "accounts", id = row.account_id ?? row.aggregation_group_id!;
    yield put(["master_order", table, id], "科目・集計の表示順", name(table, id), { 表示順: fieldValue("position", row.position!) });
  }
  for (const row of amountRows(db, "previous_amounts")) {
    if (row.amount_yen === 0) continue; // An absent previous-year cell is also zero.
    yield put(["previous_amounts", row.previous_kind, row.account_id, identity("departments", row.department_id!), identity("industries", row.industry_id!), row.month],
      row.previous_kind === 1 ? "前年見込" : "前年実績", `${name("departments", row.department_id!)} / ${name("industries", row.industry_id!)} / ${name("accounts", row.account_id!)}`,
      { [`${row.month}月`]: value(row.amount_yen, yenToAmount(Number(row.amount_yen))) });
  }
  const detailSources = new Map(detailBindings(db, listDetailDocuments(db)).map(b => [JSON.stringify([b.rowId, b.kindId, b.month]), b.source]));
  const amounts = new Map<string, Scalar>();
  for (const row of amountRows(db, "initiative_amounts")) amounts.set(JSON.stringify([row.row_id, row.kind_id, row.month]), row.amount_yen!);
  for (const row of tables.get("initiative_rows")!) {
    const owner = rowFor("initiatives", row.initiative_id!)!;
    const subject = `${owner.name} / ${name("accounts", row.account_id!)} / ${Number(row.sort_order) + 1}行目`;
    for (const month of initiativeMonths) for (const kind of [1, 2]) {
      const manual = amounts.get(JSON.stringify([row.id, kind, month]));
      const inherited = kind === 2 && manual === undefined;
      const amount = manual ?? amounts.get(JSON.stringify([row.id, 1, month])) ?? 0;
      const source = detailSources.get(JSON.stringify([row.id, kind, month]));
      const mode = source ? `${source.error ? "明細の反映待ち" : "明細から反映"}：${source.documentName}` : kind === 1 ? "" : inherited ? "引き継ぎ" : "手修正";
      yield put(["initiative_amounts", owner.identity, row.id, kind, month], "施策の月別金額", subject,
        { [`${kind === 1 ? "一次予算" : "確定予算"}・${month}月`]: value([amount, mode], `${yenToAmount(Number(amount))}${mode ? `（${mode}）` : ""}`) });
    }
  }
}

export async function compareSavedHistory(bytes: Uint8Array, id: number): Promise<HistoryComparison> {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("履歴の識別子が正しくありません。");
  const current = await openTriadicDatabase(bytes);
  try {
    const snapshot = current.exec("SELECT snapshot FROM data_history WHERE id = ?", [id])[0]?.values[0]?.[0];
    if (!(snapshot instanceof Uint8Array)) throw new Error("比較する履歴が見つかりません。");
    const past = await openBusinessSnapshot(snapshot);
    try {
      const fiscalYear = (db: Database) => db.exec("SELECT fiscal_year FROM document_info WHERE id = 1")[0]?.values[0]?.[0];
      if (fiscalYear(past) !== fiscalYear(current)) throw new Error("履歴の基準年度が一致しません。");
      const after = new Map(items(current)), differences: HistoryDifference[] = [];
      const compare = (old: Item | undefined, next: Item | undefined) => {
        const item = next ?? old!;
        const change = !old ? "追加" : !next ? "削除" : "変更";
        if (!old || !next) {
          if ((item.section === "前年見込" || item.section === "前年実績")) {
            const [field, amount] = Object.entries(item.fields)[0]!;
            differences.push({ section: item.section, subject: item.subject, change: "変更", field,
              before: old ? amount.text : "0", after: next ? amount.text : "0" });
            return;
          }
          const text = Object.entries(item.fields).map(([field, value]) => `${field}：${value.text}`).join("、");
          differences.push({ section: item.section, subject: item.subject, change, field: "項目全体", before: old ? text : "—", after: next ? text : "—" });
          return;
        }
        for (const field of new Set([...Object.keys(old.fields), ...Object.keys(next.fields)])) {
          const left = old.fields[field], right = next.fields[field];
          if (left?.raw === right?.raw) continue;
          differences.push({ section: item.section, subject: old.subject === next.subject ? next.subject : `${old.subject} → ${next.subject}`,
            change, field, before: left?.text ?? "—", after: (right?.text ?? "—") + (left?.text === right?.text ? "（別の項目）" : "") });
        }
      }
      for (const [key, old] of items(past)) {
        const next = after.get(key);
        after.delete(key);
        compare(old, next);
      }
      for (const next of after.values()) compare(undefined, next);
      after.clear();
      return { differences, impact: compareHistoryIncome(readContents(past), readContents(current)) };
    } finally { past.close(); }
  } finally { current.close(); }
}
