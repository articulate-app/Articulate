-- Apply involving-team OR semantics to summary cards and group totals
-- (same helper as fn_documents_list: identical single-element from/to arrays).

DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'fn_documents_summary_cards'
  LIMIT 1;

  IF def IS NOT NULL THEN
    def := regexp_replace(
      def,
      'and \(p_from_team_id is null or ([a-z0-9_\.]+)\s*=\s*any\(p_from_team_id\)\)\s*and \(p_to_team_id\s+is null or ([a-z0-9_\.]+)\s*=\s*any\(p_to_team_id\)\)',
      'and public.fn_documents_team_side_match(p_from_team_id, p_to_team_id, \1, \2)',
      'gi'
    );
    def := regexp_replace(
      def,
      '\(p_from_team_id is null or ([a-z0-9_\.]+)\s*=\s*any\(p_from_team_id\)\)\s*and \(p_to_team_id\s+is null or ([a-z0-9_\.]+)\s*=\s*any\(p_to_team_id\)\)',
      'public.fn_documents_team_side_match(p_from_team_id, p_to_team_id, \1, \2)',
      'gi'
    );
    EXECUTE def;
  END IF;
END $$;

DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_document_group_totals'
  LIMIT 1;

  IF def IS NOT NULL THEN
    def := regexp_replace(
      def,
      'and \(p_from_team_ids is null or ([a-z0-9_\.]+)\s*=\s*any\(p_from_team_ids\)\)\s*and \(p_to_team_ids\s+is null or ([a-z0-9_\.]+)\s*=\s*any\(p_to_team_ids\)\)',
      'and public.fn_documents_team_side_match(p_from_team_ids, p_to_team_ids, \1, \2)',
      'gi'
    );
    def := regexp_replace(
      def,
      '\(p_from_team_ids is null or ([a-z0-9_\.]+)\s*=\s*any\(p_from_team_ids\)\)\s*and \(p_to_team_ids\s+is null or ([a-z0-9_\.]+)\s*=\s*any\(p_to_team_ids\)\)',
      'public.fn_documents_team_side_match(p_from_team_ids, p_to_team_ids, \1, \2)',
      'gi'
    );
    EXECUTE def;
  END IF;
END $$;
