import { createClient as createServerSupabaseClient } from '../supabase/server';

export async function getTaskByIdServer(id: string, supabase: any) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Session error: ${sessionError.message}`);
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id, title, assigned_to_id, project_id_int, content_type_id, production_type_id, language_id, project_status_id,
      assigned_to_name, project_name, project_color, project_status_name, project_status_color,
      content_type_title, production_type_title, language_code,
      meta_title, meta_description, keyword, channel_names, parent_task_id_int,
      copy_post, briefing, notes, created_at, updated_at, delivery_date, publication_date
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Task not found');
  return data;
} 