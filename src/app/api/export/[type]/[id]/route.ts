import { getSession } from "@/lib/auth";
import { escapeHtml, stripHtml } from "@/lib/format";
import { htmlToParagraphs } from "@/lib/redactie/diff";
import { sanitizeHtml } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Klaarzetten: download a piece that is ready for publication as plain text
 * or clean HTML. Reads through the user's own session, so RLS decides who may
 * download what. Only approved (or later) content can be exported.
 */
const READY = ["approved", "scheduled", "published", "sent"];

const slug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "stuk";

function htmlDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body>
${body}
</body>
</html>
`;
}

export async function GET(request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { type, id } = await context.params;
  const format = new URL(request.url).searchParams.get("format") === "html" ? "html" : "txt";
  const db = await createClient();

  let title = "";
  let html = "";
  if (type === "article") {
    const { data } = await db.from("articles").select("title, subtitle, body_html, status").eq("id", id).maybeSingle();
    if (!data) return new Response("Not found", { status: 404 });
    if (!READY.includes(data.status)) return new Response("Dit stuk is nog niet goedgekeurd.", { status: 409 });
    title = data.title;
    html = `<h1>${escapeHtml(data.title)}</h1>\n${data.subtitle ? `<p><em>${escapeHtml(data.subtitle)}</em></p>\n` : ""}${sanitizeHtml(data.body_html)}`;
  } else if (type === "newsletter") {
    const { data } = await db.from("newsletters").select("title, subject, intro_html, outro_html, status").eq("id", id).maybeSingle();
    if (!data) return new Response("Not found", { status: 404 });
    if (!READY.includes(data.status)) return new Response("Deze editie is nog niet goedgekeurd.", { status: 409 });
    const { data: items } = await db
      .from("newsletter_items")
      .select("section, custom_title, custom_summary, position, article:articles(title, excerpt)")
      .eq("newsletter_id", id)
      .eq("included", true)
      .order("position", { ascending: true });
    title = data.subject ?? data.title;
    const sections: string[] = [];
    let current = "";
    for (const item of items ?? []) {
      if (item.section !== current) {
        current = item.section;
        sections.push(`<h2>${escapeHtml(current)}</h2>`);
      }
      const itemTitle = item.custom_title ?? item.article?.title ?? "";
      const summary = item.custom_summary ?? item.article?.excerpt ?? "";
      sections.push(`<h3>${escapeHtml(itemTitle)}</h3>\n<p>${escapeHtml(summary)}</p>`);
    }
    html = `<h1>${escapeHtml(title)}</h1>\n${sanitizeHtml(data.intro_html)}\n${sections.join("\n")}\n${sanitizeHtml(data.outro_html)}`;
  } else if (type === "social_post") {
    const { data } = await db.from("social_posts").select("body, platform, status").eq("id", id).maybeSingle();
    if (!data) return new Response("Not found", { status: 404 });
    if (!READY.includes(data.status)) return new Response("Deze post is nog niet goedgekeurd.", { status: 409 });
    title = `Social post ${data.platform}`;
    html = data.body
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join("\n");
  } else {
    return new Response("Not found", { status: 404 });
  }

  const body = format === "html" ? htmlDocument(title, html) : `${htmlToParagraphs(html).split("\n").join("\n\n")}\n`;
  return new Response(body, {
    headers: {
      "Content-Type": format === "html" ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug(stripHtml(title))}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
