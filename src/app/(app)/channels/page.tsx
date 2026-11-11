import type { Metadata } from "next";
import Link from "next/link";
import { Hash, Lock, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteChannel, deleteEmojiRule, explainChannelNow } from "@/actions/redactie";
import { ActionButton } from "@/components/shared/actions";
import { DemoBadge, ToneBadge } from "@/components/shared/badges";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { can, requirePagePermission } from "@/lib/auth";
import { BUREAU_LABELS, CHANNEL_CONFIDENTIALITY_LABELS, EMOJI_ACTION_OPTIONS, FOLLOW_MODE_OPTIONS } from "@/lib/constants";
import { formatDay } from "@/lib/format";
import { redactieSettings } from "@/lib/redactie/settings";
import { createClient } from "@/lib/supabase/server";
import type { ChannelBureau, ChannelConfidentiality, EmojiAction, FollowMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChannelDialog, NEW_CHANNEL, type ChannelValues } from "./_components/channel-dialog";
import { EmojiDialog, NEW_EMOJI } from "./_components/emoji-dialog";

export const metadata: Metadata = { title: "Kanalen en emoji's" };

export default async function ChannelsPage() {
  const session = await requirePagePermission(
    "content.create",
    "content.edit",
    "content.review",
    "content.approve",
    "users.manage",
    "agents.manage",
    "integrations.manage",
  );
  const canManageChannels = can(session, "integrations.manage");
  const canManageEmoji = can(session, "users.manage");
  const settings = redactieSettings(session.organization.settings);
  const db = await createClient();

  const [{ data: channels, error }, { data: rules, error: rulesError }, { data: projects }, { data: slack }] = await Promise.all([
    db.from("channels").select("*").order("followed", { ascending: false }).order("name"),
    db.from("emoji_rules").select("*").order("sort_order"),
    db.from("projects").select("id, name").neq("status", "archived").order("name"),
    db.from("integrations").select("status").eq("provider", "slack").maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  if (rulesError) throw new Error(rulesError.message);

  const slackConnected = slack?.status === "connected";
  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const explanationRules = (rules ?? []).map((r) => ({ emoji: r.emoji, goal: r.goal, action: r.action, enabled: r.enabled }));
  const followedCount = (channels ?? []).filter((c) => c.followed).length;

  const dialogProps = {
    projects: projects ?? [],
    rules: explanationRules,
    botName: settings.botName,
    contactPerson: settings.contactPerson,
    lookbackMaxDays: settings.lookbackMaxDays,
    slackConnected,
    canManage: canManageChannels,
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Kanalen en emoji's"
        description="In welke openbare Slack-kanalen de bot aanwezig is, wat hij daar doet, en welke emoji een bericht bij de redactie brengt. De bot leest nooit besloten kanalen, kanalen met klanten of privéberichten tussen collega's."
        actions={
          canManageChannels ? (
            <ChannelDialog channel={NEW_CHANNEL} {...dialogProps}>
              <Button>
                <Plus />
                Kanaal toevoegen
              </Button>
            </ChannelDialog>
          ) : undefined
        }
      />

      {!slackConnected && (
        <Notice tone="demo" title="Geen Slack-workspace verbonden">
          De kanalen hieronder zijn met de hand ingevoerd. Met een verbonden Slack-app haalt de bot de naam en het soort kanaal zelf op,
          en kan hij alleen kanalen volgen waar hij lid van is. Uitproberen kan nu al bij{" "}
          <Link href="/bot?weergave=uitproberen">Gedrag en postvak</Link>.
        </Notice>
      )}

      <Panel
        title="Kanalen"
        description={`${followedCount} van de ${channels?.length ?? 0} kanalen worden gevolgd.`}
        actions={!canManageChannels ? <ToneBadge tone="slate">Alleen-lezen</ToneBadge> : undefined}
        flush
      >
        {!channels || channels.length === 0 ? (
          <EmptyState
            icon={Hash}
            title="Nog geen kanalen"
            description="Voeg het eerste openbare kanaal toe waarin de bot nieuws mag oppikken. Hij stelt zich daar voor zodra je het volgen aanzet."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b text-xs text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                  <th scope="col">Kanaal</th>
                  <th scope="col" className="hidden sm:table-cell">
                    Volgen
                  </th>
                  <th scope="col" className="hidden md:table-cell">
                    Manier
                  </th>
                  <th scope="col" className="hidden xl:table-cell">
                    Bureau en vertrouwelijkheid
                  </th>
                  <th scope="col" className="hidden min-[1400px]:table-cell">
                    Project
                  </th>
                  <th scope="col" className="hidden min-[1400px]:table-cell">
                    Uitleg en terugkijken
                  </th>
                  <th scope="col" className="hidden sm:table-cell">
                    <span className="sr-only">Acties</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {channels.map((channel) => {
                  const blocked = channel.is_private || channel.has_external_members;
                  const values: ChannelValues = {
                    id: channel.id,
                    slackChannelId: channel.slack_channel_id,
                    name: channel.name,
                    isPrivate: channel.is_private,
                    hasExternalMembers: channel.has_external_members,
                    followed: channel.followed,
                    expectation: channel.expectation,
                    followMode: channel.follow_mode as FollowMode,
                    bureau: channel.bureau as ChannelBureau,
                    confidentiality: channel.confidentiality as ChannelConfidentiality,
                    projectId: channel.project_id,
                    explainEveryDays: channel.explain_every_days,
                    lookbackDays: channel.lookback_days,
                  };
                  const quiet = !channel.followed;
                  const status = blocked ? (
                    <ToneBadge tone="red">Kan niet worden gevolgd</ToneBadge>
                  ) : channel.followed ? (
                    <ToneBadge tone="green">Gevolgd</ToneBadge>
                  ) : (
                    <ToneBadge tone="slate">Niet gevolgd</ToneBadge>
                  );
                  const actions = (
                    <>
                          {canManageChannels && channel.followed && (
                            <ActionButton
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Uitleg nu plaatsen in #${channel.name}`}
                              title="Uitleg nu plaatsen"
                              action={explainChannelNow.bind(null, { id: channel.id })}
                              confirm={{
                                title: `Uitleg plaatsen in #${channel.name}?`,
                                description: settings.shadowMode
                                  ? "De schaduwmodus staat aan: het bericht komt alleen in het postvak te staan en gaat niet naar het kanaal."
                                  : slackConnected
                                    ? "De bot plaatst het uitlegbericht nu in het kanaal."
                                    : "Er is geen Slack-workspace verbonden: het bericht wordt als gesimuleerd in het postvak gezet.",
                                confirmLabel: "Plaatsen",
                              }}
                            >
                              <Megaphone />
                            </ActionButton>
                          )}
                          <ChannelDialog channel={values} {...dialogProps}>
                            {canManageChannels ? (
                              <Button variant="ghost" size="sm" aria-label={`#${channel.name} bewerken`} title="Bewerken">
                                <Pencil />
                                <span className="sm:hidden">Bewerken</span>
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm">
                                Bekijken
                              </Button>
                            )}
                          </ChannelDialog>
                          {canManageChannels && (
                            <ActionButton
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`#${channel.name} verwijderen`}
                              title="Verwijderen"
                              action={deleteChannel.bind(null, { id: channel.id })}
                              confirm={{
                                title: `#${channel.name} verwijderen?`,
                                description: "De bot doet daarna niets meer in dit kanaal. Signalen die al uit dit kanaal zijn opgeslagen blijven staan.",
                                confirmLabel: "Verwijderen",
                                destructive: true,
                              }}
                            >
                              <Trash2 />
                            </ActionButton>
                          )}
                    </>
                  );
                  return (
                    <tr key={channel.id} className="align-top text-[0.8125rem] [&>td]:px-4 [&>td]:py-2.5">
                      <td className="sm:min-w-56">
                        <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-medium", quiet && "text-muted-foreground")}>
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            {channel.is_private ? <Lock className="size-3.5 shrink-0" strokeWidth={1.75} /> : <Hash className="size-3.5 shrink-0" strokeWidth={1.75} />}
                            <span className="wrap-anywhere">{channel.name}</span>
                          </span>
                          {channel.is_demo && <DemoBadge />}
                          <span className="sm:hidden">{status}</span>
                        </p>
                        <p className="mt-0.5 max-w-[44ch] text-xs leading-relaxed text-muted-foreground">
                          {blocked
                            ? channel.is_private
                              ? "Besloten kanaal. De bot volgt nooit besloten kanalen."
                              : "Hier zitten klanten of gasten. De bot volgt nooit kanalen met externen."
                            : channel.followed
                              ? channel.expectation || "Geen verwachting ingevuld."
                              : "De bot doet hier niets."}
                        </p>
                        <div className="mt-1.5 -ml-2 flex items-center gap-0.5 sm:hidden">{actions}</div>
                      </td>
                      <td className="hidden sm:table-cell">{status}</td>
                      <td className="hidden whitespace-nowrap md:table-cell">
                        {quiet ? <span className="text-muted-foreground">-</span> : FOLLOW_MODE_OPTIONS.find((o) => o.value === channel.follow_mode)?.label}
                      </td>
                      <td className="hidden xl:table-cell">
                        {quiet ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          <>
                            <span className="block whitespace-nowrap">{BUREAU_LABELS[channel.bureau as ChannelBureau]}</span>
                            <span className="block text-xs whitespace-nowrap text-muted-foreground">
                              {CHANNEL_CONFIDENTIALITY_LABELS[channel.confidentiality as ChannelConfidentiality]}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="hidden max-w-52 min-[1400px]:table-cell">
                        {channel.project_id && projectName.has(channel.project_id) ? (
                          <span className="line-clamp-2">{projectName.get(channel.project_id)}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="hidden min-[1400px]:table-cell">
                        {quiet ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          <>
                            <span
                              className="block whitespace-nowrap tabular-nums"
                              title={channel.last_explained_at ? `Laatst geplaatst ${formatDay(channel.last_explained_at)}` : undefined}
                            >
                              {channel.explain_every_days > 0 ? `Uitleg elke ${channel.explain_every_days} dagen` : "Uitleg alleen bij de start"}
                            </span>
                            <span className="block text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                              {channel.lookback_days > 0 ? `Kijkt ${channel.lookback_days} dagen terug` : "Kijkt niet terug"}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="hidden sm:table-cell">
                        <div className="flex items-center justify-end gap-0.5">{actions}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Emoji's"
        description="Met een emoji wijst een collega een bericht aan. Elke emoji heeft één doel."
        actions={
          canManageEmoji ? (
            <EmojiDialog rule={NEW_EMOJI}>
              <Button variant="outline" size="sm">
                <Plus />
                Emoji toevoegen
              </Button>
            </EmojiDialog>
          ) : (
            <ToneBadge tone="slate">Alleen-lezen</ToneBadge>
          )
        }
        flush
      >
        {!rules || rules.length === 0 ? (
          <EmptyState
            title="Nog geen emoji's"
            description="Zonder emoji kunnen collega's geen berichten aanwijzen. Voeg er minimaal één toe, en één om een bericht uit te sluiten."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b text-xs text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                  <th scope="col">Emoji</th>
                  <th scope="col">Doel</th>
                  <th scope="col" className="hidden min-[1400px]:table-cell">
                    Wat de bot doet
                  </th>
                  <th scope="col" className="hidden md:table-cell">
                    Starten
                  </th>
                  <th scope="col" className="hidden sm:table-cell">
                    Status
                  </th>
                  <th scope="col">
                    <span className="sr-only">Acties</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rules.map((rule) => {
                  const option = EMOJI_ACTION_OPTIONS.find((o) => o.value === rule.action);
                  return (
                    <tr key={rule.id} className={cn("text-[0.8125rem] [&>td]:px-4 [&>td]:py-2.5", !rule.enabled && "text-muted-foreground")}>
                      <td className="whitespace-nowrap">
                        <span className="mr-2 text-base leading-none">{rule.emoji}</span>
                        <code className="hidden font-mono text-xs text-muted-foreground sm:inline">:{rule.shortcode}:</code>
                      </td>
                      <td>
                        <span className="block text-sm font-medium">{rule.goal}</span>
                        {(option?.label ?? rule.action) !== rule.goal && (
                          <span className="block text-xs text-muted-foreground min-[1400px]:hidden">{option?.label ?? rule.action}</span>
                        )}
                        {rule.action !== "exclude" && (
                          <span className="block text-xs text-muted-foreground md:hidden">
                            {rule.direct_start ? "Start direct, zonder redactie" : "Na besluit van de redactie"}
                          </span>
                        )}
                        {!rule.enabled && <span className="block text-xs text-muted-foreground sm:hidden">Staat uit</span>}
                      </td>
                      <td className="hidden max-w-[46ch] min-[1400px]:table-cell">
                        <span className="block">{option?.label ?? rule.action}</span>
                        <span className="block text-xs leading-relaxed text-muted-foreground">{option?.help}</span>
                      </td>
                      <td className="hidden md:table-cell">
                        {rule.action === "exclude" ? (
                          <span className="text-muted-foreground">-</span>
                        ) : rule.direct_start ? (
                          <ToneBadge tone="amber">Direct, zonder redactie</ToneBadge>
                        ) : (
                          <span>Na besluit van de redactie</span>
                        )}
                      </td>
                      <td className="hidden sm:table-cell">{rule.enabled ? <ToneBadge tone="green">In gebruik</ToneBadge> : <ToneBadge tone="slate">Uit</ToneBadge>}</td>
                      <td>
                        {canManageEmoji && (
                          <div className="flex items-center justify-end gap-0.5">
                            <EmojiDialog
                              rule={{
                                id: rule.id,
                                emoji: rule.emoji,
                                shortcode: rule.shortcode,
                                goal: rule.goal,
                                action: rule.action as EmojiAction,
                                directStart: rule.direct_start,
                                enabled: rule.enabled,
                              }}
                            >
                              <Button variant="ghost" size="sm" aria-label={`Emoji ${rule.goal} bewerken`}>
                                <Pencil />
                                <span className="hidden sm:inline">Bewerken</span>
                              </Button>
                            </EmojiDialog>
                            <ActionButton
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Emoji ${rule.goal} verwijderen`}
                              title="Verwijderen"
                              action={deleteEmojiRule.bind(null, { id: rule.id })}
                              confirm={{
                                title: `${rule.emoji} ${rule.goal} verwijderen?`,
                                description: "De emoji heeft daarna geen betekenis meer voor de bot en verdwijnt uit het uitlegbericht in elk kanaal.",
                                confirmLabel: "Verwijderen",
                                destructive: true,
                              }}
                            >
                              <Trash2 />
                            </ActionButton>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
