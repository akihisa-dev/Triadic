import assert from "node:assert/strict";

export function verifyInputErrorLocation(api) {
  const draft = { rows: [
    { id: "first", accountId: 1, amounts: {4:"0",3:"1.0001"}, overrides:{2:{4:"0",5:"-"}} },
    { id: "second", accountId: 1, amounts:{4:"bad"} },
  ] };
  const before = structuredClone(draft);
  assert.deepEqual(api.initiativeInputError(draft), {rowId:"first",rowIndex:0,kind:1,month:3});
  assert.deepEqual(draft,before,"場所の取得は入力と手修正0を変更しない");
  draft.rows[0].amounts[3] = "1.001";
  assert.deepEqual(api.initiativeInputError(draft), {rowId:"first",rowIndex:0,kind:2,month:5});
  draft.rows[0].overrides[2][5] = "0";
  assert.deepEqual(api.initiativeInputError(draft), {rowId:"second",rowIndex:1,kind:1,month:4});
  draft.rows[1].amounts[4] = "";
  assert.equal(api.initiativeInputError(draft),null,"空欄と明示手修正0はエラーではない");
  draft.rows[0].invalidAmounts = {1:{6:{original:"2",inherited:false}},2:{7:{original:"0",inherited:true}}};
  assert.equal(api.initiativeInputError(draft).month,6,"数値欄が空文字に変換されても不正状態から特定する");
  delete draft.rows[0].invalidAmounts[1];
  assert.equal(api.initiativeInputError(draft).kind,2);
  delete draft.rows[0].invalidAmounts;
  draft.rows[0].amounts[4] = "9007199254740.991";
  draft.rows[0].amounts[5] = "9007199254740.991";
  assert.equal(api.initiativeInputError(draft),null,"合計だけの上限超過に誤った入力セルを割り当てない");
  const previous = {industryId:1,departmentId:1,rows:[{accountId:1,amounts:{3:"-",4:"0"}},{accountId:2,amounts:{4:"1e"}}]};
  const prevBefore=structuredClone(previous);
  assert.deepEqual(api.previousInputError(previous,[2,null,1]),{accountId:2,month:4},"表示順で特定し集計行を飛ばす");
  assert.deepEqual(api.previousInputError(previous,[1,null,2]),{accountId:1,month:3});
  assert.deepEqual(previous,prevBefore);
  assert.equal(api.previousInputError(undefined),null);
  previous.rows[0].amounts[3]="";previous.rows[1].amounts[4]="0.001";
  assert.equal(api.previousInputError(previous),null);
  console.log("入力エラー移動: 種別・行識別子・年度順・不正状態・表示順・訂正後の再判定・入力保持を確認");
}
