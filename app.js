import { CONFIG } from "./config.js?v=20260831-admin-progress-1";
import { SUBJECTS, TRACKED_SUBJECTS, formatProgressGroupLabel, formatProgressUnitNumber, homeworkSummary, progressGroupKey } from "./domain.js";

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const fmtDate = (value) => value ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" }).format(new Date(value)) : "未設定";
const fmtShortDate = (value) => value ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).format(new Date(value)) : "";
const fmtDateTime = (value) => value ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
const searchFold = (value) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60)).replace(/[\s　]+/g, "");
const matchesStudentDirectoryQuery = (student, query) => {
  const tokens = String(query ?? "").normalize("NFKC").trim().split(/[\s　]+/).filter(Boolean);
  if (!tokens.length) return false;
  const haystack = searchFold([student.studentId, student.name, student.reading, student.romaji, student.campus, student.grade, student.school].join(" "));
  return tokens.every((token) => haystack.includes(searchFold(token)));
};

const state = {
  role: "student",
  device: "",
  session: null,
  adminToken: "",
  selectedStudents: [],
  activeStudentId: "",
  teacherStudentCache: {},
  activeView: "home",
  dashboard: null,
  progressionCache: new Map(),
  progressionPromises: new Map(),
};

const KEYS = { local: "forestaProgressAuth", session: "forestaProgressSession", admin: "forestaProgressAdmin", device: "forestaDeviceMode", dashboard: "forestaProgressDashboardCache", teacherSelection: "forestaTeacherLessonSelection", teacherSubjects: "forestaTeacherSubjectSelection" };
const DEFAULT_HOMEWORK = {
  数学: ["TRYの赤×直し", "exercise", "宿題の赤×直し"],
  英語: ["KeyWords「☆日→英」暗記", "exercise「暗記マーク」暗記", "Try赤×直し", "exercise", "宿題の赤×直し"],
};
const REPEAT_HOMEWORK = {
  数学: ["TRYの赤×直し", "エクササイズの赤×直し"],
  英語: ["KEYWORDSの暗記", "TRYの赤×直し", "エクササイズの赤×直し"],
};
let teacherSearchTimer = 0;
const PROGRESSION_CACHE_TTL_MS = 120000;
// Supabase V3 is the production path. `?legacy=1` is the explicit, non-destructive rollback.
const FAST_RUNTIME_ENABLED = new URLSearchParams(location.search).get("legacy") !== "1";
const FAST_RUNTIME_AUTH_ACTIONS = new Set(["studentLogin","staffLogin","resumeSession","logout","adminReauth","resumeAdminSession"]);
const FAST_RUNTIME_READ_ACTIONS = new Set(["getStudentDashboard","getProgression","searchStudents","getTeacherToday","getHomeworkArchive"]);
const FAST_RUNTIME_WRITE_ACTIONS = new Set(["saveLesson","updateLessonCorrection","saveSchoolPosition","saveRange","saveCt","saveStudentRoundProgress","studentCheckHomework","teacherCheckHomework","archiveHomework","restoreHomework","deleteHomework","saveTargets","saveComment","saveNote","markCommentRead","updateTrainingRoom","saveSchoolTextbook"]);
const FAST_LOCAL_READ_ACTIONS = new Set(["getStudentDashboard","getProgression"]);
const FAST_LOCAL_CACHE_PREFIX = "forestaFastV3:";
function apiEndpointFor(action) {
  if (!FAST_RUNTIME_ENABLED || FAST_RUNTIME_AUTH_ACTIONS.has(action) || !CONFIG.fastRuntimeApiUrl) return CONFIG.apiUrl;
  if (!FAST_RUNTIME_READ_ACTIONS.has(action) && !FAST_RUNTIME_WRITE_ACTIONS.has(action)) return CONFIG.apiUrl;
  return CONFIG.fastRuntimeApiUrl;
}
function usingFastRuntimeFor(action) { return apiEndpointFor(action) === CONFIG.fastRuntimeApiUrl; }
function fastLocalCacheKey(action, payload = {}) {
  const studentId = payload.studentId || state.activeStudentId || state.session?.studentId || state.session?.loginId || "self";
  return `${FAST_LOCAL_CACHE_PREFIX}${state.role}|${state.session?.loginId || ""}|${studentId}|${action}|${payload.subject || ""}|${payload.mode || ""}`;
}
function readFastLocalCache(action, payload = {}) {
  if (!FAST_RUNTIME_ENABLED || !FAST_LOCAL_READ_ACTIONS.has(action)) return null;
  try {
    const raw = sessionStorage.getItem(fastLocalCacheKey(action, payload));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || Date.now() - Number(parsed.savedAt || 0) > 6 * 60 * 60 * 1000) return null;
    return parsed.data;
  } catch (_) { return null; }
}
function writeFastLocalCache(action, payload, data) {
  if (!FAST_RUNTIME_ENABLED || !FAST_LOCAL_READ_ACTIONS.has(action) || !data) return;
  try { sessionStorage.setItem(fastLocalCacheKey(action, payload), JSON.stringify({ savedAt: Date.now(), data })); } catch (_) {}
}
function scheduleFastRefreshAfterWrite(action, requestBody) {
  if (!FAST_RUNTIME_ENABLED || !FAST_RUNTIME_WRITE_ACTIONS.has(action)) return;
  const studentId = requestBody.studentId || state.activeStudentId || state.session?.studentId || "";
  setTimeout(() => {
    const dashboardPayload = state.role === "student" ? {} : (studentId ? { studentId } : {});
    api("getStudentDashboard", dashboardPayload, { silent: true, forceNetwork: true }).catch(() => {});
    if (studentId && requestBody.subject && ["saveLesson","updateLessonCorrection","saveSchoolPosition","saveCt"].includes(action)) {
      api("getProgression", { studentId, subject: requestBody.subject, mode: "lesson" }, { silent: true, forceNetwork: true }).catch(() => {});
    }
  }, 2500);
}

function progressionCacheKey(options = {}) {
  if (options.mode === "range") return ["range", options.school || "", options.grade || "", options.subject || "", options.testId || "", options.rangeType || ""].join("|");
  const studentId = options.studentId || state.dashboard?.student?.studentId || state.session?.studentId || state.session?.loginId || "self";
  return ["progress", studentId, options.subject || ""].join("|");
}

function readProgressionCache(options) {
  const entry = state.progressionCache.get(progressionCacheKey(options));
  if (!entry || Date.now() - entry.savedAt > PROGRESSION_CACHE_TTL_MS) return null;
  return entry.data;
}

function writeProgressionCache(options, data) {
  state.progressionCache.set(progressionCacheKey(options), { data, savedAt: Date.now() });
  return data;
}

function invalidateProgressionCache(options = {}) {
  const key = progressionCacheKey(options);
  state.progressionCache.delete(key);
  state.progressionPromises.delete(key);
}

async function loadProgression(options, { force = false } = {}) {
  const key = progressionCacheKey(options);
  if (!force) {
    const cached = readProgressionCache(options);
    if (cached) return cached;
    if (state.progressionPromises.has(key)) return state.progressionPromises.get(key);
  }
  const action = options.mode === "range" ? "getRangeEditor" : "getProgression";
  const request = api(action, options, { silent: true })
    .then((data) => writeProgressionCache(options, data))
    .finally(() => state.progressionPromises.delete(key));
  state.progressionPromises.set(key, request);
  return request;
}

function prefetchProgression(options) {
  loadProgression(options).catch(() => {});
}

async function api(action, payload = {}, { silent = false, forceNetwork = false } = {}) {
  if (CONFIG.apiUrl.includes("__GAS_")) throw new Error("公開APIの設定が完了していません。再読み込みしてください。");
  if (!forceNetwork) {
    const local = readFastLocalCache(action, payload);
    if (local) {
      queueMicrotask(() => api(action, payload, { silent: true, forceNetwork: true }).catch(() => {}));
      return { ...local, _fastLocalCache: true };
    }
  }
  const requestBody = { action, token: state.session?.token || "", adminToken: state.adminToken || "", ...payload };
  if (FAST_RUNTIME_WRITE_ACTIONS.has(action) && !requestBody.mutationId) requestBody.mutationId = crypto.randomUUID();
  const attempt = async (endpoint, fastAttempt = false) => {
    const controller = new AbortController();
    const timeoutMs = fastAttempt ? Math.min(CONFIG.requestTimeoutMs, 12000) : CONFIG.requestTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": fastAttempt ? "application/json" : "text/plain;charset=utf-8" },
        body: JSON.stringify(requestBody),
        redirect: "follow",
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new Error(result.message || "処理に失敗しました。");
      return result;
    } finally { clearTimeout(timer); }
  };
  if (!silent) status(FAST_RUNTIME_ENABLED && usingFastRuntimeFor(action) ? "高速保存中…" : "読み込み中…");
  const endpoint = apiEndpointFor(action);
  try {
    const result = await attempt(endpoint, endpoint === CONFIG.fastRuntimeApiUrl);
    writeFastLocalCache(action, payload, result);
    if (result?.queued) scheduleFastRefreshAfterWrite(action, requestBody);
    status("");
    return result;
  } catch (error) {
    // Never silently put Google Sheets back on the classroom hot path. Operators
    // can deliberately use `?legacy=1` while V3 is repaired.
    status("");
    if (error.name === "AbortError") throw new Error("通信がタイムアウトしました。もう一度お試しください。");
    throw error;
  }
}

async function loadElementaryAdminSummary() {
  if (!state.adminToken || !CONFIG.elementaryApiUrl) return new Map();
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(CONFIG.elementaryApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getAdminSummary", token: state.adminToken }),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok || result.ok === false) throw new Error(result.message || "小学生進捗を取得できませんでした。");
    return new Map((result.students || []).map((student) => [String(student.studentId), student]));
  } finally { clearTimeout(timer); }
}

function mergeElementaryAdminSummary(row, summaries) {
  if (!isElementaryGradeValue(row.grade)) return row;
  const summary = summaries.get(String(row.studentId));
  const differences = summary?.differences || [];
  return {
    ...row,
    actualTeachers: summary?.teachers?.length ? summary.teachers : row.actualTeachers,
    comparison: differences.length ? differences.map((item) => `${item.subject} ${item.label}`).join(" / ") : "進度未入力",
    elementaryDifferences: differences,
    progressDataSource: summary ? "supabase-elementary" : row.progressDataSource,
    updatedAt: summary?.updatedAt || row.updatedAt,
  };
}

function status(message, isError = false) {
  const el = $("globalStatus");
  if (!message) return el.classList.add("hidden");
  el.textContent = message;
  el.classList.remove("hidden");
  el.style.background = isError ? "#fee2e2" : "#edf7ff";
  el.style.color = isError ? "#991b1b" : "#1d4f7a";
}

function loading() {
  $("content").replaceChildren($("loadingTemplate").content.cloneNode(true));
}

function showError(error, retry) {
  $("content").innerHTML = `<div class="card dangerCard"><h2>読み込めませんでした</h2><p>${esc(error.message || error)}</p>${retry ? '<button id="retryButton" class="primaryBtn">再試行</button>' : ""}</div>`;
  if (retry) $("retryButton").onclick = retry;
}

function persistSession() {
  const data = JSON.stringify(state.session);
  sessionStorage.removeItem(KEYS.session);
  localStorage.removeItem(KEYS.local);
  if (state.device === "personal" && $("rememberLogin")?.checked) localStorage.setItem(KEYS.local, data);
  else sessionStorage.setItem(KEYS.session, data);
  sessionStorage.setItem(KEYS.device, state.device);
}

function clearSessions() {
  sessionStorage.removeItem(KEYS.dashboard);
  localStorage.removeItem(KEYS.local);
  localStorage.removeItem(KEYS.admin);
  sessionStorage.removeItem(KEYS.session);
  localStorage.removeItem("forestaStudentAuth");
  localStorage.removeItem("forestaTeacherAuth");
  sessionStorage.removeItem("forestaStudentAuth");
  sessionStorage.removeItem("forestaTeacherAuth");
  state.session = null;
  state.adminToken = "";
  state.teacherStudentCache = {};
  window.__FORESTA_ACTIVE_SESSION__ = null;
  window.__FORESTA_ACTIVE_ROLE__ = "";
}

function persistAdminSession() {
  localStorage.setItem(KEYS.admin, JSON.stringify({ session: state.session, adminToken: state.adminToken }));
}

function persistTeacherLessonSelection() {
  if (state.role !== "teacher" || !state.session) return;
  const payload = {
    teacherLoginId: String(state.session.loginId || ""),
    selectedStudents: state.selectedStudents.slice(0, 2),
    activeStudentId: String(state.activeStudentId || ""),
  };
  localStorage.setItem(KEYS.teacherSelection, JSON.stringify(payload));
}

function restoreTeacherLessonSelection() {
  if (state.role !== "teacher" || !state.session) return;
  try {
    const saved = JSON.parse(localStorage.getItem(KEYS.teacherSelection) || "null");
    if (!saved || String(saved.teacherLoginId || "") !== String(state.session.loginId || "")) return;
    const rows = Array.isArray(saved.selectedStudents)
      ? saved.selectedStudents.filter((student) => student && student.studentId).slice(0, 2)
      : [];
    state.selectedStudents = rows;
    const requested = String(saved.activeStudentId || "");
    state.activeStudentId = rows.some((student) => String(student.studentId) === requested)
      ? requested
      : (rows[0] ? String(rows[0].studentId) : "");
    if (state.activeStudentId) state.activeView = "selected";
  } catch (_) {}
}

function endTeacherLesson() {
  clearTeacherSubjectsForCurrentLesson();
  localStorage.removeItem(KEYS.teacherSelection);
  state.selectedStudents = [];
  state.activeStudentId = "";
  state.teacherStudentCache = {};
  state.dashboard = null;
  window.__FORESTA_ACTIVE_DASHBOARD__ = null;
  state.activeView = "search";
  openView("search");
}

window.__FORESTA_INVALIDATE_TEACHER_STUDENT__ = (studentId) => {
  const id = String(studentId || state.activeStudentId || "");
  if (!id) return;
  delete state.teacherStudentCache[id];
  if (String(state.activeStudentId || "") === id) {
    state.dashboard = null;
    window.__FORESTA_ACTIVE_DASHBOARD__ = null;
  }
};

function changeTeacherStudent() {
  if (state.role !== "teacher") return;
  const activeId = String(state.activeStudentId || "");
  if (!activeId) { state.activeView = "search"; return openView("search"); }
  const active = state.selectedStudents.find((student) => String(student.studentId) === activeId);
  const label = active?.name ? `${active.name}さん` : "現在の生徒";
  if (!confirm(`${label}を選択から外して、生徒を選び直しますか？`)) return;
  state.selectedStudents = state.selectedStudents.filter((student) => String(student.studentId) !== activeId);
  delete state.teacherStudentCache[activeId];
  state.activeStudentId = state.selectedStudents[0] ? String(state.selectedStudents[0].studentId) : "";
  state.dashboard = null;
  window.__FORESTA_ACTIVE_DASHBOARD__ = null;
  persistTeacherLessonSelection();
  state.activeView = "search";
  openView("search");
}

function navItems() {
  if (state.role === "student" && isElementaryGradeValue(state.session?.grade)) return [["home","今日の進捗"],["homework","宿題"]];
  if (state.role === "student") return [["home", "今日の進捗"], ["homework", "宿題"], ["scores", "目標点・成績"]];
  if (state.role === "teacher") return [["search", "生徒を選ぶ"], ["today", "本日の授業"], ["selected", "選択中の生徒"]];
  return [["admin", "本日の速報"], ["ranges", "進行表・テスト範囲設定"], ["training", "特訓部屋"], ["students", "全生徒"]];
}


let teacherHomeworkSubjectMemory = "";
function homeworkSubjectKey(value) {
  const s = String(value || "").trim();
  return s === "数学" || s === "算数" ? "MATH" : s;
}
function teacherSubjectStorageKey(studentId = state.activeStudentId) {
  return `${String(state.session?.loginId || "teacher")}|${String(studentId || "")}`;
}
function teacherSubjectStore() {
  try { return JSON.parse(localStorage.getItem(KEYS.teacherSubjects) || "{}") || {}; }
  catch (_) { return {}; }
}
function savedTeacherSubject(studentId = state.activeStudentId, choices = []) {
  const value = String(teacherSubjectStore()[teacherSubjectStorageKey(studentId)] || "");
  if (!value) return "";
  if (!choices?.length) return value;
  return choices.includes(value) ? value : "";
}
function rememberTeacherSubject(subject, studentId = state.activeStudentId) {
  const value = String(subject || "").trim();
  teacherHomeworkSubjectMemory = value;
  if (!studentId) return;
  const store = teacherSubjectStore();
  const key = teacherSubjectStorageKey(studentId);
  if (value) store[key] = value;
  else delete store[key];
  localStorage.setItem(KEYS.teacherSubjects, JSON.stringify(store));
}
function clearTeacherSubjectsForCurrentLesson() {
  const store = teacherSubjectStore();
  const prefix = `${String(state.session?.loginId || "teacher")}|`;
  for (const student of state.selectedStudents || []) delete store[`${prefix}${String(student.studentId || "")}`];
  localStorage.setItem(KEYS.teacherSubjects, JSON.stringify(store));
  teacherHomeworkSubjectMemory = "";
}
function currentTeacherHomeworkSubject() {
  if (state.role !== "teacher") return "";
  const explicit = document.getElementById("lessonSubject") || document.getElementById("elementaryLessonSubject");
  if (explicit) {
    const value = String(explicit.value || "").trim();
    teacherHomeworkSubjectMemory = value;
    return value;
  }
  const saved = savedTeacherSubject(state.activeStudentId);
  if (saved) teacherHomeworkSubjectMemory = saved;
  return saved || teacherHomeworkSubjectMemory || "";
}
function applyTeacherHomeworkSubjectFilter() {
  if (state.role !== "teacher") return;
  const selected = currentTeacherHomeworkSubject();
  const cards = [...document.querySelectorAll(".teacherHomeworkCard,.archivedHomeworkCard")];
  const prompts = [...document.querySelectorAll(".teacherHomeworkSubjectPrompt")];
  prompts.forEach((node) => node.classList.toggle("hidden", !!selected));
  if (!selected) {
    cards.forEach((card) => card.classList.add("hidden"));
    return;
  }
  const wanted = homeworkSubjectKey(selected);
  cards.forEach((card) => {
    const pill = card.querySelector(".subjectPill")?.textContent || "";
    card.classList.toggle("hidden", homeworkSubjectKey(pill) !== wanted);
  });
}
document.addEventListener("change", (event) => {
  if (state.role !== "teacher" || event.target?.tagName !== "SELECT") return;
  if (!["lessonSubject","elementaryLessonSubject"].includes(event.target.id)) return;
  rememberTeacherSubject(event.target.value, state.activeStudentId);
  queueMicrotask(applyTeacherHomeworkSubjectFilter);
});
const teacherHomeworkFilterObserver = new MutationObserver(() => queueMicrotask(applyTeacherHomeworkSubjectFilter));
teacherHomeworkFilterObserver.observe(document.documentElement, { childList: true, subtree: true });

