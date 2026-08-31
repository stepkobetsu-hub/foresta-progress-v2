import fs from 'node:fs';

const path = 'elementary-supabase.js';
let s = fs.readFileSync(path, 'utf8');

const signatureOld = 'async function showInteractiveProgression(subject, forceTeacher = false) {';
const signatureNew = 'async function showInteractiveProgression(subject, forceTeacher = false, dataOverride = null) {';
if (!s.includes(signatureOld)) throw new Error('showInteractiveProgression signature not found');
s = s.replace(signatureOld, signatureNew);

const dataOld = '    const data = await loadElementaryData(true);\n    const summary = summaryFor(normalized, units, data);';
const dataNew = '    const data = dataOverride || await loadElementaryData(true);\n    const summary = summaryFor(normalized, units, data);';
if (!s.includes(dataOld)) throw new Error('progression data load block not found');
s = s.replace(dataOld, dataNew);

const refreshOld = '        await showInteractiveProgression(normalized, teacher);\n        await refreshElementaryScreen(false);';
const refreshNew = '        await updateTopCards(dashboard, result);\n        await replaceElementaryHomework(dashboard, result);\n        await showInteractiveProgression(normalized, teacher, result);';
if (!s.includes(refreshOld)) throw new Error('post-save refetch block not found');
s = s.replace(refreshOld, refreshNew);

if (!s.includes('dataOverride || await loadElementaryData(true)')) throw new Error('data override optimization missing');
if (!s.includes('await showInteractiveProgression(normalized, teacher, result);')) throw new Error('result reuse optimization missing');

fs.writeFileSync(path, s);
