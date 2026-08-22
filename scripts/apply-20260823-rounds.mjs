import fs from 'node:fs';

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Patch point not found: ${label}`);
  return text.replace(from, to);
}
function replaceRegex(text, pattern, to, label) {
  if (!pattern.test(text)) throw new Error(`Patch regex not found: ${label}`);
  pattern.lastIndex = 0;
  return text.replace(pattern, to);
}

let index = fs.readFileSync('index.html', 'utf8');
index = replaceOnce(
  index,
  '    <a class="goalLink" href="https://stepkobetsu-hub.github.io/foresta-step-progress/" target="_blank" rel="noopener">ステップ＆ゴールへ ↗</a>',
  '    <div class="topbarActions"><button id="topAdminEntry" class="topAdminEntry" type="button">管理者画面へ</button><a class="goalLink" href="https://stepkobetsu-hub.github.io/foresta-step-progress/" target="_blank" rel="noopener">ステップ＆ゴールへ ↗</a></div>',
  'top admin entry',
);
index = index
  .replace('styles.css?v=20260822-usability', 'styles.css?v=20260823-rounds')
  .replace('app.js?v=20260822-usability', 'app.js?v=20260823-rounds');

let app = fs.readFileSync('app.js', 'utf8');
app = replaceOnce(
  app,
  'const DEFAULT_HOMEWORK = {\n  数学: ["TRYの赤×直し", "exercise", "宿題の赤×直し"],\n  英語: ["KeyWords「☆日→英」暗記", "exercise「暗記マーク」暗記", "Try赤×直し", "exercise", "宿題の赤×直し"],\n};',
  'const DEFAULT_HOMEWORK = {\n  数学: ["TRYの赤×直し", "exercise", "宿題の赤×直し"],\n  英語: ["KeyWords「☆日→英」暗記", "exercise「暗記マーク」暗記", "Try赤×直し", "exercise", "宿題の赤×直し"],\n};\nconst REPEAT_HOMEWORK = {\n  数学: ["TRYの赤×直し", "エクササイズの赤×直し"],\n  英語: ["KEYWORDSの暗記", "TRYの赤×直し", "エクササイズの赤×直し"],\n};',
  'repeat homework presets',
);

app = replaceOnce(
  app,
  'function renderShell() {\n  $("loginView").classList.add("hidden");',
  'function renderShell() {\n  $("topAdminEntry")?.classList.add("hidden");\n  $("loginView").classList.add("hidden");',
  'hide top admin after login',
);

app = replaceOnce(
  app,
  'function metricCard(title, value, sub = "", tone = "") {\n  return `<article class="card span4 ${tone}"><p class="cardTitle">${esc(title)}</p><div class="bigValue">${esc(value)}</div>${sub ? `<p class="muted">${esc(sub)}</p>` : ""}</article>`;\n}\n',
  `function metricCard(title, value, sub = "", tone = "") {\n  return \`<article class="card span4 \${tone}"><p class="cardTitle">\${esc(title)}</p><div class="bigValue">\${esc(value)}</div>\${sub ? \`<p class="muted">\${esc(sub)}</p>\` : ""}</article>\`;\n}\n\nfunction subjectProgressClass(subject) {\n  return ({ 英語: "english", 数学: "math", 国語: "japanese" })[subject] || "other";\n}\n\nfunction mappedRoundWidth(percent) {\n  const value = Math.max(0, Math.min(300, Number(percent || 0)));\n  if (value <= 100) return value * 0.7;\n  if (value <= 200) return 70 + (value - 100) * 0.15;\n  return 85 + (value - 200) * 0.15;\n}\n\nfunction studentRoundProgressHtml(data) {\n  const rows = (data.progress || []).filter((row) => row.roundProgress && Number(row.roundProgress.targetCount) > 0);\n  if (!rows.length) return "";\n  const totalTarget = rows.reduce((sum, row) => sum + Number(row.roundProgress.targetCount || 0), 0);\n  const roundCounts = [1, 2, 3].map((round) => rows.reduce((sum, row) => sum + Number(row.roundProgress.roundCounts?.[round] || 0), 0));\n  const totalDone = roundCounts.reduce((sum, value) => sum + value, 0);\n  const overallPercent = totalTarget ? Math.round(totalDone / totalTarget * 100) : 0;\n  const roundBars = roundCounts.map((count, index) => {\n    const pct = totalTarget ? Math.round(count / totalTarget * 100) : 0;\n    return \`<div class="roundProgressLine"><span>\${index + 1}周目</span><i><b style="width:\${Math.min(100, pct)}%"></b></i><strong>\${pct}%</strong></div>\`;\n  }).join("");\n  const subjectBars = rows.map((row) => {\n    const target = Number(row.roundProgress.targetCount || 0);\n    const done = [1, 2, 3].reduce((sum, round) => sum + Number(row.roundProgress.roundCounts?.[round] || 0), 0);\n    const pct = target ? Math.round(done / target * 100) : 0;\n    return \`<div class="subjectRoundBar \${subjectProgressClass(row.subject)}"><span>\${esc(row.subject)}</span><i><em style="width:\${mappedRoundWidth(pct)}%"></em><u>1周目ゴール</u></i><strong>\${pct}%</strong></div>\`;\n  }).join("");\n  return \`<section class="roundProgressHero"><div class="roundScore"><small>3周合計</small><strong>\${overallPercent}%</strong><span>(\${totalDone}/\${totalTarget})</span></div><div class="roundProgressBody"><div class="roundProgressLines">\${roundBars}</div><div class="subjectRoundBars">\${subjectBars}</div><p class="roundProgressGuide">100%で1周目達成。グラフの70%位置を1周目ゴールにし、その先で2周目・3周目を積み上げます。</p></div></section>\`;\n}\n`,
  'round progress graph helpers',
);

app = replaceOnce(
  app,
  '<header class="pageHead"><div><h1>${esc(data.student.name)}さんの進捗</h1><p>${esc(data.student.school || "学校未登録")} / ${esc(data.student.grade)}</p></div><div class="actionRow">${TRACKED_SUBJECTS.map((s) => `<button class="secondaryBtn progressionButton" data-subject="${s}">${s}の進行表を見る</button>`).join("")}</div></header>\n    <section class="cardGrid">',
  '<header class="pageHead"><div><h1>${esc(data.student.name)}さんの進捗</h1><p>${esc(data.student.school || "学校未登録")} / ${esc(data.student.grade)}</p></div><div class="actionRow">${TRACKED_SUBJECTS.map((s) => `<button class="secondaryBtn progressionButton" data-subject="${s}">${s}の進行表を見る・入力</button>`).join("")}</div></header>\n    ${studentRoundProgressHtml(data)}\n    <section class="cardGrid">',
  'student graph insertion',
);

