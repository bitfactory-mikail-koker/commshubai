import { Fragment } from "react";
import type { Metadata } from "next";
import { ChevronRight, Lock, Quote } from "lucide-react";
import { Notice, PageHeader, Panel } from "@/components/shared/layout";
import { can, requirePagePermission } from "@/lib/auth";
import { APPROVAL_RULE_KEYS } from "@/lib/constants";
import { fromJson } from "@/lib/json";
import { createClient } from "@/lib/supabase/server";
import type { RuleStep } from "@/lib/types";
import { QUOTE_KEYS, stepDetail, stepLabel, type RuleRow } from "./_components/describe";
import { RuleDialog } from "./_components/rule-dialog";

export const metadata: Metadata = { title: "Goedkeuringsregels" };

const DEFAULT_STEPS: RuleStep[] = [{ who: "editors", min: 1, label: "Redactie" }];

export default async function RulesPage() {
  const session = await requirePagePermission(
    "users.manage",
    "agents.manage",
    "integrations.manage",
    "content.create",
    "content.edit",
    "content.review",
    "content.approve",
  );
  const canManage = can(session, "users.manage");
  const db = await createClient();

  const [rulesResult, rolesResult, peopleResult] = await Promise.all([
    db.from("approval_rules").select("content_key, steps, quotes_by_interviewee, deadline_days"),
    db.from("functional_roles").select("key, name").order("sort_order").order("name"),
    db.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);
  for (const result of [rulesResult, rolesResult, peopleResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  const roles = rolesResult.data ?? [];
  const people = (peopleResult.data ?? []).map((p) => ({ id: p.id, name: p.full_name }));

  const rules: RuleRow[] = APPROVAL_RULE_KEYS.map(({ key, label }) => {
    const stored = (rulesResult.data ?? []).find((r) => r.content_key === key);
    const steps = fromJson<RuleStep[]>(stored?.steps, []);
    return {
      contentKey: key,
      label,
      steps: steps.length > 0 ? steps : DEFAULT_STEPS,
      quotesByInterviewee: stored?.quotes_by_interviewee ?? true,
      deadlineDays: stored?.deadline_days ?? 5,
      stored: Boolean(stored) && steps.length > 0,
    };
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Goedkeuringsregels"
        description="Wie moet akkoord geven voordat een stuk klaar is voor publicatie. Dat verschilt per soort stuk; het systeem legt vast wie wat heeft goedgekeurd."
      />

      {!canManage && (
        <Notice tone="info" icon={Lock} title="Alleen-lezen">
          Je kunt de regels inzien. Wijzigen kan alleen met het recht ‘Gebruikers beheren’.
        </Notice>
      )}

      <Notice tone="info" icon={Quote} title="Eén regel ligt vast: een citaat is van wie het gezegd heeft">
        Alleen de geciteerde kan het eigen citaat goedkeuren of weigeren. De redactie en de beheerder kunnen dat niet overnemen, ook
        niet als de termijn voorbij is; de database dwingt dit af. Alleen bij iemand zonder account, zoals een geïnterviewde van
        buiten, legt de redactie het akkoord vast dat zij heeft gekregen. Bij een MD-update geldt hetzelfde voor de passages van elke
        MD.
      </Notice>

      <Panel
        title="Per soort stuk"
        description="De stappen lopen van links naar rechts. Een wijziging geldt voor nieuwe goedkeuringen; lopende houden hun stappen."
        flush
      >
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th scope="col" className="w-56 px-5 py-2.5 font-medium">
                  Soort stuk
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Stappen
                </th>
                <th scope="col" className="w-44 px-3 py-2.5 font-medium">
                  Citaten
                </th>
                <th scope="col" className="w-28 px-3 py-2.5 font-medium">
                  Termijn
                </th>
                {canManage && (
                  <th scope="col" className="w-12 px-3 py-2.5">
                    <span className="sr-only">Wijzigen</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.contentKey} className="border-b align-top last:border-b-0 hover:bg-subtle">
                  <th scope="row" className="px-5 py-3 text-left font-medium">
                    {rule.label}
                    {!rule.stored && <span className="block text-xs font-normal text-muted-foreground">Standaard, nog niet ingesteld</span>}
                  </th>
                  <td className="px-3 py-3">
                    <ol className="flex flex-wrap items-start gap-x-1.5 gap-y-2">
                      {rule.steps.map((step, index) => (
                        <Fragment key={index}>
                          {index > 0 && <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" aria-hidden />}
                          <li className="min-w-0">
                            <span className="text-[0.8125rem]">
                              <span className="tabular-nums text-muted-foreground">{index + 1}. </span>
                              {stepLabel(step, roles, people)}
                            </span>
                            <span className="block text-xs text-muted-foreground">{stepDetail(step)}</span>
                          </li>
                        </Fragment>
                      ))}
                    </ol>
                  </td>
                  <td className="px-3 py-3 text-[0.8125rem]">
                    {rule.contentKey === "md_update" ? (
                      <>
                        Eigen passages eerst
                        <span className="block text-xs text-muted-foreground">Altijd door de MD zelf</span>
                      </>
                    ) : !QUOTE_KEYS.has(rule.contentKey) ? (
                      <span className="text-muted-foreground">Niet van toepassing</span>
                    ) : rule.quotesByInterviewee ? (
                      <>
                        Eerst naar de geciteerde
                        <span className="block text-xs text-muted-foreground">Alleen die kan akkoord geven</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Geen apart citaatakkoord</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[0.8125rem] tabular-nums">
                    {rule.deadlineDays} {rule.deadlineDays === 1 ? "werkdag" : "werkdagen"}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      <RuleDialog rule={rule} roles={roles} people={people} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Wat er gebeurt als iemand niet reageert">
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
          <div className="space-y-1">
            <dt className="text-sm font-medium">Na twee werkdagen</dt>
            <dd className="text-[0.8125rem] leading-relaxed text-muted-foreground">
              De bot stuurt één herinnering. Daarna stuurt hij over dit verzoek niets meer.
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-sm font-medium">Na de termijn</dt>
            <dd className="text-[0.8125rem] leading-relaxed text-muted-foreground">
              De redactie krijgt een melding en kan zelf over het stuk beslissen. Extern werk wacht tot de redactie dat doet.
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-sm font-medium">Een citaat zonder akkoord</dt>
            <dd className="text-[0.8125rem] leading-relaxed text-muted-foreground">
              Blijft geblokkeerd. De redactie kan het citaat uit de tekst halen, maar het nooit namens iemand goedkeuren.
            </dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}
