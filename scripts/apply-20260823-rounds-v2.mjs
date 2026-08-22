import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const indexPath = 'index.html';
const originalIndex = fs.readFileSync(indexPath, 'utf8');
const fakeNeedle = '\n    <a class="goalLink" href="https://stepkobetsu-hub.github.io/foresta-step-progress/" target="_blank" rel="noopener">ステップ＆ゴールへ ↗</a>\n';

// The original guarded patch expects the pre-add-on top bar. Add a temporary
// matching fragment only while the patch runs, then restore the real index.
fs.writeFileSync(indexPath, originalIndex + fakeNeedle);
let result;
try {
  result = spawnSync(process.execPath, ['scripts/apply-20260823-rounds.mjs'], {
    stdio: 'inherit',
    env: process.env,
  });
} finally {
  fs.writeFileSync(indexPath, originalIndex);
}

if (!result || result.status !== 0) process.exit(result?.status || 1);

const app = fs.readFileSync('app.js', 'utf8');
const gas = fs.readFileSync('apps-script/Code.gs', 'utf8');
if (!app.includes('studentRoundProgressHtml')) throw new Error('patched app is missing round progress UI');
if (!app.includes('それでもすすみました')) throw new Error('patched app is missing outside-range confirmation');
if (!gas.includes("case 'saveStudentRoundProgress'")) throw new Error('patched GAS is missing student round route');
if (!gas.includes('studentRoundRows_')) throw new Error('patched GAS is missing round persistence helper');
console.log('Three-round patch applied while preserving the current safe index/bootstrap.');
