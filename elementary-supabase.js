import { CONFIG } from "./config.js";

const CORE = ["算数", "国語", "英語"];
const EXTRA = ["理科", "社会"];
const ELEMENTARY_API = "https://wisedgcgwaebtkprdhth.supabase.co/functions/v1/elementary-progress";
let progressionPromise = null;
let enhancing = false;
let lastSignature = "";
let lastDashboard = null;
let lastElementaryData = null;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const normalizeSubject = (value) => String(value || "").trim() === "数学" ? "算数" : String(value || "").trim();
const normalizeGrade = (value) => String(value || "").normalize("NFKC").replace(/年$/u, "");
const todayJst = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const shortDate = (value) => value ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).format(new Date(`${String(value).slice(0,10)}T12:00:00+09:00`)) : "";
const englishKey = (value) => {
  const s = String(value || "").normalize("NFKC").toUpperCase().replace(/\s+/g, "");
  if (s === "3" || s.includes("III") || s.includes("Ⅲ")) return "Ⅲ";
  if (s === "2" || s.includes("II") || s.includes("Ⅱ")) return "Ⅱ";
  if (s === "1" || s.includes("I") || s.includes("Ⅰ")) return "Ⅰ";
  return "";
};

function readSession() {
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
}

function status(message, error = false) {
  const el = document.getElementById("globalStatus");
  if (!el) return;
  if (!message) { el.classList.add("hidden"); return; }
  el.textContent = message;
  el.classList.remove("hidden");
  el.style.background = error ? "#fee2e2" : "#edf7ff";
  el.style.color = error ? "#991b1b" : "#1d4f7a";
}

async function callApi(action, payload = {}) {
  const session = readSession();
  if (!session?.token) throw new Error("ログイン情報を確認できません。再ログインしてください。");
  const response = await fetch(CONFIG.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, token: session.token, ...payload }),
    redirect: "follow",
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.message || "処理に失敗しました。");
  return result;
}

async function callElementary(action, payload = {}) {
  const session = readSession();
  if (!session?.token) throw new Error("ログイン情報を確認できません。再ログインしてください。");
  const response = await fetch(ELEMENTARY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token: session.token, studentId: pageStudentId(), ...payload }),
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.message || "小学生データの保存に失敗しました。");
  lastElementaryData = result;
  return result;
}

function pageStudentId() {
  const session = readSession();
  if (session?.role === "student") return String(session.studentId || session.loginId || "");
  const text = document.querySelector(".pageHead p")?.textContent || "";
  return text.match(/\b(\d{4})\b/)?.[1] || "";
}

async function loadDashboard() {
  const id = pageStudentId();
  const session = readSession();
  if (!id || !session) return null;
  const data = await callApi("getStudentDashboard", session.role === "teacher" ? { studentId: id } : {});
  lastDashboard = data;
  return data;
}

async function loadElementaryData(force = false) {
  if (!force && lastElementaryData && String(lastElementaryData.studentId || pageStudentId()) === String(pageStudentId())) return lastElementaryData;
  const data = await callElementary("get");
  data.studentId = pageStudentId();
  lastElementaryData = data;
  return data;
}

async function loadProgressions() {
  if (progressionPromise) return progressionPromise;
  progressionPromise = fetch("./apps-script/Code.gs?v=20260831-elementary-static-3", { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error("進行表データを読み込めませんでした。");
      return r.text();
    })
    .then((text) => {
      const match = text.match(/const ELEMENTARY_PROGRESSIONS_=(\{[\s\S]*?\});\nfunction isElementaryGrade_/);
      if (!match) throw new Error("小学生進行表データが見つかりません。");
      return JSON.parse(match[1]);
    });
  return progressionPromise;
}

async function unitsFor(subject, grade, level) {
  const data = await loadProgressions();
  const normalized = normalizeSubject(subject);
  if (normalized === "算数") return data.math?.[normalizeGrade(grade)] || [];
  if (normalized === "英語") return data.english?.[englishKey(level)] || [];
  return [];
}

function enrolledSubjects(dashboard) {
  const raw = [...(dashboard?.student?.subjects || []), ...(dashboard?.elementary?.subjects || [])];
  const list = [...new Set(raw.map(normalizeSubject).filter((s) => CORE.includes(s)))];
  return list.length ? CORE.filter((s) => list.includes(s)) : ["算数"];
}