function renderShell() {
  // Share the actual in-memory login with the elementary enhancement module.
  // This is the source of truth; stored sessions may contain an older student login.
  window.__FORESTA_ACTIVE_SESSION__ = state.session || null;
  window.__FORESTA_ACTIVE_ROLE__ = state.role || "";
  $("topAdminEntry")?.classList.remove("hidden");
  const modeIndicator = $("modeIndicator");
  if (modeIndicator) {
    modeIndicator.classList.remove("hidden");
    modeIndicator.querySelectorAll("[data-mode]").forEach((item) => {
      item.classList.toggle("active", item.dataset.mode === state.role);
    });
  }
  const lessonEndButton = $("lessonEndButton");
  if (lessonEndButton) {
    lessonEndButton.classList.toggle("hidden", state.role !== "teacher");
    lessonEndButton.onclick = state.role === "teacher" ? () => {
      if (!confirm("授業を終了して、選択中の生徒をすべて閉じますか？")) return;
      endTeacherLesson();
    } : null;
  }
  $("loginView").classList.add("hidden");
  $("workspace").classList.remove("hidden");
  $("userName").textContent = state.session?.name || "—";
  $("userMeta").textContent = `${state.role === "student" ? "生徒" : state.role === "teacher" ? "講師" : "管理者"} / ${state.session?.campus || state.session?.grade || ""}`;
  $("userInitial").textContent = (state.session?.name || "F").slice(0, 1);
  $("navItems").innerHTML = navItems().map(([id, label]) => `<button class="navButton ${state.activeView === id ? "active" : ""}" data-view="${id}">${label}</button>`).join("");
  $("navItems").querySelectorAll("button").forEach((button) => button.onclick = () => openView(button.dataset.view));
}

async function openView(view) {
  state.activeView = view;
  renderShell();
  loading();
  try {
    if (state.role === "student") await renderStudent(view);
    else if (state.role === "teacher") await renderTeacher(view);
    else await renderAdmin(view);
  } catch (error) {
    showError(error, () => openView(view));
  }
}

function metricCard(title, value, sub = "", tone = "") {
  return `<article class="card span4 ${tone}"><p class="cardTitle">${esc(title)}</p><div class="bigValue">${esc(value)}</div>${sub ? `<p class="muted">${esc(sub)}</p>` : ""}</article>`;
}

function subjectProgressClass(subject) {
  return ({ 英語: "english", 数学: "math", 算数: "math", 国語: "japanese", 理科: "science", 社会: "social" })[subject] || "other";
}
function isElementaryGradeValue(v){return /^小[1-6]$/.test(String(v||"").normalize("NFKC").replace(/年$/u,""));}
const ELEMENTARY_HOMEWORK={算数:["TRYの赤×なおし","エクササイズ"],英語:["TRYの赤×なおし","エクササイズ"],国語:["本日の赤×なおし"]};

function mappedRoundWidth(percent) {
  const value = Math.max(0, Math.min(300, Number(percent || 0)));
  if (value <= 100) return value * 0.7;
  if (value <= 200) return 70 + (value - 100) * 0.15;
  return 85 + (value - 200) * 0.15;
}

function studentRoundProgressHtml(data) {
  const rows = TRACKED_SUBJECTS.map((subject) => {
    const row = (data.progress || []).find((item) => item.subject === subject);
    return row || { subject, roundProgress: { targetCount: 0, roundCounts: { 1: 0, 2: 0, 3: 0 } } };
  });
  const configuredRows = rows.filter((row) => Number(row.roundProgress?.targetCount || 0) > 0);
  const totalTarget = configuredRows.reduce((sum, row) => sum + Number(row.roundProgress.targetCount || 0), 0);
  const roundCounts = [1, 2, 3].map((round) => configuredRows.reduce((sum, row) => sum + Number(row.roundProgress.roundCounts?.[round] || 0), 0));
  const totalDone = roundCounts.reduce((sum, value) => sum + value, 0);
  const overallPercent = totalTarget ? Math.round(totalDone / totalTarget * 100) : 0;
  const roundBars = roundCounts.map((count, index) => {
    const pct = totalTarget ? Math.round(count / totalTarget * 100) : 0;
    return `<div class="roundProgressLine round${index + 1}"><span>${index + 1}周目</span><i><b style="width:${Math.min(100, pct)}%"></b></i><strong>${pct}%</strong></div>`;
  }).join("");
  const subjectBars = rows.map((row) => {
    const target = Number(row.roundProgress?.targetCount || 0);
    const done = [1, 2, 3].reduce((sum, round) => sum + Number(row.roundProgress?.roundCounts?.[round] || 0), 0);
    const pct = target ? Math.round(done / target * 100) : 0;
    const label = target ? `${pct}%` : "未設定";
    return `<div class="subjectRoundBar ${subjectProgressClass(row.subject)} ${target ? "" : "unconfigured"}"><span>${esc(row.subject)}</span><i><em style="width:${mappedRoundWidth(pct)}%"></em><u>1周目ゴール</u></i><strong>${label}</strong></div>`;
  }).join("");
  return `<section class="roundProgressHero studentFiveSubjectGraph"><div class="roundScore"><small>3周合計</small><strong>${overallPercent}%</strong><span>${totalTarget ? `(${totalDone}/${totalTarget})` : "範囲未設定"}</span></div><div class="roundProgressBody"><div class="roundProgressLines">${roundBars}</div><div class="subjectRoundBars">${subjectBars}</div><p class="roundProgressGuide">5科目を表示。100%で1周目達成、グラフ70%位置を1周目ゴールにして2周目・3周目を積み上げます。</p></div></section>`;
}

function comparisonShortLabel(value) {
  if (value === "学校より先") return "先行";
  if (value === "学校と同じ") return "同じ";
  if (value === "学校より遅れ") return "遅れ";
  return "未設定";
}

function comparisonStatusClass(value) {
  if (value === "学校より先") return "ahead";
  if (value === "学校と同じ") return "same";
  if (value === "学校より遅れ") return "behind";
  return "unset";
}

function studentComparisonMiniHtml(data) {
  const rows = TRACKED_SUBJECTS.map((subject) => (data.progress || []).find((row) => row.subject === subject) || { subject, comparison: "未設定" });
  return `<article class="card span4 studentComparisonCard"><p class="cardTitle">学校との比較</p><div class="studentComparisonMini">${rows.map((row) => `<div class="comparisonMiniRow ${comparisonStatusClass(row.comparison)}"><span class="comparisonSubject ${subjectProgressClass(row.subject)}">${esc(row.subject)}</span><b>${esc(comparisonShortLabel(row.comparison))}</b></div>`).join("")}</div></article>`;
}

function adminRangeCta() {
  return `<section class="adminRangeCta" aria-labelledby="adminRangeCtaTitle"><div><span class="adminRangeKicker">管理者アプリの中心機能</span><h1 id="adminRangeCtaTitle">進行表・テスト範囲設定</h1><p>学校・学年・科目・次回テストを選び、進行表全体から予想範囲または決定範囲を設定します。</p></div><button id="openRangeSettingsPrimary" class="adminRangeCtaButton" type="button">進行表・テスト範囲設定を開く</button></section>`;
}

function cacheStudentDashboard(data) {
  try {
    if (!data?.student?.studentId) return;
    sessionStorage.setItem(KEYS.dashboard, JSON.stringify({ studentId: data.student.studentId, savedAt: Date.now(), data }));
  } catch {}
}

function readCachedStudentDashboard(studentId, maxAgeMs = 120000) {
  try {
    const raw = sessionStorage.getItem(KEYS.dashboard);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (String(entry.studentId || "") !== String(studentId || "")) return null;
    if (Date.now() - Number(entry.savedAt || 0) > maxAgeMs) return null;
    return entry.data || null;
  } catch { return null; }
}

async function renderStudent(view) {
  if (view === "homeworkArchive") return renderHomeworkArchivePage("student");
  const data = state.dashboard || await api("getStudentDashboard");
  state.dashboard = data; window.__FORESTA_ACTIVE_DASHBOARD__ = data;
  cacheStudentDashboard(data);
  if (view === "homework") return renderHomeworkPage(data);
  if (isElementaryGradeValue(data.student?.grade)) return renderElementaryStudent(data);
  if (view === "scores") return renderScoresPage(data);
  const next = data.nextTest;
  const p = data.progress?.[0] || {};
  $("content").innerHTML = `
    <header class="pageHead"><div><h1>${esc(data.student.name)}さんの進捗</h1><p>${esc(data.student.school || "学校未登録")} / ${esc(data.student.grade)}</p></div><div class="actionRow">${TRACKED_SUBJECTS.map((s) => `<button class="secondaryBtn progressionButton" data-subject="${s}">${s}の進行表を見る・入力</button>`).join("")}</div></header>
    <article class="card studentTargetPanel studentTargetTop"><p class="cardTitle">目標点</p>${targetForm(data.targets || {}, next?.testId)}</article>
    ${studentRoundProgressHtml(data)}
    <section class="cardGrid">
      ${metricCard("次回テスト", next?.name || "次回テスト未登録", next ? `${fmtDate(next.startDate)}〜${fmtDate(next.endDate)}` : "学校別日程が未登録です", next ? "" : "alert")}
      ${metricCard("テストまで", next ? `${next.daysUntil}日` : "未設定", next ? "日本時間で計算" : "", next?.daysUntil <= 14 ? "alert" : "")}
      ${studentComparisonMiniHtml(data)}
      <article class="card span12"><p class="cardTitle">進度の見える化</p><div class="tableWrap"><table><thead><tr><th>科目</th><th>学校進度</th><th>フォレスタ進度</th><th>比較</th><th>残り単元</th><th>必要ペース</th></tr></thead><tbody>${(data.progress || []).map((row) => `<tr><td>${esc(row.subject)}</td><td>${esc(row.schoolUnitName || "未設定")}</td><td>${esc(row.forestaUnitName || "未設定")}</td><td><span class="badge ${row.comparison === "学校より先" ? "good" : "warn"}">${esc(row.comparison)}</span></td><td>${row.remaining ?? "未設定"}</td><td>${row.urgent ? '<span class="badge bad">緊急</span>' : row.requiredPerLesson == null ? "未設定" : `${row.requiredPerLesson}単元/回`}</td></tr>`).join("")}</tbody></table></div></article>
      <article class="card span12 studentHomeworkPanel"><div class="homeworkPanelHead"><p class="cardTitle">次回までの宿題</p><button id="openHomeworkArchiveHome" class="ghostBtn homeworkArchiveOpen" type="button">アーカイブ</button></div><p><strong>宿題は2日以内に終わらせよう！</strong></p><div class="homeworkSourceLegend"><span class="self">自主学習で出た宿題</span><span class="teacher">講師から出た宿題</span></div><div class="homeworkList">${homeworkHtml(data.homework || [], "student")}</div></article>
    </section>`;
  const studentProgressMode = data.capabilities?.studentRoundInput ? "student" : "view";
  $("content").querySelectorAll(".progressionButton").forEach((button) => {
    const options = { subject: button.dataset.subject, mode: studentProgressMode };
    button.onclick = () => openProgress(options);
    button.onpointerenter = () => prefetchProgression(options);
    button.onfocus = () => prefetchProgression(options);
  });
  const prefetchSubjects = () => TRACKED_SUBJECTS.forEach((subject, index) => setTimeout(() => prefetchProgression({ subject, mode: studentProgressMode }), index * 220));
  if ("requestIdleCallback" in window) requestIdleCallback(prefetchSubjects, { timeout: 1800 });
  else setTimeout(prefetchSubjects, 900);
  bindTargetForm(next?.testId);
  bindHomeworkChecks();
  bindHomeworkArchiveActions("student");
  $("openHomeworkArchiveHome")?.addEventListener("click", () => openView("homeworkArchive"));
}


function elementaryDiffClass(v){return v>0?"ahead":v<0?"behind":v===0?"same":"unset"}
function elementaryCoreRows(data){const existing=data?.progress||[], raw=[...(data?.elementary?.subjects||[]),...(data?.student?.subjects||[])].map(s=>String(s||"").trim()==="数学"?"算数":String(s||"").trim()).filter(s=>["算数","国語","英語"].includes(s)), subjects=[...new Set(raw)];const ordered=(subjects.length?subjects:["算数"]).sort((a,b)=>["算数","国語","英語"].indexOf(a)-["算数","国語","英語"].indexOf(b));return ordered.map(subject=>{const found=existing.find(r=>(r.subject==="数学"?"算数":r.subject)===subject);return found?{...found,subject}:{subject,differenceLabel:"未設定",schoolUnitName:"",forestaUnitName:"",unitOptions:[],latestUnitTest:null}})}
function elementaryTestsHtml(tests){const rows=(tests||[]).slice(0,10);if(!rows.length)return '<div class="emptyState">学校の単元テストはまだ登録されていません。</div>';return '<div class="tableWrap"><table><thead><tr><th>日付</th><th>科目</th><th>単元</th><th>点数</th></tr></thead><tbody>'+rows.map(t=>`<tr><td>${esc(fmtShortDate(t.testDate))}</td><td>${esc(t.subject)}</td><td>${esc(t.unitName||"")}</td><td><strong class="elementaryScore">${esc(t.score)}/${esc(t.maxScore||100)}</strong></td></tr>`).join('')+'</tbody></table></div>'}
function elementarySubjectTestHistory(tests,subject){const rows=(tests||[]).filter(t=>(t.subject==="数学"?"算数":t.subject)===subject).slice(0,6);if(!rows.length)return '<div class="emptyState compact">まだありません。</div>';return `<div class="elementarySubjectTestList">${rows.map(t=>`<div class="elementarySubjectTestRow"><span>${esc(fmtShortDate(t.testDate))}</span><strong>${esc(t.unitName||"単元テスト")}</strong><b class="elementaryTestScorePair"><span>表 <em>${esc(t.score)}</em><small>/${esc(t.maxScore||100)}</small></span>${t.backScore!==null&&t.backScore!==undefined&&String(t.backScore)!==""?`<span>裏 <em>${esc(t.backScore)}</em><small>/${esc(t.backMaxScore||50)}</small></span>`:""}</b></div>`).join('')}</div>`}
function elementaryRecentTestsHtml(tests){const all=(tests||[]);const other=all.filter(t=>!["算数","数学","国語"].includes(t.subject)).slice(0,4);return `<div class="elementaryRecentTestGrid"><section><h3>算数</h3>${elementarySubjectTestHistory(all,"算数")}</section><section><h3>国語</h3>${elementarySubjectTestHistory(all,"国語")}</section></div>${other.length?`<details class="elementaryOtherTests"><summary>英語などの履歴</summary>${elementaryTestsHtml(other)}</details>`:""}`}
function renderElementaryStudent(data){const rows=elementaryCoreRows(data);$("content").innerHTML=`<header class="pageHead"><div><span class="elementaryKicker">小学生</span><h1>${esc(data.student.name)}さんの進捗</h1><p>${esc(data.student.school||"学校未登録")} / ${esc(data.student.grade)}　学校との差を単元数で確認します。</p></div></header><section class="elementaryProgressGrid">${rows.map(r=>`<article class="card elementarySubjectCard ${subjectProgressClass(r.subject)}"><div class="elementaryCardHead"><span class="subjectPill">${esc(r.subject)}</span><strong class="elementaryDifference ${elementaryDiffClass(r.differenceUnits)}">${esc(r.differenceLabel||"未設定")}</strong></div><p><small>学校</small><br><strong>${esc(r.schoolUnitName||"未入力")}</strong></p><p><small>塾</small><br><strong>${esc(r.forestaUnitName||"未入力")}</strong></p><button class="secondaryBtn elementaryStudentProgress" data-subject="${esc(r.subject)}">進行表を見る</button></article>`).join('')}</section><section class="cardGrid"><article class="card span12"><p class="cardTitle">最近の学校単元テスト</p>${elementaryRecentTestsHtml(data.elementary?.unitTests||[])}</article><article class="card span12"><div class="homeworkPanelHead"><p class="cardTitle">次回までの宿題</p><button id="openHomeworkArchiveHome" class="ghostBtn">アーカイブ</button></div><div class="homeworkList">${homeworkHtml(data.homework||[],"student")}</div></article></section>`;$("content").querySelectorAll(".elementaryStudentProgress").forEach(b=>b.onclick=()=>openProgress({subject:b.dataset.subject,mode:"view"}));bindHomeworkChecks();bindHomeworkArchiveActions("student");$("openHomeworkArchiveHome")?.addEventListener("click",()=>openView("homeworkArchive"))}

