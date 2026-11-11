-- =============================================================================
-- Row Level Security, permission helpers, workflow guards and org bootstrap
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Permission catalog
-- ----------------------------------------------------------------------------
insert into public.permissions (key, name, description, category, sort_order) values
  ('content.view',        'View content',            'View content items, signals of the own organization', 'content', 10),
  ('content.create',      'Create content',          'Create content items, interviews and newsletters',     'content', 20),
  ('content.edit',        'Edit content',            'Edit content items and submit them for review',        'content', 30),
  ('content.review',      'Review content',          'Review content and request changes',                   'content', 40),
  ('content.approve',     'Approve content',         'Give the final approval or rejection',                 'content', 50),
  ('content.publish',     'Publish content',         'Schedule and publish approved content',                'content', 60),
  ('agents.manage',       'Manage agents',           'Configure, pause and run the AI agents',               'admin',   70),
  ('integrations.manage', 'Manage integrations',     'Configure and connect integrations',                   'admin',   80),
  ('brand.manage',        'Manage brand guidelines', 'Edit brand guidelines and tone of voice',              'admin',   90),
  ('users.manage',        'Manage users',            'Invite users and manage roles and permissions',        'admin',  100);

-- ----------------------------------------------------------------------------
-- Helper functions used by policies (security definer: they read profiles /
-- role_permissions without being subject to the caller's RLS).
-- ----------------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

create or replace function public.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id
    where p.id = (select auth.uid())
      and p.is_active
      and rp.permission_key = p_key
  )
$$;

-- Editorial staff: anyone who creates, reviews or approves content.
create or replace function public.is_editorial()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id
    where p.id = (select auth.uid())
      and p.is_active
      and rp.permission_key in ('content.create', 'content.edit', 'content.review', 'content.approve')
  )
$$;

revoke execute on function public.current_org_id() from public, anon;
revoke execute on function public.has_permission(text) from public, anon;
revoke execute on function public.is_editorial() from public, anon;
grant execute on function public.current_org_id() to authenticated, service_role;
grant execute on function public.has_permission(text) to authenticated, service_role;
grant execute on function public.is_editorial() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Grants: nothing for anon; RLS decides for authenticated.
-- ----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
-- The audit log is append-only for end users.
revoke update, delete on public.audit_logs from authenticated;
-- Secrets are never reachable with a user session.
revoke all on public.integration_credentials from authenticated;

-- ----------------------------------------------------------------------------
-- Enable RLS everywhere
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- Policies: organizations, roles, permissions, profiles
-- ----------------------------------------------------------------------------
create policy organizations_select on public.organizations
  for select to authenticated
  using (id = (select public.current_org_id()));

create policy organizations_update on public.organizations
  for update to authenticated
  using (id = (select public.current_org_id()) and (select public.has_permission('users.manage')))
  with check (id = (select public.current_org_id()));

create policy permissions_select on public.permissions
  for select to authenticated
  using (true);

create policy roles_select on public.roles
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

create policy roles_write on public.roles
  for all to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.has_permission('users.manage')))
  with check (organization_id = (select public.current_org_id()) and (select public.has_permission('users.manage')));

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (exists (
    select 1 from public.roles r
    where r.id = role_id and r.organization_id = (select public.current_org_id())
  ));

create policy role_permissions_write on public.role_permissions
  for all to authenticated
  using (
    (select public.has_permission('users.manage'))
    and exists (
      select 1 from public.roles r
      where r.id = role_id
        and r.organization_id = (select public.current_org_id())
        and r.key <> 'administrator' -- the administrator role cannot be weakened
    )
  )
  with check (
    (select public.has_permission('users.manage'))
    and exists (
      select 1 from public.roles r
      where r.id = role_id
        and r.organization_id = (select public.current_org_id())
        and r.key <> 'administrator'
    )
  );

create policy profiles_select on public.profiles
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (id = (select auth.uid()) or (select public.has_permission('users.manage')))
  )
  with check (organization_id = (select public.current_org_id()));

