-- =============================================================================
-- Redactie: everything the proposal lets the administrator configure, plus the
-- bot's conduct (outbox, shadow mode, per-person limits) and rule-based approval.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- People: functional roles, teams and per-person bot settings
-- ----------------------------------------------------------------------------
create table public.functional_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  description text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.profiles
  add column team_id uuid references public.teams(id) on delete set null,
  add column slack_user_id text,
  add column bot_may_contact boolean not null default true,   -- set by the administrator
  add column bot_follows boolean not null default false,      -- always assess this person's messages in followed channels
  add column in_pilot boolean not null default false,
  add column absent_until date,                               -- set by the person or the administrator
  add column contact_paused_until timestamptz,                -- "pauzeer een maand"
  add column contact_opt_out boolean not null default false,  -- "benader mij niet meer"
  add column last_requested_at timestamptz;                   -- last new request from the bot (approvals do not count)
create index profiles_team_idx on public.profiles (team_id);
create unique index profiles_slack_user_idx on public.profiles (organization_id, slack_user_id) where slack_user_id is not null;

create table public.profile_functional_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  functional_role_id uuid not null references public.functional_roles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, functional_role_id)
);
create index profile_functional_roles_role_idx on public.profile_functional_roles (functional_role_id);

-- ----------------------------------------------------------------------------
-- Projects
-- ----------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  client_name text,
  -- May the project / client be named externally? Recorded by the DM.
  external_naming text not null default 'unknown' check (external_naming in ('unknown', 'allowed', 'anonymous', 'not_allowed')),
  anonymous_label text,                 -- e.g. "een landelijke retailer"
  status text not null default 'confirmed' check (status in ('proposed', 'confirmed', 'archived')),
  proposed_by_bot boolean not null default false,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_role text not null default 'betrokkene',  -- key of a functional role, or free text
  confirmed boolean not null default true,          -- false while it is only the bot's suggestion
  created_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);
create index project_members_profile_idx on public.project_members (profile_id);

-- ----------------------------------------------------------------------------
-- Channels and emoji
-- ----------------------------------------------------------------------------
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slack_channel_id text not null,
  name text not null,
  is_private boolean not null default false,
  has_external_members boolean not null default false,  -- Slack Connect / guests: customers may be present
  followed boolean not null default false,
  expectation text not null default '',
  follow_mode text not null default 'emoji_only' check (follow_mode in ('emoji_only', 'listen', 'active')),
  bureau text not null default 'both' check (bureau in ('internal', 'external', 'both')),
  confidentiality text not null default 'internal_only' check (confidentiality in ('internal_only', 'external_after_approval')),
  project_id uuid references public.projects(id) on delete set null,
  explain_every_days int not null default 30 check (explain_every_days between 0 and 365),
  lookback_days int not null default 30 check (lookback_days between 0 and 365),
  joined_at timestamptz,
  last_explained_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slack_channel_id),
  -- The system refuses private channels and channels with customers, whoever tries to enable them.
  constraint channels_never_private_or_external check (not followed or (not is_private and not has_external_members))
);
create index channels_followed_idx on public.channels (organization_id) where followed;

create table public.emoji_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  emoji text not null,          -- the character shown in the interface
  shortcode text not null,      -- Slack name without colons, e.g. "mega"
  goal text not null,
  action text not null check (action in ('external_news', 'customer_case', 'internal_newsletter', 'social_post', 'interview', 'exclude')),
  direct_start boolean not null default false,  -- false: always put before the editors first
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, shortcode)
);

alter table public.source_messages
  add column channel_id uuid references public.channels(id) on delete set null,
  add column slack_ts text,
  add column excluded boolean not null default false;  -- marked with the "do not use" emoji

alter table public.content_signals
  add column emoji text,
  add column project_id uuid references public.projects(id) on delete set null,
  add column origin text not null default 'listen' check (origin in ('emoji', 'listen', 'tip', 'mail', 'manual', 'rhythm', 'interview'));

-- ----------------------------------------------------------------------------
-- Topics (onderwerpen): a proposal that the editors pick up, hold or decline
-- ----------------------------------------------------------------------------
alter table public.content_opportunities
  add column project_id uuid references public.projects(id) on delete set null,
  add column origin text not null default 'listen' check (origin in ('emoji', 'listen', 'tip', 'mail', 'manual', 'rhythm', 'referral')),
  add column snoozed_until timestamptz,
  add column decline_reason text,
  add column proposed_interviewee_ids uuid[] not null default '{}',
  add column briefing text,
  -- Internal stays internal. Only an editor can release a topic for external use.
  add column internal_only boolean not null default false,
  add column release_reason text,
  add column released_external_by uuid references public.profiles(id) on delete set null,
  add column released_external_at timestamptz,
  add column final_check_by uuid references public.profiles(id) on delete set null,
  add column final_check_at timestamptz;
