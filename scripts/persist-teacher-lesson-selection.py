from pathlib import Path
import re

app_path = Path('app.js')
css_path = Path('styles.css')
idx_path = Path('index.html')

app = app_path.read_text()
css = css_path.read_text()
idx = idx_path.read_text()

# Add persistent teacher-lesson selection storage key.
old_keys = 'const KEYS = { local: "forestaProgressAuth", session: "forestaProgressSession", admin: "forestaProgressAdmin", device: "forestaDeviceMode", dashboard: "forestaProgressDashboardCache" };'
new_keys = 'const KEYS = { local: "forestaProgressAuth", session: "forestaProgressSession", admin: "forestaProgressAdmin", device: "forestaDeviceMode", dashboard: "forestaProgressDashboardCache", teacherSelection: "forestaTeacherLessonSelection" };'
if old_keys not in app:
    raise SystemExit('KEYS anchor not found')
app = app.replace(old_keys, new_keys, 1)

# Add helpers near admin session persistence.
anchor = '''function persistAdminSession() {\n  localStorage.setItem(KEYS.admin, JSON.stringify({ session: state.session, adminToken: state.adminToken }));\n}\n'''
helpers = '''function persistAdminSession() {\n  localStorage.setItem(KEYS.admin, JSON.stringify({ session: state.session, adminToken: state.adminToken }));\n}\n\nfunction persistTeacherLessonSelection() {\n  if (state.role !== "teacher" || !state.session) return;\n  const payload = {\n    teacherLoginId: String(state.session.loginId || ""),\n    selectedStudents: state.selectedStudents.slice(0, 2),\n    activeStudentId: String(state.activeStudentId || ""),\n  };\n  localStorage.setItem(KEYS.teacherSelection, JSON.stringify(payload));\n}\n\nfunction restoreTeacherLessonSelection() {\n  if (state.role !== "teacher" || !state.session) return;\n  try {\n    const saved = JSON.parse(localStorage.getItem(KEYS.teacherSelection) || "null");\n    if (!saved || String(saved.teacherLoginId || "") !== String(state.session.loginId || "")) return;\n    const rows = Array.isArray(saved.selectedStudents)\n      ? saved.selectedStudents.filter((student) => student && student.studentId).slice(0, 2)\n      : [];\n    state.selectedStudents = rows;\n    const requested = String(saved.activeStudentId || "");\n    state.activeStudentId = rows.some((student) => String(student.studentId) === requested)\n      ? requested\n      : (rows[0] ? String(rows[0].studentId) : "");\n    if (state.activeStudentId) state.activeView = "selected";\n  } catch (_) {}\n}\n\nfunction endTeacherLesson() {\n  localStorage.removeItem(KEYS.teacherSelection);\n  state.selectedStudents = [];\n  state.activeStudentId = "";\n  state.teacherStudentCache = {};\n  state.dashboard = null;\n  window.__FORESTA_ACTIVE_DASHBOARD__ = null;\n  state.activeView = "search";\n  openView("search");\n}\n'''
if anchor not in app:
    raise SystemExit('persistAdminSession anchor not found')
app = app.replace(anchor, helpers, 1)

# Render top mode indicator and lesson-end button from the actual live role.
shell_anchor = '''  $("topAdminEntry")?.classList.remove("hidden");\n  $("loginView").classList.add("hidden");'''
shell_repl = '''  $("topAdminEntry")?.classList.remove("hidden");\n  const modeIndicator = $("modeIndicator");\n  if (modeIndicator) {\n    modeIndicator.classList.remove("hidden");\n    modeIndicator.querySelectorAll("[data-mode]").forEach((item) => {\n      item.classList.toggle("active", item.dataset.mode === state.role);\n    });\n  }\n  const lessonEndButton = $("lessonEndButton");\n  if (lessonEndButton) {\n    lessonEndButton.classList.toggle("hidden", state.role !== "teacher");\n    lessonEndButton.onclick = state.role === "teacher" ? () => {\n      if (!confirm("授業を終了して、選択中の生徒をすべて閉じますか？")) return;\n      endTeacherLesson();\n    } : null;\n  }\n  $("loginView").classList.add("hidden");'''
if shell_anchor not in app:
    raise SystemExit('renderShell anchor not found')
app = app.replace(shell_anchor, shell_repl, 1)

# Persist selection whenever a student is selected.
select_anchor = '''  state.activeStudentId = String(student.studentId);\n  state.activeView = "selected";\n  openView("selected");\n}'''
select_repl = '''  state.activeStudentId = String(student.studentId);\n  state.activeView = "selected";\n  persistTeacherLessonSelection();\n  openView("selected");\n}'''
if select_anchor not in app:
    raise SystemExit('selectStudent anchor not found')
app = app.replace(select_anchor, select_repl, 1)

