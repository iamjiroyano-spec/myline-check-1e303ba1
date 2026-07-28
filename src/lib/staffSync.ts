// Sync for PIN (name + PIN) team-member sessions. Uses public server
// functions that verify the PIN server-side and read/write the owner's
// synced state.
import { getModifiedTimes, lsStore, setModifiedTimes, withoutDirtyTracking } from "@/lib/lsStore";
import type { StaffSession } from "@/lib/staffSession";
import { staffPullState, staffPushState } from "@/lib/staffAuth.functions";

const PREFIX = "linecheck:";
const SYNC_META_KEY = "linecheck:__sync:modified";
let session: StaffSession | null = null;
let suppress = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let unsub: (() => void) | null = null;

function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of lsStore.keys()) {
    if (!k.startsWith(PREFIX)) continue;
    const v = lsStore.getItem(k);
    if (v != null) out[k] = v;
  }
  return out;
}

let pendingWhileOffline = false;

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function pushNow() {
  if (!session) return;
  if (isOffline()) {
    pendingWhileOffline = true;
    return;
  }
  try {
    await staffPushState({
      data: { name: session.name, pin: session.pin, patch: snapshot() },
    });
    pendingWhileOffline = false;
  } catch (e) {
    pendingWhileOffline = true;
    console.warn("[staff-sync] push failed", e);
  }
}

function onBackOnline() {
  if (session && pendingWhileOffline) void pushNow();
}

function schedulePush() {
  if (suppress || !session) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void pushNow();
  }, 900);
}


function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    void pushNow();
  }
}

export async function startStaffSync(s: StaffSession) {
  if (session && session.id === s.id) return;
  session = s;
  if (typeof window !== "undefined" && !unsub) {
    const onWrite = () => schedulePush();
    window.addEventListener("linecheck:local-write", onWrite);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    window.addEventListener("online", onBackOnline);
    unsub = () => {
      window.removeEventListener("linecheck:local-write", onWrite);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("online", onBackOnline);
    };
  }
  if (isOffline()) return; // keep working from local data
  try {
    const res = await staffPullState({ data: { name: s.name, pin: s.pin } });

    const remote = res?.ok ? res.state : null;
    if (remote) {
      const remoteMeta = parseRemoteMeta(remote);
      const localMeta = getModifiedTimes();
      const mergedMeta = mergeMeta(localMeta, remoteMeta);
      let hasLocalNewerChanges = false;
      suppress = true;
      try {
        const localKeys = new Set(
          lsStore.keys().filter((k) => k.startsWith(PREFIX) && k !== SYNC_META_KEY),
        );
        for (const [k, v] of Object.entries(remote)) {
          if (typeof v !== "string" || !k.startsWith(PREFIX) || k === SYNC_META_KEY) continue;
          const localValue = lsStore.getItem(k);
          const localTime = localMeta[k] ?? 0;
          const remoteTime = remoteMeta[k] ?? 0;
          if (localValue != null && localTime >= remoteTime && localValue !== v) {
            hasLocalNewerChanges = true;
            localKeys.delete(k);
            continue;
          }
          withoutDirtyTracking(() => lsStore.setItem(k, v));
          localKeys.delete(k);
        }
        for (const k of localKeys) {
          const localTime = localMeta[k] ?? 0;
          const remoteTime = remoteMeta[k] ?? 0;
          if (remoteTime > localTime) {
            withoutDirtyTracking(() => lsStore.removeItem(k));
          } else {
            hasLocalNewerChanges = true;
          }
        }
        withoutDirtyTracking(() => setModifiedTimes(mergedMeta));
      } finally {
        suppress = false;
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("linecheck:update"));
        window.dispatchEvent(new Event("linecheck:staff-update"));
        window.dispatchEvent(new Event("linecheck:members-update"));
        window.dispatchEvent(new Event("linecheck:brand-update"));
      }
      if (hasLocalNewerChanges) void pushNow();
    }
  } catch (e) {
    console.warn("[staff-sync] pull failed", e);
  }
}

function parseRemoteMeta(remote: Record<string, string>): Record<string, number> {
  try {
    const parsed = JSON.parse(remote[SYNC_META_KEY] || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function mergeMeta(a: Record<string, number>, b: Record<string, number>) {
  const out: Record<string, number> = { ...a };
  for (const [key, value] of Object.entries(b)) out[key] = Math.max(out[key] ?? 0, value);
  return out;
}

export function stopStaffSync() {
  session = null;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (unsub) {
    unsub();
    unsub = null;
  }
}
