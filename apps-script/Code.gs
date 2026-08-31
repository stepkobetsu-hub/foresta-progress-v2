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

const ACTIVE_SUBJECTS = ['国語', '算数', '数学', '英語', '理科', '社会'];
const TRACKED_SUBJECTS = ['国語', '英語', '数学', '理科', '社会'];
let REQUEST_CACHE = {};

function doGet(e) {
  ensureScienceSocialUnits_();
  ensureElementarySupport_();
  return json_({ ok: true, app: 'フォレスタ進捗管理', version: '2.3.1', time: nowIso_() });
}

function doPost(e) {
  try {
    REQUEST_CACHE = {};
    ensureScienceSocialUnits_();
    ensureElementarySupport_();
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
    case 'exportTimetableV3': return exportTimetableV3_(data);
    case 'exportLegacyV3': return exportLegacyV3_(data);
    case 'exportSnapshotsV3': return exportSnapshotsV3_(data);
    case 'applyMutationV3': return applyMutationV3_(data);
    case 'studentLogin': return studentLogin_(data);
    case 'staffLogin': return staffLogin_(data);
    case 'resumeSession': return resumeSession_(data);
    case 'logout': return logout_(data);
    case 'adminReauth': return adminReauth_(data);
    case 'resumeAdminSession': return resumeAdminSession_(data);
    case 'searchStudents': return searchStudents_(data);
    case 'getStudentDashboard': return getStudentDashboard_(data);
    case 'getProgression': return getProgression_(data);
    case 'saveStudentRoundProgress': return saveStudentRoundProgress_(data);
    case 'getTeacherToday': return getTeacherToday_(data);
    case 'getAdminDashboard': return getAdminDashboard_(data, false);
    case 'getAdminStudents': return getAdminDashboard_(data, true);
    case 'getAdminStudentDetail': return getAdminStudentDetail_(data);
    case 'getRangeSetup': return getRangeSetup_(data);
    case 'getRangeOptions': return getRangeOptions_(data);
    case 'getRangeEditor': return getRangeEditor_(data);
    case 'saveRange': return saveRange_(data);
    case 'saveSchoolPosition': return saveSchoolPosition_(data);
    case 'saveElementaryUnitTest': return saveElementaryUnitTest_(data);
    case 'saveLesson': return saveLesson_(data);
    case 'getLessonCorrections': return getLessonCorrections_(data);
    case 'updateLessonCorrection': return updateLessonCorrection_(data);
    case 'saveCt': return saveCt_(data);
    case 'studentCheckHomework': return studentCheckHomework_(data);
    case 'teacherCheckHomework': return teacherCheckHomework_(data);
    case 'getHomeworkArchive': return getHomeworkArchive_(data);
    case 'archiveHomework': return archiveHomework_(data);
    case 'restoreHomework': return restoreHomework_(data);
    case 'deleteHomework': return deleteHomework_(data);
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
    OUTSIDE_TEST_RANGE: '次回テスト範囲外です。進める場合は確認してください。', ROUND_ORDER: '周回は1周目から順番に入力してください。',
    HOMEWORK_NOT_COMPLETE: '完了条件を満たしていない宿題はアーカイブできません。',
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
function romanizeKana_(value) {
  const source = kanaFold_(value);
  const map = {
    'きゃ':'kya','きゅ':'kyu','きょ':'kyo','ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo','しゃ':'sha','しゅ':'shu','しょ':'sho','じゃ':'ja','じゅ':'ju','じょ':'jo',
    'ちゃ':'cha','ちゅ':'chu','ちょ':'cho','にゃ':'nya','にゅ':'nyu','にょ':'nyo','ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo','びゃ':'bya','びゅ':'byu','びょ':'byo',
    'ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo','みゃ':'mya','みゅ':'myu','みょ':'myo','りゃ':'rya','りゅ':'ryu','りょ':'ryo','ふぁ':'fa','ふぃ':'fi','ふぇ':'fe','ふぉ':'fo',
    'てぃ':'ti','でぃ':'di','うぃ':'wi','うぇ':'we','うぉ':'wo','ゔぁ':'va','ゔぃ':'vi','ゔぇ':'ve','ゔぉ':'vo',
    'あ':'a','い':'i','う':'u','え':'e','お':'o','か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko','が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
    'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so','ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo','た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
    'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do','な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no','は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
    'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo','ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po','ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
    'や':'ya','ゆ':'yu','よ':'yo','ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro','わ':'wa','を':'o','ん':'n','ゔ':'vu','ぁ':'a','ぃ':'i','ぅ':'u','ぇ':'e','ぉ':'o'
  };
  let out = '', doubleNext = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === 'っ') { doubleNext = true; continue; }
    if (char === 'ー') { const vowel = out.match(/[aeiou]$/); if (vowel) out += vowel[0]; continue; }
    const pair = source.slice(index, index + 2);
    let roman = map[pair];
    if (roman) index++;
    else roman = map[char] || (/^[a-z0-9]$/i.test(char) ? char.toLowerCase() : '');
    if (doubleNext && roman && !/^[aeioun]/.test(roman)) out += roman[0];
    doubleNext = false;
    out += roman;
  }
  return out;
}
function romajiSearchText_(value) {
  const roman = romanizeKana_(value);
  const shortVowels = roman.replace(/ou/g, 'o').replace(/oo/g, 'o').replace(/ei/g, 'e');
  const kunrei = roman.replace(/sha/g, 'sya').replace(/shu/g, 'syu').replace(/sho/g, 'syo').replace(/cha/g, 'tya').replace(/chu/g, 'tyu').replace(/cho/g, 'tyo').replace(/shi/g, 'si').replace(/chi/g, 'ti').replace(/tsu/g, 'tu').replace(/fu/g, 'hu').replace(/ji/g, 'zi');
  return Array.from(new Set([roman, shortVowels, kunrei])).filter(Boolean).join(' ');
}
function studentMatchesQuery_(student, query) {
  const tokens = String(query == null ? '' : query).normalize('NFKC').trim().split(/[\s　]+/).filter(Boolean);
  if (!tokens.length) return true;
  const nativeText = kanaFold_([student.studentId, student.name, student.reading, student.campus, student.grade, student.school].join(' '));
  const romajiText = romajiSearchText_(student.reading || student.name);
  return tokens.every(function(token) {
    const nativeToken = kanaFold_(token);
    if (nativeToken && nativeText.indexOf(nativeToken) >= 0) return true;
    const latinToken = normalizeText_(token).replace(/[^a-z0-9]/g, '');
    return !!latinToken && romajiText.split(' ').some(function(variant) { return variant.indexOf(latinToken) >= 0; });
  });
}
function adminCampusLabel_(value) { const campus=text_(value); if(campus.indexOf('神領')>=0)return '神領'; if(campus.indexOf('大手')>=0)return '大手町'; return campus; }

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
  const reading=text_(row[5]);
  return { studentId: text_(row[0]), status: text_(row[1]), name: text_(row[4]), reading: reading, romaji: romajiSearchText_(reading), campus: text_(row[7]), filterCampus: adminCampusLabel_(row[7]), grade: normalizeGrade_(row[10]), school: text_(row[15]), schoolKey: normalizeSchool_(row[15]) };
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

// Secret-to-secret export for the V3 refresher. 時間割マスタ, never
// 受講科目キャッシュ, is authoritative for enrolled subjects and levels.
function exportTimetableV3_(data) {
  const expected = PropertiesService.getScriptProperties().getProperty('FORESTA_SYNC_SECRET');
  if (!expected || text_(data.syncSecret) !== expected) throw new Error('FORBIDDEN');
  const rows = getTimetableRows_(), students = {};
  getActiveStudents_().forEach(function(student) { students[student.studentId] = student; });
  const output = [];
  for (let i = 2; i < rows.length; i++) {
    const id = text_(rows[i][0]); if (!id) continue;
    const subjects = [];
    for (let col = 4; col < 28; col++) {
      const subject = text_(rows[i][col]);
      if (ACTIVE_SUBJECTS.indexOf(subject) >= 0 && subjects.indexOf(subject) < 0) subjects.push(subject);
    }
    if (!subjects.length) continue;
    const englishLevel = text_(rows[i][40]), mathLevel = text_(rows[i][41]);
    output.push({ studentId: id, studentName: students[id] ? students[id].name : '', subjects: subjects,
      englishLevel: englishLevel, mathLevel: mathLevel, sourceRow: i + 1,
      sourceHash: digest_([id, subjects.join('|'), englishLevel, mathLevel].join('\u001f')) });
  }
  return { rows: output, exportedAt: nowIso_(), source: '★生徒マスタ202606-/時間割マスタ' };
}
function exportLegacyV3_(data) {
  const expected=PropertiesService.getScriptProperties().getProperty('FORESTA_SYNC_SECRET');
  if(!expected||text_(data.syncSecret)!==expected)throw new Error('FORBIDDEN');
  const allowed=['単元マスタ','学校別英語教科書設定','学校テスト日程キャッシュ','学校別予想テスト範囲','学校別決定テスト範囲','学校進度履歴','授業記録','授業実施単元','CT記録','特訓部屋対応','宿題','宿題の生徒チェック','宿題の講師チェック','テスト別目標点','講師コメント','コメント既読管理','生徒注意事項','操作履歴','生徒周回進捗'];
  const tab=text_(data.tab); if(allowed.indexOf(tab)<0)throw new Error('FORBIDDEN');
  const sheet=dataSheet_(tab),start=Math.max(2,Number(data.startRow||2)),limit=Math.min(500,Math.max(1,Number(data.limit||500)));
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0],count=Math.max(0,Math.min(limit,sheet.getLastRow()-start+1));
  const values=count?sheet.getRange(start,1,count,headers.length).getDisplayValues():[];
  return{tab:tab,headers:headers,rows:values,startRow:start,nextRow:count===limit?start+count:null,totalRows:Math.max(0,sheet.getLastRow()-1),exportedAt:nowIso_()};
}

function requireV3SyncSecret_(data) {
  const expected=PropertiesService.getScriptProperties().getProperty('FORESTA_SYNC_SECRET');
  if(!expected||text_(data&&data.syncSecret)!==expected)throw new Error('FORBIDDEN');
}

function withV3ServiceSession_(profile,callback) {
  const token=Utilities.getUuid()+'-'+Utilities.getUuid(),key=CONFIG.SESSION_PREFIX+digest_(token),now=Date.now();
  const session=Object.assign({},profile,{deviceMode:'shared',issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+10*60000).toISOString()});
  PropertiesService.getScriptProperties().setProperty(key,JSON.stringify(session));
  try{return callback(token);}finally{PropertiesService.getScriptProperties().deleteProperty(key);}
}

function studentSnapshotsV3_(studentId,token) {
  const dashboard=getStudentDashboard_({token:token,studentId:studentId}),snapshots=[{studentId:studentId,view:'getStudentDashboard',subject:'',payload:dashboard}];
  const subjects=Array.from(new Set((dashboard.student&&dashboard.student.subjects||[]).map(text_).filter(Boolean)));
  subjects.forEach(function(subject){snapshots.push({studentId:studentId,view:'getProgression',subject:subject,payload:getProgression_({token:token,studentId:studentId,subject:subject,mode:'lesson'})});});
  snapshots.push({studentId:studentId,view:'getHomeworkArchive',subject:'',payload:getHomeworkArchive_({token:token,studentId:studentId})});
  return snapshots;
}

function exportSnapshotsV3_(data) {
  requireV3SyncSecret_(data);
  const requested=Array.from(new Set((data.studentIds||[]).map(text_).filter(Boolean))).slice(0,10),snapshots=[];
  withV3ServiceSession_({role:'teacher',loginId:'FORESTA_V3_SYNC',name:'Foresta V3 Sync',campus:'神領・大手町',permission:0},function(token){requested.forEach(function(studentId){Array.prototype.push.apply(snapshots,studentSnapshotsV3_(studentId,token));});});
  if(data.includeGlobal!==false){snapshots.push({studentId:'__global__',view:'searchStudents',subject:'',payload:{students:getActiveStudents_()}});snapshots.push({studentId:'__global__',view:'getTeacherToday',subject:'',payload:{students:todayScheduledStudents_()}});}
  return{snapshots:snapshots,studentCount:requested.length,exportedAt:nowIso_()};
}

function v3MirrorSheet_() {
  const book=REQUEST_CACHE.dataBook||(REQUEST_CACHE.dataBook=SpreadsheetApp.openById(CONFIG.DATA_SPREADSHEET_ID));
  let sheet=book.getSheetByName('SupabaseV3ミラー');
  if(!sheet){sheet=book.insertSheet('SupabaseV3ミラー');sheet.getRange(1,1,1,7).setValues([['Mutation ID','Action','Status','Actor','Created At','Updated At','Result']]);sheet.setFrozenRows(1);}
  return sheet;
}

function dispatchMutationV3_(action,payload) {
  const handlers={saveLesson:saveLesson_,updateLessonCorrection:updateLessonCorrection_,saveSchoolPosition:saveSchoolPosition_,saveRange:saveRange_,saveCt:saveCt_,saveStudentRoundProgress:saveStudentRoundProgress_,studentCheckHomework:studentCheckHomework_,teacherCheckHomework:teacherCheckHomework_,archiveHomework:archiveHomework_,restoreHomework:restoreHomework_,deleteHomework:deleteHomework_,saveTargets:saveTargets_,saveComment:saveComment_,saveNote:saveNote_,markCommentRead:markCommentRead_,updateTrainingRoom:updateTrainingRoom_,saveSchoolTextbook:saveSchoolTextbook_};
  if(!handlers[action])throw new Error('INVALID_ACTION');
  return handlers[action](payload);
}

function applyMutationV3_(data) {
  requireV3SyncSecret_(data);
  const mutationId=text_(data.mutationId),action=text_(data.mutationAction),actor=data.actor||{},role=text_(actor.role),request=Object.assign({},data.payload||{});
  if(!mutationId||!action||['student','teacher','admin'].indexOf(role)<0)throw new Error('INVALID_VALUE');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const sheet=v3MirrorSheet_(),hit=sheet.getRange(2,1,Math.max(1,sheet.getLastRow()-1),1).createTextFinder(mutationId).matchEntireCell(true).findNext();
    if(hit){const status=text_(sheet.getRange(hit.getRow(),3).getValue());if(status==='mirrored'){const raw=text_(sheet.getRange(hit.getRow(),7).getValue()),studentId=text_(request.studentId||actor.studentId);let snapshots=[];if(studentId)withV3ServiceSession_({role:'teacher',loginId:'FORESTA_V3_SYNC',name:'Foresta V3 Sync',campus:'神領・大手町',permission:0},function(token){snapshots=studentSnapshotsV3_(studentId,token);});return{duplicate:true,result:raw?JSON.parse(raw):{},snapshots:snapshots};}if(status==='processing')throw new Error('MIRROR_IN_PROGRESS');}
    const row=hit?hit.getRow():sheet.getLastRow()+1,now=new Date();
    if(!hit)sheet.getRange(row,1,1,7).setValues([[mutationId,action,'processing',text_(actor.loginId||actor.studentId),now,now,'']]);else sheet.getRange(row,3,1,4).setValues([['processing',text_(actor.loginId||actor.studentId),sheet.getRange(row,5).getValue()||now,now]]);
    request.mutationId=mutationId;if(!request.idempotencyKey)request.idempotencyKey=mutationId;
    const response=withV3ServiceSession_(actor,function(token){request.token=token;if(role==='admin')request.adminToken=token;return dispatchMutationV3_(action,request);});
    let snapshots=[];const studentId=text_(request.studentId||actor.studentId);
    if(studentId)withV3ServiceSession_({role:'teacher',loginId:'FORESTA_V3_SYNC',name:'Foresta V3 Sync',campus:'神領・大手町',permission:0},function(token){snapshots=studentSnapshotsV3_(studentId,token);});
    sheet.getRange(row,3).setValue('mirrored');sheet.getRange(row,6).setValue(new Date());sheet.getRange(row,7).setValue(JSON.stringify(response||{}));
    return{duplicate:false,result:response||{},snapshots:snapshots};
  }catch(error){try{const sheet=v3MirrorSheet_(),hit=sheet.getRange(2,1,Math.max(1,sheet.getLastRow()-1),1).createTextFinder(mutationId).matchEntireCell(true).findNext();if(hit){sheet.getRange(hit.getRow(),3).setValue('failed');sheet.getRange(hit.getRow(),6).setValue(new Date());sheet.getRange(hit.getRow(),7).setValue(JSON.stringify({error:String(error&&error.message||error)}));}}catch(_){ }throw error;
  }finally{lock.releaseLock();}
}
function subjectCacheMap_(){const map={};objects_('受講科目キャッシュ').forEach(function(row){const id=text_(row['生徒ID']);if(!id)return;if(!map[id])map[id]={subjects:[],englishLevel:text_(row['英語レベル']),mathLevel:text_(row['数学レベル'])};const subject=text_(row['受講科目']);if(subject&&map[id].subjects.indexOf(subject)<0)map[id].subjects.push(subject);if(!map[id].englishLevel)map[id].englishLevel=text_(row['英語レベル']);if(!map[id].mathLevel)map[id].mathLevel=text_(row['数学レベル']);});return map;}
function studentCourseInfo_(studentId){const id=text_(studentId),live=timetableMap_()[id],cached=subjectCacheMap_()[id];if(live)return live;if(cached)return cached;return{subjects:[],englishLevel:'',mathLevel:''};}

