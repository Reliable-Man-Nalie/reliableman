export interface CountryCode {
  iso: string
  name: string
  dial: string
  flag: string
}

export const COUNTRY_CODES: CountryCode[] = [

  { iso: 'AW', name: 'Aruba', dial: '+297', flag: '🇦🇼' },
  { iso: 'CW', name: 'Curaçao', dial: '+599', flag: '🇨🇼' },
  { iso: 'BQ', name: 'Bonaire', dial: '+599', flag: '🇧🇶' },
  { iso: 'SX', name: 'Sint Maarten', dial: '+1721', flag: '🇸🇽' },
  { iso: 'DO', name: 'Dominican Republic', dial: '+1809', flag: '🇩🇴' },
  { iso: 'JM', name: 'Jamaica', dial: '+1876', flag: '🇯🇲' },
  { iso: 'TT', name: 'Trinidad & Tobago', dial: '+1868', flag: '🇹🇹' },
  { iso: 'BB', name: 'Barbados', dial: '+1246', flag: '🇧🇧' },
  { iso: 'BS', name: 'Bahamas', dial: '+1242', flag: '🇧🇸' },
  { iso: 'PR', name: 'Puerto Rico', dial: '+1787', flag: '🇵🇷' },

  { iso: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { iso: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
  { iso: 'MX', name: 'Mexico', dial: '+52', flag: '🇲🇽' },

  { iso: 'CO', name: 'Colombia', dial: '+57', flag: '🇨🇴' },
  { iso: 'VE', name: 'Venezuela', dial: '+58', flag: '🇻🇪' },
  { iso: 'BR', name: 'Brazil', dial: '+55', flag: '🇧🇷' },
  { iso: 'AR', name: 'Argentina', dial: '+54', flag: '🇦🇷' },
  { iso: 'CL', name: 'Chile', dial: '+56', flag: '🇨🇱' },
  { iso: 'PE', name: 'Peru', dial: '+51', flag: '🇵🇪' },
  { iso: 'EC', name: 'Ecuador', dial: '+593', flag: '🇪🇨' },
  { iso: 'PA', name: 'Panama', dial: '+507', flag: '🇵🇦' },
  { iso: 'CR', name: 'Costa Rica', dial: '+506', flag: '🇨🇷' },

  { iso: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { iso: 'NL', name: 'Netherlands', dial: '+31', flag: '🇳🇱' },
  { iso: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪' },
  { iso: 'FR', name: 'France', dial: '+33', flag: '🇫🇷' },
  { iso: 'ES', name: 'Spain', dial: '+34', flag: '🇪🇸' },
  { iso: 'IT', name: 'Italy', dial: '+39', flag: '🇮🇹' },
  { iso: 'PT', name: 'Portugal', dial: '+351', flag: '🇵🇹' },
  { iso: 'BE', name: 'Belgium', dial: '+32', flag: '🇧🇪' },
  { iso: 'CH', name: 'Switzerland', dial: '+41', flag: '🇨🇭' },
  { iso: 'SE', name: 'Sweden', dial: '+46', flag: '🇸🇪' },
  { iso: 'IE', name: 'Ireland', dial: '+353', flag: '🇮🇪' },

  { iso: 'AE', name: 'United Arab Emirates', dial: '+971', flag: '🇦🇪' },
  { iso: 'SA', name: 'Saudi Arabia', dial: '+966', flag: '🇸🇦' },
  { iso: 'ZA', name: 'South Africa', dial: '+27', flag: '🇿🇦' },
  { iso: 'NG', name: 'Nigeria', dial: '+234', flag: '🇳🇬' },
  { iso: 'KE', name: 'Kenya', dial: '+254', flag: '🇰🇪' },
  { iso: 'EG', name: 'Egypt', dial: '+20', flag: '🇪🇬' },

  { iso: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { iso: 'CN', name: 'China', dial: '+86', flag: '🇨🇳' },
  { iso: 'JP', name: 'Japan', dial: '+81', flag: '🇯🇵' },
  { iso: 'SG', name: 'Singapore', dial: '+65', flag: '🇸🇬' },

  { iso: 'ID', name: 'Indonesia', dial: '+62', flag: '🇮🇩' },
  { iso: 'TH', name: 'Thailand', dial: '+66', flag: '🇹🇭' },
  { iso: 'MY', name: 'Malaysia', dial: '+60', flag: '🇲🇾' },
  { iso: 'PH', name: 'Philippines', dial: '+63', flag: '🇵🇭' },
  { iso: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺' },
  { iso: 'NZ', name: 'New Zealand', dial: '+64', flag: '🇳🇿' },
]

export const DEFAULT_COUNTRY_ISO = 'AW'

const BY_DIAL_LENGTH = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length)

export function guessCountry(phone?: string): CountryCode | null {
  if (!phone) return null
  const digits = phone.replace(/[^\d+]/g, '')
  const normalized = digits.startsWith('+') ? digits : `+${digits}`
  return BY_DIAL_LENGTH.find(c => normalized.startsWith(c.dial)) ?? null
}

const TZ_TO_ISO: Record<string, string> = {
  'UTC': 'AW',
  'America/Curacao': 'CW',
  'America/Kralendijk': 'BQ',
  'America/Lower_Princes': 'SX',
  'America/Santo_Domingo': 'DO',
  'America/Jamaica': 'JM',
  'America/Port_of_Spain': 'TT',
  'America/Barbados': 'BB',
  'America/Nassau': 'BS',
  'America/Puerto_Rico': 'PR',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'America/Mexico_City': 'MX', 'America/Tijuana': 'MX', 'America/Monterrey': 'MX',
  'America/Bogota': 'CO', 'America/Caracas': 'VE',
  'America/Sao_Paulo': 'BR', 'America/Bahia': 'BR', 'America/Fortaleza': 'BR', 'America/Manaus': 'BR', 'America/Recife': 'BR',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Santiago': 'CL', 'America/Lima': 'PE',
  'America/Guayaquil': 'EC', 'America/Panama': 'PA', 'America/Costa_Rica': 'CR',
  'Europe/London': 'GB', 'Europe/Amsterdam': 'NL', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR',
  'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Lisbon': 'PT', 'Europe/Brussels': 'BE',
  'Europe/Zurich': 'CH', 'Europe/Stockholm': 'SE', 'Europe/Dublin': 'IE',
  'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Africa/Johannesburg': 'ZA',
  'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Africa/Cairo': 'EG',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Shanghai': 'CN', 'Asia/Tokyo': 'JP',
  'Asia/Singapore': 'SG', 'Asia/Manila': 'PH',
  'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID', 'Asia/Jayapura': 'ID', 'Asia/Pontianak': 'ID',
  'Asia/Bangkok': 'TH', 'Asia/Kuala_Lumpur': 'MY',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU',
  'Pacific/Auckland': 'NZ',
}

export function countryFromIso(iso?: string | null): CountryCode | null {
  if (!iso) return null
  const want = iso.toUpperCase()
  return COUNTRY_CODES.find(c => c.iso === want) ?? null
}

export function countryFromTimeZone(): CountryCode | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return countryFromIso(TZ_TO_ISO[tz])
  } catch {
    return null
  }
}
