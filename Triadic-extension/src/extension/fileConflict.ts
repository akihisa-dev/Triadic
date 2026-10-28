export class FileConflictError extends Error {
  constructor() {
    super("保存先のファイルが更新されたため、保存を止めました。入力はこの画面に保持しています。");
    this.name = "FileConflictError";
  }
}
export type RecoveryDestination = { handle: FileSystemFileHandle; expected: Uint8Array };
export type Recovery = (name: string) => Promise<RecoveryDestination | null>;
export async function captureRecoveryDestination(handle: FileSystemFileHandle | null): Promise<RecoveryDestination | null> {
  if (!handle) return null;
  if (!handle.name.toLowerCase().endsWith(".triadic")) throw new Error("拡張子は.triadicにしてください。入力は保持しています。");
  return { handle, expected: new Uint8Array(await (await handle.getFile()).arrayBuffer()) };
}
let recovery: Recovery | undefined;
export function registerFileConflictRecovery(handler: Recovery) {
  recovery = handler;
  return () => { if (recovery === handler) recovery = undefined; };
}
export async function recoverFileConflict(handle: FileSystemFileHandle, handler = recovery) {
  if (!handler) throw new FileConflictError();
  const destination = await handler(handle.name);
  if (!destination) throw new FileConflictError();
  if (!handle.isSameEntry || await handle.isSameEntry(destination.handle)) throw new Error("更新された元のファイルを保護するため、別のファイル名を選んでください。入力は保持しています。");
  return destination;
}
