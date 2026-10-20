/** Native handles live only in the isolated test origin, never in the user's chosen files. */
export async function installCloneableFiles(options: { bytes: number[]; name?: string }) {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(options.name ?? "ウィンドウ確認.triadic", { create: true });
  const writer = await handle.createWritable();
  await writer.write(new Uint8Array(options.bytes)); await writer.close();
  Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: async () => [handle] });
  Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: async (settings: { suggestedName: string }) => root.getFileHandle(settings.suggestedName, { create: true }) });
}
