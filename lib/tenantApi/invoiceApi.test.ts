import { describe, it, expect } from 'vitest'
import { calcInvoiceTotals, lineTotal, validateInvoiceCreate } from './invoiceApi'

describe('invoiceApi', () => {
  it('calculates line total with discount and tax', () => {
    expect(lineTotal({ description: 'x', quantity: 2, unit_price: 1000, discount_pct: 10, tax_pct: 15 })).toBe(2070)
  })

  it('aggregates invoice totals', () => {
    const totals = calcInvoiceTotals([
      { description: 'A', quantity: 1, unit_price: 1000, tax_pct: 0 },
      { description: 'B', quantity: 2, unit_price: 500, tax_pct: 0 },
    ])
    expect(totals.subtotal).toBe(2000)
    expect(totals.total).toBe(2000)
  })

  it('validateInvoiceCreate rejects missing customer', () => {
    expect(validateInvoiceCreate({ lines: [{ description: 'x', quantity: 1, unit_price: 1 }] })).toBe('customer_id is required')
  })
})
