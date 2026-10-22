import type { DetailPart, DetailValueRef } from "../tables/detailParts";
import { detailTableMonths } from "../tables/detailTable";

type Fraction = { n: bigint; d: bigint };
type DetailNumber = Fraction | { error: string };
export type DetailValue = { values: DetailNumber[]; unit: string };
export type DetailResult = { value: DetailValue; error?: never } | { value?: never; error: string };
const fail = (message: string): never => { throw new Error(message); };
function fraction(n: bigint, d = 1n): Fraction {
  if (!d) return fail("0で割ることはできません。");
  if (d < 0) { n = -n; d = -d; }
  let a = n < 0 ? -n : n, b = d;
  while (b) { const r = a % b; a = b; b = r; }
  n /= a || 1n; d /= a || 1n;
  if (n.toString().length > 100 || d.toString().length > 100) return fail("計算の桁数が上限を超えています。");
  return { n, d };
}
function number(text: string): Fraction {
  const s = text.trim();
  if (!s) return fail("数値が未入力です。");
  if (!/^-?\d{1,16}(\.\d{1,6})?$/.test(s)) return fail("数値は整数16桁・小数6桁以内で入力してください。");
  return fraction(BigInt(s.replace(".", "")), 10n ** BigInt(s.split(".")[1]?.length ?? 0));
}
function combine(a: Fraction, b: Fraction, operation: "add" | "subtract" | "multiply" | "divide") {
  if (operation === "multiply") return fraction(a.n * b.n, a.d * b.d);
  if (operation === "divide") return fraction(a.n * b.d, a.d * b.n);
  return fraction(a.n * b.d + (operation === "add" ? b.n : -b.n) * a.d, a.d * b.d);
}
function combineMonthly(a: DetailNumber, b: DetailNumber, operation: "add" | "subtract" | "multiply" | "divide"): DetailNumber {
  if ("error" in a) return a;
  if ("error" in b) return b;
  try { return combine(a, b, operation); }
  catch (error) { return { error: error instanceof Error ? error.message : "計算できませんでした。" }; }
}

/** No executable expressions. Decimal input and every intermediate result stay exact. */
export function detailEvaluator(parts: readonly DetailPart[]) {
  const byId = new Map(parts.map(part => [part.id, part]));
  const cache = new Map<string, DetailResult>(), active = new Set<string>();
  function evaluate(ref: DetailValueRef | null): DetailResult {
    if (!ref) return { error: "参照する値を選択してください。" };
    const key = JSON.stringify([ref.partId, ref.itemId]);
    const cached = cache.get(key); if (cached) return cached;
    if (active.has(key)) return { error: "計算の参照が循環しています。" };
    if (active.size >= 100) return { error: "計算の参照が100段を超えています。" };
    active.add(key);
    let result: DetailResult;
    try {
      const part = byId.get(ref.partId);
      if (!part) return { error: "参照していたパーツがありません。" };
      let value: DetailValue;
      if (part.kind === "assumption" && !ref.itemId) value = { values: [number(part.value)], unit: part.unit };
      else if (part.kind === "table-horizontal" || part.kind === "table-vertical") {
        const i = part.rowIds.indexOf(ref.itemId ?? "");
        if (i < 0) return { error: "参照していた月別表の項目がありません。" };
        value = { values: part.cells[i]!.slice(1).map((text, month): DetailNumber => {
          try { return number(text); }
          catch (error) { return { error: `${detailTableMonths[month]!.label}：${error instanceof Error ? error.message : "計算できませんでした。"}` }; }
        }), unit: part.unit };
      } else if (part.kind === "breakdown") {
        const items = ref.itemId ? part.items.filter(item => item.id === ref.itemId) : part.items;
        if (!items.length) return { error: "内訳の項目がありません。" };
        value = { values: [items.reduce((sum, item) => combine(sum, combine(number(item.quantity), number(item.price), "multiply"), "add"), fraction(0n))], unit: "円" };
      } else if (part.kind === "calculation" && !ref.itemId) {
        const operands = part.operands.map(operand => {
          const r = evaluate(operand); if (r.error !== undefined) return fail(r.error); return r.value;
        });
        if (!operands.length || (part.operation !== "sum" && operands.length < 2)) return { error: "計算する値を選択してください。" };
        if (part.operation === "sum") value = { values: [operands.flatMap(v => v.values).reduce((a, b) => combineMonthly(a, b, "add"), fraction(0n))], unit: part.unit };
        else {
          const length = Math.max(...operands.map(v => v.values.length));
          value = { values: Array.from({ length }, (_, i) => operands.map(v => v.values[v.values.length === 1 ? 0 : i]!).reduce((a, b) => combineMonthly(a, b, part.operation as "add" | "subtract" | "multiply" | "divide"))), unit: part.unit };
        }
      } else return { error: "このパーツは数値として参照できません。" };
      const single = value.values.length === 1 ? value.values[0] : undefined;
      result = single && "error" in single ? { error: single.error } : { value };
    } catch (error) { result = { error: error instanceof Error ? error.message : "計算できませんでした。" }; }
    finally { active.delete(key); }
    cache.set(key, result); return result;
  }
  return evaluate;
}

export function detailValueChoices(parts: readonly DetailPart[]) {
  return parts.flatMap((part, index): { ref: DetailValueRef; label: string }[] => {
    const prefix = `パーツ ${index + 1}`;
    if (part.kind === "assumption" || part.kind === "calculation") return [{ ref: { partId: part.id }, label: `${prefix}：${part.label || (part.kind === "assumption" ? "入力値" : "計算")}` }];
    if (part.kind === "table-horizontal" || part.kind === "table-vertical") return part.cells.map((row, i) => ({ ref: { partId: part.id, itemId: part.rowIds[i]! }, label: `${prefix}：${row[0] || `項目 ${i + 1}`}（月別）` }));
    if (part.kind === "breakdown") return [{ ref: { partId: part.id }, label: `${prefix}：${part.label || "内訳"} 合計` }, ...part.items.map((item, i) => ({ ref: { partId: part.id, itemId: item.id }, label: `${prefix}：${item.label || `項目 ${i + 1}`}` }))];
    return [];
  });
}
export function formatDetailValue(value: DetailNumber): string {
  if ("error" in value) return value.error;
  const sign = value.n < 0n ? "-" : "", n = value.n < 0n ? -value.n : value.n;
  const tail = ((n % value.d) * 1000000n / value.d).toString().padStart(6, "0").replace(/0+$/, "");
  return `${sign}${n / value.d}${tail ? `.${tail}` : ""}${n * 1000000n % value.d ? "…" : ""}`;
}
export function detailYen(value: DetailValue, month: number, unit: "yen" | "thousand-yen"): number {
  const index = value.values.length === 1 ? 0 : detailTableMonths.findIndex(m => Number(m.id) === month);
  const amount = value.values[index];
  if (!amount) return fail("対象月の値がありません。");
  if ("error" in amount) return fail(amount.error);
  const n = amount.n * (unit === "yen" ? 1n : 1000n);
  if (n % amount.d) return fail("円未満の端数があります。入力値または計算を調整してください。");
  const yen = Number(n / amount.d);
  if (!Number.isSafeInteger(yen)) return fail("施策に反映できる金額の範囲を超えています。");
  return yen;
}