function homeworkDisplayInfo(item) {
  const raw = String(item?.contentText || item?.contentType || "").trim();
  const folded = raw.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  if (/巻末.*keywords?test|keywords?test.*巻末/iu.test(raw)) return { title: "巻末のKeyWordsTestの暗記", note: "巻末のKeyWordsTestを暗記します。" };
  if (/暗記マーク|基本文/iu.test(raw)) return { title: "暗記マーク（基本文の暗記）", note: "暗記マークが付いた基本文を暗記します。" };
  if (/☆日→英/u.test(raw)) return { title: "KeyWords「☆日→英」暗記", note: "KeyWordsの指定範囲を日→英で暗記します。" };
  if (/keywords?/iu.test(raw)) return { title: "KEYWORDSの暗記", note: "KEYWORDSを暗記します。" };
  if (/try/iu.test(raw) && /(赤|×|直し|なおし)/u.test(raw)) return { title: "TRYの赤×なおし", note: "TRYで間違えた問題を解き直します。" };
  if (/(エクササイズ|exercise)/iu.test(raw) && /(赤|×|直し|なおし)/u.test(raw)) return { title: "エクササイズの赤×なおし", note: "エクササイズで間違えた問題を解き直します。" };
  if (folded === "exercise" || /^(エクササイズ)$/u.test(raw)) return { title: "エクササイズ", note: "指定されたエクササイズに取り組みます。" };
  if (/宿題/iu.test(raw) && /(赤|×|直し|なおし)/u.test(raw)) return { title: "宿題の赤×なおし", note: "宿題で間違えた問題を解き直します。" };
  if (/try/iu.test(raw)) return { title: "TRY", note: "指定されたTRYに取り組みます。" };
  return { title: raw || "宿題", note: "" };
}

function homeworkGroups(items) {
  const groups = new Map();
  (items || []).forEach((item) => {
    const key = [item.lessonId || "", item.unitId || "", item.recommendedDueDate || "", item.source || "teacher"].join("|");
    if (!groups.has(key)) groups.set(key, {
      items: [],
      subject: item.subject || "",
      unitNumber: item.unitNumber || "",
      unitName: item.unitName || "",
      roundNumber: item.roundNumber || "",
      createdAt: item.createdAt || "",
      due: item.recommendedDueDate || "",
      source: item.source || "teacher",
      sourceLabel: item.sourceLabel || (item.source === "self" ? "自主学習" : "講師からの宿題"),
    });
    groups.get(key).items.push(item);
  });
  return [...groups.values()].sort((a, b) => {
    const ac = new Date(a.createdAt || a.due || 0).getTime() || 0;
    const bc = new Date(b.createdAt || b.due || 0).getTime() || 0;
    return bc - ac;
  });
}

function homeworkItemCompleted(item) {
  if (typeof item?.completed === "boolean") return item.completed;
  return item?.source === "self" ? !!item.studentChecked : !!item.teacherChecked;
}

function homeworkCompletionSummary(items) {
  const list = items || [];
  return {
    total: list.length,
    completed: list.filter(homeworkItemCompleted).length,
    selfTotal: list.filter((item) => item.source === "self").length,
    teacherTotal: list.filter((item) => item.source !== "self").length,
  };
}

function homeworkSourceClass(source) { return source === "self" ? "selfStudyHomework" : "teacherAssignedHomework"; }
function homeworkSourcePill(source) { return `<span class="homeworkSourcePill ${source === "self" ? "self" : "teacher"}">${source === "self" ? "自主学習" : "講師から"}</span>`; }
function homeworkGroupIds(group) { return group.items.map((item) => item.homeworkId).filter(Boolean).join(","); }
function homeworkGroupCanArchive(group) { return group.items.length > 0 && group.items.every((item) => item.canArchive === true || (!item.archived && homeworkItemCompleted(item))); }

function studentHomeworkCardsHtml(items) {
  if (!items.length) return '<div class="emptyState">現在の宿題はありません。</div>';
  return homeworkGroups(items).map((group) => {
    const subject = group.subject || "宿題";
    const selfStudy = group.source === "self";
    const canArchive = homeworkGroupCanArchive(group);
    const archiveButton = `<button class="homeworkArchiveX ${canArchive ? "" : "hidden"}" type="button" data-ids="${esc(homeworkGroupIds(group))}" title="この宿題をアーカイブ" aria-label="この宿題をアーカイブ">×</button>`;
    const tasks = group.items.map((item) => {
      const display = homeworkDisplayInfo(item);
      let saveText = "自動保存";
      if (selfStudy) saveText = item.studentChecked ? "完了" : "自動保存";
      else if (item.teacherChecked) saveText = "講師確認済み";
      else if (item.studentChecked) saveText = "講師確認待ち";
      const disableStudent = !selfStudy && item.teacherChecked;
      return `<label class="studentHomeworkTask ${homeworkItemCompleted(item) ? "confirmed" : ""}" title="${esc(display.title)}"><span class="studentHomeworkTaskLabel"><strong>${esc(display.title)}</strong></span><span class="studentTaskRight"><span class="studentTaskAction"><input class="homeworkCheck" type="checkbox" data-id="${esc(item.homeworkId)}" ${item.studentChecked ? "checked" : ""} ${disableStudent ? "disabled" : ""}><b>${disableStudent ? "確認済み" : "チェック"}</b></span><small class="homeworkSaveState">${esc(saveText)}</small></span></label>`;
    }).join("");
    return `<article class="studentHomeworkCard ${subjectProgressClass(subject)} ${homeworkSourceClass(group.source)}" data-homework-source="${esc(group.source)}">${archiveButton}<div class="studentHomeworkMeta"><div><span class="subjectPill">${esc(subject)}</span>${group.roundNumber ? `<span class="roundPill">${esc(group.roundNumber)}周目</span>` : ""}${homeworkSourcePill(group.source)}</div><strong>${esc([group.unitNumber, group.unitName].filter(Boolean).join(" ") || "宿題")}</strong><small>宿題 ${fmtShortDate(group.createdAt)}　期限 ${fmtShortDate(group.due)}</small><small class="homeworkCompletionRule">${selfStudy ? "生徒チェックで完了" : "講師チェックで完了"}</small></div><div class="studentHomeworkTasks">${tasks}</div></article>`;
  }).join("");
}

function teacherHomeworkCardsHtml(items) {
  if (!items.length) return '<div class="emptyState">現在の宿題はありません。</div>';
  return homeworkGroups(items).map((group) => {
    const subject = group.subject || "宿題";
    const selfStudy = group.source === "self";
    const canArchive = homeworkGroupCanArchive(group);
    const archiveButton = `<button class="homeworkArchiveX ${canArchive ? "" : "hidden"}" type="button" data-ids="${esc(homeworkGroupIds(group))}" title="この宿題をアーカイブ" aria-label="この宿題をアーカイブ">×</button>`;
    const tasks = group.items.map((item) => {
      const display = homeworkDisplayInfo(item);
      if (selfStudy) {
        return `<div class="studentHomeworkTask teacherSelfHomework ${item.studentChecked ? "confirmed" : ""}"><span class="studentHomeworkTaskLabel"><strong>${esc(display.title)}</strong></span><span class="teacherHomeworkState">${item.studentChecked ? "✓ 生徒チェック済み・完了" : "生徒未完了"}</span></div>`;
      }
      return `<label class="studentHomeworkTask teacherAssignedTask ${item.teacherChecked ? "confirmed" : ""}"><span class="studentHomeworkTaskLabel"><strong>${esc(display.title)}</strong><small class="teacherStudentState">生徒：${item.studentChecked ? "チェック済み" : "未チェック"}</small></span><span class="studentTaskRight"><span class="studentTaskAction"><input class="teacherHomeworkCheck" type="checkbox" data-id="${esc(item.homeworkId)}" ${item.teacherChecked ? "checked" : ""}><b>${item.teacherChecked ? "講師確認済み" : "講師チェック"}</b></span><small class="homeworkSaveState">${item.teacherChecked ? "完了" : "講師確認で完了"}</small></span></label>`;
    }).join("");
    return `<article class="studentHomeworkCard teacherHomeworkCard ${subjectProgressClass(subject)} ${homeworkSourceClass(group.source)}" data-homework-source="${esc(group.source)}">${archiveButton}<div class="studentHomeworkMeta"><div><span class="subjectPill">${esc(subject)}</span>${group.roundNumber ? `<span class="roundPill">${esc(group.roundNumber)}周目</span>` : ""}${homeworkSourcePill(group.source)}</div><strong>${esc([group.unitNumber, group.unitName].filter(Boolean).join(" ") || "宿題")}</strong><small>宿題 ${fmtShortDate(group.createdAt)}　期限 ${fmtShortDate(group.due)}</small><small class="homeworkCompletionRule">${selfStudy ? "自主学習：生徒チェックで完了" : "授業宿題：講師チェックで完了"}</small></div><div class="studentHomeworkTasks teacherHomeworkTasks">${tasks}</div></article>`;
  }).join("");
}

function homeworkHtml(items, mode = "readonly") {
  if (mode === "student" && state.dashboard?.capabilities?.studentHomeworkCardsV2) return studentHomeworkCardsHtml(items);
  if (mode === "teacher") return teacherHomeworkCardsHtml(items);
  if (!items.length) return '<div class="emptyState">現在の宿題はありません。</div>';
  return items.map((item) => `<div class="homeworkItem ${homeworkItemCompleted(item) ? "complete" : ""} ${item.overdue ? "overdue" : ""}"><div><strong>${esc(item.unitNumber || "")}</strong> ${esc(homeworkDisplayInfo(item).title)}<br><small>${homeworkItemCompleted(item) ? "完了" : "未完了"}</small></div><span class="badge ${item.overdue ? "bad" : ""}">${fmtDate(item.recommendedDueDate)}</span></div>`).join("");
}

function renderHomeworkPage(data) {
  const summary = homeworkCompletionSummary(data.homework || []);
  $("content").innerHTML = `<header class="pageHead"><div><h1>次回までの宿題</h1><p>宿題は2日以内に終わらせよう！</p></div><div class="actionRow"><button id="openHomeworkArchive" class="ghostBtn" type="button">アーカイブ</button></div></header><div class="homeworkSourceLegend"><span class="self">自主学習で出た宿題</span><span class="teacher">講師から出た宿題</span></div><section class="cardGrid">${metricCard("完了", `${summary.completed}/${summary.total}`)}${metricCard("未完了", `${summary.total - summary.completed}/${summary.total}`)}<article class="card span12"><div class="homeworkList">${homeworkHtml(data.homework || [], "student")}</div></article></section>`;
  bindHomeworkChecks();
  bindHomeworkArchiveActions("student");
  $("openHomeworkArchive").onclick = () => openView("homeworkArchive");
}

function updateSelfStudyArchiveAvailability(card) {
  if (!card || card.dataset.homeworkSource !== "self") return;
  const button = card.querySelector(".homeworkArchiveX");
  if (!button) return;
  const checks = [...card.querySelectorAll(".homeworkCheck")];
  button.classList.toggle("hidden", !checks.length || !checks.every((input) => input.checked));
}

function bindHomeworkChecks() {
  $("content").querySelectorAll(".homeworkCheck:not(:disabled)").forEach((input) => input.onchange = async () => {
    const nextChecked = input.checked;
    const item = input.closest(".studentHomeworkTask, .homeworkItem");
    const card = input.closest(".studentHomeworkCard");
    const saveState = item?.querySelector(".homeworkSaveState");
    input.disabled = true;
    if (saveState) saveState.textContent = "保存中…";
    try {
      await api("studentCheckHomework", { homeworkId: input.dataset.id, checked: nextChecked });
      state.dashboard = null;
      sessionStorage.removeItem(KEYS.dashboard);
      if (saveState) saveState.textContent = card?.dataset.homeworkSource === "self" ? (nextChecked ? "完了" : "自動保存") : (nextChecked ? "講師確認待ち" : "自動保存");
      const actionLabel = item?.querySelector(".studentTaskAction b");
      if (actionLabel) actionLabel.textContent = "チェック";
      input.disabled = false;
      updateSelfStudyArchiveAvailability(card);
    } catch (error) {
      input.checked = !nextChecked;
      input.disabled = false;
      if (saveState) saveState.textContent = "保存失敗・もう一度変更してください";
      status(error.message, true);
    }
  });
}

function bindTeacherHomeworkChecks() {
  $("content").querySelectorAll(".teacherHomeworkCheck").forEach((input) => input.onchange = async () => {
    const nextChecked = input.checked;
    input.disabled = true;
    try {
      const result = await api("teacherCheckHomework", { studentId: state.activeStudentId, homeworkId: input.dataset.id, checked: nextChecked });
      if (FAST_RUNTIME_ENABLED && result?.queued && !result?._fastRuntimeFallback) {
        input.disabled = false;
        status("講師チェックを保存しました（高速保存）。");
        return;
      }
      if (state.activeStudentId) {
        delete state.teacherStudentCache[String(state.activeStudentId)];
        await renderTeacherStudent(state.activeStudentId, { force: true });
      }
    } catch (error) {
      input.checked = !nextChecked;
      input.disabled = false;
      status(error.message, true);
    }
  });
}

function bindHomeworkArchiveActions(mode) {
  $("content").querySelectorAll(".homeworkArchiveX").forEach((button) => button.onclick = async () => {
    const ids = String(button.dataset.ids || "").split(",").filter(Boolean);
    if (!ids.length || !confirm("この宿題をアーカイブしますか？")) return;
    button.disabled = true;
    try {
      await api("archiveHomework", { homeworkIds: ids, studentId: mode === "teacher" ? state.activeStudentId : "" });
      if (mode === "teacher" && state.activeStudentId) {
        delete state.teacherStudentCache[String(state.activeStudentId)];
        await renderTeacherStudent(state.activeStudentId, { force: true });
      } else {
        state.dashboard = null;
        sessionStorage.removeItem(KEYS.dashboard);
        await openView(state.activeView === "homework" ? "homework" : "home");
      }
    } catch (error) {
      button.disabled = false;
      status(error.message, true);
    }
  });
}

function homeworkArchiveCardsHtml(items, mode) {
  if (!items.length) return '<div class="emptyState">アーカイブされた宿題はありません。</div>';
  return homeworkGroups(items).map((group) => {
    const subject = group.subject || "宿題";
    const selfStudy = group.source === "self";
    const tasks = group.items.map((item) => {
      const display = homeworkDisplayInfo(item);
      const statusText = selfStudy ? (item.studentChecked ? "生徒チェック済み" : "未完了") : (item.teacherChecked ? "講師確認済み" : "未完了");
      return `<div class="archivedHomeworkTask"><strong>${esc(display.title)}</strong><small>${esc(statusText)}</small></div>`;
    }).join("");
    const ids = homeworkGroupIds(group);
    return `<article class="studentHomeworkCard archivedHomeworkCard ${subjectProgressClass(subject)} ${homeworkSourceClass(group.source)}"><div class="studentHomeworkMeta"><div><span class="subjectPill">${esc(subject)}</span>${group.roundNumber ? `<span class="roundPill">${esc(group.roundNumber)}周目</span>` : ""}${homeworkSourcePill(group.source)}</div><strong>${esc([group.unitNumber, group.unitName].filter(Boolean).join(" ") || "宿題")}</strong><small>期限 ${fmtShortDate(group.due)}</small></div><div class="archivedHomeworkBody"><div class="archivedHomeworkTasks">${tasks}</div><div class="archiveActions"><button class="restoreHomeworkGroup secondaryBtn" type="button" data-ids="${esc(ids)}">復元</button>${mode === "teacher" || (mode === "student" && group.source === "self") ? `<button class="deleteHomeworkGroup dangerOutlineBtn" type="button" data-ids="${esc(ids)}">完全削除</button>` : ""}</div></div></article>`;
  }).join("");
}

async function renderHomeworkArchivePage(mode = "student", studentId = "") {
  const data = await api("getHomeworkArchive", studentId ? { studentId } : {}, { silent: true });
  const isTeacher = mode === "teacher";
  $("content").innerHTML = `${isTeacher ? selectedTabsHtml() : ""}<header class="pageHead"><div><h1>宿題アーカイブ</h1><p>${isTeacher ? `${esc(data.student?.name || "")}さん / ` : ""}完了した宿題を保管しています。</p></div><div class="actionRow"><button id="backFromHomeworkArchive" class="ghostBtn" type="button">← 宿題に戻る</button></div></header><div class="homeworkSourceLegend"><span class="self">自主学習で出た宿題</span><span class="teacher">講師から出た宿題</span></div>${!isTeacher ? '<p class="archiveNote">自主学習で出た宿題は自分で完全削除できます。講師から出た宿題の完全削除は講師画面から行います。</p>' : ""}<div class="homeworkList archiveHomeworkList">${homeworkArchiveCardsHtml(data.homework || [], mode)}</div>`;
  if (isTeacher) bindSelectedTabs();
  $("backFromHomeworkArchive").onclick = () => {
    if (isTeacher) { state.activeView = "selected"; openView("selected"); }
    else openView("homework");
  };
  bindHomeworkArchivePageActions(mode, studentId || data.student?.studentId || "");
}

