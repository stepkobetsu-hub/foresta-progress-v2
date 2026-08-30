# Codex task: Foresta V3 full Supabase production cutover

Date: 2026-08-31
Repository: `stepkobetsu-hub/foresta-progress-v2`
Target production URL: `https://stepkobetsu-hub.github.io/foresta-progress-v2/`

## Mission

Finish the performance rebuild **end-to-end now**. Tomorrow this app starts normal classroom use. Do not stop at an architecture proposal, partial staging, or a report. Implement, migrate, test, cut over production, and leave a safe rollback path.

The user explicitly authorizes a large rebuild if needed and has Codex configured with full access. Prefer a clean V3 implementation over preserving slow legacy internals.

## Why this is necessary

The sister app, `stepkobetsu-hub/foresta-step-progress` (Step & Goal), originally had serious complaints about slow loading and saving. It was ultimately rebuilt around a V3 data path:

- normal writes no longer wait for Google Apps Script;
- authenticated sessions are cached in the fast backend so every edit does not revalidate with Google;
- progress / targets / homework are written directly to a database;
- UI uses autosave / optimistic updates;
- saving does not synchronously reload the whole dashboard;
- read snapshots / browser cache make repeated loads nearly immediate;
- Google remains for login / compatibility / fallback rather than the normal persistence hot path.

Registry history recorded for Step & Goal V3 included ~300–350 ms debounce and measured writes under ~1.5 sec including network, plus sub-second cached reads. Reuse the same principles here.

## Current Foresta situation

This repository is the normal-class Foresta progress app. The legacy architecture is:

- GitHub Pages frontend
- Google Apps Script API for auth, reads and most writes
- Google Sheet `フォレスタ進捗管理 v2 保存データ（新規構築 2026-08-15）` as legacy data store
- student/timetable/teacher masters are external Google Sheets
- an elementary Supabase backend already exists for elementary features

The legacy sheet currently has these tabs (plus any newly added tab discovered at runtime):

1. 単元マスタ
2. 学校別英語教科書設定
3. 学校テスト日程キャッシュ
4. 学校別予想テスト範囲
5. 学校別決定テスト範囲
6. 受講科目キャッシュ
7. 学校進度履歴
8. 授業記録
9. 授業実施単元
10. CT記録
11. 特訓部屋対応
12. 宿題
13. 宿題の生徒チェック
14. 宿題の講師チェック
15. テスト別目標点
16. 講師コメント
17. コメント既読管理
18. 生徒注意事項
19. メール通知履歴
20. 操作履歴
21. アプリ設定
22. 生徒周回進捗

A first fast-runtime experiment was already merged to main. Inspect current `main` before doing anything. It includes an opt-in `?fastv3=1` path and a Supabase Edge Function staging concept. Do not blindly duplicate it; turn it into a correct production architecture.

Known staging measurements from authenticated dummy testing (1320) before this task:

- login via GAS: ~2.54s
- dashboard first miss: ~14.31s (still GAS-bound; unacceptable)
- dashboard cache hit: ~0.57s
- progression first miss: ~7.74s (still GAS-bound; unacceptable)
- progression cache hit: ~0.51s
- homework write acceptance: ~0.69s
- background GAS mirror reached `SYNCED`

The main problem left is **first-load dependence on GAS and legacy sheet reads**. Remove that dependency for normal daily use.

## Non-negotiable production goals

1. **Supabase becomes the source of truth for normal daily Foresta data after cutover.**
2. Normal page reads after login must not need to wait for Apps Script / Google Sheets.
3. Normal saves must not wait for Apps Script / Google Sheets.
4. Keep GAS login if necessary; after login, cache/validate session in the fast backend and do not revalidate Google on every request.
5. Keep the old GAS + Google Sheet path available strictly as rollback / compatibility for a limited transition period.
6. Do not delete or reset legacy Google data.
7. Do not delete existing Supabase elementary tables or data.
8. Do not expose passwords, raw session tokens, service-role keys or secrets in GitHub, logs, public docs, client JavaScript, or registry.
9. Preserve the current UI and current behavior unless a performance-safe internal change is necessary.
10. **Do not ask the user to choose between implementation alternatives. Make the safest production choice and finish it.**

## Current UI/behavior that must be preserved

Recent changes are intentional and must survive the rebuild:

- elementary and middle-school teacher subject selection persists per teacher+student across save/reload;
- teacher homework shows only the currently selected lesson subject;
- student homework shows all subjects;
- newest homework appears first;
- completed homework can be archived with X, archive list is viewable, and archived homework can be restored;
- elementary homework uses the same student check -> teacher check -> complete flow as middle school;
- elementary teacher can reduce default homework by unchecking TRY redo / exercise before saving;
- optional free-text homework can be added;
- `生徒変更` placement and current teacher multi-student behavior stay intact;
- elementary lesson subject / teacher toolbar appears above the compact school unit-test panel;
- subject selection must not reset to English after save/reload;
- timetable master is the source of truth for enrolled subjects; example 1180 飯田杏 is 算数+国語;
- current elementary layout and all current school-unit-test functionality must remain.

## Required Supabase production design

Use the existing Supabase project already used by this app if available in the environment. Keep new normal-Foresta tables clearly namespaced, e.g. `foresta_v3_*`, so they cannot collide with elementary tables.

Implement durable normalized or snapshot+override tables as appropriate for at least:

- authenticated session cache (token hash only, never raw token at rest)
- student/profile/reference snapshots necessary for first dashboard render
- enrolled subjects / levels from timetable source
- unit master / progression reference data
- school textbook config / test schedule / predicted+decided ranges required by UI
- school progress
- lesson records
- lesson units / dates
- CT records
- training-room state needed for normal UI
- homework plus student/teacher status and archive state
- target scores
- teacher comments / read status
- student notes / cautions needed in dashboard
- student round progress
- audit/operation records as needed

