from pathlib import Path

app_path = Path('app.js')
module_path = Path('elementary-supabase.js')
index_path = Path('index.html')

app = app_path.read_text()

old_shell = '''function renderShell() {\n  $("topAdminEntry")?.classList.remove("hidden");'''
new_shell = '''function renderShell() {\n  // Share the actual in-memory login with the elementary enhancement module.\n  // This is the source of truth; stored sessions may contain an older student login.\n  window.__FORESTA_ACTIVE_SESSION__ = state.session || null;\n  window.__FORESTA_ACTIVE_ROLE__ = state.role || "";\n  $("topAdminEntry")?.classList.remove("hidden");'''
if old_shell not in app:
    raise SystemExit('renderShell anchor not found')
app = app.replace(old_shell, new_shell, 1)

old_guide = '①学校はどこまで進んだか　②最近の学校単元テストは何点だったか'
new_guide = '①学校はどこまで進んだか　②最近の学校単元テストは何点だったか　③次回のテストはいつありそうか？'
if old_guide not in app:
    raise SystemExit('elementary teacher guide anchor not found')
app = app.replace(old_guide, new_guide, 1)

old_clear = '''  state.session = null;\n  state.adminToken = "";\n  state.teacherStudentCache = {};\n}'''
new_clear = '''  state.session = null;\n  state.adminToken = "";\n  state.teacherStudentCache = {};\n  window.__FORESTA_ACTIVE_SESSION__ = null;\n  window.__FORESTA_ACTIVE_ROLE__ = "";\n}'''
if old_clear in app:
    app = app.replace(old_clear, new_clear, 1)

app_path.write_text(app)

module = module_path.read_text()
old_read = '''function readSession() {\n  const candidates = [];'''
new_read = '''function readSession() {\n  // app.js owns the live session. Prefer it over local/sessionStorage so a\n  // remembered student login can never override a teacher currently using the page.\n  const active = window.__FORESTA_ACTIVE_SESSION__;\n  if (active?.token) return active;\n  const candidates = [];'''
if old_read not in module:
    raise SystemExit('readSession anchor not found')
module = module.replace(old_read, new_read, 1)
module_path.write_text(module)

index = index_path.read_text()
index = index.replace('app.js?v=20260831-middlelike', 'app.js?v=20260831-elementary-session-1')
index = index.replace('elementary-supabase.js?v=20260831-5', 'elementary-supabase.js?v=20260831-6')
index = index.replace('elementary-supabase.js?v=20260831-4', 'elementary-supabase.js?v=20260831-6')
index_path.write_text(index)
