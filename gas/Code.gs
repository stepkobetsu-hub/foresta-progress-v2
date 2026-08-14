/**
 * フォレスタ進捗管理 v2 - Google Apps Script API
 * 既存マスターは読み取り専用。アプリ固有データは DATA_SPREADSHEET_ID のみへ保存する。
 */
const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
const CONFIG = Object.freeze({
  DATA_SPREADSHEET_ID: SCRIPT_PROPERTIES.getProperty('DATA_SPREADSHEET_ID') || '',
  STUDENT_MASTER_ID: SCRIPT_PROPERTIES.getProperty('STUDENT_MASTER_ID') || '',
  STUDENT_MASTER_SHEET: '☆マスタ',
  TEACHER_MASTER_ID: SCRIPT_PROPERTIES.getProperty('TEACHER_MASTER_ID') || '',
  TEACHER_MASTER_SHEET: '講師マスター',
  SCORE_CORRECTION_URL: 'https://stepkobetsu-hub.github.io/seiseki-kanri/admin.html#scores',
  SESSION_SECONDS: 21600,
  MASTER_CACHE_SECONDS: 300
});

const SCHEMAS = Object.freeze({
  Settings: ['key','value','updated_at','updated_by'],
  CourseUnits: ['unit_id','subject','grade','sequence','unit_name','difficulty','active'],
  SchoolTestRanges: ['range_id','school','grade','subject','test_name','test_date','range_type','unit_id','updated_at','updated_by'],
  SchoolProgress: ['progress_id','student_id','school','grade','subject','unit_id','confirmed_at','teacher_id'],
  LessonRecords: ['lesson_id','student_id','lesson_date','teacher_id','subject','comment','created_at'],
  LearnedUnits: ['record_id','lesson_id','student_id','subject','unit_id','learned_date','teacher_id'],
  CTResults: ['ct_id','lesson_id','student_id','subject','unit_id','result','tested_at','teacher_id'],
  Homework: ['homework_id','student_id','lesson_id','subject','unit_id','item_text','is_other','assigned_at','student_checked_at','teacher_checked_at','teacher_id'],
  Targets: ['target_id','student_id','test_name','subject','score','updated_at'],
  Comments: ['comment_id','student_id','lesson_id','comment_date','teacher_id','subject','comment'],
  Notices: ['notice_id','student_id','notice','updated_at','updated_by'],
  NotificationLog: ['notification_id','dedupe_key','type','recipient','student_id','ct_id','status','created_at','sent_at'],
  StudentSubjects: ['student_id','subject','source_updated_at'],
  TeacherAccess: ['teacher_id','password_hash','authority','active','updated_at'],
  RequestLog: ['request_id','action','actor_id','created_at','status']
});

function doGet() {
  return json_({ok:true, data:{service:'foresta-progress-v2', version:'2.0.0', now:isoNow_()}});
}

function doPost(e) {
  let request = {};
  try {
    request = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!request.action) throw new Error('操作が指定されていません');
    if (request.requestId && isDuplicateRequest_(request.requestId)) return json_({ok:true, data:{duplicate:true}});
    const data = route_(request);
    if (request.requestId) logRequest_(request.requestId, request.action, request.token, 'ok');
    return json_({ok:true, data:data});
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    if (request.requestId) logRequest_(request.requestId, request.action || '', request.token, 'error');
    return json_({ok:false, message:error && error.message ? error.message : 'サーバーエラーが発生しました'});
  }
}

function route_(request) {
  switch (request.action) {
    case 'login': return login_(request);
    case 'bootstrap': return bootstrap_(requireSession_(request.token));
    case 'toggleHomework': return toggleHomework_(requireSession_(request.token), request);
    case 'saveTargets': return saveTargets_(requireSession_(request.token), request);
    case 'saveLesson': return saveLesson_(requireRole_(request.token, ['teacher','admin']), request);
    case 'saveSchoolRange': return saveSchoolRange_(requireRole_(request.token, ['admin']), request);
    case 'refreshSubjects': return refreshSubjects_(requireRole_(request.token, ['admin']));
    case 'reauthAdmin': return reauthAdmin_(requireRole_(request.token, ['admin']), request);
    default: throw new Error('未対応の操作です');
  }
}

