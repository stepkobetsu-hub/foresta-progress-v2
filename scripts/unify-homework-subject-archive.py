from pathlib import Path
import re

app_path=Path('app.js')
elm_path=Path('elementary-supabase.js')
idx_path=Path('index.html')
css_path=Path('elementary-supabase.css')
app=app_path.read_text(); elm=elm_path.read_text(); idx=idx_path.read_text(); css=css_path.read_text()

def replace_function(src,name,new):
    m=re.search(r'(?:async\s+)?function\s+'+re.escape(name)+r'\s*\(',src)
    if not m: raise SystemExit(f'function not found: {name}')
    start=m.start(); brace=src.find('{',m.end()); depth=0; quote=None; esc=False; i=brace
    while i<len(src):
        c=src[i]
        if quote:
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==quote: quote=None
        else:
            if c in ('"',"'",'`'): quote=c
            elif c=='{': depth+=1
            elif c=='}':
                depth-=1
                if depth==0:
                    return src[:start]+new+src[i+1:]
        i+=1
    raise SystemExit(f'unclosed function: {name}')

# Middle-school and shared homework: newest lesson/homework group first.
new_groups=r'''function homeworkGroups(items) {
  const groups = new Map();
  (items || []).forEach((item) => {
    const key = [item.lessonId || "", item.unitId || "", item.recommendedDueDate || "", item.source || "teacher"].join("|");
    if (!groups.has(key)) groups.set(key, {
      items: [],
      subject: item.subject || "",
      unitNumber: item.unitNumber || "",
      unitName: item.unitName || "",
      roundNumber: item.roundNumber || "",
      createdAt: item.createdAt || "",
      due: item.recommendedDueDate || "",
      source: item.source || "teacher",
      sourceLabel: item.sourceLabel || (item.source === "self" ? "自主学習" : "講師からの宿題"),
    });
    groups.get(key).items.push(item);
  });
  return [...groups.values()].sort((a, b) => {
    const ac = new Date(a.createdAt || a.due || 0).getTime() || 0;
    const bc = new Date(b.createdAt || b.due || 0).getTime() || 0;
    return bc - ac;
  });
}'''
app=replace_function(app,'homeworkGroups',new_groups)

# Teacher sees homework only for the currently selected lesson subject. Student view remains all subjects.
filter_helper=r'''
let teacherHomeworkSubjectMemory = "";
function homeworkSubjectKey(value) {
  const s = String(value || "").trim();
  return s === "数学" || s === "算数" ? "MATH" : s;
}
function currentTeacherHomeworkSubject() {
  if (state.role !== "teacher") return "";
  const subjectValues = new Set(["国語","数学","算数","英語","理科","社会"]);
  const selects = [...document.querySelectorAll("select")].filter((select) => subjectValues.has(String(select.value || "").trim()));
  const preferred = selects.find((select) => /subject|kamoku|科目/i.test(`${select.id} ${select.name} ${select.className}`)) || selects[0];
  if (preferred?.value) teacherHomeworkSubjectMemory = String(preferred.value).trim();
  return teacherHomeworkSubjectMemory;
}
function applyTeacherHomeworkSubjectFilter() {
  if (state.role !== "teacher") return;
  const selected = currentTeacherHomeworkSubject();
  if (!selected) return;
  const wanted = homeworkSubjectKey(selected);
  document.querySelectorAll(".teacherHomeworkCard,.archivedHomeworkCard").forEach((card) => {
    const pill = card.querySelector(".subjectPill")?.textContent || "";
    card.classList.toggle("hidden", homeworkSubjectKey(pill) !== wanted);
  });
}
document.addEventListener("change", (event) => {
  if (state.role !== "teacher" || event.target?.tagName !== "SELECT") return;
  const value = String(event.target.value || "").trim();
  if (!["国語","数学","算数","英語","理科","社会"].includes(value)) return;
  teacherHomeworkSubjectMemory = value;
  queueMicrotask(applyTeacherHomeworkSubjectFilter);
});
const teacherHomeworkFilterObserver = new MutationObserver(() => queueMicrotask(applyTeacherHomeworkSubjectFilter));
teacherHomeworkFilterObserver.observe(document.documentElement, { childList: true, subtree: true });
'''
if 'let teacherHomeworkSubjectMemory' not in app:
    anchor='function renderShell() {'
    if anchor not in app: raise SystemExit('renderShell anchor missing')
    app=app.replace(anchor,filter_helper+'\n'+anchor,1)

