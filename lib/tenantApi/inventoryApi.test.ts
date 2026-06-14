import { describe, it, expect } from 'vitest'
import { parseInventoryCreate, validateInventoryCreate, validateInventoryPatch } from './inventoryApi'

describe('inventoryApi', () => {
  it('requires name on create', () => {
    expect(validateInventoryCreate({})).toBe('name is required')
  })

  it('parses create input', () => {
    const input = parseInventoryCreate({
      name: 'Widget',
      sku: 'W-1',
      cost_price: 10,
      sale_price: 15,
    })
    expect(input.name).toBe('Widget')
    expect(input.sku).toBe('W-1')
    expect(input.cost_price).toBe(10)
  })

  it('validates patch numeric fields', () => {
    expect(validateInventoryPatch({ cost_price: -1 })).toBe('cost_price must be >= 0')
  })
})
