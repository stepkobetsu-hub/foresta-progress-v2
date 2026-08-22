import fs from 'node:fs';

const appPath = 'app.js';
const gasPath = 'apps-script/Code.gs';
const indexPath = 'index.html';
let app = fs.readFileSync(appPath, 'utf8');
let gas = fs.readFileSync(gasPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');

if (!app.includes('studentRoundProgressHtml') || !app.includes('saveStudentRoundProgress')) {
  throw new Error('Three-round frontend has not been applied yet.');
}
if (!gas.includes("case 'saveStudentRoundProgress'") || !gas.includes('studentRoundRows_')) {
  throw new Error('Three-round Apps Script backend has not been applied yet.');
}
if (!index.includes('id="topAdminEntry"') || !index.includes('app.js?v=20260823-rounds')) {
  throw new Error('Final direct-load index is not ready.');
}

app = app.replace(
  'const rangeLocked = options.mode === "lesson" && state.dashboard?.student?.grade !== "中3" && effectiveOutside;',
  'const rangeLocked = options.mode === "lesson" && effectiveOutside;'
).replace(
  'rangeLocked ? "中1・中2は範囲外" : ""',
  'rangeLocked ? "次回テスト範囲外" : ""'
);

gas = gas.replace(
  "if(student.grade!=='中3'&&outsideIds.some(function(id){return!overrideIds.has(id);}))throw new Error('OUTSIDE_TEST_RANGE');",
  "if(outsideIds.some(function(id){return!overrideIds.has(id);}))throw new Error('OUTSIDE_TEST_RANGE');"
).replace(
  '  const learned = new Set(Object.keys(dateMap));',
  "  const learned = new Set(Object.keys(dateMap)); studentRoundRows_(student.studentId, subject).filter(function(row){return Number(row['周回'])===1;}).forEach(function(row){learned.add(text_(row['単元ID']));});"
);

if (!app.includes('const rangeLocked = options.mode === "lesson" && effectiveOutside;')) throw new Error('Outside-range rule was not updated.');
if (!gas.includes("if(outsideIds.some(function(id){return!overrideIds.has(id);}))throw new Error('OUTSIDE_TEST_RANGE');")) throw new Error('Backend outside-range rule was not updated.');
if (!gas.includes("Number(row['周回'])===1")) throw new Error('Student first-round progress is not included in learned units.');

fs.writeFileSync(appPath, app);
fs.writeFileSync(gasPath, gas);
console.log('Verified and finalized three-round progress implementation.');
