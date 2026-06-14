export function parseListLimit(url: URL, defaultLimit = 100, max = 500): number {
  const raw = Number(url.searchParams.get('limit') ?? defaultLimit)
  if (!Number.isFinite(raw) || raw < 1) return defaultLimit
  return Math.min(Math.floor(raw), max)
}