function latestBySubject(rows, subject, dateKey) {
  return (rows || []).filter((r) => normalizeSubject(r.subject) === subject)
    .sort((a, b) => String(b[dateKey] || "").localeCompare(String(a[dateKey] || "")) || String(b.created_at || "").localeCompare(String(a.created_at || "")))[0] || null;
}

function summaryFor(subject, units, data) {
  const order = new Map(units.map((u, i) => [u.unitId, Number(u.displayOrder || i + 1)]));
  const byId = new Map(units.map((u) => [u.unitId, u]));
  const school = latestBySubject(data?.schoolProgress, subject, "recorded_date");
  const lessons = (data?.lessonProgress || []).filter((r) => normalizeSubject(r.subject) === subject && order.has(r.unit_id));
  const juku = lessons.sort((a, b) => (order.get(b.unit_id) || 0) - (order.get(a.unit_id) || 0))[0] || null;
  const test = latestBySubject(data?.unitTests, subject, "test_date");
  const schoolOrder = school && order.has(school.unit_id) ? order.get(school.unit_id) : null;
  const jukuOrder = juku && order.has(juku.unit_id) ? order.get(juku.unit_id) : null;
  const diff = schoolOrder != null && jukuOrder != null ? jukuOrder - schoolOrder : null;
  let label = "未設定";
  if (diff != null) label = diff > 0 ? `学校より +${diff}単元` : diff < 0 ? `学校より ${diff}単元` : "学校と同じ ±0単元";
  else if (school && !juku) label = "塾進度未入力";
  else if (!school && juku) label = "学校進度未入力";
  return { school, juku, test, schoolUnit: school ? byId.get(school.unit_id) : null, jukuUnit: juku ? byId.get(juku.unit_id) : null, diff, label };
}

function setDifferenceBadge(el, value, label) {
  if (!el) return;
  el.textContent = label;
  el.classList.remove("ahead", "behind", "same", "unset");
  el.classList.add(value == null ? "unset" : value > 0 ? "ahead" : value < 0 ? "behind" : "same");
}

function recentTestsHtml(tests) {
  const subjectList = (subject) => {
    const rows = (tests || []).filter((t) => normalizeSubject(t.subject) === subject).slice(0, 6);
    if (!rows.length) return '<div class="emptyState compact">まだありません。</div>';
    return `<div class="elementarySubjectTestList">${rows.map((t) => `<div class="elementarySubjectTestRow"><span>${esc(shortDate(t.test_date))}</span><strong>${esc(t.unit_name || "単元テスト")}</strong><b>${esc(t.score)}/${esc(t.max_score || 100)}</b></div>`).join("")}</div>`;
  };
  const eng = (tests || []).filter((t) => normalizeSubject(t.subject) === "英語").slice(0, 4);
  return `<div class="elementaryRecentTestGrid"><section><h3>算数</h3>${subjectList("算数")}</section><section><h3>国語</h3>${subjectList("国語")}</section></div>${eng.length ? `<details class="elementaryOtherTests"><summary>英語の履歴</summary><div class="elementarySubjectTestList">${eng.map((t) => `<div class="elementarySubjectTestRow"><span>${esc(shortDate(t.test_date))}</span><strong>${esc(t.unit_name || "単元テスト")}</strong><b>${esc(t.score)}/${esc(t.max_score || 100)}</b></div>`).join("")}</div></details>` : ""}`;
}

function replaceRecentHistory(data) {
  const titles = [...document.querySelectorAll(".cardTitle")].filter((el) => el.textContent.includes("学校単元テスト") || el.textContent.includes("学校の単元テスト"));
  for (const title of titles) {
    const card = title.closest(".card");
    if (!card || card.id === "elementaryTopTestEntry") continue;
    card.innerHTML = `<p class="cardTitle">最近の学校単元テスト</p>${recentTestsHtml(data?.unitTests || [])}`;
  }
}

