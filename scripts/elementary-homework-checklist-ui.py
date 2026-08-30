from pathlib import Path
import re

js_path = Path('elementary-supabase.js')
css_path = Path('elementary-supabase.css')
idx_path = Path('index.html')
js = js_path.read_text()
css = css_path.read_text()
idx = idx_path.read_text()

start = js.index('function elementaryHomeworkTypeLabel')
end = js.index('let homeworkOnlyEnhancing', start)
new_block = r'''function elementaryHomeworkTypeLabel(row) {
  const type = String(row?.homework_type || "");
  if (type === "OTHER") return String(row?.confirmation_memo || "その他の宿題");
  return ({ TRY_REDO: "TRYの赤×なおし", EXERCISE: "エクササイズ", TODAY_REDO: "本日の赤×なおし" })[type] || type || "宿題";
}

async function elementaryHomeworkUnitMap(dashboard) {
  const map = new Map();
  for (const subject of CORE) {
    const units = await unitsFor(subject, dashboard?.student?.grade, dashboard?.student?.englishLevel).catch(() => []);
    units.forEach((u) => map.set(u.unitId, { subject, unitNumber: u.unitNumber || "", unitName: u.unitName || "" }));
  }
  return map;
}

function elementaryStudentChecked(row) { return String(row?.student_status || "") === "COMPLETED"; }
function elementaryTeacherChecked(row) { return String(row?.teacher_status || "") === "CONFIRMED"; }

function elementaryHomeworkGroups(rows, unitMap) {
  const groups = new Map();
  for (const row of rows) {
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
      items: [],
    });
    groups.get(key).items.push(row);
  }
  return [...groups.values()];
}

function elementaryHomeworkCards(groups, teacherMode) {
  if (!groups.length) return '<div class="emptyState">現在の宿題はありません。</div>';
  return groups.map((group) => {
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
    return `<article class="studentHomeworkCard ${teacherMode ? "teacherHomeworkCard" : ""} ${group.subject === "算数" ? "math" : group.subject === "国語" ? "japanese" : group.subject === "英語" ? "english" : "other"}"><div class="studentHomeworkMeta"><div><span class="subjectPill">${esc(group.subject || "宿題")}</span><span class="roundPill">授業宿題</span></div><strong>${esc(unit)}</strong><small>宿題 ${esc(shortDate(group.assignedDate))}　期限 ${esc(shortDate(group.dueDate))}</small><small class="homeworkCompletionRule">講師からの宿題：講師チェックで完了</small></div><div class="studentHomeworkTasks ${teacherMode ? "teacherHomeworkTasks" : ""}">${tasks}</div></article>`;
  }).join("");
}

async function bindElementaryHomeworkChecks(dashboard) {
  document.querySelectorAll('.elementaryStudentHomeworkCheck').forEach((input) => {
    input.onchange = async () => {
      const checked = input.checked;
      input.disabled = true;
      try {
        const result = await callElementary('studentCheckHomework', { homeworkId: input.dataset.id, checked });
        result.studentId = String(pageStudentId() || "");
        elementaryDataCache.set(result.studentId, result);
        lastElementaryData = result;
        status(checked ? '宿題をチェックしました。' : '宿題のチェックを外しました。');
        await replaceElementaryHomework(dashboard, result);
      } catch (error) {
        input.checked = !checked;
        input.disabled = false;
        status(error.message, true);
      }
    };
  });
  document.querySelectorAll('.elementaryTeacherHomeworkCheck').forEach((input) => {
    input.onchange = async () => {
      const checked = input.checked;
      input.disabled = true;
      try {
        const result = await callElementary('teacherCheckHomework', { homeworkId: input.dataset.id, checked });
        result.studentId = String(pageStudentId() || "");
        elementaryDataCache.set(result.studentId, result);
        lastElementaryData = result;
        status(checked ? '宿題を講師確認済みにしました。' : '講師確認を取り消しました。');
        await replaceElementaryHomework(dashboard, result);
      } catch (error) {
        input.checked = !checked;
        input.disabled = false;
        status(error.message, true);
      }
    };
  });
}

function ensureElementaryCustomHomeworkForm(dashboard) {
  if (!isTeacherContext(readSession())) return;
  const list = [...document.querySelectorAll('.homeworkList')].find((node) => node.closest('.card')?.querySelector('.cardTitle')?.textContent.includes('宿題'));
  if (!list || list.parentElement.querySelector('.elementaryCustomHomeworkForm')) return;
  const subjects = enrolledSubjects(dashboard);
  list.insertAdjacentHTML('beforebegin', `<form class="elementaryCustomHomeworkForm"><label>科目<select class="field elementaryCustomHomeworkSubject">${subjects.map((s) => `<option>${esc(s)}</option>`).join('')}</select></label><label class="elementaryCustomHomeworkText">その他の宿題（任意）<input class="field" maxlength="120" placeholder="例：漢字ドリル p.20〜21"></label><button class="ghostBtn" type="submit">追加</button><small>必要なときだけ入力します。</small></form>`);
  const form = list.parentElement.querySelector('.elementaryCustomHomeworkForm');
  form.onsubmit = async (event) => {
    event.preventDefault();
    const input = form.querySelector('.elementaryCustomHomeworkText input');
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await callElementary('addCustomHomework', { subject: form.querySelector('.elementaryCustomHomeworkSubject').value, customText: text, assignedDate: todayJst() });
      result.studentId = String(pageStudentId() || "");
      elementaryDataCache.set(result.studentId, result);
      lastElementaryData = result;
      input.value = '';
      status('その他の宿題を追加しました。');
      await replaceElementaryHomework(dashboard, result);
    } catch (error) {
      status(error.message, true);
      button.disabled = false;
    }
  };
}

async function replaceElementaryHomework(dashboard, data) {
  const lists = [...document.querySelectorAll('.homeworkList')];
  if (!lists.length) return;
  const rows = (data?.homework || []).filter((r) => String(r.series || '').startsWith('ELEMENTARY:'));
  const unitMap = await elementaryHomeworkUnitMap(dashboard);
  const groups = elementaryHomeworkGroups(rows, unitMap);
  const teacherMode = isTeacherContext(readSession());
  const html = elementaryHomeworkCards(groups, teacherMode);
  const signature = rows.map((r) => [r.homework_id, r.updated_at, r.student_status, r.teacher_status, r.confirmation_memo].join('|')).join(';') || 'empty';
  lists.forEach((list) => {
    if (list.dataset.elementaryHomeworkSignature !== signature || list.dataset.elementaryHomeworkMode !== String(teacherMode)) {
      list.dataset.elementaryHomeworkSignature = signature;
      list.dataset.elementaryHomeworkMode = String(teacherMode);
      list.innerHTML = html;
    }
  });
  const completed = rows.filter(elementaryTeacherChecked).length;
  if (teacherMode) {
    const list = lists[0];
    const card = list?.closest('.card');
    const summary = card?.querySelector('p.muted');
    if (summary && /完了/.test(summary.textContent)) summary.textContent = `完了 ${completed}/${rows.length}`;
    ensureElementaryCustomHomeworkForm(dashboard);
  } else if (document.querySelector('.pageHead h1')?.textContent.includes('次回までの宿題')) {
    const values = [...document.querySelectorAll('.bigValue')];
    if (values[0]) values[0].textContent = `${completed}/${rows.length}`;
    if (values[1]) values[1].textContent = `${rows.length - completed}/${rows.length}`;
  }
  await bindElementaryHomeworkChecks(dashboard);
}

'''
js = js[:start] + new_block + js[end:]

