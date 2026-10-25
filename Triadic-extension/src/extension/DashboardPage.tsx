import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatAmount, formatRate, formatYen } from "../core/domain/amounts";
import { initiativeMonths } from "../core/domain/calendar";
import { previousKindName, type KindId, type PreviousKind } from "../core/domain/kinds";
import type { Initiative, PlanContents } from "../core/domain/plan";
import { buildDashboard, dashboardAmounts, dashboardChange, rankDashboardInitiatives, type Dashboard, type DashboardMetric, type DashboardPeriod, type DashboardSeries } from "../core/tables/dashboard";
import { DashboardAnalysis } from "./DashboardAnalysis";
import { KindSelectionSlots } from "./KindSelectionSlots";
import { TableCalculationBoundary } from "./TableCalculationBoundary";
import { useWindowViewState } from "./windowView";
import "./DashboardPage.css";

type Props = { contents: PlanContents; selected: KindId[]; previousKind: PreviousKind; disabled: boolean;
  onKinds: (kinds: KindId[]) => void; onPrevious: (kind: PreviousKind) => void;
  onDepartment: (id: number) => void; onInitiative: (initiative: Initiative, kind: KindId) => void };
const metrics = [{ id: "sales", name: "売上" }, { id: "profit", name: "利益" }] as const;
const signedAmount = (value: number) => `${value > 0 ? "+" : ""}${formatYen(value)}`;
const rate = (value: number | undefined, difference = false) => value === undefined ? "—" : `${difference && value > 0 ? "+" : ""}${formatRate(value, difference)}`;
const growth = (value: number, previous: number) => { const change = dashboardChange(value, previous); return `${signedAmount(change.amount)} / ${change.rate === undefined ? "—" : `${change.rate > 0 ? "+" : ""}${formatRate(change.rate)}`}`; };

export function DashboardPage({ contents, selected, previousKind, disabled, onKinds, onPrevious, ...navigation }: Props) {
  const context = useMemo(() => ({ ...contents, previousKind }), [contents, previousKind]);
  return <main className={`dashboard-page ${selected.length === 1 ? "dashboard-single-kind" : ""}`} aria-labelledby="dashboard-title">
    <div className="initiative-list-heading"><h1 id="dashboard-title">ダッシュボード</h1>
      <KindSelectionSlots screen="dashboard" selected={selected} previousKind={previousKind} disabled={disabled} onChange={onKinds} onPreviousChange={onPrevious} />
    </div>
    <TableCalculationBoundary resetKeys={[contents, selected, previousKind]}>
      <DashboardContents contents={context} selected={selected} disabled={disabled} {...navigation} />
    </TableCalculationBoundary>
  </main>;
}

