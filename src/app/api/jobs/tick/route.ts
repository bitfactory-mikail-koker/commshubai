import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runDueJobs } from "@/lib/agents/tasks";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Background job tick. Call it from a scheduler (Vercel Cron, GitHub Actions,
 * pg_cron + pg_net, …) every few minutes:
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/jobs/tick
 *
 * It schedules recurring agent work, applies data retention, publishes
 * content whose (human-approved) scheduled time has passed and runs due tasks.
 */
function authorized(request: NextRequest): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function handle(request: NextRequest) {
  if (!env.cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDueJobs();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[jobs] tick failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

// Vercel Cron issues GET requests; other schedulers typically POST.
export const GET = handle;
export const POST = handle;
