import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatAmount, formatRate, formatYen } from "../core/domain/amounts";
import { initiativeMonths } from "../core/domain/calendar";
import { baselineFor, comparisonName, previousKindName, type KindId, type BudgetPrevious } from "../core/domain/kinds";
import type { Initiative, PlanContents } from "../core/domain/plan";
import { buildDashboard, dashboardAmounts, dashboardChange, dashboardDepartmentComparison, rankDashboardInitiatives, type Dashboard, type DashboardMetric, type DashboardPeriod, type DashboardSeries } from "../core/tables/dashboard";
import { DashboardAnalysis } from "./DashboardAnalysis";
import { DashboardControls } from "./DashboardControls";
import { TableCalculationBoundary } from "./TableCalculationBoundary";
import { useWindowViewState } from "./windowView";
import "./DashboardPage.css";
import "./DashboardBento.css";

type Props = { contents: PlanContents; selected: KindId[]; previous: BudgetPrevious; disabled: boolean;
  onSelection: (kinds: KindId[], previous: BudgetPrevious) => void;
  onDepartment: (id: number) => void; onInitiative: (initiative: Initiative, kind: KindId) => void };
const metrics = [{ id: "sales", name: "売上" }, { id: "profit", name: "利益" }] as const;
const signedAmount = (value: number) => `${value > 0 ? "+" : ""}${formatYen(value)}`;
const rate = (value: number | undefined, difference = false) => value === undefined ? "—" : `${difference && value > 0 ? "+" : ""}${formatRate(value, difference)}`;
const growth = (value: number, previous: number) => { const change = dashboardChange(value, previous); return `${signedAmount(change.amount)} / ${change.rate === undefined ? "—" : `${change.rate > 0 ? "+" : ""}${formatRate(change.rate)}`}`; };

export function DashboardPage({ contents, selected, previous, disabled, onSelection, ...navigation }: Props) {
  const context = useMemo(() => ({ ...contents, budgetPrevious: previous }), [contents, previous]);
  const [period, setPeriod] = useWindowViewState("dashboard:period", "annual", true);
  return <main className={`dashboard-page ${selected.length === 1 ? "dashboard-single-kind" : ""}`} aria-labelledby="dashboard-title">
    <div className="initiative-list-heading"><h1 id="dashboard-title">ダッシュボード</h1></div>
    <TableCalculationBoundary resetKeys={[contents, selected, previous]}>
      <DashboardContents contents={context} selected={selected} disabled={disabled} period={period} {...navigation} />
    </TableCalculationBoundary>
    <DashboardControls selected={selected} previous={previous} disabled={disabled} period={period} onPeriod={setPeriod} onSelection={onSelection} />
  </main>;
}

