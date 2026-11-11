import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { postCmsWebhook } from "@/lib/integrations/connectors";
import { loadSecrets } from "@/lib/integrations/service";
import { fromJson } from "@/lib/json";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Article } from "@/lib/types";

type Db = SupabaseClient<Database>;

export type PublicationResult = { mode: "cms" | "simulated"; detail: string };

/**
 * Publishes an approved article.
 *
 * `db` is the caller's client: a user session (the database then checks the
 * content.publish permission) or the service client for scheduled jobs. In
 * both cases the database refuses the status change without a human approval
 * record for the current version, and - for external content - without
 * confirmed permission for external publication.
 *
 * External content goes to the CMS webhook when that integration is connected;
 * otherwise the publication is simulated and stored as such.
 */
export async function publishArticle(db: Db, article: Article): Promise<PublicationResult> {
  let result: PublicationResult = {
    mode: "simulated",
    detail:
      article.classification === "external"
        ? "Geen CMS verbonden: publicatie is gesimuleerd en alleen in de hub vastgelegd."
        : "Interne content: gemarkeerd als gepubliceerd in de hub. Plaatsen in Slack of e-mail doe je handmatig.",
  };

  if (article.classification === "external") {
    const admin = createAdminClient();
    const { data: cms } = await admin
      .from("integrations")
      .select("*")
      .eq("organization_id", article.organization_id)
      .eq("provider", "cms")
      .maybeSingle();
    if (cms && cms.status === "connected") {
      // Verify the database will accept the publication BEFORE anything leaves
      // the system, so a refused status change can never follow a sent webhook.
      const { data: approved } = await admin.rpc("has_human_approval", {
        p_entity_type: "article",
        p_entity_id: article.id,
        p_version: article.current_version,
      });
      if (!approved) throw new Error("Human approval is required before publication.");
      if (!["granted", "not_required"].includes(article.external_permission)) {
        throw new Error(`External publication is not permitted: permission status is ${article.external_permission}`);
      }
      const response = await postCmsWebhook(fromJson<Record<string, unknown>>(cms.config, {}), await loadSecrets(cms.id), {
        event: "article.published",
        sent_at: new Date().toISOString(),
        article: {
          id: article.id,
          title: article.title,
          subtitle: article.subtitle,
          excerpt: article.excerpt,
          body_html: article.body_html,
          content_type: article.content_type,
          tags: article.tags,
          version: article.current_version,
        },
      });
      if (!response.ok) throw new Error(`Publicatie naar het CMS is mislukt: ${response.detail}`);
      result = { mode: "cms", detail: `Verstuurd naar het CMS. ${response.detail}` };
    }
  }

  const { error } = await db
    .from("articles")
    .update({ status: "published", publication_mode: result.mode, published_at: new Date().toISOString() })
    .eq("id", article.id);
  if (error) throw new Error(error.message);

  await db
    .from("content_calendar")
    .update({ status: "done" })
    .eq("entity_type", "article")
    .eq("entity_id", article.id);

  return result;
}
