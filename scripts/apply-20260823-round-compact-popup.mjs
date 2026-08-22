import fs from 'node:fs';

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Patch point not found: ${label}`);
  return text.replace(from, to);
}

let app = fs.readFileSync('app.js', 'utf8');
let styles = fs.readFileSync('styles.css', 'utf8');
let index = fs.readFileSync('index.html', 'utf8');

app = replaceOnce(
  app,
  '    return `<div class="roundProgressLine"><span>${index + 1}周目</span><i><b style="width:${Math.min(100, pct)}%"></b></i><strong>${pct}%</strong></div>`;',
  '    return `<div class="roundProgressLine round${index + 1}"><span>${index + 1}周目</span><i><b style="width:${Math.min(100, pct)}%"></b></i><strong>${pct}%</strong></div>`;',
  'round graph classes',
);

app = replaceOnce(
  app,
  '<div class="homeworkList">${homeworkHtml((data.homework || []).slice(0, 6), "student")}</div>',
  '<div class="homeworkList">${homeworkHtml(data.homework || [], "student")}</div>',
  'show all student homework including self-generated homework',
);

const oldTaskLine = '    const tasks = group.items.map((item) => `<label class="studentHomeworkTask ${item.teacherChecked ? "confirmed" : ""}"><strong>${esc(item.contentText || item.contentType)}</strong><span class="studentTaskAction"><input class="homeworkCheck" type="checkbox" data-id="${esc(item.homeworkId)}" ${item.studentChecked ? "checked" : ""} ${item.teacherChecked ? "disabled" : ""}><b>${item.teacherChecked ? "確認済み" : "チェック"}</b></span><small class="homeworkSaveState">${item.teacherChecked ? "講師確認済み" : item.studentChecked ? "保存済み・先生の確認待ち" : "変更すると自動保存"}</small></label>`).join("");';
const newTaskLine = '    const tasks = group.items.map((item) => { const taskText = item.contentText || item.contentType; return `<label class="studentHomeworkTask ${item.teacherChecked ? "confirmed" : ""}" title="${esc(taskText)}"><strong>${esc(taskText)}</strong><span class="studentTaskRight"><span class="studentTaskAction"><input class="homeworkCheck" type="checkbox" data-id="${esc(item.homeworkId)}" ${item.studentChecked ? "checked" : ""} ${item.teacherChecked ? "disabled" : ""}><b>${item.teacherChecked ? "確認済" : "チェック"}</b></span><small class="homeworkSaveState">${item.teacherChecked ? "講師確認済" : item.studentChecked ? "保存済" : "自動保存"}</small></span></label>`; }).join("");';
app = replaceOnce(app, oldTaskLine, newTaskLine, 'compact student homework row');

app = replaceOnce(
  app,
  '      if (saveState) saveState.textContent = nextChecked ? "保存済み・先生の確認待ち" : "保存済み";',
  '      if (saveState) saveState.textContent = "保存済";',
  'compact homework save status',
);

const oldAsk = `async function askOutsideRange_() {\n  return new Promise((resolve) => {\n    const layer = document.createElement("div");\n    layer.className = "outsideConfirmLayer";\n    layer.innerHTML = '<div class="outsideConfirmBox"><span>⚠</span><h3>次回テスト範囲外です</h3><p>この単元は管理者が設定した次回テスト範囲の外です。それでも実際に進みましたか？</p><div><button class="primaryBtn" data-answer="yes">それでもすすみました</button><button class="ghostBtn" data-answer="no">いいえ</button></div></div>';\n    const finish = (value) => { layer.remove(); resolve(value); };\n    layer.querySelector('[data-answer="yes"]').onclick = () => finish(true);\n    layer.querySelector('[data-answer="no"]').onclick = () => finish(false);\n    document.body.appendChild(layer);\n  });\n}`;
const newAsk = `async function askOutsideRange_() {\n  return new Promise((resolve) => {\n    const dialog = document.createElement("dialog");\n    dialog.className = "outsideConfirmDialog";\n    dialog.innerHTML = '<div class="outsideConfirmBox"><span>⚠</span><h3>次回テスト範囲外です</h3><p>この単元は管理者が設定した次回テスト範囲の外です。それでも実際に進みましたか？</p><div><button class="primaryBtn" data-answer="yes">それでもすすみました</button><button class="ghostBtn" data-answer="no">いいえ</button></div></div>';\n    let finished = false;\n    const finish = (value) => {\n      if (finished) return;\n      finished = true;\n      try { if (dialog.open) dialog.close(); } catch {}\n      dialog.remove();\n      resolve(value);\n    };\n    dialog.querySelector('[data-answer="yes"]').onclick = () => finish(true);\n    dialog.querySelector('[data-answer="no"]').onclick = () => finish(false);\n    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });\n    dialog.addEventListener("click", (event) => { if (event.target === dialog) finish(false); });\n    document.body.appendChild(dialog);\n    try { dialog.showModal(); }\n    catch { dialog.setAttribute("open", ""); }\n  });\n}`;
app = replaceOnce(app, oldAsk, newAsk, 'outside range top-layer modal');

app = replaceOnce(
  app,
  '        const roundHtml = rounds.map((round) => `<label class="studentRoundCell"><span>${round.roundNumber}周目</span><input class="studentRoundInput" type="checkbox" data-round="${round.roundNumber}" data-outside="${effectiveOutside ? "true" : "false"}" ${round.completed ? "checked" : ""}><small data-round-date="${round.roundNumber}" data-saved="${round.completed ? esc(fmtShortDate(round.date)) : "未"}">${round.completed ? esc(fmtShortDate(round.date)) : "未"}</small></label>`).join("");',
  '        const roundHtml = rounds.map((round) => `<label class="studentRoundCell round${round.roundNumber}"><span>${round.roundNumber}周目</span><input class="studentRoundInput" type="checkbox" data-round="${round.roundNumber}" data-outside="${effectiveOutside ? "true" : "false"}" ${round.completed ? "checked" : ""}><small data-round-date="${round.roundNumber}" data-saved="${round.completed ? esc(fmtShortDate(round.date)) : "未"}">${round.completed ? esc(fmtShortDate(round.date)) : "未"}</small></label>`).join("");',
  'student round input classes',
);

const css = `\n\n/* 2026-08-23: compact homework, visible range confirmation, weighted rounds */\n.roundProgressLine.round1 i{height:14px}\n.roundProgressLine.round1 span,.roundProgressLine.round1 strong{font-size:.78rem}\n.roundProgressLine.round2 i,.roundProgressLine.round3 i{height:5px}\n.roundProgressLine.round2,.roundProgressLine.round3{opacity:.88;font-size:.66rem}\n.studentRoundCells{grid-template-columns:minmax(126px,1.45fr) 82px 82px!important;justify-content:start;max-width:350px;margin-right:auto}\n.studentRoundCell.round1{padding-inline:10px}\n.studentRoundCell.round2,.studentRoundCell.round3{grid-template-columns:1fr;justify-items:center;gap:2px;padding:5px 4px}\n.studentRoundCell.round2 span,.studentRoundCell.round3 span{font-size:.6rem}\n.studentRoundCell.round2 input,.studentRoundCell.round3 input{width:17px;height:17px}\n.studentRoundCell.round2 small,.studentRoundCell.round3 small{font-size:.56rem}\n.outsideConfirmDialog{border:0;padding:0;background:transparent;max-width:none;max-height:none}\n.outsideConfirmDialog::backdrop{background:rgba(14,31,28,.68);backdrop-filter:blur(3px)}\n.outsideConfirmDialog .outsideConfirmBox{margin:0}\n.studentHomeworkTasks{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}\n.studentHomeworkTask{grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;min-height:46px!important;padding:6px 8px!important;gap:7px!important}\n.studentHomeworkTask>strong{font-size:.68rem!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}\n.studentTaskRight{display:flex;align-items:center;justify-content:flex-end;gap:7px;white-space:nowrap}\n.studentTaskAction{gap:4px!important}\n.studentTaskAction input{width:17px!important;height:17px!important}\n.studentTaskAction b{font-size:.61rem!important}\n.homeworkSaveState{font-size:.56rem!important;white-space:nowrap}\n.studentHomeworkCard{padding:9px 10px!important;gap:9px!important}\n.studentHomeworkMeta{gap:3px!important}\n.studentHomeworkMeta>strong{font-size:.78rem!important}\n.studentHomeworkMeta>small{font-size:.61rem!important}\n@media(max-width:1050px){.studentHomeworkTasks{grid-template-columns:repeat(2,minmax(0,1fr))}.studentRoundCells{grid-template-columns:minmax(112px,1.35fr) 76px 76px!important;max-width:320px}}\n@media(max-width:700px){.studentHomeworkTasks{grid-template-columns:1fr}.studentRoundCells{grid-template-columns:minmax(108px,1fr) 72px 72px!important;max-width:100%}}\n`;
if (!styles.includes('2026-08-23: compact homework, visible range confirmation, weighted rounds')) styles += css;

index = index
  .replace('styles.css?v=20260823-fast-restore', 'styles.css?v=20260823-round-compact')
  .replace('app.js?v=20260823-fast-restore', 'app.js?v=20260823-round-compact');

if (!app.includes('outsideConfirmDialog')) throw new Error('visible range confirmation missing');
if (!app.includes('studentRoundCell round${round.roundNumber}')) throw new Error('round input classes missing');
if (app.includes('.slice(0, 6), "student"')) throw new Error('student homework is still limited to six items');
if (!styles.includes('.roundProgressLine.round1 i{height:14px}')) throw new Error('weighted graph CSS missing');
if (!styles.includes('grid-template-columns:repeat(3,minmax(0,1fr))')) throw new Error('compact homework grid missing');

fs.writeFileSync('app.js', app);
fs.writeFileSync('styles.css', styles);
fs.writeFileSync('index.html', index);
console.log('Applied compact homework and round UX update.');
