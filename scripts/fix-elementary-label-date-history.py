from pathlib import Path
import re

app_path = Path('app.js')
mod_path = Path('elementary-supabase.js')
css_path = Path('elementary-supabase.css')
idx_path = Path('index.html')

app = app_path.read_text()
mod = mod_path.read_text()
css = css_path.read_text()
idx = idx_path.read_text()

old_core = 'function elementaryCoreRows(data){const existing=data?.progress||[], raw=[...(data?.elementary?.subjects||[]),...(data?.student?.subjects||[])].map(s=>String(s||"").trim()==="数学"?"算数":String(s||"").trim()).filter(s=>["算数","国語","英語"].includes(s)), subjects=[...new Set(raw)];const ordered=(subjects.length?subjects:["算数"]).sort((a,b)=>["算数","国語","英語"].indexOf(a)-["算数","国語","英語"].indexOf(b));return ordered.map(subject=>existing.find(r=>(r.subject==="数学"?"算数":r.subject)===subject)||{subject,differenceLabel:"未設定",schoolUnitName:"",forestaUnitName:"",unitOptions:[],latestUnitTest:null})}'
new_core = 'function elementaryCoreRows(data){const existing=data?.progress||[], raw=[...(data?.elementary?.subjects||[]),...(data?.student?.subjects||[])].map(s=>String(s||"").trim()==="数学"?"算数":String(s||"").trim()).filter(s=>["算数","国語","英語"].includes(s)), subjects=[...new Set(raw)];const ordered=(subjects.length?subjects:["算数"]).sort((a,b)=>["算数","国語","英語"].indexOf(a)-["算数","国語","英語"].indexOf(b));return ordered.map(subject=>{const found=existing.find(r=>(r.subject==="数学"?"算数":r.subject)===subject);return found?{...found,subject}:{subject,differenceLabel:"未設定",schoolUnitName:"",forestaUnitName:"",unitOptions:[],latestUnitTest:null}})}'
if old_core not in app:
    raise SystemExit('elementaryCoreRows anchor not found')
app = app.replace(old_core, new_core, 1)

# Give the test history enough width to stay horizontal and readable.
app = app.replace('<article class="card span8"><p class="cardTitle">最近の学校単元テスト</p>', '<article class="card span12"><p class="cardTitle">最近の学校単元テスト</p>', 1)
app = app.replace('<article class="card span4"><div class="homeworkPanelHead"><p class="cardTitle">前回宿題</p>', '<article class="card span12"><div class="homeworkPanelHead"><p class="cardTitle">前回宿題</p>', 1)
app_path.write_text(app)

# Match the middle-school UX: include today's date directly in the check control.
old_today = '${todaySet.has(u.unitId) ? "✓ 今日" : "今日"}'
new_today = '${todaySet.has(u.unitId) ? "✓ 今日" : "今日"} ${esc(shortDate(today))}'
if old_today not in mod:
    raise SystemExit('today button anchor not found')
mod = mod.replace(old_today, new_today, 1)

# Make recent scores compact: two short lines for front/back rather than one long string.
helper_anchor = 'function recentTestsHtml(tests) {'
helper = '''function testScoreHtml(test) {\n  if (!test) return "";\n  const front = `<span>表 ${esc(test.score ?? "-")}/${esc(test.max_score || 100)}</span>`;\n  const hasBack = test.back_score !== null && test.back_score !== undefined && String(test.back_score) !== "";\n  const back = hasBack ? `<span>裏 ${esc(test.back_score)}/${esc(test.back_max_score || 50)}</span>` : `<span class="muted">裏 未入力</span>`;\n  return `${front}${back}`;\n}\n\n'''
if 'function testScoreHtml(' not in mod:
    mod = mod.replace(helper_anchor, helper + helper_anchor, 1)
mod = mod.replace('<b>${esc(testScoreText(t))}</b>', '<b class="elementaryTestScorePair">${testScoreHtml(t)}</b>')
mod_path.write_text(mod)

css_add = '''\n/* Elementary readability: keep subject labels and test history horizontal. */\n.elementarySubjectTestRow{grid-template-columns:46px minmax(120px,1fr) 96px!important;gap:10px!important;align-items:center!important;padding:9px 0!important}\n.elementarySubjectTestRow strong{writing-mode:horizontal-tb!important;word-break:normal!important;overflow-wrap:break-word!important;line-height:1.45!important}\n.elementaryTestScorePair{display:grid!important;gap:2px!important;text-align:right!important;white-space:normal!important;font-size:.78rem!important;line-height:1.25!important}\n.elementaryTestScorePair span{display:block!important;white-space:nowrap!important}\n.elementaryRecentTestGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:18px!important}\n.elementaryRecentTestGrid section{min-width:0!important;padding:14px!important}\n@media(max-width:760px){.elementaryRecentTestGrid{grid-template-columns:1fr!important}.elementarySubjectTestRow{grid-template-columns:44px minmax(0,1fr) 92px!important}}\n'''
if 'Elementary readability: keep subject labels' not in css:
    css += css_add
css_path.write_text(css)

idx = re.sub(r'app\.js\?v=[^"\']+', 'app.js?v=20260831-elementary-readable-1', idx, count=1)
idx = re.sub(r'elementary-supabase\.js\?v=[^"\']+', 'elementary-supabase.js?v=20260831-readable-1', idx, count=1)
idx = re.sub(r'elementary-supabase\.css\?v=[^"\']+', 'elementary-supabase.css?v=20260831-readable-1', idx, count=1)
idx_path.write_text(idx)
