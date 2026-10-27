import { reconcileInitiativeDraftReferences } from "../../core/domain/initiativeDraftReferences";
import type { AccountChange } from "../../core/domain/accountMaster";
import type { AggregationChange } from "../../core/domain/aggregationMaster";
import type { PeriodTypeChange } from "../../core/domain/periodMaster";
import type { DepartmentChange } from "../../core/domain/departmentMaster";
import type { IndustryChange } from "../../core/domain/industryMaster";
import type { ExpansionChange } from "../../core/domain/expansionMaster";
import type { ExpansionCategoryChange } from "../../core/domain/expansionCategoryMaster";
import type { InitiativeEntryDraft, PlanContents } from "../../core/domain/plan";
import type { HomePageProps, Screen } from "./types";
import type { useMutation } from "../useMutation";
import type { useRetainedInitiativeDraft } from "./useRetainedInitiativeDraft";
export function useWorkspaceCommands(props: Pick<HomePageProps, "onChangeMaster" | "onChangePeriodTypes" | "onChangeDepartments" | "onChangeIndustries" | "onChangeExpansions" | "onChangeExpansionCategories" | "onChangeAggregations" | "onUpdateInitiative">,
  mutation: ReturnType<typeof useMutation>, currentContents: PlanContents,
  draft: ReturnType<typeof useRetainedInitiativeDraft>, selectedInitiative: Screen["selectedInitiative"]) {
  const { onChangeMaster, onChangePeriodTypes, onChangeDepartments, onChangeIndustries, onChangeExpansions, onChangeExpansionCategories, onChangeAggregations, onUpdateInitiative } = props;
  const { initiativeDraft, setInitiativeDraft, saveReferencedMaster, usedAccountIds } = draft;
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
    await saveReferencedMaster(change.type === "update" ? { collection: "expansions", id: change.id,
      expected: { ...currentContents.expansions.find(item => item.id === change.id), ...change } } : null, () => onChangeExpansions(change));
  });
  const changeExpansionCategories = (change: ExpansionCategoryChange) => mutation.run(async () => {
    if (change.type === "delete" && initiativeDraft.expansionCategoryId === change.id) throw new Error("施策入力で選択している展開区分は削除できません。");
    if (change.type === "update" && initiativeDraft.expansionCategoryId === change.id && initiativeDraft.expansionId !== change.expansionId) throw new Error("施策入力で選択している展開区分は所属する展開名を変更できません。");
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

  return { changeMaster, changePeriodTypes, changeDepartments, changeIndustries, changeExpansions, changeExpansionCategories, changeAggregations, update };
}
