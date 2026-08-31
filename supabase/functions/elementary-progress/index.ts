import { createClient } from "npm:@supabase/supabase-js@2";

const GAS_URL = "https://script.google.com/macros/s/AKfycbz0z2FeM1jWUSs7LTzwi9N12kPoTmSTP_hRjTaf3wQlf5kX5hR_W9E37ON63L_dhbIZ/exec";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sessionCache = new Map<string, { session: Record<string, unknown>; expiresAt: number }>();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const ok = (data: Record<string, unknown> = {}, status = 200) => new Response(JSON.stringify({ ok: true, ...data }), { status, headers: cors });
const fail = (message: string, status = 400) => new Response(JSON.stringify({ ok: false, message }), { status, headers: cors });
const text = (v: unknown) => String(v ?? "").trim();
const subjectOk = (s: string) => ["算数", "国語", "英語"].includes(s);
const dateOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const campusTokens = (value: unknown) => text(value).split(/[・,/／\s]+/).map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/校$/u, ""));
const plusDays = (dateText: string, days: number) => { const d = new Date(`${dateText}T12:00:00+09:00`); d.setDate(d.getDate() + days); return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); };
const allowedTypes = (subject: string) => subject === "国語" ? ["TODAY_REDO"] : (subject === "算数" || subject === "英語") ? ["TRY_REDO", "EXERCISE"] : [];
const homeworkFields = "homework_id,student_id,unit_id,homework_type,student_status,teacher_status,student_updated_at,teacher_updated_at,confirmed_by,confirmation_memo,assigned_date,due_date,series,created_at,updated_at,archived_at,archived_by";
const unitOrder = (unitId: unknown) => { const match = text(unitId).match(/-(\d{3})$/); return match ? Number(match[1]) : null; };
const differenceLabel = (value: number | null) => value == null ? "進度未入力" : value > 0 ? `学校から+${value}` : value < 0 ? `学校から${value}` : "学校から±0";

async function gas(action: string, payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload }),
      redirect: "follow",
      signal: controller.signal,
    });
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function verifySession(token: string) {
  if (!token) throw new Error("AUTH_REQUIRED");
  const cached = sessionCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.session;
  const result = await gas("resumeSession", { token });
  if (!result?.ok || !result?.session) throw new Error("AUTH_REQUIRED");
  const session = result.session as Record<string, unknown>;
  sessionCache.set(token, { session, expiresAt: Date.now() + 5 * 60 * 1000 });
  return session;
}

