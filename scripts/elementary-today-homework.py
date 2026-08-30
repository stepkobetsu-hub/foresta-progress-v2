from pathlib import Path
import re

app_path = Path('app.js')
elem_path = Path('elementary-supabase.js')
idx_path = Path('index.html')

app = app_path.read_text()
elem = elem_path.read_text()
idx = idx_path.read_text()

# Expose a tiny cache invalidation hook so elementary homework writes are visible
# next time the teacher returns to the student without keeping stale dashboard data.
anchor = '''function changeTeacherStudent() {\n  if (state.role !== "teacher") return;'''
hook = '''window.__FORESTA_INVALIDATE_TEACHER_STUDENT__ = (studentId) => {\n  const id = String(studentId || state.activeStudentId || "");\n  if (!id) return;\n  delete state.teacherStudentCache[id];\n  if (String(state.activeStudentId || "") === id) {\n    state.dashboard = null;\n    window.__FORESTA_ACTIVE_DASHBOARD__ = null;\n  }\n};\n\nfunction changeTeacherStudent() {\n  if (state.role !== "teacher") return;'''
if anchor not in app:
    raise SystemExit('changeTeacherStudent anchor not found')
app = app.replace(anchor, hook, 1)

# Add elementary default-homework creation via the existing GAS saveLesson path.
helper_anchor = '''function setDifferenceBadge(el, value, label) {\n  if (!el) return;\n  el.textContent = label;\n  el.classList.remove("ahead", "behind", "same", "unset");\n  el.classList.add(value == null ? "unset" : value > 0 ? "ahead" : value < 0 ? "behind" : "same");\n}\n'''
helper = helper_anchor + '''\nfunction defaultElementaryHomework(subject) {\n  const normalized = normalizeSubject(subject);\n  if (normalized === "国語") return ["本日の赤×なおし"];\n  if (normalized === "算数" || normalized === "英語") return ["TRYの赤×なおし", "エクササイズ"];\n  return [];\n}\n\nasync function saveElementaryTodayHomework(subject, unitId, lessonDate) {\n  const session = readSession();\n  if (!isTeacherContext(session)) return { saved: false, homeworkCount: 0 };\n  const studentId = String(pageStudentId() || "");\n  if (!studentId || !unitId) return { saved: false, homeworkCount: 0 };\n  const normalized = normalizeSubject(subject);\n  const items = defaultElementaryHomework(normalized);\n  if (!items.length) return { saved: false, homeworkCount: 0 };\n  const teacherId = document.getElementById("elementaryLessonTeacher")?.value || session?.loginId || "";\n  const result = await callApi("saveLesson", {\n    studentId,\n    subject: normalized,\n    unitIds: [unitId],\n    teacherId,\n    idempotencyKey: `ELEM-AUTO|${studentId}|${normalized}|${unitId}|${lessonDate}`,\n    homeworkItems: items,\n    homeworkByUnit: { [unitId]: items },\n    outsideRangeOverrideUnitIds: [unitId],\n  });\n  window.__FORESTA_INVALIDATE_TEACHER_STUDENT__?.(studentId);\n  lastDashboard = null;\n  return result;\n}\n'''
if helper_anchor not in elem:
    raise SystemExit('setDifferenceBadge anchor not found')
elem = elem.replace(helper_anchor, helper, 1)

old_handler = '''    body.querySelectorAll('[data-action="today"]').forEach((input) => input.onchange = async () => {\n      input.disabled = true;\n      try {\n        await callElementary("toggleLesson", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, checked: input.checked });\n        status(input.checked ? "今日の進行を保存しました。" : "今日の進行を取り消しました。");\n        await showInteractiveProgression(normalized, teacher);\n        await refreshElementaryScreen(false);\n      } catch (error) {\n        input.checked = !input.checked;\n        input.disabled = false;\n        status(error.message, true);\n      }\n    });'''
new_handler = '''    body.querySelectorAll('[data-action="today"]').forEach((input) => input.onchange = async () => {\n      input.disabled = true;\n      try {\n        if (input.checked) {\n          const saved = await saveElementaryTodayHomework(normalized, input.dataset.unit, today);\n          await callElementary("toggleLesson", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, checked: true });\n          const count = Number(saved?.homeworkCount || 0);\n          status(count > 0 ? `今日の進行と宿題 ${count}件を保存しました。` : "今日の進行を保存しました。宿題はすでに作成済みです。");\n        } else {\n          await callElementary("toggleLesson", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, checked: false });\n          status("今日の進行を取り消しました。作成済みの宿題は安全のため残しています。必要なら『宿題・進行表を訂正』から修正してください。");\n        }\n        await showInteractiveProgression(normalized, teacher);\n        await refreshElementaryScreen(false);\n      } catch (error) {\n        input.checked = !input.checked;\n        input.disabled = false;\n        status(error.message, true);\n      }\n    });'''
if old_handler not in elem:
    raise SystemExit('today checkbox handler not found')
elem = elem.replace(old_handler, new_handler, 1)

idx = re.sub(r'app\.js\?v=[^"\']+', 'app.js?v=20260831-elementary-homework-1', idx, count=1)
idx = re.sub(r'elementary-supabase\.js\?v=[^"\']+', 'elementary-supabase.js?v=20260831-homework-1', idx, count=1)

app_path.write_text(app)
elem_path.write_text(elem)
idx_path.write_text(idx)
