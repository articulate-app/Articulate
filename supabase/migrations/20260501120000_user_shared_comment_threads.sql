-- Shared comment threads between two users (watchers, thread creator, direct user_id, mention authors).

CREATE OR REPLACE FUNCTION public.get_user_comment_threads(
  p_me_user_id bigint,
  p_other_user_id bigint,
  p_limit integer,
  p_offset integer
)
RETURNS TABLE (
  thread_id bigint,
  title text,
  project_id bigint,
  task_id bigint,
  user_id bigint,
  context_type text,
  last_preview text,
  last_mention_author_name text,
  last_mention_author_id bigint,
  last_activity_at timestamptz,
  unread_count bigint,
  is_pinned boolean,
  is_resolved boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH thread_participants AS (
    SELECT DISTINCT s.thread_id, s.user_id::bigint AS user_id
    FROM (
      SELECT t.id AS thread_id, t.created_by AS user_id
      FROM public.threads t
      WHERE t.created_by IS NOT NULL
      UNION ALL
      SELECT t.id, t.user_id
      FROM public.threads t
      WHERE t.user_id IS NOT NULL
      UNION ALL
      SELECT tw.thread_id, tw.watcher_id
      FROM public.thread_watchers tw
      UNION ALL
      SELECT m.thread_id, m.created_by
      FROM public.mentions m
      WHERE m.thread_id IS NOT NULL AND m.created_by IS NOT NULL
    ) s
    WHERE s.user_id IS NOT NULL
  ),
  eligible AS (
    SELECT tp.thread_id
    FROM thread_participants tp
    GROUP BY tp.thread_id
    HAVING bool_or(tp.user_id = p_me_user_id) AND bool_or(tp.user_id = p_other_user_id)
  ),
  last_m AS (
    SELECT DISTINCT ON (m.thread_id)
      m.thread_id,
      m.id AS mention_id,
      m.comment,
      m.created_at,
      m.created_by
    FROM public.mentions m
    WHERE m.thread_id IN (SELECT thread_id FROM eligible)
    ORDER BY m.thread_id, m.created_at DESC NULLS LAST
  )
  SELECT
    t.id::bigint AS thread_id,
    COALESCE(t.title, '')::text AS title,
    t.project_id::bigint,
    t.task_id::bigint,
    t.user_id::bigint,
    (
      CASE
        WHEN t.task_id IS NOT NULL THEN 'task'
        WHEN t.project_id IS NOT NULL THEN 'project'
        WHEN t.user_id IS NOT NULL THEN 'direct'
        ELSE 'general'
      END
    )::text AS context_type,
    LEFT(
      trim(
        regexp_replace(
          regexp_replace(COALESCE(lm.comment, ''), '<[^>]+>', ' ', 'g'),
          '\s+',
          ' ',
          'g'
        )
      ),
      280
    )::text AS last_preview,
    u.full_name::text AS last_mention_author_name,
    lm.created_by::bigint AS last_mention_author_id,
    COALESCE(lm.created_at, (SELECT max(m2.created_at) FROM public.mentions m2 WHERE m2.thread_id = t.id)) AS last_activity_at,
    (
      SELECT count(*)::bigint
      FROM public.mentions mu
      WHERE mu.thread_id = t.id
        AND mu.created_by IS DISTINCT FROM p_me_user_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.seen_mentions sm
          WHERE sm.mention_id = mu.id
            AND sm.seen_by_id = p_me_user_id
        )
    ) AS unread_count,
    false AS is_pinned,
    (t.resolved_at IS NOT NULL) AS is_resolved
  FROM public.threads t
  INNER JOIN eligible e ON e.thread_id = t.id
  LEFT JOIN last_m lm ON lm.thread_id = t.id
  LEFT JOIN public.users u ON u.id = lm.created_by
  ORDER BY COALESCE(
    lm.created_at,
    (SELECT max(mx.created_at) FROM public.mentions mx WHERE mx.thread_id = t.id),
    to_timestamp(0)
  ) DESC NULLS LAST,
  t.id DESC
  LIMIT greatest(coalesce(p_limit, 50), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.get_user_comment_thread_mentions(
  p_thread_id bigint,
  p_me_user_id bigint,
  p_other_user_id bigint,
  p_limit integer,
  p_offset integer
)
RETURNS TABLE (
  id bigint,
  thread_id bigint,
  comment text,
  attachment text,
  reply_to_id bigint,
  created_at timestamptz,
  created_by bigint,
  author_full_name text,
  author_photo text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible AS (
    SELECT tp.thread_id
    FROM (
      SELECT DISTINCT s.thread_id, s.user_id::bigint AS user_id
      FROM (
        SELECT t.id AS thread_id, t.created_by AS user_id
        FROM public.threads t
        WHERE t.created_by IS NOT NULL
        UNION ALL
        SELECT t.id, t.user_id
        FROM public.threads t
        WHERE t.user_id IS NOT NULL
        UNION ALL
        SELECT tw.thread_id, tw.watcher_id
        FROM public.thread_watchers tw
        UNION ALL
        SELECT m.thread_id, m.created_by
        FROM public.mentions m
        WHERE m.thread_id IS NOT NULL AND m.created_by IS NOT NULL
      ) s
      WHERE s.user_id IS NOT NULL
    ) tp
    WHERE tp.thread_id = p_thread_id
    GROUP BY tp.thread_id
    HAVING bool_or(tp.user_id = p_me_user_id) AND bool_or(tp.user_id = p_other_user_id)
  )
  SELECT
    m.id::bigint,
    m.thread_id::bigint,
    m.comment,
    m.attachment,
    m.reply_to_id::bigint,
    m.created_at,
    m.created_by::bigint,
    u.full_name::text AS author_full_name,
    u.photo::text AS author_photo
  FROM public.mentions m
  INNER JOIN eligible el ON el.thread_id = m.thread_id
  LEFT JOIN public.users u ON u.id = m.created_by
  WHERE m.thread_id = p_thread_id
  ORDER BY m.created_at ASC NULLS LAST, m.id ASC
  LIMIT greatest(coalesce(p_limit, 50), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_user_comment_threads(bigint, bigint, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_comment_thread_mentions(bigint, bigint, bigint, integer, integer) TO authenticated;
