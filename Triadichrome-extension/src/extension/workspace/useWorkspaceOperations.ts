import { useEffect, type Dispatch, type SetStateAction, type RefObject } from "react";
import type { HomePageProps } from "./types";
import type { useMutation } from "../useMutation";
export function useWorkspaceOperations(operationBlocked: boolean, saving: RefObject<boolean>,
  operationMutation: ReturnType<typeof useMutation>, canUndo: boolean, canRedo: boolean,
  onPrepareSave: HomePageProps["onPrepareSave"], onTravelOperation: HomePageProps["onTravelOperation"],
  dismissNotice: () => void, setNotice: Dispatch<SetStateAction<{ message: string; error: boolean }>>) {
  const travelOperation = async (direction: -1 | 1) => {
    if (operationBlocked || saving.current || operationMutation.running.current || document.querySelector("dialog[open]") || !(direction === -1 ? canUndo : canRedo)) return;
    dismissNotice();
    try {
      await operationMutation.run(async () => {
        await onPrepareSave();
        return onTravelOperation(direction);
      });
      setNotice({ message: direction === -1 ? "操作を取り消しました。" : "操作をやり直しました。", error: false });
    } catch (failure) {
      setNotice({ message: failure instanceof Error ? failure.message : "操作を戻せませんでした。", error: true });
    }
  };
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest("input, textarea, select") || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && !(key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey)) return;
      const direction = key === "y" || event.shiftKey ? 1 : -1;
      if (operationBlocked || document.querySelector("dialog[open]") || !(direction === -1 ? canUndo : canRedo)) return;
      event.preventDefault();
      void travelOperation(direction);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });
  return travelOperation;
}