alter table public.content_opportunities drop constraint content_opportunities_status_check;
alter table public.content_opportunities
  add constraint content_opportunities_status_check check (status in ('proposed', 'accepted', 'in_progress', 'converted', 'declined', 'snoozed'));

alter table public.articles
  add column published_url text,
  add column written_for_profile_id uuid references public.profiles(id) on delete set null;  -- personal LinkedIn version
alter table public.social_posts
  add column variant text,                                                                  -- e.g. "Kort", "Met citaat", "Persoonlijk"
  add column published_url text,
  add column written_for_profile_id uuid references public.profiles(id) on delete set null; -- written in this colleague's name

-- ----------------------------------------------------------------------------
-- Groups (who is approached, for what, how often) and rhythms
-- ----------------------------------------------------------------------------
create table public.outreach_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  goal text not null default '',
  bureau public.agent_kind not null default 'internal',
  member_kind text not null default 'persons' check (member_kind in ('role', 'team', 'persons')),
  functional_role_id uuid references public.functional_roles(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  frequency text not null default 'monthly' check (frequency in ('weekly', 'biweekly', 'monthly', 'rhythm_only')),
  weekday int not null default 2 check (weekday between 1 and 7),  -- ISO: 1 = Monday
  window_start time not null default '10:00',
  window_end time not null default '12:00',
  reminder_count int not null default 1 check (reminder_count between 0 and 3),
  reminder_after_days int not null default 2 check (reminder_after_days between 1 and 14),
  after_no_reply text not null default 'notify_editors' check (after_no_reply in ('notify_editors', 'nothing')),
  enabled boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.outreach_group_members (
  group_id uuid not null references public.outreach_groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (group_id, profile_id)
);

create table public.rhythms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key in ('team_round', 'md_update', 'internal_newsletter', 'external_newsletter', 'weekly_overview')),
  name text not null,
  days_of_month int[] not null default '{}',   -- monthly rhythms
  weekday int check (weekday between 1 and 7), -- weekly rhythms
  time_of_day time not null default '09:00',
  deadline_days int not null default 5 check (deadline_days between 0 and 31),
  group_id uuid references public.outreach_groups(id) on delete set null,
  enabled boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

-- ----------------------------------------------------------------------------
-- Approval rules and rule-based approval requests
-- ----------------------------------------------------------------------------
create table public.approval_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_key text not null,  -- a content type, or newsletter_internal / newsletter_external / md_update
  -- Ordered steps: [{ "who": "interviewees" | "project_roles" | "functional_roles" | "persons" | "editors",
  --                   "roles": ["dm"], "profile_ids": [], "min": 1, "label": "…" }]
  steps jsonb not null default '[]'::jsonb,
  quotes_by_interviewee boolean not null default true,
  deadline_days int not null default 5 check (deadline_days between 1 and 30),  -- working days
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (organization_id, content_key)
);

alter table public.approvals
  add column kind text not null default 'piece' check (kind in ('piece', 'quote', 'passage')),
  add column step int not null default 1,
  add column step_label text,
  -- Who may decide. Empty = the editors (anyone with content.approve).
  add column eligible_profile_ids uuid[] not null default '{}',
  add column quote_text text,
  add column item_id uuid,                       -- newsletter item for a passage approval
  add column scope public.classification not null default 'internal',  -- consent for internal or for external use
  add column base_version int,                   -- the version this person approved before: show only the changes
  add column due_at timestamptz,
  add column reminded_at timestamptz,
  add column escalated_at timestamptz;
create index approvals_eligible_idx on public.approvals using gin (eligible_profile_ids);
-- A request can be withdrawn by the system (a newer version supersedes it, or a
-- deadline passed); every other decision still needs a deciding human.
alter table public.approvals drop constraint approvals_decision_needs_human;
alter table public.approvals
  add constraint approvals_decision_needs_human check (decision in ('pending', 'withdrawn') or decided_by is not null);

alter table public.newsletters
  add column edition_type text not null default 'newsletter' check (edition_type in ('newsletter', 'md_update'));
