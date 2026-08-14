const APP = Object.freeze({
  get DB_ID() { return scriptProperty_('DB_ID'); },
  get STUDENT_MASTER_ID() { return scriptProperty_('STUDENT_MASTER_ID'); },
  get TEACHER_MASTER_ID() { return scriptProperty_('TEACHER_MASTER_ID'); },
  get GRADE_DATA_ID() { return scriptProperty_('GRADE_DATA_ID'); },
  TZ: 'Asia/Tokyo',
  SCORE_LINK: 'https://stepkobetsu-hub.github.io/seiseki-kanri/juku_app.html',
  MESSAGE_LINK: 'https://stepkobetsu-hub.github.io/step-message-center/',
  SESSION_HOURS_SHARED: 8,
  SESSION_DAYS_PERSONAL: 30,
  SUBJECTS: ['英語', '数学', '国語', '理科', '社会']
});

const UNIT_SOURCES = Object.freeze([
  { subject: '数学', type: '標準版', get fileId() { return scriptProperty_('UNIT_MATH_FILE_ID'); }, fileName: '26F進行表オモテ【中学数学】.xls', sheets: ['中1(標準版)', '中2(標準版)', '中3(標準版)'] },
  { subject: '英語', type: 'ニューホライズン', get fileId() { return scriptProperty_('UNIT_ENGLISH_NH_FILE_ID'); }, fileName: '26F進行表オモテ【中学英語(ホライズン版)】.xls', sheets: ['1年生', '2年生', '3年生'] },
  { subject: '英語', type: 'ニュークラウン', get fileId() { return scriptProperty_('UNIT_ENGLISH_NC_FILE_ID'); }, fileName: '26F進行表オモテ【中学英語(ニュークラウン版)】.xls', sheets: ['1年生', '2年生', '3年生'] },
  { subject: '英語', type: 'サンシャイン', get fileId() { return scriptProperty_('UNIT_ENGLISH_SUNSHINE_FILE_ID'); }, fileName: '26F進行表オモテ【中学英語(サンシャイン版)】.xls', sheets: ['1年生', '2年生', '3年生'] },
  { subject: '英語', type: 'ブルースカイ', get fileId() { return scriptProperty_('UNIT_ENGLISH_BLUE_SKY_FILE_ID'); }, fileName: '26F進行表オモテ【中学英語(ブルースカイ版)】.xls', sheets: ['1年生', '2年生', '3年生'] },
  { subject: '英語', type: 'ヒアウィゴー', get fileId() { return scriptProperty_('UNIT_ENGLISH_HERE_WE_GO_FILE_ID'); }, fileName: '26F進行表オモテ【中学英語(ヒアウィゴー!版)】.xls', sheets: ['1年生', '2年生', '3年生'] },
  { subject: '英語', type: 'ワンワールド', get fileId() { return scriptProperty_('UNIT_ENGLISH_ONE_WORLD_FILE_ID'); }, fileName: '26F進行表オモテ【中学英語(ワンワールド版)】.xls', sheets: ['1年生', '2年生', '3年生'] }
]);

function scriptProperty_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error('Script Property が未設定です: ' + key);
  return value;
}

function doGet(e) {
  return output_({ ok: true, data: { app: 'フォレスタ進捗管理', version: '2.0.0', status: 'ready', now: nowIso_() } });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return output_({ ok: true, data: route_(String(body.action || ''), body.payload || {}) });
  } catch (err) {
    return output_({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function authorizeApp() {
  return { databaseId: db_().getId(), timeZone: Session.getScriptTimeZone() };
}

function output_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function route_(action, p) {
  const routes = {
    health: () => health_(),
    loginStudent: () => loginStudent_(p),
    loginStaff: () => loginStaff_(p),
    logout: () => logout_(p.token),
    reauthAdmin: () => reauthAdmin_(p),
    studentHome: () => studentHome_(p.token),
    saveTargets: () => saveTargets_(p),
    markHomeworkStudent: () => markHomeworkStudent_(p),
    searchStudents: () => searchStudents_(p),
    studentDetail: () => staffStudentDetail_(p),
    refreshEnrollment: () => refreshEnrollment_(p),
    listStaff: () => listStaff_(p),
    startLesson: () => startLesson_(p),
    saveSchoolProgress: () => saveSchoolProgress_(p),
    saveLesson: () => saveLesson_(p),
    saveCT: () => saveCT_(p),
    markHomeworkTeacher: () => markHomeworkTeacher_(p),
    saveComment: () => saveComment_(p),
    todayOverview: () => todayOverview_(p),
    adminStudentDetail: () => adminStudentDetail_(p),
    saveNote: () => saveNote_(p),
    markCommentRead: () => markCommentRead_(p),
    saveTextbook: () => saveTextbook_(p),
    saveTestRange: () => saveTestRange_(p),
    updateTraining: () => updateTraining_(p),
    adminSettings: () => adminSettings_(p),
    refreshUnits: () => refreshUnitsForApi_(p)
  };
  if (!routes[action]) throw new Error('未対応の操作です。');
  return routes[action]();
}

function health_() {
  const units = rows_('単元マスタ').length;
  const students = readStudents_().length;
  const schedules = readSchedule_().length;
  const activeStaff = readStaff_().filter(x => x.active).length;
  const schools = gradeRows_('学校マスタ').length;
  const scores = gradeRows_('成績データ').length;
  return { units, students, schedules, activeStaff, schools, scores, timeZone: APP.TZ };
}

function loginStudent_(p) {
  requireDevice_(p.device);
  const id = clean_(p.id);
  const pass = String(p.password || '');
  const student = readStudents_().find(x => x.id === id && String(x.password) === pass);
  if (!student) throw new Error('生徒番号またはパスワードが違います。');
  const token = issueSession_('student', id, p.device);
  audit_('student', id, student.name, 'login', 'session', '', { device: p.device }, 'ok');
  return { token, user: publicStudent_(student), expiresAt: sessionExpiry_(p.device).toISOString() };
}

function loginStaff_(p) {
  requireDevice_(p.device);
  const staff = authenticateStaff_(p.id, p.password);
  const token = issueSession_('staff', staff.id, p.device);
  audit_('staff', staff.id, staff.name, 'login', 'session', '', { device: p.device }, 'ok');
  return { token, user: publicStaff_(staff), expiresAt: sessionExpiry_(p.device).toISOString() };
}

function reauthAdmin_(p) {
  const session = requireSession_(p.token, 'staff');
  const staff = authenticateStaff_(p.id, p.password);
  if (staff.id !== session.userId || staff.permission < 1) throw new Error('管理者設定の再認証に失敗しました。');
  return { verified: true, user: publicStaff_(staff), at: nowIso_() };
}

function authenticateStaff_(idValue, password) {
  const id = clean_(idValue);
  const pass = String(password || '');
  const staff = readStaff_().find(x => x.id === id && x.active && x.permission >= 1 && String(x.password) === pass);
  if (!staff) throw new Error('講師ID、パスワード、または在籍・権限を確認してください。');
  return staff;
}

function logout_(token) {
  if (!token) return { loggedOut: true };
  const hash = hash_(token);
  const sh = sheet_('セッション');
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === hash && !values[i][6]) sh.getRange(i + 1, 7).setValue(new Date());
  }
  return { loggedOut: true };
}

function issueSession_(type, userId, device) {
  const token = Utilities.getUuid() + '.' + Utilities.getUuid();
  const issued = new Date();
  const expires = sessionExpiry_(device);
  sheet_('セッション').appendRow([hash_(token), type, userId, device, issued, expires, '', issued]);
  return token;
}

function sessionExpiry_(device) {
  const ms = device === 'personal' ? APP.SESSION_DAYS_PERSONAL * 86400000 : APP.SESSION_HOURS_SHARED * 3600000;
  return new Date(Date.now() + ms);
}

function requireSession_(token, expected) {
  if (!token) throw new Error('ログインが必要です。');
  const hash = hash_(token);
  const values = sheet_('セッション').getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    const r = values[i];
    if (String(r[0]) !== hash) continue;
    if (r[6] || new Date(r[5]).getTime() <= Date.now()) throw new Error('ログインの有効期限が切れました。');
    if (expected && String(r[1]) !== expected) throw new Error('この操作を行う権限がありません。');
    sheet_('セッション').getRange(i + 1, 8).setValue(new Date());
    return { type: String(r[1]), userId: String(r[2]), device: String(r[3]) };
  }
  throw new Error('ログインの有効期限が切れました。');
}

