from pathlib import Path
import re

app_path = Path('app.js')
styles_path = Path('styles.css')
index_path = Path('index.html')
test_path = Path('tests/elementary-spec-audit.test.mjs')

app = app_path.read_text()
styles = styles_path.read_text()
index = index_path.read_text()
test = test_path.read_text()

old = '''async function renderAdmin(view) {
  if (view === "ranges") return renderRangeSettings();
  const data = await api(view === "training" ? "getTrainingRoom" : view === "students" ? "getAdminStudents" : "getAdminDashboard");
  if (view === "training") return renderTraining(data);
  let elementarySummaries = new Map();
  try { elementarySummaries = await loadElementaryAdminSummary(); }
  catch (error) { status(error.name === "AbortError" ? "小学生進捗の読込がタイムアウトしました。" : error.message, true); }
'''
new = '''async function renderAdmin(view) {
  if (view === "ranges") return renderRangeSettings();
  const action = view === "training" ? "getTrainingRoom" : view === "students" ? "getAdminStudents" : "getAdminDashboard";
  if (view === "training") return renderTraining(await api(action));
  const elementaryPromise = loadElementaryAdminSummary()
    .then((map) => ({ map, error: null }))
    .catch((error) => ({ map: new Map(), error }));
  const [data, elementaryResult] = await Promise.all([api(action), elementaryPromise]);
  const elementarySummaries = elementaryResult.map;
  if (elementaryResult.error) status(elementaryResult.error.name === "AbortError" ? "小学生進捗の読込がタイムアウトしました。" : elementaryResult.error.message, true);
'''
if old not in app:
    raise SystemExit('renderAdmin sequential source not found')
app = app.replace(old, new, 1)

old_table = '<div class="card"><div class="tableWrap"><table><thead><tr><th>生徒</th>'
new_table = '<div class="card adminStudentsCard"><div class="tableWrap"><table class="adminStudentsTable"><thead><tr><th>生徒</th>'
if old_table not in app:
    raise SystemExit('admin students table anchor not found')
app = app.replace(old_table, new_table, 1)

css = '''
/* Admin workspace: use more horizontal space and minimize table scrolling. */
body[data-app-mode="admin"] .appShell{width:min(1540px,100%);padding:18px clamp(12px,1.8vw,24px)}
body[data-app-mode="admin"] .workspace{grid-template-columns:180px minmax(0,1fr);gap:16px}
body[data-app-mode="admin"] .sideNav{padding:14px 12px;border-radius:18px}
body[data-app-mode="admin"] .userBadge{gap:7px;padding-bottom:14px}
body[data-app-mode="admin"] .userBadge>span{width:34px;height:34px}
body[data-app-mode="admin"] .sideNav nav{margin-top:12px;gap:4px}
body[data-app-mode="admin"] .navButton{padding:9px 9px;font-size:.82rem;line-height:1.35}
body[data-app-mode="admin"] .adminStudentsCard{padding:12px}
body[data-app-mode="admin"] .adminStudentsTable{min-width:1080px;table-layout:auto}
body[data-app-mode="admin"] .adminStudentsTable th,body[data-app-mode="admin"] .adminStudentsTable td{padding:8px 7px;font-size:.74rem;line-height:1.35}
body[data-app-mode="admin"] .adminStudentsTable th:nth-child(7),body[data-app-mode="admin"] .adminStudentsTable td:nth-child(7),body[data-app-mode="admin"] .adminStudentsTable th:nth-child(18),body[data-app-mode="admin"] .adminStudentsTable td:nth-child(18){white-space:nowrap}
body[data-app-mode="admin"] .adminStudentsTable th:nth-child(13),body[data-app-mode="admin"] .adminStudentsTable td:nth-child(13){min-width:150px;max-width:190px;white-space:normal;word-break:keep-all;overflow-wrap:normal}
@media(max-width:1050px){body[data-app-mode="admin"] .workspace{grid-template-columns:165px minmax(0,1fr);gap:12px}body[data-app-mode="admin"] .navButton{font-size:.76rem;padding-inline:7px}}
@media(max-width:860px){body[data-app-mode="admin"] .appShell{padding:14px}body[data-app-mode="admin"] .workspace{grid-template-columns:1fr}.adminStudentsTable{min-width:1080px}}
'''
if 'Admin workspace: use more horizontal space and minimize table scrolling.' not in styles:
    styles += css

if 'Promise.all([api(action), elementaryPromise])' not in test:
    test += '\nassert.ok(app.includes(\'Promise.all([api(action), elementaryPromise])\');\nassert.ok(app.includes(\'class="adminStudentsTable"\'));\n'

index = re.sub(r'app\.js\?v=[^\"\']+', 'app.js?v=20260831-admin-width-speed-1', index)
index = re.sub(r'styles\.css\?v=[^\"\']+', 'styles.css?v=20260831-admin-width-speed-1', index)

app_path.write_text(app)
styles_path.write_text(styles)
index_path.write_text(index)
test_path.write_text(test)