app = replaceRegex(
  app,
  /  \$\("content"\)\.querySelectorAll\("\.progressionButton"\)\.forEach\(\(button\) => \{\n    const options = \{ subject: button\.dataset\.subject, mode: "view" \};\n    button\.onclick = \(\) => openProgress\(options\);\n    button\.onpointerenter = \(\) => prefetchProgression\(options\);\n    button\.onfocus = \(\) => prefetchProgression\(options\);\n  \}\);\n  TRACKED_SUBJECTS\.forEach\(\(subject, index\) => setTimeout\(\(\) => prefetchProgression\(\{ subject, mode: "view" \}\), index \* 120\)\);/,
  `  const studentProgressMode = data.capabilities?.studentRoundInput ? "student" : "view";\n  $("content").querySelectorAll(".progressionButton").forEach((button) => {\n    const options = { subject: button.dataset.subject, mode: studentProgressMode };\n    button.onclick = () => openProgress(options);\n    button.onpointerenter = () => prefetchProgression(options);\n    button.onfocus = () => prefetchProgression(options);\n  });\n  TRACKED_SUBJECTS.forEach((subject, index) => setTimeout(() => prefetchProgression({ subject, mode: studentProgressMode }), index * 120));`,
  'student progression mode gate',
);

app = replaceOnce(
  app,
  'function homeworkHtml(items, mode = "readonly") {\n  if (!items.length) return \'<div class="emptyState">現在の宿題はありません。</div>\';',
  `function studentHomeworkCardsHtml(items) {\n  if (!items.length) return '<div class="emptyState">現在の宿題はありません。</div>';\n  const groups = new Map();\n  items.forEach((item) => {\n    const key = [item.lessonId || "", item.unitId || "", item.recommendedDueDate || ""].join("|");\n    if (!groups.has(key)) groups.set(key, { items: [], subject: item.subject || "", unitNumber: item.unitNumber || "", unitName: item.unitName || "", roundNumber: item.roundNumber || "", createdAt: item.createdAt || "", due: item.recommendedDueDate || "" });\n    groups.get(key).items.push(item);\n  });\n  return [...groups.values()].map((group) => {\n    const subject = group.subject || "宿題";\n    const tasks = group.items.map((item) => \`<label class="studentHomeworkTask \${item.teacherChecked ? "confirmed" : ""}"><strong>\${esc(item.contentText || item.contentType)}</strong><span class="studentTaskAction"><input class="homeworkCheck" type="checkbox" data-id="\${esc(item.homeworkId)}" \${item.studentChecked ? "checked" : ""} \${item.teacherChecked ? "disabled" : ""}><b>\${item.teacherChecked ? "確認済み" : "チェック"}</b></span>\${item.studentChecked && !item.teacherChecked ? '<small>先生の確認待ち</small>' : ""}</label>\`).join("");\n    return \`<article class="studentHomeworkCard \${subjectProgressClass(subject)}"><div class="studentHomeworkMeta"><div><span class="subjectPill">\${esc(subject)}</span>\${group.roundNumber ? \`<span class="roundPill">\${esc(group.roundNumber)}周目</span>\` : ""}</div><strong>\${esc([group.unitNumber, group.unitName].filter(Boolean).join(" ") || "宿題")}</strong><small>宿題 \${fmtShortDate(group.createdAt)}　期限 \${fmtShortDate(group.due)}</small></div><div class="studentHomeworkTasks">\${tasks}</div></article>\`;\n  }).join("");\n}\n\nfunction homeworkHtml(items, mode = "readonly") {\n  if (mode === "student" && state.dashboard?.capabilities?.studentHomeworkCardsV2) return studentHomeworkCardsHtml(items);\n  if (!items.length) return '<div class="emptyState">現在の宿題はありません。</div>';`,
  'student homework card renderer',
);

app = replaceOnce(
  app,
  'function openHomeworkSetup(options) {\n  const defaults = DEFAULT_HOMEWORK[options.subject] || [];',
  'function openHomeworkSetup(options) {\n  const defaults = DEFAULT_HOMEWORK[options.subject] || [];\n  const repeatDefaults = REPEAT_HOMEWORK[options.subject] || defaults;',
  'repeat defaults in homework setup',
);
app = replaceOnce(
  app,
  '    const unitLabel = `${formatProgressUnitNumber(options.subject, unit)} ${unit.unitName || ""}`.trim();\n    const items = isKeyWords ? ["巻末のKeyWordsTestの暗記"] : defaults;',
  '    const unitLabel = `${formatProgressUnitNumber(options.subject, unit)} ${unit.unitName || ""}`.trim();\n    const nextRound = Math.min(3, Number(unit.completedRounds || 0) + 1);\n    const roundDefaults = nextRound >= 2 ? repeatDefaults : defaults;\n    const items = isKeyWords ? (nextRound >= 2 ? ["KEYWORDSの暗記"] : ["巻末のKeyWordsTestの暗記"]) : roundDefaults;',
  'repeat homework based on round',
);

app = replaceOnce(
  app,
  '    await api(correcting ? "updateLessonCorrection" : "saveLesson", { studentId: options.studentId, subject: options.subject, lessonId: options.lessonId, teacherId: options.teacherId, unitIds: options.unitIds, homeworkByUnit, idempotencyKey: options.idempotencyKey });',
  '    await api(correcting ? "updateLessonCorrection" : "saveLesson", { studentId: options.studentId, subject: options.subject, lessonId: options.lessonId, teacherId: options.teacherId, unitIds: options.unitIds, homeworkByUnit, idempotencyKey: options.idempotencyKey, outsideRangeOverrideUnitIds: options.outsideRangeOverrideUnitIds || [] });',
  'range override payload',
);

