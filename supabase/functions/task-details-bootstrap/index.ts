import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const fullUrl = req.headers.get('x-forwarded-uri') ?? req.url;
    const url = new URL(fullUrl, 'http://localhost');

    let body: Record<string, unknown> = {};
    if (req.method !== 'GET') {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    const taskIdParam =
      url.searchParams.get('task_id') ??
      url.searchParams.get('id') ??
      (typeof body.task_id === 'number' || typeof body.task_id === 'string' ? String(body.task_id) : null) ??
      (typeof body.taskId === 'number' || typeof body.taskId === 'string' ? String(body.taskId) : null) ??
      (typeof body.id === 'number' || typeof body.id === 'string' ? String(body.id) : null);

    if (!taskIdParam) {
      return new Response(JSON.stringify({ error: 'Missing task_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const taskId = Number(taskIdParam);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid task_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const authHeader = req.headers.get('authorization') ?? '';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      },
    );

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        assigned_to_id,
        content_type_id,
        production_type_id,
        language_id,
        project_status_id,
        assigned_to_name,
        project_name,
        project_color,
        project_status_name,
        project_status_color,
        content_type_title,
        production_type_title,
        language_code,
        delivery_date,
        publication_date,
        updated_at,
        project_id_int,
        copy_post,
        briefing,
        notes,
        meta_title,
        meta_description,
        keyword,
        secondary_keywords,
        parent_task_id_int,
        channel_names,
        is_overdue,
        is_publication_overdue,
        avg_seo_score,
        avg_relevance_score,
        avg_grammar_score,
        avg_delays_score,
        global_score,
        source_urls,
        assigned_user:users!fk_tasks_assigned_to_id ( id, full_name, email, photo ),
        project:projects!fk_tasks_project_id ( id, name, color, logo ),
        languages:language_id ( code, long_name )
      `)
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      const status = taskError?.code === 'PGRST116' ? 404 : 500;
      return new Response(JSON.stringify({ error: taskError?.message ?? 'Task not found' }), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const [
      parentTaskResult,
      attachmentsResult,
      taskChannelsResult,
      threadResult,
      subtasksResult,
      projectWatchersResult,
      taskWatchersResult,
      eligibleTaskWatchersResult,
      relatedIdeasResult,
    ] = await Promise.all([
      task.parent_task_id_int
        ? supabase.from('tasks').select('id, title').eq('id', task.parent_task_id_int).maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      supabase
        .from('attachments')
        .select('*')
        .eq('table_name', 'tasks')
        .eq('record_id', String(taskId))
        .order('uploaded_at', { ascending: false }),

      supabase
        .from('task_channels')
        .select('channel_id, channels!inner(id, name)')
        .eq('task_id', taskId),

      supabase
        .from('threads')
        .select('id')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })
        .limit(1),

      task.content_type_id === 39
        ? supabase
            .from('tasks')
            .select(`
              id,
              title,
              content_type_id,
              delivery_date,
              publication_date,
              updated_at,
              assigned_user:users!fk_tasks_assigned_to_id(id, full_name),
              project_statuses:project_statuses!project_status_id(id, name, color),
              content_type_title,
              production_type_title,
              language_code,
              parent_task_id_int
            `)
            .eq('parent_task_id_int', task.id)
            .order('updated_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),

      task.project_id_int
        ? supabase
            .from('project_watchers')
            .select('user_id, users(full_name, auth_user_id, photo)')
            .eq('project_id', task.project_id_int)
        : Promise.resolve({ data: [], error: null }),

      supabase.rpc('list_task_watchers', { p_task_id: taskId }),

      supabase.rpc('list_eligible_task_watchers', { p_task_id: taskId }),

      supabase
        .from('task_related_ideas')
        .select('id, task_id, project_id, title, description, content_type_id, status')
        .eq('task_id', taskId)
        .eq('status', 'proposed')
        .order('created_at', { ascending: false }),
    ]);

    if (parentTaskResult.error) {
      console.error('Error fetching parent task:', parentTaskResult.error.message);
    }
    if (taskChannelsResult.error) {
      console.error('Error fetching task channels:', taskChannelsResult.error.message);
    }
    if (subtasksResult.error) {
      console.error('Error fetching subtasks:', subtasksResult.error.message);
    }
    if (projectWatchersResult.error) {
      console.error('Error fetching project watchers:', projectWatchersResult.error.message);
    }
    if (taskWatchersResult.error) {
      console.error('Error fetching task watchers:', taskWatchersResult.error.message);
    }
    if (eligibleTaskWatchersResult.error) {
      console.error('Error fetching eligible task watchers:', eligibleTaskWatchersResult.error.message);
    }
    if (relatedIdeasResult.error) {
      console.error('Error fetching related ideas:', relatedIdeasResult.error.message);
    }

    const threadId = threadResult.data?.[0]?.id ?? null;

    const [mentionsResult, threadWatchersResult] = await Promise.all([
      threadId
        ? supabase
            .from('mentions')
            .select('*, users:created_by(full_name, email, photo, id)')
            .eq('thread_id', threadId)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),

      threadId
        ? supabase
            .from('thread_watchers')
            .select('thread_id, watcher_id, users:watcher_id(id, full_name, email, photo)')
            .in('thread_id', [threadId])
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (mentionsResult.error) {
      console.error('Error fetching mentions:', mentionsResult.error.message);
    }
    if (threadWatchersResult.error) {
      console.error('Error fetching thread watchers:', threadWatchersResult.error.message);
    }

    const review_data = {
      avg_seo_score: task.avg_seo_score ?? null,
      avg_relevance_score: task.avg_relevance_score ?? null,
      avg_grammar_score: task.avg_grammar_score ?? null,
      avg_delays_score: task.avg_delays_score ?? null,
      global_score: task.global_score ?? null,
      review_count: null,
    };

    return new Response(
      JSON.stringify({
        task,
        parent_task: parentTaskResult.data ?? null,
        attachments: attachmentsResult.data ?? [],
        task_channels: taskChannelsResult.data ?? [],
        thread_id: threadId,
        mentions: mentionsResult.data ?? [],

        // Backward-compatible existing payload
        watchers: threadWatchersResult.data ?? [],

        // New payload for task details edit UI
        task_watchers: taskWatchersResult.data ?? [],
        eligible_task_watchers: eligibleTaskWatchersResult.data ?? [],
        related_ideas: relatedIdeasResult.data ?? [],

        subtasks: subtasksResult.data ?? [],
        project_watchers: projectWatchersResult.data ?? [],
        review_data,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('task-details-bootstrap fatal error:', message);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
