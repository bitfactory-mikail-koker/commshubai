/**
 * Local development scheduler. With ENABLE_DEV_SCHEDULER=true the dev server
 * calls the job tick every minute, so scheduled publications and recurring
 * agent tasks run without an external cron. In production use a real
 * scheduler (see vercel.json) instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.ENABLE_DEV_SCHEDULER !== "true" || process.env.NODE_ENV === "production") return;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[scheduler] ENABLE_DEV_SCHEDULER is set but CRON_SECRET is missing; scheduler not started.");
    return;
  }
  const globalState = globalThis as typeof globalThis & { __commsHubScheduler?: NodeJS.Timeout };
  if (globalState.__commsHubScheduler) return;

  const port = process.env.PORT ?? "3000";
  const tick = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/jobs/tick`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (!response.ok) console.warn(`[scheduler] tick responded with ${response.status}`);
    } catch {
      // The server may still be starting; the next tick will try again.
    }
  };
  globalState.__commsHubScheduler = setInterval(tick, 60_000);
  console.log("[scheduler] development scheduler started (every 60s)");
}
