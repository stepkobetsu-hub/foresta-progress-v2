import fs from 'node:fs';

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Patch point not found: ${label}`);
  return text.replace(from, to);
}

let app = fs.readFileSync('app.js', 'utf8');
let gas = fs.readFileSync('apps-script/Code.gs', 'utf8');
let index = fs.readFileSync('index.html', 'utf8');

if (app.includes('<select id="rangeSubject" class="field"><option>国語</option><option>英語</option><option>数学</option></select>')) {
  app = replaceOnce(app,
    '<select id="rangeSubject" class="field"><option>国語</option><option>英語</option><option>数学</option></select>',
    '<select id="rangeSubject" class="field">${TRACKED_SUBJECTS.map((subject) => `<option>${esc(subject)}</option>`).join("")}</select>',
    'admin five-subject range selector');
}
app = app.replace('国語・英語・数学の目標点', '5科目の目標点');

if (gas.includes("version: '2.1.0'")) gas = gas.replace("version: '2.1.0'", "version: '2.2.0'");

const helperRegex = /function ensureScienceSocialUnits_\(\) \{[\s\S]*?\n\}\n\nfunction authorizeStudentAccess_/;
if (!helperRegex.test(gas)) throw new Error('old science/social helper not found');
const newHelper = `function importMasterText_(value) {
  return text_(value).replace(/[\\r\\n]+/g, ' ').replace(/[\\s　]+/g, ' ').trim();
}

function scienceRowsFromSheet_(sheet, grade, textbook, slug) {
  const values = sheet.getDataRange().getDisplayValues(), out = [];
  [0, 12].forEach(function(base) {
    let chapter = '';
    for (let r = 3; r < values.length; r++) {
      const row = values[r] || [], nextChapter = importMasterText_(row[base]), difficulty = importMasterText_(row[base + 1]), step = importMasterText_(row[base + 2]), title = importMasterText_(row[base + 3]);
      if (nextChapter && nextChapter !== '章') chapter = nextChapter;
      if (!step || step === 'STEP' || !title || title === 'タイトル') continue;
      out.push({ chapter: chapter, difficulty: difficulty, step: step, title: title });
    }
  });
  return out.map(function(item, index) {
    return {
      '単元ID': 'sci-g' + grade.slice(-1) + '-' + slug + '-' + String(index + 1).padStart(4, '0'),
      '教科': '理科', '学年': grade, '表示順': index + 1, '章': item.chapter, '単元番号': item.step, '単元名': item.title, '難度': item.difficulty,
      '教科書または進行表の種類': textbook, '元ファイル名': '26F進行表オモテ【中学理科】.xls'
    };
  });
}

function socialTrackRows_(sheet, domain) {
  const values = sheet.getDataRange().getDisplayValues(), out = [];
  [0, 11].forEach(function(base) {
    let chapter = '';
    for (let r = 2; r < values.length; r++) {
      const row = values[r] || [], nextChapter = importMasterText_(row[base]), step = importMasterText_(row[base + 1]), title = importMasterText_(row[base + 2]);
      if (nextChapter && nextChapter !== '章') chapter = nextChapter;
      if (!step || step === 'STEP' || !title || title === 'タイトル') continue;
      out.push({ chapter: domain + ' ' + chapter, step: domain + ' ' + step, title: title });
    }
  });
  return out;
}

function socialVariantRows_(geography, history, civics, textbook, slug) {
  return geography.concat(history, civics).map(function(item, index) {
    return {
      '単元ID': 'soc-common-' + slug + '-' + String(index + 1).padStart(4, '0'),
      '教科': '社会', '学年': '共通', '表示順': index + 1, '章': item.chapter, '単元番号': item.step, '単元名': item.title, '難度': '',
      '教科書または進行表の種類': textbook, '元ファイル名': '26F進行表オモテ【中学社会】.xls'
    };
  });
}

