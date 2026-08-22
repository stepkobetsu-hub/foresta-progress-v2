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
  '      <article class="card span6"><p class="cardTitle">次回までの宿題</p><p><strong>宿題は2日以内に終わらせよう！</strong></p><div class="homeworkList">${homeworkHtml((data.homework || []).slice(0, 6), "student")}</div></article>\n      <article class="card span6"><p class="cardTitle">目標点</p>${targetForm(data.targets || {}, next?.testId)}</article>',
  '      <article class="card span12 studentHomeworkPanel"><p class="cardTitle">次回までの宿題</p><p><strong>宿題は2日以内に終わらせよう！</strong></p><div class="homeworkList">${homeworkHtml((data.homework || []).slice(0, 6), "student")}</div></article>\n      <article class="card span12 studentTargetPanel"><p class="cardTitle">目標点</p>${targetForm(data.targets || {}, next?.testId)}</article>',
  'student home homework/target layout',
);

app = replaceOnce(
  app,
  '    const tasks = group.items.map((item) => `<label class="studentHomeworkTask ${item.teacherChecked ? "confirmed" : ""}"><strong>${esc(item.contentText || item.contentType)}</strong><span class="studentTaskAction"><input class="homeworkCheck" type="checkbox" data-id="${esc(item.homeworkId)}" ${item.studentChecked ? "checked" : ""} ${item.teacherChecked ? "disabled" : ""}><b>${item.teacherChecked ? "確認済み" : "チェック"}</b></span>${item.studentChecked && !item.teacherChecked ? \'<small>先生の確認待ち</small>\' : ""}</label>`).join("");',
  '    const tasks = group.items.map((item) => `<label class="studentHomeworkTask ${item.teacherChecked ? "confirmed" : ""}"><strong>${esc(item.contentText || item.contentType)}</strong><span class="studentTaskAction"><input class="homeworkCheck" type="checkbox" data-id="${esc(item.homeworkId)}" ${item.studentChecked ? "checked" : ""} ${item.teacherChecked ? "disabled" : ""}><b>${item.teacherChecked ? "確認済み" : "チェック"}</b></span><small class="homeworkSaveState">${item.teacherChecked ? "講師確認済み" : item.studentChecked ? "保存済み・先生の確認待ち" : "変更すると自動保存"}</small></label>`).join("");',
  'student homework save state',
);

app = replaceOnce(
  app,
  'function bindHomeworkChecks() {\n  $("content").querySelectorAll(".homeworkCheck:not(:disabled)").forEach((input) => input.onchange = async () => {\n    input.disabled = true;\n    try { await api("studentCheckHomework", { homeworkId: input.dataset.id, checked: input.checked }); state.dashboard = null; await openView(state.activeView); }\n    catch (error) { input.checked = !input.checked; input.disabled = false; status(error.message, true); }\n  });\n}',
  `function bindHomeworkChecks() {\n  $("content").querySelectorAll(".homeworkCheck:not(:disabled)").forEach((input) => input.onchange = async () => {\n    const nextChecked = input.checked;\n    const item = input.closest(".studentHomeworkTask, .homeworkItem");\n    const saveState = item?.querySelector(".homeworkSaveState");\n    input.disabled = true;\n    if (saveState) saveState.textContent = "保存中…";\n    try {\n      await api("studentCheckHomework", { homeworkId: input.dataset.id, checked: nextChecked });\n      state.dashboard = null;\n      if (saveState) saveState.textContent = nextChecked ? "保存済み・先生の確認待ち" : "保存済み";\n      const actionLabel = item?.querySelector(".studentTaskAction b");\n      if (actionLabel) actionLabel.textContent = "チェック";\n      input.disabled = false;\n    } catch (error) {\n      input.checked = !nextChecked;\n      input.disabled = false;\n      if (saveState) saveState.textContent = "保存失敗・もう一度変更してください";\n      status(error.message, true);\n    }\n  });\n}`,
  'homework in-place autosave',
);

