import type { WindowView } from "./windowView";
import { cloneWindowViewValues } from "./windowViewState";

/** A clone receives display choices, never the source window's unfinished data. */
export function cloneWindowView(view: WindowView): WindowView {
  return { ...view,
    screen: view.screen,
    values: cloneWindowViewValues(view.values),
    scroll: view.scroll,
  };
}
