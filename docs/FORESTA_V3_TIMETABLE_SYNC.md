# V3 timetable synchronization

`★生徒マスタ202606-` / `時間割マスタ` is authoritative. `受講科目キャッシュ` is not read or rebuilt by V3. The Apps Script exporter reads A (ID), E:AB (subjects), AO (English level), and AP (Math level). The Edge Function normalizes and validates a complete export before invoking one transactional replacement. Therefore a fetch, validation, or database failure retains the last successful enrollment set.

## Required secret-bearing setup

1. Set the same random `FORESTA_SYNC_SECRET` in Apps Script Properties and Supabase Function secrets. Also set `FORESTA_TIMETABLE_EXPORT_URL`, `FORESTA_GAS_URL`, and the standard Supabase function secrets.
2. Apply both migrations and deploy `foresta-runtime-v3` and `foresta-timetable-sync`.
3. Set Apps Script property `FORESTA_TIMETABLE_SYNC_URL` to the deployed sync URL.
4. Invoke `POST /foresta-timetable-sync?force=1` with `Authorization: Bearer $FORESTA_SYNC_SECRET`. This initial sync is a cutover gate.
5. In Supabase Cron, schedule that identical authenticated request every 15 minutes using a Vault-held secret. Configure retries at 1, 2, 4, 8, then 15 minutes; the function also records exponential `next_retry_at`.

The existing administrator **受講科目更新** action is now a manual forced V3 sync. `foresta_v3_sync_status` records start, success/failure, count, error, retry time, and the last successful timestamp. Confirm `status=success`, inspect the missing-multiple-subject audit, and run:

```sql
select student_id,student_name,subjects,english_level,math_level,synced_at
from foresta_v3_enrollments where student_id='1180';
```

It must return 飯田杏 with both `算数` and `国語`; the database function rejects the entire replacement otherwise. Student 1180 is read-only during verification.
