import { useLayoutEffect, useState, type RefObject } from "react";

/** Keep at least one data row accessible below the frozen section. */
export function useAdaptiveTableHeader(table: RefObject<HTMLTableElement | null>) {
  const [freezeAll, setFreezeAll] = useState(true);
  useLayoutEffect(() => {
    const element = table.current;
    const region = element?.parentElement;
    const head = element?.tHead;
    if (!element || !region || !head) return;
    const measure = () => {
      let columnsHeight = 0;
      for (const row of head.querySelectorAll<HTMLTableRowElement>("tr[data-column-header]")) {
        row.style.setProperty("--column-header-top", `${columnsHeight}px`);
        columnsHeight += row.getBoundingClientRect().height;
      }
      const rowHeight = element.querySelector("tr.cost-data-row")?.getBoundingClientRect().height ?? 40;
      const fits = head.getBoundingClientRect().height + rowHeight <= region.clientHeight;
      setFreezeAll(fits);
      region.style.scrollPaddingTop = `${fits ? head.getBoundingClientRect().height : columnsHeight}px`;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(region); observer.observe(head);
    const focus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !element.contains(target)) return;
      // Native focus scrolling may leave a cell underneath sticky rows.
      const top = region.getBoundingClientRect().top + parseFloat(region.style.scrollPaddingTop || "0");
      const box = target.getBoundingClientRect();
      const row = target.closest("tr");
      if (row?.hasAttribute("data-column-header")) return;
      if (head.contains(target) && !element.classList.contains("cost-header-scroll")) return;
      if (box.top < top) region.scrollTop -= top - box.top;
    };
    region.addEventListener("focusin", focus);
    return () => { observer.disconnect(); region.removeEventListener("focusin", focus); region.style.removeProperty("scroll-padding-top"); };
  }, [table]);
  return freezeAll;
}
