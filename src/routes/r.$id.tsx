import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  sharedReceivingPayloadSchema,
  type SharedReceivingPayload,
} from "@/lib/receivingShare";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  Clock,
  Thermometer,
  Truck,
  User,
  FileText,
} from "lucide-react";

export const Route = createFileRoute("/r/$id")({
  head: () => ({
    meta: [
      { title: "Shared Receiving Record — Line Check" },
      { name: "description", content: "Read-only shared receiving checklist record." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedReceivingView,
});

function SharedReceivingView() {
  const { id } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    payload: SharedReceivingPayload;
    updated_at: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .rpc("get_shared_receiving", { _id: id })
      .then(({ data: rows, error: err }) => {
        if (!active) return;
        const row = Array.isArray(rows) ? rows[0] : null;
        if (err) setError(err.message);
        else if (!row) setError("This share link no longer exists.");
        else {
          const parsed = sharedReceivingPayloadSchema.safeParse(row.payload);
          if (!parsed.success) {
            console.error("[shared receiving] invalid payload", parsed.error);
            setError("This shared record is incomplete or corrupted.");
          } else {
            setData({
              payload: parsed.data,
              updated_at: row.updated_at ?? new Date().toISOString(),
            });
          }
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4 text-center">
        <div>
          <h1 className="text-xl font-bold">Share unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error ?? "Not found."}</p>
          <Link to="/" className="mt-4 inline-block text-sm font-semibold underline">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  const p = data.payload;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-foreground text-background text-sm font-bold">
              {(p.brand_name || "L").charAt(0).toUpperCase()}
            </span>
            <span className="text-sm font-bold tracking-tight">{p.brand_name}</span>
          </div>
          <span className="rounded-full bg-muted/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Read-only
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-black tracking-tight">Store Receiving Item Checklist</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Last updated {new Date(data.updated_at).toLocaleString()}
        </p>

        <section className="mt-5 rounded-3xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Chip icon={<Calendar className="h-3.5 w-3.5" />}>{p.date}</Chip>
            <Chip icon={<Clock className="h-3.5 w-3.5" />}>{p.time}</Chip>
            {p.branch && <Chip icon={<FileText className="h-3.5 w-3.5" />}>{p.branch}</Chip>}
            {p.driver && <Chip icon={<Truck className="h-3.5 w-3.5" />}>{p.driver}</Chip>}
            {(p.receiverName || p.checkedBy) && (
              <Chip icon={<User className="h-3.5 w-3.5" />}>
                {p.receiverName || p.checkedBy}
              </Chip>
            )}
          </div>

          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Delivery Note / Invoice #" value={p.deliveryNote} />
            <Info label="Purchase Order #" value={p.purchaseOrder} />
            <Info
              label="Chiller Car Temp"
              value={p.chillerCarTemp ? `${p.chillerCarTemp} °C` : ""}
              icon={<Thermometer className="h-3.5 w-3.5" />}
            />
            <Info
              label="Product Temp"
              value={p.productTemp ? `${p.productTemp} °C` : ""}
              icon={<Thermometer className="h-3.5 w-3.5" />}
            />
            <Info label="Checked by" value={p.checkedBy} />
            <Info label="Receiver" value={p.receiverName} />
            <Info label="Signature" value={p.signature} />
          </dl>
        </section>

        <div className="mt-6 grid gap-3">
          <ChecklistCard title="1. Temperature Check" checks={p.tempChecks} />
          <ChecklistCard title="2. Quantity Check" checks={p.quantityChecks} />
          <ChecklistCard title="3. Quality Check" checks={p.qualityChecks} />
        </div>

        {p.comments && (
          <section className="mt-6 rounded-2xl border border-border bg-card p-5">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Comments
            </p>
            <p className="whitespace-pre-wrap text-sm">{p.comments}</p>
          </section>
        )}

        {p.photos.length > 0 && (
          <section className="mt-6 rounded-2xl border border-border bg-card p-5">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Photos ({p.photos.length})
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {p.photos.map((src, i) => (
                <a
                  key={i}
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="aspect-square overflow-hidden rounded-lg border border-border"
                >
                  <img
                    src={src}
                    alt={`Photo ${i + 1}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1 text-xs font-semibold">
      {icon}
      {children}
    </span>
  );
}

function Info({
  label,
  value,
  icon,
}: {
  label: string;
  value?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-foreground">{value || "—"}</dd>
    </div>
  );
}

function ChecklistCard({
  title,
  checks,
}: {
  title: string;
  checks: Record<string, boolean>;
}) {
  const items = Object.keys(checks || {});
  if (items.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-3 text-sm font-black uppercase tracking-wider">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((it) => {
          const ok = !!checks[it];
          return (
            <li key={it} className="flex items-center gap-2 text-sm">
              {ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              )}
              <span className={ok ? "" : "text-muted-foreground"}>{it}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