function searchStudents_(data) {
  requireRole_(data, ['teacher']);
  const campus = normalizeText_(data.campus), grade = normalizeGrade_(data.grade);
  const source = getActiveStudents_();
  const students = source.filter(function(student) {
    if (campus && normalizeText_(student.campus) !== campus) return false;
    if (grade && student.grade !== grade) return false;
    return studentMatchesQuery_(student, data.query);
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
function appendObjects_(name, objectList) {
  if (!objectList || !objectList.length) return;
  const sheet = dataSheet_(name), headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(text_);
  const rows = objectList.map(function(object) { return headers.map(function(header) { return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : ''; }); });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
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

function importMasterText_(value) {
  return text_(value).replace(/[\r\n]+/g, ' ').replace(/[\s　]+/g, ' ').trim();
}

function scienceRowsFromSheet_(sheet, grade, textbook, slug) {
  const values = sheet.getDataRange().getDisplayValues(), out = [];
  [0, 12].forEach(function(base) {
    let chapter = '';
    for (let r = 3; r < values.length; r++) {
      const row = values[r] || [], nextChapter = importMasterText_(row[base]), difficulty = importMasterText_(row[base + 1]), step = importMasterText_(row[base + 2]), title = importMasterText_(row[base + 3]);
      if (nextChapter && nextChapter !== '章') chapter = nextChapter;
      if (!step || step === 'STEP' || !title || title === 'タイトル') continue;
      out.push({ chapter: chapter, difficulty: difficulty, step: step, title: title });
    }
  });
  return out.map(function(item, index) {
    return {
      '単元ID': 'sci-g' + grade.slice(-1) + '-' + slug + '-' + String(index + 1).padStart(4, '0'),
      '教科': '理科', '学年': grade, '表示順': index + 1, '章': item.chapter, '単元番号': item.step, '単元名': item.title, '難度': item.difficulty,
      '教科書または進行表の種類': textbook, '元ファイル名': '26F進行表オモテ【中学理科】.xls'
    };
  });
}

function socialTrackRows_(sheet, domain) {
  const values = sheet.getDataRange().getDisplayValues(), out = [];
  [0, 11].forEach(function(base) {
    let chapter = '';
    for (let r = 2; r < values.length; r++) {
      const row = values[r] || [], nextChapter = importMasterText_(row[base]), step = importMasterText_(row[base + 1]), title = importMasterText_(row[base + 2]);
      if (nextChapter && nextChapter !== '章') chapter = nextChapter;
      if (!step || step === 'STEP' || !title || title === 'タイトル') continue;
      out.push({ chapter: domain + ' ' + chapter, step: domain + ' ' + step, title: title });
    }
  });
  return out;
}

function socialVariantRows_(geography, history, civics, textbook, slug) {
  return geography.concat(history, civics).map(function(item, index) {
    return {
      '単元ID': 'soc-common-' + slug + '-' + String(index + 1).padStart(4, '0'),
      '教科': '社会', '学年': '共通', '表示順': index + 1, '章': item.chapter, '単元番号': item.step, '単元名': item.title, '難度': '',
      '教科書または進行表の種類': textbook, '元ファイル名': '26F進行表オモテ【中学社会】.xls'
    };
  });
}

function importMasterText_(value) {
  return text_(value).replace(/[\r\n]+/g, ' ').replace(/[\s　]+/g, ' ').trim();
}

function scienceRowsFromSheet_(sheet, grade, textbook, slug) {
  const values = sheet.getDataRange().getDisplayValues(), out = [];
  [0, 12].forEach(function(base) {
    let chapter = '';
    for (let r = 3; r < values.length; r++) {
      const row = values[r] || [], nextChapter = importMasterText_(row[base]), difficulty = importMasterText_(row[base + 1]), step = importMasterText_(row[base + 2]), title = importMasterText_(row[base + 3]);
      if (nextChapter && nextChapter !== '章') chapter = nextChapter;
      if (!step || step === 'STEP' || !title || title === 'タイトル') continue;
      out.push({ chapter: chapter, difficulty: difficulty, step: step, title: title });
    }
  });
  return out.map(function(item, index) {
    return {
      '単元ID': 'sci-g' + grade.slice(-1) + '-' + slug + '-' + String(index + 1).padStart(4, '0'),
      '教科': '理科', '学年': grade, '表示順': index + 1, '章': item.chapter, '単元番号': item.step, '単元名': item.title, '難度': item.difficulty,
      '教科書または進行表の種類': textbook, '元ファイル名': '26F進行表オモテ【中学理科】.xls'
    };
  });
}

function socialTrackRows_(sheet, domain) {
  const values = sheet.getDataRange().getDisplayValues(), out = [];
  [0, 11].forEach(function(base) {
    let chapter = '';
    for (let r = 2; r < values.length; r++) {
      const row = values[r] || [], nextChapter = importMasterText_(row[base]), step = importMasterText_(row[base + 1]), title = importMasterText_(row[base + 2]);
      if (nextChapter && nextChapter !== '章') chapter = nextChapter;
      if (!step || step === 'STEP' || !title || title === 'タイトル') continue;
      out.push({ chapter: domain + ' ' + chapter, step: domain + ' ' + step, title: title });
    }
  });
  return out;
}

function socialVariantRows_(geography, history, civics, textbook, slug) {
  return geography.concat(history, civics).map(function(item, index) {
    return {
      '単元ID': 'soc-common-' + slug + '-' + String(index + 1).padStart(4, '0'),
      '教科': '社会', '学年': '共通', '表示順': index + 1, '章': item.chapter, '単元番号': item.step, '単元名': item.title, '難度': '',
      '教科書または進行表の種類': textbook, '元ファイル名': '26F進行表オモテ【中学社会】.xls'
    };
  });
}

function ensureScienceSocialUnits_() {
  const markerKey = 'FORESTA_SCI_SOC_UNITS_V2', properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(markerKey) === 'done') return;
  const existing = objects_('単元マスタ'), existingIds = new Set(existing.map(function(row) { return text_(row['単元ID']); }));
  const scienceBook = SpreadsheetApp.openById('1xWIY6LuqhGRss3tInWdUYkQ0jErg7yALfWUPImjiV60');
  const socialBook = SpreadsheetApp.openById('1kdeA8KXBGyl3T2vJlql8CCMpayoVVenTuE70NK5WHYQ');
  const scienceDefs = [
    ['中1(東書)', '中1', '東書', 'tosho', 28], ['中1(啓林)', '中1', '啓林館', 'keirin', 28],
    ['中2(東書)', '中2', '東書', 'tosho', 57], ['中2(啓林)', '中2', '啓林館', 'keirin', 57],
    ['中3(東書)', '中3', '東書', 'tosho', 55], ['中3(啓林)', '中3', '啓林館', 'keirin', 55]
  ];
  let rows = [];
  scienceDefs.forEach(function(def) {
    const parsed = scienceRowsFromSheet_(scienceBook.getSheetByName(def[0]), def[1], def[2], def[3]);
    if (parsed.length !== def[4]) throw new Error('SCIENCE_UNIT_COUNT_' + def[0] + '_' + parsed.length);
    rows = rows.concat(parsed);
  });
  const geography = socialTrackRows_(socialBook.getSheetByName('地理(東書）'), '地理');
  const historyTosho = socialTrackRows_(socialBook.getSheetByName('歴史（東書）'), '歴史');
  const historyKyoiku = socialTrackRows_(socialBook.getSheetByName('歴史（教出） '), '歴史');
  const civics = socialTrackRows_(socialBook.getSheetByName('公民(東書）'), '公民');
  if (geography.length !== 60 || historyTosho.length !== 65 || historyKyoiku.length !== 65 || civics.length !== 32) throw new Error('SOCIAL_UNIT_COUNT_MISMATCH_' + [geography.length, historyTosho.length, historyKyoiku.length, civics.length].join('_'));
  rows = rows.concat(socialVariantRows_(geography, historyTosho, civics, '東書', 'tosho'));
  rows = rows.concat(socialVariantRows_(geography, historyKyoiku, civics, '歴史教出', 'hist-kyoiku'));
  if (rows.length !== 594) throw new Error('SCI_SOC_MASTER_COUNT_' + rows.length);
  const missing = rows.filter(function(row) { return !existingIds.has(text_(row['単元ID'])); });
  if (missing.length) appendObjects_('単元マスタ', missing);
  properties.setProperty(markerKey, 'done');
}

function authorizeStudentAccess_(data) {
  const session = loadSession_(data.token);
  let studentId = text_(data.studentId || session.studentId);
  if (session.role === 'student' && studentId !== session.studentId) throw new Error('FORBIDDEN');
  if (session.role === 'admin') {
    requireAdmin_(data);
    return { session: session, student: getActiveStudent_(studentId) };
  }
  if (['student', 'teacher'].indexOf(session.role) < 0) throw new Error('FORBIDDEN');
  return { session: session, student: getActiveStudent_(studentId) };
}

function getStudentDashboard_(data) {
  const access = authorizeStudentAccess_(data), student = access.student, tt = studentCourseInfo_(student.studentId);
  student.subjects = tt.subjects; student.englishLevel = tt.englishLevel; student.mathLevel = tt.mathLevel;
  const homework = homeworkFor_(student.studentId), note = latestNote_(student.studentId);
  if (isElementaryGrade_(student.grade)) {
    const subjects = elementarySubjects_(student, tt), progress = subjects.map(function(subject) { return elementaryProgressionFor_(student, subject, false).summary; });
    student.subjects = subjects;
    const response = { student:student,nextTest:null,scores:[],targets:{},homework:homework,note:note,progress:progress,elementary:{subjects:subjects,unitTests:elementaryUnitTestsFor_(student.studentId,30)},capabilities:{elementary:true,roundProgress:false,outsideRangeOverride:false,studentRoundInput:false,studentHomeworkCardsV2:true,homeworkArchive:true,homeworkSourceRules:true} };
    if (access.session.role === 'teacher') response.teacherCandidates = getActiveTeachers_().filter(function(t){return teacherMatchesCampus_(t.campus,student.campus);}).map(function(t){return{loginId:t.loginId,name:t.name,campus:t.campus};});
    return response;
  }
  const nextTest=nextTestFor_(student),scores=scoreHistory_(student.studentId),targets=targetsFor_(student.studentId,nextTest&&nextTest.testId),progress=TRACKED_SUBJECTS.map(function(subject){return progressionFor_(student,subject,false).summary;});
  const response={student:student,nextTest:nextTest,scores:scores,targets:targets,homework:homework,note:note,progress:progress,capabilities:{roundProgress:true,outsideRangeOverride:true,studentRoundInput:true,studentHomeworkCardsV2:true,homeworkArchive:true,homeworkSourceRules:true}};
  if(access.session.role==='teacher')response.teacherCandidates=getActiveTeachers_().filter(function(t){return teacherMatchesCampus_(t.campus,student.campus);}).map(function(t){return{loginId:t.loginId,name:t.name,campus:t.campus};});
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
  const schoolKey = student.schoolKey || normalizeSchool_(student.school);
  const alternateSchool = ['志段味中', '吉根中'].indexOf(schoolKey) >= 0;
  let textbook = '標準版';
  if(isElementaryGrade_(student.grade)){if(subject==='算数')textbook='啓林館';else if(subject==='国語')textbook='NEW小学ワーク光村';else if(subject==='英語'){const info=studentCourseInfo_(student.studentId),level=elementaryEnglishLevel_(info.englishLevel||student.englishLevel);textbook=level?'小学英語'+level:'';}else return{textbook:'',units:[]};}else
  if (subject === '英語') {
    const setting = objects_('学校別英語教科書設定').find(function(row) { return normalizeSchool_(row['学校名正規化キー']) === schoolKey; });
    textbook = setting ? text_(setting['教科書']) : '';
  } else if (subject === '理科') textbook = alternateSchool ? '啓林館' : '東書';
  else if (subject === '社会') textbook = alternateSchool ? '歴史教出' : '東書';
  if (!textbook) return { textbook: '', units: [] };
  const cache = CacheService.getScriptCache(), key = 'UNITS_' + subject + '_' + student.grade + '_' + textbook;
  const hit = cache.get(key); if (hit) return { textbook: textbook, units: JSON.parse(hit) };
  const units = objects_('単元マスタ').filter(function(row) {
    const rowGrade = text_(row['学年']);
    const gradeMatches = normalizeGrade_(rowGrade) === student.grade || (subject === '社会' && rowGrade === '共通') || (isElementaryGrade_(student.grade) && subject === '英語' && rowGrade === '小学');
    return text_(row['教科']) === subject && gradeMatches && text_(row['教科書または進行表の種類']) === textbook;
  }).map(function(row) { return { unitId: text_(row['単元ID']), subject: subject, grade: student.grade, displayOrder: Number(row['表示順'] || 0), chapter: text_(row['章']), unitNumber: text_(row['単元番号']), unitName: text_(row['単元名']), difficulty: text_(row['難度']), textbook: textbook }; }).sort(function(a, b) { return a.displayOrder - b.displayOrder; });
  if (JSON.stringify(units).length < 95000) cache.put(key, JSON.stringify(units), 21600);
  return { textbook: textbook, units: units };
}

function omission_(difficulty, level) {
  const diff = text_(difficulty).replace(/[！❕]/g, '!').replace(/‼/g, '!!'), lv = Number(level);
  if (lv === 1) return diff === '!' || diff === '!!'; if (lv === 2) return diff === '!!'; return false;
}

function studentRoundRows_(studentId, subject) {
  try {
    return objects_('生徒周回進捗').filter(function(row) { return text_(row['生徒ID']) === text_(studentId) && (!subject || text_(row['科目']) === text_(subject)); });
  } catch (error) {
    if (String(error && error.message || '') === 'SHEET_NOT_FOUND') return [];
    throw error;
  }
}

function roundStateForUnits_(studentId, subject, unitIds) {
  const wanted = new Set((unitIds || []).map(text_)), state = {};
  wanted.forEach(function(unitId) { state[unitId] = {}; });
  const lessonDates = {};
  objects_('授業実施単元').filter(function(row) { return text_(row['生徒ID']) === text_(studentId) && text_(row['科目']) === text_(subject) && wanted.has(text_(row['単元ID'])); }).forEach(function(row) {
    const unitId = text_(row['単元ID']); if (!lessonDates[unitId]) lessonDates[unitId] = []; lessonDates[unitId].push(new Date(row['実施日']));
  });
  Object.keys(lessonDates).forEach(function(unitId) { lessonDates[unitId].sort(function(a,b){return a-b;}); lessonDates[unitId].slice(0,3).forEach(function(date,index){ state[unitId][index+1] = { completed:true, date:date, source:'講師授業', eventId:'' }; }); });
  studentRoundRows_(studentId, subject).forEach(function(row) {
    const unitId = text_(row['単元ID']), round = Number(row['周回']); if (!wanted.has(unitId) || round < 1 || round > 3) return;
    state[unitId][round] = { completed:true, date:new Date(row['学習日']), source:text_(row['入力元']), eventId:text_(row['イベントID']) };
  });
  return state;
}

function roundProgressSummary_(roundState, targetIds) {
  const ids = Array.from(targetIds || []), counts = {1:0,2:0,3:0};
  ids.forEach(function(unitId){ const rounds=roundState[unitId]||{}; [1,2,3].forEach(function(round){if(rounds[round]&&rounds[round].completed)counts[round]++;}); });
  return { targetCount:ids.length, roundCounts:counts, totalCompleted:counts[1]+counts[2]+counts[3], overallPercent:ids.length?Math.round((counts[1]+counts[2]+counts[3])/ids.length*100):0 };
}

function roundHomeworkItems_(subject, roundNumber, unit) {
  const label = normalizeText_((unit && unit.unitName || '') + (unit && unit.unitNumber || ''));
  if (roundNumber >= 2) {
    if (subject === '英語') return label.indexOf('keywordstest') >= 0 ? ['KEYWORDSの暗記'] : ['KEYWORDSの暗記','TRYの赤×直し','エクササイズの赤×直し'];
    if (subject === '数学') return ['TRYの赤×直し','エクササイズの赤×直し'];
    return [];
  }
  if (subject === '英語') return label.indexOf('keywordstest') >= 0 ? ['巻末のKeyWordsTestの暗記'] : ['KeyWords「☆日→英」暗記','exercise「暗記マーク」暗記','Try赤×直し','exercise','宿題の赤×直し'];
  if (subject === '数学') return ['TRYの赤×直し','exercise','宿題の赤×直し'];
  return [];
}

function progressionFor_(student, subject, includeUnits) {
  const source = unitsFor_(student, subject), units = source.units, nextTest = nextTestFor_(student), tt = studentCourseInfo_(student.studentId), level = subject === '英語' ? tt.englishLevel : subject === '数学' ? tt.mathLevel : '';
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
  const learned = new Set(Object.keys(dateMap)); studentRoundRows_(student.studentId, subject).filter(function(row){return Number(row['周回'])===1;}).forEach(function(row){learned.add(text_(row['単元ID']));});
  const remainingUnits = effective.size ? units.filter(function(unit) { return effective.has(unit.unitId) && !learned.has(unit.unitId) && !omission_(unit.difficulty, level); }) : [];
  const forestaUnit = units.filter(function(unit) { return learned.has(unit.unitId); }).sort(function(a, b) { return b.displayOrder - a.displayOrder; })[0] || null;
  const schoolUnit = units.find(function(unit) { return unit.unitId === schoolUnitId; }) || null;
  let comparison = '未設定'; if (schoolUnit && forestaUnit) comparison = forestaUnit.displayOrder > schoolUnit.displayOrder ? '学校より先' : forestaUnit.displayOrder === schoolUnit.displayOrder ? '学校と同じ' : '学校より遅れ';
  let remainingLessons = null, required = null, urgent = false;
  if (nextTest && effective.size) { const target = new Date(nextTest.startDate); target.setDate(target.getDate() - 14); const days = Math.ceil((target.getTime() - new Date(todayKey_() + 'T00:00:00+09:00').getTime()) / 86400000); remainingLessons = Math.max(0, Math.ceil(days / 7)); required = remainingLessons > 0 ? Math.ceil(remainingUnits.length / remainingLessons) : null; urgent = remainingLessons <= 0 && remainingUnits.length > 0; }
  const roundState = roundStateForUnits_(student.studentId, subject, units.map(function(unit){return unit.unitId;})), targetIds = effective.size ? effective : new Set();
  const summary = { subject: subject, textbook: source.textbook || '未設定', level: level || '', levelMissing: (subject === '英語' || subject === '数学') && ['1','2','3'].indexOf(text_(level)) < 0, schoolUnitName: schoolUnit && schoolUnit.unitName, forestaUnitName: forestaUnit && forestaUnit.unitName, comparison: comparison, remaining: effective.size ? remainingUnits.length : null, remainingLessons: remainingLessons, requiredPerLesson: required, urgent: urgent, rangeType:decided.size?'決定':predicted.size?'予想':'', nextTest: nextTest, roundProgress: roundProgressSummary_(roundState, targetIds) };
  if (!includeUnits) return { summary: summary };
  const decorated = units.map(function(unit) { const roundInfo=roundState[unit.unitId]||{}, rounds=[1,2,3].map(function(roundNumber){const item=roundInfo[roundNumber];return{roundNumber:roundNumber,completed:!!item,date:item&&item.date?item.date.toISOString():'',source:item&&item.source||''};}),dates=rounds.filter(function(item){return item.completed;}).map(function(item){return new Date(item.date);}); return Object.assign({}, unit, { omittable: omission_(unit.difficulty, level), learned: dates.length > 0, learnedAt: dates.length ? dates[0].toISOString() : '', relearnedAt: dates.length > 1 ? dates[dates.length - 1].toISOString() : '', lessonDates: dates.map(function(date){return date.toISOString();}), rounds:rounds, completedRounds:rounds.filter(function(item){return item.completed;}).length, previous: previousIds.has(unit.unitId), schoolPosition: unit.unitId === schoolUnitId, schoolPositionAt: unit.unitId === schoolUnitId && schoolRows.length ? new Date(schoolRows[0]['登録日']).toISOString() : '', predictedOutside: predicted.size > 0 && !predicted.has(unit.unitId), decidedOutside: decided.size > 0 && !decided.has(unit.unitId), ctResult: ctMap[unit.unitId] || '' }); });
  return { title: student.grade + subject + ' / ' + (source.textbook || '進行表未登録'), units: decorated, selectedUnitIds: [], summary: summary };
}

function rangeIds_(sheetName, student, subject, testId) {
  if (!testId) return new Set();
  return new Set(objects_(sheetName).filter(function(row) { return text_(row['テストID']) === text_(testId) && normalizeSchool_(row['学校名正規化キー']) === student.schoolKey && normalizeGrade_(row['学年']) === student.grade && text_(row['科目']) === subject; }).map(function(row) { return text_(row['単元ID']); }));
}

function getProgression_(data) { const access=authorizeStudentAccess_(data),subject=text_(data.subject); if(isElementaryGrade_(access.student.grade)){if(['算数','国語','英語'].indexOf(subject)<0)return{title:'進行表未登録',units:[],selectedUnitIds:[],summary:{}};return elementaryProgressionFor_(access.student,subject,true);} if(TRACKED_SUBJECTS.indexOf(subject)<0)return{title:'進行表未登録',units:[],selectedUnitIds:[],summary:{}};return progressionFor_(access.student,subject,true); }

function targetsFor_(studentId, testId) { const out = {}; if (!testId) return out; objects_('テスト別目標点').filter(function(row) { return text_(row['生徒ID']) === studentId && text_(row['テストID']) === testId; }).forEach(function(row) { out[text_(row['科目'])] = row['目標点']; }); return out; }
function latestNote_(studentId) { const rows = objects_('生徒注意事項').filter(function(row) { return text_(row['生徒ID']) === studentId && String(row['有効']).toUpperCase() !== 'FALSE'; }).sort(function(a, b) { return new Date(b['更新日時']) - new Date(a['更新日時']); }); return rows.length ? { text: text_(rows[0]['本文']), updatedAt: rows[0]['更新日時'], updatedBy: text_(rows[0]['操作者名']) } : null; }

function homeworkRowsFor_(studentId, archived) {
  const wantArchived = !!archived;
  const homeworks = objects_('宿題').filter(function(row) {
    const isArchived = String(row['有効']).toUpperCase() === 'FALSE';
    return text_(row['生徒ID']) === text_(studentId) && isArchived === wantArchived;
  });
  const studentChecks = objects_('宿題の生徒チェック');
  const teacherChecks = objects_('宿題の講師チェック');
  const unitMap = {};
  objects_('単元マスタ').forEach(function(row) {
    unitMap[text_(row['単元ID'])] = { unitNumber: text_(row['単元番号']), unitName: text_(row['単元名']) };
  });
  const roundByEvent = {};
  studentRoundRows_(studentId, '').forEach(function(row) {
    roundByEvent[text_(row['イベントID'])] = Number(row['周回']) || 1;
  });
  return homeworks.map(function(row) {
    const id = text_(row['宿題ID']);
    const lessonId = text_(row['授業ID']);
    const studentCheck = studentChecks.filter(function(item) { return text_(item['宿題ID']) === id; }).sort(function(a, b) { return new Date(b['更新日時']) - new Date(a['更新日時']); })[0];
    const teacherCheck = teacherChecks.filter(function(item) { return text_(item['宿題ID']) === id; }).sort(function(a, b) { return new Date(b['更新日時']) - new Date(a['更新日時']); })[0];
    const due = new Date(row['推奨完了日']);
    const selfStudy = Object.prototype.hasOwnProperty.call(roundByEvent, lessonId);
    const studentChecked = !!studentCheck && String(studentCheck['チェック']).toUpperCase() !== 'FALSE';
    const teacherChecked = !!teacherCheck && String(teacherCheck['チェック']).toUpperCase() !== 'FALSE';
    const completed = selfStudy ? studentChecked : teacherChecked;
    return {
      homeworkId: id,
      lessonId: lessonId,
      subject: text_(row['科目']),
      unitId: text_(row['単元ID']),
      unitNumber: unitMap[text_(row['単元ID'])] && unitMap[text_(row['単元ID'])].unitNumber,
      unitName: unitMap[text_(row['単元ID'])] && unitMap[text_(row['単元ID'])].unitName,
      roundNumber: roundByEvent[lessonId] || '',
      source: selfStudy ? 'self' : 'teacher',
      sourceLabel: selfStudy ? '自主学習' : '講師からの宿題',
      completionMode: selfStudy ? 'student' : 'teacher',
      completed: completed,
      canArchive: !wantArchived && completed,
      archived: wantArchived,
      createdAt: row['作成日時'],
      contentType: text_(row['内容種別']),
      contentText: text_(row['内容本文']),
      recommendedDueDate: due.toISOString(),
      studentChecked: studentChecked,
      studentCheckedAt: studentCheck && studentCheck['チェック日時'],
      teacherChecked: teacherChecked,
      teacherCheckedAt: teacherCheck && teacherCheck['チェック日時'],
      overdue: due.getTime() < Date.now() && !completed
    };
  }).sort(function(a, b) { return new Date(b.recommendedDueDate) - new Date(a.recommendedDueDate); });
}

function homeworkFor_(studentId) { return homeworkRowsFor_(studentId, false); }
function archivedHomeworkFor_(studentId) { return homeworkRowsFor_(studentId, true); }

function homeworkIdsFrom_(data) {
  const raw = Array.isArray(data.homeworkIds) ? data.homeworkIds : [data.homeworkId];
  return Array.from(new Set(raw.map(text_).filter(Boolean)));
}

function homeworkMutationContext_(data, roles, archivedState) {
  const session = requireRole_(data, roles);
  const ids = homeworkIdsFrom_(data);
  if (!ids.length) throw new Error('INVALID_VALUE');
  const wanted = new Set(ids);
  const rows = objects_('宿題').filter(function(row) { return wanted.has(text_(row['宿題ID'])); });
  if (rows.length !== ids.length) throw new Error('INVALID_VALUE');
  const studentIds = Array.from(new Set(rows.map(function(row) { return text_(row['生徒ID']); })));
  if (studentIds.length !== 1) throw new Error('INVALID_VALUE');
  const studentId = studentIds[0];
  if (session.role === 'student' && studentId !== session.studentId) throw new Error('FORBIDDEN');
  const student = getActiveStudent_(studentId);
  if (typeof archivedState === 'boolean') {
    const invalidState = rows.some(function(row) {
      const isArchived = String(row['有効']).toUpperCase() === 'FALSE';
      return isArchived !== archivedState;
    });
    if (invalidState) throw new Error('INVALID_VALUE');
  }
  return { session: session, student: student, studentId: studentId, ids: ids, rows: rows };
}

function rewriteHomeworkActive_(context, active) {
  const ids = new Set(context.ids);
  const now = new Date();
  const updated = context.rows.map(function(row) {
    const copy = Object.assign({}, row);
    copy['有効'] = !!active;
    copy['更新日時'] = now;
    copy['操作者ID'] = context.session.loginId || context.session.studentId || '';
    copy['操作者名'] = context.session.name || '';
    return copy;
  });
  replaceRows_('宿題', function(row) { return ids.has(text_(row['宿題ID'])); }, updated);
}

function getHomeworkArchive_(data) {
  const session = requireRole_(data, ['student', 'teacher']);
  const studentId = session.role === 'student' ? session.studentId : text_(data.studentId);
  if (!studentId) throw new Error('INVALID_VALUE');
  const student = getActiveStudent_(studentId);
  return { student: student, homework: archivedHomeworkFor_(studentId), canDelete: session.role === 'teacher' };
}

function archiveHomework_(data) {
  const context = homeworkMutationContext_(data, ['student', 'teacher'], false);
  const statusMap = {};
  homeworkFor_(context.studentId).forEach(function(item) { statusMap[item.homeworkId] = item; });
  if (context.ids.some(function(id) { return !statusMap[id] || !statusMap[id].completed; })) throw new Error('HOMEWORK_NOT_COMPLETE');
  rewriteHomeworkActive_(context, false);
  audit_(context.session, '宿題アーカイブ', '宿題', context.ids.join(','), '成功', context.student.name);
  return { archived: context.ids.length };
}

function restoreHomework_(data) {
  const context = homeworkMutationContext_(data, ['student', 'teacher'], true);
  rewriteHomeworkActive_(context, true);
  audit_(context.session, '宿題復元', '宿題', context.ids.join(','), '成功', context.student.name);
  return { restored: context.ids.length };
}

function deleteHomework_(data) {
  const context = homeworkMutationContext_(data, ['teacher','student'], true);
  if (context.session.role === 'student') {
    const selfEvents = new Set(studentRoundRows_(context.studentId, '').map(function(row) { return text_(row['イベントID']); }).filter(Boolean));
    const allSelfStudy = context.rows.every(function(row) { return selfEvents.has(text_(row['授業ID'])); });
    if (!allSelfStudy) throw new Error('FORBIDDEN');
  }
  const ids = new Set(context.ids);
  replaceRows_('宿題の生徒チェック', function(row) { return ids.has(text_(row['宿題ID'])); }, []);
  replaceRows_('宿題の講師チェック', function(row) { return ids.has(text_(row['宿題ID'])); }, []);
  replaceRows_('宿題', function(row) { return ids.has(text_(row['宿題ID'])); }, []);
  audit_(context.session, '宿題完全削除', '宿題', context.ids.join(','), '成功', context.student.name + (context.session.role === 'student' ? ' / 自主学習' : ''));
  return { deleted: context.ids.length };
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
  const allActiveStudents=getActiveStudents_(), base = all ? allActiveStudents : todayScheduledStudents_(), subjectCache=subjectCacheMap_(), today = todayKey_(), allLessons=objects_('授業記録').sort(function(a,b){return new Date(b['更新日時']||b['授業日'])-new Date(a['更新日時']||a['授業日']);}), lessons = allLessons.filter(function(row){return Utilities.formatDate(new Date(row['授業日']),CONFIG.TIME_ZONE,'yyyy-MM-dd')===today;}), lessonUnits = objects_('授業実施単元'), cts = objects_('CT記録'), trainings = objects_('特訓部屋対応'), comments = objects_('講師コメント'), reads = new Set(objects_('コメント既読管理').filter(function(r){return String(r['確認済み']).toUpperCase()!=='FALSE';}).map(function(r){return text_(r['コメントID']);}));
  const students = base.map(function(student) {
    const mine = lessons.filter(function(row){return text_(row['生徒ID'])===student.studentId;}), studentLessons=allLessons.filter(function(row){return text_(row['生徒ID'])===student.studentId;}), listLessons=all?studentLessons:mine, ids = new Set(mine.map(function(row){return text_(row['授業ID']);})), units = lessonUnits.filter(function(row){return ids.has(text_(row['授業ID']));}), ct = cts.filter(function(row){return text_(row['生徒ID'])===student.studentId;}).sort(function(a,b){return new Date(b['実施日'])-new Date(a['実施日']);})[0], elementary=isElementaryGrade_(student.grade), plannedSubjects=student.subjects || (subjectCache[student.studentId]&&subjectCache[student.studentId].subjects)||[], middleProgress=elementary?[]:plannedSubjects.filter(function(subject){return TRACKED_SUBJECTS.indexOf(subject)>=0;}).map(function(subject){return progressionFor_(student,subject,false).summary;}), progress=middleProgress.find(function(x){return x.remaining!=null;})||middleProgress.find(function(x){return x.schoolUnitName||x.forestaUnitName;})||{}, elementaryProgress=elementary?plannedSubjects.map(function(subject){return subject==='数学'?'算数':subject;}).filter(function(subject,index,list){return ['算数','国語','英語'].indexOf(subject)>=0&&list.indexOf(subject)===index;}).map(function(subject){return elementaryProgressionFor_(student,subject,false).summary;}):[], elementaryDifferences=elementaryProgress.map(function(item){const value=item.differenceUnits,label=value==null?'進度未入力':value>0?'学校から+'+value:value<0?'学校から'+value:'学校から±0';return{subject:item.subject,differenceUnits:value,label:label,schoolUnitId:item.schoolUnitId||'',forestaUnitId:item.forestaUnitId||''};}), hw = homeworkFor_(student.studentId), hs = { total: hw.length, confirmed: hw.filter(function(x){return x.teacherChecked;}).length }, alerts = [];
    const studentTraining=trainings.filter(function(r){return text_(r['生徒ID'])===student.studentId;}).sort(function(a,b){return new Date(b['更新日時'])-new Date(a['更新日時']);})[0];
    if (!student.schoolKey) alerts.push('学校未登録'); if (student.school && !/^.*中(学校)?$/.test(student.school) && /^中[123]$/.test(student.grade)) alerts.push('学校名照合エラー'); if (!mine.length && !all) alerts.push('本日の記録未入力');
    if(!elementary){if (progress.comparison === '学校より遅れ' || progress.comparison === '学校と同じ') alerts.push(progress.comparison); if (progress.levelMissing) alerts.push('AO・AP未登録'); if (!progress.nextTest) alerts.push('次回テスト未登録'); if (progress.nextTest && progress.remaining==null) alerts.push('テスト範囲未登録'); if (ct && text_(ct['結果'])==='×') alerts.push('CT×'); if(studentTraining&&text_(studentTraining['対応状況'])!=='完了')alerts.push('特訓部屋未対応'); if (hs.confirmed < hs.total) alerts.push('宿題未完了');}
    if (comments.some(function(c){return text_(c['生徒ID'])===student.studentId&&!reads.has(text_(c['コメントID']));})) alerts.push('未読コメント');
    return Object.assign({}, student, { plannedSubjects:plannedSubjects, recordedSubjects:Array.from(new Set(listLessons.map(function(r){return text_(r['科目']);}).filter(Boolean))), actualTeachers:Array.from(new Set(listLessons.map(function(r){return text_(r['実担当講師名']);}).filter(Boolean))).slice(0,3), learnedToday: new Set(units.map(function(r){return text_(r['単元ID']);})).size, progressSubject:progress.subject||'', remaining: progress.remaining, remainingLessons:progress.remainingLessons, requiredPerLesson:progress.requiredPerLesson, comparison:elementary?(elementaryDifferences.map(function(item){return item.subject+' '+item.label;}).join(' / ')||'進度未入力'):progress.comparison, elementaryDifferences:elementaryDifferences, progressDataSource:elementary?'gas-elementary-fallback':'gas-progression', teacherDataSource:all?'latest-lesson-history':'today-lesson-history', ctResult: ct && text_(ct['結果']), trainingStatus:studentTraining&&text_(studentTraining['対応状況']), homeworkConfirmed: hs.confirmed, homeworkTotal: hs.total, alerts: alerts, updatedAt: listLessons.length ? listLessons[0]['更新日時'] : '' });
  });
  const schools=Array.from(new Set(allActiveStudents.map(function(student){return student.school;}).filter(Boolean))).sort();
  const directory=allActiveStudents.map(function(student){return {studentId:student.studentId,name:student.name,reading:student.reading,romaji:student.romaji,campus:student.campus,filterCampus:student.filterCampus,grade:student.grade,school:student.school};});
  return { students: students, directory:directory, filterOptions:{campuses:['神領','大手町'],grades:Array.from(new Set(allActiveStudents.map(function(student){return student.grade;}).filter(Boolean))).sort(),schools:schools} };
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
  const session=requireRole_(data,['teacher']),student=getActiveStudent_(data.studentId),subject=text_(data.subject),source=unitsFor_(student,subject),valid=new Set(source.units.map(function(u){return u.unitId;})),ids=Array.from(new Set(data.unitIds||[])),key=text_(data.idempotencyKey);if(!key||!ids.length||ids.some(function(id){return!valid.has(id);}))throw new Error('INVALID_UNIT');const nextTest=nextTestFor_(student),predicted=rangeIds_('学校別予想テスト範囲',student,subject,nextTest&&nextTest.testId),decided=rangeIds_('学校別決定テスト範囲',student,subject,nextTest&&nextTest.testId),effective=decided.size?decided:predicted,overrideIds=new Set((data.outsideRangeOverrideUnitIds||[]).map(text_)),outsideIds=effective.size?ids.filter(function(id){return!effective.has(id);}):[];if(outsideIds.some(function(id){return!overrideIds.has(id);}))throw new Error('OUTSIDE_TEST_RANGE');
  const candidateId=text_(data.teacherId)||session.loginId,candidate=getActiveTeachers_().find(function(t){return t.loginId===candidateId&&teacherMatchesCampus_(t.campus,student.campus);});if(!candidate)throw new Error('FORBIDDEN');
  const specialHomework='巻末のKeyWordsTestの暗記',allowed=allowedHomeworkForStudent_(student,subject),fallbackRequested=Array.isArray(data.homeworkItems)?data.homeworkItems.map(text_):allowed,homeworkByUnit=data.homeworkByUnit&&typeof data.homeworkByUnit==='object'?data.homeworkByUnit:{},unitMap={};source.units.forEach(function(unit){unitMap[unit.unitId]=unit;});const lock=LockService.getScriptLock();lock.waitLock(30000);try{const existingLessons=objects_('授業記録'),existing=existingLessons.find(function(r){return text_(r['冪等キー'])===key;});if(existing)return{saved:true,lessonId:text_(existing['授業ID']),duplicatePrevented:true};const existingHomeworkKeys=new Set(objects_('宿題').map(function(r){return text_(r['冪等キー']);})),lessonId=uuid_('LESSON'),now=new Date(),due=new Date(now),prior=new Set(objects_('授業実施単元').filter(function(r){return text_(r['生徒ID'])===student.studentId&&text_(r['科目'])===subject;}).map(function(r){return text_(r['単元ID']);})),lessonUnitRows=[],homeworkRows=[],roundProgressRows=[],roundState=roundStateForUnits_(student.studentId,subject,ids);due.setDate(due.getDate()+2);appendObject_('授業記録',{'授業ID':lessonId,'生徒ID':student.studentId,'科目':subject,'授業日':now,'予定担当講師ID':session.loginId,'予定担当講師名':session.name,'実担当講師ID':candidate.loginId,'実担当講師名':candidate.name,'冪等キー':key,'作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});ids.forEach(function(unitId){const raw=Array.isArray(homeworkByUnit[unitId])?homeworkByUnit[unitId].map(text_):fallbackRequested,validated=Array.from(new Set(raw.filter(function(item){return allowed.indexOf(item)>=0||/^その他：.{1,120}$/u.test(item);}))),unitHomework=homeworkItemsForUnit_(subject,unitMap[unitId],validated);lessonUnitRows.push({'授業単元ID':uuid_('LESSONUNIT'),'授業ID':lessonId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'実施日':now,'再学習':prior.has(unitId),'作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});const nextRound=[1,2,3].find(function(round){return!(roundState[unitId]||{})[round];});if(nextRound&&!isElementaryGrade_(student.grade))roundProgressRows.push({'進捗ID':uuid_('ROUND'),'イベントID':lessonId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'周回':nextRound,'学習日':now,'入力元':'講師授業','作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});unitHomework.forEach(function(type){const homeworkKey=lessonId+'|'+unitId+'|'+type;if(existingHomeworkKeys.has(homeworkKey))return;const other=/^その他：/u.test(type);homeworkRows.push({'宿題ID':uuid_('HW'),'授業ID':lessonId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'内容種別':other?'その他':type,'内容本文':type,'推奨完了日':due,'有効':true,'その他':other?type.replace(/^その他：/u,''):'','冪等キー':homeworkKey,'作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});});});appendObjects_('授業実施単元',lessonUnitRows);if(roundProgressRows.length)appendObjects_('生徒周回進捗',roundProgressRows);appendObjects_('宿題',homeworkRows);audit_(session,'授業保存','授業記録',lessonId,'成功',ids.length+'単元');return{saved:true,lessonId:lessonId,unitCount:ids.length,homeworkCount:homeworkRows.length};}finally{lock.releaseLock();}
}