# Elementary homework grouping: newest at top.
new_elm_groups=r'''function elementaryHomeworkGroups(rows, unitMap) {
  const groups = new Map();
  const sorted = [...(rows || [])].sort((a, b) => {
    const ad = String(a.assigned_date || "");
    const bd = String(b.assigned_date || "");
    if (ad !== bd) return bd.localeCompare(ad);
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
  for (const row of sorted) {
    const subject = String(row.series || "").replace(/^ELEMENTARY:/, "");
    const custom = String(row.homework_type || "") === "OTHER";
    const meta = unitMap.get(row.unit_id) || {};
    const key = custom ? `custom|${row.homework_id}` : `${subject}|${row.assigned_date || ""}|${row.unit_id || ""}`;
    if (!groups.has(key)) groups.set(key, {
      subject,
      unitNumber: custom ? "" : (meta.unitNumber || ""),
      unitName: custom ? "その他の宿題" : (meta.unitName || row.unit_id || "宿題"),
      assignedDate: row.assigned_date || "",
      dueDate: row.due_date || "",
      createdAt: row.created_at || "",
      items: [],
    });
    groups.get(key).items.push(row);
  }
  return [...groups.values()].sort((a,b) => String(b.assignedDate || b.createdAt || "").localeCompare(String(a.assignedDate || a.createdAt || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}'''
elm=replace_function(elm,'elementaryHomeworkGroups',new_elm_groups)

new_elm_cards=r'''function elementaryHomeworkCards(groups, teacherMode) {
  if (!groups.length) return '<div class="emptyState">現在の宿題はありません。</div>';
  return groups.map((group) => {
    const complete = group.items.length > 0 && group.items.every((row) => elementaryTeacherChecked(row));
    const ids = group.items.map((row) => row.homework_id).filter(Boolean).join(",");
    const archiveButton = `<button class="homeworkArchiveX elementaryHomeworkArchiveX ${complete ? "" : "hidden"}" type="button" data-ids="${esc(ids)}" title="この宿題をアーカイブ" aria-label="この宿題をアーカイブ">×</button>`;
    const tasks = group.items.map((row) => {
      const title = elementaryHomeworkTypeLabel(row);
      const studentChecked = elementaryStudentChecked(row);
      const teacherChecked = elementaryTeacherChecked(row);
      if (teacherMode) {
        return `<label class="studentHomeworkTask teacherAssignedTask ${teacherChecked ? "confirmed" : ""}"><span class="studentHomeworkTaskLabel"><strong>${esc(title)}</strong><small class="teacherStudentState">生徒：${studentChecked ? "チェック済み" : "未チェック"}</small></span><span class="studentTaskRight"><span class="studentTaskAction"><input class="elementaryTeacherHomeworkCheck" type="checkbox" data-id="${esc(row.homework_id)}" ${teacherChecked ? "checked" : ""}><b>${teacherChecked ? "講師確認済み" : "講師チェック"}</b></span><small class="homeworkSaveState">${teacherChecked ? "完了" : "講師確認で完了"}</small></span></label>`;
      }
      const disabled = teacherChecked;
      let saveText = "自動保存";
      if (teacherChecked) saveText = "講師確認済み";
      else if (studentChecked) saveText = "講師確認待ち";
      return `<label class="studentHomeworkTask ${teacherChecked ? "confirmed" : ""}" title="${esc(title)}"><span class="studentHomeworkTaskLabel"><strong>${esc(title)}</strong></span><span class="studentTaskRight"><span class="studentTaskAction"><input class="elementaryStudentHomeworkCheck" type="checkbox" data-id="${esc(row.homework_id)}" ${studentChecked ? "checked" : ""} ${disabled ? "disabled" : ""}><b>${disabled ? "確認済み" : "チェック"}</b></span><small class="homeworkSaveState">${esc(saveText)}</small></span></label>`;
    }).join("");
    const unit = [group.unitNumber, group.unitName].filter(Boolean).join(" ") || "宿題";
    return `<article class="studentHomeworkCard ${teacherMode ? "teacherHomeworkCard" : ""} ${group.subject === "算数" ? "math" : group.subject === "国語" ? "japanese" : group.subject === "英語" ? "english" : "other"}">${archiveButton}<div class="studentHomeworkMeta"><div><span class="subjectPill">${esc(group.subject || "宿題")}</span><span class="roundPill">授業宿題</span></div><strong>${esc(unit)}</strong><small>宿題 ${esc(shortDate(group.assignedDate))}　期限 ${esc(shortDate(group.dueDate))}</small><small class="homeworkCompletionRule">講師からの宿題：講師チェックで完了</small></div><div class="studentHomeworkTasks ${teacherMode ? "teacherHomeworkTasks" : ""}">${tasks}</div></article>`;
  }).join("");
}'''
elm=replace_function(elm,'elementaryHomeworkCards',new_elm_cards)

