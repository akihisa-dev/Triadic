import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DataHistoryPage } from '../../Triadic-extension/src/extension/DataHistoryPage';
import '../../Triadic-extension/src/extension/ExtensionPage.css';
if (!import.meta.env.DEV) throw new Error('開発専用です。');
function Example() {
  const [entries, setEntries] = useState(() => Array.from({ length: 10000 }, (_, index) => ({ id: index + 1, recordedAt: new Date(new Date(2026, 3, 1).getTime() + index * 300000).toISOString() })).reverse());
  return <div style={{ height: '100dvh', overflow: 'hidden' }}><output data-testid="count" style={{ position: 'fixed', right: 4, bottom: 4 }}>{entries.length}</output>
    <DataHistoryPage entries={entries} busy={false} error="" onPreview={async () => {}} onCompare={async () => ({ differences: [], impact: [] })}
      onDelete={async deletion => { const ids = 'ids' in deletion ? new Set(deletion.ids) : null; setEntries(current => 'ids' in deletion ? current.filter(entry => !ids!.has(entry.id)) : current.filter(entry => entry.recordedAt >= deletion.before)); }}
      onRetry={async () => {}} onPrepareSave={async () => {}} /></div>;
}
createRoot(document.getElementById('root')!).render(<Example />);
