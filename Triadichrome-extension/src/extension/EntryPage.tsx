import { version as appVersion } from "../../../package.json";
import appIcon from "../../../branding/logo-512.png?no-inline";
import { FiscalYearSlot } from "./FiscalYearSlot";
import { FadeSwap } from "./FadeSwap";
import { StatusNotice } from "./StatusNotice";
import type { FileEntry } from "./useFileEntry";

export function EntryPage({ entry }: { entry: FileEntry }) {
  const { dragging, drag, leave, drop, recentFile, isBusy, recentLoading, forget, resume, choose, newFiscalYear, setNewFiscalYear, create, recentNotice, error, setError } = entry;
  return <main className={`entry-page${dragging ? " is-drag-active" : ""}`} onDragEnter={drag} onDragOver={drag}
    onDragLeave={leave}
    onDrop={drop}>

    <div className="entry-content">
      <header className="entry-brand">
        <img className="entry-logo" src={appIcon} width="40" height="40" alt="" draggable={false} />
        <h1 className="entry-title">Triadichrome</h1>
        <span className="app-version" aria-label={`バージョン ${appVersion}`}>v{appVersion}</span>
      </header>
      <section className="entry-drop-zone" aria-label="ファイルを開く・新規作成">
        <div className={`entry-resume${recentFile ? " has-recent" : ""}`}>
          <div className="entry-recent-heading">
            <span className="entry-recent-label">前回の計画</span>
            <button className="entry-forget-button" type="button" disabled={isBusy || recentLoading || !recentFile}
              onClick={forget}>履歴を消す</button>
          </div>
          <div className="entry-recent-row">
            <svg className="entry-file-icon" width="40" height="48" viewBox="0 0 32 40" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true"><path d="M7 2h12l8 8v27H7zM19 2v9h8M12 20h10M12 25h10M12 30h6" /></svg>
            <p id="recent-file-name" className="entry-recent-name" title={recentFile?.name}>
              {recentLoading ? "確認中…" : recentFile?.name ?? "まだ開いていません"}
            </p>
            <button className="entry-open-button entry-resume-button" type="button" disabled={isBusy || recentLoading || !recentFile}
              aria-describedby="recent-file-name" onClick={resume}>続きから<span aria-hidden="true">↗</span></button>
          </div>
        </div>
        <div className="entry-options">
          <div className="entry-open-section">
            <svg className="entry-option-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11H3z" /><path d="M3 10h18" /></svg>
            <h2 className="entry-drop-title" aria-live="polite"><FadeSwap value={dragging} className="motion-text">{active => active ? "ここにドロップして開く" : "ファイルを開く"}</FadeSwap></h2>
            <p className="entry-drop-description">.triadicファイルをここにドロップ</p>
            <button className="entry-new-button" type="button" disabled={isBusy} onClick={choose}>ファイルを開く<span aria-hidden="true">→</span></button>
          </div>
          <div className="entry-create-section">
            <svg className="entry-option-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 14h6m-3-3v6" /></svg>
            <h2 className="entry-section-title">新しい計画</h2>
            <FiscalYearSlot value={Number(newFiscalYear)} onChange={year => setNewFiscalYear(String(year))} disabled={isBusy} />
            <button className="entry-new-button" type="button" disabled={isBusy} onClick={create}>新規作成<span aria-hidden="true">＋</span></button>
          </div>
        </div>
      </section>
      {recentNotice && <p className="entry-recent-notice" role="status">{recentNotice}</p>}
      <StatusNotice message={error} error onDismiss={() => setError("")} />
    </div>
  </main>;
}
