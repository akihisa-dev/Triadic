import { useMemo, useRef } from "react";
import { ExpansionCategoryMasterPage } from "./ExpansionCategoryMasterPage";
import { DeferredSpreadsheetIOPage } from "./DeferredSpreadsheetIOPage";
import { PreviousInputPage } from "./PreviousInputPage";
import { AmountItemMasterPage } from "./AmountItemMasterPage";
import { AccountTypeMasterPage } from "./AccountTypeMasterPage";
import { KindMasterPage } from "./KindMasterPage";
import { PeriodMasterPage } from "./PeriodMasterPage";
import { DepartmentMasterPage } from "./DepartmentMasterPage";
import { ExpansionTablePage } from "./ExpansionTablePage";
import { IndustryMasterPage } from "./IndustryMasterPage";
import { ExpansionMasterPage } from "./ExpansionMasterPage";
import { InitiativeEntryPage } from "./InitiativeEntryPage";
import { InitiativeListPage } from "./InitiativeListPage";
import { InitiativeDetailPage } from "./InitiativeDetailPage";
import { MasterPage } from "./MasterPage";
import { AggregationMasterPage } from "./AggregationMasterPage";
import { AccountMasterPage } from "./AccountMasterPage";
import { CostTablePage } from "./CostTablePage";
import { DataHistoryPage } from "./DataHistoryPage";
import { HomeRelationsPage } from "./HomeRelationsPage";
import type { HomeWorkspace, Screen } from "./useHomeWorkspace";
import type { Initiative } from "../core/domain/plan";

