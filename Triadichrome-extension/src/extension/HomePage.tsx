import { useHomeWorkspace, type HomePageProps } from "./useHomeWorkspace";
import { WorkspaceHeader, WorkspaceSidebar } from "./WorkspaceChrome";
import { WorkspacePage } from "./WorkspacePage";
import { useEffect } from "react";
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
  const workspace = useHomeWorkspace(props);
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
    <HistoryReadOnlyContext value={preview !== null}><SavedOperationRevisionContext value={operationRevision}><div className="home-page">
      <WorkspaceHeader workspace={workspace} />
      <div className="home-layout">
        <WorkspaceSidebar workspace={workspace} />
        <div className="home-content" inert={operationMutation.busy || workspace.saveAsMutation.busy}>
          <FadeSwap key={preview ? `past:${preview.entry.id}` : "current"} value={screen} className="page-switch">
            {displayed => <WorkspacePage displayed={displayed} workspace={workspace} />}
          </FadeSwap>
        </div>
      </div>
      <StatusNotice message={notice.message || historyError} error={notice.message ? notice.error : Boolean(historyError)} {...(notice.message ? { onDismiss: dismissNotice } : {})} />
      <ConfirmationDialog open={discardRequest !== null} title="入力内容を破棄しますか？" message="登録前の入力を破棄して施策一覧へ戻ります。"
        confirmLabel="破棄して一覧へ戻る" busy={navigationBlocked}
        onCancel={() => setDiscardRequest(null)} onConfirm={() => {
          if (!discardRequest || navigationBlocked) return;
          setInitiativeDraft(createInitiativeDraft(String(currentContents.fiscalYear)));
          dismissNotice();
          setDiscardRequest(null);
          discardRequest.perform();
        }} />
      <ConfirmationDialog open={restoreRequested} title="過去の状態に戻す" message={restoreError || (preview ? `${historyDate(preview.entry.recordedAt)}の状態にファイル全体を戻しますか？ 復元前の状態も履歴に残します。` : "")} confirmLabel={restoreError ? "保存を再試行して戻す" : "この時点に戻す"} busy={isSaving || restoreMutation.busy || historyBusy}
        onCancel={() => setRestoreRequested(false)} onConfirm={() => { void (restoreError ? onPrepareSave().then(restorePreview).catch(failure => setRestoreError(failure instanceof Error ? failure.message : "保存先を選択できませんでした。")) : restorePreview()); }} />
    </div></SavedOperationRevisionContext></HistoryReadOnlyContext>
  );
}
