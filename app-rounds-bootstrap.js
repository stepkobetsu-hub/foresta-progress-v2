const originalUrl = new URL('./app.js?v=20260822-usability', import.meta.url);
const configUrl = new URL('./config.js', import.meta.url).href;
const domainUrl = new URL('./domain.js', import.meta.url).href;

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`rounds patch point missing: ${label}`);
  return source.replace(before, after);
}

function subjectHelpersSource() {
  return `
function subjectProgressClass(subject) {
  return ({ 英語: "english", 数学: "math", 国語: "japanese" })[subject] || "other";
}
function mappedRoundWidth(percent) {
  const value = Math.max(0, Math.min(300, Number(percent || 0)));
  if (value <= 100) return value * 0.7;
  if (value <= 200) return 70 + (value - 100) * 0.15;
  return 85 + (value - 200) * 0.15;
}
function studentRoundProgressHtml(data) {
  const rows = (data.progress || []).filter((row) => row.roundProgress && Number(row.roundProgress.targetCount) > 0);
  if (!rows.length) return "";
  const totalTarget = rows.reduce((sum, row) => sum + Number(row.roundProgress.targetCount || 0), 0);
  const roundCounts = [1,2,3].map((round) => rows.reduce((sum, row) => sum + Number(row.roundProgress.roundCounts?.[round] || 0), 0));
  const totalDone = roundCounts.reduce((sum, value) => sum + value, 0);
  const overallPercent = totalTarget ? Math.round(totalDone / totalTarget * 100) : 0;
  const roundBars = roundCounts.map((count,index) => {
    const value = totalTarget ? Math.round(count / totalTarget * 100) : 0;
    return \`<div class="roundProgressLine"><span>\${index+1}周目</span><i><b style="width:\${Math.min(100,value)}%"></b></i><strong>\${value}%</strong></div>\`;
  }).join("");
  const subjectBars = rows.map((row) => {
    const target = Number(row.roundProgress.targetCount || 0);
    const done = [1,2,3].reduce((sum,round) => sum + Number(row.roundProgress.roundCounts?.[round] || 0), 0);
    const value = target ? Math.round(done / target * 100) : 0;
    return \`<div class="subjectRoundBar \${subjectProgressClass(row.subject)}"><span>\${esc(row.subject)}</span><i><em style="width:\${mappedRoundWidth(value)}%"></em><u>1周目ゴール</u></i><strong>\${value}%</strong></div>\`;
  }).join("");
  return \`<section class="roundProgressHero"><div class="roundScore"><small>3周合計</small><strong>\${overallPercent}%</strong><span>(\${totalDone}/\${totalTarget})</span></div><div class="roundProgressBody"><div class="roundProgressLines">\${roundBars}</div><div class="subjectRoundBars">\${subjectBars}</div><p class="roundProgressGuide">100％で1周目達成。70％位置を1周目ゴールとして、その先に2周目・3周目を積み上げます。</p></div></section>\`;
}
function studentHomeworkCardsHtml(items) {
  if (!items.length) return '<div class="emptyState">現在の宿題はありません。</div>';
  const groups = new Map();
  items.forEach((item) => {
    const key = [item.lessonId || "", item.unitId || "", item.recommendedDueDate || ""].join("|");
    if (!groups.has(key)) groups.set(key, { items: [], subject:item.subject||"", unitNumber:item.unitNumber||"", unitName:item.unitName||"", roundNumber:item.roundNumber||"", createdAt:item.createdAt||"", due:item.recommendedDueDate||"" });
    groups.get(key).items.push(item);
  });
  return [...groups.values()].map((group) => {
    const subject = group.subject || "宿題";
    const tasks = group.items.map((item) => \`<label class="studentHomeworkTask \${item.teacherChecked ? "confirmed" : ""}"><strong>\${esc(item.contentText || item.contentType)}</strong><span class="studentTaskAction"><input class="homeworkCheck" type="checkbox" data-id="\${esc(item.homeworkId)}" \${item.studentChecked ? "checked" : ""} \${item.teacherChecked ? "disabled" : ""}><b>\${item.teacherChecked ? "確認済み" : "チェック"}</b></span>\${item.studentChecked && !item.teacherChecked ? '<small>先生の確認待ち</small>' : ""}</label>\`).join("");
    return \`<article class="studentHomeworkCard \${subjectProgressClass(subject)}"><div class="studentHomeworkMeta"><div><span class="subjectPill">\${esc(subject)}</span>\${group.roundNumber ? \`<span class="roundPill">\${esc(group.roundNumber)}周目</span>\` : ""}</div><strong>\${esc([group.unitNumber,group.unitName].filter(Boolean).join(" ") || "宿題")}</strong><small>宿題 \${fmtShortDate(group.createdAt)}　期限 \${fmtShortDate(group.due)}</small></div><div class="studentHomeworkTasks">\${tasks}</div></article>\`;
  }).join("");
}
async function askOutsideRange_() {
  return new Promise((resolve) => {
    const layer = document.createElement("div");
    layer.className = "outsideConfirmLayer";
    layer.innerHTML = '<div class="outsideConfirmBox"><span>⚠</span><h3>次回テスト範囲外です</h3><p>この単元は管理者が設定した次回テスト範囲の外です。それでも実際に進みましたか？</p><div><button class="primaryBtn" data-answer="yes">それでもすすみました</button><button class="ghostBtn" data-answer="no">いいえ</button></div></div>';
    const done = (value) => { layer.remove(); resolve(value); };
    layer.querySelector('[data-answer="yes"]').onclick = () => done(true);
    layer.querySelector('[data-answer="no"]').onclick = () => done(false);
    document.body.appendChild(layer);
  });
}
async function bindStudentRoundInputs_(options) {
  const inputs = [...$("modalBody").querySelectorAll(".studentRoundInput")];
  inputs.forEach((input) => input.onchange = async () => {
    const row = input.closest(".studentRoundRow");
    const roundNumber = Number(input.dataset.round);
    const nextChecked = input.checked;
    if (nextChecked && roundNumber > 1) {
      const previous = row.querySelector(\`.studentRoundInput[data-round="\${roundNumber-1}"]\`);
      if (previous && !previous.checked) { input.checked = false; status(\`先に\${roundNumber-1}周目を完了してください。\`, true); return; }
    }
    if (!nextChecked && roundNumber < 3) {
      const later = [...row.querySelectorAll(".studentRoundInput")].some((item) => Number(item.dataset.round) > roundNumber && item.checked);
      if (later) { input.checked = true; status("後の周回を先に取り消してください。", true); return; }
    }
    let outsideRangeOverride = false;
    if (nextChecked && input.dataset.outside === "true") {
      input.checked = false;
      outsideRangeOverride = await askOutsideRange_();
      if (!outsideRangeOverride) return;
      input.checked = true;
    }
    const date = row.querySelector(\`[data-round-date="\${roundNumber}"]\`);
    input.disabled = true;
    if (date) date.textContent = nextChecked ? "保存中…" : "取消中…";
    try {
      const result = await api("saveStudentRoundProgress", { subject:options.subject, unitId:row.dataset.unit, roundNumber, checked:nextChecked, outsideRangeOverride, idempotencyKey:crypto.randomUUID() }, { silent:true });
      (result.rounds || []).forEach((round) => {
        const target = row.querySelector(\`.studentRoundInput[data-round="\${round.roundNumber}"]\`);
        const targetDate = row.querySelector(\`[data-round-date="\${round.roundNumber}"]\`);
        if (target) target.checked = !!round.completed;
        if (targetDate) targetDate.textContent = round.completed ? fmtShortDate(round.date) : "未";
      });
      invalidateProgressionCache(options);
      state.dashboard = null;
      $("modal").dataset.refreshStudent = "true";
      status(nextChecked ? \`\${roundNumber}周目を保存しました。宿題も更新しました。\` : \`\${roundNumber}周目を取り消しました。\`);
    } catch (error) {
      input.checked = !nextChecked;
      if (date) date.textContent = input.checked ? (date.dataset.saved || "済") : "未";
      status(error.message, true);
    } finally { input.disabled = false; }
  });
}
`;
}

