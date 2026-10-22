import type { DetailPart } from "../core/tables/detailParts";
import type { Initiative } from "../core/domain/plan";
import type { Account } from "../core/domain/accountMaster";
import { detailEvaluator, detailYen } from "../core/domain/detailValues";
import { detailTableMonths } from "../core/tables/detailTable";
import { DetailResultView, DetailValueSelect } from "./DetailNumericPart";

export function DetailOutputPart({ part, parts, initiatives, accounts, disabled, navigationBlocked, editing, onEditingChange, onChange, onOpen }: {
  part: Extract<DetailPart, { kind: "initiative-reference" }>; parts: readonly DetailPart[]; initiatives: readonly Initiative[]; accounts: readonly Account[];
  disabled: boolean; navigationBlocked: boolean; editing: boolean; onEditingChange: (editing: boolean) => void; onChange: (part: DetailPart) => void; onOpen: (initiative: Initiative, kind?: 1 | 2) => void;
}) {
  const target = initiatives.find(i => i.identity === part.initiativeIdentity);
  const binding = part.binding ?? { source: null, rowId: null, kindId: 1, months: [], unit: "yen" };
  const change = (patch: Partial<typeof binding>) => onChange({ ...part, binding: { ...binding, ...patch } });
  const result = detailEvaluator(parts)(binding.source);
  const row = target?.rows.find(r => r.id === binding.rowId);
  let error = "";
  if (part.initiativeIdentity && !target) error = "反映先の施策がありません。";
  else if (binding.rowId && !row) error = "反映先の科目行がありません。";
  else if (!target || !binding.rowId || !binding.months.length) error = "施策・科目行・対象月を選択すると反映します。";
  else if (result.error === undefined) try { binding.months.forEach(m => detailYen(result.value, m, binding.unit)); } catch (e) { error = (e as Error).message; }
  const choosing = editing || !part.initiativeIdentity;
  return <div className="detail-numeric-part detail-output-part" onPointerDown={e => { if (choosing || (e.target as HTMLElement).closest("button")) e.stopPropagation(); }} onDoubleClick={e => { e.stopPropagation(); if (!disabled) onEditingChange(true); }} onKeyDown={e => { if (choosing) e.stopPropagation(); if (e.key === "Escape" && !e.nativeEvent.isComposing) onEditingChange(false); }}>
    <strong>施策への反映</strong>
    {target && <button type="button" className="detail-initiative-link" disabled={navigationBlocked} onClick={() => onOpen(target, binding.kindId)}>{target.name}</button>}
    {!disabled && <button type="button" onClick={() => onEditingChange(!editing)}>{editing ? "編集を終える" : "変更"}</button>}
    {choosing && !disabled ? <>
      <DetailValueSelect parts={parts} value={binding.source} label="反映する値" onChange={source => change({ source })} />
      <label>施策<select aria-label="反映先の施策" value={part.initiativeIdentity ?? ""} onChange={e => onChange({ ...part, initiativeIdentity: e.target.value || null, binding: { ...binding, rowId: null } })}><option value="">施策を選択</option>{initiatives.filter(i => i.identity).map(i => <option key={i.identity} value={i.identity}>{i.name}</option>)}</select></label>
      <label>科目行<select aria-label="反映先の科目行" value={binding.rowId ?? ""} onChange={e => change({ rowId: e.target.value || null })}><option value="">科目行を選択</option>{target?.rows.map((r, i) => <option key={r.id} value={r.id}>{i + 1}行目：{accounts.find(a => a.id === r.accountId)?.accountName ?? "未分類"}</option>)}</select></label>
      <label>種別<select value={binding.kindId} onChange={e => change({ kindId: Number(e.target.value) as 1 | 2 })}><option value={1}>一次予算</option><option value={2}>確定予算</option></select></label>
      <label>反映する値の金額単位<select value={binding.unit} onChange={e => change({ unit: e.target.value as typeof binding.unit })}><option value="yen">円</option><option value="thousand-yen">千円</option></select></label>
      <fieldset><legend>対象月</legend><button type="button" onClick={() => change({ months: detailTableMonths.map(m => Number(m.id)) })}>12か月を選択</button><button type="button" onClick={() => change({ months: [] })}>解除</button><div className="detail-month-choices">{detailTableMonths.map(m => <label key={m.id}><input type="checkbox" checked={binding.months.includes(Number(m.id))} onChange={e => change({ months: e.target.checked ? [...binding.months, Number(m.id)] : binding.months.filter(n => n !== Number(m.id)) })} />{m.label}</label>)}</div></fieldset>
      <p>単一の値は選択した各月に同じ値を反映します。月別の値は同じ月に反映します。</p>
    </> : <p>{row ? accounts.find(a => a.id === row.accountId)?.accountName : "科目行未選択"} ／ {binding.kindId === 1 ? "一次予算" : "確定予算"} ／ {binding.months.map(m => `${m}月`).join("・") || "対象月未選択"}（{binding.unit === "yen" ? "円" : "千円"}）</p>}
    {error && <p className="detail-value-error" role="status">{error}</p>}
    {binding.source && <DetailResultView result={result} />}
    {(error || result.error) && binding.rowId && binding.months.length > 0 && <p>反映できない間は、施策に保存済みの金額を保持します。</p>}
  </div>;
}
