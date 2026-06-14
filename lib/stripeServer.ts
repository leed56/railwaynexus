import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' })
}

export const PLAN_PRICE_ENV: Record<string, string> = {
  starter: 'STRIPE_PRICE_STARTER',
  professional: 'STRIPE_PRICE_PROFESSIONAL',
  enterprise: 'STRIPE_PRICE_ENTERPRISE',
  conglomerate: 'STRIPE_PRICE_CONGLOMERATE',
}

export function getPriceIdForPlan(plan: string): string | null {
  const envKey = PLAN_PRICE_ENV[plan]
  if (!envKey) return null
  return process.env[envKey] ?? null
}

export function getAppUrl(): string {
  return process.env.APP_URL ?? process.env.VITE_APP_URL ?? 'https://nexus-erp-six.vercel.app'
}

export async function getUserFromAuthHeader(authHeader: string | null | undefined) {
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!token) return null

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) return null

  const supabase = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  return user
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
