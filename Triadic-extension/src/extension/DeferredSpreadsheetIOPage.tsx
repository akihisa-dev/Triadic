import { useEffect, useState } from "react";
import type { SpreadsheetIOProps } from "./SpreadsheetIOPage";
type SpreadsheetModule = typeof import("./SpreadsheetIOPage");
let loaded: SpreadsheetModule | undefined;
let pending: Promise<SpreadsheetModule> | undefined;
function loadSpreadsheet() {
  return pending ??= import("./SpreadsheetIOPage").then(module => { loaded = module; return module; }).catch(error => { pending = undefined; throw error; });
}
/** Begin after the user selects IO, overlapping its loading with the outgoing fade. */
export function preloadSpreadsheetIO() { void loadSpreadsheet().catch(() => {}); }
/** Excel code is requested only after IO is selected. Loading never changes the plan. */
export function DeferredSpreadsheetIOPage(props: SpreadsheetIOProps) {
  const [module, setModule] = useState(loaded);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (module) return;
    let active = true;
    setError(false);
    void loadSpreadsheet().then(value => { if (active) setModule(value); }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [module]);
  if (module) return <module.SpreadsheetIOPage {...props} />;
  return <main className="page-content" aria-label="入出力">
    <h1>入出力</h1>
    {error ? <>
      <p role="alert">入出力画面を読み込めませんでした。保存済みのデータは保持しています。画面を再読み込みしてお試しください。</p>
      <button type="button" className="secondary-button" onClick={() => window.location.reload()}>画面を再読み込み</button>
    </> : <p role="status">読み込み中…</p>}
  </main>;
}
