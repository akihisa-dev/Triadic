import { useEffect, useRef, useState, type RefObject } from "react";
import { createInitiativeDraft, hasInitiativeDraftInput } from "../../core/domain/initiativeRules";
import type { Initiative, PlanContents } from "../../core/domain/plan";
import type { useRetainedInitiativeDraft } from "./useRetainedInitiativeDraft";
import type { useScreenHistory } from "../useScreenHistory";
import type { Page, Screen } from "./types";
export function useWorkspaceNavigation(screens: ReturnType<typeof useScreenHistory<Screen>>, contents: PlanContents,
  preview: boolean, navigationBlocked: boolean, saving: RefObject<boolean>,
  draft: Pick<ReturnType<typeof useRetainedInitiativeDraft>, "initiativeDraft" | "setInitiativeDraft">, dismissNotice: () => void) {
  const screen = screens.current;
  const { page } = screen;
  const navigate = screens.navigate;
  const { initiativeDraft, setInitiativeDraft } = draft;
  const navigationState = useRef({ blocked: navigationBlocked, page });
  navigationState.current = { blocked: navigationBlocked, page };
  const [discardRequest, setDiscardRequest] = useState<{ perform: () => void } | null>(null);
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
  return { discardRequest, setDiscardRequest, openInitiative, requestNavigation, setPage, startInitiative };
}