const askHelper = `\nasync function askOutsideRange_() {\n  return new Promise((resolve) => {\n    const layer = document.createElement("div");\n    layer.className = "outsideConfirmLayer";\n    layer.innerHTML = '<div class="outsideConfirmBox"><span>⚠</span><h3>次回テスト範囲外です</h3><p>この単元は管理者が設定した次回テスト範囲の外です。それでも実際に進みましたか？</p><div><button class="primaryBtn" data-answer="yes">それでもすすみました</button><button class="ghostBtn" data-answer="no">いいえ</button></div></div>';\n    const finish = (value) => { layer.remove(); resolve(value); };\n    layer.querySelector('[data-answer="yes"]').onclick = () => finish(true);\n    layer.querySelector('[data-answer="no"]').onclick = () => finish(false);\n    document.body.appendChild(layer);\n  });\n}\n\nasync function bindStudentRoundInputs_(options) {\n  const inputs = [...$("modalBody").querySelectorAll(".studentRoundInput")];\n  inputs.forEach((input) => input.onchange = async () => {\n    const row = input.closest(".studentRoundRow");\n    const roundNumber = Number(input.dataset.round);\n    const nextChecked = input.checked;\n    if (nextChecked && roundNumber > 1) {\n      const previous = row.querySelector(\`.studentRoundInput[data-round="\${roundNumber - 1}"]\`);\n      if (previous && !previous.checked) { input.checked = false; status(`先に\${roundNumber - 1}周目を完了してください。`, true); return; }\n    }\n    if (!nextChecked && roundNumber < 3) {\n      const later = [...row.querySelectorAll(".studentRoundInput")].some((item) => Number(item.dataset.round) > roundNumber && item.checked);\n      if (later) { input.checked = true; status("後の周回を先に取り消してください。", true); return; }\n    }\n    let outsideRangeOverride = false;\n    if (nextChecked && input.dataset.outside === "true") {\n      input.checked = false;\n      outsideRangeOverride = await askOutsideRange_();\n      if (!outsideRangeOverride) return;\n      input.checked = true;\n    }\n    const date = row.querySelector(\`[data-round-date="\${roundNumber}"]\`);\n    input.disabled = true;\n    if (date) date.textContent = nextChecked ? "保存中…" : "取消中…";\n    try {\n      const result = await api("saveStudentRoundProgress", { subject: options.subject, unitId: row.dataset.unit, roundNumber, checked: nextChecked, outsideRangeOverride, idempotencyKey: crypto.randomUUID() }, { silent: true });\n      (result.rounds || []).forEach((round) => {\n        const target = row.querySelector(\`.studentRoundInput[data-round="\${round.roundNumber}"]\`);\n        const targetDate = row.querySelector(\`[data-round-date="\${round.roundNumber}"]\`);\n        if (target) target.checked = !!round.completed;\n        if (targetDate) targetDate.textContent = round.completed ? fmtShortDate(round.date) : "未";\n      });\n      invalidateProgressionCache(options);\n      state.dashboard = null;\n      $("modal").dataset.refreshStudent = "true";\n      status(nextChecked ? `\${roundNumber}周目を保存しました。宿題も更新しました。` : `\${roundNumber}周目を取り消しました。`);\n    } catch (error) {\n      input.checked = !nextChecked;\n      if (date) date.textContent = input.checked ? (date.dataset.saved || "済") : "未";\n      status(error.message, true);\n    } finally { input.disabled = false; }\n  });\n}\n`;
app = replaceOnce(app, '\nasync function openProgress(options) {', askHelper + '\nasync function openProgress(options) {', 'outside range helper and student round binder');

app = replaceOnce(
  app,
  '    const editable = options.mode === "lesson" || options.mode === "correction" || options.mode === "range";\n    const selected = new Set(options.unitIds || data.selectedUnitIds || []);',
  '    const editable = options.mode === "lesson" || options.mode === "correction" || options.mode === "range";\n    const canOutsideOverride = Boolean(state.dashboard?.capabilities?.outsideRangeOverride);\n    const selected = new Set(options.unitIds || data.selectedUnitIds || []);',
  'outside override capability',
);

app = replaceOnce(
  app,
  '      const todayButton = (options.mode === "lesson" || options.mode === "correction") && !rangeLocked ? `<button type="button" class="lessonDayToggle ${selected.has(u.unitId) ? "selected" : ""}" data-unit="${esc(u.unitId)}" aria-pressed="${selected.has(u.unitId) ? "true" : "false"}">${options.mode === "correction" ? (selected.has(u.unitId) ? "✓ 記録済み" : "＋ 追加") : `${selected.has(u.unitId) ? "✓" : "＋"} 今日 ${esc(todayLabel)}`}</button>` : "";',
  '      const lessonSelectable = !rangeLocked || canOutsideOverride;\n      const todayButton = (options.mode === "lesson" || options.mode === "correction") && lessonSelectable ? `<button type="button" class="lessonDayToggle ${selected.has(u.unitId) ? "selected" : ""}" data-unit="${esc(u.unitId)}" data-outside-locked="${rangeLocked ? "true" : "false"}" aria-pressed="${selected.has(u.unitId) ? "true" : "false"}">${options.mode === "correction" ? (selected.has(u.unitId) ? "✓ 記録済み" : "＋ 追加") : `${selected.has(u.unitId) ? "✓" : "＋"} 今日 ${esc(todayLabel)}`}</button>` : "";',
  'lesson outside selectable',
);

app = replaceOnce(
  app,
  '      const checkHtml = options.mode === "range" ? `<span class="rangeCheckCell"><small>${options.rangeType === "決定" ? "決定範囲" : "予想範囲"}</small><input class="unitCheck" type="checkbox" value="${esc(u.unitId)}" data-chapter="${esc(chapter)}" ${editable && !rangeLocked ? "" : "disabled"} ${selected.has(u.unitId) ? "checked" : ""}></span>` : `<input class="unitCheck" type="checkbox" value="${esc(u.unitId)}" data-chapter="${esc(chapter)}" ${editable && !rangeLocked ? "" : "disabled"} ${selected.has(u.unitId) ? "checked" : ""}>`;\n      return `${groupHeader}<label class="unitRow ${classes} ${selected.has(u.unitId) ? "todaySelected" : ""} ${options.mode === "range" ? "rangeSelectable" : ""}" data-unit="${esc(u.unitId)}">${checkHtml}<span class="unitNumber">${esc(displayNumber)}</span><span class="unitName">${details ? `<small class="unitPrefix">${esc(details)}</small>` : ""}<strong>${esc(u.unitName)}</strong></span><span class="unitMeta">${dateHistory}${todayButton}${schoolButton}${options.subject !== "国語" && u.ctResult ? `<button type="button" class="ctButton" data-unit="${esc(u.unitId)}">CT ${esc(u.ctResult)}</button>` : options.subject !== "国語" && u.previous && options.mode === "lesson" ? `<button type="button" class="ctButton" data-unit="${esc(u.unitId)}">CTを登録</button>` : ""}</span></label>`;',
  '      if (options.mode === "student") {\n        const rounds = [1, 2, 3].map((roundNumber) => (u.rounds || []).find((item) => Number(item.roundNumber) === roundNumber) || { roundNumber, completed: false, date: "" });\n        const roundHtml = rounds.map((round) => `<label class="studentRoundCell"><span>${round.roundNumber}周目</span><input class="studentRoundInput" type="checkbox" data-round="${round.roundNumber}" data-outside="${effectiveOutside ? "true" : "false"}" ${round.completed ? "checked" : ""}><small data-round-date="${round.roundNumber}" data-saved="${round.completed ? esc(fmtShortDate(round.date)) : "未"}">${round.completed ? esc(fmtShortDate(round.date)) : "未"}</small></label>`).join("");\n        return `<div class="unitRow studentRoundRow ${classes}" data-unit="${esc(u.unitId)}"><span class="unitNumber">${esc(displayNumber)}</span><span class="unitName">${details ? `<small class="unitPrefix">${esc(details)}</small>` : ""}<strong>${esc(u.unitName)}</strong></span><span class="studentRoundCells">${roundHtml}</span></div>`;\n      }\n      const unitDisabled = editable && (!rangeLocked || canOutsideOverride) ? "" : "disabled";\n      const outsideAttr = rangeLocked ? "true" : "false";\n      const checkHtml = options.mode === "range" ? `<span class="rangeCheckCell"><small>${options.rangeType === "決定" ? "決定範囲" : "予想範囲"}</small><input class="unitCheck" type="checkbox" value="${esc(u.unitId)}" data-chapter="${esc(chapter)}" data-outside-locked="${outsideAttr}" ${unitDisabled} ${selected.has(u.unitId) ? "checked" : ""}></span>` : `<input class="unitCheck" type="checkbox" value="${esc(u.unitId)}" data-chapter="${esc(chapter)}" data-outside-locked="${outsideAttr}" ${unitDisabled} ${selected.has(u.unitId) ? "checked" : ""}>`;\n      return `${groupHeader}<label class="unitRow ${classes} ${selected.has(u.unitId) ? "todaySelected" : ""} ${options.mode === "range" ? "rangeSelectable" : ""}" data-unit="${esc(u.unitId)}">${checkHtml}<span class="unitNumber">${esc(displayNumber)}</span><span class="unitName">${details ? `<small class="unitPrefix">${esc(details)}</small>` : ""}<strong>${esc(u.unitName)}</strong></span><span class="unitMeta">${dateHistory}${todayButton}${schoolButton}${options.subject !== "国語" && u.ctResult ? `<button type="button" class="ctButton" data-unit="${esc(u.unitId)}">CT ${esc(u.ctResult)}</button>` : options.subject !== "国語" && u.previous && options.mode === "lesson" ? `<button type="button" class="ctButton" data-unit="${esc(u.unitId)}">CTを登録</button>` : ""}</span></label>`;',
  'student round row and override checkbox',
);