alter table public.newsletters drop constraint newsletters_organization_id_kind_period_month_key;
alter table public.newsletters add constraint newsletters_edition_unique unique (organization_id, kind, edition_type, period_month);
alter table public.newsletter_items
  add column contributor_profile_id uuid references public.profiles(id) on delete set null,
  add column interview_id uuid references public.interviews(id) on delete set null;

alter table public.interviews
  add column invite_choice text check (invite_choice in ('now', 'later', 'redirect', 'declined')),
  add column redirect_to text,
  add column summary_confirmed_at timestamptz,
  add column reminded_at timestamptz;
alter table public.interviews drop constraint interviews_status_check;
alter table public.interviews
  add constraint interviews_status_check check (status in ('draft', 'requested', 'scheduled', 'in_progress', 'awaiting_confirmation', 'completed', 'cancelled'));

-- ----------------------------------------------------------------------------
-- Bot outbox: everything the bot sent, would send (shadow) or was not allowed to send
-- ----------------------------------------------------------------------------
create table public.bot_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in (
    'channel_intro', 'thread_reply', 'interview_invite', 'interview_message', 'reminder',
    'approval_request', 'weekly_overview', 'input_request', 'mail_reply', 'notice'
  )),
  medium text not null check (medium in ('dm', 'channel', 'thread', 'email')),
  slack_channel_id text,
  thread_ts text,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  recipient_label text,
  body text not null,
  -- shadow: shown to the editors only. simulated: no Slack connection. blocked: a rule stopped it.
  -- scheduled: held back until working hours (send_after).
  status text not null check (status in ('shadow', 'simulated', 'sent', 'blocked', 'failed', 'scheduled')),
  send_after timestamptz,
  blocked_reason text,
  counts_as_request boolean not null default false,
  entity_type text,
  entity_id uuid,
  error text,
  created_at timestamptz not null default now()
);
create index bot_messages_org_idx on public.bot_messages (organization_id, created_at desc);
create index bot_messages_recipient_idx on public.bot_messages (recipient_profile_id, created_at desc);

-- ----------------------------------------------------------------------------
-- AI usage (cost ceiling and figures)
-- ----------------------------------------------------------------------------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_eur numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_org_idx on public.ai_usage (organization_id, created_at desc);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['projects', 'channels', 'outreach_groups', 'rhythms']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants and RLS
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'functional_roles', 'teams', 'profile_functional_roles', 'projects', 'project_members', 'channels', 'emoji_rules',
    'outreach_groups', 'outreach_group_members', 'rhythms', 'approval_rules', 'bot_messages', 'ai_usage'
  ]
  loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end;
$$;
revoke insert, update, delete on public.bot_messages, public.ai_usage from authenticated;

-- Reference data everyone in the organization may read; administrators manage it.
do $$
declare t text;
begin
  foreach t in array array['functional_roles', 'teams', 'profile_functional_roles', 'emoji_rules', 'approval_rules', 'rhythms', 'outreach_groups', 'outreach_group_members']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (organization_id = (select public.current_org_id()))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (organization_id = (select public.current_org_id()) and (select public.has_permission(''users.manage'')))
         with check (organization_id = (select public.current_org_id()) and (select public.has_permission(''users.manage'')))',
      t || '_manage', t);
  end loop;
end;
$$;

create policy channels_select on public.channels for select to authenticated
  using (organization_id = (select public.current_org_id()));
create policy channels_manage on public.channels for all to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.has_permission('integrations.manage')))
  with check (organization_id = (select public.current_org_id()) and (select public.has_permission('integrations.manage')));

-- Projects: editors manage; members (for example the DM) may confirm and update their own project.
-- Membership is looked up through a security-definer function: a policy on project_members
-- that queries project_members itself would recurse.
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project_id and m.profile_id = (select auth.uid())
  )
$$;
revoke execute on function public.is_project_member(uuid) from public, anon;
grant execute on function public.is_project_member(uuid) to authenticated, service_role;

create policy projects_select on public.projects for select to authenticated
  using (organization_id = (select public.current_org_id()));
create policy projects_manage on public.projects for all to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.has_permission('content.create')) or (select public.is_project_member(id)))
  )
  with check (
    organization_id = (select public.current_org_id())
    and ((select public.has_permission('content.create')) or (select public.is_project_member(id)))
  );
create policy project_members_select on public.project_members for select to authenticated
  using (organization_id = (select public.current_org_id()));
