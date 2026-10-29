import type { KindId } from "../../core/domain/kinds";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createInitiativeDraft, duplicateInitiativeDraft, hasInitiativeDraftInput } from "../../core/domain/initiativeRules";
import type { Initiative, PlanContents } from "../../core/domain/plan";
import type { InitiativeEntryDraft } from "../../core/domain/plan";
import { recoverInitiativeDraft, type InitiativeDraftReferences } from "../../core/domain/initiativeDraftReferences";
import type { useRetainedInitiativeDraft } from "./useRetainedInitiativeDraft";
import type { useScreenHistory } from "../useScreenHistory";
import type { Page, Screen } from "./types";
import { latestNavigation } from "./latestNavigation";
export function useWorkspaceNavigation(screens: ReturnType<typeof useScreenHistory<Screen>>, contents: PlanContents,
  preview: boolean, navigationBlocked: boolean, editPending: boolean, saving: RefObject<boolean>,
  draft: Pick<ReturnType<typeof useRetainedInitiativeDraft>, "initiativeDraft" | "setInitiativeDraft">, dismissNotice: () => void,
  beforeNavigate: (next: Screen) => Promise<void> = async () => {}, onError: (error: unknown) => void = () => {}) {
  const screen = screens.current;
  const { page } = screen;
  const navigate = screens.navigate;
  const { initiativeDraft, setInitiativeDraft } = draft;
  const navigationState = useRef({ blocked: navigationBlocked, page });
  const callbacks = useRef({ beforeNavigate, onError });
  callbacks.current = { beforeNavigate, onError };
  const [queueNavigation] = useState(() => latestNavigation<Screen>(next => callbacks.current.beforeNavigate(next), error => callbacks.current.onError(error)));
  navigationState.current = { blocked: navigationBlocked, page };
  const [discardRequest, setDiscardRequest] = useState<{ perform: () => void; duplicate?: boolean; recovery?: boolean; dashboard?: boolean } | null>(null);
  const { initiatives } = contents;
  const latestContents = useRef(contents);
  latestContents.current = contents;
  useEffect(() => {
    if (screen.page === "initiative-detail" && editPending &&
      !initiatives.some(item => item.id === screen.selectedInitiative?.id && item.fiscalYear === screen.selectedInitiative?.fiscalYear)) return;
    screens.prune(entry => entry.page !== "initiative-detail" || initiatives.some(item => item.id === entry.selectedInitiative?.id && item.fiscalYear === entry.selectedInitiative?.fiscalYear),
      { phase: screen.phase, page: "home", selectedInitiative: null, detailOrigin: "initiative-list" });
  }, [initiatives, screens.prune, screen.page, screen.selectedInitiative?.id, screen.selectedInitiative?.fiscalYear, editPending]);
  const openInitiative = (initiative: Initiative, kind?: KindId) => {
    if (navigationState.current.blocked || navigationState.current.page !== page) return;
    dismissNotice();
    requestNavigation({
      page: "initiative-detail",
      detailVisit: crypto.randomUUID(),
      phase: screen.phase,
      detailKind: screen.phase ?? kind ?? 1,
      detailOrigin: page === "dashboard" ? "dashboard" : page === "cost-table" ? "cost-table" : page === "home" ? "home" : page === "expansion-table" ? "expansion-table" : "initiative-list",
      selectedInitiative: { id: initiative.id, fiscalYear: initiative.fiscalYear },
    });
  };
  const requestNavigation = (next: Screen, perform = () => navigate(next)) => {
    if (navigationBlocked || discardRequest) return;
    if ((next.page === "initiative-list" || (page === "work-selection" && next.page === "dashboard")) && !preview && hasInitiativeDraftInput(initiativeDraft)) {
      setDiscardRequest({ perform: () => queueNavigation(next, perform), dashboard: next.page === "dashboard" });
      return;
    }
    queueNavigation(next, perform);
  };
  const setPage = (next: Page) => requestNavigation({ ...screen, page: next });
  const startInitiative = () => {
    if (preview || navigationBlocked) return;
    setInitiativeDraft(createInitiativeDraft(String(contents.fiscalYear)));
    dismissNotice();
    setPage("initiative-entry");
  };
  const duplicateInitiative = (source: Initiative) => {
    if (preview || navigationState.current.blocked || navigationState.current.page !== page || saving.current || discardRequest) return;
    const perform = () => {
      setInitiativeDraft(duplicateInitiativeDraft(source, initiatives));
      dismissNotice();
      navigate({ phase: screen.phase, page: "initiative-entry", selectedInitiative: null, detailOrigin: "initiative-list" });
    };
    if (hasInitiativeDraftInput(initiativeDraft)) setDiscardRequest({ perform, duplicate: true });
    else perform();
  };
  const recoverInitiative = (input: InitiativeEntryDraft, references: InitiativeDraftReferences, release: () => void) => {
    if (preview || saving.current || discardRequest) return;
    const perform = () => {
      // Transfer first, then release the protected editor. No file write happens here.
      setInitiativeDraft(recoverInitiativeDraft(input, references, latestContents.current));
      release(); dismissNotice();
      navigate({ phase: screen.phase, page: "initiative-entry", selectedInitiative: null, detailOrigin: "initiative-list" });
    };
    if (hasInitiativeDraftInput(initiativeDraft)) setDiscardRequest({ perform, recovery: true });
    else perform();
  };
  return { discardRequest, setDiscardRequest, openInitiative, requestNavigation, setPage, startInitiative, duplicateInitiative, recoverInitiative };
}
