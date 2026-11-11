import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Lookups shared by every place a proposal is shown (inbox, bureau pages,
 * signal detail). Loaded once per request, through the user's own session.
 */

export type Person = { id: string; name: string; jobTitle: string | null };
export type ProjectLookup = {
  id: string;
  name: string;
  clientName: string | null;
  status: string;
  members: { profileId: string; role: string; confirmed: boolean }[];
};

export const loadTopicLookups = cache(async () => {
  const db = await createClient();
  const [{ data: profiles }, { data: projects }, { data: members }] = await Promise.all([
    db.from("profiles").select("id, full_name, job_title").eq("is_active", true).order("full_name"),
    db.from("projects").select("id, name, client_name, status").neq("status", "archived").order("name"),
    db.from("project_members").select("project_id, profile_id, project_role, confirmed"),
  ]);
  const people: Person[] = (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name, jobTitle: p.job_title }));
  const projectList: ProjectLookup[] = (projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    clientName: p.client_name,
    status: p.status,
    members: (members ?? [])
      .filter((m) => m.project_id === p.id)
      .map((m) => ({ profileId: m.profile_id, role: m.project_role, confirmed: m.confirmed })),
  }));
  return {
    people,
    personById: new Map(people.map((p) => [p.id, p])),
    projects: projectList,
    projectById: new Map(projectList.map((p) => [p.id, p])),
  };
});

/**
 * Who the bot will ask when a proposal is picked up: the people the proposal
 * names, plus (for a customer case) the DM and one or two others from the
 * project. Mirrors lib/redactie/topics, so the dialog shows what will happen.
 */
export function suggestedInterviewees(
  topic: { proposed_interviewee_ids: string[]; suggested_content_type: string; project_id: string | null },
  lookups: { projectById: Map<string, ProjectLookup>; personById: Map<string, Person> },
): string[] {
  if (topic.suggested_content_type === "social_post") return [];
  const ids = new Set<string>(topic.proposed_interviewee_ids ?? []);
  if (topic.suggested_content_type === "customer_case" && topic.project_id) {
    const members = [...(lookups.projectById.get(topic.project_id)?.members ?? [])]
      .filter((m) => m.confirmed)
      .sort((a, b) => Number(b.role === "dm") - Number(a.role === "dm"));
    for (const member of members) {
      if (ids.size >= 3) break;
      if (member.role !== "developer") ids.add(member.profileId);
    }
  }
  return [...ids].filter((id) => lookups.personById.has(id)).slice(0, 3);
}
