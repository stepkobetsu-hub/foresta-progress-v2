import assert from 'node:assert/strict';import fs from 'node:fs';
const app=fs.readFileSync('app.js','utf8'),config=fs.readFileSync('config.js','utf8'),sql=fs.readFileSync('supabase/migrations/202608310001_foresta_v3.sql','utf8'),runtime=fs.readFileSync('supabase/functions/foresta-runtime-v3/index.ts','utf8');
assert.match(app,/get\("legacy"\) !== "1"/);assert.doesNotMatch(config,/staging/);assert.match(app,/crypto\.randomUUID/);
assert.match(sql,/add column if not exists validated_at/);assert.match(sql,/add column if not exists attempts/);assert.match(sql,/add column if not exists next_attempt_at/);assert.match(sql,/add column if not exists last_error/);assert.ok(sql.indexOf('add column if not exists next_attempt_at')<sql.indexOf('foresta_v3_mutations_retry'));
assert.match(sql,/enable row level security/g);assert.match(sql,/to service_role/);assert.match(sql,/from anon, authenticated/);assert.match(sql,/pg_get_serial_sequence/);
assert.doesNotMatch(runtime,/payload:\{\.\.\.body\}/);assert.match(runtime,/delete safe\.token/);assert.match(runtime,/token_hash/);assert.match(runtime,/user_id,role/);assert.match(runtime,/last_seen_at:now,validated_at:now/);assert.match(runtime,/SERVICE_NOT_CONFIGURED/);assert.match(runtime,/},503/);
assert.doesNotMatch(config,/service.role|service_role|eyJ/i);console.log('v3 cutover contract: ok');
