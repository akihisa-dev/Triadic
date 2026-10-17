import { createRoot } from "react-dom/client";
import { useState } from "react";
import { HistoryDifferenceDialog } from "../../Triadichrome-extension/src/extension/HistoryDifferenceDialog";
import type { HistoryDifference } from "../../Triadichrome-extension/src/core/domain/historyDifference";
import "../../Triadichrome-extension/src/extension/ExtensionPage.css";

const differences: HistoryDifference[] = Array.from({ length: 125 }, (_, index) => ({
  section: index < 100 ? "施策の月別金額" : "施策", subject: `確認施策${index + 1}`, change: index % 3 === 0 ? "追加" : index % 3 === 1 ? "削除" : "変更",
  field: index < 100 ? "一次予算・4月" : "備考", before: "0.001", after: index === 124 ? "<img src=x onerror=alert(1)> & 日本語" : "0.002",
}));
function Preview() {
  const [open, setOpen] = useState(true);
  return <><button type="button" onClick={() => setOpen(true)}>差分を開く</button>{open && <HistoryDifferenceDialog date="2026/05/01 09:00:00.000" differences={differences} onClose={() => setOpen(false)} />}</>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
