-- Fix search_history_recent: DISTINCT ON + ORDER BY term + LIMIT returned an
-- alphabetical slice of unique terms, not the most recently searched ones.
CREATE OR REPLACE FUNCTION public.search_history_recent(p_limit integer DEFAULT 7)
RETURNS TABLE(term text, searched_at timestamp with time zone)
LANGUAGE sql
STABLE
AS $function$
  WITH latest_per_term AS (
    SELECT DISTINCT ON (lower(ksh.term))
      ksh.term,
      ksh.searched_at
    FROM public.keyword_search_history ksh
    WHERE ksh.searched_by = current_user_id()
    ORDER BY lower(ksh.term), ksh.searched_at DESC
  )
  SELECT
    latest_per_term.term,
    latest_per_term.searched_at
  FROM latest_per_term
  ORDER BY latest_per_term.searched_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 7), 50));
$function$;

COMMENT ON FUNCTION public.search_history_recent(integer) IS
  'Returns the most recently searched unique terms for the current user, ordered by searched_at desc.';
