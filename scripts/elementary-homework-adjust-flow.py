from pathlib import Path
import re

p=Path('elementary-supabase.js')
idxp=Path('index.html')
cssp=Path('elementary-supabase.css')
s=p.read_text()
idx=idxp.read_text()
css=cssp.read_text()

# Add middle-school-like homework confirmation UI before progression renderer.
anchor='async function showInteractiveProgression(subject, forceTeacher = false) {'
helper=r'''
function elementaryHomeworkPresetChoices(subject) {
  const normalized = normalizeSubject(subject);
  if (normalized === "国語") return [{ value: "TODAY_REDO", label: "本日の赤×なおし" }];
  if (normalized === "算数" || normalized === "英語") return [
    { value: "TRY_REDO", label: "TRYの赤×なおし" },
    { value: "EXERCISE", label: "エクササイズ" },
  ];
  return [];
}

function openElementaryHomeworkConfirm({ subject, units, selectedUnitIds, lessonDate, data, teacher }) {
  const normalized = normalizeSubject(subject);
  const presets = elementaryHomeworkPresetChoices(normalized);
  const selectedUnits = (units || []).filter((u) => selectedUnitIds.includes(u.unitId));
  if (!selectedUnits.length) { status("今回進んだ単元を1つ以上選んでください。", true); return; }
  const groups = selectedUnits.map((unit, index) => {
    const rows = (data?.homework || []).filter((r) => String(r.series || "") === `ELEMENTARY:${normalized}` && String(r.unit_id || "") === String(unit.unitId) && String(r.assigned_date || "") === lessonDate);
    const hasExisting = rows.length > 0;
    const checks = presets.map((item) => {
      const checked = hasExisting ? rows.some((r) => String(r.homework_type || "") === item.value) : true;
      return `<label><input class="elementaryHomeworkPreset" type="checkbox" value="${esc(item.value)}" ${checked ? "checked" : ""}><span>${esc(item.label)}</span></label>`;
    }).join("");
    const other = rows.find((r) => String(r.homework_type || "") === "OTHER")?.confirmation_memo || "";
    const unitLabel = [unit.unitNumber, unit.unitName].filter(Boolean).join(" ");
    return `<details class="unitHomeworkGroup elementaryHomeworkConfirmGroup" data-unit="${esc(unit.unitId)}" ${index === 0 ? "open" : ""}><summary><strong>${esc(unitLabel)}</strong><span class="badge">${presets.length}項目</span></summary><div class="compactHomeworkGrid">${checks}</div><input class="field elementaryOtherHomework" maxlength="120" value="${esc(other)}" placeholder="この単元だけのその他の宿題（必要な場合）"></details>`;
  }).join("");
  openModal(`<h2>次回宿題を確認</h2><p>${selectedUnits.length}単元の宿題を、単元ごとに確認できます。<strong>不要な宿題はチェックを外してください。</strong> その他の宿題がある場合だけ自由記述します。</p><div class="unitHomeworkGroups">${groups}</div><output id="elementaryHomeworkConfirmStatus" class="lessonSaveStatus" aria-live="polite"></output><div class="actionRow lessonSaveActions"><button id="elementaryBackToProgress" class="ghostBtn" type="button">単元選択へ戻る</button><button id="elementaryConfirmHomework" class="primaryBtn" type="button">授業と宿題を保存</button></div>`);
  document.getElementById("elementaryBackToProgress").onclick = () => showInteractiveProgression(normalized, teacher);
  document.getElementById("elementaryConfirmHomework").onclick = async () => {
    const button = document.getElementById("elementaryConfirmHomework");
    const output = document.getElementById("elementaryHomeworkConfirmStatus");
    button.disabled = true;
    output.textContent = "保存しています…";
    try {
      let latest = data;
      for (const group of document.querySelectorAll(".elementaryHomeworkConfirmGroup")) {
        const selectedTypes = [...group.querySelectorAll(".elementaryHomeworkPreset:checked")].map((input) => input.value);
        const other = group.querySelector(".elementaryOtherHomework")?.value.trim() || "";
        latest = await callElementary("configureHomework", { subject: normalized, unitId: group.dataset.unit, lessonDate, selectedTypes, other });
      }
      latest.studentId = String(pageStudentId() || "");
      elementaryDataCache.set(latest.studentId, latest);
      lastElementaryData = latest;
      status("授業と宿題を保存しました。");
      await showInteractiveProgression(normalized, teacher);
      await refreshElementaryScreen(false);
    } catch (error) {
      output.textContent = error.message;
      button.disabled = false;
    }
  };
}

'''
if 'function elementaryHomeworkPresetChoices' not in s:
    if anchor not in s: raise SystemExit('progression anchor not found')
    s=s.replace(anchor,helper+anchor,1)

