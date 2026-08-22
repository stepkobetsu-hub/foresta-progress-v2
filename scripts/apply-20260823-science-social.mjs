import fs from 'node:fs';

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Patch point not found: ${label}`);
  return text.replace(from, to);
}

const dataFiles = [
  'data/science-g1-tosho.tsv',
  'data/science-g1-keirin.tsv',
  'data/science-g2-tosho.tsv',
  'data/science-g2-keirin.tsv',
  'data/science-g3-tosho.tsv',
  'data/science-g3-keirin.tsv',
  'data/social-history-tosho.tsv',
  'data/social-history-kyoiku.tsv',
  'data/social-geography-tosho.tsv',
  'data/social-civics-tosho.tsv',
];
const combined = dataFiles.map((file) => fs.readFileSync(file, 'utf8').trim()).filter(Boolean).join('\n') + '\n';
const combinedRows = combined.trim().split(/\r?\n/u);
if (combinedRows.length !== 368) throw new Error(`Expected 368 science/social rows, got ${combinedRows.length}`);
fs.writeFileSync('data/science-social-units.tsv', combined);

let domain = fs.readFileSync('domain.js', 'utf8');
let app = fs.readFileSync('app.js', 'utf8');
let styles = fs.readFileSync('styles.css', 'utf8');
let index = fs.readFileSync('index.html', 'utf8');
let gas = fs.readFileSync('apps-script/Code.gs', 'utf8');

domain = replaceOnce(
  domain,
  'export const TRACKED_SUBJECTS = ["国語", "英語", "数学"];',
  'export const TRACKED_SUBJECTS = ["国語", "英語", "数学", "理科", "社会"];',
  'frontend tracked subjects',
);
domain = replaceOnce(
  domain,
  '  if (subject === "数学" && /^\\d+$/u.test(value)) return `第${value}章`;',
  '  if ((subject === "数学" || subject === "理科") && /^\\d+$/u.test(value)) return `第${value}章`;\n  if (subject === "理科") { const previous = value.match(/^\\[([^\\]]+)\\]\\s*(\\d+)$/u); if (previous) return `${previous[1]} 第${previous[2]}章`; }',
  'science group labels',
);

app = replaceOnce(
  app,
  '  return ({ 英語: "english", 数学: "math", 国語: "japanese" })[subject] || "other";',
  '  return ({ 英語: "english", 数学: "math", 国語: "japanese", 理科: "science", 社会: "social" })[subject] || "other";',
  'science social progress classes',
);
app = app.replaceAll('options.subject !== "国語" && u.ctResult', '["英語", "数学"].includes(options.subject) && u.ctResult');
app = app.replaceAll('options.subject !== "国語" && u.previous && options.mode === "lesson"', '["英語", "数学"].includes(options.subject) && u.previous && options.mode === "lesson"');

const extraCss = `\n\n/* 2026-08-23: science/social progress subjects */\n.subjectRoundBar.science>span{background:#22a06b}\n.subjectRoundBar.social>span{background:#2684d8}\n.studentHomeworkCard.science{border-left-color:#22a06b}\n.studentHomeworkCard.social{border-left-color:#2684d8}\n`;
if (!styles.includes('2026-08-23: science/social progress subjects')) styles += extraCss;

index = index
  .replace('styles.css?v=20260823-round-compact', 'styles.css?v=20260823-science-social')
  .replace('app.js?v=20260823-round-compact', 'app.js?v=20260823-science-social');

gas = replaceOnce(
  gas,
  "const TRACKED_SUBJECTS = ['国語', '英語', '数学'];",
  "const TRACKED_SUBJECTS = ['国語', '英語', '数学', '理科', '社会'];",
  'backend tracked subjects',
);
gas = replaceOnce(
  gas,
  "function doGet(e) {\n  return json_({ ok: true, app: 'フォレスタ進捗管理', version: '2.0.0', time: nowIso_() });\n}",
  "function doGet(e) {\n  ensureScienceSocialUnits_();\n  return json_({ ok: true, app: 'フォレスタ進捗管理', version: '2.1.0', time: nowIso_() });\n}",
  'GET seed hook and version',
);
gas = replaceOnce(
  gas,
  "  try {\n    REQUEST_CACHE = {};\n    const data = parseRequest_(e);",
  "  try {\n    REQUEST_CACHE = {};\n    ensureScienceSocialUnits_();\n    const data = parseRequest_(e);",
  'POST seed hook',
);

const helperNeedle = `function authorizeStudentAccess_(data) {`;
const seedHelper = `function ensureScienceSocialUnits_() {\n  const properties = PropertiesService.getScriptProperties();\n  const markerKey = 'FORESTA_SCI_SOC_UNITS_V1';\n  if (properties.getProperty(markerKey) === 'done') return;\n  try {\n    const existingRows = objects_('単元マスタ');\n    const existingIds = new Set(existingRows.map(function(row) { return text_(row['単元ID']); }));\n    const alreadySeeded = existingRows.some(function(row) { return /^sci-/u.test(text_(row['単元ID'])); }) && existingRows.some(function(row) { return /^soc-/u.test(text_(row['単元ID'])); });\n    if (alreadySeeded) { properties.setProperty(markerKey, 'done'); return; }\n    const url = 'https://raw.githubusercontent.com/stepkobetsu-hub/foresta-progress-v2/main/data/science-social-units.tsv?v=20260823';\n    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });\n    if (response.getResponseCode() !== 200) throw new Error('SCI_SOC_MASTER_FETCH_FAILED');\n    const rows = response.getContentText('UTF-8').split(/\\r?\\n/u).filter(Boolean).map(function(line) {\n      const cols = line.split('\\t');\n      if (cols.length < 10) throw new Error('SCI_SOC_MASTER_INVALID');\n      return {\n        '単元ID': cols[0], '教科': cols[1], '学年': cols[2], '表示順': Number(cols[3] || 0), '章': cols[4],\n        '単元番号': cols[5], '単元名': cols[6], '難度': cols[7], '教科書または進行表の種類': cols[8], '元ファイル名': cols[9]\n      };\n    });\n    if (rows.length !== 368) throw new Error('SCI_SOC_MASTER_COUNT_MISMATCH');\n    const missing = rows.filter(function(row) { return !existingIds.has(text_(row['単元ID'])); });\n    if (missing.length) appendObjects_('単元マスタ', missing);\n    properties.setProperty(markerKey, 'done');\n  } catch (error) {\n    console.error('Science/social unit seed failed', error && error.stack ? error.stack : error);\n  }\n}\n\n`;
gas = replaceOnce(gas, helperNeedle, seedHelper + helperNeedle, 'science/social seed helper');

const oldUnitsFor = `function unitsFor_(student, subject) {\n  let textbook = '標準版';\n  if (subject === '英語') {\n    const setting = objects_('学校別英語教科書設定').find(function(row) { return normalizeSchool_(row['学校名正規化キー']) === student.schoolKey; });\n    textbook = setting ? text_(setting['教科書']) : '';\n  }\n  if (!textbook) return { textbook: '', units: [] };\n  const cache = CacheService.getScriptCache(), key = 'UNITS_' + subject + '_' + student.grade + '_' + textbook;\n  const hit = cache.get(key); if (hit) return { textbook: textbook, units: JSON.parse(hit) };\n  const units = objects_('単元マスタ').filter(function(row) { return text_(row['教科']) === subject && normalizeGrade_(row['学年']) === student.grade && text_(row['教科書または進行表の種類']) === textbook; }).map(function(row) { return { unitId: text_(row['単元ID']), subject: subject, grade: student.grade, displayOrder: Number(row['表示順'] || 0), chapter: text_(row['章']), unitNumber: text_(row['単元番号']), unitName: text_(row['単元名']), difficulty: text_(row['難度']), textbook: textbook }; }).sort(function(a, b) { return a.displayOrder - b.displayOrder; });\n  if (JSON.stringify(units).length < 95000) cache.put(key, JSON.stringify(units), 21600);\n  return { textbook: textbook, units: units };\n}`;
const newUnitsFor = `function unitsFor_(student, subject) {\n  const schoolKey = student.schoolKey || normalizeSchool_(student.school);\n  const alternateSchool = ['志段味中', '吉根中'].indexOf(schoolKey) >= 0;\n  let textbook = '標準版';\n  if (subject === '英語') {\n    const setting = objects_('学校別英語教科書設定').find(function(row) { return normalizeSchool_(row['学校名正規化キー']) === schoolKey; });\n    textbook = setting ? text_(setting['教科書']) : '';\n  } else if (subject === '理科') {\n    textbook = alternateSchool ? '啓林館' : '東書';\n  } else if (subject === '社会') {\n    textbook = alternateSchool ? '東書＋歴史教出' : '東書';\n  }\n  if (!textbook) return { textbook: '', units: [] };\n  const cache = CacheService.getScriptCache(), key = 'UNITS_' + subject + '_' + student.grade + '_' + textbook;\n  const hit = cache.get(key); if (hit) return { textbook: textbook, units: JSON.parse(hit) };\n  const units = objects_('単元マスタ').filter(function(row) {\n    if (text_(row['教科']) !== subject) return false;\n    if (subject === '社会') {\n      if (text_(row['学年']) !== '共通') return false;\n      const kind = text_(row['教科書または進行表の種類']), chapter = text_(row['章']);\n      if (!alternateSchool) return kind === '東書';\n      return /^歴史/u.test(chapter) ? kind === '教出' : kind === '東書';\n    }\n    return normalizeGrade_(row['学年']) === student.grade && text_(row['教科書または進行表の種類']) === textbook;\n  }).map(function(row) {\n    let displayOrder = Number(row['表示順'] || 0);\n    const chapter = text_(row['章']);\n    if (subject === '社会') {\n      if (/^地理/u.test(chapter)) displayOrder += 1000;\n      else if (/^公民/u.test(chapter)) displayOrder += 2000;\n    }\n    return { unitId: text_(row['単元ID']), subject: subject, grade: student.grade, displayOrder: displayOrder, chapter: chapter, unitNumber: text_(row['単元番号']), unitName: text_(row['単元名']), difficulty: text_(row['難度']), textbook: textbook };\n  }).sort(function(a, b) { return a.displayOrder - b.displayOrder; });\n  if (JSON.stringify(units).length < 95000) cache.put(key, JSON.stringify(units), 21600);\n  return { textbook: textbook, units: units };\n}`;
gas = replaceOnce(gas, oldUnitsFor, newUnitsFor, 'science/social units selection');

gas = replaceOnce(
  gas,
  "if(subject==='国語'||['◎','〇','×'].indexOf(result)<0)throw new Error('INVALID_VALUE');",
  "if(['英語','数学'].indexOf(subject)<0||['◎','〇','×'].indexOf(result)<0)throw new Error('INVALID_VALUE');",
  'CT subject restriction',
);

if (!domain.includes('"理科", "社会"')) throw new Error('domain five subjects missing');
if (!gas.includes("'理科', '社会'")) throw new Error('backend five subjects missing');
if (!gas.includes('FORESTA_SCI_SOC_UNITS_V1')) throw new Error('unit seed helper missing');
if (!gas.includes("alternateSchool ? '啓林館' : '東書'")) throw new Error('science school rule missing');
if (!gas.includes("textbook = alternateSchool ? '東書＋歴史教出' : '東書'")) throw new Error('social school rule missing');
if (!app.includes('理科: "science", 社会: "social"')) throw new Error('frontend science/social classes missing');
if (app.includes('options.subject !== "国語" && u.ctResult')) throw new Error('CT still enabled for non-math/English');

fs.writeFileSync('domain.js', domain);
fs.writeFileSync('app.js', app);
fs.writeFileSync('styles.css', styles);
fs.writeFileSync('index.html', index);
fs.writeFileSync('apps-script/Code.gs', gas);
console.log('Applied science/social five-subject progression update with 368 master rows.');
