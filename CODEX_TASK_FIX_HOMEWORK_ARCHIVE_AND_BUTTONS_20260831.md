# Codex task: fix homework archive + replace broken correction button

Date: 2026-08-31
Repository: `stepkobetsu-hub/foresta-progress-v2`
Production is already Supabase V3 by default. `?legacy=1` is rollback only.

## User-visible bugs

1. A teacher archives a homework item from the normal teacher homework list, opens **宿題アーカイブ**, and the archive page says `アーカイブされた宿題はありません。` even though the item was just archived.
2. The teacher toolbar button **宿題・進行表を訂正** opens `getLessonCorrections` / old lesson-history flow and often says `訂正できる授業記録はありません。`. This old combined correction flow no longer matches the Supabase V3 / elementary architecture.
3. The user explicitly wants that one combined button replaced with two clear colored buttons:
   - **次回宿題を確認・調整**
   - **進行表を開く**

Screenshots show the problem on an elementary teacher screen. Preserve all current elementary and middle-school behavior otherwise.

## Required fix A: archive must be immediately visible and durable

Find the real root cause in the V3 path. Do not paper over with a timeout.

Requirements:
- `archiveHomework` must make the archived homework visible from `getHomeworkArchive` immediately after the archive acknowledgement, not only after a later GAS mirror / snapshot rebuild.
- The active dashboard/homework snapshot must also stop showing the archived item promptly.
- `restoreHomework` must reverse both views immediately.
- Reload / re-login must preserve archive state.
- Retry with the same mutation UUID must not duplicate or corrupt anything.
- The asynchronous GAS mirror may continue, but the V3 Supabase read model is authoritative for the UI.
- If the current queue accepts writes before updating snapshots, add an atomic/transactional optimistic read-model update for archive/restore (and any needed status fields) before returning success, with rollback/error handling that does not leave inconsistent snapshots.
- Do not reintroduce synchronous GAS waits.
- Verify the archive page for teacher and student modes.

## Required fix B: remove the broken combined correction UX

Remove **宿題・進行表を訂正** from both elementary and middle-school teacher screens.

Replace it with two buttons next to the subject/teacher controls:

### 1. `次回宿題を確認・調整`
- Give it a distinct warm/accent color, not the same as the progression button.
- It must use the currently selected lesson subject. If no subject is selected, show a clear prompt and do not open a useless empty dialog.
- It must open a V3-compatible view/modal for the currently assigned **next homework** for that student + subject.
- Show the currently active/unarchived homework for the selected subject.
- Allow practical adjustment of the next homework using existing safe APIs/data structures: remove/unassign individual homework tasks or groups and, where the app already supports it, add/replace free-text/default tasks. Do not depend on `getLessonCorrections` or old GAS lesson-history availability.
- The adjustment must save through the Supabase V3 write path and be reflected immediately in the normal homework list.
- Keep source semantics (teacher/self), subject filtering, newest-first behavior, student-check/teacher-check flow, archive/restore semantics.
- Do not let a teacher accidentally edit a different subject than the selected subject.

### 2. `進行表を開く`
- Give it a distinct blue/green primary color.
- It must open the current selected subject progression directly in normal lesson mode using the current student and selected teacher.
- It must not call `getLessonCorrections`.
- If no subject is selected, show a clear prompt.
- For elementary, this top toolbar button should work in addition to the per-subject card buttons; selecting a subject in a card should continue to work as before.

After this change, the old `openLessonCorrection()` / `getLessonCorrections` path should no longer be used by these teacher toolbar buttons. If it is unused elsewhere, remove dead UI wiring safely; do not remove a backend action if another feature still needs it.

## Styling

The two new toolbar buttons must be visually distinct and obvious:
- `次回宿題を確認・調整`: warm orange/amber style with readable contrast.
- `進行表を開く`: teal/blue/green style with readable contrast.
- Keep current responsive layout; on narrower screens they may wrap cleanly.
- Do not make them tiny ghost buttons.

## V3 routing / archive read concerns

Current client routes `getHomeworkArchive` through `foresta-runtime-v3` and archive/restore writes through the V3 mutation queue. Inspect `supabase/functions/foresta-runtime-v3/index.ts`, snapshot worker, and current `scheduleFastRefreshAfterWrite` behavior. A likely issue is that archive acknowledgement can happen before the archive snapshot is updated. Confirm actual cause and fix the source of truth/read model rather than adding arbitrary delays.

## Testing

Use only safe dummy records for writes:
- 1001: safe dummy, especially elementary flow.
- 1320: safe dummy, middle-school flow.
- 1180: READ ONLY only. Do not create/modify homework or progress for 1180.

Must test:
1. Archive an active homework on 1001 -> immediately open archive -> item is present.
2. Reload/re-login -> item remains archived.
3. Restore -> archive page removes it and normal homework shows it again.
4. Repeat mutation UUID -> no duplicate/corruption.
5. Same archive/restore smoke on 1320 where safe.
6. Elementary toolbar has two colored buttons and neither calls old lesson-correction history.
7. Middle-school toolbar has the same two-button behavior.
8. `次回宿題を確認・調整` filters strictly to selected subject and can save an adjustment.
9. `進行表を開く` opens selected subject progression normally.
10. 1180 read-only still shows 算数＋国語 and UI renders correctly.
11. `node --check app.js`, Edge Function type/syntax check available in repo, and full `npm test`.

## Deployment

- Commit changes to this branch.
- Deploy any required Supabase Edge Function update and migrations if needed.
- Do not change or delete legacy Google data.
- After tests pass, report exact commit, function version, archive/restore test results, and whether production is safe to fast-forward.
- Do not stop at a plan; implement and verify end-to-end.
