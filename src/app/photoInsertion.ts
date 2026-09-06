export type InsertionEdge = 'BEFORE' | 'AFTER';

/** Translate a visual gap into the reducer's insert-before identity. */
export function insertionBeforeId(ids: string[], dragged: string, target: string, edge: InsertionEdge): string | null {
  if (dragged === target || !ids.includes(target)) return ids[ids.indexOf(dragged) + 1] ?? null;
  const remaining = ids.filter((id) => id !== dragged);
  const index = remaining.indexOf(target) + (edge === 'AFTER' ? 1 : 0);
  return remaining[index] ?? null;
}
