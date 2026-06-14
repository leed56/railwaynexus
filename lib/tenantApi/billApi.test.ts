import { describe, it, expect } from 'vitest'
import { calcBillTotals, validateBillCreate } from './billApi'

describe('billApi', () => {
  it('calculates bill totals', () => {
    const totals = calcBillTotals([
      { description: 'Parts', quantity: 2, unit_price: 1000, tax_pct: 0 },
    ])
    expect(totals.total).toBe(2000)
  })

  it('validateBillCreate rejects missing supplier', () => {
    expect(validateBillCreate({
      bill_date: '2026-06-01',
      due_date: '2026-06-30',
      lines: [{ description: 'x', quantity: 1, unit_price: 1 }],
    })).toBe('supplier_id is required')
  })
})
