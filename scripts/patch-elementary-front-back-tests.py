from pathlib import Path
import re

app_path = Path('app.js')
mod_path = Path('elementary-supabase.js')
css_path = Path('elementary-supabase.css')
enh_path = Path('elementary-enhancement.css')
idx_path = Path('index.html')

app = app_path.read_text()
mod = mod_path.read_text()
css = css_path.read_text()
enh = enh_path.read_text()
idx = idx_path.read_text()

# Top test entry: front/back scores in one school unit test.
new_top = r'''function elementaryTopTestEntryHtml(rows){return `<article id="elementaryTopTestEntry" class="card elementaryTopTestEntry"><div><p class="cardTitle">学校の単元テスト入力</p><p class="muted">最近の算数・国語のテストを聞き取り、表面・裏面をまとめて入力します。</p></div><form id="elementaryTopTestForm" class="elementaryTopTestForm"><label>科目<select id="elementaryTopTestSubject" class="field">${rows.map(r=>`<option>${esc(r.subject)}</option>`).join('')}</select></label><label id="elementaryTopTestUnitWrap">大きな単元（章）<select id="elementaryTopTestUnit" class="field"></select></label><label id="elementaryTopTestFreeWrap" class="hidden">単元名<input id="elementaryTopTestFree" class="field" maxlength="80"></label><label class="elementaryFrontScore">表 点数<input id="elementaryTopTestScore" class="field" type="number" min="0" max="999" required></label><label class="elementaryFrontMax">表 満点<input id="elementaryTopTestMax" class="field" type="number" min="1" max="999" value="100"></label><label class="elementaryBackScore">裏 点数<input id="elementaryTopTestBackScore" class="field" type="number" min="0" max="999" required></label><label class="elementaryBackMax">裏 満点<input id="elementaryTopTestBackMax" class="field" type="number" min="1" max="999" value="50"></label><label class="elementaryTopTestDate">テスト日<input id="elementaryTopTestDate" class="field" type="date" value="${dateInputValue(new Date())}"></label><button class="primaryBtn" type="submit">保存</button></form><output id="elementaryTopTestStatus" class="lessonSaveStatus" aria-live="polite"></output></article>`}'''
app, n = re.subn(r'function elementaryTopTestEntryHtml\(rows\)\{.*?\}\nfunction bindElementaryTopTestEntry', new_top + '\nfunction bindElementaryTopTestEntry', app, count=1, flags=re.S)
if n != 1:
    raise SystemExit('top test entry function not replaced')

# The old span7/span5 classes have no base CSS. Use existing responsive span8/span4 classes.
app = app.replace('class="card span7"', 'class="card span8"')
app = app.replace('class="card span5"', 'class="card span4"')
app_path.write_text(app)

# Score formatting used on cards, history and chapter buttons.
helper = r'''
function testScoreText(test) {
  if (!test) return "未登録";
  const front = `表 ${test.score ?? "-"}/${test.max_score || 100}`;
  const hasBack = test.back_score !== null && test.back_score !== undefined && String(test.back_score) !== "";
  const back = hasBack ? `裏 ${test.back_score}/${test.back_max_score || 50}` : "裏 未入力";
  return `${front}・${back}`;
}
'''
if 'function testScoreText(' not in mod:
    mod = mod.replace('function recentTestsHtml(tests) {', helper + '\nfunction recentTestsHtml(tests) {', 1)

new_recent = r'''function recentTestsHtml(tests) {
  const subjectList = (subject) => {
    const rows = (tests || []).filter((t) => normalizeSubject(t.subject) === subject).slice(0, 6);
    if (!rows.length) return '<div class="emptyState compact">まだありません。</div>';
    return `<div class="elementarySubjectTestList">${rows.map((t) => `<div class="elementarySubjectTestRow"><span>${esc(shortDate(t.test_date))}</span><strong>${esc(t.unit_name || "単元テスト")}</strong><b>${esc(testScoreText(t))}</b></div>`).join("")}</div>`;
  };
  const eng = (tests || []).filter((t) => normalizeSubject(t.subject) === "英語").slice(0, 4);
  return `<div class="elementaryRecentTestGrid"><section><h3>算数</h3>${subjectList("算数")}</section><section><h3>国語</h3>${subjectList("国語")}</section></div>${eng.length ? `<details class="elementaryOtherTests"><summary>英語の履歴</summary><div class="elementarySubjectTestList">${eng.map((t) => `<div class="elementarySubjectTestRow"><span>${esc(shortDate(t.test_date))}</span><strong>${esc(t.unit_name || "単元テスト")}</strong><b>${esc(testScoreText(t))}</b></div>`).join("")}</div></details>` : ""}`;
}'''
mod, n = re.subn(r'function recentTestsHtml\(tests\) \{.*?\n\}\n\nfunction replaceRecentHistory', new_recent + '\n\nfunction replaceRecentHistory', mod, count=1, flags=re.S)
if n != 1:
    raise SystemExit('recent tests function not replaced')

