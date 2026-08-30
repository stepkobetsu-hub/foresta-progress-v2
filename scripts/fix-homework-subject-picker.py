from pathlib import Path
import re
for fn in ['app.js','elementary-supabase.js']:
    p=Path(fn); s=p.read_text()
    old='const preferred = selects.find((select) => /subject|kamoku|科目/i.test(`${select.id} ${select.name} ${select.className}`)) || selects[0];'
    new='const eligible = selects.filter((select) => !/top.?test|test.?subject|score/i.test(`${select.id} ${select.name} ${select.className}`));\n  const preferred = eligible.find((select) => /lesson|course|subject|kamoku|科目/i.test(`${select.id} ${select.name} ${select.className}`)) || eligible[0] || selects[0];'
    if old not in s: raise SystemExit(f'picker anchor not found in {fn}')
    s=s.replace(old,new,1)
    p.write_text(s)
idxp=Path('index.html'); idx=idxp.read_text()
idx=re.sub(r'app\.js\?v=[^"\']+','app.js?v=20260831-homework-unified-2',idx,count=1)
idx=re.sub(r'elementary-supabase\.js\?v=[^"\']+','elementary-supabase.js?v=20260831-homework-unified-2',idx,count=1)
idxp.write_text(idx)
