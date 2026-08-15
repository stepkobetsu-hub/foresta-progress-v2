const CONFIG = Object.freeze({
  DATA_SPREADSHEET_ID: '11qBwaLVgZV2bD6bb4HY7-osvs58dBEZVaZo4UYNK7ec',
  MASTER_SPREADSHEET_ID: '1CIJkTlYUcUkbb8jBdFc6L8D5ubTGsxwNxFv01ten-Zk',
  MASTER_SHEET: '☆マスタ',
  TIMETABLE_SHEET: '時間割マスタ',
  TEACHER_SPREADSHEET_ID: '1L5aFDXAmfUDkBg8d7X3WqJgMhdMq5tM5sfUZ2G-M58E',
  TEACHER_SHEET: '講師マスター',
  SCORE_API_URL: 'https://script.google.com/macros/s/AKfycbypkUc0MqZ07E7pZRglNPeRM56WbCcuWaLpRzi9bVFcPklHDxaaLC7GfzG6ozTGCbEX/exec',
  TRAINING_EMAIL: 'mintcocoajasmine@gmail.com',
  TIME_ZONE: 'Asia/Tokyo',
  SESSION_PREFIX: 'FORESTA_SESSION_',
  SHARED_SESSION_HOURS: 8,
  PERSONAL_SESSION_DAYS: 30,
});

const ACTIVE_SUBJECTS = ['国語', '数学', '英語', '理科', '社会'];
const TRACKED_SUBJECTS = ['英語', '数学'];
let REQUEST_CACHE = {};

function doGet(e) {
  return json_({ ok: true, app: 'フォレスタ進捗管理', version: '2.0.0', time: nowIso_() });
}

function doPost(e) {
  try {
    REQUEST_CACHE = {};
    const data = parseRequest_(e);
    const result = route_(data);
    return json_(Object.assign({ ok: true }, result || {}));
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return json_({ ok: false, message: publicError_(error) });
  }
}

function route_(data) {
  switch (String(data.action || '')) {
    case 'health': return { status: 'ready', timeZone: CONFIG.TIME_ZONE };
    case 'studentLogin': return studentLogin_(data);
    case 'staffLogin': return staffLogin_(data);
    case 'resumeSession': return resumeSession_(data);
    case 'logout': return logout_(data);
    case 'adminReauth': return adminReauth_(data);
    case 'resumeAdminSession': return resumeAdminSession_(data);
    case 'searchStudents': return searchStudents_(data);
    case 'getStudentDashboard': return getStudentDashboard_(data);
    case 'getProgression': return getProgression_(data);
    case 'getTeacherToday': return getTeacherToday_(data);
    case 'getAdminDashboard': return getAdminDashboard_(data, false);
    case 'getAdminStudents': return getAdminDashboard_(data, true);
    case 'getAdminStudentDetail': return getAdminStudentDetail_(data);
    case 'getRangeSetup': return getRangeSetup_(data);
    case 'getRangeOptions': return getRangeOptions_(data);
    case 'getRangeEditor': return getRangeEditor_(data);
    case 'saveRange': return saveRange_(data);
    case 'saveSchoolPosition': return saveSchoolPosition_(data);
    case 'saveLesson': return saveLesson_(data);
    case 'saveCt': return saveCt_(data);
    case 'studentCheckHomework': return studentCheckHomework_(data);
    case 'teacherCheckHomework': return teacherCheckHomework_(data);
    case 'saveTargets': return saveTargets_(data);
    case 'saveComment': return saveComment_(data);
    case 'saveNote': return saveNote_(data);
    case 'markCommentRead': return markCommentRead_(data);
    case 'getTrainingRoom': return getTrainingRoom_(data);
    case 'updateTrainingRoom': return updateTrainingRoom_(data);
    case 'refreshSubjectCache': return refreshSubjectCache_(data);
    case 'saveSchoolTextbook': return saveSchoolTextbook_(data);
    default: throw new Error('INVALID_ACTION');
  }
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) return e && e.parameter ? e.parameter : {};
  try { return JSON.parse(e.postData.contents); } catch (_) { throw new Error('INVALID_REQUEST'); }
}

function json_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}

function publicError_(error) {
  const code = String(error && error.message || 'UNKNOWN');
  const map = {
    INVALID_ACTION: '処理を実行できません。', INVALID_REQUEST: '入力内容を確認してください。',
    AUTH_REQUIRED: 'ログインの有効期限が切れました。もう一度ログインしてください。',
    FORBIDDEN: 'この操作を行う権限がありません。', LOGIN_FAILED: 'IDまたはパスワードを確認してください。',
    STUDENT_NOT_FOUND: '対象の生徒を確認できません。', LEVEL_MISSING: '受講レベルが未登録です。',
    TEST_NOT_FOUND: '次回テストが未登録です。', PROGRESSION_NOT_FOUND: '進行表未登録です。',
    INVALID_UNIT: '選択した単元を確認してください。', DUPLICATE_CT: 'この授業のCTはすでに登録されています。',
    CT_NOT_PREVIOUS: 'CTは前回授業範囲から1単元だけ選んでください。', INVALID_VALUE: '入力内容を確認してください。',
    OUTSIDE_TEST_RANGE: '中1・中2はテスト範囲外へ進めません。範囲内の復習単元を選んでください。',
  };
  return map[code] || '処理に失敗しました。時間を置いてもう一度お試しください。';
}

function nowIso_() { return Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function todayKey_() { return Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'yyyy-MM-dd'); }
function uuid_(prefix) { return prefix + '-' + Utilities.getUuid(); }
function text_(value) { return String(value == null ? '' : value).trim(); }
function normalizeText_(value) { return text_(value).normalize('NFKC').replace(/[\s　]+/g, '').toLowerCase(); }
function normalizeSchool_(value) { return normalizeText_(value).replace(/中学校$/u, '中'); }
function normalizeGrade_(value) {
  const source = normalizeText_(value).replace(/^中学/u, '中').replace(/年$/u, '');
  const match = source.match(/中?([123])/u);
  return match ? '中' + match[1] : source;
}
function activeStatus_(value) { const status = text_(value); return status === '1' || status === '0'; }
function kanaFold_(value) { return normalizeText_(value).replace(/[ァ-ヶ]/g, function(ch) { return String.fromCharCode(ch.charCodeAt(0) - 0x60); }); }

function digest_(token) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8)
    .map(function(byte) { return ('0' + (byte & 255).toString(16)).slice(-2); }).join('');
}

function issueSession_(profile, deviceMode) {
  const token = Utilities.getUuid() + '-' + Utilities.getUuid();
  const now = Date.now();
  const expiry = now + (deviceMode === 'personal' ? CONFIG.PERSONAL_SESSION_DAYS * 86400000 : CONFIG.SHARED_SESSION_HOURS * 3600000);
  const session = Object.assign({}, profile, { deviceMode: deviceMode === 'personal' ? 'personal' : 'shared', issuedAt: nowIso_(), expiresAt: new Date(expiry).toISOString() });
  PropertiesService.getScriptProperties().setProperty(CONFIG.SESSION_PREFIX + digest_(token), JSON.stringify(session));
  return Object.assign({ token: token }, publicSession_(session));
}

function loadSession_(token) {
  if (!token) throw new Error('AUTH_REQUIRED');
  const props = PropertiesService.getScriptProperties();
  const key = CONFIG.SESSION_PREFIX + digest_(String(token));
  const raw = props.getProperty(key);
  if (!raw) throw new Error('AUTH_REQUIRED');
  const session = JSON.parse(raw);
  if (new Date(session.expiresAt).getTime() <= Date.now()) { props.deleteProperty(key); throw new Error('AUTH_REQUIRED'); }
  return session;
}

