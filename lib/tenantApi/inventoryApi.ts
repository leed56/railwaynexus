export interface ApiInventoryCreateInput {
  name: string
  sku?: string | null
  category_id?: string | null
  description?: string | null
  unit_of_measure?: string
  cost_price?: number
  sale_price?: number
  reorder_level?: number
  reorder_qty?: number
  is_active?: boolean
}

export function validateInventoryCreate(body: Record<string, unknown>): string | null {
  const name = String(body.name ?? '').trim()
  if (!name) return 'name is required'

  for (const field of ['cost_price', 'sale_price', 'reorder_level', 'reorder_qty'] as const) {
    if (body[field] != null) {
      const n = Number(body[field])
      if (!Number.isFinite(n) || n < 0) return `${field} must be >= 0`
    }
  }

  return null
}

export function parseInventoryCreate(body: Record<string, unknown>): ApiInventoryCreateInput {
  return {
    name: String(body.name).trim(),
    sku: body.sku != null ? String(body.sku).trim() || null : null,
    category_id: body.category_id != null ? String(body.category_id) : null,
    description: body.description != null ? String(body.description) : null,
    unit_of_measure: body.unit_of_measure != null ? String(body.unit_of_measure) : 'unit',
    cost_price: body.cost_price != null ? Number(body.cost_price) : 0,
    sale_price: body.sale_price != null ? Number(body.sale_price) : 0,
    reorder_level: body.reorder_level != null ? Number(body.reorder_level) : 0,
    reorder_qty: body.reorder_qty != null ? Number(body.reorder_qty) : 0,
    is_active: body.is_active != null ? Boolean(body.is_active) : true,
  }
}

export function validateInventoryPatch(body: Record<string, unknown>): string | null {
  if (body.name != null && !String(body.name).trim()) return 'name cannot be empty'

  for (const field of ['cost_price', 'sale_price', 'reorder_level', 'reorder_qty'] as const) {
    if (body[field] != null) {
      const n = Number(body[field])
      if (!Number.isFinite(n) || n < 0) return `${field} must be >= 0`
    }
  }

  return null
}

export const INVENTORY_PATCH_KEYS = [
  'name', 'sku', 'category_id', 'description', 'unit_of_measure',
  'cost_price', 'sale_price', 'reorder_level', 'reorder_qty', 'is_active',
] as const