app = replaceOnce(
  app,
  '    if ((options.mode === "lesson" || options.mode === "correction") && $("selectedCount") && state.dashboard?.student?.name) $("selectedCount").insertAdjacentHTML("afterend", `<strong class="progressStudentName">${esc(state.dashboard.student.name)}さん</strong>`);\n    const checks = [...$("modalBody").querySelectorAll(".unitCheck:not(:disabled)")];',
  '    if ((options.mode === "lesson" || options.mode === "correction") && $("selectedCount") && state.dashboard?.student?.name) $("selectedCount").insertAdjacentHTML("afterend", `<strong class="progressStudentName">${esc(state.dashboard.student.name)}さん</strong>`);\n    if (options.mode === "student") { await bindStudentRoundInputs_(options); return; }\n    const checks = [...$("modalBody").querySelectorAll(".unitCheck:not(:disabled)")];',
  'bind student round inputs',
);

app = replaceOnce(
  app,
  '    const rangeMode = options.mode === "range";\n    let rangeSaveTimer = 0;',
  '    const rangeMode = options.mode === "range";\n    const outsideOverrides = new Set(options.outsideRangeOverrideUnitIds || []);\n    let rangeSaveTimer = 0;',
  'outside override set',
);

app = replaceOnce(
  app,
  '    checks.forEach((c) => c.onchange = () => { count(); scheduleRangeSave(); }); count();',
  '    checks.forEach((c) => c.onchange = async () => {\n      if (c.checked && c.dataset.outsideLocked === "true" && !outsideOverrides.has(c.value)) {\n        c.checked = false;\n        const allowed = await askOutsideRange_();\n        if (allowed) { outsideOverrides.add(c.value); c.checked = true; }\n      }\n      count(); scheduleRangeSave();\n    }); count();',
  'outside range check prompt',
);

app = replaceOnce(
  app,
  '    $("modalBody").querySelectorAll(".lessonDayToggle").forEach((button) => button.onclick = (event) => {\n      event.preventDefault();\n      const check = checks.find((item) => item.value === button.dataset.unit);\n      if (check) check.checked = !check.checked;\n      count();\n    });',
  '    $("modalBody").querySelectorAll(".lessonDayToggle").forEach((button) => button.onclick = async (event) => {\n      event.preventDefault();\n      const check = checks.find((item) => item.value === button.dataset.unit);\n      if (!check) return;\n      const nextChecked = !check.checked;\n      if (nextChecked && button.dataset.outsideLocked === "true" && !outsideOverrides.has(check.value)) {\n        const allowed = await askOutsideRange_();\n        if (!allowed) return;\n        outsideOverrides.add(check.value);\n      }\n      check.checked = nextChecked;\n      count();\n    });',
  'outside range today button prompt',
);

app = replaceOnce(
  app,
  '      openHomeworkSetup({ ...options, unitIds, selectedUnits: (data.units || []).filter((unit) => unitIds.includes(unit.unitId)), idempotencyKey: options.idempotencyKey || crypto.randomUUID() });',
  '      openHomeworkSetup({ ...options, unitIds, outsideRangeOverrideUnitIds: Array.from(outsideOverrides), selectedUnits: (data.units || []).filter((unit) => unitIds.includes(unit.unitId)), idempotencyKey: options.idempotencyKey || crypto.randomUUID() });',
  'carry range overrides to save',
);

app = replaceOnce(
  app,
  'function closeModal() {\n  const shouldRefreshTeacher = $("modal").dataset.refreshTeacher === "true";\n  delete $("modal").dataset.refreshTeacher;\n  if ($("modal").open) $("modal").close();\n  if (shouldRefreshTeacher && state.role === "teacher" && state.activeStudentId) {',
  'function closeModal() {\n  const shouldRefreshTeacher = $("modal").dataset.refreshTeacher === "true";\n  const shouldRefreshStudent = $("modal").dataset.refreshStudent === "true";\n  delete $("modal").dataset.refreshTeacher;\n  delete $("modal").dataset.refreshStudent;\n  if ($("modal").open) $("modal").close();\n  if (shouldRefreshStudent && state.role === "student") { state.dashboard = null; openView("home"); return; }\n  if (shouldRefreshTeacher && state.role === "teacher" && state.activeStudentId) {',
  'refresh student after round edits',
);

app = replaceOnce(
  app,
  '$("adminEntry").onclick = openAdminReauth;\n$("modalClose").onclick = closeModal;',
  '$("adminEntry").onclick = openAdminReauth;\n$("topAdminEntry").onclick = openAdminReauth;\n$("modalClose").onclick = closeModal;',
  'top admin button binding',
);