async function updateTopCards(dashboard, data) {
  const cards = [...document.querySelectorAll(".elementarySubjectCard")];
  for (const card of cards) {
    const pill = card.querySelector(".subjectPill");
    if (!pill) continue;
    const subject = normalizeSubject(pill.textContent);
    if (!CORE.includes(subject)) continue;
    if (pill.textContent.trim() === "数学") pill.textContent = "算数";
    const units = await unitsFor(subject, dashboard?.student?.grade, dashboard?.student?.englishLevel).catch(() => []);
    const summary = summaryFor(subject, units, data);
    setDifferenceBadge(card.querySelector(".elementaryDifference"), summary.diff, summary.label);

    const paragraphs = [...card.querySelectorAll("p")];
    const schoolP = paragraphs.find((p) => p.querySelector("small")?.textContent.trim() === "学校");
    const jukuP = paragraphs.find((p) => ["塾", "塾の現在地"].includes(p.querySelector("small")?.textContent.trim()));
    const testP = paragraphs.find((p) => p.textContent.includes("直近"));
    if (schoolP) schoolP.innerHTML = `<small>学校</small><br><strong>${esc(summary.schoolUnit?.unitName || "未入力")}</strong>`;
    if (jukuP) jukuP.innerHTML = `<small>塾</small><br><strong>${esc(summary.jukuUnit?.unitName || "未入力")}</strong>`;
    if (testP) testP.innerHTML = `直近の学校単元テスト：${summary.test ? `<strong class="elementaryScore">${esc(summary.test.score)}点</strong>` : "未登録"}`;

    const select = card.querySelector(".elementarySchoolPosition");
    if (select && units.length) {
      select.innerHTML = '<option value="">学校進度を選ぶ</option>' + units.map((u) => `<option value="${esc(u.unitId)}" ${u.unitId === summary.school?.unit_id ? "selected" : ""}>${esc([u.unitNumber, u.unitName].filter(Boolean).join(" "))}</option>`).join("");
      select.onchange = async () => {
        if (!select.value) return;
        select.disabled = true;
        try {
          await callElementary("saveSchoolPosition", { subject, unitId: select.value, recordedDate: todayJst() });
          status("学校進度を保存しました。");
          await refreshElementaryScreen();
        } catch (error) {
          status(error.message, true);
          select.disabled = false;
        }
      };
    }
  }
  replaceRecentHistory(data);
}

function unitSelectOptions(units, selected = "") {
  return '<option value="">単元を選ぶ</option>' + units.map((u) => `<option value="${esc(u.unitId)}" ${u.unitId === selected ? "selected" : ""}>${esc([u.unitNumber, u.unitName].filter(Boolean).join(" "))}</option>`).join("");
}

async function bindTopTestForm(dashboard) {
  const session = readSession();
  if (session?.role !== "teacher") return;
  const form = document.getElementById("elementaryTopTestForm");
  if (!form) return;
  const subjects = enrolledSubjects(dashboard);
  const subjectEl = form.querySelector("#elementaryTopTestSubject");
  const unitEl = form.querySelector("#elementaryTopTestUnit");
  const unitWrap = form.querySelector("#elementaryTopTestUnitWrap");
  const freeWrap = form.querySelector("#elementaryTopTestFreeWrap");
  const dateEl = form.querySelector("#elementaryTopTestDate");
  const scoreEl = form.querySelector("#elementaryTopTestScore");
  const maxEl = form.querySelector("#elementaryTopTestMax");
  const output = document.getElementById("elementaryTopTestStatus");
  if (!subjectEl || !dateEl || !scoreEl || !maxEl) return;
  subjectEl.innerHTML = subjects.map((s) => `<option>${esc(s)}</option>`).join("");
  if (!dateEl.value) dateEl.value = todayJst();
  const refresh = async () => {
    const units = await unitsFor(subjectEl.value, dashboard?.student?.grade, dashboard?.student?.englishLevel).catch(() => []);
    if (unitEl) unitEl.innerHTML = unitSelectOptions(units);
    unitWrap?.classList.toggle("hidden", !units.length);
    freeWrap?.classList.toggle("hidden", !!units.length);
  };
  subjectEl.onchange = refresh;
  await refresh();
  form.onsubmit = async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const button = form.querySelector('button[type="submit"]');
    const hasUnits = unitWrap && !unitWrap.classList.contains("hidden");
    const selectedUnitId = hasUnits ? unitEl?.value || "" : "";
    const selectedUnit = hasUnits ? (await unitsFor(subjectEl.value, dashboard?.student?.grade, dashboard?.student?.englishLevel)).find((u) => u.unitId === selectedUnitId) : null;
    const unitName = selectedUnit?.unitName || form.querySelector("#elementaryTopTestFree")?.value.trim() || "";
    if (!unitName) { if (output) output.textContent = "単元を選んでください。"; return; }
    button.disabled = true;
    if (output) output.textContent = "保存しています…";
    try {
      await callElementary("saveUnitTest", { subject: normalizeSubject(subjectEl.value), unitId: selectedUnitId, unitName, testDate: dateEl.value || todayJst(), score: scoreEl.value, maxScore: maxEl.value || 100, memo: "" });
      if (output) output.textContent = "保存しました。";
      scoreEl.value = "";
      status("学校の単元テストを保存しました。");
      await refreshElementaryScreen();
    } catch (error) {
      if (output) output.textContent = error.message;
    } finally { button.disabled = false; }
  };
}

