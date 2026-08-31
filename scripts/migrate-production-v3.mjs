#!/usr/bin/env node
// Secret-bearing, resumable production importer. Run only from an authenticated operator shell.
const required=["FORESTA_GAS_URL","FORESTA_SYNC_SECRET","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"];
for(const key of required)if(!process.env[key])throw new Error(`Missing ${key}`);
const tabs=['単元マスタ','学校別英語教科書設定','学校テスト日程キャッシュ','学校別予想テスト範囲','学校別決定テスト範囲','学校進度履歴','授業記録','授業実施単元','CT記録','特訓部屋対応','宿題','宿題の生徒チェック','宿題の講師チェック','テスト別目標点','講師コメント','コメント既読管理','生徒注意事項','操作履歴','生徒周回進捗'];
const base=process.env.SUPABASE_URL.replace(/\/$/,"")+"/rest/v1/";
const headers={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,'content-type':'application/json',prefer:'resolution=merge-duplicates'};
const counts={};
for(const tab of tabs){let startRow=2;counts[tab]=0;do{
 const response=await fetch(process.env.FORESTA_GAS_URL,{method:'POST',headers:{'content-type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'exportLegacyV3',syncSecret:process.env.FORESTA_SYNC_SECRET,tab,startRow,limit:500})});
 const page=await response.json();if(!response.ok||page.ok===false)throw new Error(`${tab}: ${page.message||response.status}`);
 const records=page.rows.map((row,index)=>({entity_type:`legacy:${tab}`,entity_id:`${tab}:${startRow+index}`,payload:Object.fromEntries(page.headers.map((h,i)=>[h,row[i]])),active:true}));
 if(records.length){const saved=await fetch(base+'foresta_v3_entities?on_conflict=entity_type,entity_id',{method:'POST',headers,body:JSON.stringify(records)});if(!saved.ok)throw new Error(`${tab} import: ${await saved.text()}`)}
 counts[tab]+=records.length;startRow=page.nextRow;
 }while(startRow);
 console.log(`${tab}: ${counts[tab]}`);
}
const marker={version:`production-${new Date().toISOString()}`,source_snapshot:counts,import_counts:counts,completed_at:new Date().toISOString()};
const marked=await fetch(base+'foresta_v3_migrations',{method:'POST',headers,body:JSON.stringify(marker)});if(!marked.ok)throw new Error(await marked.text());
console.log(JSON.stringify({ok:true,counts},null,2));
