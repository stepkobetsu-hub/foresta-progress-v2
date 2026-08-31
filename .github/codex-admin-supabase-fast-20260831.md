# Codex task: 管理者一覧をSupabase高速経路へ移行

開始条件:
- 必ず origin/main を取得し、このブランチの起点 `2d362e104c4193d020901fba0ac2a196ecfcf1fa` 以上の最新mainを基準にする。
- 閉鎖済みPR #2、古いPR、古いCodexブランチを基準にしない。
- 既存の小学生仕様・宿題専用ページ・自動宿題・学校進度・単元テスト・配色・モバイル対策・ログイン保持を回帰させない。
- `openElementaryHomeworkConfirm` 等の旧経路を再導入しない。

目的:
現在、講師側の `searchStudents` / `getTeacherToday` / `getStudentDashboard` / `getProgression` は Supabase V3 高速経路だが、管理者一覧の `getAdminDashboard` / `getAdminStudents` はまだGAS経路に残っている。管理者一覧もSupabase V3高速経路へ移し、表示速度を改善する。

作業内容:
1. `supabase/functions/foresta-runtime-v3/index.ts` を確認し、`getAdminDashboard` と `getAdminStudents` を read action として安全に追加する。
2. Apps Script `exportSnapshotsV3_` と既存 `foresta_v3_snapshots` の構成を調査する。管理者一覧用グローバルスナップショットが無ければ、既存形式を壊さず追加する。GASを画面表示のホットパスに戻さず、GASは同期元/ミラー用途に限定する。
3. 管理者権限を厳密に確認する。admin以外から管理者一覧スナップショットを読めないこと。
4. `app.js` の `FAST_RUNTIME_READ_ACTIONS` に `getAdminDashboard` / `getAdminStudents` を追加し、既存の管理者一覧UIとフィルタ・小学生Supabase集計マージを壊さない。
5. 現在の管理者画面の横幅改善（管理者だけ左メニュー約180px、一覧を広く、担当講師/更新1行、比較2-3行）を維持する。
6. 管理者一覧の取得がGASへフォールバックしないことをコード上で確認する。`?legacy=1` の明示的な旧経路は残してよい。
7. 可能なら管理者一覧の初回表示時間を計測し、変更前後の根拠をPR本文かコメントに記載する。
8. 必要な常設回帰テストを追加する。

必須検証:
- `node --check` 対象JS/TS相当の構文確認
- `npm test` 全件成功
- `git diff --check`
- 小学生: 算数/国語/英語の進行表、専用宿題ページ、自由記述「教科書漢字ドリルなど」、表面のみ単元テスト保存を維持
- 講師側高速経路を壊さない
- 管理者一覧で中学生・小学生双方が表示され、既存フィルタが機能する

完了条件:
- 変更はこのPRブランチへコミットする。
- mainへ直接pushしない。
- テスト結果、変更したデータフロー、残るGAS依存があれば明記する。
