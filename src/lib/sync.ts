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

function collectSnapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of lsStore.keys()) {
    if (!k.startsWith(PREFIX)) continue;
    const v = lsStore.getItem(k);
    if (v != null) out[k] = v;
  }
  return out;
}

async function pushNow() {
  if (!currentUserId) return;
  const data = collectSnapshot();
  try {
    await supabase
      .from("user_state")
      .upsert(
        { user_id: currentUserId, data, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  } catch (e) {
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
    suppressPush = true;
    try {
      // Clear existing scoped linecheck:* keys, then hydrate from remote.
      for (const k of lsStore.keys()) {
        if (k.startsWith(PREFIX)) lsStore.removeItem(k);
      }
      for (const [k, v] of Object.entries(remote)) {
        if (typeof v === "string" && k.startsWith(PREFIX)) {
          lsStore.setItem(k, v);
        }
      }
    } finally {
      suppressPush = false;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("linecheck:update"));
      window.dispatchEvent(new Event("linecheck:staff-update"));
      window.dispatchEvent(new Event("linecheck:brand-update"));
    }
  } catch (e) {
    console.warn("[sync] pull failed", e);
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
    unsubWrite = () =>
      window.removeEventListener("linecheck:local-write", onLocalWrite);
  }
  await pullFromServer();
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
