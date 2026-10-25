import assert from "node:assert/strict";

export async function verifyInitiativeFiscalYear(api) {
  const sample = await api.createSamplePlan(2026);
  const sqlite = await api.initializeSqlite();
  const originalExec = sqlite.Database.prototype.exec;
  let observation;
  sqlite.Database.prototype.exec = function(statement, params) {
    const result = originalExec.call(this, statement, params);
    if (observation) {
      if (statement === "SELECT fiscal_year FROM document_info WHERE id = 1") observation.years++;
      if (/^SELECT account_id, industry_id, department_id, month, amount_yen, revision, id, previous_kind FROM previous_amounts ORDER BY/.test(statement)) {
        observation.previousReads++;
        observation.previousRows += result[0]?.values.length ?? 0;
      }
    }
    return result;
  };
  const observe = async action => {
    observation = { years: 0, previousReads: 0, previousRows: 0 };
    try { const result = await action(); return { result, counts: { ...observation } }; }
    finally { observation = undefined; }
  };
  try {
    for (const count of [0, 120, 12000]) {
      const db = await api.openTriadicDatabase(sample);
      let bytes;
      try {
        const accounts = db.exec("SELECT id FROM accounts")[0].values;
        const pairs = db.exec("SELECT industry_id, department_id FROM department_industries")[0].values;
        db.run("BEGIN");
        db.run("DELETE FROM previous_amounts");
        let inserted = 0;
        for (const [industry, department] of pairs) for (const [account] of accounts) for (let month = 1; month <= 12 && inserted < count; month++) {
          const amount = (inserted % 2 ? -1 : 1) * (inserted + 1);
          db.run("INSERT INTO previous_amounts (account_id, industry_id, department_id, month, amount_yen) VALUES (?, ?, ?, ?, ?)", [account, industry, department, month, amount]);
          inserted++;
        }
        assert.equal(inserted, count);
        db.run("COMMIT");
        bytes = api.exportTriadicDatabase(db);
      } finally { db.close(); }
      const contents = await api.readPlanContents(bytes);
      assert.equal(contents.previousAmounts.length, count);
      const saved = contents.initiatives[0];
      const draft = { ...saved, fiscalYear: "2026" };
      const registered = { ...draft, name: "年度の確認用施策", rows: draft.rows.map(({ id, ...row }) => row) };
      const note = { ...draft, note: "年度だけを取得して保存" };
      const amount = { ...draft, rows: draft.rows.map((row, index) => index ? row : { ...row, amounts: { ...row.amounts, 4: "120.001" } }) };
      for (const [label, action] of [
        ["登録", () => api.registerInitiative(bytes, registered)],
        ["備考更新", () => api.updateInitiative(bytes, saved.id, 2026, note)],
        ["月額更新", () => api.updateInitiative(bytes, saved.id, 2026, amount)],
        ["通常保存の備考", async () => (await api.processingTasks.prepareOrdinarySave(bytes, { type: "initiative.update", id: saved.id, draft: note }, 2026)).bytes],
        ["通常保存の登録", async () => (await api.processingTasks.prepareOrdinarySave(bytes, { type: "initiative.register", draft: registered }, 2026)).bytes],
      ]) {
        const measured = await observe(action);
        // Ordinary preparation now includes the full projection formerly read at the file boundary.
        const projected = label.startsWith("通常保存");
        assert.deepEqual(measured.counts, projected
          ? { years: 2, previousReads: 1, previousRows: count }
          : { years: 1, previousReads: 0, previousRows: 0 }, `${count}件・${label}: 編集用年度1回、保存候補の全体読込は必要時だけ1回`);
        const after = await api.readPlanContents(measured.result);
        assert.deepEqual(after.previousAmounts, contents.previousAmounts, `${label}: 前年全項目を保持`);
        assert.deepEqual(after.kindSelections, contents.kindSelections);
        const changed = after.initiatives.find(item => item.name === (label.includes("登録") ? registered.name : draft.name));
        assert.equal(changed.fiscalYear, 2026);
        if (label.includes("備考")) assert.equal(changed.note, note.note);
        if (label === "月額更新") assert.equal(changed.rows[0].amounts[4], "120.001");
      }
      const unchanged = await observe(() => api.processingTasks.prepareOrdinarySave(bytes, { type: "initiative.update", id: saved.id, draft }, 2026));
      const noChange = unchanged.result;
      assert.equal(noChange.bytes, bytes);
      assert.equal(noChange.operation, null);
      assert.deepEqual(unchanged.counts, { years: 1, previousReads: 0, previousRows: 0 }, "無変更なら保存候補の全体読込を行わない");
      await assert.rejects(api.registerInitiative(bytes, { ...registered, fiscalYear: "2027" }), /基準年度/);
      await assert.rejects(api.updateInitiative(bytes, saved.id, 2026, { ...draft, fiscalYear: "2027" }), /基準年度/);
      await assert.rejects(api.updateInitiative(bytes, 999999, 2026, draft), /見つかりません/);
      await assert.rejects(api.updateInitiative(bytes, saved.id, 2027, draft), /見つかりません/);
      await assert.rejects(api.updateInitiative(bytes, saved.id, 2026, { ...draft, rows: [{ ...draft.rows[0], amounts: { 4: "不正" } }] }), /金額|数値/);
      const restored = await observe(() => api.readPlanContents(bytes));
      assert.equal(restored.counts.previousReads, 1, "全体読込では必要な前年金額を復元");
      assert.equal(restored.counts.previousRows, count);
      assert.deepEqual(restored.result, contents, "拒否後も元のデータ全体を保持");
      console.log(`年度確認: 前年${count}件、単体編集と無変更は年度1回・前年取得0回、変更ありの保存候補は全体読込1回`);
    }
  } finally { sqlite.Database.prototype.exec = originalExec; }
  console.log("PASS: 年度限定取得、前年0・120・12000件、登録・更新・無変更、年度と不正入力拒否、全体読込の前年金額維持");
}