function openModal(html) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  if (!modal || !body) return;
  body.innerHTML = html;
  if (!modal.open) modal.showModal();
}

function openTestDialog({ subject, unit, onSaved }) {
  const dialog = document.createElement("dialog");
  dialog.className = "elementaryUnitTestDialog";
  dialog.innerHTML = `<form method="dialog" class="elementaryUnitTestDialogCard"><button class="elementaryDialogClose" value="cancel" aria-label="閉じる">×</button><span class="elementaryKicker">学校の単元テスト</span><h3>${esc(subject)}　${esc(unit?.unitName || "単元テスト")}</h3><label>テスト日<input id="eTestDate" class="field" type="date" value="${todayJst()}"></label><div class="elementaryScoreInputs"><label>点数<input id="eTestScore" class="field" type="number" min="0" max="999" required autofocus></label><label>満点<input id="eTestMax" class="field" type="number" min="1" max="999" value="100"></label></div><label>メモ<input id="eTestMemo" class="field" maxlength="120"></label><output id="eTestStatus"></output><button id="eTestSave" class="primaryBtn" type="button">保存</button></form>`;
  document.body.appendChild(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.querySelector("#eTestSave").onclick = async () => {
    const save = dialog.querySelector("#eTestSave");
    const out = dialog.querySelector("#eTestStatus");
    const score = dialog.querySelector("#eTestScore").value;
    if (score === "") { out.textContent = "点数を入力してください。"; return; }
    save.disabled = true;
    out.textContent = "保存しています…";
    try {
      await callElementary("saveUnitTest", { subject, unitId: unit?.unitId || "", unitName: unit?.unitName || "単元テスト", testDate: dialog.querySelector("#eTestDate").value || todayJst(), score, maxScore: dialog.querySelector("#eTestMax").value || 100, memo: dialog.querySelector("#eTestMemo").value.trim() });
      out.textContent = "保存しました。";
      status("学校の単元テストを保存しました。");
      setTimeout(() => { try { dialog.close(); } catch {} onSaved?.(); }, 250);
    } catch (error) {
      out.textContent = error.message;
      save.disabled = false;
    }
  };
  dialog.showModal();
}

async function showInteractiveProgression(subject) {
  const dashboard = lastDashboard || await loadDashboard().catch(() => null);
  const session = readSession();
  const grade = dashboard?.student?.grade || session?.grade || "";
  const level = dashboard?.student?.englishLevel || "";
  const normalized = normalizeSubject(subject);
  openModal('<div class="loadingCard"><span class="spinner"></span><p>進行表を読み込み中です…</p></div>');
  try {
    const units = await unitsFor(normalized, grade, level);
    if (!units.length) throw new Error(normalized === "国語" ? "国語の進行表は、NEW小学ワーク・漢字ドリルの進行表登録後に使用できます。" : "進行表を確認できませんでした。");
    const data = await loadElementaryData(true);
    const summary = summaryFor(normalized, units, data);
    const source = normalized === "算数" ? "啓林館" : `フォレスタ小学英語 ${englishKey(level) || ""}`.trim();
    const today = todayJst();
    const todaySet = new Set((data.lessonProgress || []).filter((r) => normalizeSubject(r.subject) === normalized && r.lesson_date === today).map((r) => r.unit_id));
    const lessonDates = new Map();
    for (const row of data.lessonProgress || []) {
      if (normalizeSubject(row.subject) !== normalized) continue;
      if (!lessonDates.has(row.unit_id)) lessonDates.set(row.unit_id, []);
      lessonDates.get(row.unit_id).push(row.lesson_date);
    }
    const teacher = session?.role === "teacher";
    openModal(`<div class="elementaryStaticProgress interactive"><div class="elementaryStaticHead"><span class="elementaryKicker">小学生進行表</span><h2>${esc(normalizeGrade(grade))} ${esc(normalized)} / ${esc(source)}</h2><p>${teacher ? "中学生と同じように、今日の進行・学校の現在地・単元テストをこの表で入力できます。" : "学校と塾の現在地を確認できます。"}</p><div class="elementaryProgressSummary"><span>学校 <b>${esc(summary.schoolUnit?.unitName || "未入力")}</b></span><span>塾 <b>${esc(summary.jukuUnit?.unitName || "未入力")}</b></span><strong class="elementaryDifference ${summary.diff == null ? "unset" : summary.diff > 0 ? "ahead" : summary.diff < 0 ? "behind" : "same"}">${esc(summary.label)}</strong></div></div><div class="elementaryStaticTableWrap"><table class="elementaryStaticTable interactive"><thead><tr><th>番号</th><th>単元</th><th>ページ</th>${teacher ? "<th>今日</th><th>学校</th><th>テスト</th>" : "<th>記録</th>"}</tr></thead><tbody>${units.map((u) => { const dates=(lessonDates.get(u.unitId)||[]).sort().reverse(); const learned=dates.length>0; const school=u.unitId===summary.school?.unit_id; return `<tr class="${learned ? "elementaryLearned" : ""} ${school ? "elementarySchoolCurrent" : ""}" data-unit="${esc(u.unitId)}"><td>${esc(u.unitNumber || "")}</td><td><strong>${esc(u.unitName || "")}</strong><small>${esc(u.chapter || "")}</small>${dates.length ? `<small class="elementaryLessonDates">授業 ${dates.slice(0,3).map(shortDate).join("・")}</small>` : ""}</td><td>${esc(u.page || "")}</td>${teacher ? `<td><label class="elementaryTodayToggle"><input type="checkbox" data-action="today" data-unit="${esc(u.unitId)}" ${todaySet.has(u.unitId) ? "checked" : ""}><span>${todaySet.has(u.unitId) ? "✓ 今日" : "今日"}</span></label></td><td><button type="button" class="elementarySchoolPin ${school ? "active" : ""}" data-action="school" data-unit="${esc(u.unitId)}">${school ? "🏫 学校" : "🏫"}</button></td><td><button type="button" class="elementaryInlineTest" data-action="test" data-unit="${esc(u.unitId)}">📝 テスト</button></td>` : `<td>${learned ? "学習済" : ""}${school ? " / 🏫学校" : ""}</td>`}</tr>`; }).join("")}</tbody></table></div></div>`);
    if (!teacher) return;
    const body = document.getElementById("modalBody");
    body.querySelectorAll('[data-action="today"]').forEach((input) => input.onchange = async () => {
      input.disabled = true;
      try {
        await callElementary("toggleLesson", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, checked: input.checked });
        status(input.checked ? "今日の進行を保存しました。" : "今日の進行を取り消しました。");
        await showInteractiveProgression(normalized);
        await refreshElementaryScreen(false);
      } catch (error) {
        input.checked = !input.checked;
        input.disabled = false;
        status(error.message, true);
      }
    });
    body.querySelectorAll('[data-action="school"]').forEach((button) => button.onclick = async () => {
      button.disabled = true;
      try {
        await callElementary("saveSchoolPosition", { subject: normalized, unitId: button.dataset.unit, recordedDate: today });
        status("学校の現在地を保存しました。");
        await showInteractiveProgression(normalized);
        await refreshElementaryScreen(false);
      } catch (error) {
        button.disabled = false;
        status(error.message, true);
      }
    });
    body.querySelectorAll('[data-action="test"]').forEach((button) => button.onclick = () => {
      const unit = units.find((u) => u.unitId === button.dataset.unit);
      openTestDialog({ subject: normalized, unit, onSaved: async () => { await showInteractiveProgression(normalized); await refreshElementaryScreen(false); } });
    });
  } catch (error) {
    openModal(`<div class="card dangerCard"><h2>進行表を表示できませんでした</h2><p>${esc(error.message)}</p></div>`);
  }
}