function login_(request) {
  const role = String(request.role || '');
  const id = String(request.id || '').trim();
  const password = String(request.password || '');
  if (!id || !password) throw new Error('IDとパスワードを入力してください');
  let user;
  if (role === 'student') user = authenticateStudent_(id, password);
  else if (role === 'teacher' || role === 'admin') user = authenticateTeacher_(id, password, role === 'admin');
  else throw new Error('ログイン種別が正しくありません');
  const token = Utilities.getUuid() + Utilities.getUuid();
  const session = {role:role, user:user, issuedAt:isoNow_()};
  CacheService.getScriptCache().put('session:' + token, JSON.stringify(session), CONFIG.SESSION_SECONDS);
  return {token:token, role:role, user:user, students:role === 'student' ? undefined : listStudents_()};
}

function authenticateStudent_(id, password) {
  const values = masterValues_(CONFIG.STUDENT_MASTER_ID, CONFIG.STUDENT_MASTER_SHEET);
  for (let r = 2; r < values.length; r++) {
    if (String(values[r][0]).trim() !== id) continue;
    if (String(values[r][11]) !== password) throw new Error('IDまたはパスワードが違います');
    return studentFromRow_(values[r], values);
  }
  throw new Error('IDまたはパスワードが違います');
}

function authenticateTeacher_(id, password, requireAdmin) {
  const values = masterValues_(CONFIG.TEACHER_MASTER_ID, CONFIG.TEACHER_MASTER_SHEET);
  const header = detectHeader_(values);
  const cols = {
    id: findColumn_(header.values, ['講師ID','講師id','ID','id'], 0),
    name: findColumn_(header.values, ['講師氏名','講師名','氏名','名前'], 1),
    active: findColumn_(header.values, ['在籍状態','在籍','有効'], 3),
    room: findColumn_(header.values, ['主な教室','教室'], 17),
    password: findColumn_(header.values, ['パスワード','password','PW','ログインパスワード'], -1),
    authority: findColumn_(header.values, ['権限','管理者権限','authority'], -1)
  };
  const access = teacherAccessMap_();
  for (let r = header.row + 1; r < values.length; r++) {
    const row = values[r];
    const teacherId = String(row[cols.id] || row[cols.name] || '').trim();
    if (teacherId !== id && String(row[cols.name] || '').trim() !== id) continue;
    if (String(row[cols.active]).trim() !== '1') throw new Error('この講師アカウントは現在利用できません');
    const override = access[teacherId];
    const passwordOk = cols.password >= 0 ? String(row[cols.password]) === password : override && override.active && override.passwordHash === hash_(password);
    if (!passwordOk) throw new Error(cols.password < 0 && !override ? '講師ログイン情報が未設定です。管理者がTeacherAccessを設定してください' : 'IDまたはパスワードが違います');
    const authority = cols.authority >= 0 ? Number(row[cols.authority] || 0) : Number(override && override.authority || 0);
    if (requireAdmin && authority < 1) throw new Error('管理者権限がありません');
    return {id:teacherId, name:String(row[cols.name] || teacherId), classroom:String(row[cols.room] || ''), authority:authority};
  }
  throw new Error('IDまたはパスワードが違います');
}

function bootstrap_(session) {
  ensureDataSheets_();
  if (session.role === 'student') {
    return {targets:getTargets_(session.user.id), homework:getHomework_(session.user.id), units:getUnits_(), test:getTestInfo_(session.user), scores:[]};
  }
  return {students:listStudents_(), units:getUnits_(), test:{name:'次回定期テスト',date:''}};
}

