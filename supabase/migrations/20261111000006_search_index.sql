create table public.search_index (
  kind text not null,
  entity_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  doc tsvector not null,
  like_text text not null,
  primary key (kind, entity_id)
);

create index search_index_organization_idx on public.search_index (organization_id);

alter table public.search_index enable row level security;

create policy search_index_select on public.search_index
  for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and case kind
    when 'signal' then exists (select 1 from public.content_signals b where b.id = search_index.entity_id)
    when 'topic' then exists (select 1 from public.content_opportunities b where b.id = search_index.entity_id)
    when 'article' then exists (select 1 from public.articles b where b.id = search_index.entity_id)
    when 'interview' then exists (select 1 from public.interviews b where b.id = search_index.entity_id)
    when 'transcript' then exists (select 1 from public.interview_messages b where b.id = search_index.entity_id)
    when 'newsletter' then exists (select 1 from public.newsletters b where b.id = search_index.entity_id)
    when 'social_post' then exists (select 1 from public.social_posts b where b.id = search_index.entity_id)
    when 'project' then exists (select 1 from public.projects b where b.id = search_index.entity_id)
    when 'person' then exists (select 1 from public.profiles b where b.id = search_index.entity_id)
    when 'source' then exists (select 1 from public.source_messages b where b.id = search_index.entity_id)
    when 'comment' then exists (select 1 from public.comments b where b.id = search_index.entity_id)
      else false
    end
  );

revoke all on public.search_index from public, anon, authenticated;
grant select on public.search_index to authenticated;

