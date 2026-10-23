import { createContext, useContext, useLayoutEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { CostTableView } from "./CostTablePage";
import type { RelationView } from "./HomeRelationsPage";
import type { Screen } from "./workspace/types";
import type { WindowViewState, WindowViewValues } from "./windowViewState";

export type WindowView = {
  screen: Screen;
  costTable: CostTableView;
  relation: RelationView | null;
  values: WindowViewValues;
  scroll: { key: string; top: number; left: number }[];
};
export const WindowViewContext = createContext<WindowViewValues | null>(null);

/** Only display choices enter a clone; saved data and unfinished inputs do not. */
export function useWindowViewState<K extends keyof WindowViewState>(key: K, initial: WindowViewState[K]): [WindowViewState[K], Dispatch<SetStateAction<WindowViewState[K]>>] {
  const values = useContext(WindowViewContext);
  const [value, setValue] = useState<WindowViewState[K]>(() => values?.[key] !== undefined ? values[key] : initial);
  useLayoutEffect(() => { if (values) values[key] = value; return () => { if (values) delete values[key]; }; }, [values, key, value]);
  return [value, setValue];
}

// IDs describe scroll regions, independent of the number/order of table cells.
const scrollRegions = ["home-page", "home-content", "sidebar-inner", "initiative-entry-page", "initiative-grid-scroll", "initiative-amount-table-container", "initiative-list-container", "previous-grid-container", "account-master-page", "master-data-page", "account-master-list", "aggregation-grid-scroll", "aggregation-pool-scroll", "screen-data-map", "screen-data-columns", "mechanism-map", "grid-selection-total-compact", "data-history-list", "io-preview-table"];
const scrollSelector = `.home-page, .home-page :is(${scrollRegions.slice(1).map(name => `.${name}`).join(",")})`;
function scrollElements() {
  const counts = new Map<string, number>();
  return [...document.querySelectorAll<HTMLElement>(scrollSelector)].map(element => {
    const region = scrollRegions.find(name => element.classList.contains(name))!;
    const name = `${region}:${element.id || element.getAttribute("aria-label") || ""}`;
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
  if (!scroll.length) return () => {};
  const offsets = new Map(scroll.map(item => [item.key, item]));
  let frame = 0;
  let stopped = false;
  let dirty = true;
  let elements: ReturnType<typeof scrollElements> = [];
  const observer = new MutationObserver(() => { dirty = true; });
  const end = performance.now() + 500;
  const restore = () => {
    if (stopped) return;
    if (dirty) { elements = scrollElements().filter(item => offsets.has(item.key)); dirty = false; }
    for (const { element, key } of elements) {
      const offset = offsets.get(key);
      if (offset) { element.scrollTop = offset.top; element.scrollLeft = offset.left; }
    }
    if (performance.now() < end) frame = requestAnimationFrame(restore); else stop();
  };
  const stop = () => {
    stopped = true; cancelAnimationFrame(frame); observer.disconnect();
    document.removeEventListener("pointerdown", stop, true);
    document.removeEventListener("keydown", stop, true); document.removeEventListener("wheel", stop, true);
  };
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "id", "aria-label"] });
  document.addEventListener("pointerdown", stop, true);
  document.addEventListener("keydown", stop, true);
  document.addEventListener("wheel", stop, { capture: true, passive: true });
  restore();
  return stop;
}
