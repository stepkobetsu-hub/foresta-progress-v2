import { CONFIG } from "./config.js?v=20260831-v3-cutover";

const adjustApiUrl = CONFIG.fastRuntimeApiUrl.replace(/\/foresta-runtime-v3\/?$/, "/foresta-homework-adjust-v3");
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

function injectStyles() {
  if (document.getElementById("v3HomeworkUiFixStyles")) return;
  const style = document.createElement("style");
  style.id = "v3HomeworkUiFixStyles";
  style.textContent = `
    .homeworkAdjustBtn,.progressOpenBtn{border:0;border-radius:12px;padding:12px 16px;font-weight:900;cursor:pointer;line-height:1.25;box-shadow:0 4px 12px rgba(23,32,31,.08)}
    .homeworkAdjustBtn{background:#f59e0b;color:#2f2104}.homeworkAdjustBtn:hover{background:#d97706;color:#fff}.homeworkAdjustBtn:disabled{opacity:.55;cursor:wait}
    .progressOpenBtn{background:#0f766e!important;color:#fff!important;border-color:#0f766e!important}.progressOpenBtn:hover{background:#115e59!important}
    .nextHomeworkAdjustList{display:grid;gap:10px;margin:16px 0}.nextHomeworkAdjustTask{display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid #e3e9e7;border-radius:12px;background:#fff;cursor:pointer}
    .nextHomeworkAdjustTask.isHidden{background:#fff8e6;border-color:#f3c66c}.nextHomeworkAdjustTask input{width:20px;height:20px;margin-top:2px;accent-color:#f59e0b}.nextHomeworkAdjustTask span{display:grid;gap:3px}.nextHomeworkAdjustTask small{color:#66736f}
    @media(max-width:700px){.homeworkAdjustBtn,.progressOpenBtn{flex:1 1 210px;white-space:normal}}
  `;
  document.head.appendChild(style);
}

function notify(message, error = false) {
  const el = document.getElementById("globalStatus");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
  el.style.background = error ? "#fee2e2" : "#edf7ff";
  el.style.color = error ? "#991b1b" : "#1d4f7a";
}

function session() { return window.__FORESTA_ACTIVE_SESSION__ || null; }
function dashboard() { return window.__FORESTA_ACTIVE_DASHBOARD__ || null; }

async function callAdjustApi(action, payload = {}) {
  const current = session();
  if (!current?.token) throw new Error("ログイン情報を確認できません。再読み込みしてください。");
  const response = await fetch(adjustApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token: current.token, ...payload }),
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.message || "処理に失敗しました。");
  return result;
}

function modal() { return document.getElementById("modal"); }
function modalBody() { return document.getElementById("modalBody"); }
function showModal(html) {
  const body = modalBody();
  if (!body) return;
  body.innerHTML = html;
  if (modal() && !modal().open) modal().showModal();
}
function closeModal() { if (modal()?.open) modal().close(); }

function applyHiddenToCurrentTeacherView(hiddenIds) {
  const hidden = new Set((hiddenIds || []).map(String));
  document.querySelectorAll(".teacherHomeworkCheck[data-id]").forEach((input) => {
    const task = input.closest(".teacherAssignedTask");
    if (task) task.style.display = hidden.has(String(input.dataset.id || "")) ? "none" : "";
  });
  document.querySelectorAll(".teacherHomeworkCard[data-homework-source='teacher']").forEach((card) => {
    const tasks = [...card.querySelectorAll(".teacherAssignedTask")];
    if (tasks.length) card.style.display = tasks.every((task) => task.style.display === "none") ? "none" : "";
  });
}

