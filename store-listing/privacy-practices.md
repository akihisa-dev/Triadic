# プライバシー欄への入力

現行のManifestとソースコードに基づく入力原稿です。アプリのデータ処理を変更した場合は再確認してください。

## 単一用途の説明（貼り付け用）

企業の年間予算を、前年金額と施策ごとの月別増減から作成し、施策一覧・総原価表・展開表で確認するための拡張機能です。入力・計算・履歴管理・Excel入出力はこの予算作成のために行い、データは利用者の端末内で扱います。

## 権限

Manifestに`permissions`、`optional_permissions`、`host_permissions`の指定はありません。ウェブサイトへのアクセス権限は要求しません。

ファイルは利用者が選択し、ブラウザ標準のファイル読み書き機能で許可されたものだけを開きます。この許可と、Manifestで要求する拡張機能の権限は別のものです。「続きから」のため、直近ファイルへの参照を端末内のIndexedDBに記憶します。参照はファイル内容の外部送信ではありません。配色の選択は拡張機能内のlocalStorageへ記憶し、施策の検索語は同じウィンドウでファイルを開いている間だけメモリに保持します。検索語は永続保存せず、ファイルを閉じると破棄します。

## リモートコード

選択：いいえ、リモートコードを使用していません。

補足（入力を求められた場合）：JavaScriptとSQLiteのWebAssemblyは拡張機能に同梱しています。外部からコードを取得・実行しません。`wasm-unsafe-eval`は同梱SQLiteを端末内で実行するために使います。

## 利用者データ

端末内だけの処理もデータの取り扱いに含まれます。「外部送信なし」を理由に、データを一切扱わないと申告しないでください。

| 申告欄 | 入力方針と実際の処理 |
| --- | --- |
| 財務情報・支払い情報（Financial and payment information） | 予算・売上・費用・利益などの財務情報を端末内で扱うため申告。決済・カード情報は取得しない |
| 個人を特定できる情報 | 氏名・連絡先などの専用入力欄や自動取得なし。施策名・備考・分類の自由入力へ個人情報を入れる運用をする場合は、提出者がその運用を含めて申告内容を確認する |
| 健康情報・認証情報・個人的な通信・位置情報・ウェブ履歴・ユーザーのアクティビティ・ウェブサイトのコンテンツ | それぞれを取得する機能なし。ローカルの業務データの入力を、閲覧サイトの取得と混同しない |

画面の分類名が異なる場合は、その説明に照らして入力します。申告欄とは別に、以下の説明を掲載文・ポリシーへ記載済みです。

> 利用者が入力・選択した施策名、備考、分類、月別金額、前年金額、履歴、施策の検索語、配色設定と、選択したファイルへの参照を端末内で扱います。これらを開発者・外部サーバーへ送信せず、販売・広告・信用審査には利用しません。

利用者データを販売・第三者へ移転しないこと、単一用途と無関係な目的で利用・移転しないこと、信用評価・融資判断に利用・移転しないことの確認欄は、記載と一致する現行実装を確認して提出者がチェックします。

## プライバシーポリシーURL

ストアへ入力する公開URL：

https://gist.github.com/akihisa-dev/a97db44fddd4ff38f8c0f21bde35be18

公開先は上記のGitHub Gistです。[privacy-policy.md](privacy-policy.md)は配色設定と検索語の扱いを追記した2026年10月25日改訂版で、同じ本文を公開Gistへ反映済みです。[privacy-policy-url.txt](privacy-policy-url.txt)からURLだけをコピーできます。

## 根拠

- `Triadic-extension/manifest.template.json`：追加権限なし、同梱service worker、同梱コード用の実行制限
- `Triadic-extension/src/extension/theme.ts`：配色の選択をlocalStorageへ保持
- `Triadic-extension/src/extension/WorkspaceChrome.tsx`：作業中の検索語をメモリへ保持
- `Triadic-extension/src/extension/recentFile.ts`：直近のファイル参照をIndexedDBへ保持
- `Triadic-extension/src/core/storage/`：データ・マスタ・履歴の保存処理
- [Chrome公式：プライバシー欄](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Chrome公式：端末内だけの処理も開示対象（質問3）](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
