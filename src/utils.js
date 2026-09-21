export function nowUtc() {
  return new Date().toISOString();
}

export function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function makeParticipantId(email) {
  return `P-${stableHash(String(email || "").trim().toLowerCase()).toString(16).padStart(8, "0")}`;
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sessionById(study, sessionId) {
  return study?.sessions?.find((session) => session.id === sessionId) || null;
}

export function chooseLocalAssignment(study, ratings, participantId) {
  const usedStrata = new Set((ratings || []).map((rating) => rating.stratum_id));
  const eligible = (study?.strata || []).filter((stratum) => !usedStrata.has(stratum.id));
  if (!eligible.length) return null;

  const index = stableHash(`${participantId}:${ratings.length}`) % eligible.length;
  const stratum = eligible[index];
  const sessionCounts = new Map();
  for (const rating of ratings || []) sessionCounts.set(rating.session_id, (sessionCounts.get(rating.session_id) || 0) + 1);
  const candidates = [...stratum.sessionIds].sort((a, b) => (sessionCounts.get(a) || 0) - (sessionCounts.get(b) || 0) || a.localeCompare(b));
  const sessionId = candidates[stableHash(`${participantId}:${stratum.id}`) % candidates.length];
  return {
    id: `local_${participantId}_${stratum.id}`,
    participant_uid: participantId,
    session_id: sessionId,
    stratum_id: stratum.id,
    ordinal: ratings.length + 1,
    assigned_at: nowUtc(),
  };
}

export function downloadJson(filename, payload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
