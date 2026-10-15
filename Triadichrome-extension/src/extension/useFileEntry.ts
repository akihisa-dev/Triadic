import { useEffect, useRef, useState, type DragEvent } from "react";
import { createTriadicDatabase } from "./planProcessing";
import { TRIADIC_FILE_EXTENSION } from "../core/storage/triadicSchema";
import { currentFiscalYear } from "../core/domain/calendar";
import { writeTriadicFile } from "./triadicFile";
import { loadRecentFile, readRecentFile, rememberRecentFile } from "./recentFile";
import { fileTypes, type PickerWindow } from "./filePicker";
import type { PlanSession } from "./PlanSession";

/** File access begins in the input event; only validated files enter the session. */
export function useFileEntry(session: PlanSession, savedName: string, clearCloseError: () => void) {
  const busy = useRef(false);
  const [isBusy, setIsBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [recentFile, setRecentFile] = useState<FileSystemFileHandle | null>(null);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentNotice, setRecentNotice] = useState("");
  const recentRevision = useRef(0);
  useEffect(() => {
    let active = true;
    const revision = recentRevision.current;
    void loadRecentFile().then(handle => {
      if (active && revision === recentRevision.current) setRecentFile(handle);
    }).catch(() => {
      if (active && revision === recentRevision.current) setRecentNotice("前回のファイル履歴を読み込めませんでした。「ファイルを開く」から選択してください。");
    }).finally(() => { if (active) setRecentLoading(false); });
    return () => { active = false; };
  }, []);
  const remember = async (handle: FileSystemFileHandle | null) => {
    recentRevision.current++;
    setRecentNotice("");
    try {
      await rememberRecentFile(handle);
      setRecentFile(handle);
    }
    catch {
      if (handle) setRecentFile(handle);
      setRecentNotice(handle
        ? "このファイルの履歴を保存できませんでした。再起動後は「ファイルを開く」から選択してください。"
        : "ファイル履歴を消去できませんでした。もう一度「履歴を消す」を押してください。");
      if (!handle) throw new Error("ファイル履歴を消去できませんでした。");
    }
  };
  const rememberSavedFile = useRef<(handle: FileSystemFileHandle) => Promise<void>>(async () => {});
  // Another tab can replace the shared entry while this tab keeps the same handle.
  rememberSavedFile.current = remember;
  useEffect(() => session.subscribeFileSave(handle => rememberSavedFile.current(handle)), [session]);
  useEffect(() => {
    if (savedName) setDisplayName(savedName);
  }, [savedName]);
  const run = async (operation: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setIsBusy(true);
    setError("");
    try { await operation(); }
    catch (failure) {
      if (!(failure instanceof DOMException && failure.name === "AbortError")) {
        setError(failure instanceof Error ? failure.message : "ファイルを開けませんでした。");
      }
    } finally { busy.current = false; setIsBusy(false); }
  };
  const open = async (file: File, handle?: FileSystemFileHandle) => {
    if (!handle) throw new Error("この開き方では自動保存できません。「ファイルを開く」から選択してください。");
    if (!file.name.toLowerCase().endsWith(TRIADIC_FILE_EXTENSION)) throw new Error(".triadicファイルを選択してください。");
    const bytes = new Uint8Array(await file.arrayBuffer());
    await session.open({ name: file.name, bytes, handle });
    clearCloseError();
    // Failed reads and denied write access never replace the last opened file.
    await remember(handle);
    setDisplayName(file.name);
    setFileName(file.name);
  };
  const resume = () => void run(async () => {
    if (recentFile) await open(await readRecentFile(recentFile), recentFile);
  });
  const forget = () => void run(() => remember(null));
  const choose = () => {
    if (busy.current) return;
    const picker = (window as PickerWindow).showOpenFilePicker;
    if (!picker) { setError("この環境では自動保存できません。ファイルを読み書きできるChromeで開いてください。"); return; }
    void run(async () => {
      const [handle] = await picker.call(window, { multiple: false, mode: "readwrite", types: fileTypes });
      if (handle) await open(await readRecentFile(handle), handle);
    });
  };
  const [newFiscalYear, setNewFiscalYear] = useState(String(currentFiscalYear()));
  const create = () => void run(async () => {
    if (!/^\d{1,4}$/.test(newFiscalYear) || Number(newFiscalYear) < 1 || Number(newFiscalYear) > 9998) throw new Error("年度は1〜9998の整数で入力してください。");
    const picker = (window as PickerWindow).showSaveFilePicker;
    if (!picker) throw new Error("この環境ではファイルを新規作成できません。");
    const handle = await picker.call(window, { suggestedName: `Untitled${TRIADIC_FILE_EXTENSION}`, types: fileTypes });
    if (!handle.name.toLowerCase().endsWith(TRIADIC_FILE_EXTENSION)) throw new Error("拡張子は.triadicにしてください。");
    const bytes = await createTriadicDatabase(Number(newFiscalYear));
    await writeTriadicFile(handle, bytes);
    await open(await readRecentFile(handle), handle);
  });
  const drag = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = busy.current ? "none" : "copy";
    if (!busy.current) setDragging(true);
  };
  const leave = (event: DragEvent<HTMLElement>) => {
    if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setDragging(false);
  };
  const drop = (event: DragEvent<HTMLElement>) => {
      event.preventDefault(); setDragging(false);
      if (busy.current) return;
      const files = Array.from(event.dataTransfer.files);
      if (files.length !== 1) { setError("一度に開けるファイルは一つです。"); return; }
      // Capture the handle promise during the drop event, before awaiting anything.
      const item = Array.from(event.dataTransfer.items).find(entry => entry.kind === "file") as
        (DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }) | undefined;
      const droppedHandle = item?.getAsFileSystemHandle?.();
      void run(async () => {
        const handle = await droppedHandle?.catch(() => null);
        if (handle?.kind === "file") {
          const fileHandle = handle as FileSystemFileHandle;
          await open(await readRecentFile(fileHandle), fileHandle);
        } else await open(files[0]!);
      });
  };
  const reset = () => { setFileName(null); setError(""); setDragging(false); };
  return {
    busy, isBusy, fileName, displayName, dragging, recentFile,
    recentLoading, recentNotice, error, newFiscalYear, setNewFiscalYear, setError,
    forget, resume, choose, create, drag, leave,
    drop, reset
  };
}

export type FileEntry = ReturnType<typeof useFileEntry>;
