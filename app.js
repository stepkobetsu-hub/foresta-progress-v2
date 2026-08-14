(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = value => value ? String(value).replace(/-/g, '/') : '未登録';
  const app = $('#app');
  const entry = $('#entry');
  const workspace = $('#workspace');
  const loading = $('#loading');
  const toastEl = $('#toast');
  const cfg = window.FORESTA_CONFIG || {};
  const SUBJECTS = ['英語', '数学', '国語', '理科', '社会'];
  const state = { loginType: 'student', token: '', role: '', user: null, device: '', tabs: [], activeStudentId: '', detail: null, lesson: null, adminAll: false, adminRows: [], adminSettings: null, adminVerified: false, adminIntent: false };

  function busy(on, message = '読み込んでいます…') {
    $('p', loading).textContent = message;
    loading.classList.toggle('hidden', !on);
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  async function api(action, payload = {}, silent = false) {
    if (!cfg.apiUrl || cfg.apiUrl.includes('__GAS_')) throw new Error('APIの公開設定が完了していません。');
    if (!silent) busy(true);
    try {
      const response = await fetch(cfg.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload })
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error || '処理に失敗しました。');
      return body.data;
    } finally {
      if (!silent) busy(false);
    }
  }

  function saveSession() {
    const data = JSON.stringify({ token: state.token, role: state.role, user: state.user, device: state.device });
    const store = state.device === 'personal' ? localStorage : sessionStorage;
    store.setItem('forestaSession', data);
  }

  function clearSession(all = false) {
    sessionStorage.removeItem('forestaSession');
    if (all || state.device === 'personal') localStorage.removeItem('forestaSession');
  }

  function restoreSession() {
    for (const [store, device] of [[sessionStorage, 'shared'], [localStorage, 'personal']]) {
      try {
        const data = JSON.parse(store.getItem('forestaSession') || 'null');
        if (data?.token) return { ...data, device };
      } catch (_) { /* ignore damaged local state */ }
    }
    return null;
  }

  function head(title, subtitle, extra = '') {
    return `<header class="workspace-head"><div class="workspace-title"><span class="eyebrow">${esc(state.role === 'student' ? '生徒用' : state.role === 'admin' ? '管理者' : '講師用')}</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="head-actions">${extra}<button class="ghost" data-action="logout">ログアウト</button></div></header>`;
  }

  function empty(message) { return `<div class="empty">${esc(message)}</div>`; }
  function status(text, kind = 'muted') { return `<span class="status ${kind}">${esc(text)}</span>`; }
  function metric(label, value, note = '') { return `<div class="metric"><small>${esc(label)}</small><b>${esc(value)}</b>${note ? `<small>${esc(note)}</small>` : ''}</div>`; }

  function testCard(test) {
    if (!test) return `<section class="panel"><h2>次回テスト</h2>${empty('次回テスト未登録')}</section>`;
    const kind = test.daysLeft <= 14 ? 'warn' : 'ok';
    return `<section class="panel"><h2>次回テスト</h2><div class="grid three">${metric(test.name, `${fmt(test.start)}〜${fmt(test.end)}`)}${metric('テストまで', `あと${test.daysLeft}日`)}<div class="metric"><small>準備状況</small><b>${status(test.daysLeft <= 14 ? '直前期' : '準備期間', kind)}</b></div></div></section>`;
  }

  function progressCards(progress = [], studentView = false) {
    if (!progress.length) return empty('進行情報はまだありません。');
    return `<div class="grid two">${progress.map(p => {
      const cmpKind = p.comparison === '遅れ' ? 'danger' : p.comparison === '先行' ? 'ok' : p.comparison === '同じ' ? 'warn' : 'muted';
      const pace = p.remaining == null ? '未設定' : p.emergency ? '緊急' : `${p.remaining}単元 / ${p.lessonsRemaining}回`;
      const visibleUnits = (p.units || []).filter(u => u.learnedDates?.length || u.schoolCurrent || u.predictedInRange || u.confirmedInRange || u.ct);
      return `<section class="panel"><div class="toolbar"><h2>${esc(p.subject)}</h2>${status(p.comparison, cmpKind)}</div><div class="grid three">${metric('フォレスタ', p.forestaUnit?.name || '未開始')}${metric('学校', p.schoolUnit?.name || '未登録')}${metric('残り / 授業回', pace, p.requiredPerLesson == null ? '' : `1回 ${p.requiredPerLesson}単元ペース`)}</div><h3 style="margin-top:18px">進行表</h3>${visibleUnits.length ? `<div class="unit-list">${visibleUnits.map(unitRowHtml).join('')}</div>` : empty(studentView ? '学習済み・学校進度・テスト範囲はまだ登録されていません。' : '表示対象の単元はありません。')}</section>`;
    }).join('')}</div>`;
  }

  function unitRowHtml(u, controls = false) {
    const classes = ['unit-row', u.previous ? 'previous' : '', u.schoolCurrent ? 'school' : '', u.rangeMode === 'confirmed' && !u.confirmedInRange ? 'out-confirmed' : u.rangeMode === 'predicted' && !u.predictedInRange ? 'out-predicted' : ''].filter(Boolean).join(' ');
    const chips = [u.difficulty && `<span class="chip${u.omittable ? ' optional' : ''}">${esc(u.difficulty)}${u.omittable ? ' 省略可' : ''}</span>`, u.learnedDates?.length && `<span class="chip">学習 ${esc(u.learnedDates.at(-1))}</span>`, u.schoolCurrent && '<span class="chip">学校</span>', (u.confirmedInRange || u.predictedInRange) && `<span class="chip">${u.confirmedInRange ? '決定範囲' : '予想範囲'}</span>`, u.ct && `<span class="chip${u.ct === '×' ? ' ct-x' : ''}">CT ${esc(u.ct)}</span>`].filter(Boolean).join('');
    return `<label class="${classes}" data-unit-id="${esc(u.id)}">${controls ? `<input type="checkbox" value="${esc(u.id)}">` : '<span></span>'}<span class="unit-number">${esc(u.number)}</span><span>${esc(u.name)}</span><span class="unit-meta">${chips}</span></label>`;
  }

  function homeworkHtml(items = [], mode = 'student') {
    if (!items.length) return empty('宿題はありません。');
    const groups = Object.groupBy ? Object.groupBy(items, h => h.unitId || 'その他') : items.reduce((a, h) => ((a[h.unitId || 'その他'] ||= []).push(h), a), {});
    return Object.entries(groups).map(([unit, rows]) => `<div class="homework-group"><h3>${esc(unit === 'その他' ? 'その他' : rows[0].subject + '・単元別')}</h3><div class="homework-list">${rows.map(h => {
      const overdue = h.due && new Date(`${h.due}T23:59:59`) < new Date() && !h.teacherChecked;
      const label = h.teacherChecked ? '完了' : h.studentChecked ? '確認待ち' : overdue ? '期限超過' : '未完了';
      const kind = h.teacherChecked ? 'muted' : h.studentChecked ? 'warn' : overdue ? 'danger' : 'muted';
      const checked = mode === 'student' ? h.studentChecked : h.teacherChecked;
      return `<label class="homework-card ${h.teacherChecked ? 'complete' : ''} ${overdue ? 'overdue' : ''}"><input type="checkbox" data-homework-id="${esc(h.id)}" data-homework-mode="${esc(mode)}" ${checked ? 'checked' : ''}><span><p>${esc(h.content || h.type)}</p><small>推奨完了日 ${fmt(h.due)}${h.studentCheckedAt ? `・生徒 ${esc(h.studentCheckedAt)}` : ''}${h.teacherCheckedAt ? `・講師 ${esc(h.teacherCheckedAt)}` : ''}</small></span>${status(label, kind)}</label>`;
    }).join('')}</div></div>`).join('');
  }

  function scoresHtml(scores = []) {
    if (!scores.length) return empty('成績履歴はまだありません。');
    return `<div class="table-wrap"><table class="score-table"><thead><tr><th>年度</th><th>回</th><th>国語</th><th>社会</th><th>数学</th><th>理科</th><th>英語</th><th>合計</th><th>順位</th></tr></thead><tbody>${scores.map(s => `<tr><td>${esc(s.year)}</td><td>${esc(s.testNumber)}</td><td>${esc(s.japanese)}</td><td>${esc(s.social)}</td><td>${esc(s.math)}</td><td>${esc(s.science)}</td><td>${esc(s.english)}</td><td>${esc(s.total)}</td><td>${esc(s.rank)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function renderStudent() {
    state.role = 'student';
    const data = await api('studentHome', { token: state.token });
    state.detail = data;
    const t = data.targets || {};
    workspace.innerHTML = head(data.student.name, `${data.student.id}・${data.student.grade}・${data.student.school}`) + testCard(data.test) + `<section class="panel"><h2>目標点</h2>${data.test ? `<form id="targetForm" class="assignment-grid">${[['japanese','国語'],['social','社会'],['math','数学'],['science','理科'],['english','英語']].map(([key,label]) => `<label class="field">${label}<input type="number" min="0" max="100" name="${key}" value="${esc(t[key])}"></label>`).join('')}<button class="primary" type="submit">目標点を保存</button></form>` : empty('次回テスト登録後に入力できます。')}</section><section class="panel"><h2>次回までの宿題</h2><p class="status warn">宿題は2日以内に終わらせよう！</p>${homeworkHtml(data.homework, 'student')}</section><section class="panel"><div class="toolbar"><h2>定期テスト履歴</h2><a class="secondary" href="${esc(data.scoreLink)}" target="_blank" rel="noopener">成績を訂正する</a></div>${scoresHtml(data.scores)}</section><section><h2>フォレスタ進行</h2>${progressCards(data.progress, true)}</section>`;
    showWorkspace();
  }

  function staffSearchScreen() {
    state.role = 'staff';
    workspace.innerHTML = head(state.user.name, `担当教室 ${state.user.classrooms?.join('・') || '未登録'}`, `<button class="secondary" data-action="open-admin">管理者ページ</button>`) + `<section class="panel"><h2>本日の担当生徒を選ぶ</h2><form id="searchForm" class="toolbar"><input name="query" placeholder="生徒名・ふりがな・生徒ID・学校"><select name="classroom"><option value="">全教室</option>${(state.user.classrooms || []).map(x => `<option>${esc(x)}</option>`).join('')}</select><select name="grade"><option value="">全学年</option><option>中1</option><option>中2</option><option>中3</option></select><button class="primary" type="submit">検索</button></form><p class="muted">同時に開ける生徒は最大2人です。</p><div id="studentResults" class="student-results">${empty('条件を入力して検索してください。')}</div></section><div id="studentTabs" class="student-tabs"></div><div id="studentDetail"></div>`;
    showWorkspace();
  }

  async function searchStudents(form) {
    const data = Object.fromEntries(new FormData(form));
    const rows = await api('searchStudents', { token: state.token, ...data });
    $('#studentResults').innerHTML = rows.length ? rows.map(s => `<button class="student-result" data-open-student="${esc(s.id)}"><b>${esc(s.name)} <small>${esc(s.id)}</small></b><small>${esc(s.classroom)}・${esc(s.grade)}・${esc(s.school)}</small><small>${esc((s.subjects || []).join('・') || '受講科目未登録')}</small></button>`).join('') : empty('該当する生徒はいません。');
  }

  async function openStudent(studentId, subject = '') {
    if (!state.tabs.includes(studentId)) {
      if (state.tabs.length >= 2) return toast('同時に担当できる生徒は2人までです。');
      state.tabs.push(studentId);
    }
    state.activeStudentId = studentId;
    state.lesson = null;
    state.detail = await api('studentDetail', { token: state.token, studentId, subject });
    renderStaffDetail();
  }

  function renderStaffDetail() {
    const d = state.detail;
    $('#studentTabs').innerHTML = state.tabs.map(id => `<button class="student-tab ${id === state.activeStudentId ? 'active' : ''}" data-switch-student="${esc(id)}">${esc(id === d.student.id ? d.student.name : id)}</button>`).join('');
    const candidates = d.staffCandidates || [];
    const ordered = [...candidates].sort((a,b) => (a.id === state.user.id ? -1 : 0) - (b.id === state.user.id ? -1 : 0));
    const preferred = d.schedule.subjects || [];
    const subjects = [...new Set([...preferred, ...SUBJECTS])];
    $('#studentDetail').innerHTML = `<section class="panel"><div class="workspace-head"><div><span class="eyebrow">担当生徒</span><h2>${esc(d.student.name)}</h2><p>${esc(d.student.id)}・${esc(d.student.classroom)}・${esc(d.student.grade)}・${esc(d.student.school)}</p></div><a class="secondary" href="${esc(d.scoreLink)}" target="_blank" rel="noopener">成績を訂正する</a></div>${d.note ? `<button class="note-collapsed" type="button" title="${esc(d.note.text)}">⚠ ${esc(d.note.text)}（${esc(d.note.author)}・${esc(d.note.updatedAt)}）</button>` : ''}</section>${testCard(d.test)}<section class="panel"><h2>本日の担当</h2><form id="assignmentForm" class="assignment-grid"><label class="field">担当講師<select name="staffId" required>${ordered.map(x => `<option value="${esc(x.id)}" ${x.id === state.user.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label><label class="field">授業科目<select name="subject" required>${subjects.map((x,i) => `<option ${i === 0 ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label><button class="primary" type="submit">本日の担当を決定</button></form></section><section class="grid two"><div class="panel"><h2>前回の宿題</h2>${homeworkHtml(d.homework, 'teacher')}</div><div class="panel"><h2>定期テスト履歴</h2>${scoresHtml(d.scores)}</div></section><div id="lessonArea">${progressCards(d.progress)}</div>`;
  }

  async function startLesson(form) {
    const values = Object.fromEntries(new FormData(form));
    const data = await api('startLesson', { token: state.token, studentId: state.activeStudentId, ...values });
    state.lesson = data;
    renderLessonArea();
  }

  function renderLessonArea() {
    const l = state.lesson;
    const units = l.units || [];
    const ctUnits = units.filter(u => u.previous);
    const defaults = l.subject === '数学' ? ['TRYの赤×直し','exercise','宿題の赤×直し'] : l.subject === '英語' ? ['KeyWords「☆日→英」暗記','exercise「暗記マーク」暗記','Try赤×直し','exercise','宿題の赤×直し'] : [];
    $('#lessonArea').innerHTML = `<section class="panel"><div class="workspace-head"><div><span class="eyebrow">授業入力中</span><h2>${esc(l.subject)}・${esc(l.assignedStaff.name)}</h2></div>${status('入力中','warn')}</div></section><div class="lesson-layout"><section class="panel"><h2>学校進度・今回進んだ単元</h2><p class="muted">学校の現在位置は「学校位置」ボタン、今回進んだ単元はチェックで登録します。</p><div class="unit-list">${units.length ? units.map(u => `<div class="${['unit-row',u.previous?'previous':'',u.schoolCurrent?'school':''].filter(Boolean).join(' ')}"><input type="checkbox" data-learned-unit value="${esc(u.id)}"><span class="unit-number">${esc(u.number)}</span><span>${esc(u.name)}</span><span class="unit-meta"><button type="button" class="ghost" data-school-unit="${esc(u.id)}">学校位置</button>${u.previous ? `<button type="button" class="secondary" data-ct-unit="${esc(u.id)}">CT</button>` : ''}</span></div>`).join('') : empty('この科目の正式な進行表が未設定です。')}</div></section><aside class="grid"><section class="panel"><h2>CT</h2>${ctUnits.length ? '<p>前回範囲のCTボタンから1単元を選択してください。</p><div id="ctBox" class="empty">CT単元未選択</div>' : empty('前回範囲がありません。')}</section><section class="panel"><h2>次回宿題</h2><p class="muted">不要な項目は外せます。推奨完了日は2日後です。</p><div class="homework-list">${defaults.map(x => `<label><input type="checkbox" data-homework-type value="${esc(x)}" checked> ${esc(x)}</label>`).join('')}</div><label class="field">その他<textarea id="otherHomework" rows="3" placeholder="必要な場合のみ入力"></textarea></label></section><section class="panel"><h2>講師コメント</h2><label class="field"><textarea id="lessonComment" rows="3" placeholder="気になること・備考"></textarea></label></section><button class="primary" data-action="finish-lesson" ${units.length ? '' : 'disabled'}>授業記録と宿題を保存</button></aside></div>`;
  }

  async function saveSchoolProgress(unitId) {
    await api('saveSchoolProgress', { token: state.token, lessonId: state.lesson.lessonId, unitId });
    toast('学校進度を保存しました。');
  }

  function chooseCt(unitId) {
    const u = state.lesson.units.find(x => x.id === unitId);
    $('#ctBox').className = '';
    $('#ctBox').innerHTML = `<p><b>${esc(u.name)}</b></p><div class="segmented">${['◎','〇','×'].map(x => `<button type="button" data-ct-result="${x}" data-unit-id="${esc(unitId)}">${x}</button>`).join('')}</div>`;
  }

  async function saveCt(button) {
    const result = button.dataset.ctResult;
    await api('saveCT', { token: state.token, lessonId: state.lesson.lessonId, unitId: button.dataset.unitId, result });
    $$('.segmented button', $('#ctBox')).forEach(x => x.classList.toggle('active', x === button));
    toast(result === '×' ? 'CT×を登録し、特訓部屋対象にしました。' : `CT ${result} を登録しました。`);
  }

  async function finishLesson() {
    const unitIds = $$('[data-learned-unit]:checked').map(x => x.value);
    if (!unitIds.length) return toast('今回進んだ単元を選択してください。');
    const homeworkTypes = $$('[data-homework-type]:checked').map(x => x.value);
    const result = await api('saveLesson', { token: state.token, lessonId: state.lesson.lessonId, unitIds, homeworkTypes, otherHomework: $('#otherHomework').value });
    const comment = $('#lessonComment').value.trim();
    if (comment) await api('saveComment', { token: state.token, lessonId: state.lesson.lessonId, comment });
    toast(`${result.unitCount}単元・宿題${result.homeworkCount}件を保存しました。`);
    await openStudent(state.activeStudentId, state.lesson.subject);
  }

  async function renderAdmin() {
    state.role = 'admin';
    state.adminRows = await api('todayOverview', { token: state.token, allStudents: state.adminAll });
    workspace.innerHTML = head('本日の速報一覧', `${state.adminAll ? '全生徒' : '本日授業予定'}・日本時間`, `<button class="secondary" data-action="admin-settings">管理設定</button><button class="ghost" data-action="back-staff">講師画面</button>`) + `<section class="panel"><div class="toolbar"><input id="adminFilter" placeholder="生徒名・ID・学校・担当講師"><select id="adminClass"><option value="">全教室</option>${[...new Set(state.adminRows.map(x => x.classroom))].filter(Boolean).map(x => `<option>${esc(x)}</option>`).join('')}</select><select id="adminGrade"><option value="">全学年</option><option>中1</option><option>中2</option><option>中3</option></select><select id="adminSchool"><option value="">全学校</option>${[...new Set(state.adminRows.map(x => x.school))].filter(Boolean).sort().map(x => `<option>${esc(x)}</option>`).join('')}</select><select id="adminSubject"><option value="">全教科</option>${SUBJECTS.map(x => `<option>${esc(x)}</option>`).join('')}</select><select id="adminStaff"><option value="">全担当講師</option>${[...new Set(state.adminRows.map(x => x.assignedStaff))].filter(x => x && x !== '未決定').sort().map(x => `<option>${esc(x)}</option>`).join('')}</select><select id="adminCt"><option value="">CTすべて</option><option>◎</option><option>〇</option><option>×</option></select><select id="adminHw"><option value="">宿題すべて</option><option value="open">未完了あり</option><option value="done">すべて確認済み</option></select><select id="adminTraining"><option value="">特訓すべて</option><option value="open">未対応あり</option></select><button class="secondary" data-action="toggle-all">${state.adminAll ? '本日予定のみ' : '全生徒表示'}</button></div><div id="overviewWrap"></div></section>`;
    filterAdmin();
    showWorkspace();
  }

  function filterAdmin() {
    const query = ($('#adminFilter')?.value || '').normalize('NFKC').replace(/\s/g,'').toLowerCase();
    const classroom = $('#adminClass')?.value || '';
    const grade = $('#adminGrade')?.value || '';
    const school = $('#adminSchool')?.value || '';
    const subject = $('#adminSubject')?.value || '';
    const staff = $('#adminStaff')?.value || '';
    const ct = $('#adminCt')?.value || '';
    const hw = $('#adminHw')?.value || '';
    const training = $('#adminTraining')?.value || '';
    const rows = state.adminRows.filter(r => {
      const hay = [r.name,r.id,r.school,r.assignedStaff,(r.plannedSubjects||[]).join('')].join('').normalize('NFKC').replace(/\s/g,'').toLowerCase();
      return (!query || hay.includes(query)) && (!classroom || r.classroom === classroom) && (!grade || r.grade === grade) && (!school || r.school === school) && (!subject || (r.plannedSubjects || []).includes(subject) || (r.actualSubjects || []).includes(subject)) && (!staff || r.assignedStaff === staff) && (!ct || r.ctResult === ct) && (!hw || (hw === 'open' ? r.homework.checked < r.homework.total : r.homework.checked === r.homework.total)) && (!training || (training === 'open' && r.trainingStatus && r.trainingStatus !== '完了'));
    });
    $('#overviewWrap').innerHTML = rows.length ? `<div class="table-wrap"><table class="overview-table"><thead><tr><th>生徒</th><th>予定 / 実施</th><th>担当</th><th>残り</th><th>CT</th><th>宿題</th><th>学校比較</th><th>特訓</th><th>警告</th></tr></thead><tbody>${rows.map(r => {
      const alerts = [r.ctResult === '×' && 'CT×', r.trainingStatus && r.trainingStatus !== '完了' && '特訓未対応', r.homework.checked < r.homework.total && '宿題未完了', r.missingRecord && '記録未入力'].filter(Boolean);
      return `<tr class="${alerts.length ? 'alert-row' : ''}" data-admin-student="${esc(r.id)}"><td><button class="ghost" data-admin-student="${esc(r.id)}">${r.unreadComments ? '<span class="unread-dot"></span> ' : ''}${esc(r.name)}</button><small>${esc(r.id)}・${esc(r.classroom)}・${esc(r.grade)}</small></td><td>${esc((r.plannedSubjects||[]).join('・')||'―')} / ${esc((r.actualSubjects||[]).join('・')||'未入力')}</td><td>${esc(r.assignedStaff)}</td><td>${esc(r.remaining ?? '未設定')}</td><td>${esc(r.ctResult || '―')}</td><td>${esc(r.homework.checked)}/${esc(r.homework.total)}</td><td>${status(r.comparison, r.comparison === '遅れ' ? 'danger' : r.comparison === '先行' ? 'ok' : 'muted')}</td><td>${esc(r.trainingStatus || '―')}</td><td>${alerts.map(x => status(x, 'danger')).join(' ')}</td></tr>`;
    }).join('')}</tbody></table></div>` : empty('条件に合う生徒はいません。');
  }

  async function openAdminStudent(studentId) {
    const d = await api('adminStudentDetail', { token: state.token, studentId });
    state.detail = d;
    const t = d.targets || {};
    workspace.innerHTML = head(d.student.name, `${d.student.id}・${d.student.classroom}・${d.student.grade}・${d.student.school}`, '<button class="ghost" data-action="admin-home">一覧へ戻る</button>') + testCard(d.test) + `<section class="grid two"><div class="panel"><h2>5教科目標点</h2><div class="grid three">${[['国語',t.japanese],['社会',t.social],['数学',t.math],['理科',t.science],['英語',t.english]].map(x => metric(x[0], x[1] === '' || x[1] == null ? '未設定' : `${x[1]}点`)).join('')}</div></div><div class="panel"><h2>指導上の注意事項</h2>${d.note ? `<p>${esc(d.note.text)}</p><small>${esc(d.note.author)}・${esc(d.note.updatedAt)}・第${esc(d.note.version)}版</small>` : empty('注意事項はありません。')}<form id="noteForm" class="field"><textarea name="text" rows="3" placeholder="新しい内容を入力"></textarea><button class="primary" type="submit">新しい版として保存</button></form></div></section><section class="panel"><h2>成績履歴</h2>${scoresHtml(d.scores)}</section><section class="panel"><h2>宿題</h2>${homeworkHtml(d.homework, 'readonly')}</section><section class="grid two"><div class="panel"><h2>授業履歴</h2>${simpleHistory(d.lessons, ['授業日','教科','担当講師名','状態'])}</div><div class="panel"><h2>学校進度履歴</h2>${simpleHistory(d.schoolProgress, ['記録日','教科','単元ID','担当講師名'])}</div><div class="panel"><h2>CT履歴</h2>${simpleHistory(d.ct, ['実施日','教科','単元ID','結果','担当講師名'])}</div><div class="panel"><h2>特訓部屋</h2>${simpleHistory(d.training, ['教科','単元ID','状態','実施予定日','実施日'])}</div></section><section class="panel"><h2>講師コメント</h2>${d.comments?.length ? `<div class="history-list">${d.comments.map(c => `<article class="metric"><p>${esc(c['コメント'])}</p><small>${esc(c['講師名'])}・${esc(c['作成日時'])}</small><button class="secondary" data-read-comment="${esc(c['コメントID'])}">確認済みにする</button></article>`).join('')}</div>` : empty('コメントはありません。')}</section>`;
    showWorkspace();
  }

  function simpleHistory(rows = [], keys = []) {
    if (!rows.length) return empty('履歴はありません。');
    return `<div class="history-list">${rows.slice().reverse().map(r => `<div class="metric">${keys.map(k => `<small>${esc(k)}</small><b style="font-size:14px">${esc(r[k] ?? '')}</b>`).join('')}</div>`).join('')}</div>`;
  }

  async function requireAdminSettings() {
    if (!state.adminVerified) {
      $('#reauthId').value = state.user.id || '';
      $('#reauthPassword').value = '';
      $('#reauthMessage').textContent = '';
      $('#reauthDialog').showModal();
      return;
    }
    await renderAdminSettings();
  }

  async function renderAdminSettings() {
    state.adminSettings = await api('adminSettings', { token: state.token });
    const s = state.adminSettings;
    workspace.innerHTML = head('管理設定', '変更は専用保存シートへ記録されます。', '<button class="ghost" data-action="admin-home">速報一覧</button>') + `<nav class="admin-nav"><button class="secondary" data-setting-view="textbook">学校別英語教科書</button><button class="secondary" data-setting-view="range">テスト範囲</button><button class="secondary" data-setting-view="training">特訓部屋</button><button class="secondary" data-setting-view="units">正式進行表</button></nav><div id="settingsArea"></div>`;
    renderSettingView('textbook');
    showWorkspace();
  }

  function renderSettingView(view) {
    const s = state.adminSettings;
    if (view === 'textbook') {
      const latest = Object.fromEntries((s.schoolBooks || []).map(x => [x['学校名正規化'], x['英語教科書']]));
      $('#settingsArea').innerHTML = `<section class="panel"><h2>学校別英語教科書</h2><p>学校ごとに正式な英語進行表を選択してください。</p><div class="history-list">${s.schools.map(school => `<form class="textbookForm assignment-grid"><input type="hidden" name="school" value="${esc(school)}"><b>${esc(school)}</b><select name="textbook" required><option value="">選択してください</option>${s.textbooks.map(x => `<option ${latest[school] === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select><button class="primary" type="submit">保存</button></form>`).join('')}</div></section>`;
    } else if (view === 'training') {
      $('#settingsArea').innerHTML = `<section class="panel"><div class="toolbar"><h2>未完了の特訓部屋</h2><a class="secondary" href="${esc(s.messageLink)}" target="_blank" rel="noopener">STEP配信システムで保護者へ連絡</a></div>${s.trainings.length ? `<div class="history-list">${s.trainings.map(t => `<form class="trainingForm panel"><input type="hidden" name="trainingId" value="${esc(t['対応ID'])}"><div class="assignment-grid"><label class="field">生徒ID<input value="${esc(t['生徒ID'])}" disabled></label><label class="field">教科<input value="${esc(t['教科'])}" disabled></label><label class="field">状態<select name="status"><option>未対応</option><option>実施日決定</option><option>完了</option></select></label><label class="field">予定日<input type="date" name="plannedDate"></label><label class="field">実施日<input type="date" name="doneDate"></label><label class="field">保護者連絡<select name="contactStatus"><option>未連絡</option><option>連絡済み</option></select></label></div><label class="field">備考<textarea name="note"></textarea></label><button class="primary" type="submit">更新</button></form>`).join('')}</div>` : empty('未完了の特訓部屋対象はいません。')}</section>`;
    } else if (view === 'range') {
      $('#settingsArea').innerHTML = `<section class="panel"><h2>学校別テスト範囲</h2><p>まず速報一覧から対象生徒を開き、次回テストと進行表を確認してください。範囲設定は学校・学年・教科・テストID単位で保存されます。</p><form id="rangeLookup" class="assignment-grid"><label class="field">対象生徒ID<input name="studentId" required></label><label class="field">教科<select name="subject"><option>英語</option><option>数学</option></select></label><button class="primary" type="submit">進行表を開く</button></form><div id="rangeEditor"></div></section>`;
    } else {
      $('#settingsArea').innerHTML = `<section class="panel"><h2>正式進行表の再読込</h2><p>正式な数学標準版と、英語6教科書版の中1〜中3進行表を読み直します。</p><button class="primary" data-action="refresh-units">正式進行表を再読込</button><div id="unitRefreshResult"></div></section>`;
    }
  }

  async function openRangeEditor(form) {
    const values = Object.fromEntries(new FormData(form));
    const d = await api('studentDetail', { token: state.token, studentId: values.studentId, subject: values.subject });
    const p = d.progress.find(x => x.subject === values.subject);
    if (!d.test) return $('#rangeEditor').innerHTML = empty('次回テスト未登録のため設定できません。');
    const units = p?.units || [];
    $('#rangeEditor').innerHTML = `<form id="rangeForm" class="panel"><input type="hidden" name="studentId" value="${esc(d.student.id)}"><input type="hidden" name="school" value="${esc(d.student.school)}"><input type="hidden" name="grade" value="${esc(d.student.grade)}"><input type="hidden" name="subject" value="${esc(values.subject)}"><input type="hidden" name="testId" value="${esc(d.test.id)}"><div class="toolbar"><h3>${esc(d.student.school)}・${esc(d.student.grade)}・${esc(values.subject)}・${esc(d.test.name)}</h3><select name="kind"><option value="predicted">予想範囲</option><option value="confirmed">決定版</option></select><button type="button" class="ghost" data-action="select-range-all">全選択</button><button type="button" class="ghost" data-action="select-range-none">解除</button></div><div class="unit-list">${units.map(u => unitRowHtml(u, true)).join('')}</div><button class="primary" type="submit">選択範囲を保存</button></form>`;
  }

  function showWorkspace() { entry.classList.add('hidden'); workspace.classList.remove('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function showEntry() { workspace.classList.add('hidden'); entry.classList.remove('hidden'); }

  async function logout() {
    try { if (state.token) await api('logout', { token: state.token }, true); } catch (_) { /* local logout still proceeds */ }
    clearSession(state.device === 'shared');
    Object.assign(state, { token: '', role: '', user: null, tabs: [], activeStudentId: '', detail: null, lesson: null, adminVerified: false });
    showEntry();
    $('#loginForm').reset();
    toast('ログアウトしました。');
  }

  $$('.tab').forEach(tab => tab.addEventListener('click', () => {
    state.loginType = tab.dataset.loginTab;
    $$('.tab').forEach(x => x.classList.toggle('active', x === tab));
    $('#loginTitle').textContent = state.loginType === 'student' ? '生徒ログイン' : '講師ログイン';
    $('#idLabel').textContent = state.loginType === 'student' ? '生徒番号' : '講師ID';
    $('#loginMessage').textContent = '';
  }));

  $('#adminEntry').addEventListener('click', () => {
    state.adminIntent = true;
    $('.tab[data-login-tab="staff"]').click();
    $('#loginTitle').textContent = '管理者ログイン';
    $('#loginMessage').textContent = '講師IDでログイン後、設定時に再認証します。';
  });

  $('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const device = new FormData(event.currentTarget).get('device');
    try {
      const data = await api(state.loginType === 'student' ? 'loginStudent' : 'loginStaff', { device, id: $('#loginId').value, password: $('#loginPassword').value });
      Object.assign(state, { token: data.token, user: data.user, device, role: state.loginType });
      saveSession();
      $('#loginPassword').value = '';
      if (state.loginType === 'student') await renderStudent(); else if (state.adminIntent) await renderAdmin(); else staffSearchScreen();
    } catch (err) { $('#loginMessage').textContent = err.message; }
  });

  $('#reauthForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await api('reauthAdmin', { token: state.token, id: $('#reauthId').value, password: $('#reauthPassword').value });
      state.adminVerified = true;
      $('#reauthDialog').close();
      await renderAdminSettings();
    } catch (err) { $('#reauthMessage').textContent = err.message; }
  });

  app.addEventListener('submit', async event => {
    try {
      if (event.target.id === 'targetForm') { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target)); state.detail.targets = await api('saveTargets', { token: state.token, testId: state.detail.test.id, targets: values }); return toast('目標点を保存しました。'); }
      if (event.target.id === 'searchForm') { event.preventDefault(); return await searchStudents(event.target); }
      if (event.target.id === 'assignmentForm') { event.preventDefault(); return await startLesson(event.target); }
      if (event.target.id === 'noteForm') { event.preventDefault(); const text = new FormData(event.target).get('text'); await api('saveNote', { token: state.token, studentId: state.detail.student.id, text }); return await openAdminStudent(state.detail.student.id); }
      if (event.target.classList.contains('textbookForm')) { event.preventDefault(); const v = Object.fromEntries(new FormData(event.target)); await api('saveTextbook', { token: state.token, ...v }); toast('英語教科書を保存しました。'); state.adminSettings = await api('adminSettings', { token: state.token }); return renderSettingView('textbook'); }
      if (event.target.classList.contains('trainingForm')) { event.preventDefault(); const v = Object.fromEntries(new FormData(event.target)); await api('updateTraining', { token: state.token, ...v }); toast('特訓部屋の状態を更新しました。'); return await renderAdminSettings(); }
      if (event.target.id === 'rangeLookup') { event.preventDefault(); return await openRangeEditor(event.target); }
      if (event.target.id === 'rangeForm') { event.preventDefault(); const v = Object.fromEntries(new FormData(event.target)); const unitIds = $$('input[type="checkbox"]:checked', event.target).map(x => x.value); await api('saveTestRange', { token: state.token, ...v, unitIds }); return toast(`${v.kind === 'confirmed' ? '決定版' : '予想'}範囲を保存しました。`); }
    } catch (err) { toast(err.message); }
  });

  app.addEventListener('change', async event => {
    try {
      if (event.target.dataset.homeworkId && event.target.dataset.homeworkMode === 'student') await api('markHomeworkStudent', { token: state.token, homeworkId: event.target.dataset.homeworkId, checked: event.target.checked });
      if (event.target.dataset.homeworkId && event.target.dataset.homeworkMode === 'teacher') await api('markHomeworkTeacher', { token: state.token, homeworkId: event.target.dataset.homeworkId, checked: event.target.checked });
      if (['adminFilter','adminClass','adminGrade','adminSchool','adminSubject','adminStaff','adminCt','adminHw','adminTraining'].includes(event.target.id)) filterAdmin();
    } catch (err) { event.target.checked = !event.target.checked; toast(err.message); }
  });

  app.addEventListener('input', event => { if (event.target.id === 'adminFilter') filterAdmin(); });

  app.addEventListener('click', async event => {
    const button = event.target.closest('button, [data-action]');
    if (!button) return;
    try {
      if (button.dataset.openStudent) return await openStudent(button.dataset.openStudent);
      if (button.dataset.switchStudent) return await openStudent(button.dataset.switchStudent);
      if (button.dataset.schoolUnit) return await saveSchoolProgress(button.dataset.schoolUnit);
      if (button.dataset.ctUnit) return chooseCt(button.dataset.ctUnit);
      if (button.dataset.ctResult) return await saveCt(button);
      if (button.dataset.adminStudent) return await openAdminStudent(button.dataset.adminStudent);
      if (button.dataset.readComment) { await api('markCommentRead', { token: state.token, commentId: button.dataset.readComment }); button.disabled = true; button.textContent = '確認済み'; return; }
      if (button.dataset.settingView) return renderSettingView(button.dataset.settingView);
      const action = button.dataset.action;
      if (action === 'logout') return await logout();
      if (action === 'open-admin') return await renderAdmin();
      if (action === 'back-staff') return staffSearchScreen();
      if (action === 'finish-lesson') return await finishLesson();
      if (action === 'toggle-all') { state.adminAll = !state.adminAll; return await renderAdmin(); }
      if (action === 'admin-home') return await renderAdmin();
      if (action === 'admin-settings') return await requireAdminSettings();
      if (action === 'select-range-all') return $$('input[type="checkbox"]', $('#rangeForm')).forEach(x => x.checked = true);
      if (action === 'select-range-none') return $$('input[type="checkbox"]', $('#rangeForm')).forEach(x => x.checked = false);
      if (action === 'refresh-units') { const result = await api('refreshUnits', { token: state.token }); $('#unitRefreshResult').innerHTML = `<p>${status(`${result.total}単元を読込`, 'ok')}</p><pre>${esc(JSON.stringify(result.summary, null, 2))}</pre>`; }
    } catch (err) { toast(err.message); }
  });

  (async function init() {
    const saved = restoreSession();
    if (!saved) return;
    Object.assign(state, saved);
    try {
      if (state.role === 'student') await renderStudent(); else staffSearchScreen();
    } catch (_) { clearSession(true); showEntry(); }
  })();
})();
