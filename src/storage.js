const PREFIX = "ctrs_expert_review_v1";

export const STORAGE_KEYS = {
  accounts: `${PREFIX}:accounts`,
  profile: `${PREFIX}:profile`,
  ratings: `${PREFIX}:ratings`,
  assignment: `${PREFIX}:assignment`,
  token: `${PREFIX}:token`,
  draftPrefix: `${PREFIX}:draft:`,
};

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function clearSessionStorage() {
  localStorage.removeItem(STORAGE_KEYS.profile);
  localStorage.removeItem(STORAGE_KEYS.ratings);
  localStorage.removeItem(STORAGE_KEYS.assignment);
  localStorage.removeItem(STORAGE_KEYS.token);
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(STORAGE_KEYS.draftPrefix)) localStorage.removeItem(key);
  }
}
