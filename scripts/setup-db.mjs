// Sets up the database by itself. Runs before every build (so on every Vercel
// deploy) and can be run by hand with `npm run setup-db`.
//
// Needs DATABASE_URL: Supabase -> Project Settings -> Database -> Connection
// string (URI). Without it this step is skipped and the build carries on.
// Every statement is "if not exists", so running it again changes nothing.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const url = process.env.DATABASE_URL
if (!url) {
  console.log('[setup-db] DATABASE_URL is not set, skipping database setup.')
  process.exit(0)
}

const here = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8')

const { default: pg } = await import('pg')
const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } })
try {
  await client.connect()
  await client.query(sql)
  console.log('[setup-db] Database is ready.')
} catch (e) {
  console.error('[setup-db] Could not set up the database:', e.message)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
