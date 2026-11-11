"use client";

import { useState } from "react";
import { Share2, UserRound } from "lucide-react";
import { createFollowUpsAction, createPersonalPost } from "@/actions/topics";
import { ActionButton, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProfileOption } from "./types";

/**
 * What follows from an approved external piece: two or three social posts and
 * a short piece for the internal newsletter, and a LinkedIn post in a
 * colleague's own name. Everything is a draft with its own approval.
 */
export function FollowUpActions({ articleId, profiles, hasPosts }: { articleId: string; profiles: ProfileOption[]; hasPosts: boolean }) {
  const { run, pending } = useAction();
  const [profileId, setProfileId] = useState("");

  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-[0.8125rem] font-medium">Vervolgstukken</p>
      <ActionButton variant="outline" size="sm" className="w-full" action={() => createFollowUpsAction({ articleId })} pendingLabel="Bezig…">
        <Share2 />
        {hasPosts ? "Stukje voor de interne nieuwsbrief maken" : "Social posts en intern stukje maken"}
      </ActionButton>
      <div className="space-y-2">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Een LinkedIn-post op naam van een collega. Die keurt hem zelf goed en plaatst hem zelf.
        </p>
        <div className="flex gap-2">
          <Select value={profileId} onValueChange={setProfileId}>
            <SelectTrigger className="min-w-0 flex-1" aria-label="Collega">
              <SelectValue placeholder="Kies een collega" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={!profileId || pending}
            onClick={() => run(() => createPersonalPost({ articleId, profileId }), { onSuccess: () => setProfileId("") })}
          >
            <UserRound />
            Maken
          </Button>
        </div>
      </div>
    </div>
  );
}
