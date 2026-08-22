import fs from 'node:fs';

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Patch point not found: ${label}`);
  return text.replace(from, to);
}

let index = fs.readFileSync('index.html', 'utf8');
index = replaceOnce(
  index,
  'フォレスタ＆ゴールへ ↗',
  'ステップ＆ゴールへ ↗',
  'top-right Step & Goal link label',
);
index = replaceOnce(
  index,
  '<div class="devicePrompt">\n          <p>この端末はどちらですか？</p>',
  '<div id="devicePrompt" class="devicePrompt">\n          <p class="devicePromptTitle">この端末はどちらですか？ <strong class="deviceRequired">必須</strong></p>\n          <p id="devicePromptWarning" class="devicePromptWarning">⚠ 先に「自分の端末」か「塾の共用端末」を選んでください。</p>',
  'device prompt warning',
);
index = index
  .replace('styles.css?v=20260815-lesson-correction', 'styles.css?v=20260822-usability')
  .replace('app.js?v=20260815-japanese-progress', 'app.js?v=20260822-usability');

let app = fs.readFileSync('app.js', 'utf8');
app = replaceOnce(
  app,
  '  dashboard: null,\n};',
  '  dashboard: null,\n  progressionCache: new Map(),\n  progressionPromises: new Map(),\n};',
  'progression cache state',
);

app = replaceOnce(
  app,
  'let teacherSearchTimer = 0;\n\nasync function api(action, payload = {}, { silent = false } = {}) {',
  `let teacherSearchTimer = 0;\nconst PROGRESSION_CACHE_TTL_MS = 120000;\n\nfunction progressionCacheKey(options = {}) {\n  if (options.mode === "range") return ["range", options.school || "", options.grade || "", options.subject || "", options.testId || "", options.rangeType || ""].join("|");\n  const studentId = options.studentId || state.dashboard?.student?.studentId || state.session?.studentId || state.session?.loginId || "self";\n  return ["progress", studentId, options.subject || ""].join("|");\n}\n\nfunction readProgressionCache(options) {\n  const entry = state.progressionCache.get(progressionCacheKey(options));\n  if (!entry || Date.now() - entry.savedAt > PROGRESSION_CACHE_TTL_MS) return null;\n  return entry.data;\n}\n\nfunction writeProgressionCache(options, data) {\n  state.progressionCache.set(progressionCacheKey(options), { data, savedAt: Date.now() });\n  return data;\n}\n\nfunction invalidateProgressionCache(options = {}) {\n  const key = progressionCacheKey(options);\n  state.progressionCache.delete(key);\n  state.progressionPromises.delete(key);\n}\n\nasync function loadProgression(options, { force = false } = {}) {\n  const key = progressionCacheKey(options);\n  if (!force) {\n    const cached = readProgressionCache(options);\n    if (cached) return cached;\n    if (state.progressionPromises.has(key)) return state.progressionPromises.get(key);\n  }\n  const action = options.mode === "range" ? "getRangeEditor" : "getProgression";\n  const request = api(action, options, { silent: true })\n    .then((data) => writeProgressionCache(options, data))\n    .finally(() => state.progressionPromises.delete(key));\n  state.progressionPromises.set(key, request);\n  return request;\n}\n\nfunction prefetchProgression(options) {\n  loadProgression(options).catch(() => {});\n}\n\nasync function api(action, payload = {}, { silent = false } = {}) {`,
  'progression cache helpers',
);

app = replaceOnce(
  app,
  'async function renderStudent(view) {\n  const data = await api("getStudentDashboard");\n  state.dashboard = data;',
  'async function renderStudent(view) {\n  const data = state.dashboard || await api("getStudentDashboard");\n  state.dashboard = data;',
  'student dashboard session cache',
);

app = replaceOnce(
  app,
  '  $("content").querySelectorAll(".progressionButton").forEach((button) => button.onclick = () => openProgress({ subject: button.dataset.subject, mode: "view" }));',
  `  $("content").querySelectorAll(".progressionButton").forEach((button) => {\n    const options = { subject: button.dataset.subject, mode: "view" };\n    button.onclick = () => openProgress(options);\n    button.onpointerenter = () => prefetchProgression(options);\n    button.onfocus = () => prefetchProgression(options);\n  });\n  TRACKED_SUBJECTS.forEach((subject, index) => setTimeout(() => prefetchProgression({ subject, mode: "view" }), index * 120));`,
  'student progression prefetch',
);

app = replaceOnce(
  app,
  '    try { await api("studentCheckHomework", { homeworkId: input.dataset.id, checked: input.checked }); await openView(state.activeView); }',
  '    try { await api("studentCheckHomework", { homeworkId: input.dataset.id, checked: input.checked }); state.dashboard = null; await openView(state.activeView); }',
  'student homework cache invalidation',
);

app = replaceOnce(
  app,
  '    try { await api("saveTargets", { testId, values }); status("目標点を保存しました。"); }',
  '    try { await api("saveTargets", { testId, values }); state.dashboard = null; status("目標点を保存しました。"); }',
  'target score cache invalidation',
);

app = replaceOnce(
  app,
  'function activateTeacherStudent(studentId) {\n  state.activeStudentId = String(studentId);\n  state.activeView = "selected";\n  renderShell();\n  return renderTeacherStudent(state.activeStudentId);\n}',
  `function activateTeacherStudent(studentId) {\n  state.activeStudentId = String(studentId);\n  state.activeView = "selected";\n  renderShell();\n  return renderTeacherStudent(state.activeStudentId).then(() => {\n    const button = $("inputLesson");\n    if (button) button.click();\n  });\n}`,
  'teacher tab opens progression',
);

app = replaceOnce(
  app,
  '  $("inputLesson").onclick = () => openProgress({ subject: $("lessonSubject").value, mode: "lesson", studentId, teacherId: $("lessonTeacher").value });\n  $("correctLesson").onclick = () => openLessonCorrection(studentId);',
  `  const prefetchCurrentProgression = () => prefetchProgression({ subject: $("lessonSubject").value, mode: "lesson", studentId });\n  $("lessonSubject").onchange = prefetchCurrentProgression;\n  prefetchCurrentProgression();\n  $("inputLesson").onclick = () => openProgress({ subject: $("lessonSubject").value, mode: "lesson", studentId, teacherId: $("lessonTeacher").value });\n  $("correctLesson").onclick = () => openLessonCorrection(studentId);`,
  'teacher progression prefetch',
);

app = replaceOnce(
  app,
  'async function openProgress(options) {\n  showModal(\'<div class="loadingCard"><span class="spinner"></span><p>進行表を読み込み中です…</p></div>\');\n  try {\n    const data = await api(options.mode === "range" ? "getRangeEditor" : "getProgression", options, { silent: true });',
  `async function openProgress(options) {\n  const cachedProgression = options.mode === "correction" ? null : readProgressionCache(options);\n  showModal(cachedProgression ? '<div class="loadingCard fastLoad"><span class="spinner"></span><p>進行表を表示しています…</p></div>' : '<div class="loadingCard"><span class="spinner"></span><p>進行表を読み込み中です…</p></div>');\n  try {\n    const data = options.mode === "correction"\n      ? await loadProgression(options, { force: true })\n      : cachedProgression || await loadProgression(options);`,
  'open progression from cache',
);

const oldUnitRow = '      return `${groupHeader}<label class="unitRow ${classes} ${selected.has(u.unitId) ? "todaySelected" : ""}" data-unit="${esc(u.unitId)}"><input class="unitCheck" type="checkbox" value="${esc(u.unitId)}" data-chapter="${esc(chapter)}" ${editable && !rangeLocked ? "" : "disabled"} ${selected.has(u.unitId) ? "checked" : ""}><span class="unitNumber">${esc(displayNumber)}</span><span class="unitName"><strong>${esc(u.unitName)}</strong>${details ? `<br><small>${esc(details)}</small>` : ""}</span><span class="unitMeta">${dateHistory}${todayButton}${schoolButton}${options.subject !== "国語" && u.ctResult ? `<button type="button" class="ctButton" data-unit="${esc(u.unitId)}">CT ${esc(u.ctResult)}</button>` : options.subject !== "国語" && u.previous && options.mode === "lesson" ? `<button type="button" class="ctButton" data-unit="${esc(u.unitId)}">CTを登録</button>` : ""}</span></label>`;';
const newUnitRow = '      const checkHtml = options.mode === "range" ? `<span class="rangeCheckCell"><small>${options.rangeType === "決定" ? "決定範囲" : "予想範囲"}</small><input class="unitCheck" type="checkbox" value="${esc(u.unitId)}" data-chapter="${esc(chapter)}" ${editable && !rangeLocked ? "" : "disabled"} ${selected.has(u.unitId) ? "checked" : ""}></span>` : `<input class="unitCheck" type="checkbox" value="${esc(u.unitId)}" data-chapter="${esc(chapter)}" ${editable && !rangeLocked ? "" : "disabled"} ${selected.has(u.unitId) ? "checked" : ""}>`;\n      return `${groupHeader}<label class="unitRow ${classes} ${selected.has(u.unitId) ? "todaySelected" : ""} ${options.mode === "range" ? "rangeSelectable" : ""}" data-unit="${esc(u.unitId)}">${checkHtml}<span class="unitNumber">${esc(displayNumber)}</span><span class="unitName">${details ? `<small class="unitPrefix">${esc(details)}</small>` : ""}<strong>${esc(u.unitName)}</strong></span><span class="unitMeta">${dateHistory}${todayButton}${schoolButton}${options.subject !== "国語" && u.ctResult ? `<button type="button" class="ctButton" data-unit="${esc(u.unitId)}">CT ${esc(u.ctResult)}</button>` : options.subject !== "国語" && u.previous && options.mode === "lesson" ? `<button type="button" class="ctButton" data-unit="${esc(u.unitId)}">CTを登録</button>` : ""}</span></label>`;';
app = replaceOnce(app, oldUnitRow, newUnitRow, 'unit metadata inline and range checkbox label');

app = replaceOnce(
  app,
  '      : \'<button id="saveRange" class="primaryBtn">選択範囲を保存</button>\';',
  '      : \'<span class="toolbarHint">チェック変更は自動保存されます。</span><span id="rangeAutoSave" class="rangeAutoSave">すべて保存済み</span><button id="saveRange" class="ghostBtn compactManualSave" type="button">今すぐ保存</button>\';',
  'range autosave toolbar',
);

app = replaceOnce(
  app,
  '    const checks = [...$("modalBody").querySelectorAll(".unitCheck:not(:disabled)")];\n    const groupToggles = [...$("modalBody").querySelectorAll(".chapterToggle")];\n    const updateGroupToggles = () => groupToggles.forEach((toggle) => {',
  `    const checks = [...$("modalBody").querySelectorAll(".unitCheck:not(:disabled)")];\n    const groupToggles = [...$("modalBody").querySelectorAll(".chapterToggle")];\n    const rangeMode = options.mode === "range";\n    let rangeSaveTimer = 0;\n    let rangeSaving = false;\n    let rangeDirty = false;\n    const rangeStatus = () => $("rangeAutoSave");\n    const saveRangeSelection = async () => {\n      if (!rangeMode) return;\n      if (rangeSaving) { rangeDirty = true; return; }\n      clearTimeout(rangeSaveTimer);\n      rangeSaving = true;\n      rangeDirty = false;\n      const unitIds = checks.filter((c) => c.checked).map((c) => c.value);\n      if (rangeStatus()) rangeStatus().textContent = "自動保存中…";\n      try {\n        await api("saveRange", { ...options, unitIds }, { silent: true });\n        invalidateProgressionCache(options);\n        if (rangeStatus()) rangeStatus().textContent = "自動保存済み";\n      } catch (error) {\n        if (rangeStatus()) rangeStatus().textContent = "保存失敗・再試行してください";\n        status(error.message, true);\n      } finally {\n        rangeSaving = false;\n        if (rangeDirty) {\n          rangeDirty = false;\n          rangeSaveTimer = setTimeout(saveRangeSelection, 80);\n        }\n      }\n    };\n    const scheduleRangeSave = () => {\n      if (!rangeMode) return;\n      rangeDirty = true;\n      clearTimeout(rangeSaveTimer);\n      if (rangeStatus()) rangeStatus().textContent = "自動保存待ち…";\n      rangeSaveTimer = setTimeout(() => { rangeDirty = false; saveRangeSelection(); }, 450);\n    };\n    const updateGroupToggles = () => groupToggles.forEach((toggle) => {`,
  'range autosave queue',
);

app = replaceOnce(
  app,
  '    checks.forEach((c) => c.onchange = count); count();\n    if ($("selectAll")) $("selectAll").onclick = () => { checks.forEach((c) => c.checked = true); count(); };\n    if ($("clearAll")) $("clearAll").onclick = () => { checks.forEach((c) => c.checked = false); count(); };\n    groupToggles.forEach((toggle) => toggle.onchange = () => { checks.filter((check) => check.dataset.chapter === toggle.dataset.chapter).forEach((check) => check.checked = toggle.checked); count(); });',
  '    checks.forEach((c) => c.onchange = () => { count(); scheduleRangeSave(); }); count();\n    if ($("selectAll")) $("selectAll").onclick = () => { checks.forEach((c) => c.checked = true); count(); scheduleRangeSave(); };\n    if ($("clearAll")) $("clearAll").onclick = () => { checks.forEach((c) => c.checked = false); count(); scheduleRangeSave(); };\n    groupToggles.forEach((toggle) => toggle.onchange = () => { checks.filter((check) => check.dataset.chapter === toggle.dataset.chapter).forEach((check) => check.checked = toggle.checked); count(); scheduleRangeSave(); });',
  'range autosave event bindings',
);

app = replaceOnce(
  app,
  '    if ($("saveRange")) $("saveRange").onclick = async () => { const unitIds = checks.filter((c) => c.checked).map((c) => c.value); if (!confirm(`${unitIds.length}単元を${options.rangeType}範囲として保存します。よろしいですか？`)) return; try { await api("saveRange", { ...options, unitIds }); closeModal(); status("学校別テスト範囲を保存しました。"); } catch (error) { status(error.message, true); } };',
  '    if ($("saveRange")) $("saveRange").onclick = () => saveRangeSelection();',
  'manual range save fallback',
);

app = replaceOnce(
  app,
  '        const result = await api("saveSchoolPosition", { studentId: options.studentId, subject: options.subject, unitId: button.dataset.unit, recordedDate }, { silent: true });',
  '        const result = await api("saveSchoolPosition", { studentId: options.studentId, subject: options.subject, unitId: button.dataset.unit, recordedDate }, { silent: true });\n        invalidateProgressionCache(options);',
  'school position progression cache invalidation',
);

app = replaceOnce(
  app,
  '    await api(correcting ? "updateLessonCorrection" : "saveLesson", { studentId: options.studentId, subject: options.subject, lessonId: options.lessonId, teacherId: options.teacherId, unitIds: options.unitIds, homeworkByUnit, idempotencyKey: options.idempotencyKey });\n    delete state.teacherStudentCache[String(options.studentId)];',
  '    await api(correcting ? "updateLessonCorrection" : "saveLesson", { studentId: options.studentId, subject: options.subject, lessonId: options.lessonId, teacherId: options.teacherId, unitIds: options.unitIds, homeworkByUnit, idempotencyKey: options.idempotencyKey });\n    invalidateProgressionCache(options);\n    delete state.teacherStudentCache[String(options.studentId)];',
  'lesson progression cache invalidation',
);

app = replaceOnce(
  app,
  '  $("modalBody").querySelectorAll(".ctResult").forEach((button) => button.onclick = async () => { try { await api("saveCt", { studentId: options.studentId, subject: options.subject, unitId, result: button.dataset.result, idempotencyKey: crypto.randomUUID() }); closeModal(); status("CT結果を登録しました。"); } catch (error) { status(error.message, true); } });',
  '  $("modalBody").querySelectorAll(".ctResult").forEach((button) => button.onclick = async () => { try { await api("saveCt", { studentId: options.studentId, subject: options.subject, unitId, result: button.dataset.result, idempotencyKey: crypto.randomUUID() }); invalidateProgressionCache(options); closeModal(); status("CT結果を登録しました。"); } catch (error) { status(error.message, true); } });',
  'CT progression cache invalidation',
);

app = replaceOnce(
  app,
  '  if (!state.device) return $("loginMessage").textContent = "端末の種類を選択してください。";',
  '  if (!state.device) {\n    $("loginMessage").textContent = "⚠ 端末の種類が未選択です。先に「自分の端末」か「塾の共用端末」を選んでください。";\n    $("devicePrompt")?.classList.add("needsChoice");\n    document.querySelector(".deviceChoice")?.focus();\n    $("devicePrompt")?.scrollIntoView({ behavior: "smooth", block: "center" });\n    return;\n  }',
  'device missing login validation',
);

app = replaceOnce(
  app,
  'document.querySelectorAll(".deviceChoice").forEach((button) => button.onclick = () => {\n  state.device = button.dataset.device;\n  document.querySelectorAll(".deviceChoice").forEach((item) => item.classList.toggle("selected", item === button));\n  $("rememberRow").classList.toggle("hidden", state.device !== "personal");\n  if (state.device === "shared") $("rememberLogin").checked = false;\n});',
  `document.querySelectorAll(".deviceChoice").forEach((button) => button.onclick = () => {\n  state.device = button.dataset.device;\n  document.querySelectorAll(".deviceChoice").forEach((item) => item.classList.toggle("selected", item === button));\n  $("devicePrompt")?.classList.remove("needsChoice");\n  $("devicePrompt")?.classList.add("selectedDevice");\n  if ($("devicePromptWarning")) $("devicePromptWarning").textContent = state.device === "personal" ? "✓ 自分の端末を選択済み" : "✓ 塾の共用端末を選択済み";\n  $("loginMessage").textContent = "";\n  $("rememberRow").classList.toggle("hidden", state.device !== "personal");\n  if (state.device === "shared") $("rememberLogin").checked = false;\n});`,
  'device selection feedback',
);

let styles = fs.readFileSync('styles.css', 'utf8');
const usabilityCss = `\n\n/* 2026-08-22: progress usability, range autosave, and explicit device selection */\n.devicePrompt{border:2px solid #f4bf50;background:#fffaf0;border-radius:16px;padding:14px 15px;transition:border-color .18s,background .18s,box-shadow .18s}\n.devicePromptTitle{display:flex;align-items:center;gap:8px;margin:0 0 6px!important}\n.deviceRequired{display:inline-flex;align-items:center;border-radius:999px;background:#b91c1c;color:#fff;padding:2px 7px;font-size:.68rem;letter-spacing:.04em}\n.devicePromptWarning{margin:0 0 10px!important;color:#9a5b00;font-size:.78rem;font-weight:900;line-height:1.5}\n.devicePrompt.selectedDevice{border-color:#65b9a7;background:#f0fbf7}\n.devicePrompt.selectedDevice .devicePromptWarning{color:#0f766e}\n.devicePrompt.needsChoice{border-color:#dc2626;background:#fff1f2;box-shadow:0 0 0 4px rgba(220,38,38,.12);animation:deviceAttention .65s ease-in-out 2}\n.devicePrompt.needsChoice .devicePromptWarning{color:#b91c1c}\n@keyframes deviceAttention{0%,100%{transform:translateX(0)}30%{transform:translateX(-4px)}70%{transform:translateX(4px)}}\n\n.unitName{display:flex;align-items:baseline;gap:7px;min-width:0;line-height:1.35}\n.unitName>br{display:none}\n.unitName strong{min-width:0;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}\n.unitPrefix{order:-1;flex:0 0 auto;color:var(--muted);font-size:.72rem;font-weight:700;white-space:nowrap}\n.unitRow.rangeSelectable{grid-template-columns:70px minmax(260px,1fr) auto 86px}\n.unitRow.rangeSelectable>.unitNumber{grid-column:1;grid-row:1}\n.unitRow.rangeSelectable>.unitName{grid-column:2;grid-row:1}\n.unitRow.rangeSelectable>.unitMeta{grid-column:3;grid-row:1}\n.rangeCheckCell{grid-column:4;grid-row:1;display:grid;justify-items:center;gap:3px;align-self:stretch;align-content:center;padding:3px 6px;border-left:1px solid var(--line);color:var(--forest2);font-weight:900}\n.rangeCheckCell small{font-size:.64rem;white-space:nowrap}\n.rangeCheckCell .unitCheck{width:22px;height:22px;margin:0}\n.rangeAutoSave{display:inline-flex;align-items:center;min-height:32px;border-radius:999px;background:#e7f8f1;color:#0f766e;padding:5px 10px;font-size:.72rem;font-weight:900}\n.compactManualSave{padding:8px 11px;font-size:.74rem}\n.fastLoad{min-height:90px}\n@media(max-width:860px){\n  .unitRow.rangeSelectable{grid-template-columns:60px minmax(0,1fr) 86px}\n  .unitRow.rangeSelectable>.unitNumber{grid-column:1}\n  .unitRow.rangeSelectable>.unitName{grid-column:2}\n  .unitRow.rangeSelectable>.rangeCheckCell{grid-column:3}\n  .unitRow.rangeSelectable>.unitMeta{grid-column:1/4;grid-row:2;justify-content:flex-start}\n}\n@media(max-width:560px){\n  .unitName{gap:5px}\n  .unitPrefix{font-size:.67rem}\n  .unitName strong{-webkit-line-clamp:2}\n  .rangeCheckCell{padding-inline:3px}\n  .rangeCheckCell small{font-size:.6rem}\n}\n`;
if (!styles.includes('2026-08-22: progress usability')) styles += usabilityCss;

for (const [name, text] of [['index.html', index], ['app.js', app], ['styles.css', styles]]) {
  if (text.includes('フォレスタ＆ゴールへ ↗')) throw new Error(`${name}: old top-right label remains`);
}
if (!index.includes('ステップ＆ゴールへ ↗')) throw new Error('index: new top-right label missing');
if (!index.includes('devicePromptWarning')) throw new Error('index: device warning missing');
if (!app.includes('自動保存済み')) throw new Error('app: range autosave missing');
if (!app.includes('rangeCheckCell')) throw new Error('app: range checkbox label missing');
if (!app.includes('progressionCache')) throw new Error('app: progression cache missing');
if (!styles.includes('.unitPrefix')) throw new Error('styles: inline unit prefix CSS missing');

fs.writeFileSync('index.html', index);
fs.writeFileSync('app.js', app);
fs.writeFileSync('styles.css', styles);
console.log('Applied 2026-08-22 usability update.');
