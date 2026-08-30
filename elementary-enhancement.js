import { CONFIG } from "./config.js";

const CORE = ["算数", "国語", "英語"];
const EXTRA = ["理科", "社会"];
let progressionPromise = null;
let enhancing = false;
let lastSignature = "";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const normalizeSubject = (value) => String(value || "").trim() === "数学" ? "算数" : String(value || "").trim();
const normalizeGrade = (value) => String(value || "").normalize("NFKC").replace(/年$/u, "");
const englishKey = (value) => {
  const s = String(value || "").normalize("NFKC").toUpperCase().replace(/\s+/g, "");
  if (s === "3" || s.includes("III")) return "Ⅲ";
  if (s === "2" || s.includes("II")) return "Ⅱ";
  if (s === "1" || s.includes("I")) return "Ⅰ";
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
  return callApi("getStudentDashboard", session.role === "teacher" ? { studentId: id } : {});
}

async function loadProgressions() {
  if (progressionPromise) return progressionPromise;
  progressionPromise = fetch("./apps-script/Code.gs?v=20260831-elementary-static", { cache: "no-store" })
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

function openModal(html) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  if (!modal || !body) return;
  body.innerHTML = html;
  if (!modal.open) modal.showModal();
}

async function showStaticProgression(subject) {
  const dashboard = await loadDashboard().catch(() => null);
  const session = readSession();
  const grade = dashboard?.student?.grade || session?.grade || "";
  const level = dashboard?.student?.englishLevel || "";
  const normalized = normalizeSubject(subject);
  openModal('<div class="loadingCard"><span class="spinner"></span><p>進行表を読み込み中です…</p></div>');
  try {
    const units = await unitsFor(normalized, grade, level);
    if (!units.length) throw new Error(normalized === "国語" ? "国語の進行表は後日登録予定です。" : "進行表を確認できませんでした。");
    const source = normalized === "算数" ? "啓林館" : `フォレスタ小学英語 ${englishKey(level) || ""}`.trim();
    openModal(`<div class="elementaryStaticProgress"><div class="elementaryStaticHead"><span class="elementaryKicker">小学生進行表</span><h2>${esc(normalizeGrade(grade))} ${esc(normalized)} / ${esc(source)}</h2><p>現在使用する正式な進行表です。</p></div><div class="elementaryStaticTableWrap"><table class="elementaryStaticTable"><thead><tr><th>番号</th><th>単元</th><th>ページ</th></tr></thead><tbody>${units.map((u) => `<tr><td>${esc(u.unitNumber || "")}</td><td><strong>${esc(u.unitName || "")}</strong><small>${esc(u.chapter || "")}</small></td><td>${esc(u.page || "")}</td></tr>`).join("")}</tbody></table></div></div>`);
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

function enrolledSubjects(dashboard) {
  const raw = dashboard?.student?.subjects || dashboard?.elementary?.subjects || [];
  const list = [...new Set(raw.map(normalizeSubject).filter((s) => CORE.includes(s)))];
  return list.length ? list : ["算数"];
}

function unitSelectOptions(units) {
  return '<option value="">単元を選ぶ</option>' + units.map((u) => `<option value="${esc(u.unitId)}">${esc([u.unitNumber, u.unitName].filter(Boolean).join(" "))}</option>`).join("");
}

async function addQuickTestForm(dashboard) {
  const session = readSession();
  if (session?.role !== "teacher" || document.getElementById("elementaryTopTestEntry")) return;
  const guide = document.querySelector(".elementaryTeacherGuide");
  if (!guide) return;
  const subjects = enrolledSubjects(dashboard);
  const box = document.createElement("article");
  box.id = "elementaryTopTestEntry";
  box.className = "card elementaryTopTestEntry";
  box.innerHTML = `<div class="elementaryTopTestHead"><div><p class="cardTitle">学校の単元テスト入力</p><p>最近の算数・国語のテストを聞き取り、その場で入力します。</p></div></div><form id="elementaryTopTestForm" class="elementaryTopTestForm"><label>科目<select id="elementaryTopTestSubject" class="field">${subjects.map((s) => `<option>${esc(s)}</option>`).join("")}</select></label><label id="elementaryTopTestUnitWrap">単元<select id="elementaryTopTestUnit" class="field"></select></label><label id="elementaryTopTestFreeWrap" class="hidden">単元名<input id="elementaryTopTestFree" class="field" maxlength="80" placeholder="例：割合"></label><label>点数<input id="elementaryTopTestScore" class="field" type="number" min="0" max="999" required></label><label>満点<input id="elementaryTopTestMax" class="field" type="number" min="1" max="999" value="100"></label><label>テスト日<input id="elementaryTopTestDate" class="field" type="date"></label><button class="primaryBtn" type="submit">保存</button></form><output id="elementaryTopTestStatus"></output>`;
  guide.insertAdjacentElement("afterend", box);
  const date = box.querySelector("#elementaryTopTestDate");
  date.value = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const subjectEl = box.querySelector("#elementaryTopTestSubject");
  const unitEl = box.querySelector("#elementaryTopTestUnit");
  const unitWrap = box.querySelector("#elementaryTopTestUnitWrap");
  const freeWrap = box.querySelector("#elementaryTopTestFreeWrap");
  const refresh = async () => {
    const units = await unitsFor(subjectEl.value, dashboard?.student?.grade, dashboard?.student?.englishLevel).catch(() => []);
    unitEl.innerHTML = unitSelectOptions(units);
    unitWrap.classList.toggle("hidden", !units.length);
    freeWrap.classList.toggle("hidden", !!units.length);
  };
  subjectEl.addEventListener("change", refresh);
  await refresh();
  box.querySelector("#elementaryTopTestForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = box.querySelector("#elementaryTopTestStatus");
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = "保存しています…";
    try {
      const hasUnits = !unitWrap.classList.contains("hidden");
      await callApi("saveElementaryUnitTest", {
        studentId: pageStudentId(),
        subject: subjectEl.value,
        unitId: hasUnits ? unitEl.value : "",
        unitName: hasUnits ? "" : box.querySelector("#elementaryTopTestFree").value.trim(),
        testDate: date.value,
        score: box.querySelector("#elementaryTopTestScore").value,
        maxScore: box.querySelector("#elementaryTopTestMax").value || 100,
        memo: "",
      });
      status.textContent = "保存しました。";
      setTimeout(() => location.reload(), 350);
    } catch (error) {
      status.textContent = /処理を実行できません/.test(error.message) ? "単元テスト保存APIの本番反映が必要です。" : error.message;
      button.disabled = false;
    }
  });
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
    const testTitle = [...document.querySelectorAll(".cardTitle")].find((el) => el.textContent.includes("学校の単元テスト"));
    if (testTitle && !testTitle.textContent.includes("最近")) testTitle.textContent = "最近の学校単元テスト";
    await addQuickTestForm(dashboard);
    lastSignature = signature;
  } finally {
    enhancing = false;
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest(".elementaryStudentProgress,.elementaryOpenProgress");
  if (!button || !document.querySelector(".elementaryKicker")) return;
  const card = button.closest(".elementarySubjectCard");
  const subject = normalizeSubject(card?.querySelector(".subjectPill")?.textContent || button.dataset.subject);
  if (!["算数", "英語"].includes(subject)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  showStaticProgression(subject);
}, true);

const observer = new MutationObserver(() => queueMicrotask(enhanceElementary));
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("DOMContentLoaded", enhanceElementary);
setTimeout(enhanceElementary, 500);
