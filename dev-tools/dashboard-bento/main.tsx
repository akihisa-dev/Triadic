import { createRoot } from "react-dom/client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { DashboardPage } from "../../Triadic-extension/src/extension/DashboardPage";
import { ComparisonSelection } from "../../Triadic-extension/src/extension/ComparisonSelection";
import { SidebarIcon } from "../../Triadic-extension/src/extension/SidebarIcon";
import { WindowViewContext } from "../../Triadic-extension/src/extension/windowView";
import type { WindowViewValues } from "../../Triadic-extension/src/extension/windowViewState";
import { buildDashboard, dashboardAmounts, type DashboardPeriod } from "../../Triadic-extension/src/core/tables/dashboard";
import { initiativeMonths } from "../../Triadic-extension/src/core/domain/calendar";
import type { Initiative } from "../../Triadic-extension/src/core/domain/plan";
import type { BudgetPrevious, KindId } from "../../Triadic-extension/src/core/domain/kinds";
import { formatYen } from "../../Triadic-extension/src/core/domain/amounts";
import { readPlanContents } from "../../Triadic-extension/src/core/storage/readPlan";
import "../../Triadic-extension/src/extension/ExtensionPage.css";
import "./preview.css";

if (!import.meta.env.DEV) throw new Error("開発サーバー専用です。");
const sample = await fetch("/samples/2027年度サンプル予算.triadic");
if (!sample.ok) throw new Error("サンプル予算を読み込めません。npm run samples:generate を実行してください。");
const contents = await readPlanContents(new Uint8Array(await sample.arrayBuffer()));
type Detail = { name: string; rows: { month: number; kind: KindId; sales: number; profit: number }[] };

