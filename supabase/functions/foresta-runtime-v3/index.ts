import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime:{waitUntil(promise:Promise<unknown>):void};

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_ROLE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const GAS_URL=Deno.env.get("FORESTA_GAS_URL")||"";
const SYNC_SECRET=Deno.env.get("FORESTA_SYNC_SECRET")||"";
const configured=Boolean(SUPABASE_URL&&SERVICE_ROLE&&GAS_URL&&SYNC_SECRET);
const db=createClient(SUPABASE_URL||"http://127.0.0.1",SERVICE_ROLE||"missing",{auth:{persistSession:false}});
const reads=new Set(["getStudentDashboard","getProgression","searchStudents","getTeacherToday","getHomeworkArchive","getAdminDashboard","getAdminStudents"]);
const writes=new Set(["saveLesson","updateLessonCorrection","saveSchoolPosition","saveRange","saveCt","saveStudentRoundProgress","studentCheckHomework","teacherCheckHomework","archiveHomework","restoreHomework","deleteHomework","saveTargets","saveComment","saveNote","markCommentRead","updateTrainingRoom","saveSchoolTextbook"]);
const adminWrites=new Set(["saveRange","saveNote","markCommentRead","updateTrainingRoom","saveSchoolTextbook"]);
const teacherWrites=new Set(["saveLesson","updateLessonCorrection","saveSchoolPosition","saveCt","teacherCheckHomework","saveComment"]);
const studentWrites=new Set(["studentCheckHomework"]);
const cors={"content-type":"application/json","access-control-allow-origin":"*"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const message=(error:unknown)=>error instanceof Error?error.message:typeof error==="object"&&error!==null?JSON.stringify(error):String(error);
const normalize=(value:unknown)=>String(value??"").normalize("NFKC").trim();
const searchText=(value:unknown)=>normalize(value).toLowerCase().replace(/[\s　]+/g,"");

async function hash(raw:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function publicProfile(profile:Record<string,unknown>){const clean={...profile};delete clean.token;delete clean.adminToken;delete clean.password;return clean}

async function session(token:string){
 if(!token)throw new Error("AUTH_REQUIRED");const token_hash=await hash(token),now=new Date().toISOString();
 const {data,error}=await db.from("foresta_v3_sessions").select("profile,expires_at").eq("token_hash",token_hash).gt("expires_at",now).maybeSingle();if(error)throw error;
 if(data){await db.from("foresta_v3_sessions").update({last_seen_at:now}).eq("token_hash",token_hash);const cached=(data.profile?.session||data.profile) as Record<string,unknown>;return publicProfile(cached)}
 const response=await fetch(GAS_URL,{method:"POST",headers:{"content-type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"resumeSession",token})});
 const raw=await response.json();if(!response.ok||raw.ok===false)throw new Error("AUTH_REQUIRED");const profile=(raw.session||raw) as Record<string,unknown>;
 const expires_at=String(profile.expiresAt||new Date(Date.now()+8*3600e3).toISOString()),user_id=String(profile.studentId||profile.userId||profile.loginId||""),role=String(profile.role||profile.userType||"student");
 if(!user_id)throw new Error("INVALID_SESSION_PROFILE");const saved=publicProfile(profile);
 const {error:saveError}=await db.from("foresta_v3_sessions").upsert({token_hash,user_id,role,profile:saved,expires_at,last_seen_at:now,validated_at:now},{onConflict:"token_hash"});if(saveError)throw saveError;return saved;
}

function assertStudentAccess(profile:Record<string,unknown>,studentId:string){if(profile.role==="student"&&studentId!==String(profile.studentId||profile.loginId||""))throw new Error("FORBIDDEN");if(!["student","teacher","admin"].includes(String(profile.role||"")))throw new Error("FORBIDDEN")}
function campusMatches(teacherCampus:unknown,studentCampus:unknown){return normalize(teacherCampus).split("・").map(normalize).includes(normalize(studentCampus))}

async function snapshot(studentId:string,view:string,subject=""){
 const {data,error}=await db.from("foresta_v3_snapshots").select("payload,updated_at").eq("student_id",studentId).eq("view",view).eq("subject",subject).maybeSingle();if(error)throw error;return data;
}
async function saveSnapshots(rows:Array<Record<string,unknown>>,sourceUpdatedAt?:string){if(!rows.length)return;const payload=rows.map(row=>({student_id:String(row.studentId||""),view:String(row.view||""),subject:String(row.subject||""),payload:row.payload||{},source_updated_at:sourceUpdatedAt||new Date().toISOString(),updated_at:new Date().toISOString()}));const {error}=await db.from("foresta_v3_snapshots").upsert(payload,{onConflict:"student_id,view,subject"});if(error)throw error}

async function refreshSnapshots(studentIds:string[],includeGlobal=true){
 const response=await fetch(GAS_URL,{method:"POST",headers:{"content-type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"exportSnapshotsV3",syncSecret:SYNC_SECRET,studentIds:[...new Set(studentIds.map(normalize).filter(Boolean))].slice(0,10),includeGlobal})});
 const body=await response.json();if(!response.ok||body.ok===false||!Array.isArray(body.snapshots))throw new Error(body.message||`snapshot export ${response.status}`);await saveSnapshots(body.snapshots,body.exportedAt);return {studentCount:Number(body.studentCount||0),snapshotCount:body.snapshots.length};
}

async function read(profile:Record<string,unknown>,body:Record<string,unknown>){
 const action=String(body.action||""),studentId=String(body.studentId||profile.studentId||profile.loginId||"");
 if(action==="getAdminDashboard"||action==="getAdminStudents"){
  if(profile.role!=="admin"||Number(profile.permission||0)<1)throw new Error("FORBIDDEN");const data=await snapshot("__global__",action);if(!data)throw new Error("SNAPSHOT_NOT_READY");return {...data.payload,ok:true,_v3:true,snapshotUpdatedAt:data.updated_at};
 }
 if(action==="searchStudents"){
  if(profile.role!=="teacher")throw new Error("FORBIDDEN");const data=await snapshot("__global__",action);if(!data)throw new Error("SNAPSHOT_NOT_READY");const q=searchText(body.query),campus=normalize(body.campus),grade=normalize(body.grade);
  const students=(data.payload.students||[]).filter((s:Record<string,unknown>)=>(!campus||normalize(s.campus)===campus)&&(!grade||normalize(s.grade)===grade)&&campusMatches(profile.campus,s.campus)&&(!q||[s.studentId,s.name,s.reading,s.romaji].some(v=>searchText(v).includes(q)))).slice(0,50);return {students,ok:true,_v3:true,snapshotUpdatedAt:data.updated_at};
 }
 if(action==="getTeacherToday"){
  if(profile.role!=="teacher")throw new Error("FORBIDDEN");const data=await snapshot("__global__",action);if(!data)throw new Error("SNAPSHOT_NOT_READY");return {students:(data.payload.students||[]).filter((s:Record<string,unknown>)=>campusMatches(profile.campus,s.campus)),ok:true,_v3:true,snapshotUpdatedAt:data.updated_at};
 }
 assertStudentAccess(profile,studentId);const subject=action==="getProgression"?String(body.subject||""):"",data=await snapshot(studentId,action,subject);if(!data)throw new Error("SNAPSHOT_NOT_READY");let payload=data.payload;
 if(action==="getStudentDashboard"){const {data:enrollment,error}=await db.from("foresta_v3_enrollments").select("subjects,english_level,math_level,synced_at").eq("student_id",studentId).single();if(error)throw error;payload={...payload,student:{...(payload.student||{}),subjects:enrollment.subjects,englishLevel:enrollment.english_level,mathLevel:enrollment.math_level},referenceSyncedAt:enrollment.synced_at}}
 return {...payload,ok:true,_v3:true,snapshotUpdatedAt:data.updated_at};
}

async function claimMutation(id:string){
 const {data:current,error}=await db.from("foresta_v3_mutations").select("*").eq("mutation_id",id).maybeSingle();if(error)throw error;if(!current||!["accepted","failed"].includes(current.status))return null;if(current.next_attempt_at&&new Date(current.next_attempt_at)>new Date())return null;
 const {data,error:updateError}=await db.from("foresta_v3_mutations").update({status:"applied",attempts:Number(current.attempts||0)+1,updated_at:new Date().toISOString()}).eq("mutation_id",id).eq("status",current.status).eq("attempts",Number(current.attempts||0)).select("*").maybeSingle();if(updateError)throw updateError;return data;
}

async function processMutation(id:string){
 const row=await claimMutation(id);if(!row)return {processed:false};
 try{
  const request=row.payload?.request||{},actor=row.payload?.actor||{};const response=await fetch(GAS_URL,{method:"POST",headers:{"content-type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"applyMutationV3",syncSecret:SYNC_SECRET,mutationId:id,mutationAction:row.action,payload:request,actor})});
  const result=await response.json();if(!response.ok||result.ok===false)throw new Error(result.message||`mirror ${response.status}`);await saveSnapshots(result.snapshots||[]);
  const {error}=await db.from("foresta_v3_mutations").update({status:"mirrored",result:result.result||{},mirrored_at:new Date().toISOString(),next_attempt_at:null,last_error:null,updated_at:new Date().toISOString()}).eq("mutation_id",id);if(error)throw error;return {processed:true,mirrored:true};
 }catch(error){const attempts=Number(row.attempts||0);const delay=Math.min(900,Math.max(15,15*2**Math.min(attempts,6)));await db.from("foresta_v3_mutations").update({status:"failed",next_attempt_at:new Date(Date.now()+delay*1000).toISOString(),last_error:message(error).slice(0,1000),updated_at:new Date().toISOString()}).eq("mutation_id",id);console.error("foresta mutation failed",id,message(error));return {processed:true,mirrored:false,error:message(error)}}
}

async function processQueue(limit=10){const now=new Date().toISOString();const {data,error}=await db.from("foresta_v3_mutations").select("mutation_id").in("status",["accepted","failed"]).or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`).order("created_at").limit(Math.min(25,Math.max(1,limit)));if(error)throw error;const results=[];for(const row of data||[])results.push(await processMutation(row.mutation_id));return {claimed:(data||[]).length,mirrored:results.filter(x=>x.mirrored).length,failed:results.filter(x=>x.processed&&!x.mirrored).length}}

async function queueWrite(profile:Record<string,unknown>,body:Record<string,unknown>){
 const action=String(body.action||"");let actor=profile;if(adminWrites.has(action)){actor=await session(String(body.adminToken||""));if(actor.role!=="admin"||Number(actor.permission||0)<1)throw new Error("FORBIDDEN")}else if(teacherWrites.has(action)&&actor.role!=="teacher")throw new Error("FORBIDDEN");else if(studentWrites.has(action)&&actor.role!=="student")throw new Error("FORBIDDEN");
 const studentId=String(body.studentId||actor.studentId||actor.loginId||"");assertStudentAccess(actor,studentId);const mutationId=String(body.mutationId||"");if(!mutationId)throw new Error("MUTATION_ID_REQUIRED");const request={...body};delete request.token;delete request.adminToken;delete request.password;delete request.syncSecret;
 const {error}=await db.from("foresta_v3_mutations").upsert({mutation_id:mutationId,action,student_id:studentId,payload:{request,actor:publicProfile(actor)},status:"accepted"},{onConflict:"mutation_id",ignoreDuplicates:true});if(error)throw error;
 EdgeRuntime.waitUntil(processMutation(mutationId));return {ok:true,queued:true,mutationId,_v3:true};
}

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:{"access-control-allow-origin":"*","access-control-allow-headers":"content-type,authorization"}});if(!configured)return json({ok:false,message:"SERVICE_NOT_CONFIGURED"},503);
 try{
  const body=await req.json() as Record<string,unknown>;const internal=req.headers.get("authorization")===`Bearer ${SYNC_SECRET}`;
  if(internal&&body.action==="processMutationQueueV3")return json({ok:true,...await processQueue(Number(body.limit||10))});
  if(internal&&body.action==="refreshSnapshotsV3")return json({ok:true,...await refreshSnapshots(Array.isArray(body.studentIds)?body.studentIds.map(String):[],body.includeGlobal!==false)});
  if(!internal)EdgeRuntime.waitUntil(processQueue(3).catch(error=>console.error("foresta queue sweep failed",message(error))));
  const profile=await session(String(body.token||""));if(reads.has(String(body.action||"")))return json(await read(profile,body));if(writes.has(String(body.action||"")))return json(await queueWrite(profile,body),202);return json({ok:false,message:"INVALID_ACTION"},400);
 }catch(error){const m=message(error),status=m==="AUTH_REQUIRED"?401:m==="FORBIDDEN"?403:["INVALID_ACTION","MUTATION_ID_REQUIRED"].includes(m)?400:m==="SNAPSHOT_NOT_READY"?503:500;return json({ok:false,message:m},status)}
});
