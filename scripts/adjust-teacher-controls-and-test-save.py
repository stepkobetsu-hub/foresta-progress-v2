from pathlib import Path
import re

app_path = Path('app.js')
styles_path = Path('styles.css')
idx_path = Path('index.html')
elem_css_path = Path('elementary-enhancement.css')

app = app_path.read_text()
styles = styles_path.read_text()
idx = idx_path.read_text()
elem = elem_css_path.read_text()

# Add a dedicated student-change action that removes only the currently active student.
anchor = '''function endTeacherLesson() {\n  localStorage.removeItem(KEYS.teacherSelection);\n  state.selectedStudents = [];\n  state.activeStudentId = \"\";\n  state.teacherStudentCache = {};\n  state.dashboard = null;\n  window.__FORESTA_ACTIVE_DASHBOARD__ = null;\n  state.activeView = \"search\";\n  openView(\"search\");\n}\n'''
insert = anchor + '''\nfunction changeTeacherStudent() {\n  if (state.role !== \"teacher\") return;\n  const activeId = String(state.activeStudentId || \"\");\n  if (!activeId) { state.activeView = \"search\"; return openView(\"search\"); }\n  const active = state.selectedStudents.find((student) => String(student.studentId) === activeId);\n  const label = active?.name ? `${active.name}さん` : \"現在の生徒\";\n  if (!confirm(`${label}を選択から外して、生徒を選び直しますか？`)) return;\n  state.selectedStudents = state.selectedStudents.filter((student) => String(student.studentId) !== activeId);\n  delete state.teacherStudentCache[activeId];\n  state.activeStudentId = state.selectedStudents[0] ? String(state.selectedStudents[0].studentId) : \"\";\n  state.dashboard = null;\n  window.__FORESTA_ACTIVE_DASHBOARD__ = null;\n  persistTeacherLessonSelection();\n  state.activeView = \"search\";\n  openView(\"search\");\n}\n'''
if anchor not in app:
    raise SystemExit('endTeacherLesson anchor not found')
app = app.replace(anchor, insert, 1)

# Wire the new topbar button next to the lesson-end control.
lesson_block = '''  const lessonEndButton = $(\"lessonEndButton\");\n  if (lessonEndButton) {\n    lessonEndButton.classList.toggle(\"hidden\", state.role !== \"teacher\");\n    lessonEndButton.onclick = state.role === \"teacher\" ? () => {\n      if (!confirm(\"授業を終了して、選択中の生徒をすべて閉じますか？\")) return;\n      endTeacherLesson();\n    } : null;\n  }\n'''
lesson_repl = lesson_block + '''  const studentChangeButton = $(\"studentChangeButton\");\n  if (studentChangeButton) {\n    const canChange = state.role === \"teacher\" && state.selectedStudents.length > 0;\n    studentChangeButton.classList.toggle(\"hidden\", !canChange);\n    studentChangeButton.onclick = canChange ? changeTeacherStudent : null;\n  }\n'''
if lesson_block not in app:
    raise SystemExit('lesson button block not found')
app = app.replace(lesson_block, lesson_repl, 1)
app_path.write_text(app)

# Put the student-change button in the top bar.
old_top = '      <button id="lessonEndButton" class="lessonEndButton hidden" type="button">授業終了</button>\n      <button id="topAdminEntry" type="button" class="topAdminEntry">管理者画面へ</button>'
new_top = '      <button id="studentChangeButton" class="studentChangeButton hidden" type="button">生徒変更</button>\n      <button id="lessonEndButton" class="lessonEndButton hidden" type="button">授業終了</button>\n      <button id="topAdminEntry" type="button" class="topAdminEntry">管理者画面へ</button>'
if old_top not in idx:
    raise SystemExit('topbar lesson button anchor not found')
idx = idx.replace(old_top, new_top, 1)
idx = re.sub(r'styles\.css\?v=[^"\']+', 'styles.css?v=20260831-teachercontrols-2', idx, count=1)
idx = re.sub(r'elementary-enhancement\.css\?v=[^"\']+', 'elementary-enhancement.css?v=20260831-testsave-2', idx, count=1)
idx = re.sub(r'app\.js\?v=[^"\']+', 'app.js?v=20260831-teachercontrols-2', idx, count=1)
idx_path.write_text(idx)

# Larger lesson-end button and a distinct student-change button.
css_add = '''\n/* Teacher session controls: explicit student change + larger lesson end. */\n.studentChangeButton{border:1px solid #b8d8d1;background:#eef8f5;color:#115e59;border-radius:10px;padding:9px 14px;font-size:.82rem;font-weight:900;cursor:pointer;white-space:nowrap}\n.studentChangeButton:hover{background:#dff4ee}\n.lessonEndButton{padding:11px 19px!important;font-size:.92rem!important;border-width:2px!important;box-shadow:0 3px 10px rgba(154,52,18,.10)}\n@media(max-width:860px){.studentChangeButton{padding:7px 9px;font-size:.7rem}.lessonEndButton{padding:9px 12px!important;font-size:.78rem!important}}\n'''
if 'Teacher session controls: explicit student change + larger lesson end.' not in styles:
    styles += css_add
styles_path.write_text(styles)

# Desktop: float the save button at the upper-right of the test-date field instead of the lower baseline.
elem_add = '''\n/* Elementary top-test save button: upper-right beside the test-date label. */\n@media(min-width:1121px){\n  .elementaryTopTestForm .primaryBtn{align-self:start!important;justify-self:end!important;min-height:36px!important;padding:8px 15px!important;margin-top:0!important}\n}\n@media(max-width:1120px) and (min-width:721px){\n  .elementaryTopTestForm .primaryBtn{justify-self:end!important;min-width:92px}\n}\n'''
if 'Elementary top-test save button: upper-right beside the test-date label.' not in elem:
    elem += elem_add
elem_css_path.write_text(elem)
