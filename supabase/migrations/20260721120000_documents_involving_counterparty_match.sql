-- Involving-team + counterparty: from=[account team], to=[other teams]
-- means docs where account is on one side and counterparty on the other.

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
    -- Involving-team OR (identical single-element arrays)
    WHEN p_from_team_id IS NOT NULL
      AND p_to_team_id IS NOT NULL
      AND p_from_team_id = p_to_team_id
      AND cardinality(p_from_team_id) = 1
      THEN (p_row_from = ANY (p_from_team_id) OR p_row_to = ANY (p_to_team_id))
    -- Account team (from) + counterparty list (to): either orientation
    WHEN p_from_team_id IS NOT NULL
      AND p_to_team_id IS NOT NULL
      AND cardinality(p_from_team_id) = 1
      AND p_from_team_id IS DISTINCT FROM p_to_team_id
      THEN (
        (p_row_from = p_from_team_id[1] AND p_row_to = ANY (p_to_team_id))
        OR (p_row_to = p_from_team_id[1] AND p_row_from = ANY (p_to_team_id))
      )
    ELSE
      (p_from_team_id IS NULL OR p_row_from = ANY (p_from_team_id))
      AND (p_to_team_id IS NULL OR p_row_to = ANY (p_to_team_id))
  END;
$$;

COMMENT ON FUNCTION public.fn_documents_team_side_match(integer[], integer[], integer, integer) IS
  'Documents team filter. Identical single from/to = involving OR; distinct single from + to list = account↔counterparty either side.';
