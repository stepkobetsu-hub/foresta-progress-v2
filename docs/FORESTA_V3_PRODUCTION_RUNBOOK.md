# Foresta V3 production cutover runbook

Pre-cutover ref: `df5cb390b70b4a1c102cc821a13dbdcb51560854`. Legacy endpoint remains the `CONFIG.apiUrl` Apps Script deployment. V3 is default; append `?legacy=1` for an immediate non-destructive rollback. A code rollback is `git revert <cutover-commit>`; neither procedure deletes Supabase or Google data.

## Operator gate (requires secrets; never paste output containing them)

```bash
supabase link --project-ref wisedgcgwaebtkprdhth
supabase db push
supabase secrets set FORESTA_GAS_URL=... FORESTA_TIMETABLE_EXPORT_URL=... FORESTA_SYNC_SECRET=...
supabase functions deploy foresta-runtime-v3 --no-verify-jwt
supabase functions deploy foresta-timetable-sync --no-verify-jwt
curl -fsS -X POST -H "Authorization: Bearer $FORESTA_SYNC_SECRET" "$TIMETABLE_SYNC_URL?force=1"
node scripts/migrate-production-v3.mjs
```

Before switching traffic, record source/import counts for every tab, quarantine malformed rows rather than dropping them, and populate render-ready `foresta_v3_snapshots` from the imported current data. Confirm no raw `token`, password, or service key occurs in snapshots/mutations. Do not alter elementary tables.

Run authenticated, production smoke tests for dummy students 1001 and 1320: cold/warm dashboard and progression; lesson/progression and school-position saves; CT for 1320; homework student check → teacher check → archive → restore; retry the same mutation UUID; reload/re-login persistence; and teacher subject persistence. Read-only check 1180 and several real middle-school records against the source. Record p50/p95 and require cold reads <2s, repeated reads <1s, and writes <1.5s. Do not mutate 1180.

Only after all gates pass, publish the cutover commit to GitHub Pages and update the system registry with migration counts, timing evidence, deployed function versions, cutover commit, timetable last-success time, and this rollback procedure. Google legacy data remains untouched.
