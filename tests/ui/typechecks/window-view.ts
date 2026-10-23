import { useWindowViewState } from "../../../Triadichrome-extension/src/extension/windowView";

// Compiled by the normal typecheck; never mounted as a component.
export function WindowViewTypeChecks() {
  const [kind, setKind] = useWindowViewState("initiative:kind", 1);
  setKind(kind === 1 ? 2 : 1);
  // @ts-expect-error Unknown state keys must not enter the display-state store.
  useWindowViewState("future:state", "unknown");
  // @ts-expect-error A known key fixes its value type.
  useWindowViewState("table:kinds", "not kind selections");
  // @ts-expect-error The setter also retains the key's value type.
  setKind(3);
  return null;
}
