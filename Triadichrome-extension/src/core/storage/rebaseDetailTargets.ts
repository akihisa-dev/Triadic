import { listDetailDocuments } from "./detailDocuments";
import type { Database } from "./sqliteRuntime";

/** A newly linked zero cell must not receive a concurrent change to its account/owner. */
export function canMergeDetailTargets(base: Database, local: Database, external: Database): boolean {
  const read = (db: Database) => ({
    documents: listDetailDocuments(db),
    targets: new Map((db.exec("SELECT r.id, i.identity, r.account_id FROM initiative_rows r JOIN initiatives i ON i.id = r.initiative_id")[0]?.values ?? [])
      .map(([id, identity, account]) => [String(id), JSON.stringify([identity, account])])),
  });
  const baseline = read(base);
  const before = new Map(baseline.documents.map(d => [d.id, JSON.stringify(d.parts)]));
  const ours = read(local), theirs = read(external);
  for (const [changed, other] of [[ours, theirs], [theirs, ours]] as const) {
    for (const document of changed.documents) {
      if (before.get(document.id) === JSON.stringify(document.parts)) continue;
      for (const part of document.parts) {
        if (part.kind !== "initiative-reference" || !part.binding?.rowId || !part.binding.months.length) continue;
        const rowId = part.binding.rowId, target = changed.targets.get(rowId);
        if (target === undefined || JSON.parse(target)[0] !== part.initiativeIdentity) continue;
        if (baseline.targets.has(rowId) && target !== undefined && target !== other.targets.get(rowId)) return false;
      }
    }
  }
  return true;
}
