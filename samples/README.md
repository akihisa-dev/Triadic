# 三面運輸の予算サンプルと機能の確認

[2027年度サンプル予算.triadic](2027年度サンプル予算.triadic)は、物流会社「三面運輸」の5か年計画2年目の単年度予算です。会社設定・数値根拠・各施策・継続更新の正本は[サンプル予算設計](../docs/sample-budget-design.md)です。利用するアプリの版はrootの[package.json](../package.json)、保存形式は現行実装に従います。「2027年度サンプル予算」として、2027年4月〜2028年3月を収録します。生成日にかかわらず基準年度は2027です。

前年実績は売上120億円、営業利益6億2,115万円。既存事業はルート配送・チャーター配送・アパレル倉庫で、7圏域と本社を持ちます。今回の予算は名古屋新輸送センターと関東第一倉庫の開設、衣料品以外の荷主開拓、機械化・AI、既存荷主の物量減と費用上昇を含みます。現在は29施策・104科目行・3時点の履歴ですが、件数やサイズは目標ではなく、必要な業務内容で変わります。

金額の入力単位は千円です。3,000は300万円、0.001は1円を表します。前年実績を基準にした確定予算は売上12,664,496,000円、営業利益812,791,225円、経常利益804,991,225円。前年見込を基準にすると未確定だった前年値の差が加わるため、表示額は異なります。

