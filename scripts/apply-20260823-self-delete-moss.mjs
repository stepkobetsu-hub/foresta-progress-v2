import fs from 'node:fs';

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Patch point not found: ${label}`);
  return text.replace(from, to);
}

let gas = fs.readFileSync('apps-script/Code.gs', 'utf8');
let app = fs.readFileSync('app.js', 'utf8');
let styles = fs.readFileSync('styles.css', 'utf8');
let index = fs.readFileSync('index.html', 'utf8');
let deploy = fs.readFileSync('deploy-apps-script.html', 'utf8');

gas = replaceOnce(gas, "version: '2.3.0'", "version: '2.3.1'", 'GAS version');

const oldDelete = `function deleteHomework_(data) {
  const context = homeworkMutationContext_(data, ['teacher'], true);
  const ids = new Set(context.ids);
  replaceRows_('宿題の生徒チェック', function(row) { return ids.has(text_(row['宿題ID'])); }, []);
  replaceRows_('宿題の講師チェック', function(row) { return ids.has(text_(row['宿題ID'])); }, []);
  replaceRows_('宿題', function(row) { return ids.has(text_(row['宿題ID'])); }, []);
  audit_(context.session, '宿題完全削除', '宿題', context.ids.join(','), '成功', context.student.name);
  return { deleted: context.ids.length };
}`;

const newDelete = `function deleteHomework_(data) {
  const context = homeworkMutationContext_(data, ['teacher','student'], true);
  if (context.session.role === 'student') {
    const selfEvents = new Set(studentRoundRows_(context.studentId, '').map(function(row) { return text_(row['イベントID']); }).filter(Boolean));
    const allSelfStudy = context.rows.every(function(row) { return selfEvents.has(text_(row['授業ID'])); });
    if (!allSelfStudy) throw new Error('FORBIDDEN');
  }
  const ids = new Set(context.ids);
  replaceRows_('宿題の生徒チェック', function(row) { return ids.has(text_(row['宿題ID'])); }, []);
  replaceRows_('宿題の講師チェック', function(row) { return ids.has(text_(row['宿題ID'])); }, []);
  replaceRows_('宿題', function(row) { return ids.has(text_(row['宿題ID'])); }, []);
  audit_(context.session, '宿題完全削除', '宿題', context.ids.join(','), '成功', context.student.name + (context.session.role === 'student' ? ' / 自主学習' : ''));
  return { deleted: context.ids.length };
}`;
gas = replaceOnce(gas, oldDelete, newDelete, 'student self-study delete authorization');

app = replaceOnce(
  app,
  '${mode === "teacher" ? `<button class="deleteHomeworkGroup dangerOutlineBtn" type="button" data-ids="${esc(ids)}">完全削除</button>` : ""}',
  '${mode === "teacher" || (mode === "student" && group.source === "self") ? `<button class="deleteHomeworkGroup dangerOutlineBtn" type="button" data-ids="${esc(ids)}">完全削除</button>` : ""}',
  'archive delete button visibility',
);

app = replaceOnce(
  app,
  '<p class="archiveNote">復元できます。完全削除は講師画面から行います。</p>',
  '<p class="archiveNote">自主学習で出た宿題は自分で完全削除できます。講師から出た宿題の完全削除は講師画面から行います。</p>',
  'archive note',
);

styles = replaceOnce(
  styles,
  '.studentFiveSubjectGraph{background:radial-gradient(circle at 88% 10%,rgba(255,255,255,.12),transparent 30%),linear-gradient(135deg,#4f2d62 0%,#353765 52%,#28455d 100%);box-shadow:0 15px 34px rgba(61,46,92,.22)}',
  '.studentFiveSubjectGraph{background:radial-gradient(circle at 88% 10%,rgba(255,255,255,.11),transparent 30%),linear-gradient(135deg,#42583d 0%,#344b35 52%,#273d31 100%);box-shadow:0 15px 34px rgba(45,67,48,.24)}',
  'moss green graph background',
);
styles = styles.replace('.studentFiveSubjectGraph .roundProgressGuide{color:#f0e9f7}', '.studentFiveSubjectGraph .roundProgressGuide{color:#e8f0e4}')
  .replace('.studentFiveSubjectGraph .subjectRoundBar.unconfigured strong{font-size:.64rem;color:#eadff1}', '.studentFiveSubjectGraph .subjectRoundBar.unconfigured strong{font-size:.64rem;color:#dbe7d7}');

index = index
  .replace(/styles\.css\?v=[^"]+/u, 'styles.css?v=20260823-moss-self-delete')
  .replace(/app\.js\?v=[^"]+/u, 'app.js?v=20260823-moss-self-delete');

deploy = deploy
  .replace(/フォレスタ進捗管理 v2\.3/g, 'フォレスタ進捗管理 v2.3.1')
  .replace(/version==='2\.3\.0'/g, "version==='2.3.1'")
  .replace(/version: '2\.3\.0'/g, "version: '2.3.1'")
  .replace(/API v2\.3/g, 'API v2.3.1')
  .replace(/Code\.gs\?v=20260823-homework-archive/g, 'Code.gs?v=20260823-moss-self-delete');

if (!gas.includes("version: '2.3.1'")) throw new Error('version 2.3.1 missing');
if (!gas.includes("['teacher','student']")) throw new Error('student delete role missing');
if (!gas.includes('allSelfStudy')) throw new Error('self-study guard missing');
if (!app.includes('group.source === "self"')) throw new Error('student delete button condition missing');
if (!styles.includes('linear-gradient(135deg,#42583d')) throw new Error('moss graph background missing');

fs.writeFileSync('apps-script/Code.gs', gas);
fs.writeFileSync('app.js', app);
fs.writeFileSync('styles.css', styles);
fs.writeFileSync('index.html', index);
fs.writeFileSync('deploy-apps-script.html', deploy);
console.log('Applied student self-study permanent delete and moss green graph.');
