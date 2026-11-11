import type { Metadata } from "next";
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

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; fout?: string }> }) {
  const { next, fout } = await searchParams;
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  return (
    <LoginForm
      next={next}
      demoAccounts={demoMode ? DEMO_ACCOUNTS : []}
      demoPassword={demoMode ? "Demo-Noordlicht-2026" : null}
      slackLogin={process.env.NEXT_PUBLIC_SLACK_LOGIN === "true"}
      error={
        fout === "geen-account"
          ? "Met dit Slack-account ben je nog niet bekend. Vraag de beheerder om je toe te voegen."
          : fout === "slack"
            ? "Inloggen met Slack is niet gelukt. Probeer het opnieuw."
            : null
      }
    />
  );
}