function getLessonCorrections_(data) {
  const session = requireRole_(data, ['teacher']), student = getActiveStudent_(data.studentId);
  if (!teacherMatchesCampus_(session.campus, student.campus)) throw new Error('FORBIDDEN');
  const lessons = objects_('授業記録').filter(function(row) {
    return text_(row['生徒ID']) === student.studentId && (TRACKED_SUBJECTS.indexOf(text_(row['科目'])) >= 0 || (isElementaryGrade_(student.grade) && ['算数','国語','英語'].indexOf(text_(row['科目'])) >= 0));
  }).sort(function(a, b) { return new Date(b['授業日']) - new Date(a['授業日']); }).slice(0, 12);
  const lessonUnits = objects_('授業実施単元'), homeworkRows = objects_('宿題'), unitMap = {};
  objects_('単元マスタ').forEach(function(row) {
    unitMap[text_(row['単元ID'])] = { unitId: text_(row['単元ID']), chapter: text_(row['章']), unitNumber: text_(row['単元番号']), unitName: text_(row['単元名']) };
  });
  return { lessons: lessons.map(function(lesson) {
    const lessonId = text_(lesson['授業ID']), unitIds = lessonUnits.filter(function(row) { return text_(row['授業ID']) === lessonId; }).map(function(row) { return text_(row['単元ID']); });
    const homeworkByUnit = {};
    homeworkRows.filter(function(row) { return text_(row['授業ID']) === lessonId && String(row['有効']).toUpperCase() !== 'FALSE'; }).forEach(function(row) {
      const unitId = text_(row['単元ID']); if (!homeworkByUnit[unitId]) homeworkByUnit[unitId] = [];
      homeworkByUnit[unitId].push(text_(row['内容本文']) || text_(row['内容種別']));
    });
    return { lessonId: lessonId, date: lesson['授業日'], subject: text_(lesson['科目']), teacherName: text_(lesson['実担当講師名']), unitIds: unitIds, units: unitIds.map(function(id) { return unitMap[id] || { unitId: id, chapter: '', unitNumber: id, unitName: '' }; }), homeworkByUnit: homeworkByUnit };
  }) };
}

