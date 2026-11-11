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

export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}
