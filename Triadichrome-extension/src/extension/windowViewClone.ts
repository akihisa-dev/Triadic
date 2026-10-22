import type { WindowView } from "./windowView";

const displayKeys = new Set([
  "table:kinds", "table:previous", "initiative-list:sort", "initiative:kind",
  "previous:kind", "previous:industries", "previous:departments", "home:mode",
]);

/** A clone receives display choices, never the source window's unfinished data. */
export function cloneWindowView(view: WindowView): WindowView {
  return { ...view,
    screen: view.screen,
    values: Object.fromEntries(Object.entries(view.values).filter(([key]) => displayKeys.has(key))),
    scroll: view.scroll,
  };
}
