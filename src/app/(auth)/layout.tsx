export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center bg-subtle px-4 py-10 sm:justify-center sm:py-16">
      <div className="w-full max-w-[25rem]">
        <div className="mb-6 flex items-center gap-2.5 px-1">
          <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-[0.8125rem] font-semibold text-background">
            C
          </span>
          <span className="text-[0.9375rem] font-semibold tracking-[-0.006em]">Communicatiehub</span>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-[0_1px_2px_oklch(0.225_0.028_264/0.05),0_12px_32px_-12px_oklch(0.225_0.028_264/0.12)] sm:p-8">
          {children}
        </div>
        <p className="mt-5 px-1 text-xs leading-relaxed text-muted-foreground">
          Agents bereiden voor, mensen beslissen. Er wordt niets gepubliceerd of verzonden zonder goedkeuring.
        </p>
      </div>
    </main>
  );
}
