import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/shell/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Communicatiehub", template: "%s · Communicatiehub" },
  description: "AI-gedreven communicatiehub: van signaal tot goedgekeurde publicatie.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfdfe" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1118" },
  ],
};

/* Direction contract (impeccable). Emitted into the markup so it survives the build. */
const DIRECTION_CONTRACT = `<!--
THESIS: A working product dashboard, the category standard played straight at Stripe-dashboard craft level. Refuses the editorial costume it replaces: cream paper, serif display, pastel pills, boxed hero metrics.
OWN-WORLD: Cool blue-tinted neutrals, one cobalt accent for actions, selection and focus; state colour only on state. Geist throughout, 14px base, tabular figures. Hairline rules, 8px containers, 6px controls, 4px badges. Titles sit above their lists; rows over cards.
STORY: An editor sees what waits on a human decision, what the agents found, and acts in place.
FIRST VIEWPORT: Sidebar left; page title and actions; one ruled metrics strip; the approvals list first, then the agents table.
FORM: Category canon (user-pinned, standing preference); seed key 99ab072b.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nl" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        <ThemeProvider>
          <TooltipProvider delayDuration={300} skipDelayDuration={400}>
            {children}
          </TooltipProvider>
          <Toaster position="bottom-right" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
