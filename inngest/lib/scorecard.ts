export function parseLowStockCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid low-stock evidence')
  }
  return value
}

const scoreKeys = ['health_score', 'cash_score', 'ar_score', 'inventory_score', 'revenue_score', 'staff_score'] as const
export type Scorecard = Record<typeof scoreKeys[number], number> & {
  narrative: string; top_risks: string[]; recommended_actions: string[]
}

// Reject malformed output instead of persisting a misleading scorecard.
export function parseScorecard(text: string): Scorecard {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid scorecard')
  const row = value as Record<string, unknown>
  for (const key of scoreKeys) {
    if (typeof row[key] !== 'number' || !Number.isInteger(row[key]) || row[key] < 0 || row[key] > 100) {
      throw new Error(`Invalid scorecard ${key}`)
    }
  }
  if (typeof row.narrative !== 'string' || !row.narrative.trim() || row.narrative.length > 250) throw new Error('Invalid scorecard narrative')
  for (const key of ['top_risks', 'recommended_actions']) {
    const values = row[key]
    if (!Array.isArray(values) || values.length > 3 || values.some(v => typeof v !== 'string' || !v.trim() || v.length > 500)) throw new Error(`Invalid scorecard ${key}`)
  }
  return Object.fromEntries([...scoreKeys, 'narrative', 'top_risks', 'recommended_actions'].map(key => [key, row[key]])) as Scorecard
}
