import type { CostTableView } from "./CostTablePage";
import { useWorkspaceNavigation } from "./workspace/useWorkspaceNavigation";
import { useWorkspaceHistory } from "./workspace/useWorkspaceHistory";
import { useMutation } from "./useMutation";
import { useScreenHistory } from "./useScreenHistory";
import { ComparisonSelection } from "./ComparisonSelection";
import { KindSelectionSlots } from "./KindSelectionSlots";
import { type BudgetPrevious, type KindId, type KindScreen, type PlanChange } from "../core/domain/kinds";
import { type RelationView } from "./HomeRelationsPage";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createInitiativeDraft, hasInitiativeDraftInput } from "../core/domain/initiativeRules";
import { useSidebar } from "./useSidebar";
import type { Screen } from "./workspace/types";
import { useRetainedInitiativeDraft } from "./workspace/useRetainedInitiativeDraft";
import { useWorkspaceCommands } from "./workspace/useWorkspaceCommands";
import { useWorkspaceOperations } from "./workspace/useWorkspaceOperations";
import { useWindowViewState } from "./windowView";
import { flushAutoSaves, subscribeAutoSaveFailures, hasAutoSaveFailure } from "./flushAutoSaves";
import type { SpreadsheetOperation } from "./spreadsheetOperation";
export type { Page, Screen, HomePageProps } from "./workspace/types";
import type { HomePageProps } from "./workspace/types";

