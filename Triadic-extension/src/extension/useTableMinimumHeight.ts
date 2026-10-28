import { useLayoutEffect, type RefObject } from "react";

/** Let the page scroll only when its controls and an operable table cannot fit. */
export function useTableMinimumHeight(container: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const region = container.current, table = region?.querySelector("table");
    const page = region?.closest<HTMLElement>(".cost-table-page, .expansion-table-page, .initiative-overview-page");
    if (!region || !table || !page) return;
    const frame = region.closest<HTMLElement>(".period-scroll-frame") ?? region;
    let pending = 0;
    const measure = () => {
      const head = table.tHead;
      const columns = head?.querySelectorAll<HTMLElement>("tr[data-column-header]");
      const headHeight = columns?.length ? Array.from(columns).reduce((sum, row) => sum + row.getBoundingClientRect().height, 0) : head?.getBoundingClientRect().height ?? 0;
      const row = table.tBodies[0]?.querySelector("[data-copy-row]")?.closest("tr");
      const scrollbar = region.offsetHeight - region.clientHeight;
      const minimum = Math.ceil(headHeight + (table.tFoot?.getBoundingClientRect().height ?? 0) + Math.max(28, row?.getBoundingClientRect().height ?? 0) + scrollbar);
      const style = getComputedStyle(page);
      const children = Array.from(page.children).filter(child => {
        const childStyle = getComputedStyle(child);
        return childStyle.display !== "none" && !["absolute", "fixed"].includes(childStyle.position);
      });
      const height = children.reduce((sum, child) => {
        const childStyle = getComputedStyle(child);
        return sum + (child === frame ? minimum : child.getBoundingClientRect().height) + parseFloat(childStyle.marginTop || "0") + parseFloat(childStyle.marginBottom || "0");
      }, parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + Math.max(0, children.length - 1) * (parseFloat(style.rowGap) || 0));
      frame.style.minHeight = `${minimum}px`;
      page.style.minHeight = `${Math.ceil(height)}px`;
    };
    const schedule = () => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; measure(); }); };
    measure();
    const observer = new ResizeObserver(schedule);
    for (const element of [page, region, table, ...Array.from(page.children)]) observer.observe(element);
    return () => {
      observer.disconnect(); cancelAnimationFrame(pending);
      frame.style.removeProperty("min-height"); page.style.removeProperty("min-height");
    };
  }, [container]);
}