function listStudents_() {
  const values = masterValues_(CONFIG.STUDENT_MASTER_ID, CONFIG.STUDENT_MASTER_SHEET);
  const students = [];
  for (let r = 2; r < values.length; r++) if (String(values[r][0]).trim()) students.push(studentFromRow_(values[r], values));
  return students;
}

function studentFromRow_(row, allValues) {
  const headers = detectHeader_(allValues).values;
  const gradeCol = findColumn_(headers, ['学年'], -1);
  const schoolCol = findColumn_(headers, ['学校名','学校'], -1);
  const kanaCol = findColumn_(headers, ['ふりがな','フリガナ','かな'], -1);
  const notice = noticeForStudent_(String(row[0] || ''));
  return {
    id:String(row[0] || ''), name:String(row[4] || ''), kana:kanaCol >= 0 ? String(row[kanaCol] || '') : '',
    classroom:String(row[7] || ''), grade:gradeCol >= 0 ? String(row[gradeCol] || '') : '', school:schoolCol >= 0 ? String(row[schoolCol] || '') : '',
    subjects:getStudentSubjects_(String(row[0] || '')), notice:notice,
    levels:{'英語':Number(row[40] || 3), '数学':Number(row[41] || 3)}
  };
}

function saveTargets_(session, request) {
  const studentId = session.role === 'student' ? session.user.id : String(request.studentId || '');
  const targets = request.targets || {};
  ['英語','数学','国語','理科','社会'].forEach(function(subject) {
    const score = targets[subject];
    if (score === '' || score === null || typeof score === 'undefined') return;
    if (Number(score) < 0 || Number(score) > 100) throw new Error('目標点は0〜100点で入力してください');
    upsertByKeys_('Targets', ['student_id','subject'], [studentId,subject], {target_id:Utilities.getUuid(),student_id:studentId,test_name:'次回',subject:subject,score:Number(score),updated_at:isoNow_()});
  });
  return {saved:true};
}

function toggleHomework_(session, request) {
  const sheet = dataSheet_('Homework'); const values = sheet.getDataRange().getValues();
  for (let r=1;r<values.length;r++) {
    if (String(values[r][0]) !== String(request.homeworkId)) continue;
    if (session.role === 'student' && String(values[r][1]) !== session.user.id) throw new Error('この宿題は変更できません');
    const col = request.checkType === 'teacher' ? 9 : 8;
    if (request.checkType === 'teacher' && !['teacher','admin'].includes(session.role)) throw new Error('講師確認の権限がありません');
    sheet.getRange(r+1,col+1).setValue(request.checked ? new Date() : '');
    return {saved:true};
  }
  throw new Error('宿題が見つかりません');
}

function saveLesson_(session, request) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const lesson = request.lesson || {}; const lessonId = Utilities.getUuid(); const now = isoNow_();
    appendObject_('LessonRecords',{lesson_id:lessonId,student_id:request.studentId,lesson_date:lesson.date||today_(),teacher_id:session.user.id,subject:request.subject,comment:lesson.comment||'',created_at:now});
    (lesson.learnedUnitIds || []).forEach(function(unitId){appendObject_('LearnedUnits',{record_id:Utilities.getUuid(),lesson_id:lessonId,student_id:request.studentId,subject:request.subject,unit_id:unitId,learned_date:lesson.date||today_(),teacher_id:session.user.id});});
    if (lesson.schoolUnitId) appendObject_('SchoolProgress',{progress_id:Utilities.getUuid(),student_id:request.studentId,school:'',grade:'',subject:request.subject,unit_id:lesson.schoolUnitId,confirmed_at:now,teacher_id:session.user.id});
    let ctId = '';
    if (lesson.ctUnitId && lesson.ctResult) {
      ctId = Utilities.getUuid(); appendObject_('CTResults',{ct_id:ctId,lesson_id:lessonId,student_id:request.studentId,subject:request.subject,unit_id:lesson.ctUnitId,result:lesson.ctResult,tested_at:now,teacher_id:session.user.id});
      if (lesson.ctResult === '×') queueCtNotification_(request.studentId,ctId,lessonId);
    }
    (request.homework || []).forEach(function(hw){appendObject_('Homework',{homework_id:Utilities.getUuid(),student_id:request.studentId,lesson_id:lessonId,subject:request.subject,unit_id:hw.unitId,item_text:hw.text,is_other:hw.other?1:0,assigned_at:now,student_checked_at:'',teacher_checked_at:'',teacher_id:session.user.id});});
    if (String(lesson.comment||'').trim()) appendObject_('Comments',{comment_id:Utilities.getUuid(),student_id:request.studentId,lesson_id:lessonId,comment_date:lesson.date||today_(),teacher_id:session.user.id,subject:request.subject,comment:String(lesson.comment).trim()});
    return {lessonId:lessonId, ctId:ctId, saved:true};
  } finally { lock.releaseLock(); }
}

