import pLimit from "p-limit";

export const DEFAULT_CONCURRENCY = 4;

export async function mapConcurrent<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<R[]> {
  const limit = pLimit(concurrency);
  return Promise.all(items.map((item, index) => limit(() => fn(item, index))));
}

export type Settled<R> = { ok: true; value: R } | { ok: false; error: unknown };

export async function mapSettled<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<Settled<R>[]> {
  return mapConcurrent(
    items,
    async (item, index): Promise<Settled<R>> => {
      try {
        return { ok: true, value: await fn(item, index) };
      } catch (error) {
        return { ok: false, error };
      }
    },
    concurrency,
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let start = 0; start < items.length; start += size) parts.push(items.slice(start, start + size));
  return parts;
}

export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}