function ensureExtraDetails(grid) {
  let details = document.querySelector(".elementaryFoldedSubjects");
  if (!details) {
    details = document.createElement("details");
    details.className = "elementaryFoldedSubjects";
    details.innerHTML = '<summary>その他（理科・社会）</summary><div class="elementaryFoldedBody"></div><p class="elementaryFoldedNote">小学生では通常使用しないため、ここに折りたたんでいます。</p>';
    grid.insertAdjacentElement("afterend", details);
  }
  return details;
}

function cardSubject(card) {
  const pill = card.querySelector(".subjectPill");
  if (!pill) return "";
  const subject = normalizeSubject(pill.textContent);
  if (pill.textContent.trim() === "数学") pill.textContent = "算数";
  return subject;
}

async function refreshElementaryScreen(resetSignature = true) {
  if (resetSignature) lastSignature = "";
  lastElementaryData = null;
  const dashboard = lastDashboard || await loadDashboard().catch(() => null);
  const data = await loadElementaryData(true).catch(() => null);
  if (dashboard && data) {
    await updateTopCards(dashboard, data);
    await bindTopTestForm(dashboard);
  }
}

async function enhanceElementary() {
  if (enhancing || !document.querySelector(".elementaryKicker")) return;
  const grid = document.querySelector(".elementaryProgressGrid");
  if (!grid) return;
  const signature = `${pageStudentId()}|${grid.querySelectorAll(".elementarySubjectCard").length}|${readSession()?.role || ""}`;
  if (signature === lastSignature && document.querySelector(".elementaryFoldedSubjects")) return;
  enhancing = true;
  try {
    const dashboard = await loadDashboard().catch(() => null);
    if (!dashboard) return;
    const enrolled = enrolledSubjects(dashboard);
    const cards = [...grid.querySelectorAll(".elementarySubjectCard")];
    const extraDetails = ensureExtraDetails(grid);
    const extraBody = extraDetails.querySelector(".elementaryFoldedBody");
    const coreCards = [];
    for (const card of cards) {
      const subject = cardSubject(card);
      if (EXTRA.includes(subject)) {
        card.hidden = false;
        extraBody.appendChild(card);
        continue;
      }
      if (CORE.includes(subject)) {
        card.hidden = !enrolled.includes(subject);
        if (!card.hidden) coreCards.push(card);
      }
    }
    coreCards.sort((a, b) => CORE.indexOf(cardSubject(a)) - CORE.indexOf(cardSubject(b))).forEach((card) => grid.appendChild(card));
    extraDetails.hidden = !extraBody.querySelector(".elementarySubjectCard");
    const data = await loadElementaryData(true).catch((error) => { status(error.message, true); return null; });
    if (data) await updateTopCards(dashboard, data);
    await bindTopTestForm(dashboard);
    lastSignature = signature;
  } finally { enhancing = false; }
}

