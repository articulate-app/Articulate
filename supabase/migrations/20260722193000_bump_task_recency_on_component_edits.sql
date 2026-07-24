-- Bump task sidebar recency when briefing fields or output content are edited.
-- Uses track_global_object_open so list_home_recent_tasks (my_opens) picks it up.

CREATE OR REPLACE FUNCTION public.tcc_set_component(
  p_task_id integer,
  p_channel_id integer,
  p_task_component_id uuid,
  p_briefing_component_id integer,
  p_project_component_id integer,
  p_selected boolean,
  p_position integer,
  p_custom_title text,
  p_custom_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_id uuid;
begin
  -- CASE A: Update existing row
  if p_task_component_id is not null then
    update public.task_channel_components
    set selected = p_selected,
        position = coalesce(p_position, position),
        custom_title = p_custom_title,
        custom_description = p_custom_description
    where id = p_task_component_id
    returning id into v_id;

    if v_id is not null and p_task_id is not null then
      perform public.track_global_object_open('task', p_task_id::text);
    end if;

    return v_id;
  end if;

  -- CASE B1: GLOBAL component
  if p_briefing_component_id is not null then
    insert into public.task_channel_components(
      task_id, channel_id,
      briefing_component_id, project_component_id,
      selected, position,
      custom_title, custom_description
    )
    values (
      p_task_id, p_channel_id,
      p_briefing_component_id, null,
      p_selected, p_position,
      p_custom_title, p_custom_description
    )
    on conflict (task_id, channel_id, briefing_component_id)
      where briefing_component_id is not null
    do update set
      selected = excluded.selected,
      position = coalesce(excluded.position, task_channel_components.position),
      custom_title = excluded.custom_title,
      custom_description = excluded.custom_description
    returning id into v_id;

    if v_id is not null and p_task_id is not null then
      perform public.track_global_object_open('task', p_task_id::text);
    end if;

    return v_id;
  end if;

  -- CASE B2: PROJECT component
  if p_project_component_id is not null then
    insert into public.task_channel_components(
      task_id, channel_id,
      briefing_component_id, project_component_id,
      selected, position,
      custom_title, custom_description
    )
    values (
      p_task_id, p_channel_id,
      null, p_project_component_id,
      p_selected, p_position,
      p_custom_title, p_custom_description
    )
    on conflict (task_id, channel_id, project_component_id)
      where project_component_id is not null
    do update set
      selected = excluded.selected,
      position = coalesce(excluded.position, task_channel_components.position),
      custom_title = excluded.custom_title,
      custom_description = excluded.custom_description
    returning id into v_id;

    if v_id is not null and p_task_id is not null then
      perform public.track_global_object_open('task', p_task_id::text);
    end if;

    return v_id;
  end if;

  -- CASE C: ad-hoc
  insert into public.task_channel_components(
    task_id, channel_id,
    briefing_component_id, project_component_id,
    selected, position,
    custom_title, custom_description
  )
  values (
    p_task_id, p_channel_id,
    null, null,
    p_selected, p_position,
    p_custom_title, p_custom_description
  )
  returning id into v_id;

  if v_id is not null and p_task_id is not null then
    perform public.track_global_object_open('task', p_task_id::text);
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_task_component_output_content(
  p_output_id uuid,
  p_content_text text,
  p_content_json jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_task_id integer;
begin
  if p_output_id is null then
    raise exception 'p_output_id is required';
  end if;

  update public.task_component_outputs
  set
    content_text = p_content_text,
    content_json = coalesce(p_content_json, '[]'::jsonb),
    updated_at = now()
  where id = p_output_id
  returning task_id into v_task_id;

  if not found then
    raise exception 'task_component_output not found';
  end if;

  if v_task_id is not null then
    perform public.track_global_object_open('task', v_task_id::text);
  end if;
end;
$function$;
