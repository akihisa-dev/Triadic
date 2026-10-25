import type { KindId, KindSelections, PreviousKind, PreviousSelections } from "../core/domain/kinds";
import type { TableSort, TableViewState } from "../core/tables/columnView";

export type WindowViewState = {
  "dashboard:selection": { kinds: KindId[]; previous: PreviousKind };
  "dashboard:period": "annual" | import("../core/domain/calendar").InitiativeMonth;
  "dashboard:ranking": KindId;
  "table:kinds": KindSelections;
  "table:previous": PreviousSelections;
  "initiative-list:sort": TableSort | null;
  "initiative-list:filters": TableViewState["filters"];
  "expansion:table-view": TableViewState;
  "initiative:kind": KindId;
  "previous:kind": PreviousKind;
  "previous:industries": number[];
  "previous:departments": number[];
  "home:mode": "relations" | "data" | "calculation" | "process";
};
export type WindowViewValues = Partial<WindowViewState>;

// Every state key must explicitly choose whether another window may inherit it.
const clonePolicy = {
  "dashboard:selection": true, "dashboard:period": true, "dashboard:ranking": true,
  "table:kinds": true, "table:previous": true, "initiative-list:sort": true, "initiative-list:filters": true, "expansion:table-view": true,
  "initiative:kind": true, "previous:kind": true, "previous:industries": true,
  "previous:departments": true, "home:mode": true,
} satisfies Record<keyof WindowViewState, boolean>;

/** Filter at the transfer boundary, including unknown keys from a received message. */
export function cloneWindowViewValues(values: WindowViewValues): WindowViewValues {
  return Object.fromEntries(Object.entries(values).filter(([key]) =>
    Object.hasOwn(clonePolicy, key) && clonePolicy[key as keyof WindowViewState]));
}