function requireStaff_(token) {
  const s = requireSession_(token, 'staff');
  const staff = readStaff_().find(x => x.id === s.userId && x.active && x.permission >= 1);
  if (!staff) throw new Error('講師権限を確認できません。');
  return staff;
}

function requireStudent_(token) {
  const s = requireSession_(token, 'student');
  const student = readStudents_().find(x => x.id === s.userId);
  if (!student) throw new Error('生徒情報を確認できません。');
  return student;
}

function requireDevice_(device) {
  if (device !== 'personal' && device !== 'shared') throw new Error('使用端末を選択してください。');
}

function hash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)
    .map(x => ('0' + (x & 255).toString(16)).slice(-2)).join('');
}

function readStudents_() {
  const sh = SpreadsheetApp.openById(APP.STUDENT_MASTER_ID).getSheetByName('☆マスタ');
  const v = sh.getDataRange().getDisplayValues();
  return v.slice(1).filter(r => clean_(r[0])).map((r, i) => ({
    row: i + 2, id: clean_(r[0]), name: clean_(r[4]), kana: clean_(r[5]), classroom: clean_(r[7]),
    grade: normalizeGrade_(r[10]), password: r[11], school: clean_(r[15]), schoolKey: normalizeSchool_(r[15])
  }));
}

function readSchedule_() {
  const sh = SpreadsheetApp.openById(APP.STUDENT_MASTER_ID).getSheetByName('時間割マスタ');
  const v = sh.getDataRange().getDisplayValues();
  const days = v[0] || [], headers = v[1] || [];
  return v.slice(2).filter(r => clean_(r[0])).map((r, i) => {
    const lessons = [];
    for (let c = 4; c <= 27; c++) if (clean_(r[c])) lessons.push({ day: clean_(days[c]), time: clean_(headers[c]), subject: clean_(r[c]) });
    return { row: i + 3, id: clean_(r[0]), name: clean_(r[1]), grade: normalizeGrade_(r[2]), classroom: clean_(r[3]), lessons,
      subjects: unique_(lessons.map(x => x.subject).filter(x => APP.SUBJECTS.indexOf(x) >= 0)), englishLevel: Number(r[40]) || 3, mathLevel: Number(r[41]) || 3 };
  });
}

function readStaff_() {
  const sh = SpreadsheetApp.openById(APP.TEACHER_MASTER_ID).getSheetByName('講師マスター');
  const v = sh.getDataRange().getDisplayValues();
  return v.slice(4).filter(r => clean_(r[0])).map((r, i) => ({ row: i + 5, id: clean_(r[0]), name: clean_(r[1]), active: clean_(r[3]) === '1', classrooms: clean_(r[17]).split(/[・,、/]/).map(clean_).filter(Boolean), password: r[35], permission: Number(r[36]) || 0 }));
}

function publicStudent_(x) { return { id: x.id, name: x.name, classroom: x.classroom, grade: x.grade, school: x.school }; }
function publicStaff_(x) { return { id: x.id, name: x.name, classrooms: x.classrooms, permission: x.permission }; }

function studentHome_(token) {
  const student = requireStudent_(token);
  return buildStudentBundle_(student);
}

function buildStudentBundle_(student) {
  const schedule = readSchedule_().find(x => x.id === student.id) || { subjects: [], englishLevel: 3, mathLevel: 3, lessons: [] };
  const test = nextTest_(student.school, student.grade);
  const scores = scoresFor_(student.id);
  const targets = targetsFor_(student.id, test && test.id);
  const homework = homeworkFor_(student.id);
  const subjects = unique_(['英語', '数学'].concat(schedule.subjects));
  const progress = subjects.map(subject => progressFor_(student, subject, schedule, test));
  return { student: publicStudent_(student), schedule: { subjects: schedule.subjects, lessons: schedule.lessons, englishLevel: schedule.englishLevel, mathLevel: schedule.mathLevel }, test, targets, scores, homework, progress, scoreLink: APP.SCORE_LINK };
}

