-- =============================================================================
-- AI Communications Hub — core schema
-- Multi-tenant: every tenant table carries organization_id and is protected by
-- Row Level Security (see 20261111000002_rls.sql).
-- =============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type public.content_status as enum (
  'new_signal', 'research', 'interview_requested', 'interview_completed',
  'draft', 'in_review', 'changes_requested', 'approved', 'scheduled',
  'published', 'archived'
);

create type public.content_type as enum (
  'news_article', 'website_article', 'customer_case', 'interview',
  'internal_update', 'employee_introduction', 'social_post', 'newsletter',
  'management_update'
);

create type public.classification as enum ('internal', 'external');
create type public.agent_kind as enum ('external', 'internal');

-- ----------------------------------------------------------------------------
-- Generic helpers
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Tenancy, roles and permissions
-- ----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  locale text not null default 'nl-NL',
  timezone text not null default 'Europe/Amsterdam',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Global permission catalog (not tenant data).
create table public.permissions (
  key text primary key,
  name text not null,
  description text not null default '',
  category text not null default 'content',
  sort_order int not null default 0
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  description text not null default '',
  is_system boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);
create index roles_org_idx on public.roles (organization_id);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);
create index role_permissions_permission_idx on public.role_permissions (permission_key);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  full_name text not null,
  email text not null,
  job_title text,
  department text,
  avatar_color text not null default 'slate',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_org_idx on public.profiles (organization_id);
create index profiles_role_idx on public.profiles (role_id);

-- ----------------------------------------------------------------------------
-- Integrations
-- ----------------------------------------------------------------------------
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('slack', 'jira', 'teamleader', 'email', 'cms', 'linkedin')),
  display_name text not null,
  -- not_connected: nothing configured. demo: simulated data only.
  -- connected: a real connection test succeeded. error: last test/sync failed.
  status text not null default 'not_connected' check (status in ('not_connected', 'demo', 'connected', 'error')),
  config jsonb not null default '{}'::jsonb,       -- non-secret settings only
  scopes text[] not null default '{}',
  has_credentials boolean not null default false,
  last_tested_at timestamptz,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_count int,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);
create index integrations_org_idx on public.integrations (organization_id);

-- Secrets live in a separate table that has RLS enabled and NO policies:
-- only the server (service role) can read it; payload is AES-256-GCM encrypted
-- by the application before it is stored.
create table public.integration_credentials (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  encrypted_payload text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Agents
-- ----------------------------------------------------------------------------
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind public.agent_kind not null,
  name text not null,
  description text not null default '',
  mission text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  allowed_tools text[] not null default '{}',
  allowed_sources text[] not null default '{}',
  approval_requirements jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, kind)
);
create index agents_org_idx on public.agents (organization_id);

-- ----------------------------------------------------------------------------
-- Intelligence layer
-- ----------------------------------------------------------------------------
create table public.source_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid references public.integrations(id) on delete set null,
  source text not null check (source in ('slack', 'jira', 'teamleader', 'email', 'manual')),
  external_id text,
  channel text,
  author_name text,
  author_profile_id uuid references public.profiles(id) on delete set null,
  title text,
  body text not null,
  url text,
  metadata jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  occurred_at timestamptz not null default now(),
  ingested_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, source, external_id)
);
create index source_messages_org_time_idx on public.source_messages (organization_id, occurred_at desc);
create index source_messages_unprocessed_idx on public.source_messages (organization_id) where processed_at is null;

create table public.content_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  summary text not null,
  category text not null check (category in (
    'customer_case', 'team_achievement', 'new_employee', 'management_update',
    'project_milestone', 'organizational_update', 'commercial_update', 'other'
  )),
  audience text not null check (audience in ('external', 'internal', 'both')),
  suggested_agent public.agent_kind not null,
  relevance_score int not null check (relevance_score between 0 and 100),
  score_rationale text not null default '',
  status text not null default 'new' check (status in ('new', 'needs_info', 'in_progress', 'converted', 'dismissed', 'duplicate')),
  missing_information jsonb not null default '[]'::jsonb,
  suggested_action text not null default '',
  entities jsonb not null default '{}'::jsonb,
  confidentiality text not null default 'internal_only' check (confidentiality in ('public_ok', 'internal_only', 'needs_permission', 'confidential')),
  duplicate_of_id uuid references public.content_signals(id) on delete set null,
  related_signal_ids uuid[] not null default '{}',
  primary_source_id uuid references public.source_messages(id) on delete set null,
  submitted_by uuid references public.profiles(id) on delete set null,
  detection_provider text not null default 'demo',
  is_demo boolean not null default false,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_signals_org_idx on public.content_signals (organization_id, detected_at desc);
