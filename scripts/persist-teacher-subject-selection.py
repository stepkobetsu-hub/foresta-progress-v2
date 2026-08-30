from pathlib import Path
import re

app_path=Path('app.js')
idx_path=Path('index.html')
css_path=Path('styles.css')
app=app_path.read_text()
idx=idx_path.read_text()
css=css_path.read_text()

# Add a dedicated storage key for the subject selected for each teacher/student pair.
app=app.replace('teacherSelection: "forestaTeacherLessonSelection" }','teacherSelection: "forestaTeacherLessonSelection", teacherSubjects: "forestaTeacherSubjectSelection" }',1)

# Replace the heuristic-only homework subject filter with an explicit, persisted lesson-subject selection.
start=app.index('let teacherHomeworkSubjectMemory = "";')
end=app.index('function renderShell()', start)
block=r'''let teacherHomeworkSubjectMemory = "";
function homeworkSubjectKey(value) {
  const s = String(value || "").trim();
  return s === "数学" || s === "算数" ? "MATH" : s;
}
function teacherSubjectStorageKey(studentId = state.activeStudentId) {
  return `${String(state.session?.loginId || "teacher")}|${String(studentId || "")}`;
}
function teacherSubjectStore() {
  try { return JSON.parse(localStorage.getItem(KEYS.teacherSubjects) || "{}") || {}; }
  catch (_) { return {}; }
}
function savedTeacherSubject(studentId = state.activeStudentId, choices = []) {
  const value = String(teacherSubjectStore()[teacherSubjectStorageKey(studentId)] || "");
  if (!value) return "";
  if (!choices?.length) return value;
  return choices.includes(value) ? value : "";
}
function rememberTeacherSubject(subject, studentId = state.activeStudentId) {
  const value = String(subject || "").trim();
  teacherHomeworkSubjectMemory = value;
  if (!studentId) return;
  const store = teacherSubjectStore();
  const key = teacherSubjectStorageKey(studentId);
  if (value) store[key] = value;
  else delete store[key];
  localStorage.setItem(KEYS.teacherSubjects, JSON.stringify(store));
}
function clearTeacherSubjectsForCurrentLesson() {
  const store = teacherSubjectStore();
  const prefix = `${String(state.session?.loginId || "teacher")}|`;
  for (const student of state.selectedStudents || []) delete store[`${prefix}${String(student.studentId || "")}`];
  localStorage.setItem(KEYS.teacherSubjects, JSON.stringify(store));
  teacherHomeworkSubjectMemory = "";
}
function currentTeacherHomeworkSubject() {
  if (state.role !== "teacher") return "";
  const explicit = document.getElementById("lessonSubject") || document.getElementById("elementaryLessonSubject");
  if (explicit) {
    const value = String(explicit.value || "").trim();
    teacherHomeworkSubjectMemory = value;
    return value;
  }
  const saved = savedTeacherSubject(state.activeStudentId);
  if (saved) teacherHomeworkSubjectMemory = saved;
  return saved || teacherHomeworkSubjectMemory || "";
}
function applyTeacherHomeworkSubjectFilter() {
  if (state.role !== "teacher") return;
  const selected = currentTeacherHomeworkSubject();
  const cards = [...document.querySelectorAll(".teacherHomeworkCard,.archivedHomeworkCard")];
  const prompts = [...document.querySelectorAll(".teacherHomeworkSubjectPrompt")];
  prompts.forEach((node) => node.classList.toggle("hidden", !!selected));
  if (!selected) {
    cards.forEach((card) => card.classList.add("hidden"));
    return;
  }
  const wanted = homeworkSubjectKey(selected);
  cards.forEach((card) => {
    const pill = card.querySelector(".subjectPill")?.textContent || "";
    card.classList.toggle("hidden", homeworkSubjectKey(pill) !== wanted);
  });
}
document.addEventListener("change", (event) => {
  if (state.role !== "teacher" || event.target?.tagName !== "SELECT") return;
  if (!["lessonSubject","elementaryLessonSubject"].includes(event.target.id)) return;
  rememberTeacherSubject(event.target.value, state.activeStudentId);
  queueMicrotask(applyTeacherHomeworkSubjectFilter);
});
const teacherHomeworkFilterObserver = new MutationObserver(() => queueMicrotask(applyTeacherHomeworkSubjectFilter));
teacherHomeworkFilterObserver.observe(document.documentElement, { childList: true, subtree: true });

'''
app=app[:start]+block+app[end:]

# Clear subject choices when the explicit "授業終了" action is used, but keep them through reloads/saves.
old='''function endTeacherLesson() {\n  localStorage.removeItem(KEYS.teacherSelection);'''
new='''function endTeacherLesson() {\n  clearTeacherSubjectsForCurrentLesson();\n  localStorage.removeItem(KEYS.teacherSelection);'''
if old not in app: raise SystemExit('endTeacherLesson anchor missing')
app=app.replace(old,new,1)