async function boot() {
  try {
    let code = await fetch(originalUrl, { cache: 'no-store' }).then((response) => {
      if (!response.ok) throw new Error(`app fetch failed: ${response.status}`);
      return response.text();
    });
    code = code
      .replace('from "./config.js"', `from "${configUrl}"`)
      .replace('from "./domain.js"', `from "${domainUrl}"`);

    code = replaceOnce(code,
`const DEFAULT_HOMEWORK = {
  数学: ["TRYの赤×直し", "exercise", "宿題の赤×直し"],
  英語: ["KeyWords「☆日→英」暗記", "exercise「暗記マーク」暗記", "Try赤×直し", "exercise", "宿題の赤×直し"],
};`,
`const DEFAULT_HOMEWORK = {
  数学: ["TRYの赤×直し", "exercise", "宿題の赤×直し"],
  英語: ["KeyWords「☆日→英」暗記", "exercise「暗記マーク」暗記", "Try赤×直し", "exercise", "宿題の赤×直し"],
};
const REPEAT_HOMEWORK = {
  数学: ["TRYの赤×直し", "エクササイズの赤×直し"],
  英語: ["KEYWORDSの暗記", "TRYの赤×直し", "エクササイズの赤×直し"],
};`, 'repeat homework');

    code = replaceOnce(code,
`function renderShell() {
  $("loginView").classList.add("hidden");`,
`function renderShell() {
  $("topAdminEntry")?.classList.add("hidden");
  $("loginView").classList.add("hidden");`, 'hide top admin');

    code = replaceOnce(code,
`function metricCard(title, value, sub = "", tone = "") {
  return \`<article class="card span4 \${tone}"><p class="cardTitle">\${esc(title)}</p><div class="bigValue">\${esc(value)}</div>\${sub ? \`<p class="muted">\${esc(sub)}</p>\` : ""}</article>\`;
}
`,
`function metricCard(title, value, sub = "", tone = "") {
  return \`<article class="card span4 \${tone}"><p class="cardTitle">\${esc(title)}</p><div class="bigValue">\${esc(value)}</div>\${sub ? \`<p class="muted">\${esc(sub)}</p>\` : ""}</article>\`;
}
${subjectHelpersSource()}`, 'helpers');

    code = replaceOnce(code,
`    <header class="pageHead"><div><h1>\${esc(data.student.name)}さんの進捗</h1><p>\${esc(data.student.school || "学校未登録")} / \${esc(data.student.grade)}</p></div><div class="actionRow">\${TRACKED_SUBJECTS.map((s) => \`<button class="secondaryBtn progressionButton" data-subject="\${s}">\${s}の進行表を見る</button>\`).join("")}</div></header>
    <section class="cardGrid">`,
`    <header class="pageHead"><div><h1>\${esc(data.student.name)}さんの進捗</h1><p>\${esc(data.student.school || "学校未登録")} / \${esc(data.student.grade)}</p></div><div class="actionRow">\${TRACKED_SUBJECTS.map((s) => \`<button class="secondaryBtn progressionButton" data-subject="\${s}">\${s}の進行表を見る・入力</button>\`).join("")}</div></header>
    \${studentRoundProgressHtml(data)}
    <section class="cardGrid">`, 'student graph');

    code = replaceOnce(code,
`  $("content").querySelectorAll(".progressionButton").forEach((button) => {
    const options = { subject: button.dataset.subject, mode: "view" };
    button.onclick = () => openProgress(options);
    button.onpointerenter = () => prefetchProgression(options);
    button.onfocus = () => prefetchProgression(options);
  });
  TRACKED_SUBJECTS.forEach((subject, index) => setTimeout(() => prefetchProgression({ subject, mode: "view" }), index * 120));`,
`  const studentProgressMode = data.capabilities?.studentRoundInput ? "student" : "view";
  $("content").querySelectorAll(".progressionButton").forEach((button) => {
    const options = { subject: button.dataset.subject, mode: studentProgressMode };
    button.onclick = () => openProgress(options);
    button.onpointerenter = () => prefetchProgression(options);
    button.onfocus = () => prefetchProgression(options);
  });
  TRACKED_SUBJECTS.forEach((subject, index) => setTimeout(() => prefetchProgression({ subject, mode: studentProgressMode }), index * 120));`, 'student progression mode');

    code = replaceOnce(code,
`function homeworkHtml(items, mode = "readonly") {
  if (!items.length) return '<div class="emptyState">現在の宿題はありません。</div>';`,
`function homeworkHtml(items, mode = "readonly") {
  if (mode === "student" && state.dashboard?.capabilities?.studentHomeworkCardsV2) return studentHomeworkCardsHtml(items);
  if (!items.length) return '<div class="emptyState">現在の宿題はありません。</div>';`, 'student homework cards');

    code = replaceOnce(code,
`function openHomeworkSetup(options) {
  const defaults = DEFAULT_HOMEWORK[options.subject] || [];`,
`function openHomeworkSetup(options) {
  const defaults = DEFAULT_HOMEWORK[options.subject] || [];
  const repeatDefaults = REPEAT_HOMEWORK[options.subject] || defaults;`, 'repeat setup');
    code = replaceOnce(code,
`    const unitLabel = \`\${formatProgressUnitNumber(options.subject, unit)} \${unit.unitName || ""}\`.trim();
    const items = isKeyWords ? ["巻末のKeyWordsTestの暗記"] : defaults;`,
`    const unitLabel = \`\${formatProgressUnitNumber(options.subject, unit)} \${unit.unitName || ""}\`.trim();
    const nextRound = Math.min(3, Number(unit.completedRounds || 0) + 1);
    const roundDefaults = nextRound >= 2 ? repeatDefaults : defaults;
    const items = isKeyWords ? (nextRound >= 2 ? ["KEYWORDSの暗記"] : ["巻末のKeyWordsTestの暗記"]) : roundDefaults;`, 'repeat defaults');

    code = replaceOnce(code,
`    await api(correcting ? "updateLessonCorrection" : "saveLesson", { studentId: options.studentId, subject: options.subject, lessonId: options.lessonId, teacherId: options.teacherId, unitIds: options.unitIds, homeworkByUnit, idempotencyKey: options.idempotencyKey });`,
`    await api(correcting ? "updateLessonCorrection" : "saveLesson", { studentId: options.studentId, subject: options.subject, lessonId: options.lessonId, teacherId: options.teacherId, unitIds: options.unitIds, homeworkByUnit, idempotencyKey: options.idempotencyKey, outsideRangeOverrideUnitIds: options.outsideRangeOverrideUnitIds || [] });`, 'override save payload');

    code = replaceOnce(code,
`    const editable = options.mode === "lesson" || options.mode === "correction" || options.mode === "range";
    const selected = new Set(options.unitIds || data.selectedUnitIds || []);`,
`    const editable = options.mode === "lesson" || options.mode === "correction" || options.mode === "range";
    const canOutsideOverride = Boolean(state.dashboard?.capabilities?.outsideRangeOverride);
    const selected = new Set(options.unitIds || data.selectedUnitIds || []);`, 'override capability');

    code = replaceOnce(code,
`      const rangeLocked = options.mode === "lesson" && state.dashboard?.student?.grade !== "中3" && effectiveOutside;`,
`      const rangeLocked = options.mode === "lesson" && effectiveOutside;`, 'all grade warning');

    code = replaceOnce(code,
`      const todayButton = (options.mode === "lesson" || options.mode === "correction") && !rangeLocked ? \`<button type="button" class="lessonDayToggle \${selected.has(u.unitId) ? "selected" : ""}" data-unit="\${esc(u.unitId)}" aria-pressed="\${selected.has(u.unitId) ? "true" : "false"}">\${options.mode === "correction" ? (selected.has(u.unitId) ? "✓ 記録済み" : "＋ 追加") : \`\${selected.has(u.unitId) ? "✓" : "＋"} 今日 \${esc(todayLabel)}\`}</button>\` : "";`,
`      const lessonSelectable = !rangeLocked || canOutsideOverride;
      const todayButton = (options.mode === "lesson" || options.mode === "correction") && lessonSelectable ? \`<button type="button" class="lessonDayToggle \${selected.has(u.unitId) ? "selected" : ""}" data-unit="\${esc(u.unitId)}" data-outside-locked="\${rangeLocked ? "true" : "false"}" aria-pressed="\${selected.has(u.unitId) ? "true" : "false"}">\${options.mode === "correction" ? (selected.has(u.unitId) ? "✓ 記録済み" : "＋ 追加") : \`\${selected.has(u.unitId) ? "✓" : "＋"} 今日 \${esc(todayLabel)}\`}</button>\` : "";`, 'outside lesson button');

    code = replaceOnce(code,
`      const checkHtml = options.mode === "range" ? \`<span class="rangeCheckCell"><small>\${options.rangeType === "決定" ? "決定範囲" : "予想範囲"}</small><input class="unitCheck" type="checkbox" value="\${esc(u.unitId)}" data-chapter="\${esc(chapter)}" \${editable && !rangeLocked ? "" : "disabled"} \${selected.has(u.unitId) ? "checked" : ""}></span>\` : \`<input class="unitCheck" type="checkbox" value="\${esc(u.unitId)}" data-chapter="\${esc(chapter)}" \${editable && !rangeLocked ? "" : "disabled"} \${selected.has(u.unitId) ? "checked" : ""}>\`;
      return \`\${groupHeader}<label class="unitRow \${classes} \${selected.has(u.unitId) ? "todaySelected" : ""} \${options.mode === "range" ? "rangeSelectable" : ""}" data-unit="\${esc(u.unitId)}">\${checkHtml}<span class="unitNumber">\${esc(displayNumber)}</span><span class="unitName">\${details ? \`<small class="unitPrefix">\${esc(details)}</small>\` : ""}<strong>\${esc(u.unitName)}</strong></span><span class="unitMeta">\${dateHistory}\${todayButton}\${schoolButton}\${options.subject !== "国語" && u.ctResult ? \`<button type="button" class="ctButton" data-unit="\${esc(u.unitId)}">CT \${esc(u.ctResult)}</button>\` : options.subject !== "国語" && u.previous && options.mode === "lesson" ? \`<button type="button" class="ctButton" data-unit="\${esc(u.unitId)}">CTを登録</button>\` : ""}</span></label>\`;`,
`      if (options.mode === "student") {
        const rounds = [1,2,3].map((roundNumber) => (u.rounds || []).find((item) => Number(item.roundNumber) === roundNumber) || { roundNumber, completed:false, date:"" });
        const roundHtml = rounds.map((round) => \`<label class="studentRoundCell"><span>\${round.roundNumber}周目</span><input class="studentRoundInput" type="checkbox" data-round="\${round.roundNumber}" data-outside="\${effectiveOutside ? "true" : "false"}" \${round.completed ? "checked" : ""}><small data-round-date="\${round.roundNumber}" data-saved="\${round.completed ? esc(fmtShortDate(round.date)) : "未"}">\${round.completed ? esc(fmtShortDate(round.date)) : "未"}</small></label>\`).join("");
        return \`<div class="unitRow studentRoundRow \${classes}" data-unit="\${esc(u.unitId)}"><span class="unitNumber">\${esc(displayNumber)}</span><span class="unitName">\${details ? \`<small class="unitPrefix">\${esc(details)}</small>\` : ""}<strong>\${esc(u.unitName)}</strong></span><span class="studentRoundCells">\${roundHtml}</span></div>\`;
      }
      const unitDisabled = editable && (!rangeLocked || canOutsideOverride) ? "" : "disabled";
      const outsideAttr = rangeLocked ? "true" : "false";
      const checkHtml = options.mode === "range" ? \`<span class="rangeCheckCell"><small>\${options.rangeType === "決定" ? "決定範囲" : "予想範囲"}</small><input class="unitCheck" type="checkbox" value="\${esc(u.unitId)}" data-chapter="\${esc(chapter)}" data-outside-locked="\${outsideAttr}" \${unitDisabled} \${selected.has(u.unitId) ? "checked" : ""}></span>\` : \`<input class="unitCheck" type="checkbox" value="\${esc(u.unitId)}" data-chapter="\${esc(chapter)}" data-outside-locked="\${outsideAttr}" \${unitDisabled} \${selected.has(u.unitId) ? "checked" : ""}>\`;
      return \`\${groupHeader}<label class="unitRow \${classes} \${selected.has(u.unitId) ? "todaySelected" : ""} \${options.mode === "range" ? "rangeSelectable" : ""}" data-unit="\${esc(u.unitId)}">\${checkHtml}<span class="unitNumber">\${esc(displayNumber)}</span><span class="unitName">\${details ? \`<small class="unitPrefix">\${esc(details)}</small>\` : ""}<strong>\${esc(u.unitName)}</strong></span><span class="unitMeta">\${dateHistory}\${todayButton}\${schoolButton}\${options.subject !== "国語" && u.ctResult ? \`<button type="button" class="ctButton" data-unit="\${esc(u.unitId)}">CT \${esc(u.ctResult)}</button>\` : options.subject !== "国語" && u.previous && options.mode === "lesson" ? \`<button type="button" class="ctButton" data-unit="\${esc(u.unitId)}">CTを登録</button>\` : ""}</span></label>\`;`, 'student round row');

    code = replaceOnce(code,
`    if ((options.mode === "lesson" || options.mode === "correction") && $("selectedCount") && state.dashboard?.student?.name) $("selectedCount").insertAdjacentHTML("afterend", \`<strong class="progressStudentName">\${esc(state.dashboard.student.name)}さん</strong>\`);
    const checks = [...$("modalBody").querySelectorAll(".unitCheck:not(:disabled)")];`,
`    if ((options.mode === "lesson" || options.mode === "correction") && $("selectedCount") && state.dashboard?.student?.name) $("selectedCount").insertAdjacentHTML("afterend", \`<strong class="progressStudentName">\${esc(state.dashboard.student.name)}さん</strong>\`);
    if (options.mode === "student") { await bindStudentRoundInputs_(options); return; }
    const checks = [...$("modalBody").querySelectorAll(".unitCheck:not(:disabled)")];`, 'student input binding');

    code = replaceOnce(code,
`    const rangeMode = options.mode === "range";
    let rangeSaveTimer = 0;`,
`    const rangeMode = options.mode === "range";
    const outsideOverrides = new Set(options.outsideRangeOverrideUnitIds || []);
    let rangeSaveTimer = 0;`, 'override set');

    code = replaceOnce(code,
`    checks.forEach((c) => c.onchange = () => { count(); scheduleRangeSave(); }); count();`,
`    checks.forEach((c) => c.onchange = async () => {
      if (c.checked && c.dataset.outsideLocked === "true" && !outsideOverrides.has(c.value)) {
        c.checked = false;
        const allowed = await askOutsideRange_();
        if (allowed) { outsideOverrides.add(c.value); c.checked = true; }
      }
      count(); scheduleRangeSave();
    }); count();`, 'outside checkbox prompt');

    code = replaceOnce(code,
`    $("modalBody").querySelectorAll(".lessonDayToggle").forEach((button) => button.onclick = (event) => {
      event.preventDefault();
      const check = checks.find((item) => item.value === button.dataset.unit);
      if (check) check.checked = !check.checked;
      count();
    });`,
`    $("modalBody").querySelectorAll(".lessonDayToggle").forEach((button) => button.onclick = async (event) => {
      event.preventDefault();
      const check = checks.find((item) => item.value === button.dataset.unit);
      if (!check) return;
      const nextChecked = !check.checked;
      if (nextChecked && button.dataset.outsideLocked === "true" && !outsideOverrides.has(check.value)) {
        const allowed = await askOutsideRange_();
        if (!allowed) return;
        outsideOverrides.add(check.value);
      }
      check.checked = nextChecked;
      count();
    });`, 'outside today prompt');

    code = replaceOnce(code,
`      openHomeworkSetup({ ...options, unitIds, selectedUnits: (data.units || []).filter((unit) => unitIds.includes(unit.unitId)), idempotencyKey: options.idempotencyKey || crypto.randomUUID() });`,
`      openHomeworkSetup({ ...options, unitIds, outsideRangeOverrideUnitIds:Array.from(outsideOverrides), selectedUnits: (data.units || []).filter((unit) => unitIds.includes(unit.unitId)), idempotencyKey: options.idempotencyKey || crypto.randomUUID() });`, 'carry overrides');

    code = replaceOnce(code,
`function closeModal() {
  const shouldRefreshTeacher = $("modal").dataset.refreshTeacher === "true";
  delete $("modal").dataset.refreshTeacher;
  if ($("modal").open) $("modal").close();`,
`function closeModal() {
  const shouldRefreshTeacher = $("modal").dataset.refreshTeacher === "true";
  const shouldRefreshStudent = $("modal").dataset.refreshStudent === "true";
  delete $("modal").dataset.refreshTeacher;
  delete $("modal").dataset.refreshStudent;
  if ($("modal").open) $("modal").close();
  if (shouldRefreshStudent && state.role === "student") { state.dashboard = null; openView("home"); return; }`, 'student modal refresh');

    const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    try { await import(blobUrl); }
    finally { URL.revokeObjectURL(blobUrl); }
  } catch (error) {
    console.error('[foresta-rounds] Safe add-on was not applied; loading stable app.', error);
    await import(originalUrl.href);
  }
}

boot();
