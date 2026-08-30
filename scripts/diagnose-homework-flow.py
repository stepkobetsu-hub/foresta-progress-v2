from pathlib import Path

files=['app.js','elementary-supabase.js']
terms=['renderTeacherStudent','teacherHomeworkCardsHtml','renderHomeworkArchivePage','bindHomeworkArchiveActions','homeworkArchive','archiveHomework','restoreHomework','lessonSubject','subjectSelect','elementaryLessonSubject','elementaryLessonTeacher','homeworkPanelHead']
out=[]
for fn in files:
    s=Path(fn).read_text()
    out.append(f'===== {fn} =====')
    for term in terms:
        pos=0
        found=0
        while True:
            i=s.find(term,pos)
            if i<0: break
            found+=1
            a=max(0,i-1200); b=min(len(s),i+3000)
            out.append(f'\n--- {term} occurrence {found} ---\n{s[a:b]}')
            pos=i+len(term)
            if found>=4: break
Path('HOMEWORK_DIAG.txt').write_text('\n'.join(out))
