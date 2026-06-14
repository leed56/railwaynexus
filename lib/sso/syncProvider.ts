export interface SyncSamlProviderInput {
  domains: string[]
  metadataUrl?: string | null
  metadataXml?: string | null
  existingProviderId?: string | null
}

export interface SyncSamlProviderResult {
  providerId: string
  entityId?: string | null
}

function getSupabaseAuthBase(): { base: string; key: string } {
  const base = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!base || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required for SSO sync')
  }
  return { base: base.replace(/\/$/, ''), key }
}

export async function syncSamlProvider(input: SyncSamlProviderInput): Promise<SyncSamlProviderResult> {
  const { base, key } = getSupabaseAuthBase()
  const metadataUrl = input.metadataUrl?.trim() || null
  const metadataXml = input.metadataXml?.trim() || null

  if (!metadataUrl && !metadataXml) {
    throw new Error('Metadata URL or XML is required')
  }
  if (!input.domains.length) {
    throw new Error('At least one domain is required')
  }

  const body: Record<string, unknown> = {
    type: 'saml',
    domains: input.domains,
    attribute_mapping: {
      keys: {
        email: { name: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress' },
        name: { name: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name' },
      },
    },
  }

  if (metadataUrl) body.metadata_url = metadataUrl
  if (metadataXml) body.metadata_xml = metadataXml

  const existingId = input.existingProviderId?.trim()
  const method = existingId ? 'PUT' : 'POST'
  const url = existingId
    ? `${base}/auth/v1/admin/sso/providers/${existingId}`
    : `${base}/auth/v1/admin/sso/providers`

  const response = await fetch(url, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => ({})) as {
    id?: string
    saml?: { entity_id?: string }
    message?: string
    error?: string
    msg?: string
  }

  if (!response.ok) {
    const message = payload.message ?? payload.error ?? payload.msg ?? `SSO sync failed (${response.status})`
    throw new Error(message)
  }

  const providerId = String(payload.id ?? existingId ?? '')
  if (!providerId) {
    throw new Error('SSO provider ID missing from sync response')
  }

  return {
    providerId,
    entityId: payload.saml?.entity_id ?? null,
  }
}