document.addEventListener("click", (event) => {
  const progressButton = event.target.closest(".elementaryStudentProgress,.elementaryOpenProgress");
  if (progressButton && document.querySelector(".elementaryKicker")) {
    const card = progressButton.closest(".elementarySubjectCard");
    const subject = normalizeSubject(card?.querySelector(".subjectPill")?.textContent || progressButton.dataset.subject);
    if (CORE.includes(subject)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showInteractiveProgression(subject);
      return;
    }
  }
  const testButton = event.target.closest(".elementaryTestEntry");
  if (testButton && document.querySelector(".elementaryKicker")) {
    const subject = normalizeSubject(testButton.dataset.subject || testButton.closest(".elementarySubjectCard")?.querySelector(".subjectPill")?.textContent);
    event.preventDefault();
    event.stopImmediatePropagation();
    (async () => {
      const dashboard = lastDashboard || await loadDashboard();
      const units = await unitsFor(subject, dashboard?.student?.grade, dashboard?.student?.englishLevel).catch(() => []);
      const first = units[0] || { unitId: "", unitName: `${subject} 単元テスト` };
      openTestDialog({ subject, unit: first, onSaved: () => refreshElementaryScreen() });
    })();
  }
}, true);

const observer = new MutationObserver(() => queueMicrotask(enhanceElementary));
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("DOMContentLoaded", enhanceElementary);
setTimeout(enhanceElementary, 500);
