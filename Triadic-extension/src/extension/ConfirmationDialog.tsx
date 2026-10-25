import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

type ConfirmationDialogProps = {
  open: boolean;
  title: string;
  message?: string;
  compact?: boolean;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmationDialog({ open, title, message, confirmLabel, busy, onConfirm, onCancel, compact = false }: ConfirmationDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();
  useLayoutEffect(() => {
    const element = dialog.current!;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);

  return createPortal(<dialog ref={dialog} className={compact ? "confirmation-dialog confirmation-dialog-compact" : "confirmation-dialog"} role="alertdialog" aria-labelledby={titleId} aria-describedby={message ? messageId : undefined} aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}
    onKeyDown={event => {
      if (event.key === "Tab") {
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        const target = event.shiftKey && document.activeElement === first ? last
          : !event.shiftKey && document.activeElement === last ? first : undefined;
        if (target) { event.preventDefault(); target.focus({ preventScroll: true }); }
      }
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        if (!busy) onCancel();
      }
    }}>
    <h2 id={titleId}>{title}</h2>
    {message && <p id={messageId}>{message}</p>}
    <div className="form-actions">
      <button autoFocus className="secondary-button" type="button" disabled={busy} onClick={onCancel}>キャンセル</button>
      <button className="primary-button" type="button" disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </dialog>, document.body);
}
