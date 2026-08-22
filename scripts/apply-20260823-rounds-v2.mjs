import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const indexPath = 'index.html';
const patchPath = 'scripts/apply-20260823-rounds.mjs';
const fixedPatchPath = 'scripts/.apply-20260823-rounds-fixed.mjs';
const originalIndex = fs.readFileSync(indexPath, 'utf8');
const fakeNeedle = '\n    <a class="goalLink" href="https://stepkobetsu-hub.github.io/foresta-step-progress/" target="_blank" rel="noopener">ステップ＆ゴールへ ↗</a>\n';

const originalPatch = fs.readFileSync(patchPath, 'utf8');
const helperStart = originalPatch.indexOf('const askHelper = `');
const helperEnd = originalPatch.indexOf("app = replaceOnce(app, '\\nasync function openProgress(options) {'", helperStart);
if (helperStart < 0 || helperEnd < 0) throw new Error('Could not locate broken askHelper block');

const fixedAskDefinition = [
  "const askHelper = [",
  "  '',",
  "  'async function askOutsideRange_() {',",
  "  '  return new Promise((resolve) => {',",
  "  '    const layer = document.createElement(\"div\");',",
  "  '    layer.className = \"outsideConfirmLayer\";',",
  "  '    layer.innerHTML = \'<div class=\"outsideConfirmBox\"><span>⚠</span><h3>次回テスト範囲外です</h3><p>この単元は管理者が設定した次回テスト範囲の外です。それでも実際に進みましたか？</p><div><button class=\"primaryBtn\" data-answer=\"yes\">それでもすすみました</button><button class=\"ghostBtn\" data-answer=\"no\">いいえ</button></div></div>\';',",
  "  '    const finish = (value) => { layer.remove(); resolve(value); };',",
  "  '    layer.querySelector(\'[data-answer=\"yes\"]\').onclick = () => finish(true);',",
  "  '    layer.querySelector(\'[data-answer=\"no\"]\').onclick = () => finish(false);',",
  "  '    document.body.appendChild(layer);',",
  "  '  });',",
  "  '}',",
  "  '',",
  "  'async function bindStudentRoundInputs_(options) {',",
  "  '  const inputs = [...$(\"modalBody\").querySelectorAll(\".studentRoundInput\")];',",
  "  '  inputs.forEach((input) => input.onchange = async () => {',",
  "  '    const row = input.closest(\".studentRoundRow\");',",
  "  '    const roundNumber = Number(input.dataset.round);',",
  "  '    const nextChecked = input.checked;',",
  "  '    if (nextChecked && roundNumber > 1) {',",
  "  '      const previous = row.querySelector(`.studentRoundInput[data-round=\"${roundNumber - 1}\"]`);',",
  "  '      if (previous && !previous.checked) { input.checked = false; status(`先に${roundNumber - 1}周目を完了してください。`, true); return; }',",
  "  '    }',",
  "  '    if (!nextChecked && roundNumber < 3) {',",
  "  '      const later = [...row.querySelectorAll(\".studentRoundInput\")].some((item) => Number(item.dataset.round) > roundNumber && item.checked);',",
  "  '      if (later) { input.checked = true; status(\"後の周回を先に取り消してください。\", true); return; }',",
  "  '    }',",
  "  '    let outsideRangeOverride = false;',",
  "  '    if (nextChecked && input.dataset.outside === \"true\") {',",
  "  '      input.checked = false;',",
  "  '      outsideRangeOverride = await askOutsideRange_();',",
  "  '      if (!outsideRangeOverride) return;',",
  "  '      input.checked = true;',",
  "  '    }',",
  "  '    const date = row.querySelector(`[data-round-date=\"${roundNumber}\"]`);',",
  "  '    input.disabled = true;',",
  "  '    if (date) date.textContent = nextChecked ? \"保存中…\" : \"取消中…\";',",
  "  '    try {',",
  "  '      const result = await api(\"saveStudentRoundProgress\", { subject: options.subject, unitId: row.dataset.unit, roundNumber, checked: nextChecked, outsideRangeOverride, idempotencyKey: crypto.randomUUID() }, { silent: true });',",
  "  '      (result.rounds || []).forEach((round) => {',",
  "  '        const target = row.querySelector(`.studentRoundInput[data-round=\"${round.roundNumber}\"]`);',",
  "  '        const targetDate = row.querySelector(`[data-round-date=\"${round.roundNumber}\"]`);',",
  "  '        if (target) target.checked = !!round.completed;',",
  "  '        if (targetDate) targetDate.textContent = round.completed ? fmtShortDate(round.date) : \"未\";',",
  "  '      });',",
  "  '      invalidateProgressionCache(options);',",
  "  '      state.dashboard = null;',",
  "  '      $(\"modal\").dataset.refreshStudent = \"true\";',",
  "  '      status(nextChecked ? `${roundNumber}周目を保存しました。宿題も更新しました。` : `${roundNumber}周目を取り消しました。`);',",
  "  '    } catch (error) {',",
  "  '      input.checked = !nextChecked;',",
  "  '      if (date) date.textContent = input.checked ? (date.dataset.saved || \"済\") : \"未\";',",
  "  '      status(error.message, true);',",
  "  '    } finally { input.disabled = false; }',",
  "  '  });',",
  "  '}',",
  "].join('\\n');",
  ""
].join('\n');

const fixedPatch = originalPatch.slice(0, helperStart) + fixedAskDefinition + originalPatch.slice(helperEnd);
fs.writeFileSync(fixedPatchPath, fixedPatch);

fs.writeFileSync(indexPath, originalIndex + fakeNeedle);
let result;
try {
  result = spawnSync(process.execPath, [fixedPatchPath], { stdio: 'inherit', env: process.env });
} finally {
  fs.writeFileSync(indexPath, originalIndex);
  try { fs.unlinkSync(fixedPatchPath); } catch {}
}

if (!result || result.status !== 0) process.exit(result?.status || 1);

const app = fs.readFileSync('app.js', 'utf8');
const gas = fs.readFileSync('apps-script/Code.gs', 'utf8');
if (!app.includes('studentRoundProgressHtml')) throw new Error('patched app is missing round progress UI');
if (!app.includes('それでもすすみました')) throw new Error('patched app is missing outside-range confirmation');
if (!gas.includes("case 'saveStudentRoundProgress'")) throw new Error('patched GAS is missing student round route');
if (!gas.includes('studentRoundRows_')) throw new Error('patched GAS is missing round persistence helper');
console.log('Three-round patch applied while preserving the current safe index/bootstrap.');
