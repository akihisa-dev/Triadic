import type { KindId } from "../core/domain/kinds";
import { version } from "../../../package.json";
import "./WorkSelectionPage.css";

export function WorkSelectionHeader({ fiscalYear, onClose, disabled }: { fiscalYear: number; onClose: () => void; disabled: boolean }) {
  return <header className="work-selection-header">
    <span className="work-selection-brand">Triadic <span className="app-version">v{version}</span></span>
    <span>{fiscalYear}年度</span>
    <button className="text-button work-selection-close" type="button" disabled={disabled} onClick={onClose}>閉じる</button>
  </header>;
}

const choices = [
  { name: "一次予算", kind: 1, path: "m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5" },
  { name: "確定予算", kind: 2, path: "m3 12 4 4L17 6m-6 10 3 3L24 9" },
  { name: "見通し・実績", kind: null, path: "M3 3v18h18M7 15l4-5 4 3 6-8" },
  { name: "修正予算", kind: null, path: "M4 3v7m0 4v7M12 3v12m0 4v2M20 3v2m0 4v12M1 10h6m2 5h6m2-10h6" },
] as const;

export function WorkSelectionPage({ disabled, onSelect }: { disabled: boolean; onSelect: (kind: KindId) => void }) {
  return <main className="work-selection-page" aria-label="作業を選択">
    {choices.map(choice => <button key={choice.name} type="button" className="work-selection-gate"
      disabled={disabled || choice.kind === null} aria-label={choice.name}
      aria-describedby={choice.kind === null ? `work-unavailable-${choice.name}` : undefined}
      onClick={() => { if (choice.kind !== null) onSelect(choice.kind); }}>
      <span className="work-selection-top">
        <span className="work-selection-status" id={`work-unavailable-${choice.name}`}>{choice.kind === null ? "未実装" : ""}</span>
        {choice.kind !== null && <span className="work-selection-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 18 18 6M6 6h12v12" /></svg>
        </span>}
      </span>
      <span className="work-selection-name">{choice.name}</span>
      <svg className="work-selection-symbol" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={choice.path} /></svg>
    </button>)}
  </main>;
}
