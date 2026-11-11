# Communicatiehub

An AI-powered communications hub that works like a virtual communications department: it collects
authorized information from company systems, detects newsworthy developments, proposes stories, conducts
interviews, writes drafts and runs the editorial approval and publication process.

Two specialized agents share one intelligence layer and one editorial workspace:

- **External Communications Agent** — customer cases, news, website articles, LinkedIn drafts, the monthly external newsletter.
- **Internal Communications Agent** — team updates, employee introductions, leadership interviews, Slack/e-mail drafts, the monthly internal newsletter. It refers externally interesting stories to the external agent.

The UI is Dutch; code, schema and documentation are English.

## Local development

Everything runs on your machine: Next.js on Node, and Supabase (Postgres, Auth, Storage, Studio) in Docker
through the Supabase CLI, which is a dev dependency, so nothing has to be installed globally.

### Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 20.9 or newer (24 LTS recommended) | `node -v` |
| Docker | Docker Desktop, OrbStack or Colima | Must be running before `npm run db:start`. Give it at least 4 GB of memory. |
| Free ports | 3000, 54321 to 54324, 54327, 54329 | Next.js, Supabase API, Postgres, Studio, Mailpit |

### First run

```bash
git clone https://github.com/bitfactory-mikail-koker/commshubai.git
cd commshubai
npm install
npm run setup        # starts Supabase in Docker, writes .env.local, applies the migrations and seeds the demo data
npm run dev          # http://localhost:3000
```

Sign in as `sanne@noordlicht.example` with password `Demo-Noordlicht-2026` (or click one of the demo accounts on the
login page). The first `db:start` downloads the Supabase images and takes a few minutes.

`npm run setup` is three steps you can also run on their own:

| Command | What it does |
| --- | --- |
| `npm run db:start` | Starts the local Supabase containers. Services the app does not use (realtime, edge functions, analytics) are skipped. |
| `npm run setup:env` | Writes `.env.local` from `npx supabase status -o env` and generates the local secrets (`INTEGRATION_ENCRYPTION_KEY`, `CRON_SECRET`, `INBOUND_MAIL_SECRET`). It refuses to overwrite an existing file; add `-- --force` to replace it. |
| `npm run db:reset` | Drops the local database, applies `supabase/migrations/*` and runs the seed. |

### Environment variables

`.env.example` documents every variable. For local development only these matter:

| Variable | Local value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Written by `setup:env` |
| `ANTHROPIC_API_KEY` | Optional. Empty runs the AI in demo mode (rule-based, clearly labelled). |
| `NEXT_PUBLIC_DEMO_MODE` | `true`: demo accounts on the login page and the demo simulations |
| `ENABLE_DEV_SCHEDULER` | `true` runs the background jobs every minute inside `npm run dev` |
| `NEXT_PUBLIC_APP_URL` | The URL the app runs on; used in links the bot sends |

### Day to day

| Command | When |
| --- | --- |
| `npm run dev` | Start the app. |
| `npm run db:seed` | Restore the demo data after clicking around or running tests. Only the demo organizations are replaced. |
| `npm run db:reset` | After pulling new migrations, or to start from scratch. |
| `npm run db:types` | After changing a migration: regenerates `src/lib/database.types.ts`. |
| `npm run db:stop` | Stop the Supabase containers (data is kept in a Docker volume). |
| `npx supabase status` | URLs and keys of the running stack. |

Useful local URLs: Supabase Studio (browse tables, run SQL) at http://127.0.0.1:54323, Mailpit (mail sent by
Supabase Auth) at http://127.0.0.1:54324.

### Adding a migration

```bash
npx supabase migration new describe_the_change   # creates supabase/migrations/<timestamp>_describe_the_change.sql
npm run db:reset                                 # applies all migrations and reseeds
npm run db:types                                 # regenerates the typed database client
```

Every table needs Row Level Security. Add a check for new rules to `scripts/test-rls.ts`.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| `Cannot connect to the Docker daemon` | Start Docker Desktop (or OrbStack/Colima) and run `npm run db:start` again. |
| `port is already allocated` | Another Supabase project is running: `npx supabase stop --project-id <other>` or stop it in Docker. |
| `Missing environment variable …` | `.env.local` is missing or incomplete: `npm run setup:env -- --force`. |
| Login fails right after setup | The seed did not run: `npm run db:seed`. |
| Styles stop updating in `npm run dev` | Do not run `next build` while `next dev` is running; stop both, delete `.next`, start `npm run dev`. |
| Playwright cannot find a browser | `npx playwright install chromium` |

## The redactie (Slack bot)

On top of the hub sits the **redactie**: a Slack bot (named in the settings, e.g. "NOBEARS Content Director") that
prepares internal and external communication, and a website where people judge, approve and set pieces ready. One
editorial team with two bureaus (internal, external) and one shared list of topics.