# Middle-school teacher view: require selection, restore it per student, and keep it through rerenders.
old='''  const orderedSubjects = [...new Set([...(data.student.subjects || []), ...SUBJECTS])];'''
new='''  const orderedSubjects = [...new Set([...(data.student.subjects || []), ...SUBJECTS])];\n  const savedLessonSubject = savedTeacherSubject(studentId, orderedSubjects);'''
if old not in app: raise SystemExit('orderedSubjects anchor missing')
app=app.replace(old,new,1)

old='''<select id="lessonSubject" class="field" aria-label="科目">${orderedSubjects.map((s) => `<option>${esc(s)}</option>`).join("")}</select>'''
new='''<select id="lessonSubject" class="field" aria-label="科目"><option value="">科目を選択してください</option>${orderedSubjects.map((s) => `<option ${s === savedLessonSubject ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>'''
if old not in app: raise SystemExit('lessonSubject html missing')
app=app.replace(old,new,1)

old='''<div class="homeworkList">${homeworkHtml(data.homework || [], "teacher")}</div>'''
new='''<p class="teacherHomeworkSubjectPrompt ${savedLessonSubject ? "hidden" : ""}">科目を選択すると、その科目の宿題だけを表示します。</p><div class="homeworkList">${homeworkHtml(data.homework || [], "teacher")}</div>'''
if old not in app: raise SystemExit('middle homework list anchor missing')
app=app.replace(old,new,1)

old='''  const prefetchCurrentProgression = () => prefetchProgression({ subject: $("lessonSubject").value, mode: "lesson", studentId });\n  $("lessonSubject").onchange = prefetchCurrentProgression;\n  prefetchCurrentProgression();'''
new='''  const prefetchCurrentProgression = () => { const subject = $("lessonSubject").value; if (subject) prefetchProgression({ subject, mode: "lesson", studentId }); };\n  $("lessonSubject").onchange = () => { rememberTeacherSubject($("lessonSubject").value, studentId); prefetchCurrentProgression(); applyTeacherHomeworkSubjectFilter(); };\n  if ($("lessonSubject").value) { rememberTeacherSubject($("lessonSubject").value, studentId); prefetchCurrentProgression(); }\n  applyTeacherHomeworkSubjectFilter();'''
if old not in app: raise SystemExit('middle lesson onchange anchor missing')
app=app.replace(old,new,1)

# Prevent opening a progression without an explicit subject.
old='''  $("inputLesson").onclick = () => openProgress({ subject: $("lessonSubject").value, mode: "lesson", studentId, teacherId: $("lessonTeacher").value });'''
new='''  $("inputLesson").onclick = () => { const subject = $("lessonSubject").value; if (!subject) return status("科目を選択してください。", true); rememberTeacherSubject(subject, studentId); openProgress({ subject, mode: "lesson", studentId, teacherId: $("lessonTeacher").value }); };'''
if old not in app: raise SystemExit('inputLesson anchor missing')
app=app.replace(old,new,1)