/** Render the screen retained by FadeSwap using the latest published contents. */
export function WorkspacePage({ displayed, workspace }: { displayed: Screen; workspace: HomeWorkspace }) {
  const {
    contents, dataHistory, navigationBlocked, historyError, previewEntry, onDeleteHistory,
    onRetryHistory, isSaving, historyBusy, operationMutation, changePlan, setEditPending,
    onPrepareSave, relationView, dismissNotice, setPage, initiativeDraft, setInitiativeDraft,
    register, update, startInitiative, kindSelection, openInitiative, changePeriodTypes,
    changeDepartments, changeIndustries, changeExpansionCategories, changeExpansions, changeAggregations, usedAccountIds,
    changeMaster
  } = workspace;
  const { accounts, initiatives } = contents;
  const costContents = useMemo(() => ({ ...contents, previousKind: workspace.localPrevious["cost-table"] }), [contents, workspace.localPrevious["cost-table"]]);
  const expansionContents = useMemo(() => ({ ...contents, previousKind: workspace.localPrevious["expansion-table"] }), [contents, workspace.localPrevious["expansion-table"]]);

  const { selectedInitiative, detailOrigin } = displayed;
  const currentInitiative = initiatives.find(item => item.id === selectedInitiative?.id && item.fiscalYear === selectedInitiative?.fiscalYear);
  const lastDetail = useRef<Initiative | null>(null);
  if (currentInitiative) lastDetail.current = currentInitiative;
  const retainedInitiative = currentInitiative ?? (lastDetail.current?.id === selectedInitiative?.id && lastDetail.current?.fiscalYear === selectedInitiative?.fiscalYear ? lastDetail.current : null);
  switch (displayed.page) {
    case "data-history": return <DataHistoryPage onCompare={workspace.onCompareHistory} entries={dataHistory.entries} busy={navigationBlocked} error={historyError} onPreview={previewEntry} onDelete={onDeleteHistory} onRetry={onRetryHistory} onPrepareSave={onPrepareSave} />;
    case "spreadsheet-io": return <DeferredSpreadsheetIOPage contents={contents} busy={isSaving || historyBusy || operationMutation.busy} onChangePlan={changePlan} onPendingChange={setEditPending} onController={workspace.setIOController} onPrepareSave={onPrepareSave} />;
    case "previous-input": return <PreviousInputPage contents={contents} onSave={input => changePlan({ type: "previous", input })} onPendingChange={setEditPending} onPrepareSave={onPrepareSave} />;
    case "home": return <HomeRelationsPage view={relationView} disabled={navigationBlocked} onNavigate={target => { dismissNotice(); setPage(target); }} />;
    case "initiative-entry": return <InitiativeEntryPage onBack={() => setPage("initiative-list")} draft={initiativeDraft} onDraftChange={setInitiativeDraft} accounts={accounts} expansions={contents.expansions} expansionCategories={contents.expansionCategories} departments={contents.departments} periodTypes={contents.periodTypes} industries={contents.industries} onOpenMaster={() => setPage("account-master")} isSaving={isSaving} onRegister={() => { void register(); }} />;
    case "initiative-detail": return retainedInitiative && <InitiativeDetailPage onRecoverDraft={workspace.recoverInitiative} onDuplicate={() => workspace.duplicateInitiative(retainedInitiative)} duplicationBlocked={navigationBlocked || !currentInitiative} sourceMissing={!currentInitiative} key={`${retainedInitiative.id}:${displayed.detailKind ?? 1}:${displayed.detailVisit ?? ""}`} initialKind={displayed.detailKind ?? 1} initiative={retainedInitiative} accounts={accounts} expansions={contents.expansions} expansionCategories={contents.expansionCategories} departments={contents.departments} periodTypes={contents.periodTypes} industries={contents.industries} onOpenMaster={() => setPage("account-master")} onUpdate={update} onPendingChange={setEditPending} onPrepareSave={onPrepareSave} backLabel={detailOrigin === "cost-table" ? "総原価表" : detailOrigin === "home" ? "Home" : detailOrigin === "expansion-table" ? "展開表" : "施策一覧"} onBack={() => setPage(detailOrigin)} />;
    case "initiative-list": return <InitiativeListPage expansions={contents.expansions} periodTypes={contents.periodTypes} onAddInitiative={startInitiative} selectedKind={workspace.localKinds["initiative-list"][0]!} selection={kindSelection("initiative-list")} initiatives={initiatives} accounts={accounts} fiscalYear={String(contents.fiscalYear)} onOpenInitiative={openInitiative} navigationBlocked={navigationBlocked} />;
    case "cost-table": return <CostTablePage view={workspace.costTableView} navigationBlocked={navigationBlocked} onOpenInitiative={openInitiative} selection={kindSelection("cost-table")} contents={costContents} selected={workspace.localKinds["cost-table"]} />;
    case "expansion-table": return <ExpansionTablePage selection={kindSelection("expansion-table")} contents={expansionContents} selected={workspace.localKinds["expansion-table"]} onOpenInitiative={openInitiative} />;
    case "master": return <MasterPage onOpenAggregations={() => setPage("aggregation-master")} onOpenAmountItems={() => setPage("amount-item-master")} onOpenAccountTypes={() => setPage("account-type-master")} onOpenAccounts={() => setPage("account-master")} onOpenExpansions={() => setPage("expansion-master")} onOpenExpansionCategories={() => setPage("expansion-category-master")} onOpenIndustries={() => setPage("industry-master")} onOpenDepartments={() => setPage("department-master")} onOpenPeriods={() => setPage("period-master")} onOpenKinds={() => setPage("kind-master")} />;
    case "amount-item-master": return <AmountItemMasterPage isSaving={isSaving} onBack={() => setPage("master")} />;
    case "account-type-master": return <AccountTypeMasterPage isSaving={isSaving} onBack={() => setPage("master")} />;
    case "kind-master": return <KindMasterPage kinds={contents.kinds} isSaving={isSaving} onBack={() => setPage("master")} />;
    case "period-master": return <PeriodMasterPage periodTypes={contents.periodTypes} isSaving={isSaving} onPendingChange={setEditPending} onPrepareSave={onPrepareSave} onChange={changePeriodTypes} onBack={() => setPage("master")} />;
    case "department-master": return <DepartmentMasterPage industries={contents.industries} departments={contents.departments} isSaving={isSaving} onPendingChange={setEditPending} onPrepareSave={onPrepareSave} onChange={changeDepartments} onBack={() => setPage("master")} />;
    case "industry-master": return <IndustryMasterPage industries={contents.industries} isSaving={isSaving} onPendingChange={setEditPending} onPrepareSave={onPrepareSave} onChange={changeIndustries} onBack={() => setPage("master")} />;
    case "expansion-category-master": return <ExpansionCategoryMasterPage expansionCategories={contents.expansionCategories} usedIds={new Set([...contents.expansions.flatMap(item => item.categoryIds ?? []), ...initiatives.flatMap(item => item.expansionCategoryId == null ? [] : [item.expansionCategoryId]), ...(initiativeDraft.expansionCategoryId == null ? [] : [initiativeDraft.expansionCategoryId])])} isSaving={isSaving} onPendingChange={setEditPending} onPrepareSave={onPrepareSave} onChange={changeExpansionCategories} onBack={() => setPage("master")} />;
    case "expansion-master": return <ExpansionMasterPage usedExpansionIds={new Set([...initiatives.map(item => item.expansionId), initiativeDraft.expansionId].filter((id): id is number => id !== null))} expansions={contents.expansions} expansionCategories={contents.expansionCategories} isSaving={isSaving} onPendingChange={setEditPending} onPrepareSave={onPrepareSave} onChange={changeExpansions} onBack={() => setPage("master")} />;
    case "aggregation-master": return <AggregationMasterPage onPendingChange={setEditPending} onPrepareSave={onPrepareSave} accounts={accounts} groups={contents.aggregations} isSaving={isSaving} onChange={changeAggregations} onBack={() => setPage("master")} />;
    case "account-master": return <AccountMasterPage accounts={accounts} groups={contents.aggregations} onChangeAggregations={changeAggregations} usedAccountIds={usedAccountIds} isSaving={isSaving} onPendingChange={setEditPending} onPrepareSave={onPrepareSave} onChange={changeMaster} onBack={() => setPage("master")} />;
  }
}