Five concepts: **bureau**, **signaal** (something that came in), **onderwerp** (one story: its signals, interviews and
pieces), **stuk** (one text in one form) and **editie** (a bundle: internal newsletter, external newsletter, MD-update).
Six steps: opvangen → **beoordelen** (the editors decide) → ophalen (interview) → schrijven (with a self-check) →
**goedkeuren** → **klaarzetten** (a person publishes).

| Flow | Where in the code |
| --- | --- |
| A. Emoji on a message in a followed channel; 🚫 excludes and deletes | `lib/redactie/intake.ts` `handleReaction` |
| B. The bot notices news itself (follow mode "meelezen"/"actief ophalen") | `handleChannelMessage` |
| C. Tips by DM, the website form or the mailbox, with four outcomes (new proposal, addition to a topic, item for a fixed rubric, nothing) | `handleTip`, `handleInboundMail`, `POST /api/inbound/mail` |
| D. Interview by DM: invitation (now / later / not the right person), 3 to 5 questions, "Klopt dit?", one reminder | `lib/redactie/interview-flow.ts` |
| E. Writing with a self-check: facts and quotes traced to sources, anonymous customers, internal-only sources | `lib/agents/pipelines.ts` `generateDraft`, `sensitivityOf` |
| F. Rule-based approval per content type, quotes by the person quoted only, ordered steps, deadlines, diff-only re-approval, change requests in plain words | `lib/redactie/approval-flow.ts`, `actions/approvals.ts`, `/preview/[type]/[id]` |
| G. Customer case: project recognised or proposed, DM confirms, "mag het extern?", follow-up social posts and internal piece | `lib/redactie/topics.ts` |
| I. MD-update twice a month, ordered by theme, each MD approves own passages, non-responders left out | `lib/redactie/rhythms.ts` |
| L. Internal → external: an editor releases, new text, new approvals, sentence-by-sentence final check | `releaseTopic`, `recordFinalCheck` |
| M. Ready for publication: copy, download as text or HTML, tick off with the link | `components/redactie/ready-panel.tsx`, `/api/export/[type]/[id]` |

Screens: **Voor mij**, **Voorvertoning**, **Inbox** (proposals: oppakken / later / afwijzen), **Onderwerpen** (board),
**Edities**, **Kalender**, **Projecten**, **Mensen en rollen**, **Groepen en ritmes**, **Kanalen en emoji's**,
**Goedkeuringsregels**, **Gedrag en postvak** (pause button, shadow mode, pilot group, outbox, try-outs without
Slack), **Stijl**, **Logboek**, **Cijfers**, and per person **Wat is er over mij bewaard**.

The bot's manners are one pure function (`lib/redactie/conduct.ts`) that every outgoing message passes: pause button,
shadow mode, pilot group, opt-out and pauses set by the person, absence, at most one new request per person per N days
(approval requests do not count), and no messages outside working hours. Every message lands in the outbox
(`bot_messages`) with what happened to it: sent, simulated (no Slack connection), shadow, held until working hours, or
blocked with the reason. The database refuses following a private channel or a channel with customers, refuses a quote
decision by anyone but the person quoted, and refuses an external piece from an internal-only topic until an editor
released it.

New organizations start in **shadow mode**. Defaults from the proposal: lookback 30 days (max 90), one approval per
content type, one reminder after two working days, signals that led nowhere deleted after 12 months, AI cost ceiling
€150 per month.

### Slack app

Create an internal Slack app for the workspace with a bot user. Scopes: `channels:history`, `channels:read`,
`reactions:read`, `chat:write`, `im:history`, `im:write`, `users:read`, `users:read.email`. Event subscriptions,
Request URL `https://<host>/api/slack/events`: `reaction_added`, `message.channels`, `message.im`,
`member_joined_channel`. Store the bot token and the signing secret at **Integraties → Slack** and put the workspace's
`team_id` and the bot's `bot_user_id` in the integration config. Every request is verified with the signing secret.
Being invited to a channel does not make the bot follow it: an administrator decides that at **Kanalen en emoji's**.
**Not tested against a real workspace in this environment**; use **Gedrag en postvak → Uitproberen zonder Slack**,
which runs the same code path.

Sign in with Slack: enable `[auth.external.slack_oidc]` in `supabase/config.toml` (or the Supabase dashboard) and set
`NEXT_PUBLIC_SLACK_LOGIN=true`. Only people who already exist in the organization (imported at **Mensen en rollen →
Personen ophalen uit Slack**) get in; an unknown Slack account is turned away.

### Two models and the cost ceiling

