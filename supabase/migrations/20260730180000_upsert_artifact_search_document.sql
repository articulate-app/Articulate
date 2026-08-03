-- Index artifacts into global_search_documents + discovery section for left-pane list.

ALTER TABLE public.global_search_documents
  DROP CONSTRAINT IF EXISTS global_search_documents_entity_type_chk;

ALTER TABLE public.global_search_documents
  ADD CONSTRAINT global_search_documents_entity_type_chk
  CHECK (entity_type = ANY (ARRAY[
    'task'::text,
    'project'::text,
    'user'::text,
    'mention'::text,
    'team'::text,
    'project_briefing'::text,
    'ai_thread'::text,
    'artifact'::text
  ]));

CREATE OR REPLACE FUNCTION public.upsert_artifact_search_document(p_artifact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row record;
  v_title text;
  v_subtitle text;
  v_preview text;
  v_search_text text;
  v_visibility_scope text;
  v_is_archived boolean;
BEGIN
  SELECT
    a.id,
    a.task_id,
    a.project_id,
    a.ai_thread_id,
    a.artifact_type,
    a.title,
    a.status,
    a.content_text,
    a.created_by,
    a.created_at,
    a.updated_at
  INTO v_row
  FROM public.artifacts a
  WHERE a.id = p_artifact_id;

  IF NOT FOUND THEN
    PERFORM public.delete_global_search_document('artifact', p_artifact_id::text);
    RETURN;
  END IF;

  v_is_archived := lower(coalesce(v_row.status, '')) = 'archived';
  IF v_is_archived THEN
    PERFORM public.delete_global_search_document('artifact', p_artifact_id::text);
    RETURN;
  END IF;

  v_title := coalesce(nullif(trim(v_row.title), ''), 'Untitled artifact');
  v_subtitle := coalesce(nullif(trim(v_row.artifact_type), ''), 'Artifact');
  v_preview := left(coalesce(v_row.content_text, ''), 280);
  v_search_text := concat_ws(' ', v_row.title, v_row.artifact_type, v_row.content_text, v_row.status);

  IF v_row.task_id IS NOT NULL THEN
    v_visibility_scope := 'project_or_assigned';
  ELSIF v_row.project_id IS NOT NULL THEN
    v_visibility_scope := 'project';
  ELSE
    v_visibility_scope := 'private';
  END IF;

  PERFORM public.upsert_global_search_document(
    p_entity_type         => 'artifact'::text,
    p_entity_id           => p_artifact_id::text,
    p_title               => v_title,
    p_subtitle            => v_subtitle,
    p_preview             => v_preview,
    p_url                 => '/artifacts/' || p_artifact_id::text,
    p_icon                => 'artifact'::text,
    p_search_text         => v_search_text,
    p_project_id          => v_row.project_id,
    p_team_id             => null::integer,
    p_task_id             => v_row.task_id,
    p_thread_id           => null::integer,
    p_ai_thread_id        => v_row.ai_thread_id,
    p_user_id             => v_row.created_by,
    p_owner_user_id       => v_row.created_by,
    p_team_scope_id       => null::integer,
    p_visibility_scope    => v_visibility_scope,
    p_assigned_user_id    => null::integer,
    p_created_by_user_id  => v_row.created_by,
    p_created_at          => v_row.created_at,
    p_updated_at          => v_row.updated_at,
    p_last_interaction_at => v_row.updated_at,
    p_is_deleted          => false,
    p_is_active           => true,
    p_is_private          => v_visibility_scope = 'private',
    p_is_pinned           => false,
    p_is_starred          => false,
    p_is_archived         => false,
    p_rank_boost          => 0,
    p_facet_payload       => jsonb_build_object(
      'artifact', jsonb_build_object(
        'artifact_id', v_row.id,
        'artifact_type', v_row.artifact_type,
        'status', v_row.status,
        'task_id', v_row.task_id,
        'project_id', v_row.project_id,
        'ai_thread_id', v_row.ai_thread_id
      )
    ),
    p_result_payload      => '{}'::jsonb,
    p_display_payload     => jsonb_build_object(
      'title', v_title,
      'subtitle', v_subtitle,
      'preview', v_preview,
      'meta', jsonb_build_array(
        jsonb_build_object('label', 'Type', 'value', v_subtitle),
        jsonb_build_object('label', 'Updated', 'value', to_char(v_row.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
      )
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_artifacts_search_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.delete_global_search_document('artifact', OLD.id::text);
    RETURN OLD;
  END IF;
  PERFORM public.upsert_artifact_search_document(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_artifacts_search ON public.artifacts;
CREATE TRIGGER trg_artifacts_search
AFTER INSERT OR UPDATE OR DELETE ON public.artifacts
FOR EACH ROW
EXECUTE FUNCTION public.trg_artifacts_search_sync();

-- Backfill existing artifacts into the search index.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id
    FROM public.artifacts
    WHERE lower(coalesce(status, '')) <> 'archived'
  LOOP
    PERFORM public.upsert_artifact_search_document(r.id);
  END LOOP;
END $$;

-- Discovery: include an artifacts section so empty-query left-pane lists populate.
CREATE OR REPLACE FUNCTION public.search_global_discovery_sections_v2(
  p_limit_per_type integer DEFAULT 10,
  p_entity_types text[] DEFAULT NULL::text[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
with recently_opened_docs as (
  select
    g.entity_type,
    g.entity_id,
    g.url,
    g.display_payload,
    g.ai_thread_id,
    h.opened_at
  from (
    select distinct on (entity_type, entity_id)
      entity_type,
      entity_id,
      opened_at
    from public.global_object_open_history
    where opened_by = current_user_id()
      and (p_entity_types is null or entity_type = any(p_entity_types))
    order by entity_type, entity_id, opened_at desc
  ) h
  join public.global_search_documents g
    on g.entity_type = h.entity_type
   and g.entity_id = h.entity_id
  where g.is_deleted = false
    and g.is_active = true
  order by h.opened_at desc
  limit p_limit_per_type
),

ai_threads_docs as (
  select entity_type, entity_id, display_payload, sort_at, ai_thread_id
  from public.global_search_documents
  where entity_type = 'ai_thread'
    and is_deleted = false
    and is_active = true
    and owner_user_id = current_user_id()
    and (p_entity_types is null or entity_type = any(p_entity_types))
  order by sort_at desc, entity_id desc
  limit 7
),

artifacts_docs as (
  select entity_type, entity_id, url, display_payload, sort_at
  from public.global_search_documents
  where entity_type = 'artifact'
    and is_deleted = false
    and is_active = true
    and (p_entity_types is null or entity_type = any(p_entity_types))
  order by sort_at desc, entity_id desc
  limit p_limit_per_type
),

tasks_assigned_docs as (
  select entity_type, entity_id, url, display_payload, sort_at
  from public.global_search_documents
  where entity_type = 'task'
    and is_deleted = false
    and is_active = true
    and assigned_user_id = current_user_id()
    and (p_entity_types is null or entity_type = any(p_entity_types))
  order by sort_at desc, entity_id desc
  limit p_limit_per_type
),

tasks_upcoming_delivery_docs as (
  select entity_type, entity_id, url, display_payload, delivery_date
  from public.global_search_documents
  where entity_type = 'task'
    and is_deleted = false
    and is_active = true
    and delivery_date >= current_date
    and (p_entity_types is null or entity_type = any(p_entity_types))
  order by delivery_date asc, entity_id desc
  limit p_limit_per_type
),

tasks_upcoming_publication_docs as (
  select entity_type, entity_id, url, display_payload, publication_date
  from public.global_search_documents
  where entity_type = 'task'
    and is_deleted = false
    and is_active = true
    and publication_date >= current_date
    and (p_entity_types is null or entity_type = any(p_entity_types))
  order by publication_date asc, entity_id desc
  limit p_limit_per_type
),

tasks_overdue_delivery_docs as (
  select entity_type, entity_id, url, display_payload, delivery_date
  from public.global_search_documents
  where entity_type = 'task'
    and is_deleted = false
    and is_active = true
    and is_overdue = true
    and (p_entity_types is null or entity_type = any(p_entity_types))
  order by delivery_date asc nulls last, entity_id desc
  limit p_limit_per_type
),

tasks_overdue_publication_docs as (
  select entity_type, entity_id, url, display_payload, publication_date
  from public.global_search_documents
  where entity_type = 'task'
    and is_deleted = false
    and is_active = true
    and is_publication_overdue = true
    and (p_entity_types is null or entity_type = any(p_entity_types))
  order by publication_date asc nulls last, entity_id desc
  limit p_limit_per_type
),

projects_docs as (
  select entity_type, entity_id, url, display_payload, sort_at
  from public.global_search_documents
  where entity_type = 'project'
    and is_deleted = false
    and is_active = true
    and (p_entity_types is null or entity_type = any(p_entity_types))
  order by sort_at desc, entity_id desc
  limit p_limit_per_type
),

mentions_docs as (
  select entity_type, entity_id, url, display_payload, sort_at
  from public.global_search_documents
  where entity_type = 'mention'
    and is_deleted = false
    and is_active = true
    and (p_entity_types is null or entity_type = any(p_entity_types))
  order by sort_at desc, entity_id desc
  limit p_limit_per_type
),

users_docs as (
  select entity_type, entity_id, url, display_payload, sort_at
  from public.global_search_documents
  where entity_type = 'user'
    and is_deleted = false
    and is_active = true
    and (p_entity_types is null or entity_type = any(p_entity_types))
  order by sort_at desc, entity_id desc
  limit p_limit_per_type
),

teams_docs as (
  select entity_type, entity_id, url, display_payload, sort_at
  from public.global_search_documents
  where entity_type = 'team'
    and is_deleted = false
    and is_active = true
    and (p_entity_types is null or entity_type = any(p_entity_types))
  order by sort_at desc, entity_id desc
  limit p_limit_per_type
)

select jsonb_build_object(
  'sections',
  jsonb_build_array(
    jsonb_build_object(
      'type','recently_opened',
      'label','Recently opened',
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'entity_type', entity_type,
          'entity_id', entity_id,
          'url', url,
          'ai_thread_id', ai_thread_id,
          'opened_at', opened_at,
          'display_payload', display_payload
        ) order by opened_at desc)
        from recently_opened_docs
      ), '[]'::jsonb)
    ),

    jsonb_build_object(
      'type','ai_threads',
      'label','Recent chats',
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'entity_type','ai_thread',
          'entity_id',entity_id,
          'ai_thread_id', ai_thread_id,
          'display_payload',display_payload
        ) order by sort_at desc, entity_id desc)
        from ai_threads_docs
      ), '[]'::jsonb)
    ),

    jsonb_build_object(
      'type','artifact',
      'label','Artifacts',
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'entity_type','artifact',
          'entity_id',entity_id,
          'url',url,
          'display_payload',display_payload
        ) order by sort_at desc, entity_id desc)
        from artifacts_docs
      ), '[]'::jsonb)
    ),

    jsonb_build_object(
      'type','task_group',
      'label','Tasks',
      'sections', jsonb_build_array(
        jsonb_build_object(
          'type','tasks_assigned_to_me',
          'label','Assigned to me',
          'items', coalesce((
            select jsonb_agg(jsonb_build_object(
              'entity_type','task',
              'entity_id',entity_id,
              'url',url,
              'display_payload',display_payload
            ) order by sort_at desc, entity_id desc)
            from tasks_assigned_docs
          ), '[]'::jsonb)
        ),
        jsonb_build_object(
          'type','tasks_upcoming_delivery',
          'label','Upcoming deliveries',
          'items', coalesce((
            select jsonb_agg(jsonb_build_object(
              'entity_type','task',
              'entity_id',entity_id,
              'url',url,
              'display_payload',display_payload
            ) order by delivery_date asc, entity_id desc)
            from tasks_upcoming_delivery_docs
          ), '[]'::jsonb)
        ),
        jsonb_build_object(
          'type','tasks_upcoming_publication',
          'label','Upcoming publications',
          'items', coalesce((
            select jsonb_agg(jsonb_build_object(
              'entity_type','task',
              'entity_id',entity_id,
              'url',url,
              'display_payload',display_payload
            ) order by publication_date asc, entity_id desc)
            from tasks_upcoming_publication_docs
          ), '[]'::jsonb)
        ),
        jsonb_build_object(
          'type','tasks_overdue_delivery',
          'label','Overdue deliveries',
          'items', coalesce((
            select jsonb_agg(jsonb_build_object(
              'entity_type','task',
              'entity_id',entity_id,
              'url',url,
              'display_payload',display_payload
            ) order by delivery_date asc nulls last, entity_id desc)
            from tasks_overdue_delivery_docs
          ), '[]'::jsonb)
        ),
        jsonb_build_object(
          'type','tasks_overdue_publication',
          'label','Overdue publications',
          'items', coalesce((
            select jsonb_agg(jsonb_build_object(
              'entity_type','task',
              'entity_id',entity_id,
              'url',url,
              'display_payload',display_payload
            ) order by publication_date asc nulls last, entity_id desc)
            from tasks_overdue_publication_docs
          ), '[]'::jsonb)
        )
      )
    ),

    jsonb_build_object(
      'type','project',
      'label','Projects',
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'entity_type','project',
          'entity_id',entity_id,
          'url',url,
          'display_payload',display_payload
        ) order by sort_at desc, entity_id desc)
        from projects_docs
      ), '[]'::jsonb)
    ),

    jsonb_build_object(
      'type','mention',
      'label','Mentions',
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'entity_type','mention',
          'entity_id',entity_id,
          'url',url,
          'display_payload',display_payload
        ) order by sort_at desc, entity_id desc)
        from mentions_docs
      ), '[]'::jsonb)
    ),

    jsonb_build_object(
      'type','user',
      'label','Users',
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'entity_type','user',
          'entity_id',entity_id,
          'url',url,
          'display_payload',display_payload
        ) order by sort_at desc, entity_id desc)
        from users_docs
      ), '[]'::jsonb)
    ),

    jsonb_build_object(
      'type','team',
      'label','Teams',
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'entity_type','team',
          'entity_id',entity_id,
          'url',url,
          'display_payload',display_payload
        ) order by sort_at desc, entity_id desc)
        from teams_docs
      ), '[]'::jsonb)
    )
  )
);
$function$;

