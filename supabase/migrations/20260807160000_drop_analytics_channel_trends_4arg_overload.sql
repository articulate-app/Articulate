-- PostgREST cannot choose between 4-arg and 5-arg overloads when the 5th
-- parameter has a default. Keep only the compare-mode signature.

drop function if exists public.fn_get_project_analytics_channel_trends(
  integer, text, date, date
);

grant execute on function public.fn_get_project_analytics_channel_trends(
  integer, text, date, date, text
) to public;

grant execute on function public.fn_get_project_analytics_channel_trends(
  integer, text, date, date, text
) to authenticated;

grant execute on function public.fn_get_project_analytics_channel_trends(
  integer, text, date, date, text
) to anon;

grant execute on function public.fn_get_project_analytics_channel_trends(
  integer, text, date, date, text
) to service_role;

notify pgrst, 'reload schema';
