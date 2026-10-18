import { historyFromDatabase } from "./dataHistory";
import { readContents } from "./readPlan";
import { openTriadicDatabase } from "./triadicDatabase";

/** Read both views from one completely validated, private, unchanged connection. */
export async function readSavedPlan(bytes: Uint8Array) {
  const database = await openTriadicDatabase(bytes);
  try {
    return { contents: readContents(database), savedHistory: historyFromDatabase(database) };
  } finally { database.close(); }
}
