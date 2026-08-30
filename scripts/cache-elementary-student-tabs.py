from pathlib import Path
import re

mod_path=Path('elementary-supabase.js')
idx_path=Path('index.html')
mod=mod_path.read_text()
idx=idx_path.read_text()

anchor='let lastElementaryData = null;'
if anchor not in mod: raise SystemExit('cache anchor missing')
mod=mod.replace(anchor, anchor+'\nconst elementaryDataCache = new Map();', 1)

old='''async function loadElementaryData(force = false) {\n  if (!force && lastElementaryData && String(lastElementaryData.studentId || pageStudentId()) === String(pageStudentId())) return lastElementaryData;\n  const data = await callElementary("get");\n  data.studentId = pageStudentId();\n  lastElementaryData = data;\n  return data;\n}'''
new='''async function loadElementaryData(force = false) {\n  const studentId = String(pageStudentId() || "");\n  if (!studentId) return null;\n  if (!force && elementaryDataCache.has(studentId)) {\n    lastElementaryData = elementaryDataCache.get(studentId);\n    return lastElementaryData;\n  }\n  if (!force && lastElementaryData && String(lastElementaryData.studentId || "") === studentId) return lastElementaryData;\n  const data = await callElementary("get");\n  data.studentId = studentId;\n  lastElementaryData = data;\n  elementaryDataCache.set(studentId, data);\n  return data;\n}'''
if old not in mod: raise SystemExit('loadElementaryData function missing')
mod=mod.replace(old,new,1)

# Ordinary DOM enhancement should use the per-student cache. Explicit refreshes after saves still use force=true.
needle='const data = await loadElementaryData(true).catch((error) => { status(error.message, true); return null; });'
if needle not in mod: raise SystemExit('enhance load anchor missing')
mod=mod.replace(needle,'const data = await loadElementaryData(false).catch((error) => { status(error.message, true); return null; });',1)
mod_path.write_text(mod)

idx=re.sub(r'elementary-supabase\\.js\\?v=[^"\\\']+', 'elementary-supabase.js?v=20260831-tabcache-2', idx, count=1)
idx_path.write_text(idx)
