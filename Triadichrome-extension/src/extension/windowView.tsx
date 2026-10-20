import { createContext, useContext, useLayoutEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { CostTableView } from "./CostTablePage";
import type { RelationView } from "./HomeRelationsPage";
import type { Screen } from "./workspace/types";

export type WindowView = {
  screen: Screen;
  costTable: CostTableView;
  relation: RelationView | null;
  values: Record<string, unknown>;
  scroll: { key: string; top: number; left: number }[];
};
export const WindowViewContext = createContext<Record<string, unknown> | null>(null);

/** Only display choices enter a clone; saved data and unfinished inputs do not. */
export function useWindowViewState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const values = useContext(WindowViewContext);
  const [value, setValue] = useState<T>(() => values && key in values ? values[key] as T : initial);
  useLayoutEffect(() => { if (values) values[key] = value; return () => { if (values) delete values[key]; }; }, [values, key, value]);
  return [value, setValue];
}

function scrollElements() {
  const counts = new Map<string, number>();
  return [...document.querySelectorAll<HTMLElement>(".home-page, .home-page *")].map(element => {
    const name = `${element.tagName}:${element.className}:${element.getAttribute("aria-label") ?? ""}`;
    const index = counts.get(name) ?? 0;
    counts.set(name, index + 1);
    return { element, key: `${name}:${index}` };
  });
}
export function captureWindowScroll(): WindowView["scroll"] {
  return scrollElements().filter(({ element }) => element.scrollTop || element.scrollLeft)
    .map(({ key, element }) => ({ key, top: element.scrollTop, left: element.scrollLeft }));
}
export function restoreWindowScroll(scroll: WindowView["scroll"]) {
  const offsets = new Map(scroll.map(item => [item.key, item]));
  let frame = 0;
  let stopped = false;
  const end = performance.now() + 500;
  const restore = () => {
    if (stopped) return;
    for (const { element, key } of scrollElements()) {
      const offset = offsets.get(key);
      if (offset) { element.scrollTop = offset.top; element.scrollLeft = offset.left; }
    }
    if (performance.now() < end) frame = requestAnimationFrame(restore);
  };
  const stop = () => { stopped = true; cancelAnimationFrame(frame); };
  restore();
  document.addEventListener("pointerdown", stop, true);
  document.addEventListener("keydown", stop, true);
  document.addEventListener("wheel", stop, { capture: true, passive: true });
  return () => {
    stop(); document.removeEventListener("pointerdown", stop, true);
    document.removeEventListener("keydown", stop, true); document.removeEventListener("wheel", stop, true);
  };
}
