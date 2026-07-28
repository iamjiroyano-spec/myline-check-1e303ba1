// Cross-device sync: mirrors all `linecheck:*` localStorage keys (scoped to
// the signed-in user) to the `user_state` table. On sign-in we pull the
// remote snapshot; every local write is debounced and pushed back.
import { supabase } from "@/integrations/supabase/client";
import {
  getModifiedTimes,
  lsStore,
  getUserScope,
  setModifiedTimes,
  withoutDirtyTracking,
} from "@/lib/lsStore";

const PREFIX = "linecheck:";
const SYNC_META_KEY = "linecheck:__sync:modified";
let suppressPush = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;
let unsubWrite: (() => void) | null = null;

function collectSnapshot(): Record<string, string> {
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
  if (!currentUserId) return;
  if (isOffline()) {
    // Keep the change locally; it is pushed as soon as we're back online.
    pendingWhileOffline = true;
    return;
  }
  const data = collectSnapshot();
  try {
    const { error } = await supabase
      .from("user_state")
      .upsert(
        { user_id: currentUserId, data, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    pendingWhileOffline = false;
  } catch (e) {
    pendingWhileOffline = true;
    console.warn("[sync] push failed", e);
  }
}

function schedulePush() {
  if (suppressPush || !currentUserId) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushNow();
  }, 800);
}

function onBackOnline() {
  if (!currentUserId) return;
  if (pendingWhileOffline) void pushNow();
  else void pullFromServer();
}


function onLocalWrite() {
  schedulePush();
}

async function pullFromServer() {
  if (!currentUserId) return;
  try {
    const { data, error } = await supabase
      .from("user_state")
      .select("data")
      .eq("user_id", currentUserId)
      .maybeSingle();
    if (error) throw error;
    const remote = (data?.data ?? null) as Record<string, string> | null;
    if (!remote) {
      // No remote yet — push whatever we have locally so future devices see it.
      await pushNow();
      return;
    }
    const remoteMeta = parseRemoteMeta(remote);
    const localMeta = getModifiedTimes();
    const mergedMeta = mergeMeta(localMeta, remoteMeta);
    let hasLocalNewerChanges = false;
    suppressPush = true;
    try {
      // Merge safely: preserve local values when they are newer than the
      // server snapshot (or when both sides are legacy/unversioned). This
      // prevents a quick refresh from pulling an older cloud copy over items
      // the user just checked locally but had not pushed yet.
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
      // localKeys now contains local-only keys. Remove only when the server has
      // a newer tombstone; otherwise keep them and push the merged snapshot.
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
      suppressPush = false;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("linecheck:update"));
      window.dispatchEvent(new Event("linecheck:staff-update"));
      window.dispatchEvent(new Event("linecheck:brand-update"));
    }
    // If local data won any merge conflict, publish the merged snapshot so it
    // becomes the cloud source of truth instead of being lost on next refresh.
    if (hasLocalNewerChanges) void pushNow();
  } catch (e) {
    console.warn("[sync] pull failed", e);
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

function flushPendingPush() {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
    void pushNow();
  }
}

export async function startSync(userId: string) {
  if (currentUserId === userId) return;
  currentUserId = userId;
  // Make sure lsStore scope has been set to this user before pulling.
  if (getUserScope() !== userId) {
    // Scope is expected to be set by the auth listener; still safe to proceed.
  }
  if (typeof window !== "undefined" && !unsubWrite) {
    window.addEventListener("linecheck:local-write", onLocalWrite);
    window.addEventListener("pagehide", flushPendingPush);
    window.addEventListener("beforeunload", flushPendingPush);
    window.addEventListener("online", onBackOnline);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushPendingPush();
    });
    unsubWrite = () => {
      window.removeEventListener("linecheck:local-write", onLocalWrite);
      window.removeEventListener("pagehide", flushPendingPush);
      window.removeEventListener("beforeunload", flushPendingPush);
      window.removeEventListener("online", onBackOnline);
    };
  }
  if (!isOffline()) await pullFromServer();

}


export function stopSync() {
  currentUserId = null;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  if (unsubWrite) {
    unsubWrite();
    unsubWrite = null;
  }
}

export function isSuppressingPush() {
  return suppressPush;
}
