import slugify from "slugify";

export function toSlug(value: string, options: { separator?: string; maxLength: number; fallback?: string }): string {
  const separator = options.separator ?? "-";
  const slug = slugify(value, { replacement: separator, lower: true, strict: true, trim: true })
    .slice(0, options.maxLength)
    .replaceAll(new RegExp(`^${separator}+|${separator}+$`, "g"), "");
  return slug || (options.fallback ?? "");
}