# Rewrite elementary teacher renderer with an explicit lesson subject selector and persistent filtering.
pat=r'function renderElementaryTeacherStudent\(data,studentId\)\{.*?\nfunction openElementaryUnitTestForm'
m=re.search(pat,app,flags=re.S)
if not m: raise SystemExit('elementary renderer block missing')
replacement=r'''function renderElementaryTeacherStudent(data,studentId){
  const rows=elementaryCoreRows(data), summary=homeworkCompletionSummary(data.homework||[]), teachers=(data.teacherCandidates||[]).map(t=>`<option value="${esc(t.loginId)}" ${String(t.loginId)===String(state.session.loginId)?"selected":""}>${esc(t.name)}</option>`).join('');
  const lessonSubjects=rows.map(r=>r.subject);
  const savedLessonSubject=savedTeacherSubject(studentId,lessonSubjects);
  $("content").innerHTML=`${selectedTabsHtml()}<header class="pageHead"><div><span class="elementaryKicker">小学生</span><h1>${esc(data.student.name)}</h1><p>${esc(data.student.studentId)} / ${esc(data.student.campus)} / ${esc(data.student.grade)} / ${esc(data.student.school||"学校未登録")}</p></div></header><article class="card elementaryTeacherGuide"><strong>授業前に確認</strong><span>①学校はどこまで進んだか　②最近の学校単元テストは何点だったか　③次回のテストはいつありそうか？</span></article>${elementaryTopTestEntryHtml(rows)}<div class="elementaryTeacherToolbar"><label>科目<select id="elementaryLessonSubject" class="field"><option value="">科目を選択してください</option>${lessonSubjects.map(s=>`<option ${s===savedLessonSubject?"selected":""}>${esc(s)}</option>`).join('')}</select></label><label>担当講師<select id="elementaryLessonTeacher" class="field">${teachers}</select></label><button id="correctElementaryLesson" class="ghostBtn">宿題・進行表を訂正</button></div><section class="elementaryProgressGrid">${rows.map(r=>`<article class="card elementarySubjectCard ${subjectProgressClass(r.subject)}" data-lesson-subject="${esc(r.subject)}"><div class="elementaryCardHead"><span class="subjectPill">${esc(r.subject)}</span><strong class="elementaryDifference ${elementaryDiffClass(r.differenceUnits)}">${esc(r.differenceLabel||"未設定")}</strong></div><label class="elementarySchoolSelect">学校の現在地<select class="field elementarySchoolPosition" data-subject="${esc(r.subject)}">${elemOptions(r)}</select><small>選ぶと自動保存</small></label><p><small>塾の現在地</small><br><strong>${esc(r.forestaUnitName||"未入力")}</strong></p><div class="actionRow"><button class="secondaryBtn elementaryOpenProgress" data-subject="${esc(r.subject)}">進行表を開く</button><button class="ghostBtn elementaryTestEntry" data-subject="${esc(r.subject)}">単元テスト入力</button></div></article>`).join('')}</section><section class="cardGrid"><article class="card span12"><p class="cardTitle">最近の学校単元テスト</p>${elementaryRecentTestsHtml(data.elementary?.unitTests||[])}</article><article class="card span12"><div class="homeworkPanelHead"><p class="cardTitle">前回宿題</p><button id="openTeacherHomeworkArchive" class="ghostBtn">アーカイブ</button></div><p class="muted">完了 ${summary.completed}/${summary.total}</p><p class="teacherHomeworkSubjectPrompt ${savedLessonSubject?"hidden":""}">科目を選択すると、その科目の宿題だけを表示します。</p><div class="homeworkList">${homeworkHtml(data.homework||[],"teacher")}</div></article></section>`;
  bindSelectedTabs();
  bindElementaryTopTestEntry(data,studentId,rows);
  const lessonSubject=$("elementaryLessonSubject");
  const applyLessonSubject=()=>{
    const subject=lessonSubject?.value||"";
    rememberTeacherSubject(subject,studentId);
    $("content").querySelectorAll('.elementarySubjectCard').forEach(card=>card.classList.toggle('lessonSubjectSelected',!!subject&&card.dataset.lessonSubject===subject));
    applyTeacherHomeworkSubjectFilter();
  };
  if(lessonSubject){ lessonSubject.onchange=applyLessonSubject; if(lessonSubject.value) rememberTeacherSubject(lessonSubject.value,studentId); }
  applyLessonSubject();
  $("content").querySelectorAll(".elementaryOpenProgress").forEach(b=>b.onclick=()=>{const subject=b.dataset.subject;if(lessonSubject)lessonSubject.value=subject;rememberTeacherSubject(subject,studentId);applyLessonSubject();openProgress({subject,mode:"lesson",studentId,teacherId:$("elementaryLessonTeacher")?.value||state.session.loginId})});
  $("content").querySelectorAll(".elementarySchoolPosition").forEach(s=>s.onchange=async()=>{if(!s.value)return;s.disabled=true;try{await api("saveSchoolPosition",{studentId,subject:s.dataset.subject,unitId:s.value,recordedDate:dateInputValue(new Date())},{silent:true});delete state.teacherStudentCache[String(studentId)];state.dashboard=null;status("学校進度を保存しました。");await renderTeacherStudent(studentId,{force:true})}catch(e){status(e.message,true);s.disabled=false}});
  $("content").querySelectorAll(".elementaryTestEntry").forEach(b=>b.onclick=()=>openElementaryUnitTestForm(data,studentId,b.dataset.subject));
  $("correctElementaryLesson")?.addEventListener("click",()=>openLessonCorrection(studentId));
  bindTeacherHomeworkChecks();bindHomeworkArchiveActions("teacher");$("openTeacherHomeworkArchive")?.addEventListener("click",()=>{state.activeView="selectedArchive";openView("selectedArchive")});
}
function openElementaryUnitTestForm'''
app=app[:m.start()]+replacement+app[m.end():]

# Add small visual treatment for the explicit elementary lesson subject.
css_add='''\n/* Keep the teacher's selected lesson subject visible and stable across saves/reloads. */\n.teacherHomeworkSubjectPrompt{margin:8px 0 12px;padding:9px 11px;border-radius:10px;background:#fff8df;color:#7a5a00;font-size:.78rem;font-weight:800}\n.elementaryTeacherToolbar label{display:grid;gap:5px;font-size:.78rem;font-weight:800;color:#435b55}.elementaryTeacherToolbar #elementaryLessonSubject{min-width:150px}\n.elementarySubjectCard.lessonSubjectSelected{box-shadow:0 0 0 3px rgba(15,118,110,.16),0 8px 26px rgba(23,32,31,.055)}\n'''
if 'Keep the teacher\'s selected lesson subject visible' not in css: css += css_add

idx=re.sub(r'app\.js\?v=[^"\']+','app.js?v=20260831-subject-persist-1',idx,count=1)
idx=re.sub(r'styles\.css\?v=[^"\']+','styles.css?v=20260831-subject-persist-1',idx,count=1)

app_path.write_text(app)
idx_path.write_text(idx)
css_path.write_text(css)
