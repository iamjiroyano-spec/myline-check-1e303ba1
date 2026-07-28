// Per-user scoped localStorage wrapper.
// Keys are transparently namespaced with the current user id so multiple
// accounts on the same browser stay isolated. Default scope is "guest".

let currentUid = "guest";
const listeners = new Set<() => void>();
const SYNC_META_KEY = "linecheck:__sync:modified";
let dirtyTrackingSuppressed = 0;

export function setUserScope(uid: string | null) {
  const next = uid || "guest";
  if (next === currentUid) return;
  currentUid = next;
  for (const fn of listeners) fn();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("linecheck:scope-change"));
  }
}

export function getUserScope() {
  return currentUid;
}

export function onScopeChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function scopedKey(raw: string) {
  return `u:${currentUid}:${raw}`;
}

function safe(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function emitWrite() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("linecheck:local-write"));
  }
}

function readModifiedMap(): Record<string, number> {
  const s = safe();
  if (!s) return {};
  try {
    const raw = s.getItem(scopedKey(SYNC_META_KEY));
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key === "string" && typeof value === "number" && Number.isFinite(value)) {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeModifiedMap(map: Record<string, number>) {
  const s = safe();
  if (!s) return;
  try {
    s.setItem(scopedKey(SYNC_META_KEY), JSON.stringify(map));
  } catch {}
}

function touchModified(key: string) {
  if (dirtyTrackingSuppressed > 0) return;
  if (!key.startsWith("linecheck:") || key === SYNC_META_KEY) return;
  const map = readModifiedMap();
  map[key] = Date.now();
  writeModifiedMap(map);
}

export function getModifiedTimes() {
  return readModifiedMap();
}

export function setModifiedTimes(map: Record<string, number>) {
  writeModifiedMap(map);
}

export function withoutDirtyTracking<T>(fn: () => T): T {
  dirtyTrackingSuppressed++;
  try {
    return fn();
  } finally {
    dirtyTrackingSuppressed--;
  }
}

export const lsStore = {
  getItem(key: string) {
    const s = safe();
    return s ? s.getItem(scopedKey(key)) : null;
  },
  setItem(key: string, value: string) {
    const s = safe();
    if (s) {
      s.setItem(scopedKey(key), value);
      touchModified(key);
    }
    emitWrite();
  },
  removeItem(key: string) {
    const s = safe();
    if (s) {
      s.removeItem(scopedKey(key));
      touchModified(key);
    }
    emitWrite();
  },
  /** List raw (un-prefixed) keys belonging to the current user. */
  keys(): string[] {
    const s = safe();
    if (!s) return [];
    const prefix = `u:${currentUid}:`;
    const out: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
    }
    return out;
  },
};
