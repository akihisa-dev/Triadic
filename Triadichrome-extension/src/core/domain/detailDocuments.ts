import { PART_STEP, PART_MIN, TABLE_PART_MIN, type DetailPart } from "../tables/detailParts";

export type DetailDraft = { name: string; parts: DetailPart[] };
export type DetailDocument = DetailDraft & { id: string; revision: number };
export type DetailChange = { type: "create"; document: DetailDocument } | { type: "update"; document: DetailDocument };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const invalid = (): never => { throw new Error("明細の保存内容が正しくありません。"); };
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** File content is data: accept only inline raster images, never URLs or executable markup. */
export function validateDetailImage(src: string, name: string) {
  if (!src) { if (name) invalid(); return; }
  if (!name) invalid();
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
  if (!match || match[2]!.length % 4) invalid();
  let bytes: string;
  try { bytes = atob(match![2]!); } catch { return invalid(); }
  if (btoa(bytes) !== match![2]) invalid();
  const signature = match![1] === "png" ? bytes.startsWith('\x89PNG\r\n\x1a\n') && bytes.length >= 33
    : match![1] === "jpeg" ? bytes.startsWith('\xff\xd8\xff') && bytes.endsWith('\xff\xd9')
      : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP' && bytes.length >= 20;
  if (!signature) invalid();
}

export function validateDetailDocument(value: unknown): asserts value is DetailDocument {
  if (!object(value) || typeof value.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.id)
    || typeof value.name !== "string" || !value.name.trim() || !integer(value.revision) || !Array.isArray(value.parts)) invalid();
  const document = value as DetailDocument;
  const ids = new Set<string>();
  for (const part of document.parts) {
    if (!object(part) || typeof part.id !== "string" || !part.id || ids.has(part.id)) invalid();
    ids.add(part.id);
    const minimum = part.kind === "table-horizontal" || part.kind === "table-vertical" ? TABLE_PART_MIN[part.kind] : { width: PART_MIN, height: PART_MIN };
    if (![part.x, part.y, part.width, part.height].every(v => integer(v) && v % PART_STEP === 0)
      || part.width < minimum.width || part.height < minimum.height || !Number.isSafeInteger(part.x + part.width) || !Number.isSafeInteger(part.y + part.height)) invalid();
    const common = ["id", "x", "y", "width", "height", "kind"];
    let fields: string[];
    if (part.kind === "text") {
      if (typeof part.text !== "string") invalid();
      fields = ["text"];
    } else if (part.kind === "image") {
      if (typeof part.src !== "string" || typeof part.name !== "string") invalid();
      validateDetailImage(part.src, part.name); fields = ["src", "name"];
    } else if (part.kind === "table-horizontal" || part.kind === "table-vertical") {
      if (!Array.isArray(part.cells) || !part.cells.length || part.cells.some(row => !Array.isArray(row) || row.length !== 13 || row.some(cell => typeof cell !== "string"))) invalid();
      fields = ["cells"];
    } else return invalid();
    if (Object.keys(part).some(key => ![...common, ...fields].includes(key))) invalid();
  }
}