function DashboardContents({ contents, selected, disabled, onDepartment, onInitiative, period }: Pick<Props, "contents" | "selected" | "disabled" | "onDepartment" | "onInitiative"> & { period: DashboardPeriod }) {
  const dashboard = useMemo(() => buildDashboard(contents, selected), [contents, selected]);
  const departmentPeriod = period;
  const charts = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animations = [...charts.current!.querySelectorAll(".dashboard-bar")].map(bar => bar.animate([{ transform: "scaleX(.05)", transformOrigin: "left" }, { transform: "scaleX(1)", transformOrigin: "left" }], { duration: 650, easing: "cubic-bezier(.16,1,.3,1)" }));
    return () => animations.forEach(animation => animation.cancel());
  }, [period, selected, contents]);
  const departmentComparison = useMemo(() => dashboardDepartmentComparison(dashboard.departments, departmentPeriod), [dashboard, departmentPeriod]);
  const [ranking, setRanking] = useWindowViewState("dashboard:ranking", selected[0]!, true);
  const rankKind = selected.includes(ranking) ? ranking : selected[0]!;
  const priorName = (kind: KindId) => previousKindName(baselineFor(contents, kind));
  const priors = [...new Set(selected.map(kind => baselineFor(contents, kind)))];
  const kindName = (id: KindId) => comparisonName(contents, id).replace("\n", " · ");
  const annual = dashboard.budgets.map(entry => ({ kind: entry.kind, previous: dashboardAmounts(entry.previous), ...dashboardAmounts(entry.months) }));
  return <div className="dashboard-grid" ref={charts}>
    <div className="dashboard-legend" aria-label="グラフの凡例">{priors.map(kind => <span key={kind} className={`dashboard-prior dashboard-prior-${kind}`}>{previousKindName(kind)}</span>)}{selected.map((kind, index) => <span className={`dashboard-series-${index}`} key={kind}>{kindName(kind)}</span>)}</div>
    <div className="dashboard-stats">
      {([...metrics, { id: "margin", name: "利益率" }] as const).map(metric => <section className="dashboard-stat" key={metric.id} aria-label={`年間${metric.name}`}>
        <h2>{metric.id === "margin" ? metric.name : `年間${metric.name}`}</h2>
        {annual.map((value, index) => <div key={value.kind} className={`dashboard-stat-kind dashboard-series-${index}`} role="group" aria-label={kindName(value.kind)}>
          <strong className="dashboard-series-value">{metric.id === "margin" ? rate(value.margin) : formatYen(value[metric.id])}</strong>
          <span className="dashboard-delta">前年差 {metric.id === "margin" ? rate(value.margin === undefined || value.previous.margin === undefined ? undefined : value.margin - value.previous.margin, true) : growth(value[metric.id], value.previous[metric.id])}</span>
        <div className="dashboard-baseline dashboard-prior" role="group" aria-label={priorName(value.kind)}><span className="dashboard-series-value">{metric.id === "margin" ? rate(value.previous.margin) : formatYen(value.previous[metric.id])}</span></div>
        </div>)}
      </section>)}
    </div>
    <div className="dashboard-pair">{metrics.map(metric => <section key={metric.id} className="dashboard-panel"><h2>{metric.name}の月別推移</h2><MonthlyChart series={dashboard} metric={metric.id} priorName={priorName} kindName={kindName} /></section>)}</div>
    <section className="dashboard-panel dashboard-comparison"><div className="dashboard-panel-heading"><h2>部署別比較</h2></div>
      <div className="dashboard-legend">{priors.map(kind => <span key={kind} className={`dashboard-prior dashboard-prior-${kind}`}>{previousKindName(kind)}</span>)}{selected.map((kind, index) => <span className={`dashboard-series-${index}`} key={kind}>{kindName(kind)}</span>)}<span>金額：千円</span></div>
      <div className="dashboard-department dashboard-department-header" aria-hidden="true"><span>部署</span><span>売上 / 前年増減</span><span>利益 / 前年増減</span><span>利益率 / 前年差</span></div>
      {departmentComparison.rows.map(department => {
        return <div className="dashboard-department" key={department.id ?? "unassigned"}>
          <div className="dashboard-department-name">{department.id === null ? department.name : <button className="initiative-name-button" disabled={disabled} onClick={() => onDepartment(department.id!)}>{department.name}</button>}</div>
          {metrics.map(metric => {
            const maximum = departmentComparison.maximum[metric.id];
            return <div key={metric.id} className="dashboard-department-metric"><span className="dashboard-mobile-label">{metric.name}</span>{department.budgets.map((entry, index) => {
              const prior = entry.previous;
              const amount = entry.amounts[metric.id];
              return <div key={entry.kind} className={`dashboard-department-kind dashboard-series-${index}`}>
                {department.id === null ? <span className="dashboard-series-value" role="group" aria-label={`${kindName(entry.kind)} ${metric.name} ${formatYen(amount)}`}>{formatYen(amount)}</span> : <button className="dashboard-number dashboard-series-value" disabled={disabled} aria-label={`${department.name} ${kindName(entry.kind)} ${metric.name} ${formatYen(amount)}の総原価表`} onClick={() => onDepartment(department.id!)}>{formatYen(amount)}</button>}
                <div className={`dashboard-bar ${amount < 0 ? "dashboard-bar-negative" : ""}`} style={{ width: `${Math.abs(amount) / maximum * 100}%` }} />
                <span className="dashboard-delta">{growth(amount, prior[metric.id])}</span>
              </div>;
            })}</div>;
          })}
          <div className="dashboard-department-metric"><span className="dashboard-mobile-label" aria-hidden="true">利益率 / 前年差</span>{department.budgets.map((entry, index) => {
            const prior = entry.previous;
            const value = entry.amounts.margin;
            const difference = value === undefined || prior.margin === undefined ? undefined : value - prior.margin;
            const maximum = departmentComparison.maximum.margin;
            return <div key={entry.kind} className={`dashboard-department-kind dashboard-series-${index}`} role="group"
              aria-label={`${department.name} ${kindName(entry.kind)} ${departmentPeriod === "annual" ? "年間" : `${departmentPeriod}月`} 利益率 ${value === undefined ? "計算できません" : rate(value)} 前年差 ${difference === undefined ? "計算できません" : rate(difference, true)}`}>
              <span className="dashboard-series-value" aria-hidden="true">{rate(value)}</span>
              {value !== undefined && <div className="dashboard-margin-track" aria-hidden="true"><span style={{ left: `${50 + value / maximum * 46}%` }} /></div>}
              <span className="dashboard-delta" aria-hidden="true">{rate(difference, true)}</span></div>;
          })}</div>
        </div>;
      })}
      {!dashboard.departments.length && <p className="dashboard-empty">部署は登録されていません。</p>}
    </section>
    <section className="dashboard-panel dashboard-impact"><div className="dashboard-panel-heading"><h2>施策の影響</h2><div className="dashboard-controls">
      {selected.length > 1 && <label>並び順の基準<select value={rankKind} onChange={event => setRanking(Number(event.target.value) as KindId)}>{selected.map(kind => <option key={kind} value={kind}>{kindName(kind)}</option>)}</select></label>}
    </div></div>
      <div className="dashboard-legend">{selected.map((kind, index) => <span className={`dashboard-series-${index}`} key={kind}>{kindName(kind)}</span>)}</div>
      <div className="dashboard-pair">{metrics.map(metric => <div key={metric.id}><h3>{metric.name}への影響</h3>{(["increase", "decrease"] as const).map(direction => <Ranking key={`${metric.id}:${direction}:${rankKind}:${period}`} dashboard={dashboard} metric={metric.id} kind={rankKind} period={period} direction={direction} kindName={kindName} disabled={disabled} onOpen={onInitiative} />)}</div>)}</div>
    </section>
    <DashboardAnalysis contents={contents} selected={selected} />
  </div>;
}