# Add homework-adjust button to interactive progression header.
needle='</div></div><div class="elementaryStaticTableWrap"><table class="elementaryStaticTable interactive">'
replace='</div><div class="elementaryProgressActions"><span>今日の進行を選んだあと、宿題を確認して不要なものを外せます。</span><button id="elementaryAdjustHomework" class="primaryBtn" type="button">次回宿題を確認・調整</button></div></div><div class="elementaryStaticTableWrap"><table class="elementaryStaticTable interactive">'
if needle not in s: raise SystemExit('progress header needle not found')
s=s.replace(needle,replace,1)

# When today's progress is unchecked, remove same-day auto homework too. Keep immediate progress save reliable.
old=r'''        const result = await callElementary("toggleLesson", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, checked: input.checked });
        elementaryDataCache.set(String(pageStudentId() || ""), result);
        if (input.checked) {
          const count = Number(result?.homeworkCreated || 0);
          status(count > 0 ? `今日の進行を保存し、宿題 ${count}件を作成しました。` : "今日の進行を保存しました。宿題は作成済みです。");
        } else {
          status("今日の進行を取り消しました。作成済みの宿題は残しています。");
        }'''
new=r'''        let result = await callElementary("toggleLesson", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, checked: input.checked });
        if (!input.checked) {
          result = await callElementary("configureHomework", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, selectedTypes: [], other: "" });
          status("今日の進行を取り消しました。関連する本日の宿題も取り消しました。");
        } else {
          status("今日の進行を保存しました。必要なら『次回宿題を確認・調整』で宿題を減らしたり追加できます。");
        }
        result.studentId = String(pageStudentId() || "");
        elementaryDataCache.set(result.studentId, result);
        lastElementaryData = result;'''
if old not in s: raise SystemExit('today status block not found')
s=s.replace(old,new,1)

# Bind adjustment button using currently checked today units and fresh homework state.
needle2='''    const body = document.getElementById("modalBody");
    body.querySelectorAll('[data-action="today"]').forEach((input) => input.onchange = async () => {'''
repl2='''    const body = document.getElementById("modalBody");
    const adjustHomeworkButton = document.getElementById("elementaryAdjustHomework");
    if (adjustHomeworkButton) adjustHomeworkButton.onclick = async () => {
      const selectedUnitIds = [...body.querySelectorAll('[data-action="today"]:checked')].map((input) => input.dataset.unit);
      if (!selectedUnitIds.length) { status("今回進んだ単元を1つ以上選んでください。", true); return; }
      adjustHomeworkButton.disabled = true;
      try {
        const fresh = await loadElementaryData(true);
        openElementaryHomeworkConfirm({ subject: normalized, units, selectedUnitIds, lessonDate: today, data: fresh, teacher });
      } catch (error) { status(error.message, true); adjustHomeworkButton.disabled = false; }
    };
    body.querySelectorAll('[data-action="today"]').forEach((input) => input.onchange = async () => {'''
if needle2 not in s: raise SystemExit('body handler anchor not found')
s=s.replace(needle2,repl2,1)

# Small styling, reusing middle-school homework group classes.
cssadd='''\n/* Elementary lesson save: mirror middle-school homework confirmation flow. */\n.elementaryProgressActions{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin:10px 0 12px;flex-wrap:wrap}\n.elementaryProgressActions span{font-size:.78rem;color:#667873}\n.elementaryProgressActions .primaryBtn{padding:9px 14px}\n.elementaryHomeworkConfirmGroup .compactHomeworkGrid{margin:10px 0}\n.elementaryHomeworkConfirmGroup .elementaryOtherHomework{width:100%;margin-top:8px}\n'''
if 'Elementary lesson save: mirror middle-school homework confirmation flow' not in css: css += cssadd

idx=re.sub(r'elementary-supabase\.js\?v=[^"\']+','elementary-supabase.js?v=20260831-homework-adjust-1',idx,count=1)
idx=re.sub(r'elementary-supabase\.css\?v=[^"\']+','elementary-supabase.css?v=20260831-homework-adjust-1',idx,count=1)

p.write_text(s); idxp.write_text(idx); cssp.write_text(css)
