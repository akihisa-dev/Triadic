import assert from "node:assert/strict";

export function verifyInitiativeSearch({ createInitiativeSearch }) {
  const masters = { expansions: [], expansionCategories: [], departments: [], industries: [], periodTypes: [] };
  const find = (items, query, source = masters) => createInitiativeSearch(items, source)(query).map(result => result.initiative);
  const items = [
    { id: 9, name: "ＡＢＣ販売", note: "代理店のｺｽﾄを見直す" },
    { id: 2, name: "設備の導入", note: "東京　予算１２３" },
    { id: 7, name: "<img src=x>", note: "[a.*] & 日本語" },
    { id: 4, name: "備考なし", note: "" },
  ];
  const before = structuredClone(items), search = query => find(items, query);
  assert.deepEqual(search("　 "), items);
  assert.deepEqual(search("abc"), [items[0]]);
  assert.deepEqual(search("コスト 代理店"), [items[0]]);
  assert.deepEqual(search("ＡＢＣ\n代理店"), [items[0]], "名称と備考をまたぐ全語一致");
  assert.deepEqual(search("東京 123"), [items[1]]);
  assert.deepEqual(search("[a.*]"), [items[2]], "入力を正規表現にしない");
  assert.deepEqual(search("該当なし"), []);
  assert.deepEqual(search("備考なし"), [items[3]]);
  assert.deepEqual(find([], ""), []);
  assert.deepEqual(items, before, "検索・索引作成で元データを変更しない");
  const updated = [{ ...items[0], name: "新しい名前", note: "更新後" }];
  assert.deepEqual(find(updated, "代理店"), []);
  assert.deepEqual(find(updated, "更新後"), updated);
  const many = Array.from({ length: 251 }, (_, id) => ({ id, name: `施策${id}`, note: "共通" }));
  assert.deepEqual(find(many, "共通").map(item => item.id), many.map(item => item.id), "全件を登録順で返す");
  const classifiedMasters = {
    expansions: [{ id: 0, expansionName: "コスト" }],
    expansionCategories: [{ id: -1, categoryName: "運行効率化" }, { id: 2, categoryName: "未選択の区分" }],
    departments: [{ id: 3, departmentName: "運輸部" }, { id: 4, departmentName: "倉庫部" }],
    industries: [{ id: 5, industryName: "一般貨物ＡＢＣ" }],
    periodTypes: [{ id: 6, periodName: "上期" }],
  };
  const classified = [{ ...items[0], note: "燃料費削減", expansionId: 0, expansionCategoryId: -1, departmentId: 3, industryId: 5, periodTypeId: 6 },
    { ...items[1], departmentId: 4 }, { ...items[3], expansionId: null, expansionCategoryId: 999 }];
  const original = structuredClone({ classified, classifiedMasters });
  const byClassification = createInitiativeSearch(classified, classifiedMasters);
  assert.deepEqual(byClassification("運輸 燃料").map(row => row.initiative), [classified[0]], "分類と備考をまたぐ全語一致");
  assert.deepEqual(byClassification("ｺｽﾄ abc 上期 運行")[0].matchedClassifications, [
    { label: "展開", name: "コスト" }, { label: "展開区分", name: "運行効率化" },
    { label: "業種", name: "一般貨物ＡＢＣ" }, { label: "期間", name: "上期" },
  ], "一致した分類だけを表示し、0・負IDも検索する");
  assert.deepEqual(byClassification("運輸部 倉庫部"), [], "別施策の分類を混ぜない");
  assert.deepEqual(byClassification("未選択の区分"), [], "所属候補は検索せず施策の選択だけを使う");
  assert.deepEqual(byClassification("999"), [], "未選択・不明参照の番号を検索語にしない");
  assert.deepEqual(byClassification("ABC")[0].matchedClassifications, [{ label: "業種", name: "一般貨物ＡＢＣ" }]);
  assert.deepEqual(byClassification("燃料")[0].matchedClassifications, [], "名称・備考だけの一致では分類を出さない");
  assert.ok(byClassification("").every(row => row.matchedClassifications.length === 0), "空の検索で分類を出さない");
  const renamed = { ...classifiedMasters, departments: [{ id: 3, departmentName: "配送部" }] };
  assert.deepEqual(find(classified, "運輸部", renamed), []);
  assert.deepEqual(find(classified, "配送部", renamed), [classified[0]], "現在/過去それぞれのマスタ名を使う");
  assert.deepEqual({ classified, classifiedMasters }, original, "分類検索も保存データを変更しない");
  console.log("施策検索: 名称・備考・複数語・大小/全半角・特殊文字・空/無一致・更新・全件順序・参照専用を確認しました。");
}
