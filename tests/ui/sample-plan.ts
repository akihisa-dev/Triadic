// 明細配置: 辺を揃えたパーツを8px以内だけ重ねて相手が動かないこと、8px超で押し退けること、浅い重なりで解放しても重ならないことを確認。
// 明細の画像・文章・表・配置の保存と再読込・取消・履歴・別名保存・競合・失敗保護は tests/detail-document-storage.test.mjs と tests/ui/detail-persistence.spec.ts で確認する。
import { changeDetailDocument } from "../../Triadichrome-extension/src/core/storage/detailDocuments";
// 複数ウィンドウの同期・表示条件/位置の複製・共有取消・全保存先切替・履歴集約は既存の施策/月額/3時点履歴を使い、tests/window-session.mjs と tests/ui/multi-window.spec.ts で確認する。保存データは追加しない。
// 勘定科目・集計の共有更新と編集中の同期、未保存・保存中の追加入力、完了と取消は tests/ui/shared-editing.html と master-shared-editing.spec.ts で初期マスタを使って検証する。サンプルの保存内容は変えない。
// 集計の登録時の集計名・表示名の個別指定、空白拒否・保存失敗・再読込は tests/ui/aggregations.spec.ts で確認する。既存の保存項目を使用し、サンプル内容は変えない。
// 集計と全子孫をまとめる並べ替え・浮遊表示・所属と加減の保持は tests/aggregation-layout.mjs と tests/ui/aggregation-drop.spec.ts で確認する。保存項目は増やさない。
// L字の高さが足りない縦書き名だけを隠し、集計行名・配置を保つ表示と再表示は tests/ui/aggregation-labels.spec.ts で確認する。保存データは変えない。
// 新規科目・集計の右側プールと所属・解除・再読込は tests/ui/aggregation-pool.spec.ts で確認する。保存項目の追加はない。
// 行を浮かせる毎描画の追従、行間の途中反転・連続した着地、取消・失敗時の復元は tests/ui/aggregation-drop.spec.ts で確認する。保存データは追加しない。
// 集計マスタの画面幅・左右余白、所属先のL字・縦書き名・集計行の一体強調と行順のみの区別、移動先の仮表示・取消・ドロップ・保存失敗は tests/ui/aggregation-drop.spec.ts と aggregation-master.spec.ts で確認する。保存データは追加しない。
// 集計マスタの縦横の密度と既存の加減切替寸法、縦書き名の範囲内追従、スクロール時の行・L字・金額不変、ドラッグ時の自動スクロールは tests/ui/aggregation-master.spec.ts で確認する。
// 集計マスタは既存の科目・集計と共通順を使用する。L字の多段所属・減算・未所属・空集計、保存失敗は tests/ui/aggregation-master.spec.ts で確認する。サンプルの業務データは変更しない。
// マスタ入口・入出力・履歴の余白と文字・アイコンの維持は tests/ui/compact-surfaces.spec.ts で確認する。保存データは追加しない。
// 施策入力の上部の一行配置と余白は tests/ui/initiative-header-layout.spec.ts、上部全体と月見出しの固定は tests/ui/initiative-grid.spec.ts で新規・登録済み、縦横スクロールと末尾入力を確認する。
// 選択合計エラー時の一行表示・固定通知・表領域と入力位置の維持は tests/ui/selection-total.spec.ts と auto-save.spec.ts で新規・登録済みを確認する。既存データを使い、保存内容は追加しない。
// 選択範囲合計は既存の正負・1円精度・確定手修正0を利用し、tests/selection-total.mjs と tests/ui/selection-total.spec.ts で矩形・集計除外・不正入力・上限・非破壊を確認する。保存内容は追加しない。
// 展開表の期間・区分は tests/expansion-table-view.mjs で100/500/1000件の参照回数、逆順登録・改名・マスタ順変更・負ID/0/未選択・縦結合とExcel行順を照合する。
// 表から詳細への種別引継ぎは tests/ui/open-initiative-kind.spec.ts で通常/大量行、一次100・確定120、両種別の比較対象1、戻る進むと検索の一次固定を確認する。
// 固定領域が表より高い並び順は tests/ui/tall-sales-plan.ts・specで全行閲覧・前年の選択編集保存・高さ変更・フォーカスを確認する。
// 取消・やり直しの履歴転記は tests/operation-history.mjs で3/10/40件の取得1行・1BLOB上限、全履歴・状態と失敗再試行を確認する。
// 異年度の履歴比較は tests/history-difference.mjs と tests/ui/history-year.html・specで選択時の拒否・再試行・参照専用・選択保持を確認する。
// 前年Excelの分類名に含むタブ・LF・CR・禁則・アポストロフィ・長名は tests/previous-workbook-export.mjs で実XLSX往復・単一セル更新・元データ保持を確認する。
// 前年表の行構成変更は tests/ui/previous-selection.html と同名specで実SQLiteの保存統合・選択解除・フォーカス・Delete・貼付・属性変更時の選択維持を確認する。既存サンプルの内容は変えない。
// Excel名称の_x0041_・_x005F_・日本語・実文字との併存は tests/previous-workbook-export.mjs の合成計画でXLSX往復・マスタ照合・三表とシート参照を確認する。
// 属性未設定の表示と金額の入力保持は既存の手修正・0固定・全月0・相殺データを使う。tests/budget-hints.mjs と tests/ui/budget-tooltips.spec.ts で属性未設定・不正入力の保護と、手修正の点線・吹き出しがないことを確認する。
// 履歴の収支比較は既存サンプルの過去4月100→現在120と確定130を使い、tests/history-income-impact.mjs と tests/ui/history-income-impact.spec.ts で前年・各属性・1円・年間/月別・手修正・セル別上限を確認する。
// 施策検索は既存サンプルの施策名・備考・過去履歴を使い、tests/initiative-search.mjs と tests/ui/initiative-search.spec.ts で一致規則・移動・入力保護・50件表示・空の計画を確認する。
// 施策複製は既存サンプルの同科目複数行・分類・確定手修正0を使い、tests/duplicate-initiative.mjs と tests/ui/duplicate-initiative.spec.ts で独立性・登録・取消・入力保護を確認する。
// 履歴と現在の差分は既存の3時点の備考・4月月額を使い、tests/history-difference.mjs と tests/ui/history-difference.spec.ts で参照専用・1円・手修正・作成識別子・大量表示・失敗を確認する。
// 通常の別名保存は既存サンプルの計画・履歴を使い、tests/save-as.mjs と tests/ui/save-as.spec.ts で保存先切替・取消・失敗時の保護を確認する。
// 総原価表の内訳は既存の前年・同一科目複数行・手修正0・相殺・未設定集計を使い、tests/cost-breakdown.mjs と tests/ui/cost-breakdown.spec.ts で確認する。
// 展開表の大量行のフォーカス・前後Tab・小計を跨ぐ移動・縦結合・高さは tests/ui/expansion-focus.spec.ts で確認する。
// 履歴削除失敗後の許可要求・拒否・確認保持・取消後の再試行は tests/ui/history-permission.spec.ts で確認する。
// 前年・施策の単一値範囲貼付は改行なし・末尾LF/CRLFを同じ1セルとして扱い、複数セル・禁止範囲の全体拒否とセル内編集を維持する。
// 履歴復元時の一件ずつの転記と全BLOB・日時・識別子の保持は tests/data-history.mjs で確認する。
// ホームの選択後クリック・関係の4線種と凡例・強調・ドラッグ後の定位置復帰は tests/ui/home-relations.spec.ts で確認する。保存データは変更しない。
// 施策の復元後の番号再利用は tests/initiative-owner-rebase.mjs で両保存順と回復を確認する。
// 科目の復元後の番号再利用は tests/account-reference-rebase.mjs で両保存順と回復を確認する。
// 共通マスタの保存結果同期と保存中の所属変更は tests/named-master-rebase.mjs と tests/ui/named-master-rebase.html で確認する。
// 展開区分の取消・履歴復元後の番号再利用、旧参照の競合拒否、通常改名・独立編集、別ファイル保存と失敗保護は tests/classification-rebase.mjs で確認する。
// SQLite準備の失敗・同時要求・再試行・正規スキーマの一括公開は tests/sqlite-runtime.test.mjs、実Workerの再選択は tests/ui/sqlite-entry.spec.ts で確認する。
// 期間の未選択と実ID -1・0・正数の表示と昇降順は tests/initiative-sort.mjs と tests/ui/initiative-sort.spec.ts の正常なSQLite計画で確認する。
// 集計候補はID索引を共有し、自己・子孫を禁止する。1000/5000独立集計の参照量は tests/aggregation-data.mjs、所属・保存失敗は tests/ui/aggregations.spec.ts で確認する。
// 集計所属の一度の分類、1000階層の実SQLite保存・読込、1000/5000集計の走査量は tests/aggregation-positions.mjs で確認する。
// 展開表では期間内の区分別結合・区分内登録順・未選択の末尾空欄を確認する。その他は通信運搬費と消耗品費の削減に設定する。
// 施策の科目欄はコードなしの全文表示と狭幅での横スクロールを tests/ui/initiative-table-layout.spec.ts で確認する。
import { PORTFOLIO_COUNT, portfolioScenario } from "./sample-portfolio";
// 集計所属順は現行DDLの非負・安全な整数で生成する。不正型・値域・採番境界の拒否は tests/aggregation-positions.mjs の合成DBで確認する。
// Excel出力では選択した表と条件を保ち、従来の三表と計算元、および基本関数による金額の再計算を確認する。
// Excel計算元の行順・分類名・種別・ID・元金額とマスタ索引の共有は tests/report-workbook.mjs で確認する。
// 多数の展開・非連続集計の数式長と引数上限は tests/report-workbook.mjs の合成計画で確認する。
// 前年Excelの確認表の名称取得・改名・大量変更の走査量は tests/spreadsheet-io.mjs、取消・保存失敗は tests/ui/spreadsheet-io.spec.ts で確認する。
// 出力条件は現在の所属・分類へ整合させる。所属追加・マスタ追加の取消とやり直しは tests/ui/spreadsheet-io.spec.ts で確認する。
import { editDatabase } from "../../Triadichrome-extension/src/core/storage/transaction";
// 履歴の全選択・解除・日時入力・確認取消・削除失敗は tests/ui/data-history.spec.ts、1000/5000/10000件の選択走査量は tests/data-history.mjs で確認する。
import { trackHistoryChange, recordDataHistory } from "../../Triadichrome-extension/src/core/storage/dataHistory";
import { savePreviousAmounts } from "../../Triadichrome-extension/src/core/storage/settings";
import { INITIAL_KINDS } from "../../Triadichrome-extension/src/core/domain/kinds";
import { INITIAL_PERIOD_TYPES } from "../../Triadichrome-extension/src/core/storage/periodMasterSchema";
import { INITIAL_DEPARTMENTS } from "../../Triadichrome-extension/src/core/storage/departmentSchema";
import { INITIAL_INDUSTRIES } from "../../Triadichrome-extension/src/core/storage/industrySchema";
import { INITIAL_EXPANSIONS } from "../../Triadichrome-extension/src/core/storage/expansionSchema";
import { changeDepartmentMaster } from "../../Triadichrome-extension/src/core/storage/departmentMaster";
import { changeIndustryMaster } from "../../Triadichrome-extension/src/core/storage/industryMaster";
import { changeAccountMaster } from "../../Triadichrome-extension/src/core/storage/accountMaster";
import { changeAggregationMaster } from "../../Triadichrome-extension/src/core/storage/aggregationMaster";
import { createTriadicDatabase, openTriadicDatabase } from "../../Triadichrome-extension/src/core/storage/triadicDatabase";
import { currentFiscalYear, initiativeMonths } from "../../Triadichrome-extension/src/core/domain/calendar";
import { readPlanContents } from "../../Triadichrome-extension/src/core/storage/readPlan";
import { createInitiativeDraft } from "../../Triadichrome-extension/src/core/domain/initiativeRules";
import type { KindId } from "../../Triadichrome-extension/src/core/domain/kinds";
import { registerInitiative, updateInitiative } from "../../Triadichrome-extension/src/core/storage/initiatives";
import { type InitiativeEntryDraft, type InitiativeRow } from "../../Triadichrome-extension/src/core/domain/plan";