function updateLessonCorrection_(data) {
  const session = requireRole_(data, ['teacher']), student = getActiveStudent_(data.studentId), lessonId = text_(data.lessonId);
  if (!teacherMatchesCampus_(session.campus, student.campus)) throw new Error('FORBIDDEN');
  const lesson = objects_('授業記録').find(function(row) { return text_(row['授業ID']) === lessonId && text_(row['生徒ID']) === student.studentId; });
  if (!lesson) throw new Error('INVALID_VALUE');
  const subject = text_(lesson['科目']), source = unitsFor_(student, subject), unitMap = {}, valid = new Set();
  source.units.forEach(function(unit) { unitMap[unit.unitId] = unit; valid.add(unit.unitId); });
  const ids = Array.from(new Set((data.unitIds || []).map(text_)));
  if (!ids.length || ids.some(function(id) { return !valid.has(id); })) throw new Error('INVALID_UNIT');
  const specialHomework = '巻末のKeyWordsTestの暗記', allowed = allowedHomeworkForStudent_(student, subject);
  const homeworkByUnit = data.homeworkByUnit && typeof data.homeworkByUnit === 'object' ? data.homeworkByUnit : {}, lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = new Date(), lessonDate = new Date(lesson['授業日']), dueFallback = new Date(lessonDate), oldUnits = objects_('授業実施単元').filter(function(row) { return text_(row['授業ID']) === lessonId; }), oldUnitMap = {}, prior = new Set(), newUnitRows = [];
    oldUnits.forEach(function(row) { oldUnitMap[text_(row['単元ID'])] = row; });
    objects_('授業実施単元').filter(function(row) { return text_(row['授業ID']) !== lessonId && text_(row['生徒ID']) === student.studentId && text_(row['科目']) === subject; }).forEach(function(row) { prior.add(text_(row['単元ID'])); });
    ids.forEach(function(unitId) {
      const old = oldUnitMap[unitId] || {};
      newUnitRows.push({'授業単元ID':text_(old['授業単元ID'])||uuid_('LESSONUNIT'),'授業ID':lessonId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'実施日':old['実施日']||lessonDate,'再学習':prior.has(unitId),'作成日時':old['作成日時']||now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});
    });
    dueFallback.setDate(dueFallback.getDate() + 2);
    const oldHomework = objects_('宿題').filter(function(row) { return text_(row['授業ID']) === lessonId; }), oldHomeworkMap = {}, newHomeworkRows = [];
    oldHomework.forEach(function(row) { oldHomeworkMap[text_(row['単元ID']) + '|' + (text_(row['内容本文']) || text_(row['内容種別']))] = row; });
    ids.forEach(function(unitId) {
      const raw = Array.isArray(homeworkByUnit[unitId]) ? homeworkByUnit[unitId].map(text_) : [], validated = Array.from(new Set(raw.filter(function(item) { return allowed.indexOf(item) >= 0 || /^その他：.{1,120}$/u.test(item); }))), unitHomework = homeworkItemsForUnit_(subject, unitMap[unitId], validated);
      unitHomework.forEach(function(type) {
        const old = oldHomeworkMap[unitId + '|' + type] || {}, other = /^その他：/u.test(type);
        newHomeworkRows.push({'宿題ID':text_(old['宿題ID'])||uuid_('HW'),'授業ID':lessonId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'内容種別':other?'その他':type,'内容本文':type,'推奨完了日':old['推奨完了日']||dueFallback,'有効':true,'その他':other?type.replace(/^その他：/u,''):'','冪等キー':lessonId+'|'+unitId+'|'+type,'作成日時':old['作成日時']||now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});
      });
    });
    replaceRows_('授業実施単元', function(row) { return text_(row['授業ID']) === lessonId; }, newUnitRows);
    replaceRows_('宿題', function(row) { return text_(row['授業ID']) === lessonId; }, newHomeworkRows);
    const correctedLesson = Object.assign({}, lesson, {'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});
    replaceRows_('授業記録', function(row) { return text_(row['授業ID']) === lessonId; }, [correctedLesson]);
    audit_(session, '授業・宿題訂正', '授業記録', lessonId, '成功', ids.length + '単元・宿題' + newHomeworkRows.length + '件');
    return { saved: true, lessonId: lessonId, unitCount: ids.length, homeworkCount: newHomeworkRows.length };
  } finally { lock.releaseLock(); }
}
function createHomework_(lessonId,student,subject,unitId,items,session,date){const due=new Date(date);due.setDate(due.getDate()+2);items.forEach(function(type){const other=/^その他：/u.test(type),key=lessonId+'|'+unitId+'|'+type;if(objects_('宿題').some(function(r){return text_(r['冪等キー'])===key;}))return;appendObject_('宿題',{'宿題ID':uuid_('HW'),'授業ID':lessonId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'内容種別':other?'その他':type,'内容本文':type,'推奨完了日':due,'有効':true,'その他':other?type.replace(/^その他：/u,''):'','冪等キー':key,'作成日時':date,'更新日時':date,'操作者ID':session.loginId,'操作者名':session.name});});}

function saveStudentRoundProgress_(data) {
  const session=requireRole_(data,['student']),student=getActiveStudent_(session.studentId),subject=text_(data.subject),unitId=text_(data.unitId),roundNumber=Number(data.roundNumber),checked=!!data.checked;
  if(TRACKED_SUBJECTS.indexOf(subject)<0||[1,2,3].indexOf(roundNumber)<0)throw new Error('INVALID_VALUE');
  const source=unitsFor_(student,subject),unit=source.units.find(function(item){return item.unitId===unitId;});if(!unit)throw new Error('INVALID_UNIT');
  const nextTest=nextTestFor_(student),predicted=rangeIds_('学校別予想テスト範囲',student,subject,nextTest&&nextTest.testId),decided=rangeIds_('学校別決定テスト範囲',student,subject,nextTest&&nextTest.testId),effective=decided.size?decided:predicted;
  if(effective.size&&!effective.has(unitId)&&!data.outsideRangeOverride)throw new Error('OUTSIDE_TEST_RANGE');
  const lock=LockService.getScriptLock();lock.waitLock(30000);try{
    const roundRows=studentRoundRows_(student.studentId,subject),own=roundRows.find(function(row){return text_(row['単元ID'])===unitId&&Number(row['周回'])===roundNumber&&text_(row['入力元'])==='生徒';}),state=roundStateForUnits_(student.studentId,subject,[unitId]),rounds=state[unitId]||{};
    if(checked){
      if(rounds[roundNumber]&&rounds[roundNumber].completed)return{saved:true,rounds:[1,2,3].map(function(r){const item=rounds[r];return{roundNumber:r,completed:!!item,date:item&&item.date?item.date.toISOString():''};}),homeworkCreated:0};
      if(roundNumber>1&&!(rounds[roundNumber-1]&&rounds[roundNumber-1].completed))throw new Error('ROUND_ORDER');
      const now=new Date(),eventId=uuid_('SELFROUND');appendObject_('生徒周回進捗',{'進捗ID':uuid_('ROUND'),'イベントID':eventId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'周回':roundNumber,'学習日':now,'入力元':'生徒','作成日時':now,'更新日時':now,'操作者ID':student.studentId,'操作者名':student.name});
      const items=roundHomeworkItems_(subject,roundNumber,unit),due=new Date(now),rows=[];due.setDate(due.getDate()+2);items.forEach(function(type){rows.push({'宿題ID':uuid_('HW'),'授業ID':eventId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'内容種別':type,'内容本文':type,'推奨完了日':due,'有効':true,'その他':'','冪等キー':eventId+'|'+unitId+'|'+type,'作成日時':now,'更新日時':now,'操作者ID':student.studentId,'操作者名':student.name});});if(rows.length)appendObjects_('宿題',rows);
      const updated=roundStateForUnits_(student.studentId,subject,[unitId])[unitId]||{};audit_(session,'生徒周回入力','生徒周回進捗',eventId,'成功',subject+' '+roundNumber+'周目');return{saved:true,rounds:[1,2,3].map(function(r){const item=updated[r];return{roundNumber:r,completed:!!item,date:item&&item.date?item.date.toISOString():''};}),homeworkCreated:rows.length};
    }
    if(!own)return{saved:true,rounds:[1,2,3].map(function(r){const item=rounds[r];return{roundNumber:r,completed:!!item,date:item&&item.date?item.date.toISOString():''};}),homeworkCreated:0};
    if(roundNumber<3&&rounds[roundNumber+1]&&rounds[roundNumber+1].completed)throw new Error('ROUND_ORDER');
    const eventId=text_(own['イベントID']),homeworkIds=objects_('宿題').filter(function(row){return text_(row['授業ID'])===eventId;}).map(function(row){return text_(row['宿題ID']);});
    if(homeworkIds.length){const ids=new Set(homeworkIds);replaceRows_('宿題の生徒チェック',function(row){return ids.has(text_(row['宿題ID']));},[]);replaceRows_('宿題の講師チェック',function(row){return ids.has(text_(row['宿題ID']));},[]);replaceRows_('宿題',function(row){return text_(row['授業ID'])===eventId;},[]);}
    replaceRows_('生徒周回進捗',function(row){return text_(row['進捗ID'])===text_(own['進捗ID']);},[]);const updated=roundStateForUnits_(student.studentId,subject,[unitId])[unitId]||{};audit_(session,'生徒周回取消','生徒周回進捗',eventId,'成功',subject+' '+roundNumber+'周目');return{saved:true,rounds:[1,2,3].map(function(r){const item=updated[r];return{roundNumber:r,completed:!!item,date:item&&item.date?item.date.toISOString():''};}),homeworkCreated:0};
  }finally{lock.releaseLock();}
}

function saveCt_(data) {
  const session=requireRole_(data,['teacher']),student=getActiveStudent_(data.studentId),subject=text_(data.subject),unitId=text_(data.unitId),result=text_(data.result),key=text_(data.idempotencyKey);if(['英語','数学'].indexOf(subject)<0||['◎','〇','×'].indexOf(result)<0)throw new Error('INVALID_VALUE');const lessons=objects_('授業記録').filter(function(r){return text_(r['生徒ID'])===student.studentId&&text_(r['科目'])===subject;}).sort(function(a,b){return new Date(b['授業日'])-new Date(a['授業日']);});if(!lessons.length)throw new Error('CT_NOT_PREVIOUS');const lessonId=text_(lessons[0]['授業ID']),previous=new Set(objects_('授業実施単元').filter(function(r){return text_(r['授業ID'])===lessonId;}).map(function(r){return text_(r['単元ID']);}));if(!previous.has(unitId))throw new Error('CT_NOT_PREVIOUS');const lock=LockService.getScriptLock();lock.waitLock(30000);try{const cts=objects_('CT記録');if(cts.some(function(r){return text_(r['生徒ID'])===student.studentId&&text_(r['科目'])===subject&&text_(r['授業ID'])===lessonId;}))throw new Error('DUPLICATE_CT');const ctId=uuid_('CT'),now=new Date();appendObject_('CT記録',{'CTID':ctId,'授業ID':lessonId,'生徒ID':student.studentId,'科目':subject,'単元ID':unitId,'結果':result,'実施日':now,'担当講師ID':session.loginId,'担当講師名':session.name,'冪等キー':key,'作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});if(result==='×')createTraining_(ctId,student,subject,unitId,session,now);return{saved:true,ctId:ctId};}finally{lock.releaseLock();}
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

function refreshSubjectCache_(data){
  const admin=requireAdmin_(data),props=PropertiesService.getScriptProperties(),url=props.getProperty('FORESTA_TIMETABLE_SYNC_URL'),secret=props.getProperty('FORESTA_SYNC_SECRET');
  if(!url||!secret)throw new Error('SYNC_NOT_CONFIGURED');
  const response=UrlFetchApp.fetch(url+'?force=1',{method:'post',headers:{Authorization:'Bearer '+secret},muteHttpExceptions:true});
  const result=JSON.parse(response.getContentText()||'{}');
  if(response.getResponseCode()>=300||!result.ok)throw new Error('SYNC_FAILED');
  audit_(admin,'受講科目V3同期','時間割マスタ','ALL','成功',result.rowCount+'件');
  return{count:result.rowCount,lastSuccessAt:result.lastSuccessAt};
}
function saveSchoolTextbook_(data){const admin=requireAdmin_(data),school=text_(data.school),key=normalizeSchool_(school),book=text_(data.textbook),allowed=['ニュークラウン','サンシャイン','ニューホライズン','ワンワールド','ヒアウィゴー','ブルースカイ'];if(!key||allowed.indexOf(book)<0)throw new Error('INVALID_VALUE');const now=new Date(),row={'設定ID':'BOOK-'+key,'学校名正規化キー':key,'学校名表示':school,'教科書':book,'根拠URL':'管理者設定','作成日時':now,'更新日時':now,'操作者ID':admin.loginId,'操作者名':admin.name};replaceRows_('学校別英語教科書設定',function(r){return normalizeSchool_(r['学校名正規化キー'])===key;},[row]);return{saved:true};}


const ELEMENTARY_PROGRESSIONS_={"version":"2026-08-31","math":{"小3":[{"unitId":"ELEM-MATH-3-001","displayOrder":1,"chapter":"1","unitNumber":"1-1","unitName":"かけ算のきまり①","page":"【上】12-14"},{"unitId":"ELEM-MATH-3-002","displayOrder":2,"chapter":"1","unitNumber":"1-2","unitName":"かけ算のきまり②","page":"12-14"},{"unitId":"ELEM-MATH-3-003","displayOrder":3,"chapter":"3","unitNumber":"3-1","unitName":"わり算","page":"19-24"},{"unitId":"ELEM-MATH-3-004","displayOrder":4,"chapter":"3","unitNumber":"3-2","unitName":"分け方とわり算","page":"19-24"},{"unitId":"ELEM-MATH-3-005","displayOrder":5,"chapter":"11","unitNumber":"11-1","unitName":"答えが１０をこえるわり算","page":"28,29"},{"unitId":"ELEM-MATH-3-006","displayOrder":6,"chapter":"4","unitNumber":"4-1","unitName":"たし算の筆算","page":"37-39,45"},{"unitId":"ELEM-MATH-3-007","displayOrder":7,"chapter":"4","unitNumber":"4-2","unitName":"ひき算の筆算①","page":"40-42,45"},{"unitId":"ELEM-MATH-3-008","displayOrder":8,"chapter":"4","unitNumber":"4-3","unitName":"ひき算の筆算②","page":"43"},{"unitId":"ELEM-MATH-3-009","displayOrder":9,"chapter":"4","unitNumber":"4-4","unitName":"たし算とひき算","page":"37-43"},{"unitId":"ELEM-MATH-3-010","displayOrder":10,"chapter":"2","unitNumber":"2-1","unitName":"時こくのもとめ方","page":"51,52"},{"unitId":"ELEM-MATH-3-011","displayOrder":11,"chapter":"2","unitNumber":"2-2","unitName":"時間のもとめ方・時間のたんい","page":"51,53"},{"unitId":"ELEM-MATH-3-012","displayOrder":12,"chapter":"9","unitNumber":"9-1","unitName":"大きな数の表し方","page":"57-61"},{"unitId":"ELEM-MATH-3-013","displayOrder":13,"chapter":"9","unitNumber":"9-2","unitName":"大きな数のしくみ","page":"63,64"},{"unitId":"ELEM-MATH-3-014","displayOrder":14,"chapter":"9","unitNumber":"9-3","unitName":"大きな数の大小","page":"62"},{"unitId":"ELEM-MATH-3-015","displayOrder":15,"chapter":"9","unitNumber":"9-4","unitName":"１０倍した数と１０でわった数","page":"65-68"},{"unitId":"ELEM-MATH-3-016","displayOrder":16,"chapter":"6","unitNumber":"6-1","unitName":"整理のしかた","page":"73"},{"unitId":"ELEM-MATH-3-017","displayOrder":17,"chapter":"6","unitNumber":"6-2","unitName":"ぼうグラフの読み方","page":"74,75"},{"unitId":"ELEM-MATH-3-018","displayOrder":18,"chapter":"6","unitNumber":"6-3","unitName":"ぼうグラフのかき方","page":"76-81"},{"unitId":"ELEM-MATH-3-019","displayOrder":19,"chapter":"6","unitNumber":"6-4","unitName":"くふうした表","page":"84,85"},{"unitId":"ELEM-MATH-3-020","displayOrder":20,"chapter":"7","unitNumber":"7-1","unitName":"たし算の暗算","page":"88"},{"unitId":"ELEM-MATH-3-021","displayOrder":21,"chapter":"7","unitNumber":"7-2","unitName":"ひき算の暗算","page":"89"},{"unitId":"ELEM-MATH-3-022","displayOrder":22,"chapter":"5","unitNumber":"5-1","unitName":"長い長さのたんい","page":"97,98"},{"unitId":"ELEM-MATH-3-023","displayOrder":23,"chapter":"5","unitNumber":"5-2","unitName":"道のりときょり","page":"99,100"},{"unitId":"ELEM-MATH-3-024","displayOrder":24,"chapter":"8","unitNumber":"8-1","unitName":"あまりのあるわり算","page":"103-107"},{"unitId":"ELEM-MATH-3-025","displayOrder":25,"chapter":"8","unitNumber":"8-2","unitName":"答えのたしかめ","page":"108"},{"unitId":"ELEM-MATH-3-026","displayOrder":26,"chapter":"8","unitNumber":"8-3","unitName":"あまりのあるわり算のりよう①","page":"103-107"},{"unitId":"ELEM-MATH-3-027","displayOrder":27,"chapter":"8","unitNumber":"8-4","unitName":"あまりのあるわり算のりよう②","page":"110,111"},{"unitId":"ELEM-MATH-3-028","displayOrder":28,"chapter":"14","unitNumber":"14-1","unitName":"重さの表し方①","page":"115-119"},{"unitId":"ELEM-MATH-3-029","displayOrder":29,"chapter":"14","unitNumber":"14-2","unitName":"重さの表し方②","page":"121,124"},{"unitId":"ELEM-MATH-3-030","displayOrder":30,"chapter":"14","unitNumber":"14-3","unitName":"重さの計算","page":"122"},{"unitId":"ELEM-MATH-3-031","displayOrder":31,"chapter":"12","unitNumber":"12-1","unitName":"円と球のせいしつ","page":"【下】4,5,10,11"},{"unitId":"ELEM-MATH-3-032","displayOrder":32,"chapter":"12","unitNumber":"12-2","unitName":"円のかき方","page":"4-8"},{"unitId":"ELEM-MATH-3-033","displayOrder":33,"chapter":"12","unitNumber":"12-3","unitName":"コンパスのりよう","page":"9"},{"unitId":"ELEM-MATH-3-034","displayOrder":34,"chapter":"3","unitNumber":"3-3","unitName":"何倍かをもとめる","page":"14,15"},{"unitId":"ELEM-MATH-3-035","displayOrder":35,"chapter":"10","unitNumber":"10-1","unitName":"何十・何百のかけ算①","page":"23"},{"unitId":"ELEM-MATH-3-036","displayOrder":36,"chapter":"10","unitNumber":"10-2","unitName":"２けた×１けたの筆算","page":"24-28"},{"unitId":"ELEM-MATH-3-037","displayOrder":37,"chapter":"10","unitNumber":"10-3","unitName":"３けた×１けたの筆算","page":"30,31"},{"unitId":"ELEM-MATH-3-038","displayOrder":38,"chapter":"10","unitNumber":"10-4","unitName":"かけ算のきまり","page":"20,21"},{"unitId":"ELEM-MATH-3-039","displayOrder":39,"chapter":"10","unitNumber":"10-5","unitName":"かけ算のりよう①","page":"21,24,31"},{"unitId":"ELEM-MATH-3-040","displayOrder":40,"chapter":"15","unitNumber":"15-1","unitName":"分数の表し方","page":"39-42"},{"unitId":"ELEM-MATH-3-041","displayOrder":41,"chapter":"15","unitNumber":"15-2","unitName":"分数と数直線","page":"43,44"},{"unitId":"ELEM-MATH-3-042","displayOrder":42,"chapter":"15","unitNumber":"15-3","unitName":"分数の大小","page":"45"},{"unitId":"ELEM-MATH-3-043","displayOrder":43,"chapter":"15","unitNumber":"15-4","unitName":"分数のたし算とひき算","page":"46,47"},{"unitId":"ELEM-MATH-3-044","displayOrder":44,"chapter":"18","unitNumber":"18-1","unitName":"二等辺三角形と正三角形","page":"57-59"},{"unitId":"ELEM-MATH-3-045","displayOrder":45,"chapter":"18","unitNumber":"18-2","unitName":"三角形と角","page":"62,63"},{"unitId":"ELEM-MATH-3-046","displayOrder":46,"chapter":"13","unitNumber":"13-1","unitName":"小数の表し方","page":"69-71"},{"unitId":"ELEM-MATH-3-047","displayOrder":47,"chapter":"13","unitNumber":"13-2","unitName":"小数のしくみ","page":"72-74"},{"unitId":"ELEM-MATH-3-048","displayOrder":48,"chapter":"13","unitNumber":"13-3","unitName":"小数のたし算","page":"75,77,78"},{"unitId":"ELEM-MATH-3-049","displayOrder":49,"chapter":"13","unitNumber":"13-4","unitName":"小数のひき算","page":"76-78"},{"unitId":"ELEM-MATH-3-050","displayOrder":50,"chapter":"17","unitNumber":"17-1","unitName":"何十・何百のかけ算②","page":"85"},{"unitId":"ELEM-MATH-3-051","displayOrder":51,"chapter":"17","unitNumber":"17-2","unitName":"２けた×２けたの筆算","page":"86,87"},{"unitId":"ELEM-MATH-3-052","displayOrder":52,"chapter":"17","unitNumber":"17-3","unitName":"３けた×２けたの筆算","page":"89"},{"unitId":"ELEM-MATH-3-053","displayOrder":53,"chapter":"17","unitNumber":"17-4","unitName":"かけ算のりよう②","page":"86,87"},{"unitId":"ELEM-MATH-3-054","displayOrder":54,"chapter":"16","unitNumber":"16-1","unitName":"□を使った式①","page":"96,97"},{"unitId":"ELEM-MATH-3-055","displayOrder":55,"chapter":"16","unitNumber":"16-2","unitName":"□を使った式②","page":"93-97"}],"小4":[{"unitId":"ELEM-MATH-4-001","displayOrder":1,"chapter":"1","unitNumber":"1-1","unitName":"億と兆","page":"【上】13-17"},{"unitId":"ELEM-MATH-4-002","displayOrder":2,"chapter":"1","unitNumber":"1-2","unitName":"大きな数のかけ算①","page":"20"},{"unitId":"ELEM-MATH-4-003","displayOrder":3,"chapter":"1","unitNumber":"1-3","unitName":"大きな数のかけ算②","page":"20"},{"unitId":"ELEM-MATH-4-004","displayOrder":4,"chapter":"2","unitNumber":"2-1","unitName":"折れ線グラフの読み方","page":"24-26"},{"unitId":"ELEM-MATH-4-005","displayOrder":5,"chapter":"2","unitNumber":"2-2","unitName":"折れ線グラフのかき方","page":"28-31"},{"unitId":"ELEM-MATH-4-006","displayOrder":6,"chapter":"4","unitNumber":"4-1","unitName":"何十・何百のわり算","page":"要指導"},{"unitId":"ELEM-MATH-4-007","displayOrder":7,"chapter":"4","unitNumber":"4-2","unitName":"２けた÷１けたの筆算","page":"37-39"},{"unitId":"ELEM-MATH-4-008","displayOrder":8,"chapter":"4","unitNumber":"4-3","unitName":"３けた÷１けたの筆算","page":"42"},{"unitId":"ELEM-MATH-4-009","displayOrder":9,"chapter":"4","unitNumber":"4-4","unitName":"あまりのあるわり算","page":"40,41,43"},{"unitId":"ELEM-MATH-4-010","displayOrder":10,"chapter":"4","unitNumber":"4-5","unitName":"わり算の利用①","page":"37-43"},{"unitId":"ELEM-MATH-4-011","displayOrder":11,"chapter":"4","unitNumber":"4-6","unitName":"わり算の利用②","page":"要指導"},{"unitId":"ELEM-MATH-4-012","displayOrder":12,"chapter":"5","unitNumber":"5-1","unitName":"角の大きさ","page":"50,51,52"},{"unitId":"ELEM-MATH-4-013","displayOrder":13,"chapter":"5","unitNumber":"5-2","unitName":"分度器を使って角度をはかる","page":"52-55,58,59"},{"unitId":"ELEM-MATH-4-014","displayOrder":14,"chapter":"5","unitNumber":"5-3","unitName":"分度器を使って角をかく","page":"60"},{"unitId":"ELEM-MATH-4-015","displayOrder":15,"chapter":"5","unitNumber":"5-4","unitName":"三角じょうぎの角","page":"56,57"},{"unitId":"ELEM-MATH-4-016","displayOrder":16,"chapter":"10","unitNumber":"10-1","unitName":"垂直","page":"64,65,68,69"},{"unitId":"ELEM-MATH-4-017","displayOrder":17,"chapter":"10","unitNumber":"10-2","unitName":"平行","page":"66-68"},{"unitId":"ELEM-MATH-4-018","displayOrder":18,"chapter":"10","unitNumber":"10-3","unitName":"台形","page":"72,73"},{"unitId":"ELEM-MATH-4-019","displayOrder":19,"chapter":"10","unitNumber":"10-4","unitName":"平行四辺形・ひし形","page":"72-76"},{"unitId":"ELEM-MATH-4-020","displayOrder":20,"chapter":"10","unitNumber":"10-5","unitName":"四角形の対角線","page":"77,78"},{"unitId":"ELEM-MATH-4-021","displayOrder":21,"chapter":"6","unitNumber":"6-1","unitName":"小数の表し方","page":"85,86"},{"unitId":"ELEM-MATH-4-022","displayOrder":22,"chapter":"6","unitNumber":"6-2","unitName":"小数のしくみ①","page":"86,88,89"},{"unitId":"ELEM-MATH-4-023","displayOrder":23,"chapter":"6","unitNumber":"6-3","unitName":"小数のしくみ②","page":"90,91"},{"unitId":"ELEM-MATH-4-024","displayOrder":24,"chapter":"6","unitNumber":"6-4","unitName":"小数のたし算・ひき算","page":"92,93"},{"unitId":"ELEM-MATH-4-025","displayOrder":25,"chapter":"7","unitNumber":"7-1","unitName":"何十・何百でわるわり算","page":"103-105"},{"unitId":"ELEM-MATH-4-026","displayOrder":26,"chapter":"7","unitNumber":"7-2","unitName":"２けたの数でわる筆算①","page":"106,107,109"},{"unitId":"ELEM-MATH-4-027","displayOrder":27,"chapter":"7","unitNumber":"7-3","unitName":"２けたの数でわる筆算②","page":"108-110"},{"unitId":"ELEM-MATH-4-028","displayOrder":28,"chapter":"7","unitNumber":"7-4","unitName":"大きな数のわり算","page":"111"},{"unitId":"ELEM-MATH-4-029","displayOrder":29,"chapter":"7","unitNumber":"7-5","unitName":"わり算の利用③","page":"103-110"},{"unitId":"ELEM-MATH-4-030","displayOrder":30,"chapter":"9","unitNumber":"9-1","unitName":"計算の順じょ①","page":"117-119"},{"unitId":"ELEM-MATH-4-031","displayOrder":31,"chapter":"9","unitNumber":"9-2","unitName":"計算の順じょ②","page":"117-119"},{"unitId":"ELEM-MATH-4-032","displayOrder":32,"chapter":"9","unitNumber":"9-3","unitName":"計算のくふう","page":"120-123"},{"unitId":"ELEM-MATH-4-033","displayOrder":33,"chapter":"9","unitNumber":"9-4","unitName":"計算の間の関係","page":"125"},{"unitId":"ELEM-MATH-4-034","displayOrder":34,"chapter":"13","unitNumber":"13-1","unitName":"正方形と長方形の面積","page":"【下】3-7"},{"unitId":"ELEM-MATH-4-035","displayOrder":35,"chapter":"13","unitNumber":"13-2","unitName":"大きな面積","page":"10-15"},{"unitId":"ELEM-MATH-4-036","displayOrder":36,"chapter":"13","unitNumber":"13-3","unitName":"面積の求め方のくふう","page":"8,9"},{"unitId":"ELEM-MATH-4-037","displayOrder":37,"chapter":"8","unitNumber":"8-1","unitName":"がい数の表し方","page":"19-21"},{"unitId":"ELEM-MATH-4-038","displayOrder":38,"chapter":"8","unitNumber":"8-2","unitName":"がい数の表すはんい","page":"22"},{"unitId":"ELEM-MATH-4-039","displayOrder":39,"chapter":"8","unitNumber":"8-3","unitName":"がい数を使った計算","page":"24-28"},{"unitId":"ELEM-MATH-4-040","displayOrder":40,"chapter":"14","unitNumber":"14-1","unitName":"小数のかけ算","page":"33-36"},{"unitId":"ELEM-MATH-4-041","displayOrder":41,"chapter":"14","unitNumber":"14-2","unitName":"小数のわり算","page":"39-45"},{"unitId":"ELEM-MATH-4-042","displayOrder":42,"chapter":"14","unitNumber":"14-3","unitName":"小数のかけ算・わり算の利用","page":"34,40,42,44,45"},{"unitId":"ELEM-MATH-4-043","displayOrder":43,"chapter":"14","unitNumber":"14-4","unitName":"がい数で答える小数のわり算","page":"46"},{"unitId":"ELEM-MATH-4-044","displayOrder":44,"chapter":"14","unitNumber":"14-5","unitName":"小数の倍","page":"48,49"},{"unitId":"ELEM-MATH-4-045","displayOrder":45,"chapter":"3","unitNumber":"3-1","unitName":"整理のしかた①","page":"61-65"},{"unitId":"ELEM-MATH-4-046","displayOrder":46,"chapter":"3","unitNumber":"3-2","unitName":"整理のしかた②","page":"要指導"},{"unitId":"ELEM-MATH-4-047","displayOrder":47,"chapter":"11","unitNumber":"11-1","unitName":"分数の表し方①","page":"71,72"},{"unitId":"ELEM-MATH-4-048","displayOrder":48,"chapter":"11","unitNumber":"11-2","unitName":"分数の表し方②","page":"73,74"},{"unitId":"ELEM-MATH-4-049","displayOrder":49,"chapter":"11","unitNumber":"11-3","unitName":"分数のたし算・ひき算①","page":"75"},{"unitId":"ELEM-MATH-4-050","displayOrder":50,"chapter":"11","unitNumber":"11-4","unitName":"分数のたし算・ひき算②","page":"76"},{"unitId":"ELEM-MATH-4-051","displayOrder":51,"chapter":"12","unitNumber":"12-1","unitName":"変わり方①","page":"83-85"},{"unitId":"ELEM-MATH-4-052","displayOrder":52,"chapter":"12","unitNumber":"12-2","unitName":"変わり方②","page":"83-85"},{"unitId":"ELEM-MATH-4-053","displayOrder":53,"chapter":"15","unitNumber":"15-1","unitName":"直方体と立方体","page":"90"},{"unitId":"ELEM-MATH-4-054","displayOrder":54,"chapter":"15","unitNumber":"15-2","unitName":"展開図と見取図","page":"91-93,97,98"},{"unitId":"ELEM-MATH-4-055","displayOrder":55,"chapter":"15","unitNumber":"15-3","unitName":"面と辺の関係","page":"94-96"},{"unitId":"ELEM-MATH-4-056","displayOrder":56,"chapter":"15","unitNumber":"15-4","unitName":"位置の表し方","page":"100-102"}],"小5":[{"unitId":"ELEM-MATH-5-001","displayOrder":1,"chapter":"1","unitNumber":"1-1","unitName":"整数と小数のしくみ","page":"11-13"},{"unitId":"ELEM-MATH-5-002","displayOrder":2,"chapter":"2","unitNumber":"2-1","unitName":"体積","page":"17-19,22,23"},{"unitId":"ELEM-MATH-5-003","displayOrder":3,"chapter":"2","unitNumber":"2-2","unitName":"いろいろな体積の単位","page":"20,21,24,26"},{"unitId":"ELEM-MATH-5-004","displayOrder":4,"chapter":"3","unitNumber":"3-1","unitName":"比例","page":"31-33"},{"unitId":"ELEM-MATH-5-005","displayOrder":5,"chapter":"4","unitNumber":"4-1","unitName":"小数のかけ算","page":"35-42"},{"unitId":"ELEM-MATH-5-006","displayOrder":6,"chapter":"4","unitNumber":"4-2","unitName":"小数のかけ算の利用","page":"35,38,40,44,45"},{"unitId":"ELEM-MATH-5-007","displayOrder":7,"chapter":"5","unitNumber":"5-1","unitName":"小数のわり算","page":"58-60"},{"unitId":"ELEM-MATH-5-008","displayOrder":8,"chapter":"5","unitNumber":"5-2","unitName":"がい数で答える小数のわり算","page":"61"},{"unitId":"ELEM-MATH-5-009","displayOrder":9,"chapter":"5","unitNumber":"5-3","unitName":"あまりを出す小数のわり算","page":"62"},{"unitId":"ELEM-MATH-5-010","displayOrder":10,"chapter":"5","unitNumber":"5-4","unitName":"小数のわり算の利用①","page":"53,58,61,62"},{"unitId":"ELEM-MATH-5-011","displayOrder":11,"chapter":"5","unitNumber":"5-5","unitName":"小数のわり算の利用②","page":"64,65"},{"unitId":"ELEM-MATH-5-012","displayOrder":12,"chapter":"6","unitNumber":"6-1","unitName":"合同な図形","page":"77-79"},{"unitId":"ELEM-MATH-5-013","displayOrder":13,"chapter":"6","unitNumber":"6-2","unitName":"合同な三角形のかき方","page":"81-83"},{"unitId":"ELEM-MATH-5-014","displayOrder":14,"chapter":"6","unitNumber":"6-3","unitName":"合同な四角形のかき方","page":"84"},{"unitId":"ELEM-MATH-5-015","displayOrder":15,"chapter":"7","unitNumber":"7-1","unitName":"三角形の角","page":"85-87"},{"unitId":"ELEM-MATH-5-016","displayOrder":16,"chapter":"7","unitNumber":"7-2","unitName":"四角形の角","page":"88,89"},{"unitId":"ELEM-MATH-5-017","displayOrder":17,"chapter":"7","unitNumber":"7-3","unitName":"多角形の角","page":"90,91"},{"unitId":"ELEM-MATH-5-018","displayOrder":18,"chapter":"8","unitNumber":"8-1","unitName":"偶数と奇数","page":"103"},{"unitId":"ELEM-MATH-5-019","displayOrder":19,"chapter":"8","unitNumber":"8-2","unitName":"倍数と公倍数","page":"104-106"},{"unitId":"ELEM-MATH-5-020","displayOrder":20,"chapter":"8","unitNumber":"8-3","unitName":"公倍数の利用","page":"107"},{"unitId":"ELEM-MATH-5-021","displayOrder":21,"chapter":"8","unitNumber":"8-4","unitName":"約数と公約数","page":"108-110"},{"unitId":"ELEM-MATH-5-022","displayOrder":22,"chapter":"8","unitNumber":"8-5","unitName":"公約数の利用","page":"111"},{"unitId":"ELEM-MATH-5-023","displayOrder":23,"chapter":"10","unitNumber":"10-1","unitName":"通分","page":"115,116,118,119"},{"unitId":"ELEM-MATH-5-024","displayOrder":24,"chapter":"10","unitNumber":"10-2","unitName":"約分","page":"117"},{"unitId":"ELEM-MATH-5-025","displayOrder":25,"chapter":"10","unitNumber":"10-3","unitName":"分数のたし算とひき算①","page":"120,121"},{"unitId":"ELEM-MATH-5-026","displayOrder":26,"chapter":"10","unitNumber":"10-4","unitName":"分数のたし算とひき算②","page":"122"},{"unitId":"ELEM-MATH-5-027","displayOrder":27,"chapter":"9","unitNumber":"9-1","unitName":"わり算と分数","page":"124,125,128,129"},{"unitId":"ELEM-MATH-5-028","displayOrder":28,"chapter":"9","unitNumber":"9-2","unitName":"分数と小数，整数","page":"126,127"},{"unitId":"ELEM-MATH-5-029","displayOrder":29,"chapter":"13","unitNumber":"13-1","unitName":"平行四辺形の面積","page":"140-143,144,145"},{"unitId":"ELEM-MATH-5-030","displayOrder":30,"chapter":"13","unitNumber":"13-2","unitName":"三角形の面積","page":"135-139,144,145"},{"unitId":"ELEM-MATH-5-031","displayOrder":31,"chapter":"13","unitNumber":"13-3","unitName":"台形とひし形の面積","page":"147-150"},{"unitId":"ELEM-MATH-5-032","displayOrder":32,"chapter":"13","unitNumber":"13-4","unitName":"三角形の高さと面積の関係","page":"154"},{"unitId":"ELEM-MATH-5-033","displayOrder":33,"chapter":"11","unitNumber":"11-1","unitName":"平均","page":"158-161"},{"unitId":"ELEM-MATH-5-034","displayOrder":34,"chapter":"11","unitNumber":"11-2","unitName":"単位量あたりの大きさ","page":"167-170"},{"unitId":"ELEM-MATH-5-035","displayOrder":35,"chapter":"11","unitNumber":"11-3","unitName":"単位量あたりの利用","page":"要指導"},{"unitId":"ELEM-MATH-5-036","displayOrder":36,"chapter":"14","unitNumber":"14-1","unitName":"割合と百分率","page":"175,176,180"},{"unitId":"ELEM-MATH-5-037","displayOrder":37,"chapter":"14","unitNumber":"14-2","unitName":"くらべられる量を求める①","page":"177"},{"unitId":"ELEM-MATH-5-038","displayOrder":38,"chapter":"14","unitNumber":"14-3","unitName":"くらべられる量を求める②","page":"177"},{"unitId":"ELEM-MATH-5-039","displayOrder":39,"chapter":"14","unitNumber":"14-4","unitName":"もとにする量を求める","page":"178,181"},{"unitId":"ELEM-MATH-5-040","displayOrder":40,"chapter":"14","unitNumber":"14-5","unitName":"円グラフと帯グラフ①","page":"207"},{"unitId":"ELEM-MATH-5-041","displayOrder":41,"chapter":"14","unitNumber":"14-6","unitName":"円グラフと帯グラフ②","page":"208,209"},{"unitId":"ELEM-MATH-5-042","displayOrder":42,"chapter":"15","unitNumber":"15-1","unitName":"正多角形","page":"195"},{"unitId":"ELEM-MATH-5-043","displayOrder":43,"chapter":"15","unitNumber":"15-2","unitName":"円と正六角形","page":"196,197"},{"unitId":"ELEM-MATH-5-044","displayOrder":44,"chapter":"15","unitNumber":"15-3","unitName":"円周の長さ①","page":"199-202"},{"unitId":"ELEM-MATH-5-045","displayOrder":45,"chapter":"15","unitNumber":"15-4","unitName":"円周の長さ②","page":"要指導"},{"unitId":"ELEM-MATH-5-046","displayOrder":46,"chapter":"16","unitNumber":"16-1","unitName":"角柱","page":"219-221"},{"unitId":"ELEM-MATH-5-047","displayOrder":47,"chapter":"16","unitNumber":"16-2","unitName":"円柱・見取図","page":"219-222"},{"unitId":"ELEM-MATH-5-048","displayOrder":48,"chapter":"16","unitNumber":"16-3","unitName":"展開図","page":"223,224"},{"unitId":"ELEM-MATH-5-049","displayOrder":49,"chapter":"12","unitNumber":"12-1","unitName":"速さを求める","page":"227,228"},{"unitId":"ELEM-MATH-5-050","displayOrder":50,"chapter":"12","unitNumber":"12-2","unitName":"道のりを求める","page":"229"},{"unitId":"ELEM-MATH-5-051","displayOrder":51,"chapter":"12","unitNumber":"12-3","unitName":"時間を求める","page":"230"},{"unitId":"ELEM-MATH-5-052","displayOrder":52,"chapter":"12","unitNumber":"12-4","unitName":"いろいろな速さの単位","page":"231"}],"小6":[{"unitId":"ELEM-MATH-6-001","displayOrder":1,"chapter":"1","unitNumber":"1-1","unitName":"線対称な図形①","page":"14,22,23"},{"unitId":"ELEM-MATH-6-002","displayOrder":2,"chapter":"1","unitNumber":"1-2","unitName":"線対称な図形②","page":"14-16"},{"unitId":"ELEM-MATH-6-003","displayOrder":3,"chapter":"1","unitNumber":"1-3","unitName":"点対称な図形①","page":"18,22,23"},{"unitId":"ELEM-MATH-6-004","displayOrder":4,"chapter":"1","unitNumber":"1-4","unitName":"点対称な図形②","page":"18-20"},{"unitId":"ELEM-MATH-6-005","displayOrder":5,"chapter":"1","unitNumber":"1-5","unitName":"対称な図形のかき方","page":"17,21"},{"unitId":"ELEM-MATH-6-006","displayOrder":6,"chapter":"2","unitNumber":"2-1","unitName":"文字を使った式①","page":"27-29"},{"unitId":"ELEM-MATH-6-007","displayOrder":7,"chapter":"2","unitNumber":"2-2","unitName":"文字を使った式②","page":"27-30"},{"unitId":"ELEM-MATH-6-008","displayOrder":8,"chapter":"3","unitNumber":"3-1","unitName":"分数と整数のかけ算，わり算","page":"37-40"},{"unitId":"ELEM-MATH-6-009","displayOrder":9,"chapter":"4","unitNumber":"4-1","unitName":"分数のかけ算①","page":"43-45"},{"unitId":"ELEM-MATH-6-010","displayOrder":10,"chapter":"4","unitNumber":"4-2","unitName":"分数のかけ算②","page":"46"},{"unitId":"ELEM-MATH-6-011","displayOrder":11,"chapter":"4","unitNumber":"4-3","unitName":"分数のかけ算③","page":"43,45,50"},{"unitId":"ELEM-MATH-6-012","displayOrder":12,"chapter":"4","unitNumber":"4-4","unitName":"逆数","page":"52"},{"unitId":"ELEM-MATH-6-013","displayOrder":13,"chapter":"5","unitNumber":"5-1","unitName":"分数のわり算①","page":"57-59"},{"unitId":"ELEM-MATH-6-014","displayOrder":14,"chapter":"5","unitNumber":"5-2","unitName":"分数のわり算②","page":"60,61"},{"unitId":"ELEM-MATH-6-015","displayOrder":15,"chapter":"5","unitNumber":"5-3","unitName":"分数のわり算③","page":"57,59"},{"unitId":"ELEM-MATH-6-016","displayOrder":16,"chapter":"5","unitNumber":"5-4","unitName":"分数の倍","page":"67"},{"unitId":"ELEM-MATH-6-017","displayOrder":17,"chapter":"13","unitNumber":"13-1","unitName":"並べ方①","page":"73"},{"unitId":"ELEM-MATH-6-018","displayOrder":18,"chapter":"13","unitNumber":"13-2","unitName":"並べ方②","page":"73,74"},{"unitId":"ELEM-MATH-6-019","displayOrder":19,"chapter":"13","unitNumber":"13-3","unitName":"組み合わせ方①","page":"71,72"},{"unitId":"ELEM-MATH-6-020","displayOrder":20,"chapter":"13","unitNumber":"13-4","unitName":"組み合わせ方②","page":"72"},{"unitId":"ELEM-MATH-6-021","displayOrder":21,"chapter":"9","unitNumber":"9-1","unitName":"円の面積①","page":"89-93"},{"unitId":"ELEM-MATH-6-022","displayOrder":22,"chapter":"9","unitNumber":"9-2","unitName":"円の面積②","page":"94,95"},{"unitId":"ELEM-MATH-6-023","displayOrder":23,"chapter":"10","unitNumber":"10-1","unitName":"立体の体積①","page":"99-102"},{"unitId":"ELEM-MATH-6-024","displayOrder":24,"chapter":"10","unitNumber":"10-2","unitName":"立体の体積②","page":"103"},{"unitId":"ELEM-MATH-6-025","displayOrder":25,"chapter":"10","unitNumber":"10-3","unitName":"立体の体積③","page":"99-102"},{"unitId":"ELEM-MATH-6-026","displayOrder":26,"chapter":"8","unitNumber":"8-1","unitName":"平均値","page":"107"},{"unitId":"ELEM-MATH-6-027","displayOrder":27,"chapter":"8","unitNumber":"8-2","unitName":"最頻値","page":"109,111"},{"unitId":"ELEM-MATH-6-028","displayOrder":28,"chapter":"8","unitNumber":"8-3","unitName":"中央値","page":"110"},{"unitId":"ELEM-MATH-6-029","displayOrder":29,"chapter":"8","unitNumber":"8-4","unitName":"度数分布表①","page":"112,113"},{"unitId":"ELEM-MATH-6-030","displayOrder":30,"chapter":"8","unitNumber":"8-5","unitName":"度数分布表②","page":"112,113"},{"unitId":"ELEM-MATH-6-031","displayOrder":31,"chapter":"8","unitNumber":"8-6","unitName":"ヒストグラム","page":"114,115"},{"unitId":"ELEM-MATH-6-032","displayOrder":32,"chapter":"6","unitNumber":"6-1","unitName":"比と比の値，等しい比","page":"129-131"},{"unitId":"ELEM-MATH-6-033","displayOrder":33,"chapter":"6","unitNumber":"6-2","unitName":"簡単な整数の比","page":"133,134"},{"unitId":"ELEM-MATH-6-034","displayOrder":34,"chapter":"6","unitNumber":"6-3","unitName":"比の利用①","page":"136"},{"unitId":"ELEM-MATH-6-035","displayOrder":35,"chapter":"6","unitNumber":"6-4","unitName":"比の利用②","page":"137"},{"unitId":"ELEM-MATH-6-036","displayOrder":36,"chapter":"7","unitNumber":"7-1","unitName":"拡大図と縮図","page":"141-143"},{"unitId":"ELEM-MATH-6-037","displayOrder":37,"chapter":"7","unitNumber":"7-2","unitName":"拡大図と縮図のかき方①","page":"144"},{"unitId":"ELEM-MATH-6-038","displayOrder":38,"chapter":"7","unitNumber":"7-3","unitName":"拡大図と縮図のかき方②","page":"145,146"},{"unitId":"ELEM-MATH-6-039","displayOrder":39,"chapter":"7","unitNumber":"7-4","unitName":"拡大図と縮図のかき方③","page":"147,148"},{"unitId":"ELEM-MATH-6-040","displayOrder":40,"chapter":"7","unitNumber":"7-5","unitName":"縮図の利用","page":"150"},{"unitId":"ELEM-MATH-6-041","displayOrder":41,"chapter":"12","unitNumber":"12-1","unitName":"比例","page":"155-158"},{"unitId":"ELEM-MATH-6-042","displayOrder":42,"chapter":"12","unitNumber":"12-2","unitName":"比例の式","page":"159"},{"unitId":"ELEM-MATH-6-043","displayOrder":43,"chapter":"12","unitNumber":"12-3","unitName":"比例のグラフ","page":"160-162"},{"unitId":"ELEM-MATH-6-044","displayOrder":44,"chapter":"12","unitNumber":"12-4","unitName":"反比例の式","page":"175-177"},{"unitId":"ELEM-MATH-6-045","displayOrder":45,"chapter":"12","unitNumber":"12-5","unitName":"反比例のグラフ","page":"178.179"},{"unitId":"ELEM-MATH-6-046","displayOrder":46,"chapter":"11","unitNumber":"11-1","unitName":"およその面積","page":"191"},{"unitId":"ELEM-MATH-6-047","displayOrder":47,"chapter":"11","unitNumber":"11-2","unitName":"およその体積","page":"192"}]},"english":{"Ⅰ":[{"unitId":"ELEM-ENG-I-001","displayOrder":1,"chapter":"プレステップ","unitNumber":"①","unitName":"アルファベット","page":""},{"unitId":"ELEM-ENG-I-002","displayOrder":2,"chapter":"プレステップ","unitNumber":"②","unitName":"ローマ字・自分の名前","page":""},{"unitId":"ELEM-ENG-I-003","displayOrder":3,"chapter":"プレステップ","unitNumber":"③","unitName":"あいさつ","page":""},{"unitId":"ELEM-ENG-I-004","displayOrder":4,"chapter":"プレステップ","unitNumber":"④","unitName":"数字（1）","page":""},{"unitId":"ELEM-ENG-I-005","displayOrder":5,"chapter":"プレステップ","unitNumber":"⑤","unitName":"数字（2）","page":""},{"unitId":"ELEM-ENG-I-006","displayOrder":6,"chapter":"第1章","unitNumber":"1","unitName":"英語の語順とbe動詞","page":""},{"unitId":"ELEM-ENG-I-007","displayOrder":7,"chapter":"第1章","unitNumber":"2","unitName":"be動詞の否定文","page":""},{"unitId":"ELEM-ENG-I-008","displayOrder":8,"chapter":"第1章","unitNumber":"3","unitName":"be動詞の疑問文","page":""},{"unitId":"ELEM-ENG-I-009","displayOrder":9,"chapter":"第1章","unitNumber":"まとめ","unitName":"1章のまとめ","page":""},{"unitId":"ELEM-ENG-I-010","displayOrder":10,"chapter":"第2章","unitNumber":"1","unitName":"一般動詞①","page":""},{"unitId":"ELEM-ENG-I-011","displayOrder":11,"chapter":"第2章","unitNumber":"2","unitName":"一般動詞②－3人称単数","page":""},{"unitId":"ELEM-ENG-I-012","displayOrder":12,"chapter":"第2章","unitNumber":"3","unitName":"一般動詞の否定文","page":""},{"unitId":"ELEM-ENG-I-013","displayOrder":13,"chapter":"第2章","unitNumber":"4","unitName":"一般動詞の疑問文","page":""},{"unitId":"ELEM-ENG-I-014","displayOrder":14,"chapter":"第2章","unitNumber":"5","unitName":"人称代名詞","page":""},{"unitId":"ELEM-ENG-I-015","displayOrder":15,"chapter":"第2章","unitNumber":"6","unitName":"季節・天気・時間を表す文","page":""},{"unitId":"ELEM-ENG-I-016","displayOrder":16,"chapter":"第2章","unitNumber":"まとめ","unitName":"2章のまとめ","page":""},{"unitId":"ELEM-ENG-I-017","displayOrder":17,"chapter":"第3章","unitNumber":"1","unitName":"助動詞can","page":""},{"unitId":"ELEM-ENG-I-018","displayOrder":18,"chapter":"第3章","unitNumber":"2","unitName":"助動詞canの疑問文","page":""},{"unitId":"ELEM-ENG-I-019","displayOrder":19,"chapter":"第3章","unitNumber":"3","unitName":"現在進行形","page":""},{"unitId":"ELEM-ENG-I-020","displayOrder":20,"chapter":"第3章","unitNumber":"4","unitName":"現在進行形の否定文と疑問文","page":""},{"unitId":"ELEM-ENG-I-021","displayOrder":21,"chapter":"第3章","unitNumber":"5","unitName":"命令文","page":""},{"unitId":"ELEM-ENG-I-022","displayOrder":22,"chapter":"第3章","unitNumber":"まとめ","unitName":"3章のまとめ","page":""},{"unitId":"ELEM-ENG-I-023","displayOrder":23,"chapter":"第4章","unitNumber":"1","unitName":"疑問詞①－what","page":""},{"unitId":"ELEM-ENG-I-024","displayOrder":24,"chapter":"第4章","unitNumber":"2","unitName":"疑問詞②－what time / what sport","page":""},{"unitId":"ELEM-ENG-I-025","displayOrder":25,"chapter":"第4章","unitNumber":"3","unitName":"疑問詞③－who,whose,which","page":""},{"unitId":"ELEM-ENG-I-026","displayOrder":26,"chapter":"第4章","unitNumber":"4","unitName":"疑問詞④－where,when","page":""},{"unitId":"ELEM-ENG-I-027","displayOrder":27,"chapter":"第4章","unitNumber":"5","unitName":"疑問詞⑤－how / how many","page":""},{"unitId":"ELEM-ENG-I-028","displayOrder":28,"chapter":"第4章","unitNumber":"6","unitName":"疑問詞⑥－why","page":""},{"unitId":"ELEM-ENG-I-029","displayOrder":29,"chapter":"第4章","unitNumber":"まとめ","unitName":"4章のまとめ","page":""}],"Ⅱ":[{"unitId":"ELEM-ENG-II-001","displayOrder":1,"chapter":"プレステップ","unitNumber":"①","unitName":"be動詞と一般動詞","page":""},{"unitId":"ELEM-ENG-II-002","displayOrder":2,"chapter":"プレステップ","unitNumber":"②","unitName":"助動詞can","page":""},{"unitId":"ELEM-ENG-II-003","displayOrder":3,"chapter":"プレステップ","unitNumber":"③","unitName":"現在進行形","page":""},{"unitId":"ELEM-ENG-II-004","displayOrder":4,"chapter":"プレステップ","unitNumber":"④","unitName":"命令文","page":""},{"unitId":"ELEM-ENG-II-005","displayOrder":5,"chapter":"プレステップ","unitNumber":"⑤","unitName":"疑問詞","page":""},{"unitId":"ELEM-ENG-II-006","displayOrder":6,"chapter":"第1章","unitNumber":"1","unitName":"be動詞の過去形","page":""},{"unitId":"ELEM-ENG-II-007","displayOrder":7,"chapter":"第1章","unitNumber":"2","unitName":"一般動詞の過去形","page":""},{"unitId":"ELEM-ENG-II-008","displayOrder":8,"chapter":"第1章","unitNumber":"3","unitName":"一般動詞の過去形－不規則変化","page":""},{"unitId":"ELEM-ENG-II-009","displayOrder":9,"chapter":"第1章","unitNumber":"4","unitName":"一般動詞の過去形－否定文と疑問文","page":""},{"unitId":"ELEM-ENG-II-010","displayOrder":10,"chapter":"第1章","unitNumber":"5","unitName":"過去進行形","page":""},{"unitId":"ELEM-ENG-II-011","displayOrder":11,"chapter":"第1章","unitNumber":"6","unitName":"疑問詞と時制","page":""},{"unitId":"ELEM-ENG-II-012","displayOrder":12,"chapter":"第1章","unitNumber":"まとめ","unitName":"1章のまとめ","page":""},{"unitId":"ELEM-ENG-II-013","displayOrder":13,"chapter":"第2章","unitNumber":"1","unitName":"be going to ","page":""},{"unitId":"ELEM-ENG-II-014","displayOrder":14,"chapter":"第2章","unitNumber":"2","unitName":"will","page":""},{"unitId":"ELEM-ENG-II-015","displayOrder":15,"chapter":"第2章","unitNumber":"3","unitName":"会話表現","page":""},{"unitId":"ELEM-ENG-II-016","displayOrder":16,"chapter":"第2章","unitNumber":"まとめ","unitName":"2章のまとめ","page":""},{"unitId":"ELEM-ENG-II-017","displayOrder":17,"chapter":"第3章","unitNumber":"1","unitName":"must","page":""},{"unitId":"ELEM-ENG-II-018","displayOrder":18,"chapter":"第3章","unitNumber":"2","unitName":"have to","page":""},{"unitId":"ELEM-ENG-II-019","displayOrder":19,"chapter":"第3章","unitNumber":"3","unitName":"must,have toの否定文","page":""},{"unitId":"ELEM-ENG-II-020","displayOrder":20,"chapter":"第3章","unitNumber":"まとめ","unitName":"3章のまとめ","page":""},{"unitId":"ELEM-ENG-II-021","displayOrder":21,"chapter":"第4章","unitNumber":"1","unitName":"不定詞－名詞的用法","page":""},{"unitId":"ELEM-ENG-II-022","displayOrder":22,"chapter":"第4章","unitNumber":"2","unitName":"動名詞","page":""},{"unitId":"ELEM-ENG-II-023","displayOrder":23,"chapter":"第4章","unitNumber":"3","unitName":"不定詞－副詞的用法","page":""},{"unitId":"ELEM-ENG-II-024","displayOrder":24,"chapter":"第4章","unitNumber":"4","unitName":"不定詞－形容詞的用法","page":""},{"unitId":"ELEM-ENG-II-025","displayOrder":25,"chapter":"第4章","unitNumber":"まとめ","unitName":"4章のまとめ","page":""},{"unitId":"ELEM-ENG-II-026","displayOrder":26,"chapter":"第5章","unitNumber":"1","unitName":"接続詞－and,but,or,so","page":""},{"unitId":"ELEM-ENG-II-027","displayOrder":27,"chapter":"第5章","unitNumber":"2","unitName":"接続詞－that","page":""},{"unitId":"ELEM-ENG-II-028","displayOrder":28,"chapter":"第5章","unitNumber":"3","unitName":"接続詞－if","page":""},{"unitId":"ELEM-ENG-II-029","displayOrder":29,"chapter":"第5章","unitNumber":"4","unitName":"接続詞－when","page":""},{"unitId":"ELEM-ENG-II-030","displayOrder":30,"chapter":"第5章","unitNumber":"5","unitName":"接続詞－because","page":""},{"unitId":"ELEM-ENG-II-031","displayOrder":31,"chapter":"第5章","unitNumber":"まとめ","unitName":"5章のまとめ","page":""},{"unitId":"ELEM-ENG-II-032","displayOrder":32,"chapter":"第6章","unitNumber":"1","unitName":"比較級","page":""},{"unitId":"ELEM-ENG-II-033","displayOrder":33,"chapter":"第6章","unitNumber":"2","unitName":"最上級","page":""},{"unitId":"ELEM-ENG-II-034","displayOrder":34,"chapter":"第6章","unitNumber":"3","unitName":"more,most","page":""},{"unitId":"ELEM-ENG-II-035","displayOrder":35,"chapter":"第6章","unitNumber":"4","unitName":"同等比較","page":""},{"unitId":"ELEM-ENG-II-036","displayOrder":36,"chapter":"第6章","unitNumber":"5","unitName":"better,best","page":""},{"unitId":"ELEM-ENG-II-037","displayOrder":37,"chapter":"第6章","unitNumber":"まとめ","unitName":"6章のまとめ","page":""},{"unitId":"ELEM-ENG-II-038","displayOrder":38,"chapter":"第7章","unitNumber":"1","unitName":"There is[are] ～の文","page":""},{"unitId":"ELEM-ENG-II-039","displayOrder":39,"chapter":"第7章","unitNumber":"2","unitName":"look ～の文","page":""},{"unitId":"ELEM-ENG-II-040","displayOrder":40,"chapter":"第7章","unitNumber":"3","unitName":"「give 人 物」 の文","page":""},{"unitId":"ELEM-ENG-II-041","displayOrder":41,"chapter":"第7章","unitNumber":"まとめ","unitName":"7章のまとめ","page":""}],"Ⅲ":[{"unitId":"ELEM-ENG-III-001","displayOrder":1,"chapter":"プレステップ","unitNumber":"①","unitName":"be動詞と一般動詞","page":""},{"unitId":"ELEM-ENG-III-002","displayOrder":2,"chapter":"プレステップ","unitNumber":"②","unitName":"be動詞と一般動詞の過去形","page":""},{"unitId":"ELEM-ENG-III-003","displayOrder":3,"chapter":"プレステップ","unitNumber":"③","unitName":"疑問詞","page":""},{"unitId":"ELEM-ENG-III-004","displayOrder":4,"chapter":"プレステップ","unitNumber":"④","unitName":"進行形と未来の文","page":""},{"unitId":"ELEM-ENG-III-005","displayOrder":5,"chapter":"プレステップ","unitNumber":"⑤","unitName":"助動詞","page":""},{"unitId":"ELEM-ENG-III-006","displayOrder":6,"chapter":"プレステップ","unitNumber":"⑥","unitName":"不定詞と動名詞","page":""},{"unitId":"ELEM-ENG-III-007","displayOrder":7,"chapter":"プレステップ","unitNumber":"⑦","unitName":"接続詞","page":""},{"unitId":"ELEM-ENG-III-008","displayOrder":8,"chapter":"プレステップ","unitNumber":"⑧","unitName":"比較","page":""},{"unitId":"ELEM-ENG-III-009","displayOrder":9,"chapter":"プレステップ","unitNumber":"⑨","unitName":"文型","page":""},{"unitId":"ELEM-ENG-III-010","displayOrder":10,"chapter":"第1章","unitNumber":"1","unitName":"受動態[受け身]","page":""},{"unitId":"ELEM-ENG-III-011","displayOrder":11,"chapter":"第1章","unitNumber":"2","unitName":"受動態[受け身]－by人","page":""},{"unitId":"ELEM-ENG-III-012","displayOrder":12,"chapter":"第1章","unitNumber":"3","unitName":"受動態[受け身]－否定文と疑問文","page":""},{"unitId":"ELEM-ENG-III-013","displayOrder":13,"chapter":"第1章","unitNumber":"まとめ","unitName":"1章のまとめ","page":""},{"unitId":"ELEM-ENG-III-014","displayOrder":14,"chapter":"第1章","unitNumber":"Writing\n1","unitName":"メールに返事を書く英作文①","page":""},{"unitId":"ELEM-ENG-III-015","displayOrder":15,"chapter":"第2章","unitNumber":"1","unitName":"現在完了形（完了用法）","page":""},{"unitId":"ELEM-ENG-III-016","displayOrder":16,"chapter":"第2章","unitNumber":"2","unitName":"現在完了形（完了用法）－否定文と疑問文","page":""},{"unitId":"ELEM-ENG-III-017","displayOrder":17,"chapter":"第2章","unitNumber":"3","unitName":"現在完了形（経験用法）","page":""},{"unitId":"ELEM-ENG-III-018","displayOrder":18,"chapter":"第2章","unitNumber":"4","unitName":"現在完了形（経験用法）－否定文と疑問文","page":""},{"unitId":"ELEM-ENG-III-019","displayOrder":19,"chapter":"第2章","unitNumber":"5","unitName":"現在完了形（継続用法）","page":""},{"unitId":"ELEM-ENG-III-020","displayOrder":20,"chapter":"第2章","unitNumber":"6","unitName":"現在完了形（継続用法）－否定文と疑問文","page":""},{"unitId":"ELEM-ENG-III-021","displayOrder":21,"chapter":"第2章","unitNumber":"まとめ","unitName":"2章のまとめ","page":""},{"unitId":"ELEM-ENG-III-022","displayOrder":22,"chapter":"第2章","unitNumber":"Writing\n2","unitName":"メールに返事を書く英作文②","page":""},{"unitId":"ELEM-ENG-III-023","displayOrder":23,"chapter":"第3章","unitNumber":"1","unitName":"主格の関係代名詞① －先行詞が人のとき","page":""},{"unitId":"ELEM-ENG-III-024","displayOrder":24,"chapter":"第3章","unitNumber":"2","unitName":"主格の関係代名詞② －先行詞が物・動物のとき","page":""},{"unitId":"ELEM-ENG-III-025","displayOrder":25,"chapter":"第3章","unitNumber":"3","unitName":"主格の関係代名詞③ －並べかえ","page":""},{"unitId":"ELEM-ENG-III-026","displayOrder":26,"chapter":"第3章","unitNumber":"4","unitName":"目的格の関係代名詞① －先行詞が人のとき","page":""},{"unitId":"ELEM-ENG-III-027","displayOrder":27,"chapter":"第3章","unitNumber":"5","unitName":"目的格の関係代名詞② －先行詞が物・動物のとき","page":""},{"unitId":"ELEM-ENG-III-028","displayOrder":28,"chapter":"第3章","unitNumber":"6","unitName":"目的格の関係代名詞③ －並べかえ","page":""},{"unitId":"ELEM-ENG-III-029","displayOrder":29,"chapter":"第3章","unitNumber":"まとめ","unitName":"3章のまとめ","page":""},{"unitId":"ELEM-ENG-III-030","displayOrder":30,"chapter":"第3章","unitNumber":"Writing\n3","unitName":"質問に答える英作文①","page":""},{"unitId":"ELEM-ENG-III-031","displayOrder":31,"chapter":"第4章","unitNumber":"1","unitName":"現在分詞の文","page":""},{"unitId":"ELEM-ENG-III-032","displayOrder":32,"chapter":"第4章","unitNumber":"2","unitName":"過去分詞の文","page":""},{"unitId":"ELEM-ENG-III-033","displayOrder":33,"chapter":"第4章","unitNumber":"3","unitName":"分詞の文と関係代名詞","page":""},{"unitId":"ELEM-ENG-III-034","displayOrder":34,"chapter":"第4章","unitNumber":"まとめ","unitName":"4章のまとめ","page":""},{"unitId":"ELEM-ENG-III-035","displayOrder":35,"chapter":"第4章","unitNumber":"Writing\n4","unitName":"質問に答える英作文②","page":""},{"unitId":"ELEM-ENG-III-036","displayOrder":36,"chapter":"第5章","unitNumber":"1","unitName":"疑問詞 + to + 動詞の原形","page":""},{"unitId":"ELEM-ENG-III-037","displayOrder":37,"chapter":"第5章","unitNumber":"2","unitName":"want 人 to + 動詞の原形","page":""},{"unitId":"ELEM-ENG-III-038","displayOrder":38,"chapter":"第5章","unitNumber":"3","unitName":"It is … (for 人) to + 動詞の原形","page":""},{"unitId":"ELEM-ENG-III-039","displayOrder":39,"chapter":"第5章","unitNumber":"4","unitName":"間接疑問文","page":""},{"unitId":"ELEM-ENG-III-040","displayOrder":40,"chapter":"第5章","unitNumber":"まとめ","unitName":"5章のまとめ","page":""},{"unitId":"ELEM-ENG-III-041","displayOrder":41,"chapter":"第5章","unitNumber":"Writing\n5","unitName":"質問に答える英作文③","page":""}]}};
function isElementaryGrade_(v){return /^小[1-6]$/.test(text_(v).normalize('NFKC').replace(/年$/u,''));}
function elementaryEnglishLevel_(v){const s=text_(v).normalize('NFKC').toUpperCase().replace(/\s+/g,'');if(!s)return'';if(s==='3'||s.indexOf('III')>=0)return'Ⅲ';if(s==='2'||s.indexOf('II')>=0)return'Ⅱ';if(s==='1'||s.indexOf('I')>=0)return'Ⅰ';return'';}
function elementarySubjects_(student,info){const a=(info&&info.subjects||[]).map(function(s){return text_(s)==='数学'?'算数':text_(s);}).filter(function(s){return['算数','国語','英語'].indexOf(s)>=0;});return a.length?Array.from(new Set(a)):['算数','国語','英語'];}
function elementarySheet_(name,headers){const book=REQUEST_CACHE.dataBook||(REQUEST_CACHE.dataBook=SpreadsheetApp.openById(CONFIG.DATA_SPREADSHEET_ID));let sheet=book.getSheetByName(name);if(!sheet){sheet=book.insertSheet(name);sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);}REQUEST_CACHE['sheet:'+name]=sheet;return sheet;}
function ensureElementarySupport_(){elementarySheet_('小学単元テスト',['テストID','生徒ID','科目','単元ID','単元名','実施日','点数','満点','メモ','作成日時','更新日時','操作者ID','操作者名']);const p=PropertiesService.getScriptProperties(),key='FORESTA_ELEMENTARY_UNITS_20260831';if(p.getProperty(key)==='done')return;const ids=new Set(objects_('単元マスタ').map(function(r){return text_(r['単元ID']);})),rows=[];Object.keys(ELEMENTARY_PROGRESSIONS_.math||{}).forEach(function(g){ELEMENTARY_PROGRESSIONS_.math[g].forEach(function(u){if(!ids.has(u.unitId))rows.push({'単元ID':u.unitId,'教科':'算数','学年':g,'教科書または進行表の種類':'啓林館','表示順':u.displayOrder,'章':u.chapter,'単元番号':u.unitNumber,'単元名':u.unitName,'難度':'','備考':u.page?'教科書 '+u.page:''});});});Object.keys(ELEMENTARY_PROGRESSIONS_.english||{}).forEach(function(l){ELEMENTARY_PROGRESSIONS_.english[l].forEach(function(u){if(!ids.has(u.unitId))rows.push({'単元ID':u.unitId,'教科':'英語','学年':'小学','教科書または進行表の種類':'小学英語'+l,'表示順':u.displayOrder,'章':u.chapter,'単元番号':u.unitNumber,'単元名':u.unitName,'難度':'','備考':''});});});if(rows.length)appendObjects_('単元マスタ',rows);p.setProperty(key,'done');}
function allowedHomeworkForStudent_(student,subject){if(isElementaryGrade_(student.grade)){if(subject==='算数'||subject==='英語')return['TRYの赤×なおし','エクササイズ'];if(subject==='国語')return['本日の赤×なおし'];return[];}const sp='巻末のKeyWordsTestの暗記';if(subject==='英語')return['KeyWords「☆日→英」暗記','exercise「暗記マーク」暗記','Try赤×直し','TRYの赤×直し','exercise','宿題の赤×直し','KEYWORDSの暗記','エクササイズの赤×直し',sp];if(subject==='数学')return['TRYの赤×直し','exercise','宿題の赤×直し','エクササイズの赤×直し',sp];return[];}
function elementaryUnitTestsFor_(studentId,limit){const map={};objects_('単元マスタ').forEach(function(r){map[text_(r['単元ID'])]=text_(r['単元名']);});return objects_('小学単元テスト').filter(function(r){return text_(r['生徒ID'])===text_(studentId);}).sort(function(a,b){return new Date(b['実施日'])-new Date(a['実施日']);}).slice(0,Number(limit||30)).map(function(r){return{testId:text_(r['テストID']),subject:text_(r['科目']),unitId:text_(r['単元ID']),unitName:text_(r['単元名'])||map[text_(r['単元ID'])]||'',testDate:new Date(r['実施日']).toISOString(),score:Number(r['点数']),maxScore:Number(r['満点']||100),memo:text_(r['メモ'])};});}
function saveElementaryUnitTest_(data){const session=requireRole_(data,['teacher']),student=getActiveStudent_(data.studentId),subject=text_(data.subject),score=Number(data.score),max=Number(data.maxScore||100);if(!isElementaryGrade_(student.grade)||['算数','国語','英語'].indexOf(subject)<0||!Number.isFinite(score)||!Number.isFinite(max)||max<=0||score<0||score>max)throw new Error('INVALID_VALUE');const id=text_(data.unitId),source=unitsFor_(student,subject),unit=id?source.units.find(function(u){return u.unitId===id;}):null;if(id&&!unit)throw new Error('INVALID_UNIT');const name=unit?unit.unitName:text_(data.unitName);if(!id&&!name)throw new Error('INVALID_VALUE');const raw=text_(data.testDate),date=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(raw+'T12:00:00+09:00'):new Date(),now=new Date(),tid=uuid_('ELEMTEST');appendObject_('小学単元テスト',{'テストID':tid,'生徒ID':student.studentId,'科目':subject,'単元ID':id,'単元名':name,'実施日':date,'点数':score,'満点':max,'メモ':text_(data.memo),'作成日時':now,'更新日時':now,'操作者ID':session.loginId,'操作者名':session.name});return{saved:true,testId:tid};}
function elementaryProgressionFor_(student,subject,includeUnits){const source=unitsFor_(student,subject),units=source.units||[],lessons=objects_('授業記録').filter(function(r){return text_(r['生徒ID'])===student.studentId&&text_(r['科目'])===subject;}).sort(function(a,b){return new Date(b['授業日'])-new Date(a['授業日']);}),lu=objects_('授業実施単元').filter(function(r){return text_(r['生徒ID'])===student.studentId&&text_(r['科目'])===subject;}),dates={};lu.forEach(function(r){const id=text_(r['単元ID']);if(!dates[id])dates[id]=[];dates[id].push(new Date(r['実施日']));});Object.keys(dates).forEach(function(id){dates[id].sort(function(a,b){return a-b;});});const sr=objects_('学校進度履歴').filter(function(r){return text_(r['生徒ID'])===student.studentId&&text_(r['科目'])===subject;}).sort(function(a,b){return new Date(b['登録日'])-new Date(a['登録日']);}),sid=sr.length?text_(sr[0]['単元ID']):'',school=units.find(function(u){return u.unitId===sid;})||null,learned=new Set(Object.keys(dates)),juku=units.filter(function(u){return learned.has(u.unitId);}).sort(function(a,b){return b.displayOrder-a.displayOrder;})[0]||null,diff=school&&juku?Number(juku.displayOrder)-Number(school.displayOrder):null;let label='未設定';if(school&&juku)label=diff>0?'学校より +'+diff+'単元':diff<0?'学校より '+diff+'単元':'学校と同じ ±0単元';else if(!school&&juku)label='学校進度未入力';else if(school&&!juku)label='塾進度未入力';const tests=elementaryUnitTestsFor_(student.studentId,30).filter(function(t){return t.subject===subject;}),prev=new Set(lessons.length?lu.filter(function(r){return text_(r['授業ID'])===text_(lessons[0]['授業ID']);}).map(function(r){return text_(r['単元ID']);}):[]),summary={subject:subject,textbook:source.textbook||'未設定',schoolUnitId:sid,schoolUnitName:school&&school.unitName,forestaUnitId:juku&&juku.unitId,forestaUnitName:juku&&juku.unitName,differenceUnits:diff,differenceLabel:label,comparison:diff==null?'未設定':diff>0?'学校より先':diff===0?'学校と同じ':'学校より遅れ',latestUnitTest:tests[0]||null,unitOptions:units.map(function(u){return{unitId:u.unitId,unitNumber:u.unitNumber,unitName:u.unitName,chapter:u.chapter};}),elementary:true};if(!includeUnits)return{summary:summary};return{title:student.grade+' '+subject+' / '+(source.textbook||'進行表未登録'),selectedUnitIds:[],summary:summary,units:units.map(function(u){const d=dates[u.unitId]||[];return Object.assign({},u,{omittable:false,learned:d.length>0,lessonDates:d.map(function(x){return x.toISOString();}),previous:prev.has(u.unitId),schoolPosition:u.unitId===sid,schoolPositionAt:u.unitId===sid&&sr.length?new Date(sr[0]['登録日']).toISOString():'',predictedOutside:false,decidedOutside:false,ctResult:''});})};}

function setting_(key){const row=objects_('アプリ設定').find(function(r){return text_(r['設定キー'])===key;});return row?text_(row['設定値']):'';}
function audit_(actor,action,type,id,result,detail){appendObject_('操作履歴',{'操作ID':uuid_('AUDIT'),'日時':new Date(),'操作者ID':actor.loginId||actor.studentId||'','操作者名':actor.name||'','役割':actor.role||'','操作':action,'対象種別':type,'対象ID':id,'結果':result,'詳細':detail||''});}
