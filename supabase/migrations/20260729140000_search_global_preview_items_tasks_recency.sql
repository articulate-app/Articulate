-- Preview search: prefer tasks, boost recently opened objects, exclude briefings/teams.
-- Keeps the same return signature used by the app client.

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
WITH params AS (
  SELECT
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
my_opens AS (
  SELECT DISTINCT ON (h.entity_type, h.entity_id)
    h.entity_type,
    h.entity_id,
    h.opened_at
  FROM public.global_object_open_history h
  WHERE h.opened_by = public.current_user_id()
  ORDER BY h.entity_type, h.entity_id, h.opened_at DESC
),
candidates AS (
  SELECT
    s.entity_type,
    s.entity_id,
    s.url,
    s.display_payload,
    coalesce(s.rank_score, 0)::double precision AS fts_score,
    o.opened_at,
    (
      coalesce(s.rank_score, 0)
      + CASE
          WHEN o.opened_at IS NULL THEN 0
          ELSE 1000 + extract(epoch FROM o.opened_at) / 100000.0
        END
      + CASE s.entity_type WHEN 'task' THEN 50 ELSE 0 END
    )::double precision AS composite_score
  FROM public.search_global_documents(
    p_query := p_query,
    p_limit := 120,
    p_offset := 0,
    p_entity_types := (SELECT entity_types FROM params),
    p_team_ids := NULL::integer[],
    p_project_ids := NULL::integer[]
  ) s
  LEFT JOIN my_opens o
    ON o.entity_type = s.entity_type
   AND o.entity_id = s.entity_id
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
    (SELECT result_limit FROM params) AS result_limit
  FROM by_type b
  WHERE
    (
      b.entity_type = 'task'
      AND b.type_rank <= greatest(4, (SELECT result_limit FROM params) - 3)
    )
    OR (
      b.entity_type <> 'task'
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
        -- Tasks first in the dropdown
        CASE q.entity_type WHEN 'task' THEN 0 ELSE 1 END,
        -- Then recently opened / interacted
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

COMMENT ON FUNCTION public.search_global_preview_items(text, integer, text[]) IS
  'Header/preview search: task quotas, recency boost from global_object_open_history, excludes project_briefing/team.';
