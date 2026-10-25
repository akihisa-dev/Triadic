// Shared size checks do not load ZIP/XML libraries into the screen thread.
const MiB = 1024 * 1024;
export const previousWorkbookLimits = { compressedBytes: 20 * MiB, entries: 2048, entryBytes: 8 * MiB, expandedBytes: 32 * MiB, rows: 100000, columns: 20, cells: 200000, tags: 1000000 };
