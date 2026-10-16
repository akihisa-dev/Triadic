import { TRIADIC_FILE_EXTENSION } from "../core/storage/triadicSchema";

const sqliteSignature = new TextEncoder().encode("SQLite format 3\0");

/** Reject obviously invalid files before allocating the full contents. */
export async function readTriadicFile(file: File): Promise<Uint8Array> {
  if (!file.name.toLowerCase().endsWith(TRIADIC_FILE_EXTENSION)) throw new Error(".triadicファイルを選択してください。");
  // SQLite's database header is 100 bytes. This is a minimum, not a size cap.
  if (file.size < 100) throw new Error("Triadicファイルを読み込めませんでした。");
  const header = new Uint8Array(await file.slice(0, sqliteSignature.length).arrayBuffer());
  if (header.length !== sqliteSignature.length || !sqliteSignature.every((byte, index) => header[index] === byte)) {
    throw new Error("Triadicファイルを読み込めませんでした。");
  }
  // A valid signature does not establish validity. The session fully validates these bytes.
  return new Uint8Array(await file.arrayBuffer());
}