function requireRole_(data, roles) {
  const session = loadSession_(data.token);
  if (roles.indexOf(session.role) < 0) throw new Error('FORBIDDEN');
  return session;
}

function requireAdmin_(data) {
  const session = loadSession_(data.adminToken);
  if (session.role !== 'admin' || Number(session.permission || 0) < 1) throw new Error('FORBIDDEN');
  return session;
}

function publicSession_(session) {
  return {
    role: session.role, loginId: session.loginId || session.studentId || '', studentId: session.studentId || '',
    name: session.name || '', campus: session.campus || '', grade: session.grade || '', school: session.school || '',
    permission: Number(session.permission || 0), deviceMode: session.deviceMode || 'shared', expiresAt: session.expiresAt,
  };
}

function studentLogin_(data) {
  const id = text_(data.loginId || data.studentId);
  const password = String(data.password || '');
  const source = getMasterRows_();
  for (let i = 1; i < source.length; i++) {
    const row = source[i];
    if (text_(row[0]) === id && activeStatus_(row[1]) && String(row[11] == null ? '' : row[11]) === password) {
      const profile = studentFromMasterRow_(row);
      return { session: issueSession_(Object.assign({ role: 'student' }, profile), data.deviceMode) };
    }
  }
  throw new Error('LOGIN_FAILED');
}

function staffLogin_(data) {
  const code = text_(data.loginId || data.code);
  const password = String(data.password || '');
  const teacher = getActiveTeachers_().find(function(row) { return row.loginId === code; });
  if (!teacher || String(teacher.password || '') !== password) throw new Error('LOGIN_FAILED');
  return { session: issueSession_({ role: 'teacher', loginId: teacher.loginId, name: teacher.name, campus: teacher.campus, permission: teacher.permission }, data.deviceMode) };
}

function resumeSession_(data) { return { session: Object.assign({ token: String(data.token || '') }, publicSession_(loadSession_(data.token))) }; }
function logout_(data) { if (data.token) PropertiesService.getScriptProperties().deleteProperty(CONFIG.SESSION_PREFIX + digest_(String(data.token))); if (data.adminToken) PropertiesService.getScriptProperties().deleteProperty(CONFIG.SESSION_PREFIX + digest_(String(data.adminToken))); return { loggedOut: true }; }

function adminReauth_(data) {
  const current = requireRole_(data, ['teacher']);
  const code = text_(data.code);
  const teacher = getActiveTeachers_().find(function(row) { return row.loginId === code; });
  if (!teacher || Number(teacher.permission || 0) < 1 || String(teacher.password || '') !== String(data.password || '') || code !== current.loginId) throw new Error('LOGIN_FAILED');
  const token = Utilities.getUuid() + '-' + Utilities.getUuid();
  const admin = { role: 'admin', loginId: teacher.loginId, name: teacher.name, campus: teacher.campus, permission: teacher.permission, deviceMode: 'personal', expiresAt: '9999-12-31T23:59:59.999Z', issuedAt: nowIso_() };
  PropertiesService.getScriptProperties().setProperty(CONFIG.SESSION_PREFIX + digest_(token), JSON.stringify(admin));
  return { adminToken: token, session: Object.assign({ token: token }, publicSession_(admin)), expiresAt: admin.expiresAt };
}

function resumeAdminSession_(data) {
  const admin = requireAdmin_(data);
  return { adminToken: String(data.adminToken || ''), session: Object.assign({ token: String(data.adminToken || '') }, publicSession_(admin)) };
}

function getMasterRows_() { if(REQUEST_CACHE.masterRows)return REQUEST_CACHE.masterRows;return REQUEST_CACHE.masterRows=SpreadsheetApp.openById(CONFIG.MASTER_SPREADSHEET_ID).getSheetByName(CONFIG.MASTER_SHEET).getDataRange().getValues(); }
function studentFromMasterRow_(row) {
  return { studentId: text_(row[0]), status: text_(row[1]), name: text_(row[4]), reading: text_(row[5]), campus: text_(row[7]), grade: normalizeGrade_(row[10]), school: text_(row[15]), schoolKey: normalizeSchool_(row[15]) };
}
function getActiveStudents_() {
  if(REQUEST_CACHE.activeStudents)return REQUEST_CACHE.activeStudents;
  const rows = getMasterRows_(), students = [];
  for (let i = 1; i < rows.length; i++) if (activeStatus_(rows[i][1])) students.push(studentFromMasterRow_(rows[i]));
  return REQUEST_CACHE.activeStudents=students;
}
function getActiveStudent_(studentId) {
  const id = text_(studentId);
  const row = getActiveStudents_().find(function(student) { return student.studentId === id; });
  if (!row) throw new Error('STUDENT_NOT_FOUND');
  return row;
}

function getActiveTeachers_() {
  if(REQUEST_CACHE.activeTeachers)return REQUEST_CACHE.activeTeachers;
  const rows = SpreadsheetApp.openById(CONFIG.TEACHER_SPREADSHEET_ID).getSheetByName(CONFIG.TEACHER_SHEET).getDataRange().getValues();
  const out = [];
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (text_(row[3]) !== '1') continue;
    out.push({ loginId: text_(row[0]), name: text_(row[1]), campus: text_(row[17]), password: String(row[35] == null ? '' : row[35]), permission: Number(row[36] || 0) });
  }
  return REQUEST_CACHE.activeTeachers=out;
}
function teacherMatchesCampus_(teacherCampus, studentCampus) { return text_(teacherCampus).split('・').map(text_).indexOf(text_(studentCampus)) >= 0; }

function getTimetableRows_() { if(REQUEST_CACHE.timetableRows)return REQUEST_CACHE.timetableRows;return REQUEST_CACHE.timetableRows=SpreadsheetApp.openById(CONFIG.MASTER_SPREADSHEET_ID).getSheetByName(CONFIG.TIMETABLE_SHEET).getDataRange().getDisplayValues(); }
function timetableMap_() {
  const rows = getTimetableRows_(), map = {};
  for (let i = 2; i < rows.length; i++) {
    const id = text_(rows[i][0]); if (!id) continue;
    const subjects = [];
    for (let col = 4; col < 28; col++) if (ACTIVE_SUBJECTS.indexOf(text_(rows[i][col])) >= 0 && subjects.indexOf(text_(rows[i][col])) < 0) subjects.push(text_(rows[i][col]));
    map[id] = { subjects: subjects, englishLevel: text_(rows[i][40]), mathLevel: text_(rows[i][41]) };
  }
  return map;
}
function subjectCacheMap_(){const map={};objects_('受講科目キャッシュ').forEach(function(row){const id=text_(row['生徒ID']);if(!id)return;if(!map[id])map[id]={subjects:[],englishLevel:text_(row['英語レベル']),mathLevel:text_(row['数学レベル'])};const subject=text_(row['受講科目']);if(subject&&map[id].subjects.indexOf(subject)<0)map[id].subjects.push(subject);if(!map[id].englishLevel)map[id].englishLevel=text_(row['英語レベル']);if(!map[id].mathLevel)map[id].mathLevel=text_(row['数学レベル']);});return map;}

