from pathlib import Path
import re

js_path = Path('elementary-supabase.js')
css_path = Path('elementary-supabase.css')
index_path = Path('index.html')

s = js_path.read_text()

helper = r'''
function chapterGroups(units, subject = "") {
  const groups = new Map();
  for (const [index, unit] of (units || []).entries()) {
    const raw = String(unit.chapter || String(unit.unitNumber || "").split("-")[0] || index + 1).trim();
    if (!groups.has(raw)) {
      groups.set(raw, {
        key: raw,
        unitId: `chapter:${normalizeSubject(subject)}:${raw}`,
        unitName: `第${raw}章 ${unit.unitName || "単元テスト"}`,
        title: unit.unitName || `第${raw}章`,
        units: [],
      });
    }
    groups.get(raw).units.push(unit);
  }
  return [...groups.values()];
}

function chapterSelectOptions(groups, selected = "") {
  return '<option value="">大きな単元（章）を選ぶ</option>' + groups.map((g) => `<option value="${esc(g.unitId)}" ${g.unitId === selected ? "selected" : ""}>${esc(g.unitName)}</option>`).join("");
}
'''

if 'function chapterGroups(' not in s:
    s = s.replace('async function bindTopTestForm(dashboard) {', helper + '\nasync function bindTopTestForm(dashboard) {', 1)

new_bind = r'''async function bindTopTestForm(dashboard) {
  const session = readSession();
  if (!document.querySelector(".elementaryTeacherGuide") && !isTeacherContext(session)) return;
  const form = document.getElementById("elementaryTopTestForm");
  if (!form) return;
  const subjects = enrolledSubjects(dashboard);
  const subjectEl = form.querySelector("#elementaryTopTestSubject");
  const unitEl = form.querySelector("#elementaryTopTestUnit");
  const unitWrap = form.querySelector("#elementaryTopTestUnitWrap");
  const freeWrap = form.querySelector("#elementaryTopTestFreeWrap");
  const dateEl = form.querySelector("#elementaryTopTestDate");
  const scoreEl = form.querySelector("#elementaryTopTestScore");
  const maxEl = form.querySelector("#elementaryTopTestMax");
  const output = document.getElementById("elementaryTopTestStatus");
  if (!subjectEl || !dateEl || !scoreEl || !maxEl) return;
  subjectEl.innerHTML = subjects.map((subject) => `<option>${esc(subject)}</option>`).join("");
  if (!dateEl.value) dateEl.value = todayJst();
  let groups = [];
  const refresh = async () => {
    const units = await unitsFor(subjectEl.value, dashboard?.student?.grade, dashboard?.student?.englishLevel).catch(() => []);
    groups = chapterGroups(units, subjectEl.value);
    if (unitEl) unitEl.innerHTML = chapterSelectOptions(groups);
    unitWrap?.classList.toggle("hidden", !groups.length);
    freeWrap?.classList.toggle("hidden", !!groups.length);
    const unitLabel = unitWrap?.querySelector('label') || unitWrap;
    if (unitLabel && unitWrap) unitWrap.childNodes[0] && (unitWrap.childNodes[0].textContent = '大きな単元（章）');
  };
  subjectEl.onchange = refresh;
  await refresh();
  form.onsubmit = async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const button = form.querySelector('button[type="submit"]');
    const hasGroups = unitWrap && !unitWrap.classList.contains("hidden");
    const selected = hasGroups ? groups.find((g) => g.unitId === unitEl?.value) : null;
    const unitName = selected?.unitName || form.querySelector("#elementaryTopTestFree")?.value.trim() || "";
    if (!unitName) { if (output) output.textContent = "大きな単元（章）を選んでください。"; return; }
    button.disabled = true;
    if (output) output.textContent = "保存しています…";
    try {
      await callElementary("saveUnitTest", {
        subject: normalizeSubject(subjectEl.value),
        unitId: selected?.unitId || "",
        unitName,
        testDate: dateEl.value || todayJst(),
        score: scoreEl.value,
        maxScore: maxEl.value || 100,
        memo: "",
      });
      if (output) output.textContent = "保存しました。";
      scoreEl.value = "";
      status("学校の単元テストを保存しました。");
      await refreshElementaryScreen();
    } catch (error) {
      if (output) output.textContent = error.message;
    } finally { button.disabled = false; }
  };
}
'''

s, n = re.subn(r'async function bindTopTestForm\(dashboard\) \{.*?\n\}\n\nfunction openModal', new_bind + '\nfunction openModal', s, count=1, flags=re.S)
if n != 1:
    raise SystemExit('bindTopTestForm block not replaced')