css_add = r'''
/* Elementary homework uses the same checklist/card language as middle school. */
.elementaryCustomHomeworkForm{display:grid;grid-template-columns:110px minmax(240px,1fr) auto;gap:10px;align-items:end;padding:12px;margin:0 0 12px;border:1px dashed #cddbd7;border-radius:12px;background:#f8fbfa}
.elementaryCustomHomeworkForm label{display:grid;gap:5px;font-size:.76rem;font-weight:800;color:#52645f}.elementaryCustomHomeworkForm small{grid-column:1/-1;color:#7a8a86;font-size:.72rem;margin-top:-4px}.elementaryCustomHomeworkForm .ghostBtn{min-height:42px;white-space:nowrap}
@media(max-width:720px){.elementaryCustomHomeworkForm{grid-template-columns:1fr}.elementaryCustomHomeworkForm small{grid-column:auto}}
'''
if 'Elementary homework uses the same checklist/card language as middle school.' not in css:
    css += css_add

idx = re.sub(r'elementary-supabase\.js\?v=[^"\']+', 'elementary-supabase.js?v=20260831-homework-checklist-1', idx, count=1)
idx = re.sub(r'elementary-supabase\.css\?v=[^"\']+', 'elementary-supabase.css?v=20260831-homework-checklist-1', idx, count=1)
js_path.write_text(js)
css_path.write_text(css)
idx_path.write_text(idx)
