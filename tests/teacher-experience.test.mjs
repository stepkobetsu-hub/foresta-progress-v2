import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const gas = fs.readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

assert.match(gas, /reading: text_\(row\[5\]\)/);
assert.match(gas, /student\.reading/);
assert.match(app, /ひらがな・カタカナ/);
assert.match(app, /teacherStudentCache/);
assert.match(app, /let data = !force \? state\.teacherStudentCache/);
assert.match(app, /function activateTeacherStudent/);
assert.match(app, /<span>担当講師<\/span>/);
assert.match(app, /id="inputLesson" class="primaryBtn">進行表を開く/);
assert.doesNotMatch(app, /id="viewProgress"/);
assert.doesNotMatch(app, /選択した1単元を学校位置に保存/);
assert.match(app, /class="schoolPinButton/);
assert.match(app, /class="lessonDayToggle/);
assert.match(app, /lessonDates/);
assert.match(gas, /lessonDates: dates\.map/);
assert.match(gas, /recordedDate/);

console.log("teacher experience tests: 15 assertions passed");
