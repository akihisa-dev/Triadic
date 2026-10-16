import { createRoot } from "react-dom/client";
import { DataHistoryPage } from "../../Triadichrome-extension/src/extension/DataHistoryPage";
import "../../Triadichrome-extension/src/extension/ExtensionPage.css";

createRoot(document.getElementById("root")!).render(<DataHistoryPage
  entries={[1, 2, 3].map(id => ({ id, recordedAt: `2026-01-0${id}T00:00:00.000Z` }))}
  busy={false} error=""
  onPreview={async () => { throw new Error("テスト用の閲覧失敗"); }}
  onDelete={async () => { throw new Error("テスト用の削除失敗"); }}
  onPrepareSave={async () => {}}
  onRetry={async () => {}}
/>);
