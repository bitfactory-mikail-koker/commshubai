import { ZodError } from "zod";

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok(): ActionResult;
export function ok(message: string): ActionResult;
export function ok<T>(message: string | undefined, data: T): ActionResult<T>;
export function ok<T>(message?: string, data?: T): ActionResult<T | undefined> {
  return { ok: true, message, data };
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Maps database / runtime errors to a Dutch, user-facing message. */
export function toUserMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);

  if (/Missing permission|row-level security|permission denied/i.test(raw)) {
    return "Je hebt geen rechten voor deze actie.";
  }
  if (/Human approval/i.test(raw)) {
    return "Hiervoor is eerst een menselijke goedkeuring van de huidige versie nodig.";
  }
  if (/External publication is not permitted/i.test(raw)) {
    return "Externe publicatie is niet toegestaan: de toestemming voor externe publicatie is nog niet bevestigd.";
  }
  if (/locked/i.test(raw)) {
    return "Goedgekeurde content is vergrendeld. Heropen het item als concept om te bewerken.";
  }
  if (/cannot change your own role/i.test(raw)) {
    return "Je kunt je eigen rol of status niet wijzigen.";
  }
  if (/duplicate key|already exists|already been registered/i.test(raw)) {
    return "Dit bestaat al.";
  }
  if (/fetch failed|ECONNREFUSED|network/i.test(raw)) {
    return "De verbinding met de server is mislukt. Probeer het opnieuw.";
  }
  return raw || "Er ging iets mis. Probeer het opnieuw.";
}

/**
 * Wraps a server action body: validation, permission and database errors are
 * returned as a typed result instead of being thrown to the client.
 */
export async function runAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    // Next.js control-flow errors (redirect / notFound) must propagate.
    if (typeof error === "object" && error !== null && "digest" in error) {
      const digest = String((error as { digest: unknown }).digest);
      if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) throw error;
    }
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const key = issue.path.join(".");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      const first = error.issues[0]?.message ?? "Controleer de invoer.";
      return { ok: false, error: first, fieldErrors };
    }
    console.error("[action]", error);
    return { ok: false, error: toUserMessage(error) };
  }
}

/** Throws when a Supabase call returned an error; returns data otherwise. */
export function unwrap<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null || result.data === undefined) throw new Error("Niet gevonden.");
  return result.data as NonNullable<T>;
}

export function check(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}
