import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { lsStore } from "@/lib/lsStore";
import { compressImageFile } from "@/lib/image";
import { STAFF } from "@/lib/lineCheck";
import { Camera, Trash2, X, PackageCheck, Plus, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/receiving")({
  head: () => ({
    meta: [
      { title: "Receiving Checklist — Line Check 2026" },
      { name: "description", content: "Log incoming deliveries with photos, car temperature, driver, bill number and receiver." },
    ],
  }),
  component: ReceivingPage,
});

const LS_KEY = "linecheck:receiving";

type ReceivingRecord = {
  id: string;
  createdAt: string; // ISO
  date: string;      // YYYY-MM-DD
  time: string;      // HH:mm
  branch: string;
  checkedBy: string;
  driver: string;
  billNumber: string;
  carTemp: string;   // free text with unit
  notes: string;
  photos: string[];  // base64 data urls
};

function loadRecords(): ReceivingRecord[] {
  try {
    const raw = lsStore.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveRecords(list: ReceivingRecord[]) {
  lsStore.setItem(LS_KEY, JSON.stringify(list));
}

function nowParts() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function ReceivingPage() {
  const [records, setRecords] = useState<ReceivingRecord[]>(() => loadRecords());
  const [form, setForm] = useState(() => {
    const { date, time } = nowParts();
    return {
      date,
      time,
      branch: "",
      checkedBy: "",
      driver: "",
      billNumber: "",
      carTemp: "",
      notes: "",
      photos: [] as string[],
    };
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setRecords(loadRecords());
    window.addEventListener("linecheck:update", refresh);
    window.addEventListener("linecheck:scope-change", refresh);
    return () => {
      window.removeEventListener("linecheck:update", refresh);
      window.removeEventListener("linecheck:scope-change", refresh);
    };
  }, []);

  const sorted = useMemo(
    () => [...records].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [records],
  );

  async function addPhoto(file: File | null | undefined) {
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file);
      setForm((f) => ({ ...f, photos: [...f.photos, dataUrl] }));
    } catch (e) {
      console.warn("photo failed", e);
    }
  }

  function removePhoto(idx: number) {
    setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }));
  }

  function resetForm() {
    const { date, time } = nowParts();
    setForm({
      date, time,
      branch: "",
      checkedBy: "",
      driver: "",
      billNumber: "",
      carTemp: "",
      notes: "",
      photos: [],
    });
  }

  function submit() {
    if (!form.checkedBy.trim()) {
      alert("Please select who checked the delivery.");
      return;
    }
    const rec: ReceivingRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      date: form.date,
      time: form.time,
      branch: form.branch.trim(),
      checkedBy: form.checkedBy.trim(),
      driver: form.driver.trim(),
      billNumber: form.billNumber.trim(),
      carTemp: form.carTemp.trim(),
      notes: form.notes.trim(),
      photos: form.photos,
    };
    const next = [rec, ...records];
    setRecords(next);
    saveRecords(next);
    resetForm();
  }

  function deleteRecord(id: string) {
    if (!confirm("Delete this receiving record?")) return;
    const next = records.filter((r) => r.id !== id);
    setRecords(next);
    saveRecords(next);
  }

  const staff = STAFF;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
            <PackageCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Receiving Checklist</h1>
            <p className="text-sm text-muted-foreground">
              Log incoming deliveries with proof photos and driver details.
            </p>
          </div>
        </header>

        {/* New entry form */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            New delivery
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Time">
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Branch">
              <input
                type="text"
                value={form.branch}
                onChange={(e) => setForm({ ...form, branch: e.target.value })}
                placeholder="e.g. Main Kitchen"
                className={inputCls}
              />
            </Field>
            <Field label="Checked by *">
              <select
                value={form.checkedBy}
                onChange={(e) => setForm({ ...form, checkedBy: e.target.value })}
                className={inputCls}
              >
                <option value="">Select team member…</option>
                {staff.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Driver">
              <input
                type="text"
                value={form.driver}
                onChange={(e) => setForm({ ...form, driver: e.target.value })}
                placeholder="Driver name"
                className={inputCls}
              />
            </Field>
            <Field label="Bill / Invoice #">
              <input
                type="text"
                value={form.billNumber}
                onChange={(e) => setForm({ ...form, billNumber: e.target.value })}
                placeholder="e.g. INV-00123"
                className={inputCls}
              />
            </Field>
            <Field label="Car temperature">
              <input
                type="text"
                value={form.carTemp}
                onChange={(e) => setForm({ ...form, carTemp: e.target.value })}
                placeholder="e.g. 3°C"
                className={inputCls}
              />
            </Field>
            <Field label="Notes">
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional"
                className={inputCls}
              />
            </Field>
          </div>

          {/* Photos */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Photos
              </span>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">
                <Camera className="h-4 w-4" />
                Add photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    addPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {form.photos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-background/40 px-3 py-4 text-center text-xs text-muted-foreground">
                No photos attached yet.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {form.photos.map((src, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-border">
                    <img
                      src={src}
                      alt={`Delivery photo ${i + 1}`}
                      className="h-full w-full cursor-zoom-in object-cover"
                      onClick={() => setViewer(src)}
                    />
                    <button
                      onClick={() => removePhoto(i)}
                      aria-label="Remove photo"
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={resetForm}
              className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Clear
            </button>
            <button
              onClick={submit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Save delivery
            </button>
          </div>
        </section>

        {/* History */}
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            History ({sorted.length})
          </h2>
          {sorted.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">
              No deliveries logged yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((r) => {
                const open = expanded === r.id;
                return (
                  <li key={r.id} className="rounded-2xl border border-border bg-card">
                    <button
                      onClick={() => setExpanded(open ? null : r.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {r.date} · {r.time}
                          {r.branch ? ` · ${r.branch}` : ""}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          Checked by {r.checkedBy || "—"}
                          {r.driver ? ` · Driver: ${r.driver}` : ""}
                          {r.billNumber ? ` · Bill: ${r.billNumber}` : ""}
                        </p>
                      </div>
                      {r.photos.length > 0 && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                          {r.photos.length} 📷
                        </span>
                      )}
                      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    {open && (
                      <div className="border-t border-border px-4 py-3">
                        <dl className="grid gap-2 text-sm sm:grid-cols-2">
                          <Info label="Branch" value={r.branch} />
                          <Info label="Checked by" value={r.checkedBy} />
                          <Info label="Driver" value={r.driver} />
                          <Info label="Bill #" value={r.billNumber} />
                          <Info label="Car temp" value={r.carTemp} />
                          <Info label="Date / Time" value={`${r.date} ${r.time}`} />
                          {r.notes && (
                            <div className="sm:col-span-2">
                              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Notes</dt>
                              <dd className="text-foreground">{r.notes}</dd>
                            </div>
                          )}
                        </dl>

                        {r.photos.length > 0 && (
                          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {r.photos.map((src, i) => (
                              <button
                                key={i}
                                onClick={() => setViewer(src)}
                                className="aspect-square overflow-hidden rounded-lg border border-border"
                              >
                                <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={() => deleteRecord(r.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {viewer && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setViewer(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
        >
          <img src={viewer} alt="Photo" className="max-h-full max-w-full rounded-lg" />
          <button
            onClick={(e) => { e.stopPropagation(); setViewer(null); }}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-black hover:bg-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </AppShell>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value || "—"}</dd>
    </div>
  );
}