create policy project_members_manage on public.project_members for all to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.has_permission('content.create')) or (select public.is_project_member(project_id)))
  )
  with check (
    organization_id = (select public.current_org_id())
    and ((select public.has_permission('content.create')) or (select public.is_project_member(project_id)))
  );

-- Outbox: editors see everything; everyone sees what the bot sent to them.
create policy bot_messages_select on public.bot_messages for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_editorial()) or (select public.has_permission('agents.manage')) or recipient_profile_id = (select auth.uid()))
  );
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (organization_id = (select public.current_org_id()) and ((select public.is_editorial()) or (select public.has_permission('agents.manage'))));

-- ----------------------------------------------------------------------------
-- Inzage: an employee sees what waits for them and the pieces they are involved in
-- ----------------------------------------------------------------------------
create or replace function public.is_involved_in_article(p_article_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.approvals a
      where a.entity_type = 'article' and a.entity_id = p_article_id and (select auth.uid()) = any (a.eligible_profile_ids)
    )
    or exists (
      select 1 from public.interviews i
      where i.article_id = p_article_id and i.interviewee_profile_id = (select auth.uid())
    )
    or exists (
      select 1 from public.articles ar
      where ar.id = p_article_id and ar.written_for_profile_id = (select auth.uid())
    )
$$;
revoke execute on function public.is_involved_in_article(uuid) from public, anon;
grant execute on function public.is_involved_in_article(uuid) to authenticated, service_role;

drop policy articles_select on public.articles;
create policy articles_select on public.articles
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (
      (select public.is_editorial())
      or author_profile_id = (select auth.uid())
      or (status = 'published' and (select public.has_permission('content.view')))
      or (select public.is_involved_in_article(id))
    )
  );

drop policy approvals_select on public.approvals;
create policy approvals_select on public.approvals
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_editorial()) or (select auth.uid()) = any (eligible_profile_ids) or requested_by_profile_id = (select auth.uid()))
  );

drop policy approvals_decide on public.approvals;
create policy approvals_decide on public.approvals
  for update to authenticated
  using (
    organization_id = (select public.current_org_id())
    and decision = 'pending'
    and (
      (select auth.uid()) = any (eligible_profile_ids)
      or (select public.has_permission('content.approve'))
      or (select public.has_permission('content.review'))
      or (select public.has_permission('content.edit'))
    )
  )
  with check (organization_id = (select public.current_org_id()));

-- An edition (newsletter, MD-update) is visible to the people asked to approve it or a passage in it.
create or replace function public.is_approver_of(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.approvals a
    where a.entity_type = p_entity_type and a.entity_id = p_entity_id and (select auth.uid()) = any (a.eligible_profile_ids)
  )
$$;
revoke execute on function public.is_approver_of(text, uuid) from public, anon;
grant execute on function public.is_approver_of(text, uuid) to authenticated, service_role;

drop policy newsletters_select on public.newsletters;
create policy newsletters_select on public.newsletters
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_editorial()) or (status = 'sent' and kind = 'internal') or (select public.is_approver_of('newsletter', id)))
  );

drop policy newsletter_items_select on public.newsletter_items;
create policy newsletter_items_select on public.newsletter_items
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (
      (select public.is_editorial())
      or exists (select 1 from public.newsletters n where n.id = newsletter_id and n.status = 'sent' and n.kind = 'internal')
      or (select public.is_approver_of('newsletter', newsletter_id))
    )
  );

drop policy social_posts_select on public.social_posts;
create policy social_posts_select on public.social_posts
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_editorial()) or written_for_profile_id = (select auth.uid()) or (select public.is_approver_of('social_post', id)))
  );

-- Versions and comments are visible to the people involved in a piece.
drop policy content_versions_select on public.content_versions;
create policy content_versions_select on public.content_versions
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_editorial()) or (select public.is_involved_in_article(article_id)))
  );

