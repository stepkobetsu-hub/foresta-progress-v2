# フォレスタ進捗管理 v2

学校の授業を先取りする通常授業用の進捗管理アプリです。既存のステップ＆ゴール進捗管理・旧フォレスタ進捗管理とは別の新規プロジェクトです。

## 構成

- GitHub Pages: `index.html`, `styles.css`, `app.js`, `config.js`
- Google Apps Script: `gas/Code.gs`, `gas/appsscript.json`
- 保存先: 新規の専用Googleスプレッドシート

## 本番URL

- アプリ: https://stepkobetsu-hub.github.io/foresta-progress-v2/
- Apps Script API: https://script.google.com/macros/s/AKfycbx-KkkOPgOTgauFIcT9JFbuz1zgULkZRNx25PwbTWQabw2jUKdZr9ia2kkJljScEBSXVg/exec
- 保存先・各マスタ・正式単元表のIDは、公開リポジトリに置かずApps ScriptのScript Propertiesで管理します。

## 公開時の設定

1. `gas/Code.gs` を新規Apps Scriptへ配置し、ウェブアプリとしてデプロイします。
2. Apps ScriptのScript Propertiesに `DB_ID`、各マスタID、各正式単元表IDを設定します。
3. 取得した `/exec` URLを `config.js` の `apiUrl` に設定します。
4. `refreshUnitMaster()` を一度実行し、正式な26F進行表から単元マスタを作成します。
5. 検証完了後、保存シート「設定」の `MAIL_SUPPRESS` を `FALSE` にします。

パスワード、セッショントークン、生徒の進捗データはGitHubへ保存しません。
