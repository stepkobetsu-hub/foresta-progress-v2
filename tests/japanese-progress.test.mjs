import assert from "node:assert/strict";
import fs from "node:fs";

const source = JSON.parse(fs.readFileSync(new URL("../data/japanese-units.json", import.meta.url), "utf8"));
assert.deepEqual(source.counts, { 中1: 78, 中2: 77, 中3: 77 });
assert.equal(source.rows.length, 232);
assert.equal(new Set(source.rows.map((row) => row.unitId)).size, 232);
assert.ok(source.rows.every((row) => row.subject === "国語"));
assert.ok(source.rows.every((row) => row.progressionType === "標準版"));
assert.ok(source.rows.every((row) => row.chapter === "国語ワーク"));
assert.ok(source.rows.every((row) => row.unitName && !/[\r\n]/u.test(row.unitName)));
assert.ok(source.rows.every((row) => !row.unitName.includes("／／")));

for (const [grade, expected] of Object.entries(source.counts)) {
  const rows = source.rows.filter((row) => row.grade === grade);
  assert.equal(rows.length, expected);
  assert.deepEqual(rows.map((row) => row.displayOrder), Array.from({ length: expected }, (_, index) => index + 1));
}

console.log("Japanese progression tests: 14 assertions passed");
