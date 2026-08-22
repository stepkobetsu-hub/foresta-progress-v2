import assert from "node:assert/strict";
import {
  TRACKED_SUBJECTS,
  calculateProgress,
  comparePositions,
  formatProgressGroupLabel,
  formatProgressUnitNumber,
  homeworkSummary,
  isActiveStatus,
  isOmittable,
  makeHomework,
  normalizeGrade,
  normalizeSchool,
  progressGroupKey,
  rangeKey,
  selectNextTest,
} from "../domain.js";

assert.equal(isActiveStatus("1"), true);
assert.equal(isActiveStatus(0), true);
assert.equal(isActiveStatus(""), false);
assert.equal(isActiveStatus("退塾"), false);
assert.equal(normalizeSchool(" 南 城 中学校 "), "南城中");
assert.equal(normalizeGrade("中学２年"), "中2");
assert.equal(isOmittable("!", 1), true);
assert.equal(isOmittable("!!", 1), true);
assert.equal(isOmittable("!!", 2), true);
assert.equal(isOmittable("!", 2), false);
assert.equal(isOmittable("!!", 3), false);
assert.equal(isOmittable("!!", ""), false);

const units = [
  { unitId: "u1", difficulty: "", displayOrder: 1 },
  { unitId: "u2", difficulty: "!", displayOrder: 2 },
  { unitId: "u3", difficulty: "!!", displayOrder: 3 },
  { unitId: "u4", difficulty: "", displayOrder: 4 },
];
const progress = calculateProgress({ units, learnedUnitIds: ["u1"], rangeUnitIds: ["u1", "u2", "u3", "u4"], level: 1, testStartDate: "2026-10-01", now: new Date("2026-08-15T00:00:00+09:00") });
assert.equal(progress.remaining, 1);
assert.equal(progress.requiredPerLesson, 1);

assert.notEqual(rangeKey({ testId: "t", school: "南城中", grade: "中2", subject: "英語", type: "予想" }), rangeKey({ testId: "t", school: "鷹来中", grade: "中2", subject: "英語", type: "予想" }));
assert.equal(selectNextTest([{ startDate: "2026-08-01", endDate: "2026-08-14" }, { startDate: "2026-09-01", endDate: "2026-09-02" }], new Date("2026-08-15")).startDate, "2026-09-01");
assert.equal(makeHomework("数学", "u1", "2026-08-15").length, 3);
assert.equal(makeHomework("英語", "u1", "2026-08-15").length, 5);
assert.deepEqual(TRACKED_SUBJECTS, ["国語", "英語", "数学", "理科", "社会"]);
assert.deepEqual(makeHomework("国語", "u1", "2026-08-15"), []);
assert.deepEqual(makeHomework("理科", "u1", "2026-08-15"), []);
assert.deepEqual(makeHomework("社会", "u1", "2026-08-15"), []);
assert.deepEqual(makeHomework("英語", "u-keywords", "2026-08-15", "KEY WORDS TEST").map((item) => item.contentType), ["巻末のKeyWordsTestの暗記"]);
assert.deepEqual(makeHomework("数学", "u-keywords", "2026-08-15", "Key Words TEST").map((item) => item.contentType), ["巻末のKeyWordsTestの暗記"]);
assert.equal(comparePositions(3, 4), "学校より先");
assert.deepEqual(homeworkSummary([{ studentChecked: true, teacherChecked: false }, { studentChecked: true, teacherChecked: true }]), { total: 2, studentChecked: 2, teacherChecked: 1 });
assert.equal(formatProgressUnitNumber("英語", { chapter: "2", unitNumber: "Part1" }), "2-Part1");
assert.equal(formatProgressUnitNumber("数学", { chapter: "2", unitNumber: "2-1" }), "2-1");
assert.equal(formatProgressGroupLabel("英語", "2"), "UNIT 2");
assert.equal(formatProgressGroupLabel("数学", "2"), "第2章");
assert.equal(formatProgressGroupLabel("理科", "2"), "第2章");
assert.equal(formatProgressGroupLabel("理科", "[1年生] 3"), "1年生 第3章");
assert.equal(formatProgressGroupLabel("英語", "[1年生] 9"), "1年生 UNIT 9");
assert.equal(progressGroupKey({ chapter: "未区分", unitNumber: "プレステップ①", unitName: "アルファベット" }), "プレステップ");
assert.equal(progressGroupKey({ chapter: "-", unitNumber: "プレステップ⑥", unitName: "いつ" }), "プレステップ");
assert.equal(progressGroupKey({ chapter: "2", unitNumber: "Part1", unitName: "My Hero" }), "2");

console.log("domain tests: five-subject progression assertions passed");
