import { createRoot } from "react-dom/client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DashboardPage } from "../../Triadic-extension/src/extension/DashboardPage";
import { SidebarIcon } from "../../Triadic-extension/src/extension/SidebarIcon";
import { WindowViewContext } from "../../Triadic-extension/src/extension/windowView";
import type { WindowViewValues } from "../../Triadic-extension/src/extension/windowViewState";
import { buildDashboard, dashboardAmounts } from "../../Triadic-extension/src/core/tables/dashboard";
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
  const [detail, setDetail] = useState<Detail | null>(null);
  const [dark, setDark] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const detailTitleId = useId();
  const view = useRef<WindowViewValues>({});
  const data = useMemo(() => buildDashboard({ ...contents, budgetPrevious: previous }, selected), [previous, selected]);
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);
  useEffect(() => { if (detail) dialog.current?.showModal(); else dialog.current?.close(); }, [detail]);
  function showInitiative(initiative: Initiative, kind: KindId) {
    const item = data.initiatives.find(entry => entry.kind === kind)?.items.find(item => item.id === initiative.id);
    if (item) setDetail({ name: `${initiative.name} · 月別増減`, rows: initiativeMonths.map(month => ({ month, kind, ...dashboardAmounts(item.months, month) })) });
  }
  const changeSelection = (kinds: KindId[], baselines: BudgetPrevious) => { setSelected(kinds); setPrevious(baselines); };
  return <>
    <header className="preview-header"><div className="preview-brand"><img src="/branding/logo-512.png" alt="" /><strong>Triadic</strong><span>2027年度</span></div>
      <span className="preview-draft">ダッシュボードの確認案</span>
      <button onClick={() => setDark(value => !value)}>{dark ? "ライト" : "ダーク"}</button></header>
    <aside className="preview-rail" aria-label="画面内の移動"><a href="#dashboard-title" aria-label="ダッシュボード"><SidebarIcon name="cost" /></a><a href="#preview-comparison" aria-label="部署別比較"><SidebarIcon name="expansion" /></a><a href="#preview-impact" aria-label="施策の影響"><SidebarIcon name="list" /></a><a href="/dev-tools/index.html" aria-label="開発ツール一覧"><SidebarIcon name="home" /></a></aside>
    <div className="bento-preview">
      <WindowViewContext value={view.current}><DashboardPage contents={contents} selected={selected} previous={previous} disabled={false} onSelection={changeSelection}
        onDepartment={() => {}} onInitiative={showInitiative} /></WindowViewContext>
    </div>
    <dialog ref={dialog} aria-labelledby={detailTitleId} className="preview-detail" onCancel={() => setDetail(null)} onClick={event => { if (event.target === event.currentTarget) setDetail(null); }}><div className="preview-detail-heading"><h2 id={detailTitleId}>{detail?.name}</h2><button onClick={() => setDetail(null)}>閉じる</button></div><p>金額：千円</p><table><thead><tr><th>月</th><th>種別</th><th>売上</th><th>利益</th></tr></thead><tbody>{detail?.rows.map(row => <tr key={`${row.month}:${row.kind}`}><th>{row.month}月</th><td>{row.kind === 1 ? "一次予算" : "確定予算"}</td><td>{formatYen(row.sales)}</td><td>{formatYen(row.profit)}</td></tr>)}</tbody></table></dialog>
  </>;
}
createRoot(document.getElementById("root")!).render(<App />);