function nextTest_(school, grade) {
  const row = gradeRows_('学校マスタ').find(r => normalizeSchool_(r['学校名']) === normalizeSchool_(school));
  if (!row) return null;
  let schedule;
  try { schedule = JSON.parse(row['定期テスト日程JSON'] || '{}'); } catch (e) { return null; }
  const g = 'g' + normalizeGrade_(grade).replace(/\D/g, '');
  const list = schedule[g] || [];
  const now = startOfDay_(new Date());
  const academicStart = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  for (let i = 0; i < list.length; i++) {
    const parsed = parseSchoolDate_(String(list[i] || ''), academicStart);
    if (!parsed || parsed.end.getTime() < now.getTime()) continue;
    return { id: [academicStart, normalizeSchool_(school), normalizeGrade_(grade), i + 1].join('-'), name: '第' + (i + 1) + '回定期テスト', number: i + 1,
      start: Utilities.formatDate(parsed.start, APP.TZ, 'yyyy-MM-dd'), end: Utilities.formatDate(parsed.end, APP.TZ, 'yyyy-MM-dd'), daysLeft: Math.ceil((parsed.start - now) / 86400000) };
  }
  return null;
}

function parseSchoolDate_(text, academicStart) {
  if (!text || /なし/.test(text)) return null;
  const matches = text.replace(/・/g, '-').match(/(\d{1,2})\/(\d{1,2})(?:\s*[-～〜]\s*(?:(\d{1,2})\/)?(\d{1,2}))?/);
  if (!matches) return null;
  const m1 = Number(matches[1]), d1 = Number(matches[2]), m2 = Number(matches[3] || m1), d2 = Number(matches[4] || d1);
  const y1 = m1 <= 3 ? academicStart + 1 : academicStart;
  const y2 = m2 <= 3 ? academicStart + 1 : academicStart;
  return { start: new Date(y1, m1 - 1, d1), end: new Date(y2, m2 - 1, d2) };
}

function scoresFor_(studentId) {
  return gradeRows_('成績データ').filter(r => clean_(r['生徒ID']) === clean_(studentId)).map(r => ({
    year: r['年度'], testNumber: r['テスト回次'], japanese: r['国語'], social: r['社会'], math: r['数学'], science: r['理科'], english: r['英語'], total: r['5科目合計'], rank: r['5科目順位']
  }));
}

function targetsFor_(studentId, testId) {
  if (!testId) return null;
  const rows = rows_('テスト別目標点').filter(r => r['生徒ID'] === studentId && r['テストID'] === testId);
  if (!rows.length) return { testId, japanese: '', math: '', english: '', science: '', social: '' };
  const r = rows[rows.length - 1];
  return { testId, japanese: r['国語'], math: r['数学'], english: r['英語'], science: r['理科'], social: r['社会'] };
}

function saveTargets_(p) {
  const student = requireStudent_(p.token);
  const test = nextTest_(student.school, student.grade);
  if (!test || p.testId !== test.id) throw new Error('次回テストを確認できません。');
  const values = ['japanese', 'math', 'english', 'science', 'social'].map(k => scoreValue_(p.targets && p.targets[k]));
  upsertByKey_('テスト別目標点', '冪等キー', test.id + ':' + student.id, [id_('goal'), test.id, student.id].concat(values, [new Date(), new Date(), test.id + ':' + student.id]));
  audit_('student', student.id, student.name, 'saveTargets', 'test', test.id, {}, 'ok');
  return targetsFor_(student.id, test.id);
}

function scoreValue_(v) {
  if (v === '' || v == null) return '';
  const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('目標点は0～100で入力してください。'); return n;
}

function homeworkFor_(studentId) {
  const homework = rows_('宿題').filter(r => r['生徒ID'] === studentId);
  const self = indexLatest_(rows_('宿題の生徒チェック'), '宿題ID');
  const staff = indexLatest_(rows_('宿題の講師チェック'), '宿題ID');
  return homework.map(h => ({ id: h['宿題ID'], lessonId: h['授業ID'], subject: h['教科'], unitId: h['単元ID'], type: h['宿題種別'], content: h['宿題内容'], due: dateString_(h['推奨完了日']),
    studentChecked: truthy_(self[h['宿題ID']] && self[h['宿題ID']]['チェック状態']), studentCheckedAt: dateTimeString_(self[h['宿題ID']] && self[h['宿題ID']]['チェック日時']),
    teacherChecked: truthy_(staff[h['宿題ID']] && staff[h['宿題ID']]['チェック状態']), teacherCheckedAt: dateTimeString_(staff[h['宿題ID']] && staff[h['宿題ID']]['チェック日時']) })).sort((a, b) => String(b.id).localeCompare(String(a.id)));
}

function markHomeworkStudent_(p) {
  const student = requireStudent_(p.token);
  const h = rows_('宿題').find(r => r['宿題ID'] === p.homeworkId && r['生徒ID'] === student.id);
  if (!h) throw new Error('宿題を確認できません。');
  const key = p.homeworkId + ':' + student.id;
  upsertByKey_('宿題の生徒チェック', '冪等キー', key, [id_('hs'), p.homeworkId, student.id, !!p.checked, new Date(), new Date(), key]);
  return { homeworkId: p.homeworkId, checked: !!p.checked, at: nowIso_() };
}

function searchStudents_(p) {
  requireStaff_(p.token);
  const query = normalizeSearch_(p.query || '');
  const scheduleIndex = Object.fromEntries(readSchedule_().map(x => [x.id, x]));
  return readStudents_().filter(s => {
    if (p.classroom && s.classroom !== p.classroom) return false;
    if (p.grade && s.grade !== normalizeGrade_(p.grade)) return false;
    const hay = normalizeSearch_([s.id, s.name, s.kana, s.classroom, s.grade, s.school].join(' '));
    return !query || hay.indexOf(query) >= 0;
  }).slice(0, 50).map(s => ({ ...publicStudent_(s), subjects: (scheduleIndex[s.id] || {}).subjects || [] }));
}

function staffStudentDetail_(p) {
  requireStaff_(p.token);
  const student = readStudents_().find(x => x.id === clean_(p.studentId));
  if (!student) throw new Error('生徒が見つかりません。');
  const bundle = buildStudentBundle_(student);
  bundle.previousLesson = previousLesson_(student.id, p.subject || '');
  bundle.note = activeNote_(student.id);
  bundle.staffCandidates = staffForClassroom_(student.classroom);
  return bundle;
}