function App() {
  const [selected, setSelected] = useState<KindId[]>([1]);
  const [previous, setPrevious] = useState<BudgetPrevious>({ 1: 1, 2: 1 });
  const [period, setPeriod] = useState<DashboardPeriod>("annual");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [dark, setDark] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const view = useRef<WindowViewValues>({});
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const data = useMemo(() => buildDashboard({ ...contents, budgetPrevious: previous }, selected), [previous, selected]);
  const visible = open || pinned;
  const periodName = period === "annual" ? "年間" : `${period}月`;
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);
  useEffect(() => {
    const reset = () => setOffset({ x: 0, y: 0 });
    window.addEventListener("resize", reset); return () => window.removeEventListener("resize", reset);
  }, []);
  useLayoutEffect(() => {
    const elements = [...root.current!.querySelectorAll<HTMLElement>(".dashboard-stat, .dashboard-panel, .dashboard-analysis-section")];
    for (const title of root.current!.querySelectorAll("svg > title")) title.textContent = (title.textContent ?? "").replace("各項目の数値は下の「数値を表示」で確認できます。", "");
    for (const paragraph of root.current!.querySelectorAll(".dashboard-empty")) if (paragraph.textContent?.includes("金額は「数値を表示」で確認できます。")) paragraph.textContent = paragraph.textContent.replace("金額は「数値を表示」で確認できます。", "");
    elements.forEach(element => {
      element.classList.add("bento-card");
      for (const button of element.querySelectorAll<HTMLButtonElement>(".dashboard-department button")) button.disabled = true;
      if (element.classList.contains("dashboard-comparison")) element.id = "preview-comparison";
      if (element.classList.contains("dashboard-impact")) element.id = "preview-impact";
    });
  }, [period, selected, previous]);
  useEffect(() => {
    if (detail) dialog.current?.showModal();
    else dialog.current?.close();
  }, [detail]);
  useEffect(() => {
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const bar of root.current!.querySelectorAll(".dashboard-bar")) bar.animate([{ transform: "scaleX(.05)", transformOrigin: "left" }, { transform: "scaleX(1)", transformOrigin: "left" }], { duration: 650, easing: "cubic-bezier(.16,1,.3,1)" });
    }
  }, [period, selected, previous]);
  function choosePeriod(next: DashboardPeriod) {
    view.current["dashboard:period"] = next;
    view.current["dashboard:department-period"] = next;
    setPeriod(next);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current || !panel.current) return;
    const bounds = panel.current.getBoundingClientRect();
    const x = drag.current.ox + event.clientX - drag.current.x;
    const y = drag.current.oy + event.clientY - drag.current.y;
    setOffset({ x: Math.min(8, Math.max(-(innerWidth - bounds.width - 32), x)), y: Math.min(8, Math.max(-(innerHeight - bounds.height - 32), y)) });
  }
  function showInitiative(initiative: Initiative, kind: KindId) {
    const item = data.initiatives.find(entry => entry.kind === kind)?.items.find(item => item.id === initiative.id);
    if (item) setDetail({ name: `${initiative.name} · 月別増減`, rows: initiativeMonths.map(month => ({ month, kind, ...dashboardAmounts(item.months, month) })) });
  }
  const changeSelection = (kinds: KindId[], baselines: BudgetPrevious) => { setSelected(kinds); setPrevious(baselines); };
  const label = `${periodName} · ${selected.map(kind => kind === 1 ? "一次予算" : "確定予算").join("・")}`;
  return <>
    <header className="preview-header"><div className="preview-brand"><img src="/branding/logo-512.png" alt="" /><strong>Triadic</strong><span>2027年度</span></div>
      <span className="preview-draft">ダッシュボードの確認案</span>
      <button onClick={() => setDark(value => !value)}>{dark ? "ライト" : "ダーク"}</button></header>
    <aside className="preview-rail" aria-label="画面内の移動"><a href="#dashboard-title" aria-label="ダッシュボード"><SidebarIcon name="cost" /></a><a href="#preview-comparison" aria-label="部署別比較"><SidebarIcon name="expansion" /></a><a href="#preview-impact" aria-label="施策の影響"><SidebarIcon name="list" /></a><a href="/dev-tools/index.html" aria-label="開発ツール一覧"><SidebarIcon name="home" /></a></aside>
    <div className="bento-preview" ref={root} onClick={event => {
      const target = event.target as Element;
      if (target.closest("button, input, select, a, summary")) return;
      target.closest(".dashboard-rank")?.querySelector<HTMLButtonElement>(".initiative-name-button")?.click();
    }}>
      <WindowViewContext value={view.current}><DashboardPage key={period} contents={contents} selected={selected} previous={previous} disabled={false} onSelection={changeSelection}
        onDepartment={() => {}} onInitiative={showInitiative} /></WindowViewContext>
    </div>
    <aside ref={panel} className={`floating-controls ${visible ? "is-open" : ""}`} style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }} aria-label="表示条件" onMouseEnter={() => setOpen(true)} onMouseLeave={() => { if (!panel.current?.contains(document.activeElement)) setOpen(false); }} onFocus={() => setOpen(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }} onKeyDown={event => { if (event.key === "Escape") { trigger.current?.focus(); setPinned(false); setOpen(false); } }}>
      {visible && <div className="floating-body"><ComparisonSelection selected={selected} previous={previous} onChange={changeSelection} />
        <div className="period-buttons" role="group" aria-label="対象期間">{(["annual", ...initiativeMonths] as const).map(month => <button key={month} aria-pressed={period === month} onClick={() => choosePeriod(month)}>{month === "annual" ? "年間" : `${month}月`}</button>)}</div>
        <p>月の選択は部署別比較・施策の影響に反映</p>
      </div>}
      {period !== "annual" && <div className="floating-active"><button onClick={() => choosePeriod("annual")}>年間に戻す</button></div>}
      <div className="floating-head"><button className="drag-handle" aria-label="表示条件パネルを移動" onPointerDown={event => { drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onKeyDown={event => {
        const step = event.shiftKey ? 40 : 10;
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); setOffset(value => ({ x: Math.min(8, Math.max(-(innerWidth - 360), value.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0))), y: Math.min(8, Math.max(-(innerHeight - 400), value.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0))) })); }
      }}>移動</button><button ref={trigger} className="floating-trigger" aria-expanded={visible} onClick={() => { const next = !pinned; setPinned(next); setOpen(next); }}>表示条件 <span>{label}</span></button><button className="pin-control" aria-pressed={pinned} onClick={() => setPinned(value => !value)}>{pinned ? "固定中" : "固定"}</button></div>

    </aside>
    <dialog ref={dialog} className="preview-detail" onCancel={() => setDetail(null)} onClick={event => { if (event.target === event.currentTarget) setDetail(null); }}><div className="preview-detail-heading"><h2>{detail?.name}</h2><button onClick={() => setDetail(null)}>閉じる</button></div><p>金額：千円</p><table><thead><tr><th>月</th><th>種別</th><th>売上</th><th>利益</th></tr></thead><tbody>{detail?.rows.map(row => <tr key={`${row.month}:${row.kind}`}><th>{row.month}月</th><td>{row.kind === 1 ? "一次予算" : "確定予算"}</td><td>{formatYen(row.sales)}</td><td>{formatYen(row.profit)}</td></tr>)}</tbody></table></dialog>
  </>;
}
createRoot(document.getElementById("root")!).render(<App />);