function bindHomeworkArchivePageActions(mode, studentId) {
  $("content").querySelectorAll(".restoreHomeworkGroup").forEach((button) => button.onclick = async () => {
    const ids = String(button.dataset.ids || "").split(",").filter(Boolean);
    button.disabled = true;
    try {
      await api("restoreHomework", { homeworkIds: ids, studentId: mode === "teacher" ? studentId : "" });
      if (mode === "teacher") delete state.teacherStudentCache[String(studentId)];
      await renderHomeworkArchivePage(mode, studentId);
    } catch (error) { button.disabled = false; status(error.message, true); }
  });
  $("content").querySelectorAll(".deleteHomeworkGroup").forEach((button) => button.onclick = async () => {
    const ids = String(button.dataset.ids || "").split(",").filter(Boolean);
    if (!confirm("この宿題を完全に削除します。元に戻せません。よろしいですか？")) return;
    button.disabled = true;
    try {
      await api("deleteHomework", { homeworkIds: ids, studentId });
      delete state.teacherStudentCache[String(studentId)];
      await renderHomeworkArchivePage(mode, studentId);
    } catch (error) { button.disabled = false; status(error.message, true); }
  });
}

function targetForm(targets, testId) {
  if (!testId) return '<div class="emptyState">次回テスト未登録のため入力できません。</div>';
  return `<form id="targetForm" class="autoSaveForm"><div class="targetGrid">${SUBJECTS.map((subject) => `<label>${subject}<input name="${subject}" type="number" min="0" max="100" inputmode="numeric" value="${esc(targets[subject] ?? "")}"></label>`).join("")}</div><p id="targetAutoSave" class="autoSaveHint" aria-live="polite">入力すると自動保存されます。</p></form>`;
}

function bindTargetForm(testId) {
  const form = $("targetForm");
  if (!form) return;
  const hint = $("targetAutoSave");
  let saveTimer = 0;
  let saving = false;
  let saveAgain = false;

  const saveNow = async () => {
    clearTimeout(saveTimer);
    if (saving) { saveAgain = true; return; }
    const invalid = [...form.querySelectorAll("input")].find((input) => input.value !== "" && !input.checkValidity());
    if (invalid) { if (hint) hint.textContent = "0〜100で入力してください。"; return; }
    saving = true;
    saveAgain = false;
    const values = Object.fromEntries(new FormData(form));
    if (hint) hint.textContent = "自動保存中…";
    try {
      await api("saveTargets", { testId, values }, { silent: true });
      state.dashboard = null;
      if (hint) hint.textContent = "✓ 自動保存済み";
    } catch (error) {
      if (hint) hint.textContent = "保存できませんでした。入力を確認してください。";
      status(error.message, true);
    } finally {
      saving = false;
      if (saveAgain) { saveAgain = false; saveTimer = setTimeout(saveNow, 80); }
    }
  };

  const scheduleSave = (delay = 520) => {
    clearTimeout(saveTimer);
    if (hint) hint.textContent = "自動保存待ち…";
    saveTimer = setTimeout(saveNow, delay);
  };

  form.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => scheduleSave(520));
    input.addEventListener("change", () => scheduleSave(120));
  });
  form.onsubmit = (event) => { event.preventDefault(); saveNow(); };
}

function renderScoresPage(data) {
  const next = data.nextTest;
  $("content").innerHTML = `<header class="pageHead"><div><h1>目標点・定期テスト履歴</h1><p>目標点はテストごとに保存されます。</p></div><a class="secondaryBtn" href="${CONFIG.scoreCorrectionUrl}" target="_blank" rel="noopener">成績を訂正する ↗</a></header><section class="cardGrid"><article class="card span12"><p class="cardTitle">${esc(next?.name || "次回テスト未登録")}の目標点</p>${targetForm(data.targets || {}, next?.testId)}</article><article class="card span12"><p class="cardTitle">成績履歴</p><div class="tableWrap"><table><thead><tr><th>年度</th><th>回</th>${SUBJECTS.map((s) => `<th>${s}</th>`).join("")}<th>5科</th></tr></thead><tbody>${(data.scores || []).map((s) => `<tr><td>${esc(s.year)}</td><td>${esc(s.term)}</td><td>${esc(s.jpn)}</td><td>${esc(s.math)}</td><td>${esc(s.eng)}</td><td>${esc(s.sci)}</td><td>${esc(s.soc)}</td><td>${esc(s.total5)}</td></tr>`).join("") || '<tr><td colspan="8">成績履歴はありません。</td></tr>'}</tbody></table></div></article></section>`;
  bindTargetForm(next?.testId);
}

async function renderTeacher(view) {
  if (view === "today") return renderToday();
  if (view === "selectedArchive" && state.activeStudentId) return renderHomeworkArchivePage("teacher", state.activeStudentId);
  if (view === "selected" && state.activeStudentId) return renderTeacherStudent(state.activeStudentId);
  $("content").innerHTML = `<header class="pageHead"><div><h1>生徒を選ぶ</h1><p>生徒ID・氏名・ふりがな（ひらがな・カタカナ・ローマ字）・教室・学年・学校名から検索できます。入力すると自動で検索します。</p></div></header><article class="card"><div class="teacherSearchGrid"><label><span>検索</span><input id="studentSearch" class="field" placeholder="例：かとう / カトウ / katou / 南城 中2 / ID"></label><label><span>教室</span><select id="campusFilter" class="field"><option value="">すべて</option><option>神領</option><option>大手</option></select></label><label><span>学年</span><select id="gradeFilter" class="field"><option value="">すべて</option><option>小1</option><option>小2</option><option>小3</option><option>小4</option><option>小5</option><option>小6</option><option>中1</option><option>中2</option><option>中3</option></select></label></div><div id="searchResults" class="searchResults"><div class="emptyState">名前などを入力すると、ここに検索結果が表示されます。</div></div></article>${selectedTabsHtml()}`;
  $("studentSearch").oninput = scheduleStudentSearch;
  $("campusFilter").onchange = scheduleStudentSearch;
  $("gradeFilter").onchange = scheduleStudentSearch;
  $("studentSearch").onkeydown = (event) => { if (event.key === "Enter") { event.preventDefault(); clearTimeout(teacherSearchTimer); runStudentSearch(); } };
  bindSelectedTabs();
}

function scheduleStudentSearch() {
  clearTimeout(teacherSearchTimer);
  teacherSearchTimer = setTimeout(() => { if ($("studentSearch")) runStudentSearch(); }, 250);
}

async function runStudentSearch() {
  const results = $("searchResults");
  if (!$("studentSearch").value.trim() && !$("campusFilter").value && !$("gradeFilter").value) {
    results.innerHTML = '<div class="emptyState">名前などを入力すると、ここに検索結果が表示されます。</div>';
    return;
  }
  results.innerHTML = '<div class="loadingCard"><span class="spinner"></span></div>';
  try {
    const data = await api("searchStudents", { query: $("studentSearch").value, campus: $("campusFilter").value, grade: $("gradeFilter").value }, { silent: true });
    results.innerHTML = (data.students || []).map((student) => `<button class="searchItem" data-id="${esc(student.studentId)}"><strong>${esc(student.name)}</strong> <span class="badge">${esc(student.studentId)}</span><br><small>${esc(student.campus)} / ${esc(student.grade)} / ${esc(student.school || "学校未登録")}</small></button>`).join("") || '<div class="emptyState">該当する在籍生徒はいません。</div>';
    results.querySelectorAll("button").forEach((button) => button.onclick = () => selectStudent(data.students.find((s) => String(s.studentId) === button.dataset.id)));
  } catch (error) { results.innerHTML = `<div class="emptyState bad">${esc(error.message)}</div>`; }
}

function selectStudent(student) {
  if (!state.selectedStudents.some((row) => String(row.studentId) === String(student.studentId))) {
    if (state.selectedStudents.length >= 2) state.selectedStudents.shift();
    state.selectedStudents.push(student);
  }
  state.activeStudentId = String(student.studentId);
  state.activeView = "selected";
  persistTeacherLessonSelection();
  openView("selected");
}

function selectedTabsHtml() {
  if (!state.selectedStudents.length) return "";
  return `<div class="studentTabsBar"><div class="studentTabs">${state.selectedStudents.map((student) => `<div class="studentTabWrap ${String(student.studentId) === state.activeStudentId ? "active" : ""}"><button class="studentTab" data-id="${esc(student.studentId)}">${esc(student.name)}</button></div>`).join("")}</div><button id="studentChangeButton" class="studentChangeButton selectedStudentChangeButton" type="button">生徒変更</button></div>`;
}

function bindSelectedTabs() {
  $("content").querySelectorAll(".studentTab").forEach((button) => button.onclick = () => activateTeacherStudent(button.dataset.id));
  const changeButton = $("studentChangeButton");
  if (changeButton) changeButton.onclick = changeTeacherStudent;
}

function activateTeacherStudent(studentId) {
  state.activeStudentId = String(studentId);
  state.activeView = "selected";
  persistTeacherLessonSelection();
  renderShell();
  return renderTeacherStudent(state.activeStudentId).then(() => {
    const button = $("inputLesson");
    if (button) button.click();
  });
}

