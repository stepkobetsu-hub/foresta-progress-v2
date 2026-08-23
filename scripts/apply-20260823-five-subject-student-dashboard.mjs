import fs from 'node:fs';

let app = fs.readFileSync('app.js', 'utf8');
let styles = fs.readFileSync('styles.css', 'utf8');
let index = fs.readFileSync('index.html', 'utf8');

const start = app.indexOf('function studentRoundProgressHtml(data) {');
const end = app.indexOf('\n\nfunction adminRangeCta()', start);
if (start < 0 || end < 0) throw new Error('studentRoundProgressHtml block not found');
const newBlock = fs.readFileSync('scripts/five-subject-student-dashboard-block.txt', 'utf8').trimEnd();
app = app.slice(0, start) + newBlock + app.slice(end);

const oldComparison = '${metricCard("学校との比較", p.comparison || "未設定", p.subject || "英語・数学から選択", p.comparison === "学校より先" ? "" : "alert")}';
if (!app.includes(oldComparison) && !app.includes('${studentComparisonMiniHtml(data)}')) throw new Error('comparison metric patch point not found');
app = app.replace(oldComparison, '${studentComparisonMiniHtml(data)}');

const cssMarker = '/* 2026-08-23: five-subject student dashboard */';
if (!styles.includes(cssMarker)) styles += `\n\n${cssMarker}\n.studentFiveSubjectGraph{background:radial-gradient(circle at 88% 10%,rgba(255,255,255,.12),transparent 30%),linear-gradient(135deg,#4f2d62 0%,#353765 52%,#28455d 100%);box-shadow:0 15px 34px rgba(61,46,92,.22)}\n.studentFiveSubjectGraph .roundScore{background:rgba(255,255,255,.09)}\n.studentFiveSubjectGraph .roundProgressGuide{color:#f0e9f7}\n.studentFiveSubjectGraph .subjectRoundBar.unconfigured i em{width:0!important}\n.studentFiveSubjectGraph .subjectRoundBar.unconfigured strong{font-size:.64rem;color:#eadff1}\n.studentComparisonCard{padding:14px 16px}.studentComparisonMini{display:grid;gap:5px}.comparisonMiniRow{display:grid;grid-template-columns:52px 1fr;align-items:center;gap:8px;min-height:24px;padding:2px 0}.comparisonMiniRow b{font-size:.78rem}.comparisonSubject{display:grid;place-items:center;border-radius:7px;padding:3px 5px;color:#fff;font-size:.65rem;font-weight:900;background:#64748b}.comparisonSubject.english{background:#e84545}.comparisonSubject.math{background:#f59e0b}.comparisonSubject.japanese{background:#9b35b8}.comparisonSubject.science{background:#22a06b}.comparisonSubject.social{background:#2684d8}.comparisonMiniRow.ahead b{color:#0f766e}.comparisonMiniRow.same b{color:#2563eb}.comparisonMiniRow.behind b{color:#b45309}.comparisonMiniRow.unset b{color:#7a8581}.studentHomeworkPanel{background:#f8fbfd}.studentHomeworkPanel>.cardTitle{font-size:.92rem;color:#17201f}.studentHomeworkCard{grid-template-columns:minmax(260px,.9fr) minmax(0,1.5fr);padding:10px 12px;gap:10px;border-radius:13px}.studentHomeworkTasks{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.studentHomeworkTask{min-height:58px;padding:7px 9px;gap:4px}.studentHomeworkTask>strong{font-size:.68rem;line-height:1.35}.studentTaskRight{display:flex;align-items:center;justify-content:space-between;gap:7px}.homeworkSaveState{white-space:nowrap;font-size:.58rem!important}.studentHomeworkMeta>strong{font-size:.82rem;line-height:1.35}.studentHomeworkMeta>small{font-size:.64rem}\n@media(max-width:980px){.studentHomeworkTasks{grid-template-columns:repeat(2,minmax(0,1fr))}}\n@media(max-width:760px){.studentHomeworkCard{grid-template-columns:1fr}.studentHomeworkTasks{grid-template-columns:repeat(2,minmax(0,1fr))}.studentComparisonMini{grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.comparisonMiniRow{grid-template-columns:1fr;text-align:center}.comparisonMiniRow b{font-size:.68rem}}\n@media(max-width:520px){.studentHomeworkTasks{grid-template-columns:1fr}.studentComparisonMini{grid-template-columns:repeat(3,minmax(0,1fr))}}\n`;

index = index
  .replace(/styles\.css\?v=[^"]+/u, 'styles.css?v=20260823-five-subject-dashboard')
  .replace(/app\.js\?v=[^"]+/u, 'app.js?v=20260823-five-subject-dashboard');

if (!app.includes('studentComparisonMiniHtml(data)')) throw new Error('five-subject comparison missing');
if (!app.includes('studentFiveSubjectGraph')) throw new Error('graph class missing');
if (!styles.includes('.studentHomeworkTasks{grid-template-columns:repeat(3')) throw new Error('homework compact grid missing');

fs.writeFileSync('app.js', app);
fs.writeFileSync('styles.css', styles);
fs.writeFileSync('index.html', index);
console.log('Applied five-subject graph, comparison mini-list, and compact homework styling.');
