from pathlib import Path
import re

js_path = Path('elementary-supabase.js')
styles_path = Path('styles.css')
enh_path = Path('elementary-enhancement.css')
supacss_path = Path('elementary-supabase.css')
idx_path = Path('index.html')

js = js_path.read_text()
styles = styles_path.read_text()
enh = enh_path.read_text()
supacss = supacss_path.read_text()
idx = idx_path.read_text()

# 1) Progress saving must never depend on the older GAS lesson-save path.
old = '''    body.querySelectorAll('[data-action="today"]').forEach((input) => input.onchange = async () => {\n      input.disabled = true;\n      try {\n        if (input.checked) {\n          const saved = await saveElementaryTodayHomework(normalized, input.dataset.unit, today);\n          await callElementary("toggleLesson", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, checked: true });\n          const count = Number(saved?.homeworkCount || 0);\n          status(count > 0 ? `今日の進行と宿題 ${count}件を保存しました。` : "今日の進行を保存しました。宿題はすでに作成済みです。");\n        } else {\n          await callElementary("toggleLesson", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, checked: false });\n          status("今日の進行を取り消しました。作成済みの宿題は安全のため残しています。必要なら『宿題・進行表を訂正』から修正してください。");\n        }\n        await showInteractiveProgression(normalized, teacher);\n        await refreshElementaryScreen(false);\n      } catch (error) {\n        input.checked = !input.checked;\n        input.disabled = false;\n        status(error.message, true);\n      }\n    });'''
new = '''    body.querySelectorAll('[data-action="today"]').forEach((input) => input.onchange = async () => {\n      input.disabled = true;\n      try {\n        const result = await callElementary("toggleLesson", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, checked: input.checked });\n        elementaryDataCache.set(String(pageStudentId() || ""), result);\n        if (input.checked) {\n          const count = Number(result?.homeworkCreated || 0);\n          status(count > 0 ? `今日の進行を保存し、宿題 ${count}件を作成しました。` : "今日の進行を保存しました。宿題は作成済みです。");\n        } else {\n          status("今日の進行を取り消しました。作成済みの宿題は残しています。");\n        }\n        await showInteractiveProgression(normalized, teacher);\n        await refreshElementaryScreen(false);\n      } catch (error) {\n        input.checked = !input.checked;\n        input.disabled = false;\n        status(error.message, true);\n      }\n    });'''
if old not in js:
    raise SystemExit('today handler not found')
js = js.replace(old, new, 1)

# 2) Show elementary homework from the same Supabase backend used by today's checks.
anchor = '''function testScoreText(test) {'''
helper = r'''function elementaryHomeworkTypeLabel(type) {
  return ({ TRY_REDO: "TRYの赤×なおし", EXERCISE: "エクササイズ", TODAY_REDO: "本日の赤×なおし" })[String(type || "")] || String(type || "宿題");
}

async function elementaryHomeworkUnitMap(dashboard) {
  const map = new Map();
  for (const subject of CORE) {
    const units = await unitsFor(subject, dashboard?.student?.grade, dashboard?.student?.englishLevel).catch(() => []);
    units.forEach((u) => map.set(u.unitId, { subject, unitNumber: u.unitNumber || "", unitName: u.unitName || "" }));
  }
  return map;
}

async function replaceElementaryHomework(dashboard, data) {
  const lists = [...document.querySelectorAll(".homeworkList")];
  if (!lists.length) return;
  const rows = (data?.homework || []).filter((r) => String(r.series || "").startsWith("ELEMENTARY:"));
  const signature = rows.map((r) => [r.homework_id, r.updated_at, r.student_status, r.teacher_status].join("|")).join(";") || "empty";
  const unitMap = await elementaryHomeworkUnitMap(dashboard);
  const html = rows.length ? rows.map((r) => {
    const meta = unitMap.get(r.unit_id) || {};
    const subject = String(r.series || "").replace(/^ELEMENTARY:/, "") || meta.subject || "";
    const unit = [meta.unitNumber, meta.unitName].filter(Boolean).join(" ") || r.unit_id || "";
    const due = r.due_date ? shortDate(r.due_date) : "";
    return `<div class="elementarySupabaseHomeworkItem"><div><span class="elementaryHomeworkSubject">${esc(subject)}</span><strong>${esc(unit)}</strong><b>${esc(elementaryHomeworkTypeLabel(r.homework_type))}</b></div>${due ? `<time>期限 ${esc(due)}</time>` : ""}</div>`;
  }).join("") : '<div class="emptyState">現在の宿題はありません。</div>';
  lists.forEach((list) => {
    if (list.dataset.elementaryHomeworkSignature === signature) return;
    list.dataset.elementaryHomeworkSignature = signature;
    list.innerHTML = html;
  });
}

let homeworkOnlyEnhancing = false;
async function enhanceElementaryHomeworkOnly() {
  if (homeworkOnlyEnhancing || !document.querySelector(".homeworkList")) return;
  const session = readSession();
  if (!session || !/^小[1-6]$/.test(normalizeGrade(session.grade || ""))) return;
  homeworkOnlyEnhancing = true;
  try {
    const dashboard = lastDashboard || await loadDashboard().catch(() => null);
    const data = await loadElementaryData(false).catch(() => null);
    if (dashboard && data) await replaceElementaryHomework(dashboard, data);
  } finally { homeworkOnlyEnhancing = false; }
}

'''
if anchor not in js:
    raise SystemExit('score anchor not found')
