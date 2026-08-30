# Codex task: finish elementary timetable subject source and production readiness

Please finish this task end-to-end on this PR branch.

## Current state
- The elementary teacher UI layout has already been adjusted: subject/teacher row above the school unit-test panel, larger subject/teacher typography, and a more compact unit-test panel. Preserve that layout.
- The app historically reads enrolled subjects from `受講科目キャッシュ`, which can become stale compared with `★生徒マスタ202606-` → `時間割マスタ`.
- Example: student 1180 飯田杏 has 算数 + 国語 in 時間割マスタ, but stale cache previously showed only 国語.
- Main already contains a candidate helper that prefers `timetableMap_()` and falls back to `subjectCacheMap_()`; review it carefully rather than assuming it is sufficient.

## Required result
1. The app must treat `時間割マスタ` as the source of truth for current enrolled subjects for both elementary and middle-school students.
2. Subject changes in 時間割マスタ must no longer require a manual cache refresh to appear in the app.
3. Keep a safe cache fallback only for temporary source-read failure if appropriate; stale cache must never override a valid live timetable row.
4. Verify elementary mapping converts 数学→算数 where needed and supports 算数・国語・英語.
5. Verify student 1180 resolves to 算数 + 国語 from the live timetable source.
6. Do not change or delete student progress, homework, scores, unit-test data, or timetable data.
7. Preserve all recent UI behavior: teacher subject selection persists through save/reload, student view shows all subjects, teacher homework shows only the selected subject, and the compact elementary test-entry layout remains.
8. Run syntax checks and the full existing test suite. Add/adjust regression tests for live timetable precedence.
9. If this repo has an authenticated/supported Apps Script production deployment route, deploy the updated backend and verify the live endpoint. If it does not, do not invent credentials or expose secrets: document the exact remaining deployment constraint in the PR and make the repository change production-ready.
10. Remove this task file before finalizing if it is no longer needed.

Please implement fixes directly, run tests, and leave the PR branch in a clean reviewable state.