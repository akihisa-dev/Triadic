import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addYen, formatAmount, formatRate, formatYen, sumYen } from "../core/domain/amounts";
import { initiativeMonths } from "../core/domain/calendar";
import { baselineFor, comparisonName, previousKindName, type KindId } from "../core/domain/kinds";
import type { PlanContents } from "../core/domain/plan";
import { analysisAnnual, buildDashboardBreakdowns, compositionMode, waterfallSteps, treemapTiles, type AnalysisGroup } from "../core/tables/dashboardBreakdowns";
import { useWindowViewState } from "./windowView";
import "./DashboardAnalysis.css";

const signed = (value: number) => `${value > 0 ? "+" : ""}${formatYen(value)}`;
const margin = (sales: number, profit: number) => sales === 0 ? undefined : profit / sales * 100;
const rate = (value: number | undefined) => value === undefined ? "—" : formatRate(value);
const annual = (group: AnalysisGroup, kind: KindId) => analysisAnnual(group.budgets.find(entry => entry.kind === kind)!.months);
const profitValues = (groups: AnalysisGroup[], kind: KindId) => groups.map(group => ({ name: group.name, value: annual(group, kind).profit }));
type Datum = { name: string; value: number };
type TableRow = (string | number)[];

function ValueTable({ headers, rows }: { headers: string[]; rows: TableRow[] }) {
  return <details className="analysis-values"><summary>数値を表示</summary><div className="analysis-scroll" tabIndex={0} role="region" aria-label="グラフの数値"><table><thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((value, j) => j === 0 ? <th key={j} scope="row">{value}</th> : <td key={j}>{value}</td>)}</tr>)}</tbody></table></div></details>;
}
function Plot({ name, width = 640, height = 300, children, headers, rows }: { name: string; width?: number; height?: number; children: ReactNode; headers: string[]; rows: TableRow[] }) {
  const [focus, setFocus] = useState("");
  return <div className="analysis-plot">
    <div className="analysis-scroll" role="region" aria-label={`${name}のグラフ`} tabIndex={0}>
      <svg role="img" aria-label={name} viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }} width="100%" height={height}
        onFocusCapture={event => setFocus((event.target as Element).closest("[data-value]")?.getAttribute("data-value") ?? "")}
        onBlurCapture={() => setFocus("")} onMouseOver={event => setFocus((event.target as Element).closest("[data-value]")?.getAttribute("data-value") ?? "")} onMouseLeave={() => setFocus("")}>
        <title>{name}。金額は千円。各項目の数値は下の「数値を表示」で確認できます。</title>{children}
      </svg>
    </div><output className="analysis-focus">{focus}</output>
    <ValueTable headers={headers} rows={rows} />
  </div>;
}
function Mark({ label, children }: { label: string; children: ReactNode }) {
  return <g tabIndex={0} role="img" aria-label={label} data-value={label}><title>{label}</title>{children}</g>;
}
function Hatch({ id }: { id: string }) {
  return <defs><pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" className="analysis-negative-base" /><path d="M-1,1L1,-1M0,6L6,0M5,7L7,5" className="analysis-hatch-line" /></pattern></defs>;
}
function scale(values: number[], from: number, to: number) {
  let low = Math.min(0, ...values), high = Math.max(0, ...values);
  if (low === high) high = low + 1;
  const padding = (high - low) * .08;
  if (low < 0) low -= padding;
  if (high > 0) high += padding;
  return { low, high, at: (value: number) => from + (value - low) / (high - low) * (to - from) };
}
function Axis({ extent, x1, x2, y, vertical = false }: { extent: ReturnType<typeof scale>; x1: number; x2: number; y: number; vertical?: boolean }) {
  return <g className="analysis-axis">{[0, 1, 2, 3, 4].map(tick => {
    const value = extent.low + (extent.high - extent.low) * tick / 4;
    const at = extent.at(value);
    return vertical ? <g key={tick}><line x1={x1} x2={x2} y1={at} y2={at} /><text x={x1 - 8} y={at + 4} textAnchor="end">{formatAmount(value / 1000)}</text></g>
      : <g key={tick}><line x1={at} x2={at} y1={26} y2={y} /><text x={at} y={y + 20} textAnchor="middle">{formatAmount(value / 1000)}</text></g>;
  })}</g>;
}
function Waterfall({ groups, kind, start, end, prior, budget }: { groups: AnalysisGroup[]; kind: KindId; start: number; end: number; prior: string; budget: string }) {
  const hatch = useId();
  const changes = profitValues(groups, kind);
  const steps = waterfallSteps(start, changes.map(item => item.value));
  const entries = [{ name: prior, value: start, from: 0, to: start, total: true }, ...changes.map((item, index) => ({ ...item, ...steps[index]!, total: false })), { name: budget, value: end, from: 0, to: end, total: true }];
  const width = Math.max(920, entries.length * 110 + 110), height = 364, left = 100;
  const extent = scale(entries.flatMap(item => [item.from, item.to]), 264, 32);
  return <Plot name="展開別の利益増減" width={width} height={height} headers={["展開", "利益増減・合計（千円）"]} rows={entries.map(item => [item.name, item.total ? formatYen(item.value) : signed(item.value)])}>
    <Hatch id={hatch} /><Axis extent={extent} x1={left} x2={width - 16} y={264} vertical />
    <line className="analysis-zero" x1={left} x2={width - 16} y1={extent.at(0)} y2={extent.at(0)} />
    {entries.map((item, index) => {
      const x = left + index * (width - left - 20) / entries.length + 10;
      const w = (width - left - 20) / entries.length - 26;
      const top = Math.min(extent.at(item.from), extent.at(item.to));
      return <Mark key={index} label={`${item.name} ${item.total ? formatYen(item.value) : signed(item.value)}千円`}>
        {index < entries.length - 1 && <line className="analysis-connector" x1={x + w} x2={x + w + 26} y1={extent.at(item.to)} y2={extent.at(item.to)} />}
        <rect x={x} y={top} width={w} height={Math.max(1, Math.abs(extent.at(item.to) - extent.at(item.from)))} fill={item.total ? "var(--ink)" : item.value < 0 ? `url(#${hatch})` : "var(--accent)"} />
        <text x={x + w / 2} y={top - 10} textAnchor="middle">{item.total ? formatYen(item.value) : signed(item.value)}</text>
        <foreignObject x={x - 8} y={285} width={w + 16} height={70}><div className="analysis-axis-name">{item.name}</div></foreignObject>
      </Mark>;
    })}
  </Plot>;
}
function PeriodColumns({ groups, kind }: { groups: AnalysisGroup[]; kind: KindId }) {
  const hatch = useId();
  const values = groups.map(group => ({ name: group.name, months: group.budgets.find(item => item.kind === kind)!.months }));
  const stacks = initiativeMonths.map(month => {
    let positive = 0, negative = 0;
    return values.map((item, index) => { const value = item.months[month]!.profit; const from = value < 0 ? negative : positive;
      if (value < 0) negative = addYen(negative, value); else positive = addYen(positive, value);
      return { name: item.name, index, value, from, to: value < 0 ? negative : positive }; });
  });
  const extent = scale(stacks.flatMap(items => items.flatMap(item => [item.from, item.to])), 250, 28);
  return <><div className="analysis-legend">{values.map((item, index) => <span key={item.name}><i style={{ background: color(index) }} />{index + 1} {item.name}</span>)}</div>
    <Plot name="期間別の月別利益増減" height={300} headers={["期間", ...initiativeMonths.map(month => `${month}月（千円）`)]} rows={values.map(item => [item.name, ...initiativeMonths.map(month => signed(item.months[month]!.profit))])}>
      <Hatch id={hatch} /><Axis extent={extent} x1={88} x2={624} y={250} vertical />
      <line className="analysis-zero" x1={88} x2={624} y1={extent.at(0)} y2={extent.at(0)} />
      {stacks.map((items, i) => <g key={i}>{items.map(item => <Mark key={item.name} label={`${initiativeMonths[i]}月 ${item.name} ${signed(item.value)}千円`}>
        <rect x={96 + i * 44} y={Math.min(extent.at(item.from), extent.at(item.to))} width={28} height={Math.abs(extent.at(item.to) - extent.at(item.from))} fill={color(item.index)} />
        {item.value < 0 && <rect x={96 + i * 44} y={extent.at(item.from)} width={28} height={extent.at(item.to) - extent.at(item.from)} fill={`url(#${hatch})`} fillOpacity={.6} />}
        {Math.abs(extent.at(item.to) - extent.at(item.from)) > 18 && <text className="analysis-inverse" x={110 + i * 44} y={(extent.at(item.from) + extent.at(item.to)) / 2 + 4} textAnchor="middle">{item.index + 1}</text>}
      </Mark>)}<text x={110 + i * 44} y={280} textAnchor="middle">{initiativeMonths[i]}月</text></g>)}
    </Plot></>;
}
const color = (index: number) => `var(--analysis-color-${index % 6})`;
function Lollipops({ values, name }: { values: Datum[]; name: string }) {
  const height = Math.max(220, values.length * 42 + 65);
  const extent = scale(values.map(item => item.value), 245, 550);
  return <Plot name={name} height={height} headers={["区分", "利益増減（千円）"]} rows={values.map(item => [item.name, signed(item.value)])}>
    <Axis extent={extent} x1={245} x2={550} y={height - 42} />
    <line className="analysis-zero" x1={extent.at(0)} x2={extent.at(0)} y1={20} y2={height - 42} />
    {values.map((item, index) => <Mark key={index} label={`${item.name} ${signed(item.value)}千円`}>
      <foreignObject x={0} y={25 + index * 42} width={215} height={40}><div className="analysis-row-name">{item.name}</div></foreignObject>
      <line className="analysis-connector" x1={extent.at(0)} x2={extent.at(item.value)} y1={40 + index * 42} y2={40 + index * 42} />
      <circle cx={extent.at(item.value)} cy={40 + index * 42} r={5} fill={item.value < 0 ? "var(--muted)" : "var(--accent)"} />
      <text x={630} y={44 + index * 42} textAnchor="end">{signed(item.value)}</text>
    </Mark>)}
  </Plot>;
}
function SignedBars({ values, name }: { values: Datum[]; name: string }) {
  const height = Math.max(220, values.length * 42 + 65), hatch = useId();
  const extent = scale(values.map(item => item.value), 245, 550);
  return <Plot name={name} height={height} headers={["名称", "金額（千円）"]} rows={values.map(item => [item.name, signed(item.value)])}>
    <Hatch id={hatch} /><Axis extent={extent} x1={245} x2={550} y={height - 42} />
    <line className="analysis-zero" x1={extent.at(0)} x2={extent.at(0)} y1={20} y2={height - 42} />
    {values.map((item, index) => <Mark key={index} label={`${item.name} ${signed(item.value)}千円`}>
      <foreignObject x={0} y={25 + index * 42} width={215} height={40}><div className="analysis-row-name">{item.name}</div></foreignObject>
      <rect x={Math.min(extent.at(0), extent.at(item.value))} y={27 + index * 42} width={Math.abs(extent.at(item.value) - extent.at(0))} height={22} fill={item.value < 0 ? `url(#${hatch})` : "var(--accent)"} />
      <text x={630} y={44 + index * 42} textAnchor="end">{signed(item.value)}</text>
    </Mark>)}
  </Plot>;
}
function Composition({ values, name, treemap = false }: { values: Datum[]; name: string; treemap?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(Math.max(640, Math.floor(entry.contentRect.width) - 16)); });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [values.some(item => item.value < 0), values.some(item => item.value > 0)]);
  const mode = compositionMode(values.map(item => item.value));
  if (mode === "signed") return <><p className="dashboard-empty">負の金額を含むため、符号付きの棒グラフで表示します。</p><SignedBars values={values} name={name} /></>;
  if (mode === "empty") return <p className="dashboard-empty">金額はすべて0です。構成比は算出しません。</p>;
  const total = sumYen(values.map(item => item.value));
  const nonzero = values.filter(item => item.value > 0);
  const sorted = treemap || nonzero.length > 8 ? [...nonzero].sort((a, b) => b.value - a.value) : nonzero;
  const visible = sorted.length > 8 ? [...sorted.slice(0, 7), { name: treemap ? "その他科目" : "その他業種", value: sumYen(sorted.slice(7).map(item => item.value)) }] : sorted;
  let angle = -Math.PI / 2;
  const point = (a: number) => [220 + 140 * Math.cos(a), 185 + 140 * Math.sin(a)];
  return <div ref={container}><Plot name={name} width={treemap ? width : 640} height={treemap ? 460 : 370} headers={["名称", "金額（千円）", "構成比"]} rows={values.map(item => [item.name, formatYen(item.value), formatRate(item.value / total * 100)])}>
    {treemap ? treemapTiles(visible.map(item => item.value), width - 8, 450).map(({ index: i, x, y, width: w, height: h }) => { const item = visible[i]!; return <Mark key={i} label={`${item.name} ${formatYen(item.value)}千円 ${formatRate(item.value / total * 100)}`}>
      <rect x={x} y={y} width={w} height={h} fill={color(i)} stroke="var(--surface)" strokeWidth={2} />
      <foreignObject x={x + 9} y={y + 10} width={Math.max(0, w - 18)} height={Math.max(0, h - 18)}><div className="analysis-tile-label" style={{ color: i % 6 === 2 || i % 6 === 5 ? "var(--ink)" : "var(--surface)" }}>{i + 1}{w > 90 && h > 45 && <> {item.name}</>}{w > 120 && h > 100 && <><strong>{formatYen(item.value)}</strong><span>{formatRate(item.value / total * 100)}</span></>}</div></foreignObject>
    </Mark>; }) : <>
      {visible.map((item, i) => { const begin = angle; angle += item.value / total * Math.PI * 2; const a = point(begin), b = point(angle);
        return <Mark key={i} label={`${i + 1} ${item.name} ${formatYen(item.value)}千円 ${formatRate(item.value / total * 100)}`}>
          {visible.length === 1 ? <circle cx={220} cy={185} r={140} fill={color(i)} /> : <path d={`M220,185L${a[0]},${a[1]}A140,140 0 ${angle - begin > Math.PI ? 1 : 0},1 ${b[0]},${b[1]}Z`} fill={color(i)} stroke="var(--surface)" strokeWidth={2} />}
        </Mark>; })}
      <circle cx={220} cy={185} r={91} fill="var(--surface)" /><text x={220} y={175} textAnchor="middle">合計（千円）</text><text className="analysis-total" x={220} y={205} textAnchor="middle">{formatYen(total)}</text>
      {visible.map((item, i) => <Mark key={i} label={`${item.name} ${formatRate(item.value / total * 100)}`}>
        <rect x={395} y={36 + i * 40} width={10} height={10} fill={color(i)} /><text x={415} y={46 + i * 40}>{i + 1} {item.name.length > 10 ? item.name.slice(0, 10) + "…" : item.name}</text><text x={630} y={62 + i * 40} textAnchor="end">{formatRate(item.value / total * 100)}</text>
      </Mark>)}
    </>}
  </Plot>{treemap && <div className="analysis-legend">{visible.map((item, i) => <span key={i}><i style={{ background: color(i) }} />{i + 1} {item.name} {formatYen(item.value)}</span>)}</div>}</div>;
}
function Scatter({ groups, selected, prior, kindName }: { groups: AnalysisGroup[]; selected: KindId[]; prior: (kind: KindId) => string; kindName: (kind: KindId) => string }) {
  const dots = groups.flatMap((group, groupIndex) => selected.flatMap(kind => [{ name: `${prior(kind)}（${kindName(kind)}）`, kind: null, budgetKind: kind, ...analysisAnnual(group.budgets.find(entry => entry.kind === kind)!.previous) }, { name: kindName(kind), kind, budgetKind: kind, ...annual(group, kind) }]).map(item => ({ ...item, margin: margin(item.sales, item.profit), group: group.name, groupIndex })));
  const valid = dots.filter(item => item.margin !== undefined);
  const names = groups.flatMap((group, groupIndex) => {
    const point = valid.filter(item => item.groupIndex === groupIndex).at(-1);
    if (!point) return [];
    const letters = Array.from(group.name);
    const lines = Array.from({ length: Math.max(1, Math.ceil(letters.length / 14)) }, (_, i) => letters.slice(i * 14, (i + 1) * 14).join(""));
    return [{ groupIndex, point, lines, width: Math.max(13, Math.min(14, letters.length) * 13), height: lines.length * 18, left: 0, top: 0 }];
  });
  const bottom = Math.max(290, 35 + names.reduce((sum, item) => sum + item.height + 16, 0));
  const x = scale(valid.map(item => item.sales), 100, 600), y = scale(valid.map(item => item.margin!), bottom, 35);
  const placed: typeof names = [];
  for (const item of names) {
    const px = x.at(item.point.sales), py = y.at(item.point.margin!);
    const lefts = [px + 12, px - item.width - 12, px - item.width / 2].map(left => Math.max(100, Math.min(620 - item.width, left)));
    const tops = [py - item.height - 12, py + 12, ...Array.from({ length: Math.ceil(bottom / 18) }, (_, i) => 28 + i * 18)]
      .map(top => Math.max(28, Math.min(bottom - item.height, top)));
    const candidates = tops.flatMap(top => lefts.map(left => ({ left, top }))).sort((a, b) =>
      Math.hypot(a.left + item.width / 2 - px, a.top + item.height / 2 - py) - Math.hypot(b.left + item.width / 2 - px, b.top + item.height / 2 - py));
    const position = candidates.find(box =>
      !placed.some(other => box.left < other.left + other.width + 8 && box.left + item.width + 8 > other.left && box.top < other.top + other.height + 8 && box.top + item.height + 8 > other.top) &&
      !valid.some(dot => x.at(dot.sales) > box.left - 9 && x.at(dot.sales) < box.left + item.width + 9 && y.at(dot.margin!) > box.top - 9 && y.at(dot.margin!) < box.top + item.height + 9));
    if (position) Object.assign(item, position);
    placed.push(item);
  }
  const marker = useId();
  return <><div className="analysis-legend"><span>○ {[...new Set(selected.map(prior))].join(" / ")}</span>{selected.map((kind, i) => <span key={kind}>{i === 0 ? "●" : "◆"} {kindName(kind)}</span>)}</div>
    <Plot name="業種別の売上と利益率" width={640} height={bottom + 65} headers={["業種", "種別", "売上（千円）", "利益率"]} rows={dots.map(item => [item.group, item.name, formatYen(item.sales), rate(item.margin)])}>
      <defs><marker id={marker} markerWidth={6} markerHeight={6} refX={5} refY={3} orient="auto"><path d="M0,0L6,3L0,6" fill="var(--muted)" /></marker></defs>
      <Axis extent={x} x1={100} x2={600} y={bottom} />
      {[0, 1, 2, 3, 4].map(tick => { const value = y.low + (y.high - y.low) * tick / 4; return <g key={tick} className="analysis-axis"><line x1={100} x2={600} y1={y.at(value)} y2={y.at(value)} /><text x={90} y={y.at(value) + 4} textAnchor="end">{formatRate(value)}</text></g>; })}
      <line className="analysis-zero" x1={100} x2={600} y1={y.at(0)} y2={y.at(0)} /><text x={100} y={18}>利益率（%）</text><text x={600} y={bottom + 55} textAnchor="end">売上（千円）</text>
      {groups.map((group, groupIndex) => { const items = valid.filter(item => item.groupIndex === groupIndex); return <g key={groupIndex}>
        {items.filter(item => item.kind !== null).map(item => { const base = items.find(other => other.kind === null && other.budgetKind === item.kind); return base && <line key={item.name} className="analysis-connector" x1={x.at(base.sales)} y1={y.at(base.margin!)} x2={x.at(item.sales)} y2={y.at(item.margin!)} markerEnd={`url(#${marker})`} />; })}
        {items.map(item => <Mark key={item.name} label={`${group.name} ${item.name} 売上${formatYen(item.sales)}千円 利益率${rate(item.margin)}`}>
          {item.kind !== null && item.kind === selected[1] ? <path d={`M${x.at(item.sales)},${y.at(item.margin!) - 6}l6,6l-6,6l-6,-6Z`} fill="var(--ink)" /> : <circle cx={x.at(item.sales)} cy={y.at(item.margin!)} r={5} fill={item.kind === null ? "var(--surface)" : "var(--accent)"} stroke={item.kind === null ? "var(--muted)" : "var(--accent)"} strokeWidth={2} />}
        </Mark>)}
      </g>; })}
      {names.map(item => {
        const px = x.at(item.point.sales), py = y.at(item.point.margin!);
        const edgeX = Math.max(item.left, Math.min(item.left + item.width, px));
        const edgeY = Math.max(item.top, Math.min(item.top + item.height, py));
        const distance = Math.hypot(edgeX - px, edgeY - py);
        return <g key={item.groupIndex} className="analysis-scatter-label">
          {distance > 24 && <line className="analysis-connector" x1={px + (edgeX - px) * 8 / distance} y1={py + (edgeY - py) * 8 / distance} x2={edgeX} y2={edgeY} />}
          <text x={item.left} y={item.top + 14}>{item.lines.map((line, index) => <tspan key={index} x={item.left} dy={index === 0 ? 0 : 18}>{line}</tspan>)}</text>
        </g>;
      })}
    </Plot>
    {valid.length < dots.length && <p className="dashboard-empty">売上0の項目は利益率を算出せず、点を表示しません。金額は「数値を表示」で確認できます。</p>}</>;
}
function Dumbbells({ groups, selected, prior, kindName }: { groups: AnalysisGroup[]; selected: KindId[]; prior: (kind: KindId) => string; kindName: (kind: KindId) => string }) {
  const items = groups.map(group => ({ name: group.name, values: selected.map(kind => ({ kind, prior: analysisAnnual(group.budgets.find(entry => entry.kind === kind)!.previous).expense!, value: annual(group, kind).expense! })) })).filter(item => item.values.some(value => value.prior !== 0 || value.value !== 0));
  const step = selected.length * 22 + 22, height = Math.max(230, items.length * step + 65);
  const extent = scale(items.flatMap(item => item.values.flatMap(value => [value.prior, value.value])), 245, 530);
  return <><div className="analysis-legend"><span>○ {[...new Set(selected.map(prior))].join(" / ")}</span>{selected.map((kind, i) => <span key={kind}>{i === 0 ? "●" : "◆"} {kindName(kind)}</span>)}</div>
    <Plot name="科目別の費用増減" height={height} headers={["勘定科目", "種別", "前年（千円）", "予算（千円）", "費用増減（千円）"]} rows={items.flatMap(item => item.values.map(value => [item.name, kindName(value.kind), formatYen(value.prior), formatYen(value.value), signed(addYen(value.value, -value.prior))]))}>
      <Axis extent={extent} x1={245} x2={530} y={height - 42} />
      {items.map((item, index) => <g key={item.name}>
        <foreignObject x={0} y={25 + index * step} width={205} height={step - 6}><div className="analysis-row-name">{item.name}</div></foreignObject>
        {item.values.map((value, series) => { const y = 38 + index * step + series * 22; return <Mark key={value.kind} label={`${item.name} ${kindName(value.kind)} ${formatYen(value.value)}千円 ${prior(value.kind)} ${formatYen(value.prior)}千円 費用増減${signed(addYen(value.value, -value.prior))}千円`}>
          <line className="analysis-connector" x1={extent.at(value.prior)} x2={extent.at(value.value)} y1={y} y2={y} />
          <circle cx={extent.at(value.prior)} cy={y} r={4} fill="var(--surface)" stroke="var(--muted)" strokeWidth={2} />
          {series === 0 ? <circle cx={extent.at(value.value)} cy={y} r={5} fill="var(--accent)" /> : <path d={`M${extent.at(value.value)},${y - 5}l5,5l-5,5l-5,-5Z`} fill="var(--ink)" />}
          <text x={630} y={y + 4} textAnchor="end">{signed(addYen(value.value, -value.prior))}</text>
        </Mark>; })}
      </g>)}
    </Plot></>;
}
function Heatmap({ name, columns, rows }: { name: string; columns: string[]; rows: { name: string; values: (number | undefined)[] }[] }) {
  const maximum = Math.max(1, ...rows.flatMap(row => row.values.map(value => Math.abs(value ?? 0))));
  return <><div className="analysis-legend"><span>{name.startsWith("部署") ? "利益 ＋" : "増加 ＋"}</span><span className="analysis-heat-swatch" /><span>0</span><span className="analysis-negative-swatch" /><span>{name.startsWith("部署") ? "損失 −" : "減少 −"}</span><span>濃淡の上限 ±{formatYen(maximum)} 千円</span></div>
    <div className="analysis-scroll analysis-heatmap" tabIndex={0} role="region" aria-label={name}><table><thead><tr><th scope="col">{name.startsWith("部署") ? "部署" : "展開"}</th>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}><th scope="row">{row.name}</th>{row.values.map((value, j) => <td key={j} title={`${row.name} ${columns[j]} ${value === undefined ? "所属対象外" : signed(value) + "千円"}`} className={value !== undefined && value < 0 ? "analysis-heat-negative" : ""} style={value === undefined || value === 0 ? undefined : { backgroundColor: `color-mix(in srgb, ${value < 0 ? "var(--muted)" : "var(--accent)"} ${8 + Math.abs(value) / maximum * 23}%, var(--surface))` }}>{value === undefined ? "—" : signed(value)}</td>)}</tr>)}</tbody></table></div>
  </>;
}
function Section({ title, note, children, control }: { title: string; note: string; children: ReactNode; control?: ReactNode }) {
  return <section className="dashboard-analysis-section" aria-label={title}><div className="dashboard-panel-heading"><div><h2>{title}</h2><p className="analysis-context">{note}</p></div>{control}</div>{children}</section>;
}
export function DashboardAnalysis({ contents, selected }: { contents: PlanContents; selected: KindId[] }) {
  const data = useMemo(() => buildDashboardBreakdowns(contents, selected), [contents, selected]);
  const [storedKind, setKind] = useWindowViewState("dashboard:analysis-kind", selected[0]!, true);
  const [expansion, setExpansion] = useWindowViewState("dashboard:analysis-expansion", contents.expansions.find(item => item.expansionName === "コスト")?.id ?? contents.expansions[0]?.id ?? null, true);
  const kind = selected.includes(storedKind) ? storedKind : selected[0]!;
  const expansionId = data.expansions.some(item => item.id === expansion) ? expansion : data.expansions[0]?.id ?? null;
  const kindName = (id: KindId) => comparisonName(contents, id).replace("\n", " · ");
  const priorName = (id: KindId) => previousKindName(baselineFor(contents, id));
  const prior = priorName(kind), note = `年間・${kindName(kind)}・千円`;
  const total = (metric: "sales" | "profit", previous: boolean) => sumYen(data.industries.map(group => previous ? analysisAnnual(group.budgets.find(entry => entry.kind === kind)!.previous)[metric] : annual(group, kind)[metric]));
  const sales = data.industries.map(group => ({ name: group.name, value: annual(group, kind).sales }));
  const expenses = data.accounts.map(group => ({ name: group.name, value: annual(group, kind).expense! }));
  const categoryGroups = data.categoriesByExpansion.get(expansionId) ?? [];
  const industryGroups = data.industries;
  const matrixIndustries = data.industries;
  return <div className="dashboard-analysis">
    {selected.length > 1 && <div className="analysis-kind dashboard-controls"><label>構成・増減グラフの予算<select value={kind} onChange={event => setKind(Number(event.target.value) as KindId)}>{selected.map(id => <option key={id} value={id}>{kindName(id)}</option>)}</select></label></div>}
    <Section title="展開別の利益増減" note={`${prior} → ${kindName(kind)}・年間・千円`}><Waterfall groups={data.expansions} kind={kind} start={total("profit", true)} end={total("profit", false)} prior={prior} budget={kindName(kind)} /></Section>
    <div className="dashboard-pair">
      <Section title="期間別の月別利益増減" note={`${kindName(kind)}・施策増減・千円`}><PeriodColumns groups={data.periods} kind={kind} /></Section>
      <Section title="展開区分別の利益増減" note={`${note}・施策増減`} control={<div className="dashboard-controls"><label>展開<select value={expansionId === null ? "none" : String(expansionId)} onChange={event => setExpansion(event.target.value === "none" ? null : Number(event.target.value))}>{data.expansions.map(item => <option key={item.id ?? "none"} value={item.id === null ? "none" : String(item.id)}>{item.name}</option>)}</select></label></div>}>{categoryGroups.length ? <Lollipops values={profitValues(categoryGroups, kind)} name="展開区分別の利益増減" /> : <p className="dashboard-empty">この展開の施策はありません。</p>}</Section>
    </div>
    <div className="dashboard-pair">
      <Section title="業種別の売上構成" note={note}><Composition values={sales} name="業種別の売上構成" /></Section>
      <Section title="業種別の売上と利益率" note={`年間・${prior}／${selected.map(kindName).join("／")}`}><Scatter groups={industryGroups} selected={selected} prior={priorName} kindName={kindName} /></Section>
    </div>
    <Section title="部署 × 業種の利益" note={note}><Heatmap name="部署 × 業種の利益" columns={matrixIndustries.map(group => group.name)} rows={data.departments.map(department => ({ name: department.name, values: matrixIndustries.map(industry => {
      const entry = data.cells.get(JSON.stringify([department.id, industry.id]));
      const applicable = department.id === null || industry.id === null || contents.departments.find(item => item.id === department.id)?.industryIds.includes(industry.id);
      return entry ? analysisAnnual(entry.budgets.find(item => item.kind === kind)!.months).profit : applicable ? 0 : undefined;
    }) }))} /></Section>
    <div className="dashboard-expense-charts">
      <Section title="勘定科目別の費用構成" note={note}><Composition values={expenses} name="勘定科目別の費用構成" treemap /></Section>
      <Section title="科目別の費用増減" note={`年間・${prior}／${selected.map(kindName).join("／")}・千円`}><Dumbbells groups={data.accounts} selected={selected} prior={priorName} kindName={kindName} /></Section>
    </div>
    <Section title="展開 × 月別の利益増減" note={`${kindName(kind)}・施策増減・千円`}><Heatmap name="展開 × 月別の利益増減" columns={initiativeMonths.map(month => `${month}月`)} rows={data.expansions.map(group => ({ name: group.name, values: initiativeMonths.map(month => group.budgets.find(item => item.kind === kind)!.months[month]!.profit) }))} /></Section>
  </div>;
}