if 'function elementaryHomeworkTypeLabel' not in js:
    js = js.replace(anchor, helper + anchor, 1)

# Add homework replacement to normal elementary refresh paths.
needle = '''    await updateTopCards(dashboard, data);\n    await bindTopTestForm(dashboard);'''
repl = '''    await updateTopCards(dashboard, data);\n    await replaceElementaryHomework(dashboard, data);\n    await bindTopTestForm(dashboard);'''
if needle not in js:
    raise SystemExit('refresh path not found')
js = js.replace(needle, repl, 1)
needle2 = '''    if (data) await updateTopCards(dashboard, data);\n    await bindTopTestForm(dashboard);'''
repl2 = '''    if (data) { await updateTopCards(dashboard, data); await replaceElementaryHomework(dashboard, data); }\n    await bindTopTestForm(dashboard);'''
if needle2 not in js:
    raise SystemExit('enhance path not found')
js = js.replace(needle2, repl2, 1)

# Also enhance the student's dedicated Homework page.
old_obs = '''const observer = new MutationObserver(() => queueMicrotask(enhanceElementary));\nobserver.observe(document.documentElement, { childList: true, subtree: true });\nwindow.addEventListener("DOMContentLoaded", enhanceElementary);\nsetTimeout(enhanceElementary, 500);'''
new_obs = '''const observer = new MutationObserver(() => { queueMicrotask(enhanceElementary); queueMicrotask(enhanceElementaryHomeworkOnly); });\nobserver.observe(document.documentElement, { childList: true, subtree: true });\nwindow.addEventListener("DOMContentLoaded", () => { enhanceElementary(); enhanceElementaryHomeworkOnly(); });\nsetTimeout(() => { enhanceElementary(); enhanceElementaryHomeworkOnly(); }, 500);'''
if old_obs not in js:
    raise SystemExit('observer block not found')
js = js.replace(old_obs, new_obs, 1)

# 3) Student-change button a short distance to the right of the selected names.
style_add = '''\n/* Keep 生徒変更 close to the selected student pills, not at the far edge. */\n.studentTabsBar{justify-content:flex-start!important}\n.studentTabsBar .studentTabs{flex:0 1 auto!important;width:auto!important;max-width:calc(100% - 150px)!important}\n.selectedStudentChangeButton{margin-left:28px!important;flex:0 0 auto!important}\n'''
if 'Keep 生徒変更 close to the selected student pills' not in styles:
    styles += style_add

# 4) Move test-save to the right of the explanatory sentence.
enh_add = '''\n/* Place elementary test Save beside the explanation, above the entry row. */\n@media(min-width:721px){\n  .elementaryTopTestEntry{position:relative!important}\n  .elementaryTopTestForm>.primaryBtn{position:absolute!important;top:48px!important;right:18px!important;min-height:36px!important;padding:8px 16px!important;margin:0!important;z-index:2}\n}\n'''
if 'Place elementary test Save beside the explanation' not in enh:
    enh += enh_add

# Homework card readability.
supa_add = '''\n/* Elementary homework sourced from the elementary progress backend. */\n.elementarySupabaseHomeworkItem{display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid #dbe6e2;border-radius:12px;padding:10px 12px;background:#fbfdfc}\n.elementarySupabaseHomeworkItem>div{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px 12px;align-items:center;min-width:0}\n.elementarySupabaseHomeworkItem strong{font-size:.84rem;min-width:0}.elementarySupabaseHomeworkItem b{color:#0f6655;white-space:nowrap}.elementarySupabaseHomeworkItem time{font-size:.76rem;color:#64746f;white-space:nowrap}\n.elementaryHomeworkSubject{display:inline-flex;border-radius:999px;background:#e8f6f2;color:#136756;padding:3px 7px;font-size:.72rem;font-weight:900}\n@media(max-width:700px){.elementarySupabaseHomeworkItem{align-items:flex-start;flex-direction:column}.elementarySupabaseHomeworkItem>div{grid-template-columns:auto 1fr}.elementarySupabaseHomeworkItem b{grid-column:2;white-space:normal}}\n'''
if 'Elementary homework sourced from the elementary progress backend' not in supacss:
    supacss += supa_add

# Cache bust all changed assets.
idx = re.sub(r'styles\.css\?v=[^"\']+', 'styles.css?v=20260831-savefix-1', idx, count=1)
idx = re.sub(r'elementary-enhancement\.css\?v=[^"\']+', 'elementary-enhancement.css?v=20260831-savefix-1', idx, count=1)
idx = re.sub(r'elementary-supabase\.css\?v=[^"\']+', 'elementary-supabase.css?v=20260831-savefix-1', idx, count=1)
idx = re.sub(r'elementary-supabase\.js\?v=[^"\']+', 'elementary-supabase.js?v=20260831-savefix-1', idx, count=1)

js_path.write_text(js)
styles_path.write_text(styles)
enh_path.write_text(enh)
supacss_path.write_text(supacss)
idx_path.write_text(idx)
