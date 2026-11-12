"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { fail, ok, runAction, type ActionResult } from "@/lib/result";
import { safeNextPath } from "@/lib/safe-path";
import { toSlug } from "@/lib/slug";
import { GOOGLE_LOGIN_DOMAIN, SsoProvider } from "@/lib/sso";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email("Vul een geldig e-mailadres in."),
  password: z.string().min(1, "Vul je wachtwoord in."),
  next: z.string().optional(),
});

export async function login(input: z.input<typeof loginSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const data = loginSchema.parse(input);
    const db = await createClient();
    const { error } = await db.auth.signInWithPassword({ email: data.email.toLowerCase(), password: data.password });
    if (error) {
      if (/banned/i.test(error.message)) return fail("Dit account is gedeactiveerd. Neem contact op met je beheerder.");
      if (/invalid login credentials/i.test(error.message)) return fail("Onjuist e-mailadres of wachtwoord.");
      if (/not confirmed/i.test(error.message)) return fail("Bevestig eerst je e-mailadres met de link die we je hebben gestuurd.");
      return fail("Inloggen is mislukt. Controleer of de Supabase-omgeving bereikbaar is.");
    }
    const next = safeNextPath(data.next, "/dashboard");
    redirect(next);
  });
}

export async function logout(): Promise<void> {
  const db = await createClient();
  await db.auth.signOut();
  redirect("/login");
}

const ACCOUNT_EXISTS = "Er bestaat al een account met dit e-mailadres.";

const registerSchema = z.object({
  organizationName: z.string().trim().min(2, "Vul de naam van je organisatie in.").max(120),
  fullName: z.string().trim().min(2, "Vul je naam in.").max(120),
  email: z.email("Vul een geldig e-mailadres in.").max(200),
  password: z.string().min(10, "Gebruik minimaal 10 tekens.").max(128),
});

/**
 * Creates a new organization with its first administrator. The organization
 * gets the system roles, both agents, empty brand guidelines and unconnected
 * integrations through the bootstrap_organization database function.
 */
export async function register(input: z.input<typeof registerSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const data = registerSchema.parse(input);
    const email = data.email.toLowerCase();
    const admin = createAdminClient();
    const db = await createClient();

    const { data: signUp, error: signUpError } = await db.auth.signUp({
      email,
      password: data.password,
      options: { data: { full_name: data.fullName } },
    });
    if (signUpError) {
      if (/already/i.test(signUpError.message)) return fail(ACCOUNT_EXISTS, { email: "Dit e-mailadres is al in gebruik." });
      throw new Error(signUpError.message);
    }
    const user = signUp.user;
    if (!user || (user.identities?.length ?? 0) === 0) return fail(ACCOUNT_EXISTS, { email: "Dit e-mailadres is al in gebruik." });
    if (signUp.session) {
      await db.auth.signOut();
      await admin.auth.admin.deleteUser(user.id);
      throw new Error("E-mailbevestiging staat uit in de Supabase-instellingen. Zet 'Confirm email' aan voordat mensen zich registreren.");
    }

    const { data: existingProfile } = await admin.from("profiles").select("id").eq("id", user.id).maybeSingle();
    if (existingProfile) return fail(ACCOUNT_EXISTS, { email: "Dit e-mailadres is al in gebruik." });

    const { data: organization, error: orgError } = await admin
      .from("organizations")
      .insert({ name: data.organizationName, slug: `${toSlug(data.organizationName, { maxLength: 40, fallback: "organisatie" })}-${crypto.randomUUID().slice(0, 6)}` })
      .select("id")
      .single();
    if (orgError || !organization) {
      await admin.auth.admin.deleteUser(user.id);
      throw new Error(orgError?.message ?? "Organisatie kon niet worden aangemaakt.");
    }

    const rollback = async () => {
      await admin.auth.admin.deleteUser(user.id);
      await admin.from("organizations").delete().eq("id", organization.id);
    };

    const { error: bootstrapError } = await admin.rpc("bootstrap_organization", { p_org_id: organization.id });
    if (bootstrapError) {
      await rollback();
      throw new Error(bootstrapError.message);
    }
    const { error: redactieError } = await admin.rpc("bootstrap_redactie", { p_org_id: organization.id });
    if (redactieError) {
      await rollback();
      throw new Error(redactieError.message);
    }

    const { data: role } = await admin.from("roles").select("id").eq("organization_id", organization.id).eq("key", "administrator").single();
    const { error: profileError } = await admin.from("profiles").insert({
      id: user.id,
      organization_id: organization.id,
      role_id: role!.id,
      full_name: data.fullName,
      email,
      job_title: "Beheerder",
      avatar_color: "teal",
    });
    if (profileError) {
      await rollback();
      throw new Error(profileError.message);
    }

    return ok("We hebben een e-mail gestuurd om je adres te bevestigen.");
  });
}

export async function loginWithSlack(input: { next?: string }): Promise<ActionResult> {
  return runAction(async () => {
    if (!env.slackLoginEnabled) return fail("Inloggen met Slack is niet ingeschakeld.");
    return startSsoLogin(SsoProvider.Slack, input.next, "Slack");
  });
}

export async function loginWithGoogle(input: { next?: string }): Promise<ActionResult> {
  return runAction(async () => {
    if (!env.googleLoginEnabled) return fail("Inloggen met Google is niet ingeschakeld.");
    return startSsoLogin(SsoProvider.Google, input.next, "Google");
  });
}

async function startSsoLogin(provider: SsoProvider, requestedNext: string | undefined, label: string): Promise<ActionResult> {
  const next = safeNextPath(requestedNext, "/for-me");
  const db = await createClient();
  const { data, error } = await db.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${env.appUrl.replace(/\/+$/, "")}/auth/callback?provider=${provider}&next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
      queryParams: provider === SsoProvider.Google ? { hd: GOOGLE_LOGIN_DOMAIN, prompt: "select_account" } : undefined,
    },
  });
  if (error || !data.url) return fail(`Inloggen met ${label} is nu niet mogelijk. Probeer het later opnieuw.`);
  redirect(data.url);
}

