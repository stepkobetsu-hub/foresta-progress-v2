from pathlib import Path
import re

app_path = Path('app.js')
styles_path = Path('styles.css')
idx_path = Path('index.html')

app = app_path.read_text()
styles = styles_path.read_text()
idx = idx_path.read_text()

# Remove the student-change button from the global top bar.
top_line = '      <button id="studentChangeButton" class="studentChangeButton hidden" type="button">生徒変更</button>\n'
if top_line not in idx:
    raise SystemExit('topbar student change button not found')
idx = idx.replace(top_line, '', 1)

# The content-level button is bound together with the selected student tabs,
# so the top-bar binding is no longer needed.
shell_block = '''  const studentChangeButton = $("studentChangeButton");\n  if (studentChangeButton) {\n    const canChange = state.role === "teacher" && state.selectedStudents.length > 0;\n    studentChangeButton.classList.toggle("hidden", !canChange);\n    studentChangeButton.onclick = canChange ? changeTeacherStudent : null;\n  }\n'''
if shell_block not in app:
    raise SystemExit('renderShell student change block not found')
app = app.replace(shell_block, '', 1)

old_tabs = '''function selectedTabsHtml() {\n  if (!state.selectedStudents.length) return "";\n  return `<div class="studentTabs">${state.selectedStudents.map((student) => `<div class="studentTabWrap ${String(student.studentId) === state.activeStudentId ? "active" : ""}"><button class="studentTab" data-id="${esc(student.studentId)}">${esc(student.name)}</button></div>`).join("")}</div>`;\n}\n\nfunction bindSelectedTabs() {\n  $("content").querySelectorAll(".studentTab").forEach((button) => button.onclick = () => activateTeacherStudent(button.dataset.id));\n}\n'''
new_tabs = '''function selectedTabsHtml() {\n  if (!state.selectedStudents.length) return "";\n  return `<div class="studentTabsBar"><div class="studentTabs">${state.selectedStudents.map((student) => `<div class="studentTabWrap ${String(student.studentId) === state.activeStudentId ? "active" : ""}"><button class="studentTab" data-id="${esc(student.studentId)}">${esc(student.name)}</button></div>`).join("")}</div><button id="studentChangeButton" class="studentChangeButton selectedStudentChangeButton" type="button">生徒変更</button></div>`;\n}\n\nfunction bindSelectedTabs() {\n  $("content").querySelectorAll(".studentTab").forEach((button) => button.onclick = () => activateTeacherStudent(button.dataset.id));\n  const changeButton = $("studentChangeButton");\n  if (changeButton) changeButton.onclick = changeTeacherStudent;\n}\n'''
if old_tabs not in app:
    raise SystemExit('selected tabs block not found')
app = app.replace(old_tabs, new_tabs, 1)

# Cache-bust the files changed in this patch.
idx = re.sub(r'styles\.css\?v=[^"\']+', 'styles.css?v=20260831-studentchange-tabs-1', idx, count=1)
idx = re.sub(r'app\.js\?v=[^"\']+', 'app.js?v=20260831-studentchange-tabs-1', idx, count=1)

css_add = '''\n/* Keep student-change next to the selected student pills. */\n.studentTabsBar{display:flex;align-items:center;gap:12px;margin:10px 0 16px;min-width:0}\n.studentTabsBar .studentTabs{flex:1;min-width:0;margin:0}\n.selectedStudentChangeButton{flex:0 0 auto}\n@media(max-width:700px){.studentTabsBar{align-items:flex-start;flex-wrap:wrap}.studentTabsBar .studentTabs{flex-basis:100%}}\n'''
if 'Keep student-change next to the selected student pills.' not in styles:
    styles += css_add

app_path.write_text(app)
styles_path.write_text(styles)
idx_path.write_text(idx)