async function studentCampus(studentId: string) {
  const { data, error } = await db.from("student_auth").select("student_id,campus").eq("student_id", studentId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("STUDENT_NOT_FOUND");
  return data;
}

async function authorizeRead(session: Record<string, unknown>, studentId: string) {
  const role = text(session.role);
  if (role === "student") {
    if (text(session.studentId || session.loginId) !== studentId) throw new Error("FORBIDDEN");
    return;
  }
  if (role !== "teacher" && role !== "admin") throw new Error("FORBIDDEN");
  if (role === "teacher") {
    const data = await studentCampus(studentId);
    const teacherCampuses = campusTokens(session.campus);
    const studentCampuses = campusTokens(data.campus);
    if (teacherCampuses.length && studentCampuses.length && !studentCampuses.some((c) => teacherCampuses.includes(c))) throw new Error("FORBIDDEN");
  }
}

async function authorizeTeacher(session: Record<string, unknown>, studentId: string) {
  if (text(session.role) !== "teacher") throw new Error("FORBIDDEN");
  await authorizeRead(session, studentId);
}

async function readHomework(studentId: string, archived: boolean) {
  let q = db.from("homework").select(homeworkFields).eq("student_id", studentId).like("series", "ELEMENTARY:%");
  q = archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  const { data, error } = await q.order(archived ? "archived_at" : "assigned_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return data ?? [];
}

async function readAll(studentId: string) {
  const [lesson, school, tests, homework] = await Promise.all([
    db.from("elementary_lesson_progress").select("student_id,subject,unit_id,lesson_date,teacher_id,teacher_name,created_at,updated_at").eq("student_id", studentId).order("lesson_date", { ascending: false }).order("created_at", { ascending: false }),
    db.from("elementary_school_progress").select("student_id,subject,unit_id,recorded_date,teacher_id,teacher_name,created_at").eq("student_id", studentId).order("recorded_date", { ascending: false }).order("created_at", { ascending: false }),
    db.from("elementary_unit_tests").select("id,student_id,subject,unit_id,unit_name,test_date,score,max_score,back_score,back_max_score,memo,teacher_id,teacher_name,created_at").eq("student_id", studentId).order("test_date", { ascending: false }).order("created_at", { ascending: false }).limit(50),
    readHomework(studentId, false),
  ]);
  if (lesson.error) throw lesson.error;
  if (school.error) throw school.error;
  if (tests.error) throw tests.error;
  return { lessonProgress: lesson.data ?? [], schoolProgress: school.data ?? [], unitTests: tests.data ?? [], homework };
}

async function readAdminSummary(session: Record<string, unknown>) {
  if (text(session.role) !== "admin") throw new Error("FORBIDDEN");
  const [lesson, school] = await Promise.all([
    db.from("elementary_lesson_progress").select("student_id,subject,unit_id,lesson_date,teacher_id,teacher_name,created_at,updated_at").order("lesson_date", { ascending: false }).order("created_at", { ascending: false }),
    db.from("elementary_school_progress").select("student_id,subject,unit_id,recorded_date,teacher_id,teacher_name,created_at").order("recorded_date", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  if (lesson.error) throw lesson.error;
  if (school.error) throw school.error;
  const students = new Map<string, { teachers: string[]; differences: Array<Record<string, unknown>>; updatedAt: string }>();
  const lessonByKey = new Map<string, Record<string, unknown>>(), schoolByKey = new Map<string, Record<string, unknown>>();
  const ensure = (studentId: string) => { if (!students.has(studentId)) students.set(studentId, { teachers: [], differences: [], updatedAt: "" }); return students.get(studentId)!; };
  for (const row of lesson.data ?? []) {
    const studentId = text(row.student_id), subject = text(row.subject), key = `${studentId}|${subject}`, summary = ensure(studentId), order = unitOrder(row.unit_id);
    if (row.teacher_name && !summary.teachers.includes(text(row.teacher_name))) summary.teachers.push(text(row.teacher_name));
    summary.updatedAt = summary.updatedAt || text(row.updated_at || row.created_at);
    const current = lessonByKey.get(key), currentOrder = current ? unitOrder(current.unit_id) : null;
    if (order != null && (currentOrder == null || order > currentOrder)) lessonByKey.set(key, row);
  }
  for (const row of school.data ?? []) {
    const studentId = text(row.student_id), subject = text(row.subject), key = `${studentId}|${subject}`;
    ensure(studentId);
    if (!schoolByKey.has(key)) schoolByKey.set(key, row);
  }
  const keys = new Set([...lessonByKey.keys(), ...schoolByKey.keys()]);
  for (const key of keys) {
    const [studentId, subject] = key.split("|"), lessonRow = lessonByKey.get(key), schoolRow = schoolByKey.get(key);
    const lessonOrder = lessonRow ? unitOrder(lessonRow.unit_id) : null, schoolOrder = schoolRow ? unitOrder(schoolRow.unit_id) : null;
    const differenceUnits = lessonOrder != null && schoolOrder != null ? lessonOrder - schoolOrder : null;
    ensure(studentId).differences.push({ subject, differenceUnits, label: differenceLabel(differenceUnits), schoolUnitId: text(schoolRow?.unit_id), forestaUnitId: text(lessonRow?.unit_id) });
  }
  return { students: [...students.entries()].map(([studentId, value]) => ({ studentId, teachers: value.teachers.slice(0, 3), differences: value.differences.sort((a, b) => ["算数", "国語", "英語"].indexOf(text(a.subject)) - ["算数", "国語", "英語"].indexOf(text(b.subject))), updatedAt: value.updatedAt })) };
}

async function replaceHomeworkGroup(studentId: string, subject: string, unitId: string, lessonDate: string, selectedTypesRaw: unknown, otherRaw: unknown) {
  const valid = new Set(allowedTypes(subject));
  const selectedTypes = Array.isArray(selectedTypesRaw) ? selectedTypesRaw.map(text).filter((t) => valid.has(t)) : [];
  const other = text(otherRaw).slice(0, 120);
  const series = `ELEMENTARY:${subject}`;
  const { error: delError } = await db.from("homework").delete()
    .eq("student_id", studentId).eq("unit_id", unitId).eq("assigned_date", lessonDate).eq("series", series).is("archived_at", null);
  if (delError) throw delError;
  const now = new Date().toISOString();
  const due = plusDays(lessonDate, 2);
  const rows = selectedTypes.map((homeworkType) => ({
    homework_id: crypto.randomUUID(), student_id: studentId, unit_id: unitId, homework_type: homeworkType,
    student_status: "UNINPUT", teacher_status: "UNCONFIRMED", confirmed_by: "", confirmation_memo: "",
    created_at: now, updated_at: now, school_year: lessonDate.slice(0, 4), round_number: 1,
    assigned_date: lessonDate, series, due_date: due, archived_at: null, archived_by: "",
  }));
  if (other) rows.push({
    homework_id: crypto.randomUUID(), student_id: studentId, unit_id: unitId, homework_type: "OTHER",
    student_status: "UNINPUT", teacher_status: "UNCONFIRMED", confirmed_by: "", confirmation_memo: other,
    created_at: now, updated_at: now, school_year: lessonDate.slice(0, 4), round_number: 1,
    assigned_date: lessonDate, series, due_date: due, archived_at: null, archived_by: "",
  });
  if (rows.length) {
    const { error } = await db.from("homework").insert(rows);
    if (error) throw error;
  }
}

async function validateHomeworkIds(studentId: string, ids: string[], requireCompleted = false) {
  if (!ids.length) throw new Error("HOMEWORK_REQUIRED");
  const { data, error } = await db.from("homework").select("homework_id,student_id,teacher_status").in("homework_id", ids).eq("student_id", studentId).like("series", "ELEMENTARY:%");
  if (error) throw error;
  if ((data ?? []).length !== ids.length) throw new Error("FORBIDDEN");
  if (requireCompleted && (data ?? []).some((r) => text(r.teacher_status) !== "CONFIRMED")) throw new Error("HOMEWORK_NOT_COMPLETE");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POSTのみ対応しています。", 405);
  try {
    const body = await req.json();
    const action = text(body.action), token = text(body.token), studentId = text(body.studentId);
    const session = await verifySession(token);

    if (action === "getAdminSummary") return ok(await readAdminSummary(session));
    if (!studentId) return fail("生徒IDを確認してください。");

    if (action === "get") {
      await authorizeRead(session, studentId);
      return ok(await readAll(studentId));
    }
    if (action === "getHomeworkArchive") {
      await authorizeRead(session, studentId);
      return ok({ homework: await readHomework(studentId, true) });
    }
    if (action === "studentCheckHomework") {
      await authorizeRead(session, studentId);
      if (text(session.role) !== "student") throw new Error("FORBIDDEN");
      const homeworkId = text(body.homeworkId), checked = body.checked === true;
      await validateHomeworkIds(studentId, [homeworkId]);
      const now = new Date().toISOString();
      const { error } = await db.from("homework").update({ student_status: checked ? "COMPLETED" : "UNINPUT", student_updated_at: now, student_completed_at: checked ? now : null, student_completed_date: checked ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date()) : null, updated_at: now }).eq("homework_id", homeworkId).eq("student_id", studentId).is("archived_at", null);
      if (error) throw error;
      return ok(await readAll(studentId));
    }
    if (action === "archiveHomework") {
      await authorizeRead(session, studentId);
      const ids = Array.isArray(body.homeworkIds) ? [...new Set(body.homeworkIds.map(text).filter(Boolean))].slice(0, 50) : [];
      await validateHomeworkIds(studentId, ids, true);
      const now = new Date().toISOString();
      const { error } = await db.from("homework").update({ archived_at: now, archived_by: text(session.loginId || session.studentId), updated_at: now }).in("homework_id", ids).eq("student_id", studentId);
      if (error) throw error;
      return ok(await readAll(studentId));
    }
    if (action === "restoreHomework") {
      await authorizeRead(session, studentId);
      const ids = Array.isArray(body.homeworkIds) ? [...new Set(body.homeworkIds.map(text).filter(Boolean))].slice(0, 50) : [];
      await validateHomeworkIds(studentId, ids, false);
      const { error } = await db.from("homework").update({ archived_at: null, archived_by: "", updated_at: new Date().toISOString() }).in("homework_id", ids).eq("student_id", studentId);
      if (error) throw error;
      return ok({ homework: await readHomework(studentId, true) });
    }

    await authorizeTeacher(session, studentId);
    const teacherId = text(session.loginId), teacherName = text(session.name);
    const subject = text(body.subject) === "数学" ? "算数" : text(body.subject);

    if (action === "teacherCheckHomework") {
      const homeworkId = text(body.homeworkId), checked = body.checked === true;
      await validateHomeworkIds(studentId, [homeworkId]);
      const now = new Date().toISOString();
      const { error } = await db.from("homework").update({ teacher_status: checked ? "CONFIRMED" : "UNCONFIRMED", teacher_updated_at: now, confirmed_by: checked ? teacherId : "", updated_at: now }).eq("homework_id", homeworkId).eq("student_id", studentId).is("archived_at", null);
      if (error) throw error;
      return ok(await readAll(studentId));
    }

    if (!subjectOk(subject)) return fail("科目を確認してください。");

    if (action === "toggleLesson") {
      const unitId = text(body.unitId), lessonDate = text(body.lessonDate);
      if (!unitId || !dateOk(lessonDate)) return fail("単元または日付を確認してください。");
      if (body.checked === false) {
        const { error } = await db.from("elementary_lesson_progress").delete().eq("student_id", studentId).eq("subject", subject).eq("unit_id", unitId).eq("lesson_date", lessonDate);
        if (error) throw error;
      } else {
        const { error } = await db.from("elementary_lesson_progress").upsert({ student_id: studentId, subject, unit_id: unitId, lesson_date: lessonDate, teacher_id: teacherId, teacher_name: teacherName, updated_at: new Date().toISOString() }, { onConflict: "student_id,subject,unit_id,lesson_date" });
        if (error) throw error;
      }
      return ok({ ...(await readAll(studentId)), homeworkCreated: 0 });
    }

    if (action === "configureHomework") {
      const unitId = text(body.unitId), lessonDate = text(body.lessonDate);
      if (!unitId || !dateOk(lessonDate)) return fail("宿題の単元または日付を確認してください。");
      await replaceHomeworkGroup(studentId, subject, unitId, lessonDate, body.selectedTypes, body.other);
      return ok(await readAll(studentId));
    }

    if (action === "addCustomHomework") {
      const memo = text(body.memo).slice(0, 120), assignedDate = dateOk(text(body.assignedDate)) ? text(body.assignedDate) : new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      if (!memo) return fail("宿題内容を入力してください。");
      const now = new Date().toISOString();
      const { error } = await db.from("homework").insert({ homework_id: crypto.randomUUID(), student_id: studentId, unit_id: `CUSTOM:${assignedDate}:${crypto.randomUUID()}`, homework_type: "OTHER", student_status: "UNINPUT", teacher_status: "UNCONFIRMED", confirmed_by: "", confirmation_memo: memo, created_at: now, updated_at: now, school_year: assignedDate.slice(0,4), round_number: 1, assigned_date: assignedDate, series: `ELEMENTARY:${subject}`, due_date: plusDays(assignedDate, 2), archived_at: null, archived_by: "" });
      if (error) throw error;
      return ok(await readAll(studentId));
    }

    if (action === "saveSchoolPosition") {
      const unitId = text(body.unitId), recordedDate = text(body.recordedDate);
      if (!unitId || !dateOk(recordedDate)) return fail("学校進度の単元または日付を確認してください。");
      const { error } = await db.from("elementary_school_progress").insert({ student_id: studentId, subject, unit_id: unitId, recorded_date: recordedDate, teacher_id: teacherId, teacher_name: teacherName });
      if (error) throw error;
      return ok(await readAll(studentId));
    }

    if (action === "saveUnitTest") {
      const unitId = text(body.unitId), unitName = text(body.unitName), testDate = text(body.testDate);
      const score = Number(body.score), maxScore = Number(body.maxScore || 100);
      const hasBack = body.backScore !== undefined && body.backScore !== null && text(body.backScore) !== "";
      const backScore = hasBack ? Number(body.backScore) : null;
      const backMaxScore = Number(body.backMaxScore || 50);
      if (!unitName || !dateOk(testDate) || !Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0 || score > maxScore) return fail("表面のテスト内容を確認してください。");
      if (!Number.isFinite(backMaxScore) || backMaxScore <= 0 || (hasBack && (!Number.isFinite(backScore) || Number(backScore) < 0 || Number(backScore) > backMaxScore))) return fail("裏面のテスト内容を確認してください。");
      const { error } = await db.from("elementary_unit_tests").insert({ student_id: studentId, subject, unit_id: unitId, unit_name: unitName, test_date: testDate, score, max_score: maxScore, back_score: backScore, back_max_score: backMaxScore, memo: text(body.memo), teacher_id: teacherId, teacher_name: teacherName });
      if (error) throw error;
      return ok(await readAll(studentId));
    }

    return fail("処理を確認できません。", 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "AUTH_REQUIRED") return fail("ログインの有効期限が切れました。もう一度ログインしてください。", 401);
    if (message === "FORBIDDEN") return fail("この操作を行う権限がありません。", 403);
    if (message === "STUDENT_NOT_FOUND") return fail("生徒データを確認できません。", 404);
    if (message === "HOMEWORK_REQUIRED") return fail("宿題を選択してください。", 400);
    if (message === "HOMEWORK_NOT_COMPLETE") return fail("完了した宿題だけアーカイブできます。", 400);
    console.error(error);
    return fail("小学生データの読込・保存でエラーが発生しました。", 500);
  }
});
