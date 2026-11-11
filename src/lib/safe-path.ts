const INTERNAL_ORIGIN = "http://internal.invalid";
const FORBIDDEN = /[\\\u0000-\u001f\u007f]/;

export function safeNextPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || FORBIDDEN.test(value)) return fallback;
  if (!URL.canParse(value, INTERNAL_ORIGIN)) return fallback;
  const url = new URL(value, INTERNAL_ORIGIN);
  if (url.origin !== INTERNAL_ORIGIN) return fallback;
  const normalized = `${url.pathname}${url.search}${url.hash}`;
  return normalized.startsWith("//") ? fallback : normalized;
}