function refreshEnrollment_(p) {
  const staff = requireStaff_(p.token);
  const row = readSchedule_().find(x => x.id === clean_(p.studentId));
  if (!row) throw new Error('時間割マスタに生徒が見つかりません。');
  const key = row.id;
  upsertByKey_('受講科目キャッシュ', '生徒ID', key, [row.id, row.name, row.grade, row.classroom, JSON.stringify(row.subjects), row.englishLevel, row.mathLevel, JSON.stringify(row.lessons), new Date(), row.row]);
  audit_('staff', staff.id, staff.name, 'refreshEnrollment', 'student', row.id, {}, 'ok');
  return row;
}

function listStaff_(p) {
  requireStaff_(p.token);
  return staffForClassroom_(p.classroom);
}

function staffForClassroom_(classroom) {
  return readStaff_().filter(x => x.active && x.permission >= 1 && x.classrooms.indexOf(classroom) >= 0).map(publicStaff_);
}

function startLesson_(p) {
  const loginStaff = requireStaff_(p.token);
  const student = readStudents_().find(x => x.id === clean_(p.studentId));
  if (!student) throw new Error('生徒が見つかりません。');
  if (APP.SUBJECTS.indexOf(p.subject) < 0) throw new Error('科目を選択してください。');
  const assigned = readStaff_().find(x => x.id === clean_(p.staffId) && x.active && x.permission >= 1 && x.classrooms.indexOf(student.classroom) >= 0);
  if (!assigned) throw new Error('教室に在籍する講師を選択してください。');
  const date = today_();
  const key = [date, student.id, p.subject].join(':');
  let lesson = rows_('授業記録').find(r => r['冪等キー'] === key);
  if (!lesson) {
    const id = id_('lesson');
    sheet_('授業記録').appendRow([id, student.id, date, p.subject, assigned.id, assigned.name, student.classroom, new Date(), '', '入力中', new Date(), new Date(), key]);
    lesson = rows_('授業記録').find(r => r['授業ID'] === id);
  }
  audit_('staff', loginStaff.id, loginStaff.name, 'startLesson', 'lesson', lesson['授業ID'], { assignedStaffId: assigned.id }, 'ok');
  const schedule = readSchedule_().find(x => x.id === student.id) || { englishLevel: 3, mathLevel: 3 };
  return { lessonId: lesson['授業ID'], student: publicStudent_(student), subject: p.subject, assignedStaff: publicStaff_(assigned), units: unitsForStudent_(student, p.subject), previousLesson: previousLesson_(student.id, p.subject), progress: progressFor_(student, p.subject, schedule, nextTest_(student.school, student.grade)) };
}

function saveSchoolProgress_(p) {
  const staff = requireStaff_(p.token);
  const lesson = requireLesson_(p.lessonId);
  const unit = unitById_(p.unitId);
  if (!unit || unit['教科'] !== lesson['教科']) throw new Error('学校進度の単元を確認できません。');
  const key = [lesson['生徒ID'], lesson['教科'], today_(), p.unitId].join(':');
  appendUnique_('学校進度履歴', '学校進度ID', key, [key, lesson['授業ID'], lesson['生徒ID'], lesson['教科'], p.unitId, today_(), new Date(), staff.id, staff.name]);
  return { saved: true, unitId: p.unitId, date: today_() };
}

function saveLesson_(p) {
  const staff = requireStaff_(p.token);
  const lesson = requireLesson_(p.lessonId);
  const unitIds = unique_((p.unitIds || []).map(clean_).filter(Boolean));
  if (!unitIds.length) throw new Error('今回進んだ単元を1つ以上選択してください。');
  const valid = Object.fromEntries(unitsForStudent_(studentById_(lesson['生徒ID']), lesson['教科']).map(x => [x.id, x]));
  unitIds.forEach(id => { if (!valid[id]) throw new Error('進行表にない単元が含まれています。'); });
  unitIds.forEach(id => {
    const key = [lesson['授業ID'], id].join(':');
    appendUnique_('授業実施単元', '冪等キー', key, [id_('lu'), lesson['授業ID'], lesson['生徒ID'], lesson['教科'], id, today_(), new Date(), staff.id, staff.name, key]);
  });
  const templates = lesson['教科'] === '数学' ? ['TRYの赤×直し', 'exercise', '宿題の赤×直し'] : lesson['教科'] === '英語' ? ['KeyWords「☆日→英」暗記', 'exercise「暗記マーク」暗記', 'Try赤×直し', 'exercise', '宿題の赤×直し'] : [];
  const chosen = Array.isArray(p.homeworkTypes) ? p.homeworkTypes.filter(x => templates.indexOf(x) >= 0) : templates;
  const due = new Date(); due.setDate(due.getDate() + 2);
  unitIds.forEach(unitId => chosen.forEach(type => {
    const key = [lesson['授業ID'], unitId, type].join(':');
    appendUnique_('宿題', '冪等キー', key, [id_('hw'), lesson['授業ID'], lesson['生徒ID'], lesson['教科'], unitId, type, type, due, new Date(), new Date(), key]);
  }));
  if (clean_(p.otherHomework)) {
    const key = [lesson['授業ID'], 'other', clean_(p.otherHomework)].join(':');
    appendUnique_('宿題', '冪等キー', key, [id_('hw'), lesson['授業ID'], lesson['生徒ID'], lesson['教科'], '', 'その他', clean_(p.otherHomework), due, new Date(), new Date(), key]);
  }
  updateRowById_('授業記録', '授業ID', lesson['授業ID'], { '終了日時': new Date(), '状態': '完了', '更新日時': new Date() });
  audit_('staff', staff.id, staff.name, 'saveLesson', 'lesson', lesson['授業ID'], { unitIds }, 'ok');
  return { saved: true, lessonId: lesson['授業ID'], unitCount: unitIds.length, homeworkCount: unitIds.length * chosen.length + (clean_(p.otherHomework) ? 1 : 0) };
}

