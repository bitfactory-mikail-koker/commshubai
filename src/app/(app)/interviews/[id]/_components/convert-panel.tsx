"use client";

import { useState } from "react";
import { FilePenLine } from "lucide-react";
import { convertInterview } from "@/actions/interviews";
import { FormField, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTENT_TYPE_LABELS } from "@/lib/constants";
import type { ContentType } from "@/lib/types";

// Newsletters and social posts have their own workflows.
const OPTIONS: ContentType[] = [
  "customer_case",
  "news_article",
  "website_article",
  "interview",
  "internal_update",
  "employee_introduction",
  "management_update",
];

export function ConvertPanel({ interviewId, defaultType }: { interviewId: string; defaultType: ContentType }) {
  const { run, pending } = useAction();
  const [contentType, setContentType] = useState<ContentType>(defaultType);

  return (
    <div className="space-y-3">
      <FormField label="Contenttype" help="Het concept gebruikt alleen wat in het interview en de gekoppelde bronnen staat.">
        <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
          <SelectTrigger className="w-full" aria-label="Contenttype">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPTIONS.map((type) => (
              <SelectItem key={type} value={type}>
                {CONTENT_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <Button
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          run(() => convertInterview({ id: interviewId, contentType }), {
            redirectTo: (result) => `/editorial/${result.data.articleId}`,
          })
        }
      >
        <FilePenLine />
        {pending ? "Concept wordt geschreven…" : "Concept laten schrijven"}
      </Button>
    </div>
  );
}