function searchStudents_(data) {
  requireRole_(data, ['teacher']);
  const query = kanaFold_(data.query), campus = normalizeText_(data.campus), grade = normalizeGrade_(data.grade);
  const source = getActiveStudents_();
  const students = source.filter(function(student) {
    if (campus && normalizeText_(student.campus) !== campus) return false;
    if (grade && student.grade !== grade) return false;
    if (!query) return true;
    const haystack = kanaFold_([student.studentId, student.name, student.reading, student.campus, student.grade, student.school].join(' '));
    return haystack.indexOf(query) >= 0;
  }).slice(0, 50);
  return { students: students };
}

function dataSheet_(name) { if(REQUEST_CACHE['sheet:'+name])return REQUEST_CACHE['sheet:'+name];const book=REQUEST_CACHE.dataBook||(REQUEST_CACHE.dataBook=SpreadsheetApp.openById(CONFIG.DATA_SPREADSHEET_ID)),sheet=book.getSheetByName(name); if (!sheet) throw new Error('SHEET_NOT_FOUND'); return REQUEST_CACHE['sheet:'+name]=sheet; }
function objects_(name) {
  if(REQUEST_CACHE['objects:'+name])return REQUEST_CACHE['objects:'+name];
  const values = dataSheet_(name).getDataRange().getValues(); if (!values.length) return [];
  const headers = values[0].map(text_); return REQUEST_CACHE['objects:'+name]=values.slice(1).filter(function(row) { return row.some(function(value) { return value !== '' && value != null; }); }).map(function(row) { const item = {}; headers.forEach(function(header, index) { item[header] = row[index]; }); return item; });
}
function appendObject_(name, object) {
  const sheet = dataSheet_(name); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(text_);
  sheet.appendRow(headers.map(function(header) { return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : ''; }));
  delete REQUEST_CACHE['objects:'+name];
}
function replaceRows_(name, predicate, newObjects) {
  const sheet = dataSheet_(name), values = sheet.getDataRange().getValues(); if (!values.length) return;
  const headers = values[0].map(text_); const keep = [headers];
  for (let i = 1; i < values.length; i++) { const item = {}; headers.forEach(function(header, col) { item[header] = values[i][col]; }); if (!predicate(item)) keep.push(values[i]); }
  (newObjects || []).forEach(function(object) { keep.push(headers.map(function(header) { return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : ''; })); });
  sheet.clearContents(); sheet.getRange(1, 1, keep.length, headers.length).setValues(keep);
  delete REQUEST_CACHE['objects:'+name];
}

function authorizeStudentAccess_(data) {
  const session = loadSession_(data.token);
  let studentId = text_(data.studentId || session.studentId);
  if (session.role === 'student' && studentId !== session.studentId) throw new Error('FORBIDDEN');
  if (['student', 'teacher'].indexOf(session.role) < 0) throw new Error('FORBIDDEN');
  return { session: session, student: getActiveStudent_(studentId) };
}

function getStudentDashboard_(data) {
  const access = authorizeStudentAccess_(data), student = access.student, tt = subjectCacheMap_()[student.studentId] || { subjects: [], englishLevel: '', mathLevel: '' };
  student.subjects = tt.subjects; student.englishLevel = tt.englishLevel; student.mathLevel = tt.mathLevel;
  const nextTest = nextTestFor_(student), scores = scoreHistory_(student.studentId), targets = targetsFor_(student.studentId, nextTest && nextTest.testId), homework = homeworkFor_(student.studentId), note = latestNote_(student.studentId);
  const progress = TRACKED_SUBJECTS.map(function(subject) { return progressionFor_(student, subject, false).summary; });
  const response = { student: student, nextTest: nextTest, scores: scores, targets: targets, homework: homework, note: note, progress: progress };
  if (access.session.role === 'teacher') response.teacherCandidates = getActiveTeachers_().filter(function(t) { return teacherMatchesCampus_(t.campus, student.campus); }).map(function(t) { return { loginId: t.loginId, name: t.name, campus: t.campus }; });
  return response;
}

function scoreHistory_(studentId) {
  try {
    const response = UrlFetchApp.fetch(CONFIG.SCORE_API_URL, { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify({ action: 'getStudentScores', studentId: studentId }), muteHttpExceptions: true, followRedirects: true });
    const json = JSON.parse(response.getContentText()); return json.success ? (json.scores || []) : [];
  } catch (_) { return []; }
}

function nextTestFor_(student) {
  if (!student.schoolKey || !/^中[123]$/.test(student.grade)) return null;
  const today = new Date(todayKey_() + 'T00:00:00+09:00').getTime();
  const tests = objects_('学校テスト日程キャッシュ').filter(function(row) { return normalizeSchool_(row['学校名正規化キー']) === student.schoolKey && normalizeGrade_(row['学年']) === student.grade && new Date(row['テスト終了日']).getTime() >= today; }).sort(function(a, b) { return new Date(a['テスト開始日']) - new Date(b['テスト開始日']); });
  if (!tests.length) return null;
  const row = tests[0], start = new Date(row['テスト開始日']), end = new Date(row['テスト終了日']);
  return { testId: text_(row['テストID']), name: text_(row['テスト名称']), count: Number(row['テスト回数'] || 0), startDate: start.toISOString(), endDate: end.toISOString(), daysUntil: Math.ceil((new Date(Utilities.formatDate(start, CONFIG.TIME_ZONE, 'yyyy-MM-dd') + 'T00:00:00+09:00').getTime() - today) / 86400000) };
}

function unitsFor_(student, subject) {
  let textbook = '標準版';
  if (subject === '英語') {
    const setting = objects_('学校別英語教科書設定').find(function(row) { return normalizeSchool_(row['学校名正規化キー']) === student.schoolKey; });
    textbook = setting ? text_(setting['教科書']) : '';
  }
  if (!textbook) return { textbook: '', units: [] };
  const cache = CacheService.getScriptCache(), key = 'UNITS_' + subject + '_' + student.grade + '_' + textbook;
  const hit = cache.get(key); if (hit) return { textbook: textbook, units: JSON.parse(hit) };
  const units = objects_('単元マスタ').filter(function(row) { return text_(row['教科']) === subject && normalizeGrade_(row['学年']) === student.grade && text_(row['教科書または進行表の種類']) === textbook; }).map(function(row) { return { unitId: text_(row['単元ID']), subject: subject, grade: student.grade, displayOrder: Number(row['表示順'] || 0), chapter: text_(row['章']), unitNumber: text_(row['単元番号']), unitName: text_(row['単元名']), difficulty: text_(row['難度']), textbook: textbook }; }).sort(function(a, b) { return a.displayOrder - b.displayOrder; });
  if (JSON.stringify(units).length < 95000) cache.put(key, JSON.stringify(units), 21600);
  return { textbook: textbook, units: units };
}

function omission_(difficulty, level) {
  const diff = text_(difficulty).replace(/[！❕]/g, '!').replace(/‼/g, '!!'), lv = Number(level);
  if (lv === 1) return diff === '!' || diff === '!!'; if (lv === 2) return diff === '!!'; return false;
}