`ANTHROPIC_TRIAGE_MODEL` (default `claude-haiku-5-5`) judges incoming Slack messages and tips; `ANTHROPIC_MODEL`
(default `claude-opus-5-5`) interviews, writes and checks. Every call is metered in `ai_usage` with an estimated cost
(prices in `lib/ai/metering.ts`), and once the monthly ceiling is reached the bot judges and writes nothing more until
the ceiling is raised or the month ends.

## Demo accounts

All demo users belong to the fictional agency **Noordlicht Digital** and share the password `Demo-Noordlicht-2026`.
With `NEXT_PUBLIC_DEMO_MODE=true` the login page offers them as one-click accounts.

| User | Role | What it shows |
| --- | --- | --- |
| sanne@noordlicht.example | Administrator (Beheerder), MD | Everything |
| daan@noordlicht.example | Chief Editor (Hoofdredacteur) | Approve, publish, manage agents |
| lotte@noordlicht.example | Editor (Redacteur) | Create and edit, submit for review |
| ruben@noordlicht.example | Reviewer | Review and request changes, cannot approve |
| femke@noordlicht.example | Marketing Manager | Approve and publish, manage brand |
| tim@noordlicht.example | Employee (Medewerker), DM | Approves own quotes, interviews, posts in own name, tips |
| marieke@noordlicht.example | Employee (Medewerker), MD | MD-update interview and own passages |
| joost@, bram@noordlicht.example | Employee (Medewerker) | A developer, and someone who is marked absent |

`npm run db:seed` restores the demo data at any time (it only replaces the demo organizations).

## Guided demo scenario

**Demo → Demoscenario** walks through the whole chain with real records: a simulated Slack message arrives →
the intelligence engine detects a signal and links related Jira and Teamleader messages → the external agent
proposes a customer case → requests an interview → the interview is held in the Interview Studio → the agent
writes a draft → review and human approval → permission for external publication is confirmed → the
publication is scheduled on the calendar.

## Architecture

```
src/
  app/(auth)            login, registration (creates a new, isolated organization)
  app/(app)             the 13 sections + demo scenario; server components read through RLS
  app/api/jobs/tick     cron endpoint for background jobs
  actions/              server actions: validation (zod), permission check, audit log
  lib/
    ai/                 AIProvider interface · claude.ts (Claude API) · demo.ts (rule-based stand-in)
    intelligence/       retrieval → signal detection → context enrichment → duplicate detection
    agents/             registry (tools) · runtime (permissions, run log) · pipelines · tasks (job queue)
                        · brand-validation
    integrations/       registry (metadata) · connectors (Slack, Jira, CMS webhook) · service
    demo/               demo feed and scenario state
    auth.ts, permissions.ts, workflow.ts, approvals.ts, publication.ts, crypto.ts, sanitize.ts, …
supabase/migrations/    schema, RLS policies, workflow guards, organization bootstrap
scripts/                seed.ts (demo data) · test-rls.ts (isolation and permission checks)
e2e/                    Playwright tests for the critical flows
```

### Agent pipeline

Each stage is a separate module, and every run is recorded in `agent_runs` (with its steps) and in the shared
activity log (`audit_logs`):

1. **Information retrieval** – connectors or the demo feed write `source_messages`.
2. **Signal detection** – `AIProvider.analyzeMessage` → `content_signals` (category, relevance, missing information, confidentiality, suggested agent).
3. **Context enrichment** – related sources from other systems, related signals, duplicate detection.
4. **Story evaluation** – the suggested agent creates a `content_opportunity`; the internal agent can refer it to the external agent (`agent_messages`).
5. **Interview** – generated questions, conversational interview, structured summary with verbatim quotes.
6. **Content generation** – draft + new version; open questions are posted as a comment by the agent.
7. **Brand validation** – deterministic: words to avoid, terminology, numbers and quotes that cannot be traced to the sources, open placeholders.
8. **Approval management** – approval records; decisions are always attributed to a human.
9. **Publication** – CMS webhook when connected, otherwise simulated and stored as such.

### Guardrails

Enforced in the database, so they also hold for the service role used by agents and background jobs:

- An agent only uses tools on its allow-list and only reads sources on its allow-list (`AgentRuntime.use`, `readSources`).
- Publishing, sending and approving are not agent tools at all.
- Content cannot become *approved*, *scheduled* or *published* without an approval record for the current version, decided by a human (`has_human_approval`, `approvals_decision_needs_human`).
- External content cannot be scheduled or published until a human has set the external permission to *granted* or *not required*.
- Approved content is locked; editing requires reopening it as a draft, which requires a new approval.
- Organizations are isolated by Row Level Security on every table; integration secrets are AES-256-GCM encrypted and unreadable with a user session.
- Editor and AI output is sanitized to a small allow-list of HTML tags before it is stored and when it is rendered.

## Interface

