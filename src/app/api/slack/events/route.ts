import { after } from "next/server";
import { verifySlackSignature } from "@/lib/integrations/connectors";
import { handleSlackEvent, slackWorkspace, type SlackEnvelope } from "@/lib/redactie/slack-events";

export const dynamic = "force-dynamic";

/**
 * Request URL for the Events API of the organization's own Slack app.
 * Every request is verified with the app's signing secret before anything is
 * read. Slack expects an answer within three seconds, so the work is done
 * after the response.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  let envelope: SlackEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SlackEnvelope;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const workspace = await slackWorkspace(envelope.team_id);
  // An unknown workspace and a bad signature get the same answer.
  if (
    !workspace?.signingSecret ||
    !verifySlackSignature({
      signingSecret: workspace.signingSecret,
      timestamp: request.headers.get("x-slack-request-timestamp"),
      signature: request.headers.get("x-slack-signature"),
      rawBody,
    })
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (envelope.type === "url_verification") {
    return Response.json({ challenge: envelope.challenge });
  }
  // Slack retries when we are slow; a retry of an event we already took is acknowledged and dropped.
  if (request.headers.get("x-slack-retry-num")) return new Response(null, { status: 200 });

  if (envelope.type === "event_callback" && envelope.event) {
    const event = envelope.event;
    after(async () => {
      try {
        await handleSlackEvent(workspace.organizationId, event, workspace);
      } catch (error) {
        console.error("[slack] event could not be handled", error);
      }
    });
  }
  return new Response(null, { status: 200 });
}
