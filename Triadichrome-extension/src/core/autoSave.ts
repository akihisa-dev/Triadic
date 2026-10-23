import { DraftAccountConflictError, reconcileSavedDraft } from "./reconcileSavedDraft";
export type AutoSaveState<T> = {
  draft: T | null;
  pending: boolean;
  saving: boolean;
  error: string;
};

/** Coalesce edits and serialize writes. A completed older write never replaces newer input. */
export class AutoSave<T> {
  private state: AutoSaveState<T> = { draft: null, pending: false, saving: false, error: "" };
  private saved: T | null = null;
  private incoming: T | null = null;
  private identity: string | undefined;
  private replacement: { draft: T; identity: string | undefined } | null = null;
  private readonly replacementError = "編集対象が別のデータに変更されています。";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  private composing = false;
  private savingResult: Promise<string> | null = null;
  constructor(private save: (draft: T) => Promise<void>, private delay = 600) {}
  getSnapshot = () => this.state;
  isComposing = () => this.composing;
  hasSourceChange = () => this.replacement !== null;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: AutoSaveState<T>) { this.state = state; this.listeners.forEach(listener => listener()); }
  private equal(a: T | null, b: T | null) { return JSON.stringify(a) === JSON.stringify(b); }
  begin(draft: T, identity?: string) {
    if (this.state.pending) return;
    this.identity = identity; this.replacement = null;
    this.saved = draft;
    this.publish({ draft, pending: false, saving: false, error: "" });
  }
  /** The page supplies the actual saved source, including any external merge. */
  syncSaved(draft: T, identity = this.identity) {
    if (this.saved !== null && this.state.pending && identity !== this.identity) {
      // Do not rebase unfinished input onto a different owner, even while its save is returning.
      this.replacement = { draft, identity };
      this.cancelTimer();
      this.publish({ ...this.state, error: this.replacementError });
      return;
    }
    const wasReplaced = this.replacement !== null;
    this.replacement = null;
    this.identity = identity;
    if (this.state.saving) { this.incoming = draft; return; }
    let current: T;
    try { current = this.saved === null || this.state.draft === null ? draft : reconcileSavedDraft(this.saved, this.state.draft, draft); }
    catch (error) {
      if (!(error instanceof DraftAccountConflictError)) throw error;
      this.replacement = { draft, identity };
      this.cancelTimer();
      this.publish({ ...this.state, pending: true, error: error.message });
      return;
    }
    this.saved = draft;
    const pending = !this.equal(current, draft);
    if (!pending) clearTimeout(this.timer);
    this.publish({ ...this.state, draft: current, pending, error: pending && !wasReplaced ? this.state.error : "" });
  }
  change(draft: T) {
    clearTimeout(this.timer);
    this.publish({ ...this.state, draft, pending: !!this.replacement || this.state.saving || !this.equal(draft, this.saved), error: this.replacement ? this.replacementError : "" });
    if (this.state.pending && !this.composing && !this.replacement) this.timer = setTimeout(() => { void this.flush(); }, this.delay);
  }
  async flush() { await this.flushResult(); }
  /** All waiters observe the outcome of the same attempt, even if input changes immediately afterward. */
  flushResult(): Promise<string> {
    clearTimeout(this.timer);
    if (this.savingResult) return this.savingResult;
    if (this.replacement || this.composing || !this.state.pending || this.state.draft === null) return Promise.resolve(this.state.error);
    let complete!: (error: string) => void;
    const result = new Promise<string>(resolve => { complete = resolve; });
    this.savingResult = result;
    void this.saveDraft(this.state.draft).then(error => { this.savingResult = null; complete(error); });
    return result;
  }
  private async saveDraft(draft: T): Promise<string> {
    this.incoming = null;
    this.publish({ ...this.state, saving: true, error: "" });
    try {
      await this.save(draft);
      clearTimeout(this.timer);
      if (this.replacement) {
        this.incoming = null;
        this.publish({ ...this.state, pending: true, saving: false, error: this.replacementError });
        return this.replacementError;
      }
      const persisted = this.incoming ?? draft;
      this.incoming = null;
      let latest: T;
      try { latest = reconcileSavedDraft(draft, this.state.draft!, persisted); }
      catch (error) {
        if (!(error instanceof DraftAccountConflictError)) throw error;
        this.replacement = { draft: persisted, identity: this.identity };
        this.publish({ ...this.state, pending: true, saving: false, error: error.message });
        return error.message;
      }
      this.saved = persisted;
      const pending = !this.equal(latest, persisted);
      this.publish({ ...this.state, draft: latest, pending, saving: false, error: "" });
      if (pending && !this.composing) this.timer = setTimeout(() => { void this.flush(); }, this.delay);
      return "";
    } catch (error) {
      clearTimeout(this.timer);
      const message = this.replacement ? this.replacementError : error instanceof Error ? error.message : "自動保存できませんでした。";
      this.publish({ ...this.state, pending: true, saving: false, error: message });
      return message;
    }
  }
  fail(error: unknown) {
    this.publish({ ...this.state, error: error instanceof Error ? error.message : "保存を許可できませんでした。" });
  }
  discard() {
    if (this.state.saving) return;
    clearTimeout(this.timer);
    if (this.replacement) {
      this.saved = this.replacement.draft; this.identity = this.replacement.identity; this.replacement = null; this.incoming = null;
    }
    this.publish({ draft: this.saved, pending: false, saving: false, error: "" });
  }
  end() {
    if (this.state.pending) return;
    clearTimeout(this.timer);
    this.saved = null;
    this.identity = undefined; this.replacement = null; this.incoming = null;
    this.publish({ draft: null, pending: false, saving: false, error: "" });
  }
  cancelTimer() { clearTimeout(this.timer); }
  pause() { this.composing = true; this.cancelTimer(); }
  resume() { this.composing = false; if (this.state.draft !== null) this.change(this.state.draft); }
}
