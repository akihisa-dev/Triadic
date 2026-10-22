import type { DetailPart, DetailValueRef } from "../core/tables/detailParts";
import { detailEvaluator, detailValueChoices, formatDetailValue, type DetailResult } from "../core/domain/detailValues";
import { detailTableMonths } from "../core/tables/detailTable";
import "./DetailNumericPart.css";

export function DetailValueSelect({ parts, value, onChange, label, disabled = false, excludePartId }: {
  parts: readonly DetailPart[]; value: DetailValueRef | null; onChange: (value: DetailValueRef | null) => void; label: string; disabled?: boolean; excludePartId?: string;
}) {
  const choices = detailValueChoices(parts).filter(choice => choice.ref.partId !== excludePartId), key = value ? JSON.stringify(value) : "";
  return <label>{label}<select aria-label={label} disabled={disabled} value={key} onChange={e => onChange(e.target.value ? JSON.parse(e.target.value) as DetailValueRef : null)}>
    <option value="">値を選択</option>
    {value && !choices.some(c => JSON.stringify(c.ref) === key) && <option value={key}>参照先がありません</option>}
    {choices.map(c => <option key={JSON.stringify(c.ref)} value={JSON.stringify(c.ref)}>{c.label}</option>)}
  </select></label>;
}
export function DetailResultView({ result }: { result: DetailResult }) {
  if (result.error !== undefined) return <p className="detail-value-error" role="status">{result.error}</p>;
  const { values, unit } = result.value;
  return values.length === 1 ? <output>{formatDetailValue(values[0]!)} {unit}</output>
    : <dl className="detail-month-results">{values.map((v, i) => <div key={i}><dt>{detailTableMonths[i]!.label}</dt><dd>{formatDetailValue(v)} {"error" in v ? "" : unit}</dd></div>)}</dl>;
}
const operations = { add: "足す（＋）", subtract: "引く（−）", multiply: "掛ける（×）", divide: "割る（÷）", sum: "合計する（月別値は12か月を合計）" } as const;
export function DetailNumericPart({ part, parts, disabled, editing, onEditingChange, onChange }: {
  part: Extract<DetailPart, { kind: "calculation" | "breakdown" }>; parts: readonly DetailPart[]; disabled: boolean; editing: boolean;
  onEditingChange: (value: boolean) => void; onChange: (part: DetailPart) => void;
}) {
  const evaluate = detailEvaluator(parts), choices = detailValueChoices(parts);
  return <div className="detail-numeric-part" tabIndex={disabled ? -1 : 0}
    onPointerDown={e => { if (editing || (e.target as HTMLElement).closest("button")) e.stopPropagation(); }}
    onDoubleClick={e => { e.stopPropagation(); if (!disabled) onEditingChange(true); }}
    onKeyDown={e => { if (editing) e.stopPropagation(); if (e.key === "Escape" && !e.nativeEvent.isComposing) onEditingChange(false); }}>
    <strong>{part.label || (part.kind === "calculation" ? "計算" : "内訳表")}</strong>
    {!disabled && <button type="button" onClick={() => onEditingChange(!editing)}>{editing ? "編集を終える" : "編集"}</button>}
    {editing && !disabled && <label>名前<input aria-label="数値パーツの名前" value={part.label} onChange={e => onChange({ ...part, label: e.target.value })} /></label>}
    {part.kind === "calculation" ? <>
      {editing && !disabled ? <>
        <label>計算方法<select aria-label="計算方法" value={part.operation} onChange={e => onChange({ ...part, operation: e.target.value as typeof part.operation })}>{Object.entries(operations).map(([op, label]) => <option key={op} value={op}>{label}</option>)}</select></label>
        {part.operands.map((ref, i) => <div key={i} className="detail-operand"><DetailValueSelect parts={parts} excludePartId={part.id} value={ref} label={`計算する値 ${i + 1}`} onChange={value => onChange({ ...part, operands: part.operands.map((v, n) => n === i ? value : v) })} />
          <button type="button" disabled={part.operands.length <= (part.operation === "sum" ? 1 : 2)} onClick={() => onChange({ ...part, operands: part.operands.filter((_, n) => n !== i) })}>削除</button></div>)}
        <button type="button" disabled={part.operands.length >= 100} onClick={() => onChange({ ...part, operands: [...part.operands, null] })}>値を追加</button>
        <label>結果の単位<input value={part.unit} onChange={e => onChange({ ...part, unit: e.target.value })} /></label>
      </> : <p>{part.operands.map(ref => choices.find(c => JSON.stringify(c.ref) === JSON.stringify(ref))?.label ?? "未選択").join(` ${operations[part.operation].split("（")[0]} `)}{part.operation === "sum" ? " の合計" : ""}</p>}
    </> : <>
      <table><thead><tr><th>項目</th><th>数量</th><th>単価（円）</th><th>金額（円）</th>{editing && <th>操作</th>}</tr></thead><tbody>
        {part.items.map((item, i) => <tr key={item.id}>{(["label", "quantity", "price"] as const).map(field => <td key={field}>{editing && !disabled ? <input aria-label={`内訳 ${i + 1}の${field === "label" ? "項目" : field === "quantity" ? "数量" : "単価"}`} value={item[field]} onChange={e => onChange({ ...part, items: part.items.map(v => v.id === item.id ? { ...v, [field]: e.target.value } : v) })} /> : item[field]}</td>)}
          <td><DetailResultView result={evaluate({ partId: part.id, itemId: item.id })} /></td>{editing && <td><button type="button" disabled={disabled || part.items.length === 1} onClick={() => onChange({ ...part, items: part.items.filter(v => v.id !== item.id) })}>削除</button></td>}</tr>)}
      </tbody></table>
      {editing && !disabled && <button type="button" onClick={() => onChange({ ...part, items: [...part.items, { id: crypto.randomUUID(), label: "", quantity: "", price: "" }] })}>内訳を追加</button>}
    </>}
    <DetailResultView result={evaluate({ partId: part.id })} />
  </div>;
}
