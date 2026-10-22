import { detailEvaluator, detailYen } from "../domain/detailValues";
import type { DetailDocument } from "../domain/detailDocuments";
import type { Database } from "./sqliteRuntime";

export function detailBindings(db: Database, documents: readonly DetailDocument[]) {
  if (!documents.some(d => d.parts.some(p => p.kind === "initiative-reference" && p.binding?.rowId && p.binding.months.length))) return [];
  const targets = new Map((db.exec("SELECT r.id, i.identity FROM initiative_rows r JOIN initiatives i ON i.id = r.initiative_id")[0]?.values ?? []).map(([id, identity]) => [String(id), String(identity)]));
  const used = new Set<string>();
  return documents.flatMap(document => {
    const evaluate = detailEvaluator(document.parts);
    return document.parts.flatMap(part => {
      if (part.kind !== "initiative-reference" || !part.binding || !part.initiativeIdentity || !part.binding.rowId || !part.binding.months.length) return [];
      const binding = part.binding, rowId = binding.rowId!;
      const targetAvailable = targets.get(rowId) === part.initiativeIdentity;
      // A dangling reference must not reserve or lock a reused row belonging to another initiative.
      if (!targetAvailable) return [];
      let error: string | undefined;
      let amounts: number[] = [];
      const result = evaluate(binding.source);
      if (result.error !== undefined) error = result.error;
      else try { amounts = binding.months.map(month => detailYen(result.value, month, binding.unit)); }
      catch (e) { error = e instanceof Error ? e.message : "反映できません。"; }
      return binding.months.map((month, i) => {
        const key = `${rowId}:${binding.kindId}:${month}`;
        if (used.has(key)) throw new Error("同じ施策・科目行・種別・月に複数の明細を反映できません。明細内で計算してから反映してください。");
        used.add(key);
        return { rowId, kindId: binding.kindId, month, targetAvailable, amount: error ? undefined : amounts[i], source: { documentId: document.id, documentName: document.name, partId: part.id, ...(error ? { error } : {}) } };
      });
    });
  });
}

/** Apply all valid outputs in the same transaction as their source. Invalid output retains the last amount. */
export function applyDetailBindings(db: Database, documents: readonly DetailDocument[]) {
  const changed = new Set<string>();
  // Capture inherited confirmed values before any initial-budget output changes them.
  const updates = detailBindings(db, documents).flatMap(b => {
    const old = db.exec("SELECT amount_yen FROM initiative_amounts WHERE row_id = ? AND kind_id = ? AND month = ?", [b.rowId, b.kindId, b.month])[0]?.values[0]?.[0];
    const amount = b.amount ?? (b.targetAvailable && b.kindId === 2 && old === undefined
      ? Number(db.exec("SELECT amount_yen FROM initiative_amounts WHERE row_id = ? AND kind_id = 1 AND month = ?", [b.rowId, b.month])[0]!.values[0]![0]) : undefined);
    return amount === undefined || old === amount ? [] : [{ ...b, amount }];
  });
  for (const b of updates) {
    db.run(`INSERT INTO initiative_amounts(row_id, kind_id, month, amount_yen) VALUES (?, ?, ?, ?)
      ON CONFLICT(row_id, kind_id, month) DO UPDATE SET amount_yen = excluded.amount_yen, revision = initiative_amounts.revision + 1`, [b.rowId, b.kindId, b.month, b.amount]);
    changed.add(b.rowId);
  }
  const owners = new Set<number>();
  for (const rowId of changed) {
    db.run("UPDATE initiative_rows SET revision = revision + 1 WHERE id = ?", [rowId]);
    owners.add(Number(db.exec("SELECT initiative_id FROM initiative_rows WHERE id = ?", [rowId])[0]!.values[0]![0]));
  }
  for (const id of owners) db.run("UPDATE initiatives SET revision = revision + 1 WHERE id = ?", [id]);
}

/** Detect inconsistent file/rebase results; errors in a source deliberately allow the retained amount. */
export function validateDetailBindings(db: Database, documents: readonly DetailDocument[]) {
  for (const b of detailBindings(db, documents)) {
    const stored = db.exec("SELECT amount_yen FROM initiative_amounts WHERE row_id = ? AND kind_id = ? AND month = ?", [b.rowId, b.kindId, b.month])[0]?.values[0]?.[0];
    if (b.targetAvailable && stored === undefined || b.amount !== undefined && stored !== b.amount) throw new Error("明細の計算結果と施策の金額が一致していません。");
  }
}
