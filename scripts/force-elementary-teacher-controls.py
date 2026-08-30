from pathlib import Path

p = Path('elementary-supabase.js')
s = p.read_text()

repls = [
    ('async function showInteractiveProgression(subject) {', 'async function showInteractiveProgression(subject, forceTeacher = false) {'),
    ('const teacher = isTeacherContext(session);', 'const teacher = forceTeacher || isTeacherContext(session);'),
    ('showInteractiveProgression(subject);\n      return;', 'showInteractiveProgression(subject, progressButton.classList.contains("elementaryOpenProgress"));\n      return;'),
    ('await showInteractiveProgression(normalized);\n        await refreshElementaryScreen(false);', 'await showInteractiveProgression(normalized, teacher);\n        await refreshElementaryScreen(false);'),
    ('openTestDialog({ subject: normalized, unit, onSaved: async () => { await showInteractiveProgression(normalized); await refreshElementaryScreen(false); } });', 'openTestDialog({ subject: normalized, unit, onSaved: async () => { await showInteractiveProgression(normalized, teacher); await refreshElementaryScreen(false); } });'),
]
for old, new in repls:
    if old not in s:
        raise SystemExit(f'missing pattern: {old[:60]}')
    s = s.replace(old, new)

# The teacher top form should also be enabled whenever the actual teacher screen is visible.
s = s.replace('if (!isTeacherContext(session)) return;\n  const form = document.getElementById("elementaryTopTestForm");', 'if (!document.querySelector(".elementaryTeacherGuide") && !isTeacherContext(session)) return;\n  const form = document.getElementById("elementaryTopTestForm");', 1)

p.write_text(s)

ip = Path('index.html')
x = ip.read_text()
x = x.replace('elementary-supabase.js?v=20260831-3', 'elementary-supabase.js?v=20260831-4')
ip.write_text(x)
