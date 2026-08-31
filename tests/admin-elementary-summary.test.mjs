import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const gas = fs.readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
const edge = fs.readFileSync(new URL("../supabase/functions/elementary-progress/index.ts", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const colors = fs.readFileSync(new URL("../elementary-test-score-colors.css", import.meta.url), "utf8");
const config = fs.readFileSync(new URL("../config.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(app, /表面の点数<input id="elementaryTopTestScore"[^>]*value="50"/);
assert.match(app, /表面の満点<input id="elementaryTopTestMax"[^>]*value="100"/);
assert.match(app, /裏面の点数<input id="elementaryTopTestBackScore"[^>]*value="30"/);
assert.match(app, /裏面の満点<input id="elementaryTopTestBackMax"[^>]*value="50"/);
assert.doesNotMatch(colors, /content:"表面"|content:"裏面"/);
assert.match(styles, /repeat\(4,minmax\(72px,.55fr\)\)/);
assert.match(config, /elementaryApiUrl: "https:\/\/wisedgcgwaebtkprdhth\.supabase\.co\/functions\/v1\/elementary-progress"/);
assert.match(app, /action: "getAdminSummary", token: state\.adminToken/);
assert.match(app, /function mergeElementaryAdminSummary/);
assert.match(app, /item\.subject\} \$\{item\.label/);
assert.match(app, /progressDataSource: summary \? "supabase-elementary"/);
assert.match(app, /const elementary = isElementaryGradeValue\(s\.grade\)/);
assert.match(app, /data-homework="\$\{elementary \? ""/);
assert.match(edge, /text\(session\.role\) !== "admin"/);
assert.match(edge, /action === "getAdminSummary"/);
assert.match(edge, /const differenceUnits = lessonOrder != null && schoolOrder != null \? lessonOrder - schoolOrder : null/);
assert.match(edge, /学校から\+\$\{value\}/);
assert.match(gas, /listLessons=all\?studentLessons:mine/);
assert.match(gas, /teacherDataSource:all\?'latest-lesson-history':'today-lesson-history'/);
assert.match(gas, /if\(!elementary\)\{[\s\S]*alerts\.push\('次回テスト未登録'\)[\s\S]*alerts\.push\('宿題未完了'\)/);
assert.match(html, /app\.js\?v=20260831-[^"']+/);

console.log("admin elementary summary tests: 20 assertions passed");