function saveCT_(p) {
  const staff = requireStaff_(p.token);
  const lesson = requireLesson_(p.lessonId);
  if (['◎', '〇', '×'].indexOf(p.result) < 0) throw new Error('CT結果を選択してください。');
  const previous = previousLesson_(lesson['生徒ID'], lesson['教科']);
  if (!previous || previous.unitIds.indexOf(p.unitId) < 0) throw new Error('CTは前回範囲から1単元だけ選択してください。');
  const key = lesson['授業ID'] + ':ct';
  let ct = rows_('CT記録').find(r => r['冪等キー'] === key);
  if (!ct) {
    const ctId = id_('ct');
    sheet_('CT記録').appendRow([ctId, lesson['授業ID'], lesson['生徒ID'], lesson['教科'], p.unitId, p.result, today_(), staff.id, staff.name, new Date(), new Date(), key]);
    ct = rows_('CT記録').find(r => r['CTID'] === ctId);
  } else {
    updateRowById_('CT記録', 'CTID', ct['CTID'], { '単元ID': p.unitId, '結果': p.result, '更新日時': new Date() });
  }
  if (p.result === '×') ensureTrainingAndMail_(ct['CTID'], lesson, p.unitId, staff);
  return { saved: true, result: p.result, training: p.result === '×' };
}

function ensureTrainingAndMail_(ctId, lesson, unitId, staff) {
  const existing = rows_('特訓部屋対応').find(r => r['CTID'] === ctId);
  if (!existing) sheet_('特訓部屋対応').appendRow([id_('training'), ctId, lesson['生徒ID'], lesson['教科'], unitId, '未対応', '', '', '', '', '', '未連絡', new Date(), new Date()]);
  const key = 'ct-fail:' + ctId;
  if (rows_('メール通知履歴').some(r => r['冪等キー'] === key)) return;
  const settings = settings_();
  const suppressed = truthy_(settings.MAIL_SUPPRESS);
  let status = suppressed ? '抑止' : '送信済み', error = '';
  if (!suppressed) {
    try {
      const student = studentById_(lesson['生徒ID']); const unit = unitById_(unitId);
      MailApp.sendEmail(settings.MAIL_TO || 'mintcocoajasmine@gmail.com', '【フォレスタ進捗管理】CT×・特訓部屋対象', [
        '生徒名: ' + student.name, '生徒ID: ' + student.id, '教室: ' + student.classroom, '学校名: ' + student.school, '学年: ' + student.grade,
        '教科: ' + lesson['教科'], 'CT対象単元: ' + (unit ? unit['単元名'] : unitId), 'CT結果: ×', '実施日: ' + today_(), '担当講師: ' + staff.name, '特訓部屋対象になりました。'
      ].join('\n'));
    } catch (e) { status = '失敗'; error = String(e); }
  }
  sheet_('メール通知履歴').appendRow([id_('mail'), 'CT×', ctId, settings.MAIL_TO || 'mintcocoajasmine@gmail.com', suppressed, status, status === '送信済み' ? new Date() : '', error, key]);
}

function markHomeworkTeacher_(p) {
  const staff = requireStaff_(p.token);
  const h = rows_('宿題').find(r => r['宿題ID'] === p.homeworkId);
  if (!h) throw new Error('宿題を確認できません。');
  const key = p.homeworkId + ':teacher';
  upsertByKey_('宿題の講師チェック', '冪等キー', key, [id_('ht'), p.homeworkId, staff.id, staff.name, !!p.checked, new Date(), new Date(), key]);
  return { homeworkId: p.homeworkId, checked: !!p.checked, at: nowIso_() };
}

function saveComment_(p) {
  const staff = requireStaff_(p.token);
  const lesson = requireLesson_(p.lessonId);
  const text = clean_(p.comment);
  if (!text) throw new Error('コメントを入力してください。');
  const id = id_('comment');
  sheet_('講師コメント').appendRow([id, lesson['授業ID'], lesson['生徒ID'], lesson['教科'], staff.id, staff.name, text, new Date(), new Date()]);
  return { id, saved: true };
}

function todayOverview_(p) {
  requireStaff_(p.token);
  const today = today_();
  const day = ['日', '月', '火', '水', '木', '金', '土'][new Date().getDay()];
  const students = Object.fromEntries(readStudents_().map(x => [x.id, x]));
  const schedules = readSchedule_();
  const lessonRows = rows_('授業記録').filter(r => dateString_(r['授業日']) === today);
  const units = rows_('授業実施単元');
  const ct = rows_('CT記録');
  const comments = rows_('講師コメント');
  const reads = new Set(rows_('コメント既読管理').map(r => r['コメントID']));
  const trainings = rows_('特訓部屋対応');
  const homeworks = rows_('宿題');
  const teacherChecks = new Set(rows_('宿題の講師チェック').filter(r => truthy_(r['チェック状態'])).map(r => r['宿題ID']));
  let base = schedules.filter(s => s.lessons.some(x => x.day === day));
  if (p.allStudents) base = schedules;
  return base.map(s => {
    const student = students[s.id] || { id: s.id, name: s.name, classroom: s.classroom, grade: s.grade, school: '' };
    const planned = unique_(s.lessons.filter(x => x.day === day).map(x => x.subject));
    const todays = lessonRows.filter(r => r['生徒ID'] === s.id);
    const lessonIds = todays.map(r => r['授業ID']);
    const learned = new Set(units.filter(r => lessonIds.indexOf(r['授業ID']) >= 0).map(r => r['単元ID']));
    const lastCt = ct.filter(r => lessonIds.indexOf(r['授業ID']) >= 0).slice(-1)[0];
    const studentHw = homeworks.filter(r => r['生徒ID'] === s.id);
    const unread = comments.filter(r => r['生徒ID'] === s.id && !reads.has(r['コメントID'])).length;
    const training = trainings.filter(r => r['生徒ID'] === s.id && r['状態'] !== '完了').slice(-1)[0];
    const comparisons = planned.map(subject => progressFor_(student, subject, s, nextTest_(student.school, student.grade)).comparison).filter(Boolean);
    return { ...publicStudent_(student), plannedSubjects: planned, assignedStaff: todays.map(r => r['担当講師名']).join('・') || '未決定', actualSubjects: unique_(todays.map(r => r['教科'])),
      learnedCount: learned.size, remaining: planned.length ? progressFor_(student, planned[0], s, nextTest_(student.school, student.grade)).remaining : null,
      ctResult: lastCt ? lastCt['結果'] : '', homework: { checked: studentHw.filter(h => teacherChecks.has(h['宿題ID'])).length, total: studentHw.length },
      comparison: comparisons.indexOf('遅れ') >= 0 ? '遅れ' : comparisons.indexOf('同じ') >= 0 ? '同じ' : comparisons.indexOf('先行') >= 0 ? '先行' : '未設定',
      unreadComments: unread, trainingStatus: training ? training['状態'] : '', missingRecord: planned.length > 0 && todays.length === 0,
      updatedAt: todays.length ? dateTimeString_(todays[todays.length - 1]['更新日時']) : '' };
  });
}