function progressionFor_(student, subject, includeUnits) {
  const source = unitsFor_(student, subject), units = source.units, nextTest = nextTestFor_(student), tt = subjectCacheMap_()[student.studentId] || {}, level = subject === '英語' ? tt.englishLevel : tt.mathLevel;
  const lessons = objects_('授業記録').filter(function(row) { return text_(row['生徒ID']) === student.studentId && text_(row['科目']) === subject; });
  const lessonUnits = objects_('授業実施単元').filter(function(row) { return text_(row['生徒ID']) === student.studentId && text_(row['科目']) === subject; });
  const dateMap = {}; lessonUnits.forEach(function(row) { const id = text_(row['単元ID']); if (!dateMap[id]) dateMap[id] = []; dateMap[id].push(new Date(row['実施日'])); });
  Object.keys(dateMap).forEach(function(id) { dateMap[id].sort(function(a, b) { return a - b; }); });
  lessons.sort(function(a, b) { return new Date(b['授業日']) - new Date(a['授業日']); });
  const previousLesson = lessons[0], previousIds = new Set(previousLesson ? lessonUnits.filter(function(row) { return text_(row['授業ID']) === text_(previousLesson['授業ID']); }).map(function(row) { return text_(row['単元ID']); }) : []);
  const schoolRows = objects_('学校進度履歴').filter(function(row) { return text_(row['生徒ID']) === student.studentId && text_(row['科目']) === subject; }).sort(function(a, b) { return new Date(b['登録日']) - new Date(a['登録日']); });
  const schoolUnitId = schoolRows.length ? text_(schoolRows[0]['単元ID']) : '';
  const ctRows = objects_('CT記録').filter(function(row) { return text_(row['生徒ID']) === student.studentId && text_(row['科目']) === subject; }); const ctMap = {}; ctRows.forEach(function(row) { ctMap[text_(row['単元ID'])] = text_(row['結果']); });
  const predicted = rangeIds_('学校別予想テスト範囲', student, subject, nextTest && nextTest.testId), decided = rangeIds_('学校別決定テスト範囲', student, subject, nextTest && nextTest.testId), effective = decided.size ? decided : predicted;
  const learned = new Set(Object.keys(dateMap));
  const remainingUnits = effective.size ? units.filter(function(unit) { return effective.has(unit.unitId) && !learned.has(unit.unitId) && !omission_(unit.difficulty, level); }) : [];
  const forestaUnit = units.filter(function(unit) { return learned.has(unit.unitId); }).sort(function(a, b) { return b.displayOrder - a.displayOrder; })[0] || null;
  const schoolUnit = units.find(function(unit) { return unit.unitId === schoolUnitId; }) || null;
  let comparison = '未設定'; if (schoolUnit && forestaUnit) comparison = forestaUnit.displayOrder > schoolUnit.displayOrder ? '学校より先' : forestaUnit.displayOrder === schoolUnit.displayOrder ? '学校と同じ' : '学校より遅れ';
  let remainingLessons = null, required = null, urgent = false;
  if (nextTest && effective.size) { const target = new Date(nextTest.startDate); target.setDate(target.getDate() - 14); const days = Math.ceil((target.getTime() - new Date(todayKey_() + 'T00:00:00+09:00').getTime()) / 86400000); remainingLessons = Math.max(0, Math.ceil(days / 7)); required = remainingLessons > 0 ? Math.ceil(remainingUnits.length / remainingLessons) : null; urgent = remainingLessons <= 0 && remainingUnits.length > 0; }
  const summary = { subject: subject, textbook: source.textbook || '未設定', level: level || '', levelMissing: ['1','2','3'].indexOf(text_(level)) < 0, schoolUnitName: schoolUnit && schoolUnit.unitName, forestaUnitName: forestaUnit && forestaUnit.unitName, comparison: comparison, remaining: effective.size ? remainingUnits.length : null, remainingLessons: remainingLessons, requiredPerLesson: required, urgent: urgent, rangeType:decided.size?'決定':predicted.size?'予想':'', nextTest: nextTest };
  if (!includeUnits) return { summary: summary };
  const decorated = units.map(function(unit) { const dates = dateMap[unit.unitId] || []; return Object.assign({}, unit, { omittable: omission_(unit.difficulty, level), learned: dates.length > 0, learnedAt: dates.length ? dates[0].toISOString() : '', relearnedAt: dates.length > 1 ? dates[dates.length - 1].toISOString() : '', lessonDates: dates.map(function(date){return date.toISOString();}), previous: previousIds.has(unit.unitId), schoolPosition: unit.unitId === schoolUnitId, schoolPositionAt: unit.unitId === schoolUnitId && schoolRows.length ? new Date(schoolRows[0]['登録日']).toISOString() : '', predictedOutside: predicted.size > 0 && !predicted.has(unit.unitId), decidedOutside: decided.size > 0 && !decided.has(unit.unitId), ctResult: ctMap[unit.unitId] || '' }); });
  return { title: student.grade + subject + ' / ' + (source.textbook || '進行表未登録'), units: decorated, selectedUnitIds: [], summary: summary };
}

function rangeIds_(sheetName, student, subject, testId) {
  if (!testId) return new Set();
  return new Set(objects_(sheetName).filter(function(row) { return text_(row['テストID']) === text_(testId) && normalizeSchool_(row['学校名正規化キー']) === student.schoolKey && normalizeGrade_(row['学年']) === student.grade && text_(row['科目']) === subject; }).map(function(row) { return text_(row['単元ID']); }));
}

function getProgression_(data) { const access = authorizeStudentAccess_(data); if (TRACKED_SUBJECTS.indexOf(text_(data.subject)) < 0) return { title: '進行表未登録', units: [], selectedUnitIds: [], summary: {} }; return progressionFor_(access.student, text_(data.subject), true); }

function targetsFor_(studentId, testId) { const out = {}; if (!testId) return out; objects_('テスト別目標点').filter(function(row) { return text_(row['生徒ID']) === studentId && text_(row['テストID']) === testId; }).forEach(function(row) { out[text_(row['科目'])] = row['目標点']; }); return out; }
function latestNote_(studentId) { const rows = objects_('生徒注意事項').filter(function(row) { return text_(row['生徒ID']) === studentId && String(row['有効']).toUpperCase() !== 'FALSE'; }).sort(function(a, b) { return new Date(b['更新日時']) - new Date(a['更新日時']); }); return rows.length ? { text: text_(rows[0]['本文']), updatedAt: rows[0]['更新日時'], updatedBy: text_(rows[0]['操作者名']) } : null; }

function homeworkFor_(studentId) {
  const homeworks = objects_('宿題').filter(function(row) { return text_(row['生徒ID']) === studentId && String(row['有効']).toUpperCase() !== 'FALSE'; });
  const sc = objects_('宿題の生徒チェック'), tc = objects_('宿題の講師チェック');
  const unitMap = {}; objects_('単元マスタ').forEach(function(row) { unitMap[text_(row['単元ID'])] = { unitNumber: text_(row['単元番号']), unitName: text_(row['単元名']) }; });
  return homeworks.map(function(row) {
    const id = text_(row['宿題ID']), student = sc.filter(function(x) { return text_(x['宿題ID']) === id; }).sort(function(a,b){return new Date(b['更新日時'])-new Date(a['更新日時']);})[0], teacher = tc.filter(function(x) { return text_(x['宿題ID']) === id; }).sort(function(a,b){return new Date(b['更新日時'])-new Date(a['更新日時']);})[0], due = new Date(row['推奨完了日']);
    return { homeworkId: id, unitId: text_(row['単元ID']), unitNumber: unitMap[text_(row['単元ID'])] && unitMap[text_(row['単元ID'])].unitNumber, unitName: unitMap[text_(row['単元ID'])] && unitMap[text_(row['単元ID'])].unitName, contentType: text_(row['内容種別']), contentText: text_(row['内容本文']), recommendedDueDate: due.toISOString(), studentChecked: !!student && String(student['チェック']).toUpperCase() !== 'FALSE', studentCheckedAt: student && student['チェック日時'], teacherChecked: !!teacher && String(teacher['チェック']).toUpperCase() !== 'FALSE', teacherCheckedAt: teacher && teacher['チェック日時'], overdue: due.getTime() < Date.now() && !(teacher && String(teacher['チェック']).toUpperCase() !== 'FALSE') };
  }).sort(function(a,b){return new Date(b.recommendedDueDate)-new Date(a.recommendedDueDate);});
}