app = replaceOnce(
  app,
  'function targetForm(targets, testId) {\n  if (!testId) return \'<div class="emptyState">次回テスト未登録のため入力できません。</div>\';\n  return `<form id="targetForm"><div class="targetGrid">${SUBJECTS.map((subject) => `<label>${subject}<input name="${subject}" type="number" min="0" max="100" inputmode="numeric" value="${esc(targets[subject] ?? "")}"></label>`).join("")}</div><button class="primaryBtn" type="submit" style="margin-top:12px">目標点を保存</button></form>`;\n}\n\nfunction bindTargetForm(testId) {\n  const form = $("targetForm");\n  if (!form) return;\n  form.onsubmit = async (event) => {\n    event.preventDefault();\n    const values = Object.fromEntries(new FormData(form));\n    try { await api("saveTargets", { testId, values }); state.dashboard = null; status("目標点を保存しました。"); }\n    catch (error) { status(error.message, true); }\n  };\n}',
  `function targetForm(targets, testId) {\n  if (!testId) return '<div class="emptyState">次回テスト未登録のため入力できません。</div>';\n  return \`<form id="targetForm" class="autoSaveForm"><div class="targetGrid">\${SUBJECTS.map((subject) => \`<label>\${subject}<input name="\${subject}" type="number" min="0" max="100" inputmode="numeric" value="\${esc(targets[subject] ?? "")}"></label>\`).join("")}</div><p id="targetAutoSave" class="autoSaveHint" aria-live="polite">入力すると自動保存されます。</p></form>\`;\n}\n\nfunction bindTargetForm(testId) {\n  const form = $("targetForm");\n  if (!form) return;\n  const hint = $("targetAutoSave");\n  let saveTimer = 0;\n  let saving = false;\n  let saveAgain = false;\n\n  const saveNow = async () => {\n    clearTimeout(saveTimer);\n    if (saving) { saveAgain = true; return; }\n    const invalid = [...form.querySelectorAll("input")].find((input) => input.value !== "" && !input.checkValidity());\n    if (invalid) { if (hint) hint.textContent = "0〜100で入力してください。"; return; }\n    saving = true;\n    saveAgain = false;\n    const values = Object.fromEntries(new FormData(form));\n    if (hint) hint.textContent = "自動保存中…";\n    try {\n      await api("saveTargets", { testId, values }, { silent: true });\n      state.dashboard = null;\n      if (hint) hint.textContent = "✓ 自動保存済み";\n    } catch (error) {\n      if (hint) hint.textContent = "保存できませんでした。入力を確認してください。";\n      status(error.message, true);\n    } finally {\n      saving = false;\n      if (saveAgain) { saveAgain = false; saveTimer = setTimeout(saveNow, 80); }\n    }\n  };\n\n  const scheduleSave = (delay = 520) => {\n    clearTimeout(saveTimer);\n    if (hint) hint.textContent = "自動保存待ち…";\n    saveTimer = setTimeout(saveNow, delay);\n  };\n\n  form.querySelectorAll("input").forEach((input) => {\n    input.addEventListener("input", () => scheduleSave(520));\n    input.addEventListener("change", () => scheduleSave(120));\n  });\n  form.onsubmit = (event) => { event.preventDefault(); saveNow(); };\n}`,
  'target score autosave',
);

const css = `\n\n/* 2026-08-23: student homework layout + spreadsheet-like autosave */\n.studentHomeworkPanel{overflow:hidden}\n.studentHomeworkPanel .studentHomeworkCard{grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);width:100%;min-width:0}\n.studentHomeworkPanel .studentHomeworkMeta,.studentHomeworkPanel .studentHomeworkTasks,.studentHomeworkPanel .studentHomeworkTask{min-width:0}\n.studentHomeworkPanel .studentHomeworkTask strong{overflow-wrap:anywhere;word-break:normal}\n.studentTargetPanel{width:min(520px,100%);justify-self:start;align-self:start;padding:14px 16px}\n.studentTargetPanel .cardTitle{margin-bottom:7px}\n.studentTargetPanel .targetGrid{gap:6px}\n.studentTargetPanel .targetGrid input{padding:8px}\n.autoSaveHint{margin:8px 0 0;color:var(--muted);font-size:.7rem;font-weight:800}\n.homeworkSaveState{color:var(--muted)!important;font-size:.62rem!important}\n@media(max-width:1050px){.studentHomeworkPanel .studentHomeworkCard{grid-template-columns:1fr}.studentHomeworkPanel .studentHomeworkTasks{grid-template-columns:repeat(2,minmax(0,1fr))}}\n@media(max-width:620px){.studentTargetPanel{width:100%}.studentHomeworkPanel .studentHomeworkTasks{grid-template-columns:1fr}}\n`;
if (!styles.includes('2026-08-23: student homework layout + spreadsheet-like autosave')) styles += css;

index = index
  .replace('styles.css?v=20260823-rounds', 'styles.css?v=20260823-autosave-layout')
  .replace('app.js?v=20260823-rounds', 'app.js?v=20260823-autosave-layout');

if (!app.includes('✓ 自動保存済み')) throw new Error('target autosave marker missing');
if (!app.includes('studentHomeworkPanel')) throw new Error('homework layout marker missing');
if (!styles.includes('.studentTargetPanel')) throw new Error('target compact CSS missing');

fs.writeFileSync('app.js', app);
fs.writeFileSync('styles.css', styles);
fs.writeFileSync('index.html', index);
console.log('Applied student layout and autosave update.');
