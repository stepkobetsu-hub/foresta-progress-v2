import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [html, app, gas, manifest] = await Promise.all([
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('app.js', root), 'utf8'),
  readFile(new URL('gas/Code.gs', root), 'utf8'),
  readFile(new URL('manifest.webmanifest', root), 'utf8')
]);

assert.match(html, /data-login-tab="student"/);
assert.match(html, /data-login-tab="staff"/);
assert.match(html, /name="device" value="personal" required/);
assert.match(html, /name="device" value="shared" required/);
assert.match(html, /フォレスタ＆ゴールへ/);
assert.match(html, /管理者ページ/);

assert.doesNotMatch(app, /山田 花子|佐藤 悠斗|S001|demoStudents|画面デモ/);
assert.match(app, /loginStudent/);
assert.match(app, /loginStaff/);
assert.match(app, /reauthAdmin/);
assert.match(app, /state\.tabs\.length >= 2/);
assert.match(app, /markHomeworkStudent/);
assert.match(app, /markHomeworkTeacher/);
assert.match(app, /saveSchoolProgress/);
assert.match(app, /saveTestRange/);

assert.match(gas, /active: clean_\(r\[3\]\) === '1'/);
assert.match(gas, /permission >= 1/);
assert.match(gas, /function publicStudent_/);
assert.match(gas, /function publicStaff_/);
assert.doesNotMatch(gas.match(/function publicStudent_[^\n]+/s)?.[0] || '', /password/);
assert.doesNotMatch(gas.match(/function publicStaff_[^\n]+/s)?.[0] || '', /password/);
assert.match(gas, /hash_\(token\)/);
assert.match(gas, /lesson\['授業ID'\] \+ ':ct'/);
assert.match(gas, /'ct-fail:' \+ ctId/);
assert.match(gas, /SESSION_DAYS_PERSONAL: 30/);
assert.match(gas, /SESSION_HOURS_SHARED: 8/);
assert.match(gas, /m1 <= 3 \? academicStart \+ 1 : academicStart/);
assert.match(gas, /target\.setDate\(target\.getDate\(\) - 14\)/);
assert.match(gas, /MAIL_SUPPRESS/);
assert.match(gas, /scriptProperty_\('DB_ID'\)/);
assert.doesNotMatch(gas, /DB_ID:\s*['"][A-Za-z0-9_-]{20,}/);

const parsedManifest = JSON.parse(manifest);
assert.equal(parsedManifest.name, 'フォレスタ進捗管理');
console.log('app contract checks passed');
