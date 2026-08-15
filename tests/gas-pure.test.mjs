import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
const context = vm.createContext({ console, Set, Map, Date, JSON, Math, Number, String, Object, Array, RegExp });
vm.runInContext(source, context, { filename: "Code.gs" });

assert.equal(context.activeStatus_(1), true);
assert.equal(context.activeStatus_("0"), true);
assert.equal(context.activeStatus_(""), false);
assert.equal(context.activeStatus_(2), false);
assert.equal(context.normalizeSchool_(" 南城 中学校 "), "南城中");
assert.equal(context.normalizeGrade_("中学２年"), "中2");
assert.equal(context.kanaFold_("タナカ　太郎"), "たなか太郎");
assert.equal(context.omission_("!", 1), true);
assert.equal(context.omission_("!!", 1), true);
assert.equal(context.omission_("!!", 2), true);
assert.equal(context.omission_("!", 2), false);
assert.equal(context.omission_("!!", 3), false);
assert.equal(context.omission_("!", ""), false);
assert.equal(context.publicError_(new Error("LOGIN_FAILED")), "IDまたはパスワードを確認してください。");
assert.deepEqual(Array.from(context.homeworkItemsForUnit_("英語", { unitName: "KEY WORDS TEST", unitNumber: "Key Words TEST" }, ["Try赤×直し", "exercise"])), ["巻末のKeyWordsTestの暗記"]);
assert.deepEqual(Array.from(context.homeworkItemsForUnit_("数学", { unitName: "KEY WORDS TEST", unitNumber: "Key Words TEST" }, ["TRYの赤×直し", "exercise"])), ["巻末のKeyWordsTestの暗記"]);
assert.deepEqual(Array.from(context.homeworkItemsForUnit_("英語", { unitName: "About Me", unitNumber: "Part1" }, ["Try赤×直し", "exercise"])), ["Try赤×直し", "exercise"]);

console.log("GAS pure tests: 17 assertions passed");