new_progress = r'''async function showInteractiveProgression(subject, forceTeacher = false) {
  const dashboard = lastDashboard || await loadDashboard().catch(() => null);
  const session = readSession();
  const grade = dashboard?.student?.grade || session?.grade || "";
  const level = dashboard?.student?.englishLevel || "";
  const normalized = normalizeSubject(subject);
  openModal('<div class="loadingCard"><span class="spinner"></span><p>進行表を読み込み中です…</p></div>');
  try {
    const units = await unitsFor(normalized, grade, level);
    if (!units.length) throw new Error(normalized === "国語" ? "国語の進行表は、NEW小学ワーク・漢字ドリルの進行表登録後に使用できます。" : "進行表を確認できませんでした。");
    const data = await loadElementaryData(true);
    const summary = summaryFor(normalized, units, data);
    const source = normalized === "算数" ? "啓林館" : `フォレスタ小学英語 ${englishKey(level) || ""}`.trim();
    const today = todayJst();
    const teacher = forceTeacher || isTeacherContext(session);
    const groups = chapterGroups(units, normalized);
    const todaySet = new Set((data.lessonProgress || []).filter((r) => normalizeSubject(r.subject) === normalized && r.lesson_date === today).map((r) => r.unit_id));
    const lessonDates = new Map();
    for (const row of data.lessonProgress || []) {
      if (normalizeSubject(row.subject) !== normalized) continue;
      if (!lessonDates.has(row.unit_id)) lessonDates.set(row.unit_id, []);
      lessonDates.get(row.unit_id).push(row.lesson_date);
    }
    const testMap = new Map();
    for (const row of data.unitTests || []) {
      if (normalizeSubject(row.subject) !== normalized) continue;
      if (!testMap.has(row.unit_id)) testMap.set(row.unit_id, row);
    }

    let tableRows = "";
    for (const group of groups) {
      const groupTest = testMap.get(group.unitId);
      tableRows += `<tr class="elementaryChapterRow"><td colspan="3"><span>第${esc(group.key)}章</span><strong>${esc(group.title)}</strong></td>${teacher ? `<td></td><td></td><td><button type="button" class="elementaryChapterTest" data-action="chapter-test" data-chapter="${esc(group.key)}">${groupTest ? `学校テスト ${esc(groupTest.score)}点` : "学校テスト入力"}</button></td>` : `<td>${groupTest ? `学校テスト ${esc(groupTest.score)}点` : ""}</td>`}</tr>`;
      for (const u of group.units) {
        const dates = (lessonDates.get(u.unitId) || []).sort().reverse();
        const learned = dates.length > 0;
        const school = u.unitId === summary.school?.unit_id;
        tableRows += `<tr class="${learned ? "elementaryLearned" : ""} ${school ? "elementarySchoolCurrent" : ""}" data-unit="${esc(u.unitId)}"><td>${esc(u.unitNumber || "")}</td><td><strong>${esc(u.unitName || "")}</strong>${dates.length ? `<small class="elementaryLessonDates">授業 ${dates.slice(0,3).map(shortDate).join("・")}</small>` : ""}</td><td>${esc(u.page || "")}</td>${teacher ? `<td><label class="elementaryTodayToggle"><input type="checkbox" data-action="today" data-unit="${esc(u.unitId)}" ${todaySet.has(u.unitId) ? "checked" : ""}><span>${todaySet.has(u.unitId) ? "✓ 今日" : "今日"}</span></label></td><td><button type="button" class="elementarySchoolPin ${school ? "active" : ""}" data-action="school" data-unit="${esc(u.unitId)}">${school ? "🏫 学校" : "🏫"}</button></td><td class="elementaryChapterTestBlank">—</td>` : `<td>${learned ? "学習済" : ""}${school ? " / 🏫学校" : ""}</td>`}</tr>`;
      }
    }

    openModal(`<div class="elementaryStaticProgress interactive"><div class="elementaryStaticHead"><span class="elementaryKicker">小学生進行表</span><h2>${esc(normalizeGrade(grade))} ${esc(normalized)} / ${esc(source)}</h2><p>${teacher ? "今日の塾進度と学校進度は小単元ごと、学校の単元テストは大きな単元（章）ごとに入力します。" : "学校と塾の現在地を確認できます。"}</p><div class="elementaryProgressSummary"><span>学校 <b>${esc(summary.schoolUnit?.unitName || "未入力")}</b></span><span>塾 <b>${esc(summary.jukuUnit?.unitName || "未入力")}</b></span><strong class="elementaryDifference ${summary.diff == null ? "unset" : summary.diff > 0 ? "ahead" : summary.diff < 0 ? "behind" : "same"}">${esc(summary.label)}</strong></div></div><div class="elementaryStaticTableWrap"><table class="elementaryStaticTable interactive"><thead><tr><th>番号</th><th>単元</th><th>ページ</th>${teacher ? "<th>今日</th><th>学校</th><th>学校単元テスト</th>" : "<th>記録</th>"}</tr></thead><tbody>${tableRows}</tbody></table></div></div>`);
    if (!teacher) return;
    const body = document.getElementById("modalBody");
    body.querySelectorAll('[data-action="today"]').forEach((input) => input.onchange = async () => {
      input.disabled = true;
      try {
        await callElementary("toggleLesson", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, checked: input.checked });
        status(input.checked ? "今日の進行を保存しました。" : "今日の進行を取り消しました。");
        await showInteractiveProgression(normalized, teacher);
        await refreshElementaryScreen(false);
      } catch (error) {
        input.checked = !input.checked;
        input.disabled = false;
        status(error.message, true);
      }
    });
    body.querySelectorAll('[data-action="school"]').forEach((button) => button.onclick = async () => {
      button.disabled = true;
      try {
        await callElementary("saveSchoolPosition", { subject: normalized, unitId: button.dataset.unit, recordedDate: today });
        status("学校の現在地を保存しました。");
        await showInteractiveProgression(normalized, teacher);
        await refreshElementaryScreen(false);
      } catch (error) {
        button.disabled = false;
        status(error.message, true);
      }
    });
    body.querySelectorAll('[data-action="chapter-test"]').forEach((button) => button.onclick = () => {
      const group = groups.find((g) => g.key === button.dataset.chapter);
      if (!group) return;
      openTestDialog({ subject: normalized, unit: { unitId: group.unitId, unitName: group.unitName }, onSaved: async () => { await showInteractiveProgression(normalized, teacher); await refreshElementaryScreen(false); } });
    });
  } catch (error) {
    openModal(`<div class="card dangerCard"><h2>進行表を表示できませんでした</h2><p>${esc(error.message)}</p></div>`);
  }
}
'''