function todayScheduledStudents_() {
  const active = {}; getActiveStudents_().forEach(function(student) { active[student.studentId] = student; });
  const rows = getTimetableRows_();
  const day = ['日','月','火','水','木','金','土'][Number(Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'u')) % 7];
  const out = {};
  const headerDays = [];
  let current = '';
  for (let col = 4; col < 28; col++) { if (text_(rows[0][col])) current = text_(rows[0][col]).replace('プロ',''); headerDays[col] = current; }
  for (let i = 2; i < rows.length; i++) {
    const id = text_(rows[i][0]); if (!active[id]) continue;
    const subjects = [];
    for (let col = 4; col < 28; col++) if (headerDays[col] === day && ACTIVE_SUBJECTS.indexOf(text_(rows[i][col])) >= 0 && subjects.indexOf(text_(rows[i][col])) < 0) subjects.push(text_(rows[i][col]));
    if (subjects.length) out[id] = Object.assign({}, active[id], { subjects: subjects });
  }
  return Object.keys(out).map(function(id){return out[id];});
}

function getTeacherToday_(data) { const session = requireRole_(data, ['teacher']); return { students: todayScheduledStudents_().filter(function(student) { return teacherMatchesCampus_(session.campus, student.campus); }) }; }

function getAdminDashboard_(data, all) {
  requireAdmin_(data);
  const base = all ? getActiveStudents_() : todayScheduledStudents_(), subjectCache=subjectCacheMap_(), today = todayKey_(), lessons = objects_('授業記録').filter(function(row){return Utilities.formatDate(new Date(row['授業日']),CONFIG.TIME_ZONE,'yyyy-MM-dd')===today;}), lessonUnits = objects_('授業実施単元'), cts = objects_('CT記録'), trainings = objects_('特訓部屋対応'), comments = objects_('講師コメント'), reads = new Set(objects_('コメント既読管理').filter(function(r){return String(r['確認済み']).toUpperCase()!=='FALSE';}).map(function(r){return text_(r['コメントID']);}));
  const students = base.map(function(student) {
    const mine = lessons.filter(function(row){return text_(row['生徒ID'])===student.studentId;}), ids = new Set(mine.map(function(row){return text_(row['授業ID']);})), units = lessonUnits.filter(function(row){return ids.has(text_(row['授業ID']));}), ct = cts.filter(function(row){return text_(row['生徒ID'])===student.studentId;}).sort(function(a,b){return new Date(b['実施日'])-new Date(a['実施日']);})[0], progress = TRACKED_SUBJECTS.map(function(s){return progressionFor_(student,s,false).summary;}).find(function(x){return x.remaining!=null;}) || {}, hw = homeworkFor_(student.studentId), hs = { total: hw.length, confirmed: hw.filter(function(x){return x.teacherChecked;}).length }, alerts = [];
    const studentTraining=trainings.filter(function(r){return text_(r['生徒ID'])===student.studentId;}).sort(function(a,b){return new Date(b['更新日時'])-new Date(a['更新日時']);})[0];
    if (!student.schoolKey) alerts.push('学校未登録'); if (student.school && !/^.*中(学校)?$/.test(student.school) && /^中[123]$/.test(student.grade)) alerts.push('学校名照合エラー'); if (!mine.length && !all) alerts.push('本日の記録未入力'); if (progress.comparison === '学校より遅れ' || progress.comparison === '学校と同じ') alerts.push(progress.comparison); if (progress.levelMissing) alerts.push('AO・AP未登録'); if (!progress.nextTest) alerts.push('次回テスト未登録'); if (progress.nextTest && progress.remaining==null) alerts.push('テスト範囲未登録'); if (ct && text_(ct['結果'])==='×') alerts.push('CT×'); if(studentTraining&&text_(studentTraining['対応状況'])!=='完了')alerts.push('特訓部屋未対応'); if (comments.some(function(c){return text_(c['生徒ID'])===student.studentId&&!reads.has(text_(c['コメントID']));})) alerts.push('未読コメント'); if (hs.confirmed < hs.total) alerts.push('宿題未完了');
    return Object.assign({}, student, { plannedSubjects: student.subjects || (subjectCache[student.studentId]&&subjectCache[student.studentId].subjects)||[], recordedSubjects: mine.map(function(r){return text_(r['科目']);}), actualTeachers:Array.from(new Set(mine.map(function(r){return text_(r['実担当講師名']);}).filter(Boolean))), learnedToday: new Set(units.map(function(r){return text_(r['単元ID']);})).size, remaining: progress.remaining, remainingLessons:progress.remainingLessons, requiredPerLesson:progress.requiredPerLesson, comparison:progress.comparison, ctResult: ct && text_(ct['結果']), trainingStatus:studentTraining&&text_(studentTraining['対応状況']), homeworkConfirmed: hs.confirmed, homeworkTotal: hs.total, alerts: alerts, updatedAt: mine.length ? mine[0]['更新日時'] : '' });
  });
  return { students: students };
}

function getAdminStudentDetail_(data){requireAdmin_(data);const student=getActiveStudent_(data.studentId),nextTest=nextTestFor_(student),lessons=objects_('授業記録').filter(function(r){return text_(r['生徒ID'])===student.studentId;}).sort(function(a,b){return new Date(b['授業日'])-new Date(a['授業日']);}),lessonUnits=objects_('授業実施単元').filter(function(r){return text_(r['生徒ID'])===student.studentId;}),unitMap={};objects_('単元マスタ').forEach(function(u){unitMap[text_(u['単元ID'])]=u;});const cts=objects_('CT記録').filter(function(r){return text_(r['生徒ID'])===student.studentId;}).sort(function(a,b){return new Date(b['実施日'])-new Date(a['実施日']);}),trainings=objects_('特訓部屋対応').filter(function(r){return text_(r['生徒ID'])===student.studentId;}),reads=new Set(objects_('コメント既読管理').filter(function(r){return String(r['確認済み']).toUpperCase()!=='FALSE';}).map(function(r){return text_(r['コメントID']);})),comments=objects_('講師コメント').filter(function(r){return text_(r['生徒ID'])===student.studentId;}).sort(function(a,b){return new Date(b['作成日時'])-new Date(a['作成日時']);}).map(function(r){return{commentId:text_(r['コメントID']),date:r['日付'],time:text_(r['時刻']),subject:text_(r['科目']),teacherName:text_(r['担当講師名']),text:text_(r['コメント本文']),read:reads.has(text_(r['コメントID']))};}),notes=objects_('生徒注意事項').filter(function(r){return text_(r['生徒ID'])===student.studentId;}).sort(function(a,b){return Number(b['版']||0)-Number(a['版']||0);}).map(function(r){return{text:text_(r['本文']),version:Number(r['版']||0),updatedAt:r['更新日時'],updatedBy:text_(r['操作者名'])};});return{student:student,nextTest:nextTest,targets:targetsFor_(student.studentId,nextTest&&nextTest.testId),scores:scoreHistory_(student.studentId),progress:TRACKED_SUBJECTS.map(function(s){return progressionFor_(student,s,false).summary;}),homework:homeworkFor_(student.studentId),lessons:lessons.map(function(r){const id=text_(r['授業ID']),units=lessonUnits.filter(function(u){return text_(u['授業ID'])===id;}).map(function(u){const master=unitMap[text_(u['単元ID'])]||{};return{unitId:text_(u['単元ID']),unitNumber:text_(master['単元番号']),unitName:text_(master['単元名']),date:u['実施日'],relearned:String(u['再学習']).toUpperCase()==='TRUE'};});return{lessonId:id,date:r['授業日'],subject:text_(r['科目']),teacherName:text_(r['実担当講師名']),units:units};}),schoolHistory:objects_('学校進度履歴').filter(function(r){return text_(r['生徒ID'])===student.studentId;}).sort(function(a,b){return new Date(b['登録日'])-new Date(a['登録日']);}).map(function(r){const u=unitMap[text_(r['単元ID'])]||{};return{date:r['登録日'],subject:text_(r['科目']),unitName:text_(u['単元名']),teacherName:text_(r['操作者名'])};}),cts:cts.map(function(r){const u=unitMap[text_(r['単元ID'])]||{},training=trainings.find(function(t){return text_(t['CTID'])===text_(r['CTID']);});return{date:r['実施日'],subject:text_(r['科目']),unitName:text_(u['単元名']),result:text_(r['結果']),teacherName:text_(r['担当講師名']),trainingStatus:training&&text_(training['対応状況'])};}),comments:comments,notes:notes};}

