create or replace function public.ai_current_user_can_access_project_v1(p_project_id integer)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select coalesce(auth.role(), '') = 'service_role'
    or exists (
      select 1
      from public.projects p
      where p.id = p_project_id
        and coalesce(p.is_deleted, false) = false
        and (
          p.created_by = public.current_user_id()
          or exists (
            select 1
            from public.v_user_projects_i_can_see visible
            where visible.project_id = p.id
              and visible.user_id = public.current_user_id()
          )
        )
    );
$function$;

create or replace function public.trg_projects_add_creator_watcher()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.created_by is not null
     and exists (select 1 from public.users u where u.id = new.created_by)
     and not exists (
       select 1
       from public.project_watchers pw
       where pw.project_id = new.id
         and pw.user_id = new.created_by
         and coalesce(pw.is_deleted, false) = false
     ) then
    insert into public.project_watchers (project_id, user_id, is_deleted)
    values (new.id, new.created_by, false);
  end if;
  return new;
end;
$function$;

revoke all on function public.trg_projects_add_creator_watcher() from public;
revoke all on function public.trg_projects_add_creator_watcher() from anon;
revoke all on function public.trg_projects_add_creator_watcher() from authenticated;

drop trigger if exists trg_projects_add_creator_watcher on public.projects;
create trigger trg_projects_add_creator_watcher
after insert on public.projects
for each row
execute function public.trg_projects_add_creator_watcher();

insert into public.project_watchers (project_id, user_id, is_deleted)
select p.id, p.created_by, false
from public.projects p
join public.users u on u.id = p.created_by
where coalesce(p.is_deleted, false) = false
  and p.created_by is not null
  and not exists (
    select 1
    from public.project_watchers pw
    where pw.project_id = p.id
      and pw.user_id = p.created_by
      and coalesce(pw.is_deleted, false) = false
  );
