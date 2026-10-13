import { reconcileInitiativeDraftReferences, type LocalDraftReference } from "../core/domain/initiativeDraftReferences";
import type { ExpansionCategoryChange } from "../core/domain/expansionCategoryMaster";
import { useMutation } from "./useMutation";
import { useScreenHistory } from "./useScreenHistory";
import { KindSelectionSlots } from "./KindSelectionSlots";
import { type KindId, type KindScreen, type PlanChange } from "../core/domain/kinds";
import { type RelationView } from "./HomeRelationsPage";
import { type PeriodTypeChange } from "../core/domain/periodMaster";
import { type DepartmentChange } from "../core/domain/departmentMaster";
import { type IndustryChange } from "../core/domain/industryMaster";
import { type ExpansionChange } from "../core/domain/expansionMaster";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createInitiativeDraft, hasInitiativeDraftInput } from "../core/domain/initiativeRules";
import { type Initiative, type InitiativeEntryDraft, type PlanContents } from "../core/domain/plan";
import { type AccountChange } from "../core/domain/accountMaster";
import { type AggregationChange } from "../core/domain/aggregationMaster";
import { useSidebar } from "./useSidebar";

import type { DataHistoryEntry, DataHistoryStatus, HistoryDeletion } from "../core/domain/dataHistory";


export type Page = "spreadsheet-io" | "data-history" | "previous-input" | "home" | "initiative-entry" | "initiative-list" | "initiative-detail" | "cost-table" | "expansion-table" | "master" | "account-master" | "expansion-master" | "expansion-category-master" | "industry-master" | "department-master" | "period-master" | "kind-master" | "account-type-master" | "amount-item-master";

export type Screen = {
  page: Page;
  selectedInitiative: Pick<Initiative, "id" | "fiscalYear"> | null;
  detailOrigin: "home" | "initiative-list" | "expansion-table";
};

export type HomePageProps = {
  onChangePlan: (change: PlanChange) => Promise<PlanContents>;
  fileName: string;
  initialContents: PlanContents;
  onChangeMaster: (change: AccountChange) => Promise<PlanContents>;
  onChangePeriodTypes: (change: PeriodTypeChange) => Promise<PlanContents>;
  onChangeDepartments: (change: DepartmentChange) => Promise<PlanContents>;
  onChangeIndustries: (change: IndustryChange) => Promise<PlanContents>;
  onChangeExpansionCategories: (change: ExpansionCategoryChange) => Promise<PlanContents>;
  onChangeExpansions: (change: ExpansionChange) => Promise<PlanContents>;
  onChangeAggregations: (change: AggregationChange) => Promise<PlanContents>;
  onRegisterInitiative: (draft: InitiativeEntryDraft) => Promise<PlanContents>;
  onUpdateInitiative: (id: number, year: number | null, draft: InitiativeEntryDraft) => Promise<PlanContents>;
  onPrepareSave: () => Promise<void>;
  onCloseFile: () => void;
  dataHistory: DataHistoryStatus;
  historyError: string;
  historyBusy: boolean;
  onPreviewHistory: (id: number) => Promise<PlanContents>;
  onRestoreHistory: (id: number) => Promise<PlanContents>;
  onDeleteHistory: (deletion: HistoryDeletion) => Promise<void>;
  onRetryHistory: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  operationRevision: number;
  onTravelOperation: (direction: -1 | 1) => Promise<PlanContents>;
};