-- ----------------------------------------------------------------------------
-- Who may record which decision
--   quote / passage  → only the person it belongs to (never the editors)
--   piece            → an assigned approver; the editors when the step is theirs,
--                      or after the deadline has passed
-- ----------------------------------------------------------------------------
create or replace function public.stamp_approval_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_assigned boolean;
begin
  if v_uid is not null and new.decision is distinct from old.decision then
    v_assigned := v_uid = any (old.eligible_profile_ids);

    if new.decision = 'withdrawn' then
      if not (old.requested_by_profile_id = v_uid or public.has_permission('content.edit')) then
        raise exception 'Missing permission content.edit';
      end if;
    elsif new.decision = 'pending' then
      raise exception 'A recorded decision cannot be reset';
    elsif old.kind in ('quote', 'passage') then
      -- With no account to assign (an external interviewee) the editors record the consent they received.
      if not (v_assigned or (cardinality(old.eligible_profile_ids) = 0 and public.has_permission('content.approve'))) then
        raise exception 'Only the person quoted can decide on their own quote';
      end if;
    elsif v_assigned then
      null;
    elsif new.decision = 'changes_requested' and (public.has_permission('content.review') or public.has_permission('content.approve')) then
      null;
    elsif public.has_permission('content.approve') then
      if cardinality(old.eligible_profile_ids) > 0 and (old.due_at is null or old.due_at > now()) then
        raise exception 'This approval is assigned to someone else. The editors can decide after the deadline.';
      end if;
    else
      raise exception 'Missing permission content.approve';
    end if;

    new.decided_by := v_uid;
    new.decided_at := now();
  end if;
  new.entity_type := old.entity_type;
  new.entity_id := old.entity_id;
  new.version := old.version;
  new.organization_id := old.organization_id;
  new.kind := old.kind;
  new.eligible_profile_ids := old.eligible_profile_ids;
  return new;
end;
$$;

-- A version is approved when at least one human approved it and nothing is still open or refused.
create or replace function public.has_human_approval(p_entity_type text, p_entity_id uuid, p_version int)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.approvals a
      where a.entity_type = p_entity_type and a.entity_id = p_entity_id and a.version = p_version
        and a.decision = 'approved' and a.decided_by is not null and a.kind = 'piece'
    )
    and not exists (
      select 1 from public.approvals a
      where a.entity_type = p_entity_type and a.entity_id = p_entity_id and a.version = p_version
        and (
          a.decision = 'pending'
          -- A refused quote or passage blocks the version until the same person agrees after all.
          or (a.kind in ('quote', 'passage') and a.decision in ('changes_requested', 'rejected')
              and not exists (
                select 1 from public.approvals b
                where b.entity_type = a.entity_type and b.entity_id = a.entity_id and b.version = a.version
                  and b.kind = a.kind and b.quote_text is not distinct from a.quote_text
                  and b.item_id is not distinct from a.item_id
                  and b.requested_at > a.requested_at and b.decision = 'approved'
              ))
        )
    )
$$;

-- People manage their own availability; everything else about a person is the administrator's.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.roles r where r.id = new.role_id and r.organization_id = new.organization_id) then
    raise exception 'Role does not belong to the organization of this profile';
  end if;
  if new.team_id is not null and not exists (select 1 from public.teams t where t.id = new.team_id and t.organization_id = new.organization_id) then
    raise exception 'Team does not belong to the organization of this profile';
  end if;

  if tg_op = 'UPDATE' and (select auth.uid()) is not null then
    if new.organization_id is distinct from old.organization_id or new.id is distinct from old.id then
      raise exception 'Profiles cannot be moved between organizations';
    end if;
    if (new.role_id is distinct from old.role_id or new.is_active is distinct from old.is_active
        or new.team_id is distinct from old.team_id or new.bot_may_contact is distinct from old.bot_may_contact
        or new.bot_follows is distinct from old.bot_follows or new.in_pilot is distinct from old.in_pilot
        or new.slack_user_id is distinct from old.slack_user_id)
       and not public.has_permission('users.manage') then
      raise exception 'Missing permission users.manage';
    end if;
    if new.id = (select auth.uid())
       and (new.role_id is distinct from old.role_id or new.is_active is distinct from old.is_active) then
      raise exception 'You cannot change your own role or deactivate yourself';
    end if;
  end if;
  return new;
end;
$$;

-- Internal stays internal: an article of an internal-only topic cannot become external
-- unless an editor released the topic.
create or replace function public.enforce_internal_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.classification = 'external' and new.opportunity_id is not null then
    if exists (
      select 1 from public.content_opportunities o
      where o.id = new.opportunity_id and o.internal_only and o.released_external_at is null
    ) then
      raise exception 'This topic is internal only. An editor has to release it for external use first.';
    end if;
  end if;
  return new;
end;
$$;
create trigger articles_enforce_internal_only
  before insert or update of classification, opportunity_id on public.articles
  for each row execute function public.enforce_internal_only();

