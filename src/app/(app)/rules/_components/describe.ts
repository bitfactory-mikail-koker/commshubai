import type { RuleStep } from "@/lib/types";

export type RoleOption = { key: string; name: string };
export type PersonOption = { id: string; name: string };

export type RuleRow = {
  contentKey: string;
  label: string;
  steps: RuleStep[];
  quotesByInterviewee: boolean;
  deadlineDays: number;
  /** False when the organization has no stored rule for this type yet: the editors decide. */
  stored: boolean;
};

/** Content types whose text can carry quotes from an interview. */
export const QUOTE_KEYS = new Set([
  "interview",
  "customer_case",
  "news_article",
  "website_article",
  "internal_update",
  "employee_introduction",
  "management_update",
]);

export const MAX_STEPS = 5;

const orList = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} of ${items[items.length - 1]}`);

const roleNames = (keys: string[] | undefined, roles: RoleOption[]) =>
  (keys ?? []).map((key) => roles.find((r) => r.key === key)?.name ?? `${key} (verwijderd)`);

/** The name a step gets when the administrator does not give it one. */
export function autoLabel(step: RuleStep, roles: RoleOption[], people: PersonOption[]): string {
  switch (step.who) {
    case "interviewees":
      return "De geïnterviewde";
    case "editors":
      return "Redactie";
    case "project_roles": {
      const names = roleNames(step.roles, roles);
      return names.length ? `${orList(names)} van het project` : "Betrokkenen bij het project";
    }
    case "functional_roles": {
      const names = roleNames(step.roles, roles);
      return names.length ? orList(names) : "Rol";
    }
    case "persons": {
      const names = (step.profile_ids ?? []).map((id) => people.find((p) => p.id === id)?.name).filter((n): n is string => Boolean(n));
      if (names.length === 0) return "Aangewezen personen";
      return names.length > 3 ? `${names.slice(0, 3).join(", ")} en ${names.length - 3} anderen` : orList(names);
    }
  }
}

export function stepLabel(step: RuleStep, roles: RoleOption[], people: PersonOption[]): string {
  return step.label?.trim() || autoLabel(step, roles, people);
}

/** What a step asks, in a short phrase under its name. */
export function stepDetail(step: RuleStep): string {
  const min = Math.max(1, step.min ?? 1);
  switch (step.who) {
    case "interviewees":
      return "Ieder keurt het stuk zelf goed";
    case "editors":
      return min > 1 ? `${min} akkoorden van de redactie` : "Eén akkoord van de redactie";
    case "project_roles":
      return min > 1 ? `${min} akkoorden van mensen met deze rol in het project` : "Eén akkoord volstaat";
    case "functional_roles":
      return min > 1 ? `${min} akkoorden van mensen met deze rol` : "Eén akkoord volstaat";
    case "persons":
      return min > 1 ? `${min} akkoorden van deze personen` : "Eén akkoord volstaat";
  }
}
