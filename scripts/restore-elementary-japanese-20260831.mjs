import fs from 'node:fs';

const appPath = 'elementary-supabase.js';
let s = fs.readFileSync(appPath, 'utf8');

if (!s.includes('const japaneseProgressionPromises = new Map();')) {
  const marker = 'let progressionPromise = null;\n';
  const addition = `const japaneseProgressionPromises = new Map();\n\nasync function loadJapaneseProgressions(grade) {\n  const normalizedGrade = normalizeGrade(grade);\n  const gradeNo = normalizedGrade.match(/^小([1-6])$/)?.[1] || \"\";\n  if (!gradeNo) return [];\n  if (!japaneseProgressionPromises.has(gradeNo)) {\n    const request = fetch(\`./data/elementary-japanese-mitsumura-\${gradeNo}.json?v=20260831-1\`, { cache: \"no-store\" })\n      .then((r) => {\n        if (!r.ok) throw new Error(\"NEW小学ワーク国語の進行表データを読み込めませんでした。\");\n        return r.json();\n      })\n      .then((data) => Array.isArray(data?.units) ? data.units : []);\n    japaneseProgressionPromises.set(gradeNo, request);\n  }\n  return japaneseProgressionPromises.get(gradeNo);\n}\n`;
  if (!s.includes(marker)) throw new Error('progressionPromise marker not found');
  s = s.replace(marker, marker + addition);
}

const oldUnits = `async function unitsFor(subject, grade, level) {\n  const data = await loadProgressions();\n  const normalized = normalizeSubject(subject);\n  if (normalized === \"算数\") return data.math?.[normalizeGrade(grade)] || [];\n  if (normalized === \"英語\") return data.english?.[englishKey(level)] || [];\n  return [];\n}`;
const newUnits = `async function unitsFor(subject, grade, level) {\n  const normalized = normalizeSubject(subject);\n  if (normalized === \"国語\") return loadJapaneseProgressions(grade);\n  const data = await loadProgressions();\n  if (normalized === \"算数\") return data.math?.[normalizeGrade(grade)] || [];\n  if (normalized === \"英語\") return data.english?.[englishKey(level)] || [];\n  return [];\n}`;
if (s.includes(oldUnits)) s = s.replace(oldUnits, newUnits);
else if (!s.includes('if (normalized === "国語") return loadJapaneseProgressions(grade);')) throw new Error('unitsFor block not found');

const oldSource = 'const source = normalized === "算数" ? "啓林館" : `フォレスタ小学英語 ${englishKey(level) || ""}`.trim();';
const newSource = 'const source = normalized === "算数" ? "啓林館" : normalized === "国語" ? "NEW小学ワーク 光村" : `フォレスタ小学英語 ${englishKey(level) || ""}`.trim();';
if (s.includes(oldSource)) s = s.replace(oldSource, newSource);
else if (!s.includes('normalized === "国語" ? "NEW小学ワーク 光村"')) throw new Error('source label block not found');

fs.writeFileSync(appPath, s);

const indexPath = 'index.html';
let index = fs.readFileSync(indexPath, 'utf8');
index = index.replace(/elementary-supabase\.js\?v=20260831-[^\"']+/g, 'elementary-supabase.js?v=20260831-japanese-1');
fs.writeFileSync(indexPath, index);

const testPath = 'tests/elementary-japanese-progress.test.mjs';
fs.writeFileSync(testPath, `import assert from \"node:assert/strict\";\nimport fs from \"node:fs\";\nconst elem = fs.readFileSync(new URL(\"../elementary-supabase.js\", import.meta.url), \"utf8\");\nfor (let grade = 1; grade <= 6; grade += 1) {\n  const data = JSON.parse(fs.readFileSync(new URL(\`../data/elementary-japanese-mitsumura-\${grade}.json\`, import.meta.url), \"utf8\"));\n  assert.equal(data.grade, \`小\${grade}\`);\n  assert.ok(Array.isArray(data.units) && data.units.length > 0, \`小\${grade}の国語進行表が空です\`);\n}\nconst g5 = JSON.parse(fs.readFileSync(new URL(\"../data/elementary-japanese-mitsumura-5.json\", import.meta.url), \"utf8\"));\nassert.equal(g5.units.length, 39);\nassert.ok(g5.units.some((u) => u.unitName.includes(\"大造じいさんとガン\")));\nassert.match(elem, /normalized === \"国語\"\) return loadJapaneseProgressions\(grade\)/);\nassert.match(elem, /elementary-japanese-mitsumura-/);\nassert.match(elem, /NEW小学ワーク 光村/);\nconsole.log(\"elementary Japanese progression tests: ok\");\n`);

const packagePath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (!pkg.scripts.test.includes('elementary-japanese-progress.test.mjs')) {
  pkg.scripts.test += ' && node tests/elementary-japanese-progress.test.mjs';
}
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
