import type { SupabaseClient } from '@supabase/supabase-js'

export async function serviceDb(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(url, key)
}

export const NO_DB = {
  ok: false,
  error: 'SUPABASE_SERVICE_ROLE_KEY is not set in Vercel, so nothing can be read or saved.',
} as const

export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202') return true
  const m = error.message ?? ''
  return /relation .* does not exist/i.test(m) || /could not find the (table|function)/i.test(m)
}