let styles = fs.readFileSync('styles.css', 'utf8');
const css = `\n\n/* 2026-08-23: three-round progress, student homework cards, outside-range override */\n.topbarActions{display:flex;align-items:center;gap:10px}.topAdminEntry{border:1px solid #c7d8d3;border-radius:9px;background:#fff;color:var(--forest2);padding:7px 11px;font-size:.78rem;font-weight:900;cursor:pointer}\n.roundProgressHero{display:grid;grid-template-columns:150px minmax(0,1fr);gap:16px;margin-bottom:16px;padding:16px;border-radius:20px;background:linear-gradient(135deg,#0b4b8f,#0d3f82);color:#fff;box-shadow:0 14px 30px rgba(13,63,130,.18)}.roundScore{display:grid;place-items:center;align-content:center;border:1px solid rgba(255,255,255,.28);border-radius:18px;background:rgba(255,255,255,.08)}.roundScore small{font-weight:900}.roundScore strong{font-size:2.35rem;line-height:1.1}.roundScore span{font-size:.9rem;font-weight:900}.roundProgressBody{display:grid;gap:12px}.roundProgressLines{display:grid;gap:7px}.roundProgressLine{display:grid;grid-template-columns:52px minmax(0,1fr) 42px;gap:8px;align-items:center;font-size:.72rem;font-weight:900}.roundProgressLine i{height:10px;border-radius:999px;background:rgba(255,255,255,.24);overflow:hidden}.roundProgressLine i b{display:block;height:100%;border-radius:inherit;background:#69d8c6}.roundProgressLine strong{text-align:right}.subjectRoundBars{display:grid;gap:8px;padding-top:10px;border-top:1px dashed rgba(255,255,255,.25)}.subjectRoundBar{display:grid;grid-template-columns:46px minmax(0,1fr) 48px;gap:7px;align-items:center;font-size:.72rem;font-weight:900}.subjectRoundBar>span{display:grid;place-items:center;border-radius:7px;padding:3px 5px;background:#1d8ae5}.subjectRoundBar.english>span{background:#e84545}.subjectRoundBar.math>span{background:#f59e0b}.subjectRoundBar.japanese>span{background:#9b35b8}.subjectRoundBar i{position:relative;height:8px;border-radius:999px;background:rgba(255,255,255,.2)}.subjectRoundBar i em{display:block;height:100%;border-radius:inherit;background:#70c7ff}.subjectRoundBar i u{position:absolute;left:70%;top:-14px;transform:translateX(-50%);color:#fff;font-size:.58rem;text-decoration:none;white-space:nowrap}.subjectRoundBar i:after{content:"";position:absolute;left:70%;top:-4px;bottom:-4px;border-left:1px dashed #fff}.subjectRoundBar strong{text-align:right}.roundProgressGuide{margin:0;color:#dbeafe;font-size:.68rem}.studentHomeworkCard{display:grid;grid-template-columns:minmax(250px,.95fr) minmax(360px,1.35fr);gap:12px;padding:12px;border:1px solid var(--line);border-left:5px solid #1d8ae5;border-radius:14px;background:#fff}.studentHomeworkCard.english{border-left-color:#e84545}.studentHomeworkCard.math{border-left-color:#f59e0b}.studentHomeworkCard.japanese{border-left-color:#9b35b8}.studentHomeworkMeta{display:grid;align-content:center;gap:6px}.studentHomeworkMeta>div{display:flex;gap:6px;align-items:center}.studentHomeworkMeta>strong{font-size:.86rem}.studentHomeworkMeta>small{color:var(--muted);font-size:.68rem}.subjectPill,.roundPill{display:inline-flex;border-radius:999px;padding:3px 7px;background:#edf4ff;color:#174b7a;font-size:.65rem;font-weight:900}.roundPill{background:#f1f5f9;color:#475569}.studentHomeworkTasks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.studentHomeworkTask{display:grid;gap:7px;align-content:center;min-height:76px;padding:8px 10px;border:1px solid #dce5ea;border-radius:10px;background:#fbfdff}.studentHomeworkTask>strong{font-size:.72rem}.studentHomeworkTask.confirmed{background:#f1f4f3;color:#75807d}.studentTaskAction{display:flex;align-items:center;gap:7px}.studentTaskAction input{width:19px;height:19px;margin:0;accent-color:var(--forest)}.studentTaskAction b{font-size:.67rem}.studentHomeworkTask>small{color:var(--forest2);font-size:.62rem}.studentRoundRow{grid-template-columns:70px minmax(240px,1fr) minmax(280px,420px)}.studentRoundCells{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.studentRoundCell{display:grid;grid-template-columns:auto auto;gap:4px 7px;align-items:center;justify-content:center;padding:6px;border:1px solid #dbe5e1;border-radius:9px;background:#f8fbfa;font-size:.65rem;font-weight:900}.studentRoundCell input{width:20px;height:20px;margin:0;accent-color:var(--forest)}.studentRoundCell small{grid-column:1/-1;text-align:center;color:var(--muted);font-size:.62rem}.outsideConfirmLayer{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:18px;background:rgba(14,31,28,.62)}.outsideConfirmBox{width:min(430px,94vw);padding:24px;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.3);text-align:center}.outsideConfirmBox>span{font-size:2rem}.outsideConfirmBox h3{margin:6px 0 8px;color:#9a3412}.outsideConfirmBox p{margin:0 0 18px;line-height:1.7;color:#5f6b67}.outsideConfirmBox>div{display:flex;justify-content:center;gap:9px;flex-wrap:wrap}\n@media(max-width:760px){.roundProgressHero{grid-template-columns:1fr}.roundScore{min-height:110px}.studentHomeworkCard{grid-template-columns:1fr}.studentHomeworkTasks{grid-template-columns:1fr 1fr}.studentRoundRow{grid-template-columns:58px minmax(0,1fr)}.studentRoundCells{grid-column:1/-1}.topbarActions{gap:5px}.topAdminEntry{padding:6px 8px;font-size:.67rem}}\n@media(max-width:480px){.studentHomeworkTasks{grid-template-columns:1fr}.subjectRoundBar{grid-template-columns:40px minmax(0,1fr) 42px}.topAdminEntry{font-size:.62rem}.goalLink{font-size:.66rem}}\n`;
if (!styles.includes('2026-08-23: three-round progress')) styles += css;

let gas = fs.readFileSync('apps-script/Code.gs', 'utf8');
gas = replaceOnce(
  gas,
  "    case 'getProgression': return getProgression_(data);",
  "    case 'getProgression': return getProgression_(data);\n    case 'saveStudentRoundProgress': return saveStudentRoundProgress_(data);",
  'GAS route for student round save',
);
gas = replaceOnce(
  gas,
  "    OUTSIDE_TEST_RANGE: '中1・中2はテスト範囲外へ進めません。範囲内の復習単元を選んでください。',",
  "    OUTSIDE_TEST_RANGE: '次回テスト範囲外です。進める場合は確認してください。', ROUND_ORDER: '周回は1周目から順番に入力してください。',",
  'GAS public errors',
);

