-- Team settings documents: treat identical single-team from/to filters as OR (involving team).

CREATE OR REPLACE FUNCTION public.fn_documents_team_side_match(
  p_from_team_id integer[],
  p_to_team_id integer[],
  p_row_from integer,
  p_row_to integer
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from_team_id IS NULL AND p_to_team_id IS NULL THEN true
    WHEN p_from_team_id IS NOT NULL
      AND p_to_team_id IS NOT NULL
      AND p_from_team_id = p_to_team_id
      AND cardinality(p_from_team_id) = 1
      THEN (p_row_from = ANY (p_from_team_id) OR p_row_to = ANY (p_to_team_id))
    ELSE
      (p_from_team_id IS NULL OR p_row_from = ANY (p_from_team_id))
      AND (p_to_team_id IS NULL OR p_row_to = ANY (p_to_team_id))
  END;
$$;

COMMENT ON FUNCTION public.fn_documents_team_side_match(integer[], integer[], integer, integer) IS
  'Documents team filter helper. Identical single-element from/to arrays mean involving-team OR.';

DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'fn_documents_list'
  LIMIT 1;

  IF def IS NULL THEN
    RAISE EXCEPTION 'fn_documents_list not found';
  END IF;

  def := regexp_replace(
    def,
    'and \(p_from_team_id is null or ([a-z0-9_\.]+)\s*=\s*any\(p_from_team_id\)\)\s*and \(p_to_team_id\s+is null or ([a-z0-9_\.]+)\s*=\s*any\(p_to_team_id\)\)',
    'and public.fn_documents_team_side_match(p_from_team_id, p_to_team_id, \1, \2)',
    'gi'
  );

  EXECUTE def;
END $$;
