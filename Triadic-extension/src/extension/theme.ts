export type Theme = "light" | "dark";
const key = "triadic.theme";
let current: Theme = "light";
const listeners = new Set<() => void>();

function apply(theme: Theme) {
  current = theme;
  document.documentElement.dataset.theme = theme;
  listeners.forEach(listener => listener());
}

export function initializeTheme() {
  try { apply(localStorage.getItem(key) === "dark" ? "dark" : "light"); }
  catch { apply("light"); }
  window.addEventListener("storage", event => {
    if (event.storageArea === localStorage && (event.key === key || event.key === null)) {
      apply(event.newValue === "dark" ? "dark" : "light");
    }
  });
}

export function setTheme(theme: Theme) {
  apply(theme);
  // Storage may be unavailable; switching the current screen still works.
  try { localStorage.setItem(key, theme); } catch { /* Keep the in-memory selection. */ }
}
export const getTheme = () => current;
export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
