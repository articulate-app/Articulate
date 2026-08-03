-- Allow users to read/write their own prompt research history.

ALTER TABLE public.prompt_search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own prompt history" ON public.prompt_search_history;
CREATE POLICY "read own prompt history"
  ON public.prompt_search_history
  FOR SELECT
  USING (searched_by = public.current_user_id());

DROP POLICY IF EXISTS "insert own prompt history" ON public.prompt_search_history;
CREATE POLICY "insert own prompt history"
  ON public.prompt_search_history
  FOR INSERT
  WITH CHECK (searched_by = public.current_user_id());

GRANT SELECT, INSERT ON public.prompt_search_history TO authenticated;
GRANT ALL ON public.prompt_search_history TO service_role;
