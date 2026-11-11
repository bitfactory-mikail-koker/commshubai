import type { Json } from "@/lib/database.types";

export type JsonValue = NonNullable<Json>;

/** Casts a plain serializable value to the Supabase Json column type. */
export function toJson(value: unknown): JsonValue {
  return value as JsonValue;
}

/** Reads a JSON column as a typed value with a fallback. */
export function fromJson<T>(value: Json | null | undefined, fallback: T): T {
  return value === null || value === undefined ? fallback : (value as unknown as T);
}
