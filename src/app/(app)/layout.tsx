import { AppShell, type NavBadges, type NavGroup } from "@/components/shell/app-shell";
import { aiStatus } from "@/lib/ai";
import { can, requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { roleLabel } from "@/lib/permissions";
import { redactieSettings } from "@/lib/redactie/settings";
import { createClient } from "@/lib/supabase/server";

type UserDb = Awaited<ReturnType<typeof createClient>>;

async function loadNavBadges(db: UserDb, userId: string, access: { editorial: boolean; approves: boolean }): Promise<NavBadges> {
  try {
    const [{ count: proposals }, { count: mine }, { count: editorQueue }] = await Promise.all([
      access.editorial
        ? db.from("content_opportunities").select("id", { count: "exact", head: true }).eq("status", "proposed")
        : Promise.resolve({ count: 0 }),
      db.from("approvals").select("id", { count: "exact", head: true }).eq("decision", "pending").contains("eligible_profile_ids", [userId]),
      access.approves
        ? db.from("approvals").select("id", { count: "exact", head: true }).eq("decision", "pending").eq("kind", "piece").filter("eligible_profile_ids", "eq", "{}")
        : Promise.resolve({ count: 0 }),
    ]);
    return { "for-me": (mine ?? 0) + (editorQueue ?? 0), inbox: access.editorial ? (proposals ?? 0) : 0 };
  } catch (error) {
    console.error("[layout] could not load the sidebar counters", error);
    return {};
  }
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  const db = await createClient();
  const editorial = can(session, "content.create", "content.edit", "content.review", "content.approve");
  const manages = can(session, "users.manage", "agents.manage", "integrations.manage");

  const badges = loadNavBadges(db, session.userId, { editorial, approves: can(session, "content.approve") });

  const groups: NavGroup[] = [
    {
      label: "Overzicht",
      items: [
        { key: "for-me", label: "Voor mij", href: "/for-me" },
        { key: "dashboard", label: "Dashboard", href: "/dashboard" },
        { key: "inbox", label: "Inbox", href: "/inbox" },
      ],
    },
    {
      label: "Redactie",
      items: [
        ...(editorial ? [{ key: "topics", label: "Onderwerpen", href: "/topics" }] : []),
        { key: "editorial", label: "Stukken", href: "/editorial" },
        ...(editorial
          ? [
              { key: "external", label: "Extern bureau", href: "/external" },
              { key: "internal", label: "Intern bureau", href: "/internal" },
            ]
          : []),
        { key: "interviews", label: "Interviews", href: "/interviews" },
        { key: "newsletters", label: "Edities", href: "/newsletters" },
        { key: "calendar", label: "Kalender", href: "/calendar" },
        { key: "projects", label: "Projecten", href: "/projects" },
      ],
    },
    ...(editorial || manages
      ? [
          {
            label: "Bot",
            items: [
              { key: "bot", label: "Gedrag en postvak", href: "/bot" },
              { key: "channels", label: "Kanalen en emoji's", href: "/channels" },
              { key: "groups", label: "Groepen en ritmes", href: "/groups" },
              { key: "rules", label: "Goedkeuringsregels", href: "/rules" },
            ],
          },
        ]
      : []),
    {
      label: "Beheer",
      items: [
        { key: "team", label: "Mensen en rollen", href: "/team" },
        { key: "brand", label: "Stijl", href: "/brand" },
        ...(editorial || can(session, "agents.manage") ? [{ key: "agents", label: "AI-agents", href: "/agents" }] : []),
        ...(editorial || can(session, "integrations.manage")
          ? [{ key: "integrations", label: "Integraties", href: "/integrations" }]
          : []),
        ...(editorial || manages
          ? [
              { key: "logbook", label: "Logboek", href: "/logbook" },
              { key: "figures", label: "Cijfers", href: "/figures" },
            ]
          : []),
        { key: "settings", label: "Instellingen", href: "/settings" },
      ],
    },
    ...(env.demoMode && editorial
      ? [{ label: "Demo", items: [{ key: "demo", label: "Demoscenario", href: "/demo" }] }]
      : []),
  ];

  const bot = redactieSettings(session.organization.settings);

  return (
    <AppShell
      groups={groups}
      badges={badges}
      organizationName={session.organization.name}
      user={{
        name: session.profile.full_name,
        email: session.profile.email,
        role: roleLabel(session.role.key),
        avatarColor: session.profile.avatar_color,
      }}
      ai={aiStatus()}
      bot={
        editorial || manages
          ? bot.botPaused
            ? { state: "paused", href: "/bot" }
            : bot.shadowMode
              ? { state: "shadow", href: "/bot" }
              : null
          : null
      }
    >
      {children}
    </AppShell>
  );
}
