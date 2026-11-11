"use server";

import { requireActionSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PickablePerson } from "./people-picker";

/** Active colleagues, for the dialogs that choose whom the bot approaches. Loaded when a dialog opens. */
export async function listColleagues(): Promise<PickablePerson[]> {
  await requireActionSession();
  const db = await createClient();
  const { data } = await db.from("profiles").select("id, full_name, job_title").eq("is_active", true).order("full_name");
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name, jobTitle: p.job_title }));
}