function saveSchoolRange_(session, request) {
  const sheet=dataSheet_('SchoolTestRanges');const values=sheet.getDataRange().getValues();const keep=[values[0]];
  for(let r=1;r<values.length;r++){
    const same=String(values[r][1])===String(request.school)&&String(values[r][2])===String(request.grade)&&String(values[r][3])===String(request.subject)&&String(values[r][6])===String(request.rangeType);
    if(!same)keep.push(values[r]);
  }
  (request.unitIds||[]).forEach(function(unitId){keep.push([Utilities.getUuid(),request.school,request.grade,request.subject,request.test&&request.test.name||'',request.test&&request.test.date||'',request.rangeType,unitId,isoNow_(),session.user.id]);});
  sheet.clearContents();sheet.getRange(1,1,keep.length,keep[0].length).setValues(keep);sheet.setFrozenRows(1);
  return {saved:true,count:(request.unitIds||[]).length};
}

function refreshSubjects_(session) {
  const values=masterValues_(CONFIG.STUDENT_MASTER_ID,CONFIG.STUDENT_MASTER_SHEET);const header=detectHeader_(values);const subjectCols=[];
  header.values.forEach(function(v,i){if(/受講|科目/.test(String(v))&&!/数|ID|名/.test(String(v)))subjectCols.push(i);});
  const rows=[SCHEMAS.StudentSubjects];
  for(let r=header.row+1;r<values.length;r++){const id=String(values[r][0]||'');if(!id)continue;const found=[];subjectCols.forEach(function(c){String(values[r][c]||'').split(/[、,\s]+/).forEach(function(x){if(['英語','数学','国語','理科','社会'].includes(x)&&!found.includes(x))found.push(x);});});if(!found.length)found.push('英語','数学');found.forEach(function(s){rows.push([id,s,isoNow_()]);});}
  const sheet=dataSheet_('StudentSubjects');sheet.clearContents();sheet.getRange(1,1,rows.length,3).setValues(rows);sheet.setFrozenRows(1);CacheService.getScriptCache().remove('student-subjects');
  return {updated:true,students:Math.max(0,rows.length-1),by:session.user.id};
}

function reauthAdmin_(session, request) { const user=authenticateTeacher_(String(request.id||''),String(request.password||''),true);if(user.id!==session.user.id)throw new Error('ログイン中の管理者と一致しません');return {verified:true}; }

