import { useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme } from "./theme";
import "./ThemeSwitch.css";

export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme);
  return <label className="theme-switch" title={theme === "dark" ? "ライトに切り替え" : "ダークに切り替え"}>
    <input type="checkbox" role="switch" aria-label="ダークテーマ" checked={theme === "dark"}
      onChange={event => setTheme(event.target.checked ? "dark" : "light")} />
    <span className="theme-track" aria-hidden="true"><span className="theme-thumb" /></span>
  </label>;
}