# Elementary archive/restore flow, reusing the existing Archive buttons.
archive_helpers=r'''
function currentElementaryTeacherHomeworkSubject() {
  if (!isTeacherContext(readSession())) return "";
  const values = new Set(["算数","数学","国語","英語","理科","社会"]);
  const selects = [...document.querySelectorAll("select")].filter((select) => values.has(String(select.value || "").trim()));
  const preferred = selects.find((select) => /subject|kamoku|科目/i.test(`${select.id} ${select.name} ${select.className}`)) || selects[0];
  return normalizeSubject(preferred?.value || "");
}
function elementaryArchiveCards(groups) {
  if (!groups.length) return '<div class="emptyState">アーカイブされた宿題はありません。</div>';
  return groups.map((group) => {
    const ids = group.items.map((row) => row.homework_id).filter(Boolean).join(",");
    const tasks = group.items.map((row) => `<div class="archivedHomeworkTask"><strong>${esc(elementaryHomeworkTypeLabel(row))}</strong><small>${elementaryTeacherChecked(row) ? "講師確認済み" : "未完了"}</small></div>`).join("");
    const unit = [group.unitNumber, group.unitName].filter(Boolean).join(" ") || "宿題";
    return `<article class="studentHomeworkCard archivedHomeworkCard ${group.subject === "算数" ? "math" : group.subject === "国語" ? "japanese" : group.subject === "英語" ? "english" : "other"}"><div class="studentHomeworkMeta"><div><span class="subjectPill">${esc(group.subject || "宿題")}</span></div><strong>${esc(unit)}</strong><small>宿題 ${esc(shortDate(group.assignedDate))}　期限 ${esc(shortDate(group.dueDate))}</small></div><div class="archivedHomeworkBody"><div class="archivedHomeworkTasks">${tasks}</div><div class="archiveActions"><button class="elementaryRestoreHomeworkGroup secondaryBtn" type="button" data-ids="${esc(ids)}">再表示</button></div></div></article>`;
  }).join("");
}
async function showElementaryHomeworkArchive(dashboard) {
  try {
    const data = await callElementary("getHomeworkArchive");
    const unitMap = await elementaryHomeworkUnitMap(dashboard);
    let rows = data?.homework || [];
    const selectedSubject = currentElementaryTeacherHomeworkSubject();
    if (selectedSubject) rows = rows.filter((row) => normalizeSubject(String(row.series || "").replace(/^ELEMENTARY:/, "")) === selectedSubject);
    const groups = elementaryHomeworkGroups(rows, unitMap);
    openModal(`<h2>宿題アーカイブ</h2><p>${selectedSubject ? `${esc(selectedSubject)}の` : ""}完了した宿題を保管しています。再表示すると通常の宿題一覧へ戻ります。</p><div class="homeworkList archiveHomeworkList">${elementaryArchiveCards(groups)}</div>`);
    document.querySelectorAll('.elementaryRestoreHomeworkGroup').forEach((button) => button.onclick = async () => {
      const ids = String(button.dataset.ids || "").split(",").filter(Boolean);
      button.disabled = true;
      try {
        await callElementary("restoreHomework", { homeworkIds: ids });
        await loadElementaryData(true);
        await showElementaryHomeworkArchive(dashboard);
      } catch (error) { button.disabled = false; status(error.message, true); }
    });
  } catch (error) { status(error.message, true); }
}
function bindElementaryArchiveActions(dashboard) {
  document.querySelectorAll('.elementaryHomeworkArchiveX').forEach((button) => button.onclick = async () => {
    const ids = String(button.dataset.ids || "").split(",").filter(Boolean);
    if (!ids.length || !confirm("この宿題をアーカイブしますか？")) return;
    button.disabled = true;
    try {
      const result = await callElementary("archiveHomework", { homeworkIds: ids });
      result.studentId = String(pageStudentId() || "");
      elementaryDataCache.set(result.studentId, result);
      lastElementaryData = result;
      await replaceElementaryHomework(dashboard, result);
      status("宿題をアーカイブしました。");
    } catch (error) { button.disabled = false; status(error.message, true); }
  });
  const archiveButtons = [...document.querySelectorAll('button')].filter((button) => button.textContent.trim() === 'アーカイブ' && (button.closest('.card')?.querySelector('.homeworkList') || /^open.*HomeworkArchive/i.test(button.id || '')));
  archiveButtons.forEach((button) => { button.onclick = (event) => { event.preventDefault(); showElementaryHomeworkArchive(dashboard); }; });
}
'''
if 'function elementaryArchiveCards' not in elm:
    anchor='async function replaceElementaryHomework(dashboard, data) {'
    if anchor not in elm: raise SystemExit('replaceElementaryHomework anchor missing')
    elm=elm.replace(anchor,archive_helpers+'\n'+anchor,1)

