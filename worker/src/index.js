import { CATALOG, CATALOG_VERSION } from "./catalog.generated.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const DEFAULT_ACCESS_CODE_HASH = "aa6d00688d8e7027c80454dade33a9570b44ea07987d961d6b1af3ac4780c1b0";
const SCORE_KEYS = [
  "agenda",
  "feedback",
  "understanding",
  "interpersonal_effectiveness",
  "collaboration",
  "pacing_time_use",
  "guided_discovery",
  "focusing_on_key_cognitions_behaviors",
  "strategy_for_change",
  "application_of_cbt_techniques",
  "homework",
];

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function corsHeaders(env, origin) {
  const allowed = allowedOrigins(env);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "*";
  return {
    ...JSON_HEADERS,
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(payload, status = 200, headers = JSON_HEADERS) {
  return new Response(JSON.stringify(payload), { status, headers });
}

function cleanText(value, max = 500) {
  const text = String(value ?? "").trim();
  return text.length > max ? text.slice(0, max) : text;
}

function base64UrlEncode(bytes) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64Json(value) {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function fromB64Json(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

async function makeToken(env, payload) {
  const body = b64Json(payload);
  const signature = await hmacSign(env.TOKEN_SECRET || "local-dev-secret", body);
  return `${body}.${signature}`;
}

async function verifyToken(env, token) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) throw new Error("Bad token");
  const expected = await hmacSign(env.TOKEN_SECRET || "local-dev-secret", body);
  if (signature !== expected) throw new Error("Bad token");
  const payload = fromB64Json(body);
  if (payload.exp && Date.now() > payload.exp) throw new Error("Expired token");
  return payload;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function makeParticipantUid(email) {
  return `P-${(await sha256Hex(String(email || "").trim().toLowerCase())).slice(0, 12)}`;
}

function accessCodeHashes(env) {
  const hashes = String(env.ACCESS_CODE_HASHES || env.ACCESS_CODE_HASH || DEFAULT_ACCESS_CODE_HASH)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return hashes.length ? hashes : [DEFAULT_ACCESS_CODE_HASH];
}

async function requireAccessCode(env, accessCode) {
  const code = String(accessCode || "").trim();
  if (!code) throw new Error("Missing access code");
  if (!accessCodeHashes(env).includes(await sha256Hex(code))) throw new Error("Invalid access code");
}

function requireProfile(input) {
  const years = Number(input?.years_experience);
  const profile = {
    email: cleanText(input?.email, 320).toLowerCase(),
    name: cleanText(input?.name, 200),
    role: cleanText(input?.role, 200),
    institution: cleanText(input?.institution, 260),
    latest_degree: cleanText(input?.latest_degree, 200),
    years_experience: years,
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) throw new Error("Invalid email");
  if (!profile.name || !profile.role || !profile.institution || !profile.latest_degree) throw new Error("Incomplete profile");
  if (!Number.isFinite(years) || years < 0 || years > 80) throw new Error("Invalid years_experience");
  return profile;
}

async function upsertParticipant(env, profile) {
  const participantUid = await makeParticipantUid(profile.email);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO participants (
      participant_uid, email, name, role, institution, latest_degree, years_experience, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      name=excluded.name, role=excluded.role, institution=excluded.institution,
      latest_degree=excluded.latest_degree, years_experience=excluded.years_experience,
      updated_at=excluded.updated_at`,
  ).bind(participantUid, profile.email, profile.name, profile.role, profile.institution, profile.latest_degree, profile.years_experience, now, now).run();
  return participantUid;
}

async function findParticipantByEmail(env, email) {
  const row = await env.DB.prepare(
    `SELECT participant_uid, email, name, role, institution, latest_degree, years_experience
     FROM participants WHERE lower(email) = lower(?) LIMIT 1`,
  ).bind(cleanText(email, 320).toLowerCase()).first();
  if (!row?.participant_uid) return null;
  return {
    participant_id: row.participant_uid,
    profile: {
      participant_id: row.participant_uid,
      email: row.email,
      name: row.name,
      role: row.role,
      institution: row.institution,
      latest_degree: row.latest_degree,
      years_experience: row.years_experience,
    },
  };
}

async function openAssignment(env, participantUid) {
  return env.DB.prepare(
    `SELECT a.* FROM assignments a
     LEFT JOIN ratings r ON r.assignment_id = a.id
     WHERE a.participant_uid = ? AND r.id IS NULL
     ORDER BY a.ordinal ASC LIMIT 1`,
  ).bind(participantUid).first();
}

async function nextAssignment(env, participantUid, studyVersion) {
  const existing = await openAssignment(env, participantUid);
  if (existing) return existing;

  if (!CATALOG.length) throw new Error("The Worker session catalog is empty");
  if (cleanText(studyVersion, 100) !== CATALOG_VERSION) throw new Error("Study data is out of date; refresh the page and try again");
  const catalog = CATALOG;
  const valueSql = catalog.map(() => "(?, ?)").join(", ");
  const sql = `
    WITH catalog(session_id, stratum_id) AS (VALUES ${valueSql}),
    eligible AS (
      SELECT c.session_id, c.stratum_id
      FROM catalog c
      WHERE NOT EXISTS (
        SELECT 1 FROM assignments used
        WHERE used.participant_uid = ? AND used.stratum_id = c.stratum_id
      )
    )
    INSERT INTO assignments (
      id, participant_uid, session_id, stratum_id, ordinal, status,
      study_version, assigned_at
    )
    SELECT ?, ?, e.session_id, e.stratum_id,
      COALESCE((SELECT MAX(prior.ordinal) + 1 FROM assignments prior WHERE prior.participant_uid = ?), 1),
      'assigned', ?, ?
    FROM eligible e
    ORDER BY
      (SELECT COUNT(*) FROM ratings pair_ratings WHERE pair_ratings.stratum_id = e.stratum_id) ASC,
      (SELECT COUNT(*) FROM ratings session_ratings WHERE session_ratings.session_id = e.session_id) ASC,
      random()
    LIMIT 1
    RETURNING *`;
  const assignmentId = `assignment_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const bindings = catalog.flatMap((row) => [row.sessionId, row.stratumId]);
  bindings.push(participantUid, assignmentId, participantUid, participantUid, cleanText(studyVersion, 100), now);
  return env.DB.prepare(sql).bind(...bindings).first();
}

async function history(env, participantUid) {
  const result = await env.DB.prepare(
    `SELECT id, assignment_id, participant_uid, session_id, stratum_id, scores_json,
            total_score, comments, started_at_utc, timestamp_utc, duration_seconds, received_at
     FROM ratings WHERE participant_uid = ? ORDER BY received_at ASC`,
  ).bind(participantUid).all();
  return { ratings: result?.results || [], open_assignment: await openAssignment(env, participantUid) };
}

function validatedScores(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const scores = {};
  for (const key of SCORE_KEYS) {
    const score = Number(source[key]);
    if (!Number.isInteger(score) || score < 0 || score > 6) throw new Error(`Invalid score for ${key}`);
    scores[key] = score;
  }
  return scores;
}

async function saveRating(env, input, payload, request) {
  const participantUid = cleanText(payload.participant_uid, 100);
  const email = cleanText(payload.email, 320).toLowerCase();
  const assignmentId = cleanText(input?.assignment_id, 160);
  const assignment = await env.DB.prepare(
    "SELECT * FROM assignments WHERE id = ? AND participant_uid = ? LIMIT 1",
  ).bind(assignmentId, participantUid).first();
  if (!assignment) throw new Error("Assignment not found");
  if (assignment.session_id !== cleanText(input?.session_id, 100) || assignment.stratum_id !== cleanText(input?.stratum_id, 100)) throw new Error("Rating does not match assignment");

  const scores = validatedScores(input?.scores);
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  const row = {
    id: cleanText(input?.id || `rating_${crypto.randomUUID()}`, 200),
    assignmentId,
    participantUid,
    email,
    sessionId: assignment.session_id,
    stratumId: assignment.stratum_id,
    scoresJson: JSON.stringify(scores),
    total,
    comments: cleanText(input?.comments, 8000) || null,
    startedAt: cleanText(input?.started_at_utc, 80) || assignment.assigned_at,
    timestamp: cleanText(input?.timestamp_utc, 80) || new Date().toISOString(),
    duration: Math.max(0, Math.min(Number(input?.duration_seconds) || 0, 604800)),
    userAgent: cleanText(input?.user_agent || request.headers.get("user-agent"), 800),
    pageUrl: cleanText(input?.page_url, 1000),
  };
  const completedAt = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO ratings (
        id, assignment_id, participant_uid, participant_email, session_id, stratum_id,
        scores_json, total_score, comments, started_at_utc, timestamp_utc,
        duration_seconds, user_agent, page_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(assignment_id) DO UPDATE SET
        scores_json=excluded.scores_json, total_score=excluded.total_score,
        comments=excluded.comments, started_at_utc=excluded.started_at_utc,
        timestamp_utc=excluded.timestamp_utc, duration_seconds=excluded.duration_seconds,
        user_agent=excluded.user_agent, page_url=excluded.page_url,
        received_at=(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    ).bind(row.id, row.assignmentId, row.participantUid, row.email, row.sessionId, row.stratumId, row.scoresJson, row.total, row.comments, row.startedAt, row.timestamp, row.duration, row.userAgent, row.pageUrl),
    env.DB.prepare("UPDATE assignments SET status = 'completed', completed_at = ? WHERE id = ? AND participant_uid = ?").bind(completedAt, assignmentId, participantUid),
  ]);
  return { ...row, scores };
}

async function exportStudy(env, adminToken) {
  const configured = String(env.ADMIN_EXPORT_TOKEN || "");
  if (!configured || String(adminToken || "") !== configured) throw new Error("Invalid admin token");
  const [participants, assignments, ratings] = await Promise.all([
    env.DB.prepare("SELECT * FROM participants ORDER BY created_at ASC").all(),
    env.DB.prepare("SELECT * FROM assignments ORDER BY assigned_at ASC").all(),
    env.DB.prepare("SELECT * FROM ratings ORDER BY received_at ASC").all(),
  ]);
  return {
    exported_at_utc: new Date().toISOString(),
    participants: participants?.results || [],
    assignments: assignments?.results || [],
    ratings: ratings?.results || [],
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(env, origin);
    const allowed = allowedOrigins(env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (origin && allowed.length && !allowed.includes(origin)) return json({ error: "Origin not allowed" }, 403, headers);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, headers);

    const path = new URL(request.url).pathname;
    const body = await request.json().catch(() => ({}));
    try {
      if (path.endsWith("/api/access")) {
        const email = cleanText(body.email, 320).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email");
        await requireAccessCode(env, body.access_code);
        const participant = await findParticipantByEmail(env, email);
        if (!participant) return json({ ok: true, profile_complete: false, email }, 200, headers);
        const token = await makeToken(env, { participant_uid: participant.participant_id, email, exp: Date.now() + TOKEN_TTL_MS });
        return json({ ok: true, profile_complete: true, participant_id: participant.participant_id, profile: participant.profile, token }, 200, headers);
      }

      if (path.endsWith("/api/session")) {
        await requireAccessCode(env, body.access_code || body.profile?.access_code);
        const profile = requireProfile(body.profile);
        const participantUid = await upsertParticipant(env, profile);
        const token = await makeToken(env, { participant_uid: participantUid, email: profile.email, exp: Date.now() + TOKEN_TTL_MS });
        return json({ ok: true, participant_id: participantUid, token }, 200, headers);
      }

      if (path.endsWith("/api/export")) return json({ ok: true, data: await exportStudy(env, body.admin_token) }, 200, headers);

      const payload = await verifyToken(env, body.token);
      const participantUid = cleanText(payload.participant_uid, 100);
      if (path.endsWith("/api/history")) return json({ ok: true, ...(await history(env, participantUid)) }, 200, headers);
      if (path.endsWith("/api/next")) {
        const assignment = await nextAssignment(env, participantUid, body.study_version);
        return json({ ok: true, assignment, complete: !assignment }, 200, headers);
      }
      if (path.endsWith("/api/rating")) {
        const rating = await saveRating(env, body.rating, payload, request);
        return json({ ok: true, id: rating.id, total_score: rating.total }, 200, headers);
      }
      return json({ error: "Not found" }, 404, headers);
    } catch (error) {
      const message = error?.message || "Request failed";
      const status = ["Bad token", "Expired token"].includes(message) ? 401 : 400;
      return json({ error: message }, status, headers);
    }
  },
};
