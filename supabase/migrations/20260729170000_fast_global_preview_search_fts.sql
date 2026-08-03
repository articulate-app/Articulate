-- Speed up global search preview + fix FTS plan in search_global_documents.
-- Root cause: (q = '' OR search_vector @@ tsq) + LIMIT without ORDER BY made Postgres
-- scan ~10k task rows via btree instead of using the GIN FTS index.

-- Optional partial GIN for the common task-only preview path.
CREATE INDEX IF NOT EXISTS idx_gsd_task_search_vector
  ON public.global_search_documents
  USING gin (search_vector)
  WHERE entity_type = 'task' AND is_active = true AND is_deleted = false;

CREATE OR REPLACE FUNCTION public.search_global_documents(
  p_query text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_entity_types text[] DEFAULT NULL::text[],
  p_team_ids integer[] DEFAULT NULL::integer[],
  p_project_ids integer[] DEFAULT NULL::integer[]
)
RETURNS TABLE(
  entity_type text,
  entity_id text,
  title text,
  subtitle text,
  preview text,
  url text,
  icon text,
  sort_at timestamp with time zone,
  rank_score double precision,
  display_payload jsonb
)
LANGUAGE sql
STABLE
AS $function$
WITH params AS MATERIALIZED (
  SELECT
    lower(trim(coalesce(p_query, ''))) AS q,
    CASE
      WHEN nullif(trim(coalesce(p_query, '')), '') IS NULL THEN NULL
      ELSE websearch_to_tsquery('simple', trim(p_query))
    END AS tsq,
    p_entity_types AS entity_types,
    greatest(1, least(coalesce(p_limit, 20), 200)) AS result_limit,
    greatest(0, coalesce(p_offset, 0)) AS result_offset,
    (
      nullif(trim(coalesce(p_query, '')), '') IS NOT NULL
      AND (
        p_entity_types IS NULL
        OR 'ai_thread' = ANY (p_entity_types)
      )
    ) AS need_ai_boost
),

-- Only scan ai_messages when searching AI threads (or unrestricted entity types).
ai_message_candidates AS MATERIALIZED (
  SELECT
    m.thread_id::text AS entity_id,
    max(ts_rank_cd(m.search_vector, p.tsq)) * 120
      + extract(epoch FROM max(m.created_at)) / 100000 AS message_rank
  FROM public.ai_messages m
  CROSS JOIN params p
  WHERE p.need_ai_boost
    AND p.tsq IS NOT NULL
    AND m.search_vector @@ p.tsq
  GROUP BY m.thread_id
  LIMIT 100
),

-- Search branch: pure FTS so the planner can use GIN (no OR with empty-q).
fts_search_candidates AS MATERIALIZED (
  SELECT
    g.entity_type,
    g.entity_id,
    ts_rank_cd(g.search_vector, p.tsq) * 100 AS base_rank
  FROM public.global_search_documents g
  CROSS JOIN params p
  WHERE p.tsq IS NOT NULL
    AND g.is_active
    AND NOT g.is_deleted
    AND (p.entity_types IS NULL OR g.entity_type = ANY (p.entity_types))
    AND g.search_vector @@ p.tsq
  ORDER BY base_rank DESC, g.sort_at DESC, g.entity_id DESC
  LIMIT 200
),

-- Browse branch: no query → recent docs by sort_at.
fts_browse_candidates AS MATERIALIZED (
  SELECT
    g.entity_type,
    g.entity_id,
    0::double precision AS base_rank
  FROM public.global_search_documents g
  CROSS JOIN params p
  WHERE p.tsq IS NULL
    AND g.is_active
    AND NOT g.is_deleted
    AND (p.entity_types IS NULL OR g.entity_type = ANY (p.entity_types))
  ORDER BY g.sort_at DESC, g.entity_id DESC
  LIMIT 200
),

