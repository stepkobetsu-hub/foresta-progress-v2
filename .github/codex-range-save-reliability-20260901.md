# Codex task: テスト範囲保存を確実化する

## 起点
- 必ず最新 `origin/main` を取得し、少なくとも `cf3fc3b0f26a4dae985fb40225b6d16ddfe0510a` 以上から作業する。
- 閉鎖済みPR #2、古いPR、古いCodexブランチを基準にしない。
- mainへ直接pushしない。このPRブランチへコミットする。

## ユーザー症状
管理者画面「進行表・テスト範囲設定」で範囲を選び「保存して閉じる」を押しても、ときどき選択範囲が残らない。保存される時とされない時がある。

## 本番で確認済みの原因
1. `app.js` の範囲モードはチェック変更後450msで `saveRange` を自動保存する。
2. `saveRange` は現在 `FAST_RUNTIME_WRITE_ACTIONS` に含まれ、Supabase V3 mutation queueへ入った時点でフロントへ `queued:true` を返す。フロントは実際のGAS反映完了を待たず「自動保存済み」と表示し、「保存して閉じる」も閉じる。
3. GAS `saveRange_` は `LockService.getScriptLock().waitLock(30000)` を使用する。短時間に多数のsaveRange mutationが非同期で走るとロック競合し、30秒待ちの後に失敗する。
4. 本番 `foresta_v3_mutations` には今日の `action='saveRange'` で多数の `failed` が実在する。`last_error` は「処理に失敗しました。時間を置いてもう一度お試しください。」等。
5. さらに本番failed payloadには、`school/grade` と `testId` が食い違う保存が多数ある。例: school=`坂下中`, grade=`中1` なのに testId=`TEST-2026-南城中-中1-2`。これはGASの `saveRange_` で `INVALID_UNIT` になる。
6. `foresta_v3_mutations` には `saveRange` の `applied` に残った行もある。現行queueは accepted/failedのみ再処理し、appliedは回収されない。
7. 古いfailed saveRangeが後日再試行されると、より新しい正しい範囲を古い内容で上書きする危険がある。

## 必須ゴール
- 「保存して閉じる」を押して閉じた時点では、最後に画面で選択されていた範囲が確実に永続化済みであること。
- `queued:true` を「保存完了」と扱わないこと。
- 範囲変更の連打で複数の古いsaveRangeが後から競合・逆順反映されないこと。最新選択だけが勝つこと。
- school/grade/testId/rangeType/subject の整合性を保存直前に再検証し、古いtestIdを送らないこと。
- stale/failed/applied の古いsaveRange mutationが将来再試行して現在値を上書きしないこと。

## 実装方針
信頼性を速度より優先する。最小安全修正として `saveRange` だけをV3非同期queueから外し、GASへ同期保存して実保存完了まで `rangeSaving` を維持する案を第一候補として検討してよい。その場合:
- `saveRange` を `FAST_RUNTIME_WRITE_ACTIONS` から除外するか、saveRange専用でdurable completionを待つ。
- 自動保存は同一画面で完全に直列化し、前回の実保存が完了するまで次の送信をしない。
- 「保存して閉じる」は最後のdirty stateを1回確実に保存し、成功レスポンスを受けてから閉じる。
- 自動保存中/失敗時に閉じない。

より良い設計としてSupabaseをrangeの一次保存先にする場合も可。ただし `getRangeEditor` とsaveの整合性、latest-wins、GAS mirror失敗時の挙動を明示し、ユーザーが再度開いた時に必ず最新値が見えること。

## stale mutation対策
- 既存のsaveRange mutationについて、同一論理キー `school + grade + subject + testId + rangeType` で古いfailed/accepted/appliedが最新値を上書きしない仕組みを入れる。
- 明らかに school/grade と testId が不一致のsaveRangeは再試行不可として `cancelled_stale` 等にする。
- 既存のstuck `applied` も安全に扱う。
- 必要なら運用SQL/一回限りのcleanup手順をPRに記載するが、他actionのmutationは触らない。

## UI整合性
- 学校、学年、テスト選択が変わったら、古いテストIDを保持したautosave timerを必ず無効化する。
- モーダルを開いた時点のoptionsが現在のselector状態とずれた場合は保存させず、最新optionsを再取得する。
- `rangeAutoSave` の表示は、受付ではなく実保存結果に対応させる。

## 回帰禁止
- 管理者一覧Supabase高速化（PR #11でmain反映済み）を壊さない。
- 講師高速経路 `searchStudents/getTeacherToday/getStudentDashboard/getProgression` を壊さない。
- 小学生専用宿題ページ、自動宿題、学校進度、単元テスト（裏面なし可）、算数/国語/英語進行表、国語自由記述「教科書漢字ドリルなど」、役割配色、モバイル対策を壊さない。
- `openElementaryHomeworkConfirm` など旧経路を再導入しない。
- `?legacy=1` の明示的ロールバック経路は維持。

## 必須検証
- `npm test` 全件成功。
- `node --check` 等の構文確認。
- `git diff --check` 成功。
- saveRangeについて最低限、連続チェック変更→保存して閉じる、学校/学年/テスト切替直後、保存失敗時、再オープンで最終選択が一致するテストを追加。
- 可能ならmutation stormが起きないこと（1回の連続操作に対し実GAS保存が直列/最終値のみ）をテスト。
- PRコメントに原因、修正方式、stale mutation cleanup方法、検証結果を記載する。
