import { useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { reconcileInitiativeDraftReferences, type LocalDraftReference } from "../../core/domain/initiativeDraftReferences";
import { createInitiativeDraft } from "../../core/domain/initiativeRules";
import type { PlanContents } from "../../core/domain/plan";
export function useRetainedInitiativeDraft(currentContents: PlanContents, setNotice: Dispatch<SetStateAction<{ message: string; error: boolean }>>) {
  const [initiativeDraft, setInitiativeDraft] = useState(() => createInitiativeDraft(String(currentContents.fiscalYear)));
  const draftContents = useRef(currentContents);
  const localDraftReference = useRef<LocalDraftReference | null>(null);
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
  const usedAccountIds = new Set(initiativeDraft.rows.flatMap(row => row.accountId === null ? [] : [row.accountId]));
  return { initiativeDraft, setInitiativeDraft, saveReferencedMaster, usedAccountIds };
}
