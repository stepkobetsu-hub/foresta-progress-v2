(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value = "") => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const fmtDate = value => value ? new Intl.DateTimeFormat("ja-JP", {month:"numeric", day:"numeric", weekday:"short"}).format(new Date(value)) : "未定";
  const today = () => new Date().toISOString().slice(0, 10);
  const daysUntil = value => value ? Math.ceil((new Date(`${value}T23:59:59`) - new Date()) / 86400000) : null;
  const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

  const config = window.FORESTA_CONFIG || {};
  const demoUnits = [
    {id:"M1-01",label:"正負の数",difficulty:""},{id:"M1-02",label:"加法と減法",difficulty:""},{id:"M1-03",label:"乗法と除法",difficulty:"!"},
    {id:"M1-04",label:"文字式",difficulty:""},{id:"M1-05",label:"方程式",difficulty:"!!"},{id:"M1-06",label:"比例と反比例",difficulty:"!"},
    {id:"E1-01",label:"be動詞",difficulty:""},{id:"E1-02",label:"一般動詞",difficulty:""},{id:"E1-03",label:"疑問詞",difficulty:"!"}
  ];
  const demoStudents = [
    {id:"S001",name:"山田 花子",kana:"やまだはなこ",classroom:"成瀬",grade:"中1",school:"南中学校",subjects:["英語","数学"],notice:"計算途中を省略しやすいので、式を1行ずつ確認してください。",levels:{英語:2,数学:2}},
    {id:"S002",name:"佐藤 悠斗",kana:"さとうゆうと",classroom:"青葉台",grade:"中2",school:"青葉中学校",subjects:["英語","数学","理科"],notice:"英単語は音読してから書くと定着しやすいです。",levels:{英語:1,数学:3}},
    {id:"S003",name:"鈴木 美咲",kana:"すずきみさき",classroom:"成瀬",grade:"中3",school:"成瀬台中学校",subjects:["英語","数学","国語","理科","社会"],notice:"志望校に向けて時間配分を意識。",levels:{英語:3,数学:3}}
  ];
  const demoHomework = [
    {id:"HW1",unitId:"M1-03",unit:"乗法と除法",text:"TRYの赤×直し",studentCheckedAt:null,teacherCheckedAt:null},
    {id:"HW2",unitId:"M1-03",unit:"乗法と除法",text:"Exercise",studentCheckedAt:today(),teacherCheckedAt:null},
    {id:"HW3",unitId:"M1-02",unit:"加法と減法",text:"宿題の赤×直し",studentCheckedAt:today(),teacherCheckedAt:today()}
  ];

  const state = {
    loginRole:"student", adminIntent:false, token:null, role:null, user:null, screen:"home",
    students:demoStudents, selectedStudents:[], activeStudentId:null, subject:"数学", units:demoUnits,
    homework:demoHomework, targets:{英語:80,数学:85,国語:"",理科:"",社会:""},
    test:{name:"2学期期末テスト",date:"2026-09-10"}, scores:[{name:"1学期期末",date:"2026-06-25",英語:78,数学:82}],
    lesson:{schoolUnitId:"M1-03",ctUnitId:"M1-02",ctResult:"",learnedUnitIds:[],comment:"",date:today()},
    demo:false
  };

  class Api {
    constructor(url) { this.url = (url || "").trim(); }
    get configured() { return /^https:\/\/script\.google\.com\//.test(this.url); }
    async call(action, payload = {}) {
      if (!this.configured) throw new Error("API_NOT_CONFIGURED");
      const response = await fetch(this.url, {
        method:"POST", redirect:"follow", headers:{"Content-Type":"text/plain;charset=utf-8"},
        body:JSON.stringify({action, requestId:uuid(), token:state.token, ...payload})
      });
      if (!response.ok) throw new Error(`通信エラー (${response.status})`);
      const result = await response.json();
      if (!result.ok) throw new Error(result.message || "処理に失敗しました");
      return result.data;
    }
  }
  const api = new Api(config.apiUrl);

  function toast(message) {
    const el = $("#toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2400);
  }
  function setBusy(button, busy, label = "保存中") {
    if (!button) return; if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = busy; button.textContent = busy ? label : button.dataset.label;
  }
  function normalizeSearch(value) {
    return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s　]/g, "")
      .replace(/[ァ-ン]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  }
  function currentStudent() { return state.students.find(s => s.id === state.activeStudentId) || state.students[0]; }
  function openDialog(title, html) { $("#dialogTitle").textContent = title; $("#dialogBody").innerHTML = html; $("#detailDialog").showModal(); }

  function init() {
    $$(".role-tab").forEach(button => button.addEventListener("click", () => setLoginRole(button.dataset.role)));
    $("#loginForm").addEventListener("submit", login);
    $("#demoButton").addEventListener("click", demoLogin);
    $("#adminButton").addEventListener("click", () => { setLoginRole("teacher"); state.adminIntent = true; $("#loginIdLabel").textContent = "講師ID（管理者認証）"; $("#loginId").focus(); });
    $("#dialogClose").addEventListener("click", () => $("#detailDialog").close());
    $("#homeButton").addEventListener("click", () => state.role ? navigate("home") : null);
    const savedId = localStorage.getItem("foresta:lastId"); if (savedId) $("#loginId").value = savedId;
    if (!api.configured) $("#loginStatus").textContent = "公開API接続前は画面デモを利用できます。";
  }
  function setLoginRole(role) {
    state.loginRole = role; state.adminIntent = false;
    $$(".role-tab").forEach(b => { const active = b.dataset.role === role; b.classList.toggle("active", active); b.setAttribute("aria-selected", active); });
    $("#loginIdLabel").textContent = role === "student" ? "生徒ID" : "講師ID";
    $("#loginId").value = ""; $("#loginPassword").value = "";
  }
  async function login(event) {
    event.preventDefault(); const button = $("#loginButton"); const id = $("#loginId").value.trim(); const password = $("#loginPassword").value;
    const device = $("input[name=device]:checked").value; setBusy(button, true, "確認中"); $("#loginStatus").textContent = "";
    try {
      const data = await api.call("login", {role:state.adminIntent ? "admin" : state.loginRole, id, password, device});
      state.token = data.token; state.role = data.role; state.user = data.user; state.students = data.students || state.students;
      if (device === "personal") localStorage.setItem("foresta:lastId", id); else { localStorage.removeItem("foresta:lastId"); $("#loginForm").reset(); }
      await loadBootstrap(); enterWorkspace();
    } catch (error) { $("#loginStatus").textContent = error.message === "API_NOT_CONFIGURED" ? "APIが未接続です。画面デモを利用してください。" : error.message; }
    finally { setBusy(button, false); }
  }
  function demoLogin() {
    if (!config.demoEnabled) return; state.demo = true; state.role = state.adminIntent ? "admin" : state.loginRole;
    state.user = state.role === "student" ? demoStudents[0] : {id:"T001",name:"田中先生",classroom:"成瀬",authority:state.role === "admin" ? 1 : 0};
    state.activeStudentId = state.role === "student" ? state.user.id : demoStudents[0].id; enterWorkspace(); toast("画面デモを開始しました");
  }
  async function loadBootstrap() {
    try {
      const data = await api.call("bootstrap", {}); Object.assign(state, data);
      if (state.role === "student") state.activeStudentId = state.user.id;
    } catch (error) { toast(error.message); }
  }
  function enterWorkspace() {
    $("#loginView").classList.add("hidden"); $("#workspace").classList.remove("hidden"); $("#userBadge").classList.remove("hidden");
    $("#userBadge").textContent = `${state.user.name} ${state.demo ? "（デモ）" : ""}`; renderNav(); navigate("home");
  }
  function logout() {
    state.token = null; state.role = null; state.user = null; state.demo = false; state.adminIntent = false;
    $("#workspace").classList.add("hidden"); $("#loginView").classList.remove("hidden"); $("#userBadge").classList.add("hidden"); setLoginRole("student");
  }
  function renderNav() {
    const items = state.role === "student" ? [["home","ホーム"],["homework","宿題"],["progress","進行表"],["targets","目標点"]]
      : state.role === "teacher" ? [["home","生徒選択"],["lesson","本日の授業"],["homework","宿題確認"],["progress","進行表"]]
      : [["home","速報一覧"],["ranges","テスト範囲"],["progress","進行表"],["settings","設定"]];
    $("#mainNav").innerHTML = items.map(([id,label]) => `<button class="nav-button" data-screen="${id}">${label}</button>`).join("") + `<button class="nav-button desktop-only" data-screen="logout">ログアウト</button>`;
    $$(".nav-button").forEach(b => b.addEventListener("click", () => b.dataset.screen === "logout" ? logout() : navigate(b.dataset.screen)));
  }
  function navigate(screen) {
    state.screen = screen; $$(".nav-button").forEach(b => b.classList.toggle("active", b.dataset.screen === screen));
    const renderers = state.role === "student" ? studentScreens : state.role === "teacher" ? teacherScreens : adminScreens;
    (renderers[screen] || renderers.home)(); window.scrollTo({top:0,behavior:"smooth"});
  }

  const studentScreens = {
    home() {
      const d = daysUntil(state.test.date); $("#screen").innerHTML = `<div class="page-head"><div><h1>こんにちは、${esc(state.user.name)}さん</h1><p>今日も一歩ずつ進めよう。</p></div></div>
        <div class="grid two"><article class="card deadline"><div class="countdown"><strong>${d ?? "–"}</strong><span>日</span></div><div><h2>${esc(state.test.name)}</h2><p class="muted">${fmtDate(state.test.date)}</p></div></article>
        <article class="card"><h2>目標点</h2><div class="chip-row">${["英語","数学","国語","理科","社会"].map(s => `<span class="chip">${s} ${state.targets[s] || "–"}点</span>`).join("")}</div></article></div>
        <div class="grid two" style="margin-top:16px"><article class="card"><div class="section-head"><h2>次回までの宿題</h2><button class="text-button" data-go="homework">すべて見る</button></div><p class="notice">宿題は2日以内に終わらせよう！</p>${renderHomeworkList(state.homework.slice(0,3), false)}</article>
        <article class="card"><h2>学習進度</h2><p class="muted">学校進度より <strong>1単元先</strong></p><div class="progress-track"><div class="progress-fill" style="width:64%"></div></div><p class="small muted">前回：${fmtDate(today())}「加法と減法」</p></article></div>
        <article class="card" style="margin-top:16px"><div class="section-head"><h2>定期テスト履歴</h2><a class="text-button" href="${esc(config.scoreCorrectionUrl)}" target="_blank" rel="noopener">訂正は講師へ</a></div>${renderScores()}</article>`;
      $("[data-go=homework]")?.addEventListener("click", () => navigate("homework")); bindHomeworkChecks();
    },
    homework() { $("#screen").innerHTML = pageHead("次回までの宿題","生徒チェック後、講師の確認で正式完了になります。") + `<article class="card"><p class="notice">宿題は2日以内に終わらせよう！</p>${renderHomeworkList(state.homework,false)}<p id="cheer" class="celebrate"></p></article>`; bindHomeworkChecks(); },
    progress() { $("#screen").innerHTML = pageHead("進行表","学校進度・授業完了日を確認できます。") + `<article class="card"><div class="chip-row">${["英語","数学"].map(s=>`<button class="subject-button ${state.subject===s?"active":""}" data-subject="${s}">${s}</button>`).join("")}</div><div class="unit-list" style="margin-top:14px">${renderUnits(false)}</div></article>`; bindSubjects(); },
    targets() { $("#screen").innerHTML = pageHead("目標点数","次回テストで目指す点数を入力しよう。") + `<form id="targetForm" class="card form-grid">${["英語","数学","国語","理科","社会"].map(s=>`<label>${s}<input name="${s}" type="number" min="0" max="100" value="${esc(state.targets[s])}"></label>`).join("")}<div class="full button-row right"><button class="primary-button" type="submit">目標点を保存</button></div></form>`; $("#targetForm").addEventListener("submit", saveTargets); }
  };

  const teacherScreens = {
    home() { renderStudentPicker(); },
    lesson() { renderLesson(); },
    homework() { $("#screen").innerHTML = pageHead("前回宿題の確認",`${currentStudent().name}さん — 生徒チェックと内容を確認してください。`) + `<article class="card">${renderHomeworkList(state.homework,true)}</article>`; bindHomeworkChecks(true); },
    progress() { renderTeacherProgress(); }
  };

  const adminScreens = {
    home() { renderAdminSummary(); },
    ranges() { renderRanges(); },
    progress() { $("#screen").innerHTML = pageHead("進行表マスター","現在登録されている単元を確認します。") + `<article class="card">${renderUnits(false)}</article>`; },
    settings() { $("#screen").innerHTML = pageHead("設定","マスター更新と管理者認証を行います。") + `<div class="grid two"><article class="card"><h2>受講科目</h2><p class="muted">時間割マスタから生徒の受講科目を更新します。</p><button id="refreshSubjects" class="primary-button">受講科目を更新</button></article><article class="card"><h2>管理者保護</h2><p class="muted">設定変更時は講師ID・パスワードを再確認します。権限1以上が必要です。</p><button id="reauth" class="secondary-button">再認証</button></article></div>`; $("#refreshSubjects").addEventListener("click", refreshSubjects); $("#reauth").addEventListener("click", reauth); }
  };

  function pageHead(title, copy) { return `<div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(copy)}</p></div></div>`; }
  function renderScores() { return state.scores.length ? state.scores.map(score => `<div class="summary-row"><strong>${esc(score.name)}</strong><span>${fmtDate(score.date)}</span><span>英 ${score.英語 ?? "–"}</span><span>数 ${score.数学 ?? "–"}</span></div>`).join("") : `<p class="muted">成績履歴を読み込んでいます…</p>`; }
  function renderHomeworkList(items, teacher) {
    return `<div class="homework-list">${items.map(item => `<div class="homework-item ${item.teacherCheckedAt?"verified":""}" data-hw="${esc(item.id)}"><input class="hw-check" type="checkbox" ${(teacher ? item.teacherCheckedAt : item.studentCheckedAt)?"checked":""} ${item.teacherCheckedAt&&!teacher?"disabled":""}><div><strong>${esc(item.unit)}</strong><br><span class="small">${esc(item.text)}</span></div><span class="status-pill ${item.teacherCheckedAt?"ok":item.studentCheckedAt?"":"alert"}">${item.teacherCheckedAt?"確認済":item.studentCheckedAt?"生徒完了":"未完了"}</span></div>`).join("")}</div>`;
  }
  function bindHomeworkChecks(teacher = false) {
    $$(".hw-check").forEach(input => input.addEventListener("change", async event => {
      const row = event.target.closest("[data-hw]"); const item = state.homework.find(h => h.id === row.dataset.hw); const checked = event.target.checked;
      if (teacher) item.teacherCheckedAt = checked ? new Date().toISOString() : null; else item.studentCheckedAt = checked ? new Date().toISOString() : null;
      try { if (!state.demo) await api.call("toggleHomework", {homeworkId:item.id, checked, checkType:teacher?"teacher":"student"}); toast(teacher ? "講師確認を保存しました" : checked ? "素晴らしい！チェックを保存しました" : "チェックを外しました"); }
      catch(error){ event.target.checked = !checked; toast(error.message); }
      navigate(state.screen);
    }));
  }
  function renderUnits(selectable) {
    const level = currentStudent()?.levels?.[state.subject] || 3;
    return state.units.filter(u => state.subject === "英語" ? u.id.startsWith("E") : u.id.startsWith("M")).map((u,i) => {
      const skippable = (level===1 && ["!","!!"].includes(u.difficulty)) || (level===2 && u.difficulty==="!!");
      return `<label class="unit-row ${i===1?"previous":i===2?"current school":""}">${selectable?`<input class="unit-check" type="checkbox" value="${u.id}" ${state.lesson.learnedUnitIds.includes(u.id)?"checked":""}>`:""}<span><strong>${esc(u.label)}</strong> <span class="small muted">${esc(u.difficulty)}</span></span><span class="status-pill ${skippable?"":"ok"}">${skippable?"省略可":i<2?"完了":"未完了"}</span></label>`;
    }).join("") || `<p class="notice">この科目の進行表が未登録です</p>`;
  }
  function bindSubjects() { $$("[data-subject]").forEach(b => b.addEventListener("click", () => { state.subject=b.dataset.subject; navigate(state.screen); })); }
  async function saveTargets(event) {
    event.preventDefault(); const button=$("button[type=submit]",event.target); setBusy(button,true);
    const values=Object.fromEntries(new FormData(event.target)); Object.keys(values).forEach(k=>values[k]=values[k]===""?"":Number(values[k]));
    try{if(!state.demo)await api.call("saveTargets",{studentId:state.user.id,targets:values});state.targets=values;toast("目標点を保存しました");}catch(e){toast(e.message);}finally{setBusy(button,false);}
  }

  function renderStudentPicker() {
    $("#screen").innerHTML = pageHead("担当する生徒を選択","教室・学年・検索で最大2名を選べます。") + `<div class="grid two"><article class="card"><div class="chip-row"><button class="filter-button active" data-room="">全教室</button>${[...new Set(state.students.map(s=>s.classroom))].map(v=>`<button class="filter-button" data-room="${esc(v)}">${esc(v)}</button>`).join("")}</div><div class="chip-row" style="margin-top:8px"><button class="filter-button active" data-grade="">全学年</button>${[...new Set(state.students.map(s=>s.grade))].map(v=>`<button class="filter-button" data-grade="${esc(v)}">${esc(v)}</button>`).join("")}</div><div class="search-box" style="margin-top:12px"><input id="studentSearch" placeholder="ID・氏名・ふりがな・ローマ字"></div><div id="studentResults" class="student-results"></div></article><article class="card"><h2>本日の担当</h2><p class="muted">担当講師：${esc(state.user.name)}</p><div id="selectedStudents"></div><button id="confirmStudents" class="primary-button" ${state.selectedStudents.length?"":"disabled"}>決定して授業へ</button></article></div>`;
    let room="",grade="",query=""; const update=()=>{const n=normalizeSearch(query);const filtered=state.students.filter(s=>(!room||s.classroom===room)&&(!grade||s.grade===grade)&&(!n||normalizeSearch(`${s.id}${s.name}${s.kana||""}${s.romaji||""}`).includes(n)));$("#studentResults").innerHTML=filtered.map(s=>`<button class="student-card ${state.selectedStudents.includes(s.id)?"selected":""}" data-student="${s.id}"><strong>${esc(s.name)}</strong><br><span class="small muted">${esc(s.id)}・${esc(s.classroom)}・${esc(s.grade)}</span></button>`).join("");$("#selectedStudents").innerHTML=state.selectedStudents.map(id=>{const s=state.students.find(x=>x.id===id);return `<p><strong>${esc(s.name)}</strong> <span class="small muted">${esc(s.classroom)} ${esc(s.grade)}</span></p>`}).join("")||`<p class="muted">未選択</p>`;$("#confirmStudents").disabled=!state.selectedStudents.length;$$('[data-student]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.student;if(state.selectedStudents.includes(id))state.selectedStudents=state.selectedStudents.filter(x=>x!==id);else if(state.selectedStudents.length<2)state.selectedStudents.push(id);else return toast("選択できる生徒は2名までです");update();}));};
    $$('[data-room]').forEach(b=>b.addEventListener('click',()=>{room=b.dataset.room;$$('[data-room]').forEach(x=>x.classList.toggle('active',x===b));update();}));$$('[data-grade]').forEach(b=>b.addEventListener('click',()=>{grade=b.dataset.grade;$$('[data-grade]').forEach(x=>x.classList.toggle('active',x===b));update();}));$("#studentSearch").addEventListener("input",e=>{query=e.target.value;update();});$("#confirmStudents").addEventListener("click",()=>{state.activeStudentId=state.selectedStudents[0];navigate("lesson");});update();
  }
  function studentTabs() { return `<div class="student-tabs">${state.selectedStudents.map(id=>{const s=state.students.find(x=>x.id===id);return `<button class="student-tab ${state.activeStudentId===id?"active":""}" data-active-student="${id}">${esc(s.name)}</button>`}).join("")}</div>`; }
  function renderLesson() {
    const s=currentStudent(); $("#screen").innerHTML = pageHead("本日の授業",`${s.name}さんの授業記録`) + studentTabs() + `<div class="grid two"><article class="card"><div class="section-head"><h2>生徒情報</h2><button id="noticeDetail" class="text-button">注意事項</button></div><p><strong>${esc(s.school)}</strong>・${esc(s.grade)}・${esc(s.classroom)}</p><p class="notice">${esc(s.notice.slice(0,32))}${s.notice.length>32?"…":""}</p><div class="chip-row">${s.subjects.map(x=>`<span class="chip">${esc(x)}</span>`).join("")}</div><p class="small muted">前回授業：8/12　前回単元：加法と減法</p></article><article class="card"><h2>授業科目</h2><div class="chip-row">${["英語","数学","国語","理科","社会"].map(x=>`<button class="subject-button ${state.subject===x?"active":""}" data-subject="${x}">${x}</button>`).join("")}</div><div class="alert-box" style="margin-top:14px">学校進度と同じです。次の単元まで進めましょう。</div></article></div><article class="card" style="margin-top:16px"><div class="section-head"><h2>授業記録</h2><span class="small muted">複数・飛び飛び選択可</span></div><div class="form-grid"><label>授業日<input id="lessonDate" type="date" value="${state.lesson.date}"></label><label>学校進度<select id="schoolUnit">${state.units.map(u=>`<option value="${u.id}" ${u.id===state.lesson.schoolUnitId?"selected":""}>${esc(u.label)}</option>`).join("")}</select></label></div><h3 style="margin-top:18px">クリアテスト（前回単元から1つ）</h3><div class="form-grid"><label>対象単元<select id="ctUnit">${state.units.slice(0,3).map(u=>`<option value="${u.id}">${esc(u.label)}</option>`).join("")}</select></label><div><span class="small"><strong>結果</strong></span><div class="button-row">${["◎","〇","×"].map(v=>`<button class="secondary-button ct-result ${state.lesson.ctResult===v?"active":""}" data-ct="${v}">${v}</button>`).join("")}</div></div></div><h3 style="margin-top:18px">今回進んだ単元</h3><div class="unit-list">${renderUnits(true)}</div><h3 style="margin-top:18px">次回宿題（自動作成）</h3><div id="generatedHomework">${renderGeneratedHomework()}</div><label class="full" style="display:grid;gap:6px;margin-top:15px"><strong>講師コメント</strong><textarea id="lessonComment" rows="4" placeholder="授業の様子、次回の注意点">${esc(state.lesson.comment)}</textarea></label><div class="button-row right" style="margin-top:14px"><button id="saveLesson" class="primary-button">授業を保存</button></div></article>`;
    bindStudentTabs(); bindSubjects(); $("#noticeDetail").addEventListener("click",()=>openDialog("指導上の注意事項",`<p>${esc(s.notice)}</p>`));$$('.ct-result').forEach(b=>b.addEventListener('click',()=>{state.lesson.ctResult=b.dataset.ct;$$('.ct-result').forEach(x=>x.classList.toggle('active',x===b));if(b.dataset.ct==='×')toast('CT不合格：通知候補に追加します（メールは未送信）');}));$$('.unit-check').forEach(c=>c.addEventListener('change',()=>{state.lesson.learnedUnitIds=$$('.unit-check:checked').map(x=>x.value);$('#generatedHomework').innerHTML=renderGeneratedHomework();bindOtherHomework();}));bindOtherHomework();$("#saveLesson").addEventListener("click",saveLesson);
  }
  function bindStudentTabs() { $$('[data-active-student]').forEach(b=>b.addEventListener('click',()=>{state.activeStudentId=b.dataset.activeStudent;navigate(state.screen);})); }
  function renderGeneratedHomework() {
    const templates=state.subject==='英語'?["Key Words「☆日→英」暗記","Exercise「暗記マーク」暗記","TRY赤×直し","Exercise","宿題の赤×直し"]:["TRYの赤×直し","Exercise","宿題の赤×直し"];
    if(!state.lesson.learnedUnitIds.length)return `<p class="muted">進んだ単元を選ぶと自動作成されます。</p>`;
    return state.lesson.learnedUnitIds.map(id=>{const u=state.units.find(x=>x.id===id);return `<div class="card" style="box-shadow:none;margin-top:8px"><strong>${esc(u?.label||id)}</strong>${templates.map((t,i)=>`<label style="display:flex;gap:7px;margin-top:8px"><input class="next-hw" type="checkbox" checked data-unit="${id}" value="${esc(t)}">${esc(t)}</label>`).join("")}<button class="text-button other-toggle" data-unit="${id}">＋ その他</button><input class="other-input hidden" data-other="${id}" placeholder="その他の宿題を入力"></div>`}).join("");
  }
  function bindOtherHomework() { $$('.other-toggle').forEach(b=>b.addEventListener('click',()=>{$(`[data-other="${b.dataset.unit}"]`).classList.toggle('hidden');})); }
  async function saveLesson() {
    const button=$("#saveLesson");setBusy(button,true);state.lesson={...state.lesson,date:$("#lessonDate").value,schoolUnitId:$("#schoolUnit").value,ctUnitId:$("#ctUnit").value,comment:$("#lessonComment").value,learnedUnitIds:$$('.unit-check:checked').map(x=>x.value)};
    const homework=$$('.next-hw:checked').map(x=>({unitId:x.dataset.unit,text:x.value}));$$('.other-input').forEach(x=>{if(x.value.trim())homework.push({unitId:x.dataset.other,text:x.value.trim(),other:true});});
    try{if(!state.demo)await api.call("saveLesson",{studentId:currentStudent().id,subject:state.subject,lesson:state.lesson,homework});toast("授業記録を保存しました");}catch(e){toast(e.message);}finally{setBusy(button,false);}
  }
  function renderTeacherProgress() { const s=currentStudent();$("#screen").innerHTML=pageHead("進行表",`${s.name}さん — 前回・今回・学校進度を色分け`) + studentTabs()+`<article class="card"><div class="chip-row">${["英語","数学","国語","理科","社会"].map(x=>`<button class="subject-button ${state.subject===x?"active":""}" data-subject="${x}">${x}</button>`).join("")}</div><div class="unit-list" style="margin-top:14px">${renderUnits(false)}</div></article>`;bindStudentTabs();bindSubjects(); }

  function renderAdminSummary() {
    const rows=state.students.map((s,i)=>({s,remaining:4+i,today:i+1,ct:["〇","×","◎"][i%3],hw:`${2+i}/${4+i}`,pace:["先行","同じ","遅れ"][i%3],comment:i===1}));
    $("#screen").innerHTML=pageHead("管理者速報一覧","授業・宿題・学校進度の今日の状況です。")+`<div class="grid three"><article class="card"><span class="muted small">要フォロー</span><div class="metric">2名</div></article><article class="card"><span class="muted small">本日の学習単元</span><div class="metric">6</div></article><article class="card"><span class="muted small">宿題確認率</span><div class="metric">71%</div></article></div><article class="card" style="margin-top:16px;overflow:auto"><div class="summary-row desktop-only"><strong>生徒</strong><strong>未完了</strong><strong>本日</strong><strong>CT</strong><strong>宿題</strong><strong>進度</strong></div>${rows.map(r=>`<div class="summary-row"><div><strong>${esc(r.s.name)}</strong>${r.comment?` <button class="comment-dot" data-comment="${r.s.id}">●</button>`:""}<br><span class="small muted">${esc(r.s.classroom)}・${esc(r.s.grade)}・${esc(r.s.school)}</span></div><span>未完了 ${r.remaining}</span><span>本日 ${r.today}</span><span class="status-pill ${r.ct==='×'?'alert':'ok'}">CT ${r.ct}</span><span>${r.hw}</span><span class="status-pill ${r.pace==='遅れ'?'alert':r.pace==='同じ'?'':'ok'}">${r.pace}</span></div>`).join("")}</article>`;
    $$('[data-comment]').forEach(b=>b.addEventListener('click',()=>openDialog("講師コメント",`<p class="small muted">2026/8/15・田中先生</p><p>計算の途中式を丁寧に書けました。次回は文章題を重点的に確認します。</p>`)));
  }
  function renderRanges() {
    const d=daysUntil(state.test.date);$("#screen").innerHTML=pageHead("学校別テスト範囲","単元ごとに予想・決定版を登録できます。")+`<article class="card"><div class="section-head"><div><h2>南中学校・中1・数学</h2><p class="muted">${esc(state.test.name)}　${fmtDate(state.test.date)}　あと${d}日</p></div><button id="saveRange" class="primary-button">範囲を保存</button></div><div class="chip-row"><button class="chip active" data-range-mode="predicted">予想範囲</button><button class="chip" data-range-mode="final">決定版</button></div><div id="rangeGrid" class="range-grid" style="margin-top:14px">${state.units.filter(u=>u.id.startsWith('M')).map((u,i)=>`<label class="range-unit ${i<4?'predicted':''} ${i<3?'final':''}"><input type="checkbox" value="${u.id}" ${i<4?'checked':''}>${esc(u.label)}</label>`).join("")}</div></article>`;let mode='predicted';$$('[data-range-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.rangeMode;$$('[data-range-mode]').forEach(x=>x.classList.toggle('active',x===b));}));$("#saveRange").addEventListener('click',async()=>{const button=$("#saveRange");setBusy(button,true);try{if(!state.demo)await api.call('saveSchoolRange',{school:'南中学校',grade:'中1',subject:'数学',rangeType:mode,unitIds:$$('#rangeGrid input:checked').map(x=>x.value),test:state.test});toast('テスト範囲を保存しました');}catch(e){toast(e.message);}finally{setBusy(button,false);}});
  }
  async function refreshSubjects(){const b=$("#refreshSubjects");setBusy(b,true,'更新中');try{if(!state.demo)await api.call('refreshSubjects',{});toast('受講科目を更新しました');}catch(e){toast(e.message);}finally{setBusy(b,false);}}
  function reauth(){openDialog('管理者の再認証',`<form id="reauthForm" class="login-form"><label>講師ID<input name="id" required></label><label>パスワード<input name="password" type="password" required></label><button class="primary-button">権限を確認</button></form>`);$("#reauthForm").addEventListener('submit',async e=>{e.preventDefault();const b=$('button',e.target);setBusy(b,true,'確認中');try{if(!state.demo)await api.call('reauthAdmin',Object.fromEntries(new FormData(e.target)));toast('管理者権限を確認しました');$("#detailDialog").close();}catch(err){toast(err.message);}finally{setBusy(b,false);}});}

  init();
})();
