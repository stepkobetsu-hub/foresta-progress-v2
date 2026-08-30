from pathlib import Path
import re
p=Path('elementary-supabase.js'); idxp=Path('index.html')
s=p.read_text(); idx=idxp.read_text()
old='''        if (!input.checked) {\n          result = await callElementary("configureHomework", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, selectedTypes: [], other: "" });\n          status("今日の進行を取り消しました。関連する本日の宿題も取り消しました。");\n        } else {\n          status("今日の進行を保存しました。必要なら『次回宿題を確認・調整』で宿題を減らしたり追加できます。");\n        }'''
new='''        if (!input.checked) {\n          result = await callElementary("configureHomework", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, selectedTypes: [], other: "" });\n          status("今日の進行を取り消しました。関連する本日の宿題も取り消しました。");\n        } else {\n          // Match the middle-school flow: selecting today's progress does not finalize homework yet.\n          // Clear the temporary defaults created by the compatibility endpoint; the confirmation screen\n          // starts with the normal presets checked and the teacher decides what to keep.\n          result = await callElementary("configureHomework", { subject: normalized, unitId: input.dataset.unit, lessonDate: today, selectedTypes: [], other: "" });\n          status("今日の進行を保存しました。『次回宿題を確認・調整』で宿題を確認して保存してください。");\n        }'''
if old not in s: raise SystemExit('handler block not found')
s=s.replace(old,new,1)
idx=re.sub(r'elementary-supabase\.js\?v=[^"\']+','elementary-supabase.js?v=20260831-homework-adjust-2',idx,count=1)
p.write_text(s); idxp.write_text(idx)