mod = re.sub(r'if \(testP\) testP\.innerHTML = `直近の学校単元テスト：\$\{summary\.test \? `<strong class="elementaryScore">\$\{esc\(summary\.test\.score\)\}点</strong>` : "未登録"\}`;',
             'if (testP) testP.innerHTML = `直近の学校単元テスト：${summary.test ? `<strong class="elementaryScore">${esc(testScoreText(summary.test))}</strong>` : "未登録"}`;',
             mod, count=1)

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
  const backScoreEl = form.querySelector("#elementaryTopTestBackScore");
  const backMaxEl = form.querySelector("#elementaryTopTestBackMax");
  const output = document.getElementById("elementaryTopTestStatus");
  if (!subjectEl || !dateEl || !scoreEl || !maxEl || !backScoreEl || !backMaxEl) return;
  subjectEl.innerHTML = subjects.map((subject) => `<option>${esc(subject)}</option>`).join("");
  if (!dateEl.value) dateEl.value = todayJst();
  let groups = [];
  const refresh = async () => {
    const units = await unitsFor(subjectEl.value, dashboard?.student?.grade, dashboard?.student?.englishLevel).catch(() => []);
    groups = chapterGroups(units, subjectEl.value);
    if (unitEl) unitEl.innerHTML = chapterSelectOptions(groups);
    unitWrap?.classList.toggle("hidden", !groups.length);
    freeWrap?.classList.toggle("hidden", !!groups.length);
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
    if (scoreEl.value === "" || backScoreEl.value === "") { if (output) output.textContent = "表面と裏面の点数を入力してください。"; return; }
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
        backScore: backScoreEl.value,
        backMaxScore: backMaxEl.value || 50,
        memo: "",
      });
      if (output) output.textContent = "保存しました。";
      scoreEl.value = "";
      backScoreEl.value = "";
      status("学校の単元テスト（表・裏）を保存しました。");
      await refreshElementaryScreen();
    } catch (error) {
      if (output) output.textContent = error.message;
    } finally { button.disabled = false; }
  };
}'''
mod, n = re.subn(r'async function bindTopTestForm\(dashboard\) \{.*?\n\}\n\nfunction openModal', new_bind + '\n\nfunction openModal', mod, count=1, flags=re.S)
if n != 1:
    raise SystemExit('top binding not replaced')

new_dialog = r'''function openTestDialog({ subject, unit, onSaved }) {
  const dialog = document.createElement("dialog");
  dialog.className = "elementaryUnitTestDialog";
  dialog.innerHTML = `<form method="dialog" class="elementaryUnitTestDialogCard" novalidate><button type="button" class="elementaryDialogClose" aria-label="閉じる">×</button><span class="elementaryKicker">学校の単元テスト</span><h3>${esc(subject)}　${esc(unit?.unitName || "単元テスト")}</h3><label>テスト日<input id="eTestDate" class="field" type="date" value="${todayJst()}"></label><div class="elementaryFaceScores"><fieldset><legend>表面</legend><div class="elementaryScoreInputs"><label>点数<input id="eTestScore" class="field" type="number" min="0" max="999" autofocus></label><label>満点<input id="eTestMax" class="field" type="number" min="1" max="999" value="100"></label></div></fieldset><fieldset><legend>裏面</legend><div class="elementaryScoreInputs"><label>点数<input id="eTestBackScore" class="field" type="number" min="0" max="999"></label><label>満点<input id="eTestBackMax" class="field" type="number" min="1" max="999" value="50"></label></div></fieldset></div><label>メモ<input id="eTestMemo" class="field" maxlength="120"></label><output id="eTestStatus"></output><div class="elementaryDialogActions"><button type="button" class="ghostBtn elementaryDialogCancel">キャンセル</button><button id="eTestSave" class="primaryBtn" type="button">保存</button></div></form>`;
  document.body.appendChild(dialog);
  const close = () => { if (dialog.open) dialog.close(); };
  dialog.querySelector(".elementaryDialogClose").onclick = close;
  dialog.querySelector(".elementaryDialogCancel").onclick = close;
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.querySelector("#eTestSave").onclick = async () => {
    const save = dialog.querySelector("#eTestSave");
    const out = dialog.querySelector("#eTestStatus");
    const score = dialog.querySelector("#eTestScore").value;
    const backScore = dialog.querySelector("#eTestBackScore").value;
    if (score === "" || backScore === "") { out.textContent = "表面と裏面の点数を入力してください。"; return; }
    save.disabled = true;
    out.textContent = "保存しています…";
    try {
      await callElementary("saveUnitTest", {
        subject,
        unitId: unit?.unitId || "",
        unitName: unit?.unitName || "単元テスト",
        testDate: dialog.querySelector("#eTestDate").value || todayJst(),
        score,
        maxScore: dialog.querySelector("#eTestMax").value || 100,
        backScore,
        backMaxScore: dialog.querySelector("#eTestBackMax").value || 50,
        memo: dialog.querySelector("#eTestMemo").value.trim(),
      });
      out.textContent = "保存しました。";
      status("学校の単元テスト（表・裏）を保存しました。");
      setTimeout(() => { close(); onSaved?.(); }, 200);
    } catch (error) {
      out.textContent = error.message;
      save.disabled = false;
    }
  };
  dialog.showModal();
}'''
mod, n = re.subn(r'function openTestDialog\(\{ subject, unit, onSaved \}\) \{.*?\n\}\n\nasync function showInteractiveProgression', new_dialog + '\n\nasync function showInteractiveProgression', mod, count=1, flags=re.S)
if n != 1:
    raise SystemExit('test dialog not replaced')

# Chapter row shows both front/back when already registered.
mod = mod.replace('学校テスト ${esc(groupTest.score)}点', '学校テスト ${esc(testScoreText(groupTest))}')
mod_path.write_text(mod)

css_add = r'''
.elementaryFaceScores{display:grid;grid-template-columns:1fr 1fr;gap:12px}.elementaryFaceScores field{margin:0;padding:12px;border:1px solid #dbe6e2;border-radius:12px;background:#fbfdfc}.elementaryFaceScores legend{padding:0 7px;font-size:.82rem;font-weight:900;color:#185f51}.elementaryScoreInputs{display:grid;grid-template-columns:1fr 1fr;gap:10px}.elementaryDialogActions{display:grid;grid-template-columns:1fr 2fr;gap:10px}.elementaryDialogCancel{min-height:44px}.elementarySubjectTestRow{grid-template-columns:52px minmax(0,1fr) minmax(150px,auto)}.elementarySubjectTestRow strong{min-width:0;overflow-wrap:anywhere}.elementarySubjectTestRow b{text-align:right;white-space:nowrap;font-size:.82rem}.elementaryRecentTestGrid section{min-width:0}.cardGrid>.span8,.cardGrid>.span4{min-width:0}
@media(max-width:700px){.elementaryFaceScores{grid-template-columns:1fr}.elementarySubjectTestRow{grid-template-columns:48px minmax(0,1fr)}.elementarySubjectTestRow b{grid-column:2;text-align:left;white-space:normal}}
'''
if '.elementaryFaceScores{' not in css:
    css += '\n' + css_add
css_path.write_text(css)

enh_add = r'''
/* Elementary top test: subject/chapter + front/back + date */
.elementaryTopTestForm{grid-template-columns:minmax(82px,.65fr) minmax(175px,1.55fr) repeat(4,minmax(72px,.55fr)) minmax(132px,.8fr) auto}
@media(max-width:1120px){.elementaryTopTestForm{grid-template-columns:repeat(4,minmax(0,1fr))}.elementaryTopTestForm #elementaryTopTestUnitWrap{grid-column:span 2}.elementaryTopTestForm .elementaryTopTestDate{grid-column:span 2}}
@media(max-width:720px){.elementaryTopTestForm{grid-template-columns:1fr 1fr}.elementaryTopTestForm #elementaryTopTestUnitWrap,.elementaryTopTestForm .elementaryTopTestDate,.elementaryTopTestForm .primaryBtn{grid-column:1/-1}}
'''
if 'Elementary top test: subject/chapter + front/back + date' not in enh:
    enh += '\n' + enh_add
enh_path.write_text(enh)

idx = re.sub(r'elementary-enhancement\.css\?v=[^"\']+', 'elementary-enhancement.css?v=20260831-4', idx)
idx = re.sub(r'elementary-supabase\.css\?v=[^"\']+', 'elementary-supabase.css?v=20260831-3', idx)
idx = re.sub(r'elementary-supabase\.js\?v=[^"\']+', 'elementary-supabase.js?v=20260831-7', idx)
idx = re.sub(r'app\.js\?v=[^"\']+', 'app.js?v=20260831-elementary-tests-2', idx)
idx_path.write_text(idx)