const roundHelpers = `\nfunction studentRoundRows_(studentId, subject) {\n  try {\n    return objects_('生徒周回進捗').filter(function(row) { return text_(row['生徒ID']) === text_(studentId) && (!subject || text_(row['科目']) === text_(subject)); });\n  } catch (error) {\n    if (String(error && error.message || '') === 'SHEET_NOT_FOUND') return [];\n    throw error;\n  }\n}\n\nfunction roundStateForUnits_(studentId, subject, unitIds) {\n  const wanted = new Set((unitIds || []).map(text_)), state = {};\n  wanted.forEach(function(unitId) { state[unitId] = {}; });\n  const lessonDates = {};\n  objects_('授業実施単元').filter(function(row) { return text_(row['生徒ID']) === text_(studentId) && text_(row['科目']) === text_(subject) && wanted.has(text_(row['単元ID'])); }).forEach(function(row) {\n    const unitId = text_(row['単元ID']); if (!lessonDates[unitId]) lessonDates[unitId] = []; lessonDates[unitId].push(new Date(row['実施日']));\n  });\n  Object.keys(lessonDates).forEach(function(unitId) { lessonDates[unitId].sort(function(a,b){return a-b;}); lessonDates[unitId].slice(0,3).forEach(function(date,index){ state[unitId][index+1] = { completed:true, date:date, source:'講師授業', eventId:'' }; }); });\n  studentRoundRows_(studentId, subject).forEach(function(row) {\n    const unitId = text_(row['単元ID']), round = Number(row['周回']); if (!wanted.has(unitId) || round < 1 || round > 3) return;\n    state[unitId][round] = { completed:true, date:new Date(row['学習日']), source:text_(row['入力元']), eventId:text_(row['イベントID']) };\n  });\n  return state;\n}\n\nfunction roundProgressSummary_(roundState, targetIds) {\n  const ids = Array.from(targetIds || []), counts = {1:0,2:0,3:0};\n  ids.forEach(function(unitId){ const rounds=roundState[unitId]||{}; [1,2,3].forEach(function(round){if(rounds[round]&&rounds[round].completed)counts[round]++;}); });\n  return { targetCount:ids.length, roundCounts:counts, totalCompleted:counts[1]+counts[2]+counts[3], overallPercent:ids.length?Math.round((counts[1]+counts[2]+counts[3])/ids.length*100):0 };\n}\n\nfunction roundHomeworkItems_(subject, roundNumber, unit) {\n  const label = normalizeText_((unit && unit.unitName || '') + (unit && unit.unitNumber || ''));\n  if (roundNumber >= 2) {\n    if (subject === '英語') return label.indexOf('keywordstest') >= 0 ? ['KEYWORDSの暗記'] : ['KEYWORDSの暗記','TRYの赤×直し','エクササイズの赤×直し'];\n    if (subject === '数学') return ['TRYの赤×直し','エクササイズの赤×直し'];\n    return [];\n  }\n  if (subject === '英語') return label.indexOf('keywordstest') >= 0 ? ['巻末のKeyWordsTestの暗記'] : ['KeyWords「☆日→英」暗記','exercise「暗記マーク」暗記','Try赤×直し','exercise','宿題の赤×直し'];\n  if (subject === '数学') return ['TRYの赤×直し','exercise','宿題の赤×直し'];\n  return [];\n}\n`;
gas = replaceOnce(gas, '\nfunction progressionFor_(student, subject, includeUnits) {', roundHelpers + '\nfunction progressionFor_(student, subject, includeUnits) {', 'round helpers before progression');

gas = replaceOnce(
  gas,
  "  const summary = { subject: subject, textbook: source.textbook || '未設定', level: level || '', levelMissing: (subject === '英語' || subject === '数学') && ['1','2','3'].indexOf(text_(level)) < 0, schoolUnitName: schoolUnit && schoolUnit.unitName, forestaUnitName: forestaUnit && forestaUnit.unitName, comparison: comparison, remaining: effective.size ? remainingUnits.length : null, remainingLessons: remainingLessons, requiredPerLesson: required, urgent: urgent, rangeType:decided.size?'決定':predicted.size?'予想':'', nextTest: nextTest };",
  "  const roundState = roundStateForUnits_(student.studentId, subject, units.map(function(unit){return unit.unitId;})), targetIds = effective.size ? effective : new Set();\n  const summary = { subject: subject, textbook: source.textbook || '未設定', level: level || '', levelMissing: (subject === '英語' || subject === '数学') && ['1','2','3'].indexOf(text_(level)) < 0, schoolUnitName: schoolUnit && schoolUnit.unitName, forestaUnitName: forestaUnit && forestaUnit.unitName, comparison: comparison, remaining: effective.size ? remainingUnits.length : null, remainingLessons: remainingLessons, requiredPerLesson: required, urgent: urgent, rangeType:decided.size?'決定':predicted.size?'予想':'', nextTest: nextTest, roundProgress: roundProgressSummary_(roundState, targetIds) };",
  'round summary in progression',
);

gas = replaceOnce(
  gas,
  "  const decorated = units.map(function(unit) { const dates = dateMap[unit.unitId] || []; return Object.assign({}, unit, { omittable: omission_(unit.difficulty, level), learned: dates.length > 0, learnedAt: dates.length ? dates[0].toISOString() : '', relearnedAt: dates.length > 1 ? dates[dates.length - 1].toISOString() : '', lessonDates: dates.map(function(date){return date.toISOString();}), previous: previousIds.has(unit.unitId), schoolPosition: unit.unitId === schoolUnitId, schoolPositionAt: unit.unitId === schoolUnitId && schoolRows.length ? new Date(schoolRows[0]['登録日']).toISOString() : '', predictedOutside: predicted.size > 0 && !predicted.has(unit.unitId), decidedOutside: decided.size > 0 && !decided.has(unit.unitId), ctResult: ctMap[unit.unitId] || '' }); });",
  "  const decorated = units.map(function(unit) { const roundInfo=roundState[unit.unitId]||{}, rounds=[1,2,3].map(function(roundNumber){const item=roundInfo[roundNumber];return{roundNumber:roundNumber,completed:!!item,date:item&&item.date?item.date.toISOString():'',source:item&&item.source||''};}),dates=rounds.filter(function(item){return item.completed;}).map(function(item){return new Date(item.date);}); return Object.assign({}, unit, { omittable: omission_(unit.difficulty, level), learned: dates.length > 0, learnedAt: dates.length ? dates[0].toISOString() : '', relearnedAt: dates.length > 1 ? dates[dates.length - 1].toISOString() : '', lessonDates: dates.map(function(date){return date.toISOString();}), rounds:rounds, completedRounds:rounds.filter(function(item){return item.completed;}).length, previous: previousIds.has(unit.unitId), schoolPosition: unit.unitId === schoolUnitId, schoolPositionAt: unit.unitId === schoolUnitId && schoolRows.length ? new Date(schoolRows[0]['登録日']).toISOString() : '', predictedOutside: predicted.size > 0 && !predicted.has(unit.unitId), decidedOutside: decided.size > 0 && !decided.has(unit.unitId), ctResult: ctMap[unit.unitId] || '' }); });",
  'decorated unit rounds',
);

