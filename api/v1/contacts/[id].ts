import type { IncomingMessage, ServerResponse } from 'node:http'
import { supabaseAdmin } from '../../../inngest/supabaseAdmin'
import { authenticateApiRequest, logApiRequest } from '../../../lib/tenantApi/auth'
import { readJsonBody, sendJson } from '../../../lib/tenantApi/http'
import { withObservability } from '../../../lib/observability/apiWrapper'

const CONTACT_FIELDS = 'id, company_id, type, name, short_name, contact_person, email, phone, mobile, address, city, country, tax_no, credit_limit, credit_days, currency, notes, is_active, created_at, updated_at'

async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  const started = Date.now()
  const method = req.method ?? 'GET'
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  const parts = path.split('/').filter(Boolean)
  const id = parts[parts.length - 1]

  if (!id || id === 'contacts') {
    sendJson(res, 400, { error: 'Contact id required' })
    return
  }

  const auth = await authenticateApiRequest(
    req,
    method === 'GET' ? 'contacts:read' : 'contacts:write',
  )

  if (!auth.ok) {
    sendJson(res, auth.status, { error: auth.error })
    return
  }

  const { ctx } = auth

  try {
    if (method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('contacts')
        .select(CONTACT_FIELDS)
        .eq('id', id)
        .eq('company_id', ctx.companyId)
        .is('deleted_at', null)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        sendJson(res, 404, { error: 'Contact not found' })
        await logApiRequest(ctx, req, path, 404, started)
        return
      }
      sendJson(res, 200, { data })
      await logApiRequest(ctx, req, path, 200, started)
      return
    }

    if (method === 'PATCH' || method === 'PUT') {
      const body = await readJsonBody(req)
      const patch: Record<string, unknown> = {}
      const allowed = [
        'type', 'name', 'short_name', 'contact_person', 'email', 'phone', 'mobile',
        'address', 'city', 'country', 'tax_no', 'credit_limit', 'credit_days', 'currency', 'notes', 'is_active',
      ]
      for (const key of allowed) {
        if (body[key] !== undefined) patch[key] = body[key]
      }

      const { data, error } = await supabaseAdmin
        .from('contacts')
        .update(patch)
        .eq('id', id)
        .eq('company_id', ctx.companyId)
        .is('deleted_at', null)
        .select(CONTACT_FIELDS)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        sendJson(res, 404, { error: 'Contact not found' })
        await logApiRequest(ctx, req, path, 404, started)
        return
      }
      sendJson(res, 200, { data })
      await logApiRequest(ctx, req, path, 200, started)
      return
    }

    if (method === 'DELETE') {
      const { data, error } = await supabaseAdmin
        .from('contacts')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', id)
        .eq('company_id', ctx.companyId)
        .is('deleted_at', null)
        .select('id')
        .maybeSingle()

      if (error) throw error
      if (!data) {
        sendJson(res, 404, { error: 'Contact not found' })
        await logApiRequest(ctx, req, path, 404, started)
        return
      }
      sendJson(res, 200, { data: { id: data.id, deleted: true } })
      await logApiRequest(ctx, req, path, 200, started)
      return
    }

    sendJson(res, 405, { error: 'Method not allowed' })
    await logApiRequest(ctx, req, path, 405, started)
  } catch (e) {
    sendJson(res, 500, { error: e instanceof Error ? e.message : 'Internal server error' })
    await logApiRequest(ctx, req, path, 500, started)
  }
}

export default withObservability('api.v1.contacts.id', handler)