function getUnits_() { ensureDataSheets_(); const values=dataSheet_('CourseUnits').getDataRange().getDisplayValues();return values.slice(1).filter(r=>String(r[6])!=='0').map(r=>({id:r[0],subject:r[1],grade:r[2],sequence:Number(r[3]),label:r[4],difficulty:r[5]})); }
function getTargets_(studentId) { const result={'英語':'','数学':'','国語':'','理科':'','社会':''};const values=dataSheet_('Targets').getDataRange().getDisplayValues();values.slice(1).forEach(r=>{if(r[1]===studentId)result[r[3]]=Number(r[4]);});return result; }
function getHomework_(studentId) { const values=dataSheet_('Homework').getDataRange().getDisplayValues();return values.slice(1).filter(r=>r[1]===studentId).slice(-50).reverse().map(r=>({id:r[0],unitId:r[4],unit:r[4],text:r[5],studentCheckedAt:r[8]||null,teacherCheckedAt:r[9]||null})); }
function getTestInfo_() { return {name:'次回定期テスト',date:''}; }
function getStudentSubjects_(studentId) { const cache=CacheService.getScriptCache();let map=cache.get('student-subjects');if(map)map=JSON.parse(map);else{map={};const values=dataSheet_('StudentSubjects').getDataRange().getDisplayValues();values.slice(1).forEach(r=>{if(!map[r[0]])map[r[0]]=[];map[r[0]].push(r[1]);});cache.put('student-subjects',JSON.stringify(map),300);}return map[studentId]||['英語','数学']; }
function noticeForStudent_(studentId){try{const values=dataSheet_('Notices').getDataRange().getDisplayValues();for(let r=values.length-1;r>0;r--)if(values[r][1]===studentId)return values[r][2];}catch(e){}return '';}

function queueCtNotification_(studentId,ctId,lessonId){const key=['ct-fail',studentId,ctId].join(':');const log=dataSheet_('NotificationLog').getDataRange().getDisplayValues();if(log.slice(1).some(r=>r[1]===key))return;const settings=settingsMap_();const recipient=settings.ct_notification_email||'';const confirmed=String(settings.ct_notification_email_confirmed)==='true';const status=confirmed&&recipient?'pending':'awaiting_confirmation';appendObject_('NotificationLog',{notification_id:Utilities.getUuid(),dedupe_key:key,type:'ct_fail',recipient:recipient,student_id:studentId,ct_id:ctId,status:status,created_at:isoNow_(),sent_at:''});}

