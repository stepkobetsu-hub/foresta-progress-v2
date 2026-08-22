import fs from 'node:fs';

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Patch point not found: ${label}`);
  return text.replace(from, to);
}

let app = fs.readFileSync('app.js', 'utf8');
let index = fs.readFileSync('index.html', 'utf8');
let styles = fs.readFileSync('styles.css', 'utf8');

app = replaceOnce(
  app,
  'const KEYS = { local: "forestaProgressAuth", session: "forestaProgressSession", admin: "forestaProgressAdmin", device: "forestaDeviceMode" };',
  'const KEYS = { local: "forestaProgressAuth", session: "forestaProgressSession", admin: "forestaProgressAdmin", device: "forestaDeviceMode", dashboard: "forestaProgressDashboardCache" };',
  'dashboard cache key',
);

app = replaceOnce(
  app,
  'function clearSessions() {\n  localStorage.removeItem(KEYS.local);',
  'function clearSessions() {\n  sessionStorage.removeItem(KEYS.dashboard);\n  localStorage.removeItem(KEYS.local);',
  'clear dashboard cache',
);

app = replaceOnce(
  app,
  'function renderShell() {\n  $("topAdminEntry")?.classList.add("hidden");\n  $("loginView").classList.add("hidden");',
  'function renderShell() {\n  $("topAdminEntry")?.classList.remove("hidden");\n  $("loginView").classList.add("hidden");',
  'keep top admin visible',
);

app = replaceOnce(
  app,
  'async function renderStudent(view) {\n  const data = state.dashboard || await api("getStudentDashboard");\n  state.dashboard = data;',
  `function cacheStudentDashboard(data) {\n  try {\n    if (!data?.student?.studentId) return;\n    sessionStorage.setItem(KEYS.dashboard, JSON.stringify({ studentId: data.student.studentId, savedAt: Date.now(), data }));\n  } catch {}\n}\n\nfunction readCachedStudentDashboard(studentId, maxAgeMs = 120000) {\n  try {\n    const raw = sessionStorage.getItem(KEYS.dashboard);\n    if (!raw) return null;\n    const entry = JSON.parse(raw);\n    if (String(entry.studentId || "") !== String(studentId || "")) return null;\n    if (Date.now() - Number(entry.savedAt || 0) > maxAgeMs) return null;\n    return entry.data || null;\n  } catch { return null; }\n}\n\nasync function renderStudent(view) {\n  const data = state.dashboard || await api("getStudentDashboard");\n  state.dashboard = data;\n  cacheStudentDashboard(data);`,
  'student dashboard session cache',
);

app = replaceOnce(
  app,
  '    ${studentRoundProgressHtml(data)}\n    <section class="cardGrid">',
  '    <article class="card studentTargetPanel studentTargetTop"><p class="cardTitle">目標点</p>${targetForm(data.targets || {}, next?.testId)}</article>\n    ${studentRoundProgressHtml(data)}\n    <section class="cardGrid">',
  'target panel near top',
);

app = replaceOnce(
  app,
  '      <article class="card span12 studentHomeworkPanel"><p class="cardTitle">次回までの宿題</p><p><strong>宿題は2日以内に終わらせよう！</strong></p><div class="homeworkList">${homeworkHtml((data.homework || []).slice(0, 6), "student")}</div></article>\n      <article class="card span12 studentTargetPanel"><p class="cardTitle">目標点</p>${targetForm(data.targets || {}, next?.testId)}</article>',
  '      <article class="card span12 studentHomeworkPanel"><p class="cardTitle">次回までの宿題</p><p><strong>宿題は2日以内に終わらせよう！</strong></p><div class="homeworkList">${homeworkHtml((data.homework || []).slice(0, 6), "student")}</div></article>',
  'remove bottom target panel',
);

app = replaceOnce(
  app,
  '  TRACKED_SUBJECTS.forEach((subject, index) => setTimeout(() => prefetchProgression({ subject, mode: studentProgressMode }), index * 120));',
  `  const prefetchSubjects = () => TRACKED_SUBJECTS.forEach((subject, index) => setTimeout(() => prefetchProgression({ subject, mode: studentProgressMode }), index * 220));\n  if ("requestIdleCallback" in window) requestIdleCallback(prefetchSubjects, { timeout: 1800 });\n  else setTimeout(prefetchSubjects, 900);`,
  'defer progression prefetch',
);

const oldRestore = `async function restore() {\n  const savedAdmin = localStorage.getItem(KEYS.admin);\n  if (savedAdmin) {\n    try {\n      const parsedAdmin = JSON.parse(savedAdmin);\n      state.adminToken = parsedAdmin.adminToken;\n      state.session = parsedAdmin.session;\n      const result = await api("resumeAdminSession", {}, { silent: true });\n      state.session = result.session;\n      state.role = "admin";\n      state.activeView = "admin";\n      persistAdminSession();\n      renderShell();\n      openView("admin");\n      return;\n    } catch { clearSessions(); }\n  }\n  const saved = localStorage.getItem(KEYS.local) || sessionStorage.getItem(KEYS.session);\n  if (!saved) return;\n  try {\n    const parsed = JSON.parse(saved);\n    state.session = parsed;\n    state.role = parsed.role;\n    state.device = parsed.deviceMode || sessionStorage.getItem(KEYS.device) || "personal";\n    const result = await api("resumeSession", {}, { silent: true });\n    state.session = { ...parsed, ...result.session };\n    state.activeView = state.role === "student" ? "home" : "search";\n    renderShell();\n    openView(state.activeView);\n  } catch { clearSessions(); }\n}`;

const newRestore = `function finishBoot(showLogin = false) {\n  document.body.classList.remove("booting");\n  $("bootCover")?.classList.add("hidden");\n  if (showLogin) $("loginView")?.classList.remove("hidden");\n}\n\nasync function restore() {\n  const savedAdmin = localStorage.getItem(KEYS.admin);\n  if (savedAdmin) {\n    try {\n      const parsedAdmin = JSON.parse(savedAdmin);\n      state.adminToken = parsedAdmin.adminToken;\n      state.session = parsedAdmin.session;\n      const result = await api("resumeAdminSession", {}, { silent: true });\n      state.session = result.session;\n      state.role = "admin";\n      state.activeView = "admin";\n      persistAdminSession();\n      renderShell();\n      finishBoot(false);\n      await openView("admin");\n      return;\n    } catch { clearSessions(); }\n  }\n\n  const saved = localStorage.getItem(KEYS.local) || sessionStorage.getItem(KEYS.session);\n  if (!saved) { finishBoot(true); return; }\n  try {\n    const parsed = JSON.parse(saved);\n    state.session = parsed;\n    state.role = parsed.role;\n    state.device = parsed.deviceMode || sessionStorage.getItem(KEYS.device) || "personal";\n    state.activeView = state.role === "student" ? "home" : "search";\n\n    if (state.role === "student") {\n      const cached = readCachedStudentDashboard(parsed.studentId || parsed.loginId);\n      const resumePromise = api("resumeSession", {}, { silent: true });\n      const dashboardPromise = api("getStudentDashboard", {}, { silent: true });\n      if (cached) state.dashboard = cached;\n      const [resumeResult, dashboardResult] = await Promise.all([resumePromise, dashboardPromise]);\n      state.session = { ...parsed, ...resumeResult.session };\n      state.dashboard = dashboardResult;\n      cacheStudentDashboard(dashboardResult);\n      renderShell();\n      finishBoot(false);\n      await renderStudent("home");\n      return;\n    }\n\n    const result = await api("resumeSession", {}, { silent: true });\n    state.session = { ...parsed, ...result.session };\n    renderShell();\n    finishBoot(false);\n    await openView(state.activeView);\n  } catch {\n    clearSessions();\n    finishBoot(true);\n  }\n}`;
app = replaceOnce(app, oldRestore, newRestore, 'fast restore flow');

app = replaceOnce(
  app,
  '$("topAdminEntry").onclick = openAdminReauth;',
  '$("topAdminEntry").onclick = () => { if (state.role === "admin" && state.adminToken) openView("admin"); else openAdminReauth(); };',
  'top admin behavior',
);

index = replaceOnce(index, '<body>', '<body class="booting">\n  <div id="bootCover" class="bootCover" role="status" aria-live="polite"><div><span class="spinner"></span><strong>前回の画面を復元しています…</strong><small>ログイン済みの場合はそのまま戻ります</small></div></div>', 'boot cover');
index = index
  .replace('styles.css?v=20260823-autosave-layout', 'styles.css?v=20260823-fast-restore')
  .replace('app.js?v=20260823-autosave-layout', 'app.js?v=20260823-fast-restore');

const css = `\n\n/* 2026-08-23: no-login-flash restore + target near top */\n.bootCover{position:fixed;inset:0;z-index:100;background:linear-gradient(180deg,#edf7f3,#fff);display:grid;place-items:center}.bootCover>div{display:grid;justify-items:center;gap:10px;color:var(--forest2);font-weight:900}.bootCover small{color:var(--muted);font-weight:700}.booting .loginLayout,.booting .workspace{visibility:hidden}.studentTargetTop{margin:0 0 16px;width:min(520px,100%)}\n@media(max-width:620px){.studentTargetTop{width:100%}}\n`;
if (!styles.includes('2026-08-23: no-login-flash restore + target near top')) styles += css;

if (!app.includes('Promise.all([resumePromise, dashboardPromise])')) throw new Error('parallel student restore missing');
if (!app.includes('requestIdleCallback')) throw new Error('deferred progression prefetch missing');
if (!index.includes('id="bootCover"')) throw new Error('boot cover missing');
if (!app.includes('studentTargetTop')) throw new Error('target top missing');
if (app.includes('$("topAdminEntry")?.classList.add("hidden")')) throw new Error('top admin is still hidden');

fs.writeFileSync('app.js', app);
fs.writeFileSync('index.html', index);
fs.writeFileSync('styles.css', styles);
console.log('Applied fast restore, always-visible admin entry, and top target panel.');
