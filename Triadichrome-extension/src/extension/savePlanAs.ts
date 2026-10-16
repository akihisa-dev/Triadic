import { processPlan } from "./planProcessing";
import { writeTriadicFile } from "./triadicFile";

/** A copy has its own destination baseline; never compare or overwrite the source. */
export async function writePlanCopy(handle: FileSystemFileHandle, expected: Uint8Array, bytes: Uint8Array): Promise<void> {
  await writeTriadicFile(handle, bytes, async () => {
    const current = new Uint8Array(await (await handle.getFile()).arrayBuffer());
    if (!await processPlan("bytesEqual", current, expected)) {
      throw new Error("保存先のファイルが更新されたため、別名保存を止めました。元のファイルと入力は保持しています。保存先を選び直してください。");
    }
  });
}
