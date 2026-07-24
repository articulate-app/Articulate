import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

type Direction = 'ar' | 'ap'

export type DocumentsMinListRpcBody = {
  p_limit: number
  p_offset: number
  p_date_from: string
  p_doc_date_gte?: string | null
  p_doc_date_lt?: string | null
  p_direction?: Direction[] | null
  p_currency_code?: string[] | null
  p_doc_kind?: string[] | null
  p_status?: string[] | null
  p_from_team_id?: number[] | null
  p_to_team_id?: number[] | null
  p_search?: string | null
}

export type DocumentDetailsRpcBody = {
  p_direction: Direction
  p_doc_kind: string
  p_doc_id: number
}

/**
 * Execute a PostgREST RPC via the configured Supabase client.
 *
 * This avoids relying on NEXT_PUBLIC_SUPABASE_URL at runtime while still producing
 * a network call to: POST /rest/v1/rpc/<rpcName>
 * with the same auth/session behavior as existing Supabase `.from(...).select(...)` calls.
 */
export async function supabaseRpcFetch<TResponse>(
  rpcName: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<{ data: TResponse; count: number | null }> {
  const supabase = createClientComponentClient()

  let q: any = supabase.rpc(rpcName, body, { count: 'exact' })
  if (signal && q && typeof q.abortSignal === 'function') {
    q = q.abortSignal(signal)
  }

  const { data, error, count } = await q
  if (error) throw error
  return { data: data as TResponse, count: typeof count === 'number' ? count : null }
}

function parsePostgrestInList(raw: string): string[] {
  // in.(a,b,c)  OR  in.("a","b")
  const match = raw.match(/^in\.\((.*)\)$/)
  if (!match) return []
  const inner = match[1] ?? ''
  return inner
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => v.replace(/^"(.*)"$/, '$1'))
}

function parsePostgrestEq(raw: string): string | null {
  const match = raw.match(/^eq\.(.*)$/)
  if (!match) return null
  return match[1] ?? null
}

function parsePostgrestNumberList(raw: string): number[] {
  return parsePostgrestInList(raw)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n))
}

function formatDateYYYYMMDD(d: Date): string {
  // UTC date-only string to avoid timezone drift
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function getDocumentsDefaultDateFrom(): string {
  const now = new Date()
  const startOfMonthUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  startOfMonthUtc.setUTCMonth(startOfMonthUtc.getUTCMonth() - 6)
  return formatDateYYYYMMDD(startOfMonthUtc)
}

/** Explicit lower bound used when the UI "All Time" filter is selected (RPC always requires p_date_from). */
export const DOCUMENTS_ALL_TIME_DATE_FROM = '1970-01-01'

export function isDocumentsAllTimeDateFrom(fromDate?: string | null): boolean {
  return !fromDate || fromDate === DOCUMENTS_ALL_TIME_DATE_FROM
}

function pickSearchOrClause(orValues: string[]): string | null {
  // Prefer the "global search" OR clause that contains doc_number/from_team_name/to_team_name.
  const preferred = orValues.find((v) =>
    v.includes('doc_number.ilike') ||
    v.includes('from_team_name.ilike') ||
    v.includes('to_team_name.ilike')
  )
  return preferred ?? orValues[0] ?? null
}

function extractIlikeWrappedTerm(rawOr: string): string | null {
  // URLSearchParams already percent-decodes, so `%25` usually becomes `%`.
  const m1 = rawOr.match(/%([^%]+)%/)
  if (m1?.[1]) return m1[1]

  const m2 = rawOr.match(/%25([^%]+)%25/)
  if (m2?.[1]) return m2[1]

  return null
}

/**
 * Translate an existing PostgREST URL query (built by the current FE) into the LIST RPC body.
 * This keeps all filter encoding logic unchanged; we only map it at request time.
 */
export function buildDocumentsMinListRpcBodyFromPostgrestSearchParams(
  params: URLSearchParams
): DocumentsMinListRpcBody {
  const limit = Number(params.get('limit') ?? '0') || 0
  const offset = Number(params.get('offset') ?? '0') || 0

  // doc_date can appear multiple times (e.g. gte + lt)
  const docDateValues = params.getAll('doc_date')
  const gteRaw = docDateValues.find((v) => v.startsWith('gte.')) ?? null
  const ltRaw = docDateValues.find((v) => v.startsWith('lt.')) ?? null
  const p_doc_date_gte = gteRaw ? gteRaw.slice('gte.'.length) : null
  const p_doc_date_lt = ltRaw ? ltRaw.slice('lt.'.length) : null

  const directionRaw = params.get('direction')
  const currencyRaw = params.get('currency_code')
  const docKindRaw = params.get('doc_kind')
  const statusRaw = params.get('status')
  const fromTeamRaw = params.get('from_team_id')
  const toTeamRaw = params.get('to_team_id')

  const orValues = params.getAll('or')
  const orClause = pickSearchOrClause(orValues)
  const p_search = orClause ? extractIlikeWrappedTerm(orClause) : null

  const p_date_from = p_doc_date_gte || getDocumentsDefaultDateFrom()

  const p_direction =
    directionRaw?.startsWith('eq.')
      ? ([parsePostgrestEq(directionRaw)!] as Direction[])
      : directionRaw?.startsWith('in.')
        ? (parsePostgrestInList(directionRaw) as Direction[])
        : null

  const p_currency_code =
    currencyRaw?.startsWith('eq.')
      ? [parsePostgrestEq(currencyRaw)!]
      : currencyRaw?.startsWith('in.')
        ? parsePostgrestInList(currencyRaw)
        : null

  const p_doc_kind = docKindRaw?.startsWith('in.') ? parsePostgrestInList(docKindRaw) : null
  const p_status = statusRaw?.startsWith('in.') ? parsePostgrestInList(statusRaw) : null
  const p_from_team_id = fromTeamRaw?.startsWith('in.') ? parsePostgrestNumberList(fromTeamRaw) : null
  const p_to_team_id = toTeamRaw?.startsWith('in.') ? parsePostgrestNumberList(toTeamRaw) : null

  return {
    p_limit: limit,
    p_offset: offset,
    p_date_from,
    p_doc_date_gte,
    p_doc_date_lt,
    p_direction,
    p_currency_code,
    p_doc_kind,
    p_status,
    p_from_team_id,
    p_to_team_id,
    p_search,
  }
}


