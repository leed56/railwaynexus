import type { IncomingMessage } from 'node:http'
import { supabaseAdmin } from '../../inngest/supabaseAdmin'
import { getBearerToken } from './http'
import type { ApiScope } from './scopes'

export interface ApiKeyContext {
  keyId: string
  tenantId: string
  companyId: string
  scopes: string[]
  rateLimitPerMin: number
}

export async function authenticateApiRequest(
  req: IncomingMessage,
  requiredScope?: ApiScope,
): Promise<{ ok: true; ctx: ApiKeyContext } | { ok: false; status: number; error: string }> {
  const token = getBearerToken(req)
  if (!token) {
    return { ok: false, status: 401, error: 'Missing Authorization: Bearer <api_key>' }
  }

  const { data, error } = await supabaseAdmin.rpc('validate_tenant_api_key', {
    p_raw_key: token,
  })

  if (error) {
    return { ok: false, status: 500, error: 'API key validation failed' }
  }

  const row = data as {
    valid?: boolean
    error?: string
    key_id?: string
    tenant_id?: string
    company_id?: string
    scopes?: string[]
    rate_limit_per_min?: number
  }

  if (!row.valid) {
    const status = row.error === 'Rate limit exceeded' ? 429 : 401
    return { ok: false, status, error: row.error ?? 'Unauthorized' }
  }

  const scopes = Array.isArray(row.scopes) ? row.scopes.map(String) : []

  if (requiredScope && !scopes.includes(requiredScope)) {
    return { ok: false, status: 403, error: `Missing required scope: ${requiredScope}` }
  }

  const headerCompany = req.headers['x-company-id']
  let companyId = String(row.company_id)
  if (typeof headerCompany === 'string' && headerCompany.trim()) {
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('id', headerCompany.trim())
      .eq('tenant_id', row.tenant_id)
      .is('deleted_at', null)
      .eq('is_active', true)
      .maybeSingle()

    if (!company) {
      return { ok: false, status: 400, error: 'Invalid X-Company-Id for this API key tenant' }
    }
    companyId = company.id
  }

  return {
    ok: true,
    ctx: {
      keyId: String(row.key_id),
      tenantId: String(row.tenant_id),
      companyId,
      scopes,
      rateLimitPerMin: Number(row.rate_limit_per_min ?? 60),
    },
  }
}

export async function logApiRequest(
  ctx: ApiKeyContext,
  req: IncomingMessage,
  path: string,
  status: number,
  startedAt: number,
) {
  await supabaseAdmin.rpc('log_tenant_api_request', {
    p_tenant_id: ctx.tenantId,
    p_api_key_id: ctx.keyId,
    p_method: req.method ?? 'GET',
    p_path: path,
    p_status_code: status,
    p_ip_address: typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
      : req.socket?.remoteAddress ?? null,
    p_duration_ms: Date.now() - startedAt,
  })
}
