// File: task-edit-fields.ts
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  const authHeader = req.headers.get('Authorization');
  const accessToken = authHeader?.replace('Bearer ', '');
  if (!accessToken) {
    return new Response(JSON.stringify({
      error: 'Missing access token',
    }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    },
  );

  try {
    const [
      statusesRes,
      watchersRes,
      contentTypesRes,
      prodTypesRes,
      languagesRes,
      channelsRes,
      costsRes,
      projectsRes,
    ] = await Promise.all([
      supabase
        .from('project_statuses')
        .select('id, name, color, order_priority, project_id, is_closed, is_publication_closed'),
      supabase
        .from('project_watchers')
        .select('project_id, user_id, users(id, full_name, email, photo)'),
      supabase.from('content_types').select('id, title').order('title'),
      supabase.from('production_types').select('id, title').order('title'),
      supabase.from('languages').select('id, code, long_name').order('long_name'),
      supabase.from('channels').select('id, name').order('name'),
      supabase
        .from('costs')
        .select('user_id, content_type_id, production_type_id, language_id')
        .eq('is_deleted', false),
      // Include logo so task details / lists can render project identity by default.
      supabase
        .from('projects')
        .select('id, name, color, logo')
        .eq('active', true)
        .order('name'),
    ]);

    const error =
      statusesRes.error ||
      watchersRes.error ||
      contentTypesRes.error ||
      prodTypesRes.error ||
      languagesRes.error ||
      channelsRes.error ||
      costsRes.error ||
      projectsRes.error;
    if (error) {
      throw new Error(error.message);
    }

    return new Response(
      JSON.stringify({
        project_statuses: statusesRes.data,
        project_watchers: watchersRes.data,
        content_types: contentTypesRes.data,
        production_types: prodTypesRes.data,
        languages: languagesRes.data,
        channels: channelsRes.data,
        costs: costsRes.data,
        projects: projectsRes.data,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
        status: 200,
      },
    );
  } catch (err) {
    console.error('❌ Fetch error:', (err as Error).message);
    return new Response(
      JSON.stringify({
        error: (err as Error).message,
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
});
