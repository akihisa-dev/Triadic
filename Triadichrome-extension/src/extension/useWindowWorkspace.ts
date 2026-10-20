import { useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { hasInitiativeDraftInput, createInitiativeDraft } from "../core/domain/initiativeRules";
import { WindowViewContext, captureWindowScroll, restoreWindowScroll } from "./windowView";
import type { WindowPlanSession } from "./WindowPlanSession";
import type { HomeWorkspace } from "./useHomeWorkspace";
import type { Page } from "./workspace/types";

const labels: Record<Page, string> = {
  home: "Home", "initiative-list": "施策一覧", "initiative-entry": "施策入力", "initiative-detail": "施策詳細",
  "cost-table": "総原価表", "expansion-table": "展開表", "previous-input": "前年入力", "spreadsheet-io": "入出力",
  "data-history": "履歴", master: "マスタ", "account-master": "勘定科目マスタ", "aggregation-master": "集計マスタ",
  "expansion-master": "展開マスタ", "expansion-category-master": "展開区分マスタ", "industry-master": "業種マスタ",
  "department-master": "部署マスタ", "period-master": "期間マスタ", "kind-master": "種別マスタ",
  "account-type-master": "科目属性マスタ", "amount-item-master": "金額項目マスタ", details: "明細", "detail-editor": "明細入力",
};
const defaultInfo = { number: 1, peers: 1, settling: false };
const noopSubscribe = () => () => {};

export function useWindowWorkspace(session: WindowPlanSession | undefined, workspace: HomeWorkspace) {
  const info = useSyncExternalStore(session?.subscribeWindows ?? noopSubscribe, session?.getWindowSnapshot ?? (() => defaultInfo));
  const values = useContext(WindowViewContext);
  const latest = useRef(workspace);
  latest.current = workspace;
  const [discardLabels, setDiscardLabels] = useState<string | null>(null);
  const confirm = useRef<((accepted: boolean) => void) | null>(null);
  const pageLabel = labels[workspace.screen.page];
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
    draft: () => hasInitiativeDraftInput(latest.current.initiativeDraft) || [...document.querySelectorAll<HTMLInputElement>("form input:not([type=checkbox]):not([type=radio]):not([type=hidden]), form textarea")].some(input => input.value.trim() !== ""),
    discard: () => latest.current.setInitiativeDraft(createInitiativeDraft(String(latest.current.currentContents.fiscalYear))),
    confirmDiscard: labels => new Promise(resolve => { confirm.current = resolve; setDiscardLabels(labels); }),
    close: () => { /* The session closes this window after every input has been settled. */ },
  }), [session]);
  useEffect(() => () => { confirm.current?.(false); confirm.current = null; }, []);
  const finishDiscard = (accepted: boolean) => { confirm.current?.(accepted); confirm.current = null; setDiscardLabels(null); };
  const duplicate = () => {
    if (!session || workspace.preview || workspace.screen.page === "data-history") return;
    try {
      session.duplicate({ screen: workspace.screen, costTable: workspace.costTableView.current,
        relation: workspace.relationView.current, values: { ...values }, scroll: captureWindowScroll() });
    } catch (failure) { workspace.showError(failure); }
  };
  return { label, duplicate, settling: info.settling, discardLabels, finishDiscard };
}
