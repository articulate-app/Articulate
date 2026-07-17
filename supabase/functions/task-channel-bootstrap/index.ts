import { serve } from 'https://deno.land/std@0.192.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

type RequestBody = {
  task_id?: number | string
  taskId?: number | string
  channel_id?: number | string
  channelId?: number | string
  id?: number | string
}

type ErrorEntry = {
  key: string
  message: string
}

function parseInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isInteger(n) ? n : null
}

async function readJsonBody(req: Request): Promise<RequestBody> {
  try {
    const text = await req.text()
    if (!text) return {}
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function buildErrorResponse(status: number, error: string, details: ErrorEntry[]) {
  return new Response(JSON.stringify({ error, details }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const fullUrl = req.headers.get('x-forwarded-uri') ?? req.url
    const url = new URL(fullUrl, 'http://localhost')
    const body = req.method === 'POST' ? await readJsonBody(req) : {}

    const taskId =
      parseInteger(url.searchParams.get('task_id')) ??
      parseInteger(url.searchParams.get('taskId')) ??
      parseInteger(body.task_id) ??
      parseInteger(body.taskId) ??
      parseInteger(body.id)

    const channelId =
      parseInteger(url.searchParams.get('channel_id')) ??
      parseInteger(url.searchParams.get('channelId')) ??
      parseInteger(body.channel_id) ??
      parseInteger(body.channelId)

    if (!taskId) {
      return new Response(JSON.stringify({ error: 'Missing task_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    if (!channelId) {
      return new Response(JSON.stringify({ error: 'Missing channel_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const authHeader = req.headers.get('authorization') ?? ''
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
    )

    const [channelResult, briefingResult, effectiveSeoResult, seoOverrideResult, composedOutputResult] =
      await Promise.all([
        supabase
          .from('channels')
          .select('id, name')
          .eq('id', channelId)
          .single(),
        supabase
          .from('task_channel_briefings')
          .select('briefing_type_id, disable_briefing')
          .eq('task_id', taskId)
          .eq('channel_id', channelId)
          .maybeSingle(),
        supabase
          .from('v_task_channel_effective_seo')
          .select('seo_required, seo_source')
          .eq('task_id', taskId)
          .eq('channel_id', channelId)
          .maybeSingle(),
        supabase
          .from('task_channel_seo')
          .select('primary_keyword, secondary_keywords, seo_required_override')
          .eq('task_id', taskId)
          .eq('channel_id', channelId)
          .maybeSingle(),
        supabase.rpc('task_channel_composed_output', {
          p_task_id: taskId,
          p_channel_id: channelId,
        }),
      ])

    const initialErrors = [
      { key: 'channel', error: channelResult.error },
      { key: 'briefing', error: briefingResult.error },
      { key: 'effective_seo', error: effectiveSeoResult.error },
      { key: 'seo_override', error: seoOverrideResult.error },
      { key: 'composed_output', error: composedOutputResult.error },
    ].filter((x) => x.error)

    if (initialErrors.length > 0) {
      const primaryError = initialErrors[0].error
      return buildErrorResponse(
        primaryError?.code === 'PGRST116' ? 404 : 500,
        primaryError?.message ?? 'Failed to load task channel bootstrap',
        initialErrors.map((x) => ({ key: x.key, message: x.error?.message ?? 'Unknown error' })),
      )
    }

    const briefing = briefingResult.data ?? null

    /**
     * Always load component lists. `briefing_type_id` may be null when the task channel inherits
     * the default briefing type — that is still a valid, resolved state; selected rows in
     * `task_channel_components` must not be hidden behind a "resolved briefing" gate.
     */
    const [componentsResult, availableComponentsResult] = await Promise.all([
      supabase.rpc('tc_components_for_task_channel', {
        p_task_id: taskId,
        p_channel_id: channelId,
      }),
      supabase.rpc('tc_available_components_for_task_channel', {
        p_task_id: taskId,
        p_channel_id: channelId,
      }),
    ])

    const secondaryErrors = [
      { key: 'components', error: componentsResult.error },
      { key: 'available_components', error: availableComponentsResult.error },
    ].filter((x) => x.error)

    if (secondaryErrors.length > 0) {
      const primaryError = secondaryErrors[0].error
      return buildErrorResponse(
        500,
        primaryError?.message ?? 'Failed to load task channel bootstrap',
        secondaryErrors.map((x) => ({ key: x.key, message: x.error?.message ?? 'Unknown error' })),
      )
    }

    const components = componentsResult.data ?? []
    const availableComponents = availableComponentsResult.data ?? []

    const response = {
      task_id: taskId,
      channel_id: channelId,
      channel: channelResult.data,
      briefing,
      seo: {
        effective: effectiveSeoResult.data ?? null,
        override: seoOverrideResult.data ?? null,
      },
      composed_output: composedOutputResult.data ?? [],
      components,
      available_components: availableComponents,
      meta: {
        bootstrap_version: 4,
        fetched_at: new Date().toISOString(),
      },
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