# Individual student tabs are no longer removable; only the lesson-end button clears them.
old_tabs = '''function selectedTabsHtml() {\n  if (!state.selectedStudents.length) return "";\n  return `<div class="studentTabs">${state.selectedStudents.map((student) => `<div class="studentTabWrap ${String(student.studentId) === state.activeStudentId ? "active" : ""}"><button class="studentTab" data-id="${esc(student.studentId)}">${esc(student.name)}</button><button class="studentTabClose" data-id="${esc(student.studentId)}" data-name="${esc(student.name)}" type="button" aria-label="${esc(student.name)}さんを選択から外す">×</button></div>`).join("")}</div>`;\n}\n\nfunction bindSelectedTabs() {\n  $("content").querySelectorAll(".studentTab").forEach((button) => button.onclick = () => activateTeacherStudent(button.dataset.id));\n  $("content").querySelectorAll(".studentTabClose").forEach((button) => button.onclick = () => {\n    if (!confirm(`${button.dataset.name}さんを選択から外して、生徒を選び直しますか？`)) return;\n    state.selectedStudents = state.selectedStudents.filter((student) => String(student.studentId) !== button.dataset.id);\n    delete state.teacherStudentCache[button.dataset.id];\n    state.activeStudentId = "";\n    state.activeView = "search";\n    openView("search");\n  });\n}'''
new_tabs = '''function selectedTabsHtml() {\n  if (!state.selectedStudents.length) return "";\n  return `<div class="studentTabs">${state.selectedStudents.map((student) => `<div class="studentTabWrap ${String(student.studentId) === state.activeStudentId ? "active" : ""}"><button class="studentTab" data-id="${esc(student.studentId)}">${esc(student.name)}</button></div>`).join("")}</div>`;\n}\n\nfunction bindSelectedTabs() {\n  $("content").querySelectorAll(".studentTab").forEach((button) => button.onclick = () => activateTeacherStudent(button.dataset.id));\n}'''
if old_tabs not in app:
    raise SystemExit('selectedTabs block not found')
app = app.replace(old_tabs, new_tabs, 1)

# Persist which selected student is active when switching tabs.
activate_anchor = '''function activateTeacherStudent(studentId) {\n  state.activeStudentId = String(studentId);\n  state.activeView = "selected";\n  renderShell();'''
activate_repl = '''function activateTeacherStudent(studentId) {\n  state.activeStudentId = String(studentId);\n  state.activeView = "selected";\n  persistTeacherLessonSelection();\n  renderShell();'''
if activate_anchor not in app:
    raise SystemExit('activateTeacherStudent anchor not found')
app = app.replace(activate_anchor, activate_repl, 1)

# After a teacher session is resumed on refresh, restore the selected students before choosing the view.
resume_anchor = '''    const result = await api("resumeSession", {}, { silent: true });\n    state.session = { ...parsed, ...result.session };\n    renderShell();\n    finishBoot(false);\n    await openView(state.activeView);'''
resume_repl = '''    const result = await api("resumeSession", {}, { silent: true });\n    state.session = { ...parsed, ...result.session };\n    if (state.role === "teacher") restoreTeacherLessonSelection();\n    renderShell();\n    finishBoot(false);\n    await openView(state.activeView);'''
if resume_anchor not in app:
    raise SystemExit('session resume anchor not found')
app = app.replace(resume_anchor, resume_repl, 1)

app_path.write_text(app)

# Topbar: show all three modes and teacher-only lesson-end button.
top_old = '''    <div style="display:flex;align-items:center;gap:14px">\n      <button id="topAdminEntry" type="button" style="border:0;background:transparent;padding:0;color:#115e59;font-size:.88rem;font-weight:800;cursor:pointer">管理者画面へ</button>\n      <a class="goalLink" href="https://stepkobetsu-hub.github.io/foresta-step-progress/" target="_blank" rel="noopener">ステップ＆ゴールへ ↗</a>\n    </div>'''
top_new = '''    <div class="topbarActions">\n      <div id="modeIndicator" class="modeIndicator hidden" aria-label="現在の画面">\n        <span data-mode="student">生徒用</span><span data-mode="teacher">講師用</span><span data-mode="admin">管理用</span>\n      </div>\n      <button id="lessonEndButton" class="lessonEndButton hidden" type="button">授業終了</button>\n      <button id="topAdminEntry" type="button" class="topAdminEntry">管理者画面へ</button>\n      <a class="goalLink" href="https://stepkobetsu-hub.github.io/foresta-step-progress/" target="_blank" rel="noopener">ステップ＆ゴールへ ↗</a>\n    </div>'''
if top_old not in idx:
    raise SystemExit('topbar actions anchor not found')
idx = idx.replace(top_old, top_new, 1)
idx = re.sub(r'styles\.css\?v=[^"\']+', 'styles.css?v=20260831-rolelesson-1', idx, count=1)
idx = re.sub(r'app\.js\?v=[^"\']+', 'app.js?v=20260831-rolelesson-1', idx, count=1)
idx_path.write_text(idx)

css_add = '''\n/* Role indicator and persistent teacher lesson controls. */\n.topbarActions{display:flex;align-items:center;gap:10px;min-width:0}\n.topAdminEntry{border:0;background:transparent;padding:0;color:#115e59;font-size:.88rem;font-weight:800;cursor:pointer;white-space:nowrap}\n.modeIndicator{display:flex;align-items:center;gap:3px;padding:3px;border:1px solid var(--line);background:#f7faf9;border-radius:999px}\n.modeIndicator span{padding:6px 10px;border-radius:999px;font-size:.74rem;font-weight:900;color:#77827f;white-space:nowrap}\n.modeIndicator span.active{background:var(--forest);color:#fff;box-shadow:0 2px 8px rgba(15,118,110,.18)}\n.lessonEndButton{border:1px solid #e8a667;background:#fff7ed;color:#9a3412;border-radius:10px;padding:8px 12px;font-size:.78rem;font-weight:900;cursor:pointer;white-space:nowrap}\n.lessonEndButton:hover{background:#ffedd5}\n.studentTabWrap{display:inline-flex;align-items:center;border-radius:999px}\n.studentTabWrap.active .studentTab{background:var(--forest);color:#fff;border-color:var(--forest)}\n@media(max-width:860px){.topbarActions{gap:6px}.modeIndicator span{padding:5px 7px;font-size:.66rem}.lessonEndButton{padding:7px 9px;font-size:.7rem}.topAdminEntry{display:none}}\n@media(max-width:560px){.goalLink{display:none}.modeIndicator span{padding:5px 6px}}\n'''
if 'Role indicator and persistent teacher lesson controls.' not in css:
    css += css_add
css_path.write_text(css)