export function useHomeWorkspace({ windows, onChangePlan, fileName, initialContents, onChangeMaster, onChangeAggregations, onChangeExpansions, onChangeExpansionCategories, onChangeIndustries, onChangeDepartments, onChangePeriodTypes, onRegisterInitiative, onUpdateInitiative, onPrepareSave, onCloseFile, onSaveAs, dataHistory, historyError, historyBusy, onCompareHistory, onPreviewHistory, onRestoreHistory, onDeleteHistory, onRetryHistory, canUndo, canRedo, operationRevision, onTravelOperation }: HomePageProps) {
  const initialView = windows?.getWindowSnapshot().initialView;
  const menuButton = useRef<HTMLButtonElement>(null);
  const costTableView = useRef<CostTableView>(initialView?.costTable ?? { industries: [], departments: [], top: 0, left: 0 });
  const relationView = useRef<RelationView | null>(initialView?.relation ?? null);
  const sidebar = useSidebar();
  const isSidebarOpen = sidebar.expanded;
  const collapseSidebar = sidebar.collapse;
  const screens = useScreenHistory<Screen>(initialView?.screen ?? { page: "home", selectedInitiative: null, detailOrigin: "initiative-list" },
    (left, right) => left.page === right.page && left.selectedInitiative?.id === right.selectedInitiative?.id && left.detailOrigin === right.detailOrigin && left.detailKind === right.detailKind && left.detailVisit === right.detailVisit);
  const screen = screens.current;
  const { selectedInitiative } = screen;
  const navigate = screens.navigate;
  const currentContents = initialContents;
  const [notice, setNotice] = useState({ message: "", error: false });
  const dismissNotice = useCallback(() => setNotice({ message: "", error: false }), []);
  const showError = (failure: unknown) => {
    if (!(failure instanceof DOMException && failure.name === "AbortError")) setNotice({ message: failure instanceof Error ? failure.message : "処理できませんでした。入力は保持しています。", error: true });
  };
  const { initiativeDraft, setInitiativeDraft, saveReferencedMaster, usedAccountIds } = useRetainedInitiativeDraft(currentContents, setNotice);
  const latestNavigation = useRef(screens.snapshot());
  const latestDraft = useRef(initiativeDraft);
  latestNavigation.current = screens.snapshot();
  latestDraft.current = initiativeDraft;
  const { preview, setPreview, restoreRequested, setRestoreRequested, restoreError, setRestoreError, restoreMutation,
    resetScreens, previewEntry, returnToCurrent, restorePreview } = useWorkspaceHistory(screens,
    () => navigationBlocked || saving.current, operation => mutation.run(operation), onPreviewHistory, onRestoreHistory,
    () => setInitiativeDraft(createInitiativeDraft(String(currentContents.fiscalYear))), dismissNotice, setNotice);
  const contents = preview?.contents ?? currentContents;
  const assertWritable = () => { if (preview) throw new Error("過去のデータは閲覧専用です。"); };

  const mutation = useMutation(assertWritable);
  const { busy: isSaving, running: saving } = mutation;
  const [editPending, setEditPending] = useState(false);
  const ioController = useRef<SpreadsheetOperation | null>(null);
  const setIOController = useCallback((controller: SpreadsheetOperation | null) => { ioController.current = controller; }, []);
  const operationMutation = useMutation(assertWritable);
  const saveAsMutation = useMutation(assertWritable);
  const saveFailed = useSyncExternalStore(subscribeAutoSaveFailures, hasAutoSaveFailure);
  const navigationBlocked = saveAsMutation.busy || restoreMutation.busy || operationMutation.busy || saveFailed || (screen.page === "spreadsheet-io" && editPending);
  const searchBlocked = navigationBlocked || editPending || isSaving || historyBusy;
  const historyEntered = useRef(screen.page === "data-history");
  const { discardRequest, setDiscardRequest, openInitiative, requestNavigation, setPage, startInitiative, duplicateInitiative, recoverInitiative } = useWorkspaceNavigation(
    screens, contents, preview !== null, navigationBlocked, editPending, saving, { initiativeDraft, setInitiativeDraft }, dismissNotice, async next => {
      await flushAutoSaves();
      if (next.page === "data-history" && !historyEntered.current) {
        await windows?.enterHistory(); historyEntered.current = true;
      } else if (next.page !== "data-history" && !preview && historyEntered.current) {
        await windows?.leaveHistory(); historyEntered.current = false;
      }
    }, showError);
  const operationBlocked = navigationBlocked || preview !== null || restoreRequested || discardRequest !== null || hasInitiativeDraftInput(initiativeDraft);
  const saveAs = async () => {
    if (operationBlocked || saveAsMutation.running.current) return;
    dismissNotice();
    try {
      await saveAsMutation.run(onSaveAs);
      setNotice({ message: "別名で保存しました。", error: false });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setNotice({ message: error instanceof Error ? error.message : "別名で保存できませんでした。元のファイルと入力は保持しています。", error: true });
    }
  };
  const availableUndo = canUndo || editPending || isSaving;
  const travelOperation = useWorkspaceOperations(operationBlocked, saving, operationMutation, availableUndo, canRedo, onPrepareSave, onTravelOperation, dismissNotice, setNotice);
  const changePlan = (change: PlanChange) => mutation.run(async () => { await onChangePlan(change); });
  const [localKinds, setLocalKinds] = useWindowViewState("table:kinds", contents.kindSelections);
  const [localPrevious, setLocalPrevious] = useWindowViewState("table:previous", contents.previousSelections);
  const [dashboardSelection, setDashboardSelection] = useWindowViewState("dashboard:selection", { kinds: [1], previous: { 1: 1, 2: 1 } });
  const openDashboardDepartment = (id: number) => {
    costTableView.current = { industries: [], departments: [id], top: 0, left: 0 };
    setLocalKinds(value => ({ ...value, "cost-table": dashboardSelection.kinds }));
    setLocalPrevious(value => ({ ...value, "cost-table": { ...dashboardSelection.previous, display: value["cost-table"].display ?? 1 } }));
    dismissNotice();
    setPage("cost-table");
  };
  const previousPreview = useRef<number | null>(null);
  useEffect(() => {
    const id = preview?.entry.id ?? null;
    if (previousPreview.current !== id) {
      setLocalPrevious(contents.previousSelections);
      setLocalKinds(contents.kindSelections);
    }
    previousPreview.current = id;
  }, [preview?.entry.id, contents.previousSelections, contents.kindSelections]);
  const previousRevision = useRef(operationRevision);
  useEffect(() => {
    if (previousRevision.current !== operationRevision && (!windows || windows.getWindowSnapshot().peers === 1)) { setLocalKinds(contents.kindSelections); setLocalPrevious(contents.previousSelections); }
    previousRevision.current = operationRevision;
  }, [operationRevision, contents.kindSelections, contents.previousSelections, windows]);
  const kindSelection = (screen: KindScreen) => {
    const changeSelection = (selected: KindId[], previous?: BudgetPrevious) => {
      const applyLocal = () => {
        setLocalKinds(value => ({ ...value, [screen]: selected }));
        if (previous) setLocalPrevious(value => ({ ...value, [screen]: previous }));
      };
      if (preview) { applyLocal(); return; }
      const change: PlanChange = screen === "initiative-list" ? { type: "selection", screen, selected }
        : { type: "comparison", screen, selected, previous: previous! };
      void changePlan(change).then(applyLocal).catch(error => setNotice({ message: error instanceof Error ? error.message : "比較条件を保存できませんでした。", error: true }));
    };
    return screen === "initiative-list"
      ? <KindSelectionSlots screen={screen} selected={localKinds[screen]} disabled={navigationBlocked || isSaving} onChange={selected => changeSelection(selected)} />
      : <ComparisonSelection independentPrevious selected={localKinds[screen]} previous={localPrevious[screen]} disabled={navigationBlocked || isSaving} onChange={changeSelection} />;
  };
  const { changeMaster, changePeriodTypes, changeDepartments, changeIndustries, changeExpansions, changeExpansionCategories, changeAggregations, update } = useWorkspaceCommands(
    { onChangeMaster, onChangePeriodTypes, onChangeDepartments, onChangeIndustries, onChangeExpansions, onChangeExpansionCategories, onChangeAggregations, onUpdateInitiative }, mutation, currentContents,
    { initiativeDraft, setInitiativeDraft, saveReferencedMaster, usedAccountIds }, selectedInitiative);
  const register = async () => {
    if (saving.current) return;
    const startingNavigation = latestNavigation.current;
    const submittedDraft = initiativeDraft;
    dismissNotice();
    try {
      await mutation.run(async () => { await onRegisterInitiative(submittedDraft); });
      if (latestDraft.current === submittedDraft) setInitiativeDraft(createInitiativeDraft(submittedDraft.fiscalYear));
      if (latestNavigation.current === startingNavigation) navigate({ ...screen, page: "initiative-list" });
      setNotice({ message: "施策を登録しました。", error: false });
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      setNotice({ message: cancelled ? "保存をキャンセルしました。入力内容は残っています。" : error instanceof Error ? error.message : "施策を登録できませんでした。", error: !cancelled });
    }
  };

  const closeSidebar = useCallback(() => {
    collapseSidebar();
    menuButton.current?.focus();
  }, [collapseSidebar]);

  useEffect(() => {
    if (!isSidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        closeSidebar();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSidebarOpen, closeSidebar]);

  return {
    dashboardSelection, setDashboardSelection, openDashboardDepartment,
    restoreMutation, saveAsMutation, saveAs, setEditPending, ioController, setIOController, openInitiative, menuButton, relationView, costTableView, sidebar, showError, localKinds, localPrevious,
    isSidebarOpen, screen, initiativeDraft, setInitiativeDraft, preview, setPreview,
    restoreRequested, setRestoreRequested, restoreError, setRestoreError, contents, currentContents,
    notice, dismissNotice, isSaving, operationMutation, navigationBlocked, searchBlocked, discardRequest,
    setDiscardRequest, operationBlocked, travelOperation, requestNavigation, setPage, startInitiative, duplicateInitiative, recoverInitiative,
    usedAccountIds, changePlan, kindSelection, changeMaster, changePeriodTypes, changeDepartments,
    changeIndustries, changeExpansions, changeExpansionCategories, changeAggregations, update, register,
    resetScreens, previewEntry, returnToCurrent, restorePreview, closeSidebar, screens, fileName,
    dataHistory, historyError, historyBusy, onCompareHistory, onDeleteHistory, onRetryHistory, onPrepareSave,
    onCloseFile, canUndo: availableUndo, canRedo, operationRevision
  };
}

export type HomeWorkspace = ReturnType<typeof useHomeWorkspace>;