gas = replaceOnce(
  gas,
  "  const response = { student: student, nextTest: nextTest, scores: scores, targets: targets, homework: homework, note: note, progress: progress };",
  "  const response = { student: student, nextTest: nextTest, scores: scores, targets: targets, homework: homework, note: note, progress: progress, capabilities:{roundProgress:true,outsideRangeOverride:true,studentRoundInput:true,studentHomeworkCardsV2:true} };",
  'dashboard capabilities',
);

gas = replaceOnce(
  gas,
  "  const sc = objects_('宿題の生徒チェック'), tc = objects_('宿題の講師チェック');\n  const unitMap = {}; objects_('単元マスタ').forEach(function(row) { unitMap[text_(row['単元ID'])] = { unitNumber: text_(row['単元番号']), unitName: text_(row['単元名']) }; });",
  "  const sc = objects_('宿題の生徒チェック'), tc = objects_('宿題の講師チェック');\n  const unitMap = {}; objects_('単元マスタ').forEach(function(row) { unitMap[text_(row['単元ID'])] = { unitNumber: text_(row['単元番号']), unitName: text_(row['単元名']) }; });\n  const roundByEvent={}; studentRoundRows_(studentId,'').forEach(function(row){roundByEvent[text_(row['イベントID'])]=Number(row['周回'])||'';});",
  'homework round event map',
);
gas = replaceOnce(
  gas,
  "    return { homeworkId: id, unitId: text_(row['単元ID']), unitNumber: unitMap[text_(row['単元ID'])] && unitMap[text_(row['単元ID'])].unitNumber, unitName: unitMap[text_(row['単元ID'])] && unitMap[text_(row['単元ID'])].unitName, contentType: text_(row['内容種別']), contentText: text_(row['内容本文']), recommendedDueDate: due.toISOString(), studentChecked: !!student && String(student['チェック']).toUpperCase() !== 'FALSE', studentCheckedAt: student && student['チェック日時'], teacherChecked: !!teacher && String(teacher['チェック']).toUpperCase() !== 'FALSE', teacherCheckedAt: teacher && teacher['チェック日時'], overdue: due.getTime() < Date.now() && !(teacher && String(teacher['チェック']).toUpperCase() !== 'FALSE') };",
  "    return { homeworkId: id, lessonId:text_(row['授業ID']), subject:text_(row['科目']), unitId: text_(row['単元ID']), unitNumber: unitMap[text_(row['単元ID'])] && unitMap[text_(row['単元ID'])].unitNumber, unitName: unitMap[text_(row['単元ID'])] && unitMap[text_(row['単元ID'])].unitName, roundNumber:roundByEvent[text_(row['授業ID'])]||'', createdAt:row['作成日時'], contentType: text_(row['内容種別']), contentText: text_(row['内容本文']), recommendedDueDate: due.toISOString(), studentChecked: !!student && String(student['チェック']).toUpperCase() !== 'FALSE', studentCheckedAt: student && student['チェック日時'], teacherChecked: !!teacher && String(teacher['チェック']).toUpperCase() !== 'FALSE', teacherCheckedAt: teacher && teacher['チェック日時'], overdue: due.getTime() < Date.now() && !(teacher && String(teacher['チェック']).toUpperCase() !== 'FALSE') };",
  'homework metadata for student cards',
);

gas = replaceOnce(
  gas,
  "const nextTest=nextTestFor_(student),predicted=rangeIds_('学校別予想テスト範囲',student,subject,nextTest&&nextTest.testId),decided=rangeIds_('学校別決定テスト範囲',student,subject,nextTest&&nextTest.testId),effective=decided.size?decided:predicted;if(student.grade!=='中3'&&effective.size&&ids.some(function(id){return!effective.has(id);}))throw new Error('OUTSIDE_TEST_RANGE');",
  "const nextTest=nextTestFor_(student),predicted=rangeIds_('学校別予想テスト範囲',student,subject,nextTest&&nextTest.testId),decided=rangeIds_('学校別決定テスト範囲',student,subject,nextTest&&nextTest.testId),effective=decided.size?decided:predicted,overrideIds=new Set((data.outsideRangeOverrideUnitIds||[]).map(text_)),outsideIds=effective.size?ids.filter(function(id){return!effective.has(id);}):[];if(student.grade!=='中3'&&outsideIds.some(function(id){return!overrideIds.has(id);}))throw new Error('OUTSIDE_TEST_RANGE');",
  'GAS outside override validation',
);

gas = gas.replace(
  "const specialHomework='巻末のKeyWordsTestの暗記',allowed=subject==='英語'?['KeyWords「☆日→英」暗記','exercise「暗記マーク」暗記','Try赤×直し','exercise','宿題の赤×直し',specialHomework]:subject==='数学'?['TRYの赤×直し','exercise','宿題の赤×直し',specialHomework]:[],",
  "const specialHomework='巻末のKeyWordsTestの暗記',allowed=subject==='英語'?['KeyWords「☆日→英」暗記','exercise「暗記マーク」暗記','Try赤×直し','TRYの赤×直し','exercise','宿題の赤×直し','KEYWORDSの暗記','エクササイズの赤×直し',specialHomework]:subject==='数学'?['TRYの赤×直し','exercise','宿題の赤×直し','エクササイズの赤×直し',specialHomework]:[],",
);

