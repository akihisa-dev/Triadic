import type { DetailDocument } from "./DetailsPage";
import type { CostTableView } from "./CostTablePage";
import { useWorkspaceNavigation } from "./workspace/useWorkspaceNavigation";
import { useWorkspaceHistory } from "./workspace/useWorkspaceHistory";
import { useMutation } from "./useMutation";
import { useScreenHistory } from "./useScreenHistory";
import { KindSelectionSlots } from "./KindSelectionSlots";
import { type KindId, type KindScreen, type PlanChange } from "../core/domain/kinds";
import { type RelationView } from "./HomeRelationsPage";
import { useCallback, useEffect, useRef, useState } from "react";
import { createInitiativeDraft, hasInitiativeDraftInput } from "../core/domain/initiativeRules";
import { useSidebar } from "./useSidebar";
import type { Screen } from "./workspace/types";
import { useRetainedInitiativeDraft } from "./workspace/useRetainedInitiativeDraft";
import { useWorkspaceCommands } from "./workspace/useWorkspaceCommands";
import { useWorkspaceOperations } from "./workspace/useWorkspaceOperations";
export type { Page, Screen, HomePageProps } from "./workspace/types";
import type { HomePageProps } from "./workspace/types";

export function useHomeWorkspace({ onChangePlan, fileName, initialContents, onChangeMaster, onChangeAggregations, onChangeExpansions, onChangeExpansionCategories, onChangeIndustries, onChangeDepartments, onChangePeriodTypes, onRegisterInitiative, onUpdateInitiative, onPrepareSave, onCloseFile, onSaveAs, dataHistory, historyError, historyBusy, onCompareHistory, onPreviewHistory, onRestoreHistory, onDeleteHistory, onRetryHistory, canUndo, canRedo, operationRevision, onTravelOperation }: HomePageProps) {
  const menuButton = useRef<HTMLButtonElement>(null);
  const costTableView = useRef<CostTableView>({ industries: [], departments: [], top: 0, left: 0 });
  const relationView = useRef<RelationView | null>(null);
  const sidebar = useSidebar();
  const isSidebarOpen = sidebar.expanded;
  const collapseSidebar = sidebar.collapse;
  const screens = useScreenHistory<Screen>({ page: "home", selectedInitiative: null, detailOrigin: "initiative-list" },
    (left, right) => left.page === right.page && left.selectedInitiative?.id === right.selectedInitiative?.id && left.detailOrigin === right.detailOrigin && left.detailKind === right.detailKind && left.selectedDetailId === right.selectedDetailId);
  const [detailDocuments, setDetailDocuments] = useState<DetailDocument[]>([]);
  const nextDetailId = useRef(1);
  const screen = screens.current;
  const { selectedInitiative } = screen;
  const navigate = screens.navigate;
  const currentContents = initialContents;
  const [notice, setNotice] = useState({ message: "", error: false });
  const dismissNotice = useCallback(() => setNotice({ message: "", error: false }), []);
  const { initiativeDraft, setInitiativeDraft, saveReferencedMaster, usedAccountIds } = useRetainedInitiativeDraft(currentContents, setNotice);
  const { preview, setPreview, restoreRequested, setRestoreRequested, restoreError, setRestoreError, restoreMutation,
    resetScreens, previewEntry, returnToCurrent, restorePreview } = useWorkspaceHistory(screens,
    () => navigationBlocked || saving.current, operation => mutation.run(operation), onPreviewHistory, onRestoreHistory,
    () => setInitiativeDraft(createInitiativeDraft(String(currentContents.fiscalYear))), dismissNotice, setNotice);
  const contents = preview?.contents ?? currentContents;
  const assertWritable = () => { if (preview) throw new Error("過去のデータは閲覧専用です。"); };

  const mutation = useMutation(assertWritable);
  const { busy: isSaving, running: saving } = mutation;
  const [editPending, setEditPending] = useState(false);
  const operationMutation = useMutation(assertWritable);
  const saveAsMutation = useMutation(assertWritable);
  const navigationBlocked = saveAsMutation.busy || isSaving || restoreMutation.busy || operationMutation.busy || editPending || historyBusy;
  const { discardRequest, setDiscardRequest, openInitiative, requestNavigation, setPage, startInitiative, duplicateInitiative } = useWorkspaceNavigation(
    screens, contents, preview !== null, navigationBlocked, saving, { initiativeDraft, setInitiativeDraft }, dismissNotice);
  const openDetail = (id: number) => {
    if (navigationBlocked || saving.current || preview || discardRequest || !detailDocuments.some(item => item.id === id)) return;
    dismissNotice();
    requestNavigation({ ...screen, page: "detail-editor", selectedDetailId: id });
  };
  const createDetail = (name: string, description: string) => {
    if (navigationBlocked || saving.current || preview || discardRequest || !name.trim()) return;
    const document: DetailDocument = { id: nextDetailId.current++, name: name.trim(), description: description.trim() };
    setDetailDocuments(previous => [...previous, document]);
    dismissNotice();
    requestNavigation({ ...screen, page: "detail-editor", selectedDetailId: document.id });
  };
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
  const travelOperation = useWorkspaceOperations(operationBlocked, saving, operationMutation, canUndo, canRedo, onPrepareSave, onTravelOperation, dismissNotice, setNotice);
  const changePlan = (change: PlanChange) => mutation.run(async () => { await onChangePlan(change); });
  const kindSelection = (screen: KindScreen) => <KindSelectionSlots screen={screen} selected={contents.kindSelections[screen]} disabled={navigationBlocked}
    onChange={(selected: KindId[]) => {
      if (preview) {
        setPreview({ ...preview, contents: { ...contents, kindSelections: { ...contents.kindSelections, [screen]: selected } } });
        return;
      }
      void changePlan({ type: "selection", screen, selected }).catch(error => setNotice({ message: error instanceof Error ? error.message : "種別の選択を保存できませんでした。", error: true }));
    }} />;
  const { changeMaster, changePeriodTypes, changeDepartments, changeIndustries, changeExpansions, changeExpansionCategories, changeAggregations, update } = useWorkspaceCommands(
    { onChangeMaster, onChangePeriodTypes, onChangeDepartments, onChangeIndustries, onChangeExpansions, onChangeExpansionCategories, onChangeAggregations, onUpdateInitiative }, mutation, currentContents,
    { initiativeDraft, setInitiativeDraft, saveReferencedMaster, usedAccountIds }, selectedInitiative);
  const register = async () => {
    if (saving.current) return;
    dismissNotice();
    try {
      await mutation.run(async () => { await onRegisterInitiative(initiativeDraft); });
      setInitiativeDraft(createInitiativeDraft(initiativeDraft.fiscalYear));
      navigate({ ...screen, page: "initiative-list" });
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
    restoreMutation, saveAsMutation, saveAs, setEditPending, openInitiative, menuButton, relationView, costTableView, sidebar,
    detailDocuments, openDetail, createDetail,
    isSidebarOpen, screen, initiativeDraft, setInitiativeDraft, preview, setPreview,
    restoreRequested, setRestoreRequested, restoreError, setRestoreError, contents, currentContents,
    notice, dismissNotice, isSaving, operationMutation, navigationBlocked, discardRequest,
    setDiscardRequest, operationBlocked, travelOperation, requestNavigation, setPage, startInitiative, duplicateInitiative,
    usedAccountIds, changePlan, kindSelection, changeMaster, changePeriodTypes, changeDepartments,
    changeIndustries, changeExpansions, changeExpansionCategories, changeAggregations, update, register,
    resetScreens, previewEntry, returnToCurrent, restorePreview, closeSidebar, screens, fileName,
    dataHistory, historyError, historyBusy, onCompareHistory, onDeleteHistory, onRetryHistory, onPrepareSave,
    onCloseFile, canUndo, canRedo, operationRevision
  };
}

export type HomeWorkspace = ReturnType<typeof useHomeWorkspace>;
