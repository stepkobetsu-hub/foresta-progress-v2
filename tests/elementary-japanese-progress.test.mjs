import assert from "node:assert/strict";
import fs from "node:fs";
const elem = fs.readFileSync(new URL("../elementary-supabase.js", import.meta.url), "utf8");
for (let grade = 1; grade <= 6; grade += 1) {
  const data = JSON.parse(fs.readFileSync(new URL(`../data/elementary-japanese-mitsumura-${grade}.json`, import.meta.url), "utf8"));
  assert.equal(data.grade, `小${grade}`);
  assert.ok(Array.isArray(data.units) && data.units.length > 0, `小${grade}の国語進行表が空です`);
}
const expectedCounts = {1:60,2:41,3:36,4:44,5:44,6:45};
for (const [grade, expected] of Object.entries(expectedCounts)) {
  const data = JSON.parse(fs.readFileSync(new URL(`../data/elementary-japanese-mitsumura-${grade}.json`, import.meta.url), "utf8"));
  assert.equal(data.units.length, expected, `小${grade}の元Excel対象単元数が一致しません`);
}
const g5 = JSON.parse(fs.readFileSync(new URL("../data/elementary-japanese-mitsumura-5.json", import.meta.url), "utf8"));
assert.equal(g5.units.length, 44);
assert.ok(g5.units.some((u) => u.unitName === "言葉（２）" && u.chapter === "まとめ"));
assert.ok(g5.units.some((u) => u.unitName.includes("大造じいさんとガン")));
assert.ok(elem.includes('if (normalized === "国語") return loadJapaneseProgressions(grade);'));
assert.match(elem, /elementary-japanese-mitsumura-/);
assert.match(elem, /NEW小学ワーク 光村/);
console.log("elementary Japanese progression tests: ok");