async function renderTeacherStudent(studentId, { force = false } = {}) {
  const requestedId = String(studentId);
  let data = !force ? state.teacherStudentCache[requestedId] : null;
  if (!data) {
    loading();
    data = await api("getStudentDashboard", { studentId: requestedId });
    state.teacherStudentCache[requestedId] = data;
  }
  if (state.activeStudentId !== requestedId) return;
  state.dashboard = data;
  window.__FORESTA_ACTIVE_DASHBOARD__ = data;
  if (isElementaryGradeValue(data.student?.grade)) return renderElementaryTeacherStudent(data, requestedId);
  const next = data.nextTest;
  const summary = homeworkCompletionSummary(data.homework || []);
  const orderedSubjects = [...new Set([...(data.student.subjects || []), ...SUBJECTS])];
  const savedLessonSubject = savedTeacherSubject(studentId, orderedSubjects);
  $("content").innerHTML = `${selectedTabsHtml()}<header class="pageHead"><div><h1>${esc(data.student.name)}</h1><p>${esc(data.student.studentId)} / ${esc(data.student.campus)} / ${esc(data.student.grade)} / ${esc(data.student.school || "学校未登録")}</p></div><a class="ghostBtn" href="${CONFIG.scoreCorrectionUrl}" target="_blank" rel="noopener">成績を訂正する ↗</a></header><section class="cardGrid">${metricCard("次回テスト", next?.name || "次回テスト未登録", next ? `${fmtDate(next.startDate)}〜${fmtDate(next.endDate)} / あと${next.daysUntil}日` : "", next ? "" : "alert")}<article class="card span8"><p class="cardTitle">本日の授業</p><div class="actionRow lessonControls"><select id="lessonSubject" class="field" aria-label="科目"><option value="">科目を選択してください</option>${orderedSubjects.map((s) => `<option ${s === savedLessonSubject ? "selected" : ""}>${esc(s)}</option>`).join("")}</select><label class="teacherPicker"><span>担当講師</span><select id="lessonTeacher" class="field" aria-label="担当講師">${(data.teacherCandidates || []).map((t) => `<option value="${esc(t.loginId)}" ${String(t.loginId) === String(state.session.loginId) ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label><button id="inputLesson" class="primaryBtn">進行表を開く</button></div><p class="muted">受講科目を先頭に表示します。進行表がない科目は「進行表未登録」です。</p></article><article class="card span12 teacherNoticeCard"><p class="cardTitle">指導上の注意事項</p><p class="noticeLine" id="noticeLine">${esc(data.note?.text || "注意事項は登録されていません。")}</p></article><article class="card span12"><p class="cardTitle">進度・必要ペース</p><div class="tableWrap"><table><thead><tr><th>科目</th><th>学校進度</th><th>フォレスタ進度</th><th>比較</th><th>残り</th><th>授業回数</th><th>必要ペース</th></tr></thead><tbody>${(data.progress || []).map((row) => `<tr><td>${esc(row.subject)}</td><td>${esc(row.schoolUnitName || "未設定")}</td><td>${esc(row.forestaUnitName || "未設定")}</td><td><span class="badge ${row.comparison === "学校より先" ? "good" : "warn"}">${esc(row.comparison)}</span></td><td>${row.remaining ?? "未設定"}</td><td>${row.remainingLessons ?? "未設定"}</td><td>${row.urgent ? "緊急" : row.requiredPerLesson == null ? "未設定" : `${row.requiredPerLesson}単元/回`}</td></tr>`).join("")}</tbody></table></div></article><article class="card span6 teacherHomeworkPanel"><div class="homeworkPanelHead"><p class="cardTitle">前回宿題</p><button id="openTeacherHomeworkArchive" class="ghostBtn homeworkArchiveOpen" type="button">アーカイブ</button></div><p class="muted">完了 ${summary.completed}/${summary.total}</p><div class="homeworkSourceLegend"><span class="self">自主学習で出た宿題</span><span class="teacher">講師から出た宿題</span></div><p class="teacherHomeworkSubjectPrompt ${savedLessonSubject ? "hidden" : ""}">科目を選択すると、その科目の宿題だけを表示します。</p><div class="homeworkList">${homeworkHtml(data.homework || [], "teacher")}</div></article><article class="card span6"><p class="cardTitle">5科目の目標点</p>${Object.entries(data.targets || {}).filter(([s]) => TRACKED_SUBJECTS.includes(s)).map(([s, v]) => `<p><strong>${s}</strong> ${esc(v)}点</p>`).join("") || "未設定"}<p class="cardTitle" style="margin-top:20px">定期テスト履歴</p><div class="tableWrap"><table><thead><tr><th>年度</th><th>回</th><th>国語</th><th>数学</th><th>英語</th><th>理科</th><th>社会</th><th>5科</th></tr></thead><tbody>${(data.scores || []).map((s) => `<tr><td>${esc(s.year)}</td><td>${esc(s.term)}</td><td>${esc(s.jpn)}</td><td>${esc(s.math)}</td><td>${esc(s.eng)}</td><td>${esc(s.sci)}</td><td>${esc(s.soc)}</td><td>${esc(s.total5)}</td></tr>`).join("") || '<tr><td colspan="8">履歴なし</td></tr>'}</tbody></table></div><p class="cardTitle" style="margin-top:20px">講師コメント</p><textarea id="teacherComment" class="field" rows="3" placeholder="本日の指導コメント"></textarea><button id="saveComment" class="secondaryBtn" style="margin-top:8px">コメントを保存</button></article></section>`;
  const headerScoreCorrection = $("content").querySelector(`.pageHead a[href="${CONFIG.scoreCorrectionUrl}"]`);
  if (headerScoreCorrection) headerScoreCorrection.remove();
  const testHistoryTitle = [...$("content").querySelectorAll(".cardTitle")].find((item) => item.textContent.trim() === "定期テスト履歴");
  if (testHistoryTitle) testHistoryTitle.insertAdjacentHTML("beforeend", ` <a class="scoreCorrectionMini" href="${CONFIG.scoreCorrectionUrl}" target="_blank" rel="noopener">成績を訂正する ↗</a>`);
  $("inputLesson").insertAdjacentHTML("afterend", '<button id="correctLesson" class="ghostBtn compactCorrectionButton" type="button">宿題・進行表を訂正</button>');
  bindSelectedTabs();
  const prefetchCurrentProgression = () => { const subject = $("lessonSubject").value; if (subject) prefetchProgression({ subject, mode: "lesson", studentId }); };
  $("lessonSubject").onchange = () => { rememberTeacherSubject($("lessonSubject").value, studentId); prefetchCurrentProgression(); applyTeacherHomeworkSubjectFilter(); };
  if ($("lessonSubject").value) { rememberTeacherSubject($("lessonSubject").value, studentId); prefetchCurrentProgression(); }
  applyTeacherHomeworkSubjectFilter();
  $("inputLesson").onclick = () => { const subject = $("lessonSubject").value; if (!subject) return status("科目を選択してください。", true); rememberTeacherSubject(subject, studentId); openProgress({ subject, mode: "lesson", studentId, teacherId: $("lessonTeacher").value }); };
  $("correctLesson").onclick = () => openLessonCorrection(studentId);
  $("noticeLine").onclick = () => showModal(`<h2>指導上の注意事項</h2><p>${esc(data.note?.text || "登録されていません。")}</p><small>${data.note?.updatedAt ? `更新 ${fmtDateTime(data.note.updatedAt)}` : ""}</small>`);
  $("saveComment").onclick = async () => { const text = $("teacherComment").value.trim(); if (!text) return; try { await api("saveComment", { studentId, subject: $("lessonSubject").value, text }); $("teacherComment").value = ""; status("コメントを保存しました。"); } catch (error) { status(error.message, true); } };
  bindTeacherHomeworkChecks();
  bindHomeworkArchiveActions("teacher");
  $("openTeacherHomeworkArchive")?.addEventListener("click", () => { state.activeView = "selectedArchive"; openView("selectedArchive"); });
}


function elemOptions(r){return '<option value="">学校進度を選ぶ</option>'+(r.unitOptions||[]).map(u=>`<option value="${esc(u.unitId)}" ${u.unitId===r.schoolUnitId?"selected":""}>${esc([u.unitNumber,u.unitName].filter(Boolean).join(" "))}</option>`).join('')}
function elementaryTopTestEntryHtml(rows){return `<article id="elementaryTopTestEntry" class="card elementaryTopTestEntry"><div><p class="cardTitle">学校の単元テスト入力</p><p class="muted">最近の算数・国語のテストを聞き取り、表面・裏面をまとめて入力します。</p></div><form id="elementaryTopTestForm" class="elementaryTopTestForm"><label>科目<select id="elementaryTopTestSubject" class="field">${rows.map(r=>`<option>${esc(r.subject)}</option>`).join('')}</select></label><label id="elementaryTopTestUnitWrap">大きな単元（章）<select id="elementaryTopTestUnit" class="field"></select></label><label id="elementaryTopTestFreeWrap" class="hidden">単元名<input id="elementaryTopTestFree" class="field" maxlength="80"></label><label class="elementaryFrontScore">表面の点数<input id="elementaryTopTestScore" class="field" type="number" min="0" max="999" value="50" required></label><label class="elementaryFrontMax">表面の満点<input id="elementaryTopTestMax" class="field" type="number" min="1" max="999" value="100"></label><label class="elementaryBackScore">裏面の点数<input id="elementaryTopTestBackScore" class="field" type="number" min="0" max="999" value="30" required></label><label class="elementaryBackMax">裏面の満点<input id="elementaryTopTestBackMax" class="field" type="number" min="1" max="999" value="50"></label><label class="elementaryTopTestDate">テスト日<input id="elementaryTopTestDate" class="field" type="date" value="${dateInputValue(new Date())}"></label><button class="primaryBtn" type="submit">保存</button></form><output id="elementaryTopTestStatus" class="lessonSaveStatus" aria-live="polite"></output></article>`}
function bindElementaryTopTestEntry(data,studentId,rows){const form=$("elementaryTopTestForm");if(!form)return;const subject=$("elementaryTopTestSubject"),unit=$("elementaryTopTestUnit"),unitWrap=$("elementaryTopTestUnitWrap"),freeWrap=$("elementaryTopTestFreeWrap");const refresh=()=>{const row=rows.find(r=>r.subject===subject.value)||{},units=row.unitOptions||[];unit.innerHTML='<option value="">単元を選ぶ</option>'+units.map(u=>`<option value="${esc(u.unitId)}" ${u.unitId===row.schoolUnitId?"selected":""}>${esc([u.unitNumber,u.unitName].filter(Boolean).join(" "))}</option>`).join('');unitWrap.classList.toggle("hidden",!units.length);freeWrap.classList.toggle("hidden",!!units.length)};subject.onchange=refresh;refresh();form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('button[type="submit"]'),hasUnits=!unitWrap.classList.contains("hidden");btn.disabled=true;$("elementaryTopTestStatus").textContent="保存しています…";try{await api("saveElementaryUnitTest",{studentId,subject:subject.value,unitId:hasUnits?unit.value:"",unitName:hasUnits?"":$("elementaryTopTestFree").value.trim(),testDate:$("elementaryTopTestDate").value,score:$("elementaryTopTestScore").value,maxScore:$("elementaryTopTestMax").value||100,memo:""},{silent:true});delete state.teacherStudentCache[String(studentId)];state.dashboard=null;status("学校の単元テストを保存しました。");await renderTeacherStudent(studentId,{force:true})}catch(err){btn.disabled=false;$("elementaryTopTestStatus").textContent=err.message}}}
function renderElementaryTeacherStudent(data,studentId){
  const rows=elementaryCoreRows(data), summary=homeworkCompletionSummary(data.homework||[]), teachers=(data.teacherCandidates||[]).map(t=>`<option value="${esc(t.loginId)}" ${String(t.loginId)===String(state.session.loginId)?"selected":""}>${esc(t.name)}</option>`).join('');
  const lessonSubjects=rows.map(r=>r.subject);
  const savedLessonSubject=savedTeacherSubject(studentId,lessonSubjects);
  $("content").innerHTML=`${selectedTabsHtml()}<header class="pageHead"><div><span class="elementaryKicker">小学生</span><h1>${esc(data.student.name)}</h1><p>${esc(data.student.studentId)} / ${esc(data.student.campus)} / ${esc(data.student.grade)} / ${esc(data.student.school||"学校未登録")}</p></div></header><article class="card elementaryTeacherGuide"><strong>授業前に確認</strong><span>①学校はどこまで進んだか　②最近の学校単元テストは何点だったか　③次回のテストはいつありそうか？</span></article>${elementaryTopTestEntryHtml(rows)}<div class="elementaryTeacherToolbar"><label>科目<select id="elementaryLessonSubject" class="field"><option value="">科目を選択してください</option>${lessonSubjects.map(s=>`<option ${s===savedLessonSubject?"selected":""}>${esc(s)}</option>`).join('')}</select></label><label>担当講師<select id="elementaryLessonTeacher" class="field">${teachers}</select></label><button id="correctElementaryLesson" class="ghostBtn">宿題・進行表を訂正</button></div><section class="elementaryProgressGrid">${rows.map(r=>`<article class="card elementarySubjectCard ${subjectProgressClass(r.subject)}" data-lesson-subject="${esc(r.subject)}"><div class="elementaryCardHead"><span class="subjectPill">${esc(r.subject)}</span><strong class="elementaryDifference ${elementaryDiffClass(r.differenceUnits)}">${esc(r.differenceLabel||"未設定")}</strong></div><label class="elementarySchoolSelect">学校の現在地<select class="field elementarySchoolPosition" data-subject="${esc(r.subject)}">${elemOptions(r)}</select><small>選ぶと自動保存</small></label><p><small>塾の現在地</small><br><strong>${esc(r.forestaUnitName||"未入力")}</strong></p><div class="actionRow"><button class="secondaryBtn elementaryOpenProgress" data-subject="${esc(r.subject)}">進行表を開く</button><button class="ghostBtn elementaryTestEntry" data-subject="${esc(r.subject)}">単元テスト入力</button></div></article>`).join('')}</section><section class="cardGrid"><article class="card span12"><p class="cardTitle">最近の学校単元テスト</p>${elementaryRecentTestsHtml(data.elementary?.unitTests||[])}</article><article class="card span12"><div class="homeworkPanelHead"><p class="cardTitle">前回宿題</p><button id="openTeacherHomeworkArchive" class="ghostBtn">アーカイブ</button></div><p class="muted">完了 ${summary.completed}/${summary.total}</p><p class="teacherHomeworkSubjectPrompt ${savedLessonSubject?"hidden":""}">科目を選択すると、その科目の宿題だけを表示します。</p><div class="homeworkList">${homeworkHtml(data.homework||[],"teacher")}</div></article></section>`;
  bindSelectedTabs();
  bindElementaryTopTestEntry(data,studentId,rows);
  const lessonSubject=$("elementaryLessonSubject");
  const applyLessonSubject=()=>{
    const subject=lessonSubject?.value||"";
    rememberTeacherSubject(subject,studentId);
    $("content").querySelectorAll('.elementarySubjectCard').forEach(card=>card.classList.toggle('lessonSubjectSelected',!!subject&&card.dataset.lessonSubject===subject));
    applyTeacherHomeworkSubjectFilter();
  };
  if(lessonSubject){ lessonSubject.onchange=applyLessonSubject; if(lessonSubject.value) rememberTeacherSubject(lessonSubject.value,studentId); }
  applyLessonSubject();
  $("content").querySelectorAll(".elementaryOpenProgress").forEach(b=>b.onclick=()=>{const subject=b.dataset.subject;if(lessonSubject)lessonSubject.value=subject;rememberTeacherSubject(subject,studentId);applyLessonSubject();openProgress({subject,mode:"lesson",studentId,teacherId:$("elementaryLessonTeacher")?.value||state.session.loginId})});
  $("content").querySelectorAll(".elementarySchoolPosition").forEach(s=>s.onchange=async()=>{if(!s.value)return;s.disabled=true;try{await api("saveSchoolPosition",{studentId,subject:s.dataset.subject,unitId:s.value,recordedDate:dateInputValue(new Date())},{silent:true});delete state.teacherStudentCache[String(studentId)];state.dashboard=null;status("学校進度を保存しました。");await renderTeacherStudent(studentId,{force:true})}catch(e){status(e.message,true);s.disabled=false}});
  $("content").querySelectorAll(".elementaryTestEntry").forEach(b=>b.onclick=()=>openElementaryUnitTestForm(data,studentId,b.dataset.subject));
  $("correctElementaryLesson")?.addEventListener("click",()=>openLessonCorrection(studentId));
  bindTeacherHomeworkChecks();bindHomeworkArchiveActions("teacher");$("openTeacherHomeworkArchive")?.addEventListener("click",()=>{state.activeView="selectedArchive";openView("selectedArchive")});
}
function openElementaryUnitTestForm(data,studentId,preset,presetUnitId=""){const rows=elementaryCoreRows(data), subjects=rows.map(r=>r.subject);showModal(`<h2>学校の単元テスト入力</h2><form id="elementaryTestForm" class="elementaryTestForm"><label>科目<select id="elementaryTestSubject" class="field">${subjects.map(s=>`<option ${s===preset?"selected":""}>${esc(s)}</option>`).join('')}</select></label><label id="elementaryTestUnitWrap">単元<select id="elementaryTestUnit" class="field"></select></label><label id="elementaryTestUnitFreeWrap" class="hidden">単元名<input id="elementaryTestUnitFree" class="field" maxlength="80"></label><label>テスト日<input id="elementaryTestDate" class="field" type="date" value="${dateInputValue(new Date())}"></label><div class="elementaryScoreInputs"><label>点数<input id="elementaryTestScore" class="field" type="number" min="0" max="999" required></label><label>満点<input id="elementaryTestMax" class="field" type="number" min="1" max="999" value="100"></label></div><label>メモ<input id="elementaryTestMemo" class="field" maxlength="120"></label><output id="elementaryTestStatus"></output><button class="primaryBtn" type="submit">点数を保存</button></form>`);const refresh=()=>{const r=rows.find(x=>x.subject===$("elementaryTestSubject").value)||{}, units=r.unitOptions||[];$("elementaryTestUnit").innerHTML='<option value="">単元を選ぶ</option>'+units.map(u=>`<option value="${esc(u.unitId)}" ${(presetUnitId&&r.subject===preset&&u.unitId===presetUnitId)||(!presetUnitId&&u.unitId===r.schoolUnitId)?"selected":""}>${esc([u.unitNumber,u.unitName].filter(Boolean).join(" "))}</option>`).join('');$("elementaryTestUnitWrap").classList.toggle("hidden",!units.length);$("elementaryTestUnitFreeWrap").classList.toggle("hidden",!!units.length)};$("elementaryTestSubject").onchange=()=>{presetUnitId="";refresh()};refresh();$("elementaryTestForm").onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;try{const units=!$("elementaryTestUnitWrap").classList.contains("hidden");await api("saveElementaryUnitTest",{studentId,subject:$("elementaryTestSubject").value,unitId:units?$("elementaryTestUnit").value:"",unitName:units?"":$("elementaryTestUnitFree").value.trim(),testDate:$("elementaryTestDate").value,score:$("elementaryTestScore").value,maxScore:$("elementaryTestMax").value||100,memo:$("elementaryTestMemo").value.trim()},{silent:true});delete state.teacherStudentCache[String(studentId)];state.dashboard=null;$("modal").dataset.refreshTeacher="true";closeModal();status("学校の単元テストを保存しました。")}catch(err){btn.disabled=false;$("elementaryTestStatus").textContent=err.message}}}

async function renderToday() {
  const data = await api("getTeacherToday");
  $("content").innerHTML = `<header class="pageHead"><div><h1>本日の授業</h1><p>日本時間の時間割と在籍判定を反映しています。</p></div></header><div class="card"><div class="searchResults">${(data.students || []).map((s) => `<button class="searchItem" data-id="${esc(s.studentId)}"><strong>${esc(s.name)}</strong> ${esc(s.subjects.join("・"))}<br><small>${esc(s.campus)} / ${esc(s.grade)} / ${esc(s.school)}</small></button>`).join("") || '<div class="emptyState">本日の予定生徒はいません。</div>'}</div></div>`;
  $("content").querySelectorAll(".searchItem").forEach((button) => button.onclick = () => selectStudent(data.students.find((s) => String(s.studentId) === button.dataset.id)));
}

async function renderAdmin(view) {
  if (view === "ranges") return renderRangeSettings();
  const data = await api(view === "training" ? "getTrainingRoom" : view === "students" ? "getAdminStudents" : "getAdminDashboard");
  if (view === "training") return renderTraining(data);
  let elementarySummaries = new Map();
  try { elementarySummaries = await loadElementaryAdminSummary(); }
  catch (error) { status(error.name === "AbortError" ? "小学生進捗の読込がタイムアウトしました。" : error.message, true); }
  const rows = (data.students || []).map((row) => mergeElementaryAdminSummary(row, elementarySummaries));
  const filterOptions = data.filterOptions || {};
  const campuses = filterOptions.campuses?.length ? filterOptions.campuses : ["神領", "大手町"];
  const grades = filterOptions.grades?.length ? filterOptions.grades : ["中1", "中2", "中3"];
  const schools = filterOptions.schools || [];
  const directory = data.directory || rows;
  $("content").innerHTML = `${view === "admin" ? adminRangeCta() : ""}<header class="pageHead"><div><h1>${view === "students" ? "全在籍生徒" : "本日の速報"}</h1><p>B列が1または0の生徒だけを表示しています。</p></div><div class="actionRow"><button id="refreshSubjects" class="ghostBtn">受講科目を更新</button></div></header><article class="card" style="margin-bottom:14px"><div class="adminStudentSearch"><label><span>生徒を検索</span><input id="adminStudentSearch" class="field" placeholder="氏名・ふりがな・ローマ字・生徒ID"></label><p class="muted">全在籍生徒から検索し、選ぶと管理者詳細を開きます。</p></div><div id="adminStudentSearchResults" class="adminStudentSearchResults hidden"></div><div class="filterRow"><select class="field adminFilter" data-key="campus"><option value="">全教室</option>${campuses.map((v) => `<option>${esc(v)}</option>`).join("")}</select><select class="field adminFilter" data-key="grade"><option value="">全学年</option>${grades.map((v) => `<option>${esc(v)}</option>`).join("")}</select><select class="field adminFilter" data-key="school"><option value="">全学校</option>${schools.map((v) => `<option>${esc(v)}</option>`).join("")}</select><select class="field adminFilter" data-key="subject"><option value="">全教科</option>${SUBJECTS.map((v) => `<option>${v}</option>`).join("")}</select><select class="field adminFilter" data-key="ct"><option value="">全CT</option><option>◎</option><option>〇</option><option>×</option></select><select class="field adminFilter" data-key="homework"><option value="">全宿題</option><option value="完了">完了</option><option value="未完了">未完了</option></select><select class="field adminFilter" data-key="training"><option value="">全特訓状況</option><option>未対応</option><option>実施日決定</option><option>完了</option></select></div></article><div class="card"><div class="tableWrap"><table><thead><tr><th>生徒</th><th>ID</th><th>教室</th><th>学年</th><th>学校</th><th>予定科目</th><th>担当講師</th><th>入力科目</th><th>学習単元</th><th>残り</th><th>残り回数</th><th>必要ペース</th><th>比較</th><th>CT</th><th>特訓</th><th>宿題</th><th>アラート</th><th>更新</th></tr></thead><tbody>${rows.map((s) => { const elementary = isElementaryGradeValue(s.grade); return `<tr class="adminStudentRow" data-student-id="${esc(s.studentId)}" data-campus="${esc(s.filterCampus || s.campus)}" data-grade="${esc(s.grade)}" data-school="${esc(s.school)}" data-subject="${esc([...(s.plannedSubjects || []), ...(s.recordedSubjects || [])].join("・"))}" data-ct="${esc(s.ctResult || "")}" data-homework="${elementary ? "" : s.homeworkTotal > 0 && s.homeworkConfirmed === s.homeworkTotal ? "完了" : "未完了"}" data-training="${esc(s.trainingStatus || "")}"><td><button class="textLink openAdminStudent" data-id="${esc(s.studentId)}">${esc(s.name)}</button></td><td>${esc(s.studentId)}</td><td>${esc(s.campus)}</td><td>${esc(s.grade)}</td><td>${esc(s.school || "学校未登録")}</td><td>${esc((s.plannedSubjects || []).join("・"))}</td><td>${esc((s.actualTeachers || []).join("・") || "未入力")}</td><td>${esc((s.recordedSubjects || []).join("・"))}</td><td>${esc(s.learnedToday ?? 0)}</td><td>${elementary ? "—" : esc(s.remaining ?? "未設定")}</td><td>${elementary ? "—" : esc(s.remainingLessons ?? "未設定")}</td><td>${elementary ? "—" : s.requiredPerLesson == null ? "未設定" : `${esc(s.requiredPerLesson)}単元/回`}</td><td>${esc(s.comparison || "未設定")}</td><td>${esc(s.ctResult || "—")}</td><td>${esc(s.trainingStatus || "—")}</td><td>${elementary ? "—" : `${esc(s.homeworkConfirmed ?? 0)}/${esc(s.homeworkTotal ?? 0)}`}</td><td>${(s.alerts || []).map((a) => `<span class="badge bad">${esc(a)}</span>`).join(" ")}</td><td>${fmtDateTime(s.updatedAt)}</td></tr>`; }).join("")}</tbody></table></div></div>`;
  $("openRangeSettingsPrimary")?.addEventListener("click", () => openView("ranges"));
  $("refreshSubjects").onclick = async () => { try { const r = await api("refreshSubjectCache"); status(`受講科目を${r.count}件更新しました。`); } catch (error) { status(error.message, true); } };
  $("content").querySelectorAll(".adminFilter").forEach((select) => select.onchange = applyAdminFilters);
  $("content").querySelectorAll(".openAdminStudent").forEach((button) => button.onclick = () => renderAdminStudent(button.dataset.id));
  $("adminStudentSearch").oninput = () => renderAdminStudentSearchResults(directory);
}

function renderAdminStudentSearchResults(directory) {
  const query = $("adminStudentSearch").value;
  const results = $("adminStudentSearchResults");
  if (!query.trim()) { results.innerHTML = ""; results.classList.add("hidden"); return; }
  const matches = directory.filter((student) => matchesStudentDirectoryQuery(student, query)).slice(0, 20);
  results.innerHTML = matches.map((student) => `<button class="adminStudentSearchItem" type="button" data-id="${esc(student.studentId)}"><strong>${esc(student.name)}</strong><span>${esc(student.studentId)} / ${esc(student.campus)} / ${esc(student.grade)} / ${esc(student.school || "学校未登録")}</span></button>`).join("") || '<div class="emptyState">該当する在籍生徒はいません。</div>';
  results.classList.remove("hidden");
  results.querySelectorAll("button").forEach((button) => button.onclick = () => renderAdminStudent(button.dataset.id));
}

function applyAdminFilters() {
  const filters = [...$("content").querySelectorAll(".adminFilter")].filter((x) => x.value);
  $("content").querySelectorAll(".adminStudentRow").forEach((row) => { row.hidden = !filters.every((filter) => String(row.dataset[filter.dataset.key] || "").includes(filter.value)); });
}

async function renderAdminStudent(studentId) {
  loading();
  try {
    const data = await api("getAdminStudentDetail", { studentId });
    const s = data.student, summary = homeworkSummary(data.homework || []);
    $("content").innerHTML = `<header class="pageHead"><div><button id="backAdmin" class="ghostBtn">← 一覧へ</button><h1>${esc(s.name)}・管理者詳細</h1><p>${esc(s.studentId)} / ${esc(s.campus)} / ${esc(s.grade)} / ${esc(s.school || "学校未登録")}</p></div><div class="actionRow">${TRACKED_SUBJECTS.map((subject) => `<button class="secondaryBtn adminProgress" data-subject="${subject}">${subject}の進行表</button>`).join("")}<a class="ghostBtn" href="${CONFIG.scoreCorrectionUrl}" target="_blank" rel="noopener">成績を訂正する ↗</a></div></header><section class="cardGrid">${metricCard("次回テスト", data.nextTest?.name || "次回テスト未登録", data.nextTest ? `${fmtDate(data.nextTest.startDate)}〜${fmtDate(data.nextTest.endDate)}` : "", data.nextTest ? "" : "alert")}${metricCard("宿題", `${summary.teacherChecked}/${summary.total}`, `生徒自己申告 ${summary.studentChecked}/${summary.total}`)}<article class="card span12"><p class="cardTitle">5教科目標点</p><div class="targetGrid">${SUBJECTS.map((subject) => `<div><strong>${subject}</strong><br>${esc(data.targets?.[subject] ?? "未設定")}点</div>`).join("")}</div></article><article class="card span12"><p class="cardTitle">進度・必要ペース</p><div class="tableWrap"><table><thead><tr><th>科目</th><th>学校進度</th><th>フォレスタ進度</th><th>比較</th><th>残り</th><th>残り回数</th><th>必要ペース</th></tr></thead><tbody>${(data.progress || []).map((p) => `<tr><td>${esc(p.subject)}</td><td>${esc(p.schoolUnitName || "未設定")}</td><td>${esc(p.forestaUnitName || "未設定")}</td><td>${esc(p.comparison)}</td><td>${esc(p.remaining ?? "未設定")}</td><td>${esc(p.remainingLessons ?? "未設定")}</td><td>${p.requiredPerLesson == null ? "未設定" : `${esc(p.requiredPerLesson)}単元/回`}</td></tr>`).join("")}</tbody></table></div></article><article class="card span6"><p class="cardTitle">指導上の注意事項</p><p>${esc(data.notes?.[0]?.text || "未登録")}</p><textarea id="adminNote" class="field" rows="3" placeholder="新しい注意事項"></textarea><button id="saveAdminNote" class="primaryBtn" style="margin-top:8px">履歴を残して更新</button><div class="historyList">${(data.notes || []).map((n) => `<p><span class="badge">版${esc(n.version)}</span> ${esc(n.text)}<br><small>${fmtDateTime(n.updatedAt)} ${esc(n.updatedBy)}</small></p>`).join("")}</div></article><article class="card span6"><p class="cardTitle">講師コメント</p>${(data.comments || []).map((c) => `<div class="commentItem"><p><strong>${esc(c.subject)}・${esc(c.teacherName)}</strong> ${fmtDateTime(c.date)}<br>${esc(c.text)}</p>${c.read ? '<span class="badge good">確認済み</span>' : `<button class="ghostBtn markRead" data-id="${esc(c.commentId)}">確認済みにする</button>`}</div>`).join("") || '<div class="emptyState">コメントはありません。</div>'}</article><article class="card span12"><p class="cardTitle">定期テスト履歴</p><div class="tableWrap"><table><thead><tr><th>年度</th><th>回</th>${SUBJECTS.map((x) => `<th>${x}</th>`).join("")}<th>5科</th></tr></thead><tbody>${(data.scores || []).map((x) => `<tr><td>${esc(x.year)}</td><td>${esc(x.term)}</td><td>${esc(x.jpn)}</td><td>${esc(x.math)}</td><td>${esc(x.eng)}</td><td>${esc(x.sci)}</td><td>${esc(x.soc)}</td><td>${esc(x.total5)}</td></tr>`).join("") || '<tr><td colspan="8">履歴なし</td></tr>'}</tbody></table></div></article><article class="card span12"><p class="cardTitle">授業・単元・再学習履歴</p><div class="tableWrap"><table><thead><tr><th>日付</th><th>科目</th><th>担当</th><th>実施単元</th></tr></thead><tbody>${(data.lessons || []).map((lesson) => `<tr><td>${fmtDateTime(lesson.date)}</td><td>${esc(lesson.subject)}</td><td>${esc(lesson.teacherName)}</td><td>${lesson.units.map((u) => `${esc(u.unitNumber)} ${esc(u.unitName)}${u.relearned ? ' <span class="badge">再学習</span>' : ""}`).join("<br>")}</td></tr>`).join("") || '<tr><td colspan="4">履歴なし</td></tr>'}</tbody></table></div></article><article class="card span6"><p class="cardTitle">学校進度履歴</p>${(data.schoolHistory || []).map((x) => `<p>${fmtDate(x.date)} ${esc(x.subject)}・${esc(x.unitName)} <small>${esc(x.teacherName)}</small></p>`).join("") || "履歴なし"}</article><article class="card span6"><p class="cardTitle">CT・特訓部屋履歴</p>${(data.cts || []).map((x) => `<p>${fmtDate(x.date)} ${esc(x.subject)}・${esc(x.unitName)} <span class="badge ${x.result === "×" ? "bad" : "good"}">${esc(x.result)}</span> ${esc(x.trainingStatus || "")}</p>`).join("") || "履歴なし"}</article><article class="card span12"><p class="cardTitle">宿題チェック履歴</p><div class="homeworkList">${homeworkHtml(data.homework || [], "readonly")}</div></article></section>`;
    $("backAdmin").onclick = () => openView(state.activeView === "students" ? "students" : "admin");
    $("content").querySelectorAll(".adminProgress").forEach((button) => button.onclick = () => openProgress({ studentId, subject: button.dataset.subject, mode: "view" }));
    $("saveAdminNote").onclick = async () => { const text = $("adminNote").value.trim(); if (!text) return; try { await api("saveNote", { studentId, text }); status("注意事項を履歴付きで更新しました。"); await renderAdminStudent(studentId); } catch (error) { status(error.message, true); } };
    $("content").querySelectorAll(".markRead").forEach((button) => button.onclick = async () => { try { await api("markCommentRead", { commentId: button.dataset.id }); await renderAdminStudent(studentId); } catch (error) { status(error.message, true); } });
  } catch (error) { showError(error, () => renderAdminStudent(studentId)); }
}

async function renderRangeSettings() {
  const setup = await api("getRangeSetup");
  const textbookBySchool = Object.fromEntries((setup.textbooks || []).map((row) => [row.school, row.textbook]));
  const textbookOptions = ["ニューホライズン", "ニュークラウン", "サンシャイン", "ワンワールド", "ヒアウィゴー", "ブルースカイ"];
  $("content").innerHTML = `<header class="pageHead"><div><span class="adminRangeKicker">管理者アプリの中心機能</span><h1>進行表・テスト範囲設定</h1><p>生徒IDを使わず、下の順序で設定してください。</p></div><div class="actionRow"><a class="secondaryBtn" href="https://stepkobetsu-hub.github.io/seiseki-kanri/admin.html#schools" target="_blank" rel="noopener">学校・テスト日程登録 ↗</a><button id="backAdminDashboard" class="ghostBtn" type="button">← 本日の速報へ</button></div></header><article class="card"><div class="formGrid"><label><span>1. 学校</span><select id="rangeSchool" class="field"><option value="">選択</option>${setup.schools.map((s) => `<option>${esc(s)}</option>`).join("")}</select></label><label><span>2. 学年</span><select id="rangeGrade" class="field"><option>中1</option><option>中2</option><option>中3</option></select></label><label><span>3. 科目</span><select id="rangeSubject" class="field">${TRACKED_SUBJECTS.map((subject) => `<option>${esc(subject)}</option>`).join("")}</select></label><label><span>4. 次回テスト</span><select id="rangeTest" class="field"><option value="">学校を選択</option></select></label><label><span>5. 予想範囲／決定範囲</span><select id="rangeType" class="field"><option value="予想">次回テスト範囲（予想）</option><option value="決定">次回テスト範囲（決定版）</option></select></label></div><div class="actionRow" style="margin-top:14px"><button id="openRangeEditor" class="primaryBtn">6. 進行表全体を開く</button><span id="targetCount" class="badge">対象生徒 0名</span></div><p class="muted">進行表上で複数単元をチェックし、選択範囲を保存できます。</p></article><article class="card rareSettingsCard" style="margin-top:14px"><div class="rareSettingsHeader"><div><p class="cardTitle">英語教科書の例外設定</p><p class="muted">通常はニューホライズンです。特殊な私立学校など、例外がある場合だけ開いてください。</p></div><button id="toggleTextbookSettings" class="ghostBtn" type="button" aria-expanded="false">英語教科書の例外設定を開く</button></div><div id="textbookSettings" class="hidden"><div class="formGrid"><label><span>学校</span><select id="textbookSchool" class="field"><option value="">選択</option>${setup.schools.map((s) => `<option>${esc(s)}</option>`).join("")}</select></label><label><span>教科書</span><select id="textbookName" class="field">${textbookOptions.map((name) => `<option>${name}</option>`).join("")}</select></label></div><button id="saveTextbook" class="secondaryBtn" style="margin-top:12px">例外の教科書設定を保存</button></div></article>`;
  $("backAdminDashboard").onclick = () => openView("admin");
  const school = $("rangeSchool"), test = $("rangeTest");
  const update = async () => {
    if (!school.value) return;
    const data = await api("getRangeOptions", { school: school.value, grade: $("rangeGrade").value, subject: $("rangeSubject").value });
    test.innerHTML = (data.tests || []).map((t) => `<option value="${esc(t.testId)}">${esc(t.name)} ${fmtDate(t.startDate)}〜${fmtDate(t.endDate)}</option>`).join("") || '<option value="">次回テスト未登録</option>';
    $("targetCount").textContent = `対象生徒 ${data.targetCount || 0}名`;
  };
  [school, $("rangeGrade"), $("rangeSubject")].forEach((el) => el.onchange = update);
  $("openRangeEditor").onclick = () => { if (!school.value || !test.value) return status("学校と次回テストを選択してください。", true); openProgress({ mode: "range", school: school.value, grade: $("rangeGrade").value, subject: $("rangeSubject").value, testId: test.value, rangeType: $("rangeType").value }); };
  $("textbookSchool").onchange = () => { if (textbookBySchool[$("textbookSchool").value]) $("textbookName").value = textbookBySchool[$("textbookSchool").value]; };
  $("saveTextbook").onclick = async () => { if (!$("textbookSchool").value) return status("学校を選択してください。", true); try { await api("saveSchoolTextbook", { school: $("textbookSchool").value, textbook: $("textbookName").value }); status("英語教科書設定を保存しました。"); } catch (error) { status(error.message, true); } };
  $("toggleTextbookSettings").onclick = () => {
    const panel = $("textbookSettings");
    const opening = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !opening);
    $("toggleTextbookSettings").setAttribute("aria-expanded", opening ? "true" : "false");
    $("toggleTextbookSettings").textContent = opening ? "英語教科書の例外設定を閉じる" : "英語教科書の例外設定を開く";
  };
}

function renderTraining(data) {
  $("content").innerHTML = `<header class="pageHead"><div><h1>特訓部屋管理</h1><p>CTが×になった生徒の対応状況を更新できます。</p></div><a class="secondaryBtn" href="${CONFIG.messageCenterUrl}" target="_blank" rel="noopener">STEP配信システムで保護者へ連絡 ↗</a></header><div class="card"><div class="tableWrap"><table><thead><tr><th>生徒</th><th>教室</th><th>学校</th><th>学年</th><th>教科</th><th>CT単元</th><th>CT実施日</th><th>担当</th><th>状況</th><th>予定日</th><th>実施日</th><th>備考</th><th>保護者連絡</th><th>保存</th></tr></thead><tbody>${(data.items || []).map((x) => `<tr data-training-id="${esc(x.trainingId)}"><td>${esc(x.name)}</td><td>${esc(x.campus)}</td><td>${esc(x.school)}</td><td>${esc(x.grade)}</td><td>${esc(x.subject)}</td><td>${esc(x.unitName)}</td><td>${fmtDate(x.ctDate)}</td><td>${esc(x.teacherName)}</td><td><select class="field trainingStatus"><option ${x.status === "未対応" ? "selected" : ""}>未対応</option><option ${x.status === "実施日決定" ? "selected" : ""}>実施日決定</option><option ${x.status === "完了" ? "selected" : ""}>完了</option></select></td><td><input class="field trainingScheduled" type="date" value="${esc(dateInputValue(x.scheduledDate))}"></td><td><input class="field trainingActual" type="date" value="${esc(dateInputValue(x.actualDate))}"></td><td><textarea class="field trainingNote" rows="2">${esc(x.note)}</textarea></td><td><select class="field trainingGuardian"><option ${x.guardianContactStatus === "未連絡" ? "selected" : ""}>未連絡</option><option ${x.guardianContactStatus === "連絡済み" ? "selected" : ""}>連絡済み</option><option ${x.guardianContactStatus === "不要" ? "selected" : ""}>不要</option></select></td><td><button class="primaryBtn saveTraining">保存</button></td></tr>`).join("") || '<tr><td colspan="14">対象者はいません。</td></tr>'}</tbody></table></div></div>`;
  $("content").querySelectorAll(".saveTraining").forEach((button) => button.onclick = async () => {
    const row = button.closest("tr");
    button.disabled = true;
    try {
      await api("updateTrainingRoom", { trainingId: row.dataset.trainingId, status: row.querySelector(".trainingStatus").value, scheduledDate: row.querySelector(".trainingScheduled").value, actualDate: row.querySelector(".trainingActual").value, note: row.querySelector(".trainingNote").value, guardianContactStatus: row.querySelector(".trainingGuardian").value });
      status("特訓部屋の対応状況を保存しました。");
    } catch (error) { status(error.message, true); }
    finally { button.disabled = false; }
  });
}

function dateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

async function openLessonCorrection(studentId) {
  showModal('<div class="loadingCard"><span class="spinner"></span><p>授業履歴を読み込み中です…</p></div>');
  try {
    const data = await api("getLessonCorrections", { studentId }, { silent: true });
    const lessons = data.lessons || [];
    $("modalBody").innerHTML = `<h2>宿題・進行表を訂正</h2><p>訂正する授業を選んでください。記録した単元と宿題を開き直せます。</p><div class="lessonCorrectionList">${lessons.map((lesson, index) => `<button type="button" class="lessonCorrectionItem" data-index="${index}"><span><strong>${fmtDate(lesson.date)}・${esc(lesson.subject)}</strong><small>${esc(lesson.teacherName || "担当未登録")}</small></span><span>${esc((lesson.units || []).map((unit) => formatProgressUnitNumber(lesson.subject, unit)).join("、") || "単元未登録")}</span><b>訂正する</b></button>`).join("") || '<div class="emptyState">訂正できる授業記録はありません。</div>'}</div>`;
    $("modalBody").querySelectorAll(".lessonCorrectionItem").forEach((button) => button.onclick = () => {
      const lesson = lessons[Number(button.dataset.index)];
      openProgress({ mode: "correction", studentId, subject: lesson.subject, lessonId: lesson.lessonId, unitIds: lesson.unitIds, existingHomeworkByUnit: lesson.homeworkByUnit });
    });
  } catch (error) {
    $("modalBody").innerHTML = `<h2>授業履歴を読み込めませんでした</h2><p>${esc(error.message)}</p>`;
  }
}

async function askOutsideRange_() {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "outsideConfirmDialog";
    dialog.innerHTML = '<div class="outsideConfirmBox"><span>⚠</span><h3>次回テスト範囲外です</h3><p>この単元は管理者が設定した次回テスト範囲の外です。それでも実際に進みましたか？</p><div><button class="primaryBtn" data-answer="yes">それでもすすみました</button><button class="ghostBtn" data-answer="no">いいえ</button></div></div>';
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      try { if (dialog.open) dialog.close(); } catch {}
      dialog.remove();
      resolve(value);
    };
    dialog.querySelector('[data-answer="yes"]').onclick = () => finish(true);
    dialog.querySelector('[data-answer="no"]').onclick = () => finish(false);
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) finish(false); });
    document.body.appendChild(dialog);
    try { dialog.showModal(); }
    catch { dialog.setAttribute("open", ""); }
  });
}

async function bindStudentRoundInputs_(options) {
  const inputs = [...$("modalBody").querySelectorAll(".studentRoundInput")];
  inputs.forEach((input) => input.onchange = async () => {
    const row = input.closest(".studentRoundRow");
    const roundNumber = Number(input.dataset.round);
    const nextChecked = input.checked;
    if (nextChecked && roundNumber > 1) {
      const previous = row.querySelector(`.studentRoundInput[data-round="${roundNumber - 1}"]`);
      if (previous && !previous.checked) { input.checked = false; status(`先に${roundNumber - 1}周目を完了してください。`, true); return; }
    }
    if (!nextChecked && roundNumber < 3) {
      const later = [...row.querySelectorAll(".studentRoundInput")].some((item) => Number(item.dataset.round) > roundNumber && item.checked);
      if (later) { input.checked = true; status("後の周回を先に取り消してください。", true); return; }
    }
    let outsideRangeOverride = false;
    if (nextChecked && input.dataset.outside === "true") {
      input.checked = false;
      outsideRangeOverride = await askOutsideRange_();
      if (!outsideRangeOverride) return;
      input.checked = true;
    }
    const date = row.querySelector(`[data-round-date="${roundNumber}"]`);
    input.disabled = true;
    if (date) date.textContent = nextChecked ? "保存中…" : "取消中…";
    try {
      const result = await api("saveStudentRoundProgress", { subject: options.subject, unitId: row.dataset.unit, roundNumber, checked: nextChecked, outsideRangeOverride, idempotencyKey: crypto.randomUUID() }, { silent: true });
      (result.rounds || []).forEach((round) => {
        const target = row.querySelector(`.studentRoundInput[data-round="${round.roundNumber}"]`);
        const targetDate = row.querySelector(`[data-round-date="${round.roundNumber}"]`);
        if (target) target.checked = !!round.completed;
        if (targetDate) targetDate.textContent = round.completed ? fmtShortDate(round.date) : "未";
      });
      invalidateProgressionCache(options);
      state.dashboard = null;
      $("modal").dataset.refreshStudent = "true";
      status(nextChecked ? `${roundNumber}周目を保存しました。宿題も更新しました。` : `${roundNumber}周目を取り消しました。`);
    } catch (error) {
      input.checked = !nextChecked;
      if (date) date.textContent = input.checked ? (date.dataset.saved || "済") : "未";
      status(error.message, true);
    } finally { input.disabled = false; }
  });
}

async function openProgress(options) {
  const cachedProgression = options.mode === "correction" ? null : readProgressionCache(options);
  showModal(cachedProgression ? '<div class="loadingCard fastLoad"><span class="spinner"></span><p>進行表を表示しています…</p></div>' : '<div class="loadingCard"><span class="spinner"></span><p>進行表を読み込み中です…</p></div>');
  try {
    const data = options.mode === "correction"
      ? await loadProgression(options, { force: true })
      : cachedProgression || await loadProgression(options);
    const editable = options.mode === "lesson" || options.mode === "correction" || options.mode === "range";
    const canOutsideOverride = Boolean(state.dashboard?.capabilities?.outsideRangeOverride);
    const selected = new Set(options.unitIds || data.selectedUnitIds || []);
    const todayValue = dateInputValue(new Date());
    const todayLabel = fmtShortDate(new Date());
    let previousChapter = null;
    const rows = (data.units || []).map((u) => {
      const classes = [u.predictedOutside ? "predictedOutside" : "", u.decidedOutside ? "decidedOutside" : "", u.previous ? "previous" : "", u.schoolPosition ? "schoolPosition" : "", u.omittable ? "omittable" : ""].filter(Boolean).join(" ");
      const effectiveOutside = data.summary?.rangeType === "決定" ? u.decidedOutside : data.summary?.rangeType === "予想" ? u.predictedOutside : false;
      const rangeLocked = options.mode === "lesson" && effectiveOutside;
      const chapter = progressGroupKey(u);
      const groupHeader = editable && chapter && chapter !== previousChapter ? `<div class="unitGroupHeader"><label class="unitGroupToggle"><input type="checkbox" class="chapterToggle" data-chapter="${esc(chapter)}"><span>${esc(formatProgressGroupLabel(options.subject, chapter))}</span><small>このまとまりを選択／解除</small></label><span class="unitGroupCount" data-chapter="${esc(chapter)}">0/0</span></div>` : "";
      previousChapter = chapter;
      const displayNumber = formatProgressUnitNumber(options.subject, u);
      const chapterIsIncluded = options.subject === "英語" && displayNumber !== String(u.unitNumber ?? "").trim();
      const details = [chapterIsIncluded ? "" : u.chapter, u.difficulty ? `難度 ${u.difficulty}` : "", rangeLocked ? "次回テスト範囲外" : ""].filter(Boolean).join(" / ");
      const lessonDates = (u.lessonDates || []).map((date) => fmtShortDate(date)).filter(Boolean);
      const dateHistory = lessonDates.length ? `<span class="lessonDateHistory" title="授業日：${esc(lessonDates.join("、"))}"><small>授業日</small>${lessonDates.map((date) => `<b>${esc(date)}</b>`).join("")}</span>` : "";
      const lessonSelectable = !rangeLocked || canOutsideOverride;
      const todayButton = (options.mode === "lesson" || options.mode === "correction") && lessonSelectable ? `<button type="button" class="lessonDayToggle ${selected.has(u.unitId) ? "selected" : ""}" data-unit="${esc(u.unitId)}" data-outside-locked="${rangeLocked ? "true" : "false"}" aria-pressed="${selected.has(u.unitId) ? "true" : "false"}">${options.mode === "correction" ? (selected.has(u.unitId) ? "✓ 記録済み" : "＋ 追加") : `${selected.has(u.unitId) ? "✓" : "＋"} 今日 ${esc(todayLabel)}`}</button>` : "";
      const schoolButton = options.mode === "lesson" ? `<button type="button" class="schoolPinButton ${u.schoolPosition ? "active" : ""}" data-unit="${esc(u.unitId)}" aria-label="${esc(u.unitName)}を学校の現在地にする">${u.schoolPosition ? `🏫 学校 ${esc(fmtShortDate(u.schoolPositionAt))}` : "🏫"}</button>` : "";
      const elementaryTestButton = options.mode === "lesson" && isElementaryGradeValue(state.dashboard?.student?.grade) ? `<button type="button" class="elementaryUnitTestButton" data-unit="${esc(u.unitId)}" title="この単元の学校テストを入力">📝 テスト</button>` : "";
      if (options.mode === "student") {
        const rounds = [1, 2, 3].map((roundNumber) => (u.rounds || []).find((item) => Number(item.roundNumber) === roundNumber) || { roundNumber, completed: false, date: "" });
        const roundHtml = rounds.map((round) => `<label class="studentRoundCell round${round.roundNumber}"><span>${round.roundNumber}周目</span><input class="studentRoundInput" type="checkbox" data-round="${round.roundNumber}" data-outside="${effectiveOutside ? "true" : "false"}" ${round.completed ? "checked" : ""}><small data-round-date="${round.roundNumber}" data-saved="${round.completed ? esc(fmtShortDate(round.date)) : "未"}">${round.completed ? esc(fmtShortDate(round.date)) : "未"}</small></label>`).join("");
        return `<div class="unitRow studentRoundRow ${classes}" data-unit="${esc(u.unitId)}"><span class="unitNumber">${esc(displayNumber)}</span><span class="unitName">${details ? `<small class="unitPrefix">${esc(details)}</small>` : ""}<strong>${esc(u.unitName)}</strong></span><span class="studentRoundCells">${roundHtml}</span></div>`;
      }
      const unitDisabled = editable && (!rangeLocked || canOutsideOverride) ? "" : "disabled";
      const outsideAttr = rangeLocked ? "true" : "false";
      const checkHtml = options.mode === "range" ? `<span class="rangeCheckCell"><small>${options.rangeType === "決定" ? "決定範囲" : "予想範囲"}</small><input class="unitCheck" type="checkbox" value="${esc(u.unitId)}" data-chapter="${esc(chapter)}" data-outside-locked="${outsideAttr}" ${unitDisabled} ${selected.has(u.unitId) ? "checked" : ""}></span>` : `<input class="unitCheck" type="checkbox" value="${esc(u.unitId)}" data-chapter="${esc(chapter)}" data-outside-locked="${outsideAttr}" ${unitDisabled} ${selected.has(u.unitId) ? "checked" : ""}>`;
      return `${groupHeader}<label class="unitRow ${classes} ${selected.has(u.unitId) ? "todaySelected" : ""} ${options.mode === "range" ? "rangeSelectable" : ""}" data-unit="${esc(u.unitId)}">${checkHtml}<span class="unitNumber">${esc(displayNumber)}</span><span class="unitName">${details ? `<small class="unitPrefix">${esc(details)}</small>` : ""}<strong>${esc(u.unitName)}</strong></span><span class="unitMeta">${dateHistory}${todayButton}${schoolButton}${elementaryTestButton}${!isElementaryGradeValue(state.dashboard?.student?.grade) && ["英語", "数学"].includes(options.subject) && u.ctResult ? `<button type="button" class="ctButton" data-unit="${esc(u.unitId)}">CT ${esc(u.ctResult)}</button>` : !isElementaryGradeValue(state.dashboard?.student?.grade) && ["英語", "数学"].includes(options.subject) && u.previous && options.mode === "lesson" ? `<button type="button" class="ctButton" data-unit="${esc(u.unitId)}">CTを登録</button>` : ""}</span></label>`;
    }).join("");
    const schoolLegend = options.mode === "lesson" ? `<span class="schoolLegendControl"><i style="background:var(--school)"></i><b>学校の現在地</b><small>単元右の🏫を押す</small><input id="schoolPositionDate" type="date" value="${esc(todayValue)}" aria-label="学校進度の確認日"><output id="schoolPositionStatus" aria-live="polite"></output></span>` : '<span><i style="background:var(--school)"></i>学校の現在地</span>';
    const progressActions = options.mode === "lesson"
      ? '<span class="toolbarHint">各単元右側の「＋ 今日」を押して授業日を付けます。</span><button id="saveLesson" class="primaryBtn">授業と宿題を保存</button>'
      : options.mode === "correction"
        ? '<span class="toolbarHint">記録した単元を選び直してください。</span><button id="saveLesson" class="primaryBtn">宿題設定へ</button>'
        : '<span class="toolbarHint">チェック変更は自動保存されます。</span><span id="rangeAutoSave" class="rangeAutoSave">すべて保存済み</span><button id="saveRange" class="ghostBtn compactManualSave" type="button">今すぐ保存</button><button id="saveRangeClose" class="primaryBtn compactManualSave" type="button">保存して閉じる</button>';
    $("modalBody").innerHTML = `<h2>${esc(options.subject)} 進行表</h2><p>${esc(data.title || "進行表全体")}</p><div class="legend"><span><i style="background:var(--outside)"></i>予想範囲外</span><span><i style="background:var(--decided)"></i>決定範囲外</span><span><i style="background:var(--omit)"></i>省略可能</span><span><i style="background:var(--previous)"></i>前回範囲</span>${schoolLegend}</div>${editable ? `<div class="progressToolbar"><button id="selectAll" class="ghostBtn">全単元を選択</button><button id="clearAll" class="ghostBtn">全単元を解除</button><span id="selectedCount" class="badge">0単元</span>${progressActions}</div>` : ""}<div class="progressList">${rows || '<div class="emptyState">進行表未登録</div>'}</div>`;
    if ((options.mode === "lesson" || options.mode === "correction") && $("selectedCount") && state.dashboard?.student?.name) $("selectedCount").insertAdjacentHTML("afterend", `<strong class="progressStudentName">${esc(state.dashboard.student.name)}さん</strong>`);
    if (options.mode === "student") { await bindStudentRoundInputs_(options); return; }
    const checks = [...$("modalBody").querySelectorAll(".unitCheck:not(:disabled)")];
    const groupToggles = [...$("modalBody").querySelectorAll(".chapterToggle")];
    const rangeMode = options.mode === "range";
    const outsideOverrides = new Set(options.outsideRangeOverrideUnitIds || []);
    let rangeSaveTimer = 0;
    let rangeSaving = false;
    let rangeDirty = false;
    const rangeStatus = () => $("rangeAutoSave");
    const saveRangeSelection = async () => {
      if (!rangeMode) return true;
      if (rangeSaving) { rangeDirty = true; return; }
      clearTimeout(rangeSaveTimer);
      rangeSaving = true;
      rangeDirty = false;
      const unitIds = checks.filter((c) => c.checked).map((c) => c.value);
      if (rangeStatus()) rangeStatus().textContent = "自動保存中…";
      try {
        await api("saveRange", { ...options, unitIds }, { silent: true });
        invalidateProgressionCache(options);
        if (rangeStatus()) rangeStatus().textContent = "自動保存済み";
        return true;
      } catch (error) {
        if (rangeStatus()) rangeStatus().textContent = "保存失敗・再試行してください";
        status(error.message, true);
        return false;
      } finally {
        rangeSaving = false;
        if (rangeDirty) {
          rangeDirty = false;
          rangeSaveTimer = setTimeout(saveRangeSelection, 80);
        }
      }
    };
    const scheduleRangeSave = () => {
      if (!rangeMode) return;
      rangeDirty = true;
      clearTimeout(rangeSaveTimer);
      if (rangeStatus()) rangeStatus().textContent = "自動保存待ち…";
      rangeSaveTimer = setTimeout(() => { rangeDirty = false; saveRangeSelection(); }, 450);
    };
    const updateGroupToggles = () => groupToggles.forEach((toggle) => {
      const groupChecks = checks.filter((check) => check.dataset.chapter === toggle.dataset.chapter);
      const selectedCount = groupChecks.filter((check) => check.checked).length;
      toggle.checked = groupChecks.length > 0 && selectedCount === groupChecks.length;
      toggle.indeterminate = selectedCount > 0 && selectedCount < groupChecks.length;
      toggle.closest(".unitGroupHeader")?.classList.toggle("hasSelection", selectedCount > 0);
      const groupCount = [...$("modalBody").querySelectorAll(".unitGroupCount")].find((item) => item.dataset.chapter === toggle.dataset.chapter);
      if (groupCount) groupCount.textContent = `${selectedCount}/${groupChecks.length}`;
    });
    const syncLessonDayButtons = () => $("modalBody").querySelectorAll(".lessonDayToggle").forEach((button) => {
      const check = checks.find((item) => item.value === button.dataset.unit);
      const isSelected = Boolean(check?.checked);
      button.classList.toggle("selected", isSelected);
      button.setAttribute("aria-pressed", isSelected ? "true" : "false");
      button.textContent = options.mode === "correction" ? (isSelected ? "✓ 記録済み" : "＋ 追加") : `${isSelected ? "✓" : "＋"} 今日 ${todayLabel}`;
      button.closest(".unitRow")?.classList.toggle("todaySelected", isSelected);
    });
    const count = () => { const el = $("selectedCount"); if (el) el.textContent = `${checks.filter((c) => c.checked).length}単元`; updateGroupToggles(); syncLessonDayButtons(); };
    checks.forEach((c) => c.onchange = async () => {
      if (c.checked && c.dataset.outsideLocked === "true" && !outsideOverrides.has(c.value)) {
        c.checked = false;
        const allowed = await askOutsideRange_();
        if (allowed) { outsideOverrides.add(c.value); c.checked = true; }
      }
      count(); scheduleRangeSave();
    }); count();
    if ($("selectAll")) $("selectAll").onclick = () => { checks.forEach((c) => c.checked = true); count(); scheduleRangeSave(); };
    if ($("clearAll")) $("clearAll").onclick = () => { checks.forEach((c) => c.checked = false); count(); scheduleRangeSave(); };
    groupToggles.forEach((toggle) => toggle.onchange = () => { checks.filter((check) => check.dataset.chapter === toggle.dataset.chapter).forEach((check) => check.checked = toggle.checked); count(); scheduleRangeSave(); });
    $("modalBody").querySelectorAll(".lessonDayToggle").forEach((button) => button.onclick = async (event) => {
      event.preventDefault();
      const check = checks.find((item) => item.value === button.dataset.unit);
      if (!check) return;
      const nextChecked = !check.checked;
      if (nextChecked && button.dataset.outsideLocked === "true" && !outsideOverrides.has(check.value)) {
        const allowed = await askOutsideRange_();
        if (!allowed) return;
        outsideOverrides.add(check.value);
      }
      check.checked = nextChecked;
      count();
    });
    $("modalBody").querySelectorAll(".elementaryUnitTestButton").forEach((button) => button.onclick = (event) => {
      event.preventDefault();
      openElementaryUnitTestForm(state.dashboard || {}, options.studentId, options.subject, button.dataset.unit);
    });
    $("modalBody").querySelectorAll(".schoolPinButton").forEach((button) => button.onclick = async (event) => {
      event.preventDefault();
      const recordedDate = $("schoolPositionDate")?.value || todayValue;
      button.disabled = true;
      try {
        const result = await api("saveSchoolPosition", { studentId: options.studentId, subject: options.subject, unitId: button.dataset.unit, recordedDate }, { silent: true });
        invalidateProgressionCache(options);
        $("modalBody").querySelectorAll(".schoolPinButton").forEach((item) => { item.classList.remove("active"); item.textContent = "🏫"; });
        $("modalBody").querySelectorAll(".unitRow").forEach((row) => row.classList.remove("schoolPosition"));
        button.classList.add("active");
        button.textContent = `🏫 学校 ${fmtShortDate(result.recordedDate || recordedDate)}`;
        button.closest(".unitRow")?.classList.add("schoolPosition");
        $("schoolPositionStatus").textContent = `学校の現在地を${fmtShortDate(result.recordedDate || recordedDate)}で保存しました。`;
        delete state.teacherStudentCache[String(options.studentId)];
        $("modal").dataset.refreshTeacher = "true";
      } catch (error) { $("schoolPositionStatus").textContent = error.message; }
      finally { button.disabled = false; }
    });
    if ($("saveRange")) $("saveRange").onclick = () => saveRangeSelection();
    if ($("saveRangeClose")) $("saveRangeClose").onclick = async () => {
      const button = $("saveRangeClose");
      button.disabled = true;
      button.textContent = "保存して閉じています…";
      clearTimeout(rangeSaveTimer);
      rangeDirty = false;
      checks.forEach((check) => { check.disabled = true; });
      groupToggles.forEach((toggle) => { toggle.disabled = true; });
      if (rangeStatus()) rangeStatus().textContent = "保存して閉じています…";
      while (rangeSaving) await new Promise((resolve) => setTimeout(resolve, 40));
      const saved = await saveRangeSelection();
      if (saved) {
        closeModal();
        return;
      }
      checks.forEach((check) => { check.disabled = false; });
      groupToggles.forEach((toggle) => { toggle.disabled = false; });
      button.disabled = false;
      button.textContent = "保存して閉じる";
    };
    if ($("saveLesson")) $("saveLesson").onclick = () => {
      const unitIds = checks.filter((c) => c.checked).map((c) => c.value);
      if (!unitIds.length) return status(options.mode === "correction" ? "訂正後の単元を1つ以上選択してください。" : "今回進んだ単元を選択してください。", true);
      openHomeworkSetup({ ...options, unitIds, outsideRangeOverrideUnitIds: Array.from(outsideOverrides), selectedUnits: (data.units || []).filter((unit) => unitIds.includes(unit.unitId)), idempotencyKey: options.idempotencyKey || crypto.randomUUID() });
    };
    $("modalBody").querySelectorAll(".ctButton").forEach((button) => button.onclick = () => openCtForm(options, button.dataset.unit));
  } catch (error) {
    $("modalBody").innerHTML = `<h2>進行表を読み込めませんでした</h2><p>${esc(error.message)}</p><button id="retryModal" class="primaryBtn">再試行</button>`;
    $("retryModal").onclick = () => openProgress(options);
  }
}

function openHomeworkSetup(options) {
  const elementary = isElementaryGradeValue(state.dashboard?.student?.grade);
  const defaults = elementary ? (ELEMENTARY_HOMEWORK[options.subject] || []) : (DEFAULT_HOMEWORK[options.subject] || []);
  const repeatDefaults = elementary ? defaults : (REPEAT_HOMEWORK[options.subject] || defaults);
  const correcting = options.mode === "correction";
  const japaneseOnly = options.subject === "国語" && !elementary;
  const groups = (options.selectedUnits || []).map((unit, index) => {
    const isKeyWords = !japaneseOnly && /key\s*words\s*test/iu.test(`${String(unit.unitName || "")} ${String(unit.unitNumber || "")}`);
    const unitLabel = `${formatProgressUnitNumber(options.subject, unit)} ${unit.unitName || ""}`.trim();
    const nextRound = Math.min(3, Number(unit.completedRounds || 0) + 1);
    const roundDefaults = nextRound >= 2 ? repeatDefaults : defaults;
    const items = isKeyWords ? (nextRound >= 2 ? ["KEYWORDSの暗記"] : ["巻末のKeyWordsTestの暗記"]) : roundDefaults;
    const existingItems = options.existingHomeworkByUnit?.[unit.unitId] || [];
    const otherValue = existingItems.find((item) => String(item).startsWith("その他："))?.replace(/^その他：/u, "") || "";
    const presets = items.length ? `<div class="compactHomeworkGrid">${items.map((item) => { const checked = isKeyWords || !correcting || existingItems.includes(item); return `<label><input class="unitHomeworkPreset" type="checkbox" value="${esc(item)}" ${checked ? "checked" : ""} ${isKeyWords ? "disabled" : ""}><span>${esc(item)}</span></label>`; }).join("")}</div>` : "";
    const badge = japaneseOnly ? "その他欄のみ" : `${items.length}項目`;
    const otherInput = `<input class="field unitOtherHomework" maxlength="120" value="${esc(otherValue)}" placeholder="${japaneseOnly ? "この単元の宿題を入力" : "この単元だけのその他の宿題（必要な場合）"}">`;
    return `<details class="unitHomeworkGroup" data-unit="${esc(unit.unitId)}" ${index === 0 ? "open" : ""}><summary><strong>${esc(unitLabel)}</strong><span class="badge">${badge}</span></summary>${presets}${isKeyWords ? '<p class="fixedHomeworkNote">この単元は巻末のKeyWordsTestの暗記だけを登録します。</p>' : otherInput}</details>`;
  }).join("");
  const guide = japaneseOnly ? "国語には決まった宿題項目はありません。宿題がある単元だけ開き、「その他」欄へ入力してください。" : `${options.unitIds.length}単元の宿題を、単元ごとに確認できます。変更する単元だけ開いて、不要な宿題を外してください。`;
  showModal(`<h2>${correcting ? "宿題を訂正" : "次回宿題を確認"}</h2><p>${guide}</p><div class="unitHomeworkGroups">${groups}</div><output id="lessonSaveStatus" class="lessonSaveStatus" aria-live="polite"></output><div class="actionRow lessonSaveActions"><button id="backToProgress" class="ghostBtn" type="button">単元選択へ戻る</button><button id="confirmLesson" class="primaryBtn" type="button">${correcting ? "訂正内容を保存" : "授業と宿題を保存"}</button></div>`);
  $("backToProgress").onclick = () => openProgress(options);
  $("confirmLesson").onclick = () => {
    const homeworkByUnit = {};
    $("modalBody").querySelectorAll(".unitHomeworkGroup").forEach((group) => {
      const items = [...group.querySelectorAll(".unitHomeworkPreset:checked, .unitHomeworkPreset:disabled")].map((input) => input.value);
      const other = group.querySelector(".unitOtherHomework")?.value.trim();
      if (other) items.push(`その他：${other}`);
      homeworkByUnit[group.dataset.unit] = items;
    });
    saveLessonWithHomework(options, homeworkByUnit);
  };
}

async function saveLessonWithHomework(options, homeworkByUnit) {
  const correcting = options.mode === "correction";
  const buttonLabel = correcting ? "訂正内容を保存" : "授業と宿題を保存";
  const button = $("confirmLesson");
  if (button) { button.disabled = true; button.textContent = "保存中…"; }
  if ($("lessonSaveStatus")) $("lessonSaveStatus").textContent = "保存しています。画面を閉じずにお待ちください。";
  try {
    const saveResult = await api(correcting ? "updateLessonCorrection" : "saveLesson", { studentId: options.studentId, subject: options.subject, lessonId: options.lessonId, teacherId: options.teacherId, unitIds: options.unitIds, homeworkByUnit, idempotencyKey: options.idempotencyKey, outsideRangeOverrideUnitIds: options.outsideRangeOverrideUnitIds || [] });
    invalidateProgressionCache(options);
    delete state.teacherStudentCache[String(options.studentId)];
    delete $("modal").dataset.refreshTeacher;
    closeModal();
    if (FAST_RUNTIME_ENABLED && saveResult?.queued && !saveResult?._fastRuntimeFallback) {
      status(`${correcting ? "訂正内容を" : ""}保存しました（高速保存）。画面を待たせず、同期はバックグラウンドで続きます。`);
      return;
    }
    status(`${correcting ? "訂正内容を" : ""}保存しました。画面を更新しています…`);
    await openView("selected");
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = buttonLabel; }
    if ($("lessonSaveStatus")) $("lessonSaveStatus").textContent = error.message;
  }
}

function openCtForm(options, unitId) {
  showModal(`<h2>CT結果を登録</h2><p>前回授業範囲から1単元だけ登録します。</p><div class="actionRow">${["◎", "〇", "×"].map((r) => `<button class="primaryBtn ctResult" data-result="${r}">${r}</button>`).join("")}</div><p class="muted">×は自動的に特訓部屋対象になります。試験中のメールは送信抑止されます。</p>`);
  $("modalBody").querySelectorAll(".ctResult").forEach((button) => button.onclick = async () => { try { await api("saveCt", { studentId: options.studentId, subject: options.subject, unitId, result: button.dataset.result, idempotencyKey: crypto.randomUUID() }); invalidateProgressionCache(options); closeModal(); status("CT結果を登録しました。"); } catch (error) { status(error.message, true); } });
}

function showModal(html) { $("modalBody").innerHTML = html; if (!$("modal").open) $("modal").showModal(); }
function closeModal() {
  const shouldRefreshTeacher = $("modal").dataset.refreshTeacher === "true";
  const shouldRefreshStudent = $("modal").dataset.refreshStudent === "true";
  delete $("modal").dataset.refreshTeacher;
  delete $("modal").dataset.refreshStudent;
  if ($("modal").open) $("modal").close();
  if (shouldRefreshStudent && state.role === "student") { state.dashboard = null; openView("home"); return; }
  if (shouldRefreshTeacher && state.role === "teacher" && state.activeStudentId) {
    delete state.teacherStudentCache[String(state.activeStudentId)];
    renderTeacherStudent(state.activeStudentId, { force: true }).catch((error) => showError(error, () => renderTeacherStudent(state.activeStudentId, { force: true })));
  }
}

function openAdminReauth() {
  const hasTeacherSession = Boolean(state.session && state.session.role === "teacher");
  showModal(`<h2>管理者ログイン</h2><p>管理者権限のある講師IDとパスワードを入力してください。両方そろうと自動でログインします。</p><form id="adminReauthForm" class="loginForm" autocomplete="on"><label><span>講師ID</span><input id="adminLoginId" name="code" value="${hasTeacherSession ? esc(state.session.loginId || "") : ""}" autocomplete="username" required autofocus></label><label><span>パスワード</span><input id="adminLoginPassword" name="password" type="password" required autocomplete="current-password"></label><button class="primaryBtn">管理者画面を開く</button><p id="reauthError" class="formMessage" role="alert"></p></form>`);
  const adminForm = $("adminReauthForm");
  let autoLoginTimer = null;
  let loginInProgress = false;
  let lastAttempt = "";
  const scheduleAdminLogin = () => {
    clearTimeout(autoLoginTimer);
    const code = $("adminLoginId").value.trim();
    const password = $("adminLoginPassword").value;
    const signature = `${code}\n${password}`;
    if (!code || !password || signature === lastAttempt || loginInProgress) return;
    autoLoginTimer = setTimeout(() => adminForm.requestSubmit(), 700);
  };
  $("adminLoginId").addEventListener("input", scheduleAdminLogin);
  $("adminLoginPassword").addEventListener("input", scheduleAdminLogin);
  adminForm.onsubmit = async (event) => {
    event.preventDefault();
    if (loginInProgress) return;
    const button = event.currentTarget.querySelector("button[type='submit'], button:not([type])");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    lastAttempt = `${String(form.code || "").trim()}\n${String(form.password || "")}`;
    const previousSession = state.session;
    const previousRole = state.role;
    loginInProgress = true;
    button.disabled = true;
    $("reauthError").textContent = "確認中…";
    try {
      if (!hasTeacherSession) {
        const staff = await api("staffLogin", { loginId: form.code, password: form.password, deviceMode: "shared" }, { silent: true });
        state.session = staff.session;
        state.role = "teacher";
      }
      const result = await api("adminReauth", form, { silent: true });
      state.adminToken = result.adminToken;
      state.session = result.session;
      state.role = "admin";
      state.activeView = "admin";
      persistAdminSession();
      closeModal();
      renderShell();
      openView("admin");
    } catch (error) {
      if (!hasTeacherSession && state.session) {
        try { await api("logout", {}, { silent: true }); } catch {}
        state.session = previousSession;
        state.role = previousRole;
      }
      loginInProgress = false;
      button.disabled = false;
      $("reauthError").textContent = "IDまたはパスワード、管理者権限を確認してください。";
    }
  };
}

async function login(event) {
  event.preventDefault();
  if (!state.device) {
    $("loginMessage").textContent = "⚠ 端末の種類が未選択です。先に「自分の端末」か「塾の共用端末」を選んでください。";
    $("devicePrompt")?.classList.add("needsChoice");
    document.querySelector(".deviceChoice")?.focus();
    $("devicePrompt")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  $("loginMessage").textContent = "確認中…";
  try {
    const result = await api(state.role === "student" ? "studentLogin" : "staffLogin", { loginId: $("loginId").value.trim(), password: $("loginPassword").value, deviceMode: state.device }, { silent: true });
    state.session = result.session;
    persistSession();
    $("loginPassword").value = "";
    state.activeView = state.role === "student" ? "home" : "search";
    renderShell();
    openView(state.activeView);
  } catch (error) { $("loginMessage").textContent = "IDまたはパスワードを確認してください。"; }
}

function finishBoot(showLogin = false) {
  document.body.classList.remove("booting");
  $("bootCover")?.classList.add("hidden");
  if (showLogin) $("loginView")?.classList.remove("hidden");
}

async function restore() {
  const savedAdmin = localStorage.getItem(KEYS.admin);
  if (savedAdmin) {
    try {
      const parsedAdmin = JSON.parse(savedAdmin);
      state.adminToken = parsedAdmin.adminToken;
      state.session = parsedAdmin.session;
      const result = await api("resumeAdminSession", {}, { silent: true });
      state.session = result.session;
      state.role = "admin";
      state.activeView = "admin";
      persistAdminSession();
      renderShell();
      finishBoot(false);
      await openView("admin");
      return;
    } catch { clearSessions(); }
  }

  const saved = localStorage.getItem(KEYS.local) || sessionStorage.getItem(KEYS.session);
  if (!saved) { finishBoot(true); return; }
  try {
    const parsed = JSON.parse(saved);
    state.session = parsed;
    state.role = parsed.role;
    state.device = parsed.deviceMode || sessionStorage.getItem(KEYS.device) || "personal";
    state.activeView = state.role === "student" ? "home" : "search";

    if (state.role === "student") {
      const cached = readCachedStudentDashboard(parsed.studentId || parsed.loginId);
      const resumePromise = api("resumeSession", {}, { silent: true });
      const dashboardPromise = api("getStudentDashboard", {}, { silent: true });
      if (cached) state.dashboard = cached;
      const [resumeResult, dashboardResult] = await Promise.all([resumePromise, dashboardPromise]);
      state.session = { ...parsed, ...resumeResult.session };
      state.dashboard = dashboardResult;
      cacheStudentDashboard(dashboardResult);
      renderShell();
      finishBoot(false);
      await renderStudent("home");
      return;
    }

    const result = await api("resumeSession", {}, { silent: true });
    state.session = { ...parsed, ...result.session };
    if (state.role === "teacher") restoreTeacherLessonSelection();
    renderShell();
    finishBoot(false);
    await openView(state.activeView);
  } catch {
    clearSessions();
    finishBoot(true);
  }
}

document.querySelectorAll(".roleTab").forEach((tab) => tab.onclick = () => {
  document.querySelectorAll(".roleTab").forEach((item) => { item.classList.toggle("active", item === tab); item.setAttribute("aria-selected", item === tab ? "true" : "false"); });
  state.role = tab.dataset.role;
  $("loginIdLabel").textContent = state.role === "student" ? "生徒ID" : "講師ID";
  $("loginId").inputMode = state.role === "student" ? "numeric" : "text";
});
document.querySelectorAll(".deviceChoice").forEach((button) => button.onclick = () => {
  state.device = button.dataset.device;
  document.querySelectorAll(".deviceChoice").forEach((item) => item.classList.toggle("selected", item === button));
  $("devicePrompt")?.classList.remove("needsChoice");
  $("devicePrompt")?.classList.add("selectedDevice");
  if ($("devicePromptWarning")) $("devicePromptWarning").textContent = state.device === "personal" ? "✓ 自分の端末を選択済み" : "✓ 塾の共用端末を選択済み";
  $("loginMessage").textContent = "";
  $("rememberRow").classList.toggle("hidden", state.device !== "personal");
  if (state.device === "shared") $("rememberLogin").checked = false;
});
$("loginForm").addEventListener("submit", login);
$("logoutButton").onclick = async () => { try { await api("logout", {}, { silent: true }); } catch {} clearSessions(); location.reload(); };
$("adminEntry").onclick = openAdminReauth;
$("topAdminEntry").onclick = () => { if (state.role === "admin" && state.adminToken) openView("admin"); else openAdminReauth(); };
$("modalClose").onclick = closeModal;
$("modal").addEventListener("click", (event) => { if (event.target === $("modal")) closeModal(); });

restore();