-- Users may edit their own name/title, but never their own role, organization
-- or active flag. Role must always belong to the same organization.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.roles r
    where r.id = new.role_id and r.organization_id = new.organization_id
  ) then
    raise exception 'Role does not belong to the organization of this profile';
  end if;

  if tg_op = 'UPDATE' and (select auth.uid()) is not null then
    if new.organization_id is distinct from old.organization_id or new.id is distinct from old.id then
      raise exception 'Profiles cannot be moved between organizations';
    end if;
    if (new.role_id is distinct from old.role_id or new.is_active is distinct from old.is_active)
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

create trigger profiles_protect_privileges
  before insert or update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ----------------------------------------------------------------------------
-- Policies: integrations (credentials table intentionally has no policies)
-- ----------------------------------------------------------------------------
create policy integrations_select on public.integrations
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

create policy integrations_write on public.integrations
  for all to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.has_permission('integrations.manage')))
  with check (organization_id = (select public.current_org_id()) and (select public.has_permission('integrations.manage')));

-- ----------------------------------------------------------------------------
-- Policies: agents and agent execution
-- ----------------------------------------------------------------------------
create policy agents_select on public.agents
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

create policy agents_update on public.agents
  for update to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.has_permission('agents.manage')))
  with check (organization_id = (select public.current_org_id()));

create policy agent_runs_select on public.agent_runs
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_editorial()) or (select public.has_permission('agents.manage')))
  );

create policy agent_tasks_select on public.agent_tasks
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_editorial()) or (select public.has_permission('agents.manage')))
  );

create policy agent_tasks_write on public.agent_tasks
  for all to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.has_permission('agents.manage')))
  with check (organization_id = (select public.current_org_id()) and (select public.has_permission('agents.manage')));

create policy agent_messages_select on public.agent_messages
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_editorial()) or (select public.has_permission('agents.manage')))
  );

-- agent_runs / agent_messages are written by the server-side agent runtime only.

-- ----------------------------------------------------------------------------
-- Policies: intelligence layer
-- ----------------------------------------------------------------------------
create policy source_messages_select on public.source_messages
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_editorial()) or author_profile_id = (select auth.uid()))
  );

-- Anyone in the organization may submit information manually.
create policy source_messages_insert_manual on public.source_messages
  for insert to authenticated
  with check (
    organization_id = (select public.current_org_id())
    and source = 'manual'
    and author_profile_id = (select auth.uid())
  );

create policy content_signals_select on public.content_signals
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_editorial()) or submitted_by = (select auth.uid()))
  );

create policy content_signals_write on public.content_signals
  for update to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.has_permission('content.create')))
  with check (organization_id = (select public.current_org_id()));

create policy signal_sources_select on public.signal_sources
  for select to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_editorial()));

create policy content_opportunities_select on public.content_opportunities
  for select to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_editorial()));

create policy content_opportunities_write on public.content_opportunities
  for all to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.has_permission('content.create')))
  with check (organization_id = (select public.current_org_id()) and (select public.has_permission('content.create')));

-- ----------------------------------------------------------------------------
-- Policies: editorial content
-- ----------------------------------------------------------------------------
create policy articles_select on public.articles
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (
      (select public.is_editorial())
      or author_profile_id = (select auth.uid())
      or (status = 'published' and (select public.has_permission('content.view')))
    )
  );

create policy articles_insert on public.articles
  for insert to authenticated
  with check (
    organization_id = (select public.current_org_id())
    and (select public.has_permission('content.create'))
  );

create policy articles_update on public.articles
  for update to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (
      (select public.has_permission('content.edit'))
      or (select public.has_permission('content.review'))
      or (select public.has_permission('content.approve'))
      or (select public.has_permission('content.publish'))
    )
  )
  with check (organization_id = (select public.current_org_id()));

create policy articles_delete on public.articles
  for delete to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (select public.has_permission('content.edit'))
    and status not in ('approved', 'scheduled', 'published')
  );

