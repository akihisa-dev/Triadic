import assert from "node:assert/strict";

export function verifyInitiativeSort(api) {
  const source = [
    { id: 1, name: "施策10", expansionId: 2, periodTypeId: 1, startYearMonths: { 1: "2027-01", 2: "2026-08" } },
    { id: 2, name: "施策2", expansionId: 1, periodTypeId: 2, startYearMonths: { 1: "2026-12", 2: "2026-09" } },
    { id: 3, name: "施策2", expansionId: 1, periodTypeId: 2, startYearMonths: { 1: "2026-12", 2: "2026-07" } },
    { id: 4, name: "", expansionId: null, periodTypeId: null, startYearMonths: { 1: null, 2: null } },
  ];
  const snapshot = structuredClone(source);
  const expansions = new Map([[1, "あ行"], [2, "か行"]]);
  const periods = new Map([[1, "か行"], [2, "あ行"]]);
  const sorted = (column, direction, kind = 1) => api.sortInitiatives(source, { column, direction }, kind, expansions, periods).map(item => item.id);
  for (const column of ["expansion", "period", "name", "start"]) {
    assert.deepEqual(sorted(column, "ascending"), [2, 3, 1, 4], `${column}: 同値は登録順・空欄は末尾`);
    assert.deepEqual(sorted(column, "descending"), [1, 2, 3, 4], `${column}: 降順でも同値と空欄の位置を維持`);
  }
  assert.deepEqual(sorted("start", "ascending", 2), [3, 1, 2, 4], "表示種別の年月を使用");
  assert.deepEqual(sorted("start", "descending", 2), [2, 1, 3, 4]);
  assert.deepEqual(api.sortInitiatives(source, null, 1, expansions, periods), source, "初期表示は登録順");
  assert.deepEqual(source, snapshot, "保存データを変更しない");
  assert.deepEqual(api.sortInitiatives([], { column: "name", direction: "ascending" }, 1, expansions, periods), []);
  const signed=[null,-1,0,2,-1].map((periodTypeId,id)=>({id,periodTypeId,expansionId:periodTypeId,name:String(id),startYearMonths:{1:null,2:null}}));
  const signedNames=new Map([[-1,'あ'],[0,'か'],[2,'さ']]);
  for(const column of ['period','expansion']) for(const kind of [1,2]) {
    assert.deepEqual(api.sortInitiatives(signed,{column,direction:'ascending'},kind,signedNames,signedNames).map(item=>item.id),[1,4,2,3,0]);
    assert.deepEqual(api.sortInitiatives(signed,{column,direction:'descending'},kind,signedNames,signedNames).map(item=>item.id),[3,2,1,4,0],'未選択を実ID -1 と区別し、同値順を保持');
  }

}
