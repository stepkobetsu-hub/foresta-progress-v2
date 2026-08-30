from pathlib import Path

p=Path('apps-script/Code.gs')
s=p.read_text()

anchor="function subjectCacheMap_(){const map={};objects_('受講科目キャッシュ').forEach(function(row){const id=text_(row['生徒ID']);if(!id)return;if(!map[id])map[id]={subjects:[],englishLevel:text_(row['英語レベル']),mathLevel:text_(row['数学レベル'])};const subject=text_(row['受講科目']);if(subject&&map[id].subjects.indexOf(subject)<0)map[id].subjects.push(subject);if(!map[id].englishLevel)map[id].englishLevel=text_(row['英語レベル']);if(!map[id].mathLevel)map[id].mathLevel=text_(row['数学レベル']);});return map;}"
helper=anchor+"\nfunction studentCourseInfo_(studentId){const id=text_(studentId),live=timetableMap_()[id],cached=subjectCacheMap_()[id];if(live)return live;if(cached)return cached;return{subjects:[],englishLevel:'',mathLevel:''};}"
if 'function studentCourseInfo_(' not in s:
    if anchor not in s: raise SystemExit('subjectCacheMap anchor not found')
    s=s.replace(anchor,helper,1)

old="const access = authorizeStudentAccess_(data), student = access.student, tt = subjectCacheMap_()[student.studentId] || { subjects: [], englishLevel: '', mathLevel: '' };"
new="const access = authorizeStudentAccess_(data), student = access.student, tt = studentCourseInfo_(student.studentId);"
if old not in s: raise SystemExit('dashboard source anchor not found')
s=s.replace(old,new,1)

old="if(isElementaryGrade_(student.grade)){if(subject==='算数')textbook='啓林館';else if(subject==='国語')textbook='NEW小学ワーク光村';else if(subject==='英語'){const info=subjectCacheMap_()[student.studentId]||{},level=elementaryEnglishLevel_(info.englishLevel||student.englishLevel);textbook=level?'小学英語'+level:'';}else return{textbook:'',units:[]};}else"
new="if(isElementaryGrade_(student.grade)){if(subject==='算数')textbook='啓林館';else if(subject==='国語')textbook='NEW小学ワーク光村';else if(subject==='英語'){const info=studentCourseInfo_(student.studentId),level=elementaryEnglishLevel_(info.englishLevel||student.englishLevel);textbook=level?'小学英語'+level:'';}else return{textbook:'',units:[]};}else"
if old not in s: raise SystemExit('unitsFor source anchor not found')
s=s.replace(old,new,1)

old="const source = unitsFor_(student, subject), units = source.units, nextTest = nextTestFor_(student), tt = subjectCacheMap_()[student.studentId] || {}, level = subject === '英語' ? tt.englishLevel : subject === '数学' ? tt.mathLevel : '';"
new="const source = unitsFor_(student, subject), units = source.units, nextTest = nextTestFor_(student), tt = studentCourseInfo_(student.studentId), level = subject === '英語' ? tt.englishLevel : subject === '数学' ? tt.mathLevel : '';"
if old not in s: raise SystemExit('progression source anchor not found')
s=s.replace(old,new,1)

# Add regression assertions to the GAS pure test source checks.
t=Path('tests/gas-pure.test.mjs')
ts=t.read_text()
needle='console.log("GAS pure tests: 30 assertions passed");'
if needle in ts and 'studentCourseInfo_' not in ts:
    insert='''assert.match(code, /function studentCourseInfo_\\(studentId\\)/);\nassert.match(code, /live=timetableMap_\\(\\)\\[id\\]/);\nassert.match(code, /tt = studentCourseInfo_\\(student.studentId\\)/);\n'''
    ts=ts.replace(needle,insert+'console.log("GAS pure tests: live timetable source assertions passed");')
    t.write_text(ts)

p.write_text(s)