create policy article_signals_select on public.article_signals
  for select to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_editorial()));

create policy article_signals_write on public.article_signals
  for all to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.has_permission('content.edit')))
  with check (organization_id = (select public.current_org_id()) and (select public.has_permission('content.edit')));

create policy content_versions_select on public.content_versions
  for select to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_editorial()));

create policy content_versions_insert on public.content_versions
  for insert to authenticated
  with check (
    organization_id = (select public.current_org_id())
    and ((select public.has_permission('content.edit')) or (select public.has_permission('content.create')))
    and created_by_profile_id = (select auth.uid())
  );

create policy reviews_select on public.reviews
  for select to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_editorial()));

create policy reviews_insert on public.reviews
  for insert to authenticated
  with check (
    organization_id = (select public.current_org_id())
    and ((select public.has_permission('content.review')) or (select public.has_permission('content.approve')))
    and reviewer_id = (select auth.uid())
  );

create policy approvals_select on public.approvals
  for select to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_editorial()));

-- Users can only *request* approval; a decision is made through UPDATE.
create policy approvals_insert on public.approvals
  for insert to authenticated
  with check (
    organization_id = (select public.current_org_id())
    and ((select public.has_permission('content.edit')) or (select public.has_permission('content.create')))
    and decision = 'pending'
    and decided_by is null
    and requested_by_profile_id = (select auth.uid())
  );

-- Only open requests can be changed. Which decision a user may record is
-- enforced by the trigger below.
create policy approvals_decide on public.approvals
  for update to authenticated
  using (
    organization_id = (select public.current_org_id())
    and decision = 'pending'
    and (
      (select public.has_permission('content.approve'))
      or (select public.has_permission('content.review'))
      or (select public.has_permission('content.edit'))
    )
  )
  with check (organization_id = (select public.current_org_id()));

-- A decision is always stamped with the deciding human.
--   approved / rejected  → content.approve
--   changes_requested    → content.review or content.approve
--   withdrawn            → the requester, or anyone who may edit content
create or replace function public.stamp_approval_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.decision is distinct from old.decision then
    if new.decision in ('approved', 'rejected') then
      if not public.has_permission('content.approve') then
        raise exception 'Missing permission content.approve';
      end if;
    elsif new.decision = 'changes_requested' then
      if not (public.has_permission('content.review') or public.has_permission('content.approve')) then
        raise exception 'Missing permission content.review';
      end if;
    elsif new.decision = 'withdrawn' then
      if not (old.requested_by_profile_id = (select auth.uid()) or public.has_permission('content.edit')) then
        raise exception 'Missing permission content.edit';
      end if;
    else
      raise exception 'A recorded decision cannot be reset';
    end if;
    new.decided_by := (select auth.uid());
    new.decided_at := now();
  end if;
  -- Immutable request facts.
  new.entity_type := old.entity_type;
  new.entity_id := old.entity_id;
  new.version := old.version;
  new.organization_id := old.organization_id;
  return new;
end;
$$;

create trigger approvals_stamp_decision
  before update on public.approvals
  for each row execute function public.stamp_approval_decision();

create policy comments_select on public.comments
  for select to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.has_permission('content.view')));

create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    organization_id = (select public.current_org_id())
    and (select public.has_permission('content.view'))
    and author_profile_id = (select auth.uid())
  );

create policy comments_update on public.comments
  for update to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (author_profile_id = (select auth.uid()) or (select public.has_permission('content.edit')))
  )
  with check (organization_id = (select public.current_org_id()));

create policy comments_delete on public.comments
  for delete to authenticated
  using (organization_id = (select public.current_org_id()) and author_profile_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Policies: interviews
-- ----------------------------------------------------------------------------
create policy interviews_select on public.interviews
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_editorial()) or interviewee_profile_id = (select auth.uid()))
  );

