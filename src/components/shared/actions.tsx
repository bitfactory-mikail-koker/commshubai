"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/result";
import { cn } from "@/lib/utils";

type AnyResult = ActionResult<unknown>;

/**
 * Runs a server action with pending state and toasts.
 *
 *   const { run, pending } = useAction();
 *   run(() => saveThing(input), { onSuccess: (result) => ... });
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const router = useRouter();

  const run = useCallback(
    <R extends AnyResult>(
      action: () => Promise<R>,
      options: {
        onSuccess?: (result: Extract<R, { ok: true }>) => void;
        onError?: (result: Extract<R, { ok: false }>) => void;
        /** Navigate after success. */
        redirectTo?: string | ((result: Extract<R, { ok: true }>) => string | null);
        silent?: boolean;
      } = {},
    ) => {
      startTransition(async () => {
        let result: R;
        try {
          result = await action();
        } catch (error) {
          // Redirects thrown by a server action are handled by Next.js.
          if (typeof error === "object" && error !== null && "digest" in error) throw error;
          toast.error("Er ging iets mis. Probeer het opnieuw.");
          return;
        }
        // A server action that redirects resolves to undefined.
        if (!result) return;
        if (result.ok) {
          setFieldErrors({});
          if (result.message && !options.silent) toast.success(result.message);
          options.onSuccess?.(result as Extract<R, { ok: true }>);
          const target =
            typeof options.redirectTo === "function"
              ? options.redirectTo(result as Extract<R, { ok: true }>)
              : options.redirectTo;
          if (target) router.push(target);
          else router.refresh();
        } else {
          setFieldErrors(result.fieldErrors ?? {});
          toast.error(result.error);
          options.onError?.(result as Extract<R, { ok: false }>);
        }
      });
    },
    [router],
  );

  return { run, pending, fieldErrors, clearErrors: () => setFieldErrors({}) };
}

type ButtonProps = React.ComponentProps<typeof Button>;

/**
 * Button that runs a server action. Pass a bound action from a server
 * component: <ActionButton action={doThing.bind(null, { id })}>…</ActionButton>
 */
export function ActionButton({
  action,
  children,
  confirm,
  redirectTo,
  pendingLabel,
  ...props
}: Omit<ButtonProps, "onClick" | "action"> & {
  action: () => Promise<AnyResult>;
  /** Shows a confirmation dialog before running. */
  confirm?: { title: string; description: string; confirmLabel?: string; destructive?: boolean };
  /** A path, or (from client components) a function of the successful result. */
  redirectTo?: string | ((result: Extract<AnyResult, { ok: true }>) => string | null);
  pendingLabel?: string;
}) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const execute = () => run(action, { redirectTo });

  return (
    <>
      <Button
        {...props}
        disabled={pending || props.disabled}
        aria-busy={pending}
        onClick={() => (confirm ? setOpen(true) : execute())}
      >
        {pending && <Loader2 className="animate-spin" />}
        {/* Icon-only buttons show just the spinner while pending. */}
        {pending && String(props.size ?? "").startsWith("icon") ? null : pending && pendingLabel ? pendingLabel : children}
      </Button>
      {confirm && (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuleren</AlertDialogCancel>
              <AlertDialogAction
                className={cn(confirm.destructive && "bg-danger-strong text-white hover:bg-danger-strong/90")}
                onClick={execute}
              >
                {confirm.confirmLabel ?? "Bevestigen"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

/** Submit button with spinner for forms that manage their own pending state. */
export function SubmitButton({ pending, children, ...props }: ButtonProps & { pending: boolean }) {
  return (
    <Button type="submit" {...props} disabled={pending || props.disabled} aria-busy={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

/** Label + control + help/error text. */
export function FormField({
  label,
  htmlFor,
  error,
  help,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  help?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[0.8rem] font-medium">
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : (
        help && <p className="text-xs leading-relaxed text-muted-foreground">{help}</p>
      )}
    </div>
  );
}