function Ranking({ dashboard, metric, kind, period, direction, kindName, disabled, onOpen }: { dashboard: Dashboard; metric: DashboardMetric; kind: KindId; period: DashboardPeriod; direction: "increase" | "decrease"; kindName: (kind: KindId) => string; disabled: boolean; onOpen: Props["onInitiative"] }) {
  const ranks = useMemo(() => rankDashboardInitiatives(dashboard, kind, period, metric, direction), [dashboard, kind, period, metric, direction]);
  const maximum = Math.max(1, ...ranks.flatMap(item => item.values.map(value => Math.abs(value.amount))));
  return <section className="dashboard-ranking" aria-label={`${metric === "sales" ? "売上" : "利益"}を${direction === "increase" ? "増やす" : "減らす"}施策`}>
    <h4>{direction === "increase" ? "増加" : "減少"}</h4>
    {ranks.map(item => <div key={item.initiative.id} className="dashboard-rank">
      <button className="initiative-name-button" disabled={disabled} onClick={() => onOpen(item.initiative, kind)}>{item.initiative.name}</button>
      {item.values.map((value, index) => <div key={value.kind} className={`dashboard-rank-value dashboard-series-${index}`}><span className="dashboard-series-value" role="group" aria-label={`${kindName(value.kind)} ${signedAmount(value.amount)}`}>{signedAmount(value.amount)}</span><button className={`dashboard-bar dashboard-initiative-bar ${value.amount < 0 ? "dashboard-bar-negative" : ""}`} disabled={disabled} aria-label={`${item.initiative.name} ${kindName(value.kind)} ${signedAmount(value.amount)}の施策詳細`} onClick={() => onOpen(item.initiative, value.kind)} style={{ width: `${Math.abs(value.amount) / maximum * 100}%` }} /></div>)}
    </div>)}
    {!ranks.length && <p className="dashboard-empty">該当する施策はありません。</p>}
  </section>;
}