It is acceptable to model differently from the Google tabs. Preserve behavior, not spreadsheet shape.

Use proper indexes for hot reads, particularly by `student_id`, `subject`, dates, unit IDs, active/archive state and any compound keys used in progression/range lookups.

Use idempotency / mutation IDs on writes so retries cannot create duplicate lessons, homework or CT rows.

## Migration requirement

Migrate the **current production Google Sheet data** into Supabase before production cutover.

Requirements:

- take a pre-cutover count/snapshot of each relevant legacy tab;
- import current data, not an old repository fixture;
- normalize dates and IDs carefully;
- preserve existing history even if a few malformed legacy rows need to be quarantined rather than imported into hot tables;
- report counts imported per logical entity;
- compare representative students before/after migration;
- do not overwrite current elementary Supabase data accidentally;
- keep a migration timestamp / version marker.

At minimum verify these student IDs where data exists:

- 1001 (dummy elementary; safe for write smoke tests)
- 1320 (dummy middle-school; safe for write smoke tests)
- 1180 (real elementary; READ-ONLY verification for 算数+国語 — do not create test homework or fake progress)
- a small set of real middle-school students by read-only comparison only

Only 1001 and 1320 may be mutated for destructive smoke testing. Restore their test mutations when feasible or clearly isolate/tag them.

## Read path requirements

After cutover the following normal actions must be served from Supabase / fast runtime without blocking on Google:

- student dashboard
- teacher selected-student dashboard
- progression table
- homework and homework archive
- teacher today view if it is part of classroom hot path
- student search / minimum directory required for teacher classroom work
- ranges needed for progression display
- elementary and middle-school normal classroom read paths

Reference/master data that changes infrequently may use Supabase snapshots refreshed asynchronously from Google.

Use cache-first / stale-while-revalidate where safe, but **Supabase must contain enough data that a cold client still does not need a 7–14 second GAS read**.

## Write path requirements

Normal classroom edits must write directly to Supabase and acknowledge quickly:

- lesson / progress
- lesson correction
- school position
- predicted/decided range edits
- CT
- student round progress
- student homework check
- teacher homework check
- homework archive / restore
- target scores
- comments / notes that are normal classroom edits
- elementary normal daily writes already on Supabase should remain fast and be integrated cleanly rather than regressed

Aim for Google-Sheets-like behavior: optimistic UI or immediate local state, autosave where appropriate, no mandatory wait for a full dashboard reload.

Do not reintroduce a design where every save triggers `getStudentDashboard` synchronously.

## Google compatibility / mirror

For the transition period, maintain an asynchronous compatibility mirror to Google where practical, but it must never block the UI.

If mirroring a given entity is unsafe or ambiguous, prefer Supabase source-of-truth plus a documented export/recovery path rather than slowing normal use.

Retries must be durable. A failed mirror may be retried later. Never persist a raw user token in a mutation queue.

## Performance acceptance targets

Measure from an authenticated environment and record real numbers.

Targets for production readiness:

- normal write acknowledgement: preferably < 1.0s, hard target < 1.5s network included
- repeated dashboard/progression reads: < 1.0s
- **cold / first dashboard after login: target < 2.0s and must not depend on a 10+ second GAS read**
- **cold / first progression view: target < 2.0s**
- save must remain after reload / re-login

If Supabase cold start occasionally pushes above 2s, optimize query count/indexes/payload and provide measured p50/p95 from several runs. Do not accept 7–14 second cold reads as final.

## Testing / verification

Run all existing repo tests and add regression tests for the V3 cutover.

Must verify at least:

- `node --check app.js`
- `node --check elementary-supabase.js`
- full `npm test`
- production/staging health
- authenticated 1001 and 1320 smoke tests
- save -> reload -> persistence
- no duplicate save on retry
- subject persistence after save/reload
- homework student check -> teacher check -> archive -> restore
- progression save / lesson save
- school position save
- CT save for applicable middle-school dummy flow if safe
- 1180 read-only shows both 算数 and 国語 from timetable source
- no secret/token stored in Supabase payload snapshots or public files

## Cutover

When acceptance tests pass:

1. change the normal production URL to use the Supabase V3 path by default (no `?fastv3=1` required);
2. keep an explicit emergency fallback switch/query flag to force legacy GAS for rollback;
3. deploy GitHub Pages production;
4. deploy/update Supabase Edge Functions and migrations;
5. verify production URL after deployment;
6. verify 1001/1320 again on production;
7. leave the old Google data untouched;
8. update the system registry docs with architecture, migration counts, measured timings, production cutover commit/version, and rollback instructions.

## Rollback requirement

Before cutover record the exact pre-cutover main commit and legacy endpoint. Provide a one-command / one-ref rollback procedure. A rollback must not require deleting Supabase data.

## Repository hygiene

- Work on this PR branch.
- Commit meaningful changes; avoid leaving temporary patch scripts/workflows unless they are genuinely useful operational tooling.
- Remove smoke-only functions or disable them after verification.
- Do not leave test passwords or tokens in Git history/logs.
- Do not weaken auth merely to make tests pass.

## Completion definition

This task is complete only when:

- current production data has been migrated;
- normal Foresta reads/writes use Supabase by default;
- first loads no longer depend on slow GAS reads;
- writes are fast and persistent;
- current UI/behavior remains intact;
- full tests and authenticated smoke tests pass;
- production is deployed and verified;
- rollback is documented;
- system registry is updated.

Do not stop after staging. Do not return only a plan. Finish the production cutover unless a hard external permission failure remains after trying the available full-access credentials. If such a hard blocker exists, report the exact failing command/service/permission and leave all code/migrations ready for one final action.
