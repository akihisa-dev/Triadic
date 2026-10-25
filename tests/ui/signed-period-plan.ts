import { createSamplePlan } from "./sample-plan";
import { exportTriadicDatabase, openTriadicDatabase } from "../../Triadic-extension/src/core/storage/triadicDatabase";

/** Valid SQLite fixtures distinguish numeric IDs from an unselected period. */
export async function createSignedPeriodPlan(large = false): Promise<Uint8Array> {
  const db = await openTriadicDatabase(await createSamplePlan());
  try {
    db.run("INSERT INTO period_types(id,name) VALUES(-1,'あ期間'),(0,'か期間'),(10000,'さ期間')");
    db.run("UPDATE initiatives SET period_type_id=NULL");
    const ids = db.exec("SELECT id FROM initiatives ORDER BY sort_order,id LIMIT 4")[0]!.values;
    for (const [index, period] of [-1, 0, 10000, null].entries()) {
      db.run("UPDATE initiatives SET name=?, period_type_id=? WHERE id=?", [["負ID確認", "ゼロID確認", "正ID確認", "未選択確認"][index]!, period, ids[index]![0]!]);
    }
    if (large) {
      const account = db.exec("SELECT id FROM accounts LIMIT 1")[0]!.values[0]![0]!;
      for (let index = 0; index < 210; index++) {
        db.run("INSERT INTO initiatives(name,expansion_id,industry_id,department_id,period_type_id,sort_order) VALUES(?,1,1,1,?,?)", [`大量期間確認${index}`, [-1, 0, 10000, null][index % 4]!, 1000 + index]);
        const id = db.exec("SELECT last_insert_rowid()")[0]!.values[0]![0]!;
        const rowId = `signed-period:${id}`;
        db.run("INSERT INTO initiative_rows(id,initiative_id,account_id,sort_order) VALUES(?,?,?,0)", [rowId, id, account]);
        for (let month = 1; month <= 12; month++) db.run("INSERT INTO initiative_amounts(row_id,kind_id,month,amount_yen) VALUES(?,1,?,0)", [rowId, month]);
      }
    }
    return exportTriadicDatabase(db);
  } finally { db.close(); }
}