function requireSession_(token){const raw=CacheService.getScriptCache().get('session:'+String(token||''));if(!raw)throw new Error('ログインの有効期限が切れました。再ログインしてください');return JSON.parse(raw);}
function requireRole_(token,roles){const session=requireSession_(token);if(!roles.includes(session.role))throw new Error('この操作の権限がありません');if(session.role==='admin'&&Number(session.user.authority||0)<1)throw new Error('管理者権限がありません');return session;}
function masterValues_(id,name){const cache=CacheService.getScriptCache();const key='master:'+id+':'+name;const raw=cache.get(key);if(raw)return JSON.parse(raw);const values=SpreadsheetApp.openById(id).getSheetByName(name).getDataRange().getDisplayValues();const text=JSON.stringify(values);if(text.length<95000)cache.put(key,text,CONFIG.MASTER_CACHE_SECONDS);return values;}
function detectHeader_(values){let best={row:0,values:values[0]||[],score:0};for(let r=0;r<Math.min(5,values.length);r++){const score=(values[r]||[]).filter(v=>String(v).trim()).length;if(score>best.score)best={row:r,values:values[r],score:score};}return best;}
function findColumn_(headers,candidates,fallback){for(let i=0;i<headers.length;i++){const value=String(headers[i]||'').replace(/[\s　]/g,'').toLowerCase();for(let j=0;j<candidates.length;j++)if(value===String(candidates[j]).replace(/[\s　]/g,'').toLowerCase())return i;}return fallback;}
function teacherAccessMap_(){ensureDataSheets_();const values=dataSheet_('TeacherAccess').getDataRange().getDisplayValues();const map={};values.slice(1).forEach(r=>map[r[0]]={passwordHash:r[1],authority:Number(r[2]||0),active:String(r[3])!=='0'});return map;}
function settingsMap_(){const values=dataSheet_('Settings').getDataRange().getDisplayValues();const out={};values.slice(1).forEach(r=>out[r[0]]=r[1]);return out;}
function hash_(value){const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8);return bytes.map(b=>(b+256).toString(16).slice(-2)).join('');}
function dataBook_(){if(!CONFIG.DATA_SPREADSHEET_ID)throw new Error('スクリプト プロパティ DATA_SPREADSHEET_ID が未設定です');return SpreadsheetApp.openById(CONFIG.DATA_SPREADSHEET_ID);}
function dataSheet_(name){const sheet=dataBook_().getSheetByName(name);if(!sheet)throw new Error('保存シート「'+name+'」が見つかりません');return sheet;}
function ensureDataSheets_(){const book=dataBook_();Object.keys(SCHEMAS).forEach(function(name){let sheet=book.getSheetByName(name);if(!sheet)sheet=book.insertSheet(name);if(sheet.getLastRow()===0){sheet.getRange(1,1,1,SCHEMAS[name].length).setValues([SCHEMAS[name]]);sheet.setFrozenRows(1);}});seedUnits_();}
function seedUnits_(){const sheet=dataSheet_('CourseUnits');if(sheet.getLastRow()>1)return;const rows=[];const seed={
  '中1英語':['be動詞','一般動詞','複数形・代名詞','疑問詞','現在進行形','過去形'], '中1数学':['正負の数','文字式','方程式','比例と反比例','平面図形','空間図形'],
  '中2英語':['過去形・過去進行形','未来表現','助動詞','不定詞','動名詞','比較'], '中2数学':['式の計算','連立方程式','一次関数','平行と合同','三角形と四角形','確率'],
  '中3英語':['受動態','現在完了','不定詞の応用','分詞','関係代名詞','仮定法'], '中3数学':['式の展開と因数分解','平方根','二次方程式','関数y=ax²','相似','円・三平方']};
  Object.keys(seed).forEach(function(key){const grade=key.slice(0,2),subject=key.slice(2),prefix=subject==='英語'?'E':'M';seed[key].forEach(function(name,i){rows.push([prefix+grade.charAt(1)+'-'+String(i+1).padStart(2,'0'),subject,grade,i+1,name,i===3?'!':i===5?'!!':'',1]);});});
  sheet.getRange(2,1,rows.length,rows[0].length).setValues(rows);
}
function appendObject_(sheetName,obj){const headers=SCHEMAS[sheetName];dataSheet_(sheetName).appendRow(headers.map(h=>Object.prototype.hasOwnProperty.call(obj,h)?obj[h]:''));}
function upsertByKeys_(sheetName,keyNames,keyValues,obj){const sheet=dataSheet_(sheetName);const headers=SCHEMAS[sheetName];const values=sheet.getDataRange().getValues();const indexes=keyNames.map(k=>headers.indexOf(k));for(let r=1;r<values.length;r++){if(indexes.every((c,i)=>String(values[r][c])===String(keyValues[i]))){sheet.getRange(r+1,1,1,headers.length).setValues([headers.map(h=>Object.prototype.hasOwnProperty.call(obj,h)?obj[h]:values[r][headers.indexOf(h)])]);return;}}appendObject_(sheetName,obj);}
function isDuplicateRequest_(id){if(!id||!CONFIG.DATA_SPREADSHEET_ID)return false;const values=dataSheet_('RequestLog').getDataRange().getDisplayValues();return values.slice(-300).some(r=>r[0]===String(id)&&r[4]==='ok');}
function logRequest_(id,action,token,status){try{let actor='';if(token){const raw=CacheService.getScriptCache().get('session:'+token);if(raw)actor=JSON.parse(raw).user.id;}appendObject_('RequestLog',{request_id:id,action:action,actor_id:actor,created_at:isoNow_(),status:status});}catch(e){console.warn(e);}}
function isoNow_(){return new Date().toISOString();} function today_(){return Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd');}
function json_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}

/** 新規データスプレッドシートを設定後、エディタから1回実行して初期化する。 */
function setupForestaV2(){ensureDataSheets_();return 'initialized: '+dataBook_().getUrl();}
