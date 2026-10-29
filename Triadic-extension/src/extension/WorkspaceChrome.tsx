import { ThemeSwitch } from "./ThemeSwitch";
import { pageMetadata } from "./pageMetadata";
import { version as appVersion } from "../../../package.json";
import appIcon from "../../../branding/logo-512.png?no-inline";
import { SidebarIcon } from "./SidebarIcon";
import { InitiativeSearch } from "./InitiativeSearch";
import { historyDate } from "./DataHistoryPage";
import type { HomeWorkspace } from "./useHomeWorkspace";
import type { useWindowWorkspace } from "./useWindowWorkspace";

export function WorkspaceHeader({ workspace, windows }: { workspace: HomeWorkspace; windows: ReturnType<typeof useWindowWorkspace> }) {
  const {
    menuButton, isSidebarOpen, closeSidebar, sidebar, contents, navigationBlocked,
    screens, dismissNotice, requestNavigation, operationBlocked, canUndo, canRedo,
    travelOperation, fileName, preview, returnToCurrent, setRestoreError,
    setRestoreRequested
  } = workspace;
  return (
      <header className="home-header">
        <button
          ref={menuButton}
          className="home-icon-button"
          type="button"
          aria-label={isSidebarOpen ? "サイドバーを閉じる" : "サイドバーを開く"}
          aria-controls="home-sidebar"
          aria-expanded={isSidebarOpen}
          onClick={() => isSidebarOpen ? closeSidebar() : sidebar.pin()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="home-identity">
          <span className="home-brand">
            <img src={appIcon} width="28" height="28" alt="" draggable={false} />
            Triadic
            <span className="app-version" aria-label={`バージョン ${appVersion}`}>v{appVersion}</span>
          </span>
          <output className="home-fiscal-year" aria-label="基準年度">{contents.fiscalYear}年度</output>
          <span aria-label="予算フェーズ">{workspace.phase === 1 ? "一次予算" : "確定予算"}</span>
        </div>
        <nav className="screen-history" aria-label="画面の移動履歴">
          {([-1, 1] as const).map(direction => {
            const label = direction === -1 ? "前の画面に戻る" : "次の画面に進む";
            return <button key={direction} className="home-icon-button" type="button" aria-label={label} title={label}
              disabled={navigationBlocked || (direction === -1 ? !screens.canBack : !screens.canForward)}
              onClick={() => {
                if (navigationBlocked) return;
                dismissNotice();
                requestNavigation(screens.destination(direction), () => screens.travel(direction));
              }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={direction === -1 ? "M19 12H5m6-6-6 6 6 6" : "M5 12h14m-6-6 6 6-6 6"} />
              </svg>
            </button>;
          })}
        </nav>
        <nav className="operation-history" aria-label="操作の取り消し・やり直し">
          {([-1, 1] as const).map(direction => {
            const label = direction === -1 ? "操作を取り消す" : "操作をやり直す";
            return <button key={direction} className="home-icon-button" type="button" aria-label={label}
              title={label}
              disabled={operationBlocked || (direction === -1 ? !canUndo : !canRedo)} onClick={() => { void travelOperation(direction); }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={direction === -1 ? "M9 5 4 10l5 5M4 10h9a6 6 0 0 1 0 12" : "m15 5 5 5-5 5m5-5h-9a6 6 0 0 0 0 12"} />
              </svg>
            </button>;
          })}
        </nav>
        <InitiativeSearch initiatives={contents.initiatives} masters={contents} disabled={workspace.searchBlocked || workspace.discardRequest !== null || workspace.restoreRequested} onOpen={workspace.openInitiative} />
        <button className="home-icon-button" type="button" aria-label="ウィンドウを複製" title="ウィンドウを複製"
          disabled={navigationBlocked || preview !== null || workspace.screen.page === "data-history"} onClick={windows.duplicate}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M16 8V4H4v12h4" /></svg>
        </button>
        <span className="home-window-label" title={windows.label}>{windows.label}</span>
        {preview ? <div className="history-preview-controls" aria-label="過去のデータを閲覧中">
          <span className="history-preview-label">{historyDate(preview.entry.recordedAt)} · 閲覧専用</span>
          <button className="secondary-button" type="button" disabled={navigationBlocked} onClick={returnToCurrent}>現在に戻る</button>
          <button className="primary-button" type="button" disabled={navigationBlocked} onClick={() => { setRestoreError(""); setRestoreRequested(true); }}>この時点に戻す</button>
        </div> : null}
        <div className="home-theme-controls">
          <strong className="home-file-name" title={fileName}>{fileName}</strong>
          <ThemeSwitch />
        </div>
      </header>
  );
}

export function WorkspaceSidebar({ workspace }: { workspace: HomeWorkspace }) {
  const { isSidebarOpen, sidebar, fileName, closeSidebar, navigationBlocked, setPage, dismissNotice, preview, onCloseFile } = workspace;
  const { page, detailOrigin } = workspace.screen;
  return (
        <aside id="home-sidebar" className={`sidebar-panel${isSidebarOpen ? " is-open" : ""}`} aria-label="メニュー"
          onPointerEnter={sidebar.onPointerEnter} onPointerLeave={sidebar.onPointerLeave}
          onFocusCapture={sidebar.onFocusCapture} onBlurCapture={sidebar.onBlurCapture}>
          <div className="sidebar-inner">
          <header className="sidebar-header">
            <SidebarIcon name="file" />
            <strong className="sidebar-label sidebar-file-name" title={fileName}>{fileName}</strong>
            <button className="home-icon-button sidebar-close" type="button" aria-label="サイドバーを閉じる" aria-hidden={!isSidebarOpen} inert={!isSidebarOpen} onClick={closeSidebar}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </header>
          <nav className="sidebar-navigation" aria-label="メインナビゲーション">
            <button className="sidebar-item" type="button" aria-label="作業を選択" disabled={navigationBlocked} aria-current={page === "work-selection" ? "page" : undefined} onClick={() => { dismissNotice(); setPage("work-selection"); }}>
              <SidebarIcon name="list" /><span className="sidebar-label">作業を選択</span>
            </button>
            <button className="sidebar-item" type="button" aria-label="Home" disabled={navigationBlocked} aria-current={page === "home" ? "page" : undefined} onClick={() => setPage("home")}>
              <SidebarIcon name="home" />
              <span className="sidebar-label">Home</span>
            </button>
            <button className="sidebar-item" type="button" aria-label="ダッシュボード" disabled={navigationBlocked} aria-current={page === "dashboard" || (page === "initiative-detail" && detailOrigin === "dashboard") ? "page" : undefined} onClick={() => { dismissNotice(); setPage("dashboard"); }}>
              <SidebarIcon name="cost" />
              <span className="sidebar-label">ダッシュボード</span>
            </button>
            <button className="sidebar-item" type="button" aria-label="施策一覧" disabled={navigationBlocked} aria-current={page === "initiative-list" || page === "initiative-entry" || (page === "initiative-detail" && detailOrigin === "initiative-list") ? "page" : undefined} onClick={() => { dismissNotice(); setPage("initiative-list"); }}>
              <SidebarIcon name="list" />
              <span className="sidebar-label">施策一覧</span>
            </button>
            <button className="sidebar-item" type="button" aria-label="総原価表" disabled={navigationBlocked} aria-current={page === "cost-table" ? "page" : undefined} onClick={() => { dismissNotice(); setPage("cost-table"); }}>
              <SidebarIcon name="cost" />
              <span className="sidebar-label">総原価表</span>
            </button>
            <button className="sidebar-item" type="button" aria-label="展開表" disabled={navigationBlocked} aria-current={page === "expansion-table" || (page === "initiative-detail" && detailOrigin === "expansion-table") ? "page" : undefined} onClick={() => { dismissNotice(); setPage("expansion-table"); }}>
              <SidebarIcon name="expansion" />
              <span className="sidebar-label">展開表</span>
            </button>
            <button className="sidebar-item" type="button" aria-label="前年入力" disabled={navigationBlocked} aria-current={page === "previous-input" ? "page" : undefined} onClick={() => setPage("previous-input")}>
              <SidebarIcon name="previous" /><span className="sidebar-label">前年入力</span>
            </button>
            <button className="sidebar-item" type="button" aria-label="入出力" disabled={navigationBlocked} aria-current={page === "spreadsheet-io" ? "page" : undefined} onClick={() => setPage("spreadsheet-io")}><SidebarIcon name="io" /><span className="sidebar-label">入出力</span></button>
            <button className="sidebar-item" type="button" aria-label="マスタ" disabled={navigationBlocked} aria-current={page === "master" || pageMetadata[page].master ? "page" : undefined} onClick={() => setPage("master")}>
              <SidebarIcon name="master" />
              <span className="sidebar-label">マスタ</span>
            </button>
            <button className="sidebar-item" type="button" aria-label="履歴" disabled={navigationBlocked || preview !== null} aria-current={page === "data-history" ? "page" : undefined} onClick={() => setPage("data-history")}>
              <SidebarIcon name="history" /><span className="sidebar-label">履歴</span>
            </button>
          </nav>
          <footer className="sidebar-footer">
            <button className="sidebar-item" type="button" aria-label="別名で保存" disabled={workspace.operationBlocked} onClick={() => { void workspace.saveAs(); }}>
              <SidebarIcon name="save-as" /><span className="sidebar-label">別名で保存</span>
            </button>
            <button className="sidebar-item" type="button" aria-label="閉じる" disabled={navigationBlocked} onClick={onCloseFile}>
              <SidebarIcon name="close-file" />
              <span className="sidebar-label">閉じる</span>
            </button>
          </footer>
          </div>
        </aside>
  );
}
