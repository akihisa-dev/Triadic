import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./DetailsPage.css";
import { useAutoSave, type AutoSaveProps } from "./useAutoSave";
import { AutoSaveStatus } from "./AutoSaveStatus";
import { useHistoryReadOnly } from "./HistoryReadOnly";
import type { DetailDocument } from "../core/domain/detailDocuments";
import type { Initiative } from "../core/domain/plan";
import { DetailPartsCanvas } from "./DetailPartsCanvas";


export function DetailsPage({ documents, disabled, onCreate, onOpen }: {
  documents: DetailDocument[];
  disabled: boolean;
  onCreate: (name: string) => Promise<void>;
  onOpen: (id: string) => void;
}) {
  const readOnly = useHistoryReadOnly();
  const [adding, setAdding] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <main className="master-page details-page" aria-labelledby="details-title">
    <div className="details-heading">
      <h1 id="details-title">明細</h1>
      <button ref={trigger} type="button" className="primary-button" disabled={disabled || readOnly} onClick={() => setAdding(true)}>＋ 明細を追加</button>
    </div>
    <div className="initiative-list-container details-list-container">
      <table className="initiative-list-table details-table" aria-label="明細一覧">
        <thead><tr><th scope="col">明細名</th></tr></thead>
        <tbody>{documents.map(item => <tr key={item.id}>
          <th scope="row"><button type="button" className="initiative-name-button" disabled={disabled}
            onClick={() => onOpen(item.id)} aria-label={`${item.name}を開く`}>{item.name}</button></th>
        </tr>)}</tbody>
      </table>
    </div>
    {adding && <DetailCreateDialog disabled={disabled} returnFocus={trigger.current} onCancel={() => setAdding(false)}
      onCreate={async name => { if (!disabled) { await onCreate(name); setAdding(false); } }} />}
  </main>;
}

function DetailCreateDialog({ disabled, onCancel, onCreate, returnFocus }: {
  disabled: boolean;
  onCancel: () => void;
  onCreate: (name: string) => Promise<void>;
  returnFocus: HTMLElement | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const title = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = disabled || saving;
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    nameInput.current?.focus();
    return () => { element.close(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); };
  }, [returnFocus]);
  return createPortal(<dialog ref={dialog} className="confirmation-dialog detail-create-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}
    onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!busy) onCancel(); }
      if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
    }}>
    <form onSubmit={event => {
      event.preventDefault();
      if (!busy && name.trim()) {
        setSaving(true); setError("");
        void onCreate(name.trim()).catch(reason => { setError(reason instanceof Error ? reason.message : "明細を保存できませんでした。入力は保持しています。"); setSaving(false); });
      }
    }}>
      <h2 id={title}>明細を追加</h2>
      <label className="detail-create-field">明細名<input ref={nameInput} required value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>
      <div className="form-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>キャンセル</button>
        <button type="submit" className="primary-button" disabled={busy || !name.trim()}>次へ</button>
      </div>
      {error && <p role="alert">{error} 入力内容は残っています。</p>}
    </form>
  </dialog>, document.body);
}

export function DetailEditorPage({ document, disabled, onBack, onSave, onPendingChange, onPrepareSave, initiatives, onOpenInitiative }: AutoSaveProps & {
  document: DetailDocument | undefined; disabled: boolean; onBack: () => void; onSave: (document: DetailDocument) => Promise<void>;
  initiatives: readonly Initiative[]; onOpenInitiative: (initiative: Initiative) => void;
}) {
  const readOnly = useHistoryReadOnly();
  const autoSave = useAutoSave<DetailDocument>(async draft => {
    if (!document || readOnly) throw new Error("この明細は編集できません。");
    await onSave(draft);
  }, onPendingChange);
  const { controller, revision } = autoSave;
  useLayoutEffect(() => {
    if (!document) return;
    const state = controller.getSnapshot();
    // Keep the saved revision of unfinished edits. Conflicting writes must be rejected, not silently overwritten.
    if (!state.pending || state.saving) {
      controller.syncSaved(document, document.id);
    }
  }, [document, controller, revision, autoSave.pending]);
  const draft = readOnly ? document : autoSave.draft;
  return <main className="master-page detail-editor-page" aria-labelledby="detail-editor-title"
    onCompositionStart={() => controller.pause()} onCompositionEnd={() => controller.resume()}>
    <div className="details-heading">
      <button type="button" className="secondary-button" disabled={disabled && !readOnly} onClick={onBack}>一覧に戻る</button>
      <h1 id="detail-editor-title">{draft?.name ?? "明細"}</h1>
    </div>
    <AutoSaveStatus state={autoSave} controller={controller} onPrepareSave={onPrepareSave} />
    <DetailPartsCanvas key={document?.id} parts={draft?.parts ?? []} disabled={disabled || readOnly || !document}
      initiatives={initiatives} navigationBlocked={disabled} onOpenInitiative={onOpenInitiative}
      onChange={parts => { if (draft && !readOnly) controller.change({ ...draft, parts }); }} />
  </main>;
}
