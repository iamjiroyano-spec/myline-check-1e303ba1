import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lsStore } from "@/lib/lsStore";

const checksSchema = z.record(z.string(), z.boolean()).catch({});

export const sharedClosingPayloadSchema = z.object({
  id: z.string(),
  createdAt: z.string().catch(""),
  date: z.string().catch(""),
  time: z.string().catch(""),
  branch: z.string().catch(""),
  closedBy: z.string().catch(""),
  crew: z
    .array(
      z.object({
        member: z.string().catch(""),
        stations: z.array(z.string()).catch([]),
      }),
    )
    .catch([]),
  checks: checksSchema,
  notes: z.string().catch(""),
  photos: z.array(z.string()).catch([]),
  brand_name: z.string().catch("LUMA"),
});

export type SharedClosingPayload = z.infer<typeof sharedClosingPayloadSchema>;

export async function publishSharedClosing(
  record: Record<string, unknown> & { id: string },
): Promise<string> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Sign in required to share");
  const owner_id = userData.user.id;
  const brand_name = lsStore.getItem("linecheck:settings:brand:name") || "LUMA";
  const payload = { ...record, brand_name };

  const { data, error } = await supabase
    .from("shared_closings")
    .upsert(
      {
        owner_id,
        record_id: record.id,
        brand_name,
        payload: JSON.parse(JSON.stringify(payload)),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,record_id" },
    )
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Failed to publish share");
  return `${window.location.origin}/c/${data.id}`;
}
