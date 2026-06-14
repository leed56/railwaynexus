import {
  calcInvoiceTotals,
  lineTotal,
  type ApiInvoiceLineInput,
} from './invoiceApi'

export type ApiBillLineInput = ApiInvoiceLineInput

export interface ApiBillCreateInput {
  supplier_id: string
  bill_date: string
  due_date: string
  type?: 'bill' | 'credit_note'
  supplier_ref?: string | null
  currency?: string
  exchange_rate?: number
  notes?: string | null
  lines: ApiBillLineInput[]
}

export function calcBillTotals(lines: ApiBillLineInput[]) {
  return calcInvoiceTotals(lines)
}

export function validateBillCreate(body: Record<string, unknown>): string | null {
  const supplierId = String(body.supplier_id ?? '').trim()
  if (!supplierId) return 'supplier_id is required'

  const billDate = String(body.bill_date ?? '').trim()
  const dueDate = String(body.due_date ?? '').trim()
  if (!billDate || !dueDate) return 'bill_date and due_date are required'

  const lines = body.lines
  if (!Array.isArray(lines) || lines.length === 0) return 'lines must be a non-empty array'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as Record<string, unknown>
    if (!String(line.description ?? '').trim()) return `lines[${i}].description is required`
    const qty = Number(line.quantity)
    const price = Number(line.unit_price)
    if (!Number.isFinite(qty) || qty <= 0) return `lines[${i}].quantity must be positive`
    if (!Number.isFinite(price) || price < 0) return `lines[${i}].unit_price must be >= 0`
  }

  const type = body.type != null ? String(body.type) : 'bill'
  if (!['bill', 'credit_note'].includes(type)) {
    return 'type must be bill or credit_note'
  }

  return null
}

export function parseBillCreate(body: Record<string, unknown>): ApiBillCreateInput {
  const lines = (body.lines as Record<string, unknown>[]).map((line, i) => ({
    description: String(line.description).trim(),
    quantity: Number(line.quantity),
    unit_price: Number(line.unit_price),
    discount_pct: line.discount_pct != null ? Number(line.discount_pct) : 0,
    tax_pct: line.tax_pct != null ? Number(line.tax_pct) : 0,
    account_id: line.account_id != null ? String(line.account_id) : null,
    tax_rate_id: line.tax_rate_id != null ? String(line.tax_rate_id) : null,
    line_order: line.line_order != null ? Number(line.line_order) : i,
  }))

  return {
    supplier_id: String(body.supplier_id).trim(),
    bill_date: String(body.bill_date).trim(),
    due_date: String(body.due_date).trim(),
    type: (body.type != null ? String(body.type) : 'bill') as ApiBillCreateInput['type'],
    supplier_ref: body.supplier_ref != null ? String(body.supplier_ref) : null,
    currency: body.currency != null ? String(body.currency) : 'LKR',
    exchange_rate: body.exchange_rate != null ? Number(body.exchange_rate) : 1,
    notes: body.notes != null ? String(body.notes) : null,
    lines,
  }
}

export { lineTotal }
