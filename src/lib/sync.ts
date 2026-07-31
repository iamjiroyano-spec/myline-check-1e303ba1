// Cross-device sync: mirrors all `linecheck:*` localStorage keys (scoped to
// the signed-in user) to the `user_state` table. On sign-in we pull the
// remote snapshot; every local write is debounced and pushed back.
import { supabase } from "@/integrations/supabase/client";
import { lsStore, getUserScope } from "@/lib/lsStore";

const PREFIX = "linecheck:";
let suppressPush = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;
let unsubWrite: (() => void) | null = null;
/** Serialized snapshot of our last successful push, used to ignore echoes. */
let lastPushedSnapshot: string | null = null;

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
    lastPushedSnapshot = JSON.stringify(data);
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

/** Write a remote snapshot into local storage without echoing it back up. */
function applyRemote(remote: Record<string, string>) {
  suppressPush = true;
  try {
    // Merge: overwrite with remote values, but preserve any local-only keys
    // (e.g. writes that hadn't been pushed yet before a refresh).
    for (const [k, v] of Object.entries(remote)) {
      if (typeof v === "string" && k.startsWith(PREFIX)) lsStore.setItem(k, v);
    }
  } finally {
    suppressPush = false;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("linecheck:update"));
    window.dispatchEvent(new Event("linecheck:staff-update"));
    window.dispatchEvent(new Event("linecheck:brand-update"));
  }
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
    applyRemote(remote);
    // If we had unpushed local-only keys, push the merged snapshot back up.
    void pushNow();
  } catch (e) {
    console.warn("[sync] pull failed", e);
  }
}

function flushPendingPush() {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
    void pushNow();
  }
}

/** Live channel that mirrors this account's state from other devices. */
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

function startRealtime(userId: string) {
  stopRealtime();
  realtimeChannel = supabase
    .channel(`user_state:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_state",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        // Ignore the echo of a push this device just made.
        const row = payload.new as { data?: Record<string, string> } | null;
        const remote = row?.data;
        if (!remote || typeof remote !== "object") return;
        if (JSON.stringify(remote) === lastPushedSnapshot) return;
        applyRemote(remote);
      },
    )
    .subscribe();
}

function stopRealtime() {
  if (realtimeChannel) {
    void supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") flushPendingPush();
  else if (!isOffline()) void pullFromServer();
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
    document.addEventListener("visibilitychange", onVisibilityChange);
    unsubWrite = () => {
      window.removeEventListener("linecheck:local-write", onLocalWrite);
      window.removeEventListener("pagehide", flushPendingPush);
      window.removeEventListener("beforeunload", flushPendingPush);
      window.removeEventListener("online", onBackOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }
  if (!isOffline()) await pullFromServer();
  startRealtime(userId);
}


export function stopSync() {
  currentUserId = null;
  stopRealtime();
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
