import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CostBreakdownDialog } from '../../Triadichrome-extension/src/extension/CostBreakdownDialog';
import { readPlanContents } from '../../Triadichrome-extension/src/core/storage/readPlan';
import { tablePeriods } from '../../Triadichrome-extension/src/core/tables/periodTables';
import { createSamplePlan } from './sample-plan';
import '../../Triadichrome-extension/src/extension/ExtensionPage.css';
if (!import.meta.env.DEV) throw new Error('開発専用です。');
const seed = await readPlanContents(await createSamplePlan());
const account = seed.accounts.find(item => item.accountName === '売上高')!;
const contents = { ...seed, previousAmounts: [], initiatives: Array.from({ length: 5000 }, (_, index) => ({ ...seed.initiatives[0]!, id: index + 1,
  name: `確認施策${index + 1}${index % 7 === 0 ? '・折り返す長い名称'.repeat(5) : ''}`,
  rows: [{ accountId: account.id, amounts: { 4: '1', 5: '-1' } }] })) };
function Example() {
  const [plan, setPlan] = useState(contents), [open, setOpen] = useState(false), [selected, setSelected] = useState<number | null>(null);
  return <main style={{ padding: 20 }}><h1>5000施策の内訳確認</h1><button onClick={() => setOpen(true)}>内訳を開く</button>
    <button onClick={() => setPlan(current => ({ ...current, initiatives: [{ ...current.initiatives[0]!, rows: [{ accountId: account.id, amounts: { 4: '2', 5: '-1' } }] }, ...current.initiatives.slice(1)] }))}>金額を更新</button>
    {selected !== null && <section><output data-testid="selected">{selected}</output><button onClick={() => setSelected(null)}>戻る</button></section>}
    {open && <CostBreakdownDialog contents={plan} selected={[1]} target={{ kind: 'account', id: account.id, column: 1, period: tablePeriods.find(item => item.id === 'annual')! }} title="売上高 年間計 一次予算" navigationBlocked={false} onClose={() => setOpen(false)} onOpenInitiative={item => setSelected(item.id)} />}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Example />);
