import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ExtensionPage } from "../../Triadichrome-extension/src/extension/ExtensionPage";
import { createSamplePlan } from "./sample-plan";
import { installCloneableFiles } from "./cloneable-files";

if (!import.meta.env.DEV) throw new Error("複数ウィンドウの確認は開発サーバー専用です。");
if (!new URLSearchParams(location.hash.slice(1)).has("workspace")) {
  await installCloneableFiles({ bytes: [...await createSamplePlan()] });
}
createRoot(document.getElementById("root")!).render(<StrictMode><ExtensionPage /></StrictMode>);
