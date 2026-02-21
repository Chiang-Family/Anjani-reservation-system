export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Like Promise.all but limits concurrency to avoid overwhelming external APIs.
 * Modified to add a slight delay to respect Notion's 3 requests/sec limit.
 */
export async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 1
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
      // Add a 350ms delay between calls to respect external limits (e.g. Notion 3 Req/Sec)
      await sleep(350);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}
