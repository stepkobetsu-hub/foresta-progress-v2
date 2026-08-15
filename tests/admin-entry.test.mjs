import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

const loginButton = html.indexOf('class="primaryBtn" type="submit">ログイン');
const adminButton = html.indexOf('id="adminEntry"');
const loginMessage = html.indexOf('id="loginMessage"');

assert.ok(loginButton >= 0 && adminButton > loginButton && loginMessage > adminButton);
assert.equal((html.match(/id="adminEntry"/g) || []).length, 1);
assert.match(app, /<h2>管理者ログイン<\/h2>/);
assert.match(app, /api\("staffLogin"[\s\S]*api\("adminReauth"/);
assert.match(app, /deviceMode: "shared"/);
assert.match(app, /state\.role = "admin"/);
assert.match(app, /両方そろうと自動でログインします/);
assert.match(app, /setTimeout\(\(\) => adminForm\.requestSubmit\(\), 700\)/);
assert.match(app, /persistAdminSession\(\)/);
assert.match(app, /resumeAdminSession/);
assert.match(app, /localStorage\.removeItem\(KEYS\.admin\)/);

console.log("admin entry tests: 11 assertions passed");
