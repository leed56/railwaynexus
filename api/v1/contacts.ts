import type { IncomingMessage, ServerResponse } from 'node:http'
import { supabaseAdmin } from '../../inngest/supabaseAdmin'
import { authenticateApiRequest, logApiRequest } from '../../lib/tenantApi/auth'
import { readJsonBody, sendJson } from '../../lib/tenantApi/http'
import { withObservability } from '../../lib/observability/apiWrapper'

const CONTACT_FIELDS = 'id, company_id, type, name, short_name, contact_person, email, phone, mobile, address, city, country, tax_no, credit_limit, credit_days, currency, notes, is_active, created_at, updated_at'

async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  const started = Date.now()
  const method = req.method ?? 'GET'
  const path = new URL(req.url ?? '/', 'http://localhost').pathname

  if (method !== 'GET' && method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
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
  const url = new URL(req.url ?? '/', 'http://localhost')

  try {
    if (method === 'GET') {
      const type = url.searchParams.get('type')
      let query = supabaseAdmin
        .from('contacts')
        .select(CONTACT_FIELDS)
        .eq('company_id', ctx.companyId)
        .is('deleted_at', null)
        .order('name')

      if (type) query = query.eq('type', type)

      const { data, error } = await query
      if (error) throw error
      sendJson(res, 200, { data: data ?? [] })
      await logApiRequest(ctx, req, path, 200, started)
      return
    }

    const body = await readJsonBody(req)
    const name = String(body.name ?? '').trim()
    const type = String(body.type ?? 'customer')
    if (!name) {
      sendJson(res, 400, { error: 'name is required' })
      await logApiRequest(ctx, req, path, 400, started)
      return
    }
    if (!['customer', 'supplier', 'both'].includes(type)) {
      sendJson(res, 400, { error: 'type must be customer, supplier, or both' })
      await logApiRequest(ctx, req, path, 400, started)
      return
    }

    const { data, error } = await supabaseAdmin
      .from('contacts')
      .insert({
        company_id: ctx.companyId,
        type,
        name,
        short_name: body.short_name != null ? String(body.short_name) : null,
        contact_person: body.contact_person != null ? String(body.contact_person) : null,
        email: body.email != null ? String(body.email) : null,
        phone: body.phone != null ? String(body.phone) : null,
        mobile: body.mobile != null ? String(body.mobile) : null,
        address: body.address != null ? String(body.address) : null,
        city: body.city != null ? String(body.city) : null,
        country: body.country != null ? String(body.country) : 'Sri Lanka',
        tax_no: body.tax_no != null ? String(body.tax_no) : null,
        credit_limit: body.credit_limit != null ? Number(body.credit_limit) : 0,
        credit_days: body.credit_days != null ? Number(body.credit_days) : 30,
        currency: body.currency != null ? String(body.currency) : 'LKR',
        notes: body.notes != null ? String(body.notes) : null,
      })
      .select(CONTACT_FIELDS)
      .single()

    if (error) throw error
    sendJson(res, 201, { data })
    await logApiRequest(ctx, req, path, 201, started)
  } catch (e) {
    sendJson(res, 500, { error: e instanceof Error ? e.message : 'Internal server error' })
    await logApiRequest(ctx, req, path, 500, started)
  }
}

export default withObservability('api.v1.contacts', handler)