import { amountItems, amountItemComposition } from "../../Triadichrome-extension/src/core/domain/amountItems";
import { accountTypes } from "../../Triadichrome-extension/src/core/domain/accountTypes";

// All amount literals are in thousands of yen; 0.001 represents one yen.
// Previous amounts span every industry/department pair; varying sales verify full totals and department/industry filters.
// Shared by the preview and the generated .triadic sample, using the app's own validation.
export const LARGE_SAMPLE_INITIATIVES = PORTFOLIO_COUNT;
export const SAMPLE_MAX_BYTES = 50_000_000;

export async function createSamplePlan(fiscalYear = currentFiscalYear(), large = false): Promise<Uint8Array> {
  let bytes = await createTriadicDatabase(fiscalYear);
  const categoryIdsByName = new Map((await readPlanContents(bytes)).expansionCategories.map(item => [item.categoryName, item.id]));
  if (Object.values(accountTypes).join("・") !== "売上・売上原価・費用・利益") throw new Error("科目属性マスタの固定4件が一致しません。");
  if (amountItems.map(item => item.name).join("・") !== "売上・費用・利益" || amountItems.map(amountItemComposition).join(";") !== "売上 − 売上原価;費用;売上 − 売上原価 − 費用 ＋ 利益") throw new Error("金額項目マスタの固定項目・構成が一致しません。");
  const kinds = (await readPlanContents(bytes)).kinds;
  if (kinds.length !== INITIAL_KINDS.length || kinds.some((item, index) => item.kindName !== INITIAL_KINDS[index]!.kindName)) throw new Error("種別マスタの初期データが一致しません。");
  if (kinds.length !== 2) throw new Error("予算の2種別を確認できません。");
  const expansions = (await readPlanContents(bytes)).expansions;
  if (expansions.length !== INITIAL_EXPANSIONS.length || expansions.some((item, index) => item.expansionCode !== INITIAL_EXPANSIONS[index]!.expansionCode || item.expansionName !== INITIAL_EXPANSIONS[index]!.expansionName)) throw new Error("展開マスタの初期データが一致しません。");
  const periodTypes = (await readPlanContents(bytes)).periodTypes;
  if (periodTypes.length !== INITIAL_PERIOD_TYPES.length || periodTypes.some((item, index) => item.periodName !== INITIAL_PERIOD_TYPES[index]!.periodName)) throw new Error("期間マスタの初期データが一致しません。");
  const departments = (await readPlanContents(bytes)).departments;
  if (departments.length !== INITIAL_DEPARTMENTS.length || departments.some((item, index) => item.departmentName !== INITIAL_DEPARTMENTS[index]!.departmentName)) throw new Error("部署マスタの初期データが一致しません。");
  const industries = (await readPlanContents(bytes)).industries;
  if (departments.some(item => item.industryIds.length !== INITIAL_INDUSTRIES.length || INITIAL_INDUSTRIES.some(industry => !item.industryIds.includes(industry.id)))) throw new Error("部署の複数業種の対応が一致しません。");
  if (industries.length !== INITIAL_INDUSTRIES.length || industries.some((item, index) => item.industryName !== INITIAL_INDUSTRIES[index]!.industryName)) throw new Error("業種マスタの初期データが一致しません。");
  const accounts = new Map((await readPlanContents(bytes)).accounts.map(account => [account.accountName, account.id]));
  for (const [accountCode, accountName] of (large ? [] : [["001", "未所属費用"], ["599", "削除確認用科目"]])) {
    const changed = await changeAccountMaster(bytes, { type: "add", accountCode: accountCode!, accountName: accountName!, accountType: "expense", ...(accountCode === "599" ? { displayName: "表示名確認用" } : {}) });
    bytes = changed.bytes;
    accounts.set(accountName!, changed.accounts.find(account => account.accountCode === accountCode)!.id);
  }
  if (!large) bytes = await changeAggregationMaster(bytes, { type: "add", name: "編集・削除確認用集計" });

  const row = (name: string, amounts: InitiativeRow["amounts"]): InitiativeRow => ({ accountId: accounts.get(name)!, amounts });
  const annual = (name: string, amount: number, growth = 0): InitiativeRow => row(name,
    Object.fromEntries(initiativeMonths.map((month, index) => [month, String(amount + index * growth)])));
  const add = async (name: string, note: string, rows: InitiativeRow[], periodTypeId?: number) => {
    if (large && ["ゼロと相殺の確認", "未確定施策の入力準備", "科目変更と削除の確認", "期間差の開始年月確認"].includes(name)) return;
    const businessNames: Record<string, string> = {
      "確定予算の手修正": "代理店販路の追加契約",
      "確定予算の下期調整": "法人向け定期受注の拡大",
      "確定予算のゼロ固定": "グループ取引の契約更新",
    };
    const codes: Record<string, string> = {
      "既存商品の販売拡大": "5", "保守サービスの新規契約": "5", "季節キャンペーン": "5",
      "通信運搬費と消耗品費の削減": "1", "サブスクリプション事業の拡大": "2",
      "設備更新と償却費の見直し": "1", "助成金の受入れ": "6",
      "ゼロと相殺の確認": "8", "未確定施策の入力準備": "7",
    };
    const expansionId = expansions.find(item => item.expansionCode === (codes[name] ?? "5"))!.id;
    // Choose a meaningful period instead of cycling incompatible start-month rules.
    bytes = await registerInitiative(bytes, { name: large ? businessNames[name] ?? name : name, note: large ? note.replace("明示0", "0").replace("一次の変更へ追従する月と固定する月を区別する。", "10月分は翌年度へ延期し、それ以外は年間の契約計画を維持する。") : note, expansionId, expansionCategoryId: name === "設備更新と償却費の見直し" ? categoryIdsByName.get("設備投資")! : name === "通信運搬費と消耗品費の削減" ? categoryIdsByName.get("その他")! : null, industryId: industries[(await readPlanContents(bytes)).initiatives.filter(item => item.industryId != null).length % industries.length]!.id, periodTypeId: name === "未確定施策の入力準備" ? null : periodTypeId ?? periodTypes.find(item => item.periodName === "新規")!.id, departmentId: departments[(await readPlanContents(bytes)).initiatives.length % departments.length]!.id, fiscalYear: String(fiscalYear), rows: rows.map((row,index) => ({ ...row, id: `sample:${name}:${index}` })) });
  };

  await add("既存商品の販売拡大", "直販と代理店の販路を増やす年間計画。直販売上は4月120千円から毎月5千円増、代理店は30千円から毎月1千円増。原価・広告・出張費と販売奨励金を計上。確定は4月130、10月170、11月0に見直す。", [
    { ...annual("売上高", 120, 5), overrides: { 2: { 4: "130", 10: "170", 11: "0" } } }, annual("売上高", 30, 1), annual("本支店売上原価", 60, 2.5),
    annual("宣伝広告費", 8), annual("旅費", 3), annual("営業外収益", 0.125),
  ]);
  await add("保守サービスの新規契約", "7月から保守契約を開始し、契約社数増に応じて売上・原価を段階的に増やす。月20千円の人員費を追加。確定では開始が8月へ延期し、7月を全科目で明示0にする。", [
    { ...row("グループ売上高", { 7: "80", 8: "80", 9: "100", 10: "100", 11: "120", 12: "120", 1: "140", 2: "140", 3: "160" }), overrides: { 2: { 7: "0" } } },
    { ...row("店内売上原価", { 7: "30", 8: "30", 9: "40", 10: "40", 11: "50", 12: "50", 1: "60", 2: "60", 3: "70" }), overrides: { 2: { 7: "0" } } },
    { ...row("給料手当", { 7: "20", 8: "20", 9: "20", 10: "20", 11: "20", 12: "20", 1: "20", 2: "20", 3: "20" }), overrides: { 2: { 7: "0" } } },
  ]);
  await add("季節キャンペーン", "夏季と年末の販促。5・6月および11月の広告を先行投入し、6・7・12月の受注を増やす。翌1月は増収0を計画する。", [
    row("売上高", { 6: "50", 7: "75", 12: "180", 1: "0" }),
    row("本支店売上原価", { 6: "20", 7: "30", 12: "72", 1: "0" }),
    row("宣伝広告費", { 5: "15", 6: "25", 11: "40" }),
  ]);
  await add("通信運搬費と消耗品費の削減", "通信契約見直しで毎月2.5千円、消耗品の共同調達で毎月1.25千円を削減。3月は追加1円の精算を含む。売上を増やさず費用を減らす。", [
    annual("通信運搬費", -2.5), row("消耗品費", { ...annual("消耗品費", -1.25).amounts, 3: "-1.251" }),
  ]);
  await add("サブスクリプション事業の拡大", "継続契約を毎月積み上げ、売上40千円から月10千円ずつ増やす。原価は15千円から月2千円増、担当者の給与30千円と賃借料10千円を負担する。", [
    annual("本支店売上高", 40, 10), annual("店内売上原価", 15, 2),
    annual("給料手当", 30), annual("賃借料", 10),
  ]);
  await add("設備更新と償却費の見直し", "9月に25千円の消耗品を購入し、10月から新設備の償却18千円を開始。旧設備の償却5千円を同時に減額する。", [
    row("固定資産減価償却費", { 10: "18", 11: "18", 12: "18", 1: "18", 2: "18", 3: "18" }),
    row("固定資産減価償却費", { 10: "-5", 11: "-5", 12: "-5", 1: "-5", 2: "-5", 3: "-5" }),
    row("消耗品費", { 9: "25" }),
  ]);
  await add("助成金の受入れ", "事業移管に伴う支援金を9月100千円、翌3月50千円で受け入れる。売上・費用と分けて営業外収益へ計上する。", [row("営業外収益", { 9: "100", 3: "50" })]);
  await add("ゼロと相殺の確認", "5月の請求12.5千円と同額の値引きで売上増減0。4月は明示0、その他の空欄は0として保存。明細には根拠となる正負の行を残す。", [
    row("売上高", { 4: "0", 5: "12.5" }), row("売上高", { 5: "-12.5" }),
  ]);
  await add("未確定施策の入力準備", "効率化案は検討中のため期間未選択・全月0。未所属費用の科目行を残し、金額決定後の入力と集計所属の変更を試せる準備状態。", [row("未所属費用", {})]);

  await add("確定予算の手修正", "年間の販路追加を月100千円で見込む。確定では4月を120へ上方修正し、5月は契約未成立のため明示0とする。", [{ ...annual("売上高", 100), overrides: { 2: { 4: "120", 5: "0" } } }]);
  await add("確定予算の下期調整", "月100千円の継続受注に、10月だけ追加50千円を確定。上期600、下期650、通期1250千円となる単月の見直し。", [{ ...annual("売上高", 100), overrides: { 2: { 10: "150" } } }]);
  await add("確定予算のゼロ固定", "グループ取引を月100千円で計画。確定4月は90、10月は取引延期で0。一次の変更へ追従する月と固定する月を区別する。", [{ ...annual("グループ売上高", 100), overrides: { 2: { 10: "0", 4: "90" } } }]);
  await add("科目変更と削除の確認", "稟議前の業務改善案。未所属費用と売上高を全月0で準備し、金額のない行の科目変更・削除・追加を試す。", [row("未所属費用", {}), row("売上高", {})]);
  await add("期間差の開始年月確認", "前年10月開始契約の効果が4〜9月に残る。前年条件との差10千円と調整-10千円を別行で記録。確定では10月も延長し前年11月開始として判定する。", [10, -10].map(amount => ({
    ...row("売上高", Object.fromEntries([4, 5, 7, 8, 9].map(month => [month, String(amount)]))),
    overrides: { 2: { 10: String(amount) } },
  })), periodTypes.find(item => item.periodName === "期間差")!.id);
  for (const [index, industry] of industries.entries()) {
    for (const [departmentIndex, department] of departments.entries()) {
      bytes = await savePreviousAmounts(bytes, { previousKind: 1, industryId: industry.id, departmentId: department.id, rows: [
        annual("売上高", 1000 + index * 100 + departmentIndex * 10),
        // 未入力の6月は保存行を作らず、入力欄と集計では0として確認する。
        row("グループ売上高", { 4: "125.125", 5: "-20.001", 3: "0.001" }), annual("本支店売上原価", 400), annual("給料手当", 200), annual("営業外収益", 10),
      ].map(row => ({ accountId: row.accountId!, amounts: row.amounts })) });
    }
  }
  const forecast = await readPlanContents(bytes);
  for (const industry of industries) for (const department of departments) {
    bytes = await savePreviousAmounts(bytes, { previousKind: 2, industryId: industry.id, departmentId: department.id,
      rows: forecast.accounts.map(account => ({ accountId: account.id, amounts: Object.fromEntries(initiativeMonths.map(month => {
        const amount = forecast.previousAmounts.find(value => value.previousKind === 1 && value.industryId === industry.id && value.departmentId === department.id && value.accountId === account.id && value.month === month)?.amount ?? "0";
        return [month, month === 2 && account.accountName === "売上高" ? String(Number(amount) + 10) : amount];
      })) })) });
  }
  if (large) {
    // Insert the finite scenario catalog in one production transaction, with final schema/data validation.
    const scenarios = expansions.flatMap((expansion, e) => industries.flatMap((industry, i) => departments.map((department, d) => ({
      ...portfolioScenario(e, i, d, accounts), expansion, industry, department,
    }))));
    bytes = (await editDatabase(bytes, database => {
      const firstOrder = Number(database.exec("SELECT MAX(sort_order) + 1 FROM initiatives")[0]!.values[0]![0]);
      scenarios.forEach((scenario, index) => {
        database.run("INSERT INTO initiatives (name,note,expansion_id,expansion_category_id,industry_id,department_id,period_type_id,sort_order) VALUES (?,?,?,?,?,?,?,?)",
          [scenario.name,scenario.note,scenario.expansion.id,scenario.categoryName === null ? null : categoryIdsByName.get(scenario.categoryName)!,scenario.industry.id,scenario.department.id,periodTypes.find(item => item.periodName === "新規")!.id,firstOrder+index]);
        const id = Number(database.exec("SELECT last_insert_rowid()")[0]!.values[0]![0]);
        scenario.rows.forEach((row, position) => {
          const rowId = `portfolio:${index}:${position}`;
          database.run("INSERT INTO initiative_rows (id,initiative_id,account_id,sort_order) VALUES (?,?,?,?)", [rowId,id,row.accountId!,position]);
          for (const month of initiativeMonths) database.run("INSERT INTO initiative_amounts (row_id,kind_id,month,amount_yen) VALUES (?,?,?,?)", [rowId,1,month,Math.round(Number(row.amounts[month])*1000)]);
          for (const [month, amount] of Object.entries(row.overrides?.[2] ?? {})) database.run("INSERT INTO initiative_amounts (row_id,kind_id,month,amount_yen) VALUES (?,?,?,?)", [rowId,2,Number(month),Math.round(Number(amount)*1000)]);
        });
      });
    })).bytes;
  }
  if (large) {
    for (const [index, department] of departments.entries()) bytes = await changeDepartmentMaster(bytes, {
      type: "update", id: department.id, departmentName: index === 0 ? "東日本営業部" : "西日本営業部", industryIds: department.industryIds,
    });
  }
  const timestamp = `${String(fiscalYear).padStart(4, "0")}-04-01T00:00:00.000Z`;
  const stable = async (input: Uint8Array) => {
    const database = await openTriadicDatabase(input);
    try {
      // Normalize timestamps and creation identities for deterministic fixtures.
      database.run("UPDATE document_info SET created_at = ?, updated_at = ?", [timestamp, timestamp]);
      database.run("UPDATE data_history_state SET saved_at = ?", [timestamp]);
      for (const [table, prefix] of [["industries", "1"], ["departments", "2"], ["initiatives", "3"]]) {
        for (const [id] of database.exec(`SELECT id FROM ${table}`)[0]?.values ?? []) {
          database.run(`UPDATE ${table} SET identity = ? WHERE id = ?`, [prefix + Number(id).toString(16).padStart(31, "0"), Number(id)]);
        }
      }
      return database.export();
    } finally { database.close(); }
  };
  bytes = await changeDetailDocument(bytes, { type: "create", document: {
    id: "00000000-0000-4000-8000-000000000001", name: "全パーツの保存確認", revision: 0, parts: [
      { id: "sample-text", kind: "text", x: 0, y: 0, width: 168, height: 96, text: "見積と月別の算定根拠\n保存・取消・履歴を確認" },
      { id: "sample-image", kind: "image", x: 168, y: 0, width: 336, height: 240, name: "確認用.png", src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAYAAACzzX7wAAAAG0lEQVR4AWM0ytvynwEPYGIgAJgYCAAmBgIAAC5JAlut5VLxAAAAAElFTkSuQmCC" },
      { id: "sample-horizontal", kind: "table-horizontal", x: 0, y: 240, width: 1200, height: 192, cells: [["単価", ...Array.from({ length: 12 }, (_, index) => String(index + 1))]] },
      { id: "sample-vertical", kind: "table-vertical", x: 1200, y: 0, width: 336, height: 456, cells: [["人数", ...Array(12).fill("2")]] },
    ],
  } });
  bytes = await stable(bytes);
  const initiative = (await readPlanContents(bytes)).initiatives[0]!;
  const draft: InitiativeEntryDraft = { ...initiative, fiscalYear: String(fiscalYear) };
  const historic = (amount: string) => ({ ...draft, note: large ? `直販契約の年間計画。4月の見込額は${amount}千円。代理店販売・原価・広告費・出張費は年間の契約計画に従う。` : "履歴確認用の過去の状態", rows: draft.rows.map((row, index) => index === 0 ? { ...row, amounts: { ...row.amounts, 4: amount } } : row) });
  const initial = await stable(await updateInitiative(bytes, initiative.id, fiscalYear, historic("100")));
  bytes = await trackHistoryChange(initial, await stable(await updateInitiative(initial, initiative.id, fiscalYear, historic("110"))), timestamp);
  bytes = await recordDataHistory(bytes, timestamp.replace("00:00:00", "00:05:00"));
  bytes = await trackHistoryChange(bytes, await stable(await updateInitiative(bytes, initiative.id, fiscalYear, draft)), timestamp.replace("00:00:00", "00:06:00"));
  return recordDataHistory(bytes, timestamp.replace("00:00:00", "00:11:00"));
}

/** Accepted boundary data: row and period sums cancel before range validation. */
export async function createCostCancellationPlan(fiscalYear = 2026) {
  let bytes = await createTriadicDatabase(fiscalYear);
  const plan = await readPlanContents(bytes);
  const accountId = plan.accounts.find(account => account.accountType === "sales")!.id;
  const maximum = "9007199254740.991";
  for (const [index, sign] of [1, 1, -1].entries()) bytes = await registerInitiative(bytes, {
    name: `相殺後の上限確認${index + 1}`, note: "別施策の順を変えても総原価表・施策一覧・展開表の金額は同じです。4月・5月・6月の年間計も相殺後の上限内です。",
    fiscalYear: String(fiscalYear), expansionId: 1, industryId: 1, departmentId: 1,
    rows: [{ accountId, amounts: { 4: sign === 1 ? maximum : `-${maximum}`,
      5: sign === 1 ? `-${maximum}` : maximum, 6: sign === 1 ? maximum : `-${maximum}` } }],
  });
  return bytes;
}

/** Valid saved IDs, including -1 and 0, must stay distinct from an unselected category. */
export async function createSignedCategoryPlan(large = false, year = currentFiscalYear()): Promise<Uint8Array> {
  return (await editDatabase(await createSamplePlan(year), db => {
    db.run("INSERT INTO expansion_categories(id,name) VALUES(-1,'負ID区分'),(0,'ゼロID区分'),(10000,'正ID区分')");
    db.run("INSERT INTO expansion_category_assignments(expansion_id,category_id) VALUES(1,-1),(1,0),(1,10000)");
    db.run("DELETE FROM initiative_amounts");
    db.run("DELETE FROM initiative_rows");
    db.run("DELETE FROM initiatives");
    const account = db.exec("SELECT id FROM accounts LIMIT 1")[0]!.values[0]![0]!;
    for (let index = 0; index < (large ? 210 : 4); index++) {
      const category = [-1, 0, 10000, null][index % 4]!;
      db.run("INSERT INTO initiatives(name,expansion_id,expansion_category_id,industry_id,department_id,sort_order) VALUES(?,1,?,1,1,?)", [`区分確認${index}`, category, index]);
      const id = db.exec("SELECT last_insert_rowid()")[0]!.values[0]![0]!;
      const row = `signed-category:${id}`;
      db.run("INSERT INTO initiative_rows(id,initiative_id,account_id,sort_order) VALUES(?,?,?,0)", [row, id, account]);
      for (let month = 1; month <= 12; month++) db.run("INSERT INTO initiative_amounts(row_id,kind_id,month,amount_yen) VALUES(?,1,?,0)", [row, month]);
    }
  })).bytes;
}

/** Accepted cell amounts with an overflowing display total, for both budget kinds. */
export async function createInitiativeOverflowPlan(kind: KindId) {
  let bytes = await createTriadicDatabase(2026);
  const contents = await readPlanContents(bytes);
  const accountId = contents.accounts.find(account => account.accountType === "sales")!.id;
  const draft = { ...createInitiativeDraft("2026"), name: "上限確認A", expansionId: 1, industryId: 1, departmentId: 1,
    rows: [1, 2].map(() => ({ accountId, amounts: { 4: kind === 1 ? "5000000000000" : "0" },
      overrides: { 2: { 4: kind === 2 ? "5000000000000" : "0" } } })) };
  bytes = await registerInitiative(bytes, draft);
  return registerInitiative(bytes, { ...draft, name: "通常確認", rows: [{ accountId, amounts: { 4: "1" }, overrides: { 2: { 4: "2" } } }] });
}

/** Industry candidates without an assignment or amounts, plus a single-industry department. */
export async function createCostUnassignedIndustryPlan() {
  let bytes = await createTriadicDatabase(2026);
  bytes = await changeIndustryMaster(bytes, { type: "add", industryCode: "10", industryName: "未所属の確認業種" });
  return changeDepartmentMaster(bytes, { type: "add", departmentName: "単一業種確認部署", industryIds: [1] });
}

/** Two registrations from one base: matching headers, independent row IDs and amounts. */
export async function createConcurrentInitiativeFixture() {
  const base = await createTriadicDatabase(2026);
  const accountId = (await readPlanContents(base)).accounts.find(account => account.accountType === "sales")!.id;
  const draft = { ...createInitiativeDraft("2026"), name: "同名施策", expansionId: 1, industryId: 1, departmentId: 1 };
  const localDraft = { ...draft, rows: [{ id: "local-registration", accountId, amounts: { 4: "100" } }] };
  const externalDraft = { ...draft, rows: [{ id: "external-registration", accountId, amounts: { 4: "200" } }] };
  return { base, localDraft, externalDraft, local: await registerInitiative(base, localDraft), external: await registerInitiative(base, externalDraft) };
}

/** Empty old initiative versus a recreated same-number initiative after undo. */
export async function createRecreatedInitiativeFixture() {
  const initial = await createTriadicDatabase(2026);
  const accountId = (await readPlanContents(initial)).accounts.find(account => account.accountType === "sales")!.id;
  const draft = { ...createInitiativeDraft("2026"), name: "同じ名前", expansionId: 1, industryId: 1, departmentId: 1,
    rows: [{ id: "old-zero-row", accountId, amounts: { 4: "0" } }] };
  const registered = await registerInitiative(initial, draft);
  const id = (await readPlanContents(registered)).initiatives[0]!.id;
  const base = await updateInitiative(registered, id, 2026, { ...draft, rows: [] });
  const external = await registerInitiative(initial, { ...draft, rows: [{ id: "recreated-row", accountId, amounts: { 4: "200" } }] });
  return { base, external };
}

/** Both owners have no rows: only creation identity can protect pending detail input. */
export async function createReplacedEmptyInitiativeFixture() {
  const fixture = await createRecreatedInitiativeFixture();
  const initiative = (await readPlanContents(fixture.external)).initiatives[0]!;
  const zeroed = await updateInitiative(fixture.external, initiative.id, 2026, { ...initiative, fiscalYear: "2026",
    rows: initiative.rows.map(row => ({ ...row, amounts: {} })) });
  return { base: fixture.base, external: await updateInitiative(zeroed, initiative.id, 2026, {
    ...initiative, name: "置換後の施策", note: "置換先の備考", fiscalYear: "2026", rows: [],
  }) };
}

/** Two independently overflowing initiatives whose account-level totals cancel. */
export async function createCostInitiativeCancellationPlan(kind: KindId = 1) {
  let bytes = await createTriadicDatabase(2026);
  const accountId = (await readPlanContents(bytes)).accounts.find(account => account.accountType === "sales")!.id;
  for (const sign of [1, -1]) bytes = await registerInitiative(bytes, {
    ...createInitiativeDraft("2026"), name: `科目別相殺${sign}`, expansionId: 1, industryId: 1, departmentId: 1,
    rows: [1, 2].map(() => ({ accountId, amounts: { 4: kind === 1 ? String(sign * 5000000000000) : "0" },
      overrides: { 2: { 4: kind === 2 ? String(sign * 5000000000000) : "0" } } })),
  });
  return bytes;
}

/** Non-visible previous account subtotals overflow, but expansion sales/profit cancel. */
export async function createPreviousExpansionCancellationPlan() {
  let bytes = await createTriadicDatabase(2026);
  const accounts = (await readPlanContents(bytes)).accounts.filter(account => account.accountType === "sales").slice(0, 2);
  for (const departmentId of [1, 2]) bytes = await savePreviousAmounts(bytes, { previousKind: 1, industryId: 1, departmentId,
    rows: accounts.map((account, index) => ({ accountId: account.id, amounts: { 4: index === 0 ? "5000000000000" : "-5000000000000" } })) });
  return bytes;
}

/** Expense alone overflows; all displayed expansion sales/profit amounts cancel to zero. */
export async function createExpenseOverflowPlan() {
  const bytes = await createTriadicDatabase(2026);
  const accounts = (await readPlanContents(bytes)).accounts;
  const expense = accounts.find(account => account.accountType === "expense")!.id;
  const profit = accounts.find(account => account.accountType === "profit")!.id;
  return registerInitiative(bytes, {
    ...createInitiativeDraft("2026"), name: "費用だけ上限超過", expansionId: 1, departmentId: 1, industryId: 1,
    rows: [expense, expense, profit, profit].map((accountId, index) => ({ id: `expense-overflow-${index}`, accountId, amounts: {4:"5000000000000"} })),
  });
}
