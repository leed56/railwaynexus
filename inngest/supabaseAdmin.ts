import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  (() => { throw new Error('SUPABASE_URL not set') })()

const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ??
  (() => { throw new Error('SUPABASE_SERVICE_KEY not set') })()

export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
