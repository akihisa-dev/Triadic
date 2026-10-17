import assert from "node:assert/strict";

export function verifyInitiativeSearch({ createInitiativeSearch }) {
  const items = [
    { id: 9, name: "ＡＢＣ販売", note: "代理店のｺｽﾄを見直す" },
    { id: 2, name: "設備の導入", note: "東京　予算１２３" },
    { id: 7, name: "<img src=x>", note: "[a.*] & 日本語" },
    { id: 4, name: "備考なし", note: "" },
  ];
  const before = structuredClone(items), search = createInitiativeSearch(items);
  assert.deepEqual(search("　 "), items);
  assert.deepEqual(search("abc"), [items[0]]);
  assert.deepEqual(search("コスト 代理店"), [items[0]]);
  assert.deepEqual(search("ＡＢＣ\n代理店"), [items[0]], "名称と備考をまたぐ全語一致");
  assert.deepEqual(search("東京 123"), [items[1]]);
  assert.deepEqual(search("[a.*]"), [items[2]], "入力を正規表現にしない");
  assert.deepEqual(search("該当なし"), []);
  assert.deepEqual(search("備考なし"), [items[3]]);
  assert.deepEqual(createInitiativeSearch([])(""), []);
  assert.deepEqual(items, before, "検索・索引作成で元データを変更しない");
  const updated = [{ ...items[0], name: "新しい名前", note: "更新後" }];
  assert.deepEqual(createInitiativeSearch(updated)("代理店"), []);
  assert.deepEqual(createInitiativeSearch(updated)("更新後"), updated);
  const many = Array.from({ length: 251 }, (_, id) => ({ id, name: `施策${id}`, note: "共通" }));
  assert.deepEqual(createInitiativeSearch(many)("共通").map(item => item.id), many.map(item => item.id), "全件を登録順で返す");
  console.log("施策検索: 名称・備考・複数語・大小/全半角・特殊文字・空/無一致・更新・全件順序・参照専用を確認しました。");
}