create policy interviews_write on public.interviews
  for all to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.has_permission('content.create')))
  with check (organization_id = (select public.current_org_id()) and (select public.has_permission('content.create')));

create policy interview_messages_select on public.interview_messages
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and exists (
      select 1 from public.interviews i
      where i.id = interview_id
        and ((select public.is_editorial()) or i.interviewee_profile_id = (select auth.uid()))
    )
  );

-- Agent turns are written by the server runtime; humans only add answers.
create policy interview_messages_insert on public.interview_messages
  for insert to authenticated
  with check (
    organization_id = (select public.current_org_id())
    and role = 'interviewee'
    and author_profile_id = (select auth.uid())
    and exists (
      select 1 from public.interviews i
      where i.id = interview_id
        and i.organization_id = (select public.current_org_id())
        and ((select public.has_permission('content.create')) or i.interviewee_profile_id = (select auth.uid()))
    )
  );

-- ----------------------------------------------------------------------------
-- Policies: newsletters, social posts, calendar
-- ----------------------------------------------------------------------------
create policy newsletters_select on public.newsletters
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.is_editorial()) or (status = 'sent' and kind = 'internal'))
  );

create policy newsletters_insert on public.newsletters
  for insert to authenticated
  with check (organization_id = (select public.current_org_id()) and (select public.has_permission('content.create')));

create policy newsletters_update on public.newsletters
  for update to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (
      (select public.has_permission('content.edit'))
      or (select public.has_permission('content.review'))
      or (select public.has_permission('content.approve'))
      or (select public.has_permission('content.publish'))
    )
  )
  with check (organization_id = (select public.current_org_id()));

create policy newsletter_items_select on public.newsletter_items
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (
      (select public.is_editorial())
      -- everyone may read the items of an internal newsletter that was sent
      or exists (
        select 1 from public.newsletters n
        where n.id = newsletter_id and n.status = 'sent' and n.kind = 'internal'
      )
    )
  );

create policy newsletter_items_write on public.newsletter_items
  for all to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.has_permission('content.edit')))
  with check (organization_id = (select public.current_org_id()) and (select public.has_permission('content.edit')));

create policy social_posts_select on public.social_posts
  for select to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.is_editorial()));

create policy social_posts_insert on public.social_posts
  for insert to authenticated
  with check (organization_id = (select public.current_org_id()) and (select public.has_permission('content.create')));

create policy social_posts_update on public.social_posts
  for update to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (
      (select public.has_permission('content.edit'))
      or (select public.has_permission('content.review'))
      or (select public.has_permission('content.approve'))
      or (select public.has_permission('content.publish'))
    )
  )
  with check (organization_id = (select public.current_org_id()));

create policy social_posts_delete on public.social_posts
  for delete to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (select public.has_permission('content.edit'))
    and status not in ('approved', 'scheduled', 'published')
  );

create policy content_calendar_select on public.content_calendar
  for select to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.has_permission('content.view')));

create policy content_calendar_write on public.content_calendar
  for all to authenticated
  using (
    organization_id = (select public.current_org_id())
    and ((select public.has_permission('content.create')) or (select public.has_permission('content.publish')))
  )
  with check (
    organization_id = (select public.current_org_id())
    and ((select public.has_permission('content.create')) or (select public.has_permission('content.publish')))
  );

-- ----------------------------------------------------------------------------
-- Policies: brand
-- ----------------------------------------------------------------------------
create policy brand_guidelines_select on public.brand_guidelines
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

create policy brand_guidelines_write on public.brand_guidelines
  for all to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.has_permission('brand.manage')))
  with check (organization_id = (select public.current_org_id()) and (select public.has_permission('brand.manage')));

create policy brand_assets_select on public.brand_assets
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

create policy brand_assets_write on public.brand_assets
  for all to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.has_permission('brand.manage')))
  with check (organization_id = (select public.current_org_id()) and (select public.has_permission('brand.manage')));

