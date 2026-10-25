import { createTriadicDatabase, processPlan } from "./planProcessing";
import { writeTriadicFile } from "./triadicFile";

/** Preserve the selection-time baseline through reservation/initialization and the writer lock. */
export async function createNewPlanFile(handle: FileSystemFileHandle, fiscalYear: number, expected: Uint8Array): Promise<void> {
  const bytes = await createTriadicDatabase(fiscalYear);
  await writeTriadicFile(handle, bytes, async () => {
    const current = new Uint8Array(await (await handle.getFile()).arrayBuffer());
    if (!await processPlan("bytesEqual", current, expected)) {
      throw new Error("保存先のファイルが更新されたため、新規作成を止めました。元のファイルは変更していません。「新規作成」から別の保存先を選んでください。");
    }
  });
}
