import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const GAS_URL=Deno.env.get("FORESTA_GAS_URL")||"";
const configured=Boolean(SUPABASE_URL&&SERVICE_ROLE&&GAS_URL);
const db=createClient(SUPABASE_URL||"http://127.0.0.1",SERVICE_ROLE||"missing",{auth:{persistSession:false}});
const reads=new Set(["getStudentDashboard","getProgression","searchStudents","getTeacherToday","getHomeworkArchive","getRangeEditor"]);
const writes=new Set(["saveLesson","updateLessonCorrection","saveSchoolPosition","saveRange","saveCt","saveStudentRoundProgress","studentCheckHomework","teacherCheckHomework","archiveHomework","restoreHomework","deleteHomework","saveTargets","saveComment","saveNote","markCommentRead","updateTrainingRoom","saveSchoolTextbook"]);
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","access-control-allow-origin":"*"}});
async function hash(raw:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function session(token:string){
 if(!token) throw new Error("AUTH_REQUIRED"); const token_hash=await hash(token);
 const {data}=await db.from("foresta_v3_sessions").select("profile,expires_at").eq("token_hash",token_hash).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(data)return data.profile;
 // One Google validation per uncached session; normal subsequent reads never contact Google.
 const response=await fetch(GAS_URL,{method:"POST",headers:{"content-type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"resumeSession",token})});
 const profile=await response.json(); if(!response.ok||profile.ok===false)throw new Error("AUTH_REQUIRED");
 const expires_at=profile.expiresAt||new Date(Date.now()+8*3600e3).toISOString();
 const now=new Date().toISOString();
 const user_id=String(profile.studentId||profile.userId||profile.loginId||"");
 const role=String(profile.role||profile.userType||"student");
 if(!user_id)throw new Error("INVALID_SESSION_PROFILE");
 const {error}=await db.from("foresta_v3_sessions").upsert({token_hash,user_id,role,profile:{...profile,token:undefined},expires_at,last_seen_at:now,validated_at:now},{onConflict:"token_hash"});
 if(error)throw error; return profile;
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:{"access-control-allow-origin":"*","access-control-allow-headers":"content-type"}});
 if(!configured)return json({ok:false,message:"SERVICE_NOT_CONFIGURED"},503);
 try{
  const body=await req.json(); const profile=await session(String(body.token||""));
  const studentId=String(body.studentId||profile.studentId||profile.loginId||"");
  if(reads.has(body.action)){
   const subject=String(body.subject||"");
   const {data,error}=await db.from("foresta_v3_snapshots").select("payload,updated_at").eq("student_id",studentId).eq("view",body.action).eq("subject",subject).maybeSingle();
   if(error)throw error; if(!data)return json({ok:false,code:"SNAPSHOT_NOT_READY",message:"同期済みデータがありません。管理者に連絡してください。"},503);
   let payload=data.payload;
   if(body.action==="getStudentDashboard"){
    const {data:enrollment}=await db.from("foresta_v3_enrollments").select("subjects,english_level,math_level,synced_at").eq("student_id",studentId).single();
    if(!enrollment)throw new Error("ENROLLMENT_NOT_SYNCED");
    payload={...payload,student:{...(payload.student||{}),subjects:enrollment.subjects,englishLevel:enrollment.english_level,mathLevel:enrollment.math_level},referenceSyncedAt:enrollment.synced_at};
   }
   return json({...payload,ok:true,_v3:true,snapshotUpdatedAt:data.updated_at});
  }
  if(writes.has(body.action)){
   if(!body.mutationId)throw new Error("MUTATION_ID_REQUIRED");
   const safe={...body}; delete safe.token; delete safe.adminToken;
   const {error}=await db.from("foresta_v3_mutations").upsert({mutation_id:body.mutationId,action:body.action,student_id:studentId,payload:safe,status:"accepted"},{onConflict:"mutation_id",ignoreDuplicates:true});
   if(error)throw error; return json({ok:true,queued:true,mutationId:body.mutationId,_v3:true},202);
  }
  return json({ok:false,message:"INVALID_ACTION"},400);
 }catch(error){return json({ok:false,message:error instanceof Error?error.message:"UNKNOWN"},401)}
});