fts_candidates AS MATERIALIZED (
  SELECT * FROM fts_search_candidates
  UNION ALL
  SELECT * FROM fts_browse_candidates
),

docs AS MATERIALIZED (
  SELECT
    g.*,
    f.base_rank + coalesce(am.message_rank, 0) AS base_rank
  FROM fts_candidates f
  JOIN public.global_search_documents g
    ON g.entity_type = f.entity_type
   AND g.entity_id = f.entity_id
  LEFT JOIN ai_message_candidates am
    ON g.entity_type = 'ai_thread'
   AND g.entity_id = am.entity_id
),

final AS (
  SELECT
    *,
    (
      base_rank
      + least(coalesce(rank_boost, 0), 100)
      + extract(epoch FROM sort_at) / 100000
    ) AS rank_score
  FROM docs
)

SELECT
  f.entity_type,
  f.entity_id,
  f.title,
  f.subtitle,
  f.preview,
  f.url,
  f.icon,
  f.sort_at,
  f.rank_score,
  f.display_payload
FROM final f
CROSS JOIN params p
WHERE (p.entity_types IS NULL OR f.entity_type = ANY (p.entity_types))
ORDER BY
  CASE WHEN p.tsq IS NULL THEN f.sort_at END DESC,
  f.rank_score DESC
LIMIT (SELECT result_limit FROM params)
OFFSET (SELECT result_offset FROM params);
$function$;

CREATE OR REPLACE FUNCTION public.search_global_preview_items(
  p_query text,
  p_limit integer DEFAULT 10,
  p_entity_types text[] DEFAULT NULL::text[]
)
RETURNS TABLE(
  entity_type text,
  entity_id text,
  url text,
  display_payload jsonb,
  rank_score double precision
)
LANGUAGE sql
STABLE
AS $function$
WITH params AS MATERIALIZED (
  SELECT
    lower(trim(coalesce(p_query, ''))) AS q,
    CASE
      WHEN nullif(trim(coalesce(p_query, '')), '') IS NULL THEN NULL
      ELSE websearch_to_tsquery('simple', trim(p_query))
    END AS tsq,
    greatest(1, least(coalesce(p_limit, 10), 20)) AS result_limit,
    ARRAY(
      SELECT DISTINCT t
      FROM unnest(
        coalesce(
          nullif(p_entity_types, '{}'::text[]),
          ARRAY['task', 'project', 'mention', 'user', 'ai_thread']::text[]
        )
      ) AS t
      WHERE t IS NOT NULL
        AND t <> ''
        AND t NOT IN ('project_briefing', 'team')
    ) AS entity_types
),
my_opens AS MATERIALIZED (
  SELECT DISTINCT ON (h.entity_type, h.entity_id)
    h.entity_type,
    h.entity_id,
    h.opened_at
  FROM public.global_object_open_history h
  WHERE h.opened_by = public.current_user_id()
  ORDER BY h.entity_type, h.entity_id, h.opened_at DESC
),

-- Direct FTS on the search index (no search_global_documents wrapper / no AI boost / no limit-200 scan).
search_hits AS MATERIALIZED (
  SELECT
    g.entity_type,
    g.entity_id,
    g.url,
    g.display_payload,
    g.sort_at,
    (ts_rank_cd(g.search_vector, p.tsq) * 100)::double precision AS fts_score,
    o.opened_at,
    (
      (ts_rank_cd(g.search_vector, p.tsq) * 100)
      + CASE
          WHEN o.opened_at IS NULL THEN 0
          ELSE 1000 + extract(epoch FROM o.opened_at) / 100000.0
        END
      + CASE g.entity_type WHEN 'task' THEN 50 ELSE 0 END
    )::double precision AS composite_score
  FROM public.global_search_documents g
  CROSS JOIN params p
  LEFT JOIN my_opens o
    ON o.entity_type = g.entity_type
   AND o.entity_id = g.entity_id
  WHERE p.tsq IS NOT NULL
    AND g.is_active
    AND NOT g.is_deleted
    AND g.entity_type = ANY (p.entity_types)
    AND g.search_vector @@ p.tsq
  ORDER BY composite_score DESC, g.sort_at DESC, g.entity_id DESC
  LIMIT (SELECT greatest(result_limit * 8, 40) FROM params)
),

