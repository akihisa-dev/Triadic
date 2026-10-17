import { useMemo, useRef, useState } from "react";
import { createTrialBudget, trialReportContents, updateTrialInitiative, toggleTrialInitiative, type TrialBudget } from "../../core/domain/trialBudget";
import type { HomePageProps } from "./types";

type History = { current: TrialBudget; undo: TrialBudget[]; redo: TrialBudget[]; revision: number };
const unavailable = async (): Promise<never> => { throw new Error("この操作は予算に戻ってから行ってください。"); };
export function useTrialBudget(original: HomePageProps) {
  const [history, setHistory] = useState<History | null>(null);
  const current = useRef(history);
  const publish = (next: History | null) => { current.current = next; setHistory(next); };
  const get = () => { if (!current.current) throw new Error("試算は終了しています。"); return current.current; };
  const change = (update: (trial: TrialBudget) => TrialBudget) => {
    const state = get();
    const next = update(state.current);
    if (next !== state.current) publish({ current: next, undo: [...state.undo.slice(-99), state.current], redo: [], revision: state.revision });
    return next.contents;
  };
  const start = () => { publish({ current: createTrialBudget(original.initialContents), undo: [], redo: [], revision: 0 }); original.onTrialActiveChange?.(true); };
  const end = () => { publish(null); original.onTrialActiveChange?.(false); };
  const props: HomePageProps = history ? {
    ...original, initialContents: history.current.contents,
    onUpdateInitiative: async (id, _year, draft) => change(trial => updateTrialInitiative(trial, id, draft)),
    onChangePlan: async change => {
      if (change.type !== "selection") return unavailable();
      const state = get();
      const contents = { ...state.current.contents, kindSelections: { ...state.current.contents.kindSelections, [change.screen]: [...change.selected] } };
      publish({ ...state, current: { ...state.current, contents } });
      return contents;
    },
    onPrepareSave: async () => { get(); },
    onChangeMaster: unavailable, onChangeAggregations: unavailable, onChangeExpansions: unavailable,
    onChangeExpansionCategories: unavailable, onChangeIndustries: unavailable, onChangeDepartments: unavailable,
    onChangePeriodTypes: unavailable, onRegisterInitiative: unavailable, onSaveAs: unavailable,
    onCompareHistory: unavailable, onPreviewHistory: unavailable, onRestoreHistory: unavailable,
    onDeleteHistory: unavailable, onRetryHistory: unavailable, onCloseFile: () => {},
    historyError: "", historyBusy: false, canUndo: history.undo.length > 0, canRedo: history.redo.length > 0,
    operationRevision: history.revision,
    onTravelOperation: async direction => {
      const state = get();
      const stack = direction === -1 ? state.undo : state.redo;
      const target = stack.at(-1);
      if (!target) return state.current.contents;
      const next = { ...target, contents: { ...target.contents, kindSelections: state.current.contents.kindSelections } };
      publish({ current: next, revision: state.revision + 1,
        undo: direction === -1 ? stack.slice(0, -1) : [...state.undo, state.current],
        redo: direction === 1 ? stack.slice(0, -1) : [...state.redo, state.current] });
      return next.contents;
    }
  } : original;
  const reports = useMemo(() => history ? trialReportContents(history.current) : original.initialContents, [history, original.initialContents]);
  return { props, active: history !== null, start, end, reports, excluded: history?.current.excluded ?? [],
    toggle: (id: number) => { change(trial => toggleTrialInitiative(trial, id)); } };
}