function DashboardContents({ contents, selected, disabled, onDepartment, onInitiative }: Pick<Props, "contents" | "selected" | "disabled" | "onDepartment" | "onInitiative">) {
  const dashboard = useMemo(() => buildDashboard(contents, selected), [contents, selected]);
  const [departmentPeriod, setDepartmentPeriod] = useWindowViewState("dashboard:department-period", "annual", true);
  const [period, setPeriod] = useWindowViewState("dashboard:period", "annual", true);
  const [ranking, setRanking] = useWindowViewState("dashboard:ranking", selected[0]!, true);
  const rankKind = selected.includes(ranking) ? ranking : selected[0]!;
  const priorName = previousKindName(contents.previousKind ?? 1);
  const kindName = (id: KindId) => contents.kinds.find(item => item.id === id)!.kindName;
  const previous = dashboardAmounts(dashboard.previous);
  const annual = dashboard.budgets.map(entry => ({ kind: entry.kind, ...dashboardAmounts(entry.months) }));
  return <>
    <div className="dashboard-stats">
      {([...metrics, { id: "margin", name: "利益率" }] as const).map(metric => <section className="dashboard-stat" key={metric.id} aria-label={`年間${metric.name}`}>
        <h2>{metric.id === "margin" ? metric.name : `年間${metric.name}`}</h2>
        {annual.map((value, index) => <div key={value.kind} className={`dashboard-stat-kind dashboard-series-${index}`}>
          <span className="dashboard-series-label">{kindName(value.kind)}</span>
          <strong>{metric.id === "margin" ? rate(value.margin) : formatYen(value[metric.id])}</strong>
          <span className="dashboard-delta">前年差 {metric.id === "margin" ? rate(value.margin === undefined || previous.margin === undefined ? undefined : value.margin - previous.margin, true) : growth(value[metric.id], previous[metric.id])}</span>
        </div>)}
        <div className="dashboard-baseline">{priorName} <span>{metric.id === "margin" ? rate(previous.margin) : formatYen(previous[metric.id])}</span></div>
      </section>)}
    </div>
    <div className="dashboard-legend" aria-label="グラフの凡例"><span className="dashboard-prior">{priorName}</span>{selected.map((kind, index) => <span className={`dashboard-series-${index}`} key={kind}>{kindName(kind)}</span>)}</div>
    <div className="dashboard-pair">{metrics.map(metric => <section key={metric.id} className="dashboard-panel"><h2>{metric.name}の月別推移</h2><MonthlyChart series={dashboard} metric={metric.id} priorName={priorName} kindName={kindName} /></section>)}</div>
    <section className="dashboard-panel dashboard-comparison"><div className="dashboard-panel-heading"><h2>部署別比較</h2><div className="dashboard-controls"><label>部署の対象期間<select value={departmentPeriod} onChange={event => setDepartmentPeriod(event.target.value === "annual" ? "annual" : Number(event.target.value) as DashboardPeriod)}><option value="annual">年間</option>{initiativeMonths.map(month => <option key={month} value={month}>{month}月</option>)}</select></label></div></div>
      <div className="dashboard-legend"><span className="dashboard-prior">{priorName}</span>{selected.map((kind, index) => <span className={`dashboard-series-${index}`} key={kind}>{kindName(kind)}</span>)}<span>金額：千円</span></div>
      <div className="dashboard-department dashboard-department-header" aria-hidden="true"><span>部署</span><span>売上 / 前年増減</span><span>利益 / 前年増減</span><span>利益率 / 前年差</span></div>
      {dashboard.departments.map(department => {
        const prior = dashboardAmounts(department.previous, departmentPeriod);
        return <div className="dashboard-department" key={department.id ?? "unassigned"}>
          <div className="dashboard-department-name">{department.id === null ? department.name : <button className="initiative-name-button" disabled={disabled} onClick={() => onDepartment(department.id!)}>{department.name}</button>}</div>
          {metrics.map(metric => {
            const maximum = Math.max(1, ...dashboard.departments.flatMap(item => item.budgets.map(value => Math.abs(dashboardAmounts(value.months, departmentPeriod)[metric.id]))));
            return <div key={metric.id} className="dashboard-department-metric"><span className="dashboard-mobile-label">{metric.name}</span>{department.budgets.map((entry, index) => {
              const amount = dashboardAmounts(entry.months, departmentPeriod)[metric.id];
              return <div key={entry.kind} className={`dashboard-department-kind dashboard-series-${index}`}>
                <span className="dashboard-series-label">{kindName(entry.kind)}</span>
                {department.id === null ? <span>{formatYen(amount)}</span> : <button className="dashboard-number" disabled={disabled} aria-label={`${department.name} ${kindName(entry.kind)} ${metric.name} ${formatYen(amount)}の総原価表`} onClick={() => onDepartment(department.id!)}>{formatYen(amount)}</button>}
                <div className={`dashboard-bar ${amount < 0 ? "dashboard-bar-negative" : ""}`} style={{ width: `${Math.abs(amount) / maximum * 100}%` }} />
                <span className="dashboard-delta">{growth(amount, prior[metric.id])}</span>
              </div>;
            })}</div>;
          })}
          <div className="dashboard-department-metric"><span className="dashboard-mobile-label">利益率 / 前年差</span>{department.budgets.map((entry, index) => {
            const value = dashboardAmounts(entry.months, departmentPeriod).margin;
            const maximum = Math.max(1, ...dashboard.departments.flatMap(item => item.budgets.map(value => Math.abs(dashboardAmounts(value.months, departmentPeriod).margin ?? 0))));
            return <div key={entry.kind} className={`dashboard-department-kind dashboard-series-${index}`}><span className="dashboard-series-label">{kindName(entry.kind)}</span><span>{rate(value)}</span>
              {value !== undefined && <div className="dashboard-margin-track"><span style={{ left: `${50 + value / maximum * 46}%` }} /></div>}
              <span className="dashboard-delta">{rate(value === undefined || prior.margin === undefined ? undefined : value - prior.margin, true)}</span></div>;
          })}</div>
        </div>;
      })}
      {!dashboard.departments.length && <p className="dashboard-empty">部署は登録されていません。</p>}
    </section>
    <section className="dashboard-panel dashboard-impact"><div className="dashboard-panel-heading"><h2>施策の影響</h2><div className="dashboard-controls">
      <label>対象期間<select value={period} onChange={event => setPeriod(event.target.value === "annual" ? "annual" : Number(event.target.value) as DashboardPeriod)}><option value="annual">年間</option>{initiativeMonths.map(month => <option key={month} value={month}>{month}月</option>)}</select></label>
      {selected.length > 1 && <label>並び順の基準<select value={rankKind} onChange={event => setRanking(Number(event.target.value) as KindId)}>{selected.map(kind => <option key={kind} value={kind}>{kindName(kind)}</option>)}</select></label>}
    </div></div>
      <div className="dashboard-pair">{metrics.map(metric => <div key={metric.id}><h3>{metric.name}への影響</h3>{(["increase", "decrease"] as const).map(direction => <Ranking key={`${metric.id}:${direction}:${rankKind}:${period}`} dashboard={dashboard} metric={metric.id} kind={rankKind} period={period} direction={direction} kindName={kindName} disabled={disabled} onOpen={onInitiative} />)}</div>)}</div>
    </section>
    <DashboardAnalysis contents={contents} selected={selected} />
  </>;
}

