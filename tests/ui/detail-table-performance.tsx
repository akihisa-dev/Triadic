import { Profiler, useState } from "react";
import { createRoot } from "react-dom/client";
import { DetailTablePart } from "../../Triadichrome-extension/src/extension/DetailTablePart";
import "../../Triadichrome-extension/src/extension/styles/base.css";

declare global {
  interface Window { detailTableMeasurement: { phase: string; renders: { phase: string; duration: number }[]; cells: string[][] } }
}
if (!import.meta.env.DEV) throw new Error("明細テーブルの性能確認は開発サーバー専用です。");
window.detailTableMeasurement = { phase: "initial", renders: [], cells: [] };
const horizontal = new URLSearchParams(location.search).get("direction") !== "vertical";
function Harness() {
  const [cells, setCells] = useState(() => Array.from({ length: 2000 }, (_, i) => Array.from({ length: 13 }, (_, c) => `${i}:${c}`)));
  const [editing, setEditing] = useState(false);
  window.detailTableMeasurement.cells = cells;
  return <><h1>明細テーブル性能確認</h1><div style={{ height: 360, width: 1240, maxWidth: "100%" }}>
    <Profiler id="detail-table" onRender={(_id, _phase, duration) => {
      window.detailTableMeasurement.renders.push({ phase: window.detailTableMeasurement.phase, duration });
    }}><DetailTablePart cells={cells} horizontal={horizontal} disabled={false} index={0} editing={editing} onEditingChange={setEditing} onChange={setCells} /></Profiler>
  </div><button type="button">外側へ移動</button></>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
