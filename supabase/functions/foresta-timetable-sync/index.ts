import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const secret=Deno.env.get("FORESTA_SYNC_SECRET")!;
const exporter=Deno.env.get("FORESTA_TIMETABLE_EXPORT_URL")!;
const normalize=(v:unknown)=>String(v??"").normalize("NFKC").trim();
const allowed=new Set(["国語","算数","数学","英語","理科","社会"]);
Deno.serve(async req=>{
 if(req.headers.get("authorization")!==`Bearer ${secret}`)return new Response("unauthorized",{status:401});
 const started=new Date().toISOString();
 await db.from("foresta_v3_sync_status").update({status:"running",last_started_at:started}).eq("sync_name","timetable");
 try{
  const response=await fetch(exporter,{method:"POST",headers:{"content-type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"exportTimetableV3",syncSecret:secret})});
  const source=await response.json(); if(!response.ok||source.ok===false)throw new Error(source.message||`export ${response.status}`);
  const rows=(source.rows||[]).map((r:Record<string,unknown>)=>({...r,student_id:normalize(r.studentId),student_name:normalize(r.studentName),subjects:[...new Set((r.subjects as unknown[]||[]).map(normalize).filter(x=>allowed.has(x)))],english_level:normalize(r.englishLevel)||null,math_level:normalize(r.mathLevel)||null,source_row:Number(r.sourceRow),source_hash:normalize(r.sourceHash)}));
  const {data,error}=await db.rpc("foresta_v3_replace_enrollments",{rows,audit:{sourceSpreadsheet:"★生徒マスタ202606-",sourceSheet:"時間割マスタ",exportedAt:source.exportedAt,forced:new URL(req.url).searchParams.get("force")==="1"}}); if(error)throw error;
  return Response.json({ok:true,rowCount:data,lastSuccessAt:new Date().toISOString()});
 }catch(error){
  const {data:state}=await db.from("foresta_v3_sync_status").select("attempt_count").eq("sync_name","timetable").single(); const attempts=Number(state?.attempt_count||0)+1;
  await db.from("foresta_v3_sync_status").update({status:"failed",last_failure_at:new Date().toISOString(),attempt_count:attempts,next_retry_at:new Date(Date.now()+Math.min(3600,30*2**Math.min(attempts,7))*1000).toISOString(),last_error:String(error).slice(0,1000)}).eq("sync_name","timetable");
  return Response.json({ok:false,message:"Timetable sync failed; last-known-good data retained."},{status:502});
 }
});