-- ----------------------------------------------------------------------------
-- Policies: audit log (append-only)
-- ----------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (
      (select public.is_editorial())
      or (select public.has_permission('agents.manage'))
      or (select public.has_permission('users.manage'))
    )
  );

create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (
    organization_id = (select public.current_org_id())
    and actor_type = 'user'
    and actor_profile_id = (select auth.uid())
  );

-- ----------------------------------------------------------------------------
-- Workflow guards
-- These apply to EVERY writer, including the server-side agent runtime
-- (service role): nothing reaches approved / scheduled / published without a
-- human approval record for the current version.
-- ----------------------------------------------------------------------------
create or replace function public.has_human_approval(p_entity_type text, p_entity_id uuid, p_version int)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.approvals a
    where a.entity_type = p_entity_type
      and a.entity_id = p_entity_id
      and a.version = p_version
      and a.decision = 'approved'
      and a.decided_by is not null
  )
$$;

create or replace function public.enforce_article_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.status in ('approved', 'scheduled', 'published') then
      raise exception 'Content cannot be created as %; it needs human approval first', new.status;
    end if;
    return new;
  end if;

  -- Approved content is locked: reopen it as a draft before editing.
  if old.status in ('approved', 'scheduled', 'published')
     and new.status in ('approved', 'scheduled', 'published')
     and (new.title is distinct from old.title
          or new.subtitle is distinct from old.subtitle
          or new.body_html is distinct from old.body_html
          or new.current_version is distinct from old.current_version) then
    raise exception 'Approved content is locked. Reopen it as a draft before editing.';
  end if;

  if new.status is distinct from old.status then
    -- Role-based permission per target status (only for user sessions).
    if v_uid is not null then
      if new.status = 'in_review' then
        if not (public.has_permission('content.edit') or public.has_permission('content.create')) then
          raise exception 'Missing permission content.edit';
        end if;
      elsif new.status = 'changes_requested' then
        if not (public.has_permission('content.review') or public.has_permission('content.approve')) then
          raise exception 'Missing permission content.review';
        end if;
      elsif new.status = 'approved' then
        if not public.has_permission('content.approve') then
          raise exception 'Missing permission content.approve';
        end if;
      elsif new.status in ('scheduled', 'published') then
        if not public.has_permission('content.publish') then
          raise exception 'Missing permission content.publish';
        end if;
      else
        if not (public.has_permission('content.edit') or public.has_permission('content.create')
                or public.has_permission('content.publish')) then
          raise exception 'Missing permission content.edit';
        end if;
      end if;
    end if;

    if new.status in ('approved', 'scheduled', 'published') then
      if not public.has_human_approval('article', new.id, new.current_version) then
        raise exception 'Human approval for version % is required before status %', new.current_version, new.status;
      end if;
    end if;

    if new.status in ('scheduled', 'published') and new.classification = 'external'
       and new.external_permission not in ('granted', 'not_required') then
      raise exception 'External publication is not permitted: permission status is %', new.external_permission;
    end if;

    if new.status = 'published' and new.published_at is null then
      new.published_at := now();
    end if;
  end if;

  return new;
end;
$$;

create trigger articles_enforce_workflow
  before insert or update on public.articles
  for each row execute function public.enforce_article_workflow();

