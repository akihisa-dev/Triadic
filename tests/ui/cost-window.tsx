import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CostTablePage, type CostTableView } from '../../Triadichrome-extension/src/extension/CostTablePage';
import { readPlanContents } from '../../Triadichrome-extension/src/core/storage/readPlan';
import { createSamplePlan } from './sample-plan';
import '../../Triadichrome-extension/src/extension/ExtensionPage.css';
if (!import.meta.env.DEV) throw new Error('開発専用です。');
const seed = await readPlanContents(await createSamplePlan());
const rank = Math.max(...seed.accounts.map(item => item.masterOrder ?? 0), ...seed.aggregations.map(item => item.masterOrder ?? 0));
const extras = Array.from({ length: 600 - seed.accounts.length }, (_, index) => {
  const name = `確認科目${seed.accounts.length + index + 1}`;
  return { ...seed.accounts[0]!, id: 10000 + index, accountCode: String(10000 + index), accountName: name,
    displayName: name + (index % 19 === 0 ? '・折り返す長い名称'.repeat(3) : ''), masterOrder: rank + index + 1, inUse: true };
});
const lateSales = new URLSearchParams(location.search).has('late-sales');
const contents = { ...seed, accounts: [...seed.accounts, ...extras],
  aggregations: seed.aggregations.map(group => lateSales && group.required === 'sales' ? { ...group, masterOrder: rank + extras.length + 100 } : group),
  previousAmounts: [...seed.previousAmounts, ...extras.map((account, index) => ({ id: 1000000 + index, accountId: account.id, previousKind: 1 as const,
    industryId: seed.industries[0]!.id, departmentId: seed.departments[0]!.id, month: 4, amount: '1', revision: 0 }))] };
function Example() {
  const [generation, setGeneration] = useState(0);
  const view = useRef<CostTableView>({ industries: [], departments: [], top: 0, left: 0 });
  return <><header style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8 }}><h1 style={{ fontSize: 14 }}>600科目</h1>
    <button onClick={() => { view.current = structuredClone(view.current); setGeneration(value => value + 1); }}>表示を作り直す</button><output data-testid="generation">{generation}</output></header>
    <div style={{ height: 'calc(100dvh - 44px)' }}><CostTablePage key={generation} contents={contents} selected={[1,2]} selection={<span>一次・確定予算</span>} view={view} navigationBlocked={false} onOpenInitiative={() => {}} /></div></>;
}
createRoot(document.getElementById('root')!).render(<Example />);
