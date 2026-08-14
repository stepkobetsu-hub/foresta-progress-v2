# フォレスタ進捗管理 v2

既存のCloudflare Worker・D1・旧履歴へ依存しない、新規の学習進捗管理アプリです。

## 構成

- `index.html` / `styles.css` / `app.js`: GitHub Pages用SPA
- `config.js`: 公開したGoogle Apps Script Web App URL
- `gas/Code.gs`: 認証・保存API
- `gas/appsscript.json`: Apps Script設定

既存の時間割／講師マスターは読み取り専用です。授業記録、宿題、CT、目標点、コメント等は新規の専用Googleスプレッドシートへ保存します。

Apps Scriptの「スクリプト プロパティ」に `DATA_SPREADSHEET_ID`、`STUDENT_MASTER_ID`、`TEACHER_MASTER_ID` を設定してください。GoogleファイルIDは公開リポジトリへ保存しません。

## セキュリティ

- 共用端末ではIDを保存しません。
- 管理者操作は画面とApps Scriptの両方で権限を確認します。
- CT不合格メールは、保存シートの通知先と確認フラグが設定されるまで送信せず、通知ログへ保留します。
- パスワードはフロント側へ返しません。

## ローカル確認

```sh
python -m http.server 4173
```

`http://localhost:4173/` を開き、「画面デモを開く」で主要画面を確認できます。