function getRangeSetup_(data) { requireAdmin_(data); return { schools: Array.from(new Set(getActiveStudents_().filter(function(student){return /^中[123]$/.test(student.grade)&&/(?:中|中学校)$/u.test(student.school);}).map(function(student){return student.school;}).filter(Boolean))).sort(), textbooks:objects_('学校別英語教科書設定').map(function(r){return{school:text_(r['学校名表示']),textbook:text_(r['教科書'])};}) }; }
function getRangeOptions_(data) {
  requireAdmin_(data); const schoolKey = normalizeSchool_(data.school), grade = normalizeGrade_(data.grade), subject = text_(data.subject), students = getActiveStudents_(),cache=subjectCacheMap_(), targets = students.filter(function(s){const tt=cache[s.studentId]||{subjects:[]};return s.schoolKey===schoolKey&&s.grade===grade&&tt.subjects.indexOf(subject)>=0;});
  const tests = objects_('学校テスト日程キャッシュ').filter(function(row){return normalizeSchool_(row['学校名正規化キー'])===schoolKey&&normalizeGrade_(row['学年'])===grade&&new Date(row['テスト終了日']).getTime()>=new Date(todayKey_()+'T00:00:00+09:00').getTime();}).sort(function(a,b){return new Date(a['テスト開始日'])-new Date(b['テスト開始日']);}).map(function(row){return {testId:text_(row['テストID']),name:text_(row['テスト名称']),startDate:new Date(row['テスト開始日']).toISOString(),endDate:new Date(row['テスト終了日']).toISOString()};});
  return { tests: tests, targetCount: targets.length };
}
function getRangeEditor_(data) {
  requireAdmin_(data); const student = { studentId:'', school:text_(data.school), schoolKey:normalizeSchool_(data.school), grade:normalizeGrade_(data.grade) }, subject=text_(data.subject), source=unitsFor_(student,subject); if(!source.units.length)return{title:'進行表未登録',units:[],selectedUnitIds:[]};
  const pred=rangeIds_('学校別予想テスト範囲',student,subject,text_(data.testId)),dec=rangeIds_('学校別決定テスト範囲',student,subject,text_(data.testId)),chosen=text_(data.rangeType)==='決定'?dec:pred;
  return {title:student.school+' '+student.grade+' '+subject+' / '+source.textbook,selectedUnitIds:Array.from(chosen),units:source.units.map(function(u){return Object.assign({},u,{predictedOutside:pred.size>0&&!pred.has(u.unitId),decidedOutside:dec.size>0&&!dec.has(u.unitId)});})};
}
function saveRange_(data) {
  const admin=requireAdmin_(data), student={school:text_(data.school),schoolKey:normalizeSchool_(data.school),grade:normalizeGrade_(data.grade)}, subject=text_(data.subject), type=text_(data.rangeType), testId=text_(data.testId), source=unitsFor_(student,subject), valid=new Set(source.units.map(function(u){return u.unitId;})), ids=Array.from(new Set(data.unitIds||[])),testExists=objects_('学校テスト日程キャッシュ').some(function(r){return text_(r['テストID'])===testId&&normalizeSchool_(r['学校名正規化キー'])===student.schoolKey&&normalizeGrade_(r['学年'])===student.grade;}); if(!testExists||!student.schoolKey||TRACKED_SUBJECTS.indexOf(subject)<0||['予想','決定'].indexOf(type)<0||ids.some(function(id){return!valid.has(id);}))throw new Error('INVALID_UNIT');
  const sheetName=type==='決定'?'学校別決定テスト範囲':'学校別予想テスト範囲', now=new Date(), objects=ids.map(function(id){return {'範囲ID':uuid_('RANGE'),'テストID':testId,'学校名正規化キー':student.schoolKey,'学校名表示':student.school,'学年':student.grade,'科目':subject,'単元ID':id,'範囲種別':type,'作成日時':now,'更新日時':now,'操作者ID':admin.loginId,'操作者名':admin.name};});
  const lock=LockService.getScriptLock();lock.waitLock(30000);try{replaceRows_(sheetName,function(row){return text_(row['テストID'])===testId&&normalizeSchool_(row['学校名正規化キー'])===student.schoolKey&&normalizeGrade_(row['学年'])===student.grade&&text_(row['科目'])===subject;},objects);audit_(admin,'範囲保存',sheetName,testId,'成功',student.school+' '+student.grade+' '+subject+' '+type+' '+ids.length+'単元');}finally{lock.releaseLock();} return {saved:ids.length};
}

function saveSchoolPosition_(data) { const session=requireRole_(data,['teacher']),student=getActiveStudent_(data.studentId),subject=text_(data.subject),unitId=text_(data.unitId),source=unitsFor_(student,subject);if(!source.units.some(function(u){return u.unitId===unitId;}))throw new Error('INVALID_UNIT');const rawDate=text_(data.recordedDate),recordedDate=/^\d{4}-\d{2}-\d{2}$/.test(rawDate)?new Date(rawDate+'T12:00:00+09:00'):new Date();if(Number.isNaN(recordedDate.getTime()))throw new Error('INVALID_VALUE');const now=new Date();appendObject_('学校進度履歴',{'学校進度ID':uuid_('SCHOOLPOS'),'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'登録日':recordedDate,'授業ID':'','作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});return{saved:true,recordedDate:recordedDate.toISOString()}; }

function homeworkItemsForUnit_(subject, unit, items) {
  const label = normalizeText_((unit && unit.unitName || '') + (unit && unit.unitNumber || ''));
  if (label.indexOf('keywordstest') >= 0) return ['巻末のKeyWordsTestの暗記'];
  return (items || []).filter(function(item) { return item !== '巻末のKeyWordsTestの暗記'; });
}