CREATE OR REPLACE FUNCTION public.search_global_discovery_counts(p_entity_types text[] DEFAULT NULL::text[])
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
select jsonb_build_object(
  'ai_thread', (
    select count(*)
    from public.global_search_documents
    where entity_type = 'ai_thread'
      and is_deleted = false
      and is_active = true
      and owner_user_id = current_user_id()
      and (p_entity_types is null or entity_type = any(p_entity_types))
  ),
  'artifact', (
    select count(*)
    from public.global_search_documents
    where entity_type = 'artifact'
      and is_deleted = false
      and is_active = true
      and (p_entity_types is null or entity_type = any(p_entity_types))
  ),
  'task', (
    select count(*)
    from public.global_search_documents
    where entity_type = 'task'
      and is_deleted = false
      and is_active = true
      and (p_entity_types is null or entity_type = any(p_entity_types))
  ),
  'project', (
    select count(*)
    from public.global_search_documents
    where entity_type = 'project'
      and is_deleted = false
      and is_active = true
      and (p_entity_types is null or entity_type = any(p_entity_types))
  ),
  'mention', (
    select count(*)
    from public.global_search_documents
    where entity_type = 'mention'
      and is_deleted = false
      and is_active = true
      and (p_entity_types is null or entity_type = any(p_entity_types))
  ),
  'user', (
    select count(*)
    from public.global_search_documents
    where entity_type = 'user'
      and is_deleted = false
      and is_active = true
      and (p_entity_types is null or entity_type = any(p_entity_types))
  ),
  'team', (
    select count(*)
    from public.global_search_documents
    where entity_type = 'team'
      and is_deleted = false
      and is_active = true
      and (p_entity_types is null or entity_type = any(p_entity_types))
  )
);
$function$;
