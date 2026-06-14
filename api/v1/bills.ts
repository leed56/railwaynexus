import type { IncomingMessage, ServerResponse } from 'node:http'
import { supabaseAdmin } from '../../inngest/supabaseAdmin'
import { authenticateApiRequest, logApiRequest } from '../../lib/tenantApi/auth'
import { readJsonBody, sendJson } from '../../lib/tenantApi/http'
import { parseListLimit } from '../../lib/tenantApi/listQuery'
import {
  calcBillTotals,
  lineTotal,
  parseBillCreate,
  validateBillCreate,
} from '../../lib/tenantApi/billApi'

const BILL_FIELDS = 'id, company_id, bill_no, supplier_ref, type, supplier_id, bill_date, due_date, status, approval_status, subtotal, tax_amount, total, paid_amount, balance, currency, exchange_rate, notes, gl_posted, created_at, updated_at'

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  const started = Date.now()
  const method = req.method ?? 'GET'
  const path = new URL(req.url ?? '/', 'http://localhost').pathname

  if (method !== 'GET' && method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
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
  const url = new URL(req.url ?? '/', 'http://localhost')

  try {
    if (method === 'GET') {
      const status = url.searchParams.get('status')
      const limit = parseListLimit(url)

      let query = supabaseAdmin
        .from('bills')
        .select(BILL_FIELDS)
        .eq('company_id', ctx.companyId)
        .is('deleted_at', null)
        .order('bill_date', { ascending: false })
        .limit(limit)

      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw error

      sendJson(res, 200, { data: data ?? [] })
      await logApiRequest(ctx, req, path, 200, started)
      return
    }

    const body = await readJsonBody(req)
    const validationError = validateBillCreate(body)
    if (validationError) {
      sendJson(res, 400, { error: validationError })
      await logApiRequest(ctx, req, path, 400, started)
      return
    }

    const input = parseBillCreate(body)

    const { data: supplier, error: supErr } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('id', input.supplier_id)
      .eq('company_id', ctx.companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (supErr) throw supErr
    if (!supplier) {
      sendJson(res, 400, { error: 'supplier_id not found for this company' })
      await logApiRequest(ctx, req, path, 400, started)
      return
    }

    const { data: billNo, error: noErr } = await supabaseAdmin.rpc('next_bill_number', {
      p_company_id: ctx.companyId,
    })
    if (noErr) throw noErr

    const totals = calcBillTotals(input.lines)

    const { data: header, error: headerErr } = await supabaseAdmin
      .from('bills')
      .insert({
        company_id:    ctx.companyId,
        bill_no:       billNo as string,
        type:          input.type ?? 'bill',
        supplier_id:   input.supplier_id,
        supplier_ref:  input.supplier_ref ?? null,
        bill_date:     input.bill_date,
        due_date:      input.due_date,
        currency:      input.currency ?? 'LKR',
        exchange_rate: input.exchange_rate ?? 1,
        notes:         input.notes ?? null,
        status:        'draft',
        approval_status: 'pending',
        subtotal:      totals.subtotal,
        tax_amount:    totals.tax_amount,
        total:         totals.total,
      })
      .select(BILL_FIELDS)
      .single()

    if (headerErr) throw headerErr

    const billId = (header as { id: string }).id
    const lineRows = input.lines.map((l, i) => ({
      company_id:   ctx.companyId,
      bill_id:      billId,
      description:  l.description,
      quantity:     l.quantity,
      unit_price:   l.unit_price,
      discount_pct: l.discount_pct ?? 0,
      tax_pct:      l.tax_pct ?? 0,
      line_total:   lineTotal(l),
      account_id:   l.account_id ?? null,
      tax_rate_id:  l.tax_rate_id ?? null,
      line_order:   l.line_order ?? i,
    }))

    const { error: linesErr } = await supabaseAdmin.from('bill_lines').insert(lineRows)
    if (linesErr) throw linesErr

    const { data: lines, error: fetchLinesErr } = await supabaseAdmin
      .from('bill_lines')
      .select('id, description, quantity, unit_price, discount_pct, tax_pct, line_total, line_order')
      .eq('bill_id', billId)
      .order('line_order')

    if (fetchLinesErr) throw fetchLinesErr

    sendJson(res, 201, { data: { ...header, lines: lines ?? [] } })
    await logApiRequest(ctx, req, path, 201, started)
  } catch (e) {
    sendJson(res, 500, { error: e instanceof Error ? e.message : 'Internal server error' })
    await logApiRequest(ctx, req, path, 500, started)
  }
}
