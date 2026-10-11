// Shared history state has no dependency on database initialization.
export const HISTORY_INTERVAL_MS = 5 * 60 * 1000;
export type DataHistoryEntry = { id: number; recordedAt: string };
export type DataHistoryStatus = { entries: DataHistoryEntry[]; dirtySince: string | null };
export const emptyDataHistory: DataHistoryStatus = { entries: [], dirtySince: null };
export type HistoryDeletion = { ids: number[] } | { before: string };
