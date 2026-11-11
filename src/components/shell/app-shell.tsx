"use client";

import { Suspense, use, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BarChart3,
  Bot,
  BotMessageSquare,
  CalendarDays,
  ChevronsUpDown,
  CircleCheck,
  FolderKanban,
  Hash,
  History,
  Inbox,
  KanbanSquare,
  ListChecks,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  Mic,
  Monitor,
  Moon,
  Newspaper,
  Palette,
  PlayCircle,
  Plug,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/actions/auth";
import { UserAvatar } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchDialog } from "@/components/shell/search-dialog";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "for-me": CircleCheck,
  topics: KanbanSquare,
  projects: FolderKanban,
  groups: UsersRound,
  channels: Hash,
  rules: ListChecks,
  bot: BotMessageSquare,
  logbook: History,
  figures: BarChart3,
  dashboard: LayoutDashboard,
  inbox: Inbox,
  editorial: Newspaper,
  external: Megaphone,
  internal: Users,
  interviews: Mic,
  newsletters: Mail,
  calendar: CalendarDays,
  agents: Bot,
  brand: Palette,
  integrations: Plug,
  team: ShieldCheck,
  settings: Settings,
  demo: PlayCircle,
};

export type NavItem = { key: string; label: string; href: string };
export type NavBadges = Partial<Record<string, number>>;
export type NavGroup = { label: string; items: NavItem[] };

export type ShellProps = {
  groups: NavGroup[];
  badges: Promise<NavBadges>;
  organizationName: string;
  user: { name: string; email: string; role: string; avatarColor: string };
  ai: { id: "claude" | "demo"; label: string };
  /** Shown when the bot is not simply running: paused, or only showing the editors what it would do. */
  bot?: { state: "paused" | "shadow"; href: string } | null;
  children: React.ReactNode;
};

function NavBadge({ badges, itemKey }: { badges: Promise<NavBadges>; itemKey: string }) {
  const count = use(badges)[itemKey];
  if (!count) return null;
  return (
    <span className="ml-auto min-w-5 rounded-xs bg-foreground/[0.07] px-1 text-center text-xs leading-5 font-medium text-foreground/80 tabular-nums">
      {count}
    </span>
  );
}

function NavList({ groups, badges, onNavigate }: { groups: NavGroup[]; badges: Promise<NavBadges>; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-4" aria-label="Hoofdnavigatie">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{group.label}</p>
          <ul className="space-y-px">
            {group.items.map((item) => {
              const Icon = ICONS[item.key] ?? LayoutDashboard;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-8 items-center gap-2.5 rounded-md px-2 text-[0.8125rem] outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50",
                      active
                        ? "bg-sidebar-accent font-medium text-foreground"
                        : "text-foreground/70 hover:bg-sidebar-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} strokeWidth={1.75} />
                    <span className="truncate">{item.label}</span>
                    <Suspense fallback={null}>
                      <NavBadge badges={badges} itemKey={item.key} />
                    </Suspense>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ organizationName }: { organizationName: string }) {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 outline-none transition-colors duration-150 hover:bg-sidebar-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground text-[0.8125rem] font-semibold text-background">
        C
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[0.8125rem] font-semibold">Communicatiehub</span>
        <span className="block truncate text-xs text-muted-foreground">{organizationName}</span>
      </span>
    </Link>
  );
}

function AiStatus({ ai }: { ai: ShellProps["ai"] }) {
  return (
    <Link
      href="/settings"
      title={ai.id === "claude" ? ai.label : "Geen API-sleutel ingesteld: analyses en concepten zijn regelgebaseerd."}
      className="flex h-8 items-center gap-2.5 rounded-md px-2 text-xs text-muted-foreground outline-none transition-colors duration-150 hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Sparkles className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{ai.id === "claude" ? "AI: Claude API" : "AI: demo-modus"}</span>
    </Link>
  );
}

function BotStatus({ bot }: { bot: NonNullable<ShellProps["bot"]> }) {
  return (
    <Link
      href={bot.href}
      title={
        bot.state === "paused"
          ? "De bot stuurt geen berichten en maakt geen nieuwe voorstellen."
          : "De bot laat alleen aan de redactie zien wat hij zou doen. Er gaat niets naar collega's."
      }
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2 text-xs outline-none transition-colors duration-150 hover:bg-sidebar-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50",
        bot.state === "paused" ? "font-medium text-warning" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <BotMessageSquare className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{bot.state === "paused" ? "Bot: gepauzeerd" : "Bot: schaduwmodus"}</span>
    </Link>
  );
}

function UserMenu({ user }: { user: ShellProps["user"] }) {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none transition-colors duration-150 hover:bg-sidebar-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-sidebar-accent/60"
        >
          <UserAvatar name={user.name} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[0.8125rem] font-medium">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.role}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-[0.8125rem] font-medium">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Weergave</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="system">
            <Monitor />
            Systeem
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun />
            Licht
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon />
            Donker
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings />
            Instellingen
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut />
          Uitloggen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarBody({ groups, badges, organizationName, user, ai, bot, onNavigate }: Omit<ShellProps, "children"> & { onNavigate?: () => void }) {
  return (
    <>
      <div className="p-2">
        <Brand organizationName={organizationName} />
      </div>
      <div className="px-2 pb-1">
        <SearchDialog onNavigate={onNavigate} />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <NavList groups={groups} badges={badges} onNavigate={onNavigate} />
      </div>
      <div className="space-y-px border-t p-2">
        {bot && <BotStatus bot={bot} />}
        <AiStatus ai={ai} />
        <UserMenu user={user} />
      </div>
    </>
  );
}

export function AppShell({ groups, badges, organizationName, user, ai, bot, children }: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex min-h-[100dvh]">
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <SidebarBody groups={groups} badges={badges} organizationName={organizationName} user={user} ai={ai} bot={bot} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex h-13 items-center justify-between gap-3 border-b bg-background px-3 lg:hidden">
          <Brand organizationName={organizationName} />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Menu openen">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col gap-0 bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigatie</SheetTitle>
              <SidebarBody
                groups={groups}
                badges={badges}
                organizationName={organizationName}
                user={user}
                ai={ai}
                bot={bot}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </div>

        <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