create index content_signals_status_idx on public.content_signals (organization_id, status);
create index content_signals_category_idx on public.content_signals (organization_id, category);

create table public.signal_sources (
  signal_id uuid not null references public.content_signals(id) on delete cascade,
  source_message_id uuid not null references public.source_messages(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  relation text not null default 'primary' check (relation in ('primary', 'related')),
  created_at timestamptz not null default now(),
  primary key (signal_id, source_message_id)
);
create index signal_sources_source_idx on public.signal_sources (source_message_id);
create index signal_sources_org_idx on public.signal_sources (organization_id);

-- ----------------------------------------------------------------------------
-- Editorial content
-- ----------------------------------------------------------------------------
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  subtitle text,
  body_html text not null default '',
  excerpt text,
  content_type public.content_type not null,
  classification public.classification not null,
  target_audience text,
  channel text,
  status public.content_status not null default 'draft',
  tags text[] not null default '{}',
  source_refs jsonb not null default '[]'::jsonb,
  author_profile_id uuid references public.profiles(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  reviewer_id uuid references public.profiles(id) on delete set null,
  current_version int not null default 0,
  publish_at timestamptz,
  published_at timestamptz,
  publication_mode text check (publication_mode in ('simulated', 'cms', 'manual')),
  external_permission text not null default 'unknown' check (external_permission in ('not_required', 'unknown', 'requested', 'granted', 'denied')),
  brand_check jsonb,
  generation_provider text,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index articles_org_status_idx on public.articles (organization_id, status);
create index articles_org_updated_idx on public.articles (organization_id, updated_at desc);
create index articles_publish_at_idx on public.articles (organization_id, publish_at) where publish_at is not null;
create index articles_reviewer_idx on public.articles (reviewer_id);

create table public.article_signals (
  article_id uuid not null references public.articles(id) on delete cascade,
  signal_id uuid not null references public.content_signals(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (article_id, signal_id)
);
create index article_signals_signal_idx on public.article_signals (signal_id);
create index article_signals_org_idx on public.article_signals (organization_id);

create table public.content_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  signal_id uuid references public.content_signals(id) on delete set null,
  title text not null,
  angle text not null default '',
  suggested_content_type public.content_type not null,
  classification public.classification not null,
  assigned_agent_id uuid references public.agents(id) on delete set null,
  referred_by_agent_id uuid references public.agents(id) on delete set null,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'in_progress', 'converted', 'declined')),
  priority int not null default 50 check (priority between 0 and 100),
  stakeholders jsonb not null default '[]'::jsonb,
  external_permission text not null default 'unknown' check (external_permission in ('not_required', 'unknown', 'requested', 'granted', 'denied')),
  article_id uuid references public.articles(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_opportunities_org_idx on public.content_opportunities (organization_id, status);
create index content_opportunities_signal_idx on public.content_opportunities (signal_id);
create index content_opportunities_agent_idx on public.content_opportunities (assigned_agent_id);

alter table public.articles
  add column opportunity_id uuid references public.content_opportunities(id) on delete set null;
create index articles_opportunity_idx on public.articles (opportunity_id);

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  version int not null,
  title text not null,
  subtitle text,
  body_html text not null default '',
  change_summary text,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_by_agent_id uuid references public.agents(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (article_id, version)
);
create index content_versions_org_idx on public.content_versions (organization_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  version int not null,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  recommendation text not null check (recommendation in ('approve', 'changes_requested', 'comment')),
  notes text,
  created_at timestamptz not null default now()
);
create index reviews_article_idx on public.reviews (article_id, created_at desc);
create index reviews_org_idx on public.reviews (organization_id);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('article', 'newsletter', 'social_post')),
  entity_id uuid not null,
  version int not null default 1,
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected', 'changes_requested', 'withdrawn')),
  requested_by_profile_id uuid references public.profiles(id) on delete set null,
  requested_by_agent_id uuid references public.agents(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decision_note text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  -- A decision other than "pending" must always be attributable to a human.
  constraint approvals_decision_needs_human check (decision = 'pending' or decided_by is not null)
);
create index approvals_entity_idx on public.approvals (entity_type, entity_id, requested_at desc);
create index approvals_org_pending_idx on public.approvals (organization_id, decision);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('article', 'newsletter', 'signal', 'interview')),
  entity_id uuid not null,
  author_profile_id uuid references public.profiles(id) on delete set null,
  author_agent_id uuid references public.agents(id) on delete set null,
  body text not null,
  quote text,
  resolved boolean not null default false,
  parent_id uuid references public.comments(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index comments_entity_idx on public.comments (entity_type, entity_id, created_at);
create index comments_org_idx on public.comments (organization_id);

-- ----------------------------------------------------------------------------
-- Interviews
-- ----------------------------------------------------------------------------
create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  purpose text not null default '',
  kind text not null default 'other' check (kind in ('customer_case', 'employee_intro', 'management', 'expert', 'team', 'other')),
  classification public.classification not null default 'internal',
  interviewee_profile_id uuid references public.profiles(id) on delete set null,
  interviewee_name text not null,
  interviewee_role text,
  status text not null default 'draft' check (status in ('draft', 'requested', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  agent_id uuid references public.agents(id) on delete set null,
  opportunity_id uuid references public.content_opportunities(id) on delete set null,
  article_id uuid references public.articles(id) on delete set null,
  questions jsonb not null default '[]'::jsonb,
  summary jsonb,
  follow_up_actions jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  requested_at timestamptz,
  completed_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interviews_org_idx on public.interviews (organization_id, status);
create index interviews_interviewee_idx on public.interviews (interviewee_profile_id);
create index interviews_article_idx on public.interviews (article_id);

create table public.interview_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  interview_id uuid not null references public.interviews(id) on delete cascade,
  role text not null check (role in ('agent', 'interviewee')),
  content text not null,
  question_id text,
  author_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index interview_messages_interview_idx on public.interview_messages (interview_id, created_at);
create index interview_messages_org_idx on public.interview_messages (organization_id);

alter table public.articles
  add column interview_id uuid references public.interviews(id) on delete set null;

-- ----------------------------------------------------------------------------
-- Agent execution: runs, task queue, inter-agent messages
-- ----------------------------------------------------------------------------
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null, -- null = shared intelligence engine
  pipeline text not null,
  trigger text not null default 'manual' check (trigger in ('manual', 'schedule', 'event', 'demo')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'waiting_approval')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  error text,
  ai_provider text,
  triggered_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index agent_runs_org_idx on public.agent_runs (organization_id, started_at desc);
create index agent_runs_agent_idx on public.agent_runs (agent_id, started_at desc);

create table public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  type text not null,
  title text not null,
  description text,
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting_approval', 'waiting_input', 'completed', 'failed', 'cancelled')),
  priority int not null default 50,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  attempts int not null default 0,
  max_attempts int not null default 3,
  dedupe_key text,
  scheduled_for timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  related_entity_type text,
  related_entity_id uuid,
  run_id uuid references public.agent_runs(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, dedupe_key)
);
create index agent_tasks_queue_idx on public.agent_tasks (status, scheduled_for);
create index agent_tasks_org_idx on public.agent_tasks (organization_id, created_at desc);
create index agent_tasks_agent_idx on public.agent_tasks (agent_id, status);

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  from_agent_id uuid not null references public.agents(id) on delete cascade,
  to_agent_id uuid not null references public.agents(id) on delete cascade,
  type text not null check (type in ('opportunity_referral', 'info_request', 'info_response')),
  subject text not null,
  body text not null,
  status text not null default 'open' check (status in ('open', 'accepted', 'answered', 'declined')),
  payload jsonb not null default '{}'::jsonb,
  signal_id uuid references public.content_signals(id) on delete set null,
  opportunity_id uuid references public.content_opportunities(id) on delete set null,
  article_id uuid references public.articles(id) on delete set null,
  response text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index agent_messages_org_idx on public.agent_messages (organization_id, created_at desc);
create index agent_messages_to_idx on public.agent_messages (to_agent_id, status);

-- ----------------------------------------------------------------------------
-- Newsletters, social posts, calendar
-- ----------------------------------------------------------------------------
create table public.newsletters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind public.agent_kind not null,
  title text not null,
  subject text,
  period_month date not null,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'changes_requested', 'approved', 'scheduled', 'sent', 'archived')),
  intro_html text not null default '',
  outro_html text not null default '',
  agent_id uuid references public.agents(id) on delete set null,
  current_version int not null default 1,
  send_at timestamptz,
  sent_at timestamptz,
  send_mode text check (send_mode in ('simulated', 'email')),
  generation_provider text,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, kind, period_month)
);
create index newsletters_org_idx on public.newsletters (organization_id, period_month desc);

