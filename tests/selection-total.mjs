import assert from "node:assert/strict";

export function verifySelectionTotal(api) {
  const rectangle = { anchor: { row: 1, column: 1 }, end: { row: 0, column: 0 } };
  const cell = (row, column) => ({ anchor: { row, column }, end: { row, column } });
  const draft = { ...api.createInitiativeDraft("2026"), rows: [
    { id: "a", accountId: 1, amounts: { 4: "100.001", 5: "-2.002", 6: "bad" }, overrides: { 2: { 4: "0", 5: "-2.002" } } },
    { id: "b", accountId: 1, amounts: { 4: "0.003", 5: "" } },
  ] };
  const before = structuredClone(draft);
  assert.equal(api.initiativeSelectionTotal(draft, 1, null), null);
  assert.deepEqual(api.initiativeSelectionTotal(draft, 1, rectangle), { amount: 98002 });
  assert.deepEqual(api.initiativeSelectionTotal(draft, 2, rectangle), { amount: -1999 });
  assert.deepEqual(api.initiativeSelectionTotal(draft, 2, cell(0, 0)), { amount: 0 });
  assert.deepEqual(api.initiativeSelectionTotal(draft, 2, cell(1, 0)), { amount: 3 });
  assert.match(api.initiativeSelectionTotal(draft, 1, cell(0, 2)).error, /不正/);
  assert.deepEqual(draft, before, "選択と計算は入力・手修正を変更しない");
  const bad = { ...draft, rows: [{ ...draft.rows[0], amounts: { 4: "" }, invalidAmounts: { 1: { 4: {original:"1", inherited:false} } } }] };
  assert.match(api.initiativeSelectionTotal(bad, 1, cell(0, 0)).error, /不正/);
  assert.deepEqual(api.initiativeSelectionTotal(bad, 2, cell(0, 0)), { amount: 0 }, "確定の手修正0は不正な一次から独立");
  delete bad.rows[0].overrides;
  assert.match(api.initiativeSelectionTotal(bad, 2, cell(0, 0)).error, /不正/, "引き継ぎ元の不正入力も表示しない");
  const huge = { ...draft, rows: [{ id:"large", accountId: 1, amounts: {4:"9007199254740.991", 5:"9007199254740.991", 6:"-9007199254740.991"} }] };
  assert.match(api.initiativeSelectionTotal(huge, 1, {anchor:{row:0,column:0},end:{row:0,column:1}}).error, /上限/);
  assert.deepEqual(api.initiativeSelectionTotal(huge, 1, {anchor:{row:0,column:0},end:{row:0,column:2}}), {amount:Number.MAX_SAFE_INTEGER}, "途中の超過後の相殺を保持");
  huge.rows[0].amounts = {4:"-9007199254740.991",5:"-0.001"};
  assert.match(api.initiativeSelectionTotal(huge, 1, {anchor:{row:0,column:0},end:{row:0,column:1}}).error, /上限/);
  const previous = { industryId:1, departmentId:1, rows:[{accountId:1, amounts:{4:"100.001",5:"-0.001"}},{accountId:2,amounts:{4:"-50",5:""}}] };
  const prevBefore = structuredClone(previous);
  const selection = {anchor:{row:3,column:1},end:{row:0,column:0}};
  assert.deepEqual(api.previousSelectionTotal(previous, [1,null,null,2], selection), {amount:50000}, "集計と利益率は二重計上しない");
  assert.equal(api.previousSelectionTotal(previous, [1,null,null,2], cell(1,0)), null);
  assert.equal(api.previousSelectionTotal(undefined, [1], cell(0,0)), null);
  assert.deepEqual(previous, prevBefore);
  previous.rows[0].amounts[4] = "-";
  assert.match(api.previousSelectionTotal(previous, [1,2], cell(0,0)).error, /不正/);
  assert.deepEqual(api.previousSelectionTotal(previous, [1,2], cell(1,0)), {amount:-50000});
  console.log("選択範囲の合計: 円精度・逆向き矩形・手修正0・引き継ぎ・集計除外・不正入力・最終上限・入力保持を確認");
}
