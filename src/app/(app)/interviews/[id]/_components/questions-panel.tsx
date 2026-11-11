"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { updateInterviewQuestions } from "@/actions/interviews";
import { useAction } from "@/components/shared/actions";
import { EmptyState } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { InterviewQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";

function nextId(questions: InterviewQuestion[]): string {
  const max = questions.reduce((highest, q) => {
    const n = Number(q.id.replace(/\D/g, ""));
    return Number.isFinite(n) && n > highest ? n : highest;
  }, 0);
  return `q${max + 1}`;
}

export function QuestionsPanel({
  interviewId,
  questions,
  askedIds,
  editable,
}: {
  interviewId: string;
  questions: InterviewQuestion[];
  askedIds: string[];
  editable: boolean;
}) {
  const { run, pending } = useAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<InterviewQuestion[]>(questions);
  const asked = new Set(askedIds);

  const startEditing = () => {
    setDraft(questions);
    setEditing(true);
  };

  const update = (id: string, patch: Partial<InterviewQuestion>) =>
    setDraft((list) => list.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  const move = (index: number, delta: number) =>
    setDraft((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });

  const save = () =>
    run(
      () =>
        updateInterviewQuestions({
          id: interviewId,
          questions: draft.map((q) => ({ id: q.id, text: q.text.trim(), topic: q.topic?.trim() || undefined })),
        }),
      { onSuccess: () => setEditing(false) },
    );

  if (editing) {
    return (
      <div className="space-y-3">
        <ol className="space-y-3">
          {draft.map((question, index) => (
            <li key={question.id} className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">{index + 1}.</span>
                <Input
                  value={question.topic ?? ""}
                  onChange={(e) => update(question.id, { topic: e.target.value })}
                  placeholder="Onderwerp"
                  maxLength={40}
                  aria-label={`Onderwerp van vraag ${index + 1}`}
                  className="h-7 flex-1 bg-card text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Vraag omhoog"
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => move(index, 1)}
                  disabled={index === draft.length - 1}
                  aria-label="Vraag omlaag"
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDraft((list) => list.filter((q) => q.id !== question.id))}
                  disabled={draft.length <= 1}
                  aria-label="Vraag verwijderen"
                >
                  <Trash2 />
                </Button>
              </div>
              <Textarea
                value={question.text}
                onChange={(e) => update(question.id, { text: e.target.value })}
                rows={2}
                maxLength={500}
                aria-label={`Tekst van vraag ${index + 1}`}
                className="min-h-14 bg-card text-sm"
              />
            </li>
          ))}
        </ol>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={draft.length >= 15}
          onClick={() => setDraft((list) => [...list, { id: nextId(list), text: "", topic: "" }])}
        >
          <Plus />
          Vraag toevoegen
        </Button>
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} disabled={pending}>
            Annuleren
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            {pending ? "Opslaan…" : "Vragen opslaan"}
          </Button>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <EmptyState
        title="Geen voorbereide vragen"
        className="py-6"
        action={
          editable ? (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Plus />
              Vragen toevoegen
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {questions.map((question, index) => {
          const isAsked = asked.has(question.id);
          return (
            <li key={question.id} className="flex gap-3">
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[0.68rem] font-semibold tabular-nums",
                  isAsked ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
                )}
                title={isAsked ? "Gesteld" : "Nog niet gesteld"}
              >
                {isAsked ? <Check className="size-3" strokeWidth={2.5} /> : index + 1}
              </span>
              <div className="min-w-0 space-y-0.5">
                {question.topic && (
                  <p className="text-xs font-medium text-muted-foreground first-letter:uppercase">{question.topic}</p>
                )}
                <p className={cn("text-sm leading-relaxed", isAsked && "text-muted-foreground")}>{question.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {editable && (
        <Button variant="outline" size="sm" onClick={startEditing}>
          <Pencil />
          Vragen aanpassen
        </Button>
      )}
    </div>
  );
}
