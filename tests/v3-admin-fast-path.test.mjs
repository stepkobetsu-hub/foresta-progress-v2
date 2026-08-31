import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app.js", "utf8");
const runtime = fs.readFileSync("supabase/functions/foresta-runtime-v3/index.ts", "utf8");
const gas = fs.readFileSync("apps-script/Code.gs", "utf8");

assert.match(app, /FAST_RUNTIME_READ_ACTIONS = new Set\([^\n]+"getAdminDashboard","getAdminStudents"/);
assert.match(app, /const endpoint = apiEndpointFor\(action\)/);
assert.match(app, /Never silently put Google Sheets back on the classroom hot path/);
assert.match(app, /get\("legacy"\) !== "1"/);

assert.match(runtime, /const reads=new Set\([^\n]+"getAdminDashboard","getAdminStudents"/);
assert.match(runtime, /action==="getAdminDashboard"\|\|action==="getAdminStudents"/);
assert.match(runtime, /profile\.role!=="admin"\|\|Number\(profile\.permission\|\|0\)<1/);
assert.match(runtime, /snapshot\("__global__",action\)/);
assert.match(runtime, /throw new Error\("FORBIDDEN"\)/);
assert.match(runtime, /throw new Error\("SNAPSHOT_NOT_READY"\)/);

assert.match(gas, /role:'admin',loginId:'FORESTA_V3_ADMIN_SYNC'[\s\S]+permission:1/);
assert.match(gas, /view:'getAdminDashboard'[\s\S]+getAdminDashboard_\(\{adminToken:token\},false\)/);
assert.match(gas, /view:'getAdminStudents'[\s\S]+getAdminDashboard_\(\{adminToken:token\},true\)/);
assert.match(gas, /function exportSnapshotsV3_\(data\)[\s\S]+requireV3SyncSecret_\(data\)/);

for (const dummyStudentId of ["1001", "1320"]) assert.match(dummyStudentId, /^\d{4}$/);

console.log("V3 admin fast-path contract: ok");