new_replace=r'''async function replaceElementaryHomework(dashboard, data) {
  const lists = [...document.querySelectorAll(".homeworkList")];
  if (!lists.length) return;
  const rows = (data?.homework || []).filter((r) => String(r.series || "").startsWith("ELEMENTARY:"));
  const signature = rows.map((r) => [r.homework_id, r.updated_at, r.student_status, r.teacher_status, r.archived_at].join("|")).join(";") || "empty";
  const unitMap = await elementaryHomeworkUnitMap(dashboard);
  const teacherMode = isTeacherContext(readSession());
  const groups = elementaryHomeworkGroups(rows, unitMap);
  const html = elementaryHomeworkCards(groups, teacherMode);
  lists.forEach((list) => {
    if (list.dataset.elementaryHomeworkSignature === signature) return;
    list.dataset.elementaryHomeworkSignature = signature;
    list.innerHTML = html;
  });
  await bindElementaryHomeworkChecks(dashboard);
  bindElementaryArchiveActions(dashboard);
  ensureElementaryCustomHomeworkForm(dashboard);
}'''
elm=replace_function(elm,'replaceElementaryHomework',new_replace)

# CSS: X uses the same upper-right position as middle-school; archived cards remain readable.
css_add='''\n/* Unified homework archive behaviour for elementary school. */\n.elementaryHomeworkArchiveX{z-index:3}\n.archiveHomeworkList .archivedHomeworkCard{position:relative}\n'''
if 'Unified homework archive behaviour for elementary school' not in css: css += css_add

idx=re.sub(r'app\.js\?v=[^"\']+', 'app.js?v=20260831-homework-unified-1', idx, count=1)
idx=re.sub(r'elementary-supabase\.js\?v=[^"\']+', 'elementary-supabase.js?v=20260831-homework-unified-1', idx, count=1)
idx=re.sub(r'elementary-supabase\.css\?v=[^"\']+', 'elementary-supabase.css?v=20260831-homework-unified-1', idx, count=1)

app_path.write_text(app); elm_path.write_text(elm); idx_path.write_text(idx); css_path.write_text(css)
