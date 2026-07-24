-- Imported mentions can carry future created_at values (e.g. 2027). Those were
-- sorting to the top of list_mentions_inbox and dominating the home sidebar Recents merge.
-- Keep original created_at for display, but sort so future import stamps sink to the end.

CREATE OR REPLACE FUNCTION public.list_mentions_inbox(
  p_mode text DEFAULT 'received'::text,
  p_seen_filter text DEFAULT 'all'::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  mention_id integer,
  thread_id integer,
  created_at timestamp with time zone,
  comment text,
  attachment text,
  created_by integer,
  created_by_name text,
  created_by_photo text,
  is_seen boolean,
  direction text,
  project_id integer,
  project_name text,
  project_logo text,
  project_color text,
  thread_title text,
  watcher_avatars jsonb
)
LANGUAGE sql
STABLE
AS $function$
with base as (
  select
    m.id as mention_id,
    m.thread_id,
    (m.created_at at time zone 'UTC') as created_at,
    case
      when m.created_at is null then null::timestamptz
      when (m.created_at at time zone 'UTC') <= (now() + interval '1 day')
        then m.created_at at time zone 'UTC'
      else null::timestamptz
    end as sort_at,
    m.comment,
    m.attachment,
    m.created_by,
    u.full_name as created_by_name,
    u.photo as created_by_photo,
    t.title as thread_title,
    t.project_id,
    p.name as project_name,
    p.logo as project_logo,
    p.color as project_color,
    exists (
      select 1
      from public.seen_mentions sm
      where sm.mention_id = m.id
        and sm.seen_by_id = current_user_id()
    ) as is_seen,
    case
      when m.created_by = current_user_id() then 'sent'
      else 'received'
    end as direction
  from public.mentions m
  left join public.users u
    on u.id = m.created_by
  left join public.threads t
    on t.id = m.thread_id
  left join public.projects p
    on p.id = t.project_id
  where
    (
      p_mode = 'sent'
      and m.created_by = current_user_id()
    )
    or
    (
      p_mode = 'received'
      and exists (
        select 1
        from public.thread_watchers tw
        where tw.thread_id = m.thread_id
          and tw.watcher_id = current_user_id()
      )
      and m.created_by <> current_user_id()
    )
),
filtered as (
  select *
  from base
  where
    p_mode in ('sent', 'received')
    and (
      p_mode = 'sent'
      or p_seen_filter = 'all'
      or (p_seen_filter = 'seen' and is_seen = true)
      or (p_seen_filter = 'unseen' and is_seen = false)
    )
),
paged as (
  select *
  from filtered
  order by sort_at desc nulls last, mention_id desc
  limit p_limit
  offset p_offset
)
select
  p.mention_id,
  p.thread_id,
  p.created_at,
  p.comment,
  p.attachment,
  p.created_by,
  p.created_by_name,
  p.created_by_photo,
  p.is_seen,
  p.direction,
  p.project_id,
  p.project_name,
  p.project_logo,
  p.project_color,
  p.thread_title,
  coalesce(wa.watcher_avatars, '[]'::jsonb) as watcher_avatars
from paged p
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id', u.id,
      'name', u.full_name,
      'photo', u.photo
    )
    order by u.full_name
  ) as watcher_avatars
  from (
    select tw.watcher_id
    from public.thread_watchers tw
    where tw.thread_id = p.thread_id
    limit 8
  ) tw
  join public.users u
    on u.id = tw.watcher_id
) wa on true
order by p.sort_at desc nulls last, p.mention_id desc;
$function$;

COMMENT ON FUNCTION public.list_mentions_inbox(text, text, integer, integer) IS
  'Mentions inbox; demotes future imported created_at so Recents/inbox order stays sane.';
