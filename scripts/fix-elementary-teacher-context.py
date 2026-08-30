from pathlib import Path

p = Path('elementary-supabase.js')
s = p.read_text()
old = '''function readSession() {
  for (const store of [localStorage, sessionStorage]) {
    for (const key of ["forestaProgressAuth", "forestaProgressSession"]) {
      try {
        const raw = store.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed?.token) return parsed;
      } catch (_) {}
    }
  }
  return null;
}'''
new = '''function pageRoleHint() {
  if (document.querySelector('.elementaryTeacherGuide,#elementaryLessonTeacher,.navButton[data-view="search"],.navButton[data-view="today"],.navButton[data-view="selected"]')) return "teacher";
  const meta = String(document.getElementById("userMeta")?.textContent || "");
  if (meta.includes("講師")) return "teacher";
  if (meta.includes("生徒")) return "student";
  if (meta.includes("管理者")) return "admin";
  return "";
}

function readSession() {
  const candidates = [];
  for (const store of [sessionStorage, localStorage]) {
    for (const key of ["forestaProgressSession", "forestaProgressAuth"]) {
      try {
        const raw = store.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed?.token && !candidates.some((item) => item.token === parsed.token)) candidates.push(parsed);
      } catch (_) {}
    }
  }
  const hint = pageRoleHint();
  if (hint) {
    const matched = candidates.find((item) => item.role === hint);
    if (matched) return matched;
  }
  return candidates[0] || null;
}

function isTeacherContext(session = null) {
  return pageRoleHint() === "teacher" || session?.role === "teacher";
}'''
if old not in s:
    raise SystemExit('readSession block not found')
s = s.replace(old, new, 1)
s = s.replace('if (session?.role === "student") return String(session.studentId || session.loginId || "");', 'if (!isTeacherContext(session) && session?.role === "student") return String(session.studentId || session.loginId || "");', 1)
s = s.replace('const data = await callApi("getStudentDashboard", session.role === "teacher" ? { studentId: id } : {});', 'const data = await callApi("getStudentDashboard", isTeacherContext(session) ? { studentId: id } : {});', 1)
s = s.replace('if (session?.role !== "teacher") return;', 'if (!isTeacherContext(session)) return;', 1)
s = s.replace('const teacher = session?.role === "teacher";', 'const teacher = isTeacherContext(session);', 1)
p.write_text(s)

ip = Path('index.html')
x = ip.read_text()
for oldv in ['elementary-supabase.js?v=20260831-1','elementary-supabase.js?v=20260831-2']:
    x = x.replace(oldv, 'elementary-supabase.js?v=20260831-3')
ip.write_text(x)
