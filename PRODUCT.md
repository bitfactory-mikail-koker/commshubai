# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: the communications and marketing team of a Dutch organization (editors, chief editor, marketing manager, reviewers). They work in the hub for hours a day: triaging signals, running interviews, editing drafts, reviewing and approving, scheduling publications. They are fluent in editorial tools and expect density and scan speed.

Secondary: employees and leadership who drop in to answer an interview, submit a tip or read published internal news. Administrators who configure agents, integrations, brand guidelines and roles.

## Product Purpose

A virtual communications department. The hub collects authorized information from company systems (Slack, Jira, Teamleader Orbit, e-mail, manual tips), detects newsworthy developments, proposes stories, conducts interviews, writes drafts and runs editorial approval and publication. Success: a real development in the company becomes an accurate, approved, published story with far less manual chasing, and nothing leaves the building without a human decision.

## Positioning

Two specialized agents (external and internal communications) share one intelligence layer, and every claim in a draft is traceable to a source message or an interview answer. Agents prepare; people decide. The database refuses publication without a human approval record, and external publication without confirmed permission.

## Operating Context

- Thirteen working sections: Dashboard, Intelligence Inbox, Editorial Workspace, External and Internal Communications, Interview Studio, Newsletter Studio, Content Calendar, AI Agents, Brand and Tone of Voice, Integrations, Team and Permissions, Settings; plus a guided demo scenario.
- Editorial workflow statuses: new signal, research, interview requested, interview completed, draft, in review, changes requested, approved, scheduled, published, archived.
- Six roles: Administrator, Chief Editor, Editor, Reviewer, Marketing Manager, Employee.
- The interface language is Dutch. Code, schema and documentation are English.
- Used at a desk on laptop and external monitor during the working day; occasionally on a phone to approve or answer an interview.

## Capabilities and Constraints

- Stack is fixed: Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui (Radix), Supabase, lucide-react icons.
- The AI layer runs on the Claude API when a key is set, otherwise in a rule-based demo mode. Demo and simulated data must always be recognizable as such.
- Integrations must never appear connected unless a live connection test succeeded. Sending and posting without a connected channel is recorded and shown as simulated.
- Agents never invent facts, quotes, customer results or metrics.
- All behaviour, routes, labels used by the automated tests, and server actions stay as they are; a visual redesign may not change what the product does.

## Brand Commitments

- Product name in the interface: Communicatiehub.
- Standing visual preference (user, 2026-11-11): a professional product dashboard, the familiar category standard played straight, at the craft level of the Stripe dashboard. Explicitly not an "AI-generated" look.
- Light and dark themes, following the system setting.

## Evidence on Hand

- Seeded Dutch demo organization "Noordlicht Digital" with signals, interviews, articles, newsletters and agent activity (`scripts/seed.ts`, `scripts/seed-content.ts`). Fictional; flagged as demo in the data.
- No real customers, testimonials, logos or metrics exist. None may be invented.
- No logo or brand asset has been supplied.

## Product Principles

1. People decide; agents prepare. The state of every approval is always visible.
2. Everything is traceable: a signal shows its sources, a draft shows what it was built from.
3. Honest status. Demo, simulated and not-connected are stated plainly, never dressed up.
4. Built for daily work: scan first, read second, act in place.

## Accessibility & Inclusion

WCAG AA contrast in both themes, full keyboard operation, visible focus, and reduced-motion respected.
