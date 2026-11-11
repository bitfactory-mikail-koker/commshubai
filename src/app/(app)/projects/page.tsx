import type { Metadata } from "next";
import Link from "next/link";
import { Eye, EyeOff, FolderKanban, Info } from "lucide-react";
import { archiveProject, confirmProject } from "@/actions/redactie";
import { ActionButton } from "@/components/shared/actions";
import { DemoBadge, MetaBadge, ToneBadge } from "@/components/shared/badges";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/shared/layout";
import { can, requireSession } from "@/lib/auth";
import { EXTERNAL_NAMING_META } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ExternalNaming, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProjectDialog, type ChannelOption, type EditableProject, type RoleOption } from "./_components/project-dialog";

type ProjectRow = Omit<Project, "created_at" | "updated_at" | "organization_id" | "confirmed_by" | "confirmed_at">;

export const metadata: Metadata = { title: "Projecten" };

type Member = { profileId: string; name: string; jobTitle: string | null; role: string; confirmed: boolean };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const showArchive = (await searchParams).archief === "1";
  const editorial = can(session, "content.create");
  const canLinkChannels = can(session, "integrations.manage");

  const db = await createClient();
  const [projectResult, memberResult, { data: channelData }, { data: roleData }] = await Promise.all([
    db.from("projects").select("anonymous_label, client_name, external_naming, id, is_demo, name, notes, proposed_by_bot, status").order("name"),
    db
      .from("project_members")
      .select("project_id, profile_id, project_role, confirmed, profile:profiles!project_members_profile_id_fkey(full_name, job_title)"),
    db.from("channels").select("id, name, project_id, is_private, has_external_members").order("name"),
    db.from("functional_roles").select("key, name").order("sort_order"),
  ]);
  if (projectResult.error) throw new Error(projectResult.error.message);
  if (memberResult.error) throw new Error(memberResult.error.message);

  const projects = projectResult.data ?? [];
  const roles: RoleOption[] = roleData ?? [];
  const roleName = (key: string) => roles.find((r) => r.key === key)?.name ?? (key === "betrokkene" ? "Betrokkene" : key);
  const nameOfProject = new Map(projects.map((p) => [p.id, p.name]));

  const membersOf = (projectId: string): Member[] =>
    (memberResult.data ?? [])
      .filter((m) => m.project_id === projectId)
      .map((m) => ({
        profileId: m.profile_id,
        name: m.profile?.full_name ?? "Onbekend",
        jobTitle: m.profile?.job_title ?? null,
        role: m.project_role,
        confirmed: m.confirmed,
      }))
      // The DM first: that is who gets asked.
      .sort((a, b) => Number(b.role === "dm") - Number(a.role === "dm") || a.name.localeCompare(b.name));
  const channelsOf = (projectId: string) => (channelData ?? []).filter((c) => c.project_id === projectId);
  // The bot never follows private channels or channels with customers, so they cannot be linked either.
  const linkable = (channelData ?? []).filter((c) => !c.is_private && !c.has_external_members);
  const channelOptions = (projectId: string | null): ChannelOption[] =>
    linkable.map((c) => ({
      id: c.id,
      name: c.name,
      linkedTo: c.project_id && c.project_id !== projectId ? (nameOfProject.get(c.project_id) ?? null) : null,
    }));
  const editable = (project: ProjectRow): EditableProject => ({
    id: project.id,
    name: project.name,
    clientName: project.client_name ?? "",
    externalNaming: project.external_naming as ExternalNaming,
    anonymousLabel: project.anonymous_label ?? "",
    notes: project.notes ?? "",
    members: membersOf(project.id).map(({ profileId, name, jobTitle, role }) => ({ profileId, name, jobTitle, role })),
    channelIds: channelsOf(project.id).map((c) => c.id),
  });
  const mayEdit = (project: ProjectRow) => editorial || membersOf(project.id).some((m) => m.profileId === session.userId);

  const proposed = projects.filter((p) => p.status === "proposed");
  const archived = projects.filter((p) => p.status === "archived");
  const listed = projects.filter((p) => (showArchive ? p.status === "archived" : p.status === "confirmed"));

  const People = ({ members }: { members: Member[] }) =>
    members.length === 0 ? (
      <span className="text-muted-foreground">Nog niemand gekoppeld</span>
    ) : (
      <>
        {members.map((member, i) => (
          <span key={member.profileId} className={cn(!member.confirmed && "text-muted-foreground")}>
            {i > 0 && ", "}
            {member.name} <span className="text-muted-foreground">({roleName(member.role)})</span>
          </span>
        ))}
      </>
    );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Projecten"
        description="Per project: de klant, wie erbij hoort en in welke rol, de gekoppelde Slack-kanalen en of het project extern genoemd mag worden. De bot stelt projecten en mensen voor; een mens bevestigt."
        actions={editorial ? <ProjectDialog roles={roles} channels={channelOptions(null)} canLinkChannels={canLinkChannels} /> : null}
      />

      <Notice icon={Info} title="Het akkoord van de klant loopt buiten dit systeem">
        Of een klant genoemd mag worden, spreek je met de klant zelf af. Hier leg je alleen de uitkomst vast. Staat een project op “nog
        niet bekend”, dan kan een extern stuk erover niet worden gepubliceerd.
      </Notice>

      {proposed.length > 0 && !showArchive && (
        <Panel
          title="Voorgesteld door de bot"
          description="De bot herkende deze projecten in een signaal. Ze tellen pas mee nadat iemand ze heeft bevestigd."
          flush
        >
          <ul className="divide-y">
            {proposed.map((project) => (
              <li key={project.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {project.name}
                    <ToneBadge tone="amber">Wacht op bevestiging</ToneBadge>
                    {project.is_demo && <DemoBadge />}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {project.client_name ? `Klant: ${project.client_name} · ` : ""}
                    Voorgestelde mensen: <People members={membersOf(project.id)} />
                  </p>
                </div>
                {mayEdit(project) ? (
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <ProjectDialog project={editable(project)} roles={roles} channels={channelOptions(project.id)} canLinkChannels={canLinkChannels} />
                    <ActionButton size="sm" action={confirmProject.bind(null, { id: project.id })} pendingLabel="Bevestigen…">
                      Bevestigen
                    </ActionButton>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">De redactie of een betrokkene bevestigt dit</span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        title={showArchive ? "Archief" : "Projecten"}
        actions={
          archived.length > 0 || showArchive ? (
            <Link
              href={showArchive ? "/projects" : "/projects?archief=1"}
              scroll={false}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {showArchive ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {showArchive ? "Terug naar de projecten" : `Toon archief (${archived.length})`}
            </Link>
          ) : null
        }
        flush
      >
        {listed.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title={showArchive ? "Geen gearchiveerde projecten" : "Nog geen projecten"}
            description={
              showArchive
                ? "Een project dat je archiveert, verdwijnt uit de keuzelijsten en blijft hier staan."
                : "Voeg een project toe, of wacht tot de bot er een voorstelt bij een klantcase."
            }
          />
        ) : (
          <>
            <div className="hidden border-b px-4 py-2 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] lg:gap-x-6">
              <span>Project</span>
              <span>Mensen</span>
              <span>Slack-kanalen</span>
              <span>Mag het extern?</span>
              <span className="w-48" />
            </div>
            <ul className="divide-y">
              {listed.map((project) => {
                const channels = channelsOf(project.id);
                return (
                  <li
                    key={project.id}
                    className="grid items-start gap-x-6 gap-y-2 px-4 py-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto]"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {project.name}
                        {project.is_demo && <DemoBadge />}
                      </p>
                      <p className="text-xs text-muted-foreground">{project.client_name ? `Klant: ${project.client_name}` : "Geen klant ingevuld"}</p>
                      {project.notes && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{project.notes}</p>}
                    </div>
                    <p className="min-w-0 text-[0.8125rem] leading-relaxed">
                      <span className="mr-1 text-xs text-muted-foreground lg:hidden">Mensen:</span>
                      <People members={membersOf(project.id)} />
                    </p>
                    <p className="min-w-0 text-[0.8125rem] leading-relaxed">
                      <span className="mr-1 text-xs text-muted-foreground lg:hidden">Kanalen:</span>
                      {channels.length === 0 ? (
                        <span className="text-muted-foreground">Geen</span>
                      ) : (
                        channels.map((c, i) => (
                          <span key={c.id}>
                            {i > 0 && ", "}#{c.name}
                          </span>
                        ))
                      )}
                    </p>
                    <div className="min-w-0 space-y-1">
                      <MetaBadge meta={EXTERNAL_NAMING_META} value={project.external_naming} />
                      {project.external_naming === "anonymous" && project.anonymous_label && (
                        <p className="text-xs text-muted-foreground">Als “{project.anonymous_label}”</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:w-48 lg:flex-nowrap lg:justify-end">
                      {mayEdit(project) && !showArchive && (
                        <ProjectDialog project={editable(project)} roles={roles} channels={channelOptions(project.id)} canLinkChannels={canLinkChannels} />
                      )}
                      {editorial &&
                        (showArchive ? (
                          <ActionButton variant="outline" size="sm" action={archiveProject.bind(null, { id: project.id, archived: false })}>
                            Terugzetten
                          </ActionButton>
                        ) : (
                          <ActionButton
                            variant="ghost"
                            size="sm"
                            action={archiveProject.bind(null, { id: project.id, archived: true })}
                            confirm={{
                              title: "Project archiveren?",
                              description: `“${project.name}” verdwijnt uit de keuzelijsten. Stukken en onderwerpen die eraan hangen blijven bestaan. Je kunt het project later terugzetten.`,
                              confirmLabel: "Archiveren",
                            }}
                          >
                            Archiveren
                          </ActionButton>
                        ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}
