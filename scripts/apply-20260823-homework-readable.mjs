import fs from 'node:fs';

let app = fs.readFileSync('app.js', 'utf8');
let styles = fs.readFileSync('styles.css', 'utf8');
let index = fs.readFileSync('index.html', 'utf8');

const helpers = fs.readFileSync('scripts/templates/homework-display-helpers.txt', 'utf8').trimEnd();
const taskRender = fs.readFileSync('scripts/templates/homework-task-render.txt', 'utf8').trimEnd();

if (!app.includes('function homeworkDisplayInfo(item)')) {
  const marker = 'function studentHomeworkCardsHtml(items) {';
  const pos = app.indexOf(marker);
  if (pos < 0) throw new Error('studentHomeworkCardsHtml not found');
  app = app.slice(0, pos) + helpers + '\n\n' + app.slice(pos);
}

const funcPos = app.indexOf('function studentHomeworkCardsHtml(items) {');
const tasksStart = app.indexOf('    const tasks = group.items.map((item) => {', funcPos);
const cardReturn = app.indexOf('    return `<article class="studentHomeworkCard', tasksStart);
if (tasksStart < 0 || cardReturn < 0) throw new Error('student homework task render block not found');
app = app.slice(0, tasksStart) + taskRender + '\n' + app.slice(cardReturn);

const cssMarker = '/* 2026-08-23: readable homework labels */';
if (!styles.includes(cssMarker)) styles += `\n\n${cssMarker}\n.studentHomeworkTasks{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px}\n.studentHomeworkTask{grid-template-columns:minmax(0,1fr) auto;align-items:center;min-height:84px;padding:10px 12px;gap:10px;overflow:visible}\n.studentHomeworkTaskLabel{display:grid;gap:3px;min-width:0}\n.studentHomeworkTaskLabel strong{font-size:.75rem;line-height:1.45;white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere;color:inherit}\n.studentHomeworkTaskNote{display:block;color:var(--muted);font-size:.62rem;line-height:1.4;white-space:normal}\n.studentTaskRight{display:grid;justify-items:start;gap:4px;min-width:98px}\n.studentTaskAction{white-space:nowrap}\n.homeworkSaveState{white-space:nowrap}\n.studentHomeworkCard{grid-template-columns:minmax(270px,.95fr) minmax(0,1.4fr)}\n@media(max-width:900px){.studentHomeworkCard{grid-template-columns:1fr}.studentHomeworkTasks{grid-template-columns:repeat(2,minmax(0,1fr))!important}}\n@media(max-width:560px){.studentHomeworkTasks{grid-template-columns:1fr!important}.studentHomeworkTask{grid-template-columns:minmax(0,1fr) auto}}\n`;

index = index
  .replace(/styles\.css\?v=[^"]+/u, 'styles.css?v=20260823-homework-readable')
  .replace(/app\.js\?v=[^"]+/u, 'app.js?v=20260823-homework-readable');

for (const label of ['TRYの赤×なおし','エクササイズの赤×なおし','暗記マーク（基本文の暗記）','KEYWORDSの暗記','宿題の赤×なおし']) {
  if (!app.includes(label)) throw new Error(`missing readable label: ${label}`);
}
if (!styles.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important')) throw new Error('two-column homework layout missing');
if (!styles.includes('white-space:normal')) throw new Error('homework label wrapping missing');

fs.writeFileSync('app.js', app);
fs.writeFileSync('styles.css', styles);
fs.writeFileSync('index.html', index);
console.log('Applied readable full homework labels and two-column task layout.');
