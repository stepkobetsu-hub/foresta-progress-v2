import fs from 'node:fs';

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Patch point not found: ${label}`);
  return text.replace(from, to);
}

let app = fs.readFileSync('app.js', 'utf8');
let styles = fs.readFileSync('styles.css', 'utf8');
let index = fs.readFileSync('index.html', 'utf8');
let gas = fs.readFileSync('apps-script/Code.gs', 'utf8');
let deploy = fs.readFileSync('deploy-apps-script.html', 'utf8');
const appBlock = fs.readFileSync('patches/homework-archive-app-functions.txt', 'utf8').trim();
const gasBlock = fs.readFileSync('patches/homework-archive-gas-functions.txt', 'utf8').trim();

if (!gas.includes("case 'getHomeworkArchive'")) {
  gas = replaceOnce(
    gas,
    "    case 'teacherCheckHomework': return teacherCheckHomework_(data);",
    "    case 'teacherCheckHomework': return teacherCheckHomework_(data);\n    case 'getHomeworkArchive': return getHomeworkArchive_(data);\n    case 'archiveHomework': return archiveHomework_(data);\n    case 'restoreHomework': return restoreHomework_(data);\n    case 'deleteHomework': return deleteHomework_(data);",
    'homework archive routes',
  );
}

gas = gas.replace("version: '2.2.0'", "version: '2.3.0'");
if (!gas.includes('HOMEWORK_NOT_COMPLETE')) {
  gas = replaceOnce(
    gas,
    "    OUTSIDE_TEST_RANGE: '次回テスト範囲外です。進める場合は確認してください。', ROUND_ORDER: '周回は1周目から順番に入力してください。',",
    "    OUTSIDE_TEST_RANGE: '次回テスト範囲外です。進める場合は確認してください。', ROUND_ORDER: '周回は1周目から順番に入力してください。',\n    HOMEWORK_NOT_COMPLETE: '完了条件を満たしていない宿題はアーカイブできません。',",
    'homework archive error',
  );
}

const gasStart = gas.indexOf('function homeworkFor_(studentId) {');
const gasEnd = gas.indexOf('\n\nfunction todayScheduledStudents_()', gasStart);
if (gasStart < 0 || gasEnd < 0) throw new Error('homeworkFor backend block not found');
if (!gas.slice(gasStart, gasEnd).includes('homeworkRowsFor_')) {
  gas = gas.slice(0, gasStart) + gasBlock + gas.slice(gasEnd);
}

gas = gas.replace(
  'capabilities:{roundProgress:true,outsideRangeOverride:true,studentRoundInput:true,studentHomeworkCardsV2:true}',
  'capabilities:{roundProgress:true,outsideRangeOverride:true,studentRoundInput:true,studentHomeworkCardsV2:true,homeworkArchive:true,homeworkSourceRules:true}',
);

const appStart = app.indexOf('function studentHomeworkCardsHtml(items) {');
const appEnd = app.indexOf('\n\nfunction targetForm(', appStart);
if (appStart < 0 || appEnd < 0) throw new Error('homework frontend block not found');
if (!app.slice(appStart, appEnd).includes('renderHomeworkArchivePage')) {
  app = app.slice(0, appStart) + appBlock + app.slice(appEnd);
}

app = app.replace(
  'async function renderStudent(view) {\n  const data = state.dashboard || await api("getStudentDashboard");',
  'async function renderStudent(view) {\n  if (view === "homeworkArchive") return renderHomeworkArchivePage("student");\n  const data = state.dashboard || await api("getStudentDashboard");',
);

app = app.replace(
  '<article class="card span12 studentHomeworkPanel"><p class="cardTitle">次回までの宿題</p><p><strong>宿題は2日以内に終わらせよう！</strong></p><div class="homeworkList">${homeworkHtml(data.homework || [], "student")}</div></article>',
  '<article class="card span12 studentHomeworkPanel"><div class="homeworkPanelHead"><p class="cardTitle">次回までの宿題</p><button id="openHomeworkArchiveHome" class="ghostBtn homeworkArchiveOpen" type="button">アーカイブ</button></div><p><strong>宿題は2日以内に終わらせよう！</strong></p><div class="homeworkSourceLegend"><span class="self">自主学習で出た宿題</span><span class="teacher">講師から出た宿題</span></div><div class="homeworkList">${homeworkHtml(data.homework || [], "student")}</div></article>',
);

app = app.replace(
  '  bindTargetForm(next?.testId);\n  bindHomeworkChecks();\n}',
  '  bindTargetForm(next?.testId);\n  bindHomeworkChecks();\n  bindHomeworkArchiveActions("student");\n  $("openHomeworkArchiveHome")?.addEventListener("click", () => openView("homeworkArchive"));\n}',
);

app = app.replace(
  'async function renderTeacher(view) {\n  if (view === "today") return renderToday();',
  'async function renderTeacher(view) {\n  if (view === "today") return renderToday();\n  if (view === "selectedArchive" && state.activeStudentId) return renderHomeworkArchivePage("teacher", state.activeStudentId);',
);

app = app.replace('  const summary = homeworkSummary(data.homework || []);', '  const summary = homeworkCompletionSummary(data.homework || []);');
app = app.replace(
  '<article class="card span6"><p class="cardTitle">前回宿題</p><p class="muted">生徒自己申告 ${summary.studentChecked}/${summary.total}　講師確認 ${summary.teacherChecked}/${summary.total}</p><div class="homeworkList">${homeworkHtml(data.homework || [], "teacher")}</div></article>',
  '<article class="card span6 teacherHomeworkPanel"><div class="homeworkPanelHead"><p class="cardTitle">前回宿題</p><button id="openTeacherHomeworkArchive" class="ghostBtn homeworkArchiveOpen" type="button">アーカイブ</button></div><p class="muted">完了 ${summary.completed}/${summary.total}</p><div class="homeworkSourceLegend"><span class="self">自主学習で出た宿題</span><span class="teacher">講師から出た宿題</span></div><div class="homeworkList">${homeworkHtml(data.homework || [], "teacher")}</div></article>',
);

app = app.replace(
  '  bindTeacherHomeworkChecks();\n}',
  '  bindTeacherHomeworkChecks();\n  bindHomeworkArchiveActions("teacher");\n  $("openTeacherHomeworkArchive")?.addEventListener("click", () => { state.activeView = "selectedArchive"; openView("selectedArchive"); });\n}',
);

app = app.replace(
  '  if (/keywords?/iu.test(raw)) return { title: "KEYWORDSの暗記", note: "KEYWORDSを暗記します。" };',
  '  if (/☆日→英/u.test(raw)) return { title: "KeyWords「☆日→英」暗記", note: "KeyWordsの指定範囲を日→英で暗記します。" };\n  if (/keywords?/iu.test(raw)) return { title: "KEYWORDSの暗記", note: "KEYWORDSを暗記します。" };',
);

const cssMarker = '/* 2026-08-23: homework source, completion, and archive */';
if (!styles.includes(cssMarker)) styles += `\n\n${cssMarker}\n.homeworkPanelHead{display:flex;align-items:center;justify-content:space-between;gap:10px}.homeworkPanelHead .cardTitle{margin:0}.homeworkArchiveOpen{padding:7px 11px;font-size:.72rem}.homeworkSourceLegend{display:flex;gap:8px;flex-wrap:wrap;margin:7px 0 11px}.homeworkSourceLegend span{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:4px 8px;font-size:.66rem;font-weight:900}.homeworkSourceLegend span:before{content:"";width:9px;height:9px;border-radius:50%}.homeworkSourceLegend .self{background:#e8f8ef;color:#14613e}.homeworkSourceLegend .self:before{background:#28a269}.homeworkSourceLegend .teacher{background:#eaf0ff;color:#36549d}.homeworkSourceLegend .teacher:before{background:#5577d5}.studentHomeworkCard{position:relative}.studentHomeworkCard.selfStudyHomework{background:linear-gradient(90deg,#eefbf4 0%,#fff 35%);box-shadow:inset 0 3px 0 #28a269}.studentHomeworkCard.teacherAssignedHomework{background:linear-gradient(90deg,#f0f4ff 0%,#fff 35%);box-shadow:inset 0 3px 0 #5577d5}.homeworkSourcePill{display:inline-flex;border-radius:999px;padding:3px 7px;font-size:.62rem;font-weight:900}.homeworkSourcePill.self{background:#d9f5e5;color:#14613e}.homeworkSourcePill.teacher{background:#dfe7ff;color:#36549d}.homeworkCompletionRule{font-weight:800;color:#52615d}.homeworkArchiveX{position:absolute;right:8px;top:7px;z-index:2;width:27px;height:27px;border-radius:50%;border:1px solid #cbd5d1;background:#fff;color:#6b7672;font-size:1rem;font-weight:900;cursor:pointer;display:grid;place-items:center}.homeworkArchiveX:hover{border-color:#9a3412;color:#9a3412;background:#fff7ed}.teacherHomeworkCard{grid-template-columns:1fr}.teacherHomeworkTasks{grid-template-columns:1fr}.teacherSelfHomework{grid-template-columns:1fr auto;align-items:center}.teacherHomeworkState,.teacherStudentState{font-size:.64rem;color:var(--muted);font-weight:800}.archiveHomeworkList{display:grid;gap:10px}.archivedHomeworkCard{opacity:.94;background:#f7f8f8}.archivedHomeworkBody{display:grid;gap:10px}.archivedHomeworkTasks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.archivedHomeworkTask{display:grid;gap:3px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:#fff}.archivedHomeworkTask strong{font-size:.72rem}.archivedHomeworkTask small{font-size:.62rem;color:var(--muted)}.archiveActions{display:flex;gap:8px;justify-content:flex-end}.dangerOutlineBtn{border:1px solid #ef9a9a;background:#fff;color:#b91c1c;border-radius:10px;padding:9px 12px;font-weight:900;cursor:pointer}.archiveNote{padding:9px 12px;border-radius:10px;background:#f4f7f6;color:var(--muted);font-size:.72rem}.studentHomeworkTaskLabel{min-width:0}.studentHomeworkTaskLabel strong{white-space:normal;overflow-wrap:anywhere}.studentHomeworkTaskNote{display:block;margin-top:3px;line-height:1.35;color:var(--muted)}\n@media(max-width:760px){.archivedHomeworkTasks{grid-template-columns:1fr}.teacherSelfHomework{grid-template-columns:1fr}.homeworkPanelHead{align-items:flex-start}}\n`;

index = index
  .replace(/styles\.css\?v=[^"]+/u, 'styles.css?v=20260823-homework-archive')
  .replace(/app\.js\?v=[^"]+/u, 'app.js?v=20260823-homework-archive');

deploy = deploy
  .replace(/フォレスタ進捗管理 v2\.2/g, 'フォレスタ進捗管理 v2.3')
  .replace(/version==='2\.2\.0'/g, "version==='2.3.0'")
  .replace(/version: '2\.2\.0'/g, "version: '2.3.0'")
  .replace(/5科目対応 v2\.2/g, '5科目・宿題アーカイブ対応 v2.3')
  .replace(/5科目対応API v2\.2/g, '宿題アーカイブ対応API v2.3')
  .replace(/science-social-v2/g, 'homework-archive')
  .replace(/scienceRowsFromSheet_/g, 'archiveHomework_');

if (!app.includes('renderHomeworkArchivePage')) throw new Error('archive page missing');
if (!app.includes('bindHomeworkArchiveActions("teacher")')) throw new Error('teacher archive binding missing');
if (!app.includes('renderTeacherStudent(state.activeStudentId, { force: true })')) throw new Error('teacher homework check force refresh missing');
if (!gas.includes("case 'archiveHomework'")) throw new Error('archive route missing');
if (!gas.includes("version: '2.3.0'")) throw new Error('backend version not bumped');
if (!styles.includes('.selfStudyHomework')) throw new Error('source color styles missing');

fs.writeFileSync('app.js', app);
fs.writeFileSync('styles.css', styles);
fs.writeFileSync('index.html', index);
fs.writeFileSync('apps-script/Code.gs', gas);
fs.writeFileSync('deploy-apps-script.html', deploy);
console.log('Applied homework source rules, teacher check fix, archive, restore, and delete.');
