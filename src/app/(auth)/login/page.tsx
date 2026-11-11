import type { Metadata } from "next";
import { GOOGLE_LOGIN_DOMAIN, LoginError } from "@/lib/sso";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Inloggen" };

const DEMO_ACCOUNTS = [
  { name: "Sanne de Vries", role: "Beheerder", email: "sanne@noordlicht.example" },
  { name: "Daan Bakker", role: "Hoofdredacteur", email: "daan@noordlicht.example" },
  { name: "Lotte Jansen", role: "Redacteur", email: "lotte@noordlicht.example" },
  { name: "Ruben Visser", role: "Reviewer", email: "ruben@noordlicht.example" },
  { name: "Femke Mulder", role: "Marketingmanager", email: "femke@noordlicht.example" },
  { name: "Tim Hoekstra", role: "Medewerker", email: "tim@noordlicht.example" },
];

const LOGIN_ERRORS: Record<LoginError, string> = {
  [LoginError.NoAccount]: "Met dit account ben je nog niet bekend. Vraag de beheerder om je toe te voegen.",
  [LoginError.Slack]: "Inloggen met Slack is niet gelukt. Probeer het opnieuw.",
  [LoginError.Google]: "Inloggen met Google is niet gelukt. Probeer het opnieuw.",
  [LoginError.Domain]: `Inloggen met Google kan alleen met een @${GOOGLE_LOGIN_DOMAIN}-adres.`,
};

function loginErrorMessage(code: string | undefined): string | null {
  const known = Object.values(LoginError).find((error) => error === code);
  return known ? LOGIN_ERRORS[known] : null;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; fout?: string }> }) {
  const { next, fout } = await searchParams;
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  return (
    <LoginForm
      next={next}
      demoAccounts={demoMode ? DEMO_ACCOUNTS : []}
      demoPassword={demoMode ? "Demo-Noordlicht-2026" : null}
      slackLogin={process.env.NEXT_PUBLIC_SLACK_LOGIN === "true"}
      googleLogin={process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "true"}
      googleDomain={GOOGLE_LOGIN_DOMAIN}
      error={loginErrorMessage(fout)}
    />
  );
}
