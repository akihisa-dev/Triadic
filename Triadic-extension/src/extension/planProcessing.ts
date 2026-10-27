import type { processingTasks } from "./planProcessingTasks";
type Tasks = typeof processingTasks;
let sequence = 0;
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; original: unknown };
type Processor = { worker: Worker | undefined; pending: Map<number, Pending>; disposed: boolean };
const processor = (): Processor => ({ worker: undefined, pending: new Map(), disposed: false });
const unbound = processor();
const owners = new WeakMap<Uint8Array, Processor>();
const failureText = "データの処理を続けられませんでした。入力は保持しています。「保存を再試行」で処理を再開できます。";
function stop(state: Processor) {
  state.worker?.terminate(); state.worker = undefined;
  for (const request of state.pending.values()) request.reject(new Error(failureText));
  state.pending.clear();
}
/** One live saved document owns one processing queue, shared by its windows. */
export function bindPlanProcessing(bytes: Uint8Array): () => void {
  if (typeof Worker === "undefined") return () => {};
  const state = processor(), previous = owners.get(bytes);
  owners.set(bytes, state);
  return () => {
    state.disposed = true; stop(state);
    if (owners.get(bytes) === state) {
      if (previous && !previous.disposed) owners.set(bytes, previous);
      else owners.delete(bytes);
    }
  };
}
function remember(value: unknown, state: Processor) {
  if (value instanceof Uint8Array) owners.set(value, state);
  // Processing results carry document/snapshot bytes in these fields. Avoid
  // walking the unrelated full contents returned by read/save operations.
  else if (value && typeof value === "object") for (const key of ["bytes", "operation", "before", "after"]) {
    if (key in value) remember(Reflect.get(value, key), state);
  }
}
function getWorker(state: Processor): Worker {
  if (state.worker) return state.worker;
  const worker = new Worker(new URL("./planProcessing.worker.ts", import.meta.url), { type: "module" });
  state.worker = worker;
  worker.onmessage = event => {
    if (state.worker !== worker) return;
    const { id, value, unchanged, error } = event.data;
    const request = state.pending.get(id);
    if (!request) return;
    state.pending.delete(id);
    if (error) request.reject(new Error(error));
    else {
      const result = unchanged ? request.original : value;
      remember(result, state); request.resolve(result);
    }
  };
  worker.onerror = () => {
    if (state.worker === worker) stop(state);
  };
  return worker;
}
export async function processPlan<K extends keyof Tasks>(task: K, ...args: Parameters<Tasks[K]>): Promise<Awaited<ReturnType<Tasks[K]>>> {
  // Non-browser verification uses the identical handlers without a worker runtime.
  if (typeof Worker === "undefined") {
    const { processingTasks } = await import("./planProcessingTasks");
    const operation = processingTasks[task] as unknown as (...input: Parameters<Tasks[K]>) => ReturnType<Tasks[K]>;
    return await operation(...args) as Awaited<ReturnType<Tasks[K]>>;
  }
  const state = args.reduce<Processor | undefined>((found, argument) => {
    const owner = argument instanceof Uint8Array ? owners.get(argument) : undefined;
    return found ?? (owner && !owner.disposed ? owner : undefined);
  }, undefined) ?? unbound;
  const target = getWorker(state);
  return new Promise<Awaited<ReturnType<Tasks[K]>>>((resolve, reject) => {
    const id = ++sequence;
    state.pending.set(id, { resolve: value => resolve(value as Awaited<ReturnType<Tasks[K]>>), reject, original: args[0] });
    try { target.postMessage({ id, task, args }); }
    catch (failure) { state.pending.delete(id); reject(failure); }
  });
}
export const createTriadicDatabase: Tasks["createTriadicDatabase"] = (...args) => processPlan("createTriadicDatabase", ...args);
export const readPlanContents: Tasks["readPlanContents"] = bytes => processPlan("readPlanContents", bytes);
export const readSavedPlan: Tasks["readSavedPlan"] = bytes => processPlan("readSavedPlan", bytes);
export const readSnapshotContents: Tasks["readSnapshotContents"] = bytes => processPlan("readSnapshotContents", bytes);
export const applyPlanCommand: Tasks["applyPlanCommand"] = (...args) => processPlan("applyPlanCommand", ...args);
export const prepareAggregationSave: Tasks["prepareAggregationSave"] = (bytes, change) => processPlan("prepareAggregationSave", bytes, change);
export const applyOperationSnapshot: Tasks["applyOperationSnapshot"] = (...args) => processPlan("applyOperationSnapshot", ...args);
export const createBusinessSnapshot: Tasks["createBusinessSnapshot"] = (...args) => processPlan("createBusinessSnapshot", ...args);
export const readDataHistory: Tasks["readDataHistory"] = (...args) => processPlan("readDataHistory", ...args);
export const readHistorySnapshot: Tasks["readHistorySnapshot"] = (...args) => processPlan("readHistorySnapshot", ...args);
export const trackHistoryChange: Tasks["trackHistoryChange"] = (...args) => processPlan("trackHistoryChange", ...args);
export const recordDataHistory: Tasks["recordDataHistory"] = (...args) => processPlan("recordDataHistory", ...args);
export const restoreDataHistory: Tasks["restoreDataHistory"] = (...args) => processPlan("restoreDataHistory", ...args);
export const deleteDataHistory: Tasks["deleteDataHistory"] = (...args) => processPlan("deleteDataHistory", ...args);

export const prepareKindSelectionSave: Tasks["prepareKindSelectionSave"] = (...args) => processPlan("prepareKindSelectionSave", ...args);
export const prepareOrdinarySave: Tasks["prepareOrdinarySave"] = (bytes, command, year) => processPlan("prepareOrdinarySave", bytes, command, year);

export const prepareComparisonSelectionSave: Tasks["prepareComparisonSelectionSave"] = (...args) => processPlan("prepareComparisonSelectionSave", ...args);
