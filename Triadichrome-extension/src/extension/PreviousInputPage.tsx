import { PreviousKindSelection } from "./PreviousKindSelection";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { useHistoryReadOnly } from "./HistoryReadOnly";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowViewState } from "./windowView";
import { createPreviousInput } from "../core/domain/previousAmounts";
import { type PlanContents } from "../core/domain/plan";
import { filterPlan } from "../core/tables/planTables";
import { PreviousAmountGrid } from "./PreviousAmountGrid";
import "./PreviousInputPage.css";
import type { PreviousKind, PreviousInput } from "../core/domain/kinds";
import { useAutoSave, type AutoSaveProps } from "./useAutoSave";
import { AutoSaveStatus } from "./AutoSaveStatus";

type Props = AutoSaveProps & { contents: PlanContents; onSave: (input: PreviousInput) => Promise<void> };
export function PreviousInputPage({ contents, onSave, onPendingChange, onPrepareSave }: Props) {
  const readOnly = useHistoryReadOnly();
  const [previousKind, setPreviousKind] = useWindowViewState<PreviousKind>("previous:kind", 1);
  const [copyRequested, setCopyRequested] = useState(false);
  const [industryIds, setIndustries] = useWindowViewState<number[]>("previous:industries", []);
  const [departmentIds, setDepartments] = useWindowViewState<number[]>("previous:departments", []);
  const industryId = industryIds.length === 1 ? industryIds[0]! : null;
  const departmentId = departmentIds.length === 1 ? departmentIds[0]! : null;
  const validPair = industryId !== null && departmentId !== null && contents.departments.some(item => item.id === departmentId && item.industryIds.includes(industryId));
  const allowedIndustries = contents.departments.filter(item => !departmentIds.length || departmentIds.includes(item.id)).flatMap(item => item.industryIds);
  const autoSave = useAutoSave(onSave, onPendingChange);
  const { controller, draft, revision } = autoSave;
  const savedSource = useRef<PlanContents | null>(null);
  useLayoutEffect(() => {
    if (validPair && industryId !== null && departmentId !== null && (savedSource.current !== contents || !controller.getSnapshot().draft)) {
      savedSource.current = contents;
      controller.syncSaved(createPreviousInput(contents, industryId, departmentId, previousKind));
    }
    if (controller.getSnapshot().pending) return;
    const departments = departmentIds.filter(id => contents.departments.some(item => item.id === id));
    const allowed = new Set(contents.departments.filter(item => !departments.length || departments.includes(item.id)).flatMap(item => item.industryIds));
    const industries = industryIds.filter(id => allowed.has(id) && contents.industries.some(item => item.id === id));
    if (departments.length !== departmentIds.length || industries.length !== industryIds.length) {
      controller.end(); setDepartments(departments); setIndustries(industries); return;
    }
    if (!validPair || industryId === null || departmentId === null || controller.getSnapshot().draft) return;
    controller.begin(createPreviousInput(contents, industryId, departmentId, previousKind));
  }, [controller, contents, industryIds, departmentIds, industryId, departmentId, validPair, previousKind, revision]);
  const filtered = useMemo(() => filterPlan({ ...contents, previousKind }, {
    industries: industryIds.length ? industryIds : null, departments: departmentIds.length ? departmentIds : null,
  }), [contents, industryIds, departmentIds, previousKind]);
  return <main className="initiative-entry-page previous-input-page" aria-labelledby="previous-input-title" onCompositionStart={() => controller.pause()} onCompositionEnd={() => controller.resume()}>
    <div className="initiative-list-heading">
      <h1 id="previous-input-title">前年入力</h1>
      <PreviousKindSelection id="previous-input-kind" label="前年" value={previousKind} disabled={autoSave.pending || copyRequested}
        onChange={value => { if (value === previousKind) return; controller.end(); savedSource.current = null; setPreviousKind(value); }} />
      {previousKind === 2 && <button type="button" className="secondary-button previous-copy-button" aria-label="前年見込からコピー"
        disabled={readOnly || !validPair || autoSave.pending || copyRequested} onClick={() => setCopyRequested(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>
      </button>}
      <div className="initiative-classification-row">
        <div className="classification-field">
          <label htmlFor="previous-department">部署名</label>
          <select id="previous-department" value={departmentId ?? ""} disabled={autoSave.pending}
            onChange={event => {
              const value = event.target.value === "" ? [] : [Number(event.target.value)];
              controller.end(); setDepartments(value);
              const ids = contents.departments.filter(item => !value.length || value.includes(item.id)).flatMap(item => item.industryIds);
              setIndustries(current => value.length === 1 && ids.length === 1 ? ids : current.filter(id => ids.includes(id)));
            }}>
            <option value="">全部署の合計</option>
            {contents.departments.map(item => <option key={item.id} value={item.id}>{item.departmentName}</option>)}
          </select>
        </div>
        <div className="classification-field">
          <label htmlFor="previous-industry">業種名</label>
          <select id="previous-industry" value={industryId ?? ""} disabled={autoSave.pending}
            onChange={event => { controller.end(); setIndustries(event.target.value === "" ? [] : [Number(event.target.value)]); }}>
            <option value="">全業種の合計</option>
            {contents.industries.filter(item => allowedIndustries.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.industryName}</option>)}
          </select>
        </div>
      </div>
      <AutoSaveStatus state={autoSave} controller={controller} onPrepareSave={onPrepareSave} />
    </div>
    <PreviousAmountGrid key={`${previousKind}:${industryIds.join(",")}:${departmentIds.join(",")}`} contents={filtered} draft={!readOnly && validPair ? draft ?? undefined : undefined} onChange={value => controller.change(value)} />
    <ConfirmationDialog open={copyRequested} title="前年見込からコピー" message={`${contents.departments.find(item => item.id === departmentId)?.departmentName ?? ""}・${contents.industries.find(item => item.id === industryId)?.industryName ?? ""}の12か月分を前年見込から前年実績へコピーします。入力済みの前年実績は上書きされます。`} confirmLabel="コピー" busy={autoSave.pending}
      onCancel={() => setCopyRequested(false)} onConfirm={() => {
        if (readOnly || !validPair || industryId === null || departmentId === null) return;
        setCopyRequested(false);
        controller.change({ ...createPreviousInput(contents, industryId, departmentId, 1), previousKind: 2 });
      }} />
  </main>;
}
