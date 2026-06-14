import type { IncomingMessage, ServerResponse } from 'node:http'
import { supabaseAdmin } from '../../inngest/supabaseAdmin'
import { authenticateApiRequest, logApiRequest } from '../../lib/tenantApi/auth'
import { readJsonBody, sendJson } from '../../lib/tenantApi/http'
import { parseListLimit } from '../../lib/tenantApi/listQuery'
import { parseInventoryCreate, validateInventoryCreate } from '../../lib/tenantApi/inventoryApi'

const ITEM_FIELDS = [
  'id', 'company_id', 'category_id', 'sku', 'name', 'description',
  'unit_of_measure', 'cost_price', 'sale_price', 'reorder_level', 'reorder_qty',
  'is_active', 'created_at', 'updated_at',
  'item_categories(name)',
].join(', ')

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
    method === 'GET' ? 'inventory:read' : 'inventory:write',
  )
  if (!auth.ok) {
    sendJson(res, auth.status, { error: auth.error })
    return
  }

  const { ctx } = auth
  const url = new URL(req.url ?? '/', 'http://localhost')

  try {
    if (method === 'GET') {
      const limit = parseListLimit(url)
      const lowStockOnly = url.searchParams.get('low_stock') === 'true'

      const { data, error } = await supabaseAdmin.rpc('inventory_summary', {
        p_company_id: ctx.companyId,
      })
      if (error) throw error

      let rows = (data ?? []) as Record<string, unknown>[]
      if (lowStockOnly) {
        rows = rows.filter(r => r.is_low_stock === true)
      }
      rows = rows.slice(0, limit)

      sendJson(res, 200, { data: rows })
      await logApiRequest(ctx, req, path, 200, started)
      return
    }

    const body = await readJsonBody(req)
    const validationError = validateInventoryCreate(body)
    if (validationError) {
      sendJson(res, 400, { error: validationError })
      await logApiRequest(ctx, req, path, 400, started)
      return
    }

    const input = parseInventoryCreate(body)

    if (input.category_id) {
      const { data: cat, error: catErr } = await supabaseAdmin
        .from('item_categories')
        .select('id')
        .eq('id', input.category_id)
        .eq('company_id', ctx.companyId)
        .is('deleted_at', null)
        .maybeSingle()

      if (catErr) throw catErr
      if (!cat) {
        sendJson(res, 400, { error: 'category_id not found for this company' })
        await logApiRequest(ctx, req, path, 400, started)
        return
      }
    }

    const { data, error } = await supabaseAdmin
      .from('inventory_items')
      .insert({
        company_id:      ctx.companyId,
        name:            input.name,
        sku:             input.sku,
        category_id:     input.category_id,
        description:     input.description,
        unit_of_measure: input.unit_of_measure,
        cost_price:      input.cost_price,
        sale_price:      input.sale_price,
        reorder_level:   input.reorder_level,
        reorder_qty:     input.reorder_qty,
        is_active:       input.is_active ?? true,
      })
      .select(ITEM_FIELDS)
      .single()

    if (error) throw error

    sendJson(res, 201, { data })
    await logApiRequest(ctx, req, path, 201, started)
  } catch (e) {
    sendJson(res, 500, { error: e instanceof Error ? e.message : 'Internal server error' })
    await logApiRequest(ctx, req, path, 500, started)
  }
}
