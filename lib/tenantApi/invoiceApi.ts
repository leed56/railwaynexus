export interface ApiInvoiceLineInput {
  description: string
  quantity: number
  unit_price: number
  discount_pct?: number
  tax_pct?: number
  account_id?: string | null
  tax_rate_id?: string | null
  line_order?: number
}

export interface ApiInvoiceCreateInput {
  customer_id: string
  invoice_date: string
  due_date: string
  type?: 'invoice' | 'credit_note' | 'debit_note'
  currency?: string
  exchange_rate?: number
  notes?: string | null
  lines: ApiInvoiceLineInput[]
}

export function lineTotal(l: ApiInvoiceLineInput): number {
  const gross = l.quantity * l.unit_price
  const afterDiscount = gross * (1 - (l.discount_pct ?? 0) / 100)
  return Math.round(afterDiscount * (1 + (l.tax_pct ?? 0) / 100) * 100) / 100
}

export function calcInvoiceTotals(lines: ApiInvoiceLineInput[]) {
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const discount = lines.reduce(
    (s, l) => s + l.quantity * l.unit_price * (l.discount_pct ?? 0) / 100,
    0,
  )
  const tax_amount = lines.reduce((s, l) => {
    const base = l.quantity * l.unit_price * (1 - (l.discount_pct ?? 0) / 100)
    return s + base * (l.tax_pct ?? 0) / 100
  }, 0)
  const total = lines.reduce((s, l) => s + lineTotal(l), 0)
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    tax_amount: Math.round(tax_amount * 100) / 100,
    total: Math.round(total * 100) / 100,
  }
}

export function validateInvoiceCreate(body: Record<string, unknown>): string | null {
  const customerId = String(body.customer_id ?? '').trim()
  if (!customerId) return 'customer_id is required'

  const invoiceDate = String(body.invoice_date ?? '').trim()
  const dueDate = String(body.due_date ?? '').trim()
  if (!invoiceDate || !dueDate) return 'invoice_date and due_date are required'

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

  const type = body.type != null ? String(body.type) : 'invoice'
  if (!['invoice', 'credit_note', 'debit_note'].includes(type)) {
    return 'type must be invoice, credit_note, or debit_note'
  }

  return null
}

export function parseInvoiceCreate(body: Record<string, unknown>): ApiInvoiceCreateInput {
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
    customer_id: String(body.customer_id).trim(),
    invoice_date: String(body.invoice_date).trim(),
    due_date: String(body.due_date).trim(),
    type: (body.type != null ? String(body.type) : 'invoice') as ApiInvoiceCreateInput['type'],
    currency: body.currency != null ? String(body.currency) : 'LKR',
    exchange_rate: body.exchange_rate != null ? Number(body.exchange_rate) : 1,
    notes: body.notes != null ? String(body.notes) : null,
    lines,
  }
}
