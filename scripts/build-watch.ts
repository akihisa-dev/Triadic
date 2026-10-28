/** Vite shares a tree with distribution files; never watch replaceable outputs. */
export function isBuildOutput(file: string, root: string): boolean {
  const prefix = root.replaceAll("\\", "/").replace(/\/$/, "") + "/";
  const normalized = file.replaceAll("\\", "/");
  if (!normalized.startsWith(prefix)) return false;
  const relative = normalized.slice(prefix.length);
  if (relative === "dist" || relative.startsWith("dist/")) return true;
  if (!relative.startsWith("Triadic-extension/")) return false;
  const extension = relative.slice("Triadic-extension/".length);
  return /^(?:assets|icons)(?:\/|$)/.test(extension)
    || ["index.html", "manifest.json", "src/extension/background.js"].includes(extension)
    || /^(?:src\/extension\/)?\.triadic-replace-[^/]*(?:\/|$)/.test(extension);
}
