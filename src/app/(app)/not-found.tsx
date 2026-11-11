import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-5" />
      </span>
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Niet gevonden</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Dit item bestaat niet (meer) of je hebt er geen toegang toe.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/dashboard">Naar het dashboard</Link>
      </Button>
    </div>
  );
}