function saveLesson_(data) {
  const session=requireRole_(data,['teacher']),student=getActiveStudent_(data.studentId),subject=text_(data.subject),source=unitsFor_(student,subject),valid=new Set(source.units.map(function(u){return u.unitId;})),ids=Array.from(new Set(data.unitIds||[])),key=text_(data.idempotencyKey);if(!key||!ids.length||ids.some(function(id){return!valid.has(id);}))throw new Error('INVALID_UNIT');const nextTest=nextTestFor_(student),predicted=rangeIds_('学校別予想テスト範囲',student,subject,nextTest&&nextTest.testId),decided=rangeIds_('学校別決定テスト範囲',student,subject,nextTest&&nextTest.testId),effective=decided.size?decided:predicted;if(student.grade!=='中3'&&effective.size&&ids.some(function(id){return!effective.has(id);}))throw new Error('OUTSIDE_TEST_RANGE');
  const candidateId=text_(data.teacherId)||session.loginId,candidate=getActiveTeachers_().find(function(t){return t.loginId===candidateId&&teacherMatchesCampus_(t.campus,student.campus);});if(!candidate)throw new Error('FORBIDDEN');
  const specialHomework='巻末のKeyWordsTestの暗記',allowed=subject==='英語'?['KeyWords「☆日→英」暗記','exercise「暗記マーク」暗記','Try赤×直し','exercise','宿題の赤×直し',specialHomework]:subject==='数学'?['TRYの赤×直し','exercise','宿題の赤×直し',specialHomework]:[],requested=Array.isArray(data.homeworkItems)?data.homeworkItems.map(text_):allowed,homeworkItems=Array.from(new Set(requested.filter(function(item){return allowed.indexOf(item)>=0||/^その他：.{1,120}$/u.test(item);}))),unitMap={};source.units.forEach(function(unit){unitMap[unit.unitId]=unit;});const lock=LockService.getScriptLock();lock.waitLock(30000);try{const existing=objects_('授業記録').find(function(r){return text_(r['冪等キー'])===key;});if(existing)return{saved:true,lessonId:text_(existing['授業ID']),duplicatePrevented:true};const lessonId=uuid_('LESSON'),now=new Date(),prior=new Set(objects_('授業実施単元').filter(function(r){return text_(r['生徒ID'])===student.studentId&&text_(r['科目'])===subject;}).map(function(r){return text_(r['単元ID']);}));let homeworkCount=0;appendObject_('授業記録',{'授業ID':lessonId,'生徒ID':student.studentId,'科目':subject,'授業日':now,'予定担当講師ID':session.loginId,'予定担当講師名':session.name,'実担当講師ID':candidate.loginId,'実担当講師名':candidate.name,'冪等キー':key,'作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});ids.forEach(function(unitId){const unitHomework=homeworkItemsForUnit_(subject,unitMap[unitId],homeworkItems);appendObject_('授業実施単元',{'授業単元ID':uuid_('LESSONUNIT'),'授業ID':lessonId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'実施日':now,'再学習':prior.has(unitId),'作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});createHomework_(lessonId,student,subject,unitId,unitHomework,session,now);homeworkCount+=unitHomework.length;});audit_(session,'授業保存','授業記録',lessonId,'成功',ids.length+'単元');return{saved:true,lessonId:lessonId,unitCount:ids.length,homeworkCount:homeworkCount};}finally{lock.releaseLock();}
}
function createHomework_(lessonId,student,subject,unitId,items,session,date){const due=new Date(date);due.setDate(due.getDate()+2);items.forEach(function(type){const other=/^その他：/u.test(type),key=lessonId+'|'+unitId+'|'+type;if(objects_('宿題').some(function(r){return text_(r['冪等キー'])===key;}))return;appendObject_('宿題',{'宿題ID':uuid_('HW'),'授業ID':lessonId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'内容種別':other?'その他':type,'内容本文':type,'推奨完了日':due,'有効':true,'その他':other?type.replace(/^その他：/u,''):'','冪等キー':key,'作成日時':date,'更新日時':date,'操作者ID':session.loginId,'操作者名':session.name});});}

