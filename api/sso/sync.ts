import type { IncomingMessage, ServerResponse } from 'node:http'
import type { User } from '@supabase/supabase-js'
import { supabaseAdmin } from '../../inngest/supabaseAdmin'
import { getUserFromAuthHeader } from '../../lib/stripeServer'
import { sendJson } from '../../lib/tenantApi/http'
import { syncSamlProvider } from '../../lib/sso/syncProvider'
import { withObservability } from '../../lib/observability/apiWrapper'

async function userCanManageTenant(user: User, tenantId: string): Promise<boolean> {
  const { data: platformRows } = await supabaseAdmin
    .from('company_users')
    .select('id')
    .eq('user_id', user.id)
    .eq('role', 'platform_admin')
    .eq('is_active', true)
    .is('deleted_at', null)
    .limit(1)

  if (platformRows?.length) return true

  const { data: adminRows } = await supabaseAdmin
    .from('company_users')
    .select('id, companies!inner(tenant_id)')
    .eq('user_id', user.id)
    .in('role', ['tenant_superadmin', 'company_admin'])
    .eq('is_active', true)
    .is('deleted_at', null)
    .eq('companies.tenant_id', tenantId)
    .limit(1)

  return (adminRows?.length ?? 0) > 0
}

async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const authHeader = req.headers.authorization ?? req.headers.Authorization
  const user = await getUserFromAuthHeader(typeof authHeader === 'string' ? authHeader : undefined)
  if (!user) {
    sendJson(res, 401, { error: 'Unauthorized' })
    return
  }

  const tenantId = typeof req.headers['x-tenant-id'] === 'string' ? req.headers['x-tenant-id'].trim() : ''
  if (!tenantId) {
    sendJson(res, 400, { error: 'X-Tenant-Id header is required' })
    return
  }

  if (!(await userCanManageTenant(user, tenantId))) {
    sendJson(res, 403, { error: 'Forbidden' })
    return
  }

  const { data: configResult, error: configError } = await supabaseAdmin.rpc('get_tenant_sso_config_for_sync', {
    p_tenant_id: tenantId,
  })
  if (configError) {
    sendJson(res, 500, { error: configError.message })
    return
  }

  const result = configResult as {
    success?: boolean
    error?: string
    config?: {
      domains?: string[]
      metadata_url?: string | null
      metadata_xml?: string | null
      supabase_provider_id?: string | null
    }
  }

  if (!result.success || !result.config) {
    sendJson(res, 400, { error: result.error ?? 'SSO config not found — save settings first' })
    return
  }

  const cfg = result.config
  const domains = Array.isArray(cfg.domains) ? cfg.domains.map(String) : []

  try {
    const synced = await syncSamlProvider({
      domains,
      metadataUrl: cfg.metadata_url,
      metadataXml: cfg.metadata_xml,
      existingProviderId: cfg.supabase_provider_id,
    })

    const { data: completeResult, error: completeError } = await supabaseAdmin.rpc('complete_tenant_sso_sync', {
      p_tenant_id: tenantId,
      p_provider_id: synced.providerId,
      p_idp_entity_id: synced.entityId,
      p_sync_error: null,
    })

    if (completeError) {
      sendJson(res, 500, { error: completeError.message })
      return
    }

    const complete = completeResult as { success?: boolean; error?: string }
    if (!complete.success) {
      sendJson(res, 500, { error: complete.error ?? 'Failed to persist SSO sync' })
      return
    }

    sendJson(res, 200, {
      success: true,
      provider_id: synced.providerId,
      entity_id: synced.entityId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SSO sync failed'
    await supabaseAdmin.rpc('complete_tenant_sso_sync', {
      p_tenant_id: tenantId,
      p_provider_id: '00000000-0000-0000-0000-000000000000',
      p_idp_entity_id: null,
      p_sync_error: message,
    })
    sendJson(res, 502, { error: message })
  }
}

export default withObservability('api.sso.sync', handler)
