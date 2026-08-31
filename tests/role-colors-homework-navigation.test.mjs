import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const elementary = fs.readFileSync(new URL("../elementary-supabase.js", import.meta.url), "utf8");
const buttons = fs.readFileSync(new URL("../v3-homework-ui-fix.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

assert.match(app, /function renderElementaryTeacherHomework/);
assert.match(app, /window\.addEventListener\("foresta:open-elementary-homework"/);
assert.match(app, /view === "elementaryHomework"/);
assert.match(app, /document\.body\.dataset\.appMode = state\.role/);
assert.match(app, /state\.activeView === "elementaryHomework"[^\n]+\? "selected"/);
assert.match(app, /id="correctElementaryLesson"[^>]*>次回の宿題を確認<\/button>/);
assert.doesNotMatch(elementary, /次回宿題を確認・調整/);
assert.match(elementary, /id="elementaryReviewHomework"[^>]*>次回の宿題を確認<\/button>/);
assert.match(elementary, /detail: \{ studentId, subject: normalized \}/);
assert.match(app, /foresta:refresh-elementary-homework/);
assert.match(elementary, /window\.addEventListener\("foresta:refresh-elementary-homework"/);
assert.match(elementary, /if \(document\.querySelector\("\.elementaryHomeworkListCard"\)\) return/);
assert.match(buttons, /function createElementaryReviewButton/);
assert.match(buttons, /detail: \{ studentId, subject \}/);

for (const mode of ["student", "teacher", "admin"]) {
  assert.ok(styles.includes(`body[data-app-mode="${mode}"]`));
  assert.ok(styles.includes(`.modeIndicator span.active[data-mode="${mode}"]`));
}
assert.match(styles, /\.roleTab\[data-role="student"\]:hover/);
assert.match(styles, /\.roleTab\.active\[data-role="teacher"\]/);
assert.match(styles, /@media\(max-width:700px\)/);
assert.match(styles, /\.workspace\{grid-template-columns:minmax\(0,1fr\);width:100%;min-width:0\}/);
assert.match(styles, /\.sideNav nav\{min-width:0;max-width:100%;overflow-x:auto\}/);
assert.match(styles, /\.danger/);

console.log("role colors and elementary homework navigation tests: ok");
