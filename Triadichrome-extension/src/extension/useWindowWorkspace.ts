import { useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { hasInitiativeDraftInput, createInitiativeDraft } from "../core/domain/initiativeRules";
import { WindowViewContext, captureWindowScroll, restoreWindowScroll } from "./windowView";
import { cloneWindowView } from "./windowViewClone";
import type { WindowPlanSession } from "./WindowPlanSession";
import type { HomeWorkspace } from "./useHomeWorkspace";
import { pageMetadata } from "./pageMetadata";


const defaultInfo = { number: 1, peers: 1, settling: false };
const noopSubscribe = () => () => {};

export function useWindowWorkspace(session: WindowPlanSession | undefined, workspace: HomeWorkspace) {
  const info = useSyncExternalStore(session?.subscribeWindows ?? noopSubscribe, session?.getWindowSnapshot ?? (() => defaultInfo));
  const values = useContext(WindowViewContext);
  const latest = useRef(workspace);
  latest.current = workspace;
  const [discardLabels, setDiscardLabels] = useState<string | null>(null);
  const confirm = useRef<((accepted: boolean) => void) | null>(null);
  const pageLabel = pageMetadata[workspace.screen.page].name;
  const label = `ウィンドウ${info.number} · ${pageLabel}`;
  useEffect(() => {
    document.title = `${label} — ${workspace.fileName} — Triadichrome`;
    session?.label(pageLabel);
  }, [session, label, pageLabel, workspace.fileName]);
  useLayoutEffect(() => {
    const scroll = session?.getWindowSnapshot().initialView?.scroll;
    if (scroll?.length) return restoreWindowScroll(scroll);
    return;
  }, [session]);
  useLayoutEffect(() => session?.registerControls({
    processing: () => {
      const phase = latest.current.ioController.current?.getSnapshot().phase;
      return phase === "reading" || phase === "saving" || phase === "exporting";
    },
    draft: _history => latest.current.ioController.current?.getSnapshot().phase === "preview" || hasInitiativeDraftInput(latest.current.initiativeDraft) || [...document.querySelectorAll<HTMLInputElement>("form input:not([type=checkbox]):not([type=radio]):not([type=hidden]), form textarea")].some(input => input.value.trim() !== ""),
    discard: () => {
      latest.current.setInitiativeDraft(createInitiativeDraft(String(latest.current.currentContents.fiscalYear)));
      latest.current.ioController.current?.cancelPreview();
    },
    confirmDiscard: labels => new Promise(resolve => { confirm.current = resolve; setDiscardLabels(labels); }),
    close: () => { /* The session closes this window after every input has been settled. */ },
  }), [session]);
  useEffect(() => () => { confirm.current?.(false); confirm.current = null; }, []);
  const finishDiscard = (accepted: boolean) => { confirm.current?.(accepted); confirm.current = null; setDiscardLabels(null); };
  const duplicate = () => {
    if (!session || workspace.preview || workspace.screen.page === "data-history") return;
    try {
      session.duplicate(cloneWindowView({ screen: workspace.screen, costTable: workspace.costTableView.current,
        relation: workspace.relationView.current, values: { ...values }, scroll: captureWindowScroll() }));
    } catch (failure) { workspace.showError(failure); }
  };
  return { label, duplicate, settling: info.settling, discardLabels, finishDiscard };
}