function ensureScienceSocialUnits_() {
  const markerKey = 'FORESTA_SCI_SOC_UNITS_V2', properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(markerKey) === 'done') return;
  const existing = objects_('単元マスタ'), existingIds = new Set(existing.map(function(row) { return text_(row['単元ID']); }));
  const scienceBook = SpreadsheetApp.openById('1xWIY6LuqhGRss3tInWdUYkQ0jErg7yALfWUPImjiV60');
  const socialBook = SpreadsheetApp.openById('1kdeA8KXBGyl3T2vJlql8CCMpayoVVenTuE70NK5WHYQ');
  const scienceDefs = [
    ['中1(東書)', '中1', '東書', 'tosho', 28], ['中1(啓林)', '中1', '啓林館', 'keirin', 28],
    ['中2(東書)', '中2', '東書', 'tosho', 57], ['中2(啓林)', '中2', '啓林館', 'keirin', 57],
    ['中3(東書)', '中3', '東書', 'tosho', 55], ['中3(啓林)', '中3', '啓林館', 'keirin', 55]
  ];
  let rows = [];
  scienceDefs.forEach(function(def) {
    const parsed = scienceRowsFromSheet_(scienceBook.getSheetByName(def[0]), def[1], def[2], def[3]);
    if (parsed.length !== def[4]) throw new Error('SCIENCE_UNIT_COUNT_' + def[0] + '_' + parsed.length);
    rows = rows.concat(parsed);
  });
  const geography = socialTrackRows_(socialBook.getSheetByName('地理(東書）'), '地理');
  const historyTosho = socialTrackRows_(socialBook.getSheetByName('歴史（東書）'), '歴史');
  const historyKyoiku = socialTrackRows_(socialBook.getSheetByName('歴史（教出） '), '歴史');
  const civics = socialTrackRows_(socialBook.getSheetByName('公民(東書）'), '公民');
  if (geography.length !== 60 || historyTosho.length !== 65 || historyKyoiku.length !== 65 || civics.length !== 32) throw new Error('SOCIAL_UNIT_COUNT_MISMATCH_' + [geography.length, historyTosho.length, historyKyoiku.length, civics.length].join('_'));
  rows = rows.concat(socialVariantRows_(geography, historyTosho, civics, '東書', 'tosho'));
  rows = rows.concat(socialVariantRows_(geography, historyKyoiku, civics, '歴史教出', 'hist-kyoiku'));
  if (rows.length !== 594) throw new Error('SCI_SOC_MASTER_COUNT_' + rows.length);
  const missing = rows.filter(function(row) { return !existingIds.has(text_(row['単元ID'])); });
  if (missing.length) appendObjects_('単元マスタ', missing);
  properties.setProperty(markerKey, 'done');
}

function authorizeStudentAccess_`;
gas = gas.replace(helperRegex, newHelper);

const unitsRegex = /function unitsFor_\(student, subject\) \{[\s\S]*?\n\}\n\nfunction omission_/;
if (!unitsRegex.test(gas)) throw new Error('unitsFor block not found');
const newUnits = `function unitsFor_(student, subject) {
  const schoolKey = student.schoolKey || normalizeSchool_(student.school);
  const alternateSchool = ['志段味中', '吉根中'].indexOf(schoolKey) >= 0;
  let textbook = '標準版';
  if (subject === '英語') {
    const setting = objects_('学校別英語教科書設定').find(function(row) { return normalizeSchool_(row['学校名正規化キー']) === schoolKey; });
    textbook = setting ? text_(setting['教科書']) : '';
  } else if (subject === '理科') textbook = alternateSchool ? '啓林館' : '東書';
  else if (subject === '社会') textbook = alternateSchool ? '歴史教出' : '東書';
  if (!textbook) return { textbook: '', units: [] };
  const cache = CacheService.getScriptCache(), key = 'UNITS_' + subject + '_' + student.grade + '_' + textbook;
  const hit = cache.get(key); if (hit) return { textbook: textbook, units: JSON.parse(hit) };
  const units = objects_('単元マスタ').filter(function(row) {
    const rowGrade = text_(row['学年']);
    const gradeMatches = normalizeGrade_(rowGrade) === student.grade || (subject === '社会' && rowGrade === '共通');
    return text_(row['教科']) === subject && gradeMatches && text_(row['教科書または進行表の種類']) === textbook;
  }).map(function(row) { return { unitId: text_(row['単元ID']), subject: subject, grade: student.grade, displayOrder: Number(row['表示順'] || 0), chapter: text_(row['章']), unitNumber: text_(row['単元番号']), unitName: text_(row['単元名']), difficulty: text_(row['難度']), textbook: textbook }; }).sort(function(a, b) { return a.displayOrder - b.displayOrder; });
  if (JSON.stringify(units).length < 95000) cache.put(key, JSON.stringify(units), 21600);
  return { textbook: textbook, units: units };
}

function omission_`;
gas = gas.replace(unitsRegex, newUnits);

gas = gas.replace("if(subject==='国語'||['◎','〇','×'].indexOf(result)<0)throw new Error('INVALID_VALUE');", "if(['英語','数学'].indexOf(subject)<0||['◎','〇','×'].indexOf(result)<0)throw new Error('INVALID_VALUE');");

index = index
  .replace('styles.css?v=20260823-science-social', 'styles.css?v=20260823-science-social-v2')
  .replace('app.js?v=20260823-science-social', 'app.js?v=20260823-science-social-v2');

if (!gas.includes("version: '2.2.0'")) throw new Error('backend version 2.2 missing');
if (!gas.includes('FORESTA_SCI_SOC_UNITS_V2')) throw new Error('v2 importer missing');
if (!gas.includes("alternateSchool ? '歴史教出' : '東書'")) throw new Error('social exception routing missing');
if (!app.includes('TRACKED_SUBJECTS.map((subject) => `<option>')) throw new Error('admin five-subject selector missing');

fs.writeFileSync('app.js', app);
fs.writeFileSync('apps-script/Code.gs', gas);
fs.writeFileSync('index.html', index);
console.log('Upgraded science/social importer to complete 594-unit source import.');
