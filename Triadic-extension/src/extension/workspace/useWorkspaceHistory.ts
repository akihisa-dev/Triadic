import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DataHistoryEntry } from "../../core/domain/dataHistory";
import type { PlanContents } from "../../core/domain/plan";
import type { Page, Screen, HomePageProps } from "./types";
import { useMutation } from "../useMutation";
import type { useScreenHistory } from "../useScreenHistory";
export function useWorkspaceHistory(screens: ReturnType<typeof useScreenHistory<Screen>>,
  blocked: () => boolean, run: ReturnType<typeof useMutation>["run"],
  onPreviewHistory: HomePageProps["onPreviewHistory"], onRestoreHistory: HomePageProps["onRestoreHistory"],
  resetDraft: () => void, dismissNotice: () => void,
  setNotice: Dispatch<SetStateAction<{ message: string; error: boolean }>>) {
  const currentScreens = useRef<ReturnType<typeof screens.snapshot> | null>(null);
  const restoreMutation = useMutation();
  const [preview, setPreview] = useState<{ entry: DataHistoryEntry; contents: PlanContents } | null>(null);
  const [restoreRequested, setRestoreRequested] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const resetScreens = (next: Page) => screens.reset({ phase: screens.current.phase, page: next, selectedInitiative: null, detailOrigin: "initiative-list" });
  const previewEntry = async (entry: DataHistoryEntry) => {
    if (blocked()) return;
    await run(async () => {
      const past = await onPreviewHistory(entry.id);
      currentScreens.current = screens.snapshot();
      setPreview({ entry, contents: past }); resetScreens("home"); dismissNotice();
    });
  };
  const returnToCurrent = () => {
    if (blocked()) return;
    setPreview(null);
    if (currentScreens.current) screens.restore(currentScreens.current);
    else resetScreens("data-history");
    currentScreens.current = null;
  };
  const restorePreview = async () => {
    if (!preview || blocked()) return;
    setRestoreError("");
    try {
      // Restoring is the sole write allowed while viewing a past state.
      await restoreMutation.run(async () => { await onRestoreHistory(preview.entry.id); });
      setPreview(null); setRestoreRequested(false); resetScreens("data-history");
      currentScreens.current = null;
      resetDraft();
      setNotice({ message: "選んだ時点に戻しました。復元前の状態も履歴に残っています。", error: false });
    } catch (failure) { setRestoreError(failure instanceof Error ? failure.message : "復元できませんでした。"); }
  };

  return { preview, setPreview, restoreRequested, setRestoreRequested, restoreError, setRestoreError, restoreMutation,
    resetScreens, previewEntry, returnToCurrent, restorePreview };
}
