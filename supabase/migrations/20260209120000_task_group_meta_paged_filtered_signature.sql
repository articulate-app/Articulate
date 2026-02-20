-- Fix PGRST202: align public.task_group_meta_paged_filtered with the exact signature
-- PostgREST expects. One function only (no overloads). All params nullable except where noted.
-- Response shape: { "groups": [{ "group_key", "label" }], "next_cursor" } (jsonb).
--
-- After applying: reload PostgREST schema cache (Supabase: Settings -> API -> "Reload schema cache"
-- or redeploy / restart API) so it picks up the function.

-- Drop existing to avoid overload ambiguity (replace with your real body; this is a stub).
create or replace function public.task_group_meta_paged_filtered(
  p_assignee_ids int[] default null,
  p_channels int[] default null,
  p_content_type_ids int[] default null,
  p_cursor jsonb default null,
  p_delivery_date_gte date default null,
  p_delivery_date_lt date default null,
  p_group_by text default null,
  p_group_order text default null,
  p_is_overdue boolean default null,
  p_is_publication_overdue boolean default null,
  p_language_ids int[] default null,
  p_limit int default 20,
  p_production_type_ids int[] default null,
  p_project_ids int[] default null,
  p_publication_date_gte date default null,
  p_publication_date_lt date default null,
  p_q text default null,
  p_status_names text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Stub: replace this body with your real logic (me/scope/allowed_project_rows).
  -- Keep existing gating and return shape: { groups: [{ group_key, label }], next_cursor }.
  return jsonb_build_object(
    'groups', coalesce(
      (select jsonb_agg(g) from (
        select jsonb_build_object('group_key', 'stub', 'label', 'Stub') as g
        where false
      ) s),
      '[]'::jsonb
    ),
    'next_cursor', null
  );
end;
$$;

comment on function public.task_group_meta_paged_filtered is
  'Paged group meta for task list; params must match FE payload exactly to avoid PGRST202. Do not add overloads or change param types without updating the frontend.';
