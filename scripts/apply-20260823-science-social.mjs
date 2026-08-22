import fs from 'node:fs';

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Patch point not found: ${label}`);
  return text.replace(from, to);
}

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
app = replaceOnce(
  app,
  '<select id="rangeSubject" class="field"><option>国語</option><option>英語</option><option>数学</option></select>',
  '<select id="rangeSubject" class="field">${TRACKED_SUBJECTS.map((subject) => `<option>${esc(subject)}</option>`).join("")}</select>',
  'admin range subject options',
);
app = app.replaceAll('options.subject !== "国語" && u.ctResult', '["英語", "数学"].includes(options.subject) && u.ctResult');
app = app.replaceAll('options.subject !== "国語" && u.previous && options.mode === "lesson"', '["英語", "数学"].includes(options.subject) && u.previous && options.mode === "lesson"');
app = app.replace('国語・英語・数学の目標点', '5科目の目標点');

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
  "function doGet(e) {\n  ensureScienceSocialUnits_();\n  return json_({ ok: true, app: 'フォレスタ進捗管理', version: '2.2.0', time: nowIso_() });\n}",
  'GET seed hook and version',
);
gas = replaceOnce(
  gas,
  "  try {\n    REQUEST_CACHE = {};\n    const data = parseRequest_(e);",
  "  try {\n    REQUEST_CACHE = {};\n    ensureScienceSocialUnits_();\n    const data = parseRequest_(e);",
  'POST seed hook',
);

const helperNeedle = 'function authorizeStudentAccess_(data) {';
const seedHelper = `function importMasterText_(value) {\n  return text_(value).replace(/[\\r\\n]+/g, ' ').replace(/[\\s　]+/g, ' ').trim();\n}\n\nfunction scienceRowsFromSheet_(sheet, grade, textbook, slug) {\n  const values = sheet.getDataRange().getDisplayValues(), out = [];\n  [0, 12].forEach(function(base) {\n    let chapter = '';\n    for (let r = 3; r < values.length; r++) {\n      const row = values[r] || [], nextChapter = importMasterText_(row[base]), difficulty = importMasterText_(row[base + 1]), step = importMasterText_(row[base + 2]), title = importMasterText_(row[base + 3]);\n      if (nextChapter && nextChapter !== '章') chapter = nextChapter;\n      if (!step || step === 'STEP' || !title || title === 'タイトル') continue;\n      out.push({ chapter: chapter, difficulty: difficulty, step: step, title: title });\n    }\n  });\n  return out.map(function(item, index) {\n    return {\n      '単元ID': 'sci-g' + grade.slice(-1) + '-' + slug + '-' + String(index + 1).padStart(4, '0'),\n      '教科': '理科', '学年': grade, '表示順': index + 1, '章': item.chapter, '単元番号': item.step, '単元名': item.title, '難度': item.difficulty,\n      '教科書または進行表の種類': textbook, '元ファイル名': '26F進行表オモテ【中学理科】.xls'\n    };\n  });\n}\n\nfunction socialTrackRows_(sheet, domain) {\n  const values = sheet.getDataRange().getDisplayValues(), out = [];\n  [0, 11].forEach(function(base) {\n    let chapter = '';\n    for (let r = 2; r < values.length; r++) {\n      const row = values[r] || [], nextChapter = importMasterText_(row[base]), step = importMasterText_(row[base + 1]), title = importMasterText_(row[base + 2]);\n      if (nextChapter && nextChapter !== '章') chapter = nextChapter;\n      if (!step || step === 'STEP' || !title || title === 'タイトル') continue;\n      out.push({ chapter: domain + ' ' + chapter, step: domain + ' ' + step, title: title });\n    }\n  });\n  return out;\n}\n\nfunction socialVariantRows_(geography, history, civics, textbook, slug) {\n  return geography.concat(history, civics).map(function(item, index) {\n    return {\n      '単元ID': 'soc-common-' + slug + '-' + String(index + 1).padStart(4, '0'),\n      '教科': '社会', '学年': '共通', '表示順': index + 1, '章': item.chapter, '単元番号': item.step, '単元名': item.title, '難度': '',\n      '教科書または進行表の種類': textbook, '元ファイル名': '26F進行表オモテ【中学社会】.xls'\n    };\n  });\n}\n\nfunction ensureScienceSocialUnits_() {\n  const markerKey = 'FORESTA_SCI_SOC_UNITS_V2', properties = PropertiesService.getScriptProperties();\n  if (properties.getProperty(markerKey) === 'done') return;\n  const existing = objects_('単元マスタ'), existingIds = new Set(existing.map(function(row) { return text_(row['単元ID']); }));\n  const scienceBook = SpreadsheetApp.openById('1xWIY6LuqhGRss3tInWdUYkQ0jErg7yALfWUPImjiV60');\n  const socialBook = SpreadsheetApp.openById('1kdeA8KXBGyl3T2vJlql8CCMpayoVVenTuE70NK5WHYQ');\n  const scienceDefs = [\n    ['中1(東書)', '中1', '東書', 'tosho', 28], ['中1(啓林)', '中1', '啓林館', 'keirin', 28],\n    ['中2(東書)', '中2', '東書', 'tosho', 57], ['中2(啓林)', '中2', '啓林館', 'keirin', 57],\n    ['中3(東書)', '中3', '東書', 'tosho', 55], ['中3(啓林)', '中3', '啓林館', 'keirin', 55]\n  ];\n  let rows = [];\n  scienceDefs.forEach(function(def) {\n    const parsed = scienceRowsFromSheet_(scienceBook.getSheetByName(def[0]), def[1], def[2], def[3]);\n    if (parsed.length !== def[4]) throw new Error('SCIENCE_UNIT_COUNT_' + def[0] + '_' + parsed.length);\n    rows = rows.concat(parsed);\n  });\n  const geography = socialTrackRows_(socialBook.getSheetByName('地理(東書）'), '地理');\n  const historyTosho = socialTrackRows_(socialBook.getSheetByName('歴史（東書）'), '歴史');\n  const historyKyoiku = socialTrackRows_(socialBook.getSheetByName('歴史（教出） '), '歴史');\n  const civics = socialTrackRows_(socialBook.getSheetByName('公民(東書）'), '公民');\n  if (geography.length !== 60 || historyTosho.length !== 65 || historyKyoiku.length !== 65 || civics.length !== 32) throw new Error('SOCIAL_UNIT_COUNT_MISMATCH_' + [geography.length, historyTosho.length, historyKyoiku.length, civics.length].join('_'));\n  rows = rows.concat(socialVariantRows_(geography, historyTosho, civics, '東書', 'tosho'));\n  rows = rows.concat(socialVariantRows_(geography, historyKyoiku, civics, '歴史教出', 'hist-kyoiku'));\n  if (rows.length !== 594) throw new Error('SCI_SOC_MASTER_COUNT_' + rows.length);\n  const missing = rows.filter(function(row) { return !existingIds.has(text_(row['単元ID'])); });\n  if (missing.length) appendObjects_('単元マスタ', missing);\n  properties.setProperty(markerKey, 'done');\n}\n\n`;
gas = replaceOnce(gas, helperNeedle, seedHelper + helperNeedle, 'science/social import helper');

const oldUnitsFor = `function unitsFor_(student, subject) {\n  let textbook = '標準版';\n  if (subject === '英語') {\n    const setting = objects_('学校別英語教科書設定').find(function(row) { return normalizeSchool_(row['学校名正規化キー']) === student.schoolKey; });\n    textbook = setting ? text_(setting['教科書']) : '';\n  }\n  if (!textbook) return { textbook: '', units: [] };\n  const cache = CacheService.getScriptCache(), key = 'UNITS_' + subject + '_' + student.grade + '_' + textbook;\n  const hit = cache.get(key); if (hit) return { textbook: textbook, units: JSON.parse(hit) };\n  const units = objects_('単元マスタ').filter(function(row) { return text_(row['教科']) === subject && normalizeGrade_(row['学年']) === student.grade && text_(row['教科書または進行表の種類']) === textbook; }).map(function(row) { return { unitId: text_(row['単元ID']), subject: subject, grade: student.grade, displayOrder: Number(row['表示順'] || 0), chapter: text_(row['章']), unitNumber: text_(row['単元番号']), unitName: text_(row['単元名']), difficulty: text_(row['難度']), textbook: textbook }; }).sort(function(a, b) { return a.displayOrder - b.displayOrder; });\n  if (JSON.stringify(units).length < 95000) cache.put(key, JSON.stringify(units), 21600);\n  return { textbook: textbook, units: units };\n}`;
const newUnitsFor = `function unitsFor_(student, subject) {\n  const schoolKey = student.schoolKey || normalizeSchool_(student.school);\n  const alternateSchool = ['志段味中', '吉根中'].indexOf(schoolKey) >= 0;\n  let textbook = '標準版';\n  if (subject === '英語') {\n    const setting = objects_('学校別英語教科書設定').find(function(row) { return normalizeSchool_(row['学校名正規化キー']) === schoolKey; });\n    textbook = setting ? text_(setting['教科書']) : '';\n  } else if (subject === '理科') textbook = alternateSchool ? '啓林館' : '東書';\n  else if (subject === '社会') textbook = alternateSchool ? '歴史教出' : '東書';\n  if (!textbook) return { textbook: '', units: [] };\n  const cache = CacheService.getScriptCache(), key = 'UNITS_' + subject + '_' + student.grade + '_' + textbook;\n  const hit = cache.get(key); if (hit) return { textbook: textbook, units: JSON.parse(hit) };\n  const units = objects_('単元マスタ').filter(function(row) {\n    const rowGrade = text_(row['学年']);\n    const gradeMatches = normalizeGrade_(rowGrade) === student.grade || (subject === '社会' && rowGrade === '共通');\n    return text_(row['教科']) === subject && gradeMatches && text_(row['教科書または進行表の種類']) === textbook;\n  }).map(function(row) { return { unitId: text_(row['単元ID']), subject: subject, grade: student.grade, displayOrder: Number(row['表示順'] || 0), chapter: text_(row['章']), unitNumber: text_(row['単元番号']), unitName: text_(row['単元名']), difficulty: text_(row['難度']), textbook: textbook }; }).sort(function(a, b) { return a.displayOrder - b.displayOrder; });\n  if (JSON.stringify(units).length < 95000) cache.put(key, JSON.stringify(units), 21600);\n  return { textbook: textbook, units: units };\n}`;
gas = replaceOnce(gas, oldUnitsFor, newUnitsFor, 'science/social units selection');

gas = replaceOnce(
  gas,
  "if(subject==='国語'||['◎','〇','×'].indexOf(result)<0)throw new Error('INVALID_VALUE');",
  "if(['英語','数学'].indexOf(subject)<0||['◎','〇','×'].indexOf(result)<0)throw new Error('INVALID_VALUE');",
  'CT subject restriction',
);

if (!domain.includes('"理科", "社会"')) throw new Error('domain five subjects missing');
if (!gas.includes("'理科', '社会'")) throw new Error('backend five subjects missing');
if (!gas.includes('FORESTA_SCI_SOC_UNITS_V2')) throw new Error('unit import helper missing');
if (!gas.includes("alternateSchool ? '啓林館' : '東書'")) throw new Error('science school rule missing');
if (!gas.includes("alternateSchool ? '歴史教出' : '東書'")) throw new Error('social school rule missing');
if (!app.includes('理科: "science", 社会: "social"')) throw new Error('frontend science/social classes missing');
if (!app.includes('TRACKED_SUBJECTS.map((subject) => `<option>')) throw new Error('admin range selector not five-subject aware');

fs.writeFileSync('domain.js', domain);
fs.writeFileSync('app.js', app);
fs.writeFileSync('styles.css', styles);
fs.writeFileSync('index.html', index);
fs.writeFileSync('apps-script/Code.gs', gas);
console.log('Applied science/social five-subject progression update with source-sheet importer.');