gas = replaceOnce(
  gas,
  "lessonUnitRows=[],homeworkRows=[];due.setDate(due.getDate()+2);",
  "lessonUnitRows=[],homeworkRows=[],roundProgressRows=[],roundState=roundStateForUnits_(student.studentId,subject,ids);due.setDate(due.getDate()+2);",
  'teacher round progress arrays',
);
gas = replaceOnce(
  gas,
  "lessonUnitRows.push({'授業単元ID':uuid_('LESSONUNIT'),'授業ID':lessonId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'実施日':now,'再学習':prior.has(unitId),'作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});unitHomework.forEach(function(type){",
  "lessonUnitRows.push({'授業単元ID':uuid_('LESSONUNIT'),'授業ID':lessonId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'実施日':now,'再学習':prior.has(unitId),'作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});const nextRound=[1,2,3].find(function(round){return!(roundState[unitId]||{})[round];});if(nextRound)roundProgressRows.push({'進捗ID':uuid_('ROUND'),'イベントID':lessonId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'周回':nextRound,'学習日':now,'入力元':'講師授業','作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});unitHomework.forEach(function(type){",
  'teacher explicit round row',
);
gas = replaceOnce(
  gas,
  "appendObjects_('授業実施単元',lessonUnitRows);appendObjects_('宿題',homeworkRows);audit_",
  "appendObjects_('授業実施単元',lessonUnitRows);if(roundProgressRows.length)appendObjects_('生徒周回進捗',roundProgressRows);appendObjects_('宿題',homeworkRows);audit_",
  'append teacher round rows',
);

const studentRoundSave = `\nfunction saveStudentRoundProgress_(data) {\n  const session=requireRole_(data,['student']),student=getActiveStudent_(session.studentId),subject=text_(data.subject),unitId=text_(data.unitId),roundNumber=Number(data.roundNumber),checked=!!data.checked;\n  if(TRACKED_SUBJECTS.indexOf(subject)<0||[1,2,3].indexOf(roundNumber)<0)throw new Error('INVALID_VALUE');\n  const source=unitsFor_(student,subject),unit=source.units.find(function(item){return item.unitId===unitId;});if(!unit)throw new Error('INVALID_UNIT');\n  const nextTest=nextTestFor_(student),predicted=rangeIds_('学校別予想テスト範囲',student,subject,nextTest&&nextTest.testId),decided=rangeIds_('学校別決定テスト範囲',student,subject,nextTest&&nextTest.testId),effective=decided.size?decided:predicted;\n  if(effective.size&&!effective.has(unitId)&&!data.outsideRangeOverride)throw new Error('OUTSIDE_TEST_RANGE');\n  const lock=LockService.getScriptLock();lock.waitLock(30000);try{\n    const roundRows=studentRoundRows_(student.studentId,subject),own=roundRows.find(function(row){return text_(row['単元ID'])===unitId&&Number(row['周回'])===roundNumber&&text_(row['入力元'])==='生徒';}),state=roundStateForUnits_(student.studentId,subject,[unitId]),rounds=state[unitId]||{};\n    if(checked){\n      if(rounds[roundNumber]&&rounds[roundNumber].completed)return{saved:true,rounds:[1,2,3].map(function(r){const item=rounds[r];return{roundNumber:r,completed:!!item,date:item&&item.date?item.date.toISOString():''};}),homeworkCreated:0};\n      if(roundNumber>1&&!(rounds[roundNumber-1]&&rounds[roundNumber-1].completed))throw new Error('ROUND_ORDER');\n      const now=new Date(),eventId=uuid_('SELFROUND');appendObject_('生徒周回進捗',{'進捗ID':uuid_('ROUND'),'イベントID':eventId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'周回':roundNumber,'学習日':now,'入力元':'生徒','作成日時':now,'更新日時':now,'操作者ID':student.studentId,'操作者名':student.name});\n      const items=roundHomeworkItems_(subject,roundNumber,unit),due=new Date(now),rows=[];due.setDate(due.getDate()+2);items.forEach(function(type){rows.push({'宿題ID':uuid_('HW'),'授業ID':eventId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'内容種別':type,'内容本文':type,'推奨完了日':due,'有効':true,'その他':'','冪等キー':eventId+'|'+unitId+'|'+type,'作成日時':now,'更新日時':now,'操作者ID':student.studentId,'操作者名':student.name});});if(rows.length)appendObjects_('宿題',rows);\n      const updated=roundStateForUnits_(student.studentId,subject,[unitId])[unitId]||{};audit_(session,'生徒周回入力','生徒周回進捗',eventId,'成功',subject+' '+roundNumber+'周目');return{saved:true,rounds:[1,2,3].map(function(r){const item=updated[r];return{roundNumber:r,completed:!!item,date:item&&item.date?item.date.toISOString():''};}),homeworkCreated:rows.length};\n    }\n    if(!own)return{saved:true,rounds:[1,2,3].map(function(r){const item=rounds[r];return{roundNumber:r,completed:!!item,date:item&&item.date?item.date.toISOString():''};}),homeworkCreated:0};\n    if(roundNumber<3&&rounds[roundNumber+1]&&rounds[roundNumber+1].completed)throw new Error('ROUND_ORDER');\n    const eventId=text_(own['イベントID']),homeworkIds=objects_('宿題').filter(function(row){return text_(row['授業ID'])===eventId;}).map(function(row){return text_(row['宿題ID']);});\n    if(homeworkIds.length){const ids=new Set(homeworkIds);replaceRows_('宿題の生徒チェック',function(row){return ids.has(text_(row['宿題ID']));},[]);replaceRows_('宿題の講師チェック',function(row){return ids.has(text_(row['宿題ID']));},[]);replaceRows_('宿題',function(row){return text_(row['授業ID'])===eventId;},[]);}\n    replaceRows_('生徒周回進捗',function(row){return text_(row['進捗ID'])===text_(own['進捗ID']);},[]);const updated=roundStateForUnits_(student.studentId,subject,[unitId])[unitId]||{};audit_(session,'生徒周回取消','生徒周回進捗',eventId,'成功',subject+' '+roundNumber+'周目');return{saved:true,rounds:[1,2,3].map(function(r){const item=updated[r];return{roundNumber:r,completed:!!item,date:item&&item.date?item.date.toISOString():''};}),homeworkCreated:0};\n  }finally{lock.releaseLock();}\n}\n`;
gas = replaceOnce(gas, '\nfunction saveCt_(data) {', studentRoundSave + '\nfunction saveCt_(data) {', 'student round save endpoint');

if (!index.includes('id="topAdminEntry"')) throw new Error('top admin entry missing');
if (!app.includes('studentRoundProgressHtml')) throw new Error('round graph missing');
if (!app.includes('saveStudentRoundProgress')) throw new Error('student round API call missing');
if (!app.includes('それでもすすみました')) throw new Error('outside range choice missing');
if (!styles.includes('.studentHomeworkCard')) throw new Error('student homework styles missing');
if (!gas.includes("case 'saveStudentRoundProgress'")) throw new Error('GAS route missing');
if (!gas.includes("capabilities:{roundProgress:true")) throw new Error('GAS capability gate missing');
if (!gas.includes("'生徒周回進捗'")) throw new Error('GAS round sheet missing');

fs.writeFileSync('index.html', index);
fs.writeFileSync('app.js', app);
fs.writeFileSync('styles.css', styles);
fs.writeFileSync('apps-script/Code.gs', gas);
console.log('Applied three-round progress, outside-range confirmation, student homework cards, and admin entry.');
