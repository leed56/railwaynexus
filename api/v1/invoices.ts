import type { IncomingMessage, ServerResponse } from 'node:http'
import { supabaseAdmin } from '../../inngest/supabaseAdmin'
import { authenticateApiRequest, logApiRequest } from '../../lib/tenantApi/auth'
import { readJsonBody, sendJson } from '../../lib/tenantApi/http'
import { parseListLimit } from '../../lib/tenantApi/listQuery'
import {
  calcInvoiceTotals,
  lineTotal,
  parseInvoiceCreate,
  validateInvoiceCreate,
} from '../../lib/tenantApi/invoiceApi'
import { withObservability } from '../../lib/observability/apiWrapper'

const INVOICE_FIELDS = 'id, company_id, invoice_no, type, customer_id, invoice_date, due_date, status, subtotal, tax_amount, discount, total, paid_amount, balance, currency, exchange_rate, notes, gl_posted, created_at, updated_at'

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
    method === 'GET' ? 'invoices:read' : 'invoices:write',
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
        .from('invoices')
        .select(INVOICE_FIELDS)
        .eq('company_id', ctx.companyId)
        .is('deleted_at', null)
        .order('invoice_date', { ascending: false })
        .limit(limit)

      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw error

      sendJson(res, 200, { data: data ?? [] })
      await logApiRequest(ctx, req, path, 200, started)
      return
    }

    const body = await readJsonBody(req)
    const validationError = validateInvoiceCreate(body)
    if (validationError) {
      sendJson(res, 400, { error: validationError })
      await logApiRequest(ctx, req, path, 400, started)
      return
    }

    const input = parseInvoiceCreate(body)

    const { data: customer, error: custErr } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('id', input.customer_id)
      .eq('company_id', ctx.companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (custErr) throw custErr
    if (!customer) {
      sendJson(res, 400, { error: 'customer_id not found for this company' })
      await logApiRequest(ctx, req, path, 400, started)
      return
    }

    const { data: invoiceNo, error: noErr } = await supabaseAdmin.rpc('next_invoice_number', {
      p_company_id: ctx.companyId,
    })
    if (noErr) throw noErr

    const totals = calcInvoiceTotals(input.lines)

    const { data: header, error: headerErr } = await supabaseAdmin
      .from('invoices')
      .insert({
        company_id:    ctx.companyId,
        invoice_no:    invoiceNo as string,
        type:          input.type ?? 'invoice',
        customer_id:   input.customer_id,
        invoice_date:  input.invoice_date,
        due_date:      input.due_date,
        currency:      input.currency ?? 'LKR',
        exchange_rate: input.exchange_rate ?? 1,
        notes:         input.notes ?? null,
        status:        'draft',
        subtotal:      totals.subtotal,
        discount:      totals.discount,
        tax_amount:    totals.tax_amount,
        total:         totals.total,
      })
      .select(INVOICE_FIELDS)
      .single()

    if (headerErr) throw headerErr

    const invoiceId = (header as { id: string }).id
    const lineRows = input.lines.map((l, i) => ({
      company_id:   ctx.companyId,
      invoice_id:   invoiceId,
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

    const { error: linesErr } = await supabaseAdmin.from('invoice_lines').insert(lineRows)
    if (linesErr) throw linesErr

    const { data: lines, error: fetchLinesErr } = await supabaseAdmin
      .from('invoice_lines')
      .select('id, description, quantity, unit_price, discount_pct, tax_pct, line_total, line_order')
      .eq('invoice_id', invoiceId)
      .order('line_order')

    if (fetchLinesErr) throw fetchLinesErr

    sendJson(res, 201, { data: { ...header, lines: lines ?? [] } })
    await logApiRequest(ctx, req, path, 201, started)
  } catch (e) {
    sendJson(res, 500, { error: e instanceof Error ? e.message : 'Internal server error' })
    await logApiRequest(ctx, req, path, 500, started)
  }
}

export default withObservability('api.v1.invoices', handler)
