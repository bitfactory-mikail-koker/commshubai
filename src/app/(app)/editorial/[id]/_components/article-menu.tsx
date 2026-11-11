"use client";

import { useState } from "react";
import { Ellipsis, Trash2 } from "lucide-react";
import { deleteArticle } from "@/actions/articles";
import { useAction } from "@/components/shared/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** "Meer" menu of the editor: deleting an item that is not approved or published. */
export function ArticleMenu({ articleId, title }: { articleId: string; title: string }) {
  const { run, pending } = useAction();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Meer acties" disabled={pending}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash2 />
            Contentitem verwijderen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contentitem verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              “{title}” wordt definitief verwijderd, inclusief versies, opmerkingen en reviews. Dit kan niet ongedaan worden gemaakt.
              Wil je het item bewaren, archiveer het dan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger-strong text-white hover:bg-danger-strong/90"
              onClick={() => run(() => deleteArticle({ id: articleId }), { redirectTo: "/editorial" })}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
