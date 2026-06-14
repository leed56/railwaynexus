import type { IncomingMessage, ServerResponse } from 'node:http'
import { supabaseAdmin } from '../../../inngest/supabaseAdmin'
import { authenticateApiRequest, logApiRequest } from '../../../lib/tenantApi/auth'
import { readJsonBody, sendJson } from '../../../lib/tenantApi/http'

const BILL_FIELDS = 'id, company_id, bill_no, supplier_ref, type, supplier_id, bill_date, due_date, status, approval_status, subtotal, tax_amount, total, paid_amount, balance, currency, exchange_rate, notes, gl_posted, created_at, updated_at'
const ALLOWED_STATUS = new Set(['draft', 'approved', 'cancelled'])

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  const started = Date.now()
  const method = req.method ?? 'GET'
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  const parts = path.split('/').filter(Boolean)
  const id = parts[parts.length - 1]

  if (!id || id === 'bills') {
    sendJson(res, 400, { error: 'Bill id required' })
    return
  }

  const auth = await authenticateApiRequest(
    req,
    method === 'GET' ? 'bills:read' : 'bills:write',
  )

  if (!auth.ok) {
    sendJson(res, auth.status, { error: auth.error })
    return
  }

  const { ctx } = auth

  try {
    if (method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('bills')
        .select(BILL_FIELDS)
        .eq('id', id)
        .eq('company_id', ctx.companyId)
        .is('deleted_at', null)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        sendJson(res, 404, { error: 'Bill not found' })
        await logApiRequest(ctx, req, path, 404, started)
        return
      }

      const { data: lines, error: linesErr } = await supabaseAdmin
        .from('bill_lines')
        .select('id, description, quantity, unit_price, discount_pct, tax_pct, line_total, line_order')
        .eq('bill_id', id)
        .order('line_order')

      if (linesErr) throw linesErr

      sendJson(res, 200, { data: { ...data, lines: lines ?? [] } })
      await logApiRequest(ctx, req, path, 200, started)
      return
    }

    if (method === 'PATCH' || method === 'PUT') {
      const body = await readJsonBody(req)
      const status = body.status != null ? String(body.status) : ''
      if (!ALLOWED_STATUS.has(status)) {
        sendJson(res, 400, { error: 'status must be draft, approved, or cancelled' })
        await logApiRequest(ctx, req, path, 400, started)
        return
      }

      const patch: Record<string, unknown> = { status }
      if (status === 'approved') {
        patch.approval_status = 'approved'
      }

      const { data, error } = await supabaseAdmin
        .from('bills')
        .update(patch)
        .eq('id', id)
        .eq('company_id', ctx.companyId)
        .is('deleted_at', null)
        .select(BILL_FIELDS)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        sendJson(res, 404, { error: 'Bill not found' })
        await logApiRequest(ctx, req, path, 404, started)
        return
      }

      sendJson(res, 200, { data })
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
