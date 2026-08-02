import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lsStore } from "@/lib/lsStore";
import { optimizePayload, getCachedShareUrl, setCachedShareUrl } from "@/lib/shareOptimize";
import { getStaffSession } from "@/lib/staffSession";
import { staffPublishShare } from "@/lib/staffShare.functions";


const checksSchema = z.record(z.string(), z.boolean()).catch({});

export const sharedReceivingPayloadSchema = z.object({
  id: z.string(),
  createdAt: z.string().catch(""),
  date: z.string().catch(""),
  time: z.string().catch(""),
  branch: z.string().catch(""),
  driver: z.string().catch(""),
  deliveryNote: z.string().catch(""),
  purchaseOrder: z.string().catch(""),
  chillerCarTemp: z.string().catch(""),
  productTemp: z.string().catch(""),
  tempChecks: checksSchema,
  quantityChecks: checksSchema,
  qualityChecks: checksSchema,
  receiverName: z.string().catch(""),
  signature: z.string().catch(""),
  comments: z.string().catch(""),
  checkedBy: z.string().catch(""),
  photos: z.array(z.string()).catch([]),
  brand_name: z.string().catch("LUMA"),
});

export type SharedReceivingPayload = z.infer<typeof sharedReceivingPayloadSchema>;

export async function publishSharedReceiving(
  record: Record<string, unknown> & { id: string },
): Promise<string> {
  const brand_name =
    lsStore.getItem("linecheck:settings:brand:name") || "LUMA";
  const payload = { ...record, brand_name };

  const staff = getStaffSession();
  if (staff) {
    const { id } = await staffPublishShare({
      data: {
        name: staff.name,
        pin: staff.pin,
        kind: "receiving",
        record_id: record.id,
        brand_name,
        payload: JSON.parse(JSON.stringify(payload)),
      },
    });
    return `${window.location.origin}/r/${id}`;
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Sign in required to share");
  const owner_id = userData.user.id;


  const { data, error } = await supabase
    .from("shared_receivings")
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
  return `${window.location.origin}/r/${data.id}`;
}