create or replace function public.enforce_newsletter_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.status in ('approved', 'scheduled', 'sent') then
      raise exception 'Newsletters cannot be created as %', new.status;
    end if;
    return new;
  end if;

  if old.status in ('approved', 'scheduled', 'sent')
     and new.status in ('approved', 'scheduled', 'sent')
     and (new.intro_html is distinct from old.intro_html
          or new.outro_html is distinct from old.outro_html
          or new.subject is distinct from old.subject
          or new.current_version is distinct from old.current_version) then
    raise exception 'Approved newsletters are locked. Reopen as draft before editing.';
  end if;

  if new.status is distinct from old.status then
    if v_uid is not null then
      if new.status = 'approved' and not public.has_permission('content.approve') then
        raise exception 'Missing permission content.approve';
      elsif new.status in ('scheduled', 'sent') and not public.has_permission('content.publish') then
        raise exception 'Missing permission content.publish';
      elsif new.status = 'changes_requested'
        and not (public.has_permission('content.review') or public.has_permission('content.approve')) then
        raise exception 'Missing permission content.review';
      elsif new.status in ('draft', 'in_review', 'archived')
        and not (public.has_permission('content.edit') or public.has_permission('content.create')
                 or public.has_permission('content.publish')) then
        raise exception 'Missing permission content.edit';
      end if;
    end if;

    if new.status in ('approved', 'scheduled', 'sent')
       and not public.has_human_approval('newsletter', new.id, new.current_version) then
      raise exception 'Human approval is required before a newsletter can be %', new.status;
    end if;

    if new.status = 'sent' and new.sent_at is null then
      new.sent_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger newsletters_enforce_workflow
  before insert or update on public.newsletters
  for each row execute function public.enforce_newsletter_workflow();

create or replace function public.enforce_social_post_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.status in ('approved', 'scheduled', 'published') then
      raise exception 'Social posts cannot be created as %', new.status;
    end if;
    return new;
  end if;

  if old.status in ('approved', 'scheduled', 'published')
     and new.status in ('approved', 'scheduled', 'published')
     and (new.body is distinct from old.body or new.current_version is distinct from old.current_version) then
    raise exception 'Approved social posts are locked. Reopen as draft before editing.';
  end if;

  if new.status is distinct from old.status then
    if v_uid is not null then
      if new.status = 'approved' and not public.has_permission('content.approve') then
        raise exception 'Missing permission content.approve';
      elsif new.status in ('scheduled', 'published') and not public.has_permission('content.publish') then
        raise exception 'Missing permission content.publish';
      elsif new.status = 'changes_requested'
        and not (public.has_permission('content.review') or public.has_permission('content.approve')) then
        raise exception 'Missing permission content.review';
      elsif new.status in ('draft', 'in_review', 'archived')
        and not (public.has_permission('content.edit') or public.has_permission('content.create')
                 or public.has_permission('content.publish')) then
        raise exception 'Missing permission content.edit';
      end if;
    end if;

    if new.status in ('approved', 'scheduled', 'published')
       and not public.has_human_approval('social_post', new.id, new.current_version) then
      raise exception 'Human approval is required before a social post can be %', new.status;
    end if;

    if new.status = 'published' and new.published_at is null then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger social_posts_enforce_workflow
  before insert or update on public.social_posts
  for each row execute function public.enforce_social_post_workflow();

-- ----------------------------------------------------------------------------
-- Storage: private bucket for brand assets, one folder per organization
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('brand-assets', 'brand-assets', false, 20971520)
on conflict (id) do nothing;

create policy brand_assets_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = (select public.current_org_id())::text
  );

create policy brand_assets_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = (select public.current_org_id())::text
    and (select public.has_permission('brand.manage'))
  );

create policy brand_assets_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = (select public.current_org_id())::text
    and (select public.has_permission('brand.manage'))
  );

