export type PermissionFileHandle = FileSystemFileHandle & {
  queryPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
};

/** Automatic saves may inspect permission, but must never open a permission prompt. */
export async function hasFileWritePermission(handle: PermissionFileHandle): Promise<boolean> {
  return !handle.queryPermission || await handle.queryPermission({ mode: "readwrite" }) === "granted";
}

/** Invoke directly from a user action, before queueing storage work. */
export async function requestFileWritePermission(handle: PermissionFileHandle): Promise<boolean> {
  if (handle.queryPermission && await handle.queryPermission({ mode: "readwrite" }) === "granted") return true;
  if (handle.requestPermission) return await handle.requestPermission({ mode: "readwrite" }) === "granted";
  return !handle.queryPermission;
}
