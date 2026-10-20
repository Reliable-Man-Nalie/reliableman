// ─────────────────────────────────────────────────────────────────────────────
// RELIABLE MAN · SETTINGS. Where applications go, and who fits which programme.
// The words on the page are in content.ts (English and German).
//
// Where does an application go? Two ways, use one or both:
//
//   NALIE_WHATSAPP  His number in international format, digits only
//                  (e.g. '4915112345678'). After the form, the man sees his
//                  result and ONE button that opens WhatsApp with all his
//                  answers already typed, addressed to Nalie.
//
//   SUBMIT_URL     Any webhook that accepts a JSON POST: his CRM, GoHighLevel,
//                  Make, Zapier, n8n, Formspree. Every application is sent
//                  there automatically the moment it is submitted.
//
// ⚠️ With BOTH empty, applications are shown on screen and delivered nowhere.
// Fill at least one before any ad traffic hits the page.
// ─────────────────────────────────────────────────────────────────────────────

export const NALIE_WHATSAPP: string = ''
export const SUBMIT_URL: string = ''


// ─── The two ways into ONE programme ────────────────────────────────────────
// Same system, same rhythm (2 calls a month, tasks in between, progress checks,
// accountability dashboard). Private adds the one-to-one layer.
// The words for every option live in content.ts, in both languages.
export type Fit = 'private' | 'group' | 'later'

/**
 * THE ONLY PLACE THE FIT IS DECIDED. Private needs the money, the timing AND
 * the commitment. Anyone ready to invest who misses one gets the Brotherhood.
 * Nobody hears "no": a man who cannot invest yet gets an honest "later".
 */
export function qualify(a: { invest: string; start: string; commit: string }): Fit {
  if (a.invest === 'private' && a.start !== 'exploring' && a.commit === 'yes') return 'private'
  if (a.invest === 'private' || a.invest === 'group') return 'group'
  return 'later'
}
