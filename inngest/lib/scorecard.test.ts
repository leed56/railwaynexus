import { describe, expect, it } from 'vitest'
import { parseLowStockCount, parseScorecard } from './scorecard'

describe('scorecard evidence', () => {
  it('accepts a complete server aggregate beyond a REST page', () => expect(parseLowStockCount(1501)).toBe(1501))
  it.each([null, undefined, '12', -1, 1.5, Infinity])('rejects missing or invalid evidence %s', value => {
    expect(() => parseLowStockCount(value)).toThrow()
  })
})
const valid = { health_score: 80, cash_score: 70, ar_score: 60, inventory_score: 90, revenue_score: 80, staff_score: 70, narrative: 'Evidence-based summary', top_risks: ['Late collections'], recommended_actions: ['Review invoices'] }
describe('scorecard model output', () => {
  it('accepts a complete bounded response', () => expect(parseScorecard(JSON.stringify(valid))).toEqual(valid))
  it.each([ { health_score: 101 }, { cash_score: '80' }, { staff_score: 2.5 }, { inventory_score: null }, { top_risks: [1] }, { recommended_actions: ['a','b','c','d'] }, { narrative: '' } ])('rejects malformed fields %j', patch => {
    expect(() => parseScorecard(JSON.stringify({ ...valid, ...patch }))).toThrow()
  })
})
