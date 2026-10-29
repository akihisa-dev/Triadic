import { BudgetPhaseContext } from "./BudgetPhase";
import { useHomeWorkspace, type HomePageProps } from "./useHomeWorkspace";
import { WorkspaceHeader, WorkspaceSidebar } from "./WorkspaceChrome";
import { WorkspacePage } from "./WorkspacePage";
import { WorkSelectionPage, WorkSelectionHeader } from "./WorkSelectionPage";
import { useEffect, useState } from "react";
import { WindowViewContext } from "./windowView";
import { useWindowWorkspace } from "./useWindowWorkspace";
import { preloadSpreadsheetIO } from "./DeferredSpreadsheetIOPage";
import { createInitiativeDraft } from "../core/domain/initiativeRules";
import { HistoryReadOnlyContext } from "./HistoryReadOnly";
import { SavedOperationRevisionContext } from "./SavedOperationRevision";
import { StatusNotice } from "./StatusNotice";
import { FadeSwap } from "./FadeSwap";
import { historyDate } from "./DataHistoryPage";
import { ConfirmationDialog } from "./ConfirmationDialog";
import "./ScreenHistory.css";
export type { Page } from "./useHomeWorkspace";

export function HomePage(props: HomePageProps) {
  const [values] = useState(() => ({ ...props.windows?.getWindowSnapshot().initialView?.values }));
  return <WindowViewContext value={values}><HomePageContents {...props} /></WindowViewContext>;
}

function HomePageContents(props: HomePageProps) {
  const workspace = useHomeWorkspace(props);
  const windows = useWindowWorkspace(props.windows, workspace);
  const {
    restoreMutation, preview, operationRevision, operationMutation, screen, notice,
    historyError, dismissNotice, discardRequest, navigationBlocked, setDiscardRequest, setInitiativeDraft,
    currentContents, restoreRequested, restoreError, isSaving, historyBusy, setRestoreRequested,
    onPrepareSave, restorePreview, setRestoreError
  } = workspace;
  useEffect(() => {
    if (screen.page === "spreadsheet-io") preloadSpreadsheetIO();
  }, [screen.page]);
  return (
    <BudgetPhaseContext value={workspace.phase}><HistoryReadOnlyContext value={preview !== null}><SavedOperationRevisionContext value={operationRevision}><div className="home-page">
      {(screen.page === "work-selection" || screen.page === "home") ? <>
        <WorkSelectionHeader fiscalYear={workspace.contents.fiscalYear} onClose={workspace.onCloseFile} disabled={navigationBlocked || isSaving} />
        <div className="work-selection-content" inert={operationMutation.busy || workspace.saveAsMutation.busy || windows.settling}>
          {screen.page === "work-selection" ? <WorkSelectionPage disabled={navigationBlocked || isSaving} onSelect={workspace.selectWork}
            onOpenInformation={mode => { workspace.setHomeMode(mode); workspace.setPage("home"); }} />
            : <WorkspacePage displayed={screen} workspace={workspace} />}
        </div>
      </> : <>
      <WorkspaceHeader workspace={workspace} windows={windows} />
      <div className="home-layout">
        <WorkspaceSidebar workspace={workspace} />
        <div className="home-content" inert={operationMutation.busy || workspace.saveAsMutation.busy || windows.settling}>
          <FadeSwap key={preview ? `past:${preview.entry.id}` : "current"} value={screen} className="page-switch">
            {displayed => <WorkspacePage displayed={displayed} workspace={workspace} />}
          </FadeSwap>
        </div>
      </div>
      </>}
      <StatusNotice message={notice.message || historyError} error={notice.message ? notice.error : Boolean(historyError)} {...(notice.message ? { onDismiss: dismissNotice } : {})} />
      <ConfirmationDialog open={windows.discardLabels !== null} title="履歴を開きますか？"
        message={`${windows.discardLabels ?? ""}の未登録の入力は破棄され、確認待ちの内容も破棄されます。ほかのウィンドウを閉じて履歴を開きますか？`}
        confirmLabel="はい" busy={false} onCancel={() => windows.finishDiscard(false)} onConfirm={() => windows.finishDiscard(true)} />
      <ConfirmationDialog open={discardRequest !== null} title="入力内容を破棄しますか？" message={discardRequest?.recovery ? "保持中の登録前の入力を破棄して、保護した未保存入力に置き換えます。" : discardRequest?.duplicate ? "保持中の登録前の入力を破棄して、選んだ施策の複製に置き換えます。" : discardRequest?.dashboard ? "登録前の入力を破棄してダッシュボードを開きます。" : "登録前の入力を破棄して施策一覧へ戻ります。"}
        confirmLabel={discardRequest?.recovery ? "破棄して引き継ぐ" : discardRequest?.duplicate ? "破棄して複製する" : discardRequest?.dashboard ? "破棄してダッシュボードへ" : "破棄して一覧へ戻る"} busy={discardRequest?.recovery ? isSaving : navigationBlocked}
        onCancel={() => setDiscardRequest(null)} onConfirm={() => {
          if (!discardRequest || (discardRequest.recovery ? isSaving : navigationBlocked)) return;
          setInitiativeDraft(createInitiativeDraft(String(currentContents.fiscalYear)));
          dismissNotice();
          setDiscardRequest(null);
          discardRequest.perform();
        }} />
      <ConfirmationDialog open={restoreRequested} title="過去の状態に戻す" message={restoreError || (preview ? `${historyDate(preview.entry.recordedAt)}の状態にファイル全体を戻しますか？ 復元前の状態も履歴に残します。` : "")} confirmLabel={restoreError ? "保存を再試行して戻す" : "この時点に戻す"} busy={isSaving || restoreMutation.busy || historyBusy}
        onCancel={() => setRestoreRequested(false)} onConfirm={() => { void (restoreError ? onPrepareSave().then(restorePreview).catch(failure => setRestoreError(failure instanceof Error ? failure.message : "保存先を選択できませんでした。")) : restorePreview()); }} />
    </div></SavedOperationRevisionContext></HistoryReadOnlyContext></BudgetPhaseContext>
  );
}