function Ranking({ dashboard, metric, kind, period, direction, kindName, disabled, onOpen }: { dashboard: Dashboard; metric: DashboardMetric; kind: KindId; period: DashboardPeriod; direction: "increase" | "decrease"; kindName: (kind: KindId) => string; disabled: boolean; onOpen: Props["onInitiative"] }) {
  const ranks = useMemo(() => rankDashboardInitiatives(dashboard, kind, period, metric, direction), [dashboard, kind, period, metric, direction]);
  const [expanded, setExpanded] = useState(false);
  const maximum = Math.max(1, ...ranks.flatMap(item => item.values.map(value => Math.abs(value.amount))));
  return <section className="dashboard-ranking" aria-label={`${metric === "sales" ? "売上" : "利益"}を${direction === "increase" ? "増やす" : "減らす"}施策`}>
    <h4>{direction === "increase" ? "増加" : "減少"}</h4>
    {(expanded ? ranks : ranks.slice(0, 5)).map(item => <div key={item.initiative.id} className="dashboard-rank">
      <button className="initiative-name-button" disabled={disabled} onClick={() => onOpen(item.initiative, kind)}>{item.initiative.name}</button>
      {item.values.map((value, index) => <div key={value.kind} className={`dashboard-rank-value dashboard-series-${index}`}><span className="dashboard-series-label">{kindName(value.kind)}</span><span>{signedAmount(value.amount)}</span><div className={`dashboard-bar ${value.amount < 0 ? "dashboard-bar-negative" : ""}`} style={{ width: `${Math.abs(value.amount) / maximum * 100}%` }} /></div>)}
    </div>)}
    {!ranks.length && <p className="dashboard-empty">該当する施策はありません。</p>}
    {ranks.length > 5 && <button className="dashboard-more" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? "上位5件に戻す" : `全${ranks.length}件を表示`}</button>}
  </section>;
}

function MonthlyChart({ series, metric, priorName, kindName }: { series: DashboardSeries; metric: DashboardMetric; priorName: string; kindName: (id: KindId) => string }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  useLayoutEffect(() => { const observer = new ResizeObserver(([entry]) => { if (entry && entry.contentRect.width > 0) setWidth(entry.contentRect.width); }); if (container.current) observer.observe(container.current); return () => observer.disconnect(); }, []);
  const values = [{ name: priorName, months: series.previous, className: "dashboard-prior" }, ...series.budgets.map((entry, index) => ({ name: kindName(entry.kind), months: entry.months, className: `dashboard-series-${index}` }))];
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
