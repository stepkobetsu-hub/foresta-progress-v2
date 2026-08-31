import fs from 'node:fs';

const marker = '20260831-score-autohomework';
let app = fs.readFileSync('app.js', 'utf8');
if (!app.includes(`// ${marker}`)) {
  app = app
    .replaceAll('表 点数', '表面の点数')
    .replaceAll('表 満点', '表面の満点')
    .replaceAll('裏 点数', '裏面の点数')
    .replaceAll('裏 満点', '裏面の満点');

  const helperAnchor = 'function openHomeworkSetup(options) {';
  if (!app.includes(helperAnchor)) throw new Error('openHomeworkSetup anchor not found');
  const helper = [
    `// ${marker}`,
    'function automaticHomeworkByUnit(options) {',
    '  const elementary = isElementaryGradeValue(state.dashboard?.student?.grade);',
    '  const defaults = elementary ? (ELEMENTARY_HOMEWORK[options.subject] || []) : (DEFAULT_HOMEWORK[options.subject] || []);',
    '  const repeatDefaults = elementary ? defaults : (REPEAT_HOMEWORK[options.subject] || defaults);',
    '  const japaneseOnly = options.subject === "国語" && !elementary;',
    '  const result = {};',
    '  (options.selectedUnits || []).forEach((unit) => {',
    '    if (japaneseOnly) { result[unit.unitId] = []; return; }',
    '    const isKeyWords = /key\\s*words\\s*test/iu.test(`${String(unit.unitName || "")} ${String(unit.unitNumber || "")}`);',
    '    const nextRound = Math.min(3, Number(unit.completedRounds || 0) + 1);',
    '    const items = isKeyWords',
    '      ? (nextRound >= 2 ? ["KEYWORDSの暗記"] : ["巻末のKeyWordsTestの暗記"])',
    '      : (nextRound >= 2 ? repeatDefaults : defaults);',
    '    result[unit.unitId] = [...items];',
    '  });',
    '  return result;',
    '}',
    '',
  ].join('\n');
  app = app.replace(helperAnchor, helper + helperAnchor);

  const startMarker = '    if ($("saveLesson")) $("saveLesson").onclick = () => {';
  const endMarker = '    $("modalBody").querySelectorAll(".ctButton")';
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('saveLesson handler anchors not found');
  const replacement = [
    '    if ($("saveLesson")) $("saveLesson").onclick = () => {',
    '      const unitIds = checks.filter((c) => c.checked).map((c) => c.value);',
    '      if (!unitIds.length) return status(options.mode === "correction" ? "訂正後の単元を1つ以上選択してください。" : "今回進んだ単元を選択してください。", true);',
    '      const lessonOptions = { ...options, unitIds, outsideRangeOverrideUnitIds: Array.from(outsideOverrides), selectedUnits: (data.units || []).filter((unit) => unitIds.includes(unit.unitId)), idempotencyKey: options.idempotencyKey || crypto.randomUUID() };',
    '      const homeworkByUnit = automaticHomeworkByUnit(lessonOptions);',
    '      status("進行表と次回宿題を保存しています…");',
    '      saveLessonWithHomework(lessonOptions, homeworkByUnit);',
    '    };',
  ].join('\n') + '\n';
  app = app.slice(0, start) + replacement + app.slice(end);

  app = app.replace(/(<button id="saveLesson"[^>]*>)[^<]*(<\/button>)/, '$1進行表と宿題を保存$2');
  fs.writeFileSync('app.js', app);
}

let css = fs.readFileSync('elementary-teacher-layout-fix.css', 'utf8');
if (!css.includes(marker)) {
  css += `\n/* ${marker}: 表面・裏面を見分けやすく色分け */\n.elementaryTopTestForm .elementaryFrontScore,.elementaryTopTestForm .elementaryFrontMax{background:#edf6ff!important;border:1px solid #9cc8f5!important;padding:7px 8px!important;border-radius:10px!important;color:#174f86!important}.elementaryTopTestForm .elementaryBackScore,.elementaryTopTestForm .elementaryBackMax{background:#fff4e8!important;border:1px solid #f0b46b!important;padding:7px 8px!important;border-radius:10px!important;color:#8a4b08!important}.elementaryTopTestForm .elementaryFrontScore::before{content:"表面";display:inline-block;margin-right:5px;padding:2px 6px;border-radius:999px;background:#d9ecff;color:#15558f;font-size:.66rem;font-weight:900}.elementaryTopTestForm .elementaryBackScore::before{content:"裏面";display:inline-block;margin-right:5px;padding:2px 6px;border-radius:999px;background:#ffe2bf;color:#8a4b08;font-size:.66rem;font-weight:900}.elementaryTopTestForm .elementaryFrontScore .field,.elementaryTopTestForm .elementaryFrontMax .field{border-color:#84b9ed!important}.elementaryTopTestForm .elementaryBackScore .field,.elementaryTopTestForm .elementaryBackMax .field{border-color:#e7a653!important}\n`;
  fs.writeFileSync('elementary-teacher-layout-fix.css', css);
}

let index = fs.readFileSync('index.html', 'utf8');
index = index.replace('elementary-teacher-layout-fix.css?v=20260831-1', 'elementary-teacher-layout-fix.css?v=20260831-scorecolor-1');
index = index.replace('app.js?v=20260831-fastv3-1', 'app.js?v=20260831-autohw-1');
fs.writeFileSync('index.html', index);

console.log('Applied score labels/colors and automatic homework save.');
