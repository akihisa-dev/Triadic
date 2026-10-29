# ストア掲載用素材

Chromeウェブストアの掲載欄へ使う文章と画像をこのフォルダにまとめています。ZIP・利用者データ・確認用の.triadicファイルは含めません。

## 使うファイル

| 掲載欄・用途 | ファイル |
| --- | --- |
| 名前・短い説明・詳細な説明 | [listing-ja.txt](listing-ja.txt)（短い説明はManifest用原稿、詳細説明はストアへの貼り付け用） |
| ストアアイコン | [images/icon-128.png](images/icon-128.png)（128×128） |
| 小型の販促画像 | [images/promo-small-440x280.png](images/promo-small-440x280.png)（440×280） |
| 大型の販促画像・任意 | [images/promo-marquee-1400x560.png](images/promo-marquee-1400x560.png)（1400×560） |
| スクリーンショット1 | [施策一覧](screenshots/01-initiatives-1280x800.png) |
| スクリーンショット2 | [施策の入力・詳細](screenshots/02-initiative-1280x800.png) |
| スクリーンショット3 | [総原価表](screenshots/03-cost-1280x800.png) |
| スクリーンショット4 | [展開表](screenshots/04-breakdown-1280x800.png) |
| スクリーンショット5 | [入口](screenshots/05-entry-1280x800.png) |
| 単一用途・権限・データ利用の申告 | [privacy-practices.md](privacy-practices.md) |
| 公開するプライバシーポリシー本文 | [privacy-policy.md](privacy-policy.md) |
| ストアへ入力する公開URL | [privacy-policy-url.txt](privacy-policy-url.txt) |
| 審査担当者向けのテスト手順 | [reviewer-instructions.txt](reviewer-instructions.txt) |
| 撮影時の版・画像の照合値 | [assets.json](assets.json)（提出不要） |

スクリーンショットは1280×800、透過なしのRGB PNGです。実画面の全領域を撮影し、宣伝文句や装飾を重ねていません。販促画像は既存のロゴとレイアウトから再生成しています。

## ストア画面で入力する項目

1. 言語は日本語、カテゴリは業務の効率化に対応する「仕事効率化 / Productivity」を選びます。最終的なカテゴリ名は提出画面の表示に合わせます。
2. `listing-ja.txt`の詳細説明を貼り付け、表にある画像を登録します。スクリーンショットは番号順です。動画は用意していません。名前と短い説明は提出パッケージのManifestから取得されます。名前は`Triadic`、短い説明は「施策ごとの月別増減を積み上げて年間予算を作成。施策一覧・総原価表・展開表を同じデータから確認できます。」を設定済みです。
3. ホームページには `https://github.com/akihisa-dev/Triadic`、サポートURLには `https://github.com/akihisa-dev/Triadic/issues`を使えます。
4. プライバシー欄には`privacy-practices.md`の内容を反映します。
5. ポリシー欄には、公開済みのURL `https://gist.github.com/akihisa-dev/a97db44fddd4ff38f8c0f21bde35be18` を入力します。[privacy-policy-url.txt](privacy-policy-url.txt)からコピーできます。
6. 審査用説明欄がある場合は`reviewer-instructions.txt`を貼り付けます。

プライバシーポリシーはGitHub Gistで公開済みです。ローカルの本文は配色設定と検索語の扱いを追記した2026年10月25日改訂版で、現行原稿の製品名・問い合わせ先・保存領域の説明と用語の変更は、公開Gistへ未反映です。公開更新後に本文を読み戻して現行原稿との一致を確認してから、ストアへ提出してください。公開者名・連絡先メールの確認、開発者アカウントの登録と認証、ポリシーURLの入力は提出者がストア上で行う項目です。拡張機能のアップロード・審査提出・公開は行っていません。

ポリシーを改訂する場合は、このフォルダの本文と同じGistの本文を更新し、公開URLを維持してください。

## 画面の出典と確認

同じリポジトリのローカル開発画面をデスクトップ版Chromeで撮影しています。架空データを専用のブラウザ保存領域で開き、施策一覧 → 施策詳細 → 総原価表 → 展開表の移動を確認しています。利用者の実ファイルは使いません。撮影は拡張機能としての読み込み試験とは別です。撮影時の版は`assets.json`に記録しています。製品の実装済み範囲と制限は[README](../README.md)を参照してください。

掲載用の文章と画像の保存先は、この`store-listing/`だけです。

## ロゴ・販促画像の編集元

ロゴの正本は`branding/logo.png`、販促画像のレイアウトは[source/layouts.html](source/layouts.html)です。販促画像と画面の画像は、下記の掲載画像の生成処理だけで更新します。

ロゴとアイコンだけを書き出す場合は`node scripts/render-branding-icons.mjs`を使います。制作専用のsharpが必要です。通常のビルドと掲載画像の生成には不要です。

```sh
npm install --prefix /tmp/triadic-art-tools --no-save sharp@0.35.4
TRIADIC_ART_MODULES=/tmp/triadic-art-tools/node_modules node scripts/render-branding-icons.mjs
```

ロゴ変更後は、掲載画像を再生成し、`npm run build`で拡張機能へアイコンを同期してください。

## 画像の再生成と検証

別ターミナルで`npm run dev -- --host 127.0.0.1 --port 4187 --strictPort`を起動し、次を実行します。リポジトリに導入済みのPlaywright・pngjsと、インストール済みのGoogle Chromeを使います。依存の追加やアプリのbuildは不要です。

```sh
node scripts/prepare-store-listing.mjs
node scripts/prepare-store-listing.mjs --check
```

撮影先は環境変数`TRIADIC_CAPTURE_URL`で変更できます。再生成はこのフォルダの画像と`assets.json`だけを更新し、文章は変更しません。検証では文章とポリシーURL専用ファイルの存在、掲載名・短い説明とManifestの一致、README・プライバシー入力原稿と専用ファイルのポリシーURL一致、画像の寸法・透過の有無、撮影時の版、照合値、ZIP・ファイルの混入がないことを確認します。

## 公式の提出要件

- [掲載情報](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [掲載画像の寸法と枚数](https://developer.chrome.com/docs/webstore/images)
- [プライバシー欄](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [端末内だけのデータ処理の開示（質問3）](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
