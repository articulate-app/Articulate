-- Exclude users who only hold Supplier (4) / Governmental (5) roles from the
-- user directory index. Discovery/search stay on global_search_documents — no
-- heavier list query; membership check runs only on upsert / role changes.

CREATE OR REPLACE FUNCTION public.upsert_global_search_user(p_user_id integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_row public.users%rowtype;
  v_display_payload jsonb;
  v_only_supplier_or_gov boolean;
begin
  select *
  into v_row
  from public.users
  where id = p_user_id;

  if not found then
    perform public.delete_global_search_document('user'::text, p_user_id::text);
    return;
  end if;

  -- Hide when the user belongs to ≥1 team and every membership is role 4 or 5.
  select
    exists (select 1 from public.teams_users tu where tu.user_id = p_user_id)
    and not exists (
      select 1
      from public.teams_users tu
      where tu.user_id = p_user_id
        and tu.role_id not in (4, 5)
    )
  into v_only_supplier_or_gov;

  if coalesce(v_only_supplier_or_gov, false) then
    perform public.delete_global_search_document('user'::text, p_user_id::text);
    return;
  end if;

  v_display_payload := jsonb_build_object(
    'title', coalesce(v_row.full_name, v_row.email, 'Unknown user'),
    'subtitle', v_row.email,
    'left', jsonb_build_object(
      'type', 'user',
      'photo', v_row.photo
    )
  );

  perform public.upsert_global_search_document(
    p_entity_type              => 'user'::text,
    p_entity_id                => v_row.id::text,
    p_title                    => coalesce(v_row.full_name, v_row.email, 'Unknown user'),
    p_subtitle                 => v_row.email,
    p_preview                  => v_row.brand,
    p_url                      => ('/users/' || v_row.id)::text,
    p_icon                     => 'user'::text,
    p_search_text              => concat_ws(' ', v_row.full_name, v_row.email, v_row.brand, v_row.phone),

    p_project_id               => null::integer,
    p_team_id                  => null::integer,
    p_task_id                  => null::integer,
    p_thread_id                => null::integer,
    p_ai_thread_id             => null::uuid,

    p_user_id                  => v_row.id,
    p_owner_user_id            => v_row.id,
    p_team_scope_id            => null::integer,
    p_visibility_scope         => 'user_directory'::text,
    p_assigned_user_id         => null::integer,
    p_created_by_user_id       => null::integer,

    p_created_at               => v_row.created_at::timestamptz,
    p_updated_at               => coalesce(v_row.updated_at, v_row.created_at)::timestamptz,
    p_last_interaction_at      => coalesce(v_row.updated_at, v_row.created_at)::timestamptz,

    p_is_deleted               => coalesce(v_row.is_deleted, false),
    p_is_active                => coalesce(v_row.active, true) and not coalesce(v_row.is_deleted, false),
    p_is_private               => false,
    p_is_pinned                => false,
    p_is_starred               => false,
    p_is_archived              => not coalesce(v_row.active, true),

    p_rank_boost               => 0::integer,
    p_facet_payload            => '{}'::jsonb,
    p_result_payload           => '{}'::jsonb,
    p_display_payload          => v_display_payload,

    p_delivery_date            => null::date,
    p_publication_date         => null::date,
    p_is_overdue               => null::boolean,
    p_is_publication_overdue   => null::boolean
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_refresh_user_search_from_team_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user_id integer;
BEGIN
  v_user_id := coalesce(NEW.user_id, OLD.user_id);
  IF v_user_id IS NOT NULL THEN
    PERFORM public.upsert_global_search_user(v_user_id);
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_teams_users_refresh_user_search_ins ON public.teams_users;
DROP TRIGGER IF EXISTS trg_teams_users_refresh_user_search_upd ON public.teams_users;
DROP TRIGGER IF EXISTS trg_teams_users_refresh_user_search_del ON public.teams_users;

CREATE TRIGGER trg_teams_users_refresh_user_search_ins
  AFTER INSERT ON public.teams_users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_user_search_from_team_member();

CREATE TRIGGER trg_teams_users_refresh_user_search_upd
  AFTER UPDATE OF user_id, role_id ON public.teams_users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_user_search_from_team_member();

CREATE TRIGGER trg_teams_users_refresh_user_search_del
  AFTER DELETE ON public.teams_users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_user_search_from_team_member();

-- One-time cleanup of already-indexed supplier/gov-only users.
DELETE FROM public.global_search_documents g
WHERE g.entity_type = 'user'
  AND exists (
    select 1 from public.teams_users tu where tu.user_id::text = g.entity_id
  )
  AND not exists (
    select 1
    from public.teams_users tu
    where tu.user_id::text = g.entity_id
      and tu.role_id not in (4, 5)
  );
