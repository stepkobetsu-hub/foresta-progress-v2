import fs from 'node:fs';

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Patch point not found: ${label}`);
  return text.replace(from, to);
}

let app = fs.readFileSync('app.js', 'utf8');
let index = fs.readFileSync('index.html', 'utf8');

if (!app.includes('id="saveRangeClose"')) {
  app = replaceOnce(
    app,
    ': \'<span class="toolbarHint">チェック変更は自動保存されます。</span><span id="rangeAutoSave" class="rangeAutoSave">すべて保存済み</span><button id="saveRange" class="ghostBtn compactManualSave" type="button">今すぐ保存</button>\';',
    ': \'<span class="toolbarHint">チェック変更は自動保存されます。</span><span id="rangeAutoSave" class="rangeAutoSave">すべて保存済み</span><button id="saveRange" class="ghostBtn compactManualSave" type="button">今すぐ保存</button><button id="saveRangeClose" class="primaryBtn compactManualSave" type="button">保存して閉じる</button>\';',
    'range toolbar save-and-close button',
  );

  app = replaceOnce(
    app,
    '    const saveRangeSelection = async () => {\n      if (!rangeMode) return;',
    '    const saveRangeSelection = async () => {\n      if (!rangeMode) return true;',
    'range save return start',
  );

  app = replaceOnce(
    app,
    '        if (rangeStatus()) rangeStatus().textContent = "自動保存済み";\n      } catch (error) {',
    '        if (rangeStatus()) rangeStatus().textContent = "自動保存済み";\n        return true;\n      } catch (error) {',
    'range save success return',
  );

  app = replaceOnce(
    app,
    '        if (rangeStatus()) rangeStatus().textContent = "保存失敗・再試行してください";\n        status(error.message, true);\n      } finally {',
    '        if (rangeStatus()) rangeStatus().textContent = "保存失敗・再試行してください";\n        status(error.message, true);\n        return false;\n      } finally {',
    'range save failure return',
  );

  app = replaceOnce(
    app,
    '    if ($("saveRange")) $("saveRange").onclick = () => saveRangeSelection();',
    `    if ($("saveRange")) $("saveRange").onclick = () => saveRangeSelection();\n    if ($("saveRangeClose")) $("saveRangeClose").onclick = async () => {\n      const button = $("saveRangeClose");\n      button.disabled = true;\n      button.textContent = "保存して閉じています…";\n      clearTimeout(rangeSaveTimer);\n      rangeDirty = false;\n      checks.forEach((check) => { check.disabled = true; });\n      groupToggles.forEach((toggle) => { toggle.disabled = true; });\n      if (rangeStatus()) rangeStatus().textContent = "保存して閉じています…";\n      while (rangeSaving) await new Promise((resolve) => setTimeout(resolve, 40));\n      const saved = await saveRangeSelection();\n      if (saved) {\n        closeModal();\n        return;\n      }\n      checks.forEach((check) => { check.disabled = false; });\n      groupToggles.forEach((toggle) => { toggle.disabled = false; });\n      button.disabled = false;\n      button.textContent = "保存して閉じる";\n    };`,
    'save and close binding',
  );
}

index = index
  .replace(/styles\.css\?v=[^\"]+/u, 'styles.css?v=20260823-save-close')
  .replace(/app\.js\?v=[^\"]+/u, 'app.js?v=20260823-save-close');

if (!app.includes('id="saveRangeClose"')) throw new Error('saveRangeClose button missing');
if (!app.includes('button.textContent = "保存して閉じています…"')) throw new Error('save-and-close wait state missing');
if (!app.includes('while (rangeSaving)')) throw new Error('save-and-close does not wait for in-flight save');
if (!app.includes('const saved = await saveRangeSelection()')) throw new Error('save-and-close final save missing');

fs.writeFileSync('app.js', app);
fs.writeFileSync('index.html', index);
console.log('Applied save-and-close button to all range progression tables.');
