from pathlib import Path
s=Path('app.js').read_text()

def func(name):
    start=s.find('function '+name+'(')
    if start<0: start=s.find('async function '+name+'(')
    if start<0: return f'NOT FOUND {name}'
    brace=s.find('{',start); depth=0; quote=None; esc=False; tpl=False
    i=brace
    # basic brace scanner aware of strings/templates enough for JS source
    while i<len(s):
        c=s[i]
        if quote:
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==quote: quote=None
        else:
            if c in ('"',"'",'`'): quote=c
            elif c=='{': depth+=1
            elif c=='}':
                depth-=1
                if depth==0: return s[start:i+1]
        i+=1
    return s[start:start+12000]

names=['renderTeacherStudent','teacherHomeworkCardsHtml','studentHomeworkCardsHtml','homeworkGroups','homeworkGroupCanArchive','homeworkGroupIds','bindHomeworkArchiveActions','homeworkArchiveCardsHtml','renderHomeworkArchivePage','bindHomeworkArchivePageActions']
Path('HOMEWORK_TARGET_DIAG.txt').write_text('\n\n===== NEXT =====\n\n'.join(func(n) for n in names))
