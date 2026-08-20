-- Chat tools called ai_get_artifact_build_v1 / ai_cancel_artifact_build_v1,
-- but only the orchestrated aliases existed. Wrap them so status/cancel work.

create or replace function public.ai_get_artifact_build_v1(
  p_build_id uuid,
  p_after_sequence integer default 0,
  p_event_limit integer default 500
)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select public.ai_get_orchestrated_build_v1(
    p_build_id,
    coalesce(p_after_sequence, 0),
    coalesce(p_event_limit, 500)
  );
$$;

create or replace function public.ai_cancel_artifact_build_v1(
  p_build_id uuid,
  p_reason text default null
)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select public.ai_cancel_orchestrated_build_v1(p_build_id, p_reason);
$$;

revoke all on function public.ai_get_artifact_build_v1(uuid, integer, integer) from public;
grant execute on function public.ai_get_artifact_build_v1(uuid, integer, integer) to authenticated;
grant execute on function public.ai_get_artifact_build_v1(uuid, integer, integer) to service_role;

revoke all on function public.ai_cancel_artifact_build_v1(uuid, text) from public;
grant execute on function public.ai_cancel_artifact_build_v1(uuid, text) to authenticated;
grant execute on function public.ai_cancel_artifact_build_v1(uuid, text) to service_role;
