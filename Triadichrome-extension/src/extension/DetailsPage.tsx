import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./DetailsPage.css";
import { DetailPartsCanvas } from "./DetailPartsCanvas";
import type { DetailPart } from "../core/tables/detailParts";
const emptyParts: DetailPart[] = [];

/** These entries live only in the open workspace; no storage commands consume them. */
export type DetailDocument = { id: number; name: string; parts?: DetailPart[] };

export function DetailsPage({ documents, disabled, onCreate, onOpen }: {
  documents: DetailDocument[];
  disabled: boolean;
  onCreate: (name: string) => void;
  onOpen: (id: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <main className="master-page details-page" aria-labelledby="details-title">
    <div className="details-heading">
      <h1 id="details-title">明細</h1>
      <button ref={trigger} type="button" className="primary-button" disabled={disabled} onClick={() => setAdding(true)}>＋ 明細を追加</button>
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
      onCreate={name => { if (!disabled) { onCreate(name); setAdding(false); } }} />}
  </main>;
}

function DetailCreateDialog({ disabled, onCancel, onCreate, returnFocus }: {
  disabled: boolean;
  onCancel: () => void;
  onCreate: (name: string) => void;
  returnFocus: HTMLElement | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const title = useId();
  const [name, setName] = useState("");
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    nameInput.current?.focus();
    return () => { element.close(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); };
  }, [returnFocus]);
  return createPortal(<dialog ref={dialog} className="confirmation-dialog detail-create-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); onCancel(); }}
    onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
      if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
    }}>
    <form onSubmit={event => { event.preventDefault(); if (!disabled && name.trim()) onCreate(name.trim()); }}>
      <h2 id={title}>明細を追加</h2>
      <label className="detail-create-field">明細名<input ref={nameInput} required value={name} disabled={disabled} onChange={event => setName(event.target.value)} /></label>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>キャンセル</button>
        <button type="submit" className="primary-button" disabled={disabled || !name.trim()}>次へ</button>
      </div>
    </form>
  </dialog>, document.body);
}

export function DetailEditorPage({ document, disabled, onBack, onPartsChange }: { document: DetailDocument | undefined; disabled: boolean; onBack: () => void; onPartsChange: (parts: DetailPart[]) => void }) {
  return <main className="master-page detail-editor-page" aria-labelledby="detail-editor-title">
    <div className="details-heading">
      <button type="button" className="secondary-button" disabled={disabled} onClick={onBack}>一覧に戻る</button>
      <h1 id="detail-editor-title">{document?.name ?? "明細"}</h1>
    </div>
    <DetailPartsCanvas key={document?.id} parts={document?.parts ?? emptyParts} disabled={disabled || !document} onChange={onPartsChange} />
  </main>;
}