function saveCt_(data) {
  const session=requireRole_(data,['teacher']),student=getActiveStudent_(data.studentId),subject=text_(data.subject),unitId=text_(data.unitId),result=text_(data.result),key=text_(data.idempotencyKey);if(['◎','〇','×'].indexOf(result)<0)throw new Error('INVALID_VALUE');const lessons=objects_('授業記録').filter(function(r){return text_(r['生徒ID'])===student.studentId&&text_(r['科目'])===subject;}).sort(function(a,b){return new Date(b['授業日'])-new Date(a['授業日']);});if(!lessons.length)throw new Error('CT_NOT_PREVIOUS');const lessonId=text_(lessons[0]['授業ID']),previous=new Set(objects_('授業実施単元').filter(function(r){return text_(r['授業ID'])===lessonId;}).map(function(r){return text_(r['単元ID']);}));if(!previous.has(unitId))throw new Error('CT_NOT_PREVIOUS');const lock=LockService.getScriptLock();lock.waitLock(30000);try{const cts=objects_('CT記録');if(cts.some(function(r){return text_(r['生徒ID'])===student.studentId&&text_(r['科目'])===subject&&text_(r['授業ID'])===lessonId;}))throw new Error('DUPLICATE_CT');const ctId=uuid_('CT'),now=new Date();appendObject_('CT記録',{'CTID':ctId,'授業ID':lessonId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'結果':result,'実施日':now,'担当講師ID':session.loginId,'担当講師名':session.name,'冪等キー':key,'作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});if(result==='×')createTraining_(ctId,student,subject,unitId,session,now);return{saved:true,ctId:ctId};}finally{lock.releaseLock();}
}
function createTraining_(ctId,student,subject,unitId,session,now){if(objects_('特訓部屋対応').some(function(r){return text_(r['CTID'])===ctId;}))return;const trainingId=uuid_('TRAINING');appendObject_('特訓部屋対応',{'特訓ID':trainingId,'CTID':ctId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'対応状況':'未対応','実施予定日':'','実施日':'','対応者ID':'','対応者名':'','備考':'','保護者連絡状況':'未連絡','作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});notifyTraining_(ctId,trainingId,student,subject,unitId,session,now);}
function notifyTraining_(ctId,trainingId,student,subject,unitId,session,now){const eventKey='CT_FAIL|'+ctId;if(objects_('メール通知履歴').some(function(r){return text_(r['イベントキー'])===eventKey;}))return;const mode=setting_('EMAIL_SEND_MODE')||'SUPPRESS',unit=objects_('単元マスタ').find(function(r){return text_(r['単元ID'])===unitId;}),body=['生徒名: '+student.name,'生徒ID: '+student.studentId,'教室: '+student.campus,'学校名: '+student.school,'学年: '+student.grade,'教科: '+subject,'CT単元: '+(unit?text_(unit['単元名']):unitId),'CT結果: ×','実施日: '+todayKey_(),'担当講師: '+session.name,'特訓部屋対象になりました。'].join('\n');let status='送信抑止';if(mode==='SEND'){MailApp.sendEmail(CONFIG.TRAINING_EMAIL,'【フォレスタ進捗管理】CT×・特訓部屋対象',body);status='送信済み';}appendObject_('メール通知履歴',{'通知ID':uuid_('MAIL'),'イベントキー':eventKey,'通知種別':'CT×特訓部屋','宛先':CONFIG.TRAINING_EMAIL,'状態':status,'送信抑止':mode!=='SEND','作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});}

function studentCheckHomework_(data){const session=requireRole_(data,['student']),id=text_(data.homeworkId),homework=objects_('宿題').find(function(r){return text_(r['宿題ID'])===id;});if(!homework||text_(homework['生徒ID'])!==session.studentId)throw new Error('FORBIDDEN');const now=new Date(),checked=!!data.checked;replaceRows_('宿題の生徒チェック',function(r){return text_(r['宿題ID'])===id;},[{'生徒チェックID':uuid_('HSC'),'宿題ID':id,'生徒ID':session.studentId,'チェック':checked,'チェック日時':checked?now:'','作成日時':now,'更新日時':now,'操作者ID':session.studentId,'操作者名':session.name}]);return{saved:true};}
function teacherCheckHomework_(data){const session=requireRole_(data,['teacher']),id=text_(data.homeworkId),homework=objects_('宿題').find(function(r){return text_(r['宿題ID'])===id;});if(!homework)throw new Error('INVALID_VALUE');getActiveStudent_(homework['生徒ID']);const now=new Date(),checked=!!data.checked;replaceRows_('宿題の講師チェック',function(r){return text_(r['宿題ID'])===id;},[{'講師チェックID':uuid_('HTC'),'宿題ID':id,'生徒ID':text_(homework['生徒ID']),'講師ID':session.loginId,'講師名':session.name,'チェック':checked,'チェック日時':checked?now:'','作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name}]);return{saved:true};}

function saveTargets_(data){const access=authorizeStudentAccess_(data),student=access.student,testId=text_(data.testId),values=data.values||{};if(!testId)throw new Error('TEST_NOT_FOUND');const now=new Date(),rows=[];ACTIVE_SUBJECTS.forEach(function(subject){const raw=text_(values[subject]);if(raw==='')return;const score=Number(raw);if(!Number.isFinite(score)||score<0||score>100)throw new Error('INVALID_VALUE');rows.push({'目標点ID':uuid_('TARGET'),'テストID':testId,'生徒ID':student.studentId,'科目':subject,'目標点':score,'作成日時':now,'更新日時':now,'操作者ID':access.session.loginId||student.studentId,'操作者名':access.session.name});});replaceRows_('テスト別目標点',function(r){return text_(r['テストID'])===testId&&text_(r['生徒ID'])===student.studentId;},rows);return{saved:rows.length};}
function saveComment_(data){const session=requireRole_(data,['teacher']),student=getActiveStudent_(data.studentId),body=text_(data.text);if(!body)throw new Error('INVALID_VALUE');const now=new Date();appendObject_('講師コメント',{'コメントID':uuid_('COMMENT'),'日付':now,'時刻':Utilities.formatDate(now,CONFIG.TIME_ZONE,'HH:mm'),'生徒ID':student.studentId,'科目':text_(data.subject),'担当講師ID':session.loginId,'担当講師名':session.name,'コメント本文':body,'作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});return{saved:true};}
function saveNote_(data){const admin=requireAdmin_(data),student=getActiveStudent_(data.studentId),body=text_(data.text);if(!body)throw new Error('INVALID_VALUE');const prior=objects_('生徒注意事項').filter(function(r){return text_(r['生徒ID'])===student.studentId;}),now=new Date();appendObject_('生徒注意事項',{'注意事項ID':uuid_('NOTE'),'生徒ID':student.studentId,'本文':body,'有効':true,'版':prior.length+1,'作成日時':now,'更新日時':now,'操作者ID':admin.loginId,'操作者名':admin.name});return{saved:true};}
function markCommentRead_(data){const admin=requireAdmin_(data),id=text_(data.commentId);if(!objects_('講師コメント').some(function(r){return text_(r['コメントID'])===id;}))throw new Error('INVALID_VALUE');const now=new Date();replaceRows_('コメント既読管理',function(r){return text_(r['コメントID'])===id;},[{'既読ID':uuid_('READ'),'コメントID':id,'確認済み':true,'既読日時':now,'確認者ID':admin.loginId,'確認者名':admin.name,'作成日時':now,'更新日時':now}]);return{saved:true};}

function getTrainingRoom_(data){requireAdmin_(data);const students={};getActiveStudents_().forEach(function(s){students[s.studentId]=s;});const units={};objects_('単元マスタ').forEach(function(u){units[text_(u['単元ID'])]=u;});const cts={};objects_('CT記録').forEach(function(c){cts[text_(c['CTID'])]=c;});return{items:objects_('特訓部屋対応').map(function(r){const s=students[text_(r['生徒ID'])]||{},c=cts[text_(r['CTID'])]||{},u=units[text_(r['単元ID'])]||{};return{trainingId:text_(r['特訓ID']),name:s.name||'',campus:s.campus||'',school:s.school||'',grade:s.grade||'',subject:text_(r['科目']),unitName:text_(u['単元名']),ctDate:c['実施日']||'',teacherName:text_(c['担当講師名']),status:text_(r['対応状況']),scheduledDate:r['実施予定日']||'',actualDate:r['実施日']||'',note:text_(r['備考']),guardianContactStatus:text_(r['保護者連絡状況'])};})};}
function updateTrainingRoom_(data){const admin=requireAdmin_(data),id=text_(data.trainingId),now=new Date(),found=objects_('特訓部屋対応').find(function(r){return text_(r['特訓ID'])===id;});if(!found)throw new Error('INVALID_VALUE');const next=Object.assign({},found,{'対応状況':text_(data.status)||found['対応状況'],'実施予定日':data.scheduledDate||found['実施予定日'],'実施日':data.actualDate||found['実施日'],'対応者ID':admin.loginId,'対応者名':admin.name,'備考':text_(data.note),'保護者連絡状況':text_(data.guardianContactStatus)||found['保護者連絡状況'],'更新日時':now,'操作者ID':admin.loginId,'操作者名':admin.name});replaceRows_('特訓部屋対応',function(r){return text_(r['特訓ID'])===id;},[next]);return{saved:true};}

function refreshSubjectCache_(data){const admin=requireAdmin_(data),students=getActiveStudents_(),tt=timetableMap_(),now=new Date(),rows=[];students.forEach(function(s){const info=tt[s.studentId]||{subjects:[],englishLevel:'',mathLevel:''},subjects=info.subjects.length?info.subjects:[''];subjects.forEach(function(subject){rows.push({'キャッシュID':'CACHE-'+s.studentId+'-'+(subject||'none'),'生徒ID':s.studentId,'生徒名':s.name,'在籍状態':s.status,'教室':s.campus,'学年':s.grade,'学校名表示':s.school,'学校名正規化キー':s.schoolKey,'受講科目':subject,'英語レベル':info.englishLevel,'数学レベル':info.mathLevel,'取得元':'時間割マスタ','更新日時':now});});});replaceRows_('受講科目キャッシュ',function(){return true;},rows);audit_(admin,'受講科目更新','受講科目キャッシュ','ALL','成功',rows.length+'件');return{count:rows.length};}
function saveSchoolTextbook_(data){const admin=requireAdmin_(data),school=text_(data.school),key=normalizeSchool_(school),book=text_(data.textbook),allowed=['ニュークラウン','サンシャイン','ニューホライズン','ワンワールド','ヒアウィゴー','ブルースカイ'];if(!key||allowed.indexOf(book)<0)throw new Error('INVALID_VALUE');const now=new Date(),row={'設定ID':'BOOK-'+key,'学校名正規化キー':key,'学校名表示':school,'教科書':book,'根拠URL':'管理者設定','作成日時':now,'更新日時':now,'操作者ID':admin.loginId,'操作者名':admin.name};replaceRows_('学校別英語教科書設定',function(r){return normalizeSchool_(r['学校名正規化キー'])===key;},[row]);return{saved:true};}

function setting_(key){const row=objects_('アプリ設定').find(function(r){return text_(r['設定キー'])===key;});return row?text_(row['設定値']):'';}
function audit_(actor,action,type,id,result,detail){appendObject_('操作履歴',{'操作ID':uuid_('AUDIT'),'日時':new Date(),'操作者ID':actor.loginId||actor.studentId||'','操作者名':actor.name||'','役割':actor.role||'','操作':action,'対象種別':type,'対象ID':id,'結果':result,'詳細':detail||''});}
