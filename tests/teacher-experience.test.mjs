import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const gas = fs.readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

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
assert.match(app, /<th>国語<\/th><th>数学<\/th><th>英語<\/th><th>理科<\/th><th>社会<\/th><th>5科<\/th>/);
assert.match(app, /class="card span12 teacherNoticeCard"/);
assert.match(app, /class="studentTabClose"/);
assert.match(app, /生徒を選び直しますか/);
assert.match(app, /🏫 学校はここ/);
assert.match(styles, /\.schoolPinButton\.active\{[^}]*background:#126fba/);

console.log("teacher experience tests: 21 assertions passed");
