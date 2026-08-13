-- Re-assert EXECUTE after overload cleanup; match fn_get_project_analytics (PUBLIC).
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
