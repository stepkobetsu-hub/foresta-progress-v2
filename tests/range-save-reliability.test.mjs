import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const gas = readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../supabase/functions/foresta-runtime-v3/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202609010001_cancel_stale_save_range_mutations.sql", import.meta.url), "utf8");

assert.doesNotMatch(app.match(/const FAST_RUNTIME_WRITE_ACTIONS[^;]+;/)?.[0] || "", /saveRange/);
assert.doesNotMatch(runtime.match(/const writes=[^;]+;/)?.[0] || "", /saveRange/);
assert.match(app, /result\?\.queued \|\| !Number\.isInteger\(result\?\.saved\)/);
assert.match(app, /rangeContextIsCurrent/);
assert.match(app, /rangeOptionsGeneration/);
assert.match(app, /rangeDirty && !rangeClosing/);
assert.match(app, /while \(rangeSaving\)[\s\S]*const saved = await saveRangeSelection\(\)[\s\S]*if \(saved\) \{[\s\S]*closeModal\(\)/);
assert.match(gas, /if\(action==='saveRange'\)return\{duplicate:false,cancelledStale:true/);
assert.match(migration, /where action = 'saveRange'/);
assert.match(migration, /status in \('accepted','applied','mirror_pending','failed'\)/);
assert.match(migration, /next_attempt_at = null/);