function adminStudentDetail_(p) {
  requireStaff_(p.token);
  const student = studentById_(p.studentId);
  const bundle = buildStudentBundle_(student);
  bundle.lessons = rows_('授業記録').filter(r => r['生徒ID'] === student.id);
  bundle.lessonUnits = rows_('授業実施単元').filter(r => r['生徒ID'] === student.id);
  bundle.schoolProgress = rows_('学校進度履歴').filter(r => r['生徒ID'] === student.id);
  bundle.ct = rows_('CT記録').filter(r => r['生徒ID'] === student.id);
  bundle.training = rows_('特訓部屋対応').filter(r => r['生徒ID'] === student.id);
  bundle.comments = rows_('講師コメント').filter(r => r['生徒ID'] === student.id);
  bundle.note = activeNote_(student.id);
  return bundle;
}

function saveNote_(p) {
  const staff = requireStaff_(p.token);
  const student = studentById_(p.studentId);
  const text = clean_(p.text);
  if (!text) throw new Error('注意事項を入力してください。');
  const current = rows_('生徒注意事項').filter(r => r['生徒ID'] === student.id);
  const version = current.length ? Math.max.apply(null, current.map(r => Number(r['版']) || 0)) + 1 : 1;
  current.filter(r => truthy_(r['有効'])).forEach(r => updateRowById_('生徒注意事項', '注意事項ID', r['注意事項ID'], { '有効': false, '更新日時': new Date() }));
  const id = id_('note');
  sheet_('生徒注意事項').appendRow([id, student.id, text, version, staff.id, staff.name, new Date(), new Date(), true]);
  return activeNote_(student.id);
}

function activeNote_(studentId) {
  const rows = rows_('生徒注意事項').filter(r => r['生徒ID'] === studentId && truthy_(r['有効']));
  if (!rows.length) return null;
  const r = rows[rows.length - 1];
  return { id: r['注意事項ID'], text: r['注意事項本文'], version: r['版'], author: r['登録者名'], updatedAt: dateTimeString_(r['更新日時']) };
}

function markCommentRead_(p) {
  const staff = requireStaff_(p.token);
  const comment = rows_('講師コメント').find(r => r['コメントID'] === p.commentId);
  if (!comment) throw new Error('コメントが見つかりません。');
  const key = p.commentId + ':' + staff.id;
  appendUnique_('コメント既読管理', '冪等キー', key, [id_('read'), p.commentId, staff.id, staff.name, new Date(), key]);
  return { read: true, at: nowIso_() };
}

function saveTextbook_(p) {
  const staff = requireStaff_(p.token);
  const allowed = UNIT_SOURCES.filter(x => x.subject === '英語').map(x => x.type);
  if (allowed.indexOf(p.textbook) < 0) throw new Error('正式な英語進行表を選択してください。');
  const schoolKey = normalizeSchool_(p.school);
  const source = UNIT_SOURCES.find(x => x.subject === '英語' && x.type === p.textbook);
  const key = schoolKey;
  upsertByKey_('学校別英語教科書設定', '学校名正規化', key, [id_('book'), schoolKey, clean_(p.school), p.textbook, source.fileName, new Date(), staff.id, staff.name]);
  return { school: p.school, textbook: p.textbook };
}

function saveTestRange_(p) {
  const staff = requireStaff_(p.token);
  const kind = p.kind === 'confirmed' ? '学校別決定テスト範囲' : '学校別予想テスト範囲';
  const ids = unique_((p.unitIds || []).map(clean_).filter(Boolean));
  if (!p.testId || !ids.length) throw new Error('テストと単元を選択してください。');
  const sh = sheet_(kind); const values = sh.getDataRange().getValues(); const headers = values[0].map(String);
  for (let i = values.length - 1; i >= 1; i--) {
    const obj = rowObject_(headers, values[i]);
    if (obj['テストID'] === p.testId && normalizeSchool_(obj['学校名表示']) === normalizeSchool_(p.school) && obj['学年'] === normalizeGrade_(p.grade) && obj['教科'] === p.subject) sh.deleteRow(i + 1);
  }
  ids.forEach(unitId => sh.appendRow([id_('range'), p.testId, normalizeSchool_(p.school), clean_(p.school), normalizeGrade_(p.grade), p.subject, unitId, new Date(), new Date(), staff.id, staff.name]));
  return { saved: true, kind: p.kind, count: ids.length };
}

function updateTraining_(p) {
  const staff = requireStaff_(p.token);
  if (['未対応', '実施日決定', '完了'].indexOf(p.status) < 0) throw new Error('特訓部屋の状態を選択してください。');
  updateRowById_('特訓部屋対応', '対応ID', p.trainingId, { '状態': p.status, '実施予定日': p.plannedDate || '', '実施日': p.doneDate || '', '対応者ID': staff.id, '対応者名': staff.name, '備考': clean_(p.note), '保護者連絡状況': clean_(p.contactStatus) || '未連絡', '更新日時': new Date() });
  return { saved: true };
}

function adminSettings_(p) {
  requireStaff_(p.token);
  const schools = gradeRows_('学校マスタ').map(r => r['学校名']);
  const books = rows_('学校別英語教科書設定');
  const trainings = rows_('特訓部屋対応').filter(r => r['状態'] !== '完了');
  return { schools, textbooks: UNIT_SOURCES.filter(x => x.subject === '英語').map(x => x.type), schoolBooks: books, trainings, messageLink: APP.MESSAGE_LINK };
}

function refreshUnitsForApi_(p) {
  const staff = requireStaff_(p.token);
  if (staff.permission < 1) throw new Error('権限がありません。');
  return refreshUnitMaster();
}