async function openAdjustment(subject) {
  const data = dashboard();
  const studentId = String(data?.student?.studentId || "");
  if (!studentId || !subject) return notify("科目を選択してください。", true);
  showModal('<div class="loadingCard"><span class="spinner"></span><p>次回宿題を読み込み中です…</p></div>');
  try {
    const result = await callAdjustApi("getNextHomeworkAdjustment", { studentId, subject });
    const items = Array.isArray(result.homework) ? result.homework : [];
    if (!items.length) {
      showModal(`<h2>次回宿題を確認・調整</h2><p><strong>${esc(subject)}</strong>の講師からの次回宿題はありません。</p><p class="muted">自主学習で自動作成された宿題はこの画面では変更しません。</p>`);
      return;
    }
    const rows = items.map((item) => {
      const unit = [item.unitNumber, item.unitName].filter(Boolean).join(" ");
      const text = item.contentText || item.contentType || "宿題";
      return `<label class="nextHomeworkAdjustTask ${item.adjustedHidden ? "isHidden" : ""}"><input class="nextHomeworkAdjustCheck" type="checkbox" value="${esc(item.homeworkId)}" ${item.adjustedHidden ? "" : "checked"}><span><strong>${esc(text)}</strong><small>${esc(subject)}${unit ? ` / ${esc(unit)}` : ""}${item.adjustedHidden ? " / 現在は次回宿題から外しています" : ""}</small></span></label>`;
    }).join("");
    showModal(`<h2>次回宿題を確認・調整</h2><p><strong>${esc(subject)}</strong>の次回宿題です。不要な項目はチェックを外してください。</p><div class="nextHomeworkAdjustList">${rows}</div><output id="nextHomeworkAdjustStatus" class="lessonSaveStatus" aria-live="polite"></output><div class="actionRow lessonSaveActions"><button id="saveNextHomeworkAdjustment" class="homeworkAdjustBtn" type="button">この内容で保存</button></div>`);
    document.getElementById("saveNextHomeworkAdjustment").onclick = async () => {
      const button = document.getElementById("saveNextHomeworkAdjustment");
      const allIds = items.map((item) => String(item.homeworkId || "")).filter(Boolean);
      const keepIds = [...document.querySelectorAll(".nextHomeworkAdjustCheck:checked")].map((input) => input.value);
      button.disabled = true;
      document.getElementById("nextHomeworkAdjustStatus").textContent = "保存中…";
      try {
        const saved = await callAdjustApi("adjustHomework", { studentId, subject, homeworkIds: allIds, keepHomeworkIds: keepIds });
        closeModal();
        applyHiddenToCurrentTeacherView(saved.hiddenIds || []);
        notify("次回宿題を調整しました。");
        if (Number(saved.restoredCount || 0) > 0) setTimeout(() => location.reload(), 250);
      } catch (error) {
        button.disabled = false;
        document.getElementById("nextHomeworkAdjustStatus").textContent = error.message;
      }
    };
  } catch (error) {
    showModal(`<h2>次回宿題を読み込めませんでした</h2><p>${esc(error.message)}</p>`);
  }
}

function createAdjustButton(subjectGetter) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "homeworkAdjustBtn";
  button.textContent = "次回宿題を確認・調整";
  button.onclick = () => {
    const subject = subjectGetter();
    if (!subject) return notify("科目を選択してください。", true);
    openAdjustment(subject);
  };
  return button;
}

function patchMiddleToolbar() {
  const progress = document.getElementById("inputLesson");
  const old = document.getElementById("correctLesson");
  if (!progress) return;
  if (!progress.classList.contains("progressOpenBtn")) progress.classList.add("progressOpenBtn");
  if (progress.textContent !== "進行表を開く") progress.textContent = "進行表を開く";
  if (old) {
    const adjust = createAdjustButton(() => document.getElementById("lessonSubject")?.value || "");
    adjust.id = "adjustNextHomework";
    progress.parentNode.insertBefore(adjust, progress);
    old.remove();
  }
}

function patchElementaryToolbar() {
  const old = document.getElementById("correctElementaryLesson");
  if (!old) return;
  const adjust = createAdjustButton(() => document.getElementById("elementaryLessonSubject")?.value || "");
  adjust.id = "adjustElementaryHomework";
  const progress = document.createElement("button");
  progress.type = "button";
  progress.id = "openElementaryProgress";
  progress.className = "progressOpenBtn";
  progress.textContent = "進行表を開く";
  progress.onclick = () => {
    const subject = document.getElementById("elementaryLessonSubject")?.value || "";
    if (!subject) return notify("科目を選択してください。", true);
    const target = [...document.querySelectorAll(".elementaryOpenProgress")].find((button) => button.dataset.subject === subject);
    if (!target) return notify("この科目の進行表を開けません。", true);
    target.click();
  };
  old.replaceWith(adjust, progress);
}

function patch() {
  if (window.__FORESTA_ACTIVE_ROLE__ !== "teacher") return;
  patchMiddleToolbar();
  patchElementaryToolbar();
}

injectStyles();
patch();
let queued = false;
let patchTimer = 0;
new MutationObserver(() => {
  if (queued) return;
  queued = true;
  clearTimeout(patchTimer);
  patchTimer = setTimeout(() => {
    queued = false;
    patch();
  }, 50);
}).observe(document.getElementById("content") || document.documentElement, { childList: true, subtree: true });