s, n = re.subn(r'async function showInteractiveProgression\(subject, forceTeacher = false\) \{.*?\n\}\n\nfunction ensureExtraDetails', new_progress + '\nfunction ensureExtraDetails', s, count=1, flags=re.S)
if n != 1:
    raise SystemExit('showInteractiveProgression block not replaced')

# Card-level unit-test button should open the progression table where chapter-level test buttons live.
pattern = re.compile(r'const testButton = event\.target\.closest\("\.elementaryTestEntry"\);.*?\n  \}', re.S)
replacement = '''const testButton = event.target.closest(".elementaryTestEntry");
  if (testButton && document.querySelector(".elementaryKicker")) {
    const subject = normalizeSubject(testButton.dataset.subject || testButton.closest(".elementarySubjectCard")?.querySelector(".subjectPill")?.textContent);
    event.preventDefault();
    event.stopImmediatePropagation();
    showInteractiveProgression(subject, true);
  }'''
s, n = pattern.subn(replacement, s, count=1)
if n != 1:
    raise SystemExit('test button handler not replaced')

js_path.write_text(s)

css = css_path.read_text()
css_add = r'''
.elementaryChapterRow td{background:#edf7f4!important;border-top:2px solid #b8d8cf!important;border-bottom:1px solid #cfe3dd!important;vertical-align:middle!important}.elementaryChapterRow td:first-child{padding:11px 12px!important}.elementaryChapterRow td:first-child span{display:inline-block;margin-right:8px;padding:4px 8px;border-radius:999px;background:#d8eee8;color:#176452;font-size:.76rem;font-weight:900}.elementaryChapterRow td:first-child strong{font-size:1rem;color:#163f36}.elementaryChapterTest{border:1px solid #79b9aa;border-radius:9px;background:#e9f8f4;color:#116651;padding:7px 10px;font-size:.78rem;font-weight:900;cursor:pointer;white-space:nowrap}.elementaryChapterTest:hover{background:#dff3ed}.elementaryChapterTestBlank{color:#a5b1ad!important}
'''
if '.elementaryChapterRow td{' not in css:
    css += css_add
css_path.write_text(css)

index = index_path.read_text()
index = re.sub(r'elementary-supabase\.js\?v=[^"\']+', 'elementary-supabase.js?v=20260831-5', index)
index = re.sub(r'elementary-supabase\.css\?v=[^"\']+', 'elementary-supabase.css?v=20260831-2', index)
index_path.write_text(index)
