import fs from 'node:fs';

const path = 'elementary-supabase.js';
let s = fs.readFileSync(path, 'utf8');

s = s.split('大きな単元（章）').join('単元（章）');

const oldBlock = `        } else {
          // Match the middle-school flow: selecting today's progress does not finalize homework yet.
          // Clear the temporary defaults created by the compatibility endpoint; the confirmation screen
          // starts with the normal presets checked and the teacher decides what to keep.
          result = await callElementary("configureHomework", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, selectedTypes: [], other: "" });
          status("今日の進行を保存しました。『次回宿題を確認・調整』で宿題を確認して保存してください。");
        }`;

const newBlock = `        } else {
          const selectedTypes = normalized === "国語" ? ["TODAY_REDO"] : ["TRY_REDO", "EXERCISE"];
          result = await callElementary("configureHomework", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, selectedTypes, other: "" });
          status(normalized === "国語"
            ? "今日の進行と『本日の赤×なおし』を宿題に保存しました。"
            : "今日の進行と『TRYの赤×なおし・エクササイズ』を宿題に保存しました。");
        }`;

if (!s.includes(oldBlock)) throw new Error('checked-today block not found');
s = s.replace(oldBlock, newBlock);

if (!s.includes('単元（章）を選ぶ</option>')) throw new Error('chapter label not updated');
if (!s.includes('selectedTypes = normalized === "国語"')) throw new Error('auto homework not updated');

fs.writeFileSync(path, s);
