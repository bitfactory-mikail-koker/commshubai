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
  with q as (
    select to_tsquery('dutch', p_tsquery) as tsq
  ),
  hits as (
    select 'signal'::text as kind, s.id, null::uuid as parent_id,
           coalesce(s.title, '') as title,
           concat_ws(' ', s.summary, s.suggested_action, s.score_rationale) as body,
           coalesce(s.title, '') as extra,
           s.status::text as status, s.updated_at as at
      from public.content_signals s
    union all
    select 'topic', o.id, o.signal_id,
           coalesce(o.title, ''),
           coalesce(o.angle, ''),
           coalesce(o.title, ''),
           o.status::text, o.updated_at
      from public.content_opportunities o
    union all
    select 'article', a.id, null::uuid,
           coalesce(a.title, ''),
           concat_ws(' ', a.subtitle, a.excerpt, array_to_string(a.tags, ' '),
                     regexp_replace(a.body_html, '<[^>]+>', ' ', 'g')),
           concat_ws(' ', a.title, a.subtitle),
           a.status::text, a.updated_at
      from public.articles a
    union all
    select 'interview', i.id, null::uuid,
           coalesce(i.title, ''),
           concat_ws(' ', i.purpose, i.interviewee_name, i.interviewee_role, i.summary::text),
           concat_ws(' ', i.title, i.interviewee_name),
           i.status::text, i.updated_at
      from public.interviews i
    union all
    select 'transcript', m.id, m.interview_id,
           coalesce(i.title, ''),
           m.content,
           coalesce(i.title, ''),
           m.role::text, m.created_at
      from public.interview_messages m
      join public.interviews i on i.id = m.interview_id
    union all
    select 'newsletter', n.id, null::uuid,
           coalesce(n.title, ''),
           concat_ws(' ', n.subject,
                     regexp_replace(n.intro_html, '<[^>]+>', ' ', 'g'),
                     regexp_replace(n.outro_html, '<[^>]+>', ' ', 'g')),
           concat_ws(' ', n.title, n.subject),
           n.status::text, n.updated_at
      from public.newsletters n
    union all
    select 'social_post', p.id, p.article_id,
           left(p.body, 80),
           p.body,
           left(p.body, 80),
           p.status::text, p.updated_at
      from public.social_posts p
    union all
    select 'project', pr.id, null::uuid,
           coalesce(pr.name, ''),
           concat_ws(' ', pr.client_name, pr.anonymous_label, pr.notes),
           concat_ws(' ', pr.name, pr.client_name),
           pr.status::text, pr.updated_at
      from public.projects pr
    union all
    select 'person', pf.id, null::uuid,
           coalesce(pf.full_name, ''),
           concat_ws(' ', pf.job_title, pf.department, pf.email),
           concat_ws(' ', pf.full_name, pf.email),
           case when pf.is_active then 'active' else 'inactive' end, pf.updated_at
      from public.profiles pf
    union all
    select 'source', sm.id, sig.id,
           coalesce(sm.title, left(sm.body, 80)),
           concat_ws(' ', sm.body, sm.channel, sm.author_name),
           concat_ws(' ', sm.title, sm.author_name, sm.channel),
           sm.source::text, sm.occurred_at
      from public.source_messages sm
      left join lateral (
        select cs.id from public.content_signals cs where cs.primary_source_id = sm.id limit 1
      ) sig on true
    union all
    select 'comment', c.id, c.entity_id,
           left(c.body, 80),
           concat_ws(' ', c.body, c.quote),
           left(c.body, 80),
           c.entity_type::text, c.created_at
      from public.comments c
  ),
  scored as (
    select d.*, ts_rank_cd(d.doc, q.tsq) + case when d.tl then 1 else 0 end as rank
      from (
        select h.*,
               setweight(to_tsvector('dutch', h.title), 'A') || setweight(to_tsvector('dutch', h.body), 'B') as doc,
               (h.extra ilike p_like) as tl
          from hits h
      ) d
      cross join q
     where d.doc @@ q.tsq or d.tl
  ),
  ranked as (
    select s.*,
           row_number() over (partition by s.kind order by s.rank desc, s.at desc, s.id) as rn,
           count(*) over (partition by s.kind) as total
      from scored s
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
              case when r.body = '' then r.title else r.body end,
              q.tsq,
              'StartSel=' || chr(1) || ', StopSel=' || chr(2) || ', MaxFragments=1, MaxWords=28, MinWords=10, ShortWord=2'
            ),
            'status', r.status,
            'at', r.at
          )
          order by r.kind, r.rn
        )
          from ranked r
          cross join q
         where (p_kind is null and r.rn <= p_limit)
            or (r.kind = p_kind and r.rn > p_offset and r.rn <= p_offset + p_limit)
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.search_all(text, text, text, int, int) from public, anon;
grant execute on function public.search_all(text, text, text, int, int) to authenticated;
