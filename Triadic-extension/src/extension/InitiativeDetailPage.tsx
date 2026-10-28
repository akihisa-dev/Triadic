import type { KindId } from "../core/domain/kinds";
import type { ExpansionCategory } from "../core/domain/expansionCategoryMaster";
import { type Industry } from "../core/domain/industryMaster";
import { type PeriodType } from "../core/domain/periodMaster";
import { type Department } from "../core/domain/departmentMaster";
import { type Expansion } from "../core/domain/expansionMaster";
import { useLayoutEffect, useRef } from "react";
import { type Account } from "../core/domain/accountMaster";
import { type Initiative, type InitiativeEntryDraft } from "../core/domain/plan";
import { InitiativeEntryPage } from "./InitiativeEntryPage";
import { AutoSaveStatus } from "./AutoSaveStatus";
import { useHistoryReadOnly } from "./HistoryReadOnly";
import { useAutoSave, type AutoSaveProps } from "./useAutoSave";
import type { InitiativeDraftReferences } from "../core/domain/initiativeDraftReferences";
import { initiativeDraft } from "../core/domain/initiativeDraft";

type Props = AutoSaveProps & {
  initiative: Initiative;
  accounts: Account[];
  expansions: Expansion[];
  expansionCategories: ExpansionCategory[];
  departments: Department[];
  periodTypes: PeriodType[];
  industries: Industry[];
  backLabel?: string;
  initialKind?: KindId;
  onUpdate: (draft: InitiativeEntryDraft) => Promise<void>;
  onBack: () => void;
  onOpenMaster: () => void;
  onDuplicate?: () => void;
  duplicationBlocked?: boolean;
  sourceMissing?: boolean;
  onRecoverDraft?: (draft: InitiativeEntryDraft, references: InitiativeDraftReferences, release: () => void) => void;
};

export function InitiativeDetailPage({ initiative, accounts, expansions, expansionCategories, departments, periodTypes, industries, initialKind, backLabel = "施策一覧", onUpdate, onBack, onOpenMaster, onPendingChange, onPrepareSave, onDuplicate, duplicationBlocked = false, sourceMissing = false, onRecoverDraft }: Props) {
  const readOnly = useHistoryReadOnly();
  const autoSave = useAutoSave(onUpdate, onPendingChange);
  const { controller, draft, revision } = autoSave;
  const source = useRef<{ initiative: Initiative; references: InitiativeDraftReferences } | null>(null);
  const received = useRef<Initiative | null>(null);
  const emptyRow = useRef(crypto.randomUUID());
  useLayoutEffect(() => {
    if (received.current !== initiative || !controller.getSnapshot().draft) {
      received.current = initiative;
      controller.syncSaved({ ...initiativeDraft(initiative),
        rows: initiative.rows.length ? initiative.rows : [{ id: emptyRow.current, accountId: null, amounts: {} }] }, `${initiative.id}:${initiative.identity ?? ""}`);
    }
    if (sourceMissing && !controller.hasSourceChange()) controller.syncSaved(initiativeDraft(initiative), `${initiative.id}:deleted`);
    if (!controller.hasSourceChange()) source.current = { initiative,
      references: autoSave.pending && source.current ? source.current.references : { accounts, expansions, expansionCategories, departments, periodTypes, industries } };
  }, [controller, initiative, revision, autoSave.pending, sourceMissing, accounts, expansions, expansionCategories, departments, periodTypes, industries]);
  if (!draft) return null;
  return <InitiativeEntryPage initialKind={initialKind ?? 1} draft={draft} onDraftChange={value => controller.change(value)} accounts={accounts} expansions={expansions} expansionCategories={expansionCategories} departments={departments} periodTypes={periodTypes} industries={industries}
    isSaving={false} onOpenMaster={onOpenMaster} onRegister={() => {}} editing={{
      saving: autoSave.saving, pending: autoSave.pending, onCompositionStart: () => controller.pause(), onCompositionEnd: () => controller.resume(),
      before: <button className="text-button master-back" type="button" disabled={Boolean(autoSave.error)} onClick={onBack}>← {backLabel}へ戻る</button>,
      actions: onDuplicate && <button className="secondary-button" type="button" disabled={readOnly || duplicationBlocked || autoSave.pending || autoSave.saving} onClick={onDuplicate}>複製して新規作成</button>,
      status: <AutoSaveStatus state={autoSave} controller={controller} onPrepareSave={onPrepareSave}
        recovery={controller.hasSourceChange() && onRecoverDraft && <button className="text-button" type="button" disabled={readOnly || autoSave.saving}
          onClick={() => { if (source.current) onRecoverDraft(draft, source.current.references, () => controller.discard()); }}>新規施策として入力を引き継ぐ</button>} />,
    }} />;
}
