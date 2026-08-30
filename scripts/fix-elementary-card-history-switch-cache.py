from pathlib import Path
import re

app_path = Path('app.js')
mod_path = Path('elementary-supabase.js')
css_path = Path('elementary-supabase.css')
idx_path = Path('index.html')

app = app_path.read_text()
mod = mod_path.read_text()
css = css_path.read_text()
idx = idx_path.read_text()

# 1) Keep the currently rendered dashboard available to the enhancement module.
anchor = '  state.dashboard = data;\n  if (isElementaryGradeValue(data.student?.grade)) return renderElementaryTeacherStudent(data, requestedId);'
replacement = '  state.dashboard = data;\n  window.__FORESTA_ACTIVE_DASHBOARD__ = data;\n  if (isElementaryGradeValue(data.student?.grade)) return renderElementaryTeacherStudent(data, requestedId);'
if anchor not in app:
    raise SystemExit('teacher dashboard anchor not found')
app = app.replace(anchor, replacement, 1)

# Also expose student dashboard when rendered so the same optimization works there.
student_anchor = 'async function renderStudent(view) {'
if student_anchor in app and 'window.__FORESTA_ACTIVE_DASHBOARD__ = data;' not in app.split(student_anchor,1)[1][:4000]:
    # Insert after the first state.dashboard assignment inside renderStudent if present.
    head, tail = app.split(student_anchor, 1)
    tail = tail.replace('state.dashboard = data;', 'state.dashboard = data; window.__FORESTA_ACTIVE_DASHBOARD__ = data;', 1)
    app = head + student_anchor + tail

# 2) Remove the redundant latest-test sentence from elementary subject cards.
app = re.sub(r'<p>直近の学校単元テスト：\$\{r\.latestUnitTest\?`<strong class="elementaryScore">\$\{esc\(r\.latestUnitTest\.score\)\}点</strong>`:"未登録"\}</p>', '', app)
app = re.sub(r'<p>直近テスト：\$\{r\.latestUnitTest\?`<strong class="elementaryScore">\$\{esc\(r\.latestUnitTest\.score\)\}点</strong>`:"未登録"\}</p>', '', app)

# 3) Improve base recent-history score readability (numerator emphasized).
def repl_history_func(match):
    return '''function elementarySubjectTestHistory(tests,subject){const rows=(tests||[]).filter(t=>(t.subject==="数学"?"算数":t.subject)===subject).slice(0,6);if(!rows.length)return '<div class="emptyState compact">まだありません。</div>';return `<div class="elementarySubjectTestList">${rows.map(t=>`<div class="elementarySubjectTestRow"><span>${esc(fmtShortDate(t.testDate))}</span><strong>${esc(t.unitName||"単元テスト")}</strong><b class="elementaryTestScorePair"><span>表 <em>${esc(t.score)}</em><small>/${esc(t.maxScore||100)}</small></span>${t.backScore!==null&&t.backScore!==undefined&&String(t.backScore)!==""?`<span>裏 <em>${esc(t.backScore)}</em><small>/${esc(t.backMaxScore||50)}</small></span>`:""}</b></div>`).join('')}</div>`}'''
app, n = re.subn(r'function elementarySubjectTestHistory\(tests,subject\)\{.*?\}\nfunction elementaryRecentTestsHtml', lambda m: repl_history_func(m) + '\nfunction elementaryRecentTestsHtml', app, count=1, flags=re.S)
if n != 1:
    raise SystemExit('base history function not found')

app_path.write_text(app)

# Enhancement module: reuse the app's already-loaded dashboard instead of calling GAS again on every student tab switch.
old_load = '''async function loadDashboard() {\n  const id = pageStudentId();\n  const session = readSession();\n  if (!id || !session) return null;\n  const data = await callApi("getStudentDashboard", isTeacherContext(session) ? { studentId: id } : {});\n  lastDashboard = data;\n  return data;\n}'''
new_load = '''async function loadDashboard() {\n  const id = pageStudentId();\n  const session = readSession();\n  if (!id || !session) return null;\n  const active = window.__FORESTA_ACTIVE_DASHBOARD__;\n  if (active?.student && String(active.student.studentId || active.student.loginId || "") === String(id)) {\n    lastDashboard = active;\n    return active;\n  }\n  if (lastDashboard?.student && String(lastDashboard.student.studentId || lastDashboard.student.loginId || "") === String(id)) return lastDashboard;\n  const data = await callApi("getStudentDashboard", isTeacherContext(session) ? { studentId: id } : {});\n  lastDashboard = data;\n  return data;\n}'''
if old_load not in mod:
    raise SystemExit('loadDashboard anchor not found')
mod = mod.replace(old_load, new_load, 1)

# Do not show the duplicate latest-test line on each subject card.
old_test = '    if (testP) testP.innerHTML = `直近の学校単元テスト：${summary.test ? `<strong class="elementaryScore">${esc(testScoreText(summary.test))}</strong>` : "未登録"}`;'
if old_test in mod:
    mod = mod.replace(old_test, '    if (testP) testP.remove();', 1)

# Emphasize earned points in recent history.
old_score_html = '''function testScoreHtml(test) {\n  if (!test) return "";\n  const front = `<span>表 ${esc(test.score ?? "-")}/${esc(test.max_score || 100)}</span>`;\n  const hasBack = test.back_score !== null && test.back_score !== undefined && String(test.back_score) !== "";\n  const back = hasBack ? `<span>裏 ${esc(test.back_score)}/${esc(test.back_max_score || 50)}</span>` : `<span class="muted">裏 未入力</span>`;\n  return `${front}${back}`;\n}'''
new_score_html = '''function testScoreHtml(test) {\n  if (!test) return "";\n  const front = `<span>表 <em>${esc(test.score ?? "-")}</em><small>/${esc(test.max_score || 100)}</small></span>`;\n  const hasBack = test.back_score !== null && test.back_score !== undefined && String(test.back_score) !== "";\n  const back = hasBack ? `<span>裏 <em>${esc(test.back_score)}</em><small>/${esc(test.back_max_score || 50)}</small></span>` : `<span class="muted">裏 未入力</span>`;\n  return `${front}${back}`;\n}'''
if old_score_html not in mod:
    raise SystemExit('testScoreHtml anchor not found')
mod = mod.replace(old_score_html, new_score_html, 1)
mod_path.write_text(mod)

css_add = '''\n/* Elementary score readability and fast student switching presentation. */\n.elementaryTestScorePair em{font-style:normal;font-size:1.18rem;font-weight:950;color:#0b5f50;line-height:1}\n.elementaryTestScorePair small{font-size:.72rem;font-weight:700;color:#58716b}\n.elementarySubjectTestRow{min-height:48px}\n.elementarySubjectTestRow>strong{font-size:.86rem}\n'''
if 'Elementary score readability and fast student switching presentation' not in css:
    css += css_add
css_path.write_text(css)

idx = re.sub(r'app\.js\?v=[^"\']+', 'app.js?v=20260831-switchcache-1', idx, count=1)
idx = re.sub(r'elementary-supabase\.js\?v=[^"\']+', 'elementary-supabase.js?v=20260831-switchcache-1', idx, count=1)
idx = re.sub(r'elementary-supabase\.css\?v=[^"\']+', 'elementary-supabase.css?v=20260831-switchcache-1', idx, count=1)
idx_path.write_text(idx)
