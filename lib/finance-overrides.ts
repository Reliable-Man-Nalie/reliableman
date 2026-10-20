import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingTable } from '@/lib/os-supabase'
import { NO_OVERRIDES, type IncomeOverrides } from '@/lib/finance-income'

export const SETTINGS_TABLE = 'finance_settings'
export const OVERRIDES_ID = 'income-overrides'

export async function readOverrides(db: SupabaseClient | null): Promise<{ o: IncomeOverrides; ready: boolean }> {
  if (!db) return { o: NO_OVERRIDES, ready: false }
  const { data, error } = await db.from(SETTINGS_TABLE).select('data').eq('id', OVERRIDES_ID).maybeSingle()

  if (error) { if (!isMissingTable(error)) console.error('[finance] overrides read failed', error.message); return { o: NO_OVERRIDES, ready: false } }
  const d = (data?.data || {}) as Partial<IncomeOverrides>
  return {
    o: {
      excluded: Array.isArray(d.excluded) ? d.excluded.map(String) : [],
      countBoth: Array.isArray(d.countBoth) ? d.countBoth.map(String) : [],
    },
    ready: true,
  }
}