A product dashboard in the familiar category idiom, built to be worked in all day: cool neutrals, one cobalt accent for
actions and focus, colour reserved for state, Geist throughout, ruled lists and tables instead of card grids. Light and
dark themes follow the system setting and can be switched from the user menu. Product truth lives in `PRODUCT.md`, the
visual system in `DESIGN.md`; tokens and motion defaults are in `src/app/globals.css`.

Do not run `next build` while `next dev` is running: both write to `.next` and the dev server stops picking up
stylesheet changes until it is restarted.

## AI provider

| Mode | When | Behaviour |
| --- | --- | --- |
| **Claude API** | `ANTHROPIC_API_KEY` is set | Structured-output requests to `ANTHROPIC_MODEL` (default `claude-opus-5-5`) with server-side refusal fallback enabled. |
| **Demo mode** | no key | Rule-based provider: keyword analysis, question templates, drafts assembled only from source material and interview answers. Labelled as demo output throughout the UI. |

The provider is one interface (`src/lib/ai/types.ts`); adding another model vendor means implementing that interface.

## Integrations

| Integration | Status in this MVP |
| --- | --- |
| Slack | Connector implemented on the official Web API (connection test + channel history sync, public allow-listed channels only). **Not yet tested against a real workspace.** |
| Jira | Connector implemented on the Cloud REST API v3 (connection test + recently completed issues). **Not yet tested against a real site.** |
| Website CMS | Generic signed webhook (HMAC-SHA256). **Tested end to end** against a local HTTP receiver in `e2e/workflows.spec.ts`. |
| Teamleader Orbit, Gmail/Outlook, LinkedIn | Configuration and encrypted credential storage only. They require an OAuth flow that is not built yet; no connection can be made. |

Each source integration has a clearly marked **demo simulation** that delivers sample messages. An integration is
only shown as *Verbonden* after a successful live connection test. Without a connected channel, publishing an
article, posting a social post and sending a newsletter are recorded as *gesimuleerd*.

## Background jobs

`agent_tasks` is the queue. `POST /api/jobs/tick` with `Authorization: Bearer $CRON_SECRET`:

- schedules recurring work (monthly newsletter preparation per agent, leadership interviews on day 1 and 15, analysis of new source messages, sync of connected integrations),
- applies the retention period to old source messages (content removed, reference kept),
- publishes content whose human-approved scheduled time has passed,
- runs due tasks with retries and exponential backoff.

`vercel.json` schedules the tick every 10 minutes. Locally, set `ENABLE_DEV_SCHEDULER=true` to run it every
minute inside the dev server, or use **AI-agents → Nu uitvoeren**.

## Tests

```bash
npm run typecheck
npm run lint
npm test                  # unit tests: workflow rules, brand validation, sanitizer, demo provider
npm run test:rls          # checks against the seeded database: tenant isolation, roles, approval and redactie guards
npm run test:flow         # the core redactie flow through the real code: emoji → interview → draft → approval → ready
npm run test:e2e          # Playwright; needs `npm run dev` running. E2E_BASE_URL defaults to http://localhost:3000
```

The database tests and the end-to-end tests change demo data; run `npm run db:seed` afterwards. Before the first
end-to-end run, install the browser once with `npx playwright install chromium`.

## Deploying

1. Create a Supabase project, then `npx supabase link` and `npx supabase db push`.
2. Set the environment variables from `.env.example` (use the project's publishable and secret keys). Set `NEXT_PUBLIC_DEMO_MODE=false`.
3. Create the first organization through `/register`, or seed your own.
4. Schedule `/api/jobs/tick` (`vercel.json` does this on Vercel).

## Known limitations

- The Claude API path has not been exercised in this environment (no API key was available); the demo provider has.
- Slack and Jira connectors are untested against live accounts; Teamleader, e-mail and LinkedIn have no connector yet.
- Newsletters and social posts have no delivery channel, so sending/posting is always simulated.
- All dates are displayed in `Europe/Amsterdam`; the organization timezone setting is stored but not yet applied.
- New users receive a one-time temporary password shown to the administrator; there is no e-mail invitation or password-reset flow yet.
- Uploaded brand documents are used as agent context only when they are plain text or Markdown.
- The Slack bot, Slack sign-in and the mailbox webhook have not been run against a real Slack workspace or mail provider.
- Rejections are stored with their reason, but the bot does not yet learn from them; "leren van correcties", memory, the
  spreading monitor and the calendar hooks from the proposal's later phases are not built.
- Voice messages in interviews are not transcribed; images are requested as a follow-up action, not received.
- Paragraph-to-source tracing on the preview page is a word and figure match: a help for checking, not proof.
- The demo provider can only carry out literal change requests (vervang "A" door "B", schrap "A"); with the Claude API
  the bot rewrites freely within the rules.
