import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";

export function hashPin(name: string, pin: string) {
  return createHash("sha256")
    .update(`linecheck:${name.trim().toLowerCase()}:${pin.trim()}`, "utf8")
    .digest("hex");
}

type Creds = { name: string; pin: string };

function validCreds(input: Creds): Creds {
  const name = String(input?.name ?? "").trim();
  const pin = String(input?.pin ?? "").trim();
  if (!name || name.length > 60) throw new Error("Invalid name");
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN must be 4-8 digits");
  return { name, pin };
}

async function verify(creds: Creds) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("staff_logins")
    .select("id, owner_id, name, pin_hash")
    .ilike("name", creds.name)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.pin_hash !== hashPin(creds.name, creds.pin)) return null;
  return data;
}

/** Public: exchange a team member's name + PIN for their owner scope. */
export const staffLogin = createServerFn({ method: "POST" })
  .inputValidator((input: Creds) => validCreds(input))
  .handler(async ({ data }) => {
    const row = await verify(data);
    if (!row) return { ok: false as const };
    return { ok: true as const, id: row.id, name: row.name, ownerId: row.owner_id };
  });

/** Public: read the owner's synced app state on behalf of a verified PIN user. */
export const staffPullState = createServerFn({ method: "POST" })
  .inputValidator((input: Creds) => validCreds(input))
  .handler(async ({ data }) => {
    const row = await verify(data);
    if (!row) return { ok: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: state, error } = await supabaseAdmin
      .from("user_state")
      .select("data")
      .eq("user_id", row.owner_id)
      .maybeSingle();
    if (error) throw error;
    return { ok: true as const, state: (state?.data ?? null) as Record<string, string> | null };
  });

/** Public: merge keys back into the owner's synced app state. */
export const staffPushState = createServerFn({ method: "POST" })
  .inputValidator((input: Creds & { patch: Record<string, string> }) => ({
    ...validCreds(input),
    patch: input.patch && typeof input.patch === "object" ? input.patch : {},
  }))
  .handler(async ({ data }) => {
    const row = await verify(data);
    if (!row) return { ok: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: state } = await supabaseAdmin
      .from("user_state")
      .select("data")
      .eq("user_id", row.owner_id)
      .maybeSingle();
    const merged = { ...((state?.data ?? {}) as Record<string, string>) };
    for (const [k, v] of Object.entries(data.patch)) {
      if (typeof v === "string" && k.startsWith("linecheck:")) merged[k] = v;
    }
    const { error } = await supabaseAdmin.from("user_state").upsert(
      { user_id: row.owner_id, data: merged, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    return { ok: true as const };
  });