function MonthlyChart({ series, metric, priorName, kindName }: { series: DashboardSeries; metric: DashboardMetric; priorName: (kind: KindId) => string; kindName: (id: KindId) => string }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  useLayoutEffect(() => { const observer = new ResizeObserver(([entry]) => { if (entry && entry.contentRect.width > 0) setWidth(entry.contentRect.width); }); if (container.current) observer.observe(container.current); return () => observer.disconnect(); }, []);
  const values = [...series.budgets.filter((entry, index, all) => all.findIndex(other => other.previousKind === entry.previousKind) === index).map(entry => ({ name: priorName(entry.kind), months: entry.previous, className: `dashboard-prior dashboard-prior-${entry.previousKind}` })), ...series.budgets.map((entry, index) => ({ name: kindName(entry.kind), months: entry.months, className: `dashboard-series-${index}` }))];
  const all = values.flatMap(entry => initiativeMonths.map(month => entry.months[month]?.[metric] ?? 0));
  const low = Math.min(0, ...all), high = Math.max(0, ...all), padding = (high - low || 1000) * .1;
  const min = low - padding, max = high + padding;
  const left = Math.min(100, Math.max(55, Math.max(formatAmount(min / 1000).length, formatAmount(max / 1000).length) * 7 + 12));
  const right = 12, height = 212, top = 20, bottom = 30;
  const x = (index: number) => left + index * (width - left - right) / 11;
  const y = (value: number) => top + (max - value) / (max - min) * (height - top - bottom);
  return <div ref={container} className="dashboard-chart"><svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric === "sales" ? "売上" : "利益"}の月別推移`}>
    <title>{values.map(entry => `${entry.name}：${initiativeMonths.map(month => `${month}月 ${formatYen(entry.months[month]?.[metric] ?? 0)}`).join("、")}`).join("。")}</title>
    <text x={left} y={11}>千円</text>
    {Array.from({ length: 4 }, (_, index) => { const value = min + (max - min) * index / 3; return <g key={index}><line className="dashboard-chart-grid" x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text x={left - 7} y={y(value) + 4} textAnchor="end">{formatAmount(value / 1000)}</text></g>; })}
    {initiativeMonths.map((month, index) => <text key={month} x={x(index)} y={height - 6} textAnchor={index === 11 ? "end" : "middle"}>{month}月</text>)}
    {values.map(entry => <g key={entry.name} className={entry.className}><path className="dashboard-chart-line" d={initiativeMonths.map((month, index) => `${index ? "L" : "M"}${x(index)},${y(entry.months[month]?.[metric] ?? 0)}`).join(" ")} />
      {initiativeMonths.map((month, index) => <circle key={month} className="dashboard-chart-point" cx={x(index)} cy={y(entry.months[month]?.[metric] ?? 0)} r={3}><title>{month}月 {entry.name} {formatYen(entry.months[month]?.[metric] ?? 0)}</title></circle>)}
    </g>)}
  </svg></div>;
}