browse_hits AS MATERIALIZED (
  SELECT
    g.entity_type,
    g.entity_id,
    g.url,
    g.display_payload,
    g.sort_at,
    0::double precision AS fts_score,
    o.opened_at,
    (
      CASE
        WHEN o.opened_at IS NULL THEN 0
        ELSE 1000 + extract(epoch FROM o.opened_at) / 100000.0
      END
      + CASE g.entity_type WHEN 'task' THEN 50 ELSE 0 END
    )::double precision AS composite_score
  FROM public.global_search_documents g
  CROSS JOIN params p
  LEFT JOIN my_opens o
    ON o.entity_type = g.entity_type
   AND o.entity_id = g.entity_id
  WHERE p.tsq IS NULL
    AND g.is_active
    AND NOT g.is_deleted
    AND g.entity_type = ANY (p.entity_types)
  ORDER BY
    (o.opened_at IS NOT NULL) DESC,
    o.opened_at DESC NULLS LAST,
    g.sort_at DESC,
    g.entity_id DESC
  LIMIT (SELECT greatest(result_limit * 8, 40) FROM params)
),

candidates AS MATERIALIZED (
  SELECT * FROM search_hits
  UNION ALL
  SELECT * FROM browse_hits
),

by_type AS (
  SELECT
    c.*,
    row_number() OVER (
      PARTITION BY c.entity_type
      ORDER BY
        (c.opened_at IS NOT NULL) DESC,
        c.opened_at DESC NULLS LAST,
        c.composite_score DESC,
        c.entity_id DESC
    ) AS type_rank
  FROM candidates c
),

quota_filtered AS (
  SELECT
    b.*,
    (SELECT result_limit FROM params) AS result_limit,
    cardinality((SELECT entity_types FROM params)) AS type_count
  FROM by_type b
  WHERE
    -- Single-type request (e.g. tasks-first preview): take up to result_limit of that type.
    (
      (SELECT cardinality(entity_types) FROM params) = 1
      AND b.type_rank <= (SELECT result_limit FROM params)
    )
    OR (
      (SELECT cardinality(entity_types) FROM params) > 1
      AND b.entity_type = 'task'
      AND b.type_rank <= greatest(4, (SELECT result_limit FROM params) - 3)
    )
    OR (
      (SELECT cardinality(entity_types) FROM params) > 1
      AND b.entity_type <> 'task'
      AND b.type_rank <= 2
    )
),

final AS (
  SELECT
    q.entity_type,
    q.entity_id,
    q.url,
    q.display_payload,
    q.composite_score AS rank_score,
    row_number() OVER (
      ORDER BY
        CASE q.entity_type WHEN 'task' THEN 0 ELSE 1 END,
        (q.opened_at IS NOT NULL) DESC,
        q.opened_at DESC NULLS LAST,
        q.composite_score DESC,
        q.entity_id DESC
    ) AS final_rank,
    q.result_limit
  FROM quota_filtered q
)

SELECT
  f.entity_type,
  f.entity_id,
  f.url,
  f.display_payload,
  f.rank_score
FROM final f
WHERE f.final_rank <= f.result_limit
ORDER BY f.final_rank;
$function$;

COMMENT ON FUNCTION public.search_global_documents(text, integer, integer, text[], integer[], integer[]) IS
  'Global search FTS. Browse and search are separate branches so GIN is used; AI message boost only when ai_thread is in scope.';

COMMENT ON FUNCTION public.search_global_preview_items(text, integer, text[]) IS
  'Header/preview search: direct FTS on global_search_documents (task-first quotas + recency), excludes project_briefing/team.';
