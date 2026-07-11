/**
 * Maps over items with at most `limit` in flight at once. Gmail and Graph
 * both throttle concurrent per-user requests well below a 100-item page
 * (Gmail returns 429 "Too many concurrent requests for user" past roughly
 * 10), so an unbounded Promise.all over a full page reliably trips it.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
