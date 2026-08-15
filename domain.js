export const SUBJECTS = ["国語", "数学", "英語", "理科", "社会"];
export const TRACKED_SUBJECTS = ["英語", "数学"];

export function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\s　]+/g, "").trim().toLowerCase();
}

export function normalizeSchool(value) {
  return normalizeText(value).replace(/中学校$/u, "中");
}

export function normalizeGrade(value) {
  const text = normalizeText(value).replace(/^中学/u, "中").replace(/年$/u, "");
  const match = text.match(/中?([123])/u);
  return match ? `中${match[1]}` : text;
}

export function isActiveStatus(value) {
  const text = String(value ?? "").trim();
  return text === "1" || text === "0";
}

export function isOmittable(difficulty, level) {
  const diff = String(difficulty ?? "").replace(/[！❕]/g, "!").replace(/‼/g, "!!");
  const lv = Number(level);
  if (lv === 1) return diff === "!" || diff === "!!";
  if (lv === 2) return diff === "!!";
  if (lv === 3) return false;
  return false;
}

export function rangeKey({ testId, school, grade, subject, type }) {
  return [testId, normalizeSchool(school), normalizeGrade(grade), subject, type].join("|");
}

export function selectNextTest(tests, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return [...(tests || [])]
    .filter((test) => new Date(test.endDate).getTime() >= today.getTime())
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))[0] || null;
}

export function omissionLevelFor(subject, profile) {
  if (subject === "英語") return profile?.englishLevel;
  if (subject === "数学") return profile?.mathLevel;
  return null;
}

export function calculateProgress({ units, learnedUnitIds, rangeUnitIds, level, testStartDate, now = new Date() }) {
  const learned = new Set(learnedUnitIds || []);
  const range = new Set(rangeUnitIds || []);
  const targetUnits = (units || []).filter((unit) => range.has(unit.unitId));
  const remainingUnits = targetUnits.filter((unit) => !learned.has(unit.unitId) && !isOmittable(unit.difficulty, level));
  if (!testStartDate || !range.size) {
    return { remaining: null, remainingLessons: null, requiredPerLesson: null, urgent: false };
  }
  const target = new Date(testStartDate);
  target.setDate(target.getDate() - 14);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((target - today) / 86400000);
  const remainingLessons = Math.max(0, Math.ceil(days / 7));
  return {
    remaining: remainingUnits.length,
    remainingLessons,
    requiredPerLesson: remainingLessons > 0 ? Math.ceil(remainingUnits.length / remainingLessons) : null,
    urgent: remainingLessons <= 0 && remainingUnits.length > 0,
  };
}

export function makeHomework(subject, unitId, lessonDate, unitName = "") {
  const keyWordsTest = /key\s*words\s*test/iu.test(String(unitName));
  const base = keyWordsTest
    ? ["巻末のKeyWordsTestの暗記"]
    : subject === "英語"
    ? ["KeyWords「☆日→英」暗記", "exercise「暗記マーク」暗記", "Try赤×直し", "exercise", "宿題の赤×直し"]
    : subject === "数学"
      ? ["TRYの赤×直し", "exercise", "宿題の赤×直し"]
      : [];
  const due = new Date(lessonDate);
  due.setDate(due.getDate() + 2);
  return base.map((contentType) => ({ unitId, contentType, dueDate: due.toISOString().slice(0, 10), enabled: true }));
}

export function comparePositions(schoolOrder, forestaOrder) {
  if (schoolOrder == null || forestaOrder == null) return "未設定";
  if (forestaOrder > schoolOrder) return "学校より先";
  if (forestaOrder === schoolOrder) return "学校と同じ";
  return "学校より遅れ";
}

export function homeworkSummary(items) {
  const rows = items || [];
  return {
    total: rows.length,
    studentChecked: rows.filter((item) => item.studentChecked).length,
    teacherChecked: rows.filter((item) => item.teacherChecked).length,
  };
}

export function formatProgressUnitNumber(subject, unit = {}) {
  const number = String(unit.unitNumber ?? "").trim();
  const chapter = String(unit.chapter ?? "").trim();
  if (subject === "英語" && chapter && /^part\s*\d/iu.test(number)) {
    return `${chapter}-${number.replace(/^part\s*/iu, "Part")}`;
  }
  return number;
}

export function formatProgressGroupLabel(subject, chapter) {
  const value = String(chapter ?? "").trim();
  if (subject === "英語") {
    const previousGrade = value.match(/^\[([^\]]+)\]\s*(.+)$/u);
    if (previousGrade) return `${previousGrade[1]} UNIT ${previousGrade[2]}`;
    if (/^\d+$/u.test(value)) return `UNIT ${value}`;
  }
  if (subject === "数学" && /^\d+$/u.test(value)) return `第${value}章`;
  return value;
}

export function progressGroupKey(unit = {}) {
  const unitText = `${String(unit.unitNumber ?? "")} ${String(unit.unitName ?? "")}`.normalize("NFKC");
  if (/プレステップ/u.test(unitText)) return "プレステップ";
  return String(unit.chapter ?? "").trim() || "未区分";
}
