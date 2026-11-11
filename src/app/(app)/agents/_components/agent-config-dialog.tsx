"use client";

import { useMemo, useState } from "react";
import { Lock, SlidersHorizontal } from "lucide-react";
import { updateAgentConfig } from "@/actions/agents";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HUMAN_GATED_ACTIONS, SOURCE_OPTIONS, TOOLS } from "@/lib/agents/registry";
import type { AgentKind } from "@/lib/types";

export type AgentConfigView = {
  id: string;
  name: string;
  kind: AgentKind;
  mission: string;
  allowedTools: string[];
  allowedSources: string[];
  minRelevanceScore: number;
  newsletterDay: number;
};

export function AgentConfigDialog({ agent }: { agent: AgentConfigView }) {
  const [open, setOpen] = useState(false);
  const [mission, setMission] = useState(agent.mission);
  const [tools, setTools] = useState<string[]>(agent.allowedTools);
  const [sources, setSources] = useState<string[]>(agent.allowedSources);
  const [minScore, setMinScore] = useState(String(agent.minRelevanceScore));
  const [newsletterDay, setNewsletterDay] = useState(String(agent.newsletterDay));
  const { run, pending, fieldErrors, clearErrors } = useAction();

  const modules = useMemo(() => {
    const available = TOOLS.filter((t) => t.availableTo.includes(agent.kind));
    const grouped = new Map<string, typeof available>();
    for (const tool of available) grouped.set(tool.module, [...(grouped.get(tool.module) ?? []), tool]);
    return [...grouped.entries()];
  }, [agent.kind]);
  const gated = HUMAN_GATED_ACTIONS.filter((a) => a.appliesTo.includes(agent.kind));

  const toggle = (list: string[], setList: (next: string[]) => void, key: string, checked: boolean) =>
    setList(checked ? Array.from(new Set([...list, key])) : list.filter((k) => k !== key));

  const reset = () => {
    setMission(agent.mission);
    setTools(agent.allowedTools);
    setSources(agent.allowedSources);
    setMinScore(String(agent.minRelevanceScore));
    setNewsletterDay(String(agent.newsletterDay));
    clearErrors();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal data-icon="inline-start" />
          Configureren
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () =>
                updateAgentConfig({
                  id: agent.id,
                  mission,
                  allowedTools: tools,
                  allowedSources: sources,
                  minRelevanceScore: Number(minScore),
                  newsletterDay: Number(newsletterDay),
                }),
              { onSuccess: () => setOpen(false) },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>{agent.name} configureren</DialogTitle>
            <DialogDescription>
              Bepaal wat deze agent mag doen en welke bronnen hij mag lezen. De agent kan alleen tools gebruiken die hier zijn aangevinkt.
            </DialogDescription>
          </DialogHeader>

          <FormField label="Opdracht" htmlFor={`mission-${agent.id}`} error={fieldErrors.mission} required>
            <Textarea
              id={`mission-${agent.id}`}
              value={mission}
              onChange={(e) => setMission(e.target.value)}
              rows={4}
              maxLength={1500}
              required
              aria-invalid={Boolean(fieldErrors.mission)}
            />
          </FormField>

          <fieldset className="space-y-3">
            <legend className="text-[0.8125rem] font-medium">Toegestane tools</legend>
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {modules.map(([module, moduleTools]) => (
                <div key={module} className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground ">{module}</p>
                  {moduleTools.map((tool) => (
                    <label key={tool.key} htmlFor={`tool-${agent.id}-${tool.key}`} className="flex items-start gap-2.5 text-sm leading-snug">
                      <Checkbox
                        id={`tool-${agent.id}-${tool.key}`}
                        checked={tools.includes(tool.key)}
                        onCheckedChange={(checked) => toggle(tools, setTools, tool.key, checked === true)}
                        className="mt-0.5"
                      />
                      <span>
                        {tool.label}
                        <span className="block text-xs text-muted-foreground">{tool.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2.5">
            <legend className="text-[0.8125rem] font-medium">Toegestane bronnen</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {SOURCE_OPTIONS.map((source) => (
                <label key={source.key} htmlFor={`source-${agent.id}-${source.key}`} className="flex items-center gap-2.5 text-sm">
                  <Checkbox
                    id={`source-${agent.id}-${source.key}`}
                    checked={sources.includes(source.key)}
                    onCheckedChange={(checked) => toggle(sources, setSources, source.key, checked === true)}
                  />
                  {source.label}
                </label>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Berichten uit niet-aangevinkte bronnen worden door deze agent niet gelezen, ook niet als ze aan een signaal zijn gekoppeld.
            </p>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Minimale relevantiescore"
              htmlFor={`score-${agent.id}`}
              error={fieldErrors.minRelevanceScore}
              help="Signalen onder deze score beoordeelt de agent niet automatisch (0-100)."
            >
              <Input
                id={`score-${agent.id}`}
                type="number"
                min={0}
                max={100}
                step={1}
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                required
              />
            </FormField>
            <FormField
              label="Dag van de maandelijkse nieuwsbrief"
              htmlFor={`day-${agent.id}`}
              error={fieldErrors.newsletterDay}
              help="De agent start vijf dagen eerder met voorbereiden (1-28)."
            >
              <Input
                id={`day-${agent.id}`}
                type="number"
                min={1}
                max={28}
                step={1}
                value={newsletterDay}
                onChange={(e) => setNewsletterDay(e.target.value)}
                required
              />
            </FormField>
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/40 px-3.5 py-3">
            <p className="flex items-center gap-2 text-[0.8125rem] font-medium">
              <Lock className="size-3.5" strokeWidth={1.75} />
              Niet toe te kennen: alleen na menselijke goedkeuring
            </p>
            <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
              {gated.map((action) => (
                <li key={action.key}>
                  <span className="font-medium text-foreground">{action.label}</span> - {action.description}
                </li>
              ))}
            </ul>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending}>Opslaan</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
