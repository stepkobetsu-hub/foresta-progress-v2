import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.match(app, /\["ranges", "進行表・テスト範囲設定"\]/);
assert.match(app, /function adminRangeCta\(\)/);
assert.match(app, /id="openRangeSettingsPrimary"/);
assert.match(app, /openRangeSettingsPrimary[\s\S]*openView\("ranges"\)/);
assert.match(app, /<h1>進行表・テスト範囲設定<\/h1>/);
assert.match(app, /1\. 学校[\s\S]*2\. 学年[\s\S]*3\. 科目[\s\S]*4\. 次回テスト[\s\S]*5\. 予想範囲／決定範囲/);
assert.match(app, /6\. 正式な進行表全体を開く/);
assert.match(app, /学校ごとの英語教科書設定/);

console.log("admin range entry tests: 8 assertions passed");
