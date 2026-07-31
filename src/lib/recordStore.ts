// Helpers that keep report history intact when a user saves a change.
//
// Records live in localStorage and are also synced from other devices, so the
// in-memory React state can be stale. Every write therefore re-reads the
// freshest list, applies the change to it, and de-duplicates by id so past
// history is never dropped and the same entry is never stored twice.

export type BaseRecord = { id: string; createdAt: string };

/** Remove duplicate ids (keeping the newest version) and sort newest first. */
export function dedupeRecords<T extends BaseRecord>(list: T[]): T[] {
  const byId = new Map<string, T>();
  for (const r of list) {
    if (!r || typeof r.id !== "string") continue;
    byId.set(r.id, r);
  }
  return [...byId.values()].sort((a, b) =>
    (a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1,
  );
}

/**
 * Apply `mutate` to the freshest stored list (not the possibly stale React
 * state), persist the de-duplicated result and return it.
 */
export function commitRecords<T extends BaseRecord>(
  load: () => T[],
  save: (list: T[]) => void,
  mutate: (latest: T[]) => T[],
): T[] {
  const next = dedupeRecords(mutate(dedupeRecords(load())));
  save(next);
  return next;
}

/**
 * Upsert a record: if the id already exists it is updated in place (keeping
 * its original createdAt), otherwise it is added. Prevents the "multi-save"
 * duplicates caused by double submits or stale state.
 */
export function upsertRecord<T extends BaseRecord>(
  load: () => T[],
  save: (list: T[]) => void,
  record: T,
): T[] {
  return commitRecords(load, save, (latest) => {
    const idx = latest.findIndex((r) => r.id === record.id);
    if (idx === -1) return [record, ...latest];
    const next = [...latest];
    next[idx] = { ...latest[idx], ...record, createdAt: latest[idx].createdAt };
    return next;
  });
}

/** Remove a record by id from the freshest stored list. */
export function removeRecord<T extends BaseRecord>(
  load: () => T[],
  save: (list: T[]) => void,
  id: string,
): T[] {
  return commitRecords(load, save, (latest) => latest.filter((r) => r.id !== id));
}