create table public.newsletter_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  newsletter_id uuid not null references public.newsletters(id) on delete cascade,
  article_id uuid references public.articles(id) on delete cascade,
  section text not null default 'general',
  custom_title text,
  custom_summary text,
  position int not null default 0,
  included boolean not null default true,
  created_at timestamptz not null default now()
);
create index newsletter_items_newsletter_idx on public.newsletter_items (newsletter_id, position);
create index newsletter_items_org_idx on public.newsletter_items (organization_id);

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  article_id uuid references public.articles(id) on delete set null,
  platform text not null default 'linkedin' check (platform in ('linkedin', 'x', 'instagram', 'facebook')),
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'changes_requested', 'approved', 'scheduled', 'published', 'archived')),
  agent_id uuid references public.agents(id) on delete set null,
  current_version int not null default 1,
  publish_at timestamptz,
  published_at timestamptz,
  publication_mode text check (publication_mode in ('simulated', 'linkedin', 'manual')),
  generation_provider text,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index social_posts_org_idx on public.social_posts (organization_id, status);
create index social_posts_article_idx on public.social_posts (article_id);

create table public.content_calendar (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  entry_type text not null check (entry_type in ('article', 'interview', 'newsletter', 'social_post', 'deadline')),
  entity_type text check (entity_type in ('article', 'interview', 'newsletter', 'social_post')),
  entity_id uuid,
  classification public.classification,
  starts_at timestamptz not null,
  status text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id, entry_type)
);
create index content_calendar_org_time_idx on public.content_calendar (organization_id, starts_at);