-- ----------------------------------------------------------------------------
-- Organization bootstrap: system roles, default permissions, the two agents,
-- empty brand guidelines and unconnected integrations.
-- Only callable by the server (service role).
-- ----------------------------------------------------------------------------
create or replace function public.bootstrap_organization(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
  r record;
begin
  for r in
    select * from (values
      ('administrator',     'Administrator',     'Full access to all settings and content', 10,
        array['content.view','content.create','content.edit','content.review','content.approve','content.publish','agents.manage','integrations.manage','brand.manage','users.manage']),
      ('chief_editor',      'Chief Editor',      'Leads the editorial process and gives final approval', 20,
        array['content.view','content.create','content.edit','content.review','content.approve','content.publish','agents.manage','brand.manage']),
      ('editor',            'Editor',            'Creates and edits content', 30,
        array['content.view','content.create','content.edit']),
      ('reviewer',          'Reviewer',          'Reviews content and requests changes', 40,
        array['content.view','content.review']),
      ('marketing_manager', 'Marketing Manager', 'Owns external communication and publication', 50,
        array['content.view','content.create','content.edit','content.review','content.approve','content.publish','brand.manage']),
      ('employee',          'Employee',          'Reads published content and contributes information', 60,
        array['content.view'])
    ) as t(key, name, description, sort_order, perms)
  loop
    insert into public.roles (organization_id, key, name, description, sort_order, is_system)
    values (p_org_id, r.key, r.name, r.description, r.sort_order, true)
    on conflict (organization_id, key) do update set name = excluded.name
    returning id into v_role_id;

    insert into public.role_permissions (role_id, permission_key)
    select v_role_id, unnest(r.perms)
    on conflict do nothing;
  end loop;

  insert into public.agents (organization_id, kind, name, description, mission, allowed_tools, allowed_sources, approval_requirements, config)
  values
    (p_org_id, 'external', 'Externe Communicatie-agent',
     'Ontdekt nieuwswaardige ontwikkelingen en klantcases en bereidt externe content voor.',
     'Maak de organisatie zichtbaar met feitelijk juiste, goedgekeurde externe content. Verzin nooit feiten, quotes, klantresultaten of cijfers en publiceer nooit zonder expliciete menselijke goedkeuring.',
     array['read_sources','detect_signals','enrich_context','evaluate_story','create_opportunity','check_external_permission',
           'generate_interview_questions','conduct_interview','summarize_interview','generate_content','validate_brand',
           'request_approval','draft_social_post','prepare_external_newsletter','request_internal_info','update_calendar'],
     array['slack','jira','teamleader','manual'],
     jsonb_build_object('publish_external', 'human', 'send_newsletter', 'human', 'post_to_linkedin', 'human'),
     jsonb_build_object('min_relevance_score', 55, 'newsletter_day_of_month', 25)),
    (p_org_id, 'internal', 'Interne Communicatie-agent',
     'Volgt interne ontwikkelingen, teamprestaties en nieuwe collega''s en bereidt interne updates voor.',
     'Houd collega''s goed geïnformeerd met heldere interne updates. Deel nooit interne of vertrouwelijke informatie extern zonder expliciete toestemming en verstuur nooit berichten zonder menselijke goedkeuring.',
     array['read_sources','detect_signals','enrich_context','evaluate_story','create_opportunity',
           'generate_interview_questions','conduct_interview','summarize_interview','generate_content','validate_brand',
           'request_approval','draft_slack_announcement','draft_email','prepare_internal_newsletter',
           'schedule_leadership_interviews','refer_to_external_agent','answer_info_request','update_calendar'],
     array['slack','jira','email','manual'],
     jsonb_build_object('send_email', 'human', 'post_to_slack', 'human', 'send_newsletter', 'human'),
     jsonb_build_object('min_relevance_score', 45, 'newsletter_day_of_month', 25, 'leadership_interview_days', jsonb_build_array(1, 15)))
  on conflict (organization_id, kind) do nothing;

  insert into public.brand_guidelines (organization_id)
  values (p_org_id)
  on conflict (organization_id) do nothing;

  insert into public.integrations (organization_id, provider, display_name)
  values
    (p_org_id, 'slack',      'Slack'),
    (p_org_id, 'jira',       'Jira'),
    (p_org_id, 'teamleader', 'Teamleader Orbit'),
    (p_org_id, 'email',      'E-mail (Gmail / Outlook)'),
    (p_org_id, 'cms',        'Website CMS'),
    (p_org_id, 'linkedin',   'LinkedIn')
  on conflict (organization_id, provider) do nothing;
end;
$$;

revoke execute on function public.bootstrap_organization(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_organization(uuid) to service_role;
revoke execute on function public.has_human_approval(text, uuid, int) from public, anon;
grant execute on function public.has_human_approval(text, uuid, int) to authenticated, service_role;