-- ----------------------------------------------------------------------------
-- Defaults for a new organization
-- ----------------------------------------------------------------------------
create or replace function public.bootstrap_redactie(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.functional_roles (organization_id, key, name, sort_order) values
    (p_org_id, 'dm', 'DM', 10),
    (p_org_id, 'team_lead', 'Team Lead', 20),
    (p_org_id, 'developer', 'Developer', 30),
    (p_org_id, 'strateeg', 'Strateeg', 40),
    (p_org_id, 'product_owner', 'Product Owner', 50),
    (p_org_id, 'operational_lead', 'Operational lead', 60),
    (p_org_id, 'commercial_lead', 'Commercial lead', 70),
    (p_org_id, 'md', 'MD', 80)
  on conflict (organization_id, key) do nothing;

  insert into public.emoji_rules (organization_id, emoji, shortcode, goal, action, sort_order) values
    (p_org_id, '📣', 'mega', 'Extern nieuws', 'external_news', 10),
    (p_org_id, '💼', 'briefcase', 'Klantcase', 'customer_case', 20),
    (p_org_id, '🏠', 'house', 'Interne nieuwsbrief', 'internal_newsletter', 30),
    (p_org_id, '📱', 'iphone', 'Social post', 'social_post', 40),
    (p_org_id, '🎤', 'microphone', 'Interview waard', 'interview', 50),
    (p_org_id, '🚫', 'no_entry_sign', 'Niet gebruiken', 'exclude', 60)
  on conflict (organization_id, shortcode) do nothing;

  insert into public.approval_rules (organization_id, content_key, steps, quotes_by_interviewee) values
    (p_org_id, 'customer_case', '[{"who":"project_roles","roles":["dm","strateeg"],"min":1,"label":"DM of Strateeg van het project"}]', true),
    (p_org_id, 'news_article', '[{"who":"editors","min":1,"label":"Redactie"}]', true),
    (p_org_id, 'website_article', '[{"who":"editors","min":1,"label":"Redactie"}]', true),
    (p_org_id, 'interview', '[{"who":"interviewees","min":1,"label":"De geïnterviewde"}]', true),
    (p_org_id, 'social_post', '[{"who":"editors","min":1,"label":"Redactie"}]', true),
    (p_org_id, 'internal_update', '[{"who":"interviewees","min":1,"label":"De geïnterviewde"}]', true),
    (p_org_id, 'employee_introduction', '[{"who":"interviewees","min":1,"label":"De geïnterviewde"}]', true),
    (p_org_id, 'management_update', '[{"who":"functional_roles","roles":["md"],"min":1,"label":"MD"},{"who":"editors","min":1,"label":"Redactie"}]', true),
    (p_org_id, 'newsletter_internal', '[{"who":"functional_roles","roles":["md"],"min":1,"label":"Goedkeuringsrecht intern (MD''s)"}]', false),
    (p_org_id, 'newsletter_external', '[{"who":"editors","min":1,"label":"Redactie"}]', false),
    (p_org_id, 'md_update', '[{"who":"editors","min":1,"label":"Redactie"}]', true)
  on conflict (organization_id, content_key) do nothing;

  insert into public.rhythms (organization_id, key, name, days_of_month, weekday, time_of_day, deadline_days) values
    (p_org_id, 'team_round', 'Maandelijkse teamronde', '{1}', null, '10:00', 5),
    (p_org_id, 'md_update', 'MD-update', '{1,15}', null, '09:00', 3),
    (p_org_id, 'internal_newsletter', 'Interne nieuwsbrief', '{25}', null, '09:00', 3),
    (p_org_id, 'external_newsletter', 'Externe nieuwsbrief', '{25}', null, '09:00', 7),
    (p_org_id, 'weekly_overview', 'Weekoverzicht voor de redactie', '{}', 1, '08:30', 0)
  on conflict (organization_id, key) do nothing;

  -- Start in shadow mode: the bot shows what it would do and sends nothing to colleagues.
  update public.organizations
  set settings = jsonb_build_object(
      'bot_name', 'NOBEARS Content Director',
      'shadow_mode', true,
      'bot_paused', false,
      'pilot_only', false,
      'min_days_between_requests', 7,
      'work_start', '08:30',
      'work_end', '17:30',
      'lookback_max_days', 90,
      'ai_budget_eur', 150,
      'mail_domain', '',
      'mailbox_address', ''
    ) || settings
  where id = p_org_id;
end;
$$;
revoke execute on function public.bootstrap_redactie(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_redactie(uuid) to service_role;