create function public.search_index_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.search_index where kind = 'signal' and entity_id = old.id;
    return old;
  end if;
  insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
  values ('signal', new.id, new.organization_id, setweight(to_tsvector('dutch', left(coalesce(new.title, ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', new.summary, new.suggested_action, new.score_rationale), ''), 100000)), 'B'), left(coalesce(new.title, ''), 1000))
  on conflict (kind, entity_id) do update
    set organization_id = excluded.organization_id, doc = excluded.doc, like_text = excluded.like_text;
  return new;
end;
$$;

revoke all on function public.search_index_signal() from public, anon, authenticated;

create trigger search_index_signal_write after insert or update of title, summary, suggested_action, score_rationale on public.content_signals
  for each row execute function public.search_index_signal();
create trigger search_index_signal_delete after delete on public.content_signals
  for each row execute function public.search_index_signal();

insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
select 'signal', s.id, s.organization_id, setweight(to_tsvector('dutch', left(coalesce(s.title, ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', s.summary, s.suggested_action, s.score_rationale), ''), 100000)), 'B'), left(coalesce(s.title, ''), 1000)
  from public.content_signals s;

create function public.search_index_topic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.search_index where kind = 'topic' and entity_id = old.id;
    return old;
  end if;
  insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
  values ('topic', new.id, new.organization_id, setweight(to_tsvector('dutch', left(coalesce(new.title, ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(new.angle, ''), 100000)), 'B'), left(coalesce(new.title, ''), 1000))
  on conflict (kind, entity_id) do update
    set organization_id = excluded.organization_id, doc = excluded.doc, like_text = excluded.like_text;
  return new;
end;
$$;

revoke all on function public.search_index_topic() from public, anon, authenticated;

create trigger search_index_topic_write after insert or update of title, angle on public.content_opportunities
  for each row execute function public.search_index_topic();
create trigger search_index_topic_delete after delete on public.content_opportunities
  for each row execute function public.search_index_topic();

insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
select 'topic', o.id, o.organization_id, setweight(to_tsvector('dutch', left(coalesce(o.title, ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(o.angle, ''), 100000)), 'B'), left(coalesce(o.title, ''), 1000)
  from public.content_opportunities o;

create function public.search_index_article()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.search_index where kind = 'article' and entity_id = old.id;
    return old;
  end if;
  insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
  values ('article', new.id, new.organization_id, setweight(to_tsvector('dutch', left(coalesce(new.title, ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', new.subtitle, new.excerpt, array_to_string(new.tags, ' '), regexp_replace(new.body_html, '<[^>]+>', ' ', 'g')), ''), 100000)), 'B'), left(coalesce(concat_ws(' ', new.title, new.subtitle), ''), 1000))
  on conflict (kind, entity_id) do update
    set organization_id = excluded.organization_id, doc = excluded.doc, like_text = excluded.like_text;
  return new;
end;
$$;

revoke all on function public.search_index_article() from public, anon, authenticated;

create trigger search_index_article_write after insert or update of title, subtitle, excerpt, tags, body_html on public.articles
  for each row execute function public.search_index_article();
create trigger search_index_article_delete after delete on public.articles
  for each row execute function public.search_index_article();

insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
select 'article', a.id, a.organization_id, setweight(to_tsvector('dutch', left(coalesce(a.title, ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', a.subtitle, a.excerpt, array_to_string(a.tags, ' '), regexp_replace(a.body_html, '<[^>]+>', ' ', 'g')), ''), 100000)), 'B'), left(coalesce(concat_ws(' ', a.title, a.subtitle), ''), 1000)
  from public.articles a;

create function public.search_index_interview()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.search_index where kind = 'interview' and entity_id = old.id;
    return old;
  end if;
  insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
  values ('interview', new.id, new.organization_id, setweight(to_tsvector('dutch', left(coalesce(new.title, ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', new.purpose, new.interviewee_name, new.interviewee_role, new.summary->>'summary', (select string_agg(q->>'text', ' ') from jsonb_array_elements(case when jsonb_typeof(new.summary->'quotes') = 'array' then new.summary->'quotes' else '[]'::jsonb end) q)), ''), 100000)), 'B'), left(coalesce(concat_ws(' ', new.title, new.interviewee_name), ''), 1000))
  on conflict (kind, entity_id) do update
    set organization_id = excluded.organization_id, doc = excluded.doc, like_text = excluded.like_text;
  return new;
end;
$$;

revoke all on function public.search_index_interview() from public, anon, authenticated;

create trigger search_index_interview_write after insert or update of title, purpose, interviewee_name, interviewee_role, summary on public.interviews
  for each row execute function public.search_index_interview();
create trigger search_index_interview_delete after delete on public.interviews
  for each row execute function public.search_index_interview();

insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
select 'interview', i.id, i.organization_id, setweight(to_tsvector('dutch', left(coalesce(i.title, ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', i.purpose, i.interviewee_name, i.interviewee_role, i.summary->>'summary', (select string_agg(q->>'text', ' ') from jsonb_array_elements(case when jsonb_typeof(i.summary->'quotes') = 'array' then i.summary->'quotes' else '[]'::jsonb end) q)), ''), 100000)), 'B'), left(coalesce(concat_ws(' ', i.title, i.interviewee_name), ''), 1000)
  from public.interviews i;

create function public.search_index_transcript()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.search_index where kind = 'transcript' and entity_id = old.id;
    return old;
  end if;
  insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
  values ('transcript', new.id, new.organization_id, setweight(to_tsvector('dutch', left(coalesce(left(new.content, 80), ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(new.content, ''), 100000)), 'B'), left(coalesce(concat_ws(' ', left(new.content, 80), (select it.title from public.interviews it where it.id = new.interview_id)), ''), 1000))
  on conflict (kind, entity_id) do update
    set organization_id = excluded.organization_id, doc = excluded.doc, like_text = excluded.like_text;
  return new;
end;
$$;

revoke all on function public.search_index_transcript() from public, anon, authenticated;

create trigger search_index_transcript_write after insert or update of content on public.interview_messages
  for each row execute function public.search_index_transcript();
create trigger search_index_transcript_delete after delete on public.interview_messages
  for each row execute function public.search_index_transcript();

insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
select 'transcript', m.id, m.organization_id, setweight(to_tsvector('dutch', left(coalesce(left(m.content, 80), ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(m.content, ''), 100000)), 'B'), left(coalesce(concat_ws(' ', left(m.content, 80), (select it.title from public.interviews it where it.id = m.interview_id)), ''), 1000)
  from public.interview_messages m;

create function public.search_index_newsletter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.search_index where kind = 'newsletter' and entity_id = old.id;
    return old;
  end if;
  insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
  values ('newsletter', new.id, new.organization_id, setweight(to_tsvector('dutch', left(coalesce(new.title, ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', new.subject, regexp_replace(new.intro_html, '<[^>]+>', ' ', 'g'), regexp_replace(new.outro_html, '<[^>]+>', ' ', 'g')), ''), 100000)), 'B'), left(coalesce(concat_ws(' ', new.title, new.subject), ''), 1000))
  on conflict (kind, entity_id) do update
    set organization_id = excluded.organization_id, doc = excluded.doc, like_text = excluded.like_text;
  return new;
end;
$$;

revoke all on function public.search_index_newsletter() from public, anon, authenticated;

create trigger search_index_newsletter_write after insert or update of title, subject, intro_html, outro_html on public.newsletters
  for each row execute function public.search_index_newsletter();
create trigger search_index_newsletter_delete after delete on public.newsletters
  for each row execute function public.search_index_newsletter();

insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
select 'newsletter', n.id, n.organization_id, setweight(to_tsvector('dutch', left(coalesce(n.title, ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', n.subject, regexp_replace(n.intro_html, '<[^>]+>', ' ', 'g'), regexp_replace(n.outro_html, '<[^>]+>', ' ', 'g')), ''), 100000)), 'B'), left(coalesce(concat_ws(' ', n.title, n.subject), ''), 1000)
  from public.newsletters n;

create function public.search_index_social_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.search_index where kind = 'social_post' and entity_id = old.id;
    return old;
  end if;
  insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
  values ('social_post', new.id, new.organization_id, setweight(to_tsvector('dutch', left(coalesce(left(new.body, 80), ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(new.body, ''), 100000)), 'B'), left(coalesce(left(new.body, 80), ''), 1000))
  on conflict (kind, entity_id) do update
    set organization_id = excluded.organization_id, doc = excluded.doc, like_text = excluded.like_text;
  return new;
end;
$$;

revoke all on function public.search_index_social_post() from public, anon, authenticated;

create trigger search_index_social_post_write after insert or update of body on public.social_posts
  for each row execute function public.search_index_social_post();
create trigger search_index_social_post_delete after delete on public.social_posts
  for each row execute function public.search_index_social_post();

insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
select 'social_post', p.id, p.organization_id, setweight(to_tsvector('dutch', left(coalesce(left(p.body, 80), ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(p.body, ''), 100000)), 'B'), left(coalesce(left(p.body, 80), ''), 1000)
  from public.social_posts p;

create function public.search_index_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.search_index where kind = 'project' and entity_id = old.id;
    return old;
  end if;
  insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
  values ('project', new.id, new.organization_id, setweight(to_tsvector('dutch', left(coalesce(new.name, ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', new.client_name, new.anonymous_label, new.notes), ''), 100000)), 'B'), left(coalesce(concat_ws(' ', new.name, new.client_name), ''), 1000))
  on conflict (kind, entity_id) do update
    set organization_id = excluded.organization_id, doc = excluded.doc, like_text = excluded.like_text;
  return new;
end;
$$;

revoke all on function public.search_index_project() from public, anon, authenticated;

create trigger search_index_project_write after insert or update of name, client_name, anonymous_label, notes on public.projects
  for each row execute function public.search_index_project();
create trigger search_index_project_delete after delete on public.projects
  for each row execute function public.search_index_project();

insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
select 'project', pr.id, pr.organization_id, setweight(to_tsvector('dutch', left(coalesce(pr.name, ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', pr.client_name, pr.anonymous_label, pr.notes), ''), 100000)), 'B'), left(coalesce(concat_ws(' ', pr.name, pr.client_name), ''), 1000)
  from public.projects pr;

create function public.search_index_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.search_index where kind = 'person' and entity_id = old.id;
    return old;
  end if;
  insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
  values ('person', new.id, new.organization_id, setweight(to_tsvector('dutch', left(coalesce(new.full_name, ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', new.job_title, new.department, new.email), ''), 100000)), 'B'), left(coalesce(concat_ws(' ', new.full_name, new.email), ''), 1000))
  on conflict (kind, entity_id) do update
    set organization_id = excluded.organization_id, doc = excluded.doc, like_text = excluded.like_text;
  return new;
end;
$$;

revoke all on function public.search_index_person() from public, anon, authenticated;

create trigger search_index_person_write after insert or update of full_name, job_title, department, email on public.profiles
  for each row execute function public.search_index_person();
create trigger search_index_person_delete after delete on public.profiles
  for each row execute function public.search_index_person();

insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
select 'person', pf.id, pf.organization_id, setweight(to_tsvector('dutch', left(coalesce(pf.full_name, ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', pf.job_title, pf.department, pf.email), ''), 100000)), 'B'), left(coalesce(concat_ws(' ', pf.full_name, pf.email), ''), 1000)
  from public.profiles pf;

create function public.search_index_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.search_index where kind = 'source' and entity_id = old.id;
    return old;
  end if;
  insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
  values ('source', new.id, new.organization_id, setweight(to_tsvector('dutch', left(coalesce(coalesce(new.title, left(new.body, 80)), ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', new.body, new.channel, new.author_name), ''), 100000)), 'B'), left(coalesce(concat_ws(' ', new.title, new.author_name, new.channel), ''), 1000))
  on conflict (kind, entity_id) do update
    set organization_id = excluded.organization_id, doc = excluded.doc, like_text = excluded.like_text;
  return new;
end;
$$;

revoke all on function public.search_index_source() from public, anon, authenticated;

create trigger search_index_source_write after insert or update of title, body, channel, author_name on public.source_messages
  for each row execute function public.search_index_source();
create trigger search_index_source_delete after delete on public.source_messages
  for each row execute function public.search_index_source();

insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
select 'source', sm.id, sm.organization_id, setweight(to_tsvector('dutch', left(coalesce(coalesce(sm.title, left(sm.body, 80)), ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', sm.body, sm.channel, sm.author_name), ''), 100000)), 'B'), left(coalesce(concat_ws(' ', sm.title, sm.author_name, sm.channel), ''), 1000)
  from public.source_messages sm;

create function public.search_index_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.search_index where kind = 'comment' and entity_id = old.id;
    return old;
  end if;
  insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
  values ('comment', new.id, new.organization_id, setweight(to_tsvector('dutch', left(coalesce(left(new.body, 80), ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', new.body, new.quote), ''), 100000)), 'B'), left(coalesce(left(new.body, 80), ''), 1000))
  on conflict (kind, entity_id) do update
    set organization_id = excluded.organization_id, doc = excluded.doc, like_text = excluded.like_text;
  return new;
end;
$$;

revoke all on function public.search_index_comment() from public, anon, authenticated;

create trigger search_index_comment_write after insert or update of body, quote on public.comments
  for each row execute function public.search_index_comment();
create trigger search_index_comment_delete after delete on public.comments
  for each row execute function public.search_index_comment();

insert into public.search_index (kind, entity_id, organization_id, doc, like_text)
select 'comment', c.id, c.organization_id, setweight(to_tsvector('dutch', left(coalesce(left(c.body, 80), ''), 1000)), 'A') || setweight(to_tsvector('dutch', left(coalesce(concat_ws(' ', c.body, c.quote), ''), 100000)), 'B'), left(coalesce(left(c.body, 80), ''), 1000)
  from public.comments c;

create or replace function public.search_all(
  p_tsquery text,
  p_like text,
  p_kind text default null,
  p_limit int default 5,
  p_offset int default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with cand as (
    select si.kind, si.entity_id,
           ts_rank_cd(si.doc, to_tsquery('dutch', p_tsquery))
             + case when si.like_text ilike p_like then 1 else 0 end as rank
      from public.search_index si
     where length(p_tsquery) <= 500
       and length(p_like) <= 260
       and (si.doc @@ to_tsquery('dutch', p_tsquery) or si.like_text ilike p_like)
  ),
  hits as (
    select 'signal'::text as kind, s.id, null::uuid as parent_id,
           coalesce(s.title, '') as title,
           concat_ws(' ', s.summary, s.suggested_action, s.score_rationale) as body,
           s.status::text as status, s.updated_at as at, cd.rank
      from cand cd
      join public.content_signals s on s.id = cd.entity_id
     where cd.kind = 'signal'
    union all
    select 'topic'::text as kind, o.id, o.signal_id as parent_id,
           coalesce(o.title, '') as title,
           o.angle as body,
           o.status::text as status, o.updated_at as at, cd.rank
      from cand cd
      join public.content_opportunities o on o.id = cd.entity_id
     where cd.kind = 'topic'
    union all
    select 'article'::text as kind, a.id, null::uuid as parent_id,
           coalesce(a.title, '') as title,
           concat_ws(' ', a.subtitle, a.excerpt, array_to_string(a.tags, ' '), regexp_replace(a.body_html, '<[^>]+>', ' ', 'g')) as body,
           a.status::text as status, a.updated_at as at, cd.rank
      from cand cd
      join public.articles a on a.id = cd.entity_id
     where cd.kind = 'article'
    union all
    select 'interview'::text as kind, i.id, null::uuid as parent_id,
           coalesce(i.title, '') as title,
           concat_ws(' ', i.purpose, i.interviewee_name, i.interviewee_role, i.summary->>'summary', (select string_agg(q->>'text', ' ') from jsonb_array_elements(case when jsonb_typeof(i.summary->'quotes') = 'array' then i.summary->'quotes' else '[]'::jsonb end) q)) as body,
           i.status::text as status, i.updated_at as at, cd.rank
      from cand cd
      join public.interviews i on i.id = cd.entity_id
     where cd.kind = 'interview'
    union all
    select 'transcript'::text as kind, m.id, m.interview_id as parent_id,
           coalesce(left(m.content, 80), '') as title,
           m.content as body,
           m.role::text as status, m.created_at as at, cd.rank
      from cand cd
      join public.interview_messages m on m.id = cd.entity_id
     where cd.kind = 'transcript'
    union all
    select 'newsletter'::text as kind, n.id, null::uuid as parent_id,
           coalesce(n.title, '') as title,
           concat_ws(' ', n.subject, regexp_replace(n.intro_html, '<[^>]+>', ' ', 'g'), regexp_replace(n.outro_html, '<[^>]+>', ' ', 'g')) as body,
           n.status::text as status, n.updated_at as at, cd.rank
      from cand cd
      join public.newsletters n on n.id = cd.entity_id
     where cd.kind = 'newsletter'
    union all
    select 'social_post'::text as kind, p.id, p.article_id as parent_id,
           coalesce(left(p.body, 80), '') as title,
           p.body as body,
           p.status::text as status, p.updated_at as at, cd.rank
      from cand cd
      join public.social_posts p on p.id = cd.entity_id
     where cd.kind = 'social_post'
    union all
    select 'project'::text as kind, pr.id, null::uuid as parent_id,
           coalesce(pr.name, '') as title,
           concat_ws(' ', pr.client_name, pr.anonymous_label, pr.notes) as body,
           pr.status::text as status, pr.updated_at as at, cd.rank
      from cand cd
      join public.projects pr on pr.id = cd.entity_id
     where cd.kind = 'project'
    union all
    select 'person'::text as kind, pf.id, null::uuid as parent_id,
           coalesce(pf.full_name, '') as title,
           concat_ws(' ', pf.job_title, pf.department, pf.email) as body,
           case when pf.is_active then 'active' else 'inactive' end as status, pf.updated_at as at, cd.rank
      from cand cd
      join public.profiles pf on pf.id = cd.entity_id
     where cd.kind = 'person'
    union all
    select 'source'::text as kind, sm.id, null::uuid as parent_id,
           coalesce(coalesce(sm.title, left(sm.body, 80)), '') as title,
           concat_ws(' ', sm.body, sm.channel, sm.author_name) as body,
           sm.source::text as status, sm.occurred_at as at, cd.rank
      from cand cd
      join public.source_messages sm on sm.id = cd.entity_id
     where cd.kind = 'source'
    union all
    select 'comment'::text as kind, c.id, c.entity_id as parent_id,
           coalesce(left(c.body, 80), '') as title,
           concat_ws(' ', c.body, c.quote) as body,
           c.entity_type::text as status, c.created_at as at, cd.rank
      from cand cd
      join public.comments c on c.id = cd.entity_id
     where cd.kind = 'comment'
  ),
  ranked as (
    select h.*,
           row_number() over (partition by h.kind order by h.rank desc, h.at desc, h.id) as rn,
           count(*) over (partition by h.kind) as total
      from hits h
  )
  select jsonb_build_object(
    'counts', coalesce(
      (select jsonb_object_agg(c.kind, c.total) from (select distinct r.kind, r.total from ranked r) c),
      '{}'::jsonb
    ),
    'rows', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'kind', r.kind,
            'id', r.id,
            'parent_id', r.parent_id,
            'title', r.title,
            'snippet', ts_headline(
              'dutch',
              left(case when r.body = '' then r.title else r.body end, 100000),
              to_tsquery('dutch', p_tsquery),
              'StartSel=' || chr(1) || ', StopSel=' || chr(2) || ', MaxFragments=1, MaxWords=28, MinWords=10, ShortWord=2'
            ),
            'status', r.status,
            'at', r.at
          )
          order by r.kind, r.rn
        )
          from ranked r
         where (p_kind is null and r.rn <= least(greatest(p_limit, 1), 50))
            or (r.kind = p_kind
                and r.rn > least(greatest(p_offset, 0), 10000)
                and r.rn <= least(greatest(p_offset, 0), 10000) + least(greatest(p_limit, 1), 50))
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.search_all(text, text, text, int, int) from public, anon;
grant execute on function public.search_all(text, text, text, int, int) to authenticated;
