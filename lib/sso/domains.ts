export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase()
}

export function extractEmailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at <= 0 || at === trimmed.length - 1) return null
  const domain = normalizeDomain(trimmed.slice(at + 1))
  if (!domain.includes('.')) return null
  return domain
}

export function parseDomainList(input: string): string[] {
  const seen = new Set<string>()
  const domains: string[] = []
  for (const part of input.split(/[,\s]+/)) {
    const domain = normalizeDomain(part)
    if (!domain || !domain.includes('.') || domain.includes('@')) continue
    if (seen.has(domain)) continue
    seen.add(domain)
    domains.push(domain)
  }
  return domains
}
