import { useFileEntry } from "./useFileEntry";
import { EntryPage } from "./EntryPage";
import type { ExpansionCategoryChange } from "../core/domain/expansionCategoryMaster";
import { FileConflictDialog } from "./FileConflictDialog";
import type { PlanChange } from "../core/domain/kinds";
import type { PlanCommand } from "../core/domain/planCommands";
import { type PeriodTypeChange } from "../core/domain/periodMaster";
import { type DepartmentChange } from "../core/domain/departmentMaster";
import { type IndustryChange } from "../core/domain/industryMaster";
import { type ExpansionChange } from "../core/domain/expansionMaster";
import { type HistoryDeletion } from "../core/domain/dataHistory";
import { useCallback, useEffect, useRef, useState } from "react";
import { type AccountChange } from "../core/domain/accountMaster";
import { type AggregationChange } from "../core/domain/aggregationMaster";
import { type InitiativeEntryDraft } from "../core/domain/plan";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { HomePage } from "./HomePage";
import { FadeSwap } from "./FadeSwap";
import "./ExtensionPage.css";

import { choosePlanDestination } from "./filePicker";
import { usePlanSession } from "./usePlanSession";

export function ExtensionPage() {
  const [closeError, setCloseError] = useState("");
  const [closeRequested, setCloseRequested] = useState(false);
  const suggestedName = useRef("Untitled.triadic");
  const chooseDestination = useCallback(() => choosePlanDestination(suggestedName.current), []);
  const { session, snapshot } = usePlanSession(chooseDestination, closeRequested);
  const { history: dataHistory, historyError } = snapshot;
  if (snapshot.name) suggestedName.current = snapshot.name;
  const entry = useFileEntry(session, snapshot.name, () => setCloseError(""));
  const { busy, isBusy, fileName, displayName } = entry;
  // Keep the outgoing screen's published contents for the fade, without retaining an open document.
  const displayedContents = useRef(snapshot.contents);
  if (snapshot.contents) displayedContents.current = snapshot.contents;

  useEffect(() => {
    const confirmExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", confirmExit);
    return () => window.removeEventListener("beforeunload", confirmExit);
  }, []);
  const prepareSave = () => session.prepareSave(chooseDestination);
  const dispatch = async (command: PlanCommand) => {
    return session.dispatch(command, chooseDestination);
  };
  const changePlan = (change: PlanChange) => dispatch({ type: "settings", change });
  const changeMaster = (change: AccountChange) => dispatch({ type: "account", change });
  const changePeriodTypes = (change: PeriodTypeChange) => dispatch({ type: "period", change });
  const changeDepartments = (change: DepartmentChange) => dispatch({ type: "department", change });
  const changeIndustries = (change: IndustryChange) => dispatch({ type: "industry", change });
  const changeExpansionCategories = (change: ExpansionCategoryChange) => dispatch({ type: "expansion-category", change });
  const changeExpansions = (change: ExpansionChange) => dispatch({ type: "expansion", change });
  const changeAggregations = (change: AggregationChange) => dispatch({ type: "aggregation", change });
  const register = (draft: InitiativeEntryDraft) => dispatch({ type: "initiative.register", draft });
  const update = (id: number, _year: number | null, draft: InitiativeEntryDraft) => dispatch({ type: "initiative.update", id, draft });
  const previewHistory = (id: number) => session.preview(id, chooseDestination);
  const restoreHistory = (id: number) => session.restore(id, chooseDestination);
  const deleteHistory = (deletion: HistoryDeletion) => session.deleteHistory(deletion, chooseDestination);
  return <div className="app-shell"><FadeSwap value={fileName} className="app-switch">{displayedFile => displayedFile
    ? <HomePage onChangePlan={changePlan} fileName={displayName} initialContents={displayedContents.current!} onChangeMaster={changeMaster} onChangeAggregations={changeAggregations} onChangeExpansions={changeExpansions} onChangeExpansionCategories={changeExpansionCategories} onChangeIndustries={changeIndustries} onChangeDepartments={changeDepartments} onChangePeriodTypes={changePeriodTypes} onRegisterInitiative={register} onUpdateInitiative={update} onPrepareSave={prepareSave}
      dataHistory={dataHistory} historyError={historyError} historyBusy={isBusy || snapshot.busy} onPreviewHistory={previewHistory} onRestoreHistory={restoreHistory} onDeleteHistory={deleteHistory}
      canUndo={snapshot.canUndo} canRedo={snapshot.canRedo} operationRevision={snapshot.operationRevision} onTravelOperation={direction => session.travelOperation(direction, chooseDestination)}
      onRetryHistory={async () => { await prepareSave(); await session.checkpoint(true, chooseDestination); }}
      onCloseFile={() => { if (!busy.current) { setCloseError(""); setCloseRequested(true); } }} />
    : <EntryPage entry={entry} />}</FadeSwap>
    <ConfirmationDialog open={closeRequested} title="ファイルを閉じる" message={closeError || `「${displayName}」を閉じますか？ 登録前の入力は失われます。`} confirmLabel={closeError ? "保存を再試行して閉じる" : "閉じる"} busy={isBusy || snapshot.busy}
      onCancel={() => setCloseRequested(false)} onConfirm={() => {
        if (busy.current) return;
        void (async () => {
          try {
            if (closeError) await prepareSave();
            await session.close(chooseDestination);
            setCloseRequested(false); entry.reset();
          } catch (failure) { setCloseError(failure instanceof Error ? failure.message : "履歴を記録できませんでした。ファイルは開いたままです。"); }
        })();
      }} />
    <FileConflictDialog />
  </div>;
}