export function useHomeWorkspace({ onChangePlan, fileName, initialContents, onChangeMaster, onChangeAggregations, onChangeExpansions, onChangeExpansionCategories, onChangeIndustries, onChangeDepartments, onChangePeriodTypes, onRegisterInitiative, onUpdateInitiative, onPrepareSave, onCloseFile, dataHistory, historyError, historyBusy, onPreviewHistory, onRestoreHistory, onDeleteHistory, onRetryHistory, canUndo, canRedo, operationRevision, onTravelOperation }: HomePageProps) {
  const menuButton = useRef<HTMLButtonElement>(null);
  const relationView = useRef<RelationView | null>(null);
  const sidebar = useSidebar();
  const isSidebarOpen = sidebar.expanded;
  const collapseSidebar = sidebar.collapse;
  const screens = useScreenHistory<Screen>({ page: "home", selectedInitiative: null, detailOrigin: "initiative-list" },
    (left, right) => left.page === right.page && left.selectedInitiative?.id === right.selectedInitiative?.id && left.detailOrigin === right.detailOrigin);
  const screen = screens.current;
  const currentScreens = useRef<ReturnType<typeof screens.snapshot> | null>(null);
  const { page, selectedInitiative } = screen;
  const navigate = screens.navigate;
  const [initiativeDraft, setInitiativeDraft] = useState(() => createInitiativeDraft(String(initialContents.fiscalYear)));
  const currentContents = initialContents;
  const draftContents = useRef(initialContents);
  const localDraftReference = useRef<LocalDraftReference | null>(null);
  const [preview, setPreview] = useState<{ entry: DataHistoryEntry; contents: PlanContents } | null>(null);
  const [restoreRequested, setRestoreRequested] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const contents = preview?.contents ?? currentContents;
  const assertWritable = () => { if (preview) throw new Error("過去のデータは閲覧専用です。"); };

  const { initiatives } = contents;
  useEffect(() => {
    screens.prune(entry => entry.page !== "initiative-detail" || initiatives.some(item => item.id === entry.selectedInitiative?.id),
      { page: "home", selectedInitiative: null, detailOrigin: "initiative-list" });
  }, [initiatives, screens.prune]);
  const openInitiative = (initiative: Initiative) => {
    if (navigationState.current.blocked || navigationState.current.page !== page || saving.current) return;
    dismissNotice();
    navigate({
      page: "initiative-detail",
      detailOrigin: page === "home" ? "home" : page === "expansion-table" ? "expansion-table" : "initiative-list",
      selectedInitiative: { id: initiative.id, fiscalYear: initiative.fiscalYear },
    });
  };
  const [notice, setNotice] = useState({ message: "", error: false });
  const dismissNotice = useCallback(() => setNotice({ message: "", error: false }), []);
  useLayoutEffect(() => {
    const previous = draftContents.current;
    if (previous === currentContents) return;
    const reconciled = reconcileInitiativeDraftReferences(initiativeDraft, previous, currentContents, localDraftReference.current);
    draftContents.current = currentContents;
    localDraftReference.current = null;
    if (reconciled !== initiativeDraft) {
      setInitiativeDraft(reconciled);
      setNotice({ message: "保持中の施策で選択したマスタが変更されています。入力内容は保持しています。未選択の項目を選び直してください。", error: true });
    }
  }, [currentContents, initiativeDraft]);
  const saveReferencedMaster = async (reference: LocalDraftReference | null, save: () => Promise<PlanContents>) => {
    localDraftReference.current = reference;
    try { return await save(); }
    catch (error) { localDraftReference.current = null; throw error; }
  };
  const mutation = useMutation(assertWritable);
  const { busy: isSaving, running: saving } = mutation;
  const [editPending, setEditPending] = useState(false);
  const restoreMutation = useMutation();
  const operationMutation = useMutation(assertWritable);
  const navigationBlocked = isSaving || restoreMutation.busy || operationMutation.busy || editPending || historyBusy;
  const navigationState = useRef({ blocked: navigationBlocked, page });
  navigationState.current = { blocked: navigationBlocked, page };
  const [discardRequest, setDiscardRequest] = useState<{ perform: () => void } | null>(null);
  const operationBlocked = navigationBlocked || preview !== null || restoreRequested || discardRequest !== null || hasInitiativeDraftInput(initiativeDraft);
  const travelOperation = async (direction: -1 | 1) => {
    if (operationBlocked || saving.current || operationMutation.running.current || document.querySelector("dialog[open]") || !(direction === -1 ? canUndo : canRedo)) return;
    dismissNotice();
    try {
      await operationMutation.run(async () => {
        await onPrepareSave();
        return onTravelOperation(direction);
      });
      setNotice({ message: direction === -1 ? "操作を取り消しました。" : "操作をやり直しました。", error: false });
    } catch (failure) {
      setNotice({ message: failure instanceof Error ? failure.message : "操作を戻せませんでした。", error: true });
    }
  };
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest("input, textarea, select") || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && !(key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey)) return;
      const direction = key === "y" || event.shiftKey ? 1 : -1;
      if (operationBlocked || document.querySelector("dialog[open]") || !(direction === -1 ? canUndo : canRedo)) return;
      event.preventDefault();
      void travelOperation(direction);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });
  const requestNavigation = (next: Screen, perform = () => navigate(next)) => {
    if (navigationBlocked || saving.current || discardRequest) return;
    if (next.page === "initiative-list" && !preview && hasInitiativeDraftInput(initiativeDraft)) {
      setDiscardRequest({ perform });
      return;
    }
    perform();
  };
  const setPage = (next: Page) => requestNavigation({ ...screen, page: next });
  const startInitiative = () => {
    if (preview || navigationBlocked || saving.current) return;
    setInitiativeDraft(createInitiativeDraft(String(contents.fiscalYear)));
    dismissNotice();
    setPage("initiative-entry");
  };
  const usedAccountIds = new Set(initiativeDraft.rows.flatMap(row => row.accountId === null ? [] : [row.accountId]));
  const changePlan = (change: PlanChange) => mutation.run(async () => { await onChangePlan(change); });
  const kindSelection = (screen: KindScreen) => <KindSelectionSlots screen={screen} selected={contents.kindSelections[screen]} disabled={navigationBlocked}
    onChange={(selected: KindId[]) => {
      if (preview) {
        setPreview({ ...preview, contents: { ...contents, kindSelections: { ...contents.kindSelections, [screen]: selected } } });
        return;
      }
      void changePlan({ type: "selection", screen, selected }).catch(error => setNotice({ message: error instanceof Error ? error.message : "種別の選択を保存できませんでした。", error: true }));
    }} />;
  const changeMaster = (change: AccountChange) => mutation.run(async () => {
    if (change.type === "delete" && usedAccountIds.has(change.id)) throw new Error("施策入力で使用している勘定科目は削除できません。");
    await saveReferencedMaster(change.type === "update" ? { collection: "accounts", id: change.id,
      expected: { ...currentContents.accounts.find(item => item.id === change.id), ...change } } : null, () => onChangeMaster(change));
  });
  const changePeriodTypes = (change: PeriodTypeChange) => mutation.run(async () => {
    if (change.type === "delete" && initiativeDraft.periodTypeId === change.id) throw new Error("施策入力で選択している期間は削除できません。");
    await saveReferencedMaster(change.type === "update" ? { collection: "periodTypes", id: change.id,
      expected: { ...currentContents.periodTypes.find(item => item.id === change.id), ...change } } : null, () => onChangePeriodTypes(change));
  });
  const changeDepartments = (change: DepartmentChange) => mutation.run(async () => {
    if (change.type === "delete" && initiativeDraft.departmentId === change.id) throw new Error("施策入力で選択している部署は削除できません。");
    if (change.type === "update" && change.id === initiativeDraft.departmentId && initiativeDraft.industryId != null && change.industryIds && !change.industryIds.includes(initiativeDraft.industryId)) throw new Error("施策入力で選択している業種は部署から外せません。");
    const saved = await onChangeDepartments(change);
    setInitiativeDraft(draft => {
      const reconciled = reconcileInitiativeDraftReferences(draft, currentContents, saved);
      const ids = saved.departments.find(item => item.id === reconciled.departmentId)?.industryIds ?? [];
      return reconciled === draft && ids.length === 1 && draft.industryId !== ids[0]
        ? { ...draft, industryId: ids[0]! } : reconciled;
    });
  });
  const changeIndustries = (change: IndustryChange) => mutation.run(async () => {
    if (change.type === "delete" && initiativeDraft.industryId === change.id) throw new Error("施策入力で選択している業種は削除できません。");
    await onChangeIndustries(change);
  });
  const changeExpansions = (change: ExpansionChange) => mutation.run(async () => {
    if (change.type === "delete" && initiativeDraft.expansionId === change.id) throw new Error("施策入力で選択している展開名は削除できません。");
    if (change.type === "update" && change.id === initiativeDraft.expansionId && initiativeDraft.expansionCategoryId != null && change.categoryIds && !change.categoryIds.includes(initiativeDraft.expansionCategoryId)) throw new Error("施策入力で選択している展開区分は展開から外せません。");
    await saveReferencedMaster(change.type === "update" ? { collection: "expansions", id: change.id,
      expected: { ...currentContents.expansions.find(item => item.id === change.id), ...change } } : null, () => onChangeExpansions(change));
  });
  const changeExpansionCategories = (change: ExpansionCategoryChange) => mutation.run(async () => {
    if (change.type === "delete" && initiativeDraft.expansionCategoryId === change.id) throw new Error("施策入力で選択している展開区分は削除できません。");
    await saveReferencedMaster(change.type === "update" ? { collection: "expansionCategories", id: change.id,
      expected: { ...currentContents.expansionCategories.find(item => item.id === change.id), ...change } } : null, () => onChangeExpansionCategories(change));
  });
  const changeAggregations = (change: AggregationChange) => mutation.run(async () => { await onChangeAggregations(change); });
  const updateSelected = (target: { id: number; fiscalYear: number | null }, draft: InitiativeEntryDraft) => mutation.run(async () => {
    await onUpdateInitiative(target.id, target.fiscalYear, draft);
  });

  const update = async (draft: InitiativeEntryDraft) => {
    if (!selectedInitiative) throw new Error("施策を選択してください。");
    await updateSelected(selectedInitiative, draft);
  };

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

  const resetScreens = (next: Page) => screens.reset({ page: next, selectedInitiative: null, detailOrigin: "initiative-list" });
  const previewEntry = async (entry: DataHistoryEntry) => {
    if (navigationBlocked || saving.current) return;
    await mutation.run(async () => {
      const past = await onPreviewHistory(entry.id);
      currentScreens.current = screens.snapshot();
      setPreview({ entry, contents: past }); resetScreens("home"); dismissNotice();
    });
  };
  const returnToCurrent = () => {
    if (navigationBlocked || saving.current) return;
    setPreview(null);
    if (currentScreens.current) screens.restore(currentScreens.current);
    else resetScreens("data-history");
    currentScreens.current = null;
  };
  const restorePreview = async () => {
    if (!preview || navigationBlocked || saving.current) return;
    setRestoreError("");
    try {
      // Restoring is the sole write allowed while viewing a past state.
      await restoreMutation.run(async () => { await onRestoreHistory(preview.entry.id); });
      setPreview(null); setRestoreRequested(false); resetScreens("data-history");
      currentScreens.current = null;
      setInitiativeDraft(createInitiativeDraft(String(contents.fiscalYear)));
      setNotice({ message: "選んだ時点に戻しました。復元前の状態も履歴に残っています。", error: false });
    } catch (failure) { setRestoreError(failure instanceof Error ? failure.message : "復元できませんでした。"); }
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
    restoreMutation, setEditPending, openInitiative, menuButton, relationView, sidebar,
    isSidebarOpen, screen, initiativeDraft, setInitiativeDraft, preview, setPreview,
    restoreRequested, setRestoreRequested, restoreError, setRestoreError, contents, currentContents,
    notice, dismissNotice, isSaving, operationMutation, navigationBlocked, discardRequest,
    setDiscardRequest, operationBlocked, travelOperation, requestNavigation, setPage, startInitiative,
    usedAccountIds, changePlan, kindSelection, changeMaster, changePeriodTypes, changeDepartments,
    changeIndustries, changeExpansions, changeExpansionCategories, changeAggregations, update, register,
    resetScreens, previewEntry, returnToCurrent, restorePreview, closeSidebar, screens, fileName,
    dataHistory, historyError, historyBusy, onDeleteHistory, onRetryHistory, onPrepareSave,
    onCloseFile, canUndo, canRedo, operationRevision
  };
}

export type HomeWorkspace = ReturnType<typeof useHomeWorkspace>;