部署以外のマスタは、名称・コード・属性・構成・所属・並び順を含めデフォルトのまま保持します。事業の呼び方と業種マスタの対応は[設計書の分類](../docs/sample-budget-design.md#保存する分類)を参照してください。この条件はエージェントのサンプル作成に適用し、利用者のマスタ編集を制限しません。実ファイルと全履歴のデフォルト一致を自動検証します。

## 開き方とデータの役割

`npm run samples:generate`で生成し、アプリの「ファイルを開く」で上記ファイルを選択します。Codex内の画面確認では `npm run dev:ui` で起動した[会社予算の確認入口](http://127.0.0.1:4173/tests/ui/preview.html?data=large)を使用できます。ここでは実ファイルの内容を読み込み、編集・保存はメモリ内で再現します。

会社予算には業務上の施策だけを入れます。既存の14施策の小規模データ（`?data=full`）は空欄・0・科目行の操作などに使用します。上限超過、不正形式、許可拒否、競合、大量行などは専用の合成データ・模擬ファイル・自動テストで確認します。確認用の施策を正常な会社予算や履歴へ混ぜません。

## 実装済み機能との対応

根拠パスの `core` は `Triadic-extension/src/core`、`extension` は同 `src/extension` です。「自動」は通常検証で実行する検査、「画面」はCodex内ブラウザで行う操作を表します。未実施の確認を実施済みと扱わず、今回の結果は末尾に記載します。

| 実装済み機能・条件 | 根拠となる実装 | データ・初期状態 | 操作・再現方法 | 期待結果 | 確認方法 |
|---|---|---|---|---|---|
| 新規作成・形式・年度 | core/storage/triadicDatabase.ts・triadicSchema.ts | 2027年度一つ、前年見込/実績、一次/確定 | 生成したSQLiteを再読込。不正/旧形式は専用データ | 整合性・参照制約が正常。旧形式は移行せず拒否 | 自動: sample-plan.mjs・file-boundaries.mjs |
| 前年入力・見込と実績 | core/storage/settings.ts・core/tables/previousGrid.ts | 事業と圏域ごとの前年元帳。1〜3月に見込/実績差 | 基準前年を切替。前年入力は東京圏/不動産Bを選択 | 前年実績の外部売上120億円。見込の未確定売上を独立保持 | 自動: reference-sample.mjs・previous-baselines.mjs。画面: 前年切替 |
| 部署・業種・所属 | core/storage/departmentMaster.ts・industryMaster.ts | 7圏域＋本社、デフォルト9業種。営業倉庫は衣料品・非衣料品とも不動産B | マスタと絞込候補を確認。不正所属は私有コピーで登録 | 未所属の業種を登録拒否。不動産Aのテナント収入はなく、本社は一般管理費・営業外のみ | 自動: sample-plan.mjs・department-data.mjs |
| 展開・区分・期間・開始年月 | core/storage/expansionMaster.ts・core/domain/initiativeStartMonth.ts | 初期8展開/6区分。期間差は前年10月・11月 | 展開表/施策詳細で分類を確認。負ID/0/未選択は専用データ | 業務に合う分類。期間差は前年、設備導入は準備月から活動 | 自動: start-months.mjs・expansion-table-view.mjs。画面: 詳細 |
| 施策登録・詳細・同科目複数行 | core/storage/initiatives.ts・extension/InitiativeDetailPage.tsx | 東京の倉庫作業料/保管料、AI導入支援/委託削減は同科目別行 | コピーを編集・登録し再読込 | 各行の金額を独立保持、元施策不変 | 自動: initiative-data.mjs・duplicate-initiative.mjs。画面: 月額編集 |
| 科目行の削除確認・並べ替え | extension/InitiativeAmountGrid.tsx・core/storage/initiatives.ts | 既存の科目行と両予算を使用。予算設計・保存項目の変更なし | 小規模データで削除取消・確定と行ハンドルのドラッグ、再表示、操作取消を確認 | キャンセルで元入力を保持。並べ替えで金額・手修正・行識別子を保持 | 画面: initiative-row-actions.spec.ts・auto-save.spec.ts。自動: auto-save.mjs |
| 一次の引継ぎ・確定0・同額固定 | core/domain/kinds.ts・core/storage/initiatives.ts | 東京運賃4月3,000の同額固定、関東倉庫10月の確定0 | コピーの一次を変更し再読込、確定値を解除 | 固定中は3,000/0を維持、解除後は一次へ追従 | 自動: reference-sample.mjs・kind-amount-storage.mjs。画面: 種別切替 |
| 開設前費用・検収延期 | core/tables/planTables.ts・core/domain/kinds.ts | 名古屋7月開設、関東倉庫一次10月/確定11月 | 関東倉庫の10月/11月を比較 | 10月確定売上/変動費/償却0、家賃9,000・給与4,200は残る | 自動: reference-sample.mjs。画面: 関東倉庫詳細 |
| 正負・端数・相殺・通年化 | core/domain/amounts.ts・core/tables/initiatives.ts | 物量減、移管の対、3月資材−650.125、前年投資期間差 | 総原価表・展開表・施策一覧を照合し移管の両施策を見る | 移管は全社0。円精度を保持。前年稼働月は重ねて増減しない | 自動: reference-sample.mjs。画面: 展開表 |
| 総原価表・展開表・施策一覧・全月・四半期・半期・年間 | core/tables/planTables.ts・periodTables.ts | 前年2種×予算2種、地域・事業別 | 総原価表・展開表・施策一覧を開く | 保存入力から独立計算した全月・期間計と一致。営業/経常利益を区別 | 自動: reference-sample.mjs・cost-classification.mjs。画面: 総原価表・展開表・施策一覧 |
| 表示条件・列・並べ替え・表示位置 | extension/*TablePage.tsx・windowViewState.ts | 自然な長さの施策名、地域/事業、複数期間 | 表の並べ替え・期間移動。大量行は専用合成データ | 合計・保存内容を変えず全項目へ到達 | 自動: initiative-sort.mjs・table-sort.mjs。画面テスト: large-plan.spec.tsほか |
| 列見出しの絞り込み・並べ替え | core/tables/columnView.ts・extension/TableViewHeader.tsx・extension/TableCellFilter.tsx | 既存の分類・名称・正負額を利用。予算設計・保存項目の変更なし | 見出しとセルの右クリックから条件を組み合わせ、アイコンでの適用・取消・完全一致・解除・並べ替え・詳細往復を試す | 表示対象の合計・展開のまとまり・元データを保つ。取込対象を変えない | 自動: column-view.mjs。画面: column-view.spec.ts・spreadsheet-io.spec.ts |
| 科目・集計・必須/任意・加減算 | core/storage/accountMaster.ts・aggregationMaster.ts | 初期57科目/15集計。未使用科目も保持 | 私有コピーで編集・並べ替え・所属変更・削除 | 使用中科目削除を拒否。未使用は削除可能。循環/重複を拒否 | 自動: default-cost-data.mjs・aggregation-data.mjs。空/未所属は小規模データ |
| 入力・計算式・選択合計・貼付・変換 | core/tables/amountExpression.ts・grid.ts・extension/*Grid.tsx | 同科目複数行、正負、小数、確定0 | 金額編集、範囲選択、=式入力。誤式/変換中は専用テスト | 数値だけを保存。不正値や1円未満は全体を保護し拒否 | 自動: amount-expression.mjs・selection-total.mjs。画面テスト: amount-expression.spec.ts等 |
| 金額の切り取り移動・表の範囲コピー | core/tables/initiativeGrid.ts・previousGrid.ts・extension/useTableRangeCopy.ts | 既存の月額・確定手修正・小計を使用。保存データの追加なし | 同じ入力表の重なる範囲を移動。表示順の金額範囲をコピー | 元値保持・全体検証・明示0・取消・表示範囲外の中間行を保持 | 自動: initiative-grid.mjs・previous-grid.mjs。画面: clipboard-move-copy.spec.ts |
| 施策検索・複製・戻る進む | core/domain/initiativeSearch.ts・initiativeRules.ts・extension/workspace/useWorkspaceNavigation.ts | 固有の施策名・備考・選択分類・3履歴 | 名称/備考/分類の複数語検索と一致分類表示、詳細往復、複製登録前の編集 | 既存データ/入力/一覧条件を保持。検索50件境界・分類名更新は専用データ | 自動: initiative-search.mjs・duplicate-initiative.mjs。画面テスト: initiative-search.spec.ts・initiative-search-retention.spec.ts・initiative-list-return.spec.ts等 |
| 自動保存・取消・やり直し | extension/useAutoSave.ts・core/storage/operationSnapshot.ts | 東京運賃の一次4月3,000 | メモリ内で3,100へ編集→取消→やり直し | 3,000→3,100を復元。確定4月3,000は維持 | 自動: auto-save.mjs・operation-history.mjs。画面: 編集と取消 |
| 時点履歴・比較・復元・削除 | core/storage/dataHistory.ts・core/storage/historyDifference.ts | 1/20:2,600、2/20:2,800、3/20:3,000 | 履歴を開き東京運賃の改訂を閲覧。復元/削除は私有コピー | 同年度の3時点と業務前提を保持。失敗で原本不変 | 自動: reference-sample.mjs・data-history.mjs・history-difference.mjs。画面: 履歴 |
| Excel出力・前年フォーマット取込 | core/spreadsheets/* | 総原価表・展開表・施策一覧と計算元、見込/実績、地域/事業 | 関連変更時だけ専用コマンドで出力/再読込/取込 | 選択した条件・名称・金額を保持し、拒否時は部分更新しない | 追加検証: npm run test:excel / test:ui:excel。通常検証には含めない |
| ファイル・再選択・別名保存 | extension/useFileEntry.ts・extension/PlanSession.ts | 正常実ファイル、模擬ファイルの失敗/取消/許可拒否 | 模擬保存先で保存・取消・再試行 | 元ファイル・入力・参照を保持。成功後だけ参照切替 | 自動: file-boundaries.mjs・new-plan-file.mjs・save-as.mjs・recent-file.mjs |
| 複数ウィンドウ・競合・所有識別 | extension/windowSession*・core/storage/rebase* | 既存の私有コピーと同時編集fixture | 同時編集、外部更新、取消後番号再利用 | 独立変更だけ統合、衝突時入力保護。古い行を別所有者へ移さない | 自動: window-session.mjs・initiative-owner-rebase.mjs・account-reference-rebase.mjsほか |
| ホーム・関連図・仕組みの開示 | extension/HomePage.tsx・screenDataModel.ts・mechanismModel.ts | 現行実装から生成した構造と説明 | ホームの4表示を開く | 実装と説明が一致。説明は縦一列で全文を読み、全保存項目・参照先を開ける。データ変更だけで開示の構造を増やさない | 自動: data-map:check・mechanism-map.test.mjs。配置・移動の検証: home-graph-motion.mjs。画面テスト: home-relations.spec.ts・home-explanation-layout.spec.ts・screen-data-map.spec.ts・mechanism-map.spec.ts |
| テーマ・狭幅・長名・大量行・上限 | extension/styles/*・core/domain/amounts.ts | 会社予算と用途別fixture | 明暗/狭幅、負ID、長名、上限超過等の専用テスト | 業務予算を水増しせず操作・表示・失敗保護を検証 | 各専用テスト。会社予算だけでは全境界を再現しない |

## 更新と検証

機能変更時は[設計書の継続更新手順](../docs/sample-budget-design.md#継続更新の手順)を使います。会社設定・当年度の実施範囲・金額根拠と機能対応を先に照合し、生成元・テスト・この表をそろえて更新します。データに影響のない変更で施策を増やしません。

`npm run samples:generate` は正式な保存処理で生成し、`npm run samples:check` は実ファイルと生成元の全テーブル・全値を照合します。再生成前に、利用者が編集したサンプルは別名へ保護してください。`npm run verify` は標準の型・build・通常テスト・生成一致・版整合を確認します。`.triadic` はローカルで保持し、コミットやGitHub公開へ含めません。

[reference-sample.mjs](../tests/reference-sample.mjs)は会社設定、設計書との施策対応、前年売上配分、開設と延期、期間差、移管、利益維持、両前年×両予算の全月・期間計、保存値の引継ぎ、3履歴、部署以外の全マスタのデフォルト一致、倉庫の分類と業種別収支、利用者によるマスタ編集が可能なことを検証します。[sample-plan.mjs](../tests/sample-plan.mjs)は通常の小規模データと分類制約も検証します。

検証結果は各作業の完了報告とコミット本文に記録します。実ファイルを開けることと、許可拒否・失敗・全画面操作を実施済みであることは区別します。実サイト操作、利用者の実ファイルへの書き込み、実環境の権限拒否、性能測定は、明示された作業範囲に含まれる場合だけ実施します。

未保存入力の対象消失と古い展開削除確認は、保存済みの予算内容を変えずに専用の小規模データで確認します。`missing-editor.spec.ts` は前年・名称・科目の入力保持と取消、`master-delete-sharing.spec.ts` は再作成後の削除拒否を扱います。サンプルの予算設計・生成元・保存項目に変更はありません。

ダッシュボードは既存の2027年度サンプルの全8部署、月別前年値、正負の施策と一次・確定の差を利用します。`tests/dashboard.mjs`と`tests/ui/dashboard.spec.ts`で集計・順位・切り替え・内訳への移動・明暗と狭幅を確認します。保存項目・会社設定・予算の変更はありません。

ダッシュボードの追加9図は既存サンプルの業種・部署・展開・展開区分・期間・費用科目・月額を利用します。業務設定・予算設計・マスタ・サンプル金額の変更は不要です。`dashboard.spec.ts`で比較条件・展開切替・数値表・明暗表示を、`tests/dashboard.mjs`で分類別と全体の一致、未所属・正負・端数を確認します。

総原価表・展開表は前年・一次・確定を独立して選ぶ3列のチェック欄、ダッシュボード・入出力・履歴比較は予算2列のチェック欄を使用します。一次・確定の各列で見込と実績が排他になり、最後の選択は残ります。既存の前年額を使って両予算の基準を別々に切り替えます。全4組の金額・内訳・グラフ・保存は`tests/previous-baselines.mjs`、Excel数式は`tests/report-parity.mjs`、実画面は`tests/ui/comparison-selection.spec.ts`で確認します。総原価表は選択した前年を列、展開表は既存の前年行に表示し、見出しを一行に保つことは、既存サンプルを使う`tests/period-tables.mjs`と`tests/ui/comparison-columns.spec.ts`で確認します。表示列の確認に業務設定や元金額の追加は不要です。保存形式33のファイルを再生成します。

展開区分の古い削除確認は `tests/window-master-delete.mjs` で名称変更・所属変更・追加取消後の番号再利用・保存失敗・削除取消を検証します。既存サンプルの保存値は変更しません。

展開区分は登録時に一つの展開名へ所属させます。既存の初期6区分はコスト所属のまま保持し、会社予算・金額・部署以外のマスタ構成は変えません。登録・所属変更・他展開での選択拒否・使用中保護は `tests/expansion-categories.mjs` と `tests/ui/expansion-categories.spec.ts` で確認します。保存形式33で主ファイルと全履歴を再生成します。

総原価表の差額（確定表示時は確定−前年と確定−一次、一次のみでは一次−前年）と、展開表に前年列がないことは既存サンプルの前年・両予算で確認できます。表示の変更だけなのでサンプルの金額・マスタは変更しません。

施策一覧の並べ替えは現行の列定義と `selectTableRows` を使い、`tests/column-view.mjs` で名称の数字順・予算種別別開始年月・未選択と負数／0の分類番号・1円差を確認します。表示順だけの検証なのでサンプルの金額・マスタは変更しません。

総原価表の内訳の空欄順は `tests/cost-breakdown.mjs` で実画面と同じ列定義・共通選択処理を使い、部署・業種の昇降順と同値・絞り込み・元データ保持を検証します。未所属の境界条件は専用の小規模データを使い、会社予算のマスタは変更しません。

金額範囲の矢印移動は既存の大規模表示用データを使い、`clipboard-move-copy.spec.ts` で三表の上・左へ戻る操作、下端合計、範囲コピーを通常幅と狭幅で確認します。`tests/table-range-visibility.mjs` は固定範囲の寸法を与えてスクロール補正を検証します。保存データとサンプルの業務設定は変更しません。

三表のキーボードだけでの選択開始・再開始と範囲通知も同じ大規模表示用データで確認します。`tests/table-range-selection.mjs`で画面外までの選択と同名行・0の説明を検証し、画面操作は`clipboard-move-copy.spec.ts`を使用します。サンプルの保存内容は変更しません。
