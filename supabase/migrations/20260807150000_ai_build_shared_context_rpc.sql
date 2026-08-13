-- The chat model writes user-mandated facts into the build plan's shared_context,
-- but the artifact worker's generation-context RPC never returned it, so builds
-- ignored user-provided information. Expose it behind the unit lease.
create or replace function public.ai_get_build_shared_context_v1(
  p_build_id uuid,
  p_unit_id uuid,
  p_lease_token uuid
)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select case
    when exists (
      select 1
      from public.ai_build_work_units u
      where u.id = p_unit_id
        and u.build_id = p_build_id
        and u.lease_token = p_lease_token
    )
    then jsonb_build_object(
      'ok', true,
      'shared_context', (
        select nullif(b.plan->>'shared_context', '')
        from public.ai_build_jobs b
        where b.id = p_build_id
      )
    )
    else jsonb_build_object('ok', false, 'error', 'lease_invalid')
  end;
$$;

revoke all on function public.ai_get_build_shared_context_v1(uuid, uuid, uuid) from public;
grant execute on function public.ai_get_build_shared_context_v1(uuid, uuid, uuid) to authenticated, service_role;