function refreshUnitMaster() {
  const sh = sheet_('単元マスタ');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  const out = [];
  UNIT_SOURCES.forEach(source => source.sheets.forEach((sheetName, gradeIndex) => {
    const grade = '中' + (gradeIndex + 1);
    const rows = fetchProgressRows_(source.fileId, sheetName);
    const units = parseProgressRows_(rows, source.subject, grade, source.type, source.fileName, source.fileId, sheetName);
    units.forEach((u, i) => out.push([u.id, source.subject, grade, i + 1, u.chapter, u.number, u.name, u.difficulty, source.type, source.fileName, source.fileId, sheetName, new Date(), new Date()]));
  }));
  if (out.length) sh.getRange(2, 1, out.length, out[0].length).setValues(out);
  CacheService.getScriptCache().remove('unitRows');
  const summary = {};
  out.forEach(r => { const key = r[1] + r[2] + ':' + r[8]; summary[key] = (summary[key] || 0) + 1; });
  return { total: out.length, summary };
}

function fetchProgressRows_(fileId, sheetName) {
  const url = 'https://docs.google.com/spreadsheets/d/' + fileId + '/gviz/tq?tqx=out:html&sheet=' + encodeURIComponent(sheetName);
  const html = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText('UTF-8');
  if (!/<table/i.test(html)) throw new Error('進行表を読み取れません: ' + sheetName);
  return Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map(m => Array.from(m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(c => decodeHtml_(c[1].replace(/<[^>]+>/g, ''))));
}

function parseProgressRows_(rows, subject, grade, type, fileName, fileId, sheetName) {
  const headerAt = rows.findIndex(r => r.filter(x => clean_(x) === 'STEP').length >= 1);
  if (headerAt < 0) throw new Error('STEP見出しを確認できません: ' + fileName + ' / ' + sheetName);
  const header = rows[headerAt].map(clean_); const stepCols = [];
  header.forEach((v, i) => { if (v === 'STEP') stepCols.push(i); });
  const carry = {}; const out = []; let order = 0;
  rows.slice(headerAt + 1).forEach(r => stepCols.forEach((stepCol, block) => {
    const chapterCell = clean_(r[stepCol - 2]); if (chapterCell) carry[block] = chapterCell;
    const difficulty = normalizeDifficulty_(r[stepCol - 1]);
    const step = clean_(r[stepCol]); const title = clean_(r[stepCol + 1]);
    if (!step && !title) return;
    if (/^【ラスト/.test(step) || /^【ラスト/.test(title)) return;
    if (!step && /^(試験範囲|学校進度|指導日|CT)$/.test(title)) return;
    order++;
    const chapter = carry[block] || '';
    const name = title ? (step ? step + ' ' + title : title) : step;
    const raw = [subject, grade, type, sheetName, chapter, step, order].join('|');
    out.push({ id: 'U-' + hash_(raw).slice(0, 16), chapter, number: step || String(order), name, difficulty });
  }));
  return out;
}

function decodeHtml_(s) {
  return String(s || '').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function unitsForStudent_(student, subject) {
  if (subject !== '英語' && subject !== '数学') return [];
  let type = '標準版';
  if (subject === '英語') {
    const setting = rows_('学校別英語教科書設定').filter(r => r['学校名正規化'] === student.schoolKey).slice(-1)[0];
    if (!setting) return [];
    type = setting['英語教科書'];
  }
  const schedule = readSchedule_().find(x => x.id === student.id) || { englishLevel: 3, mathLevel: 3 };
  const level = subject === '英語' ? schedule.englishLevel : schedule.mathLevel;
  const learnedDates = {};
  rows_('授業実施単元').filter(r => r['生徒ID'] === student.id && r['教科'] === subject).forEach(r => {
    if (!learnedDates[r['単元ID']]) learnedDates[r['単元ID']] = [];
    learnedDates[r['単元ID']].push(dateString_(r['実施日']));
  });
  const lastLesson = previousLesson_(student.id, subject); const previousSet = new Set((lastLesson && lastLesson.unitIds) || []);
  const schoolLatest = rows_('学校進度履歴').filter(r => r['生徒ID'] === student.id && r['教科'] === subject).slice(-1)[0];
  const ctByUnit = indexLatest_(rows_('CT記録').filter(r => r['生徒ID'] === student.id && r['教科'] === subject), '単元ID');
  const test = nextTest_(student.school, student.grade); const ranges = rangeSets_(student, subject, test && test.id);
  return unitRows_().filter(r => r['教科'] === subject && r['学年'] === student.grade && r['教科書・進行表の種類'] === type).map(r => ({
    id: r['単元ID'], order: Number(r['表示順']), chapter: r['章'], number: r['単元番号'], name: r['単元名'], difficulty: r['難度'], omittable: isOmittable_(r['難度'], level),
    learnedDates: learnedDates[r['単元ID']] || [], previous: previousSet.has(r['単元ID']), schoolCurrent: !!schoolLatest && schoolLatest['単元ID'] === r['単元ID'],
    predictedInRange: ranges.predicted.has(r['単元ID']), confirmedInRange: ranges.confirmed.has(r['単元ID']), rangeMode: ranges.confirmed.size ? 'confirmed' : ranges.predicted.size ? 'predicted' : 'none',
    ct: ctByUnit[r['単元ID']] ? ctByUnit[r['単元ID']]['結果'] : ''
  }));
}

function progressFor_(student, subject, schedule, test) {
  const units = unitsForStudent_(student, subject);
  if (!units.length) return { subject, status: '進行表未登録または英語教科書未設定', comparison: '未設定', remaining: null, lessonsRemaining: null, requiredPerLesson: null, units: [] };
  const learned = units.filter(u => u.learnedDates.length); const forestaOrder = learned.length ? Math.max.apply(null, learned.map(u => u.order)) : 0;
  const school = units.find(u => u.schoolCurrent); const schoolOrder = school ? school.order : 0;
  const comparison = !schoolOrder ? '未設定' : forestaOrder > schoolOrder ? '先行' : forestaOrder === schoolOrder ? '同じ' : '遅れ';
  const activeRange = units.some(u => u.confirmedInRange) ? units.filter(u => u.confirmedInRange) : units.filter(u => u.predictedInRange);
  let remaining = null, lessonsRemaining = null, requiredPerLesson = null;
  if (test && activeRange.length) {
    remaining = activeRange.filter(u => !u.omittable && !u.learnedDates.length).length;
    const target = new Date(test.start + 'T00:00:00'); target.setDate(target.getDate() - 14);
    lessonsRemaining = Math.max(0, Math.ceil((startOfDay_(target) - startOfDay_(new Date())) / (7 * 86400000)));
    requiredPerLesson = remaining === 0 ? 0 : lessonsRemaining > 0 ? Math.ceil(remaining / lessonsRemaining) : null;
  }
  return { subject, comparison, forestaUnit: units.find(u => u.order === forestaOrder) || null, schoolUnit: school || null, remaining, lessonsRemaining, requiredPerLesson, emergency: remaining > 0 && lessonsRemaining === 0, units };
}

function rangeSets_(student, subject, testId) {
  if (!testId) return { predicted: new Set(), confirmed: new Set() };
  const match = r => r['テストID'] === testId && r['学校名正規化'] === student.schoolKey && r['学年'] === student.grade && r['教科'] === subject;
  return { predicted: new Set(rows_('学校別予想テスト範囲').filter(match).map(r => r['単元ID'])), confirmed: new Set(rows_('学校別決定テスト範囲').filter(match).map(r => r['単元ID'])) };
}

function isOmittable_(difficulty, level) {
  const d = normalizeDifficulty_(difficulty);
  return Number(level) === 1 ? d === '!' || d === '!!' : Number(level) === 2 ? d === '!!' : false;
}

function previousLesson_(studentId, subject) {
  const lessons = rows_('授業記録').filter(r => r['生徒ID'] === studentId && (!subject || r['教科'] === subject) && r['状態'] === '完了').sort((a, b) => String(a['授業日']).localeCompare(String(b['授業日'])));
  if (!lessons.length) return null;
  const lesson = lessons[lessons.length - 1];
  return { lessonId: lesson['授業ID'], date: dateString_(lesson['授業日']), subject: lesson['教科'], staff: lesson['担当講師名'], unitIds: rows_('授業実施単元').filter(r => r['授業ID'] === lesson['授業ID']).map(r => r['単元ID']) };
}

function requireLesson_(id) {
  const r = rows_('授業記録').find(x => x['授業ID'] === id); if (!r) throw new Error('授業記録が見つかりません。'); return r;
}
function studentById_(id) { const x = readStudents_().find(s => s.id === clean_(id)); if (!x) throw new Error('生徒が見つかりません。'); return x; }
function unitById_(id) { return unitRows_().find(r => r['単元ID'] === id) || null; }
function unitRows_() { return rows_('単元マスタ'); }

function settings_() { const out = {}; rows_('設定').forEach(r => out[r['キー']] = r['値']); return out; }
function db_() { return SpreadsheetApp.openById(APP.DB_ID); }
function sheet_(name) { const sh = db_().getSheetByName(name); if (!sh) throw new Error('保存シートがありません: ' + name); return sh; }
function rows_(name) { const sh = sheet_(name); const v = sh.getDataRange().getValues(); if (v.length < 2) return []; const h = v[0].map(String); return v.slice(1).filter(r => r.some(x => x !== '')).map(r => rowObject_(h, r)); }
function gradeRows_(name) { const sh = SpreadsheetApp.openById(APP.GRADE_DATA_ID).getSheetByName(name); const v = sh.getDataRange().getValues(); const h = v[0].map(String); return v.slice(1).filter(r => r[0] !== '').map(r => rowObject_(h, r)); }
function rowObject_(headers, row) { const o = {}; headers.forEach((h, i) => o[h] = row[i]); return o; }

function upsertByKey_(sheetName, keyHeader, key, row) {
  const sh = sheet_(sheetName); const v = sh.getDataRange().getValues(); const headers = v[0].map(String); const idx = headers.indexOf(keyHeader); if (idx < 0) throw new Error('キー列がありません。');
  for (let i = 1; i < v.length; i++) if (String(v[i][idx]) === String(key)) { sh.getRange(i + 1, 1, 1, row.length).setValues([row]); return i + 1; }
  sh.appendRow(row); return sh.getLastRow();
}
function appendUnique_(sheetName, keyHeader, key, row) { if (rows_(sheetName).some(r => String(r[keyHeader]) === String(key))) return false; sheet_(sheetName).appendRow(row); return true; }
function updateRowById_(sheetName, idHeader, id, changes) {
  const sh = sheet_(sheetName); const v = sh.getDataRange().getValues(); const h = v[0].map(String); const idCol = h.indexOf(idHeader); if (idCol < 0) throw new Error('ID列がありません。');
  for (let i = 1; i < v.length; i++) if (String(v[i][idCol]) === String(id)) { Object.keys(changes).forEach(k => { const c = h.indexOf(k); if (c >= 0) sh.getRange(i + 1, c + 1).setValue(changes[k]); }); return; }
  throw new Error('更新対象が見つかりません。');
}
function indexLatest_(rows, key) { const out = {}; rows.forEach(r => out[r[key]] = r); return out; }

function audit_(type, userId, userName, action, targetType, targetId, detail, result) { sheet_('操作履歴').appendRow([id_('audit'), new Date(), type, userId, userName, action, targetType, targetId, JSON.stringify(detail || {}), result]); }
function id_(prefix) { return prefix + '-' + Utilities.getUuid(); }
function today_() { return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd'); }
function nowIso_() { return Utilities.formatDate(new Date(), APP.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function dateString_(v) { if (!v) return ''; const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? String(v) : Utilities.formatDate(d, APP.TZ, 'yyyy-MM-dd'); }
function dateTimeString_(v) { if (!v) return ''; const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? String(v) : Utilities.formatDate(d, APP.TZ, 'yyyy-MM-dd HH:mm'); }
function startOfDay_(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function clean_(v) { return String(v == null ? '' : v).replace(/[\u3000\s]+/g, ' ').trim(); }
function normalizeGrade_(v) { const s = clean_(v).normalize('NFKC'); const m = s.match(/([1-3])/); return m ? '中' + m[1] : s; }
function normalizeSchool_(v) { return clean_(v).normalize('NFKC').replace(/\s/g, '').replace(/中学校/g, '中'); }
function normalizeDifficulty_(v) { return clean_(v).replace(/！/g, '!').replace(/!\s*!/g, '!!'); }
function normalizeSearch_(v) { return clean_(v).normalize('NFKC').replace(/\s/g, '').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).toLowerCase(); }
function unique_(a) { return Array.from(new Set(a)); }
function truthy_(v) { return v === true || ['true', '1', 'yes', '済', '完了'].indexOf(String(v).toLowerCase()) >= 0; }
