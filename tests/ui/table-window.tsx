import { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { MeasuredTableBody } from '../../Triadic-extension/src/extension/MeasuredTableBody';
if (!import.meta.env.DEV) throw new Error('開発用の表示確認です。');
const rows = Array.from({ length: 67320 }, (_, index) => ({ id: index, name: `確認行${index + 1}${index % 7 === 0 ? '・折り返して名称全体を表示する長い科目名'.repeat(3) : ''}` }));
function Example() {
  const container = useRef<HTMLDivElement>(null);
  return <main><h1>大量行の描画確認 · 67320件</h1><div ref={container} style={{ overflow: 'auto', height: 400, maxWidth: 600 }}>
    <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}><thead style={{ position: 'sticky', top: 0, background: 'white' }}><tr><th>名称</th><th>操作</th></tr></thead>
      <MeasuredTableBody rows={rows} container={container} columns={2} render={row => <tr><td style={{ padding: 6, border: '1px solid #ccc', overflowWrap: 'anywhere' }}>{row.name}</td><td><button onClick={() => {}}>行{row.id + 1}を選択</button></td></tr>} rowKey={row => row.id} />
    </table></div></main>;
}
createRoot(document.getElementById('root')!).render(<Example />);