-- ----------------------------------------------------------------------------
-- Brand & tone of voice
-- ----------------------------------------------------------------------------
create table public.brand_guidelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  brand_personality text not null default '',
  writing_style text not null default '',
  sentence_structure text not null default '',
  preferred_terminology jsonb not null default '[]'::jsonb, -- [{ term, instead_of, note }]
  words_to_avoid text[] not null default '{}',
  tone_internal text not null default '',
  tone_external text not null default '',
  tone_social text not null default '',
  communication_policies text not null default '',
  boilerplate text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null check (category in ('guideline', 'logo', 'visual', 'writing_example', 'tone_document', 'policy')),
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  extracted_text text, -- plain-text content for text uploads, usable as agent context
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index brand_assets_org_idx on public.brand_assets (organization_id, category);

-- ----------------------------------------------------------------------------
-- Audit log (append-only; doubles as the shared agent activity log)
-- ----------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_type text not null check (actor_type in ('user', 'agent', 'system')),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_agent_id uuid references public.agents(id) on delete set null,
  action text not null,
  category text not null default 'performed' check (category in (
    'discovered', 'used', 'generated', 'requested', 'performed', 'approval', 'handoff', 'system'
  )),
  entity_type text,
  entity_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  requires_approval boolean not null default false,
  created_at timestamptz not null default now()
);
create index audit_logs_org_time_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_agent_idx on public.audit_logs (actor_agent_id, created_at desc);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'profiles', 'integrations', 'agents', 'content_signals',
    'articles', 'content_opportunities', 'interviews', 'agent_tasks',
    'newsletters', 'social_posts', 'content_calendar', 'brand_guidelines'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;
